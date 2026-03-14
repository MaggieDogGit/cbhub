// Absorbed from server/jobRunner.ts: processNextJob, startJobRunner, job dispatch branching
// Tech debt: storage.ts coupling — this service directly calls storage for all DB ops.
//            The market-scan post-processing logic (lines building scanSummaryJson) is complex
//            and could be extracted into a dedicated summarisation helper.

import { storage } from "../storage";
import { buildSystemPrompt, buildJobPrompt, buildLightJobPrompt, buildMarketScanPrompt, buildDryRunSuffix, buildIntelContext, buildGroupSnapshot, runAgentLoop, getLightTools, getDryRunTools } from "../agent";
import { COUNTRY_RTGS, COUNTRY_CURRENCY } from "./cbDiscoveryService";
import type { IntelObservation, AgentJob } from "@shared/schema";

export { COUNTRY_CURRENCY, COUNTRY_RTGS };

let isProcessing = false;

const JOB_COOLDOWN_MS = 90_000;

type CurrencyScope = "home_only" | "major" | "all";

async function processNextJob() {
  if (isProcessing) return;

  const jobs = await storage.listJobs();
  const pending = jobs.find(j => j.status === "pending");
  if (!pending) return;

  isProcessing = true;
  const jobType = pending.job_type || "cb_setup";
  const isMarketScan = jobType === "market_scan";
  const isDryRun = pending.dry_run === true;
  const scope: CurrencyScope = (pending.currency_scope as CurrencyScope) || "home_only";
  const isLight = pending.job_mode === "light";
  const jobLabel = isMarketScan
    ? `Market Scan${isDryRun ? " (DRY RUN)" : ""}: ${pending.market_country}/${pending.market_currency}`
    : pending.banking_group_name || "unknown";
  console.log(`[JobRunner] Starting job ${pending.id} — ${jobLabel} (type: ${jobType}, scope: ${scope}, mode: ${isLight ? "light" : "normal"})`);

  try {
    const convName = isMarketScan
      ? `Market Scan: ${pending.market_country} / ${pending.market_currency}`
      : `CB Setup${isLight ? " [Light]" : ""}: ${pending.banking_group_name}`;
    const conv = await storage.createConversation({ name: convName });
    await storage.updateJob(pending.id, {
      status: "running",
      conversation_id: conv.id,
      started_at: new Date(),
    });

    const sources = await storage.listDataSources();
    let message: string;

    let preExistingGroupIds: Set<string> = new Set();
    let preExistingEntityIds: Set<string> = new Set();
    let preExistingBicIds: Set<string> = new Set();
    let entityGroupMap: Map<string, string> = new Map();
    if (isMarketScan && !isDryRun) {
      const [allGroups, allEntities, allBics] = await Promise.all([
        storage.listBankingGroups(),
        storage.listLegalEntities(),
        storage.listBics(),
      ]);
      preExistingGroupIds = new Set(allGroups.map(g => g.id));
      preExistingEntityIds = new Set(allEntities.map(e => e.id));
      preExistingBicIds = new Set(allBics.map(b => b.id));
      for (const e of allEntities) entityGroupMap.set(e.id, e.group_id);
    }

    if (isMarketScan) {
      const mCountry = pending.market_country as string;
      const mCurrency = pending.market_currency as string;
      const rtgs = mCurrency === "EUR" ? "TARGET2" : (COUNTRY_RTGS[mCountry] || null);
      message = buildMarketScanPrompt(mCountry, mCurrency, rtgs);
      if (isDryRun) message += buildDryRunSuffix(mCountry, mCurrency);
    } else {
      const group = await storage.getBankingGroup(pending.banking_group_id!);
      if (!group) throw new Error(`Banking group ${pending.banking_group_id} not found`);

      const [entities, bics, services, groupIntelObs, allJobsList] = await Promise.all([
        storage.listLegalEntities(),
        storage.listBics(),
        storage.listCorrespondentServices(),
        isLight ? Promise.resolve([] as IntelObservation[]) : storage.listIntelObservations({ banking_group_id: group.id }),
        isLight ? Promise.resolve([] as AgentJob[]) : storage.listJobs(),
      ]);

      const groupEntities = entities.filter(e => e.group_id === group.id);
      const groupBics = groupEntities.flatMap(e => bics.filter(b => b.legal_entity_id === e.id));
      const groupServices = groupBics.flatMap(b => services.filter(s => s.bic_id === b.id));
      const snapshot = buildGroupSnapshot(groupEntities, groupBics, groupServices);

      let intelContext = "";
      if (!isLight) {
        const relevantScans = allJobsList.filter(j =>
          j.job_type === "market_scan" &&
          j.status === "completed" &&
          j.scan_summary &&
          (j.market_currency === group.primary_currency || j.market_country === group.headquarters_country)
        );
        intelContext = buildIntelContext(groupIntelObs, relevantScans);
        if (intelContext) {
          console.log(`[JobRunner] ${jobLabel} — intel context: ${groupIntelObs.length} observations, ${relevantScans.length} relevant scans`);
        }
      }

      const basePrompt = isLight
        ? buildLightJobPrompt(
            group.group_name, group.id, group.headquarters_country,
            group.primary_currency, group.rtgs_system, group.rtgs_member, snapshot,
          )
        : buildJobPrompt(
            group.group_name, group.id, group.primary_currency,
            group.cb_probability, group.rtgs_system, group.rtgs_member, snapshot, scope,
          );

      message = intelContext ? intelContext + basePrompt : basePrompt;
    }

    await storage.createMessage({ conversation_id: conv.id, role: "user", content: message });

    const mode = isMarketScan ? "job" : (isLight ? "light" : "job");
    const systemPrompt = buildSystemPrompt(sources, undefined, mode);
    const openaiMessages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    const maxIter = isMarketScan ? 50 : (isLight ? 3 : 15);
    const model = isLight ? "gpt-4o-mini" : "gpt-4o";
    const tools = isDryRun ? getDryRunTools() : (isLight ? getLightTools() : undefined);

    let stepCount = 0;
    const assistantContent = await runAgentLoop(
      openaiMessages,
      async (_toolName, _args, statusText) => {
        stepCount++;
        console.log(`[JobRunner] ${jobLabel} — step ${stepCount}: ${statusText}`);
        await storage.updateJob(pending.id, { steps_completed: stepCount });
      },
      maxIter,
      "auto",
      model,
      tools,
    );

    await storage.createMessage({ conversation_id: conv.id, role: "assistant", content: assistantContent });

    let scanSummaryJson: string | undefined;
    if (isMarketScan && isDryRun) {
      scanSummaryJson = JSON.stringify({
        summaryText: assistantContent,
        dryRun: true,
        newGroupIds: [],
        newGroupNames: [],
        createdCount: 0,
        updatedCount: 0,
      });
    } else if (isMarketScan) {
      const [allGroupsAfter, allEntitiesAfter, allBicsAfter] = await Promise.all([
        storage.listBankingGroups(),
        storage.listLegalEntities(),
        storage.listBics(),
      ]);
      const groupLookup = new Map(allGroupsAfter.map(g => [g.id, g]));
      const postEntityGroupMap = new Map(allEntitiesAfter.map(e => [e.id, e.group_id]));
      const newGroups = allGroupsAfter.filter(g => !preExistingGroupIds.has(g.id));
      const newGroupIds = new Set(newGroups.map(g => g.id));
      const touchedExistingGroupIds = new Set<string>();
      for (const e of allEntitiesAfter) {
        if (!preExistingEntityIds.has(e.id) && preExistingGroupIds.has(e.group_id)) {
          touchedExistingGroupIds.add(e.group_id);
        }
      }
      for (const b of allBicsAfter) {
        if (!preExistingBicIds.has(b.id)) {
          const groupId = entityGroupMap.get(b.legal_entity_id) || postEntityGroupMap.get(b.legal_entity_id);
          if (groupId && preExistingGroupIds.has(groupId)) {
            touchedExistingGroupIds.add(groupId);
          }
        }
      }
      const touchedExistingGroups = [...touchedExistingGroupIds]
        .filter(gid => !newGroupIds.has(gid))
        .map(gid => groupLookup.get(gid))
        .filter(Boolean) as typeof allGroupsAfter;
      const allTouchedGroups = [...newGroups, ...touchedExistingGroups];
      const summaryMatch = assistantContent.match(/Providers found[\s\S]*/i);
      const summaryText = summaryMatch ? summaryMatch[0].trim() : assistantContent.trim();
      scanSummaryJson = JSON.stringify({
        summaryText,
        newGroupIds: allTouchedGroups.map(g => g.id),
        newGroupNames: allTouchedGroups.map(g => g.group_name),
        createdCount: newGroups.length,
        updatedCount: touchedExistingGroups.length,
      });
    } else if (!isMarketScan && !isLight) {
      const validationMatch = assistantContent.match(/VALIDATION_JSON:\s*(\{[\s\S]*?\})\s*(?:\n|$)/);
      let validationValid: boolean | null = null;
      let issues: string[] = [];
      let missingEntities: string[] = [];
      let notes = "";
      if (validationMatch) {
        try {
          const vJson = JSON.parse(validationMatch[1]);
          validationValid = !!vJson.structure_valid;
          issues = Array.isArray(vJson.issues) ? vJson.issues : [];
          missingEntities = Array.isArray(vJson.missing_entities) ? vJson.missing_entities : [];
          notes = vJson.notes || "";
        } catch {}
      }
      const summaryLines = assistantContent.match(/Entities added[\s\S]*/i);
      const summaryText = summaryLines ? summaryLines[0].trim() : assistantContent.slice(-500).trim();
      if (validationValid !== null) {
        scanSummaryJson = JSON.stringify({
          summaryText,
          validationValid,
          issueCount: issues.length,
          issues,
          missingEntities,
          notes,
        });
      } else {
        scanSummaryJson = JSON.stringify({ summaryText });
      }
    }

    await storage.updateJob(pending.id, {
      status: "completed",
      completed_at: new Date(),
      steps_completed: stepCount,
      ...(scanSummaryJson ? { scan_summary: scanSummaryJson } : {}),
    });

    console.log(`[JobRunner] Completed job ${pending.id} — ${jobLabel} (${stepCount} steps). Cooling down ${JOB_COOLDOWN_MS / 1000}s before next job.`);
  } catch (err: any) {
    console.error(`[JobRunner] Job ${pending.id} failed:`, err.message);
    await storage.updateJob(pending.id, {
      status: "failed",
      error_message: err.message,
      completed_at: new Date(),
    }).catch(() => {});
    console.log(`[JobRunner] Cooling down ${JOB_COOLDOWN_MS / 1000}s after failure before next job.`);
  } finally {
    setTimeout(() => {
      isProcessing = false;
    }, JOB_COOLDOWN_MS);
  }
}

export async function startJobRunner() {
  console.log("[JobRunner] Starting background job runner");

  try {
    const jobs = await storage.listJobs();
    const stuckJobs = jobs.filter(j => j.status === "running");
    if (stuckJobs.length > 0) {
      console.log(`[JobRunner] Resetting ${stuckJobs.length} stuck "running" job(s) to "pending"`);
      for (const job of stuckJobs) {
        await storage.updateJob(job.id, {
          status: "pending",
          started_at: null,
          conversation_id: null,
        });
      }
    }
  } catch (err: any) {
    console.error("[JobRunner] Failed to reset stuck jobs:", err.message);
  }

  setTimeout(processNextJob, 10_000);
  setInterval(processNextJob, 30_000);
}

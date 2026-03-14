// Absorbed from server/jobRunner.ts: processNextJob, startJobRunner, job dispatch branching
// Tech debt: storage.ts coupling — this service directly calls storage for all DB ops.
//            The market-scan post-processing logic (lines building scanSummaryJson) is complex
//            and could be extracted into a dedicated summarisation helper.

import { storage } from "../storage";
import { buildSystemPrompt, buildJobPrompt, buildLightJobPrompt, buildIntelContext, buildGroupSnapshot, runAgentLoop, getLightTools, getDryRunTools } from "../agent";
import { COUNTRY_RTGS, COUNTRY_CURRENCY, runMarketScan } from "./cbDiscoveryService";
import type { IntelObservation, AgentJob, InsertAgentJob } from "@shared/schema";

export { COUNTRY_CURRENCY, COUNTRY_RTGS };

export async function listJobs() {
  return storage.listJobs();
}

export async function getJob(id: string) {
  return storage.getJob(id);
}

export async function createJob(data: InsertAgentJob) {
  return storage.createJob(data);
}

export async function updateJobStatus(id: string, data: Partial<AgentJob>) {
  return storage.updateJob(id, data);
}

export async function deleteJob(id: string) {
  return storage.deleteJob(id);
}

export async function getJobResults(id: string) {
  const job = await storage.getJob(id);
  if (!job) return undefined;
  return {
    id: job.id,
    status: job.status,
    scan_summary: job.scan_summary,
    steps_completed: job.steps_completed,
    error_message: job.error_message,
    completed_at: job.completed_at,
    conversation_id: job.conversation_id,
  };
}

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

    if (isMarketScan) {
      const { stepCount, scanSummaryJson } = await runMarketScan(pending, isDryRun, jobLabel, conv.id, sources);

      await storage.updateJob(pending.id, {
        status: "completed",
        completed_at: new Date(),
        steps_completed: stepCount,
        ...(scanSummaryJson ? { scan_summary: scanSummaryJson } : {}),
      });

      console.log(`[JobRunner] Completed job ${pending.id} — ${jobLabel} (${stepCount} steps). Cooling down ${JOB_COOLDOWN_MS / 1000}s before next job.`);
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

      const message = intelContext ? intelContext + basePrompt : basePrompt;

      await storage.createMessage({ conversation_id: conv.id, role: "user", content: message });

      const mode = isLight ? "light" : "job";
      const systemPrompt = buildSystemPrompt(sources, undefined, mode);
      const openaiMessages: any[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ];

      const maxIter = isLight ? 3 : 15;
      const model = isLight ? "gpt-4o-mini" : "gpt-4o";
      const tools = isLight ? getLightTools() : undefined;

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
      if (!isLight) {
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
    }
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

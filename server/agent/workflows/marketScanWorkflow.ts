// Market Scan Workflow — orchestrates AI-driven correspondent banking provider discovery
// for a given country/currency combination.
// Called by: cbDiscoveryService.runMarketScan()

import { storage } from "../../storage";
import { buildSystemPrompt, buildMarketScanPrompt, buildDryRunSuffix, runAgentLoop, getDryRunTools } from "../index";
import { COUNTRY_RTGS } from "../constants";
import type { AgentJob, DataSource } from "@shared/schema";
import type { WorkflowResult } from "../types";

export interface MarketScanInput {
  job: AgentJob;
  isDryRun: boolean;
  jobLabel: string;
  conversationId: string;
  sources: DataSource[];
}

export interface MarketScanOutput {
  stepCount: number;
  scanSummaryJson: string | undefined;
  summaryText: string;
  newGroupCount: number;
  updatedGroupCount: number;
}

function deriveConfidence(stepCount: number, createdCount: number): "high" | "medium" | "low" | "uncertain" {
  if (stepCount >= 10 && createdCount > 0) return "high";
  if (stepCount >= 5) return "medium";
  if (stepCount >= 2) return "low";
  return "uncertain";
}

export async function executeMarketScan(input: MarketScanInput): Promise<WorkflowResult<MarketScanOutput>> {
  const { job, isDryRun, jobLabel, conversationId, sources } = input;
  const mCountry = job.market_country as string;
  const mCurrency = job.market_currency as string;
  const rtgs = mCurrency === "EUR" ? "TARGET2" : (COUNTRY_RTGS[mCountry] || null);

  // Snapshot existing entities before scan so we can diff afterward
  let preExistingGroupIds: Set<string> = new Set();
  let preExistingEntityIds: Set<string> = new Set();
  let preExistingBicIds: Set<string> = new Set();
  let entityGroupMap: Map<string, string> = new Map();

  if (!isDryRun) {
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

  let message = buildMarketScanPrompt(mCountry, mCurrency, rtgs);
  if (isDryRun) message += buildDryRunSuffix(mCountry, mCurrency);

  await storage.createMessage({ conversation_id: conversationId, role: "user", content: message });

  const systemPrompt = buildSystemPrompt(sources, undefined, "job");
  const openaiMessages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  const tools = isDryRun ? getDryRunTools() : undefined;

  let stepCount = 0;
  const assistantContent = await runAgentLoop(
    openaiMessages,
    async (_toolName, _args, statusText) => {
      stepCount++;
      console.log(`[MarketScanWorkflow] ${jobLabel} — step ${stepCount}: ${statusText}`);
      await storage.updateJob(job.id, { steps_completed: stepCount });
    },
    50,
    "auto",
    "gpt-4o",
    tools,
  );

  await storage.createMessage({ conversation_id: conversationId, role: "assistant", content: assistantContent });

  const validationWarnings: string[] = [];
  let scanSummaryJson: string | undefined;
  let summaryText = "";
  let createdCount = 0;
  let updatedCount = 0;

  if (isDryRun) {
    summaryText = assistantContent;
    scanSummaryJson = JSON.stringify({
      summaryText,
      dryRun: true,
      newGroupIds: [],
      newGroupNames: [],
      createdCount: 0,
      updatedCount: 0,
    });
  } else {
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
        if (groupId && preExistingGroupIds.has(groupId)) touchedExistingGroupIds.add(groupId);
      }
    }

    const touchedExistingGroups = Array.from(touchedExistingGroupIds)
      .filter(gid => !newGroupIds.has(gid))
      .map(gid => groupLookup.get(gid))
      .filter(Boolean) as typeof allGroupsAfter;

    const allTouchedGroups = [...newGroups, ...touchedExistingGroups];
    const summaryMatch = assistantContent.match(/Providers found[\s\S]*/i);
    summaryText = summaryMatch ? summaryMatch[0].trim() : assistantContent.trim();

    createdCount = newGroups.length;
    updatedCount = touchedExistingGroups.length;

    if (stepCount < 3) validationWarnings.push("Low step count — scan may be incomplete");
    if (createdCount === 0 && updatedCount === 0) validationWarnings.push("No entities created or updated — verify country/currency parameters");

    scanSummaryJson = JSON.stringify({
      summaryText,
      newGroupIds: allTouchedGroups.map(g => g.id),
      newGroupNames: allTouchedGroups.map(g => g.group_name),
      createdCount,
      updatedCount,
    });
  }

  return {
    data: { stepCount, scanSummaryJson, summaryText, newGroupCount: createdCount, updatedGroupCount: updatedCount },
    confidence: deriveConfidence(stepCount, createdCount),
    evidenceCount: stepCount,
    evidenceSummary: `Agent completed ${stepCount} research steps${createdCount > 0 ? `, created ${createdCount} new groups` : ""}`,
    validationWarnings,
  };
}

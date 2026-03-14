// CB Entity Setup Workflow — orchestrates AI-driven correspondent banking entity setup
// for a single banking group. Covers entity creation, BIC assignment, and service mapping.
// Called by: jobService.processNextJob (CB setup branch)

import { storage } from "../../storage";
import {
  buildSystemPrompt, buildJobPrompt, buildLightJobPrompt,
  buildIntelContext, buildGroupSnapshot, runAgentLoop,
  getLightTools,
} from "../index";
import type { IntelObservation, AgentJob, DataSource } from "@shared/schema";
import type { WorkflowResult } from "../types";

type CurrencyScope = "home_only" | "major" | "all";

export interface CbEntitySetupInput {
  job: AgentJob;
  jobLabel: string;
  conversationId: string;
  sources: DataSource[];
  scope: CurrencyScope;
  isLight: boolean;
}

export interface CbEntitySetupOutput {
  stepCount: number;
  scanSummaryJson: string | undefined;
  summaryText: string;
  validationValid: boolean | null;
  issues: string[];
  missingEntities: string[];
}

function deriveConfidence(
  stepCount: number,
  validationValid: boolean | null,
  isLight: boolean,
): "high" | "medium" | "low" | "uncertain" {
  if (isLight) return stepCount >= 2 ? "medium" : "low";
  if (validationValid === true && stepCount >= 5) return "high";
  if (validationValid === true) return "medium";
  if (validationValid === false) return "low";
  if (stepCount >= 5) return "medium";
  return "uncertain";
}

export async function executeCbEntitySetup(input: CbEntitySetupInput): Promise<WorkflowResult<CbEntitySetupOutput>> {
  const { job, jobLabel, conversationId, sources, scope, isLight } = input;

  const group = await storage.getBankingGroup(job.banking_group_id!);
  if (!group) throw new Error(`Banking group ${job.banking_group_id} not found`);

  const [entities, bics, services, groupIntelObs, allJobsList] = await Promise.all([
    storage.listLegalEntities(),
    storage.listBics(),
    storage.listCorrespondentServices(),
    isLight ? Promise.resolve([] as IntelObservation[]) : storage.listIntelObservations({ banking_group_id: group.id }),
    isLight ? Promise.resolve([] as AgentJob[]) : storage.listJobs(),
  ]);

  const groupEntities = entities.filter(e => e.group_id === group.id);
  const groupBics = groupEntities.flatMap(e => bics.filter(b => b.legal_entity_id === e.id));
  const groupServices = groupBics.flatMap(b =>
    services.filter(s => s.bic_id === b.id).map(s => ({ ...s, currency: s.currency ?? "" })),
  );
  const snapshot = buildGroupSnapshot(groupEntities, groupBics, groupServices);

  let intelContext = "";
  if (!isLight) {
    const relevantScans = allJobsList.filter(j =>
      j.job_type === "market_scan" &&
      j.status === "completed" &&
      j.scan_summary &&
      (j.market_currency === group.primary_currency || j.market_country === group.headquarters_country),
    );
    intelContext = buildIntelContext(groupIntelObs, relevantScans);
    if (intelContext) {
      console.log(`[CbEntitySetupWorkflow] ${jobLabel} — intel context: ${groupIntelObs.length} observations, ${relevantScans.length} relevant scans`);
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

  await storage.createMessage({ conversation_id: conversationId, role: "user", content: message });

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
      console.log(`[CbEntitySetupWorkflow] ${jobLabel} — step ${stepCount}: ${statusText}`);
      await storage.updateJob(job.id, { steps_completed: stepCount });
    },
    maxIter,
    "auto",
    model,
    tools,
  );

  await storage.createMessage({ conversation_id: conversationId, role: "assistant", content: assistantContent });

  const validationWarnings: string[] = [];
  let scanSummaryJson: string | undefined;
  let summaryText = "";
  let validationValid: boolean | null = null;
  let issues: string[] = [];
  let missingEntities: string[] = [];
  let notes = "";

  if (!isLight) {
    const validationMatch = assistantContent.match(/VALIDATION_JSON:\s*(\{[\s\S]*?\})\s*(?:\n|$)/);
    if (validationMatch) {
      try {
        const vJson = JSON.parse(validationMatch[1]);
        validationValid = !!vJson.structure_valid;
        issues = Array.isArray(vJson.issues) ? vJson.issues : [];
        missingEntities = Array.isArray(vJson.missing_entities) ? vJson.missing_entities : [];
        notes = vJson.notes || "";
      } catch {
        validationWarnings.push("Failed to parse VALIDATION_JSON from assistant response");
      }
    }

    if (issues.length > 0) validationWarnings.push(...issues.map(i => `Validation: ${i}`));
    if (missingEntities.length > 0) validationWarnings.push(`Missing entities: ${missingEntities.join(", ")}`);

    const summaryLines = assistantContent.match(/Entities added[\s\S]*/i);
    summaryText = summaryLines ? summaryLines[0].trim() : assistantContent.slice(-500).trim();

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

  return {
    data: { stepCount, scanSummaryJson, summaryText, validationValid, issues, missingEntities },
    confidence: deriveConfidence(stepCount, validationValid, isLight),
    evidenceCount: stepCount,
    evidenceSummary: `Agent completed ${stepCount} steps for ${group.group_name}`,
    validationWarnings,
  };
}

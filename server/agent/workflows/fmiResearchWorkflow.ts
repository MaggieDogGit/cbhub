// FMI Research Workflow — typed orchestration wrapper over agentFmiResearch.ts.
// Provides structured input/output with confidence scoring for FMI member discovery.
// Called by: researchService / fmiResearchJobRunner

import {
  runFmiMemberDiscovery,
  processFmiMember,
  loadDbContext,
  type MemberProcessResult,
  type DbContext,
} from "../../agentFmiResearch";
import type { WorkflowResult } from "../types";

export interface FmiResearchInput {
  fmiName: string;
  fmiType: string;
  sourceUrl: string;
  fmiDetails?: {
    membership_url?: string;
    website?: string;
  };
}

export interface FmiResearchOutput {
  discoveredMembers: string[];
  processedCount: number;
  addedCount: number;
  skippedCount: number;
  errorCount: number;
  results: MemberProcessResult[];
}

export async function executeFmiResearch(
  input: FmiResearchInput,
  onProgress?: (msg: string) => void,
): Promise<WorkflowResult<FmiResearchOutput>> {
  const { fmiName, fmiType, sourceUrl, fmiDetails } = input;

  onProgress?.(`[FmiResearchWorkflow] Discovering members for ${fmiName}...`);

  const discoveredMembers = await runFmiMemberDiscovery(fmiName, fmiDetails ?? {});

  onProgress?.(`[FmiResearchWorkflow] Discovered ${discoveredMembers.length} members. Loading DB context...`);

  const ctx: DbContext = await loadDbContext();
  const results: MemberProcessResult[] = [];

  for (const memberName of discoveredMembers) {
    onProgress?.(`[FmiResearchWorkflow] Processing: ${memberName}`);
    try {
      const result = await processFmiMember(memberName, fmiName, fmiType, sourceUrl, ctx);
      results.push(result);
    } catch (err: any) {
      results.push({ action: "error", reason: err.message });
    }
  }

  const addedCount = results.filter(r => r.action === "added").length;
  const skippedCount = results.filter(r => r.action === "skipped").length;
  const errorCount = results.filter(r => r.action === "error").length;
  const processedCount = results.length;

  const validationWarnings: string[] = [];
  if (errorCount > processedCount * 0.3) {
    validationWarnings.push(`High error rate: ${errorCount}/${processedCount} members failed`);
  }
  if (discoveredMembers.length === 0) {
    validationWarnings.push("No members discovered — check FMI URL and website configuration");
  }

  const successRate = processedCount > 0 ? addedCount / processedCount : 0;
  const confidence =
    discoveredMembers.length >= 10 && successRate >= 0.7 ? "high" :
    discoveredMembers.length >= 5 && successRate >= 0.5 ? "medium" :
    discoveredMembers.length > 0 ? "low" :
    "uncertain";

  return {
    data: { discoveredMembers, processedCount, addedCount, skippedCount, errorCount, results },
    confidence,
    evidenceCount: discoveredMembers.length,
    evidenceSummary: `Discovered ${discoveredMembers.length} members; added ${addedCount}, skipped ${skippedCount}, errors ${errorCount}`,
    validationWarnings,
  };
}

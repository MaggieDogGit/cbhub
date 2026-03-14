// CB Discovery Service — orchestrates correspondent banking market scan workflows.
// Constants are the source of truth in agent/constants.ts and re-exported here for backward compat.

import { storage } from "../storage";
import type { AgentJob, DataSource } from "@shared/schema";
import { executeMarketScan } from "../agent/workflows/marketScanWorkflow";

// ── Re-export CB lookup constants (single source: agent/constants.ts) ─────────
export { COUNTRY_RTGS, CURRENCY_COUNTRY, COUNTRY_CURRENCY, EUROZONE_COUNTRIES, CLS_CURRENCIES } from "../agent/constants";

// ── Public API ────────────────────────────────────────────────────────────────

export async function runMarketScan(
  job: AgentJob,
  isDryRun: boolean,
  jobLabel: string,
  conversationId: string,
  sources: DataSource[],
): Promise<{ stepCount: number; scanSummaryJson: string | undefined }> {
  const result = await executeMarketScan({ job, isDryRun, jobLabel, conversationId, sources });
  return {
    stepCount: result.data.stepCount,
    scanSummaryJson: result.data.scanSummaryJson,
  };
}

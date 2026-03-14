// Job Service — owns job lifecycle, status transitions, and background job runner.
// Long-running AI workflows are delegated to agent/workflows/.

import { storage } from "../storage";
import { runMarketScan } from "./cbDiscoveryService";
import { executeCbEntitySetup } from "../agent/workflows/cbEntitySetupWorkflow";
import type { AgentJob, InsertAgentJob } from "@shared/schema";

export { COUNTRY_CURRENCY, COUNTRY_RTGS } from "../agent/constants";

// ── CRUD ─────────────────────────────────────────────────────────────────────

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

// ── Background runner ─────────────────────────────────────────────────────────

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
    await storage.updateJob(pending.id, { status: "running", conversation_id: conv.id, started_at: new Date() });

    const sources = await storage.listDataSources();

    if (isMarketScan) {
      const { stepCount, scanSummaryJson } = await runMarketScan(pending, isDryRun, jobLabel, conv.id, sources);
      await storage.updateJob(pending.id, {
        status: "completed",
        completed_at: new Date(),
        steps_completed: stepCount,
        ...(scanSummaryJson ? { scan_summary: scanSummaryJson } : {}),
      });
      console.log(`[JobRunner] Completed job ${pending.id} — ${jobLabel} (${stepCount} steps). Cooling down ${JOB_COOLDOWN_MS / 1000}s.`);
    } else {
      // Delegate full CB entity setup logic to the workflow
      const result = await executeCbEntitySetup({
        job: pending,
        jobLabel,
        conversationId: conv.id,
        sources,
        scope,
        isLight,
      });

      await storage.updateJob(pending.id, {
        status: "completed",
        completed_at: new Date(),
        steps_completed: result.data.stepCount,
        ...(result.data.scanSummaryJson ? { scan_summary: result.data.scanSummaryJson } : {}),
      });

      console.log(`[JobRunner] Completed job ${pending.id} — ${jobLabel} (${result.data.stepCount} steps, confidence: ${result.confidence}). Cooling down ${JOB_COOLDOWN_MS / 1000}s.`);
    }
  } catch (err: any) {
    console.error(`[JobRunner] Job ${pending.id} failed:`, err.message);
    await storage.updateJob(pending.id, {
      status: "failed",
      error_message: err.message,
      completed_at: new Date(),
    }).catch(() => {});
    console.log(`[JobRunner] Cooling down ${JOB_COOLDOWN_MS / 1000}s after failure.`);
  } finally {
    setTimeout(() => { isProcessing = false; }, JOB_COOLDOWN_MS);
  }
}

export async function startJobRunner() {
  console.log("[JobRunner] Starting background job runner");

  // Reset any jobs stuck in "running" state from a previous server restart
  try {
    const jobs = await storage.listJobs();
    const stuckJobs = jobs.filter(j => j.status === "running");
    if (stuckJobs.length > 0) {
      console.log(`[JobRunner] Resetting ${stuckJobs.length} stuck "running" job(s) to "pending"`);
      for (const job of stuckJobs) {
        await storage.updateJob(job.id, { status: "pending", started_at: null, conversation_id: null });
      }
    }
  } catch (err: any) {
    console.error("[JobRunner] Failed to reset stuck jobs:", err.message);
  }

  setTimeout(processNextJob, 10_000);
  setInterval(processNextJob, 30_000);
}

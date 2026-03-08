import { storage } from "./storage";
import { buildSystemPrompt, runAgentLoop } from "./agentCore";

let isProcessing = false;

// Minimum seconds to wait between job completions before starting the next one.
// This lets the OpenAI TPM window partially refill between jobs.
const JOB_COOLDOWN_MS = 90_000; // 90 seconds

type CurrencyScope = "home_only" | "major" | "all";

const CLS_CURRENCIES = new Set(["AUD","CAD","CHF","DKK","EUR","GBP","HKD","JPY","MXN","NOK","NZD","SEK","SGD","USD","ILS","ZAR","KRW","HUF"]);

function buildCurrencyInstruction(scope: CurrencyScope, primaryCurrency: string | null | undefined): string {
  switch (scope) {
    case "home_only":
      return `For each BIC, ensure a Correspondent Banking service exists in the home currency${primaryCurrency ? ` (${primaryCurrency})` : ""} only. Do not create services for other currencies — strictly limit to the home currency.`;
    case "major":
      return `For each BIC, focus only on EUR, GBP, and USD correspondent banking services. Only create services for these three currencies; skip the home currency if it is not one of these three.`;
    case "all":
      return `For each BIC, identify and add all currencies that entity is known to offer Correspondent Banking services in. Include the home currency${primaryCurrency ? ` (${primaryCurrency})` : ""} plus any additional currencies confirmed through research.`;
  }
}

function buildJobPrompt(
  groupName: string,
  groupId: string,
  entityCount: number,
  bicCount: number,
  serviceCount: number,
  primaryCurrency: string | null | undefined,
  cbProbability: string | null | undefined,
  rtgsSystem: string | null | undefined,
  scope: CurrencyScope,
): string {
  const currencyInstruction = buildCurrencyInstruction(scope, primaryCurrency);
  const scopeLabel = scope === "home_only" ? "home currency only" : scope === "major" ? "EUR/GBP/USD" : "all currencies";
  const rtgsLabel = rtgsSystem || (primaryCurrency ? `identify RTGS for ${primaryCurrency}` : "not identified");
  const clsLine = primaryCurrency && CLS_CURRENCIES.has(primaryCurrency)
    ? `CLS (fmi_type "FX Settlement Systems") — ${primaryCurrency} is a CLS-eligible currency; check direct settlement membership`
    : `CLS — verify whether ${primaryCurrency || "the home currency"} participates in CLS`;

  return `Run the CB Entity Setup workflow for ${groupName} [Scope: ${scopeLabel}]
Group ID: ${groupId} | Home currency: ${primaryCurrency || "not set"} | RTGS: ${rtgsLabel} | CB probability: ${cbProbability || "not set"}
Current DB state: ${entityCount} legal entit${entityCount !== 1 ? "ies" : "y"}, ${bicCount} BIC${bicCount !== 1 ? "s" : ""}, ${serviceCount} service${serviceCount !== 1 ? "s" : ""} recorded.

---
STEP 1 — VERIFY BANKING GROUP RECORD
Locate this group using list_banking_groups (ID: ${groupId}).
If any of the following fields are missing, research and fill them now using update_banking_group before proceeding:
• primary_currency  • rtgs_system  • rtgs_member (boolean)  • cb_probability (High/Medium/Low/Unconfirmed)  • cb_evidence (one-sentence summary)

---
STEP 2 — IDENTIFY CORRESPONDENT BANKING LEGAL ENTITIES
Search: "${groupName} correspondent banking SWIFT BIC legal entity".
Target ONLY: (a) the primary HQ licensed banking entity, (b) dedicated CB-hub subsidiaries that directly operate CB business for external financial institutions.
Do NOT add every subsidiary — be selective; prefer fewer high-confidence entities over many speculative ones.
For each candidate: call find_legal_entity_by_name to check if it already exists.
• Exists → note its ID; update any missing fields (country, entity_type, notes) using update_legal_entity.
• Does not exist → create with create_legal_entity linked to group_id ${groupId}.

---
STEP 3 — BIC CODES
For every entity identified in Step 2: call list_bics to check if a BIC is already linked to it.
• BIC exists → use its ID; update any missing fields using update_bic.
• Missing → add with create_bic. Set is_headquarters=true and swift_member=true for the primary HQ entity's BIC.

---
STEP 4 — CORRESPONDENT SERVICES
${currencyInstruction}
Before creating any service: call list_correspondent_services and confirm no existing record exists for that BIC + currency combination.
• Exists → update with any missing details using update_correspondent_service; do NOT create a duplicate.
• Missing → create with create_correspondent_service. bic_id must be a real UUID obtained from list_bics.
For clearing_model, apply the ONSHORE vs OFFSHORE rule from the system prompt: Onshore only if the BIC entity's country is the home country/region of that currency's settlement infrastructure. All other currencies are Offshore — even if the bank is internationally active and well-known for that currency.

---
STEP 5 — FMI MEMBERSHIPS
For the primary HQ entity, proactively check and record the following (call check_fmi_membership before each create_fmi):
• SWIFT (fmi_type "Messaging Networks") — virtually all major international banks are SWIFT members; confirm and record
• ${rtgsLabel} (fmi_type "Payment Systems") — check whether this entity is a direct participant; search "${groupName} ${rtgsLabel} direct participant" to confirm
• ${clsLine}
• Any additional FMIs discovered during research (Euroclear, Clearstream, Fedwire, CHAPS, CHIPS, LCH, etc.)

---
Work all 5 steps fully. End with a summary: entities added/updated | BICs added | services created | FMI memberships recorded | any issues.`;
}

async function processNextJob() {
  if (isProcessing) return;

  const jobs = await storage.listJobs();
  const pending = jobs.find(j => j.status === "pending");
  if (!pending) return;

  isProcessing = true;
  const scope: CurrencyScope = (pending.currency_scope as CurrencyScope) || "home_only";
  console.log(`[JobRunner] Starting job ${pending.id} for ${pending.banking_group_name} (scope: ${scope})`);

  try {
    const conv = await storage.createConversation({ name: `CB Setup: ${pending.banking_group_name}` });
    await storage.updateJob(pending.id, {
      status: "running",
      conversation_id: conv.id,
      started_at: new Date(),
    } as any);

    const group = await storage.getBankingGroup(pending.banking_group_id);
    if (!group) throw new Error(`Banking group ${pending.banking_group_id} not found`);

    const [entities, bics, services, sources] = await Promise.all([
      storage.listLegalEntities(),
      storage.listBics(),
      storage.listCorrespondentServices(),
      storage.listDataSources(),
    ]);

    const groupEntities = entities.filter(e => e.group_id === group.id);
    const groupBics = groupEntities.flatMap(e => bics.filter(b => b.legal_entity_id === e.id));
    const groupServices = groupBics.flatMap(b => services.filter(s => s.bic_id === b.id));

    const message = buildJobPrompt(
      group.group_name,
      group.id,
      groupEntities.length,
      groupBics.length,
      groupServices.length,
      group.primary_currency,
      group.cb_probability,
      group.rtgs_system,
      scope,
    );

    await storage.createMessage({ conversation_id: conv.id, role: "user", content: message });

    const systemPrompt = buildSystemPrompt(sources);
    const openaiMessages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    let stepCount = 0;
    const assistantContent = await runAgentLoop(
      openaiMessages,
      async (_toolName, _args, statusText) => {
        stepCount++;
        console.log(`[JobRunner] ${pending.banking_group_name} — step ${stepCount}: ${statusText}`);
        await storage.updateJob(pending.id, { steps_completed: stepCount } as any);
      },
      15
    );

    await storage.createMessage({ conversation_id: conv.id, role: "assistant", content: assistantContent });
    await storage.updateJob(pending.id, {
      status: "completed",
      completed_at: new Date(),
      steps_completed: stepCount,
    } as any);

    console.log(`[JobRunner] Completed job ${pending.id} for ${pending.banking_group_name} (${stepCount} steps). Cooling down ${JOB_COOLDOWN_MS / 1000}s before next job.`);
  } catch (err: any) {
    console.error(`[JobRunner] Job ${pending.id} failed:`, err.message);
    await storage.updateJob(pending.id, {
      status: "failed",
      error_message: err.message,
      completed_at: new Date(),
    } as any).catch(() => {});
    console.log(`[JobRunner] Cooling down ${JOB_COOLDOWN_MS / 1000}s after failure before next job.`);
  } finally {
    // Cooldown before releasing the lock so the next poll can pick up the next job
    setTimeout(() => {
      isProcessing = false;
    }, JOB_COOLDOWN_MS);
  }
}

export async function startJobRunner() {
  console.log("[JobRunner] Starting background job runner");

  // On startup: reset any jobs stuck in "running" state (from a previous server crash/restart)
  // back to "pending" so they get retried cleanly
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
        } as any);
      }
    }
  } catch (err: any) {
    console.error("[JobRunner] Failed to reset stuck jobs:", err.message);
  }

  // Initial poll after 10s (let the server fully settle first)
  setTimeout(processNextJob, 10_000);
  // Then poll every 30 seconds (actual spacing between jobs is controlled by the cooldown in finally{})
  setInterval(processNextJob, 30_000);
}

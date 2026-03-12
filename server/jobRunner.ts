import { storage } from "./storage";
import { buildSystemPrompt, getLightTools, runAgentLoop } from "./agentCore";

let isProcessing = false;

// Minimum seconds to wait between job completions before starting the next one.
// This lets the OpenAI TPM window partially refill between jobs.
const JOB_COOLDOWN_MS = 90_000; // 90 seconds

type CurrencyScope = "home_only" | "major" | "all";

export const COUNTRY_RTGS: Record<string, string> = {
  "Austria": "TARGET2", "Belgium": "TARGET2", "Croatia": "TARGET2", "Cyprus": "TARGET2",
  "Estonia": "TARGET2", "Finland": "TARGET2", "France": "TARGET2", "Germany": "TARGET2",
  "Greece": "TARGET2", "Ireland": "TARGET2", "Italy": "TARGET2", "Latvia": "TARGET2",
  "Lithuania": "TARGET2", "Luxembourg": "TARGET2", "Malta": "TARGET2", "Netherlands": "TARGET2",
  "Portugal": "TARGET2", "Slovakia": "TARGET2", "Slovenia": "TARGET2", "Spain": "TARGET2",
  "Czech Republic": "CERTIS", "Hungary": "VIBER", "Poland": "SORBNET2", "Romania": "ReGIS",
  "Sweden": "RIX", "Denmark": "Kronos2", "Norway": "NICS", "Switzerland": "SIC",
  "United Kingdom": "CHAPS",
  "United States": "Fedwire", "Canada": "Lynx", "Brazil": "STR", "Mexico": "SPEI",
  "Australia": "RITS", "Japan": "BOJ-NET", "Singapore": "MEPS+", "Hong Kong": "CHATS",
  "China": "CNAPS", "India": "RTGS (RBI)", "South Korea": "BOK-Wire+",
  "South Africa": "SAMOS", "Israel": "ZAHAV", "Turkey": "EFT", "UAE": "UAEFTS",
  "New Zealand": "ESAS",
};

export const CURRENCY_COUNTRY: Record<string, string> = {
  "EUR": "Eurozone", "USD": "United States", "GBP": "United Kingdom", "JPY": "Japan",
  "CHF": "Switzerland", "CAD": "Canada", "AUD": "Australia", "SGD": "Singapore",
  "HKD": "Hong Kong", "CNH": "China", "SEK": "Sweden", "NOK": "Norway",
  "DKK": "Denmark", "NZD": "New Zealand", "PLN": "Poland", "CZK": "Czech Republic",
  "HUF": "Hungary", "RON": "Romania", "TRY": "Turkey", "ZAR": "South Africa",
  "BRL": "Brazil", "MXN": "Mexico", "INR": "India", "KRW": "South Korea", "ILS": "Israel",
};

const EUROZONE_COUNTRIES = new Set([
  "Austria", "Belgium", "Croatia", "Cyprus", "Estonia", "Finland", "France", "Germany",
  "Greece", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands",
  "Portugal", "Slovakia", "Slovenia", "Spain",
]);

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

type EntityRow = { id: string; legal_name: string; country: string | null; entity_type: string | null };
type BicRow    = { id: string; bic_code: string; legal_entity_id: string; is_headquarters: boolean | null };
type ServiceRow = { bic_id: string; currency: string; clearing_model: string | null };

function buildGroupSnapshot(entities: EntityRow[], bics: BicRow[], services: ServiceRow[]): string {
  if (entities.length === 0) return "No entities, BICs, or services recorded yet for this group.";
  return entities.map(e => {
    const entityBics = bics.filter(b => b.legal_entity_id === e.id);
    const bicLines = entityBics.length === 0
      ? "    (no BIC recorded)"
      : entityBics.map(b => {
          const svcList = services
            .filter(s => s.bic_id === b.id)
            .map(s => `${s.currency}/${s.clearing_model ?? "?"}`)
            .join(", ");
          return `    BIC: ${b.bic_code}${b.is_headquarters ? " (HQ)" : ""} | Services: ${svcList || "none"}`;
        }).join("\n");
    return `• ${e.legal_name} (${e.country ?? "?"}, ${e.entity_type ?? "?"}) — ID: ${e.id}\n${bicLines}`;
  }).join("\n");
}

function buildJobPrompt(
  groupName: string,
  groupId: string,
  primaryCurrency: string | null | undefined,
  cbProbability: string | null | undefined,
  rtgsSystem: string | null | undefined,
  rtgsMember: boolean | null | undefined,
  snapshot: string,
  scope: CurrencyScope,
): string {
  const currencyInstruction = buildCurrencyInstruction(scope, primaryCurrency);
  const scopeLabel = scope === "home_only" ? "home currency only" : scope === "major" ? "EUR/GBP/USD" : "all currencies";
  const rtgsLabel = rtgsSystem || (primaryCurrency ? `identify RTGS for ${primaryCurrency}` : "not identified");
  const hasEntities = !snapshot.startsWith("No entities");
  const rtgsMemberKnown = !!rtgsMember && !!rtgsSystem;

  // Entity targeting rule used in all Step 2 branches
  const entityTargetingRule = `Include: (a) the primary HQ licensed banking entity, (b) dedicated CB-hub or transaction-banking subsidiaries, and (c) regional or national banking subsidiaries that hold a local banking licence and are direct participants in a local RTGS or payment clearing system — even if they are primarily retail/commercial banks. Local RTGS/clearing participation is sufficient qualification.
For globally active or G-SIB banks, additionally check for documented CB operations in the following major clearing centres: Singapore (SGD/MEPS+), Hong Kong (HKD/CHATS), Japan (JPY/BOJ-NET), Australia (AUD/RITS). If the bank has a licensed branch or subsidiary with confirmed RTGS direct participation in any of these markets, include it.
Exclude: holding companies, insurance or asset-management arms, dormant entities, and any subsidiary that does not hold a direct banking licence or payment system membership.
Ownership check: verify each candidate is currently owned/operated by ${groupName} — do not add subsidiaries that have been divested or are under a different parent.`;

  const step2 = hasEntities && scope === "home_only"
    ? `STEP 2 — IDENTIFY CORRESPONDENT BANKING LEGAL ENTITIES
Scope is home currency only. Entities already in the database are shown in the snapshot — no additional entity search is needed.
Review each entity in the snapshot: use find_legal_entity_by_name to confirm the ID if needed, then update any missing fields (country, entity_type) with update_legal_entity.`
    : hasEntities
    ? `STEP 2 — IDENTIFY CORRESPONDENT BANKING LEGAL ENTITIES
Entities already in the database are shown in the snapshot. Because scope is "${scopeLabel}", also check whether this banking group has additional regional or national banking subsidiaries that are not yet recorded.
Run ONE search: "${groupName} banking subsidiaries correspondent banking clearing RTGS".
${entityTargetingRule}
For each candidate not already in the snapshot: use find_legal_entity_by_name to check, then create if missing (create_legal_entity, group_id ${groupId}).`
    : `STEP 2 — IDENTIFY CORRESPONDENT BANKING LEGAL ENTITIES
The snapshot shows no entities yet. Run ONE search: "${groupName} correspondent banking SWIFT BIC legal entity".
${entityTargetingRule}
For each candidate: use find_legal_entity_by_name to confirm before creating.
• Not found → create with create_legal_entity linked to group_id ${groupId}.`;

  const clsLine = primaryCurrency && CLS_CURRENCIES.has(primaryCurrency)
    ? `• CLS (fmi_type "FX Settlement Systems") — ${primaryCurrency} is CLS-eligible. Run ONE search to confirm the HQ entity's direct settlement membership, then record if confirmed.`
    : ``;

  return `Run the CB Entity Setup workflow for ${groupName} [Scope: ${scopeLabel}]
Group ID: ${groupId} | Home currency: ${primaryCurrency || "not set"} | RTGS: ${rtgsLabel} | RTGS member: ${rtgsMemberKnown ? "yes" : "unconfirmed"} | CB probability: ${cbProbability || "not set"}

CURRENT DATABASE STATE — do NOT call list_legal_entities, list_bics, or list_correspondent_services for this group; all existing data is shown below:
${snapshot}

---
STEP 1 — VERIFY BANKING GROUP RECORD
The current field values are in the header above. Only call update_banking_group (ID: ${groupId}) if a field shows "not set" or null — and only after researching the missing value. Fields already populated do not need updating.

---
${step2}

---
STEP 3 — BIC CODES
The existing BICs for each entity are shown in the snapshot. Only create BICs for entities that show "(no BIC recorded)".
• BIC exists in snapshot → call list_bics filtered to that entity to get the UUID, then proceed.
• Missing → add with create_bic. Set is_headquarters=true and swift_member=true for the primary HQ entity's BIC.

---
STEP 4 — CORRESPONDENT SERVICES
${currencyInstruction}
The existing services for each BIC are shown in the snapshot. Only create services not already listed there.
• Exists in snapshot → skip or update with update_correspondent_service if details are incomplete.
• Missing → create with create_correspondent_service. bic_id must be a real UUID obtained from list_bics.
Onshore vs Offshore — base this on the ENTITY'S country, not the group's home country:
• Onshore → entity's country is the home settlement country for that currency → service_type = "Correspondent Banking"
• Offshore → any other combination → service_type = "Global Currency Clearing"
TRAP 1 — PARENT CURRENCY: Do NOT mark Onshore just because the currency matches the banking group's primary_currency. A foreign subsidiary offering its parent's home currency is still Offshore (e.g. a US bank's German entity offering USD → Offshore).
TRAP 2 — EUROZONE SUBSIDIARIES: A subsidiary in any Eurozone country (AT, DE, FR, IT, ES, NL, BE, PT, IE, FI, SK, SI, EE, LV, LT, MT, CY, GR, LU, and HR since Jan 2023) offering EUR is Onshore → "Correspondent Banking" + TARGET2. Do not mark it Offshore because its parent is in a different Eurozone country.

---
STEP 5 — FMI MEMBERSHIPS
For EVERY entity identified in this workflow (not just the HQ), call check_fmi_membership before each create_fmi to avoid duplicates. Record:
A) SWIFT (fmi_type "Messaging Networks") — Record for each entity without searching; all licensed banking subsidiaries are SWIFT members.
B) Local RTGS (fmi_type "Payment Systems") — Use the entity's country to determine the system from this reference table (do NOT search for these):
   Eurozone countries (AT, DE, FR, IT, ES, NL, BE, PT, IE, FI, SK, SI, EE, LV, LT, MT, CY, GR, LU, HR since Jan 2023): TARGET2
   Czech Republic: CERTIS | Hungary: VIBER | Poland: SORBNET2 | Romania: ReGIS | Sweden: RIX | Denmark: Kronos2 | Norway: NICS | Switzerland: SIC
   United Kingdom: CHAPS | United States: Fedwire | Canada: Lynx | Australia: RITS | Japan: BOJ-NET | Singapore: MEPS+ | Hong Kong: CHATS
   China: CNAPS | India: RTGS (RBI) | South Africa: SAMOS | Brazil: STR | South Korea: BOK-Wire+ | Israel: ZAHAV | Turkey: EFT | UAE: UAEFTS
   If the entity's country is not in this list: run ONE search "[entity name] RTGS direct participant" to identify the system before recording.
   TRAP — COUNTRY MATCHING: Each payment system must only be assigned to an entity whose country matches the system's home jurisdiction. Never assign a foreign system to the HQ by default. Examples: CHAPS → UK entities only; Fedwire → US entities only; TARGET2 → Eurozone entities only; MEPS+ → Singapore entities only; CHATS → Hong Kong entities only; BOJ-NET → Japan entities only.
C) CLS (HQ entity only, fmi_type "FX Settlement Systems") — ${clsLine || "skip (home currency is not CLS-eligible)"}

---
Work all 5 steps fully. End with a summary: entities added/updated | BICs added | services created | FMI memberships recorded | web searches performed | any issues.`;
}

function buildLightJobPrompt(
  groupName: string,
  groupId: string,
  country: string | null | undefined,
  primaryCurrency: string | null | undefined,
  rtgsSystem: string | null | undefined,
  rtgsMember: boolean | null | undefined,
  snapshot: string,
): string {
  const hasEntities = !snapshot.startsWith("No entities");
  const rtgsConfirmed = !!rtgsMember && !!rtgsSystem;
  const taskE = rtgsConfirmed
    ? `E. RTGS FMI: Call check_fmi_membership(legal_entity_id=<entity ID from B>, fmi_name="${rtgsSystem}"). If not exists → call create_fmi(fmi_type="Payment Systems", fmi_name="${rtgsSystem}"). Do NOT search the web.`
    : `E. RTGS FMI: Skip — RTGS not confirmed (rtgs_member is false or rtgs_system is unknown).`;

  const snapshotNote = hasEntities
    ? `CURRENT DB STATE — use these IDs directly for entities/BICs already shown:\n${snapshot}`
    : `CURRENT DB STATE: No entities, BICs, or services recorded yet for this group.`;

  return `Light CB Setup: ${groupName} [Home currency only]
Group ID: ${groupId} | Country: ${country || "unknown"} | Currency: ${primaryCurrency || "not set"} | RTGS: ${rtgsSystem || "not set"} | RTGS confirmed: ${rtgsConfirmed ? "yes" : "no"}

${snapshotNote}

Complete ALL tasks below in ONE parallel batch of tool calls:

A. GROUP: If primary_currency is "not set" above, call update_banking_group(id="${groupId}") to set the correct ISO currency for ${country || "the group's country"}. Skip if currency is already set.

B. ENTITY: ${hasEntities ? `Entity already in DB STATE above — use its ID directly. Skip create.` : `Call find_legal_entity_by_name("${groupName}"). If not found → call create_legal_entity(group_id="${groupId}", legal_name="${groupName}", entity_type="Bank", country="${country || ""}").`}

C. BIC: ${hasEntities ? `BIC already in DB STATE above — use its ID directly. Skip create.` : `Call list_bics filtered to entity from B. If none → call create_bic(legal_entity_id=<entity ID>, bic_code="<derive from name + country: first 4 chars + CC + XXXX>", is_headquarters=true, swift_member=true). The user will correct the BIC code if needed.`}

D. SWIFT FMI: Call check_fmi_membership(legal_entity_id=<entity ID from B>, fmi_name="SWIFT"). If not exists → call create_fmi(fmi_type="Messaging Networks", fmi_name="SWIFT"). Do NOT search the web.

${taskE}

F. SERVICE: Call list_correspondent_services filtered to BIC from C and currency="${primaryCurrency || "home currency"}". If none found → call create_correspondent_service(bic_id=<BIC ID>, currency="${primaryCurrency || "home currency"}", service_type="Correspondent Banking", clearing_model="Onshore", rtgs_membership=${rtgsConfirmed}, nostro_accounts_offered=true, vostro_accounts_offered=true). If already exists → skip.

IMPORTANT: No web searches. All calls in parallel. End with exactly 3 lines:
"Entity: [name | ID]"
"BIC: [code | ID]"
"Service: [created | already existed]"`;
}

function buildMarketScanPrompt(
  country: string,
  currency: string,
  rtgsSystem: string | null,
): string {
  const isEurozone = currency === "EUR" || EUROZONE_COUNTRIES.has(country);
  const eurozoneTrap = isEurozone
    ? `\nTRAP 2 — EUROZONE SUBSIDIARIES: A subsidiary in any Eurozone country offering EUR is Onshore → "Correspondent Banking" + TARGET2. Include Eurozone subsidiaries of non-Eurozone parents as Onshore providers.`
    : "";

  return `Market Coverage Scan — ${country} / ${currency}

GOAL: Discover 8–15 correspondent banking providers active in the ${currency} market (${country}).
Record each provider as a banking group → legal entity → BIC → one ${currency} correspondent service.
This is a BREADTH-FIRST market scan. Do NOT record FMI memberships — those are handled by the CB Setup workflow.
Only create services for ${currency} — do NOT research other currencies.

---
STEP 1 — DISCOVER ACTIVE CB PROVIDERS
Run TWO web searches:
  Search 1: "${country} correspondent banking ${currency} providers SWIFT ${rtgsSystem ? rtgsSystem + " direct participant" : "clearing"}"
  Search 2: "banks offering ${currency} nostro vostro correspondent banking clearing"
Target 8–15 banks. Categorize each as:
  • Onshore (domestic) — entity domiciled in ${country}, likely direct ${rtgsSystem || "local RTGS"} participant → service_type "Correspondent Banking"
  • Offshore (foreign) — non-domestic entity offering ${currency} clearing → service_type "Global Currency Clearing"

---
STEP 2 — BANKING GROUPS
For each provider: call find_banking_group_by_name.
  • Found → note ID. Update any null fields (headquarters_country, primary_currency, cb_probability, cb_evidence) using update_banking_group.
  • Not found →
    - If the name contains a country/regional suffix (e.g. "HSBC Bank Canada", "Citibank NA", "Deutsche Bank Canada Branch"), FIRST search for the parent group without the suffix (e.g. "HSBC", "Citigroup", "Deutsche Bank AG"). If the parent exists, use that group — do NOT create a duplicate. The entity (Step 3) will be linked to the parent group.
    - Only create a new banking group if no parent match is found. Evaluate using the standard 4-criterion CB Provider assessment (SWIFT membership, RTGS participation, Nostro/Vostro evidence, Market reputation), then create with create_banking_group. Set cb_probability based on evidence found.

---
STEP 3 — LEGAL ENTITIES
For each banking group:
  • Onshore provider → the relevant entity is domiciled in ${country}. Call find_legal_entity_by_name.
  • Offshore provider → the relevant entity is the group's primary HQ banking entity. Call find_legal_entity_by_name.
If not found → create with create_legal_entity linked to the group. Set country accurately.

---
STEP 4 — BIC CODES
For each entity: call list_bics.
  • BIC exists → note it.
  • Missing → add with create_bic ONLY if the BIC code was confirmed from research. Do NOT guess BIC codes.

---
STEP 5 — ${currency} CORRESPONDENT SERVICE
For each BIC: call list_correspondent_services to check for an existing ${currency} service.
  • Exists → skip or update clearing_model if incorrect.
  • Missing → create with create_correspondent_service:
    - currency = "${currency}"
    - Onshore (entity country = ${country}) → service_type = "Correspondent Banking", clearing_model = "Onshore", rtgs_membership = true
    - Offshore (entity country ≠ ${country}) → service_type = "Global Currency Clearing", clearing_model = "Offshore"
    - Do NOT create services for any other currency.
TRAP 1 — PARENT CURRENCY: Do NOT mark Onshore just because ${currency} matches the banking group's primary_currency. A foreign subsidiary offering its parent's home currency is still Offshore (e.g. a US bank's German entity offering USD → Offshore).${eurozoneTrap}

---
End with a structured summary:
  Providers found: X (Y Onshore + Z Offshore)
  New banking groups created: X | Existing groups updated: X
  Entities created: X | BICs created: X | Services created: X
For full details (FMI memberships, other currencies), run the CB Setup workflow on individual providers.`;
}

async function processNextJob() {
  if (isProcessing) return;

  const jobs = await storage.listJobs();
  const pending = jobs.find(j => j.status === "pending");
  if (!pending) return;

  isProcessing = true;
  const jobType = (pending as any).job_type || "cb_setup";
  const isMarketScan = jobType === "market_scan";
  const scope: CurrencyScope = (pending.currency_scope as CurrencyScope) || "home_only";
  const isLight = (pending as any).job_mode === "light";
  const jobLabel = isMarketScan
    ? `Market Scan: ${(pending as any).market_country}/${(pending as any).market_currency}`
    : pending.banking_group_name || "unknown";
  console.log(`[JobRunner] Starting job ${pending.id} — ${jobLabel} (type: ${jobType}, scope: ${scope}, mode: ${isLight ? "light" : "normal"})`);

  try {
    const convName = isMarketScan
      ? `Market Scan: ${(pending as any).market_country} / ${(pending as any).market_currency}`
      : `CB Setup${isLight ? " [Light]" : ""}: ${pending.banking_group_name}`;
    const conv = await storage.createConversation({ name: convName });
    await storage.updateJob(pending.id, {
      status: "running",
      conversation_id: conv.id,
      started_at: new Date(),
    } as any);

    const sources = await storage.listDataSources();
    let message: string;

    // Snapshot group IDs before a market scan so we can identify newly created groups
    let preExistingGroupIds: Set<string> = new Set();
    if (isMarketScan) {
      const allGroups = await storage.listBankingGroups();
      preExistingGroupIds = new Set(allGroups.map(g => g.id));
    }

    if (isMarketScan) {
      const mCountry = (pending as any).market_country as string;
      const mCurrency = (pending as any).market_currency as string;
      const rtgs = COUNTRY_RTGS[mCountry] || null;
      message = buildMarketScanPrompt(mCountry, mCurrency, rtgs);
    } else {
      const group = await storage.getBankingGroup(pending.banking_group_id!);
      if (!group) throw new Error(`Banking group ${pending.banking_group_id} not found`);

      const [entities, bics, services] = await Promise.all([
        storage.listLegalEntities(),
        storage.listBics(),
        storage.listCorrespondentServices(),
      ]);

      const groupEntities = entities.filter(e => e.group_id === group.id);
      const groupBics = groupEntities.flatMap(e => bics.filter(b => b.legal_entity_id === e.id));
      const groupServices = groupBics.flatMap(b => services.filter(s => s.bic_id === b.id));
      const snapshot = buildGroupSnapshot(groupEntities, groupBics, groupServices);

      message = isLight
        ? buildLightJobPrompt(
            group.group_name, group.id, group.headquarters_country,
            group.primary_currency, group.rtgs_system, group.rtgs_member, snapshot,
          )
        : buildJobPrompt(
            group.group_name, group.id, group.primary_currency,
            group.cb_probability, group.rtgs_system, group.rtgs_member, snapshot, scope,
          );
    }

    await storage.createMessage({ conversation_id: conv.id, role: "user", content: message });

    const mode = isMarketScan ? "job" : (isLight ? "light" : "job");
    const systemPrompt = buildSystemPrompt(sources, undefined, mode);
    const openaiMessages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    const maxIter = isMarketScan ? 20 : (isLight ? 3 : 15);
    const model = isLight ? "gpt-4o-mini" : "gpt-4o";
    const tools = isLight ? getLightTools() : undefined;

    let stepCount = 0;
    const assistantContent = await runAgentLoop(
      openaiMessages,
      async (_toolName, _args, statusText) => {
        stepCount++;
        console.log(`[JobRunner] ${jobLabel} — step ${stepCount}: ${statusText}`);
        await storage.updateJob(pending.id, { steps_completed: stepCount } as any);
      },
      maxIter,
      "auto",
      model,
      tools,
    );

    await storage.createMessage({ conversation_id: conv.id, role: "assistant", content: assistantContent });

    // For market scans: identify newly created banking groups + extract summary
    let scanSummaryJson: string | undefined;
    if (isMarketScan) {
      const allGroupsAfter = await storage.listBankingGroups();
      const newGroups = allGroupsAfter.filter(g => !preExistingGroupIds.has(g.id));
      // Extract the structured summary block from the assistant's final message
      const summaryMatch = assistantContent.match(/Providers found[\s\S]*?(?:(?:\r?\n\r?\n)|$)/i);
      const summaryText = summaryMatch ? summaryMatch[0].trim() : "";
      scanSummaryJson = JSON.stringify({
        summaryText,
        newGroupIds: newGroups.map(g => g.id),
        newGroupNames: newGroups.map(g => g.group_name),
      });
    }

    await storage.updateJob(pending.id, {
      status: "completed",
      completed_at: new Date(),
      steps_completed: stepCount,
      ...(scanSummaryJson ? { scan_summary: scanSummaryJson } : {}),
    } as any);

    console.log(`[JobRunner] Completed job ${pending.id} — ${jobLabel} (${stepCount} steps). Cooling down ${JOB_COOLDOWN_MS / 1000}s before next job.`);
  } catch (err: any) {
    console.error(`[JobRunner] Job ${pending.id} failed:`, err.message);
    await storage.updateJob(pending.id, {
      status: "failed",
      error_message: err.message,
      completed_at: new Date(),
    } as any).catch(() => {});
    console.log(`[JobRunner] Cooling down ${JOB_COOLDOWN_MS / 1000}s after failure before next job.`);
  } finally {
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

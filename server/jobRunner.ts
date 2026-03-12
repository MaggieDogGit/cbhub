import { storage } from "./storage";
import { buildSystemPrompt, getLightTools, getDryRunTools, runAgentLoop } from "./agentCore";

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

// Reverse of CURRENCY_COUNTRY: country name → home currency (excludes Eurozone which is not a country)
export const COUNTRY_CURRENCY: Record<string, string> = Object.fromEntries(
  Object.entries(CURRENCY_COUNTRY).filter(([, v]) => v !== "Eurozone").map(([k, v]) => [v, k])
);

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
  const eurozoneNote = isEurozone
    ? `\nEurozone rule: For EUR, any entity in a Eurozone country (AT, DE, FR, IT, ES, NL, BE, PT, IE, FI, SK, SI, EE, LV, LT, MT, CY, GR, LU, HR) qualifies as Onshore → "Correspondent Banking" + TARGET2.`
    : "";

  return `Market Coverage Scan — ${country} / ${currency}

Objective: Identify onshore correspondent banking providers for the ${currency} market in ${country}.
Create for each qualified provider: banking group → local legal entity (country = ${country}) → BIC → one ${currency} correspondent service.
Do NOT record: FMI memberships, non-target currencies, offshore-only providers.
Detailed setup for each bank will be handled later by the CB Entity Setup workflow.

Market definition:
  Currency: ${currency}
  Settlement country: ${country}
  RTGS system: ${rtgsSystem || "identify from research"}${eurozoneNote}

---
PROVIDER QUALIFICATION RULES

A bank qualifies as a correspondent banking provider only if ALL of the following are true:
  1. A licensed banking entity exists in ${country}
  2. The entity participates in or has access to ${rtgsSystem || "the local RTGS system"}
  3. The entity has a confirmed SWIFT BIC
  4. Evidence exists that the bank supports financial institution or correspondent banking services

Acceptable evidence for criterion 4:
  FI services, transaction banking, institutional banking, nostro/vostro services, clearing or settlement banking, known market role as a settlement bank.

Immediate reject if:
  No licensed entity in ${country}, offshore-only clearing model, holding company, insurer or asset manager, inactive or divested entity, retail-only bank with no FI capabilities.

---
CONFIDENCE SCORING

Score each qualified candidate:
  Direct ${rtgsSystem || "RTGS"} participant = +30
  Confirmed SWIFT BIC = +15
  Explicit FI / correspondent banking evidence = +35
  Market reputation as clearing bank = +20

Local licensed entity in ${country} is mandatory (not scored — it is a gate).

Decision rules:
  Score >= 80 → High confidence → create provider
  Score 60–79 → Medium confidence → create provider
  Score < 60 → Reject candidate (track reason)

---
STEP 1 — CANDIDATE DISCOVERY

Use a layered discovery approach. Source priority:
  1. Central bank / ${rtgsSystem || "RTGS"} participant lists
  2. Banking regulator licence registers for ${country}
  3. Bank official websites (FI / transaction banking pages)
  4. SWIFT / BIC evidence
  5. Web search (confirmation only — do NOT use web search as the primary discovery method)

Search strategy:
  Search 1: "${country} ${rtgsSystem || "RTGS"} direct participants list ${currency} clearing banks"
  Search 2: "${country} banking regulator licensed banks foreign bank branches subsidiaries"
  Search 3 (if needed): "${country} correspondent banking ${currency} nostro vostro settlement banks"

Candidate types to identify:
  • Domestic banks headquartered in ${country}
  • Foreign bank subsidiaries licensed in ${country}
  • Foreign bank branches licensed in ${country}

Stop conditions — stop scanning when any of these occur:
  • 10 high-confidence providers identified
  • No new credible candidates found after 3 consecutive searches
  • 20 candidates reviewed

---
STEP 2 — CANDIDATE EVALUATION + BANKING GROUPS

For each candidate, apply the 4-criterion qualification checklist and compute the confidence score.
Reject any candidate scoring below 60. Track rejected candidates with the reason.

For each qualified provider: call find_banking_group_by_name.
  • Found → use existing group_id. Update missing fields (headquarters_country, primary_currency, cb_probability, cb_evidence) only if needed.
  • Not found →
    - If the name contains a country/regional suffix (e.g. "HSBC Bank ${country}", "Citibank ${country} Branch"), FIRST search for the parent group without the suffix (e.g. "HSBC", "Citigroup"). If the parent exists, use that group — do NOT create a duplicate.
    - Only create a new banking group if no parent match exists. Set cb_probability based on confidence score: High → "High", Medium → "Medium".

---
STEP 3 — LOCAL LEGAL ENTITIES

For each qualified provider, record only the entity domiciled IN ${country} (not the foreign HQ).
Call find_legal_entity_by_name to check if it already exists.
If not found → create with create_legal_entity linked to the group:
  - country = "${country}"
  - entity_type = "Bank" (domestic HQ), "Subsidiary" (foreign-owned local subsidiary), or "Branch" (foreign bank branch)
Do NOT create or link a foreign parent/HQ entity.

---
STEP 4 — BIC CODES

For each entity: call list_bics.
  • BIC exists → note it.
  • Missing and confirmed from research → create with create_bic.
  • Cannot confirm BIC → leave unresolved. Do NOT guess BIC codes.

---
STEP 5 — ${currency} CORRESPONDENT SERVICE

For each entity with a confirmed BIC: call list_correspondent_services to check for an existing ${currency} service.
  • Exists → skip or update if clearing_model is not "Onshore".
  • Missing → create with create_correspondent_service:
    - currency = "${currency}"
    - service_type = "Correspondent Banking"
    - clearing_model = "Onshore"
    - rtgs_membership = true ONLY if direct ${rtgsSystem || "RTGS"} participation was confirmed during evaluation; otherwise false
    - Do NOT create services for any other currency.

---
REJECTED CANDIDATES

Maintain a list of all rejected candidates with reason. Valid rejection reasons:
  No licensed entity in ${country} | offshore-only clearing model | no correspondent banking evidence | retail-only bank | entity inactive or divested | confidence score below 60

---
OUTPUT SUMMARY

At completion, output:

Providers discovered: X
  High confidence: X
  Medium confidence: X

New banking groups created: X
Existing groups used: X

Legal entities created: X
BICs created: X
Services created: X

Candidates reviewed: X
Candidates rejected: X

Web searches performed: X
Unresolved items: X (e.g. BICs not confirmed)

Rejected candidates:
  [bank name] — [reason]

For full details (FMI memberships, other currencies), run the CB Setup workflow on individual providers.`;
}

function buildDryRunSuffix(country: string, currency: string): string {
  return `

---
⚠️ DRY RUN MODE — READ-ONLY ⚠️
You have NO create/update/delete tools available. Do NOT attempt to call them.
Instead, complete ALL steps using only read and search tools, then produce a structured Markdown report.

## Dry-Run Discovery Report — ${country} / ${currency}

Only include providers with a legal entity domiciled IN ${country}. Exclude any pure-offshore providers.

### Qualified Providers

For each qualified provider, include:
| # | Banking Group | HQ Country | Entity Name (${country}) | Entity Type | BIC Code | RTGS Direct? | Confidence Score | Tier |
|---|---|---|---|---|---|---|---|---|

### Summary

- **Providers found**: X (Y High confidence + Z Medium confidence)
- **New groups that would be created**: list names
- **Existing groups that would be updated**: list names
- **Entities / BICs / Services that would be created**: counts
- **Candidates reviewed**: X
- **Web searches performed**: X
- **Unresolved items**: X (e.g. BICs not confirmed)

### Rejected Candidates

| # | Bank Name | Reason for Rejection |
|---|---|---|

Be thorough — follow the layered discovery strategy and evaluate each candidate against the 4-criterion qualification checklist and confidence scoring model.`;
}

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

    // Snapshot before a market scan so we can identify newly created vs touched groups
    let preExistingGroupIds: Set<string> = new Set();
    let preExistingEntityIds: Set<string> = new Set();
    let preExistingBicIds: Set<string> = new Set();
    // entityGroupMap: entity id → group_id (for reverse-lookup of BIC additions)
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
      // Build post-scan entity → group map (includes new entities)
      const postEntityGroupMap = new Map(allEntitiesAfter.map(e => [e.id, e.group_id]));
      // New groups (created during scan)
      const newGroups = allGroupsAfter.filter(g => !preExistingGroupIds.has(g.id));
      const newGroupIds = new Set(newGroups.map(g => g.id));
      // Touched existing groups: those that received new entities OR new BICs
      const touchedExistingGroupIds = new Set<string>();
      // New entities added to pre-existing groups
      for (const e of allEntitiesAfter) {
        if (!preExistingEntityIds.has(e.id) && preExistingGroupIds.has(e.group_id)) {
          touchedExistingGroupIds.add(e.group_id);
        }
      }
      // New BICs added to pre-existing entities (look up group via pre-scan or post-scan entity map)
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
      // All touched groups = new + updated existing, deduped
      const allTouchedGroups = [...newGroups, ...touchedExistingGroups];
      // Extract the structured summary block from the assistant's final message
      const summaryMatch = assistantContent.match(/Providers found[\s\S]*?(?:(?:\r?\n\r?\n)|$)/i);
      const summaryText = summaryMatch ? summaryMatch[0].trim() : "";
      scanSummaryJson = JSON.stringify({
        summaryText,
        newGroupIds: allTouchedGroups.map(g => g.id),
        newGroupNames: allTouchedGroups.map(g => g.group_name),
        createdCount: newGroups.length,
        updatedCount: touchedExistingGroups.length,
      });
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
        });
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

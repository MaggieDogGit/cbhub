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
For globally active or G-SIB banks, additionally check for documented CB operations in the following major clearing centres: United States (USD/Fedwire), United Kingdom (GBP/CHAPS), Singapore (SGD/MEPS+), Hong Kong (HKD/CHATS), Japan (JPY/BOJ-NET), Australia (AUD/RITS). If the bank has a licensed branch or subsidiary with confirmed RTGS direct participation in any of these markets, include it.
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
    ? `• CLS (fmi_type "FX Settlement Systems") — ${primaryCurrency} is CLS-eligible. First call check_fmi_membership for the HQ entity + "CLS". If not already recorded, run ONE search "${groupName} CLS settlement member" to confirm, then create if confirmed.`
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
For EVERY entity identified in this workflow (not just the HQ), always check locally stored FMI data before searching externally.
Order of precedence: (1) call check_fmi_membership — if the record exists, skip creation; (2) if missing, create from the reference table or known rules below; (3) only run a web search if the reference table has no answer.

A) SWIFT (fmi_type "Messaging Networks") — All licensed banking entities are SWIFT members. For each entity: call check_fmi_membership(entity, "SWIFT"). If not recorded, create with create_fmi. No web search required.

B) Local RTGS (fmi_type "Payment Systems") — Follow this 3-step procedure for each entity:
   Step 1: Determine the RTGS system from the reference table below using the entity's country, then call check_fmi_membership for the entity + RTGS system name. If the record already exists, skip — do nothing more for this entity.
   Step 2: If not recorded, create with create_fmi. Do NOT search the web.
   Step 3: If the entity's country is NOT in the reference table, run ONE search "[entity name] RTGS direct participant" to identify the system, then call check_fmi_membership before creating.
   Reference table:
   Eurozone countries (AT, DE, FR, IT, ES, NL, BE, PT, IE, FI, SK, SI, EE, LV, LT, MT, CY, GR, LU, HR since Jan 2023): TARGET2
   Czech Republic: CERTIS | Hungary: VIBER | Poland: SORBNET2 | Romania: ReGIS | Sweden: RIX | Denmark: Kronos2 | Norway: NICS | Switzerland: SIC
   United Kingdom: CHAPS | United States: Fedwire | Canada: Lynx | Australia: RITS | Japan: BOJ-NET | Singapore: MEPS+ | Hong Kong: CHATS
   China: CNAPS | India: RTGS (RBI) | South Africa: SAMOS | Brazil: STR | South Korea: BOK-Wire+ | Israel: ZAHAV | Turkey: EFT | UAE: UAEFTS
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
Do NOT create foreign HQ entities unless they are also the local licensed entity in ${country}.
Detailed setup for each bank will be handled later by the CB Entity Setup workflow.

Market definition:
  Currency: ${currency}
  Settlement country: ${country}
  RTGS system: ${rtgsSystem || "identify from research"}${eurozoneNote}

Output structure per provider:
  banking group → local legal entity → BIC → one ${currency} correspondent service

---
OPERATING MODEL — 3-LAYER EVALUATION

This workflow uses a 3-layer process for every candidate:

  Layer 1 — RULES + SOURCES: Use deterministic qualification rules and authoritative source hierarchy.
  Layer 2 — CLASSIFICATION: Evaluate each candidate through a structured evidence-and-classification framework before any database write.
  Layer 3 — DATABASE WRITE: Only create or update records after the candidate passes both Layer 1 and Layer 2.

Source priority (use in this order):
  1. Central bank / ${rtgsSystem || "RTGS"} participant lists
  2. Banking regulator licence registers for ${country}
  3. Bank official websites (FI / transaction banking pages)
  4. Confirmed BIC / SWIFT evidence
  5. Targeted web search (confirmation only — do NOT rely on generic web results if an authoritative source exists)

---
STEP 0 — BUILD CANDIDATE UNIVERSE

Build an initial list of candidate providers in ${country} using authoritative sources:
  - ${rtgsSystem || "RTGS"} / central bank participant lists
  - Banking regulator licence registers
  - Known domestic major banks
  - Foreign bank branches or subsidiaries on official registers

Search strategy:
  Search 1: "${country} ${rtgsSystem || "RTGS"} direct participants list ${currency} clearing banks"
  Search 2: "${country} banking regulator licensed banks foreign bank branches subsidiaries"
  Search 3 (if needed): "${country} correspondent banking ${currency} nostro vostro settlement banks"

Candidate types allowed:
  • Domestic banks headquartered in ${country}
  • Foreign bank subsidiaries licensed in ${country}
  • Foreign bank branches licensed in ${country}

Exclude immediately:
  • Entities with no licensed local presence in ${country}
  • Holding companies, insurance or asset management entities
  • Inactive or divested entities

Do NOT evaluate or score candidates in this step — only build the universe.

---
STEP 1 — GATHER EVIDENCE PER CANDIDATE

For each candidate in the universe, collect the following evidence fields:

  candidate_name: [name as discovered]
  local_entity_name: [licensed entity name in ${country}]
  local_entity_country: ${country}
  parent_group_candidate: [parent banking group name, if foreign]
  licensed_in_country: true | false | unclear
  rtgs_participation: confirmed | unclear | none
  rtgs_source: [URL or source description]
  bic_code: [SWIFT BIC or null]
  bic_confirmed: true | false
  fi_services_evidence: [text description or null]
  correspondent_banking_evidence: [text description or null]
  transaction_banking_evidence: [text description or null]
  nostro_vostro_evidence: [text description or null]
  market_reputation_evidence: [text description or null]
  source_list: [URLs and sources used]

If evidence is missing for a candidate, use targeted searches only as needed.
Do NOT proceed to Step 2 for a candidate until its evidence fields are populated.

---
STEP 2 — CLASSIFICATION GATE

After gathering evidence for each candidate, evaluate it using the following structured classification framework.
Reason through this assessment explicitly and output the JSON block before proceeding to database operations:

{
  "include_candidate": true | false,
  "confidence": "High | Medium | Low",
  "confidence_score": 0,
  "service_model": "Onshore | Reject",
  "reasoning": "brief explanation of the classification decision",
  "parent_group_name": "normalized parent group name",
  "local_entity_name_final": "confirmed local entity name",
  "entity_type": "Domestic Bank | Subsidiary | Branch | Unknown",
  "rejection_reason": "if rejected, explain why"
}

Classification rules:
  - licensed_in_country = false → include_candidate = false, rejection_reason = "no licensed local entity"
  - Offshore-only model → include_candidate = false, rejection_reason = "offshore-only"
  - No FI / correspondent / clearing evidence → include_candidate = false, rejection_reason = "no correspondent banking evidence"
  - Retail-only bank with no FI capabilities → include_candidate = false, rejection_reason = "retail-only bank"
  - confidence = "Low" → include_candidate = false
  - service_model must equal "Onshore" for inclusion

Do NOT proceed to database writes for any candidate where include_candidate = false.
If confidence = "Medium", include only if the evidence still meets the qualification rules.

---
STEP 3 — NUMERIC SCORING + CONFLICT RESOLUTION

For each candidate that passed Step 2 (include_candidate = true), compute a numeric confidence score:

  Direct ${rtgsSystem || "RTGS"} participant = +30
  Confirmed SWIFT BIC = +15
  Explicit FI / correspondent / clearing / nostro-vostro evidence = +35
  Market reputation as settlement / clearing bank = +20

Local licensed entity in ${country} is mandatory (not scored — it is a gate).

Thresholds:
  Score >= 80 → High confidence
  Score 60–79 → Medium confidence
  Score < 60 → Reject

CONFLICT RESOLUTION: If the numeric score and the Step 2 classification confidence conflict, do NOT auto-create the record. Mark as unresolved.
Conflicts include:
  • Score >= 80 but classification confidence = "Medium" or "Low"
  • Score < 60 but classification confidence = "High"
  • Score 60–79 but classification confidence = "Low"
Track unresolved candidates separately with both signals noted.

---
STEP 4 — STOP CONDITIONS

Stop scanning when any of these occur:
  • 10 high-confidence providers identified (both score and classification agree)
  • No new credible candidates found after 3 consecutive searches
  • 20 candidates reviewed

Do not force a provider count if the market is smaller.

---
STEP 5 — BANKING GROUP RESOLUTION

For each accepted candidate (passed Steps 2 + 3 without conflict):

Call find_banking_group_by_name.
  • Found → use existing group_id. Update missing fields (headquarters_country, primary_currency, cb_probability, cb_evidence) only if needed.
  • Not found → first check whether the local entity belongs to an existing parent group:
    - If the name contains a country/regional suffix (e.g. "HSBC Bank ${country}", "Citibank ${country} Branch"), search for the parent group without the suffix (e.g. "HSBC", "Citigroup"). If the parent exists, use that group.
    - If the parent relationship is unclear, reason through this parent-resolution assessment:

      {
        "parent_group_name": "best match parent group name",
        "confidence": "High | Medium | Low",
        "entity_type": "Subsidiary | Branch | Domestic Bank | Unknown"
      }

      If confidence = "High" or "Medium" and a matching group is found in the database, use it.
    - Only create a new banking group if no parent match exists after both checks.
      Set cb_probability based on the agreed confidence tier: High → "High", Medium → "Medium".

---
STEP 6 — LOCAL LEGAL ENTITY

For each accepted candidate, record only the entity domiciled IN ${country}.
Call find_legal_entity_by_name to check if it already exists.
If not found → create with create_legal_entity linked to the group:
  - country = "${country}"
  - entity_type = use the value from the Step 2 classification (Domestic Bank → "Bank", Subsidiary → "Subsidiary", Branch → "Branch")
Do NOT create or link a foreign parent/HQ entity.

---
STEP 7 — BIC CODES

For each accepted entity: call list_bics.
  • BIC exists → use it.
  • Missing and bic_confirmed = true from Step 1 evidence → create with create_bic.
  • Cannot confirm BIC → leave unresolved. Do NOT guess BIC codes. Do NOT invent data.

---
STEP 8 — ${currency} CORRESPONDENT SERVICE

For each entity with a confirmed BIC: call list_correspondent_services to check for an existing ${currency} service.
  • Exists → skip or update if clearing_model is not "Onshore".
  • Missing → create with create_correspondent_service:
    - currency = "${currency}"
    - service_type = "Correspondent Banking"
    - clearing_model = "Onshore"
    - rtgs_membership = true ONLY if rtgs_participation = "confirmed" in Step 1 evidence; otherwise false
    - Do NOT create services for any other currency.

---
STEP 9 — REJECTED CANDIDATES LOG

Maintain a list of all rejected candidates with:
  - candidate_name
  - rejection_reason
  - supporting_note (brief evidence summary)

Valid rejection reasons:
  no licensed local entity | offshore-only model | no correspondent banking evidence | retail-only bank | entity inactive or divested | BIC unconfirmed and evidence too weak | classification conflict (score vs classification disagreement)

---
STEP 10 — FINAL OUTPUT

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
Unresolved items: X

Web searches performed: X
Classifications performed: X

Accepted providers:
  [bank name] — [confidence tier] — [entity type]

Rejected candidates:
  [bank name] — [rejection reason]

Unresolved candidates:
  [bank name] — [conflict detail: score X vs classification Y]

For full details (FMI memberships, other currencies), run the CB Setup workflow on individual providers.`;
}

function buildDryRunSuffix(country: string, currency: string): string {
  return `

---
⚠️ DRY RUN MODE — READ-ONLY ⚠️
You have NO create/update/delete tools available. Do NOT attempt to call them.
Instead, complete Steps 0–3 fully using only read and search tools, then produce a structured Markdown report.
For each candidate, still gather evidence (Step 1), run the classification (Step 2), and compute the numeric score (Step 3).
Skip Steps 5–8 (no database writes). Still produce the Step 9 rejected list and Step 10 output.

## Dry-Run Discovery Report — ${country} / ${currency}

Only include providers with a legal entity domiciled IN ${country}. Exclude any pure-offshore providers.

### Qualified Providers

For each qualified provider, include:
| # | Banking Group | HQ Country | Entity Name (${country}) | Entity Type | BIC Code | RTGS Direct? | Score | Classification | Tier |
|---|---|---|---|---|---|---|---|---|---|

### Summary

- **Providers found**: X (Y High confidence + Z Medium confidence)
- **New groups that would be created**: list names
- **Existing groups that would be updated**: list names
- **Entities / BICs / Services that would be created**: counts
- **Candidates reviewed**: X
- **Candidates rejected**: X
- **Unresolved items**: X (score/classification conflicts or BICs not confirmed)
- **Web searches performed**: X
- **Classifications performed**: X

### Rejected Candidates

| # | Bank Name | Reason for Rejection | Supporting Note |
|---|---|---|---|

### Unresolved Candidates

| # | Bank Name | Score | Classification | Conflict Detail |
|---|---|---|---|---|

Be thorough — follow the 3-layer evaluation model: build the candidate universe (Step 0), gather named evidence fields (Step 1), run the classification gate (Step 2), and compute numeric scores with conflict resolution (Step 3).`;
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

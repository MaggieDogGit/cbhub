import { storage } from "./storage";
import { buildSystemPrompt, getLightTools, getDryRunTools, runAgentLoop } from "./agentCore";
import type { IntelObservation, AgentJob } from "../shared/schema";

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
  "South Africa": "SAMOS", "Israel": "ZAHAV", "Turkey": "EFT",
  "United Arab Emirates": "UAEFTS", "New Zealand": "ESAS",
  "Bulgaria": "RINGS", "Bahrain": "RTGS-BD", "Chile": "LBTR", "Colombia": "CUD",
  "Egypt": "RTGS", "Indonesia": "BI-RTGS", "Kenya": "KEPSS", "Kuwait": "KASSIP",
  "Morocco": "SRBM", "Malaysia": "RENTAS", "Nigeria": "NIP", "Oman": "RTGS",
  "Peru": "LBTR", "Philippines": "PhilPaSS", "Qatar": "QATCH",
  "Saudi Arabia": "SARIE", "Thailand": "BAHTNET", "Taiwan": "CIFS",
};

export const CURRENCY_COUNTRY: Record<string, string> = {
  "USD": "United States", "EUR": "Eurozone", "GBP": "United Kingdom",
  "AED": "United Arab Emirates", "AUD": "Australia", "BGN": "Bulgaria",
  "BHD": "Bahrain", "BRL": "Brazil", "CAD": "Canada", "CHF": "Switzerland",
  "CLP": "Chile", "CNH": "China", "CNY": "China", "COP": "Colombia",
  "CZK": "Czech Republic", "DKK": "Denmark", "EGP": "Egypt",
  "HKD": "Hong Kong", "HUF": "Hungary", "IDR": "Indonesia",
  "ILS": "Israel", "INR": "India", "JPY": "Japan", "KES": "Kenya",
  "KRW": "South Korea", "KWD": "Kuwait", "MAD": "Morocco", "MXN": "Mexico",
  "MYR": "Malaysia", "NGN": "Nigeria", "NOK": "Norway", "NZD": "New Zealand",
  "OMR": "Oman", "PEN": "Peru", "PHP": "Philippines", "PLN": "Poland",
  "QAR": "Qatar", "RON": "Romania", "SAR": "Saudi Arabia", "SEK": "Sweden",
  "SGD": "Singapore", "THB": "Thailand", "TRY": "Turkey", "TWD": "Taiwan",
  "ZAR": "South Africa",
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
STEP 6 — VALIDATE CB STRUCTURE
After completing Steps 1–5, call validate_cb_structure(group_id="${groupId}", bank_name="${groupName}").
This runs an independent AI review of the entities, services, and FMI records you just created/updated.
Review the returned JSON. If structure_valid is false or issues are non-empty, list every issue in your summary — but do NOT delete or modify any records based on the validation. The issues are flags for human review.

---
STEP 7 — FINAL OUTPUT
Work all 6 steps fully. End with a summary in this exact format:
Entities added/updated: X | BICs added: X | Services created: X | FMI memberships recorded: X | Web searches performed: X
Validations performed: 1 | Issues detected: X
VALIDATION_JSON: <paste the raw JSON returned by validate_cb_structure here>
If any issues were detected, list them below the summary.`;
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
  const rtgs = rtgsSystem || "the local RTGS system";

  return `Market Coverage Scan — ${country} / ${currency}

Objective: Identify onshore correspondent banking providers for the ${currency} market in ${country}. For each qualified provider, create: banking group → local legal entity (domiciled in ${country}) → BIC → one ${currency} correspondent service.

Do NOT record: FMI memberships, non-target currencies, or offshore-only providers.
Do NOT create foreign HQ entities unless they are simultaneously the local licensed entity in ${country}.
Detailed entity setup (other currencies, FMI memberships) will be handled later by the CB Setup workflow.

Market definition:
  Currency: ${currency}
  Settlement country: ${country}
  RTGS system: ${rtgs}${eurozoneNote}

---
PHASE 1 — DISCOVER AND QUALIFY CANDIDATES

Run the following searches now. After each search, immediately note any new candidate banks found. Continue searching until you have a stable candidate list (no new candidates in the last search) or have run 5 searches.

Suggested search queries:
  • "${country} ${rtgs} direct participants ${currency} clearing banks"
  • "${country} banking regulator licensed banks correspondent banking"
  • "${country} ${currency} nostro vostro correspondent banks financial institutions"
  • "[specific bank name] ${country} correspondent banking ${currency}" (for each promising candidate)

Candidate types to include:
  • Domestic banks headquartered in ${country}
  • Foreign bank subsidiaries incorporated in ${country}
  • Foreign bank branches with a full banking licence in ${country}

Exclude immediately (before any evaluation):
  • Entities with no licensed local presence in ${country}
  • Holding companies, insurance or asset management entities
  • Inactive or divested entities
  • Pure offshore providers (no local ${country} entity)

---
PHASE 2 — EVALUATE EACH CANDIDATE (inline, one by one)

For each candidate discovered in Phase 1, work through the following evaluation immediately — do not batch or defer this. Complete the full evaluation for candidate N before moving to candidate N+1.

2a. Gather evidence. Note these facts from your search results (no additional search needed unless a field is genuinely missing):
  - local_entity_name: the licensed entity name in ${country}
  - entity_type: Domestic Bank | Subsidiary | Branch
  - licensed_in_country: true | false | unclear
  - rtgs_participation: confirmed | unclear | none  (source: ${rtgs} participant list or central bank data)
  - bic_code: confirmed BIC or null
  - bic_confirmed: true | false
  - correspondent_banking_evidence: brief note on FI services, nostro/vostro, transaction banking, or clearing evidence

2b. Score the candidate:
  - ${rtgs} direct participant confirmed: +30
  - SWIFT BIC confirmed: +15
  - Explicit FI / correspondent / clearing / nostro-vostro evidence: +35
  - Market reputation as a settlement or clearing bank: +20
  Score >= 80 → High | Score 60–79 → Medium | Score < 60 → Reject

2c. Qualify or reject. A candidate is qualified if ALL of the following are true:
  ✓ licensed_in_country = true
  ✓ score >= 60
  ✓ Not offshore-only
  ✓ Has FI / correspondent banking evidence (not retail-only)

  If the candidate fails any check, mark it as rejected with a reason and move to the next candidate.

Stop evaluating when: 10 qualified providers found, OR 20 candidates reviewed, OR 3 consecutive searches return no new candidates.

---
PHASE 3 — WRITE QUALIFIED CANDIDATES TO DATABASE

For each candidate that passed Phase 2 qualification, immediately perform these database steps:

3a. Banking group resolution — call find_banking_group_by_name with the full entity name first.
  • Found → use existing group_id.
  • Not found → derive the parent group name using this stripping sequence and search again after each step:
      Step 1: Remove country/branch suffixes — strip "(${country})", "${country} Branch", "${country} Limited", "Bank ${country}", and trailing ", ${country}"
      Step 2: Remove legal suffixes — strip " Bank", " Banking", " Limited", " Ltd", " PLC", " Corp", " Holdings", " Group", " International", " AG", " SA", " NV" (trim after each removal)
      Step 3: Try well-known parent aliases — e.g. "Citibank" → also try "Citigroup"; "Standard Chartered" stays as-is; "BNP" → try "BNP Paribas"; any name that ends in a country → try again without it
      Call find_banking_group_by_name for each derived name until a match is found.
  • Match found at any step → use that group_id. Do NOT create a new group.
  • No match after all steps:
      - If entity_type = Subsidiary or Branch → this is a foreign-parent entity. Create a new banking group using the parent organisation's name (not the local entity name). Set headquarters_country to the parent's home country and primary_currency to the parent's home currency. Set cb_probability = "High" if score >= 80, else "Medium".
      - If entity_type = Bank (domestic) → create a new banking group using the local entity name. Set headquarters_country = "${country}", primary_currency = "${currency}".

3b. Local legal entity — call find_legal_entity_by_name.
  • Found → use existing entity_id.
  • Not found → create with create_legal_entity:
      group_id = from 3a
      country = "${country}"
      entity_type = Bank | Subsidiary | Branch (from Phase 2 evaluation)

3c. BIC code — call list_bics for the entity.
  • Found → use existing bic_id.
  • Not found and bic_confirmed = true → create with create_bic.
  • Not found and bic unconfirmed → skip BIC creation; note as unresolved.

3d. Correspondent service — call list_correspondent_services for this BIC and currency "${currency}".
  • Already exists → skip (or update clearing_model to "Onshore" if wrong).
  • Missing → create with create_correspondent_service:
      currency = "${currency}"
      service_type = "Correspondent Banking"
      clearing_model = "Onshore"
      rtgs_membership = true ONLY if rtgs_participation was confirmed in Phase 2; otherwise false

Repeat 3a–3d for every qualified candidate before producing the final output.

---
FINAL OUTPUT

After completing all database writes, output a summary in this exact format:

Providers found: X (Y High confidence + Z Medium confidence)

New banking groups created: X | Existing groups used: X
Legal entities created: X | BICs created: X | Services created: X
Candidates reviewed: X | Candidates rejected: X | Unresolved items: X

Accepted providers:
  [bank name] — [High|Medium] — [entity type]

Rejected candidates:
  [bank name] — [reason: no licensed local entity | offshore-only | no CB evidence | retail-only | low score | BIC unconfirmed]

Unresolved items:
  [bank name] — [detail]

For full details (FMI memberships, other currencies), run the CB Setup workflow on individual providers.`;
}

function buildDryRunSuffix(country: string, currency: string): string {
  return `

---
⚠️ DRY RUN MODE — READ-ONLY ⚠️
You have NO create/update/delete tools available. Do NOT attempt to call them.
Complete Phases 1 and 2 in full using only read and search tools. Skip Phase 3 (no database writes).
After completing Phase 2 evaluation for all candidates, produce the structured report below instead of writing to the database.

## Dry-Run Discovery Report — ${country} / ${currency}

Only include providers with a legal entity domiciled IN ${country}. Exclude any pure-offshore providers.

### Qualified Providers

| # | Banking Group | HQ Country | Entity Name (${country}) | Entity Type | BIC Code | RTGS Direct? | Score | Confidence Tier |
|---|---|---|---|---|---|---|---|---|

Score = from Phase 2b scoring. Confidence Tier = High (>=80) / Medium (60–79).

### Summary

- **Providers found**: X (Y High confidence + Z Medium confidence)
- **New groups that would be created**: list names
- **Existing groups that would be used**: list names
- **Entities / BICs / Services that would be created**: counts
- **Candidates reviewed**: X
- **Candidates rejected**: X
- **Unresolved items**: X (BICs not confirmed or conflicting evidence)
- **Web searches performed**: X

### Rejected Candidates

| # | Bank Name | Reason for Rejection | Supporting Note |
|---|---|---|---|

### Unresolved Items

| # | Bank Name | Issue |
|---|---|---|`;
}

function buildIntelContext(intelObs: IntelObservation[], relevantScans: AgentJob[]): string {
  if (intelObs.length === 0 && relevantScans.length === 0) return "";

  const lines: string[] = [
    "INTELLIGENCE CONTEXT — use this to inform your research",
    "---",
  ];

  if (intelObs.length > 0) {
    lines.push("User observations recorded for this banking group:");
    for (const obs of intelObs) {
      const type = obs.obs_type === "competitor" ? "Competitor observation" : "My CB Provider observation";
      const currency = obs.currency ? ` [${obs.currency}]` : "";
      const notes = obs.notes ? `: ${obs.notes}` : "";
      lines.push(`• ${type}${currency}${notes}`);
    }
    lines.push("Action: During Step 4, verify and create services for any currencies mentioned above if they are not already in the snapshot.");
  }

  if (relevantScans.length > 0) {
    if (intelObs.length > 0) lines.push("");
    lines.push("Relevant market scan findings (same currency or country — entities here are pre-qualified):");
    for (const scan of relevantScans) {
      const label = `${scan.market_country || "?"}/${scan.market_currency || "?"}`;
      let summary = "";
      try {
        const parsed = JSON.parse(scan.scan_summary!);
        summary = parsed.summaryText ? parsed.summaryText.slice(0, 400) : "";
      } catch { summary = scan.scan_summary?.slice(0, 400) || ""; }
      if (summary) lines.push(`• [${label} scan] ${summary}`);
    }
    lines.push("Action: During Step 2, treat entities found in these scans as already-researched candidates — no additional web search needed for them.");
  }

  lines.push("---", "");
  return lines.join("\n") + "\n";
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

      // For normal (non-light) jobs: inject intel observations and relevant market scan context
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

      message = intelContext ? intelContext + basePrompt : basePrompt;
    }

    await storage.createMessage({ conversation_id: conv.id, role: "user", content: message });

    const mode = isMarketScan ? "job" : (isLight ? "light" : "job");
    const systemPrompt = buildSystemPrompt(sources, undefined, mode);
    const openaiMessages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    const maxIter = isMarketScan ? 50 : (isLight ? 3 : 15);
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
      const summaryMatch = assistantContent.match(/Providers found[\s\S]*/i);
      const summaryText = summaryMatch ? summaryMatch[0].trim() : assistantContent.trim();
      scanSummaryJson = JSON.stringify({
        summaryText,
        newGroupIds: allTouchedGroups.map(g => g.id),
        newGroupNames: allTouchedGroups.map(g => g.group_name),
        createdCount: newGroups.length,
        updatedCount: touchedExistingGroups.length,
      });
    } else if (!isMarketScan && !isLight) {
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

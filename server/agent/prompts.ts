// Absorbed from server/agentCore.ts: buildSystemPrompt
// Absorbed from server/jobRunner.ts: buildJobPrompt, buildLightJobPrompt, buildMarketScanPrompt, buildDryRunSuffix, buildIntelContext, buildCurrencyInstruction, buildGroupSnapshot
// Tech debt: These prompt strings are very large and could eventually move to a dedicated prompts directory with separate template files.

import type { DataSource, IntelObservation, AgentJob } from "@shared/schema";
import { COUNTRY_CURRENCY, EUROZONE_COUNTRIES, CLS_CURRENCIES } from "../services/cbDiscoveryService";

type CurrencyScope = "home_only" | "major" | "all";

type EntityRow = { id: string; legal_name: string; country: string | null; entity_type: string | null };
type BicRow    = { id: string; bic_code: string; legal_entity_id: string; is_headquarters: boolean | null };
type ServiceRow = { bic_id: string; currency: string; clearing_model: string | null };

export function buildGroupSnapshot(entities: EntityRow[], bics: BicRow[], services: ServiceRow[]): string {
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

export function buildCurrencyInstruction(scope: CurrencyScope, primaryCurrency: string | null | undefined): string {
  switch (scope) {
    case "home_only":
      return `For each BIC, ensure a Correspondent Banking service exists in the home currency${primaryCurrency ? ` (${primaryCurrency})` : ""} only. Do not create services for other currencies — strictly limit to the home currency.`;
    case "major":
      return `For each BIC, focus only on EUR, GBP, and USD correspondent banking services. Only create services for these three currencies; skip the home currency if it is not one of these three.`;
    case "all": {
      const countryRefLines = Object.entries(COUNTRY_CURRENCY)
        .map(([country, ccy]) => `${country}→${ccy}`)
        .join(" | ");
      return `For each BIC, work through currencies in this order:
1. LOCAL CURRENCY FIRST — determine the entity's country, then look up its local settlement currency from the reference table below. Create an Onshore Correspondent Banking service for that currency. This step is mandatory for every entity regardless of the group's home currency.
   Country→Currency reference: ${countryRefLines}
   For Eurozone countries (AT, BE, HR, CY, EE, FI, FR, DE, GR, IE, IT, LV, LT, LU, MT, NL, PT, SK, SI, ES) the local currency is EUR.
2. ADDITIONAL CURRENCIES — after the local currency service is in place, research and add any other currencies that entity is confirmed to offer CB services in, based on its RTGS/clearing memberships and published FI services.
Do NOT use the group's primary currency (${primaryCurrency || "the group home currency"}) as the starting point for foreign subsidiaries — it is only the local Onshore currency for entities in the group's own home country/region.`;
    }
  }
}

export function buildJobPrompt(
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

  const entityTargetingRule = `Include: (a) the primary HQ licensed banking entity, (b) dedicated CB-hub or transaction-banking subsidiaries, and (c) regional or national banking subsidiaries that hold a local banking licence and are direct participants in a local RTGS or payment clearing system — even if they are primarily retail/commercial banks. Local RTGS/clearing participation is sufficient qualification.
For globally active or G-SIB banks, additionally check for documented CB operations in the following major clearing centres: United States (USD/Fedwire), United Kingdom (GBP/CHAPS), Singapore (SGD/MEPS+), Hong Kong (HKD/CHATS), Japan (JPY/BOJ-NET), Australia (AUD/RITS). If the bank has a licensed branch or subsidiary with confirmed RTGS direct participation in any of these markets, include it.
Exclude: holding companies, insurance or asset-management arms, dormant entities, securities firms, markets entities, and any subsidiary that does not hold a direct banking licence or payment system membership. Treat any entity whose name contains "Markets", "Securities", "Capital Markets", "Global Markets", "Investments", or "Asset Management" as a non-banking subsidiary — do NOT add it unless you can explicitly confirm it holds a banking licence separate from its parent. The HQ entity must be the primary licensed bank (e.g. "Banco Bilbao Vizcaya Argentaria, S.A." not "BBVA Global Markets, S.A.").
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
• Missing → before calling create_bic, you MUST have a confirmed real-world BIC code (from search results or official SWIFT data). Do NOT invent or derive a BIC code. If you cannot confirm the BIC through research, skip it and note it as unresolved. Set is_headquarters=true and swift_member=true for the primary HQ entity's BIC.
• If create_bic returns an error indicating the BIC already exists under a different entity, do NOT create an alternative BIC code — instead note the conflict in the final summary for human review. A BIC belongs to exactly one entity; duplicating it is not permitted.

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
TRAP 3 — LOCAL CURRENCY FIRST: For every entity, the first service you create must be for the entity's own local settlement currency (determined by the entity's country), not the group's primary_currency. Example: BBVA México → MXN Onshore first; Garanti BBVA (Turkey) → TRY Onshore first; BBVA Colombia → COP Onshore first. Only after the local-currency Onshore service is created should you add any additional currencies.

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

export function buildLightJobPrompt(
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

C. BIC: ${hasEntities ? `BIC already in DB STATE above — use its ID directly. Skip create.` : `Call list_bics filtered to entity from B. If none → skip BIC creation. Do NOT invent or derive a BIC code. The user will add the correct confirmed BIC manually.`}

D. SWIFT FMI: Call check_fmi_membership(legal_entity_id=<entity ID from B>, fmi_name="SWIFT"). If not exists → call create_fmi(fmi_type="Messaging Networks", fmi_name="SWIFT"). Do NOT search the web.

${taskE}

F. SERVICE: Call list_correspondent_services filtered to BIC from C and currency="${primaryCurrency || "home currency"}". If none found → call create_correspondent_service(bic_id=<BIC ID>, currency="${primaryCurrency || "home currency"}", service_type="Correspondent Banking", clearing_model="Onshore", rtgs_membership=${rtgsConfirmed}, nostro_accounts_offered=true, vostro_accounts_offered=true). If already exists → skip.

IMPORTANT: No web searches. All calls in parallel. End with exactly 3 lines:
"Entity: [name | ID]"
"BIC: [code | ID]"
"Service: [created | already existed]"`;
}

export function buildMarketScanPrompt(
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
      - If entity_type = Subsidiary or Branch → create a new banking group using the PARENT GROUP name (not the local subsidiary name). Set headquarters_country and primary_currency for the parent, not for ${country}/${currency}.
      - If entity_type = Bank (domestic) → create a new banking group using the local entity name. Set headquarters_country = "${country}", primary_currency = "${currency}".

3b. Local legal entity — call find_legal_entity_by_name.
  • Found AND the entity's group_id matches the group_id from step 3a → use existing entity_id.
  • Found BUT the entity's group_id is DIFFERENT from step 3a → do NOT reuse it. The entity already exists under another group. Create a new legal entity with create_legal_entity linked to the group_id from step 3a.
  • Not found → create with create_legal_entity:
      group_id = from 3a
      country = "${country}"
      entity_type = Bank | Subsidiary | Branch (from Phase 2 evaluation)
  IMPORTANT: Every legal entity must be linked to exactly the banking group resolved in step 3a. Never place an entity under a different group than the one you identified for it.

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

export function buildDryRunSuffix(country: string, currency: string): string {
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

export function buildIntelContext(intelObs: IntelObservation[], relevantScans: AgentJob[]): string {
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

export function buildSystemPrompt(storedSources: DataSource[], topic?: string, mode: "interactive" | "job" | "light" = "interactive"): string {
  if (mode === "light") {
    return `You are a structured database entry assistant for correspondent banking records. Your job is to create the minimum required records for a banking group using ONLY the data provided in the job prompt.

RULES (all mandatory):
- DO NOT search the web. You have no web search capability in this mode.
- Complete all tool calls in a SINGLE parallel batch in your first response.
- If a record already exists in the DB STATE snapshot, use its existing ID — skip creation.
- Follow the lettered tasks exactly as written in the job prompt.
- Output a brief 3-line summary only after completing the tool calls.`;
  }
  const knownSourcesSection = storedSources.length > 0
    ? `\n\n---\n## KNOWN REFERENCE SOURCES (USE THESE FIRST)\nThe following authoritative sources are already stored. Before searching the web from scratch, check if any of these apply. When they do, use their URL directly in web_search.\n\n${
      (() => {
        const byCategory: Record<string, typeof storedSources> = {};
        for (const s of storedSources) {
          const cat = s.category || "Other";
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(s);
        }
        return Object.entries(byCategory).map(([cat, sources]) =>
          `### ${cat}\n` + sources.map(s =>
            `- **${s.name}**${s.publisher ? ` (${s.publisher})` : ""}${s.url ? ` — ${s.url}` : ""}${s.description ? `\n  ${s.description}` : ""}`
          ).join("\n")
        ).join("\n\n");
      })()
    }`
    : "";

  const topicPreamble = topic ? (() => {
    const preambles: Record<string, string> = {
      "banking-groups": `## ACTIVE WORKSPACE: Banking Groups
Your primary focus is researching, qualifying, and managing Banking Groups and their legal entities.

### HQ-ONLY CONSTRAINT (APPLIES TO EVERYTHING IN THIS WORKSPACE)
We ONLY add global parent holding companies as BankingGroups. Never add a branch, subsidiary, or regional entity as the top-level BankingGroup. If an RTGS participant is a local branch or subsidiary of an international group, look up and add the GLOBAL PARENT. The local entity's RTGS membership is evidence that the group qualifies, but the record we create represents the ultimate parent.

### LOOKUP QUESTIONS — CHECK THE DATABASE FIRST
When the user asks "which banks offer X currency?", "who provides X CB?", "do we have any X providers?", or any similar question about what already exists — your FIRST action is ALWAYS to query the database, not the web. Follow this exact sequence:
1. Call list_correspondent_services filtered by the relevant currency (e.g. currency="ZAR"). Report what is found.
2. If additional context is needed, call list_banking_groups to cross-reference group-level details.
3. Only after presenting the database results should you offer to research and add additional providers via web search — and only if the user asks for that.

Never skip to a web search when the question can be answered (even partially) from the existing database.

### CURRENCY-BASED DISCOVERY — FIND AND ADD NEW PROVIDERS BY CURRENCY
When the user asks to "identify", "find", "discover", or "research" banking groups that provide CB services for a specific currency — this is a DISCOVERY workflow, not a simple database lookup. Follow all 8 steps:

**Step 1 — Database snapshot**
Call list_correspondent_services(currency="[X]"). Report existing providers to the user upfront. Note which ones are already recorded so you do not add duplicates.

**Step 2 — Map currency to RTGS**
Use the RTGS mapping table in Criterion 3 below (e.g. ZAR → SAMOS). If the currency is not in the table, search: "[currency] RTGS system central bank".

**Step 3 — Find RTGS participants**
Search: "[RTGS name] direct participants list [year]" or use a known reference source. Compile a candidate list. If the RTGS is SAMOS, search: "SAMOS direct participants South African Reserve Bank".

**Step 4 — HQ identification (CRITICAL)**
For each RTGS participant, determine: is this a standalone domestic bank, or a local branch/subsidiary of an international group?
- If LOCAL BRANCH OF INTERNATIONAL GROUP → the entity to add is the GLOBAL PARENT holding company. The local entity's membership is your evidence.
  - Example: "Citibank N.A. South African Branch" → global parent is Citigroup Inc. (USD, headquartered New York)
  - Example: "Standard Chartered Bank SA Branch" → global parent is Standard Chartered PLC (GBP, headquartered London)
  - Example: "HSBC Bank plc SA Branch" → global parent is HSBC Holdings plc (GBP, headquartered London)
- If STANDALONE DOMESTIC BANK → assess whether it operates internationally and offers CB services. Purely domestic or retail-only banks should be skipped.
  - Example for ZAR: Standard Bank Group Ltd, FirstRand Ltd, Absa Group Ltd, Nedbank Group Ltd are standalone South African HQ banks.

**Step 5 — CB evidence filter**
For each candidate global parent: search for public evidence of CB services. Skip institutions with Low or Unconfirmed CB probability unless they are clearly major internationally-active banks.

**Step 6 — Deduplicate against database**
For each qualifying institution: call find_banking_group_by_name. If found in the database already, skip and note "already exists".

**Step 7 — Add qualifying new providers (full hierarchy)**
For each new qualifying institution, create the full record chain:
a. BankingGroup (global parent name, headquarters_country, primary_currency = home currency of the GROUP not the currency being researched)
b. LegalEntity linked to the BankingGroup (entity_type = "Bank", is_headquarters = true for the primary HQ entity)
c. BIC linked to the LegalEntity (use the group's primary HQ BIC/SWIFT code)
d. CorrespondentService for the RESEARCHED currency (e.g. ZAR) linked to the BIC — even if the group's home currency is different. Set rtgs_system = SAMOS, rtgs_membership = true.
e. ALSO create a CorrespondentService for the group's HOME currency if one does not already exist.

**Step 8 — Summary**
Present a table: institutions added | institutions already in DB | institutions skipped (with reason).

### ADDING A SPECIFIC NAMED PROVIDER — USE THE QUALIFICATION FRAMEWORK
When the user names a specific bank to add or qualify, apply all 4 criteria (home currency, global HQ, RTGS membership, CB probability) before creating any records. Always confirm a BankingGroup does not already exist before adding a new one.

`,
      "entities-bics": `## ACTIVE WORKSPACE: Legal Entities & BICs
Your primary focus is legal entity and BIC management. Emphasise accuracy of entity_type, HQ confirmation, BIC code validation, and correct linking between LegalEntity and BankingGroup. Always check existing records before creating new ones.

`,
      "cb-services": `## ACTIVE WORKSPACE: CB Services
Your primary focus is CorrespondentService records — currency coverage, service types, clearing models, RTGS membership status, and nostro/vostro offerings. Help identify coverage gaps and suggest new services based on existing BIC and entity data. Always check if a service already exists before creating a duplicate.

`,
      "fmi": `## ACTIVE WORKSPACE: FMI Memberships
Your primary focus is Financial Market Infrastructure membership records. Help query, verify, and record FMI memberships for legal entities. Use check_fmi_membership before creating any record. Refer to the canonical FMI type list: Payment Systems, Instant Payment Systems, Securities Settlement Systems, Central Counterparties, FX Settlement Systems, Messaging Networks.

`,
      "general": "",
    };
    return preambles[topic] ?? "";
  })() : "";

  const qualificationSection = mode === "job"
    ? `
---
## PRE-QUALIFIED JOB MODE
This is an automated CB Setup job. The banking group has already been assessed and qualified. DO NOT run the 4-criterion qualification workflow. DO NOT perform broad research web searches. Only use web_search when a specific required field is genuinely unknown and absent from the job prompt (e.g. primary_currency shows "not set", rtgs_system is missing, or a BIC code needs external verification).

`
    : `
---
## CB PROVIDER QUALIFICATION FRAMEWORK
Whenever you are asked to add, research, or assess a Banking Group as a CB Provider, you MUST evaluate ALL FOUR criteria below using web_search BEFORE creating any database records.

**Before searching:** Check the KNOWN REFERENCE SOURCES section at the bottom of this prompt. If a relevant source is listed there, use that URL in your web_search query directly.

### Criterion 1 — Home Currency
Identify the primary/home currency of the Banking Group based on where its global headquarters is domiciled.
- Use ISO currency codes: EUR, USD, GBP, JPY, CHF, CAD, AUD, SGD, HKD, SEK, NOK, DKK, etc.
- Search: "[Bank Name] global headquarters country"
- Store result in: primary_currency

### Criterion 2 — Global Headquarters Verification
Confirm that the entity being added is the TOP-LEVEL holding company or parent group — NOT a subsidiary, branch, or regional entity.
- Search: "[Bank Name] parent company group structure holding entity"
- The entity_type for this LegalEntity should be "Bank"
- is_headquarters on the primary BIC should be true

### Criterion 3 — Local RTGS Membership
Confirm the Banking Group is a DIRECT PARTICIPANT in the RTGS of its home currency.
RTGS systems by currency:
  EUR → TARGET2 | GBP → CHAPS | USD → Fedwire | JPY → BOJ-NET | CHF → SIC | CAD → Lynx | AUD → RITS | SGD → MEPS+ | HKD → CHATS | SEK → RIX | NOK → NBO | DKK → KRONOS2 | PLN → SORBNET2 | CZK → CERTIS
  ZAR → SAMOS | BRL → STR | MXN → SPEI | INR → RTGS (RBI) | CNY → CNAPS/HVPS | KRW → BOK-Wire+ | THB → BAHTNET | MYR → RENTAS | IDR → BI-RTGS | TRY → TIC-RTGS | ILS → ZAHAV | NZD → ESAS
Always use canonical RTGS names: TARGET2 (not T2), BOJ-NET (not BOJNET), Fedwire (not FEDWIRE), MEPS+ (not MEPS), SAMOS (not SAMOS-I), CNAPS (not HVPS alone).
- Search: "[Bank Name] [RTGS name] direct participant member"
- Store: rtgs_system (name of RTGS), rtgs_member (true/false)

### Criterion 4 — Correspondent Banking Services (Probability)
Assess the probability this Banking Group actively offers CB services to other financial institutions.
Evidence to consider: public CB product pages, nostro/vostro account offerings, industry CB directories, G-SIB status, multi-currency clearing presence, mentions in CB provider databases.
- Rating: High | Medium | Low | Unconfirmed
  - High: CB product offering publicly confirmed, multi-currency, established CB bank
  - Medium: Likely CB provider based on size/profile but documentation limited
  - Low: Small or domestically-focused, limited CB evidence
  - Unconfirmed: Insufficient public information
- Store: cb_probability, cb_evidence (brief evidence summary with sources)

---
## STRUCTURED RESPONSE FORMAT
After completing the assessment, ALWAYS present results in this exact table format before listing actions taken:

\`\`\`
## CB Provider Assessment: [Bank Name]

| # | Criterion | Finding | Status |
|---|-----------|---------|--------|
| 1 | Home Currency | [Currency] — [country/reason] | ✅ or ⚠️ |
| 2 | Global HQ | [Legal entity name], [Country] — confirmed global parent | ✅ or ⚠️ |
| 3 | RTGS Membership | [RTGS system] — [Confirmed / Probable / Unconfirmed] | ✅ or ⚠️ |
| 4 | CB Services | [High/Medium/Low] — [key evidence, max 1 sentence] | ✅ or ⚠️ |

**Verdict: QUALIFIES / DOES NOT QUALIFY as CB Provider**

### Actions Taken
- ✅ Banking Group created: [Name] (ID: ...)
- ✅ Legal Entity: [Name], [Country]
- ✅ BIC: [BIC code] (HQ: true)
- ✅ Correspondent Service: [Currency] — [Service type]
\`\`\`

Use ✅ when criterion is confirmed, ⚠️ when probable or unconfirmed. If a bank DOES NOT QUALIFY, explain why and do NOT create records unless the user explicitly overrides.

---
## PERSISTING ASSESSMENT FINDINGS (MANDATORY)
Whenever you assess, review, or research a Banking Group — whether creating a new one or reviewing an existing one — you MUST persist your findings to the database on a best-effort basis, even if some fields remain uncertain.

After completing the 4-criterion assessment, ALWAYS call update_banking_group with whichever fields you have determined:
- primary_currency: set if you identified the home currency (e.g. "EUR")
- rtgs_system: set if you identified the RTGS (e.g. "TARGET2")
- rtgs_member: set to true if confirmed participant, false if unconfirmed
- cb_probability: set to "High", "Medium", "Low", or "Unconfirmed"
- cb_evidence: set to a brief one-sentence summary of your evidence
- headquarters_country: update if you found a more accurate country
- gsib_status: update to "G-SIB", "D-SIB", or "N/A" if you found evidence

Additionally, if you discover that a legal entity is a member of a Financial Market Infrastructure, create an FMI record using create_fmi. **IMPORTANT: Before calling create_fmi, you MUST first call list_legal_entities and confirm the entity exists in the database with a valid UUID. Never invent or guess a legal_entity_id. Only create FMI records for entities already stored in the database.** Use the correct fmi_type category and the specific fmi_name:
- Payment Systems → TARGET2, Fedwire, CHAPS, BOJ-NET, SIC, Lynx, RITS, MEPS+, CHATS, RIX
- Instant Payment Systems → Faster Payments, SEPA Instant, UPI, RTP, FedNow
- Securities Settlement Systems → Euroclear, Clearstream, DTC
- Central Securities Depositories → Euroclear Bank, Clearstream Banking Luxembourg
- Central Counterparties → LCH, CME Clearing, Eurex Clearing
- Trade Repositories → DTCC Repository, UnaVista
- FX Settlement Systems → CLS
- Messaging Networks → SWIFT

**Correspondent Service recording (MANDATORY when CB probability is High or Medium):**
After updating the banking group record, you MUST also ensure a CorrespondentService record exists for the home currency under the primary BIC of the main legal entity. Follow these steps exactly:
1. Call list_bics to find any BIC already linked to the legal entity.
2. If NO BIC exists yet, create one first using create_bic before proceeding. Use the institution's well-known primary BIC/SWIFT code. Set is_headquarters=true and swift_member=true.
3. Call list_correspondent_services to check whether a service already exists for that BIC + home currency combination.
4. If no such service exists, call create_correspondent_service with:
   - bic_id: the BIC's id (must be a valid UUID from list_bics)
   - bic_code: the BIC code string
   - group_name: the banking group name
   - legal_entity_name: the legal entity name
   - country: the headquarters country
   - currency: the home currency (e.g. "EUR")
   - service_type: "Correspondent Banking" if clearing_model is Onshore, "Global Currency Clearing" if clearing_model is Offshore
   - clearing_model: apply the ONSHORE vs OFFSHORE rule below — for the home currency this is typically "Onshore"
   - rtgs_membership: true if RTGS membership is confirmed, otherwise false
   - nostro_accounts_offered: true (default for CB providers)
   - vostro_accounts_offered: true (default for CB providers)
   - source: the web source URL you used for the assessment
5. If a service already exists for that BIC + currency, update it with any improved details instead of creating a duplicate.

Do NOT skip the database update step even if the user has not explicitly asked you to update — assessment findings MUST always be written back.

`;

  return `You are the CB Provider Intelligence Agent, an expert in correspondent banking with full database access and live web search capability.

${topicPreamble}---
## CORE DATA MODEL
Records are structured hierarchically: BankingGroup → LegalEntity → BIC → CorrespondentService.
When creating a new CB Provider, always follow this order: create BankingGroup first, then LegalEntity linked to it, then BIC linked to the entity, then CorrespondentServices linked to the BIC.

**Duplicate prevention (MANDATORY):** Before creating any BankingGroup, LegalEntity, or BIC record, you MUST first call the relevant list tool and check whether a record with the same name or BIC code already exists. If a match is found, use the existing record's ID rather than creating a new one. Only create a new record if no matching entry exists.
${qualificationSection}---
## ONSHORE vs OFFSHORE CLEARING MODEL RULE
Apply this rule every time you set clearing_model on any Correspondent Service record.

**Onshore** = the BIC entity is physically domiciled in the home country/region of the currency's primary domestic settlement infrastructure:
- EUR → any Eurozone member state (Germany, France, Italy, Belgium, Netherlands, Spain, Austria, Finland, Portugal, Ireland, Luxembourg, etc.)
- USD → United States
- GBP → United Kingdom
- JPY → Japan
- CHF → Switzerland
- CAD → Canada
- AUD → Australia
- SGD → Singapore
- HKD → Hong Kong
- SEK → Sweden | NOK → Norway | DKK → Denmark | NZD → New Zealand
- PLN → Poland | CZK → Czech Republic | HUF → Hungary | RON → Romania
- ZAR → South Africa | BRL → Brazil | MXN → Mexico | INR → India
- KRW → South Korea | ILS → Israel | TRY → Turkey

**Offshore** = the BIC entity is domiciled in any OTHER country — the bank is offering CB services in a currency whose domestic settlement infrastructure is abroad. This is the default for any multi-currency offering by an internationally-active bank.

**Concrete examples:**
- COBADEFF (Germany): EUR=Onshore, GBP=Offshore, DKK=Offshore, JPY=Offshore, USD=Offshore
- BARCGB2L (UK): GBP=Onshore, EUR=Offshore (UK is not Eurozone), USD=Offshore
- BNPAFRPP (France): EUR=Onshore, GBP=Offshore, USD=Offshore
- CHASUS33 (USA): USD=Onshore, EUR=Offshore, GBP=Offshore
- BOFAIE3X (Bank of America Europe DAC, Ireland): EUR=Onshore, USD=Offshore (entity is Irish-domiciled — even though BofA's group home currency is USD, this entity is NOT in the United States)
- BARCGB22 (Barclays Bank PLC, UK) offering EUR: EUR=Offshore (Barclays UK is not a Eurozone entity — EUR is only Onshore for entities domiciled in a Eurozone country)

**NEVER default all currencies to "Onshore".** Only the currency whose home settlement country matches the entity's country of domicile is Onshore. Everything else is Offshore.

**CRITICAL ANTI-PATTERN — Do NOT do this:** Setting a service to Onshore because the currency matches the banking group's home currency. The group's home currency is irrelevant. What matters is the specific entity's country. A US bank's UK subsidiary offering USD clearing is Offshore — the entity is UK-domiciled, not US-domiciled. Always look at the entity's country field, not the group's primary_currency.

**service_type MUST follow clearing_model — this is mandatory:**
- clearing_model = "Onshore" → service_type = "Correspondent Banking"
- clearing_model = "Offshore" → service_type = "Global Currency Clearing"

---
## DATABASE-FIRST LOOKUP RULE (APPLIES TO ALL QUERIES)
When a user asks "which banks offer X?", "who provides X?", "do we have any X?", "show me all banks that...", or any similar discovery question — you MUST query the database first before doing any web search. Use the appropriate list tool (list_correspondent_services, list_banking_groups, list_legal_entities, list_fmis, etc.) and report the database results to the user. Only go to the web if the user explicitly asks you to find new providers or if the database returns nothing and the user wants to expand coverage.

---
## OTHER AGENT CAPABILITIES
- LIST / UPDATE / DELETE any entity (always list first to find the correct ID before updating or deleting)
- MERGE DUPLICATES (MANDATORY): When asked to merge, consolidate, or deduplicate records, you MUST use the dedicated merge tools — never manually update children then call delete. Use merge_legal_entities(keep_id, delete_id) to merge two Legal Entities (re-links all BICs and FMI memberships atomically). Use merge_banking_groups(keep_id, delete_id) to merge two Banking Groups (re-links all Legal Entities and CLS profiles atomically). Using delete_legal_entity or delete_banking_group directly on a record that has children will orphan those children.
- SEARCH the web for current market data, news, SWIFT information, regulatory changes
- DATA SOURCES: Whenever a web_search returns a result that cites a specific authoritative source, automatically save it using create_data_source — even if the user did not ask you to. Do NOT save a source already in the KNOWN REFERENCE SOURCES list.

Always confirm actions taken. Cite web sources. Be concise but thorough on assessments.

---
## HANDLING USER CONFIRMATIONS
When you have proposed an action and the user responds with a short confirmation, you MUST immediately execute the action using the appropriate tool call(s). Skip straight to the tool call. The first thing you do after receiving a confirmation is call the tool, then report what you did.${knownSourcesSection}`;
}

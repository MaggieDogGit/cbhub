import OpenAI from "openai";
import { storage } from "./storage";
import type { DataSource } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type StepCallback = (toolName: string, args: any, statusText: string) => void | Promise<void>;

// ── Retry helpers ─────────────────────────────────────────────────────────────

function parseRetryAfterMs(errMsg: string): number {
  // Parses "Please try again in 6.824s" or "Please try again in 656ms"
  const secMatch = errMsg.match(/try again in ([\d.]+)s/i);
  if (secMatch) return Math.ceil(parseFloat(secMatch[1]) * 1000) + 2000; // +2s buffer
  const msMatch = errMsg.match(/try again in (\d+)ms/i);
  if (msMatch) return parseInt(msMatch[1]) + 2000;
  return 30_000; // fallback: 30s
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, label = "OpenAI call"): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 = err?.status === 429 || err?.message?.includes("429");
      if (!is429 || attempt === maxRetries) throw err;
      const waitMs = parseRetryAfterMs(err.message || "");
      console.log(`[Retry] ${label}: 429 rate limit — waiting ${(waitMs / 1000).toFixed(1)}s before retry ${attempt + 1}/${maxRetries}`);
      await sleep(waitMs);
    }
  }
  throw new Error(`${label}: exceeded max retries`);
}

// ── Status text ───────────────────────────────────────────────────────────────

export function getStatusText(name: string, args: any): string {
  const q = (s: string) => (s || "").length > 55 ? (s || "").slice(0, 55) + "…" : (s || "");
  switch (name) {
    case "list_banking_groups":         return "Reviewing banking groups in database…";
    case "create_banking_group":        return `Creating banking group: ${q(args.group_name)}`;
    case "update_banking_group":        return "Updating banking group record…";
    case "delete_banking_group":        return "Removing banking group record…";
    case "list_legal_entities":         return "Reviewing legal entities…";
    case "create_legal_entity":         return `Creating legal entity: ${q(args.legal_name)}`;
    case "update_legal_entity":         return "Updating legal entity record…";
    case "delete_legal_entity":         return "Removing legal entity record…";
    case "merge_legal_entities":        return "Merging legal entities — re-linking BICs and FMI memberships…";
    case "merge_banking_groups":        return "Merging banking groups — re-linking all legal entities…";
    case "list_bics":                   return "Reviewing BIC codes…";
    case "create_bic":                  return `Adding BIC: ${q(args.bic_code)}`;
    case "update_bic":                  return "Updating BIC record…";
    case "delete_bic":                  return "Removing BIC record…";
    case "list_correspondent_services": return "Reviewing correspondent services…";
    case "create_correspondent_service":return `Adding service: ${q(args.currency)} ${q(args.service_type)}`;
    case "update_correspondent_service":return "Updating correspondent service…";
    case "delete_correspondent_service":return "Removing correspondent service…";
    case "list_fmis":                   return "Checking FMI memberships…";
    case "create_fmi":                  return `Adding FMI membership: ${q(args.fmi_type || args.fmi_name)}`;
    case "delete_fmi":                  return "Removing FMI membership…";
    case "web_search":                  return `Searching: ${q(args.query)}`;
    case "list_data_sources":           return "Checking data sources library…";
    case "create_data_source":          return `Saving data source: ${q(args.name)}`;
    case "update_data_source":          return "Updating data source…";
    case "delete_data_source":          return "Removing data source…";
    default:                            return `Running: ${name}…`;
  }
}

// ── Tool executor ─────────────────────────────────────────────────────────────

export async function executeTool(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "find_banking_group_by_name": {
        const needle = (args.name_contains || "").toLowerCase();
        const all = await storage.listBankingGroups();
        const matches = all.filter(g => g.group_name.toLowerCase().includes(needle));
        return JSON.stringify(matches.length ? matches.slice(0, 5) : { not_found: true, message: `No banking group found containing "${args.name_contains}"` });
      }
      case "find_legal_entity_by_name": {
        const needle = (args.name_contains || "").toLowerCase();
        const all = await storage.listLegalEntities();
        const matches = all.filter(e => e.legal_name.toLowerCase().includes(needle));
        return JSON.stringify(matches.length ? matches.slice(0, 5) : { not_found: true, message: `No legal entity found containing "${args.name_contains}"` });
      }
      case "check_fmi_membership": {
        const all = await storage.listFmis();
        const match = all.find(f => f.legal_entity_id === args.legal_entity_id && f.fmi_name === args.fmi_name);
        return JSON.stringify(match ? { exists: true, id: match.id } : { exists: false });
      }
      case "list_banking_groups": return JSON.stringify(await storage.listBankingGroups());
      case "create_banking_group": {
        const existing = await storage.listBankingGroups();
        const duplicate = existing.find(g => g.group_name.toLowerCase() === (args.group_name || "").toLowerCase());
        if (duplicate) return JSON.stringify({ duplicate: true, existing_id: duplicate.id, message: `Banking group "${duplicate.group_name}" already exists (id=${duplicate.id}). Use update_banking_group instead.` });
        return JSON.stringify(await storage.createBankingGroup(args));
      }
      case "update_banking_group": { const { id, ...data } = args; return JSON.stringify(await storage.updateBankingGroup(id, data)); }
      case "delete_banking_group": await storage.deleteBankingGroup(args.id); return JSON.stringify({ ok: true, id: args.id });
      case "list_legal_entities": return JSON.stringify(await storage.listLegalEntities());
      case "create_legal_entity": {
        const allGroups = await storage.listBankingGroups();
        const groupExists = allGroups.find(g => g.id === args.group_id);
        if (!groupExists) return JSON.stringify({ error: `Invalid group_id "${args.group_id}". Call list_banking_groups first to find the correct UUID.` });
        const existing = await storage.listLegalEntities();
        const duplicate = existing.find(e => e.legal_name.toLowerCase() === (args.legal_name || "").toLowerCase() && e.group_id === args.group_id);
        if (duplicate) return JSON.stringify({ duplicate: true, existing_id: duplicate.id, message: `Legal entity "${duplicate.legal_name}" already exists under this banking group (id=${duplicate.id}). Use update_legal_entity instead.` });
        return JSON.stringify(await storage.createLegalEntity(args));
      }
      case "update_legal_entity": { const { id, ...data } = args; return JSON.stringify(await storage.updateLegalEntity(id, data)); }
      case "delete_legal_entity": await storage.deleteLegalEntity(args.id); return JSON.stringify({ ok: true, id: args.id });
      case "merge_legal_entities": return JSON.stringify(await storage.mergeLegalEntities(args.keep_id, args.delete_id));
      case "merge_banking_groups": return JSON.stringify(await storage.mergeBankingGroups(args.keep_id, args.delete_id));
      case "list_bics": return JSON.stringify(await storage.listBics());
      case "create_bic": {
        const allEntities = await storage.listLegalEntities();
        const entityExists = allEntities.find(e => e.id === args.legal_entity_id);
        if (!entityExists) return JSON.stringify({ error: `Invalid legal_entity_id "${args.legal_entity_id}". Call list_legal_entities first to find the correct UUID.` });
        const existing = await storage.listBics();
        const duplicate = existing.find(b => b.bic_code.toLowerCase() === (args.bic_code || "").toLowerCase());
        if (duplicate) return JSON.stringify({ duplicate: true, existing_id: duplicate.id, message: `BIC "${duplicate.bic_code}" already exists (id=${duplicate.id}). Use update_bic instead.` });
        return JSON.stringify(await storage.createBic(args));
      }
      case "update_bic": { const { id, ...data } = args; return JSON.stringify(await storage.updateBic(id, data)); }
      case "delete_bic": await storage.deleteBic(args.id); return JSON.stringify({ ok: true, id: args.id });
      case "list_correspondent_services": return JSON.stringify(await storage.listCorrespondentServices(args.currency));
      case "create_correspondent_service": {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!args.bic_id || !uuidPattern.test(args.bic_id)) return JSON.stringify({ error: `bic_id must be a valid BIC record UUID — call list_bics first. Received: "${args.bic_id}"` });
        const allBics = await storage.listBics();
        const bicExists = allBics.find(b => b.id === args.bic_id);
        if (!bicExists) return JSON.stringify({ error: `bic_id "${args.bic_id}" does not match any BIC in the database. Call list_bics to find the correct UUID.` });
        const existing = await storage.listCorrespondentServices();
        const duplicate = existing.find(s => s.bic_id === args.bic_id && s.currency === args.currency);
        if (duplicate) return JSON.stringify({ duplicate: true, existing_id: duplicate.id, message: `A correspondent service for currency "${args.currency}" already exists on BIC ${args.bic_id} (id=${duplicate.id}). Use update_correspondent_service instead.` });
        return JSON.stringify(await storage.createCorrespondentService(args));
      }
      case "update_correspondent_service": { const { id, ...data } = args; return JSON.stringify(await storage.updateCorrespondentService(id, data)); }
      case "delete_correspondent_service": await storage.deleteCorrespondentService(args.id); return JSON.stringify({ ok: true, id: args.id });
      case "list_fmis": return JSON.stringify(await storage.listFmis());
      case "create_fmi": {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!args.legal_entity_id || !uuidPattern.test(args.legal_entity_id))
          return JSON.stringify({ error: `legal_entity_id must be a valid UUID — call list_legal_entities first to find the correct ID. Received: "${args.legal_entity_id}"` });
        const allFmiEntities = await storage.listLegalEntities();
        const fmiEntity = allFmiEntities.find(e => e.id === args.legal_entity_id);
        if (!fmiEntity) return JSON.stringify({ error: `legal_entity_id "${args.legal_entity_id}" does not match any legal entity in the database. Call list_legal_entities first.` });
        args.legal_entity_name = fmiEntity.legal_name;
        const existingFmis = await storage.listFmis();
        const fmiDuplicate = existingFmis.find(f => f.legal_entity_id === args.legal_entity_id && f.fmi_name === args.fmi_name);
        if (fmiDuplicate) return JSON.stringify({ duplicate: true, existing_id: fmiDuplicate.id, message: `FMI membership "${args.fmi_name}" already exists for this entity (id=${fmiDuplicate.id}). No action needed.` });
        return JSON.stringify(await storage.createFmi(args));
      }
      case "delete_fmi": await storage.deleteFmi(args.id); return JSON.stringify({ ok: true, id: args.id });
      case "web_search": {
        const searchResponse = await withRetry(() => openai.chat.completions.create({
          model: "gpt-4o-search-preview",
          messages: [{ role: "user", content: args.query }],
        } as any), 5, `web_search: ${args.query}`);
        return searchResponse.choices[0].message.content || "No search results found.";
      }
      case "list_data_sources": return JSON.stringify(await storage.listDataSources());
      case "create_data_source": return JSON.stringify(await storage.createDataSource(args));
      case "update_data_source": { const { id, ...data } = args; return JSON.stringify(await storage.updateDataSource(id, data)); }
      case "delete_data_source": await storage.deleteDataSource(args.id); return JSON.stringify({ ok: true, id: args.id });
      default: return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

export function buildSystemPrompt(storedSources: DataSource[], topic?: string): string {
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

  return `You are the CB Provider Intelligence Agent, an expert in correspondent banking with full database access and live web search capability.

${topicPreamble}---
## CORE DATA MODEL
Records are structured hierarchically: BankingGroup → LegalEntity → BIC → CorrespondentService.
When creating a new CB Provider, always follow this order: create BankingGroup first, then LegalEntity linked to it, then BIC linked to the entity, then CorrespondentServices linked to the BIC.

**Duplicate prevention (MANDATORY):** Before creating any BankingGroup, LegalEntity, or BIC record, you MUST first call the relevant list tool and check whether a record with the same name or BIC code already exists. If a match is found, use the existing record's ID rather than creating a new one. Only create a new record if no matching entry exists.

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
   - service_type: "Correspondent Banking"
   - clearing_model: apply the ONSHORE vs OFFSHORE rule below — for the home currency this is typically "Onshore"
   - rtgs_membership: true if RTGS membership is confirmed, otherwise false
   - nostro_accounts_offered: true (default for CB providers)
   - vostro_accounts_offered: true (default for CB providers)
   - source: the web source URL you used for the assessment
5. If a service already exists for that BIC + currency, update it with any improved details instead of creating a duplicate.

Do NOT skip the database update step even if the user has not explicitly asked you to update — assessment findings MUST always be written back.

---
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

**NEVER default all currencies to "Onshore".** Only the currency whose home settlement country matches the entity's country of domicile is Onshore. Everything else is Offshore.

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

// ── Tool definitions ──────────────────────────────────────────────────────────

export function getTools(): any[] {
  return [
    { type: "function", function: { name: "find_banking_group_by_name", description: "Search for a banking group by partial name match. Returns up to 5 matches. Use this instead of list_banking_groups when looking for a specific institution.", parameters: { type: "object", required: ["name_contains"], properties: { name_contains: { type: "string", description: "Partial name to search for, e.g. 'Goldman' or 'JPMorgan'" } } } } },
    { type: "function", function: { name: "find_legal_entity_by_name", description: "Search for a legal entity by partial name match. Returns up to 5 matches. Use this instead of list_legal_entities when looking for a specific entity.", parameters: { type: "object", required: ["name_contains"], properties: { name_contains: { type: "string", description: "Partial name to search for, e.g. 'Goldman Sachs' or 'Barclays'" } } } } },
    { type: "function", function: { name: "check_fmi_membership", description: "Check whether a specific FMI membership record already exists for a given legal entity and FMI. Returns {exists: true/false}.", parameters: { type: "object", required: ["legal_entity_id", "fmi_name"], properties: { legal_entity_id: { type: "string" }, fmi_name: { type: "string" } } } } },
    { type: "function", function: { name: "list_banking_groups", description: "List all banking groups in the database", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_banking_group", description: "Create a new banking group after completing the 4-criterion CB Provider assessment", parameters: { type: "object", required: ["group_name"], properties: { group_name: { type: "string" }, headquarters_country: { type: "string" }, primary_currency: { type: "string" }, rtgs_system: { type: "string" }, rtgs_member: { type: "boolean" }, cb_probability: { type: "string", enum: ["High", "Medium", "Low", "Unconfirmed"] }, cb_evidence: { type: "string" }, gsib_status: { type: "string", enum: ["G-SIB", "D-SIB", "N/A"] }, website: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "update_banking_group", description: "Update an existing banking group by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, group_name: { type: "string" }, headquarters_country: { type: "string" }, primary_currency: { type: "string" }, rtgs_system: { type: "string" }, rtgs_member: { type: "boolean" }, cb_probability: { type: "string", enum: ["High", "Medium", "Low", "Unconfirmed"] }, cb_evidence: { type: "string" }, gsib_status: { type: "string", enum: ["G-SIB", "D-SIB", "N/A"] }, website: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_banking_group", description: "Delete a banking group by ID. WARNING: Only use this for a group with no child entities. To merge two groups, use merge_banking_groups instead.", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "merge_banking_groups", description: "Safely merge two banking groups: re-links ALL legal entities and CLS profiles from the duplicate to the keeper, then deletes the duplicate. ALWAYS use this when consolidating duplicate Banking Groups — never manually update children and call delete_banking_group.", parameters: { type: "object", required: ["keep_id", "delete_id"], properties: { keep_id: { type: "string", description: "ID of the Banking Group to keep" }, delete_id: { type: "string", description: "ID of the duplicate Banking Group to delete" } } } } },
    { type: "function", function: { name: "list_legal_entities", description: "List all legal entities in the database", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_legal_entity", description: "Create a new legal entity linked to a banking group", parameters: { type: "object", required: ["group_id", "legal_name"], properties: { group_id: { type: "string" }, group_name: { type: "string" }, legal_name: { type: "string" }, country: { type: "string" }, entity_type: { type: "string", enum: ["Bank", "Branch", "Subsidiary", "Representative Office", "Other"] }, regulator: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "update_legal_entity", description: "Update an existing legal entity by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, legal_name: { type: "string" }, country: { type: "string" }, entity_type: { type: "string" }, regulator: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_legal_entity", description: "Delete a legal entity by ID. WARNING: Only use this for an entity with no BICs or FMI memberships. To merge two entities, use merge_legal_entities instead.", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "merge_legal_entities", description: "Safely merge two legal entities: re-links ALL BICs and FMI memberships from the duplicate to the keeper, then deletes the duplicate. ALWAYS use this when consolidating duplicate Legal Entities — never manually update children and call delete_legal_entity.", parameters: { type: "object", required: ["keep_id", "delete_id"], properties: { keep_id: { type: "string", description: "ID of the Legal Entity to keep" }, delete_id: { type: "string", description: "ID of the duplicate Legal Entity to delete" } } } } },
    { type: "function", function: { name: "list_bics", description: "List all BICs in the database", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_bic", description: "Create a new BIC linked to a legal entity", parameters: { type: "object", required: ["legal_entity_id", "bic_code"], properties: { legal_entity_id: { type: "string" }, legal_entity_name: { type: "string" }, bic_code: { type: "string" }, country: { type: "string" }, city: { type: "string" }, is_headquarters: { type: "boolean" }, swift_member: { type: "boolean" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "update_bic", description: "Update an existing BIC by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, bic_code: { type: "string" }, country: { type: "string" }, city: { type: "string" }, is_headquarters: { type: "boolean" }, swift_member: { type: "boolean" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_bic", description: "Delete a BIC by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "list_correspondent_services", description: "List all correspondent services, optionally filtered by currency", parameters: { type: "object", properties: { currency: { type: "string" } } } } },
    { type: "function", function: { name: "create_correspondent_service", description: "Create a new correspondent service linked to a BIC", parameters: { type: "object", required: ["bic_id", "currency", "service_type"], properties: { bic_id: { type: "string" }, bic_code: { type: "string" }, group_name: { type: "string" }, legal_entity_name: { type: "string" }, country: { type: "string" }, currency: { type: "string" }, service_type: { type: "string" }, clearing_model: { type: "string", enum: ["Onshore", "Offshore"] }, rtgs_membership: { type: "boolean" }, instant_scheme_access: { type: "boolean" }, nostro_accounts_offered: { type: "boolean" }, vostro_accounts_offered: { type: "boolean" }, cls_member: { type: "boolean" }, target_clients: { type: "string" }, notes: { type: "string" }, source: { type: "string" } } } } },
    { type: "function", function: { name: "update_correspondent_service", description: "Update an existing correspondent service by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, currency: { type: "string" }, service_type: { type: "string" }, clearing_model: { type: "string" }, rtgs_membership: { type: "boolean" }, instant_scheme_access: { type: "boolean" }, nostro_accounts_offered: { type: "boolean" }, vostro_accounts_offered: { type: "boolean" }, cls_member: { type: "boolean" }, target_clients: { type: "string" }, notes: { type: "string" }, source: { type: "string" } } } } },
    { type: "function", function: { name: "delete_correspondent_service", description: "Delete a correspondent service by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "list_fmis", description: "List all FMI memberships", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_fmi", description: "Create a new FMI membership record. IMPORTANT: legal_entity_id must be a real UUID from list_legal_entities — call list_legal_entities first to confirm the entity exists before calling this tool.", parameters: { type: "object", required: ["legal_entity_id", "fmi_type", "fmi_name"], properties: { legal_entity_id: { type: "string" }, legal_entity_name: { type: "string" }, fmi_type: { type: "string", enum: ["Payment Systems","Instant Payment Systems","Securities Settlement Systems","Central Securities Depositories","Central Counterparties","Trade Repositories","FX Settlement Systems","Messaging Networks"] }, fmi_name: { type: "string" }, member_since: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_fmi", description: "Delete an FMI membership record by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "web_search", description: "Search the web for current information about banks, correspondent banking services, SWIFT codes, regulatory news, or any real-time financial data", parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } } } },
    { type: "function", function: { name: "list_data_sources", description: "List all stored data sources", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_data_source", description: "Store a new data source reference", parameters: { type: "object", required: ["name", "category"], properties: { name: { type: "string" }, category: { type: "string" }, url: { type: "string" }, publisher: { type: "string" }, description: { type: "string" }, update_frequency: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "update_data_source", description: "Update an existing data source", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, category: { type: "string" }, url: { type: "string" }, publisher: { type: "string" }, description: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_data_source", description: "Delete a data source by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
  ];
}

// ── Agent loop ────────────────────────────────────────────────────────────────

export async function runAgentLoop(
  openaiMessages: any[],
  onStep?: StepCallback,
  maxIterations = 12,
  firstIterToolChoice: "auto" | "required" | "none" = "auto"
): Promise<string> {
  const messages = [...openaiMessages];
  const tools = getTools();

  for (let i = 0; i < maxIterations; i++) {
    const toolChoice = i === 0 ? firstIterToolChoice : "auto";

    const response = await withRetry(
      () => openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools,
        tool_choice: toolChoice,
      }),
      5,
      `runAgentLoop iteration ${i + 1}`
    );

    const choice = response.choices[0];
    const msg = choice.message;
    messages.push(msg);

    if (choice.finish_reason === "stop" || !msg.tool_calls?.length) {
      return msg.content || "";
    }

    // Parse all tool calls upfront
    const parsedCalls = msg.tool_calls.map(tc => ({
      tc,
      args: JSON.parse(tc.function.arguments || "{}"),
    }));

    // Fire all step callbacks first (progress reporting)
    if (onStep) {
      for (const { tc, args } of parsedCalls) {
        await onStep(tc.function.name, args, getStatusText(tc.function.name, args));
      }
    }

    // Execute all tools in parallel — safe because the model only batches
    // independent calls (it never puts dependent operations in the same response)
    const toolResults = await Promise.all(
      parsedCalls.map(({ tc, args }) =>
        executeTool(tc.function.name, args).then(result => ({ tc, result }))
      )
    );

    for (const { tc, result } of toolResults) {
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return "Agent reached maximum iterations without completing.";
}

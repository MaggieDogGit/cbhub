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

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, label = "OpenAI call"): Promise<T> {
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
      case "create_fmi": return JSON.stringify(await storage.createFmi(args));
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

export function buildSystemPrompt(storedSources: DataSource[]): string {
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

  return `You are the CB Provider Intelligence Agent, an expert in correspondent banking with full database access and live web search capability.

---
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
Always use canonical RTGS names: TARGET2 (not T2), BOJ-NET (not BOJNET), Fedwire (not FEDWIRE), MEPS+ (not MEPS).
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

Additionally, if you discover that a legal entity is a member of a Financial Market Infrastructure, create an FMI record using create_fmi. Use the correct fmi_type category and the specific fmi_name:
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
   - clearing_model: "Onshore"
   - rtgs_membership: true if RTGS membership is confirmed, otherwise false
   - nostro_accounts_offered: true (default for CB providers)
   - vostro_accounts_offered: true (default for CB providers)
   - source: the web source URL you used for the assessment
5. If a service already exists for that BIC + currency, update it with any improved details instead of creating a duplicate.

Do NOT skip the database update step even if the user has not explicitly asked you to update — assessment findings MUST always be written back.

---
## OTHER AGENT CAPABILITIES
- LIST / UPDATE / DELETE any entity (always list first to find the correct ID before updating or deleting)
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
    { type: "function", function: { name: "list_banking_groups", description: "List all banking groups in the database", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_banking_group", description: "Create a new banking group after completing the 4-criterion CB Provider assessment", parameters: { type: "object", required: ["group_name"], properties: { group_name: { type: "string" }, headquarters_country: { type: "string" }, primary_currency: { type: "string" }, rtgs_system: { type: "string" }, rtgs_member: { type: "boolean" }, cb_probability: { type: "string", enum: ["High", "Medium", "Low", "Unconfirmed"] }, cb_evidence: { type: "string" }, gsib_status: { type: "string", enum: ["G-SIB", "D-SIB", "N/A"] }, website: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "update_banking_group", description: "Update an existing banking group by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, group_name: { type: "string" }, headquarters_country: { type: "string" }, primary_currency: { type: "string" }, rtgs_system: { type: "string" }, rtgs_member: { type: "boolean" }, cb_probability: { type: "string", enum: ["High", "Medium", "Low", "Unconfirmed"] }, cb_evidence: { type: "string" }, gsib_status: { type: "string", enum: ["G-SIB", "D-SIB", "N/A"] }, website: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_banking_group", description: "Delete a banking group by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "list_legal_entities", description: "List all legal entities in the database", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_legal_entity", description: "Create a new legal entity linked to a banking group", parameters: { type: "object", required: ["group_id", "legal_name"], properties: { group_id: { type: "string" }, group_name: { type: "string" }, legal_name: { type: "string" }, country: { type: "string" }, entity_type: { type: "string", enum: ["Bank", "Branch", "Subsidiary", "Representative Office", "Other"] }, regulator: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "update_legal_entity", description: "Update an existing legal entity by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, legal_name: { type: "string" }, country: { type: "string" }, entity_type: { type: "string" }, regulator: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_legal_entity", description: "Delete a legal entity by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "list_bics", description: "List all BICs in the database", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_bic", description: "Create a new BIC linked to a legal entity", parameters: { type: "object", required: ["legal_entity_id", "bic_code"], properties: { legal_entity_id: { type: "string" }, legal_entity_name: { type: "string" }, bic_code: { type: "string" }, country: { type: "string" }, city: { type: "string" }, is_headquarters: { type: "boolean" }, swift_member: { type: "boolean" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "update_bic", description: "Update an existing BIC by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, bic_code: { type: "string" }, country: { type: "string" }, city: { type: "string" }, is_headquarters: { type: "boolean" }, swift_member: { type: "boolean" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_bic", description: "Delete a BIC by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "list_correspondent_services", description: "List all correspondent services, optionally filtered by currency", parameters: { type: "object", properties: { currency: { type: "string" } } } } },
    { type: "function", function: { name: "create_correspondent_service", description: "Create a new correspondent service linked to a BIC", parameters: { type: "object", required: ["bic_id", "currency", "service_type"], properties: { bic_id: { type: "string" }, bic_code: { type: "string" }, group_name: { type: "string" }, legal_entity_name: { type: "string" }, country: { type: "string" }, currency: { type: "string" }, service_type: { type: "string" }, clearing_model: { type: "string", enum: ["Onshore", "Offshore"] }, rtgs_membership: { type: "boolean" }, instant_scheme_access: { type: "boolean" }, nostro_accounts_offered: { type: "boolean" }, vostro_accounts_offered: { type: "boolean" }, cls_member: { type: "boolean" }, target_clients: { type: "string" }, notes: { type: "string" }, source: { type: "string" } } } } },
    { type: "function", function: { name: "update_correspondent_service", description: "Update an existing correspondent service by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, currency: { type: "string" }, service_type: { type: "string" }, clearing_model: { type: "string" }, rtgs_membership: { type: "boolean" }, instant_scheme_access: { type: "boolean" }, nostro_accounts_offered: { type: "boolean" }, vostro_accounts_offered: { type: "boolean" }, cls_member: { type: "boolean" }, target_clients: { type: "string" }, notes: { type: "string" }, source: { type: "string" } } } } },
    { type: "function", function: { name: "delete_correspondent_service", description: "Delete a correspondent service by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "list_fmis", description: "List all FMI memberships", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_fmi", description: "Create a new FMI membership record for a legal entity", parameters: { type: "object", required: ["legal_entity_id", "fmi_type", "fmi_name"], properties: { legal_entity_id: { type: "string" }, legal_entity_name: { type: "string" }, fmi_type: { type: "string", enum: ["Payment Systems","Instant Payment Systems","Securities Settlement Systems","Central Securities Depositories","Central Counterparties","Trade Repositories","FX Settlement Systems","Messaging Networks"] }, fmi_name: { type: "string" }, member_since: { type: "string" }, notes: { type: "string" } } } } },
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

    for (const tc of msg.tool_calls) {
      const args = JSON.parse(tc.function.arguments || "{}");
      const statusText = getStatusText(tc.function.name, args);
      if (onStep) await onStep(tc.function.name, args, statusText);
      const result = await executeTool(tc.function.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return "Agent reached maximum iterations without completing.";
}

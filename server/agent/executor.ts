// Absorbed from server/agentCore.ts: executeTool, runAgentLoop, getStatusText

import OpenAI from "openai";
import { storage } from "../storage";
import { withRetry } from "./retry";
import { getTools, leanGroup, leanEntity, leanBic, leanService, leanFmi, leanFmiEntry, leanIntel } from "./tools";
import { isValidUUID } from "./validators";
import type { StepCallback } from "./validators";

export const AGENT_MODEL = "gpt-4.1";
export const AGENT_MODEL_LIGHT = "gpt-4.1-mini";
export const AGENT_MODEL_DEEP = "gpt-5";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    case "find_bics_by_entity":         return "Looking up BICs for entity…";
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
    case "find_fmi_entries":            return `Searching FMI catalogue: ${q(args.name_contains || args.category_code || args.domain_code || "")}`;
    case "create_fmi_entry":            return `Adding FMI catalogue entry: ${q(args.name || args.code)}`;
    case "update_fmi_entry":            return "Updating FMI catalogue entry…";
    case "get_fmi_specification":       return "Fetching FMI specification…";
    case "update_fmi_specification":    return "Updating FMI specification…";
    case "list_fmi_categories":         return "Listing FMI taxonomy categories…";
    case "find_cb_taxonomy_items":      return `Searching CB taxonomy: ${q(args.category || args.name || "")}`;
    case "update_cb_capability_value":  return "Updating CB capability score…";
    case "list_intel_observations":     return "Reviewing intel observations…";
    case "create_intel_observation":    return `Adding intel: ${q(args.title)}`;
    case "find_country":                return `Looking up country: ${q(args.name_or_code)}`;
    case "find_currency":               return `Looking up currency: ${q(args.code)}`;
    case "web_search":                  return `Searching: ${q(args.query)}`;
    case "validate_cb_structure":       return `Validating CB structure for ${q(args.bank_name || "group")}`;
    case "list_data_sources":           return "Checking data sources library…";
    case "create_data_source":          return `Saving data source: ${q(args.name)}`;
    case "update_data_source":          return "Updating data source…";
    case "delete_data_source":          return "Removing data source…";
    default:                            return `Running: ${name}…`;
  }
}

export async function executeTool(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "find_banking_group_by_name": {
        const needle = (args.name_contains || "").toLowerCase();
        const all = await storage.listBankingGroups();
        const matches = all.filter(g => g.group_name.toLowerCase().includes(needle));
        return JSON.stringify(matches.length ? matches.slice(0, 5).map(leanGroup) : { not_found: true, message: `No banking group found containing "${args.name_contains}"` });
      }
      case "find_legal_entity_by_name": {
        const needle = (args.name_contains || "").toLowerCase();
        const all = await storage.listLegalEntities();
        const matches = all.filter(e => e.legal_name.toLowerCase().includes(needle));
        return JSON.stringify(matches.length ? matches.slice(0, 5).map(leanEntity) : { not_found: true, message: `No legal entity found containing "${args.name_contains}"` });
      }
      case "check_fmi_membership": {
        const all = await storage.listFmis();
        const match = all.find(f => f.legal_entity_id === args.legal_entity_id && f.fmi_name === args.fmi_name);
        return JSON.stringify(match ? { exists: true, id: match.id } : { exists: false });
      }
      case "list_banking_groups": return JSON.stringify((await storage.listBankingGroups()).map(leanGroup));
      case "create_banking_group": {
        const existing = await storage.listBankingGroups();
        const duplicate = existing.find(g => g.group_name.toLowerCase() === (args.group_name || "").toLowerCase());
        if (duplicate) return JSON.stringify({ duplicate: true, existing_id: duplicate.id, message: `Banking group "${duplicate.group_name}" already exists (id=${duplicate.id}). Use update_banking_group instead.` });
        const created = await storage.createBankingGroup(args);
        return JSON.stringify({ ok: true, id: created.id, group_name: created.group_name });
      }
      case "update_banking_group": { const { id, ...data } = args; const updated = await storage.updateBankingGroup(id, data); return JSON.stringify({ ok: true, id: updated.id }); }
      case "delete_banking_group": await storage.deleteBankingGroup(args.id); return JSON.stringify({ ok: true, id: args.id });
      case "list_legal_entities": return JSON.stringify((await storage.listLegalEntities()).map(leanEntity));
      case "create_legal_entity": {
        const allGroups = await storage.listBankingGroups();
        const groupExists = allGroups.find(g => g.id === args.group_id);
        if (!groupExists) return JSON.stringify({ error: `Invalid group_id "${args.group_id}". Call list_banking_groups first to find the correct UUID.` });
        const existing = await storage.listLegalEntities();
        const duplicate = existing.find(e => e.legal_name.toLowerCase() === (args.legal_name || "").toLowerCase() && e.group_id === args.group_id);
        if (duplicate) return JSON.stringify({ duplicate: true, existing_id: duplicate.id, message: `Legal entity "${duplicate.legal_name}" already exists under this banking group (id=${duplicate.id}). Use update_legal_entity instead.` });
        const created = await storage.createLegalEntity(args);
        return JSON.stringify({ ok: true, id: created.id, legal_name: created.legal_name, group_id: created.group_id });
      }
      case "update_legal_entity": { const { id, ...data } = args; const updated = await storage.updateLegalEntity(id, data); return JSON.stringify({ ok: true, id: updated.id }); }
      case "delete_legal_entity": await storage.deleteLegalEntity(args.id); return JSON.stringify({ ok: true, id: args.id });
      case "merge_legal_entities": return JSON.stringify(await storage.mergeLegalEntities(args.keep_id, args.delete_id));
      case "merge_banking_groups": return JSON.stringify(await storage.mergeBankingGroups(args.keep_id, args.delete_id));
      case "list_bics": {
        const allBics = await storage.listBics();
        const capped = allBics.slice(0, 50).map(leanBic);
        if (allBics.length > 50) {
          return JSON.stringify({ results: capped, truncated: true, total: allBics.length, message: `Showing 50 of ${allBics.length} BICs. Use find_bics_by_entity(legal_entity_id) for targeted lookups.` });
        }
        return JSON.stringify(capped);
      }
      case "find_bics_by_entity": {
        const allBics = await storage.listBics();
        const filtered = allBics.filter(b => b.legal_entity_id === args.legal_entity_id);
        return JSON.stringify(filtered.length ? filtered.map(leanBic) : { not_found: true, message: `No BICs found for legal_entity_id "${args.legal_entity_id}"` });
      }
      case "create_bic": {
        const allEntities = await storage.listLegalEntities();
        const entityExists = allEntities.find(e => e.id === args.legal_entity_id);
        if (!entityExists) return JSON.stringify({ error: `Invalid legal_entity_id "${args.legal_entity_id}". Call list_legal_entities first to find the correct UUID.` });
        const existing = await storage.listBics();
        const duplicate = existing.find(b => b.bic_code.toLowerCase() === (args.bic_code || "").toLowerCase());
        if (duplicate) return JSON.stringify({ duplicate: true, existing_id: duplicate.id, message: `BIC "${duplicate.bic_code}" already exists (id=${duplicate.id}). Use update_bic instead.` });
        const created = await storage.createBic(args);
        return JSON.stringify({ ok: true, id: created.id, bic_code: created.bic_code, legal_entity_id: created.legal_entity_id });
      }
      case "update_bic": { const { id, ...data } = args; const updated = await storage.updateBic(id, data); return JSON.stringify({ ok: true, id: updated.id }); }
      case "delete_bic": await storage.deleteBic(args.id); return JSON.stringify({ ok: true, id: args.id });
      case "list_correspondent_services": return JSON.stringify((await storage.listCorrespondentServices(args.currency)).map(leanService));
      case "create_correspondent_service": {
        if (!args.bic_id || !isValidUUID(args.bic_id)) return JSON.stringify({ error: `bic_id must be a valid BIC record UUID — call list_bics first. Received: "${args.bic_id}"` });
        const allBics = await storage.listBics();
        const bicExists = allBics.find(b => b.id === args.bic_id);
        if (!bicExists) return JSON.stringify({ error: `bic_id "${args.bic_id}" does not match any BIC in the database. Call list_bics to find the correct UUID.` });
        const existing = await storage.listCorrespondentServices();
        const duplicate = existing.find(s => s.bic_id === args.bic_id && s.currency === args.currency);
        if (duplicate) return JSON.stringify({ duplicate: true, existing_id: duplicate.id, message: `A correspondent service for currency "${args.currency}" already exists on BIC ${args.bic_id} (id=${duplicate.id}). Use update_correspondent_service instead.` });
        const created = await storage.createCorrespondentService(args);
        return JSON.stringify({ ok: true, id: created.id, bic_id: created.bic_id, currency: created.currency, clearing_model: created.clearing_model });
      }
      case "update_correspondent_service": { const { id, ...data } = args; const updated = await storage.updateCorrespondentService(id, data); return JSON.stringify({ ok: true, id: updated.id }); }
      case "delete_correspondent_service": await storage.deleteCorrespondentService(args.id); return JSON.stringify({ ok: true, id: args.id });
      case "list_fmis": return JSON.stringify((await storage.listFmis()).map(leanFmi));
      case "create_fmi": {
        if (!args.legal_entity_id || !isValidUUID(args.legal_entity_id))
          return JSON.stringify({ error: `legal_entity_id must be a valid UUID — call list_legal_entities first to find the correct ID. Received: "${args.legal_entity_id}"` });
        const allFmiEntities = await storage.listLegalEntities();
        const fmiEntity = allFmiEntities.find(e => e.id === args.legal_entity_id);
        if (!fmiEntity) return JSON.stringify({ error: `legal_entity_id "${args.legal_entity_id}" does not match any legal entity in the database. Call list_legal_entities first.` });
        args.legal_entity_name = fmiEntity.legal_name;
        const existingFmis = await storage.listFmis();
        const fmiDuplicate = existingFmis.find(f => f.legal_entity_id === args.legal_entity_id && f.fmi_name === args.fmi_name);
        if (fmiDuplicate) return JSON.stringify({ duplicate: true, existing_id: fmiDuplicate.id, message: `FMI membership "${args.fmi_name}" already exists for this entity (id=${fmiDuplicate.id}). No action needed.` });
        const created = await storage.createFmi(args);
        return JSON.stringify({ ok: true, id: created.id, fmi_name: created.fmi_name, legal_entity_id: created.legal_entity_id });
      }
      case "delete_fmi": await storage.deleteFmi(args.id); return JSON.stringify({ ok: true, id: args.id });
      case "find_fmi_entries": {
        const filter: any = {};
        if (args.category_code) filter.category_code = args.category_code;
        if (args.domain_code) filter.domain_code = args.domain_code;
        if (args.name_contains) filter.name_contains = args.name_contains;
        if (args.status) filter.status = args.status;
        const entries = await storage.findFmiEntries(filter);
        return JSON.stringify(entries.length ? entries.map(leanFmiEntry) : { not_found: true, message: "No FMI entries matched the filter" });
      }
      case "create_fmi_entry": {
        if (!args.category_id || !isValidUUID(args.category_id))
          return JSON.stringify({ error: `category_id must be a valid UUID. Call list_fmi_categories first to get the correct ID. Received: "${args.category_id}"` });
        const existing = await storage.findFmiEntries({ name_contains: args.name });
        const duplicate = existing.find((e: any) =>
          e.name.toLowerCase() === (args.name || "").toLowerCase() ||
          (args.code && e.code?.toLowerCase() === args.code.toLowerCase())
        );
        if (duplicate) return JSON.stringify({ duplicate: true, existing_id: duplicate.id, message: `FMI entry "${duplicate.name}" already exists (id=${duplicate.id}). Use update_fmi_entry instead.` });
        const created = await storage.createFmiEntry({
          ...args,
          status: args.status || "live",
          is_active: true,
        });
        return JSON.stringify({ ok: true, id: created.id, name: created.name, code: created.code });
      }
      case "update_fmi_entry": {
        const { id, ...data } = args;
        const updated = await storage.updateFmiEntry(id, data);
        return JSON.stringify({ ok: true, id: updated.id, name: updated.name });
      }
      case "get_fmi_specification": {
        const spec = await storage.getFmiSpecification(args.fmi_id);
        return JSON.stringify(spec || { not_found: true, message: `No specification exists for fmi_id "${args.fmi_id}". Use update_fmi_specification to create one.` });
      }
      case "update_fmi_specification": {
        const { fmi_id, ...specData } = args;
        const spec = await storage.updateFmiSpecification(fmi_id, specData);
        return JSON.stringify({ ok: true, id: spec.id, fmi_id: spec.fmi_id });
      }
      case "list_fmi_categories": {
        const cats = await storage.listFmiCategories();
        return JSON.stringify(cats);
      }
      case "find_cb_taxonomy_items": {
        const filter: { category?: string; name_contains?: string } = {};
        if (args.category) filter.category = args.category;
        if (args.name) filter.name_contains = args.name;
        const items = await storage.findCbTaxonomyItems(filter);
        return JSON.stringify(items.length ? items : { not_found: true, message: "No CB taxonomy items matched the filter" });
      }
      case "update_cb_capability_value": {
        const result = await storage.updateCbCapabilityValue(args.id, {
          ...(args.value !== undefined && { value: args.value }),
          ...(args.banking_group_id && { banking_group_id: args.banking_group_id }),
          ...(args.taxonomy_item_id && { taxonomy_item_id: args.taxonomy_item_id }),
          ...(args.legal_entity_id !== undefined && { legal_entity_id: args.legal_entity_id || null }),
          ...(args.correspondent_service_id !== undefined && { correspondent_service_id: args.correspondent_service_id || null }),
        });
        return JSON.stringify({ ok: true, id: result.id });
      }
      case "list_intel_observations": {
        const filters: any = {};
        if (args.obs_type) filters.obs_type = args.obs_type;
        if (args.banking_group_id) filters.banking_group_id = args.banking_group_id;
        const observations = await storage.listIntelObservations(filters);
        return JSON.stringify(observations.length ? observations.map(leanIntel) : { not_found: true, message: "No intel observations found" });
      }
      case "create_intel_observation": {
        if (!args.banking_group_id || !isValidUUID(args.banking_group_id)) {
          return JSON.stringify({ error: `banking_group_id must be a valid UUID. Received: "${args.banking_group_id}"` });
        }
        const obs = await storage.createIntelObservation({
          banking_group_id: args.banking_group_id,
          obs_type: args.obs_type,
          title: args.title,
          content: args.content,
          source_type: args.source_type || "ai",
          source_detail: args.source_detail || "agent",
        });
        return JSON.stringify({ ok: true, id: obs.id, title: obs.title });
      }
      case "find_country": {
        const result = await storage.findCountry(args.name_or_code);
        return JSON.stringify(result || { not_found: true, message: `No country found for "${args.name_or_code}"` });
      }
      case "find_currency": {
        const result = await storage.findCurrency(args.code);
        return JSON.stringify(result || { not_found: true, message: `No currency found for code "${args.code}"` });
      }
      case "web_search": {
        const searchResponse = await withRetry(() => openai.chat.completions.create({
          model: "gpt-4o-search-preview",
          messages: [{ role: "user", content: args.query }],
        } as any), 5, `web_search: ${args.query}`);
        return searchResponse.choices[0].message.content || "No search results found.";
      }
      case "validate_cb_structure": {
        const groupId = args.group_id;
        const bankName = args.bank_name || "Unknown";
        const [allEntities, allBics, allServices, allFmis] = await Promise.all([
          storage.listLegalEntities(),
          storage.listBics(),
          storage.listCorrespondentServices(),
          storage.listFmis(),
        ]);
        const groupEntities = allEntities.filter(e => e.group_id === groupId);
        const groupBics = groupEntities.flatMap(e => allBics.filter(b => b.legal_entity_id === e.id));
        const groupServices = groupBics.flatMap(b => allServices.filter(s => s.bic_id === b.id));
        const groupFmis = groupEntities.flatMap(e => allFmis.filter(f => f.legal_entity_id === e.id));

        const dataSnapshot = JSON.stringify({
          entities: groupEntities.map(e => ({ id: e.id, legal_name: e.legal_name, country: e.country, entity_type: e.entity_type })),
          bics: groupBics.map(b => ({ id: b.id, bic_code: b.bic_code, legal_entity_id: b.legal_entity_id, is_headquarters: b.is_headquarters })),
          services: groupServices.map(s => ({ id: s.id, bic_id: s.bic_id, bic_code: s.bic_code, currency: s.currency, service_type: s.service_type, clearing_model: s.clearing_model, rtgs_membership: s.rtgs_membership })),
          fmis: groupFmis.map(f => ({ id: f.id, legal_entity_id: f.legal_entity_id, fmi_name: f.fmi_name, fmi_type: f.fmi_type })),
        }, null, 2);

        const validationPrompt = `You are a correspondent banking data quality reviewer. Analyse the following database records for banking group "${bankName}" and return a JSON validation report.

DATA:
${dataSnapshot}

VALIDATION CHECKS:
1. Are the legal entities plausible clearing/banking entities for this group? Flag any that look like non-bank subsidiaries (insurance, asset management, holding companies without banking licences).
2. Are Onshore/Offshore classifications correct? For each service: if the entity's country is the home settlement country of that currency, clearing_model should be "Onshore" and service_type "Correspondent Banking". Otherwise "Offshore" and "Global Currency Clearing".
3. Are RTGS system FMI memberships correctly assigned? Each entity should have an FMI membership for its local RTGS system matching its country. Flag mismatches (e.g. a UK entity with TARGET2 instead of CHAPS).
4. Are any obvious entities missing? For a major international bank, check if the HQ entity is present. If the group is a G-SIB, flag if major clearing centres (US, UK, Eurozone, Singapore, Hong Kong, Japan) are absent.

RESPOND WITH ONLY THIS JSON (no markdown fences, no extra text):
{
  "structure_valid": true/false,
  "issues": ["issue 1 description", "issue 2 description"],
  "missing_entities": ["description of missing entity 1"],
  "notes": "brief overall assessment"
}

If everything looks correct, set structure_valid=true with an empty issues array and empty missing_entities array.`;

        const validationResponse = await withRetry(() => openai.chat.completions.create({
          model: AGENT_MODEL,
          messages: [{ role: "user", content: validationPrompt }],
        }), 5, `validate_cb_structure: ${bankName}`);

        const rawContent = validationResponse.choices[0].message.content || "{}";
        const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        try {
          const parsed = JSON.parse(cleaned);
          return JSON.stringify(parsed);
        } catch {
          return JSON.stringify({ structure_valid: false, issues: ["Validation response was not valid JSON"], missing_entities: [], notes: rawContent });
        }
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

export async function runAgentLoop(
  openaiMessages: any[],
  onStep?: StepCallback,
  maxIterations = 12,
  firstIterToolChoice: "auto" | "required" | "none" = "auto",
  model = AGENT_MODEL,
  tools?: any[]
): Promise<string> {
  const messages = [...openaiMessages];
  const resolvedTools = tools ?? getTools();

  for (let i = 0; i < maxIterations; i++) {
    const toolChoice = i === 0 ? firstIterToolChoice : "auto";

    const response = await withRetry(
      () => openai.chat.completions.create({
        model,
        messages,
        tools: resolvedTools,
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

    const parsedCalls = msg.tool_calls.map(tc => ({
      tc,
      args: JSON.parse(tc.function.arguments || "{}"),
    }));

    if (onStep) {
      for (const { tc, args } of parsedCalls) {
        await onStep(tc.function.name, args, getStatusText(tc.function.name, args));
      }
    }

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

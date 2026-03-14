// Absorbed from server/agentCore.ts: tool definitions (getTools, getDryRunTools, getLightTools) and lean-helper functions

function leanGroup(g: any) {
  return { id: g.id, group_name: g.group_name, headquarters_country: g.headquarters_country, primary_currency: g.primary_currency, rtgs_system: g.rtgs_system, rtgs_member: g.rtgs_member, cb_probability: g.cb_probability, cb_evidence: g.cb_evidence, gsib_status: g.gsib_status };
}
function leanEntity(e: any) {
  return { id: e.id, legal_name: e.legal_name, country: e.country, entity_type: e.entity_type, group_id: e.group_id };
}
function leanBic(b: any) {
  return { id: b.id, bic_code: b.bic_code, legal_entity_id: b.legal_entity_id, is_headquarters: b.is_headquarters, swift_member: b.swift_member };
}
function leanService(s: any) {
  return { id: s.id, bic_id: s.bic_id, bic_code: s.bic_code, currency: s.currency, service_type: s.service_type, clearing_model: s.clearing_model, rtgs_membership: s.rtgs_membership };
}
function leanFmi(f: any) {
  return { id: f.id, legal_entity_id: f.legal_entity_id, legal_entity_name: f.legal_entity_name, fmi_name: f.fmi_name, fmi_type: f.fmi_type, member_since: f.member_since };
}

export { leanGroup, leanEntity, leanBic, leanService, leanFmi };

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
    { type: "function", function: { name: "validate_cb_structure", description: "Run an AI validation check on the current database structure for a banking group. Checks entity plausibility, Onshore/Offshore classification, RTGS assignments, and missing entities. Returns a JSON report with structure_valid, issues, missing_entities, and notes. Call this ONLY after completing all entity/BIC/service/FMI setup steps.", parameters: { type: "object", required: ["group_id", "bank_name"], properties: { group_id: { type: "string", description: "The banking group UUID" }, bank_name: { type: "string", description: "The banking group name for context" } } } } },
    { type: "function", function: { name: "web_search", description: "Search the web for current information about banks, correspondent banking services, SWIFT codes, regulatory news, or any real-time financial data", parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } } } },
    { type: "function", function: { name: "list_data_sources", description: "List all stored data sources", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_data_source", description: "Store a new data source reference", parameters: { type: "object", required: ["name", "category"], properties: { name: { type: "string" }, category: { type: "string" }, url: { type: "string" }, publisher: { type: "string" }, description: { type: "string" }, update_frequency: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "update_data_source", description: "Update an existing data source", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, category: { type: "string" }, url: { type: "string" }, publisher: { type: "string" }, description: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_data_source", description: "Delete a data source by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
  ];
}

export function getDryRunTools(): any[] {
  const all = getTools();
  const allowed = new Set([
    "find_banking_group_by_name",
    "find_legal_entity_by_name",
    "check_fmi_membership",
    "list_banking_groups",
    "list_legal_entities",
    "list_bics",
    "list_correspondent_services",
    "list_fmis",
    "list_data_sources",
    "web_search",
  ]);
  return all.filter((t: any) => allowed.has(t.function.name));
}

export function getLightTools(): any[] {
  const all = getTools();
  const allowed = new Set([
    "find_banking_group_by_name",
    "update_banking_group",
    "find_legal_entity_by_name",
    "create_legal_entity",
    "update_legal_entity",
    "list_bics",
    "create_bic",
    "update_bic",
    "check_fmi_membership",
    "create_fmi",
    "list_correspondent_services",
    "create_correspondent_service",
    "update_correspondent_service",
  ]);
  return all.filter((t: any) => allowed.has(t.function.name));
}

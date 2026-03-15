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
function leanFmiEntry(e: any) {
  return { id: e.id, name: e.name, short_name: e.short_name, code: e.code, status: e.status, category_code: e.category_code, category_name: e.category_name, domain_code: e.domain_code, settlement_model: e.settlement_model, supports_24x7: e.supports_24x7, supports_cross_border: e.supports_cross_border, supports_one_leg_out: e.supports_one_leg_out, primary_currency_code: e.primary_currency_code, operator_name: e.operator_name };
}
function leanIntel(o: any) {
  return { id: o.id, banking_group_id: o.banking_group_id, obs_type: o.obs_type, title: o.title, content: o.content, source_type: o.source_type, created_at: o.created_at };
}

export { leanGroup, leanEntity, leanBic, leanService, leanFmi, leanFmiEntry, leanIntel };

export function getTools(): any[] {
  return [
    ...getCbEntityTools(),
    ...getFmiMembershipTools(),
    ...getFmiTaxonomyTools(),
    ...getCbTaxonomyTools(),
    ...getIntelTools(),
    ...getGeoReferenceTools(),
    ...getUtilityTools(),
  ];
}

export function getCbEntityTools(): any[] {
  return [
    { type: "function", function: { name: "find_banking_group_by_name", description: "Search for a banking group by partial name match. Returns up to 5 matches. Use this instead of list_banking_groups when looking for a specific institution.", parameters: { type: "object", required: ["name_contains"], properties: { name_contains: { type: "string", description: "Partial name to search for, e.g. 'Goldman' or 'JPMorgan'" } } } } },
    { type: "function", function: { name: "find_legal_entity_by_name", description: "Search for a legal entity by partial name match. Returns up to 5 matches. Use this instead of list_legal_entities when looking for a specific entity.", parameters: { type: "object", required: ["name_contains"], properties: { name_contains: { type: "string", description: "Partial name to search for, e.g. 'Goldman Sachs' or 'Barclays'" } } } } },
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
    { type: "function", function: { name: "list_bics", description: "List BICs in the database. Returns up to 50 results. For targeted lookups, use find_bics_by_entity instead.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "find_bics_by_entity", description: "List all BICs belonging to a specific legal entity. More efficient than list_bics when you know which entity you need.", parameters: { type: "object", required: ["legal_entity_id"], properties: { legal_entity_id: { type: "string", description: "UUID of the legal entity" } } } } },
    { type: "function", function: { name: "create_bic", description: "Create a new BIC linked to a legal entity", parameters: { type: "object", required: ["legal_entity_id", "bic_code"], properties: { legal_entity_id: { type: "string" }, legal_entity_name: { type: "string" }, bic_code: { type: "string" }, country: { type: "string" }, city: { type: "string" }, is_headquarters: { type: "boolean" }, swift_member: { type: "boolean" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "update_bic", description: "Update an existing BIC by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, bic_code: { type: "string" }, country: { type: "string" }, city: { type: "string" }, is_headquarters: { type: "boolean" }, swift_member: { type: "boolean" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_bic", description: "Delete a BIC by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "list_correspondent_services", description: "List all correspondent services, optionally filtered by currency", parameters: { type: "object", properties: { currency: { type: "string" } } } } },
    { type: "function", function: { name: "create_correspondent_service", description: "Create a new correspondent service linked to a BIC", parameters: { type: "object", required: ["bic_id", "currency", "service_type"], properties: { bic_id: { type: "string" }, bic_code: { type: "string" }, group_name: { type: "string" }, legal_entity_name: { type: "string" }, country: { type: "string" }, currency: { type: "string" }, service_type: { type: "string" }, clearing_model: { type: "string", enum: ["Onshore", "Offshore"] }, rtgs_membership: { type: "boolean" }, instant_scheme_access: { type: "boolean" }, nostro_accounts_offered: { type: "boolean" }, vostro_accounts_offered: { type: "boolean" }, cls_member: { type: "boolean" }, target_clients: { type: "string" }, notes: { type: "string" }, source: { type: "string" } } } } },
    { type: "function", function: { name: "update_correspondent_service", description: "Update an existing correspondent service by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, currency: { type: "string" }, service_type: { type: "string" }, clearing_model: { type: "string" }, rtgs_membership: { type: "boolean" }, instant_scheme_access: { type: "boolean" }, nostro_accounts_offered: { type: "boolean" }, vostro_accounts_offered: { type: "boolean" }, cls_member: { type: "boolean" }, target_clients: { type: "string" }, notes: { type: "string" }, source: { type: "string" } } } } },
    { type: "function", function: { name: "delete_correspondent_service", description: "Delete a correspondent service by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
    { type: "function", function: { name: "validate_cb_structure", description: "Run an AI validation check on the current database structure for a banking group. Checks entity plausibility, Onshore/Offshore classification, RTGS assignments, and missing entities. Returns a JSON report with structure_valid, issues, missing_entities, and notes. Call this ONLY after completing all entity/BIC/service/FMI setup steps.", parameters: { type: "object", required: ["group_id", "bank_name"], properties: { group_id: { type: "string", description: "The banking group UUID" }, bank_name: { type: "string", description: "The banking group name for context" } } } } },
  ];
}

export function getFmiMembershipTools(): any[] {
  return [
    { type: "function", function: { name: "check_fmi_membership", description: "Check whether a specific FMI membership record already exists for a given legal entity and FMI. Returns {exists: true/false}.", parameters: { type: "object", required: ["legal_entity_id", "fmi_name"], properties: { legal_entity_id: { type: "string" }, fmi_name: { type: "string" } } } } },
    { type: "function", function: { name: "list_fmis", description: "List all FMI membership records (which banks are members of which payment systems). This is about bank-level membership — NOT the FMI catalogue. For FMI catalogue entries, use find_fmi_entries instead.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_fmi", description: "Create a new FMI membership record. IMPORTANT: legal_entity_id must be a real UUID from list_legal_entities — call list_legal_entities first to confirm the entity exists before calling this tool.", parameters: { type: "object", required: ["legal_entity_id", "fmi_type", "fmi_name"], properties: { legal_entity_id: { type: "string" }, legal_entity_name: { type: "string" }, fmi_type: { type: "string", enum: ["Payment Systems","Instant Payment Systems","Securities Settlement Systems","Central Securities Depositories","Central Counterparties","Trade Repositories","FX Settlement Systems","Messaging Networks"] }, fmi_name: { type: "string" }, member_since: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_fmi", description: "Delete an FMI membership record by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
  ];
}

export function getFmiTaxonomyTools(): any[] {
  return [
    { type: "function", function: { name: "find_fmi_entries", description: "Search the FMI Taxonomy catalogue for infrastructure entries (payment systems, clearing mechanisms, settlement systems, etc.). This searches the catalogue of FMIs themselves — NOT bank membership records. Use filters to narrow results. Examples: find all RTGS systems → category_code='PS-SET-RTGS'; find TARGET2 → name_contains='TARGET2'; find all payment systems → domain_code='PS'.", parameters: { type: "object", properties: { category_code: { type: "string", description: "Category code filter, e.g. 'PS-SET-RTGS', 'PS-CLR-ACH', 'PS-SCH-CT', 'FXS-PVP'" }, domain_code: { type: "string", description: "Domain code filter, e.g. 'PS' (Payment Systems), 'FXS' (FX Settlement), 'SSS' (Securities)" }, name_contains: { type: "string", description: "Partial name search, e.g. 'TARGET', 'CHAPS', 'Fedwire'" }, status: { type: "string", description: "Status filter: 'live', 'planned', 'decommissioned'" } } } } },
    { type: "function", function: { name: "update_fmi_entry", description: "Update an FMI Taxonomy catalogue entry by ID. Can modify fields like supports_one_leg_out, supports_cross_border, supports_24x7, settlement_model, status, description, notes, operator_name, primary_currency_code.", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, status: { type: "string" }, settlement_model: { type: "string" }, supports_24x7: { type: "boolean" }, supports_cross_border: { type: "boolean" }, supports_one_leg_out: { type: "boolean" }, primary_currency_code: { type: "string" }, operator_name: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "get_fmi_specification", description: "Get the detailed operational specification for an FMI entry. Returns settlement model, clearing/settlement/messaging capabilities, operating hours, message standards, participation rules, cross-border support, etc.", parameters: { type: "object", required: ["fmi_id"], properties: { fmi_id: { type: "string", description: "UUID of the FMI entry to get the specification for" } } } } },
    { type: "function", function: { name: "update_fmi_specification", description: "Update the operational specification for an FMI entry. Creates the spec if none exists yet. Can set fields like performs_clearing, performs_settlement, settlement_model, supports_24x7, supports_cross_border_processing, supports_one_leg_out_processing, primary_currency_code, primary_message_standard, etc.", parameters: { type: "object", required: ["fmi_id"], properties: { fmi_id: { type: "string" }, performs_clearing: { type: "boolean" }, performs_settlement: { type: "boolean" }, performs_messaging: { type: "boolean" }, settlement_model: { type: "string" }, supports_24x7: { type: "boolean" }, supports_cross_border_processing: { type: "boolean" }, supports_one_leg_out_processing: { type: "boolean" }, primary_currency_code: { type: "string" }, primary_message_standard: { type: "string" }, direct_participation_allowed: { type: "boolean" }, indirect_participation_supported: { type: "boolean" }, operating_hours_notes: { type: "string" }, settlement_cycle_description: { type: "string" }, liquidity_management_notes: { type: "string" } } } } },
    { type: "function", function: { name: "list_fmi_categories", description: "List all FMI Taxonomy categories with their codes, names, and entry counts. Useful to discover available category codes for filtering find_fmi_entries.", parameters: { type: "object", properties: {} } } },
  ];
}

export function getCbTaxonomyTools(): any[] {
  return [
    { type: "function", function: { name: "find_cb_taxonomy_items", description: "Search CB Services Taxonomy items by category and/or name. Returns capability dimensions that can be scored per banking group.", parameters: { type: "object", properties: { category: { type: "string", description: "Category filter: feature_commercial, feature_treasury, value_added, connectivity, fi_score, thought_leadership, target_market, ancillary" }, name: { type: "string", description: "Partial name search (case-insensitive contains)" } } } } },
    { type: "function", function: { name: "update_cb_capability_value", description: "Update an existing CB capability value record by its ID. Patch any combination of fields.", parameters: { type: "object", required: ["id"], properties: { id: { type: "string", description: "The cb_capability_values record ID to update" }, value: { type: "string", description: "The new capability value (format depends on taxonomy item's value_type)" }, banking_group_id: { type: "string" }, taxonomy_item_id: { type: "string" }, legal_entity_id: { type: "string" }, correspondent_service_id: { type: "string" } } } } },
  ];
}

export function getIntelTools(): any[] {
  return [
    { type: "function", function: { name: "list_intel_observations", description: "List intelligence observations, optionally filtered by type (competitor or cb_provider) and/or banking_group_id.", parameters: { type: "object", properties: { obs_type: { type: "string", enum: ["competitor", "cb_provider"], description: "Filter by observation type" }, banking_group_id: { type: "string", description: "Filter by banking group UUID" } } } } },
    { type: "function", function: { name: "create_intel_observation", description: "Create a new intelligence observation about a banking group.", parameters: { type: "object", required: ["banking_group_id", "obs_type", "title", "content"], properties: { banking_group_id: { type: "string" }, obs_type: { type: "string", enum: ["competitor", "cb_provider"] }, title: { type: "string" }, content: { type: "string" }, source_type: { type: "string", enum: ["user", "ai"], description: "Defaults to 'ai' when created by the agent" }, source_detail: { type: "string" } } } } },
  ];
}

export function getGeoReferenceTools(): any[] {
  return [
    { type: "function", function: { name: "find_country", description: "Look up a country by ISO code (2 or 3 letter) or partial name. Returns country details with associated currencies. Read-only reference lookup.", parameters: { type: "object", required: ["name_or_code"], properties: { name_or_code: { type: "string", description: "ISO 2-letter code (e.g. 'US'), ISO 3-letter code (e.g. 'USA'), or partial name (e.g. 'United States')" } } } } },
    { type: "function", function: { name: "find_currency", description: "Look up a currency by ISO 4217 code. Returns currency details with associated countries. Read-only reference lookup.", parameters: { type: "object", required: ["code"], properties: { code: { type: "string", description: "ISO 4217 currency code, e.g. 'USD', 'EUR', 'GBP'" } } } } },
  ];
}

export function getUtilityTools(): any[] {
  return [
    { type: "function", function: { name: "web_search", description: "Search the web for current information about banks, correspondent banking services, SWIFT codes, regulatory news, or any real-time financial data", parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } } } },
    { type: "function", function: { name: "list_data_sources", description: "List all stored data sources", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_data_source", description: "Store a new data source reference", parameters: { type: "object", required: ["name", "category"], properties: { name: { type: "string" }, category: { type: "string" }, url: { type: "string" }, publisher: { type: "string" }, description: { type: "string" }, update_frequency: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "update_data_source", description: "Update an existing data source", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, category: { type: "string" }, url: { type: "string" }, publisher: { type: "string" }, description: { type: "string" }, notes: { type: "string" } } } } },
    { type: "function", function: { name: "delete_data_source", description: "Delete a data source by ID", parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
  ];
}

export function getToolsForTopic(topic?: string): any[] {
  if (!topic || topic === "general") return getTools();

  const utility = getUtilityTools();

  switch (topic) {
    case "banking-groups":
    case "entities-bics":
    case "cb-services":
      return [...getCbEntityTools(), ...getFmiMembershipTools(), ...getIntelTools(), ...utility];
    case "fmi":
      return [...getFmiTaxonomyTools(), ...getFmiMembershipTools(), ...getCbEntityTools(), ...getGeoReferenceTools(), ...utility];
    case "cb-taxonomy":
      return [...getCbTaxonomyTools(), ...getCbEntityTools(), ...utility];
    case "intel":
      return [...getIntelTools(), ...getCbEntityTools(), ...utility];
    case "geo":
      return [...getGeoReferenceTools(), ...utility];
    default:
      return getTools();
  }
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
    "find_bics_by_entity",
    "list_correspondent_services",
    "list_fmis",
    "find_fmi_entries",
    "list_fmi_categories",
    "get_fmi_specification",
    "find_cb_taxonomy_items",
    "find_country",
    "find_currency",
    "list_intel_observations",
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
    "find_bics_by_entity",
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

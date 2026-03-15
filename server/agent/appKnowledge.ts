export function getAppKnowledge(): string {
  return `## CBHUB APPLICATION KNOWLEDGE
This is the authoritative reference for the entire CBHub application. The agent must consult this to understand which data domain a user request belongs to and which tools to use.

## CONVENTION: Update this file whenever a new module or table is added to the app.

---

### DOMAIN 1: CB Entity Registry
**Purpose:** The core correspondent banking provider registry. Hierarchical: BankingGroup → LegalEntity → BIC → CorrespondentService. A BankingGroup is always the global parent holding company. Legal entities are licensed banking subsidiaries/branches. BICs are SWIFT codes. Correspondent services describe currency-specific CB offerings.
**Tables:** banking_groups, legal_entities, bics, correspondent_services, cls_profiles
**Tools (available):** find_banking_group_by_name, list_banking_groups, create_banking_group, update_banking_group, delete_banking_group, merge_banking_groups, find_legal_entity_by_name, list_legal_entities, create_legal_entity, update_legal_entity, delete_legal_entity, merge_legal_entities, list_bics, create_bic, update_bic, delete_bic, list_correspondent_services, create_correspondent_service, update_correspondent_service, delete_correspondent_service, validate_cb_structure
**Key rules:**
- When asked to set up or research a CB provider, follow the CB qualification and entity setup workflow (4-criterion assessment → 7-step setup).
- Onshore = entity is domiciled in the home country of the currency. Offshore = any other combination.
- service_type follows clearing_model: Onshore → "Correspondent Banking", Offshore → "Global Currency Clearing".
- Always use merge tools (merge_banking_groups, merge_legal_entities) instead of manual delete+recreate.
- BankingGroups are ALWAYS global parent holding companies — never branches or subsidiaries.

---

### DOMAIN 2: FMI Memberships (Entity-Level)
**Purpose:** Tracks which legal entities in the CB registry are members of which Financial Market Infrastructures. This is entity-level membership data (e.g. "Citibank NA is a member of Fedwire"). Different from the FMI Taxonomy which catalogues the FMIs themselves.
**Tables:** fmis (links legal_entity_id to fmi_name/fmi_type)
**Tools (available):** list_fmis, create_fmi, delete_fmi, check_fmi_membership
**Key rules:**
- Always call check_fmi_membership before creating to avoid duplicates.
- fmi_type values: Payment Systems, Instant Payment Systems, Securities Settlement Systems, Central Securities Depositories, Central Counterparties, Trade Repositories, FX Settlement Systems, Messaging Networks.
- This domain answers: "Which banks are members of TARGET2?" or "Does HSBC have a CHAPS membership?"

---

### DOMAIN 3: FMI Taxonomy v2 (Infrastructure Catalogue)
**Purpose:** The structured reference catalogue of payment systems, clearing systems, and other financial market infrastructures. This describes the FMIs themselves — not bank memberships. Organised hierarchically: Domain → Category → Entry. Each entry represents a specific infrastructure (e.g. TARGET2, CHAPS, Fedwire, SEPA CT).
**Tables:** fmi_domains, fmi_categories, fmi_entries, fmi_relationship_types, fmi_relationships
**Tools (available):** find_fmi_entries, update_fmi_entry, list_fmi_categories, get_fmi_specification, update_fmi_specification
**Key rules:**
- fmi_entries have a category_id linking to fmi_categories (e.g. PS-SET-RTGS = Payment Systems > Settlement > RTGS).
- fmi_relationships link entries to each other (e.g. SCHEME_USES_CLEARING_MECHANISM links a payment scheme to its clearing/settlement infrastructure).
- When a user asks about "RTGS systems", "payment schemes", "clearing mechanisms" as catalogue entries, this is the correct domain — NOT the FMI memberships domain and NOT the CB entity tools.
- Category codes follow a hierarchical pattern: PS-SET-RTGS, PS-CLR-ACH, PS-SCH-CT, FXS-PVP, etc.

---

### DOMAIN 4: FMI Specifications & Payment Capabilities
**Purpose:** Structured operational specifications attached to FMI Taxonomy entries. Describes what each FMI does: settlement model, clearing capabilities, operating hours, message formats, etc. Also includes payment scheme specifications, processing scenarios, and scenario relationships.
**Tables:** fmi_specifications (1:1 with fmi_entries), payment_scheme_specifications (1:1 with fmi_entries for scheme-type FMIs), payment_scheme_processing_scenarios, payment_scheme_scenario_relationships
**Tools (available):** get_fmi_specification, update_fmi_specification
**Key rules:**
- Capability derivation for scheme FMIs resolves through relationships: scenario-specific first (SCENARIO_USES_CLEARING_MECHANISM), then scheme→infra chain (SCHEME_USES_CLEARING_MECHANISM).
- supports_one_leg_out, supports_24x7, supports_cross_border are boolean flags on both fmi_entries and fmi_specifications.
- When a user says "update all RTGS systems to support one-leg-out", find entries by category PS-SET-RTGS and update their specifications.

---

### DOMAIN 5: FMI Taxonomy v1 (Legacy Profiles)
**Purpose:** Original 50-entry FMI profile catalogue with detailed narrative fields. Superseded by Taxonomy v2 for structured data but still serves as rich reference content.
**Tables:** fmi_taxonomy
**Tools:** None currently — accessed via UI only.

---

### DOMAIN 6: FMI Research Jobs
**Purpose:** Background jobs that discover FMI members from web sources and create membership records.
**Tables:** fmi_research_jobs, fmi_registry
**Tools:** None — managed via background job system.

---

### DOMAIN 7: CB Services Taxonomy
**Purpose:** A structured taxonomy of correspondent banking service capabilities. Items are capability dimensions (e.g. "Multi-currency pooling", "Instant payment access"). Values score each banking group against these dimensions. Also tracks payment scheme indirect participation.
**Tables:** cb_taxonomy_items, cb_capability_values, cb_scheme_master, cb_indirect_participation
**Tools (available):** find_cb_taxonomy_items, update_cb_capability_value
**Key rules:**
- Categories: feature_commercial, feature_treasury, value_added, connectivity, fi_score, thought_leadership, target_market, ancillary.
- Value types: boolean_unknown, enum_high_med_low, score_1_10, count, text.
- cb_capability_values links a banking_group_id + taxonomy_item_id to a scored value.

---

### DOMAIN 8: Geographic & Currency Reference
**Purpose:** Normalised reference data for countries, currencies, regions, and their relationships. Used across all other domains for consistent geographic and currency coding.
**Tables:** countries, geo_currencies, country_currencies, regions, region_members, currency_areas
**Tools (available):** find_country, find_currency (read-only reference lookups)
**Key rules:**
- countries use ISO 3166-1 (iso2, iso3).
- geo_currencies use ISO 4217 currency codes.
- country_currencies is a many-to-many with is_primary flag.
- regions can be: economic_union, payment_scheme_region, geographic_region, regulatory_region, currency_union.

---

### DOMAIN 9: Intel Observations
**Purpose:** User and AI-generated competitive intelligence notes attached to banking groups. Types: competitor intel or CB provider intel.
**Tables:** intel_observations
**Tools (available):** list_intel_observations, create_intel_observation
**Key rules:**
- obs_type: "competitor" or "cb_provider".
- source_type: "user" or "ai".
- Always linked to a banking_group_id.

---

### DOMAIN 10: Agent Jobs & Background Workflows
**Purpose:** Manages background AI processing jobs: CB entity setup, market coverage scans, FMI research. Jobs are queued and processed asynchronously.
**Tables:** agent_jobs
**Workflows:** CB Entity Setup (full 7-step and light mode), Market Coverage Scan (with dry-run), FMI Research (member discovery).
**Tools:** Jobs are managed through the job queue API, not direct agent tools.

---

### DOMAIN 11: Data Sources
**Purpose:** Reference library of authoritative data sources (SWIFT directories, central bank publications, RTGS participant lists, etc.) used by the agent for research.
**Tables:** data_sources
**Tools (available):** list_data_sources, create_data_source, update_data_source, delete_data_source
**Key rules:**
- The agent should automatically save authoritative sources it discovers during web searches.
- Known sources are injected into the system prompt so the agent uses them before searching the web.

---

### DOMAIN 12: Conversations & Chat
**Purpose:** Persistent chat history for agent conversations.
**Tables:** conversations, chat_messages
**Key rules:**
- Messages include role (user/assistant) and content.
- Chat history is loaded as context for each agent interaction.

---

### ROUTING GUIDE — How to determine the correct domain

| User intent | Correct domain | Wrong domain |
|---|---|---|
| "Add Standard Chartered as a CB provider" | Domain 1 (CB Entity Registry) | — |
| "Which banks are members of TARGET2?" | Domain 2 (FMI Memberships) | Domain 3 |
| "Update all RTGS systems to support OLO" | Domain 3 + 4 (FMI Taxonomy + Specs) | Domain 1 or 2 |
| "What is the settlement model for CHAPS?" | Domain 3 + 4 (FMI Taxonomy + Specs) | Domain 1 |
| "Show me capability scores for HSBC" | Domain 7 (CB Taxonomy) | Domain 1 |
| "What currency does Germany use?" | Domain 8 (Geographic Reference) | — |
| "Add an intel note about JPMorgan" | Domain 9 (Intel Observations) | — |
| "Is Citibank a CLS member?" | Domain 2 (FMI Memberships) | Domain 3 |
| "Which payment schemes use T2 for settlement?" | Domain 3 (FMI Taxonomy — relationships) | Domain 2 |
`;
}

export function getAppKnowledgeSummary(): string {
  return `You have access to a comprehensive correspondent banking hub (CBHub) with multiple data domains:
1. CB Entity Registry (banking groups, legal entities, BICs, correspondent services)
2. FMI Memberships (which banks are members of which payment systems)
3. FMI Taxonomy (catalogue of payment systems and infrastructure — TARGET2, CHAPS, etc.)
4. FMI Specifications (operational specs per infrastructure)
5. CB Services Taxonomy (capability scoring per banking group)
6. Geographic & Currency Reference (countries, currencies, regions)
7. Intel Observations (competitive intelligence notes)
8. Data Sources (reference library)
Route each request to the correct domain based on what the user is asking about. Use CB entity tools for bank/provider questions. Use FMI taxonomy tools for infrastructure/system questions. Never confuse bank memberships (which banks belong to which FMI) with the FMI catalogue itself (what each FMI does).`;
}

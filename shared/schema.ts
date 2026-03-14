import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, date, pgEnum, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const gsibStatusEnum = pgEnum("gsib_status", ["G-SIB", "D-SIB", "N/A"]);
export const entityTypeEnum = pgEnum("entity_type", ["Bank", "Branch", "Subsidiary", "Representative Office", "Other"]);
export const currencyEnum = pgEnum("currency", [
  "USD","EUR","GBP",
  "AED","AUD","BGN","BHD","BRL","CAD","CHF","CLP","CNH","CNY","COP","CZK","DKK",
  "EGP","HKD","HUF","IDR","ILS","INR","JPY","KES","KRW","KWD","MAD","MXN","MYR",
  "NGN","NOK","NZD","OMR","PEN","PHP","PLN","QAR","RON","SAR","SEK","SGD","THB",
  "TRY","TWD","ZAR",
]);
export const clearingModelEnum = pgEnum("clearing_model", ["Onshore", "Offshore"]);
export const serviceTypeEnum = pgEnum("service_type", ["Correspondent Banking","Global Currency Clearing","Currency Clearing","RTGS Participation","Instant Payments Access","FX Liquidity","CLS Settlement","CLS Third Party Settlement","CLS Nostro Payments","Custody Services","Transaction Banking","Liquidity Services"]);
export const FMI_CATEGORIES = [
  "Payment Systems",
  "Instant Payment Systems",
  "Securities Settlement Systems",
  "Central Securities Depositories",
  "Central Counterparties",
  "Trade Repositories",
  "FX Settlement Systems",
  "Messaging Networks",
] as const;
export type FmiCategory = typeof FMI_CATEGORIES[number];
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const bankingGroups = pgTable("banking_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  group_name: text("group_name").notNull(),
  headquarters_country: text("headquarters_country"),
  primary_currency: text("primary_currency"),
  rtgs_system: text("rtgs_system"),
  rtgs_member: boolean("rtgs_member").default(false),
  cb_probability: text("cb_probability"),
  cb_evidence: text("cb_evidence"),
  gsib_status: gsibStatusEnum("gsib_status").default("N/A"),
  website: text("website"),
  notes: text("notes"),
});

export const legalEntities = pgTable("legal_entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  group_id: varchar("group_id").notNull(),
  group_name: text("group_name"),
  legal_name: text("legal_name").notNull(),
  country: text("country"),
  entity_type: entityTypeEnum("entity_type").default("Bank"),
  regulator: text("regulator"),
  notes: text("notes"),
});

export const bics = pgTable("bics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  legal_entity_id: varchar("legal_entity_id").notNull(),
  legal_entity_name: text("legal_entity_name"),
  bic_code: text("bic_code").notNull(),
  country: text("country"),
  city: text("city"),
  is_headquarters: boolean("is_headquarters").default(false),
  swift_member: boolean("swift_member").default(true),
  notes: text("notes"),
});

export const correspondentServices = pgTable("correspondent_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bic_id: varchar("bic_id").notNull(),
  bic_code: text("bic_code"),
  group_name: text("group_name"),
  legal_entity_name: text("legal_entity_name"),
  country: text("country"),
  currency: currencyEnum("currency"),
  clearing_model: clearingModelEnum("clearing_model"),
  service_type: serviceTypeEnum("service_type"),
  rtgs_membership: boolean("rtgs_membership").default(false),
  instant_scheme_access: boolean("instant_scheme_access").default(false),
  nostro_accounts_offered: boolean("nostro_accounts_offered").default(false),
  vostro_accounts_offered: boolean("vostro_accounts_offered").default(false),
  cls_member: boolean("cls_member").default(false),
  target_clients: text("target_clients"),
  notes: text("notes"),
  source: text("source"),
  last_verified: date("last_verified"),
});

export const clsProfiles = pgTable("cls_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  group_id: varchar("group_id").notNull(),
  group_name: text("group_name"),
  cls_member: boolean("cls_member").default(false),
  cls_member_legal_entity: text("cls_member_legal_entity"),
  cls_third_party: boolean("cls_third_party").default(false),
  cls_third_party_notes: text("cls_third_party_notes"),
  cls_nostro_payments: boolean("cls_nostro_payments").default(false),
  cls_nostro_currencies: text("cls_nostro_currencies").array(),
  notes: text("notes"),
  last_verified: date("last_verified"),
});

export const fmis = pgTable("fmis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  legal_entity_id: varchar("legal_entity_id").notNull(),
  legal_entity_name: text("legal_entity_name"),
  fmi_type: text("fmi_type"),
  fmi_name: text("fmi_name"),
  member_since: date("member_since"),
  notes: text("notes"),
  source: text("source"),
  last_verified: date("last_verified"),
});

export const fmiRegistry = pgTable("fmi_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fmi_name: text("fmi_name").notNull().unique(),
  fmi_type: text("fmi_type").notNull(),
  description: text("description"),
  website: text("website"),
  membership_url: text("membership_url"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
});

export const fmiResearchJobs = pgTable("fmi_research_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fmi_name: text("fmi_name").notNull(),
  status: text("status").notNull().default("pending"),
  conversation_id: varchar("conversation_id"),
  queued_at: timestamp("queued_at").defaultNow(),
  started_at: timestamp("started_at"),
  completed_at: timestamp("completed_at"),
  error_message: text("error_message"),
  steps_completed: integer("steps_completed").default(0),
  members_added: integer("members_added").default(0),
  members_skipped: integer("members_skipped").default(0),
  total_members: integer("total_members"),
  member_list: text("member_list"),
  summary: text("summary"),
});

export const dataSources = pgTable("data_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(),
  url: text("url"),
  publisher: text("publisher"),
  description: text("description"),
  update_frequency: text("update_frequency"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
  last_checked: timestamp("last_checked"),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  topic: text("topic"),
  created_at: timestamp("created_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversation_id: varchar("conversation_id").notNull(),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertDataSourceSchema = createInsertSchema(dataSources).omit({ id: true, created_at: true });
export const insertBankingGroupSchema = createInsertSchema(bankingGroups).omit({ id: true });
export const insertLegalEntitySchema = createInsertSchema(legalEntities).omit({ id: true });
export const insertBicSchema = createInsertSchema(bics).omit({ id: true });
export const insertCorrespondentServiceSchema = createInsertSchema(correspondentServices).omit({ id: true });
export const insertClsProfileSchema = createInsertSchema(clsProfiles).omit({ id: true });
export const insertFmiSchema = createInsertSchema(fmis).omit({ id: true });
export const insertFmiRegistrySchema = createInsertSchema(fmiRegistry).omit({ id: true, created_at: true });
export const insertFmiResearchJobSchema = createInsertSchema(fmiResearchJobs).omit({ id: true, queued_at: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, created_at: true });
export const insertMessageSchema = createInsertSchema(chatMessages).omit({ id: true, created_at: true });

export type InsertFmiRegistry = z.infer<typeof insertFmiRegistrySchema>;
export type FmiRegistry = typeof fmiRegistry.$inferSelect;
export type InsertFmiResearchJob = z.infer<typeof insertFmiResearchJobSchema>;
export type FmiResearchJob = typeof fmiResearchJobs.$inferSelect;

export type InsertBankingGroup = z.infer<typeof insertBankingGroupSchema>;
export type BankingGroup = typeof bankingGroups.$inferSelect;
export type InsertLegalEntity = z.infer<typeof insertLegalEntitySchema>;
export type LegalEntity = typeof legalEntities.$inferSelect;
export type InsertBic = z.infer<typeof insertBicSchema>;
export type Bic = typeof bics.$inferSelect;
export type InsertCorrespondentService = z.infer<typeof insertCorrespondentServiceSchema>;
export type CorrespondentService = typeof correspondentServices.$inferSelect;
export type InsertClsProfile = z.infer<typeof insertClsProfileSchema>;
export type ClsProfile = typeof clsProfiles.$inferSelect;
export type InsertFmi = z.infer<typeof insertFmiSchema>;
export type Fmi = typeof fmis.$inferSelect;
export type InsertDataSource = z.infer<typeof insertDataSourceSchema>;
export type DataSource = typeof dataSources.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export const intelObsTypeEnum = pgEnum("intel_obs_type", ["competitor", "cb_provider"]);
export const intelSourceTypeEnum = pgEnum("intel_source_type", ["user", "ai"]);

export const intelObservations = pgTable("intel_observations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  banking_group_id: varchar("banking_group_id").notNull(),
  banking_group_name: text("banking_group_name"),
  legal_entity_id: varchar("legal_entity_id"),
  legal_entity_name: text("legal_entity_name"),
  obs_type: intelObsTypeEnum("obs_type").notNull(),
  currency: text("currency"),
  notes: text("notes"),
  source_type: intelSourceTypeEnum("source_type").notNull().default("user"),
  source_detail: text("source_detail"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertIntelObservationSchema = createInsertSchema(intelObservations).omit({ id: true, created_at: true });
export type InsertIntelObservation = z.infer<typeof insertIntelObservationSchema>;
export type IntelObservation = typeof intelObservations.$inferSelect;

export const agentJobs = pgTable("agent_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  banking_group_id: varchar("banking_group_id"),
  banking_group_name: text("banking_group_name"),
  status: text("status").notNull().default("pending"),
  conversation_id: varchar("conversation_id"),
  queued_at: timestamp("queued_at").defaultNow(),
  started_at: timestamp("started_at"),
  completed_at: timestamp("completed_at"),
  error_message: text("error_message"),
  steps_completed: integer("steps_completed").default(0),
  currency_scope: text("currency_scope").notNull().default("home_only"),
  job_mode: text("job_mode").notNull().default("normal"),
  job_type: text("job_type").notNull().default("cb_setup"),
  market_country: text("market_country"),
  market_currency: text("market_currency"),
  scan_summary: text("scan_summary"),
  dry_run: boolean("dry_run").default(false),
});

export const insertAgentJobSchema = createInsertSchema(agentJobs).omit({ id: true, queued_at: true });
export type InsertAgentJob = z.infer<typeof insertAgentJobSchema>;
export type AgentJob = typeof agentJobs.$inferSelect;

// CB Taxonomy
export const CB_TAXONOMY_CATEGORIES = [
  "feature_commercial", "feature_treasury", "value_added", "connectivity",
  "fi_score", "thought_leadership", "target_market", "ancillary",
] as const;
export type CbTaxonomyCategory = typeof CB_TAXONOMY_CATEGORIES[number];

export const CB_VALUE_TYPES = [
  "boolean_unknown", "enum_high_med_low", "score_1_10", "count", "text",
] as const;
export type CbValueType = typeof CB_VALUE_TYPES[number];

export const cbTaxonomyItems = pgTable("cb_taxonomy_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  value_type: text("value_type").notNull(),
  display_order: integer("display_order").notNull().default(0),
  active: boolean("active").default(true),
});

export const cbCapabilityValues = pgTable("cb_capability_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  banking_group_id: varchar("banking_group_id").notNull(),
  legal_entity_id: varchar("legal_entity_id"),
  correspondent_service_id: varchar("correspondent_service_id"),
  taxonomy_item_id: varchar("taxonomy_item_id").notNull(),
  value_enum: text("value_enum"),
  value_numeric: integer("value_numeric"),
  value_text: text("value_text"),
  supported_fmis: text("supported_fmis").array(),
  notes: text("notes"),
  source: text("source"),
  confidence: text("confidence"),
  ai_generated: boolean("ai_generated").default(true),
  reviewer: text("reviewer"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueCapability: uniqueIndex("cb_cap_unique_idx").on(
    table.banking_group_id,
    sql`COALESCE(${table.legal_entity_id}, '')`,
    sql`COALESCE(${table.correspondent_service_id}, '')`,
    table.taxonomy_item_id,
  ),
}));

export const cbSchemeMaster = pgTable("cb_scheme_master", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  market: text("market"),
  region: text("region"),
  scheme_currency: text("scheme_currency"),
  scheme_type: text("scheme_type"),
  operator_name: text("operator_name"),
  active: boolean("active").default(true),
  display_order: integer("display_order").notNull().default(0),
});

export const cbIndirectParticipation = pgTable("cb_indirect_participation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  legal_entity_id: varchar("legal_entity_id").notNull(),
  legal_entity_name: text("legal_entity_name"),
  banking_group_id: varchar("banking_group_id").notNull(),
  banking_group_name: text("banking_group_name"),
  scheme_id: varchar("scheme_id").notNull(),
  scheme_code: text("scheme_code"),
  scheme_name: text("scheme_name"),
  indirect_participation_offered: text("indirect_participation_offered").default("unknown"),
  sponsor_is_direct_participant: boolean("sponsor_is_direct_participant").default(false),
  notes: text("notes"),
  source: text("source"),
  confidence: text("confidence"),
  ai_generated: boolean("ai_generated").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueEntityScheme: uniqueIndex("cb_indirect_entity_scheme_idx").on(
    table.legal_entity_id,
    table.scheme_id,
  ),
}));

export const insertCbTaxonomyItemSchema = createInsertSchema(cbTaxonomyItems).omit({ id: true }).superRefine((d, ctx) => {
  if (!CB_TAXONOMY_CATEGORIES.includes(d.category as CbTaxonomyCategory)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "category must be one of: " + CB_TAXONOMY_CATEGORIES.join(", "), path: ["category"] });
  }
  if (!CB_VALUE_TYPES.includes(d.value_type as CbValueType)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "value_type must be one of: " + CB_VALUE_TYPES.join(", "), path: ["value_type"] });
  }
});
export const insertCbCapabilityValueSchema = createInsertSchema(cbCapabilityValues).omit({ id: true, created_at: true, updated_at: true });
export const insertCbSchemeMasterSchema = createInsertSchema(cbSchemeMaster).omit({ id: true });
export const insertCbIndirectParticipationSchema = createInsertSchema(cbIndirectParticipation).omit({ id: true, created_at: true, updated_at: true });

export type CbTaxonomyItem = typeof cbTaxonomyItems.$inferSelect;
export type InsertCbTaxonomyItem = z.infer<typeof insertCbTaxonomyItemSchema>;
export type CbCapabilityValue = typeof cbCapabilityValues.$inferSelect;
export type InsertCbCapabilityValue = z.infer<typeof insertCbCapabilityValueSchema>;
export type CbSchemeMaster = typeof cbSchemeMaster.$inferSelect;
export type InsertCbSchemeMaster = z.infer<typeof insertCbSchemeMasterSchema>;
export type CbIndirectParticipation = typeof cbIndirectParticipation.$inferSelect;
export type InsertCbIndirectParticipation = z.infer<typeof insertCbIndirectParticipationSchema>;

export const insertUserSchema = z.object({ username: z.string(), password: z.string() });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = { id: string; username: string; password: string };

// ── FMI Taxonomy v1 ───────────────────────────────────────────────────────────

export const FMI_TAXONOMY_DOMAINS = ["Payments"] as const;
export type FmiTaxonomyDomain = typeof FMI_TAXONOMY_DOMAINS[number];

export const FMI_TAXONOMY_TYPES = [
  "Settlement Systems",
  "Clearing Systems",
  "Instant Payment Infrastructures",
  "Reachability and Network Infrastructures",
  "Payment Scheme Infrastructures",
  "Cross-Border and Interoperability Infrastructures",
] as const;
export type FmiTaxonomyType = typeof FMI_TAXONOMY_TYPES[number];

export const FMI_TAXONOMY_SUBTYPES = [
  "RTGS",
  "Deferred Net Settlement",
  "Hybrid Settlement",
  "ACH",
  "Retail Batch Clearing",
  "High-Value Clearing",
  "Instant Payment Scheme",
  "Instant Clearing Infrastructure",
  "Instant Settlement Infrastructure",
  "Credit Transfer Scheme",
  "Direct Debit Scheme",
  "Messaging Network",
  "Access Gateway",
  "Indirect Participation / Sponsorship Infrastructure",
  "Cross-Border Payment Network",
  "One-Leg-Out Infrastructure",
  "Interoperability Linkage",
  "FX Settlement Infrastructure",
  "Card Payment Infrastructure",
] as const;
export type FmiTaxonomySubtype = typeof FMI_TAXONOMY_SUBTYPES[number];

export const FMI_OPERATOR_TYPES = ["Central Bank", "Government Agency", "Industry Cooperative", "Private Company", "Public-Private Partnership", "International Organisation"] as const;
export type FmiOperatorType = typeof FMI_OPERATOR_TYPES[number];

export const FMI_STATUSES = ["Active", "Decommissioned", "Pilot", "In Development"] as const;
export type FmiStatus = typeof FMI_STATUSES[number];

export const FMI_SYSTEMIC_IMPORTANCE = ["Systemically Important", "Systemically Relevant", "Supporting Infrastructure", "Supplementary"] as const;
export type FmiSystemicImportance = typeof FMI_SYSTEMIC_IMPORTANCE[number];

export const fmiTaxonomy = pgTable("fmi_taxonomy", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // ── Identity ────────────────────────────────────────────────────────────────
  name: text("name").notNull(),
  short_name: text("short_name"),
  domain: text("domain").notNull().default("Payments"),
  type: text("type").notNull(),
  subtype: text("subtype"),

  // ── Purpose ─────────────────────────────────────────────────────────────────
  objective: text("objective"),
  economic_purpose: text("economic_purpose"),
  primary_functional_role: text("primary_functional_role"),
  secondary_functional_roles: text("secondary_functional_roles").array(),

  // ── Scope ───────────────────────────────────────────────────────────────────
  primary_payment_domain: text("primary_payment_domain").default("Payments"),
  geographic_scope: text("geographic_scope"),
  region: text("region"),
  currency_scope: text("currency_scope"),
  primary_currency: varchar("primary_currency", { length: 3 }),
  cross_border_relevance: text("cross_border_relevance"),

  // ── Participation ────────────────────────────────────────────────────────────
  participation_model: text("participation_model"),
  eligible_participants: text("eligible_participants"),
  access_context: text("access_context"),
  central_bank_account_required: boolean("central_bank_account_required"),

  // ── Operator / Oversight ─────────────────────────────────────────────────────
  operator_name: text("operator_name"),
  operator_type: text("operator_type"),
  oversight_authority: text("oversight_authority"),
  jurisdiction: text("jurisdiction"),

  // ── Classification ───────────────────────────────────────────────────────────
  status: text("status").default("Active"),
  systemic_importance: text("systemic_importance"),
  market_relevance_notes: text("market_relevance_notes"),

  // ── Content ──────────────────────────────────────────────────────────────────
  summary: text("summary"),

  // ── Sources ──────────────────────────────────────────────────────────────────
  primary_source: text("primary_source"),
  supporting_sources: text("supporting_sources").array(),
  last_verified_date: date("last_verified_date"),

  created_at: timestamp("created_at").defaultNow(),
});

export const insertFmiTaxonomySchema = createInsertSchema(fmiTaxonomy).omit({ id: true, created_at: true });
export type InsertFmiTaxonomy = z.infer<typeof insertFmiTaxonomySchema>;
export type FmiTaxonomy = typeof fmiTaxonomy.$inferSelect;

// ── Geographic & Currency Reference Model ────────────────────────────────────

export const REGION_TYPES = [
  "economic_union",
  "payment_scheme_region",
  "geographic_region",
  "regulatory_region",
  "currency_union",
] as const;
export type RegionType = typeof REGION_TYPES[number];

// 1. Countries
export const countries = pgTable("countries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  iso2: varchar("iso2", { length: 2 }).notNull().unique(),
  iso3: varchar("iso3", { length: 3 }).notNull().unique(),
  numeric_code: integer("numeric_code"),
  official_name: text("official_name"),
  capital: text("capital"),
  region_hint: text("region_hint"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// 2. Currencies
export const geoCurrencies = pgTable("geo_currencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 10 }).notNull().unique(),
  name: text("name").notNull(),
  symbol: text("symbol"),
  minor_units: integer("minor_units").default(2),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// 3. Country ↔ Currency (many-to-many with is_primary + validity period)
export const countryCurrencies = pgTable("country_currencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  country_id: varchar("country_id").notNull().references(() => countries.id, { onDelete: "cascade" }),
  currency_id: varchar("currency_id").notNull().references(() => geoCurrencies.id, { onDelete: "cascade" }),
  is_primary: boolean("is_primary").default(true),
  valid_from: date("valid_from"),
  valid_to: date("valid_to"),
});

// 4. Regions (geographic / regulatory groupings)
export const regions = pgTable("regions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  type: text("type").notNull(),
  description: text("description"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// 5. Region membership (country ↔ region many-to-many)
export const regionMembers = pgTable("region_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  region_id: varchar("region_id").notNull().references(() => regions.id, { onDelete: "cascade" }),
  country_id: varchar("country_id").notNull().references(() => countries.id, { onDelete: "cascade" }),
});

// 6. Currency areas (currency ↔ region, with is_official flag)
export const currencyAreas = pgTable("currency_areas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  currency_id: varchar("currency_id").notNull().references(() => geoCurrencies.id, { onDelete: "cascade" }),
  region_id: varchar("region_id").notNull().references(() => regions.id, { onDelete: "cascade" }),
  is_official: boolean("is_official").default(true),
});

// Insert schemas and types
export const insertCountrySchema = createInsertSchema(countries).omit({ id: true, created_at: true, updated_at: true });
export type InsertCountry = z.infer<typeof insertCountrySchema>;
export type Country = typeof countries.$inferSelect;

export const insertGeoCurrencySchema = createInsertSchema(geoCurrencies).omit({ id: true, created_at: true, updated_at: true });
export type InsertGeoCurrency = z.infer<typeof insertGeoCurrencySchema>;
export type GeoCurrency = typeof geoCurrencies.$inferSelect;

export const insertCountryCurrencySchema = createInsertSchema(countryCurrencies).omit({ id: true });
export type InsertCountryCurrency = z.infer<typeof insertCountryCurrencySchema>;
export type CountryCurrency = typeof countryCurrencies.$inferSelect;

export const insertRegionSchema = createInsertSchema(regions).omit({ id: true, created_at: true, updated_at: true });
export type InsertRegion = z.infer<typeof insertRegionSchema>;
export type Region = typeof regions.$inferSelect;

export const insertRegionMemberSchema = createInsertSchema(regionMembers).omit({ id: true });
export type InsertRegionMember = z.infer<typeof insertRegionMemberSchema>;
export type RegionMember = typeof regionMembers.$inferSelect;

export const insertCurrencyAreaSchema = createInsertSchema(currencyAreas).omit({ id: true });
export type InsertCurrencyArea = z.infer<typeof insertCurrencyAreaSchema>;
export type CurrencyArea = typeof currencyAreas.$inferSelect;

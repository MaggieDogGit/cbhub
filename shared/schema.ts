import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, date, pgEnum, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const gsibStatusEnum = pgEnum("gsib_status", ["G-SIB", "D-SIB", "N/A"]);
export const entityTypeEnum = pgEnum("entity_type", ["Bank", "Branch", "Subsidiary", "Representative Office", "Other"]);
export const currencyEnum = pgEnum("currency", ["EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR"]);
export const clearingModelEnum = pgEnum("clearing_model", ["Onshore", "Offshore"]);
export const serviceTypeEnum = pgEnum("service_type", ["Correspondent Banking","Currency Clearing","RTGS Participation","Instant Payments Access","FX Liquidity","CLS Settlement","CLS Third Party Settlement","CLS Nostro Payments","Custody Services","Transaction Banking","Liquidity Services"]);
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
  last_verified: date("last_verified"),
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
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, created_at: true });
export const insertMessageSchema = createInsertSchema(chatMessages).omit({ id: true, created_at: true });

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

export const agentJobs = pgTable("agent_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  banking_group_id: varchar("banking_group_id").notNull(),
  banking_group_name: text("banking_group_name").notNull(),
  status: text("status").notNull().default("pending"),
  conversation_id: varchar("conversation_id"),
  queued_at: timestamp("queued_at").defaultNow(),
  started_at: timestamp("started_at"),
  completed_at: timestamp("completed_at"),
  error_message: text("error_message"),
  steps_completed: integer("steps_completed").default(0),
  currency_scope: text("currency_scope").notNull().default("home_only"),
});

export const insertAgentJobSchema = createInsertSchema(agentJobs).omit({ id: true, queued_at: true });
export type InsertAgentJob = z.infer<typeof insertAgentJobSchema>;
export type AgentJob = typeof agentJobs.$inferSelect;

export const insertUserSchema = z.object({ username: z.string(), password: z.string() });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = { id: string; username: string; password: string };

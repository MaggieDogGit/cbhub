import { eq, and, desc } from "drizzle-orm";
import { db } from "./db";
import {
  bankingGroups, legalEntities, bics, correspondentServices,
  clsProfiles, fmis, fmiRegistry, fmiResearchJobs, dataSources, conversations, chatMessages, agentJobs,
  intelObservations,
  type BankingGroup, type InsertBankingGroup,
  type LegalEntity, type InsertLegalEntity,
  type Bic, type InsertBic,
  type CorrespondentService, type InsertCorrespondentService,
  type ClsProfile, type InsertClsProfile,
  type Fmi, type InsertFmi,
  type FmiRegistry, type InsertFmiRegistry,
  type FmiResearchJob, type InsertFmiResearchJob,
  type DataSource, type InsertDataSource,
  type Conversation, type InsertConversation,
  type ChatMessage, type InsertMessage,
  type AgentJob, type InsertAgentJob,
  type IntelObservation, type InsertIntelObservation,
  type User, type InsertUser,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // BankingGroups
  listBankingGroups(): Promise<BankingGroup[]>;
  getBankingGroup(id: string): Promise<BankingGroup | undefined>;
  createBankingGroup(data: InsertBankingGroup): Promise<BankingGroup>;
  updateBankingGroup(id: string, data: Partial<InsertBankingGroup>): Promise<BankingGroup>;
  deleteBankingGroup(id: string): Promise<void>;

  // LegalEntities
  listLegalEntities(): Promise<LegalEntity[]>;
  getLegalEntity(id: string): Promise<LegalEntity | undefined>;
  createLegalEntity(data: InsertLegalEntity): Promise<LegalEntity>;
  updateLegalEntity(id: string, data: Partial<InsertLegalEntity>): Promise<LegalEntity>;
  deleteLegalEntity(id: string): Promise<void>;

  // BICs
  listBics(): Promise<Bic[]>;
  getBic(id: string): Promise<Bic | undefined>;
  createBic(data: InsertBic): Promise<Bic>;
  updateBic(id: string, data: Partial<InsertBic>): Promise<Bic>;
  deleteBic(id: string): Promise<void>;

  // CorrespondentServices
  listCorrespondentServices(currency?: string): Promise<CorrespondentService[]>;
  getCorrespondentService(id: string): Promise<CorrespondentService | undefined>;
  createCorrespondentService(data: InsertCorrespondentService): Promise<CorrespondentService>;
  updateCorrespondentService(id: string, data: Partial<InsertCorrespondentService>): Promise<CorrespondentService>;
  deleteCorrespondentService(id: string): Promise<void>;

  // CLSProfiles
  listClsProfiles(): Promise<ClsProfile[]>;
  getClsProfile(id: string): Promise<ClsProfile | undefined>;
  createClsProfile(data: InsertClsProfile): Promise<ClsProfile>;
  updateClsProfile(id: string, data: Partial<InsertClsProfile>): Promise<ClsProfile>;
  deleteClsProfile(id: string): Promise<void>;

  // FMIs
  listFmis(): Promise<Fmi[]>;
  listFmisByName(fmiName: string): Promise<Fmi[]>;
  getFmi(id: string): Promise<Fmi | undefined>;
  createFmi(data: InsertFmi): Promise<Fmi>;
  updateFmi(id: string, data: Partial<InsertFmi>): Promise<Fmi>;
  deleteFmi(id: string): Promise<void>;

  // FMI Registry
  listFmiRegistry(): Promise<FmiRegistry[]>;
  getFmiRegistryEntry(id: string): Promise<FmiRegistry | undefined>;
  getFmiRegistryByName(name: string): Promise<FmiRegistry | undefined>;
  createFmiRegistryEntry(data: InsertFmiRegistry): Promise<FmiRegistry>;
  updateFmiRegistryEntry(id: string, data: Partial<InsertFmiRegistry>): Promise<FmiRegistry>;
  deleteFmiRegistryEntry(id: string): Promise<void>;

  // FMI Research Jobs
  listFmiResearchJobs(): Promise<FmiResearchJob[]>;
  getFmiResearchJob(id: string): Promise<FmiResearchJob | undefined>;
  createFmiResearchJob(data: InsertFmiResearchJob): Promise<FmiResearchJob>;
  updateFmiResearchJob(id: string, data: Partial<InsertFmiResearchJob>): Promise<FmiResearchJob>;

  // DataSources
  listDataSources(): Promise<DataSource[]>;
  getDataSource(id: string): Promise<DataSource | undefined>;
  createDataSource(data: InsertDataSource): Promise<DataSource>;
  updateDataSource(id: string, data: Partial<InsertDataSource>): Promise<DataSource>;
  deleteDataSource(id: string): Promise<void>;

  // Intel Observations
  listIntelObservations(filters?: { banking_group_id?: string; obs_type?: string }): Promise<IntelObservation[]>;
  createIntelObservation(data: InsertIntelObservation): Promise<IntelObservation>;
  updateIntelObservation(id: string, data: Partial<InsertIntelObservation>): Promise<IntelObservation>;
  deleteIntelObservation(id: string): Promise<void>;

  // Merge operations
  mergeLegalEntities(keepId: string, deleteId: string): Promise<{ moved_bics: number; moved_fmis: number; deleted_entity_id: string }>;
  mergeBankingGroups(keepId: string, deleteId: string): Promise<{ moved_entities: number; moved_cls_profiles: number; deleted_group_id: string }>;

  // Conversations
  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(data: InsertConversation): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  getOrCreateTopicConversation(topic: string): Promise<Conversation>;

  // ChatMessages
  listMessages(conversationId: string): Promise<ChatMessage[]>;
  createMessage(data: InsertMessage): Promise<ChatMessage>;

  // AgentJobs
  listJobs(): Promise<AgentJob[]>;
  getJob(id: string): Promise<AgentJob | undefined>;
  createJob(data: InsertAgentJob): Promise<AgentJob>;
  updateJob(id: string, data: Partial<AgentJob>): Promise<AgentJob>;
  deleteJob(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // BankingGroups
  async listBankingGroups() { return db.select().from(bankingGroups); }
  async getBankingGroup(id: string) { const [r] = await db.select().from(bankingGroups).where(eq(bankingGroups.id, id)); return r; }
  async createBankingGroup(data: InsertBankingGroup) { const [r] = await db.insert(bankingGroups).values(data).returning(); return r; }
  async updateBankingGroup(id: string, data: Partial<InsertBankingGroup>) { const [r] = await db.update(bankingGroups).set(data).where(eq(bankingGroups.id, id)).returning(); return r; }
  async deleteBankingGroup(id: string) { await db.delete(bankingGroups).where(eq(bankingGroups.id, id)); }

  // LegalEntities
  async listLegalEntities() { return db.select().from(legalEntities); }
  async getLegalEntity(id: string) { const [r] = await db.select().from(legalEntities).where(eq(legalEntities.id, id)); return r; }
  async createLegalEntity(data: InsertLegalEntity) { const [r] = await db.insert(legalEntities).values(data).returning(); return r; }
  async updateLegalEntity(id: string, data: Partial<InsertLegalEntity>) { const [r] = await db.update(legalEntities).set(data).where(eq(legalEntities.id, id)).returning(); return r; }
  async deleteLegalEntity(id: string) { await db.delete(legalEntities).where(eq(legalEntities.id, id)); }

  // BICs
  async listBics() { return db.select().from(bics); }
  async getBic(id: string) { const [r] = await db.select().from(bics).where(eq(bics.id, id)); return r; }
  async createBic(data: InsertBic) { const [r] = await db.insert(bics).values(data).returning(); return r; }
  async updateBic(id: string, data: Partial<InsertBic>) { const [r] = await db.update(bics).set(data).where(eq(bics.id, id)).returning(); return r; }
  async deleteBic(id: string) { await db.delete(bics).where(eq(bics.id, id)); }

  // CorrespondentServices
  async listCorrespondentServices(currency?: string) {
    if (currency) {
      return db.select().from(correspondentServices).where(eq(correspondentServices.currency, currency as any));
    }
    return db.select().from(correspondentServices);
  }
  async getCorrespondentService(id: string) { const [r] = await db.select().from(correspondentServices).where(eq(correspondentServices.id, id)); return r; }
  async createCorrespondentService(data: InsertCorrespondentService) { const [r] = await db.insert(correspondentServices).values(data).returning(); return r; }
  async updateCorrespondentService(id: string, data: Partial<InsertCorrespondentService>) { const [r] = await db.update(correspondentServices).set(data).where(eq(correspondentServices.id, id)).returning(); return r; }
  async deleteCorrespondentService(id: string) { await db.delete(correspondentServices).where(eq(correspondentServices.id, id)); }

  // CLSProfiles
  async listClsProfiles() { return db.select().from(clsProfiles); }
  async getClsProfile(id: string) { const [r] = await db.select().from(clsProfiles).where(eq(clsProfiles.id, id)); return r; }
  async createClsProfile(data: InsertClsProfile) { const [r] = await db.insert(clsProfiles).values(data).returning(); return r; }
  async updateClsProfile(id: string, data: Partial<InsertClsProfile>) { const [r] = await db.update(clsProfiles).set(data).where(eq(clsProfiles.id, id)).returning(); return r; }
  async deleteClsProfile(id: string) { await db.delete(clsProfiles).where(eq(clsProfiles.id, id)); }

  // FMIs
  async listFmis() { return db.select().from(fmis); }
  async listFmisByName(fmiName: string) { return db.select().from(fmis).where(eq(fmis.fmi_name, fmiName)); }
  async getFmi(id: string) { const [r] = await db.select().from(fmis).where(eq(fmis.id, id)); return r; }
  async createFmi(data: InsertFmi) { const [r] = await db.insert(fmis).values(data).returning(); return r; }
  async updateFmi(id: string, data: Partial<InsertFmi>) { const [r] = await db.update(fmis).set(data).where(eq(fmis.id, id)).returning(); return r; }
  async deleteFmi(id: string) { await db.delete(fmis).where(eq(fmis.id, id)); }

  // FMI Registry
  async listFmiRegistry() { return db.select().from(fmiRegistry); }
  async getFmiRegistryEntry(id: string) { const [r] = await db.select().from(fmiRegistry).where(eq(fmiRegistry.id, id)); return r; }
  async getFmiRegistryByName(name: string) { const [r] = await db.select().from(fmiRegistry).where(eq(fmiRegistry.fmi_name, name)); return r; }
  async createFmiRegistryEntry(data: InsertFmiRegistry) { const [r] = await db.insert(fmiRegistry).values(data).returning(); return r; }
  async updateFmiRegistryEntry(id: string, data: Partial<InsertFmiRegistry>) { const [r] = await db.update(fmiRegistry).set(data).where(eq(fmiRegistry.id, id)).returning(); return r; }
  async deleteFmiRegistryEntry(id: string) { await db.delete(fmiRegistry).where(eq(fmiRegistry.id, id)); }

  // FMI Research Jobs
  async listFmiResearchJobs() { return db.select().from(fmiResearchJobs).orderBy(fmiResearchJobs.queued_at); }
  async getFmiResearchJob(id: string) { const [r] = await db.select().from(fmiResearchJobs).where(eq(fmiResearchJobs.id, id)); return r; }
  async createFmiResearchJob(data: InsertFmiResearchJob) { const [r] = await db.insert(fmiResearchJobs).values(data).returning(); return r; }
  async updateFmiResearchJob(id: string, data: Partial<InsertFmiResearchJob>) { const [r] = await db.update(fmiResearchJobs).set(data).where(eq(fmiResearchJobs.id, id)).returning(); return r; }

  // DataSources
  async listDataSources() { return db.select().from(dataSources).orderBy(dataSources.created_at); }
  async getDataSource(id: string) { const [r] = await db.select().from(dataSources).where(eq(dataSources.id, id)); return r; }
  async createDataSource(data: InsertDataSource) { const [r] = await db.insert(dataSources).values(data).returning(); return r; }
  async updateDataSource(id: string, data: Partial<InsertDataSource>) { const [r] = await db.update(dataSources).set(data).where(eq(dataSources.id, id)).returning(); return r; }
  async deleteDataSource(id: string) { await db.delete(dataSources).where(eq(dataSources.id, id)); }

  // Intel Observations
  async listIntelObservations(filters?: { banking_group_id?: string; obs_type?: string }) {
    let query = db.select().from(intelObservations).$dynamic();
    if (filters?.banking_group_id) query = query.where(eq(intelObservations.banking_group_id, filters.banking_group_id));
    return query.orderBy(desc(intelObservations.created_at));
  }
  async createIntelObservation(data: InsertIntelObservation) { const [r] = await db.insert(intelObservations).values(data).returning(); return r; }
  async updateIntelObservation(id: string, data: Partial<InsertIntelObservation>) { const [r] = await db.update(intelObservations).set(data).where(eq(intelObservations.id, id)).returning(); return r; }
  async deleteIntelObservation(id: string) { await db.delete(intelObservations).where(eq(intelObservations.id, id)); }

  // Merge operations
  async mergeLegalEntities(keepId: string, deleteId: string) {
    const [keeper] = await db.select().from(legalEntities).where(eq(legalEntities.id, keepId));
    if (!keeper) throw new Error(`Keep entity ${keepId} not found`);
    const keeperName = keeper.legal_name;
    const movedBics = await db.update(bics)
      .set({ legal_entity_id: keepId, legal_entity_name: keeperName })
      .where(eq(bics.legal_entity_id, deleteId));
    const movedFmis = await db.update(fmis)
      .set({ legal_entity_id: keepId, legal_entity_name: keeperName })
      .where(eq(fmis.legal_entity_id, deleteId));
    await db.update(intelObservations)
      .set({ legal_entity_id: keepId, legal_entity_name: keeperName })
      .where(eq(intelObservations.legal_entity_id, deleteId));
    await db.delete(legalEntities).where(eq(legalEntities.id, deleteId));
    return { moved_bics: movedBics.rowCount ?? 0, moved_fmis: movedFmis.rowCount ?? 0, deleted_entity_id: deleteId };
  }
  async mergeBankingGroups(keepId: string, deleteId: string) {
    const [keeper] = await db.select().from(bankingGroups).where(eq(bankingGroups.id, keepId));
    if (!keeper) throw new Error(`Keep group ${keepId} not found`);
    const keeperName = keeper.group_name;
    const movedEntities = await db.update(legalEntities)
      .set({ group_id: keepId, group_name: keeperName })
      .where(eq(legalEntities.group_id, deleteId));
    const movedCls = await db.update(clsProfiles)
      .set({ group_id: keepId, group_name: keeperName })
      .where(eq(clsProfiles.group_id, deleteId));
    await db.update(agentJobs)
      .set({ banking_group_id: keepId, banking_group_name: keeperName })
      .where(eq(agentJobs.banking_group_id, deleteId));
    await db.update(intelObservations)
      .set({ banking_group_id: keepId, banking_group_name: keeperName })
      .where(eq(intelObservations.banking_group_id, deleteId));
    await db.delete(bankingGroups).where(eq(bankingGroups.id, deleteId));
    return { moved_entities: movedEntities.rowCount ?? 0, moved_cls_profiles: movedCls.rowCount ?? 0, deleted_group_id: deleteId };
  }

  // Conversations
  async listConversations() { return db.select().from(conversations).orderBy(conversations.created_at); }
  async getConversation(id: string) { const [r] = await db.select().from(conversations).where(eq(conversations.id, id)); return r; }
  async createConversation(data: InsertConversation) { const [r] = await db.insert(conversations).values(data).returning(); return r; }
  async deleteConversation(id: string) {
    await db.delete(chatMessages).where(eq(chatMessages.conversation_id, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }
  async getOrCreateTopicConversation(topic: string) {
    const [existing] = await db.select().from(conversations).where(eq(conversations.topic, topic)).orderBy(desc(conversations.created_at)).limit(1);
    if (existing) return existing;
    const topicLabels: Record<string, string> = {
      "banking-groups": "Banking Groups",
      "entities-bics": "Legal Entities & BICs",
      "cb-services": "CB Services",
      "fmi": "FMI Memberships",
      "general": "General",
    };
    const [created] = await db.insert(conversations).values({ name: topicLabels[topic] ?? topic, topic }).returning();
    return created;
  }

  // ChatMessages
  async listMessages(conversationId: string) {
    return db.select().from(chatMessages).where(eq(chatMessages.conversation_id, conversationId)).orderBy(chatMessages.created_at);
  }
  async createMessage(data: InsertMessage) { const [r] = await db.insert(chatMessages).values(data).returning(); return r; }

  // AgentJobs
  async listJobs() { return db.select().from(agentJobs).orderBy(agentJobs.queued_at); }
  async getJob(id: string) { const [r] = await db.select().from(agentJobs).where(eq(agentJobs.id, id)); return r; }
  async createJob(data: InsertAgentJob) { const [r] = await db.insert(agentJobs).values(data).returning(); return r; }
  async updateJob(id: string, data: Partial<AgentJob>) { const [r] = await db.update(agentJobs).set(data as any).where(eq(agentJobs.id, id)).returning(); return r; }
  async deleteJob(id: string) { await db.delete(agentJobs).where(eq(agentJobs.id, id)); }
}

export const storage = new DatabaseStorage();

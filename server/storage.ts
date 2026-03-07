import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  bankingGroups, legalEntities, bics, correspondentServices,
  clsProfiles, fmis, conversations, chatMessages,
  type BankingGroup, type InsertBankingGroup,
  type LegalEntity, type InsertLegalEntity,
  type Bic, type InsertBic,
  type CorrespondentService, type InsertCorrespondentService,
  type ClsProfile, type InsertClsProfile,
  type Fmi, type InsertFmi,
  type Conversation, type InsertConversation,
  type ChatMessage, type InsertMessage,
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
  getFmi(id: string): Promise<Fmi | undefined>;
  createFmi(data: InsertFmi): Promise<Fmi>;
  updateFmi(id: string, data: Partial<InsertFmi>): Promise<Fmi>;
  deleteFmi(id: string): Promise<void>;

  // Conversations
  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(data: InsertConversation): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;

  // ChatMessages
  listMessages(conversationId: string): Promise<ChatMessage[]>;
  createMessage(data: InsertMessage): Promise<ChatMessage>;
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
  async getFmi(id: string) { const [r] = await db.select().from(fmis).where(eq(fmis.id, id)); return r; }
  async createFmi(data: InsertFmi) { const [r] = await db.insert(fmis).values(data).returning(); return r; }
  async updateFmi(id: string, data: Partial<InsertFmi>) { const [r] = await db.update(fmis).set(data).where(eq(fmis.id, id)).returning(); return r; }
  async deleteFmi(id: string) { await db.delete(fmis).where(eq(fmis.id, id)); }

  // Conversations
  async listConversations() { return db.select().from(conversations).orderBy(conversations.created_at); }
  async getConversation(id: string) { const [r] = await db.select().from(conversations).where(eq(conversations.id, id)); return r; }
  async createConversation(data: InsertConversation) { const [r] = await db.insert(conversations).values(data).returning(); return r; }
  async deleteConversation(id: string) {
    await db.delete(chatMessages).where(eq(chatMessages.conversation_id, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  // ChatMessages
  async listMessages(conversationId: string) {
    return db.select().from(chatMessages).where(eq(chatMessages.conversation_id, conversationId)).orderBy(chatMessages.created_at);
  }
  async createMessage(data: InsertMessage) { const [r] = await db.insert(chatMessages).values(data).returning(); return r; }
}

export const storage = new DatabaseStorage();

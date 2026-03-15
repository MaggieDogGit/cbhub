// Compatibility facade — DatabaseStorage delegates all data access to focused repositories.
// The IStorage interface and `storage` singleton export are preserved for backward compatibility.
// New code should prefer importing from server/repositories/ directly.

import * as bgRepo from "./repositories/bankingGroupRepository";
import * as leRepo from "./repositories/legalEntityRepository";
import * as bicRepo from "./repositories/bicRepository";
import * as csRepo from "./repositories/correspondentServiceRepository";
import * as jobRepo from "./repositories/jobRepository";
import * as resRepo from "./repositories/researchRepository";
import * as fmiTaxRepo from "./repositories/fmiTaxonomyRepository";
import type { FmiEntryFilter, FmiEntryWithCategory } from "./repositories/fmiTaxonomyRepository";
import type {
  BankingGroup, InsertBankingGroup,
  LegalEntity, InsertLegalEntity,
  Bic, InsertBic,
  CorrespondentService, InsertCorrespondentService,
  ClsProfile, InsertClsProfile,
  Fmi, InsertFmi,
  FmiRegistry, InsertFmiRegistry,
  FmiResearchJob, InsertFmiResearchJob,
  FmiEntry, InsertFmiEntry,
  FmiSpecification, InsertFmiSpecification,
  DataSource, InsertDataSource,
  Conversation, InsertConversation,
  ChatMessage, InsertMessage,
  AgentJob, InsertAgentJob,
  IntelObservation, InsertIntelObservation,
  CbTaxonomyItem, CbCapabilityValue, InsertCbCapabilityValue,
  CbSchemeMaster,
  CbIndirectParticipation, InsertCbIndirectParticipation,
} from "@shared/schema";

export interface IDashboardQueries {
  getDashboardCurrencyProviders(): Promise<{ currency: string; count: number; banks: string[] }[]>;
  getDashboardCoverageMap(): Promise<any[]>;
}

export interface IStorage extends IDashboardQueries {
  listBankingGroups(): Promise<BankingGroup[]>;
  getBankingGroup(id: string): Promise<BankingGroup | undefined>;
  createBankingGroup(data: InsertBankingGroup): Promise<BankingGroup>;
  updateBankingGroup(id: string, data: Partial<InsertBankingGroup>): Promise<BankingGroup>;
  deleteBankingGroup(id: string): Promise<void>;

  listLegalEntities(): Promise<LegalEntity[]>;
  getLegalEntity(id: string): Promise<LegalEntity | undefined>;
  createLegalEntity(data: InsertLegalEntity): Promise<LegalEntity>;
  updateLegalEntity(id: string, data: Partial<InsertLegalEntity>): Promise<LegalEntity>;
  deleteLegalEntity(id: string): Promise<void>;

  listBics(): Promise<Bic[]>;
  getBic(id: string): Promise<Bic | undefined>;
  createBic(data: InsertBic): Promise<Bic>;
  updateBic(id: string, data: Partial<InsertBic>): Promise<Bic>;
  deleteBic(id: string): Promise<void>;

  listCorrespondentServices(currency?: string): Promise<CorrespondentService[]>;
  getCorrespondentService(id: string): Promise<CorrespondentService | undefined>;
  createCorrespondentService(data: InsertCorrespondentService): Promise<CorrespondentService>;
  updateCorrespondentService(id: string, data: Partial<InsertCorrespondentService>): Promise<CorrespondentService>;
  deleteCorrespondentService(id: string): Promise<void>;

  listClsProfiles(): Promise<ClsProfile[]>;
  getClsProfile(id: string): Promise<ClsProfile | undefined>;
  createClsProfile(data: InsertClsProfile): Promise<ClsProfile>;
  updateClsProfile(id: string, data: Partial<InsertClsProfile>): Promise<ClsProfile>;
  deleteClsProfile(id: string): Promise<void>;

  listFmis(): Promise<Fmi[]>;
  listFmisByName(fmiName: string): Promise<Fmi[]>;
  getFmi(id: string): Promise<Fmi | undefined>;
  createFmi(data: InsertFmi): Promise<Fmi>;
  updateFmi(id: string, data: Partial<InsertFmi>): Promise<Fmi>;
  deleteFmi(id: string): Promise<void>;

  listFmiRegistry(): Promise<FmiRegistry[]>;
  getFmiRegistryEntry(id: string): Promise<FmiRegistry | undefined>;
  getFmiRegistryByName(name: string): Promise<FmiRegistry | undefined>;
  createFmiRegistryEntry(data: InsertFmiRegistry): Promise<FmiRegistry>;
  updateFmiRegistryEntry(id: string, data: Partial<InsertFmiRegistry>): Promise<FmiRegistry>;
  deleteFmiRegistryEntry(id: string): Promise<void>;

  listFmiResearchJobs(): Promise<FmiResearchJob[]>;
  getFmiResearchJob(id: string): Promise<FmiResearchJob | undefined>;
  createFmiResearchJob(data: InsertFmiResearchJob): Promise<FmiResearchJob>;
  updateFmiResearchJob(id: string, data: Partial<InsertFmiResearchJob>): Promise<FmiResearchJob>;

  listDataSources(): Promise<DataSource[]>;
  getDataSource(id: string): Promise<DataSource | undefined>;
  createDataSource(data: InsertDataSource): Promise<DataSource>;
  updateDataSource(id: string, data: Partial<InsertDataSource>): Promise<DataSource>;
  deleteDataSource(id: string): Promise<void>;

  listIntelObservations(filters?: { banking_group_id?: string; obs_type?: string }): Promise<IntelObservation[]>;
  createIntelObservation(data: InsertIntelObservation): Promise<IntelObservation>;
  updateIntelObservation(id: string, data: Partial<InsertIntelObservation>): Promise<IntelObservation>;
  deleteIntelObservation(id: string): Promise<void>;

  mergeLegalEntities(keepId: string, deleteId: string): Promise<{ moved_bics: number; moved_fmis: number; deleted_entity_id: string }>;
  mergeBankingGroups(keepId: string, deleteId: string): Promise<{ moved_entities: number; moved_cls_profiles: number; deleted_group_id: string }>;

  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(data: InsertConversation): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  getOrCreateTopicConversation(topic: string): Promise<Conversation>;

  listMessages(conversationId: string): Promise<ChatMessage[]>;
  createMessage(data: InsertMessage): Promise<ChatMessage>;

  listJobs(): Promise<AgentJob[]>;
  getJob(id: string): Promise<AgentJob | undefined>;
  createJob(data: InsertAgentJob): Promise<AgentJob>;
  updateJob(id: string, data: Partial<AgentJob>): Promise<AgentJob>;
  deleteJob(id: string): Promise<void>;

  getCbTaxonomy(): Promise<CbTaxonomyItem[]>;
  getCbCapabilities(groupId: string): Promise<CbCapabilityValue[]>;
  upsertCbCapability(data: InsertCbCapabilityValue): Promise<CbCapabilityValue>;
  deleteCbCapability(id: string): Promise<void>;
  getCbSchemes(): Promise<CbSchemeMaster[]>;
  getCbIndirectParticipation(groupId: string): Promise<CbIndirectParticipation[]>;
  upsertCbIndirectParticipation(data: InsertCbIndirectParticipation): Promise<CbIndirectParticipation>;
  deleteCbIndirectParticipation(id: string): Promise<void>;

  findFmiEntries(filter: FmiEntryFilter): Promise<FmiEntryWithCategory[]>;
  updateFmiEntry(id: string, data: Partial<InsertFmiEntry>): Promise<FmiEntry>;
  listFmiCategories(): Promise<any[]>;
  getFmiSpecification(fmiId: string): Promise<FmiSpecification | undefined>;
  updateFmiSpecification(fmiId: string, data: Partial<InsertFmiSpecification>): Promise<FmiSpecification>;
  findCountry(nameOrCode: string): Promise<any>;
  findCurrency(code: string): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  // Banking Groups
  listBankingGroups()                                                    { return bgRepo.listBankingGroups(); }
  getBankingGroup(id: string)                                            { return bgRepo.getBankingGroup(id); }
  createBankingGroup(data: InsertBankingGroup)                           { return bgRepo.createBankingGroup(data); }
  updateBankingGroup(id: string, data: Partial<InsertBankingGroup>)      { return bgRepo.updateBankingGroup(id, data); }
  deleteBankingGroup(id: string)                                         { return bgRepo.deleteBankingGroup(id); }
  mergeBankingGroups(keepId: string, deleteId: string)                   { return bgRepo.mergeBankingGroups(keepId, deleteId); }

  // Legal Entities
  listLegalEntities()                                                    { return leRepo.listLegalEntities(); }
  getLegalEntity(id: string)                                             { return leRepo.getLegalEntity(id); }
  createLegalEntity(data: InsertLegalEntity)                             { return leRepo.createLegalEntity(data); }
  updateLegalEntity(id: string, data: Partial<InsertLegalEntity>)        { return leRepo.updateLegalEntity(id, data); }
  deleteLegalEntity(id: string)                                          { return leRepo.deleteLegalEntity(id); }
  mergeLegalEntities(keepId: string, deleteId: string)                   { return leRepo.mergeLegalEntities(keepId, deleteId); }

  // BICs
  listBics()                                                             { return bicRepo.listBics(); }
  getBic(id: string)                                                     { return bicRepo.getBic(id); }
  createBic(data: InsertBic)                                             { return bicRepo.createBic(data); }
  updateBic(id: string, data: Partial<InsertBic>)                        { return bicRepo.updateBic(id, data); }
  deleteBic(id: string)                                                  { return bicRepo.deleteBic(id); }

  // Correspondent Services
  listCorrespondentServices(currency?: string)                           { return csRepo.listCorrespondentServices(currency); }
  getCorrespondentService(id: string)                                    { return csRepo.getCorrespondentService(id); }
  createCorrespondentService(data: InsertCorrespondentService)           { return csRepo.createCorrespondentService(data); }
  updateCorrespondentService(id: string, data: Partial<InsertCorrespondentService>) { return csRepo.updateCorrespondentService(id, data); }
  deleteCorrespondentService(id: string)                                 { return csRepo.deleteCorrespondentService(id); }

  // CLS Profiles
  listClsProfiles()                                                      { return csRepo.listClsProfiles(); }
  getClsProfile(id: string)                                              { return csRepo.getClsProfile(id); }
  createClsProfile(data: InsertClsProfile)                               { return csRepo.createClsProfile(data); }
  updateClsProfile(id: string, data: Partial<InsertClsProfile>)          { return csRepo.updateClsProfile(id, data); }
  deleteClsProfile(id: string)                                           { return csRepo.deleteClsProfile(id); }

  // FMIs
  listFmis()                                                             { return csRepo.listFmis(); }
  listFmisByName(fmiName: string)                                        { return csRepo.listFmisByName(fmiName); }
  getFmi(id: string)                                                     { return csRepo.getFmi(id); }
  createFmi(data: InsertFmi)                                             { return csRepo.createFmi(data); }
  updateFmi(id: string, data: Partial<InsertFmi>)                        { return csRepo.updateFmi(id, data); }
  deleteFmi(id: string)                                                  { return csRepo.deleteFmi(id); }

  // FMI Registry
  listFmiRegistry()                                                      { return csRepo.listFmiRegistry(); }
  getFmiRegistryEntry(id: string)                                        { return csRepo.getFmiRegistryEntry(id); }
  getFmiRegistryByName(name: string)                                     { return csRepo.getFmiRegistryByName(name); }
  createFmiRegistryEntry(data: InsertFmiRegistry)                        { return csRepo.createFmiRegistryEntry(data); }
  updateFmiRegistryEntry(id: string, data: Partial<InsertFmiRegistry>)   { return csRepo.updateFmiRegistryEntry(id, data); }
  deleteFmiRegistryEntry(id: string)                                     { return csRepo.deleteFmiRegistryEntry(id); }

  // FMI Research Jobs
  listFmiResearchJobs()                                                  { return resRepo.listFmiResearchJobs(); }
  getFmiResearchJob(id: string)                                          { return resRepo.getFmiResearchJob(id); }
  createFmiResearchJob(data: InsertFmiResearchJob)                       { return resRepo.createFmiResearchJob(data); }
  updateFmiResearchJob(id: string, data: Partial<InsertFmiResearchJob>)  { return resRepo.updateFmiResearchJob(id, data); }

  // Data Sources
  listDataSources()                                                      { return resRepo.listDataSources(); }
  getDataSource(id: string)                                              { return resRepo.getDataSource(id); }
  createDataSource(data: InsertDataSource)                               { return resRepo.createDataSource(data); }
  updateDataSource(id: string, data: Partial<InsertDataSource>)          { return resRepo.updateDataSource(id, data); }
  deleteDataSource(id: string)                                           { return resRepo.deleteDataSource(id); }

  // Intel Observations
  listIntelObservations(filters?: { banking_group_id?: string; obs_type?: string }) { return resRepo.listIntelObservations(filters); }
  createIntelObservation(data: InsertIntelObservation)                   { return resRepo.createIntelObservation(data); }
  updateIntelObservation(id: string, data: Partial<InsertIntelObservation>) { return resRepo.updateIntelObservation(id, data); }
  deleteIntelObservation(id: string)                                     { return resRepo.deleteIntelObservation(id); }

  // Conversations
  listConversations()                                                    { return jobRepo.listConversations(); }
  getConversation(id: string)                                            { return jobRepo.getConversation(id); }
  createConversation(data: InsertConversation)                           { return jobRepo.createConversation(data); }
  deleteConversation(id: string)                                         { return jobRepo.deleteConversation(id); }
  getOrCreateTopicConversation(topic: string)                            { return jobRepo.getOrCreateTopicConversation(topic); }

  // Chat Messages
  listMessages(conversationId: string)                                   { return jobRepo.listMessages(conversationId); }
  createMessage(data: InsertMessage)                                     { return jobRepo.createMessage(data); }

  // Agent Jobs
  listJobs()                                                             { return jobRepo.listJobs(); }
  getJob(id: string)                                                     { return jobRepo.getJob(id); }
  createJob(data: InsertAgentJob)                                        { return jobRepo.createJob(data); }
  updateJob(id: string, data: Partial<AgentJob>)                         { return jobRepo.updateJob(id, data); }
  deleteJob(id: string)                                                  { return jobRepo.deleteJob(id); }

  // CB Taxonomy
  getCbTaxonomy()                                                        { return resRepo.getCbTaxonomy(); }
  getCbCapabilities(groupId: string)                                     { return resRepo.getCbCapabilities(groupId); }
  upsertCbCapability(data: InsertCbCapabilityValue)                      { return resRepo.upsertCbCapability(data); }
  deleteCbCapability(id: string)                                         { return resRepo.deleteCbCapability(id); }
  getCbSchemes()                                                         { return resRepo.getCbSchemes(); }
  getCbIndirectParticipation(groupId: string)                            { return resRepo.getCbIndirectParticipation(groupId); }
  upsertCbIndirectParticipation(data: InsertCbIndirectParticipation)     { return resRepo.upsertCbIndirectParticipation(data); }
  deleteCbIndirectParticipation(id: string)                              { return resRepo.deleteCbIndirectParticipation(id); }

  // FMI Taxonomy v2
  findFmiEntries(filter: FmiEntryFilter)                                 { return fmiTaxRepo.findFmiEntries(filter); }
  updateFmiEntry(id: string, data: Partial<InsertFmiEntry>)              { return fmiTaxRepo.updateFmiEntry(id, data); }
  listFmiCategories()                                                    { return fmiTaxRepo.listFmiCategories(); }
  getFmiSpecification(fmiId: string)                                     { return fmiTaxRepo.getFmiSpecification(fmiId); }
  updateFmiSpecification(fmiId: string, data: Partial<InsertFmiSpecification>) { return fmiTaxRepo.updateFmiSpecification(fmiId, data); }

  // Geographic & Currency Reference
  findCountry(nameOrCode: string)                                        { return fmiTaxRepo.findCountry(nameOrCode); }
  findCurrency(code: string)                                             { return fmiTaxRepo.findCurrency(code); }

  // Dashboard analytics
  getDashboardCurrencyProviders()                                        { return csRepo.getDashboardCurrencyProviders(); }
  getDashboardCoverageMap()                                              { return csRepo.getDashboardCoverageMap(); }
}

export const storage = new DatabaseStorage();

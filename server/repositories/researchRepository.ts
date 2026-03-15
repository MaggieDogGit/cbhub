import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  dataSources, intelObservations, fmiResearchJobs,
  cbTaxonomyItems, cbCapabilityValues, cbSchemeMaster, cbIndirectParticipation,
  type DataSource, type InsertDataSource,
  type IntelObservation, type InsertIntelObservation,
  type FmiResearchJob, type InsertFmiResearchJob,
  type CbTaxonomyItem, type InsertCbTaxonomyItem,
  type CbCapabilityValue, type InsertCbCapabilityValue,
  type CbSchemeMaster, type InsertCbSchemeMaster,
  type CbIndirectParticipation, type InsertCbIndirectParticipation,
} from "@shared/schema";

// ── Data Sources ─────────────────────────────────────────────────────────────

export async function listDataSources(): Promise<DataSource[]> {
  return db.select().from(dataSources).orderBy(dataSources.created_at);
}

export async function getDataSource(id: string): Promise<DataSource | undefined> {
  const [r] = await db.select().from(dataSources).where(eq(dataSources.id, id));
  return r;
}

export async function createDataSource(data: InsertDataSource): Promise<DataSource> {
  const [r] = await db.insert(dataSources).values(data).returning();
  return r;
}

export async function updateDataSource(id: string, data: Partial<InsertDataSource>): Promise<DataSource> {
  const [r] = await db.update(dataSources).set(data).where(eq(dataSources.id, id)).returning();
  return r;
}

export async function deleteDataSource(id: string): Promise<void> {
  await db.delete(dataSources).where(eq(dataSources.id, id));
}

// ── Intel Observations ───────────────────────────────────────────────────────

export async function listIntelObservations(
  filters?: { banking_group_id?: string; obs_type?: string },
): Promise<IntelObservation[]> {
  let query = db.select().from(intelObservations).$dynamic();
  if (filters?.banking_group_id) {
    query = query.where(eq(intelObservations.banking_group_id, filters.banking_group_id));
  }
  return query.orderBy(desc(intelObservations.created_at));
}

export async function createIntelObservation(data: InsertIntelObservation): Promise<IntelObservation> {
  const [r] = await db.insert(intelObservations).values(data).returning();
  return r;
}

export async function updateIntelObservation(
  id: string,
  data: Partial<InsertIntelObservation>,
): Promise<IntelObservation> {
  const [r] = await db.update(intelObservations).set(data).where(eq(intelObservations.id, id)).returning();
  return r;
}

export async function deleteIntelObservation(id: string): Promise<void> {
  await db.delete(intelObservations).where(eq(intelObservations.id, id));
}

// ── FMI Research Jobs ────────────────────────────────────────────────────────

export async function listFmiResearchJobs(): Promise<FmiResearchJob[]> {
  return db.select().from(fmiResearchJobs).orderBy(fmiResearchJobs.queued_at);
}

export async function getFmiResearchJob(id: string): Promise<FmiResearchJob | undefined> {
  const [r] = await db.select().from(fmiResearchJobs).where(eq(fmiResearchJobs.id, id));
  return r;
}

export async function createFmiResearchJob(data: InsertFmiResearchJob): Promise<FmiResearchJob> {
  const [r] = await db.insert(fmiResearchJobs).values(data).returning();
  return r;
}

export async function updateFmiResearchJob(
  id: string,
  data: Partial<InsertFmiResearchJob>,
): Promise<FmiResearchJob> {
  const [r] = await db.update(fmiResearchJobs).set(data).where(eq(fmiResearchJobs.id, id)).returning();
  return r;
}

// ── CB Taxonomy ──────────────────────────────────────────────────────────────

export async function getCbTaxonomy(): Promise<CbTaxonomyItem[]> {
  return db
    .select()
    .from(cbTaxonomyItems)
    .where(eq(cbTaxonomyItems.active, true))
    .orderBy(cbTaxonomyItems.category, cbTaxonomyItems.display_order);
}

export async function findCbTaxonomyItems(
  filter: { category?: string; name_contains?: string },
): Promise<CbTaxonomyItem[]> {
  const conditions: any[] = [eq(cbTaxonomyItems.active, true)];
  if (filter.category) conditions.push(eq(cbTaxonomyItems.category, filter.category));
  if (filter.name_contains) conditions.push(sql`${cbTaxonomyItems.name} ILIKE ${'%' + filter.name_contains + '%'}`);
  return db
    .select()
    .from(cbTaxonomyItems)
    .where(and(...conditions))
    .orderBy(cbTaxonomyItems.category, cbTaxonomyItems.display_order);
}

export async function updateCbCapabilityValue(
  id: string,
  data: Partial<InsertCbCapabilityValue>,
): Promise<CbCapabilityValue> {
  const [r] = await db
    .update(cbCapabilityValues)
    .set({ ...data, updated_at: new Date() } as Partial<CbCapabilityValue>)
    .where(eq(cbCapabilityValues.id, id))
    .returning();
  return r;
}

export async function getCbCapabilities(groupId: string): Promise<CbCapabilityValue[]> {
  return db.select().from(cbCapabilityValues).where(eq(cbCapabilityValues.banking_group_id, groupId));
}

export async function upsertCbCapability(data: InsertCbCapabilityValue): Promise<CbCapabilityValue> {
  const leIsNull = sql`${cbCapabilityValues.legal_entity_id} IS NULL`;
  const csIsNull = sql`${cbCapabilityValues.correspondent_service_id} IS NULL`;
  const leCond = data.legal_entity_id
    ? eq(cbCapabilityValues.legal_entity_id, data.legal_entity_id)
    : leIsNull;
  const csCond = data.correspondent_service_id
    ? eq(cbCapabilityValues.correspondent_service_id, data.correspondent_service_id)
    : csIsNull;

  const [existing] = await db.select().from(cbCapabilityValues).where(
    and(
      eq(cbCapabilityValues.banking_group_id, data.banking_group_id),
      eq(cbCapabilityValues.taxonomy_item_id, data.taxonomy_item_id),
      leCond,
      csCond,
    ),
  );

  if (existing) {
    const [r] = await db
      .update(cbCapabilityValues)
      .set({ ...data, updated_at: new Date() } as Partial<CbCapabilityValue>)
      .where(eq(cbCapabilityValues.id, existing.id))
      .returning();
    return r;
  }

  const [r] = await db.insert(cbCapabilityValues).values(data).returning();
  return r;
}

export async function deleteCbCapability(id: string): Promise<void> {
  await db.delete(cbCapabilityValues).where(eq(cbCapabilityValues.id, id));
}

export async function getCbSchemes(): Promise<CbSchemeMaster[]> {
  return db
    .select()
    .from(cbSchemeMaster)
    .where(eq(cbSchemeMaster.active, true))
    .orderBy(cbSchemeMaster.display_order);
}

export async function getCbIndirectParticipation(groupId: string): Promise<CbIndirectParticipation[]> {
  return db
    .select()
    .from(cbIndirectParticipation)
    .where(eq(cbIndirectParticipation.banking_group_id, groupId));
}

export async function upsertCbIndirectParticipation(
  data: InsertCbIndirectParticipation,
): Promise<CbIndirectParticipation> {
  const [existing] = await db.select().from(cbIndirectParticipation).where(
    and(
      eq(cbIndirectParticipation.legal_entity_id, data.legal_entity_id),
      eq(cbIndirectParticipation.scheme_id, data.scheme_id),
    ),
  );

  if (existing) {
    const [r] = await db
      .update(cbIndirectParticipation)
      .set({ ...data, updated_at: new Date() } as Partial<CbIndirectParticipation>)
      .where(eq(cbIndirectParticipation.id, existing.id))
      .returning();
    return r;
  }

  const [r] = await db.insert(cbIndirectParticipation).values(data).returning();
  return r;
}

export async function deleteCbIndirectParticipation(id: string): Promise<void> {
  await db.delete(cbIndirectParticipation).where(eq(cbIndirectParticipation.id, id));
}

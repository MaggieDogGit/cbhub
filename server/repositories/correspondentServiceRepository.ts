import { eq, desc } from "drizzle-orm";
import { db, pool } from "../db";
import {
  correspondentServices, clsProfiles, fmis, fmiRegistry,
  type CorrespondentService, type InsertCorrespondentService,
  type ClsProfile, type InsertClsProfile,
  type Fmi, type InsertFmi,
  type FmiRegistry, type InsertFmiRegistry,
} from "@shared/schema";

// ── Correspondent Services ─────────────────────────────────────────────────

export async function listCorrespondentServices(currency?: string): Promise<CorrespondentService[]> {
  if (currency) {
    return db.select().from(correspondentServices).where(eq(correspondentServices.currency, currency as any));
  }
  return db.select().from(correspondentServices);
}

export async function getCorrespondentService(id: string): Promise<CorrespondentService | undefined> {
  const [r] = await db.select().from(correspondentServices).where(eq(correspondentServices.id, id));
  return r;
}

export async function createCorrespondentService(data: InsertCorrespondentService): Promise<CorrespondentService> {
  const [r] = await db.insert(correspondentServices).values(data).returning();
  return r;
}

export async function updateCorrespondentService(
  id: string,
  data: Partial<InsertCorrespondentService>,
): Promise<CorrespondentService> {
  const [r] = await db.update(correspondentServices).set(data).where(eq(correspondentServices.id, id)).returning();
  return r;
}

export async function deleteCorrespondentService(id: string): Promise<void> {
  await db.delete(correspondentServices).where(eq(correspondentServices.id, id));
}

// ── CLS Profiles ────────────────────────────────────────────────────────────

export async function listClsProfiles(): Promise<ClsProfile[]> {
  return db.select().from(clsProfiles);
}

export async function getClsProfile(id: string): Promise<ClsProfile | undefined> {
  const [r] = await db.select().from(clsProfiles).where(eq(clsProfiles.id, id));
  return r;
}

export async function createClsProfile(data: InsertClsProfile): Promise<ClsProfile> {
  const [r] = await db.insert(clsProfiles).values(data).returning();
  return r;
}

export async function updateClsProfile(id: string, data: Partial<InsertClsProfile>): Promise<ClsProfile> {
  const [r] = await db.update(clsProfiles).set(data).where(eq(clsProfiles.id, id)).returning();
  return r;
}

export async function deleteClsProfile(id: string): Promise<void> {
  await db.delete(clsProfiles).where(eq(clsProfiles.id, id));
}

// ── FMIs ────────────────────────────────────────────────────────────────────

export async function listFmis(): Promise<Fmi[]> {
  return db.select().from(fmis);
}

export async function listFmisByName(fmiName: string): Promise<Fmi[]> {
  return db.select().from(fmis).where(eq(fmis.fmi_name, fmiName));
}

export async function getFmi(id: string): Promise<Fmi | undefined> {
  const [r] = await db.select().from(fmis).where(eq(fmis.id, id));
  return r;
}

export async function createFmi(data: InsertFmi): Promise<Fmi> {
  const [r] = await db.insert(fmis).values(data).returning();
  return r;
}

export async function updateFmi(id: string, data: Partial<InsertFmi>): Promise<Fmi> {
  const [r] = await db.update(fmis).set(data).where(eq(fmis.id, id)).returning();
  return r;
}

export async function deleteFmi(id: string): Promise<void> {
  await db.delete(fmis).where(eq(fmis.id, id));
}

// ── FMI Registry ────────────────────────────────────────────────────────────

export async function listFmiRegistry(): Promise<FmiRegistry[]> {
  return db.select().from(fmiRegistry);
}

export async function getFmiRegistryEntry(id: string): Promise<FmiRegistry | undefined> {
  const [r] = await db.select().from(fmiRegistry).where(eq(fmiRegistry.id, id));
  return r;
}

export async function getFmiRegistryByName(name: string): Promise<FmiRegistry | undefined> {
  const [r] = await db.select().from(fmiRegistry).where(eq(fmiRegistry.fmi_name, name));
  return r;
}

export async function createFmiRegistryEntry(data: InsertFmiRegistry): Promise<FmiRegistry> {
  const [r] = await db.insert(fmiRegistry).values(data).returning();
  return r;
}

export async function updateFmiRegistryEntry(id: string, data: Partial<InsertFmiRegistry>): Promise<FmiRegistry> {
  const [r] = await db.update(fmiRegistry).set(data).where(eq(fmiRegistry.id, id)).returning();
  return r;
}

export async function deleteFmiRegistryEntry(id: string): Promise<void> {
  await db.delete(fmiRegistry).where(eq(fmiRegistry.id, id));
}

// ── Dashboard analytics (raw SQL for cross-table aggregation) ───────────────

export async function getDashboardCurrencyProviders(): Promise<{ currency: string; count: number; banks: string[] }[]> {
  const result = await pool.query(`
    SELECT
      cs.currency,
      bg.group_name
    FROM correspondent_services cs
    JOIN bics b ON b.id = cs.bic_id
    JOIN legal_entities le ON le.id = b.legal_entity_id
    JOIN banking_groups bg ON bg.id = le.group_id
    WHERE cs.clearing_model = 'Onshore'
      AND cs.currency IS NOT NULL
      AND bg.group_name IS NOT NULL
  `);
  const map: Record<string, Set<string>> = {};
  for (const row of result.rows) {
    if (!map[row.currency]) map[row.currency] = new Set();
    map[row.currency].add(row.group_name);
  }
  return Object.entries(map)
    .map(([currency, banks]) => ({ currency, count: banks.size, banks: Array.from(banks).sort() }))
    .sort((a, b) => b.count - a.count);
}

export async function getDashboardCoverageMap(): Promise<any[]> {
  const result = await pool.query(`
    SELECT
      cs.country,
      cs.currency::text,
      bg.group_name,
      cs.rtgs_membership,
      cs.instant_scheme_access,
      cs.cls_member
    FROM correspondent_services cs
    JOIN bics b ON b.id = cs.bic_id
    JOIN legal_entities le ON le.id = b.legal_entity_id
    JOIN banking_groups bg ON bg.id = le.group_id
    WHERE cs.clearing_model = 'Onshore'
      AND cs.country IS NOT NULL
      AND cs.country != ''
  `);
  return result.rows;
}

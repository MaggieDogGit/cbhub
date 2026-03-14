import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  legalEntities, bics, fmis, intelObservations,
  type LegalEntity, type InsertLegalEntity,
} from "@shared/schema";

export async function listLegalEntities(): Promise<LegalEntity[]> {
  return db.select().from(legalEntities);
}

export async function getLegalEntity(id: string): Promise<LegalEntity | undefined> {
  const [r] = await db.select().from(legalEntities).where(eq(legalEntities.id, id));
  return r;
}

export async function createLegalEntity(data: InsertLegalEntity): Promise<LegalEntity> {
  const [r] = await db.insert(legalEntities).values(data).returning();
  return r;
}

export async function updateLegalEntity(id: string, data: Partial<InsertLegalEntity>): Promise<LegalEntity> {
  const [r] = await db.update(legalEntities).set(data).where(eq(legalEntities.id, id)).returning();
  return r;
}

export async function deleteLegalEntity(id: string): Promise<void> {
  await db.delete(legalEntities).where(eq(legalEntities.id, id));
}

export async function mergeLegalEntities(
  keepId: string,
  deleteId: string,
): Promise<{ moved_bics: number; moved_fmis: number; deleted_entity_id: string }> {
  const [keeper] = await db.select().from(legalEntities).where(eq(legalEntities.id, keepId));
  if (!keeper) throw new Error(`Keep entity ${keepId} not found`);
  const keeperName = keeper.legal_name;

  const movedBics = await db
    .update(bics)
    .set({ legal_entity_id: keepId, legal_entity_name: keeperName })
    .where(eq(bics.legal_entity_id, deleteId));

  const movedFmis = await db
    .update(fmis)
    .set({ legal_entity_id: keepId, legal_entity_name: keeperName })
    .where(eq(fmis.legal_entity_id, deleteId));

  await db
    .update(intelObservations)
    .set({ legal_entity_id: keepId, legal_entity_name: keeperName })
    .where(eq(intelObservations.legal_entity_id, deleteId));

  await db.delete(legalEntities).where(eq(legalEntities.id, deleteId));

  return {
    moved_bics: movedBics.rowCount ?? 0,
    moved_fmis: movedFmis.rowCount ?? 0,
    deleted_entity_id: deleteId,
  };
}

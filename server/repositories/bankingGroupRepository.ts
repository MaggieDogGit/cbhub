import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  bankingGroups, legalEntities, clsProfiles, agentJobs, intelObservations,
  type BankingGroup, type InsertBankingGroup,
} from "@shared/schema";

export async function listBankingGroups(): Promise<BankingGroup[]> {
  return db.select().from(bankingGroups);
}

export async function getBankingGroup(id: string): Promise<BankingGroup | undefined> {
  const [r] = await db.select().from(bankingGroups).where(eq(bankingGroups.id, id));
  return r;
}

export async function createBankingGroup(data: InsertBankingGroup): Promise<BankingGroup> {
  const [r] = await db.insert(bankingGroups).values(data).returning();
  return r;
}

export async function updateBankingGroup(id: string, data: Partial<InsertBankingGroup>): Promise<BankingGroup> {
  const [r] = await db.update(bankingGroups).set(data).where(eq(bankingGroups.id, id)).returning();
  return r;
}

export async function deleteBankingGroup(id: string): Promise<void> {
  await db.delete(bankingGroups).where(eq(bankingGroups.id, id));
}

export async function mergeBankingGroups(
  keepId: string,
  deleteId: string,
): Promise<{ moved_entities: number; moved_cls_profiles: number; deleted_group_id: string }> {
  const [keeper] = await db.select().from(bankingGroups).where(eq(bankingGroups.id, keepId));
  if (!keeper) throw new Error(`Keep group ${keepId} not found`);
  const keeperName = keeper.group_name;

  const movedEntities = await db
    .update(legalEntities)
    .set({ group_id: keepId, group_name: keeperName })
    .where(eq(legalEntities.group_id, deleteId));

  const movedCls = await db
    .update(clsProfiles)
    .set({ group_id: keepId, group_name: keeperName })
    .where(eq(clsProfiles.group_id, deleteId));

  await db
    .update(agentJobs)
    .set({ banking_group_id: keepId, banking_group_name: keeperName })
    .where(eq(agentJobs.banking_group_id, deleteId));

  await db
    .update(intelObservations)
    .set({ banking_group_id: keepId, banking_group_name: keeperName })
    .where(eq(intelObservations.banking_group_id, deleteId));

  await db.delete(bankingGroups).where(eq(bankingGroups.id, deleteId));

  return {
    moved_entities: movedEntities.rowCount ?? 0,
    moved_cls_profiles: movedCls.rowCount ?? 0,
    deleted_group_id: deleteId,
  };
}

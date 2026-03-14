import { storage } from "../storage";
import type { InsertBankingGroup } from "@shared/schema";

export async function listBankingGroups() {
  return storage.listBankingGroups();
}

export async function createBankingGroup(data: InsertBankingGroup) {
  return storage.createBankingGroup(data);
}

export async function updateBankingGroup(id: string, data: Partial<InsertBankingGroup>) {
  return storage.updateBankingGroup(id, data);
}

export async function deleteBankingGroup(id: string) {
  return storage.deleteBankingGroup(id);
}

export async function mergeBankingGroups(keepId: string, deleteId: string) {
  return storage.mergeBankingGroups(keepId, deleteId);
}

export async function mergeLegalEntities(keepId: string, deleteId: string) {
  return storage.mergeLegalEntities(keepId, deleteId);
}

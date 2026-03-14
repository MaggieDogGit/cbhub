import { storage } from "../storage";

export async function mergeBankingGroups(keepId: string, deleteId: string) {
  return storage.mergeBankingGroups(keepId, deleteId);
}

export async function mergeLegalEntities(keepId: string, deleteId: string) {
  return storage.mergeLegalEntities(keepId, deleteId);
}

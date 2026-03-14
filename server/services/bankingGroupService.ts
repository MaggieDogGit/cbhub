// Banking Group Service — orchestrates group-level operations.
// Uses repositories directly for data access; storage facade for legacy compatibility.

import * as bgRepo from "../repositories/bankingGroupRepository";
import * as leRepo from "../repositories/legalEntityRepository";
import type { InsertBankingGroup } from "@shared/schema";

export async function listBankingGroups() {
  return bgRepo.listBankingGroups();
}

export async function getBankingGroup(id: string) {
  return bgRepo.getBankingGroup(id);
}

export async function createBankingGroup(data: InsertBankingGroup) {
  return bgRepo.createBankingGroup(data);
}

export async function updateBankingGroup(id: string, data: Partial<InsertBankingGroup>) {
  return bgRepo.updateBankingGroup(id, data);
}

export async function deleteBankingGroup(id: string) {
  return bgRepo.deleteBankingGroup(id);
}

export async function mergeBankingGroups(keepId: string, deleteId: string) {
  return bgRepo.mergeBankingGroups(keepId, deleteId);
}

export async function mergeLegalEntities(keepId: string, deleteId: string) {
  return leRepo.mergeLegalEntities(keepId, deleteId);
}

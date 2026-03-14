// Domain model for BankingGroup — re-exports schema types and adds enriched interfaces.

export type {
  BankingGroup,
  InsertBankingGroup,
} from "@shared/schema";

import type { BankingGroup } from "@shared/schema";
import type { LegalEntityWithBics } from "./legalEntity";

export interface BankingGroupWithEntities extends BankingGroup {
  entities: LegalEntityWithBics[];
}

export type CbProbabilityLevel = "high" | "medium" | "low" | "none" | null;

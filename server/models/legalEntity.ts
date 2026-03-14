// Domain model for LegalEntity — re-exports schema types and adds enriched interfaces.

export type {
  LegalEntity,
  InsertLegalEntity,
} from "@shared/schema";

import type { LegalEntity } from "@shared/schema";
import type { BicWithServices } from "./bic";

export interface LegalEntityWithBics extends LegalEntity {
  bics: BicWithServices[];
}

// Domain model for BIC — re-exports schema types and adds enriched interfaces.

export type {
  Bic,
  InsertBic,
} from "@shared/schema";

import type { Bic } from "@shared/schema";
import type { CorrespondentService } from "@shared/schema";

export interface BicWithServices extends Bic {
  services: CorrespondentService[];
}

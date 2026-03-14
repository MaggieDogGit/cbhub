// Domain model for research-related types — re-exports schema types and adds enriched interfaces.

export type {
  DataSource,
  InsertDataSource,
  IntelObservation,
  InsertIntelObservation,
  FmiResearchJob,
  InsertFmiResearchJob,
  AgentJob,
  InsertAgentJob,
} from "@shared/schema";

import type { EvidenceItem, ConfidenceLevel } from "./common";

export interface StructuredResearchResult {
  bank: string;
  headquarters: string;
  gsib: boolean;
  services: StructuredServiceEntry[];
  confidence?: ConfidenceLevel;
  evidenceItems?: EvidenceItem[];
  validationWarnings?: string[];
}

export interface StructuredServiceEntry {
  currency: string;
  service_type: string;
  rtgs_membership: boolean;
  instant_scheme_access: boolean;
  cls_member: boolean;
  nostro_accounts_offered: boolean;
  vostro_accounts_offered: boolean;
  target_clients: string;
  source: string;
}

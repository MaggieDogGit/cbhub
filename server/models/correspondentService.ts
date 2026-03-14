// Domain model for CorrespondentService — re-exports schema types and adds domain constants.

export type {
  CorrespondentService,
  InsertCorrespondentService,
} from "@shared/schema";

// Canonical service type labels used across the platform.
export const SERVICE_TYPES = [
  "Correspondent Banking",
  "Global Currency Clearing",
  "Currency Clearing",
  "RTGS Participation",
  "Instant Payments Access",
  "FX Liquidity",
  "CLS Settlement",
  "Custody Services",
  "Transaction Banking",
  "Liquidity Services",
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

// Clearing model labels.
export const CLEARING_MODELS = ["Onshore", "Offshore"] as const;
export type ClearingModel = (typeof CLEARING_MODELS)[number];

// Rule: Onshore → "Correspondent Banking", Offshore → "Global Currency Clearing"
export function defaultServiceType(clearingModel: ClearingModel): ServiceType {
  return clearingModel === "Onshore" ? "Correspondent Banking" : "Global Currency Clearing";
}

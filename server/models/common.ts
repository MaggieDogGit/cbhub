// Shared domain types used across services, repositories, and agent workflows.

export type ConfidenceLevel = "high" | "medium" | "low" | "uncertain";

export interface EvidenceItem {
  source: string;
  summary: string;
  url?: string;
}

export interface WorkflowResult<T> {
  data: T;
  confidence: ConfidenceLevel;
  evidenceCount: number;
  evidenceSummary: string;
  validationWarnings: string[];
}

export interface WorkflowInput {
  jobId?: string;
  label?: string;
}

export interface StepProgress {
  step: number;
  status: string;
}

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type CurrencyScope = "home_only" | "major" | "all";

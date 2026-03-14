// Shared AI workflow input/output types for the agent layer.

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
  toolName?: string;
}

export type AgentMode = "job" | "light" | "market_scan" | "chat";

export type StepCallback = (toolName: string, toolArgs: any, statusText: string) => void | Promise<void>;

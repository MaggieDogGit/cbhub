// Shared validation helpers for agent outputs and workflow results.

export type StepCallback = (toolName: string, toolArgs: any, statusText: string) => void | Promise<void>;

export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// BIC format validation: 8 or 11 alphanumeric characters
export function isValidBicFormat(value: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value.toUpperCase());
}

// Normalize a currency code to uppercase and check it is 3 letters
export function normalizeCurrency(value: string): string | null {
  const upper = (value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : null;
}

// Normalize a clearing model to a known value
const KNOWN_CLEARING_MODELS = ["Onshore", "Offshore"] as const;
export type ClearingModel = (typeof KNOWN_CLEARING_MODELS)[number];

export function normalizeClearingModel(value: string): ClearingModel | "unknown" {
  const normalized = (value || "").trim();
  if ((KNOWN_CLEARING_MODELS as readonly string[]).includes(normalized)) {
    return normalized as ClearingModel;
  }
  return "unknown";
}

// Detect likely duplicate entity names (simple substring match)
export function findLikelyDuplicates(names: string[]): string[][] {
  const groups: string[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < names.length; i++) {
    if (used.has(i)) continue;
    const group = [names[i]];
    const keyA = extractKeywords(names[i]);

    for (let j = i + 1; j < names.length; j++) {
      if (used.has(j)) continue;
      const keyB = extractKeywords(names[j]);
      if (keyA.some(k => keyB.includes(k))) {
        group.push(names[j]);
        used.add(j);
      }
    }

    if (group.length > 1) groups.push(group);
    used.add(i);
  }

  return groups;
}

function extractKeywords(name: string): string[] {
  const stop = new Set(["bank", "the", "of", "n.a.", "ag", "plc", "s.a.", "b.v.", "ltd", "group", "limited", "se", "nv"]);
  return name
    .toLowerCase()
    .split(/[\s,.()/]+/)
    .filter(w => w.length > 2 && !stop.has(w));
}

// Validate that required fields are present in a structured research result
export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
  warnings: string[];
}

export function validateResearchOutput(obj: Record<string, unknown>): ValidationResult {
  const required = ["bank", "headquarters", "services"];
  const missingFields = required.filter(f => !obj[f]);
  const warnings: string[] = [];

  if (!Array.isArray(obj.services) || (obj.services as any[]).length === 0) {
    warnings.push("No services found in research output");
  }

  if (typeof obj.gsib !== "boolean") {
    warnings.push("G-SIB field missing or not boolean — defaulting to false");
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}

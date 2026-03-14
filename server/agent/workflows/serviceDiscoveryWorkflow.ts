// Service Discovery Workflow — lightweight helper to assess whether a banking group
// likely offers correspondent banking services and in which currencies/markets.
// Used to enrich new groups before full CB Entity Setup is run.

import type { WorkflowResult } from "../types";
import { CURRENCY_COUNTRY, EUROZONE_COUNTRIES, CLS_CURRENCIES, COUNTRY_RTGS } from "../constants";

export interface ServiceDiscoveryInput {
  groupName: string;
  headquartersCountry: string | null;
  primaryCurrency: string | null;
  gSib: boolean;
  rtgsSystem: string | null;
  rtgsMember: boolean | null;
  clsMember: boolean | null;
}

export interface ServiceDiscoveryOutput {
  likelyCbProvider: boolean;
  likelyCurrencies: string[];
  likelyRtgs: string | null;
  likelyCls: boolean;
  rationale: string;
}

export function executeServiceDiscovery(input: ServiceDiscoveryInput): WorkflowResult<ServiceDiscoveryOutput> {
  const {
    groupName,
    headquartersCountry,
    primaryCurrency,
    gSib,
    rtgsSystem,
    rtgsMember,
    clsMember,
  } = input;

  const validationWarnings: string[] = [];
  const evidenceItems: string[] = [];

  // Determine RTGS system from country if not provided
  const likelyRtgs = rtgsSystem
    ?? (headquartersCountry ? (COUNTRY_RTGS[headquartersCountry] ?? null) : null);

  if (likelyRtgs && !rtgsSystem) evidenceItems.push(`RTGS inferred from country: ${likelyRtgs}`);

  // Determine if CLS membership is plausible
  const currencyIsClsEligible = primaryCurrency ? CLS_CURRENCIES.has(primaryCurrency) : false;
  const likelyCls = clsMember ?? (gSib && currencyIsClsEligible);

  if (clsMember === null && gSib && currencyIsClsEligible) {
    evidenceItems.push("CLS membership inferred: G-SIB with CLS-eligible home currency");
  }

  // Infer likely currencies offered
  const likelyCurrencies: string[] = [];

  if (primaryCurrency) {
    likelyCurrencies.push(primaryCurrency);
    evidenceItems.push(`Home currency: ${primaryCurrency}`);
  }

  if (headquartersCountry && EUROZONE_COUNTRIES.has(headquartersCountry)) {
    if (!likelyCurrencies.includes("EUR")) likelyCurrencies.push("EUR");
    evidenceItems.push("Eurozone entity — EUR expected");
  }

  if (gSib) {
    // G-SIBs typically clear major currencies
    for (const ccy of ["USD", "EUR", "GBP"]) {
      if (!likelyCurrencies.includes(ccy)) {
        likelyCurrencies.push(ccy);
        evidenceItems.push(`G-SIB — ${ccy} service likely`);
      }
    }
  }

  // Assess overall CB provider likelihood
  let score = 0;
  if (gSib) score += 3;
  if (rtgsMember) score += 2;
  if (likelyCls) score += 2;
  if (likelyCurrencies.length >= 3) score += 1;
  if (!headquartersCountry) validationWarnings.push("Headquarters country unknown — inference may be inaccurate");

  const likelyCbProvider = score >= 3;

  const confidence =
    score >= 5 ? "high" :
    score >= 3 ? "medium" :
    score >= 1 ? "low" :
    "uncertain";

  const rationale = [
    gSib ? "G-SIB status" : "",
    rtgsMember ? `RTGS member (${likelyRtgs ?? "unknown system"})` : "",
    likelyCls ? "CLS member" : "",
    likelyCurrencies.length > 0 ? `Currencies: ${likelyCurrencies.join(", ")}` : "",
  ].filter(Boolean).join("; ") || "Insufficient evidence";

  return {
    data: { likelyCbProvider, likelyCurrencies, likelyRtgs, likelyCls, rationale },
    confidence,
    evidenceCount: evidenceItems.length,
    evidenceSummary: evidenceItems.join(" | "),
    validationWarnings,
  };
}

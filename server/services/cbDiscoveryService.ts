import { storage } from "../storage";
import { buildSystemPrompt, buildMarketScanPrompt, buildDryRunSuffix, runAgentLoop, getDryRunTools } from "../agent";
import type { AgentJob, DataSource } from "@shared/schema";

export const COUNTRY_RTGS: Record<string, string> = {
  "Austria": "TARGET2", "Belgium": "TARGET2", "Croatia": "TARGET2", "Cyprus": "TARGET2",
  "Estonia": "TARGET2", "Finland": "TARGET2", "France": "TARGET2", "Germany": "TARGET2",
  "Greece": "TARGET2", "Ireland": "TARGET2", "Italy": "TARGET2", "Latvia": "TARGET2",
  "Lithuania": "TARGET2", "Luxembourg": "TARGET2", "Malta": "TARGET2", "Netherlands": "TARGET2",
  "Portugal": "TARGET2", "Slovakia": "TARGET2", "Slovenia": "TARGET2", "Spain": "TARGET2",
  "Czech Republic": "CERTIS", "Hungary": "VIBER", "Poland": "SORBNET2", "Romania": "ReGIS",
  "Sweden": "RIX", "Denmark": "Kronos2", "Norway": "NICS", "Switzerland": "SIC",
  "United Kingdom": "CHAPS",
  "United States": "Fedwire", "Canada": "Lynx", "Brazil": "STR", "Mexico": "SPEI",
  "Australia": "RITS", "Japan": "BOJ-NET", "Singapore": "MEPS+", "Hong Kong": "CHATS",
  "China": "CNAPS", "India": "RTGS (RBI)", "South Korea": "BOK-Wire+",
  "South Africa": "SAMOS", "Israel": "ZAHAV", "Turkey": "EFT",
  "United Arab Emirates": "UAEFTS", "New Zealand": "ESAS",
  "Bulgaria": "RINGS", "Bahrain": "RTGS-BD", "Chile": "LBTR", "Colombia": "CUD",
  "Egypt": "RTGS", "Indonesia": "BI-RTGS", "Kenya": "KEPSS", "Kuwait": "KASSIP",
  "Morocco": "SRBM", "Malaysia": "RENTAS", "Nigeria": "NIP", "Oman": "RTGS",
  "Peru": "LBTR", "Philippines": "PhilPaSS", "Qatar": "QATCH",
  "Saudi Arabia": "SARIE", "Thailand": "BAHTNET", "Taiwan": "CIFS",
};

export const CURRENCY_COUNTRY: Record<string, string> = {
  "USD": "United States", "EUR": "Eurozone", "GBP": "United Kingdom",
  "AED": "United Arab Emirates", "AUD": "Australia", "BGN": "Bulgaria",
  "BHD": "Bahrain", "BRL": "Brazil", "CAD": "Canada", "CHF": "Switzerland",
  "CLP": "Chile", "CNH": "China", "CNY": "China", "COP": "Colombia",
  "CZK": "Czech Republic", "DKK": "Denmark", "EGP": "Egypt",
  "HKD": "Hong Kong", "HUF": "Hungary", "IDR": "Indonesia",
  "ILS": "Israel", "INR": "India", "JPY": "Japan", "KES": "Kenya",
  "KRW": "South Korea", "KWD": "Kuwait", "MAD": "Morocco", "MXN": "Mexico",
  "MYR": "Malaysia", "NGN": "Nigeria", "NOK": "Norway", "NZD": "New Zealand",
  "OMR": "Oman", "PEN": "Peru", "PHP": "Philippines", "PLN": "Poland",
  "QAR": "Qatar", "RON": "Romania", "SAR": "Saudi Arabia", "SEK": "Sweden",
  "SGD": "Singapore", "THB": "Thailand", "TRY": "Turkey", "TWD": "Taiwan",
  "ZAR": "South Africa",
};

export const COUNTRY_CURRENCY: Record<string, string> = Object.fromEntries(
  Object.entries(CURRENCY_COUNTRY).filter(([, v]) => v !== "Eurozone").map(([k, v]) => [v, k])
);

export const EUROZONE_COUNTRIES = new Set([
  "Austria", "Belgium", "Croatia", "Cyprus", "Estonia", "Finland", "France", "Germany",
  "Greece", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands",
  "Portugal", "Slovakia", "Slovenia", "Spain",
]);

export const CLS_CURRENCIES = new Set(["AUD","CAD","CHF","DKK","EUR","GBP","HKD","JPY","MXN","NOK","NZD","SEK","SGD","USD","ILS","ZAR","KRW","HUF"]);

export async function runMarketScan(
  job: AgentJob,
  isDryRun: boolean,
  jobLabel: string,
  conversationId: string,
  sources: DataSource[],
): Promise<{ stepCount: number; scanSummaryJson: string | undefined }> {
  const mCountry = job.market_country as string;
  const mCurrency = job.market_currency as string;
  const rtgs = mCurrency === "EUR" ? "TARGET2" : (COUNTRY_RTGS[mCountry] || null);

  let preExistingGroupIds: Set<string> = new Set();
  let preExistingEntityIds: Set<string> = new Set();
  let preExistingBicIds: Set<string> = new Set();
  let entityGroupMap: Map<string, string> = new Map();

  if (!isDryRun) {
    const [allGroups, allEntities, allBics] = await Promise.all([
      storage.listBankingGroups(),
      storage.listLegalEntities(),
      storage.listBics(),
    ]);
    preExistingGroupIds = new Set(allGroups.map(g => g.id));
    preExistingEntityIds = new Set(allEntities.map(e => e.id));
    preExistingBicIds = new Set(allBics.map(b => b.id));
    for (const e of allEntities) entityGroupMap.set(e.id, e.group_id);
  }

  let message = buildMarketScanPrompt(mCountry, mCurrency, rtgs);
  if (isDryRun) message += buildDryRunSuffix(mCountry, mCurrency);

  await storage.createMessage({ conversation_id: conversationId, role: "user", content: message });

  const systemPrompt = buildSystemPrompt(sources, undefined, "job");
  const openaiMessages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  const tools = isDryRun ? getDryRunTools() : undefined;

  let stepCount = 0;
  const assistantContent = await runAgentLoop(
    openaiMessages,
    async (_toolName, _args, statusText) => {
      stepCount++;
      console.log(`[JobRunner] ${jobLabel} — step ${stepCount}: ${statusText}`);
      await storage.updateJob(job.id, { steps_completed: stepCount });
    },
    50,
    "auto",
    "gpt-4o",
    tools,
  );

  await storage.createMessage({ conversation_id: conversationId, role: "assistant", content: assistantContent });

  let scanSummaryJson: string | undefined;
  if (isDryRun) {
    scanSummaryJson = JSON.stringify({
      summaryText: assistantContent,
      dryRun: true,
      newGroupIds: [],
      newGroupNames: [],
      createdCount: 0,
      updatedCount: 0,
    });
  } else {
    const [allGroupsAfter, allEntitiesAfter, allBicsAfter] = await Promise.all([
      storage.listBankingGroups(),
      storage.listLegalEntities(),
      storage.listBics(),
    ]);
    const groupLookup = new Map(allGroupsAfter.map(g => [g.id, g]));
    const postEntityGroupMap = new Map(allEntitiesAfter.map(e => [e.id, e.group_id]));
    const newGroups = allGroupsAfter.filter(g => !preExistingGroupIds.has(g.id));
    const newGroupIds = new Set(newGroups.map(g => g.id));
    const touchedExistingGroupIds = new Set<string>();
    for (const e of allEntitiesAfter) {
      if (!preExistingEntityIds.has(e.id) && preExistingGroupIds.has(e.group_id)) {
        touchedExistingGroupIds.add(e.group_id);
      }
    }
    for (const b of allBicsAfter) {
      if (!preExistingBicIds.has(b.id)) {
        const groupId = entityGroupMap.get(b.legal_entity_id) || postEntityGroupMap.get(b.legal_entity_id);
        if (groupId && preExistingGroupIds.has(groupId)) {
          touchedExistingGroupIds.add(groupId);
        }
      }
    }
    const touchedExistingGroups = [...touchedExistingGroupIds]
      .filter(gid => !newGroupIds.has(gid))
      .map(gid => groupLookup.get(gid))
      .filter(Boolean) as typeof allGroupsAfter;
    const allTouchedGroups = [...newGroups, ...touchedExistingGroups];
    const summaryMatch = assistantContent.match(/Providers found[\s\S]*/i);
    const summaryText = summaryMatch ? summaryMatch[0].trim() : assistantContent.trim();
    scanSummaryJson = JSON.stringify({
      summaryText,
      newGroupIds: allTouchedGroups.map(g => g.id),
      newGroupNames: allTouchedGroups.map(g => g.group_name),
      createdCount: newGroups.length,
      updatedCount: touchedExistingGroups.length,
    });
  }

  return { stepCount, scanSummaryJson };
}

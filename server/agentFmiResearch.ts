import { executeTool, withRetry, getTools } from "./agentCore";
import { storage } from "./storage";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Tool set ──────────────────────────────────────────────────────────────────

const FMI_ALLOWED_TOOLS = [
  "web_search",
  "find_banking_group_by_name",
  "find_legal_entity_by_name",
  "check_fmi_membership",
  "create_banking_group",
  "update_banking_group",
  "create_legal_entity",
  "update_legal_entity",
  "create_fmi",
  "delete_fmi",
];

export function getFmiResearchTools(): any[] {
  const allTools = getTools();
  return allTools.filter((t: any) => FMI_ALLOWED_TOOLS.includes(t.function?.name));
}

export async function executeFmiTool(name: string, args: any): Promise<string> {
  if (!FMI_ALLOWED_TOOLS.includes(name)) {
    return JSON.stringify({ error: `Tool "${name}" is not available for FMI research.` });
  }
  return executeTool(name, args);
}

// ── CLS supplement: members the web search consistently misses ─────────────
// These are confirmed CLS Settlement Members that appear in the official PDF
// but are routinely omitted from web search results (subsidiary entities of
// large groups, or names that get truncated from the page content).
const CLS_KNOWN_SUPPLEMENT = [
  "DBS Bank Ltd",
  "DZ BANK AG",
  "Agricultural Bank of China New York Branch",
  "The Bank of New York Mellon SA/NV",
  "The Bank of New York Mellon (International) Limited",
  "The Bank of New York Mellon Trust (Japan), Ltd.",
  "Goldman Sachs International Bank",
  "Goldman Sachs Bank Europe SE",
  "MUFG Bank, Ltd.",
];

// ── Phase 1: Discovery ────────────────────────────────────────────────────────
// Uses gpt-4o-search-preview directly so it can natively browse the web and
// read PDFs at the source URL — no multi-hop tool calls.

export async function runFmiMemberDiscovery(fmiName: string, fmiDetails: any): Promise<string[]> {
  const membershipUrl = fmiDetails?.membership_url || "";
  const website = fmiDetails?.website || "";
  const isCls = fmiName.toUpperCase().includes("CLS");

  const prompt = `You are a financial research assistant. Fetch the direct member list for: **${fmiName}**

${membershipUrl ? `Official source: ${membershipUrl}` : ""}
${website ? `Website: ${website}` : ""}

${isCls ? `This page lists all CLS Settlement Members (there are 78 of them).
The page links to a PDF. Read that PDF or the page itself and extract every single member name.
Do NOT filter, validate, or exclude any name from the official list.
Include all entities exactly as they appear — banks, securities firms, broker-dealers.
If one search doesn't return all 78, search again with different terms to find the rest (especially members M-Z).
` : `Browse the official URL above and extract every direct member/participant name exactly as listed.`}

Return ONLY a JSON array of the official legal entity names — no commentary, no explanation.
Format: ["Name One", "Name Two", "Name Three"]`;

  // Use gpt-4o-search-preview directly — it has native web search and can read pages/PDFs
  // Note: gpt-4o-search-preview does not support temperature
  const response = await withRetry(() => (openai.chat.completions.create as any)({
    model: "gpt-4o-search-preview",
    messages: [{ role: "user", content: prompt }],
  }), 5, "fmi-discovery");

  const content = response.choices[0].message.content || "[]";

  // Extract the JSON array — greedy match to capture the whole array
  const discovered = new Set<string>();
  const match = content.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) arr.forEach((n: string) => { if (n) discovered.add(String(n).trim()); });
    } catch {
      const names = content.match(/"([^"]+)"/g);
      if (names) names.forEach(n => { const s = n.replace(/"/g, "").trim(); if (s.length > 2) discovered.add(s); });
    }
  }

  // For CLS: merge with known supplement (confirmed members that web search consistently misses)
  if (isCls) {
    CLS_KNOWN_SUPPLEMENT.forEach(n => discovered.add(n));

    // If still well short of 78, try a second targeted search for the remaining unknowns
    if (discovered.size < 75) {
      console.log(`[FmiDiscovery] Got ${discovered.size} after supplement. Doing targeted follow-up search...`);
      const followUpPrompt = `Search for CLS Settlement Members that are subsidiary legal entities of large banking groups, not typically listed on overview pages. Specifically look for:
- Any additional Goldman Sachs entities (besides Goldman Sachs Bank USA) listed as CLS Settlement Members
- Any additional JPMorgan/J.P. Morgan entities beyond JPMorgan Chase Bank and JPMorgan Securities
- MUFG Bank or Mitsubishi UFJ entities as CLS Settlement Members
- Any additional HSBC entities (HSBC USA, HSBC Bank USA)
- Société Générale subsidiaries (SG Americas)
- Any Barclays entities beyond Barclays Bank plc and Barclays Bank UK PLC
- Any UniCredit entities beyond UniCredit Bank AG
- China Construction Bank as CLS member
- Hang Seng Bank as CLS member
- Bank of Communications as CLS member

Source: https://www.cls-group.com/communities/settlement-members/

Return ONLY a JSON array of entity names you can CONFIRM are on the official CLS Settlement Members list. Do not include guesses.`;

      try {
        const followUp = await withRetry(() => (openai.chat.completions.create as any)({
          model: "gpt-4o-search-preview",
          messages: [{ role: "user", content: followUpPrompt }],
        }), 5, "fmi-discovery-followup");
        const fc = followUp.choices[0].message.content || "[]";
        const fm = fc.match(/\[[\s\S]*\]/);
        if (fm) {
          try {
            const arr = JSON.parse(fm[0]);
            if (Array.isArray(arr)) arr.forEach((n: string) => { if (n) discovered.add(String(n).trim()); });
          } catch {}
        }
        console.log(`[FmiDiscovery] After follow-up: ${discovered.size} total members found`);
      } catch (err: any) {
        console.warn("[FmiDiscovery] Follow-up search failed:", err.message);
      }
    }
  }

  if (discovered.size > 0) return Array.from(discovered);

  // Last resort fallback: multi-search with gpt-4o + web_search tool
  if (isCls) {
    return runClsDiscoveryFallback(fmiName, membershipUrl);
  }

  return [];
}

// Fallback: multi-search approach using gpt-4o + web_search tool
async function runClsDiscoveryFallback(fmiName: string, membershipUrl: string): Promise<string[]> {
  const discoveryTools = [{
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information",
      parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
    },
  }];

  const messages: any[] = [{
    role: "user",
    content: `Find ALL 78 CLS Settlement Members. There are exactly 78.
Source: ${membershipUrl}

Do these 4 searches IN ORDER:
1. "CLS Group settlement members list site:cls-group.com"
2. "CLS settlement members PDF complete list"
3. "CLS settlement members Goldman Sachs Nomura Standard Chartered MUFG Mizuho"
4. "CLS settlement members Royal Bank Canada UBS Morgan Stanley Societe Generale"

Combine all unique names found. Return ONLY a JSON array. No commentary.`,
  }];

  const collectedNames = new Set<string>();
  let steps = 0;

  while (steps < 12) {
    const response = await withRetry(() => openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: discoveryTools,
      tool_choice: "auto",
      temperature: 0,
    } as any), 5, `cls-fallback-step-${steps}`);

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      const content = msg.content || "[]";
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const arr = JSON.parse(match[0]);
          if (Array.isArray(arr)) arr.forEach((n: string) => { if (n) collectedNames.add(String(n).trim()); });
        } catch {}
      }
      if (collectedNames.size >= 60) break;
      if (collectedNames.size > 0 && steps < 10) {
        messages.push({
          role: "user",
          content: `Found ${collectedNames.size} so far. Need 78. Search for more (especially M-Z names like Nordea, Nomura, Santander, Société Générale, Standard Chartered, Sumitomo, UBS, UniCredit, Wells Fargo).`,
        });
        steps++;
        continue;
      }
      break;
    }

    for (const call of msg.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(call.function.arguments); } catch {}
      const result = await executeTool("web_search", args);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    steps++;
  }

  return Array.from(collectedNames);
}

// ── Shared DB context snapshot ─────────────────────────────────────────────
// Loaded once per job run and passed into every processFmiMember call.
// This gives the agent memory across all members in the batch.

export type DbContext = {
  bankingGroups: { id: string; group_name: string }[];
  legalEntities: { id: string; legal_name: string; group_id: string }[];
  fmiMemberships: { legal_entity_id: string; fmi_name: string }[];
};

export async function loadDbContext(): Promise<DbContext> {
  const [bankingGroups, legalEntities, fmis] = await Promise.all([
    storage.listBankingGroups(),
    storage.listLegalEntities(),
    storage.listFmis(),
  ]);
  return {
    bankingGroups: bankingGroups.map(g => ({ id: g.id, group_name: g.group_name })),
    legalEntities: legalEntities.map(e => ({ id: e.id, legal_name: e.legal_name, group_id: e.group_id })),
    fmiMemberships: fmis.map(f => ({ legal_entity_id: f.legal_entity_id, fmi_name: f.fmi_name })),
  };
}

// ── Phase 2: Process a single member ─────────────────────────────────────────
// The agent receives a pre-loaded DB snapshot so it has full context of
// what already exists — no blind DB queries needed for lookups.

export type MemberProcessResult = {
  action: "added" | "skipped" | "error";
  entity_name?: string;
  reason?: string;
};

export async function processFmiMember(
  memberName: string,
  fmiName: string,
  fmiType: string,
  sourceUrl: string,
  ctx: DbContext
): Promise<MemberProcessResult> {
  // Only expose create/update tools — lookup is handled via the injected context
  const allTools = getTools();
  const processingTools = allTools.filter((t: any) =>
    ["create_banking_group", "create_legal_entity", "create_fmi", "delete_fmi"].includes(t.function?.name)
  );

  // Build relevant excerpts from the DB context to minimise token usage
  const keyword = extractKeyword(memberName);
  const matchingGroups = ctx.bankingGroups.filter(g =>
    g.group_name.toLowerCase().includes(keyword.toLowerCase())
  );
  const matchingEntities = ctx.legalEntities.filter(e =>
    e.legal_name.toLowerCase().includes(keyword.toLowerCase())
  );
  const alreadyMember = ctx.fmiMemberships.some(f =>
    matchingEntities.some(e => e.id === f.legal_entity_id) && f.fmi_name === fmiName
  );

  // Build a context block for the prompt
  const contextBlock = [
    matchingGroups.length
      ? `Banking groups matching "${keyword}":\n${matchingGroups.map(g => `  - id=${g.id}  name="${g.group_name}"`).join("\n")}`
      : `No banking groups match "${keyword}" — you may need to create one.`,
    matchingEntities.length
      ? `Legal entities matching "${keyword}":\n${matchingEntities.map(e => `  - id=${e.id}  name="${e.legal_name}"  group_id=${e.group_id}`).join("\n")}`
      : `No legal entities match "${keyword}" — you may need to create one.`,
    alreadyMember
      ? `FMI membership: ${fmiName} already recorded for one of the matching entities above.`
      : `FMI membership: NOT yet recorded for ${fmiName}.`,
  ].join("\n\n");

  const messages: any[] = [{
    role: "system",
    content: `You are a precise financial data entry agent. You record FMI memberships in a correspondent banking database.
Your job for each member: find or create the legal entity, then record the FMI membership.

MATCHING RULES:
- Use the pre-loaded context below to find existing records. Do NOT call find_* tools — they are not available.
- Match by common keywords (e.g. "Goldman Sachs" matches "Goldman Sachs Bank USA" and "Goldman Sachs International Bank")
- Legal entity names must stay EXACTLY as they appear on the official FMI source list
- If a matching entity already has this FMI membership recorded, respond with skipped
- If unsure whether an entity matches, prefer creating a new one over incorrectly reusing an existing one

DB CONTEXT (pre-loaded, current as of this run):
${contextBlock}

Respond with ONLY a JSON object: {"action":"added","entity_name":"..."} or {"action":"skipped","reason":"..."} or {"action":"error","reason":"..."}`,
  }, {
    role: "user",
    content: `Process this member: "${memberName}"
FMI: "${fmiName}" (type: "${fmiType}")
Source: ${sourceUrl}

Steps:
1. Check the context above. If a matching entity already has ${fmiName} membership → respond {"action":"skipped","reason":"already exists"}
2. If a matching entity exists but does NOT have ${fmiName} membership:
   - Call create_fmi with that entity's id, fmi_name="${fmiName}", fmi_type="${fmiType}", source="${sourceUrl}"
   - Respond {"action":"added","entity_name":"<entity name from context>"}
3. If NO matching entity exists:
   - If a matching banking group exists: call create_legal_entity with group_id from context, legal_name="${memberName}", entity_type="Bank"
   - If no matching banking group: call create_banking_group with group_name="<parent name>", then create_legal_entity
   - Then call create_fmi
   - Respond {"action":"added","entity_name":"${memberName}"}`,
  }];

  let steps = 0;
  while (steps < 10) {
    const response = await withRetry(() => openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: processingTools,
      tool_choice: "auto",
      temperature: 0,
    }), 5, `member-${memberName.slice(0, 20)}-step-${steps}`);

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      const content = msg.content || "";
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const result = JSON.parse(match[0]);
          return {
            action: result.action || "error",
            entity_name: result.entity_name,
            reason: result.reason,
          };
        } catch {}
      }
      return { action: "error", reason: content.slice(0, 200) };
    }

    for (const call of msg.tool_calls) {
      const name = call.function.name;
      let args: any = {};
      try { args = JSON.parse(call.function.arguments); } catch {}
      const result = await executeFmiTool(name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });

      // Keep the in-memory context up to date so subsequent members benefit
      if (name === "create_banking_group") {
        try {
          const created = JSON.parse(result);
          if (created.id) ctx.bankingGroups.push({ id: created.id, group_name: created.group_name });
        } catch {}
      } else if (name === "create_legal_entity") {
        try {
          const created = JSON.parse(result);
          if (created.id) ctx.legalEntities.push({ id: created.id, legal_name: created.legal_name, group_id: created.group_id });
        } catch {}
      } else if (name === "create_fmi") {
        try {
          const created = JSON.parse(result);
          if (created.legal_entity_id) ctx.fmiMemberships.push({ legal_entity_id: created.legal_entity_id, fmi_name: fmiName });
        } catch {}
      }
    }

    steps++;
  }

  return { action: "error", reason: "Max steps reached" };
}

// Extract the most useful keyword from a member name for DB lookups
function extractKeyword(name: string): string {
  const stopWords = ["bank", "the", "of", "n.a.", "ag", "plc", "s.a.", "s.a", "b.v.", "ltd", "inc", "llc", "group", "limited", "corporation", "corp", "na", "se", "nv", "bm", "u.a."];
  const words = name.split(/[\s,.()/]+/).filter(w => w.length > 1);
  const meaningful = words.filter(w => !stopWords.includes(w.toLowerCase()));
  if (meaningful.length >= 2) return meaningful.slice(0, 2).join(" ");
  if (meaningful.length === 1) return meaningful[0];
  return words[0] || name.slice(0, 15);
}

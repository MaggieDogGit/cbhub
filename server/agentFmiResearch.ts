import { executeTool, withRetry, getTools } from "./agentCore";
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

const discoveryTools = [{
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for current information",
    parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
  },
}];

// ── Phase 1: Discovery ────────────────────────────────────────────────────────
// Returns the complete list of member names from the official source.

export async function runFmiMemberDiscovery(fmiName: string, fmiDetails: any): Promise<string[]> {
  const membershipUrl = fmiDetails?.membership_url || "";
  const website = fmiDetails?.website || "";
  const isCls = fmiName.toUpperCase().includes("CLS");

  const messages: any[] = [{
    role: "user",
    content: `You are a financial research assistant. Your ONLY job is to extract the COMPLETE list of all direct members of: **${fmiName}**

${membershipUrl ? `Start here: ${membershipUrl}` : ""}
${website ? `Official website: ${website}` : ""}

${isCls ? `IMPORTANT — CLS SPECIFIC:
- This page links to a PDF of all Settlement Members. Search for it.
- There are exactly 78 Settlement Members on the official list.
- Members include banks and securities firms from around the world (A to Z alphabetically).
- Do NOT filter by type — include ALL entities listed, whether bank, securities firm, or other.
- You MUST do multiple searches to find all 78. A single search will NOT return all of them.
- Required searches:
  1. Search: "CLS settlement members site:cls-group.com" 
  2. Search: "CLS Group settlement members complete list PDF 2024"
  3. Search: "CLS settlement members Nomura Goldman Sachs Standard Chartered Sumitomo" (to find members in the second half of the alphabet)
  4. Search: "CLS settlement members Royal Bank of Canada UBS Morgan Stanley" (to fill in more)
- You have found all members when you have 70+ names. Stop searching only then.
` : `- Do multiple searches to find the complete list.`}

OUTPUT FORMAT — CRITICAL:
After all searches, output ONLY a single JSON array of all member names you found.
No commentary, no explanations. Just the JSON array.
Example: ["ABN AMRO Bank N.V.", "Barclays Bank PLC", "Goldman Sachs Bank USA"]

Do all required searches now, then output the complete JSON array.`,
  }];

  let steps = 0;
  let collectedNames: Set<string> = new Set();

  while (steps < 14) {
    const response = await withRetry(() => openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: discoveryTools,
      tool_choice: "auto",
      temperature: 0,
    } as any), 5, `discovery-step-${steps}`);

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      // Model gave a final answer — extract the JSON array
      const content = msg.content || "[]";
      // Use greedy match to get the full array including nested content
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const arr = JSON.parse(match[0]);
          if (Array.isArray(arr)) {
            arr.forEach((n: string) => { if (n && typeof n === "string") collectedNames.add(n.trim()); });
          }
        } catch {
          // Try to extract quoted strings if JSON parse fails
          const names = content.match(/"([^"]+)"/g);
          if (names) names.forEach(n => collectedNames.add(n.replace(/"/g, "").trim()));
        }
      }

      // If we have enough names or this is a non-CLS FMI, return what we have
      const threshold = isCls ? 60 : 5;
      if (collectedNames.size >= threshold) {
        return Array.from(collectedNames);
      }

      // Not enough — ask for another search
      if (collectedNames.size > 0 && steps < 12) {
        messages.push({
          role: "user",
          content: `You have found ${collectedNames.size} members so far. There should be ${isCls ? "78" : "more"}. Please do additional searches to find the remaining members (especially those with names starting M-Z that may have been missed).`,
        });
        steps++;
        continue;
      }

      return Array.from(collectedNames);
    }

    for (const call of msg.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(call.function.arguments); } catch {}
      const result = await executeTool("web_search", args);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });

      // Try to extract names from intermediate search results too
      const nameMatches = result.match(/"([A-Z][^"]{3,60})"/g);
      if (nameMatches) {
        nameMatches.forEach((n: string) => {
          const name = n.replace(/"/g, "").trim();
          if (name.length > 4 && /[A-Z]/.test(name[0])) collectedNames.add(name);
        });
      }
    }

    steps++;
  }

  return Array.from(collectedNames);
}

// ── Phase 2: Process a single member ─────────────────────────────────────────
// Takes one member name, looks up or creates the entity, creates the FMI record.

export type MemberProcessResult = {
  action: "added" | "skipped" | "error";
  entity_name?: string;
  reason?: string;
};

export async function processFmiMember(
  memberName: string,
  fmiName: string,
  fmiType: string,
  sourceUrl: string
): Promise<MemberProcessResult> {
  const tools = getFmiResearchTools();

  const messages: any[] = [{
    role: "user",
    content: `Process this single FMI membership record:

Member name (from official source): "${memberName}"
FMI: "${fmiName}"
FMI Type: "${fmiType}"
Source URL: "${sourceUrl}"

Follow these steps exactly:
1. Call find_legal_entity_by_name with a key word from the name (e.g. for "Goldman Sachs Bank USA" use "Goldman Sachs"; for "Bank of America" use "Bank of America")
2. If a matching entity is found:
   - Call create_fmi with: legal_entity_id (the UUID from step 1), fmi_name="${fmiName}", fmi_type="${fmiType}", source="${sourceUrl}"
   - If create_fmi returns {duplicate: true}: respond {"action":"skipped","reason":"already exists"}
   - Otherwise respond: {"action":"added","entity_name":"<legal_name from step 1>"}
3. If NO matching entity is found:
   - Call find_banking_group_by_name with a short keyword from the institution name
   - If banking group found: call create_legal_entity with group_id from the result, legal_name="${memberName}", entity_type="Bank"
   - If banking group NOT found: call create_banking_group with group_name="<parent institution name>", then create_legal_entity
   - Then call create_fmi
   - Respond: {"action":"added","entity_name":"${memberName}"}
4. If anything fails: respond {"action":"error","reason":"<explanation>"}

Respond with ONLY the JSON object. No other text.`,
  }];

  let steps = 0;
  while (steps < 12) {
    const response = await withRetry(() => openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0,
    }), 5, `member-${memberName.slice(0, 20)}-step-${steps}`);

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      const content = msg.content || "";
      const match = content.match(/\{[\s\S]*?\}/);
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
    }

    steps++;
  }

  return { action: "error", reason: "Max steps reached" };
}

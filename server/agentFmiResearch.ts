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

  const messages: any[] = [{
    role: "user",
    content: `You are a financial research assistant. Find the COMPLETE list of all direct members/participants of: **${fmiName}**

${membershipUrl ? `Official member list URL: ${membershipUrl}` : ""}
${website ? `Official website: ${website}` : ""}

Instructions:
- For CLS: find all "Settlement Members" — there are approximately 75 of them. Do MULTIPLE web searches to get the complete list.
- Search for the official PDF or page listing all members.
- Do at least 2-3 searches to ensure you have the complete list.
- Return ONLY a JSON array of the official legal entity names. No explanations, no commentary.
- Example format: ["ABN AMRO Bank N.V.", "Barclays Bank PLC", "Citibank N.A."]

Start searching now.`,
  }];

  let steps = 0;
  while (steps < 8) {
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
      const content = msg.content || "[]";
      const match = content.match(/\[[\s\S]*?\]/);
      if (match) {
        try {
          const arr = JSON.parse(match[0]);
          if (Array.isArray(arr) && arr.length > 0) return arr;
        } catch {}
      }
      return [];
    }

    for (const call of msg.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(call.function.arguments); } catch {}
      const result = await executeTool("web_search", args);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }

    steps++;
  }

  return [];
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

import { executeTool, withRetry, getTools } from "./agentCore";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function buildFmiResearchPrompt(fmiName: string, fmiDetails: any): string {
  const websiteInfo = fmiDetails?.website ? `Official website: ${fmiDetails.website}` : "";
  const membershipUrlInfo = fmiDetails?.membership_url ? `Official member list URL: ${fmiDetails.membership_url}` : "";
  const description = fmiDetails?.description ? `Description: ${fmiDetails.description}` : "";

  return `You are the FMI Membership Research Agent. Your task is to find ALL direct members of: **${fmiName}**.

${description}
${websiteInfo}
${membershipUrlInfo}

---
## TOOL USAGE — CRITICAL RULES

### Use TARGETED tools, never bulk list tools
- To look up an entity: use \`find_legal_entity_by_name\` with a partial name (e.g. "Goldman" finds "Goldman Sachs Bank USA")
- To look up a banking group: use \`find_banking_group_by_name\` with a partial name
- To check if membership already exists: use \`check_fmi_membership\` with legal_entity_id + fmi_name
- NEVER call \`list_legal_entities\`, \`list_banking_groups\`, or \`list_fmis\` — these return the full database and waste your context window
- You may call \`create_banking_group\`, \`create_legal_entity\`, \`create_fmi\` to add records

### Batching tool calls
- In each response, you CAN issue MULTIPLE tool calls simultaneously. Use this to check several entities at once.
- For example, look up 5 entities in parallel using 5 simultaneous find_legal_entity_by_name calls.

---
## MEMBER RESEARCH

### Direct Members ONLY
- For **CLS**: only "Settlement Members" — the ~75 institutional shareholders who submit FX trades directly to CLS. NOT third-party customers.
- For **SWIFT**: direct SWIFT member financial institutions only.
- For **RTGS**: direct participants only, not indirect/tiered participants.

### Find the COMPLETE list
- There are approximately 75 CLS Settlement Members. You MUST process ALL of them.
- Do multiple web searches to get the complete list. Search for:
  1. The official membership URL above
  2. "CLS Settlement Members complete list [current year]"
  3. The CLS PDF member list
- Extract ALL member names before proceeding to database work.

---
## WORKFLOW — FOLLOW THIS EXACTLY

**Step 1**: Do 1–2 web searches to get the complete list of direct members. Extract ALL member names.

**Step 2**: For each member on the list (process ALL of them — do not stop early):
  a. Call \`find_legal_entity_by_name\` with a short keyword from their name (e.g. "Goldman", "Barclays")
  b. If found → check if already a member via \`check_fmi_membership\`
     - If already exists → skip (count as skipped)
     - If not exists → call \`create_fmi\` with source="${fmiDetails?.membership_url || 'https://www.cls-group.com/about/members/'}"
  c. If NOT found → call \`find_banking_group_by_name\` to check if the group exists
     - If group found → call \`create_legal_entity\` (group_id from group, entity_type="Bank")
     - If group NOT found → call \`create_banking_group\` first, then \`create_legal_entity\`
     - Then call \`create_fmi\`

**Step 3**: After processing ALL members, output ONLY this JSON as your final message (no other text):

\`\`\`json
{"members_found": N, "added": N, "skipped_already_exists": N, "created_new_entities": N, "not_found_in_source": []}
\`\`\`

- members_found: total unique direct members found from official source
- added: number of new FMI membership records created
- skipped_already_exists: number skipped because membership already existed
- created_new_entities: number of new legal entities created during this run
- not_found_in_source: leave empty []

---
## IMPORTANT: DO NOT STOP EARLY
- Do not emit any text until you have processed EVERY member from the list.
- Do not say "I will continue" — just continue.
- Process members in batches of 5–10 using parallel tool calls to go faster.
- Only output the final JSON after ALL members are done.`;
}

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

export type FmiStepCallback = (toolName: string, args: any, statusText: string) => void | Promise<void>;

export async function runFmiAgentLoop(
  messages: any[],
  onStep?: FmiStepCallback,
  maxSteps = 120
): Promise<string> {
  const tools = getFmiResearchTools();
  let steps = 0;

  while (steps < maxSteps) {
    const response = await withRetry(() => openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0,
    }), 5, `fmi-agent-step-${steps}`);

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content ?? "";
    }

    for (const call of msg.tool_calls) {
      const name = call.function.name;
      let args: any = {};
      try { args = JSON.parse(call.function.arguments); } catch {}

      if (onStep) {
        const label = args.query || args.name_contains || args.fmi_name || args.legal_name || args.group_name || "";
        await onStep(name, args, `${name}(${label})`);
      }

      const result = await executeFmiTool(name, args);

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }

    steps++;
  }

  return "Max steps reached.";
}

export function isFmiJobComplete(summary: string): boolean {
  const jsonMatch = summary.match(/\{[\s\S]*"members_found"[\s\S]*\}/);
  return !!jsonMatch;
}

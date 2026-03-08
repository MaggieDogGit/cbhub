import { executeTool, withRetry, getTools } from "./agentCore";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function buildFmiResearchPrompt(fmiName: string, fmiDetails: any): string {
  const websiteInfo = fmiDetails?.website ? `Official website: ${fmiDetails.website}` : "";
  const membershipUrlInfo = fmiDetails?.membership_url ? `Official member list URL: ${fmiDetails.membership_url}` : "";
  const description = fmiDetails?.description ? `Description: ${fmiDetails.description}` : "";

  return `You are the FMI Membership Research Agent. Your task is to find ALL direct members of the Financial Market Infrastructure: **${fmiName}**.

${description}
${websiteInfo}
${membershipUrlInfo}

---
## CRITICAL RULES

### 1. Direct Members ONLY
- For **CLS**: only "Settlement Members" count — these are the ~75 institutional shareholders who submit FX trades directly to CLS. Do NOT record third-party customers who route via a Settlement Member.
- For **SWIFT**: only direct SWIFT member financial institutions. Not messaging providers or non-bank entities.
- For **RTGS systems** (TARGET2, Fedwire, CHAPS, etc.): only direct participants, not indirect/tiered participants.

### 2. Find the COMPLETE list — do not stop early
- There are approximately 75 CLS Settlement Members published on the CLS website. You MUST find ALL of them, not just the first few.
- Do MULTIPLE web searches to find the complete list. Try searching for:
  - The official membership page URL directly
  - "CLS Settlement Members complete list"
  - "CLS Group settlement members [current year]"
  - The CLS PDF member list
- Do not stop until you have exhausted all search options and processed every member you found.

### 3. Entity matching — use fuzzy/partial matching
- When comparing names from the member list to our database, use PARTIAL string matching. Do NOT require exact matches.
- Example: if the CLS list says "Goldman Sachs Bank USA", search list_legal_entities for any entity whose name CONTAINS "Goldman Sachs".
- Example: if the CLS list says "JPMorgan Chase Bank, N.A.", match it against "JPMorgan Chase Bank, National Association".
- First call list_banking_groups to get the full group list. If you can match a banking group by name, look for the appropriate legal entity within that group.

### 4. When an entity is NOT in the database — CREATE it
- If you find a CLS member that has NO matching legal entity in the database, you MUST create it. Do not skip it.
- Follow this sequence:
  1. Call list_banking_groups — check if the banking group already exists (fuzzy match on name)
  2. If the group does NOT exist: call create_banking_group with the institution's name, country, and primary currency
  3. Call list_legal_entities — check if the specific legal entity already exists
  4. If it does NOT exist: call create_legal_entity with group_id from step 2 (or found group), the legal name, country, entity_type="Bank"
  5. Then call create_fmi with the legal_entity_id from step 4

### 5. Every FMI record MUST have a source
- Set the source field to the URL where you verified the membership (e.g. the CLS member list page URL).

### 6. Duplicate prevention
- Call list_fmis at the start and keep track of existing records. Do not call create_fmi if a record already exists for this entity + FMI name combination.

---
## WORKFLOW

1. Search the web to find the complete list of direct members of ${fmiName}. Use multiple searches.
2. Call list_banking_groups, list_legal_entities, and list_fmis — get the current state of the database.
3. For EACH member in the complete list:
   a. Try to find a matching legal entity using partial name matching.
   b. If not found, check if the banking group exists. Create group + entity if needed.
   c. Check if an FMI record already exists for this entity + "${fmiName}".
   d. If not, call create_fmi.
4. After processing ALL members, output ONLY this JSON as your final message:

\`\`\`json
{"members_found": N, "added": N, "skipped_already_exists": N, "created_new_entities": N, "not_found_in_source": []}
\`\`\`

- members_found: total unique direct members found from official source
- added: number of new FMI records created
- skipped_already_exists: number skipped because FMI record already existed
- created_new_entities: number of new legal entities created during this run
- not_found_in_source: leave empty []`;
}

const FMI_ALLOWED_TOOLS = [
  "web_search",
  "list_banking_groups",
  "create_banking_group",
  "update_banking_group",
  "list_legal_entities",
  "create_legal_entity",
  "update_legal_entity",
  "list_bics",
  "create_bic",
  "list_fmis",
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
  maxSteps = 100
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

      if (onStep) await onStep(name, args, `${name}(${args.query || args.fmi_name || args.legal_name || args.group_name || ""})`);

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

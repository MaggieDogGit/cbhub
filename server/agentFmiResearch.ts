import { storage } from "./storage";
import { runAgentLoop, executeTool } from "./agentCore";

export function buildFmiResearchPrompt(fmiName: string, fmiDetails: any): string {
  const websiteInfo = fmiDetails.website ? `Website: ${fmiDetails.website}` : "";
  const membershipUrlInfo = fmiDetails.membership_url ? `Membership URL: ${fmiDetails.membership_url}` : "";

  return `You are the FMI Research Agent, an expert in financial market infrastructure memberships.
Your task is to research and record DIRECT members of the FMI: "${fmiName}".

${websiteInfo}
${membershipUrlInfo}

---
## RESEARCH GUIDELINES
1. **Direct Members ONLY**:
   - For CLS (Continuous Linked Settlement), only "Settlement Members" are direct participants. These are institutional shareholders who submit trades directly to CLS.
   - Third-party customers who route via a Settlement Member are NOT to be recorded.
   - For SWIFT, only direct SWIFT members who are banks are valid. Do not record messaging providers or non-bank entities.
   - For payment systems (RTGS), only direct participants should be recorded.

2. **Source Verification**:
   - Use web_search to find the official member list, preferably starting from the Membership URL provided above.
   - Every FMI record MUST have a \`source\` field containing the URL where the membership was verified.

3. **Database Integration**:
   - Call \`list_legal_entities\` first. ONLY create FMI records for entities that ALREADY exist in the database.
   - If an entity is not in the database, do NOT create a new legal entity; instead, note it in your final summary.
   - Call \`list_fmis\` first to avoid creating duplicate membership records.

4. **Output Format**:
   - After finishing your research and database updates, you MUST output a final message containing ONLY a JSON summary in this format:
     \`\`\`json
     {"members_found": N, "added": N, "skipped_already_exists": N, "not_in_db": ["name1", "name2"]}
     \`\`\`
   - Do not include any other text in the final message after the JSON.

---
## WORKFLOW
1. Search for the official list of direct members for ${fmiName}.
2. Get the list of existing legal entities from the database.
3. Get the list of existing FMI memberships from the database.
4. For each direct member found in the official list:
   - Match it against existing legal entities.
   - If a match is found and no membership record exists for this FMI, call \`create_fmi\`.
   - Record progress.
5. Provide the final JSON summary.`;
}

export function getFmiResearchTools(): any[] {
  // Reuse tools from agentCore that are relevant for FMI research
  const allTools = [
    "web_search",
    "list_legal_entities",
    "list_fmis",
    "create_fmi"
  ];
  
  // For simplicity in this task, we'll manually define them or import if possible.
  // Since agentCore doesn't export the individual tool definitions, we define them here.
  return [
    { type: "function", function: { name: "web_search", description: "Search the web for current information", parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } } } },
    { type: "function", function: { name: "list_legal_entities", description: "List all legal entities in the database", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "list_fmis", description: "List all FMI memberships in the database", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "create_fmi", description: "Create a new FMI membership record", parameters: { type: "object", required: ["legal_entity_id", "fmi_name"], properties: { legal_entity_id: { type: "string" }, fmi_name: { type: "string" }, fmi_type: { type: "string" }, member_since: { type: "string" }, notes: { type: "string" }, source: { type: "string" } } } } },
  ];
}

export async function executeFmiTool(name: string, args: any): Promise<string> {
  // Reuse executeTool from agentCore but only for allowed tools
  const allowedTools = ["web_search", "list_legal_entities", "list_fmis", "create_fmi"];
  if (!allowedTools.includes(name)) {
    return JSON.stringify({ error: `Tool ${name} is not allowed for FMI research.` });
  }
  return executeTool(name, args);
}

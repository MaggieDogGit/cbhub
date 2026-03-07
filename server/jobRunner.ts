import { storage } from "./storage";
import { buildSystemPrompt, runAgentLoop } from "./agentCore";

let isProcessing = false;

function buildJobPrompt(groupName: string, groupId: string, entityCount: number, bicCount: number, serviceCount: number, primaryCurrency: string | null | undefined, cbProbability: string | null | undefined): string {
  return `Run the CB Entity Setup workflow for ${groupName}:

1. Search the web to identify which legal entities within ${groupName} actively provide Correspondent Banking services to other financial institutions. For each entity found, check if it already exists in the database before creating it.

2. For each identified CB legal entity, find their primary BIC/SWIFT code. Add it using create_bic if not already present (check list_bics first).

3. For each BIC, ensure a Correspondent Banking service exists in the home currency${primaryCurrency ? ` (${primaryCurrency})` : ""}. Also identify and add any other currencies that entity is known to offer CB services in.

4. If any FMI memberships are discovered (e.g. SWIFT, TARGET2, CLS, Euroclear), record them using create_fmi with the correct fmi_type category and fmi_name.

Current database state for this group (ID: ${groupId}): ${entityCount} legal entit${entityCount !== 1 ? "ies" : "y"}, ${bicCount} BIC${bicCount !== 1 ? "s" : ""}, ${serviceCount} service${serviceCount !== 1 ? "s" : ""} recorded. CB probability: ${cbProbability || "not set"}. Home currency: ${primaryCurrency || "not set"}.

Check for duplicates before creating any record. Work through each step fully before moving to the next.`;
}

async function processNextJob() {
  if (isProcessing) return;

  const jobs = await storage.listJobs();
  const pending = jobs.find(j => j.status === "pending");
  if (!pending) return;

  isProcessing = true;
  console.log(`[JobRunner] Starting job ${pending.id} for ${pending.banking_group_name}`);

  try {
    const conv = await storage.createConversation({ name: `CB Setup: ${pending.banking_group_name}` });
    await storage.updateJob(pending.id, {
      status: "running",
      conversation_id: conv.id,
      started_at: new Date(),
    } as any);

    const group = await storage.getBankingGroup(pending.banking_group_id);
    if (!group) throw new Error(`Banking group ${pending.banking_group_id} not found`);

    const [entities, bics, services, sources] = await Promise.all([
      storage.listLegalEntities(),
      storage.listBics(),
      storage.listCorrespondentServices(),
      storage.listDataSources(),
    ]);

    const groupEntities = entities.filter(e => e.group_id === group.id);
    const groupBics = groupEntities.flatMap(e => bics.filter(b => b.legal_entity_id === e.id));
    const groupServices = groupBics.flatMap(b => services.filter(s => s.bic_id === b.id));

    const message = buildJobPrompt(
      group.group_name,
      group.id,
      groupEntities.length,
      groupBics.length,
      groupServices.length,
      group.primary_currency,
      group.cb_probability,
    );

    await storage.createMessage({ conversation_id: conv.id, role: "user", content: message });

    const systemPrompt = buildSystemPrompt(sources);
    const openaiMessages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    let stepCount = 0;
    const assistantContent = await runAgentLoop(
      openaiMessages,
      async (toolName, _args, statusText) => {
        stepCount++;
        console.log(`[JobRunner] ${pending.banking_group_name} — step ${stepCount}: ${statusText}`);
        await storage.updateJob(pending.id, { steps_completed: stepCount } as any);
      },
      15
    );

    await storage.createMessage({ conversation_id: conv.id, role: "assistant", content: assistantContent });
    await storage.updateJob(pending.id, {
      status: "completed",
      completed_at: new Date(),
      steps_completed: stepCount,
    } as any);

    console.log(`[JobRunner] Completed job ${pending.id} for ${pending.banking_group_name} (${stepCount} steps)`);
  } catch (err: any) {
    console.error(`[JobRunner] Job ${pending.id} failed:`, err.message);
    await storage.updateJob(pending.id, {
      status: "failed",
      error_message: err.message,
      completed_at: new Date(),
    } as any).catch(() => {});
  } finally {
    isProcessing = false;
  }
}

export function startJobRunner() {
  console.log("[JobRunner] Starting background job runner (30s poll interval)");
  // Process immediately on startup (in case jobs were queued before restart)
  setTimeout(processNextJob, 5000);
  // Then poll every 30 seconds
  setInterval(processNextJob, 30_000);
}

import { storage } from "./storage";
import { buildFmiResearchPrompt, runFmiAgentLoop } from "./agentFmiResearch";

let isFmiProcessing = false;
const FMI_JOB_COOLDOWN_MS = 60_000;

async function processNextFmiJob() {
  if (isFmiProcessing) return;

  const jobs = await storage.listFmiResearchJobs();
  const pending = jobs.find(j => j.status === "pending");
  if (!pending) return;

  isFmiProcessing = true;
  console.log(`[FmiJobRunner] Starting job ${pending.id} for FMI: ${pending.fmi_name}`);

  try {
    const fmiRegistryEntry = await storage.getFmiRegistryByName(pending.fmi_name);
    if (!fmiRegistryEntry) {
      throw new Error(`FMI "${pending.fmi_name}" not found in registry.`);
    }

    const conv = await storage.createConversation({ name: `FMI Research: ${pending.fmi_name}` });
    await storage.updateFmiResearchJob(pending.id, {
      status: "running",
      conversation_id: conv.id,
      started_at: new Date(),
    });

    const prompt = buildFmiResearchPrompt(pending.fmi_name, fmiRegistryEntry);

    const openaiMessages: any[] = [
      { role: "system", content: prompt }
    ];

    let stepCount = 0;
    const assistantContent = await runFmiAgentLoop(
      openaiMessages,
      async (_toolName, _args, statusText) => {
        stepCount++;
        console.log(`[FmiJobRunner] ${pending.fmi_name} — step ${stepCount}: ${statusText}`);
        await storage.updateFmiResearchJob(pending.id, { steps_completed: stepCount });
      },
      100 // Max steps — enough for 75 members each needing several tool calls
    );

    // Create a message in the conversation
    await storage.createMessage({ conversation_id: conv.id, role: "assistant", content: assistantContent });

    // Parse summary JSON from the final message
    let membersAdded = 0;
    let membersSkipped = 0;
    let summaryText = assistantContent;

    const jsonMatch = assistantContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const summary = JSON.parse(jsonMatch[0]);
        membersAdded = summary.added || 0;
        membersSkipped = summary.skipped_already_exists || 0;
        summaryText = JSON.stringify(summary, null, 2);
      } catch (e) {
        console.error("[FmiJobRunner] Failed to parse summary JSON", e);
      }
    }

    await storage.updateFmiResearchJob(pending.id, {
      status: "completed",
      completed_at: new Date(),
      members_added: membersAdded,
      members_skipped: membersSkipped,
      summary: summaryText,
    });

    console.log(`[FmiJobRunner] Completed job ${pending.id} for ${pending.fmi_name}. Cooling down.`);
  } catch (err: any) {
    console.error(`[FmiJobRunner] Job ${pending.id} failed:`, err.message);
    await storage.updateFmiResearchJob(pending.id, {
      status: "failed",
      error_message: err.message,
      completed_at: new Date(),
    }).catch(() => {});
  } finally {
    setTimeout(() => {
      isFmiProcessing = false;
    }, FMI_JOB_COOLDOWN_MS);
  }
}

export async function startFmiJobRunner() {
  console.log("[FmiJobRunner] Starting FMI research background job runner");

  try {
    const jobs = await storage.listFmiResearchJobs();
    const stuckJobs = jobs.filter(j => j.status === "running");
    if (stuckJobs.length > 0) {
      console.log(`[FmiJobRunner] Resetting ${stuckJobs.length} stuck "running" job(s) to "pending"`);
      for (const job of stuckJobs) {
        await storage.updateFmiResearchJob(job.id, {
          status: "pending",
          started_at: null,
          conversation_id: null,
        });
      }
    }
  } catch (err: any) {
    console.error("[FmiJobRunner] Failed to reset stuck jobs:", err.message);
  }

  // Poll for pending jobs every 5s
  setInterval(processNextFmiJob, 5000);
}

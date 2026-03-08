import { storage } from "./storage";
import { runFmiMemberDiscovery, processFmiMember, loadDbContext } from "./agentFmiResearch";

let isFmiProcessing = false;
const FMI_JOB_COOLDOWN_MS = 15_000;
const MEMBERS_PER_RUN = 100;

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

    // ── Phase 1: Discover member list ────────────────────────────────────────
    let memberList: string[] = pending.member_list ? JSON.parse(pending.member_list) : [];

    if (memberList.length === 0) {
      console.log(`[FmiJobRunner] Phase 1: Discovering members for ${pending.fmi_name}...`);
      memberList = await runFmiMemberDiscovery(pending.fmi_name, fmiRegistryEntry);
      console.log(`[FmiJobRunner] Discovered ${memberList.length} members`);

      await storage.updateFmiResearchJob(pending.id, {
        member_list: JSON.stringify(memberList),
        total_members: memberList.length,
      });
    }

    if (memberList.length === 0) {
      throw new Error(`Could not discover any members for ${pending.fmi_name}. Check the membership URL in the registry.`);
    }

    // ── Phase 2: Process each member ─────────────────────────────────────────
    // Load full DB context once — shared across all member calls for this run.
    // The agent receives this snapshot so it can match entities without blind queries.
    const ctx = await loadDbContext();

    // Quick skip set based on already-recorded FMI members
    const existingFmis = await storage.listFmisByName(pending.fmi_name);
    const existingNames = new Set(existingFmis.map(f => f.legal_entity_name?.toLowerCase().trim()));

    let membersAdded = 0;
    let membersSkipped = 0;
    let membersProcessed = 0;
    const sourceUrl = fmiRegistryEntry.membership_url || fmiRegistryEntry.website || "";
    const fmiType = fmiRegistryEntry.fmi_type || "FX Settlement Systems";

    for (const memberName of memberList) {
      if (membersProcessed >= MEMBERS_PER_RUN) break;

      // Quick skip if name already in existing FMI records
      const nameLower = memberName.toLowerCase().trim();
      if (existingNames.has(nameLower)) {
        membersSkipped++;
        membersProcessed++;
        console.log(`[FmiJobRunner] Skipping (already exists): ${memberName}`);
        await storage.updateFmiResearchJob(pending.id, {
          members_added: membersAdded,
          members_skipped: membersSkipped,
          steps_completed: membersProcessed,
        });
        continue;
      }

      console.log(`[FmiJobRunner] Processing member ${membersProcessed + 1}/${memberList.length}: ${memberName}`);
      // Pass the shared ctx — it gets updated in-place as new entities are created
      const result = await processFmiMember(memberName, pending.fmi_name, fmiType, sourceUrl, ctx);

      if (result.action === "added") {
        membersAdded++;
        existingNames.add((result.entity_name || memberName).toLowerCase().trim());
        console.log(`[FmiJobRunner]  → Added: ${result.entity_name || memberName}`);
      } else if (result.action === "skipped") {
        membersSkipped++;
        console.log(`[FmiJobRunner]  → Skipped: ${result.reason}`);
      } else {
        console.warn(`[FmiJobRunner]  → Error processing ${memberName}: ${result.reason}`);
        membersSkipped++;
      }

      membersProcessed++;
      await storage.updateFmiResearchJob(pending.id, {
        members_added: membersAdded,
        members_skipped: membersSkipped,
        steps_completed: membersProcessed,
      });
    }

    const totalProcessed = membersAdded + membersSkipped;
    const remaining = memberList.length - totalProcessed;
    const isFullyComplete = remaining <= 0;

    const summary = JSON.stringify({
      members_found: memberList.length,
      processed_this_run: membersProcessed,
      added: membersAdded,
      skipped_already_exists: membersSkipped,
      remaining: Math.max(0, remaining),
      complete: isFullyComplete,
    }, null, 2);

    await storage.updateFmiResearchJob(pending.id, {
      status: "completed",
      completed_at: new Date(),
      members_added: membersAdded,
      members_skipped: membersSkipped,
      total_members: memberList.length,
      summary,
    });

    await storage.createMessage({ conversation_id: conv.id, role: "assistant", content: summary });

    if (isFullyComplete) {
      console.log(`[FmiJobRunner] Fully completed ${pending.fmi_name}: ${membersAdded} added, ${membersSkipped} skipped.`);
    } else {
      console.log(`[FmiJobRunner] Partial run for ${pending.fmi_name}: processed ${membersProcessed}, ${remaining} remaining. Auto-requeueing.`);
      // Auto-requeue with existing member_list so discovery is skipped
      await storage.createFmiResearchJob({
        fmi_name: pending.fmi_name,
        status: "pending",
        member_list: JSON.stringify(memberList),
        total_members: memberList.length,
      });
    }

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

  setInterval(processNextFmiJob, 5000);
}

import { Router } from "express";
import { storage } from "../storage";
import { researchBank } from "../services/researchService";

const router = Router();

router.post("/research", async (req, res) => {
  const { bankName } = req.body;
  if (!bankName) return res.status(400).json({ message: "bankName required" });
  try {
    const result = await researchBank(bankName);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/fmi-research-jobs", async (_req, res) => {
  res.json(await storage.listFmiResearchJobs());
});
router.post("/fmi-research-jobs", async (req, res) => {
  const { fmi_name, member_list, total_members } = req.body;
  if (!fmi_name) return res.status(400).json({ message: "fmi_name required" });
  const registryEntry = await storage.getFmiRegistryByName(fmi_name);
  if (!registryEntry) return res.status(400).json({ message: `FMI "${fmi_name}" not found in registry.` });

  const jobData: any = { fmi_name, status: "pending" };
  if (member_list) jobData.member_list = member_list;
  if (total_members) jobData.total_members = total_members;
  const job = await storage.createFmiResearchJob(jobData);
  res.status(201).json(job);
});
router.post("/fmi-research-jobs/stop-queue", async (_req, res) => {
  const jobs = await storage.listFmiResearchJobs();
  const pending = jobs.filter(j => j.status === "pending");
  for (const job of pending) {
    await storage.updateFmiResearchJob(job.id, { status: "failed", error_message: "Job cancelled by user" });
  }
  res.json({ stopped: pending.length });
});

export default router;

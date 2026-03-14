// Absorbed from server/routes.ts: /api/research endpoint (AI web search + structuring)

import { Router } from "express";
import OpenAI from "openai";
import { storage } from "../storage";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const router = Router();

router.post("/research", async (req, res) => {
  const { bankName } = req.body;
  if (!bankName) return res.status(400).json({ message: "bankName required" });
  try {
    const searchResponse = await openai.chat.completions.create({
      model: "gpt-4o-search-preview",
      messages: [
        {
          role: "user",
          content: `Search for current information about "${bankName}" correspondent banking services, currencies they clear, RTGS memberships, CLS membership, and their role as a correspondent bank. Include their headquarters country and whether they are a G-SIB.`,
        },
      ],
    } as any);
    const webContext = searchResponse.choices[0].message.content || "";

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a correspondent banking expert. Return only valid JSON.",
        },
        {
          role: "user",
          content: `Based on the following up-to-date web research, structure the correspondent banking information for "${bankName}" as JSON.

Web research:
${webContext}

Return ONLY a valid JSON object like this:
{
  "bank": "${bankName}",
  "headquarters": "Country name",
  "gsib": true or false,
  "services": [
    {
      "currency": "USD",
      "service_type": "Correspondent Banking",
      "rtgs_membership": true,
      "instant_scheme_access": false,
      "cls_member": true,
      "nostro_accounts_offered": true,
      "vostro_accounts_offered": true,
      "target_clients": "Banks, Payment Institutions",
      "source": "Web search"
    }
  ]
}

Service type must be one of: Correspondent Banking, Currency Clearing, RTGS Participation, Instant Payments Access, FX Liquidity, CLS Settlement, Custody Services, Transaction Banking, Liquidity Services.
Currencies must be from: EUR, USD, GBP, JPY, CHF, CAD, AUD, SGD, HKD, CNH, SEK, NOK, DKK, PLN, CZK, HUF, RON, TRY, ZAR, BRL, MXN, INR.
Only include currencies and services you found evidence for in the research.`,
        },
      ],
    });
    const result = JSON.parse(response.choices[0].message.content || "{}");
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

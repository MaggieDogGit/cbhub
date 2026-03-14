// Absorbed from server/routes.ts: /api/jobs/* endpoints (CRUD, queue-all, stop-queue, market-scan)

import { Router } from "express";
import { storage } from "../storage";
import { COUNTRY_CURRENCY, CURRENCY_COUNTRY } from "../services/cbDiscoveryService";

const router = Router();

router.get("/jobs", async (_req, res) => {
  res.json(await storage.listJobs());
});

router.post("/jobs", async (req, res) => {
  const { banking_group_id, banking_group_name, currency_scope, job_mode } = req.body;
  if (!banking_group_id || !banking_group_name) return res.status(400).json({ message: "banking_group_id and banking_group_name required" });
  const existing = await storage.listJobs();
  const active = existing.find(j => j.banking_group_id === banking_group_id && (j.status === "pending" || j.status === "running"));
  if (active) return res.status(409).json({ message: "A job for this banking group is already queued or running.", job: active });
  const mode = job_mode === "light" ? "light" : "normal";
  const scope = mode === "light" ? "home_only" : (["home_only", "major", "all"].includes(currency_scope) ? currency_scope : "home_only");
  const job = await storage.createJob({ banking_group_id, banking_group_name, status: "pending", currency_scope: scope, job_mode: mode });
  res.json(job);
});

router.delete("/jobs/:id", async (req, res) => {
  const job = await storage.getJob(req.params.id);
  if (job && job.status === "running") return res.status(409).json({ message: "Cannot delete a running job. Wait for it to complete." });
  await storage.deleteJob(req.params.id);
  res.json({ ok: true });
});

router.post("/jobs/stop-queue", async (req, res) => {
  const jobs = await storage.listJobs();
  const pending = jobs.filter(j => j.status === "pending");
  for (const job of pending) await storage.deleteJob(job.id);
  res.json({ stopped: pending.length });
});

router.post("/jobs/queue-all", async (req, res) => {
  const { group_ids, currency_scope, job_mode } = req.body as { group_ids: { id: string; name: string }[]; currency_scope?: string; job_mode?: string };
  if (!Array.isArray(group_ids)) return res.status(400).json({ message: "group_ids array required" });
  const mode = job_mode === "light" ? "light" : "normal";
  const scope = mode === "light" ? "home_only" : (["home_only", "major", "all"].includes(currency_scope || "") ? currency_scope! : "home_only");
  const existing = await storage.listJobs();
  const activeIds = new Set(existing.filter(j => j.status === "pending" || j.status === "running").map(j => j.banking_group_id));
  const queued = [];
  for (const { id, name } of group_ids) {
    if (!activeIds.has(id)) {
      const job = await storage.createJob({ banking_group_id: id, banking_group_name: name, status: "pending", currency_scope: scope, job_mode: mode });
      queued.push(job);
    }
  }
  res.json({ queued: queued.length, jobs: queued });
});

router.post("/jobs/market-scan", async (req, res) => {
  let { market_country, market_currency } = req.body as { market_country?: string; market_currency?: string };
  if (!market_country && !market_currency) {
    return res.status(400).json({ message: "Provide market_country, market_currency, or both." });
  }
  if (market_country && !market_currency) {
    market_currency = COUNTRY_CURRENCY[market_country] || "EUR";
  } else if (market_currency && !market_country) {
    if (market_currency === "EUR") {
      return res.status(400).json({ message: "EUR covers multiple countries. Please specify a market_country (e.g. Germany, France, Italy)." });
    }
    market_country = CURRENCY_COUNTRY[market_currency];
    if (!market_country) return res.status(400).json({ message: `No home country known for "${market_currency}". Please specify market_country explicitly.` });
  }
  const existing = await storage.listJobs();
  const dupe = existing.find(j =>
    j.job_type === "market_scan" &&
    j.market_country === market_country &&
    j.market_currency === market_currency &&
    (j.status === "pending" || j.status === "running")
  );
  if (dupe) return res.status(409).json({ message: "A market scan for this country/currency is already queued or running.", job: dupe });
  const dry_run = req.body.dry_run === true;
  const job = await storage.createJob({
    status: "pending",
    currency_scope: "home_only",
    job_mode: "normal",
    job_type: "market_scan",
    market_country,
    market_currency,
    dry_run,
  });
  res.json(job);
});

export default router;

import { Router } from "express";
import { storage } from "../storage";

const router = Router();

router.get("/dashboard/currency-providers", async (_req, res) => {
  res.json(await storage.getDashboardCurrencyProviders());
});

router.get("/dashboard/coverage-map", async (_req, res) => {
  res.json(await storage.getDashboardCoverageMap());
});

export default router;

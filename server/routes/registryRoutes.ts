// Absorbed from server/routes.ts: banking groups, legal entities, BICs, correspondent services,
// CLS profiles, FMIs, FMI registry, data sources, intel observations, CB taxonomy routes

import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { fmiTaxonomy } from "@shared/schema";
import {
  listBankingGroups, createBankingGroup, updateBankingGroup, deleteBankingGroup,
  mergeBankingGroups, mergeLegalEntities,
} from "../services/bankingGroupService";
import {
  insertBankingGroupSchema, insertLegalEntitySchema, insertBicSchema,
  insertCorrespondentServiceSchema, insertClsProfileSchema, insertFmiSchema,
  insertFmiRegistrySchema, insertDataSourceSchema, insertIntelObservationSchema,
  insertCbCapabilityValueSchema, insertCbIndirectParticipationSchema,
} from "@shared/schema";

const router = Router();

router.get("/banking-groups", async (_req, res) => {
  res.json(await listBankingGroups());
});
router.post("/banking-groups", async (req, res) => {
  const parsed = insertBankingGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  res.json(await createBankingGroup(parsed.data));
});
router.patch("/banking-groups/:id", async (req, res) => {
  res.json(await updateBankingGroup(req.params.id, req.body));
});
router.delete("/banking-groups/:id", async (req, res) => {
  await deleteBankingGroup(req.params.id);
  res.json({ ok: true });
});
router.post("/banking-groups/merge", async (req, res) => {
  const { keep_id, delete_id } = req.body;
  if (!keep_id || !delete_id) return res.status(400).json({ message: "keep_id and delete_id are required" });
  if (keep_id === delete_id) return res.status(400).json({ message: "keep_id and delete_id must be different" });
  try {
    const result = await mergeBankingGroups(keep_id, delete_id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/legal-entities", async (_req, res) => {
  res.json(await storage.listLegalEntities());
});
router.post("/legal-entities", async (req, res) => {
  const parsed = insertLegalEntitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  res.json(await storage.createLegalEntity(parsed.data));
});
router.patch("/legal-entities/:id", async (req, res) => {
  res.json(await storage.updateLegalEntity(req.params.id, req.body));
});
router.delete("/legal-entities/:id", async (req, res) => {
  await storage.deleteLegalEntity(req.params.id);
  res.json({ ok: true });
});
router.post("/legal-entities/merge", async (req, res) => {
  const { keep_id, delete_id } = req.body;
  if (!keep_id || !delete_id) return res.status(400).json({ message: "keep_id and delete_id are required" });
  if (keep_id === delete_id) return res.status(400).json({ message: "keep_id and delete_id must be different" });
  try {
    const result = await mergeLegalEntities(keep_id, delete_id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/bics", async (_req, res) => {
  res.json(await storage.listBics());
});
router.post("/bics", async (req, res) => {
  const parsed = insertBicSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  res.json(await storage.createBic(parsed.data));
});
router.patch("/bics/:id", async (req, res) => {
  res.json(await storage.updateBic(req.params.id, req.body));
});
router.delete("/bics/:id", async (req, res) => {
  await storage.deleteBic(req.params.id);
  res.json({ ok: true });
});

router.get("/correspondent-services", async (req, res) => {
  const currency = req.query.currency as string | undefined;
  res.json(await storage.listCorrespondentServices(currency));
});
router.post("/correspondent-services", async (req, res) => {
  const parsed = insertCorrespondentServiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  res.json(await storage.createCorrespondentService(parsed.data));
});
router.patch("/correspondent-services/:id", async (req, res) => {
  res.json(await storage.updateCorrespondentService(req.params.id, req.body));
});
router.delete("/correspondent-services/:id", async (req, res) => {
  await storage.deleteCorrespondentService(req.params.id);
  res.json({ ok: true });
});

router.get("/cls-profiles", async (_req, res) => {
  res.json(await storage.listClsProfiles());
});
router.post("/cls-profiles", async (req, res) => {
  const parsed = insertClsProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  res.json(await storage.createClsProfile(parsed.data));
});
router.patch("/cls-profiles/:id", async (req, res) => {
  res.json(await storage.updateClsProfile(req.params.id, req.body));
});
router.delete("/cls-profiles/:id", async (req, res) => {
  await storage.deleteClsProfile(req.params.id);
  res.json({ ok: true });
});

router.get("/fmis", async (_req, res) => {
  res.json(await storage.listFmis());
});
router.post("/fmis", async (req, res) => {
  const parsed = insertFmiSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  res.json(await storage.createFmi(parsed.data));
});
router.patch("/fmis/:id", async (req, res) => {
  res.json(await storage.updateFmi(req.params.id, req.body));
});
router.delete("/fmis/:id", async (req, res) => {
  await storage.deleteFmi(req.params.id);
  res.json({ ok: true });
});

router.get("/fmi-registry", async (_req, res) => {
  res.json(await storage.listFmiRegistry());
});
router.post("/fmi-registry", async (req, res) => {
  const parsed = insertFmiRegistrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  res.json(await storage.createFmiRegistryEntry(parsed.data));
});
router.patch("/fmi-registry/:id", async (req, res) => {
  res.json(await storage.updateFmiRegistryEntry(req.params.id, req.body));
});
router.delete("/fmi-registry/:id", async (req, res) => {
  await storage.deleteFmiRegistryEntry(req.params.id);
  res.json({ ok: true });
});

router.get("/data-sources", async (_req, res) => {
  res.json(await storage.listDataSources());
});
router.post("/data-sources", async (req, res) => {
  const parsed = insertDataSourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  res.json(await storage.createDataSource(parsed.data));
});
router.patch("/data-sources/:id", async (req, res) => {
  res.json(await storage.updateDataSource(req.params.id, req.body));
});
router.delete("/data-sources/:id", async (req, res) => {
  await storage.deleteDataSource(req.params.id);
  res.json({ ok: true });
});

router.get("/intel", async (req, res) => {
  try {
    const filters: { banking_group_id?: string; obs_type?: string } = {};
    if (req.query.banking_group_id) filters.banking_group_id = req.query.banking_group_id as string;
    if (req.query.obs_type) filters.obs_type = req.query.obs_type as string;
    res.json(await storage.listIntelObservations(filters));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});
router.post("/intel", async (req, res) => {
  try {
    const username = process.env.AUTH_USERNAME ?? "user";
    const body = { ...req.body, source_type: "user" as const, source_detail: username };
    const parsed = insertIntelObservationSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const obs = await storage.createIntelObservation(parsed.data);
    res.json(obs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});
router.patch("/intel/:id", async (req, res) => {
  try {
    const obs = await storage.updateIntelObservation(req.params.id, req.body);
    res.json(obs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});
router.delete("/intel/:id", async (req, res) => {
  try {
    await storage.deleteIntelObservation(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/cb-taxonomy", async (_req, res) => {
  try {
    const items = await storage.getCbTaxonomy();
    const grouped: Record<string, typeof items> = {};
    for (const item of items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }
    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/cb-capabilities/:groupId", async (req, res) => {
  try {
    res.json(await storage.getCbCapabilities(req.params.groupId));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/cb-capabilities", async (req, res) => {
  try {
    const parsed = insertCbCapabilityValueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.upsertCbCapability(parsed.data));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/cb-capabilities/:id", async (req, res) => {
  try {
    await storage.deleteCbCapability(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/cb-schemes", async (_req, res) => {
  try {
    res.json(await storage.getCbSchemes());
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/cb-indirect/:groupId", async (req, res) => {
  try {
    res.json(await storage.getCbIndirectParticipation(req.params.groupId));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/cb-indirect", async (req, res) => {
  try {
    const parsed = insertCbIndirectParticipationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.upsertCbIndirectParticipation(parsed.data));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/cb-indirect/:id", async (req, res) => {
  try {
    await storage.deleteCbIndirectParticipation(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Geographic & Currency Reference ──────────────────────────────────────────
router.get("/countries", async (_req, res) => {
  try {
    const rows = await db.execute(`
      SELECT c.id, c.name, c.iso2, c.iso3, c.numeric_code, c.official_name, c.capital, c.region_hint,
        json_agg(json_build_object('code', g.code, 'name', g.name, 'symbol', g.symbol, 'is_primary', cc.is_primary)
          ORDER BY cc.is_primary DESC) FILTER (WHERE g.id IS NOT NULL) AS currencies
      FROM countries c
      LEFT JOIN country_currencies cc ON cc.country_id = c.id
      LEFT JOIN geo_currencies g ON g.id = cc.currency_id
      GROUP BY c.id ORDER BY c.name
    `);
    res.json(rows.rows);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/countries/:iso2", async (req, res) => {
  try {
    const rows = await db.execute(`
      SELECT c.id, c.name, c.iso2, c.iso3, c.numeric_code, c.official_name, c.capital, c.region_hint,
        json_agg(DISTINCT jsonb_build_object('code', g.code, 'name', g.name, 'symbol', g.symbol, 'is_primary', cc.is_primary))
          FILTER (WHERE g.id IS NOT NULL) AS currencies,
        json_agg(DISTINCT jsonb_build_object('id', r.id, 'name', r.name, 'type', r.type))
          FILTER (WHERE r.id IS NOT NULL) AS regions
      FROM countries c
      LEFT JOIN country_currencies cc ON cc.country_id = c.id
      LEFT JOIN geo_currencies g ON g.id = cc.currency_id
      LEFT JOIN region_members rm ON rm.country_id = c.id
      LEFT JOIN regions r ON r.id = rm.region_id
      WHERE upper(c.iso2) = upper('${req.params.iso2}')
      GROUP BY c.id
    `);
    if (!rows.rows.length) return res.status(404).json({ message: "Country not found" });
    res.json(rows.rows[0]);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/currencies", async (_req, res) => {
  try {
    const rows = await db.execute(`
      SELECT g.id, g.code, g.name, g.symbol, g.minor_units,
        count(DISTINCT cc.country_id)::int AS country_count,
        bool_or(ca.is_official) AS has_currency_area
      FROM geo_currencies g
      LEFT JOIN country_currencies cc ON cc.currency_id = g.id
      LEFT JOIN currency_areas ca ON ca.currency_id = g.id
      GROUP BY g.id ORDER BY g.code
    `);
    res.json(rows.rows);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/currencies/:code", async (req, res) => {
  try {
    const rows = await db.execute(`
      SELECT g.id, g.code, g.name, g.symbol, g.minor_units,
        json_agg(DISTINCT jsonb_build_object('iso2', c.iso2, 'name', c.name, 'is_primary', cc.is_primary))
          FILTER (WHERE c.id IS NOT NULL) AS countries,
        json_agg(DISTINCT jsonb_build_object('id', r.id, 'name', r.name, 'type', r.type, 'is_official', ca.is_official))
          FILTER (WHERE r.id IS NOT NULL) AS regions
      FROM geo_currencies g
      LEFT JOIN country_currencies cc ON cc.currency_id = g.id
      LEFT JOIN countries c ON c.id = cc.country_id
      LEFT JOIN currency_areas ca ON ca.currency_id = g.id
      LEFT JOIN regions r ON r.id = ca.region_id
      WHERE upper(g.code) = upper('${req.params.code}')
      GROUP BY g.id
    `);
    if (!rows.rows.length) return res.status(404).json({ message: "Currency not found" });
    res.json(rows.rows[0]);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/regions", async (_req, res) => {
  try {
    const rows = await db.execute(`
      SELECT r.id, r.name, r.type, r.description,
        count(DISTINCT rm.country_id)::int AS member_count
      FROM regions r
      LEFT JOIN region_members rm ON rm.region_id = r.id
      GROUP BY r.id ORDER BY r.type, r.name
    `);
    res.json(rows.rows);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/regions/:id", async (req, res) => {
  try {
    const rows = await db.execute(`
      SELECT r.id, r.name, r.type, r.description,
        json_agg(DISTINCT jsonb_build_object('iso2', c.iso2, 'iso3', c.iso3, 'name', c.name, 'capital', c.capital))
          FILTER (WHERE c.id IS NOT NULL) AS members,
        json_agg(DISTINCT jsonb_build_object('code', g.code, 'name', g.name, 'symbol', g.symbol, 'is_official', ca.is_official))
          FILTER (WHERE g.id IS NOT NULL) AS currencies
      FROM regions r
      LEFT JOIN region_members rm ON rm.region_id = r.id
      LEFT JOIN countries c ON c.id = rm.country_id
      LEFT JOIN currency_areas ca ON ca.region_id = r.id
      LEFT JOIN geo_currencies g ON g.id = ca.currency_id
      WHERE r.id = '${req.params.id}'
      GROUP BY r.id
    `);
    if (!rows.rows.length) return res.status(404).json({ message: "Region not found" });
    res.json(rows.rows[0]);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── FMI Taxonomy v1 ──────────────────────────────────────────────────────────
router.get("/fmi-taxonomy", async (_req, res) => {
  try {
    const rows = await db.select().from(fmiTaxonomy).orderBy(fmiTaxonomy.type, fmiTaxonomy.subtype, fmiTaxonomy.name);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/fmi-taxonomy/:id", async (req, res) => {
  try {
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(fmiTaxonomy).where(eq(fmiTaxonomy.id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ message: "FMI not found" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;

// Absorbed from server/routes.ts: banking groups, legal entities, BICs, correspondent services,
// CLS profiles, FMIs, FMI registry, data sources, intel observations, CB taxonomy routes

import { Router } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
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

// ── FMI Taxonomy v2 ───────────────────────────────────────────────────────────

router.get("/fmi-domains", async (_req, res) => {
  try {
    const rows = await db.execute(`
      SELECT d.id, d.code, d.name, d.description, d.sort_order,
        count(e.id)::int AS entry_count
      FROM fmi_domains d
      LEFT JOIN fmi_categories c ON c.domain_id = d.id
      LEFT JOIN fmi_entries e ON e.category_id = c.id AND e.is_active = true
      WHERE d.is_active = true
      GROUP BY d.id ORDER BY d.sort_order
    `);
    res.json(rows.rows);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/fmi-categories", async (_req, res) => {
  try {
    const rows = await db.execute(`
      SELECT c.id, c.code, c.name, c.description, c.level, c.sort_order,
        c.domain_id, c.parent_category_id,
        d.name AS domain_name, d.code AS domain_code,
        p.name AS parent_name, p.code AS parent_code,
        count(e.id)::int AS entry_count
      FROM fmi_categories c
      JOIN fmi_domains d ON d.id = c.domain_id
      LEFT JOIN fmi_categories p ON p.id = c.parent_category_id
      LEFT JOIN fmi_entries e ON e.category_id = c.id AND e.is_active = true
      WHERE c.is_active = true
      GROUP BY c.id, d.id, p.id ORDER BY d.sort_order, c.level, c.sort_order
    `);
    res.json(rows.rows);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/fmi-entries", async (_req, res) => {
  try {
    const domainFilter = (_req as any).query?.domain;
    const catFilter = (_req as any).query?.category;
    let where = `e.is_active = true`;
    if (domainFilter) where += ` AND d.code = '${domainFilter}'`;
    if (catFilter) where += ` AND (c.code = '${catFilter}' OR p.code = '${catFilter}')`;

    const rows = await db.execute(`
      SELECT e.id, e.name, e.short_name, e.code, e.status,
        e.operator_name, e.functional_role_summary, e.settlement_model,
        e.supports_24x7, e.supports_cross_border, e.primary_currency_code,
        e.description, e.notes,
        c.id AS category_id, c.code AS category_code, c.name AS category_name, c.level AS category_level,
        p.id AS parent_category_id, p.code AS parent_category_code, p.name AS parent_category_name,
        d.id AS domain_id, d.code AS domain_code, d.name AS domain_name
      FROM fmi_entries e
      JOIN fmi_categories c ON c.id = e.category_id
      LEFT JOIN fmi_categories p ON p.id = c.parent_category_id
      JOIN fmi_domains d ON d.id = c.domain_id
      WHERE ${where}
      ORDER BY d.sort_order, c.level, c.sort_order, e.name
    `);
    res.json(rows.rows);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/fmi-entries/:id", async (req, res) => {
  try {
    const rows = await db.execute(`
      SELECT e.*,
        c.code AS category_code, c.name AS category_name, c.level AS category_level,
        p.code AS parent_category_code, p.name AS parent_category_name,
        d.code AS domain_code, d.name AS domain_name
      FROM fmi_entries e
      JOIN fmi_categories c ON c.id = e.category_id
      LEFT JOIN fmi_categories p ON p.id = c.parent_category_id
      JOIN fmi_domains d ON d.id = c.domain_id
      WHERE e.id = '${req.params.id}'
    `);
    if (!rows.rows.length) return res.status(404).json({ message: "FMI not found" });
    const entry = rows.rows[0] as any;

    // Fetch relationships
    const rels = await db.execute(`
      SELECT r.id, r.notes, r.is_active,
        rt.code AS rel_type_code, rt.name AS rel_type_name,
        src.id AS source_id, src.name AS source_name, src.code AS source_code,
        tgt.id AS target_id, tgt.name AS target_name, tgt.code AS target_code,
        tc.name AS target_category_name
      FROM fmi_relationships r
      JOIN fmi_relationship_types rt ON rt.id = r.relationship_type_id
      JOIN fmi_entries src ON src.id = r.source_fmi_id
      JOIN fmi_entries tgt ON tgt.id = r.target_fmi_id
      JOIN fmi_categories tc ON tc.id = tgt.category_id
      WHERE (r.source_fmi_id = '${req.params.id}' OR r.target_fmi_id = '${req.params.id}')
        AND r.is_active = true
      ORDER BY rt.code
    `);
    entry.relationships = rels.rows;
    res.json(entry);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
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

// ── FMI Specifications & Payment Capability Model ───────────────────────────

router.get("/fmi-specifications/:fmiId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, e.name AS fmi_name, e.code AS fmi_code
       FROM fmi_specifications s
       JOIN fmi_entries e ON e.id = s.fmi_id
       WHERE s.fmi_id = $1`,
      [req.params.fmiId]
    );
    if (!rows.length) return res.status(404).json({ message: "No specification found for this FMI" });
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/payment-scheme-specs/:fmiId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ps.*, e.name AS fmi_name, e.code AS fmi_code
       FROM payment_scheme_specifications ps
       JOIN fmi_entries e ON e.id = ps.fmi_id
       WHERE ps.fmi_id = $1`,
      [req.params.fmiId]
    );
    if (!rows.length) return res.status(404).json({ message: "No scheme specification found for this FMI" });
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/payment-scheme-scenarios/:schemeId", async (req, res) => {
  try {
    const { rows: scenarios } = await pool.query(
      `SELECT s.*
       FROM payment_scheme_processing_scenarios s
       WHERE s.scheme_fmi_id = $1 AND s.is_active = true
       ORDER BY s.is_default DESC, s.name`,
      [req.params.schemeId]
    );
    for (const sc of scenarios) {
      const { rows: rels } = await pool.query(
        `SELECT sr.id, sr.notes, sr.is_active,
           rt.code AS rel_type_code, rt.name AS rel_type_name,
           tgt.id AS target_id, tgt.name AS target_name, tgt.code AS target_code,
           tc.name AS target_category_name
         FROM payment_scheme_scenario_relationships sr
         JOIN fmi_relationship_types rt ON rt.id = sr.relationship_type_id
         JOIN fmi_entries tgt ON tgt.id = sr.target_fmi_id
         JOIN fmi_categories tc ON tc.id = tgt.category_id
         WHERE sr.scenario_id = $1 AND sr.is_active = true
         ORDER BY rt.code`,
        [sc.id]
      );
      sc.relationships = rels;
    }
    res.json(scenarios);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/payment-scheme-processing-scenarios/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, e.name AS scheme_name, e.code AS scheme_code
       FROM payment_scheme_processing_scenarios s
       JOIN fmi_entries e ON e.id = s.scheme_fmi_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Processing scenario not found" });
    const scenario = rows[0] as any;
    const { rows: rels } = await pool.query(
      `SELECT sr.id, sr.notes, sr.is_active,
         rt.code AS rel_type_code, rt.name AS rel_type_name,
         tgt.id AS target_id, tgt.name AS target_name, tgt.code AS target_code,
         tc.name AS target_category_name
       FROM payment_scheme_scenario_relationships sr
       JOIN fmi_relationship_types rt ON rt.id = sr.relationship_type_id
       JOIN fmi_entries tgt ON tgt.id = sr.target_fmi_id
       JOIN fmi_categories tc ON tc.id = tgt.category_id
       WHERE sr.scenario_id = $1 AND sr.is_active = true
       ORDER BY rt.code`,
      [req.params.id]
    );
    scenario.relationships = rels;
    res.json(scenario);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.get("/fmi-entries/:id/capability", async (req, res) => {
  try {
    const fmiId = req.params.id;
    const scenarioId = req.query.scenario_id as string | undefined;

    const { rows: entryRows } = await pool.query(
      `SELECT e.id, e.name, e.code,
         c.code AS category_code, c.name AS category_name
       FROM fmi_entries e
       JOIN fmi_categories c ON c.id = e.category_id
       WHERE e.id = $1`,
      [fmiId]
    );
    if (!entryRows.length) return res.status(404).json({ message: "FMI not found" });
    const entry = entryRows[0] as any;

    const { rows: specRows } = await pool.query(
      `SELECT * FROM fmi_specifications WHERE fmi_id = $1`, [fmiId]
    );
    const spec = specRows[0] as any | undefined;

    const { rows: schemeRows } = await pool.query(
      `SELECT * FROM payment_scheme_specifications WHERE fmi_id = $1`, [fmiId]
    );
    const scheme = schemeRows[0] as any | undefined;

    let scenario: any = undefined;
    if (scenarioId) {
      const { rows: scRows } = await pool.query(
        `SELECT * FROM payment_scheme_processing_scenarios WHERE id = $1 AND scheme_fmi_id = $2`,
        [scenarioId, fmiId]
      );
      if (!scRows.length) return res.status(404).json({ message: "Scenario not found or not associated with this FMI" });
      scenario = scRows[0] as any;
    }

    const infraCrossBorder = spec?.supports_cross_border_processing ?? null;
    const infraOlo = spec?.supports_one_leg_out_processing ?? null;

    let schemeCrossBorder: boolean | null = null;
    let schemeOlo: boolean | null = null;

    if (scenario) {
      schemeCrossBorder = scenario.supports_cross_border ?? null;
      schemeOlo = scenario.supports_one_leg_out ?? null;
    } else if (scheme) {
      schemeCrossBorder = scheme.scheme_cross_border_allowed ?? null;
      schemeOlo = scheme.scheme_one_leg_out_allowed ?? null;
    }

    const deriveBool = (infra: boolean | null, rule: boolean | null): boolean | null => {
      if (infra === null || rule === null) return null;
      return infra && rule;
    };

    const actualCrossBorder = deriveBool(infraCrossBorder, schemeCrossBorder);
    const actualOlo = deriveBool(infraOlo, schemeOlo);

    res.json({
      fmi_id: fmiId,
      fmi_name: entry.name,
      fmi_code: entry.code,
      category_code: entry.category_code,
      category_name: entry.category_name,
      scenario_id: scenarioId ?? null,
      scenario_name: scenario?.name ?? null,
      infrastructure: {
        supports_cross_border_processing: infraCrossBorder,
        supports_one_leg_out_processing: infraOlo,
      },
      scheme_or_scenario: {
        cross_border_allowed: schemeCrossBorder,
        one_leg_out_allowed: schemeOlo,
        source: scenario ? "scenario" : scheme ? "scheme" : null,
      },
      derived: {
        actual_cross_border: actualCrossBorder,
        actual_one_leg_out: actualOlo,
      },
    });
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

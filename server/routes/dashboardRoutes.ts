// Absorbed from server/routes.ts: /api/dashboard/* endpoints (currency-providers, coverage-map)

import { Router } from "express";
import { pool } from "../db";

const router = Router();

router.get("/dashboard/currency-providers", async (_req, res) => {
  const result = await pool.query(`
    SELECT
      cs.currency,
      bg.group_name
    FROM correspondent_services cs
    JOIN bics b ON b.id = cs.bic_id
    JOIN legal_entities le ON le.id = b.legal_entity_id
    JOIN banking_groups bg ON bg.id = le.group_id
    WHERE cs.clearing_model = 'Onshore'
      AND cs.currency IS NOT NULL
      AND bg.group_name IS NOT NULL
  `);
  const map: Record<string, Set<string>> = {};
  for (const row of result.rows) {
    if (!map[row.currency]) map[row.currency] = new Set();
    map[row.currency].add(row.group_name);
  }
  const data = Object.entries(map)
    .map(([currency, banks]) => ({ currency, count: banks.size, banks: Array.from(banks).sort() }))
    .sort((a, b) => b.count - a.count);
  res.json(data);
});

router.get("/dashboard/coverage-map", async (_req, res) => {
  const result = await pool.query(`
    SELECT
      cs.country,
      cs.currency::text,
      bg.group_name,
      cs.rtgs_membership,
      cs.instant_scheme_access,
      cs.cls_member
    FROM correspondent_services cs
    JOIN bics b ON b.id = cs.bic_id
    JOIN legal_entities le ON le.id = b.legal_entity_id
    JOIN banking_groups bg ON bg.id = le.group_id
    WHERE cs.clearing_model = 'Onshore'
      AND cs.country IS NOT NULL
      AND cs.country != ''
  `);
  res.json(result.rows);
});

export default router;

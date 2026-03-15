import { eq, and, ilike, sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  fmiEntries, fmiCategories, fmiDomains, fmiSpecifications,
  type FmiEntry, type InsertFmiEntry,
  type FmiCategory,
  type FmiSpecification, type InsertFmiSpecification,
} from "@shared/schema";

export interface FmiEntryFilter {
  category_code?: string;
  domain_code?: string;
  name_contains?: string;
  status?: string;
}

export interface FmiEntryWithCategory extends FmiEntry {
  category_code?: string;
  category_name?: string;
  domain_code?: string;
  domain_name?: string;
}

export async function findFmiEntries(filter: FmiEntryFilter): Promise<FmiEntryWithCategory[]> {
  const conditions: string[] = ["e.is_active = true"];
  const params: any[] = [];
  let paramIndex = 1;

  if (filter.category_code) {
    conditions.push(`c.code = $${paramIndex}`);
    params.push(filter.category_code);
    paramIndex++;
  }
  if (filter.domain_code) {
    conditions.push(`d.code = $${paramIndex}`);
    params.push(filter.domain_code);
    paramIndex++;
  }
  if (filter.name_contains) {
    conditions.push(`(e.name ILIKE $${paramIndex} OR e.short_name ILIKE $${paramIndex})`);
    params.push(`%${filter.name_contains}%`);
    paramIndex++;
  }
  if (filter.status) {
    conditions.push(`e.status = $${paramIndex}`);
    params.push(filter.status);
    paramIndex++;
  }

  const queryText = `
    SELECT e.id, e.name, e.short_name, e.code, e.status,
      e.category_id, e.description, e.operator_name,
      e.functional_role_summary, e.settlement_model,
      e.supports_24x7, e.supports_cross_border, e.supports_one_leg_out,
      e.primary_currency_code, e.market_country_id, e.notes,
      c.code AS category_code, c.name AS category_name,
      d.code AS domain_code, d.name AS domain_name
    FROM fmi_entries e
    JOIN fmi_categories c ON c.id = e.category_id
    JOIN fmi_domains d ON d.id = c.domain_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY d.sort_order, c.sort_order, e.name
    LIMIT 100
  `;
  const { rows } = await pool.query(queryText, params);
  return rows as FmiEntryWithCategory[];
}

export async function getFmiEntry(id: string): Promise<FmiEntryWithCategory | undefined> {
  const { rows } = await pool.query(`
    SELECT e.*, c.code AS category_code, c.name AS category_name,
      d.code AS domain_code, d.name AS domain_name
    FROM fmi_entries e
    JOIN fmi_categories c ON c.id = e.category_id
    JOIN fmi_domains d ON d.id = c.domain_id
    WHERE e.id = $1
  `, [id]);
  return rows[0] as FmiEntryWithCategory | undefined;
}

export async function updateFmiEntry(id: string, data: Partial<InsertFmiEntry>): Promise<FmiEntry> {
  const [r] = await db.update(fmiEntries).set({ ...data, updated_at: new Date() }).where(eq(fmiEntries.id, id)).returning();
  return r;
}

export async function listFmiCategories(): Promise<any[]> {
  const { rows } = await pool.query(`
    SELECT c.id, c.code, c.name, c.description, c.level, c.sort_order,
      d.code AS domain_code, d.name AS domain_name,
      count(e.id)::int AS entry_count
    FROM fmi_categories c
    JOIN fmi_domains d ON d.id = c.domain_id
    LEFT JOIN fmi_entries e ON e.category_id = c.id AND e.is_active = true
    WHERE c.is_active = true
    GROUP BY c.id, d.id
    ORDER BY d.sort_order, c.level, c.sort_order
  `);
  return rows;
}

export async function getFmiSpecification(fmiId: string): Promise<FmiSpecification | undefined> {
  const [r] = await db.select().from(fmiSpecifications).where(eq(fmiSpecifications.fmi_id, fmiId));
  return r;
}

export async function updateFmiSpecification(fmiId: string, data: Partial<InsertFmiSpecification>): Promise<FmiSpecification> {
  const [existing] = await db.select().from(fmiSpecifications).where(eq(fmiSpecifications.fmi_id, fmiId));
  if (existing) {
    const [r] = await db.update(fmiSpecifications).set(data).where(eq(fmiSpecifications.id, existing.id)).returning();
    return r;
  }
  const [r] = await db.insert(fmiSpecifications).values({ ...data, fmi_id: fmiId }).returning();
  return r;
}

export async function findCountry(nameOrCode: string): Promise<any | undefined> {
  const needle = nameOrCode.trim();
  const { rows } = await pool.query(`
    SELECT c.id, c.name, c.iso2, c.iso3, c.official_name, c.capital, c.region_hint,
      json_agg(json_build_object('code', g.code, 'name', g.name, 'is_primary', cc.is_primary)
        ORDER BY cc.is_primary DESC) FILTER (WHERE g.id IS NOT NULL) AS currencies
    FROM countries c
    LEFT JOIN country_currencies cc ON cc.country_id = c.id
    LEFT JOIN geo_currencies g ON g.id = cc.currency_id
    WHERE upper(c.iso2) = upper($1)
       OR upper(c.iso3) = upper($1)
       OR c.name ILIKE $2
    GROUP BY c.id
    ORDER BY c.name
    LIMIT 5
  `, [needle, `%${needle}%`]);
  return rows.length === 1 ? rows[0] : rows.length > 0 ? rows : undefined;
}

export async function findCurrency(code: string): Promise<any | undefined> {
  const needle = code.trim().toUpperCase();
  const { rows } = await pool.query(`
    SELECT g.id, g.code, g.name, g.symbol, g.minor_units,
      json_agg(DISTINCT jsonb_build_object('iso2', c.iso2, 'name', c.name, 'is_primary', cc.is_primary))
        FILTER (WHERE c.id IS NOT NULL) AS countries
    FROM geo_currencies g
    LEFT JOIN country_currencies cc ON cc.currency_id = g.id
    LEFT JOIN countries c ON c.id = cc.country_id
    WHERE upper(g.code) = $1
    GROUP BY g.id
  `, [needle]);
  return rows[0];
}

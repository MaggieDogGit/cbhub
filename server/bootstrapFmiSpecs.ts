import { pool } from "./db";

export async function bootstrapFmiSpecsTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fmi_specifications (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        fmi_id varchar NOT NULL UNIQUE REFERENCES fmi_entries(id) ON DELETE CASCADE,
        performs_clearing boolean,
        performs_settlement boolean,
        performs_messaging boolean,
        performs_scheme_governance boolean,
        settlement_model text,
        settlement_asset_type text,
        settles_in_fmi_id varchar REFERENCES fmi_entries(id),
        finality_model text,
        settlement_cycle_description text,
        operating_model text,
        supports_24x7 boolean,
        processing_latency_seconds integer,
        operating_timezone text,
        operating_hours_notes text,
        primary_currency_code varchar(10),
        supported_currency_codes text,
        primary_message_standard text,
        supported_message_standards text,
        supported_message_formats text,
        legacy_formats_supported text,
        message_transport_network text,
        direct_participation_allowed boolean,
        indirect_participation_supported boolean,
        sponsor_model_supported boolean,
        eligible_participant_types text,
        supports_cross_border_processing boolean,
        supports_one_leg_out_processing boolean,
        participant_location_requirement text,
        debtor_location_requirement text,
        creditor_location_requirement text,
        prefunding_required boolean,
        intraday_credit_supported boolean,
        liquidity_management_notes text
      );
      CREATE TABLE IF NOT EXISTS payment_scheme_specifications (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        fmi_id varchar NOT NULL UNIQUE REFERENCES fmi_entries(id) ON DELETE CASCADE,
        scheme_currency_code varchar(10),
        scheme_region text,
        scheme_cross_border_allowed boolean,
        scheme_one_leg_out_allowed boolean,
        max_transaction_amount text,
        settlement_deadline_seconds integer,
        primary_message_standard text,
        scheme_rulebook_reference text,
        participation_scope_notes text
      );
      CREATE TABLE IF NOT EXISTS payment_scheme_processing_scenarios (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        scheme_fmi_id varchar NOT NULL REFERENCES fmi_entries(id) ON DELETE CASCADE,
        code varchar(60) NOT NULL UNIQUE,
        name text NOT NULL,
        description text,
        is_default boolean DEFAULT false,
        supports_cross_border boolean,
        supports_one_leg_out boolean,
        requires_special_format boolean,
        message_standard text,
        message_format text,
        currency_code varchar(10),
        geography_scope text,
        notes text,
        is_active boolean DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS payment_scheme_scenario_relationships (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        scenario_id varchar NOT NULL REFERENCES payment_scheme_processing_scenarios(id) ON DELETE CASCADE,
        relationship_type_id varchar NOT NULL REFERENCES fmi_relationship_types(id),
        target_fmi_id varchar NOT NULL REFERENCES fmi_entries(id) ON DELETE CASCADE,
        notes text,
        is_active boolean DEFAULT true
      );
    `);

    await client.query(`
      INSERT INTO fmi_relationship_types (code, name, description) VALUES
        ('SCENARIO_USES_CLEARING_MECHANISM', 'Scenario uses Clearing Mechanism', 'A processing scenario within a scheme uses a specified clearing mechanism'),
        ('SCENARIO_SETTLES_IN_SETTLEMENT_SYSTEM', 'Scenario settles in Settlement System', 'A processing scenario settles in a specified settlement system')
      ON CONFLICT (code) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO fmi_entries (category_id, name, short_name, code, description, operator_name, status,
        functional_role_summary, settlement_model, supports_24x7, supports_cross_border, supports_one_leg_out, primary_currency_code, notes)
      SELECT c.id, v.name, v.short_name, v.code, v.description, v.operator_name, v.status,
        v.functional_role_summary, v.settlement_model, v.supports_24x7, v.supports_cross_border, v.supports_one_leg_out, v.primary_currency_code, v.notes
      FROM (VALUES
        ('PS-SET-RTGS','Bank of England RTGS','BoE RTGS','BOE-RTGS',
         'Real-time gross settlement system for GBP high-value payments and settlement of ancillary systems operated by the Bank of England.',
         'Bank of England','live',
         'GBP RTGS — provides final settlement for CHAPS, FPS, Bacs, and other UK payment and securities systems','gross',
         false,false,false,'GBP',NULL::text),
        ('PS-CLR-ACH-ICT','FPS Central Infrastructure','FPS Infra','FPS-INFRA',
         'Central clearing and switching infrastructure for UK Faster Payments, providing real-time clearing of instant GBP payments.',
         'Pay.UK / Vocalink','live',
         'Instant payment clearing engine — processes FPS transactions in near-real-time; net positions settled in BoE RTGS','real_time',
         true,true,true,'GBP','Vocalink operates the central infrastructure under contract to Pay.UK'),
        ('PS-SCH-ICT','Faster Payments Scheme','FPS','FPS',
         'UK instant payment scheme enabling near-real-time GBP credit transfers 24/7/365, governed by Pay.UK.',
         'Pay.UK','live',
         'Scheme rulebook for UK instant payments — cleared via FPS central infrastructure, settled in BoE RTGS',NULL,
         true,true,NULL,'GBP','One-leg-out support depends on processing scenario (domestic vs POO)'),
        ('PS-SCH-CBCT','One-Leg-Out Instant Credit Transfer','OCT Inst','OCT-INST',
         'Cross-border instant credit transfer scheme enabling one-leg-out processing for SEPA instant payments with a non-SEPA counterparty.',
         'European Payments Council (EPC)','live',
         'Scheme rulebook for cross-border instant EUR credit transfers with one leg outside SEPA — cleared via RT1 or settled via TIPS',NULL,
         true,true,true,'EUR','Regulation-aligned scheme for extending SEPA Inst reach beyond SEPA borders')
      ) AS v(cat_code, name, short_name, code, description, operator_name, status,
             functional_role_summary, settlement_model, supports_24x7, supports_cross_border, supports_one_leg_out, primary_currency_code, notes)
      JOIN fmi_categories c ON c.code = v.cat_code
      ON CONFLICT (code) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO fmi_specifications (fmi_id,
        performs_clearing, performs_settlement, performs_messaging, performs_scheme_governance,
        settlement_model, settlement_asset_type, finality_model,
        operating_model, supports_24x7, operating_timezone, operating_hours_notes,
        primary_currency_code, supported_currency_codes,
        primary_message_standard, supported_message_standards, message_transport_network,
        direct_participation_allowed, indirect_participation_supported, sponsor_model_supported,
        supports_cross_border_processing, supports_one_leg_out_processing,
        prefunding_required, intraday_credit_supported, liquidity_management_notes,
        settlement_cycle_description
      )
      SELECT e.id,
        v.performs_clearing, v.performs_settlement, v.performs_messaging, v.performs_scheme_governance,
        v.settlement_model, v.settlement_asset_type, v.finality_model,
        v.operating_model, v.supports_24x7, v.operating_timezone, v.operating_hours_notes,
        v.primary_currency_code, v.supported_currency_codes,
        v.primary_message_standard, v.supported_message_standards, v.message_transport_network,
        v.direct_participation_allowed, v.indirect_participation_supported, v.sponsor_model_supported,
        v.supports_cross_border_processing, v.supports_one_leg_out_processing,
        v.prefunding_required, v.intraday_credit_supported, v.liquidity_management_notes,
        v.settlement_cycle_description
      FROM (VALUES
        ('T2', false,true,false,false, 'gross','central_bank_money','Immediate finality upon settlement in central bank money',
         'real_time',false,'CET','Mon-Fri 07:00-18:00 CET', 'EUR','["EUR"]',
         'ISO 20022','["ISO 20022","MT (legacy via Y-copy)"]','SWIFT / ESMIG',
         true,true,false, true,false, true,true,
         'Auto-collateralisation and intraday credit facilities provided by national central banks',
         'Real-time continuous settlement throughout operating day'),
        ('TIPS', false,true,false,false, 'gross','central_bank_money','Immediate finality upon settlement in central bank money',
         'real_time',true,'CET','24/7/365', 'EUR','["EUR","SEK"]',
         'ISO 20022','["ISO 20022"]','ESMIG',
         true,true,false, true,true, true,false,
         'Participants pre-fund TIPS accounts from T2 RTGS cash accounts',
         'Individual transaction settlement within 10 seconds target'),
        ('RT1', true,false,false,false, 'net','central_bank_money','Settlement finality upon completion of TIPS/T2 settlement cycle',
         'real_time',true,'CET','24/7/365', 'EUR','["EUR"]',
         'ISO 20022','["ISO 20022"]','SWIFT / SIAnet',
         true,true,false, true,true, true,false,
         'Participants pre-fund; net positions settled in TIPS',
         'Continuous clearing with periodic net settlement in TIPS'),
        ('STEP2-SCT', true,false,false,false, 'net','central_bank_money','Settlement finality upon T2 end-of-day settlement',
         'batch',false,'CET','Multiple clearing cycles per business day; Mon-Fri', 'EUR','["EUR"]',
         'ISO 20022','["ISO 20022"]','SWIFT / SIAnet',
         true,true,false, true,false, false,false,
         'Net positions settled in T2 at defined settlement windows',
         'Batch clearing with multiple intraday settlement cycles in T2'),
        ('STEP2-SDD', true,false,false,false, 'net','central_bank_money','Settlement finality upon T2 settlement',
         'batch',false,'CET','Multiple clearing cycles per business day; Mon-Fri', 'EUR','["EUR"]',
         'ISO 20022','["ISO 20022"]','SWIFT / SIAnet',
         true,true,false, true,false, false,false,
         'Net positions settled in T2',
         'Batch clearing of SEPA direct debit mandates'),
        ('EURO1', true,false,false,false, 'net','central_bank_money','Settlement finality upon end-of-day T2 settlement',
         'real_time',false,'CET','Mon-Fri 07:30-16:00 CET', 'EUR','["EUR"]',
         'SWIFT MT/MX','["SWIFT MT","ISO 20022"]','SWIFT',
         true,false,false, true,false, false,false,
         'Multilateral netting with end-of-day settlement in T2. Loss-sharing mechanism in place.',
         'Continuous multilateral netting throughout day; single end-of-day settlement in T2'),
        ('SWIFT', false,false,true,false, NULL,NULL,NULL,
         'real_time',true,'UTC','24/7/365 network availability', NULL,NULL,
         'ISO 20022','["ISO 20022","SWIFT MT","ISO 15022"]','SWIFTNet',
         true,false,false, true,false, false,false, NULL, NULL),
        ('FPS-INFRA', true,false,false,false, 'net','central_bank_money','Settlement finality upon BoE RTGS deferred net settlement',
         'real_time',true,'GMT/BST','24/7/365', 'GBP','["GBP"]',
         'ISO 8583','["ISO 8583","ISO 20022 (NPA migration planned)"]','Vocalink network',
         true,true,true, true,true, false,false,
         'Deferred net settlement in BoE RTGS with three settlement cycles per day',
         'Continuous instant clearing with deferred net settlement three times daily in BoE RTGS'),
        ('BOE-RTGS', false,true,false,false, 'gross','central_bank_money','Immediate finality upon settlement in BoE reserves',
         'real_time',false,'GMT/BST','Mon-Fri 06:00-18:00 GMT; extended hours for some settlement windows', 'GBP','["GBP"]',
         'ISO 20022','["ISO 20022","SWIFT MT (legacy)"]','SWIFT',
         true,true,false, false,false, true,true,
         'Intraday liquidity provided against eligible collateral; auto-collateralisation available',
         'Continuous RTGS settlement throughout operating day; also settles net positions from CHAPS, FPS, Bacs, CREST'),
        ('CHAPS', false,true,false,false, 'gross','central_bank_money','Immediate finality upon settlement in BoE RTGS',
         'real_time',false,'GMT/BST','Mon-Fri 06:00-18:00 GMT', 'GBP','["GBP"]',
         'ISO 20022','["ISO 20022"]','SWIFT',
         true,true,false, true,false, true,true,
         'Intraday liquidity via BoE reserves',
         'Individual payment settlement in real time within BoE RTGS')
      ) AS v(entry_code,
        performs_clearing, performs_settlement, performs_messaging, performs_scheme_governance,
        settlement_model, settlement_asset_type, finality_model,
        operating_model, supports_24x7, operating_timezone, operating_hours_notes,
        primary_currency_code, supported_currency_codes,
        primary_message_standard, supported_message_standards, message_transport_network,
        direct_participation_allowed, indirect_participation_supported, sponsor_model_supported,
        supports_cross_border_processing, supports_one_leg_out_processing,
        prefunding_required, intraday_credit_supported, liquidity_management_notes,
        settlement_cycle_description
      )
      JOIN fmi_entries e ON e.code = v.entry_code
      ON CONFLICT (fmi_id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO payment_scheme_specifications (fmi_id,
        scheme_currency_code, scheme_region,
        scheme_cross_border_allowed, scheme_one_leg_out_allowed,
        max_transaction_amount, settlement_deadline_seconds,
        primary_message_standard, scheme_rulebook_reference,
        participation_scope_notes)
      SELECT e.id, v.scheme_currency_code, v.scheme_region,
        v.scheme_cross_border_allowed, v.scheme_one_leg_out_allowed,
        v.max_transaction_amount, v.settlement_deadline_seconds,
        v.primary_message_standard, v.scheme_rulebook_reference,
        v.participation_scope_notes
      FROM (VALUES
        ('SCT','EUR','SEPA', true,false, NULL::text,NULL::integer,
         'ISO 20022 (pacs.008)','EPC SCT Rulebook (latest version)',
         'All PSPs within SEPA geography; mandatory for euro-area PSPs'),
        ('SCT-INST','EUR','SEPA', true,false, '100000',10,
         'ISO 20022 (pacs.008)','EPC SCT Inst Rulebook (latest version)',
         'Mandatory for euro-area PSPs from January 2025 per Regulation 2024/886. Max amount EUR 100,000.'),
        ('OCT-INST','EUR','SEPA + non-SEPA counterparty', true,true, '100000',10,
         'ISO 20022 (pacs.008)','EPC OCT Inst Rulebook',
         'Enables one-leg-out instant credit transfers where one party is outside SEPA'),
        ('SDD','EUR','SEPA', true,false, NULL::text,NULL::integer,
         'ISO 20022 (pacs.003)','EPC SDD Core / B2B Rulebook (latest version)',
         'All PSPs within SEPA geography offering direct debit services'),
        ('FPS','GBP','United Kingdom', NULL,NULL, '1000000',120,
         'ISO 8583 (ISO 20022 planned under NPA)','Pay.UK FPS Rules and Standards',
         'UK PSPs with BoE RTGS settlement account (direct) or via agency arrangements (indirect).')
      ) AS v(entry_code, scheme_currency_code, scheme_region,
             scheme_cross_border_allowed, scheme_one_leg_out_allowed,
             max_transaction_amount, settlement_deadline_seconds,
             primary_message_standard, scheme_rulebook_reference,
             participation_scope_notes)
      JOIN fmi_entries e ON e.code = v.entry_code
      ON CONFLICT (fmi_id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO payment_scheme_processing_scenarios (scheme_fmi_id, code, name, description,
        is_default, supports_cross_border, supports_one_leg_out,
        message_standard, currency_code, geography_scope, notes)
      SELECT e.id, v.code, v.name, v.description,
        v.is_default, v.supports_cross_border, v.supports_one_leg_out,
        v.message_standard, v.currency_code, v.geography_scope, v.notes
      FROM (VALUES
        ('FPS','FPS-DOMESTIC','FPS Domestic','Standard domestic UK instant GBP payment between two UK-based PSPs',
         true,false,false, 'ISO 8583','GBP','United Kingdom',
         'Both debtor and creditor PSPs are direct or indirect FPS participants in the UK'),
        ('FPS','FPS-POO','FPS Payment Originated Overseas','Instant GBP payment where the originator is outside the UK but the beneficiary is a UK PSP participant',
         false,true,true, 'ISO 8583','GBP','United Kingdom + overseas originator',
         'Requires sponsor-bank arrangement for the overseas originator; cleared via FPS central infrastructure'),
        ('SCT-INST','SCT-INST-DOMESTIC','SCT Inst Domestic','Standard SEPA instant credit transfer between two SEPA-area PSPs',
         true,false,false, 'ISO 20022 (pacs.008)','EUR','SEPA',
         'Both debtor and creditor PSPs are SEPA scheme participants; max EUR 100,000'),
        ('OCT-INST','OCT-INST-DEFAULT','OCT Inst Default Scenario','Cross-border instant credit transfer where one party is outside SEPA',
         true,true,true, 'ISO 20022 (pacs.008)','EUR','SEPA + non-SEPA',
         'One leg outside SEPA; cleared via RT1 or settled via TIPS')
      ) AS v(entry_code, code, name, description,
             is_default, supports_cross_border, supports_one_leg_out,
             message_standard, currency_code, geography_scope, notes)
      JOIN fmi_entries e ON e.code = v.entry_code
      ON CONFLICT (code) DO NOTHING;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_scenario_rel
        ON payment_scheme_scenario_relationships (scenario_id, relationship_type_id, target_fmi_id);
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fmi_rel
        ON fmi_relationships (source_fmi_id, relationship_type_id, target_fmi_id);
    `);

    await client.query(`
      INSERT INTO payment_scheme_scenario_relationships (scenario_id, relationship_type_id, target_fmi_id, notes)
      SELECT s.id, rt.id, e.id, v.notes
      FROM (VALUES
        ('FPS-POO','SCENARIO_USES_CLEARING_MECHANISM','FPS-INFRA','FPS POO payments are cleared via the FPS central infrastructure'),
        ('FPS-POO','SCENARIO_SETTLES_IN_SETTLEMENT_SYSTEM','BOE-RTGS','FPS net positions settle in BoE RTGS'),
        ('FPS-DOMESTIC','SCENARIO_USES_CLEARING_MECHANISM','FPS-INFRA','Domestic FPS payments cleared via FPS central infrastructure'),
        ('FPS-DOMESTIC','SCENARIO_SETTLES_IN_SETTLEMENT_SYSTEM','BOE-RTGS','Net settlement in BoE RTGS'),
        ('SCT-INST-DOMESTIC','SCENARIO_USES_CLEARING_MECHANISM','RT1','SCT Inst typically cleared via RT1'),
        ('OCT-INST-DEFAULT','SCENARIO_USES_CLEARING_MECHANISM','RT1','OCT Inst cleared via RT1')
      ) AS v(scenario_code, rel_type_code, target_code, notes)
      JOIN payment_scheme_processing_scenarios s ON s.code = v.scenario_code
      JOIN fmi_relationship_types rt ON rt.code = v.rel_type_code
      JOIN fmi_entries e ON e.code = v.target_code
      ON CONFLICT (scenario_id, relationship_type_id, target_fmi_id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO fmi_relationships (source_fmi_id, relationship_type_id, target_fmi_id, notes)
      SELECT src.id, rt.id, tgt.id, v.notes
      FROM (VALUES
        ('SCT-INST','SCHEME_USES_CLEARING_MECHANISM','RT1','SCT Inst payments can be cleared via EBA RT1'),
        ('SCT-INST','SCHEME_USES_CLEARING_MECHANISM','TIPS','SCT Inst payments can settle directly in TIPS'),
        ('OCT-INST','SCHEME_USES_CLEARING_MECHANISM','RT1','OCT Inst payments can be cleared via EBA RT1'),
        ('OCT-INST','SCHEME_USES_CLEARING_MECHANISM','TIPS','OCT Inst payments can settle directly in TIPS'),
        ('RT1','CLEARING_MECHANISM_SETTLES_IN_SETTLEMENT_SYSTEM','TIPS','RT1 net positions settle in TIPS'),
        ('STEP2-SCT','CLEARING_MECHANISM_SETTLES_IN_SETTLEMENT_SYSTEM','T2','STEP2 SCT net positions settle in T2'),
        ('STEP2-SDD','CLEARING_MECHANISM_SETTLES_IN_SETTLEMENT_SYSTEM','T2','STEP2 SDD net positions settle in T2'),
        ('EURO1','CLEARING_MECHANISM_SETTLES_IN_SETTLEMENT_SYSTEM','T2','EURO1 end-of-day net positions settle in T2'),
        ('FPS','SCHEME_USES_CLEARING_MECHANISM','FPS-INFRA','Faster Payments Scheme clears via FPS central infrastructure'),
        ('FPS-INFRA','CLEARING_MECHANISM_SETTLES_IN_SETTLEMENT_SYSTEM','BOE-RTGS','FPS central infrastructure net positions settle in Bank of England RTGS'),
        ('CHAPS','CLEARING_MECHANISM_SETTLES_IN_SETTLEMENT_SYSTEM','BOE-RTGS','CHAPS payments settle in Bank of England RTGS'),
        ('FPS','CLEARING_MECHANISM_SETTLES_IN_SETTLEMENT_SYSTEM','BOE-RTGS','Faster Payments Scheme ultimately settles in Bank of England RTGS')
      ) AS v(src_code, rel_type_code, tgt_code, notes)
      JOIN fmi_entries src ON src.code = v.src_code
      JOIN fmi_relationship_types rt ON rt.code = v.rel_type_code
      JOIN fmi_entries tgt ON tgt.code = v.tgt_code
      ON CONFLICT (source_fmi_id, relationship_type_id, target_fmi_id) DO NOTHING;
    `);

    console.log("[FmiSpecs] Bootstrap complete: tables created, seed data applied");
  } catch (err) {
    console.error("[FmiSpecs] Bootstrap error (non-fatal, tables may already exist):", (err as Error).message);
  } finally {
    client.release();
  }
}

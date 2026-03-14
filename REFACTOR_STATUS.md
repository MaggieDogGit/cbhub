# Service-Layer Refactor — Status

## Summary

Completed the service-layer refactor that was started in Task #13. Routes are now thin HTTP adapters (validate → call service → respond). All business logic, data access, and OpenAI orchestration has been moved into dedicated service modules. Legacy re-export barrel files have been deleted.

## Changes Made

### Services — Expanded / Created

| File | Change |
|------|--------|
| `server/services/bankingGroupService.ts` | Added `listBankingGroups`, `createBankingGroup`, `updateBankingGroup`, `deleteBankingGroup` (previously only had merge ops) |
| `server/services/researchService.ts` | **New file.** Extracted OpenAI web-search + JSON-structuring logic from `researchRoutes.ts` into `researchBank(bankName)` |
| `server/services/jobService.ts` | Added `listJobs`, `getJob`, `createJob`, `updateJobStatus`, `deleteJob` CRUD wrappers. Market-scan orchestration logic extracted to `cbDiscoveryService.runMarketScanJob()` |
| `server/services/cbDiscoveryService.ts` | Added `runMarketScanJob(...)` — contains market-scan prompt-building, agent loop, and post-scan diff/summary logic. Constants (`COUNTRY_RTGS`, `CURRENCY_COUNTRY`, etc.) retained |

### Routes — Thinned

| File | Change |
|------|--------|
| `server/routes/registryRoutes.ts` | Banking group CRUD now calls `bankingGroupService` instead of `storage` directly |
| `server/routes/jobRoutes.ts` | All `storage.createJob/getJob/listJobs/deleteJob` calls replaced with `jobService` equivalents |
| `server/routes/researchRoutes.ts` | OpenAI logic removed; calls `researchService.researchBank()` |
| `server/routes/dashboardRoutes.ts` | Raw SQL removed; calls `storage.getDashboardCurrencyProviders()` and `storage.getDashboardCoverageMap()` |

### Storage — Extended

| File | Change |
|------|--------|
| `server/storage.ts` | Added `getDashboardCurrencyProviders()` and `getDashboardCoverageMap()` methods to `DatabaseStorage` and `IStorage` interface |

### Legacy Files — Removed

| File | Reason |
|------|--------|
| `server/jobRunner.ts` | 6-line re-export barrel with zero remaining importers |
| `server/agentCore.ts` | 9-line re-export barrel; only used by `agentFmiResearch.ts` which was updated to import from `./agent` directly |

### Import Fixes

| File | Change |
|------|--------|
| `server/agentFmiResearch.ts` | Changed `import from "./agentCore"` → `import from "./agent"` |

## Intentionally Preserved

- `server/routes.ts` — Kept as the top-level mount index (registers all sub-routers + auth middleware). This is intentional architecture, not a leftover.

## No Changes Made To

- **UI / Frontend** — No client-side files touched
- **Database schema** — No schema changes
- **API contracts** — All endpoint paths and response shapes are identical
- **`shared/schema.ts`** — Untouched

## Remaining Known Technical Debt

1. `registryRoutes.ts` still calls `storage` directly for entity types other than banking groups (legal entities, BICs, correspondent services, CLS profiles, FMIs, FMI registry, data sources, intel observations, CB taxonomy). These could be wrapped in services but are simple CRUD pass-throughs with no business logic.
2. `researchRoutes.ts` still calls `storage` directly for FMI research job CRUD (`/api/fmi-research-jobs`). These are simple pass-throughs.
3. `jobService.processNextJob()` still contains CB-setup job orchestration logic (prompt building, agent loop, validation parsing). This could be extracted into a dedicated `cbSetupService` in future.
4. Prompt strings in `server/agent/prompts.ts` are very large (~700 lines) and could be moved to template files.
5. `fmiResearchJobRunner.ts` still lives at the top level of `server/`; it could be moved into `server/services/` for consistency.

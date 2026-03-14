# Backend Refactor Status

## Architecture Pattern in Effect

```
Route → Service → Repository          (data-backed operations)
Route → Service → Agent Workflow      (AI-backed operations)

Repositories: DB access only, no AI, no HTTP
Services: orchestrate repos + workflows
Agent workflows: typed inputs/outputs, confidence + evidence metadata
Routes: validate request, call service, return response
```

---

## Task 13 — Route Modularisation ✓

- `server/routes/` created with 6 focused routers
- `server/services/` created with 4 service modules
- `server/agent/` created with 5 focused modules + barrel

---

## Task 14 — Service-Layer Completion ✓

- `bankingGroupService.ts` expanded with full CRUD + merge ops
- `researchService.ts` created (OpenAI research extracted from route)
- `jobService.ts` — listJobs/getJob/createJob/updateJobStatus/deleteJob/getJobResults
- `cbDiscoveryService.ts` — runMarketScan() market-scan orchestration
- Dashboard SQL moved to `storage.ts` as dedicated methods
- `server/agentCore.ts` and `server/jobRunner.ts` deleted (absorbed)

---

## Task 15 — Full Architecture Upgrade ✓

### Repository Layer (server/repositories/)

| File | Responsibility |
|------|---------------|
| `bankingGroupRepository.ts` | BankingGroup CRUD + mergeBankingGroups |
| `legalEntityRepository.ts` | LegalEntity CRUD + mergeLegalEntities |
| `bicRepository.ts` | BIC CRUD |
| `correspondentServiceRepository.ts` | CorrespondentService, ClsProfile, Fmi, FmiRegistry CRUD + dashboard analytics |
| `jobRepository.ts` | AgentJob CRUD + Conversation + ChatMessage |
| `researchRepository.ts` | DataSource, IntelObservation, FmiResearchJob, CB Taxonomy |

### Domain Models (server/models/)

| File | Contents |
|------|----------|
| `common.ts` | ConfidenceLevel, EvidenceItem, WorkflowResult<T>, JobStatus, CurrencyScope |
| `bankingGroup.ts` | BankingGroupWithEntities, CbProbabilityLevel |
| `legalEntity.ts` | LegalEntityWithBics |
| `bic.ts` | BicWithServices |
| `correspondentService.ts` | SERVICE_TYPES, CLEARING_MODELS, defaultServiceType() |
| `research.ts` | StructuredResearchResult, StructuredServiceEntry |

### Agent Layer

| File | Change |
|------|--------|
| `agent/constants.ts` | **New.** Single source of truth for COUNTRY_RTGS, CURRENCY_COUNTRY, COUNTRY_CURRENCY, EUROZONE_COUNTRIES, CLS_CURRENCIES — previously duplicated |
| `agent/types.ts` | **New.** WorkflowResult, ConfidenceLevel, EvidenceItem, WorkflowInput, StepProgress, AgentMode |
| `agent/validators.ts` | **Expanded.** isValidBicFormat, normalizeCurrency, normalizeClearingModel, findLikelyDuplicates, validateResearchOutput |
| `agent/index.ts` | **Updated.** Exports constants, types, all validators |
| `agent/prompts.ts` | **Fixed.** Constants import changed from cbDiscoveryService → ./constants |

### Agent Workflows (server/agent/workflows/)

| File | Responsibility |
|------|---------------|
| `marketScanWorkflow.ts` | Market scan logic; returns WorkflowResult<MarketScanOutput> with confidence + validation warnings |
| `cbEntitySetupWorkflow.ts` | CB entity setup logic (moved from jobService.processNextJob); returns WorkflowResult<CbEntitySetupOutput> |
| `serviceDiscoveryWorkflow.ts` | **New.** Deterministic CB provider likelihood assessment (no AI calls) |
| `fmiResearchWorkflow.ts` | **New.** Typed orchestration wrapper over agentFmiResearch with confidence scoring |

### Updated Existing Files

| File | Change |
|------|--------|
| `server/storage.ts` | Pure compatibility facade — DatabaseStorage delegates all methods to repositories (one-liner per method). IStorage interface and `storage` export unchanged. |
| `server/services/cbDiscoveryService.ts` | Slimmed to re-export constants + delegate runMarketScan to marketScanWorkflow |
| `server/services/jobService.ts` | processNextJob delegates CB setup to cbEntitySetupWorkflow |
| `server/services/bankingGroupService.ts` | Uses bankingGroupRepository and legalEntityRepository directly |

---

## No Changes Made To

- **UI / Frontend** — No client-side files touched
- **Database schema** — No schema changes
- **API contracts** — All endpoint paths and response shapes identical
- **`shared/schema.ts`** — Untouched

---

## Remaining Known Technical Debt

1. `registryRoutes.ts` still calls storage directly for entity types other than banking groups. Low-risk; simple CRUD pass-throughs with no business logic, but could move to a `registryService`.
2. `researchService.ts` OpenAI calls could gain confidence/validation wrapping via a dedicated research workflow.
3. `agent/prompts.ts` is ~700 lines; long-term could split into per-workflow prompt helpers.
4. `agentFmiResearch.ts` has pre-existing TypeScript errors (withRetry return type, fmi_name nullability) that were present before this refactor and do not affect runtime.

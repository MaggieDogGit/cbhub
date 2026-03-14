# CB Provider Intelligence Platform

## Overview

A full-stack correspondent banking intelligence dashboard for mapping global correspondent banking providers. Built with a hierarchical data model: BankingGroup → LegalEntity → BIC → CorrespondentService.

Uses Express REST API + PostgreSQL backend (Drizzle ORM), React frontend, and OpenAI for AI Research Assistant, Agent Chat (tool calling + web search), and autonomous background job processing.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui
- **Backend**: Express.js + TypeScript (tsx)
- **Database**: PostgreSQL via Drizzle ORM (pg driver)
- **State management**: TanStack Query v5
- **Routing**: Wouter
- **Charts**: Recharts (bar, pie)
- **Maps**: React-Leaflet v4 + Leaflet
- **AI**: OpenAI gpt-4o (chat completions + tool calling)

## Project Structure

```
client/src/
  pages/
    Dashboard.tsx          – Overview: quick-nav links, summary stats, recharts bar/pie, coverage map, latest intel
    Competition.tsx        – Competitor benchmarking placeholder; lists competitor-tagged groups from intel observations
    Providers.tsx          – Banking Groups page (/banking-groups); 3-level tree (Group → Entity → BIC → Services); /providers redirects here
    LegalEntities.tsx      – Expandable entity list with BIC/service inline tables
    Coverage.tsx           – Coverage dashboard (Complete/Partial/Empty per group) + job queue UI
    CLS.tsx                – CLS profiles table, inline create/edit
    Currencies.tsx         – Per-currency competitor view table
    MarketCoverage.tsx     – Multi-currency selection + react-leaflet map + results table
    ResearchAssistant.tsx  – AI bank research → approval review → bulk DB save
    AgentChat.tsx          – Multi-conversation AI chat with sidebar; ?conv= param auto-creates named conversations
    Registry.tsx           – Two-panel registry editor: group browser (search/filters) + hierarchical tree editor (entity→BIC→service→FMI), edit drawer with verify-before-save, AlertDialog deletions, mobile-responsive
    DatabaseAdmin.tsx      – Full CRUD for all 5 core entities via tabbed forms
  components/
    Layout.tsx             – Sidebar nav with 5 sections (Main, Entities, Research, Tools); header with global search navigating to /banking-groups
    CbProfile.tsx          – CB Profile section: capability category panels, edit dialog, service feature badges, indirect participation
    cls/CLSProfileForm.tsx – Inline CLS profile create/edit form
    market/CoverageMap.tsx – React-Leaflet world map with circle markers
    agent/MessageBubble.tsx – Chat message bubble (user right-aligned, AI left)

server/
  index.ts      – Express app entry point
  routes.ts     – Thin index: mounts auth (unprotected), requireAuth middleware, then all protected routers
  agentCore.ts  – Backward-compat barrel → re-exports from server/agent/
  jobRunner.ts  – Backward-compat barrel → re-exports from server/services/
  storage.ts    – DatabaseStorage class implementing IStorage
  db.ts         – Drizzle ORM + pg pool setup

  routes/
    authRoutes.ts       – Login/logout/me endpoints (unprotected)
    registryRoutes.ts   – CRUD for banking-groups, legal-entities, BICs, services, CLS, FMIs, taxonomy, capabilities, schemes, indirect
    researchRoutes.ts   – POST /research AI research endpoint
    jobRoutes.ts        – Job CRUD, queue-all, stop-queue, market-scan
    chatRoutes.ts       – Conversations CRUD + POST /chat SSE streaming
    dashboardRoutes.ts  – Dashboard analytics: currency-providers, data-sources, intel

  agent/
    prompts.ts     – buildSystemPrompt, getStatusText
    tools.ts       – getTools, getDryRunTools, getLightTools definitions
    executor.ts    – executeTool, runAgentLoop
    retry.ts       – withRetry, sleep utilities
    validators.ts  – StepCallback type
    index.ts       – Barrel re-exporting all agent modules

  services/
    cbDiscoveryService.ts   – COUNTRY_CURRENCY, COUNTRY_RTGS, EUROZONE_COUNTRIES, CLS_CURRENCIES lookup maps
    jobService.ts           – processNextJob, startJobRunner (polls every 30s)
    chatAgentService.ts     – runChat (SSE streaming agent loop)
    bankingGroupService.ts  – mergeBankingGroups helper

shared/
  schema.ts     – All Drizzle entities + Zod insert schemas + TypeScript types
```

## Data Model

| Entity | Key Fields |
|---|---|
| BankingGroup | group_name, headquarters_country, primary_currency, gsib_status |
| LegalEntity | group_id, legal_name, country, entity_type |
| BIC | legal_entity_id, bic_code, country, city, is_headquarters |
| CorrespondentService | bic_id, currency, service_type, clearing_model, rtgs/instant/nostro/vostro/cls booleans |
| CLSProfile | group_id, cls_third_party, cls_nostro_payments, cls_nostro_currencies[] |
| FMI | legal_entity_id, fmi_type (CLS_Settlement_Member), member_since |
| Conversation | name, created_at |
| ChatMessage | conversation_id, role (user/assistant), content |
| AgentJob | banking_group_id (nullable for market scans), banking_group_name (nullable), status, job_type (cb_setup/market_scan), market_country, market_currency, conversation_id, steps_completed, dry_run (boolean) |
| CbTaxonomyItem | code (unique), name, category (feature_commercial/feature_treasury/value_added/connectivity/fi_score/thought_leadership/target_market/ancillary), value_type (boolean_unknown/enum_high_med_low/score_1_10/count/text), display_order, active |
| CbCapabilityValue | banking_group_id, legal_entity_id (opt), correspondent_service_id (opt), taxonomy_item_id, value_enum, value_numeric, value_text, supported_fmis[], notes, source, confidence, ai_generated, reviewer |
| CbSchemeMaster | code (unique), name, market, region, scheme_currency, scheme_type, operator_name, display_order, active |
| CbIndirectParticipation | legal_entity_id, banking_group_id, scheme_id, indirect_participation_offered (yes/no/unknown), sponsor_is_direct_participant, notes, source, confidence, ai_generated |

## API Endpoints

All prefixed with `/api`:

- `GET|POST /banking-groups`, `PATCH|DELETE /banking-groups/:id`
- `GET|POST /legal-entities`, `PATCH|DELETE /legal-entities/:id`
- `GET|POST /bics`, `PATCH|DELETE /bics/:id`
- `GET|POST /correspondent-services?currency=X`, `PATCH|DELETE /correspondent-services/:id`
- `GET|POST /cls-profiles`, `PATCH|DELETE /cls-profiles/:id`
- `GET|POST /fmis`, `PATCH|DELETE /fmis/:id`
- `GET|POST /conversations`, `DELETE /conversations/:id`
- `GET|POST /conversations/:id/messages`
- `GET|POST /jobs`, `DELETE /jobs/:id`, `POST /jobs/queue-all`, `POST /jobs/stop-queue`, `POST /jobs/market-scan`
- `GET /cb-taxonomy` – All taxonomy items grouped by category
- `GET|PUT|DELETE /cb-capabilities/:groupId` – Capability values per banking group (PUT upserts)
- `GET /cb-schemes` – Payment scheme master data
- `GET|PUT|DELETE /cb-indirect/:groupId` – Indirect participation records per group (PUT upserts)
- `POST /research` – AI bank research (OpenAI structured JSON output)
- `POST /chat` – Streaming SSE AI agent (calls agentCore.runAgentLoop)

## Agent Architecture

- `server/agent/` is the modular agent core (barrel-exported via `server/agent/index.ts` and backward-compat via `server/agentCore.ts`):
  - `prompts.ts`: `buildSystemPrompt(sources)`, `getStatusText()`
  - `tools.ts`: `getTools()`, `getDryRunTools()`, `getLightTools()` – OpenAI tool definitions
  - `executor.ts`: `executeTool(name, args)`, `runAgentLoop(messages, onStep?, maxIterations, firstIterToolChoice)`
  - `retry.ts`: `withRetry()`, `sleep()` utilities
  - `validators.ts`: `StepCallback` type
- `server/services/chatAgentService.ts` handles `/api/chat` SSE streaming via `runChat()`
- `server/services/jobService.ts` handles background job processing via `processNextJob()` / `startJobRunner()`
- Tool confirmation pattern: if user message matches `yes|confirmed|proceed|...`, passes `firstIterToolChoice: "required"` to immediately act without re-asking

## Background Job System

Two job types (dispatched by `job_type` field):

### CB Setup (`job_type = "cb_setup"`)
- Queue workflows for banking groups via the Coverage page or Providers page multi-select
- Normal mode: gpt-4o, up to 15 iterations, full tool set; Light mode: gpt-4o-mini, 3 iterations, 13 subset tools
- Jobs table tracks: `banking_group_id`, `banking_group_name`, status, conversation_id, steps_completed
- **AI Validation Step** (Normal mode only): After Steps 1–5, agent calls `validate_cb_structure` tool which makes a secondary gpt-4o call to validate entity plausibility, Onshore/Offshore classification, RTGS assignments, and missing entities. Results stored in `scan_summary` as JSON with `validationValid`, `issueCount`, `issues`, `missingEntities`, `notes`. UI shows green "Valid" or amber "X issues" badge on Coverage and Providers pages.

### Market Coverage Scan (`job_type = "market_scan"`)
- Breadth-first discovery: finds 8–15 CB providers in a market, creates banking groups / entities / BICs / one service per currency
- Uses `market_country` and `market_currency` fields; `banking_group_id`/`banking_group_name` are NULL
- No FMI memberships recorded (deferred to CB Setup)
- Always runs in Normal mode with gpt-4o; max 20 iterations
- Queued via `POST /api/jobs/market-scan`; UI panel in Providers page
- COUNTRY_RTGS and CURRENCY_COUNTRY lookup maps exported from `server/services/cbDiscoveryService.ts` (backward-compat via `server/jobRunner.ts`)
- Parent-company matching: prompt instructs the agent to search for parent groups before creating regional subsidiaries
- **Dry-Run mode** (`dry_run: true`): Uses read-only tool set (`getDryRunTools()` — no create/update/delete). Agent produces a structured discovery report. No DB writes. Scan summary stores the full report. UI shows amber "Dry Run" badge + "Run for real →" button to re-queue as a live scan.

### Common
- Job runner starts automatically on server start; polls every 30s; 90s cooldown between jobs
- Coverage page polls `/api/jobs` every 5s when active, 15s otherwise

## Data Quality

- All orphaned records cleaned (0 orphaned services/BICs/entities as of last audit)
- Server-side FK validation: create_legal_entity checks group_id, create_bic checks legal_entity_id, create_correspondent_service validates bic_id is a real BIC UUID
- RTGS canonical names enforced: TARGET2 (not T2), BOJ-NET, Fedwire, MEPS+

## Auth

- Token-based: `AUTH_USERNAME`/`AUTH_PASSWORD` env vars; token stored in localStorage as `auth_token`; sent as `X-Auth-Token` header on all API calls

## Environment Variables

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (provisioned by Replit) |
| `OPENAI_API_KEY` | OpenAI API key for Research Assistant + Agent Chat + Job Runner |
| `SESSION_SECRET` | Express session secret |
| `AUTH_USERNAME` | Login username |
| `AUTH_PASSWORD` | Login password |

## Running

The `Start application` workflow runs `npm run dev`, which starts Express (port 5000) and Vite (hot reload) together.

Schema changes: use `executeSql` for direct SQL. **NEVER run `db:push --force`** — it drops the sessions table.

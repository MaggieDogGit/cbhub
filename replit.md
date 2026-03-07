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
    Dashboard.tsx          – Stats cards, recharts bar/pie, currency coverage grid
    Providers.tsx          – 3-level expandable tree (Group → Entity → BIC → Services)
    LegalEntities.tsx      – Expandable entity list with BIC/service inline tables
    Coverage.tsx           – Coverage dashboard (Complete/Partial/Empty per group) + job queue UI
    CLS.tsx                – CLS profiles table, inline create/edit
    Currencies.tsx         – Per-currency competitor view table
    MarketCoverage.tsx     – Multi-currency selection + react-leaflet map + results table
    ResearchAssistant.tsx  – AI bank research → approval review → bulk DB save
    AgentChat.tsx          – Multi-conversation AI chat with sidebar; ?conv= param auto-creates named conversations
    DatabaseAdmin.tsx      – Full CRUD for all 5 core entities via tabbed forms
  components/
    Layout.tsx             – Dark sidebar nav, header with global search
    cls/CLSProfileForm.tsx – Inline CLS profile create/edit form
    market/CoverageMap.tsx – React-Leaflet world map with circle markers
    agent/MessageBubble.tsx – Chat message bubble (user right-aligned, AI left)

server/
  index.ts      – Express app entry point
  routes.ts     – All REST API routes; /api/chat uses agentCore; starts jobRunner on init
  agentCore.ts  – Shared agent logic: buildSystemPrompt, getTools, executeTool, runAgentLoop
  jobRunner.ts  – Background job runner: polls agent_jobs every 30s, runs CB Setup workflows
  storage.ts    – DatabaseStorage class implementing IStorage
  db.ts         – Drizzle ORM + pg pool setup

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
| AgentJob | banking_group_id, banking_group_name, status (pending/running/completed/failed), conversation_id, steps_completed |

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
- `GET|POST /jobs`, `DELETE /jobs/:id`, `POST /jobs/queue-all`
- `POST /research` – AI bank research (OpenAI structured JSON output)
- `POST /chat` – Streaming SSE AI agent (calls agentCore.runAgentLoop)

## Agent Architecture

- `server/agentCore.ts` is the shared agent core. It exports:
  - `buildSystemPrompt(sources)` – builds the system prompt with DB schema and data source context
  - `getTools()` – returns the full OpenAI tool definitions (all DB CRUD + web_search)
  - `executeTool(name, args)` – executes a tool call and returns a result string
  - `runAgentLoop(messages, onStep?, maxIterations, firstIterToolChoice)` – runs the full agentic loop
- `/api/chat` uses `runAgentLoop` for interactive chat with SSE streaming
- `server/jobRunner.ts` uses `runAgentLoop` for background autonomous processing
- Tool confirmation pattern: if user message matches `yes|confirmed|proceed|...`, passes `firstIterToolChoice: "required"` to immediately act without re-asking

## Background Job System

- Queue CB Setup workflows for banking groups via the Coverage page
- Jobs table (`agent_jobs`) tracks: status, conversation_id, steps_completed, error_message
- Job runner starts automatically on server start; polls every 30s; processes one job at a time
- Coverage page polls `/api/jobs` every 5s when jobs are active, 15s otherwise
- "Queue Empty" and "Queue All Incomplete" buttons for batch processing

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

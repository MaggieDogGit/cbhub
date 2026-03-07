# CB Provider Intelligence Platform

## Overview

A full-stack correspondent banking intelligence dashboard for mapping global correspondent banking providers. Built with a hierarchical data model: BankingGroup → LegalEntity → BIC → CorrespondentService.

Migrated from Base44 to a custom Express REST API + PostgreSQL backend, keeping all original UI logic intact. Uses OpenAI for AI Research Assistant and Agent Chat.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui
- **Backend**: Express.js + TypeScript (tsx)
- **Database**: PostgreSQL via Drizzle ORM (pg driver)
- **State management**: TanStack Query v5
- **Routing**: Wouter
- **Charts**: Recharts (bar, pie)
- **Maps**: React-Leaflet v4 + Leaflet
- **AI**: OpenAI gpt-4o (chat completions)

## Project Structure

```
client/src/
  pages/
    Dashboard.tsx          – Stats cards, recharts bar/pie, currency coverage grid
    Providers.tsx          – 3-level expandable tree (Group → Entity → BIC → Services)
    LegalEntities.tsx      – Expandable entity list with BIC/service inline tables
    CLS.tsx                – CLS profiles table, inline create/edit
    Currencies.tsx         – Per-currency competitor view table
    MarketCoverage.tsx     – Multi-currency selection + react-leaflet map + results table
    ResearchAssistant.tsx  – AI bank research → approval review → bulk DB save
    AgentChat.tsx          – Multi-conversation AI chat with sidebar
    DatabaseAdmin.tsx      – Full CRUD for all 5 core entities via tabbed forms
  components/
    Layout.tsx             – Dark sidebar nav, header with global search
    cls/CLSProfileForm.tsx – Inline CLS profile create/edit form
    market/CoverageMap.tsx – React-Leaflet world map with circle markers
    agent/MessageBubble.tsx – Chat message bubble (user right-aligned, AI left)

server/
  index.ts      – Express app entry point
  routes.ts     – All REST API routes + OpenAI integration
  storage.ts    – DatabaseStorage class implementing IStorage
  db.ts         – Drizzle ORM + pg pool setup

shared/
  schema.ts     – All 8 Drizzle entities + Zod insert schemas + TypeScript types
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
- `POST /research` – AI bank research (OpenAI structured JSON output)
- `POST /chat` – AI conversation (OpenAI with message history)

## Environment Variables

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (provisioned by Replit) |
| `OPENAI_API_KEY` | OpenAI API key for Research Assistant + Agent Chat |
| `SESSION_SECRET` | Express session secret |

## Running

The `Start application` workflow runs `npm run dev`, which starts Express (port 5000) and Vite (hot reload) together.

To push schema changes: `npm run db:push`

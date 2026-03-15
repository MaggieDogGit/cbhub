# CB Provider Intelligence Platform

## Overview

The CB Provider Intelligence Platform is a full-stack correspondent banking intelligence dashboard designed to map global correspondent banking providers. Its core purpose is to provide a comprehensive view of the correspondent banking landscape, structured around a hierarchical data model: BankingGroup → LegalEntity → BIC → CorrespondentService. The platform integrates AI capabilities for research, chat, and autonomous background job processing, aiming to enhance data discovery, validation, and analysis for financial institutions. The project's ambition is to become the leading intelligence tool for correspondent banking, enabling users to gain insights into market coverage, competitor benchmarking, and regulatory compliance.

## User Preferences

I prefer iterative development, with a focus on delivering functional components that can be tested and refined.
I value clear and concise communication. Please explain technical concepts in an understandable way, avoiding excessive jargon where possible.
I prefer to be asked before major architectural changes or significant feature implementations are made.
I like to see progress regularly and prefer updates on completed tasks or significant milestones.
When suggesting code changes, please provide a brief explanation of the rationale behind them.
I prefer detailed explanations when issues arise or when complex solutions are proposed.
I want the agent to use a methodical approach to problem-solving, breaking down tasks into manageable steps.
Do not make changes to the `server/agent/prompts.ts` file without explicit approval.
Do not make changes to the `shared/schema.ts` file without explicit approval.

## System Architecture

The platform is built with a React frontend, an Express.js and TypeScript backend, and a PostgreSQL database utilizing Drizzle ORM. OpenAI's GPT-4o powers AI functionalities for research assistance, an agent chat with tool calling and web search, and autonomous background job processing.

**UI/UX Decisions:**
- **Frontend Framework**: React 18 with TypeScript for robust and scalable UI development.
- **Styling**: TailwindCSS and shadcn/ui for a modern, utility-first approach to styling and pre-built accessible components.
- **State Management**: TanStack Query v5 for efficient data fetching, caching, and state synchronization.
- **Routing**: Wouter for lightweight and declarative routing.
- **Data Visualization**: Recharts for interactive bar and pie charts, and React-Leaflet v4 with Leaflet for geographical data representation on maps.
- **Navigation**: A sidebar navigation with five main sections (Main, Entities, Research, Tools) and a header with global search functionality directing to `/banking-groups`.
- **Forms**: Inline create/edit forms and tabbed forms for full CRUD operations across core entities, with verification steps before saving changes and `AlertDialog` for deletions.

**Technical Implementations:**
- **Backend**: Express.js with `tsx` for TypeScript execution, structured with modular routers for different API domains (auth, registry, research, jobs, chat, dashboard).
- **Database**: PostgreSQL with Drizzle ORM for type-safe database interactions and schema management.
- **API Design**: RESTful API endpoints, all prefixed with `/api/`, covering CRUD operations for core entities and specific functionalities like AI research and chat streaming.
- **AI Agent Core**: Modular agent architecture located in `server/agent/`, handling prompt generation, tool definitions, execution, retry mechanisms, and validation. The agent supports a tool confirmation pattern for immediate action. Model references are centralised via `AGENT_MODEL` / `AGENT_MODEL_LIGHT` constants in `server/agent/executor.ts` (currently `gpt-4.1` / `gpt-4.1-mini`). The App Brain document (`server/agent/appKnowledge.ts`) provides domain routing knowledge across all 12 data domains and is injected into every system prompt.
- **Background Job System**: A robust job runner (`server/services/jobService.ts`) handles two main job types: "CB Setup" for detailed banking group analysis (with an AI validation step) and "Market Coverage Scan" for breadth-first market discovery, both supporting dry-run modes. The job runner polls for new jobs automatically.
- **Geographic & Currency Reference Model**: Six interconnected tables (`countries`, `geo_currencies`, `country_currencies`, `regions`, `region_members`, `currency_areas`) provide a comprehensive reference for CB analysis, exposed via dedicated API routes and a UI page (`/geo-reference`).
- **FMI Specifications & Payment Capability Model**: Four additional tables (`fmi_specifications`, `payment_scheme_specifications`, `payment_scheme_processing_scenarios`, `payment_scheme_scenario_relationships`) extend the FMI taxonomy with structured operational data, allowing for derived payment capabilities (e.g., cross-border, OLO support).
- **Data Quality**: Enforced through server-side foreign key validation, canonical naming conventions for RTGS systems, and regular cleanup of orphaned records.
- **Authentication**: Token-based authentication using environment variables for credentials, with tokens stored in `localStorage` and sent via `X-Auth-Token` header.

## External Dependencies

- **PostgreSQL**: Primary database for all application data.
- **OpenAI API**: Utilized for AI functionalities including:
    - GPT-4.1 (`AGENT_MODEL`) for chat completions and tool calling in the AI Research Assistant and Agent Chat.
    - GPT-4.1-mini (`AGENT_MODEL_LIGHT`) for lightweight background job processing (light-mode CB Setup).
    - GPT-4o-search-preview for web search tool calls (unchanged — does not accept temperature param).
- **React-Leaflet / Leaflet**: For interactive geographical maps displaying coverage and other geo-referenced data.
- **Recharts**: For rendering data visualizations such as bar and pie charts.
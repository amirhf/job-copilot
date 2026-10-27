# Cross-Session Consistency Audit, Architectural Decision Matrix, & Implementation/Deployment Plan

**Status:** Finalized & Approved (v2.0 — Production-Optimized Architecture & Plan)  
**Parent Spec:** [spec.md](file:///Users/amirhf/job_assist/spec.md)  
**Detailed Design Docs:**
- [Session 1: Database Schema & Master Career Graph](file:///Users/amirhf/job_assist/docs/design/session-1-database-and-career-graph.md)
- [Session 2: Ingestion Connectors & Rubric Scoring Workflow](file:///Users/amirhf/job_assist/docs/design/session-2-ingestion-and-rubric-scoring.md)
- [Session 3: Watchable Async Generation & Typst PDF Pipeline](file:///Users/amirhf/job_assist/docs/design/session-3-watchable-generation-and-typst.md)
- [Session 4: Next.js 16 Pipeline Surfaces & Interactive Studio](file:///Users/amirhf/job_assist/docs/design/session-4-nextjs-surfaces-and-studio.md)
- [Session 5: Stagehand v4 Assisted Apply & Continuous Feedback Loop](file:///Users/amirhf/job_assist/docs/design/session-5-stagehand-apply-and-feedback.md)

---

## 1. Cross-Session Consistency Audit Report

We audited all 5 design specifications against [spec.md](file:///Users/amirhf/job_assist/spec.md) for schema-to-workflow contract parity, enum completeness, streaming state persistence, and model routing alignment. All 7 identified cross-cutting gaps have been resolved directly in the design files:

| # | Cross-Session Interface | Finding During Audit | Resolution Applied |
| :--- | :--- | :--- | :--- |
| **1** | **Vector Embedding Dimensions** (`Session 1` ↔ `Session 2, 4, 5`) | Needed uniform 768-dim vectors across all 7 embedded tables (`career_experiences`, `career_bullets`, `career_projects`, `career_stories`, `career_skills`, `job_postings`, `preference_memory`) and `EMBEDDING_CONFIG`. | Locked `EMBEDDING_DIMENSIONS = 768` in `packages/db/src/schema/enums.ts` and imported it directly into `packages/agents/src/routers/model-router.ts`. |
| **2** | **Resumable SSE Stream Storage** (`Session 1` ↔ `Session 3 & 4`) | Session 3 (`WatchableGenerationEvent`) required sequence-indexed event replay (`?lastEventSeq=N`) when detaching/re-attaching browser tabs, but Session 1 lacked an event log table. | Added `generation_stream_events` (`package_id`, `stream_channel_id`, `seq`, `event_type`, `payload`) to `packages/db/src/schema/applications.ts` paired with Postgres `LISTEN/NOTIFY`—eliminating any Redis dependency. |
| **3** | **Surface B Model Selector Override** (`Session 4` ↔ `Session 1 & 3`) | `spec.md` §2.2 and Session 4 Surface B allow switching synthesis between **Claude Sonnet 4.6** (`TIER_3_SYNTHESIS_DEFAULT`) and **Claude Opus 4.6** (`TIER_3_SYNTHESIS_PREMIER`), which was missing from the workflow input and DB record. | Added `synthesisModelTier` to `GenerateMaterialsInputSchema` (Session 3) and `synthesis_model_used` to `application_packages` (Session 1). |
| **4** | **Surface D Post-Apply Outcome Tracking** (`Session 4` ↔ `Session 1`) | Session 4 Surface D tracks post-submission interview stages (`RECRUITER_SCREEN`, `TECHNICAL_INTERVIEW`, `FINAL_ROUND`, `OFFER_RECEIVED`, `POST_APPLY_REJECTED`), whereas `jobStatusEnum` only tracked pipeline states up to `APPLIED`. | Added `postApplyStageEnum` (`post_apply_stage`) to `application_packages` in Session 1 so pipeline tab filtering (`status = 'APPLIED'`) remains orthogonal to interview funnel tracking. |
| **5** | **Unverified Resume Skills Flow** (`Session 1` ↔ `Session 4`) | Session 1 extracts `unverifiedSkillMentions` (skills listed in a resume footer with no linked experience/project) and Session 4 renders an **Unverified Skills Inbox** in `/profile`. | Standardized persistence: unverified skills are inserted into `career_skills` with `is_user_verified = false` and zero rows in `career_skill_evidence`. Stage 2 scoring and Step 4 synthesis strictly filter `WHERE is_user_verified = true`. |
| **6** | **Job Deduplication vs. Pipeline State Preservation** (`Session 1` ↔ `Session 2`) | Re-ingesting an already-triaged or applied job from a second connector (e.g., Remotive after Google Jobs) must not reset `job_postings.status` back to `INGESTED` or re-trigger Stage 2 LLM costs. | Session 2 `upsertDeduplicatedJob` appends to `sources[]` and upgrades `application_url` if a direct ATS link is found, but returns `shouldScore: false` whenever an existing `fit_evaluations` row exists. |
| **7** | **Gap Resolution Resume Contract** (`Session 3` ↔ `Session 4`) | When a user resolves a `CRITICAL` gap via the inline card in Surface B (`ADDED_TO_PROFILE`, `BRIDGED`, `IGNORED`), Mastra `.resume()` needs exact DB IDs of any newly created skill/bullet. | Aligned `GapResolutionCard.tsx` Server Action (Session 4) with `GapResolutionResumeSchema` (Session 3) so DB writes happen transactionally before `.resume()` is invoked. |

---

## 2. Key Architectural Choices & Evaluated Alternatives

Please review the 10 key architectural choices below. You can approve these defaults or select any alternative before we freeze the plan and begin implementation.

### Choice 1: Hybrid Search Engine (`pgvector` + BM25)
- **Chosen Design:** **ParadeDB PostgreSQL 17 (`paradedb/paradedb:latest-pg17`)** combining `pgvector` HNSW cosine distance + `pg_search` Tantivy BM25 inside a single PostgreSQL container via Reciprocal Rank Fusion ($k=60$).
- **Alternative A (Vanilla Postgres FTS Fallback):** Standard `pgvector/pgvector:pg17` image using native PostgreSQL `tsvector` + `ts_rank_cd` GIN indexes instead of `pg_search` BM25.
  - *Trade-off:* Zero ParadeDB extension dependency (works on any managed cloud Postgres like Supabase/Neon), slightly weaker term-frequency saturation than true BM25.
- **Alternative B (External Search Engine):** PostgreSQL + separate Meilisearch/Typesense container.
  - *Trade-off:* Requires dual-writing and syncing state across two databases.
- **Recommendation:** Use `paradedb/paradedb:latest-pg17` in Docker Compose, and include a configuration flag (`SEARCH_BACKEND=pg_search | tsvector`) in `hybridSearchCareerBullets()` so the codebase also runs seamlessly on standard Postgres 17 if needed.

### Choice 2: Vector Embedding Dimensions (`768` vs `1536`)
- **Chosen Design (Per Your Feedback):** **`vector(768)`** across all 7 embedded tables.
- **Why It Works Well:** Supported natively by Google `gemini-embedding-001` (via `outputDimensionality: 768`), OpenAI `text-embedding-3-small` (`dimensions: 768`), and local Ollama/vLLM models (`nomic-embed-text-v1.5`, `bge-base-en-v1.5`), while cutting HNSW memory footprint and index build time by 50%.

### Choice 3: Master Career Graph Granularity & Zero-Hallucination Enforcement
- **Chosen Design:** Separate relational tables for `career_experiences` (role context) and `career_bullets` (individual achievement statements with `QuantifiedMetric[]` and `isExactFromSource: true`), plus a mandatory `career_skill_evidence` join table.
- **Alternative:** Storing experiences as coarse markdown/JSON blobs and allowing the LLM to infer skills freely.
  - *Trade-off:* Simpler ingestion, but causes subtle metric inflation and makes bullet-level cherry-picking and citation badges in the Studio impossible.

### Choice 4: Resumable Watchable Streaming Transport
- **Chosen Design:** **PostgreSQL `generation_stream_events` table + `LISTEN/NOTIFY`** backing a Next.js App Router SSE endpoint (`/api/applications/[jobId]/stream`) speaking Vercel AI SDK 7 / AG-UI 1.0 events.
- **Alternative A (Redis Streams):** Adding a Redis 7 container to Docker Compose to buffer resumable stream tokens.
  - *Trade-off:* Higher throughput for multi-tenant SaaS, but unnecessary operational overhead for a local-first single-user copilot.
- **Alternative B (Trigger.dev Cloud Realtime Only):** Streaming directly from Trigger.dev's hosted Realtime service.
  - *Trade-off:* Ties UI streaming to Trigger.dev's network connection rather than local DB history when inspecting past/paused runs.

### Choice 5: Application Form Inspection Strategy (Session 2)
- **Chosen Design:** **Two-Path Inspector** — Fast-path queries public JSON APIs for Greenhouse (`/v1/boards/{token}/jobs/{id}?questions=true`), Lever, and Ashby (0 browser overhead, `<300ms`), falling back to a shared headless Playwright extractor only for custom portals.
- **Alternative:** Launching headless Playwright/Stagehand for every single discovered job URL during cron ingestion.
  - *Trade-off:* 10–20x slower ingestion and high CPU/memory usage when syncing 50+ jobs at once.

### Choice 6: Background Task & Workflow Orchestration
- **Chosen Design:** **Trigger.dev v4 + Mastra Workflows (`@mastra/core`)** as specified in `spec.md` §2.1. Trigger.dev handles cron scheduling, retries, and concurrency queues (`concurrencyLimit: 5`), while Mastra handles multi-step agent state and `.suspend()` / `.resume()` for critical skill gaps.
- **Alternative (Zero-External-Coordinator Local Mode):** Running Mastra workflows directly inside Next.js background workers backed by a lightweight Postgres queue (`pg-boss`) so no Trigger.dev CLI/container is required during local development.
  - *Note:* We can structure `packages/jobs` behind a thin `JobDispatcher` interface so both Trigger.dev v4 workers and direct local execution work out of the box!

### Choice 7: PDF Compilation & Live Studio Preview
- **Chosen Design:** **Dual Typst Engine** — `@myriaddreamin/typst-ts-node-compiler` on the server (for deterministic PDF generation and page-count audit) + `typst.ts` WASM in the browser (for `<35ms` live preview in the Watch Drawer and Studio), with a `density: "comfortable" | "standard" | "compact"` parameter in `resume-modern-ats.typ` for automatic 1-page overflow recovery.
- **Alternative:** React-PDF or Puppeteer HTML-to-PDF.
  - *Trade-off:* Puppeteer takes `800–2000ms` per render (breaking live keystroke preview) and often produces bloated, non-linear PDF DOMs that trip older ATS parsers.

### Choice 8: Stagehand v4 Pre-Fill Ordering & Hard-Stop Guardrail
- **Chosen Design:** **Resume-First Upload + Capture-Phase Submit Blocker** — Uploads `compiledResumePdfPath` *first*, waits `1.5s` for any ATS client-side resume auto-parser to finish, then populates clean identity and custom screening fields, highlights ambiguous/EEO/Captcha fields in amber, and blocks programmatic submit clicks.
- **Alternative:** Filling text fields first and uploading the resume last.
  - *Trade-off:* Portals like Lever and Workday automatically run an in-page resume parser when a file is selected, overwriting already-filled text fields with raw unformatted strings.

---

## 3. Phased Implementation Plan

Once you approve this plan, we will execute implementation across **7 sequential milestones**, verifying each milestone before moving to the next:

```mermaid
flowchart TD
    M1["Milestone 1: Monorepo Scaffold, Docker Postgres 17, & packages/db\n(Turborepo, Drizzle schema, HNSW + BM25 migrations, RRF search)"]
    M2["Milestone 2: Model Router & Master Career Graph Ingestion\n(packages/agents router, PDF/DOCX/MD parser, CareerDocumentExtraction, Graph Merger)"]
    M3["Milestone 3: Job Connectors, Form Inspector, & Two-Stage Fit Engine\n(SerpApi, Remotive, ATS JSON/Playwright, Deduplicator, Stage 1 & Stage 2 Scoring)"]
    M4["Milestone 4: Typst PDF Engine & Watchable generate-materials Workflow\n(packages/pdf-engine, Mastra 6-step workflow, .suspend/.resume, Resumable SSE)"]
    M5["Milestone 5: Next.js 16 Pipeline UI, Watch Drawer, & Split-Screen Studio\n(Surfaces A/B/C/D, /profile builder, WASM Typst preview, Inline Gap Resolver)"]
    M6["Milestone 6: Stagehand v4 Assisted Apply & Preference Memory Loop\n(packages/browser-apply adapters, Hard-Stop Banner, 1-Click Copy Kit, Memory Distiller)"]
    M7["Milestone 7: End-to-End Verification, Seed Fixtures, & CLI Startup Scripts"]

    M1 --> M2 --> M3 --> M4 --> M5 --> M6 --> M7
```

### Detailed Milestone Breakdown

| Milestone | Target Workspace Packages | Key Deliverables | Verification Gate |
| :--- | :--- | :--- | :--- |
| **M1: Foundation & DB Layer** | Root, `docker-compose.yml`, `packages/db` | `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, all 13 Drizzle tables + `relations.ts`, SQL migrations for `pgvector(768)` + `pg_search` BM25 (with `tsvector` fallback), `hybridSearchCareerBullets()` & `hybridSearchCareerProjects()`. | `docker compose up -d` starts cleanly; `pnpm --filter @job-copilot/db db:migrate` and unit test of RRF hybrid query pass. |
| **M2: Career Graph Ingestion** | `packages/agents`, `packages/db/validators` | `MODEL_ROUTING_TABLE` + `EMBEDDING_CONFIG` (768-dim), document-to-Markdown parser (`unpdf` / `mammoth`), `CareerDocumentExtractionSchema`, multi-document deduplication & evidence linker, `/profile` server actions. | Ingesting a sample resume + project doc populates `career_experiences`, `career_bullets`, `career_skills`, and `career_skill_evidence` with 768-dim embeddings and zero unlinked verified skills. |
| **M3: Job Ingestion & Fit Engine** | `packages/jobs`, `packages/agents` | Connectors (`SerpApi`, `Remotive`, `ATS Direct`, `Gmail`), Two-Path Form Inspector, SHA-256 Deduplicator, `evaluateStage1HardFilters()` (zero-token), Mastra `ingestAndScoreWorkflow` (Stage 2 rubric + gap detector), Trigger.dev v4 tasks. | Unit & integration tests verifying Stage 1 knockouts (`FILTERED_OUT`), dedup source merging, and Stage 2 calibrated `fit_evaluations` output (`TRIAGE_INBOX`). |
| **M4: Typst Engine & Watchable Synthesis** | `packages/pdf-engine`, `packages/agents` | `resume-modern-ats.typ` & `cover-letter-modern.typ`, `compileTypstToPdf()` Node compiler, page-count & keyword auditor, Mastra 6-step `generate-materials` workflow with `.suspend()`/`.resume()`, `generation_stream_events` publisher. | Compiling sample `TailoredResumePayload` yields valid 1-page vector PDF in `<50ms`; workflow suspends on `CRITICAL` gap and resumes cleanly upon resolution payload. |
| **M5: Next.js 16 Surfaces & Studio** | `apps/web` | App Router layouts & pages (`/inbox`, `/approved`, `/ready`, `/applied`, `/studio/[jobId]`, `/profile`), Resumable SSE route (`/api/applications/[jobId]/stream`), `WatchableGenerationDrawer`, `GapResolutionCard`, WASM `typst.ts` live preview hook. | `pnpm --filter web build` & typecheck pass; live SSE stream updates the Watch Drawer and WASM PDF canvas in real time. |
| **M6: Assisted Apply & Preference Memory** | `packages/browser-apply`, `packages/agents/memory` | Stagehand v4 local headed runner (`runStagehandAssistedApply`), Greenhouse/Lever/Ashby/Generic adapters, `installSubmitButtonBlocker()`, in-browser Verification Banner, `CopyPasteApplyKitDrawer`, `preference_memory` distiller for rejections & Studio edits. | Headed Chromium opens sample ATS form, uploads PDF, fills fields, highlights EEO fields in amber, and halts with Submit blocked; Studio edit creates a 768-dim `preference_memory` rule. |
| **M7: E2E Smoke Test & Polish** | All packages | Seed script (`pnpm db:seed`), `.env.example`, unified `pnpm dev` orchestration script, and full pipeline walkthrough verification. | End-to-end flow from Profile Upload -> Job Sync -> Triage Approve -> Watchable Generation -> Studio Edit -> Assisted Apply Halted at Submit works seamlessly. |

---

## 4. Local-First Deployment & Runtime Architecture

### 4.1 Local Container & Process Topology

```mermaid
flowchart LR
    subgraph Host["Local Developer Machine (macOS / Linux)"]
        WEB["Next.js 16.3 App Server\n(localhost:3000)"]
        WRK["Trigger.dev v4 Local Worker / Dispatcher\n(packages/jobs + packages/agents)"]
        CHR["Headed Chromium Instance\n(Stagehand v4 + .stagehand/persistent-profile)"]
        FS[("Local Artifact Storage\n./storage/applications/{jobId}/v{N}/*.pdf")]
    end

    subgraph Docker["Docker Compose (docker-compose.yml)"]
        PG[("ParadeDB PostgreSQL 17\n(localhost:5432)\n- pgvector (768-dim HNSW)\n- pg_search (BM25)")]
    end

    WEB <--> PG
    WRK <--> PG
    WRK --> FS
    WEB <--> FS
    WEB -->|Launch Assisted Apply| CHR
```

### 4.2 `docker-compose.yml` Specification

Uses lightweight `pgvector/pgvector:pg17` by default so local development matches **$0/mo Neon / Supabase** serverless Postgres 1:1 (native `pgvector` HNSW + native `tsvector` GIN full-text search).

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17 # Or paradedb/paradedb:latest-pg17 if using SEARCH_BACKEND="pg_search"
    container_name: job-copilot-db
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: copilot
      POSTGRES_PASSWORD: copilot_local_password
      POSTGRES_DB: job_copilot
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U copilot -d job_copilot"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### 4.3 Environment Configuration (`.env.example`)

```dotenv
# Database (Works with local Docker pgvector:pg17, Neon, or Supabase)
DATABASE_URL="postgresql://copilot:copilot_local_password@localhost:5432/job_copilot"
SEARCH_BACKEND="tsvector" # "tsvector" (Default: Universal Postgres GIN + pgvector) or "pg_search" (ParadeDB BM25)

# LLM Providers (Multi-Model Router)
GOOGLE_GENERATIVE_AI_API_KEY="" # Gemini 3.1 Flash-Lite, Gemini 3.5 Flash, Gemini 3.1 Pro, gemini-embedding-001 (768-dim)
ANTHROPIC_API_KEY=""            # Claude Sonnet 4.6 & Claude Opus 4.6 (Tier 3 Persuasive Synthesis)
OPENAI_API_KEY=""               # Optional fallback (GPT-5.4-nano / GPT-5.4-mini / text-embedding-3-small)

# Embedding Configuration (Locked at 768 dimensions)
EMBEDDING_PROVIDER="google"     # "google" | "openai"
EMBEDDING_MODEL_ID="gemini-embedding-001"

# Job Ingestion Connectors (Optional per connector enabled)
SERPAPI_API_KEY=""
GMAIL_CLIENT_ID=""
GMAIL_CLIENT_SECRET=""
GMAIL_REFRESH_TOKEN=""
GMAIL_ALERT_LABEL="JobCopilot/Alerts"

# Trigger.dev v4 (Optional: falls back to local in-process dispatcher if unset)
TRIGGER_SECRET_KEY=""
TRIGGER_PROJECT_ID=""

# Local Storage & Stagehand Browser Profile
STORAGE_PROVIDER="postgres"     # "postgres" (stateless zero-config bytea), "r2" (Cloudflare R2 free tier), or "local-fs"
STAGEHAND_EXECUTION_MODE="local-bridge" # "local-bridge" | "browserbase" | "copy-kit-only"
BROWSERBASE_API_KEY=""          # Optional: enables in-browser Live View iframe when web app is cloud-hosted
APPLICATION_STORAGE_DIR="./storage/applications"
STAGEHAND_USER_DATA_DIR="./.stagehand/persistent-profile"
```

---

## 5. Production Deployment Review: Cost & Operational Ease Optimizations

When moving from local development to a **Cloud / Self-Hosted Production Deployment** (e.g., **Vercel / Railway / Fly.io + Neon / Supabase Serverless Postgres**, or a **$6/mo Hetzner VPS running Coolify/Docker**), 6 local-first assumptions in our initial design would either increase hosting cost or break stateless cloud deployment.

Below are the **6 recommended architectural adjustments** for production cost and ease:

### 5.1 Change 1: Make Native Postgres `tsvector` GIN + `pgvector` the Default (ParadeDB `pg_search` Optional)
- **Production Issue with Initial Choice:** Managed serverless Postgres providers with generous **$0/mo free tiers** and scale-to-zero (Neon, Supabase, Railway Postgres, AWS RDS) natively support `pgvector`, but **do not** support the third-party `pg_search` Rust/Tantivy extension. Requiring `paradedb/paradedb` forces you to run an always-on custom Docker container with higher RAM.
- **Recommended Change:**
  - Flip the default `SEARCH_BACKEND` to **`tsvector` (`pgvector` HNSW + native PostgreSQL `tsvector` generated column with `GIN` index and `ts_rank_cd` fused via RRF)**.
  - At Career Graph scale (`100–5,000` atomic bullets/projects), native `tsvector` GIN + `pgvector` RRF delivers `<5ms` latency and virtually identical keyword recall while running on **$0/mo Neon or Supabase** out of the box. Keep `paradedb/pg_search` as an optional flag for self-hosted Docker users.

### 5.2 Change 2: Reorder Job Ingestion into a "Cost Funnel" + Enable LLM Prompt Caching
- **Production Issue with Initial Choice:** In Session 2, every discovered job ran through the Form Inspector and Tier 1 LLM Normalizer *before* Deduplication and Stage 1 filtering. If a daily cron fetches 200 postings where 130 are duplicates from earlier runs and 30 have blacklisted title keywords (e.g., `"Intern"`, `"PHP"`, `"Clearance"`), running form inspection and LLM normalization first wastes **~75% of Tier 1 tokens and HTTP calls**.
- **Recommended Change:**
  1. **Step 1 — Fast Raw Deduplication (0 tokens, 0 HTTP calls):** Check `externalId`, `applicationUrl`, and raw `dedupFingerprint` against `job_postings` *before* inspecting or calling any LLM. If already scored, append `sources[]` and stop.
  2. **Step 2 — Stage 1a Raw Pre-Filter (0 tokens):** Run fast regex/keyword knockouts on `companyNameRaw`, `titleRaw`, and `locationRaw` against `blacklistedCompanies` and `blacklistedTitleKeywords`.
  3. **Step 3 — Form Inspection + Tier 1 LLM Normalization:** Only execute on genuinely new jobs that pass Steps 1 & 2.
  4. **Step 4 — Stage 1b Structured Filter (0 tokens):** Check normalized salary floor, UTC offset bounds, and visa sponsorship.
  5. **Step 5 — Cached Stage 2 Rubric Scoring:** Structure the Stage 2 prompt so the **System Prompt + Candidate Master Career Graph Summary + Verified Skills + Preference Memory Rules** sit in a **static prefix** across a batch of jobs, and the job posting sits at the end. This unlocks **75%–90% Prompt Caching discounts** on Gemini, Anthropic, and OpenAI.

### 5.3 Change 3: Stateless PDF Storage (`postgres` `bytea` or Cloudflare R2) Instead of Local Disk Paths
- **Production Issue with Initial Choice:** Writing compiled PDFs to `./storage/applications/*.pdf` fails in production because Trigger.dev workers and the Next.js web server run in separate ephemeral containers that do not share a local filesystem.
- **Recommended Change:**
  - Compiled vector Typst resumes and cover letters are only **`20 KB – 45 KB`** each, and their full source markup (`resume_typst_source`) is already stored in `application_packages`.
  - Introduce a thin `StorageProvider` defaulting to **`postgres`** (storing the 30KB PDF binary in a dedicated `application_files` table or compiling on-the-fly in `<30ms` from `resume_typst_source`), with one-line config support for **Cloudflare R2** (`10 GB/mo` free tier, zero egress fees). This makes Next.js and Trigger.dev **100% stateless**.

### 5.4 Change 4: Replace Stateful `LISTEN/NOTIFY` with Trigger.dev Realtime + Pooled Cursor Queries
- **Production Issue with Initial Choice:** PostgreSQL `LISTEN/NOTIFY` requires dedicated, unpooled long-lived TCP connections, which breaks on serverless Postgres transaction poolers (Neon / Supabase PgBouncer), prevents serverless databases from scaling to zero, and risks exhausting connection limits.
- **Recommended Change:**
  - Use **Trigger.dev v4 Realtime (`useRealtimeRun` / `streams`)** for live token/step push notifications in production, paired with standard pooled SQL queries (`SELECT * FROM generation_stream_events WHERE stream_channel_id = $1 AND seq > $2`) for state replay. Zero persistent DB connections are held open.

### 5.5 Change 5: Decouple Stagehand v4 Assisted Apply from the Next.js Cloud Server
- **Production Issue with Initial Choice:** If `apps/web` is deployed to Vercel, Railway, or a headless Linux VPS, an API route cannot open a local headed Chromium window (`headless: false`) on the user's laptop, and cloud datacenter IPs trigger ATS bot challenges.
- **Recommended Change — 3-Mode Execution Adapter:**
  1. **`local-bridge` (Default for Hybrid Cloud UI + Local Browser):** The cloud-hosted Next.js Studio dispatches the `AssistedApplyPayload` to a lightweight local companion CLI (`pnpm apply:companion` listening on `http://127.0.0.1:43110`) which opens headed Chromium directly on the user's machine using their residential IP and persistent browser profile.
  2. **`browserbase` (100% Cloud / Zero-Install Option):** Since we already use `@browserbasehq/stagehand`, setting `env: 'BROWSERBASE'` spins up a stealth cloud browser and embeds Browserbase's interactive **Live View iframe** directly inside the Next.js Studio so the user can review fields, solve Captcha, and click Submit from any device (even a tablet) without local Playwright.
  3. **`copy-kit-only` (Zero-Compute Fallback):** The 1-Click Copy-Paste Kit Drawer works purely in the browser.

### 5.6 Change 6: Default Form Inspector to Zero-Browser (`fetch` + ATS JSON APIs + `linkedom`)
- **Production Issue with Initial Choice:** Bundling headless Chromium into the ingestion worker bloats container images by `~1.2 GB` and requires `1–2 GB` worker RAM (`$10–$20/mo`).
- **Recommended Change:**
  - Make **Path 1 (Native Greenhouse/Lever/Ashby/Workday JSON APIs + lightweight HTML/JSON-LD parsing via `linkedom`)** the default in production (`<128 MB` RAM, runs on free/micro worker tiers), and make headless Playwright/Browserbase inspection strictly opt-in (`ENABLE_BROWSER_FORM_INSPECTOR=true`).

---

### 5.7 Production Cost Comparison (Before vs. After Optimizations)

| Stack Component | Initial Design in Prod | Optimized Prod Design | Monthly Prod Cost (Optimized) |
| :--- | :--- | :--- | :--- |
| **Frontend & API (`apps/web`)** | Needs stateful Node server + local volume + Chromium | Stateless Next.js 16 on **Vercel (Hobby)** or **Railway / Coolify** | **$0/mo** (Vercel) or **$5/mo** (VPS/Railway) |
| **PostgreSQL 17 + Hybrid Search** | Dedicated ParadeDB Docker VM (`$15–$25/mo` always-on) | **Neon** or **Supabase** Serverless Postgres (`pgvector` + `tsvector` GIN) | **$0/mo** (Free tier with scale-to-zero) |
| **Background Jobs (`packages/jobs`)** | High-RAM worker for Playwright (`$10–$20/mo`) | **Trigger.dev Cloud Free Tier** (lightweight JSON/HTML inspector) | **$0/mo** (Included in free tier) |
| **PDF Artifact Storage** | Persistent shared block volume | **Postgres `bytea` / On-demand Typst** or **Cloudflare R2** | **$0/mo** |
| **LLM Token Spend (100 jobs/day)** | Every raw job normalized via LLM; uncached rubric prompts | **Pre-dedup + Stage 1a regex funnel + Stage 2 Prompt Caching** | **~70–80% lower LLM API spend** (`~$2–$5/mo`) |
| **Assisted Browser Apply** | Breaks if web app is hosted remotely | **Local Companion Bridge (`127.0.0.1`)** or **Browserbase Live View** | **$0/mo** (Local Bridge) |
| **Total Fixed Infrastructure Cost** | **~$25–$45 / month** | **100% Stateless Cloud + Local Apply Bridge** | **$0 – $5 / month** |


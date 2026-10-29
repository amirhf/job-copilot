# Job Copilot — Agentic Job Search & Application Studio

A personal, local-first + cloud-ready **Job Search & Application Copilot** built as a TypeScript monorepo (`pnpm` + `Turborepo`).

## Core Principles

1. **Zero Hallucination**: Every skill in the Master Career Graph requires at least one verified evidence edge (`career_skill_evidence`) pointing to a real experience, bullet, project, or STAR story. During synthesis, numeric metrics (`%`, `$K`, `$M`, `x`) are audited against source bullets.
2. **Quality Over Spam**: Never auto-submits applications blindly. Stagehand v4 Assisted Apply pre-fills application portals in a headed browser and halts at the final Submit button with a visual verification banner and programmatic submit blocker.
3. **Token-Efficient 5-Stage Cost Funnel**: Raw SHA-256 deduplication and Stage 1a/1b deterministic hard filters run *before* form inspection and Stage 2 prompt-cached rubric scoring.
4. **Watchable Async Execution**: Material generation streams live step progress, reasoning deltas, and compiled Typst vector PDFs over a zero-Redis resumable SSE log (`generation_stream_events`), suspending inline when a `CRITICAL` skill gap requires candidate input.

---

## Monorepo Architecture

- [`packages/db`](file:///Users/amirhf/job_assist/packages/db/package.json): Drizzle ORM schema (13 tables), 768-dim `pgvector` HNSW indexes, native PostgreSQL `tsvector` + `pgvector` Reciprocal Rank Fusion ($k=60$) hybrid search, migrations, and deterministic seed script.
- [`packages/agents`](file:///Users/amirhf/job_assist/packages/agents/package.json): Multi-model router (`TIER_1_INGESTION`, `TIER_2_RUBRIC`, `TIER_3_SYNTHESIS_DEFAULT`, `TIER_3_SYNTHESIS_PREMIER`), zero-hallucination career extractor & graph merger, two-stage fit evaluator, 6-step watchable synthesis workflow with `.suspend()`/`.resume()` gap gates, and 768-dim Preference Memory distiller.
- [`packages/jobs`](file:///Users/amirhf/job_assist/packages/jobs/package.json): Job connectors (SerpApi Google Jobs, Remotive, direct Greenhouse/Lever/Ashby search, Gmail Alert parser), zero-browser `linkedom` Form Inspector, SHA-256 deduplicator, and Trigger.dev v4 tasks.
- [`packages/pdf-engine`](file:///Users/amirhf/job_assist/packages/pdf-engine/package.json): Native `@myriaddreamin/typst-ts-node-compiler` engine, single-column ATS-safe Typst templates (`resume-modern-ats.typ`, `cover-letter-modern.typ`), automatic 1-page compact density & bullet-trimming auto-fit loop, and Zero-Hallucination & Easter-Egg auditor.
- [`packages/browser-apply`](file:///Users/amirhf/job_assist/packages/browser-apply/package.json): Stagehand v4 3-mode Assisted Apply runner (`local-bridge` on `127.0.0.1:43110`, `browserbase` Live View iframe, `copy-kit-only`), Greenhouse/Lever/Ashby/Generic adapters with Resume-First Upload, and in-browser hard-stop verification overlay.
- [`apps/web`](file:///Users/amirhf/job_assist/apps/web/package.json): Next.js App Router & React 19 UI featuring the 4 Pipeline Surfaces (`/inbox`, `/approved`, `/ready`, `/applied`), Full-Screen Split Document Studio (`/studio/[jobId]`), and Master Career Graph Builder (`/profile`).

---

## Quickstart

```bash
# 1. Start PostgreSQL 17 with pgvector
pnpm db:up

# 2. Run SQL migrations + hybrid FTS GIN indexes and seed sample data
pnpm db:migrate
pnpm db:seed

# 3. Start the Next.js application (http://localhost:3000)
pnpm dev

# 4. (Optional) Start the local Stagehand v4 headed browser bridge (http://127.0.0.1:43110)
pnpm apply:companion
```

## Verification Commands

```bash
# Run full workspace TypeScript typecheck across all 6 packages
pnpm typecheck

# Run full workspace Vitest unit & integration test suites
pnpm test
```

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.


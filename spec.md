Technical Specification: Agentic Job Application Copilot (v2.1)
Status: Approved High-Level Specification
Target Environment: Local-First / Self-Hosted 100% TypeScript Monorepo
IDE / Agentic Workspace: Antigravity
Last Updated: October 2026


1. Executive Summary & Core Philosophy
The Agentic Job Application Copilot is a human-in-the-loop, multi-agent platform that automates job discovery, evaluates role fit against a structured Master Career Graph, generates tailored application materials on demand with real-time observability, and streamlines form submission via self-healing browser pre-filling.
Core Principles
Quality Over Spam: The system never auto-submits applications blindly. Every role passes through a human triage gate and a final submission review gate.
Zero Hallucination & Gap Transparency: The agent is strictly forbidden from inventing skills or inflating metrics. It highlights adjacent experience to bridge minor gaps and surfaces critical missing requirements via an interactive Gap-to-Profile prompt that enriches the Master Career Graph when confirmed.
Token-Efficient, On-Demand Generation: Expensive synthesis models only run on roles explicitly approved by the user.
Watchable Async Execution: Material generation runs asynchronously in the background for single or batch-selected jobs while exposing a live, resumable stream of agent reasoning, tool execution, and real-time PDF compilation.


2. Locked Technology Stack (Option A: 100% TypeScript Monorepo)
Using a unified TypeScript stack eliminates cross-language serialization overhead and enables end-to-end type safety (via Zod and Drizzle) across the database, Mastra agents, Trigger.dev background workers, Stagehand browser scripts, and the Next.js 16 UI.
2.1 Application & Infrastructure Stack
Monorepo & Package Manager: Turborepo + pnpm workspaces
Frontend & Full-Stack Framework: Next.js 16 (16.3 LTS, App Router) + React 19.2 (React Compiler, Server Actions, Instant Navigations)
UI Components & Styling: Tailwind CSS v4 + shadcn/ui + Radix Primitives + Lucide Icons
Agent Framework & Orchestration: Mastra (@mastra/core)
Native TypeScript agents, structured Zod outputs, unified model router, agent memory, and durable workflows with .suspend() and .resume() for human-in-the-loop gap resolution.
Async Background Jobs & Cron Scheduling: Trigger.dev (v3/v4)
Handles scheduled ingestion crons, manual ingestion triggers, and parallel long-running material generation tasks without serverless timeouts.
Watchable Streaming Protocol: Vercel AI SDK 7 (UI Message Streams / Resumable Streams) + AG-UI 1.0 (@ag-ui/core)
Streams live reasoning tokens, step transitions, and partial Typst/Markdown updates over Server-Sent Events (SSE). Allows detaching and re-attaching to running background tasks from any browser tab.
Document & PDF Compilation Engine: Typst (typst.ts WASM in browser + @myriaddreamin/typst-ts-node-compiler on server)
Sub-50ms incremental PDF rendering in the UI studio and clean, ATS-parsable vector PDF exports.
Browser Automation (Assisted Apply): Stagehand v4 (@browserbasehq/stagehand) + Playwright
Runs in local headed mode with a persistent browser profile. Uses AI-powered accessibility-tree primitives (act(), extract(), observe()) with action caching to pre-fill Greenhouse, Lever, Ashby, and Workday forms reliably without brittle CSS selectors.
Database & Hybrid Search: PostgreSQL 17 + pgvector (semantic embeddings) + pg_search / BM25 (exact keyword match) via Drizzle ORM.
2.2 Multi-Model Routing Strategy (2026 Frontier)
Tier
Purpose
Primary Models
Key Capabilities Used
Tier 1: Ingestion & Normalization
Parsing raw HTML/emails, extracting custom application questions, job deduplication, profile document parsing
Gemini 3.1 Flash-Lite / GPT-5.4-nano
Ultra-low cost, sub-second latency, 1M context window, structured JSON/Zod extraction
Tier 2: Rubric Scoring & Gap Analysis
Weighted rubric evaluation against Career Graph, skill gap detection, project selection
Gemini 3.5 Flash / GPT-5.4-mini (escalating to Gemini 3.1 Pro / GPT-5.4)
Adjustable thinking_level, hybrid RAG tool calling, calibrated scoring
Tier 3: Persuasive Synthesis
Tailoring resume bullets, drafting authentic cover letters, answering custom application questions
Claude Sonnet 4.6 (optional Claude Opus 4.6 for top-tier roles)
High-nuance human writing, strict adherence to truthfulness guardrails, hidden instruction compliance



3. End-to-End Workflow & Surface Architecture
[1. Scheduled Cron / Manual Fetch]

       │ (Ingests APIs + Email Alerts -> Scrapes App Questions -> Deduplicates)

       ▼

[2. Two-Stage Fit Engine]

       ├── Fails Stage 1 Hard Filters ──► [Archived / Filtered Out]

       └── Passes Stage 1 ──► Stage 2 Weighted Rubric Scoring & Gap Detection

                                     │

                                     ▼

[3. Surface A: Triage Inbox] ──(User Rejects w/ Reason)──► [Preference Memory]

       │

       │ (User Approves Role)

       ▼

[4. Surface B: Approved Queue & On-Demand Generator]

       │ (User selects All / Subset / Single -> Clicks "Generate Materials")

       ▼

[5. Watchable Async Generation Worker (Trigger.dev + Mastra)]

       ├── Streams live steps, reasoning, & WASM Typst PDF preview via SSE

       └── If critical qualification missing ──► [PAUSED_NEEDS_INPUT]

                                                    │ (User adds to Profile or Bridges)

                                                    ▼

[6. Surface C: "Ready to Apply" Queue & Studio]

       │ (Side-by-side Markdown/Typst Editor + Instant PDF Preview + Q&A Review)

       │ (User clicks "Launch Assisted Apply")

       ▼

[7. Stagehand v4 Assisted Apply]

       ├── Primary (Option B): Headed browser opens, fills fields, uploads PDF, HALTS at Submit

       └── Fallback (Option A): 1-Click Copy-Paste Kit Drawer for non-standard portals

       │

       ▼ (User clicks Submit & confirms)

[8. Surface D: Applied Tracker & Immutable Snapshot Archive]


4. Core Functional Modules
Module 1: Master Career Graph & Profile Builder
Multi-Source Ingestion UI: Upload existing resumes (PDF/DOCX/MD), project write-ups, architecture docs, portfolio URLs, and GitHub links.
Atomic Career Blocks: Parses inputs into normalized PostgreSQL tables with vector embeddings:
experiences: Company, title, date range, context, and atomic achievement bullets with metrics.
projects: Problem statement, architecture/stack, quantified outcomes, and repository/live links.
skills: Categorized competencies linked directly to supporting experiences or projects as evidence.
stories: STAR-formatted narratives for behavioral and custom screening questions.
Search & Rubric Configuration:
Hard Filters (Knockouts): Location/Remote policy, allowed timezones, minimum base salary floor, visa/sponsorship rules, blacklisted companies/keywords.
Rubric Weights: Interactive sliders (0–100%) for Tech Stack Alignment, Seniority & Scope, Domain/Industry Fit, and Company Stage/Culture.
Module 2: Job Ingestion, Question Scraping & Deduplication
Connectors:
Search & Aggregator APIs: SerpApi (Google Jobs), Remotive API, and targeted ATS search queries (site:boards.greenhouse.io, site:jobs.lever.co, site:jobs.ashbyhq.com).
Email Alert Parser: Gmail API / IMAP worker polling a dedicated label for daily alerts from Wellfound, LinkedIn, and niche job boards.
Application Form Inspector: Visits the target application URL during ingestion to extract custom screening questions, required attachments, and "easter egg" instructions (e.g., "Include a specific phrase in your cover letter").
Deduplication Engine: Generates a canonical fingerprint (normalized_company + normalized_title + location_bucket) and merges duplicate postings across sources.
Triggers: Automated daily Cron via Trigger.dev + manual "Sync Now" button in the UI.
Module 3: Two-Stage Fit Assessment & Rubric Engine
Stage 1 (Deterministic Gate): Zero-token filter evaluating hard constraints.
Stage 2 (LLM Rubric Evaluator): Performs hybrid search (pgvector + BM25) against the Master Career Graph and outputs a structured FitEvaluation:
Overall Score (0–100) + Per-Category Breakdown.
Executive Summary (Top reasons for fit).
Flagged Skill Gaps: Specific requirements from the job posting lacking explicit evidence in the Master Career Graph.
Module 4: On-Demand, Watchable Material Generation & Gap Loop
Selective Batch Dispatch: From the Approved Queue, the user selects one, several, or all approved roles and triggers async generation.
Mastra Generation Workflow:
analyzeRequirements: Extracts ATS keywords, tone, and mandatory instructions.
selectCareerBlocks: Ranks and selects the most relevant experiences, projects, and bullet points.
checkCriticalGaps: Evaluates whether missing requirements require user input. If so, calls suspend() and notifies the UI (PAUSED_NEEDS_INPUT).
synthesizeResume: Rewrites and prioritizes selected bullets using Claude Sonnet 4.6 without fabricating qualifications. Bridges minor gaps using adjacent verified skills.
synthesizeCoverLetterAndQA: Drafts a tailored cover letter and answers all extracted application questions, enforcing any special posting instructions.
compileAndAuditPdf: Renders the Typst template to PDF and verifies page count, formatting, and keyword coverage.
Interactive Gap-to-Profile Resolution:
When a gap warning is clicked, the user can choose:
Add Evidence to Master Profile: Opens an inline form that saves the new skill/experience to the Master Career Graph and resumes generation.
Bridge with Adjacent Skill: Instructs the agent to emphasize a related technology.
Ignore Gap: Proceeds without addressing the missing item.
Module 5: Next.js Review Surfaces & Document Studio
Unified Pipeline Navigation: Tabs for Triage Inbox, Approved & Generating, Ready to Apply, and Applied / Archive.
Watchable Live Drawer: Clicking any job in the GENERATING state opens a split view streaming the Mastra agent's reasoning steps on the left and the live-updating typst.ts PDF preview on the right.
Interactive Studio (Ready to Apply):
Side-by-side Markdown/Structured Editor and live WASM Typst PDF preview.
One-click PDF export and "Save phrasing to Preference Memory" toggle when manual edits are made.
Reject modal capturing structured feedback to refine future rubric scoring.
Module 6: Non-Spammy Assisted Apply Engine
Mode 1: Stagehand v4 Headed Pre-Fill (Option B - Primary)
Triggered via "Launch Assisted Apply" on any READY_TO_APPLY job.
Launches a local headed Chromium instance via Stagehand v4, navigates to the application URL, fills standard profile fields, uploads the compiled Resume/Cover Letter PDFs, and populates custom screening answers.
Hard Stop Guardrail: The script highlights any ambiguous fields (e.g., Captcha, specific EEO disclosures) and never clicks the final Submit button.
Mode 2: 1-Click Apply Kit (Option A - Fallback)
For auth-walled or unsupported portals, opens a compact copy-paste companion view with 1-click copy buttons for each question/answer and quick-drag PDF chips.


5. Proposed Monorepo Structure (For Antigravity)
job-copilot/

├── apps/

│   └── web/                        # Next.js 16.3 App Router UI

│       ├── app/

│       │   ├── (pipeline)/

│       │   │   ├── inbox/          # Surface A: Triage Inbox

│       │   │   ├── approved/       # Surface B: Approved & Watchable Generator

│       │   │   ├── ready/          # Surface C: Ready to Apply Queue

│       │   │   └── applied/        # Surface D: Applied Tracker

│       │   ├── studio/[jobId]/     # Split-screen Typst Editor & Live Agent Stream

│       │   ├── profile/            # Master Career Graph Builder & Rubric Settings

│       │   └── api/                # AI SDK 7 Resumable SSE & Webhook Routes

│       └── components/

├── packages/

│   ├── db/                         # Drizzle ORM Schema, Migrations, Hybrid Search queries

│   ├── agents/                     # Mastra Agents, Prompts, Tools, & Workflows

│   │   ├── workflows/

│   │   │   ├── ingest-and-score.ts

│   │   │   └── generate-materials.ts

│   │   └── routers/                # Multi-model tier routing config

│   ├── jobs/                       # Trigger.dev v4 Tasks & Cron Schedules

│   ├── pdf-engine/                 # Typst templates & Node/WASM compiler wrappers

│   └── browser-apply/              # Stagehand v4 + Playwright pre-fill adapters

├── turbo.json

└── package.json


6. Next Steps: Detailed Design Sessions in Antigravity
To transition smoothly into implementation inside Antigravity, we will tackle the detailed design in five focused sessions:
Session 1: Database Schema & Master Career Graph Architecture (packages/db)
Define the exact Drizzle ORM schema for candidate_profile, career_experiences, career_projects, career_skills, job_postings, fit_evaluations, application_packages, and preference_memory.
Configure pgvector embeddings and pg_search (BM25) indexes for hybrid retrieval.
Design the ingestion prompt and Zod schemas for parsing unstructured resumes and project docs into atomic Career Blocks.
Session 2: Ingestion Connectors & Rubric Scoring Workflow (packages/jobs & packages/agents)
Specify the connector interfaces for SerpApi (Google Jobs), Remotive, ATS search queries, and the Gmail/IMAP email alert parser.
Design the Stage 1 deterministic filter logic and the Stage 2 Mastra Rubric Scoring prompt + structured output schema.
Set up Trigger.dev scheduled cron tasks and manual trigger webhooks.
Session 3: Watchable Async Generation & Typst PDF Pipeline (packages/agents & packages/pdf-engine)
Design the Mastra multi-step generate-materials workflow with .suspend() / .resume() for the Gap-to-Profile loop.
Configure Trigger.dev Realtime + Vercel AI SDK 7 Resumable Streams so the Next.js UI can watch single or batch runs in real time.
Create the modular Typst resume and cover letter templates and wire up @myriaddreamin/typst-ts-node-compiler + browser WASM preview.
Session 4: Next.js 16 Pipeline Surfaces & Interactive Studio (apps/web)
Design the wireframes and component hierarchy for the 4 pipeline tabs (Inbox, Approved, Ready to Apply, Applied).
Build the "Watch Live" streaming drawer and the split-screen Application Studio with inline Gap Warning resolution cards.
Session 5: Stagehand v4 Assisted Apply & Feedback Loop (packages/browser-apply)
Design the local Stagehand v4 runner and field-mapping prompts for Greenhouse, Lever, Ashby, and generic forms.
Implement the hard-stop verification overlay and the 1-Click Copy-Paste fallback kit.
Wire up rejection reasons and studio text edits into preference_memory for continuous self-improvement.

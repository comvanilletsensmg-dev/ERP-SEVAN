# Vanilla ERP

An Enterprise Resource Planning (ERP) system for a vanilla export company in Madagascar, managing procurement, lot management, inventory, sales, and accounting.

## Run & Operate

- **Start dev server:** `pnpm dev`
- **Build all packages:** `pnpm build`
- **Typecheck:** `pnpm typecheck`
- **Generate API client & Zod schemas:** `pnpm orval`
- **Push DB schema:** `drizzle-kit push:pg`
- **Required Env Vars:** `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY` (for AI features)

## Stack

- **Runtime:** Node.js 24
- **Language:** TypeScript 5.9
- **Backend:** Express 5
- **Frontend:** React, Vite
- **Styling:** TailwindCSS
- **Routing:** Wouter
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Validation:** Zod
- **API Codegen:** Orval
- **Monorepo:** pnpm workspaces

## Where things live

- **Database Schema:** `lib/db/src/schema/`
- **API Contracts:** `lib/api-spec/openapi.yaml`
- **Backend Routes:** `artifacts/api-server/src/routes/`
- **Frontend Pages:** `artifacts/vanilla-erp/src/pages/`
- **Shared Libraries:** `lib/` (e.g., `lib/api-client-react`, `lib/api-zod`, `lib/db`)
- **CV Uploads:** `uploads/cv/` (served at `/api/uploads/cv/`)
- **Payment Proof Uploads:** `uploads/payments/`

## Architecture decisions

- **Monorepo for Cohesion:** pnpm workspaces facilitate shared types and API contracts across backend and frontend, reducing duplication and ensuring consistency.
- **OpenAPI as Single Source of Truth:** All API interactions are defined in `openapi.yaml`, from which client and validation code is generated, enforcing strict API contracts.
- **Type-Safe Database Interactions:** Drizzle ORM with TypeScript ensures compile-time safety for database operations.
- **Role-Based Access Control (RBAC):** Granular permissions are enforced across the application using 5 distinct user roles (SUPER_ADMIN, ACCOUNTANT, LOGISTICS_MANAGER, HR_MANAGER, COMMERCIAL).
- **AI Integration for Core Business Logic:** AI models are directly integrated into logistics (price prediction, risk assessment) and CRM (lead scoring) workflows, providing data-driven insights.

## Product

- **HR Management:** Employee CRUD, Madagascar-specific payroll, ATS with CV parsing, and onboarding.
- **Operations & Production:** Daily reporting, consumable tracking, and production task management.
- **Advanced Logistics:** Procurement, lot tracking with status workflow, AI-driven risk assessment for vanilla lots, and comprehensive stock management.
- **Financial Accounting:** PCG 2005 compliant journal, invoice management with multi-payment support, financial dashboard, and monthly closing procedures.
- **CRM & Sales:** Kanban-based prospect and deal management, client conversion engine, and quote generation.
- **Unified Partner Management (TIERS):** Centralized CRM clients and logistics suppliers with detailed ledgers and aging reports.
- **Planning:** Production tasks, export orders, and employee leave planning, with auto-scheduling and alerts.

## User preferences

I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## Gotchas

- **Orval Codegen:** Always run `pnpm orval` after modifying `lib/api-spec/openapi.yaml` to regenerate API clients and Zod schemas.
- **DB Schema Changes:** Use `drizzle-kit push:pg` after modifying `lib/db/src/schema/` to update the database schema.
- **Vanilla Lot Status:** Transitions between lot statuses (`raw` → `curing` → `drying` → `ready` → `sold`) are server-validated; invalid transitions will be rejected.
- **Monthly Closing:** The monthly closing process has blocking checklist items (e.g., balanced entries, no drafts) that must be resolved before a period can be closed.

## Pointers

- **Drizzle ORM Docs:** _Populate as you build_
- **Express.js Docs:** _Populate as you build_
- **React Docs:** _Populate as you build_
- **TailwindCSS Docs:** _Populate as you build_
- **Zod Docs:** _Populate as you build_
- **Orval Docs:** _Populate as you build_
- **pnpm Workspaces Docs:** _Populate as you build_
- **PCG 2005 Standards:** _Populate as you build_
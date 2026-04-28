# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS + Wouter

## Application: Vanilla ERP Madagascar

An ERP system for a vanilla export company in Madagascar. Features:
- Multi-currency support (MGA, USD, EUR)
- PCG 2005 double-entry accounting (auto journal entries on purchase/sale)
- Session-based authentication (email + password)
- Supplier management with scoring
- Vanilla lot tracking (weight, humidity, grade, status)
- Purchase management with automatic accounting entries
- Client management (international clients)
- Sales management with incoterms
- Dashboard with analytics (stock, sales, lot status breakdown)

**Default admin login:**
- Email: `admin@vanillaMadagascar.mg`
- Password: `admin123`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Architecture

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/api-client-react/` — generated React Query hooks
- `lib/api-zod/` — generated Zod validation schemas
- `lib/db/src/schema/` — Drizzle ORM table definitions
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/vanilla-erp/src/` — React frontend (Vite)

## DB Schema

Tables: `users`, `suppliers`, `purchases`, `lots`, `clients`, `sales`, `sale_items`, `accounts`, `journal_entries`, `journal_lines`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

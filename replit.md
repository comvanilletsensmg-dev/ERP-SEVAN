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
- **API codegen**: Orval (from OpenAPI spec — schemas option removed to avoid export conflicts)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS + Wouter

## Application: Vanilla ERP Madagascar

An ERP system for a vanilla export company in Madagascar. Full workflow: ACHAT → LOT → STOCK → VENTE → COMPTABILITÉ.

**Default admin login:**
- Email: `admin@vanillaMadagascar.mg`
- Password: `admin123`

### Business Rules (enforced server-side)

- `POST /api/purchases` → automatically creates a lot (VAN-YYYY-XXXX), a stock movement (IN), and a journal entry (D31/C401)
- `PUT /api/lots/:id` → if `weightCurrent` decreases, auto-creates a LOSS stock movement
- `POST /api/sales` → validates lot.status === "ready" AND weightCurrent >= quantity; decrements stock; creates OUT movements and journal entry (D411/C701)
- `POST /api/payments` → records bank receipt; creates journal entry (D512/C411)

### Lot Status Flow

`raw` → `curing` → `drying` → `ready` → `sold`

Only lots with status `ready` can be sold.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
  - **Note**: After codegen, the script auto-patches `lib/api-zod/src/index.ts` to only export `./generated/api` (no types conflict)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only); use `--force` for destructive changes
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Architecture

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/api-client-react/` — generated React Query hooks
- `lib/api-zod/` — generated Zod validation schemas
- `lib/db/src/schema/` — Drizzle ORM table definitions
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/vanilla-erp/src/` — React frontend (Vite)

## DB Schema

Tables:
- `users` — auth
- `suppliers` — fournisseurs (region, score)
- `purchases` — achats (weight, pricePerKg, totalAmount, humidity, paymentMethod, lotId)
- `lots` — lots (code VAN-YYYY-XXXX, weightInitial, weightCurrent, humidity, grade, status)
- `stock_movements` — mouvements stock (type: IN | OUT | LOSS, quantity, note)
- `clients` — clients export (country, currency)
- `sales` — ventes (totalAmount auto-computed, currency, incoterm)
- `sale_items` — lignes de vente (lotId, quantity, price)
- `payments` — paiements clients (saleId, amount, method)
- `accounts` — plan comptable PCG 2005 (31, 401, 411, 512, 701…)
- `journal_entries` — écritures comptables
- `journal_lines` — lignes d'écriture (debit/credit)

## Frontend Pages

- `/dashboard` — summary stats + lot status chart
- `/suppliers` — CRUD fournisseurs
- `/purchases` — création achat (auto-génère lot)
- `/lots` — liste + transformation lot (mise à jour poids/statut)
- `/clients` — CRUD clients
- `/sales` — création vente export (lots ready uniquement)
- `/payments` — enregistrement paiement client
- `/stock-movements` — traçabilité complète (IN / OUT / LOSS)
- `/accounting` — journal comptable PCG 2005

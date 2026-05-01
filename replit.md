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

### Modules

- **HR**: Employees, payroll, leaves, attendance, bonuses, candidates, onboarding
- **Accounting (PCG 2005)**: Journal, invoices, bank, fixed assets, balance sheet, income statement, TVA
- **Logistics Advanced**: Suppliers, purchases, lots, clients, sales, payments, stock movements
  - **Intelligence IA** (`/logistics/intelligence`): AI price prediction (30-day moving average + linear trend), price history CRUD, cost vs price charts, opportunity/drop alerts
  - **Lot Costs** (`POST /api/lots/:id/costs`): Calculate totalCost = purchaseCost + processCost + transportCost; auto-posts journal entry (Débit 602 / Crédit 401) for transport
- **CRM Commercial** (SUPER_ADMIN + COMMERCIAL + LOGISTICS_MANAGER)
  - **Prospects** (`/crm/prospects`): Kanban 5 colonnes (new/to_contact/contacted/qualified/lost) + vue liste, formulaire 3 étapes (Identité → Contact+Fiscal adaptatif par pays → Qualification), import Excel (xlsx+multer, SheetJS), téléchargement modèle, scoring 100pts (géo 30+source 25+activité 20+volume 15+budget 10+complétude 5), 14 pays avec champs fiscaux adaptatifs (SIRET/SIREN FR, EIN US, Cégjegyzékszám HU, etc.), conversion prospect→client, fiche détail `/crm/prospects/:id`, actions hover (email/appel/WhatsApp/avancer/fiche), tags dynamiques, certifications, produits recherchés, incoterms, paiement
  - **Deals/Pipeline** (`/crm/deals`): Kanban drag-and-drop (prospect→contact→negotiation→proposal→won/lost), probabilité auto par stage, valeur pondérée, KPIs pipeline/CA/taux conversion
  - **Leads** (`/crm/leads`): pipeline new→contacted→qualified→proposal→won/lost, scoring IA automatique (pays/secteur/taille/web, max 100), envoi email par lead
  - **Devis** (`/crm/quotes`): numérotation DEV-YYYY-XXXX, lignes articles, TVA 0% export, blocage >10k USD si pas SUPER_ADMIN, workflow draft→sent→accepted/rejected
  - **Activités** (`/crm/interactions`): journal chronologique call/email/meeting/whatsapp/note, filtre par type, lien prospect/client/deal
  - **Templates email** (`/crm/templates`): CRUD avec variables `{{name}}`, `{{company}}`, `{{product}}`, `{{invoice}}`, 4 catégories (welcome/followup/reminder/proposal)
  - **Relances** (`/crm/reminders`): créer/envoyer/annuler, bouton "Détecter factures en retard" (cron quotidien auto), envoi Nodemailer (SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM) ou simulation loggée
  - **Clients** (`/clients`): accès restreint SUPER_ADMIN + ACCOUNTANT + COMMERCIAL, champs enrichis (riskLevel, creditLimit, paymentTerms, isActive, phone, notes)
  - **API** : `/api/crm/prospects` (CRUD + /status + /convert + /score + /template + /import), `/api/crm/deals`, `/api/crm/interactions`, `/api/crm/quotes`, `/api/leads`, `/api/crm/templates`, `/api/crm/email-logs`, `/api/crm/reminders`, `/api/crm/dashboard`, `/api/clients`
  - **Packages nouveaux** : `xlsx` (SheetJS) + `multer` sur api-server pour import/export Excel prospects
- **Logistics nav** : Fournisseurs, Achats, Lots, Paiements, Mouvements stock, Intelligence IA (Clients retiré)
- **RBAC**: 5 roles — SUPER_ADMIN / ACCOUNTANT / LOGISTICS_MANAGER / HR_MANAGER / COMMERCIAL
- **User management**: `/admin/users` (SUPER_ADMIN only)

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
- `user_sessions` — sessions persistantes PostgreSQL (connect-pg-simple, expire 7j)
- `suppliers` — fournisseurs (region, score)
- `purchases` — achats (weight, pricePerKg, totalAmount, humidity, paymentMethod, lotId)
- `lots` — lots (code VAN-YYYY-XXXX, weightInitial, weightCurrent, humidity, grade, status)
- `stock_movements` — mouvements stock (type: IN | OUT | LOSS, quantity, note)
- `clients` — clients export (country, currency)
- `sales` — ventes (totalAmount auto-computed, currency, incoterm)
- `sale_items` — lignes de vente (lotId, quantity, price)
- `payments` — paiements clients (saleId, amount, method)
- `accounts` — plan comptable PCG 2005 (31, 401, 411, 445, 512, 601, 681, 701…) — types: asset/liability/expense/revenue
- `journal_entries` — écritures comptables (date, reference, description)
- `journal_lines` — lignes d'écriture (debit/credit)
- `accounting_partners` — tiers comptables (client/supplier, TVA, adresse)
- `accounting_invoices` — factures avec TVA (sale/purchase, draft→validated→paid, écriture auto sur validation)
- `bank_transactions` — transactions bancaires (import CSV, rapprochement manuel/auto)
- `fixed_assets` — immobilisations (amortissement linéaire, dotation mensuelle auto-postée)
- `employees` — employés (name, position, department, salary, hireDate, isActive, phone)
- `leaves` — congés (employeeId, type: vacation|sick, startDate, endDate, status: pending|approved|rejected)
- `attendance` — pointage (employeeId, date, checkIn, checkOut)
- `hr_requests` — demandes RH (employeeId, type: leave|advance|issue, description, status: pending|approved)
- `payroll` — fiches de paie (employeeId, month YYYY-MM, salaryBase, bonus, deductions, charges, netSalary)
- `bonuses` — primes production (employeeId, lotId, quantity kg, rate MGA/kg, amount)
- `candidates` — recrutement (name, position, status: new|interview|hired|rejected, phone, notes)
- `onboarding_tasks` — onboarding (employeeId, title, status: pending|done)

## Frontend Pages

- `/dashboard` — summary stats + lot status chart
- `/suppliers` — CRUD fournisseurs
- `/purchases` — création achat (auto-génère lot)
- `/lots` — liste + transformation lot (mise à jour poids/statut)
- `/clients` — CRUD clients
- `/sales` — création vente export (lots ready uniquement)
- `/payments` — enregistrement paiement client
- `/stock-movements` — traçabilité complète (IN / OUT / LOSS)
- `/accounting` — journal comptable PCG 2005 + plan de comptes
- `/accounting/invoices` — factures vente/achat (TVA 20%/0% export, validation → écritures auto, paiement)
- `/accounting/partners` — tiers comptables (clients/fournisseurs, N° TVA, adresse)
- `/accounting/bank` — rapprochement bancaire (import CSV, matching manuel, solde)
- `/accounting/assets` — immobilisations (dotation mensuelle → Débit 681/Crédit 281, progression)
- `/accounting/reports` — compte de résultat, balance générale, rapport TVA Madagascar
- `/admin/users` — gestion des utilisateurs et rôles (SUPER_ADMIN uniquement)
- `/dashboard` — tableau de bord personnalisé selon le rôle de l'utilisateur connecté
- `/hr/employees` — liste + création + modification employés (export CSV, hireDate, isActive)
- `/hr/leaves` — demandes de congé + approbation/rejet
- `/hr/attendance` — pointage journalier (check-in / check-out) par employé
- `/hr/requests` — demandes RH générales (avance, problème, congé)
- `/hr/payroll` — génération fiche de paie (salaire + primes − absences − CNAPS/OSTIE 2%)
- `/hr/bonuses` — primes production liées aux lots vanille (quantité × taux MGA/kg)
- `/hr/candidates` — pipeline recrutement kanban (nouveau → entretien → recruté) + onboarding tasks

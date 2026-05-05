# Overview

This project is a pnpm workspace monorepo using TypeScript, designed to be a comprehensive Enterprise Resource Planning (ERP) system for a vanilla export company in Madagascar. The system aims to manage the full business workflow from procurement (ACHAT) and lot management (LOT) through inventory (STOCK) and sales (VENTE) to accounting (COMPTABILITÉ).

The ERP system incorporates advanced modules such as HR, Accounting (PCG 2005 standards), advanced Logistics with AI-driven intelligence, and a robust CRM. Key capabilities include employee management, payroll calculation specific to Madagascar, financial accounting, detailed stock tracking, AI-powered price prediction and risk assessment for vanilla lots, and a comprehensive CRM for managing prospects, deals, and sales. The system is designed to streamline operations, provide data-driven insights, and ensure compliance with local regulations.

# User Preferences

I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

# System Architecture

The project is structured as a pnpm monorepo, leveraging Node.js 24 and TypeScript 5.9. The backend is built with Express 5, utilizing PostgreSQL with Drizzle ORM for database management and Zod for validation. API interactions are standardized using OpenAPI with Orval for codegen. The frontend is a React application built with Vite, TailwindCSS for styling, and Wouter for routing.

## UI/UX Decisions
The frontend employs a consistent design with specific pages for each module (e.g., `/hr/dashboard`, `/logistics/lots-status`, `/crm/prospects`). Key UX features include:
- Kanban boards for CRM prospects and deals with drag-and-drop functionality.
- Dynamic forms and adaptive fiscal fields based on country for prospect management.
- Visual indicators like badges for stock levels (green, yellow, red, grey) and conversion status.
- Interactive charts (PieCharts, BarCharts) for dashboards (HR, CRM, Logistics AI).
- Modals for detailed views and actions (e.g., stock adjustment, lot history).
- Toasts (`sonner`) for user feedback on actions like conversion.
- Specific color schemes and icons (e.g., Workflow icon, ShieldAlert icon, Brain icon) to differentiate modules and features.

## Technical Implementations
- **Monorepo Structure**: pnpm workspaces for managing multiple packages.
- **API Contract**: Defined by `lib/api-spec/openapi.yaml`, serving as the single source of truth for API.
- **Data Layer**: PostgreSQL with Drizzle ORM for type-safe database interactions. Schemas are defined in `lib/db/src/schema/`.
- **API Generation**: Orval generates React Query hooks (`lib/api-client-react/`) and Zod schemas (`lib/api-zod/`) from the OpenAPI spec.
- **Build System**: esbuild for CJS bundle generation.
- **Authentication/Authorization**: User authentication with sessions managed in PostgreSQL (`user_sessions`). Role-Based Access Control (RBAC) with 5 distinct roles: SUPER_ADMIN, ACCOUNTANT, LOGISTICS_MANAGER, HR_MANAGER, COMMERCIAL.
- **Background Jobs**: Cron jobs for monthly payroll generation, daily lot risk recalculation, and daily AI predictions.
- **Error Handling**: Graceful error handling in AI models (e.g., returning heuristic fallback if ML model training fails).
- **Audit Trails**: Extensive logging for critical actions like lot status changes (`lot_histories`), conversion events (`conversion_logs`), and high-risk events (`risk_events`).

## Feature Specifications
- **HR Module**: Employee CRUD, CSV/XLSX import with fuzzy matching and deduplication, Madagascar-specific payroll calculation (CNAPS, OSTIE, IRSA), payroll batch processing, PDF payslip generation, declaration exports, and a comprehensive HR dashboard. Includes leaves, attendance, bonuses, candidates, and onboarding. **Departments system**: 8 departments seeded (IT/100, Logistique/101, Production/102, Commercial/103, RH/104, Comptabilité/105, Direction/106, Support/107). **Auto-matricule generation**: format AAAADDDNNNN (year + dept code 3-digit + 4-digit seq, e.g. 20261050001). Auto user account creation for eligible postes (Directeur Général, Directeur Adjoint, Business Developer, Commercial, Responsable Logistique, RH, Comptable). `PUT /api/employees/:id/status` endpoint for inline status changes.
- **Accounting Module**: Full PCG 2005 compliance with Journal entries, invoices, bank reconciliation, fixed assets management, balance sheet, income statement, and Madagascar TVA reports.
- **Planning Production & Export** (`/logistics/planning`): Complete connected planning module linking production tasks, vanilla lot stock, export orders, and employee leave. Features: 4 KPI cards (stock, orders, active tasks, alerts), stock-vs-orders coverage bar, 4 tabs (Calendar with colored events by type, Tasks CRUD with status workflow, Orders CRUD with ship+stock-deduct, Alerts with intelligent detection). Auto-schedule (`POST /api/planning/auto-schedule`) creates tasks for unmet orders. Link-orders (`POST /api/planning/link-orders`) assigns ready lots to pending orders. Shipping an order deducts lot stock. Calendar aggregates production tasks (blue), approved leaves (red), urgent orders (purple/red). Alerts detect: insufficient stock, urgent deadlines (≤7 days), overdue tasks. DB tables: `production_tasks`, `export_orders`, `task_assignments`.
- **Logistics Advanced**: Supplier and purchase management, lot tracking with a defined status workflow, stock movements (IN, OUT, LOSS), and AI-driven intelligence.
    - **AI Intelligence**: Price prediction using moving averages and linear trends, cost vs. price charts, and opportunity/drop alerts.
    - **Lot Costs**: Automated calculation of total lot costs (purchase + process + transport) with integrated journal entries.
    - **Product & Stock**: Product catalog with Excel import, live stock calculation with adjustment capabilities and role-based visibility (e.g., Commercial hides purchase prices).
    - **Vanilla Lot Status (STATUTS VANILLE)**: Workflow management with `raw` → `curing` → `drying` → `ready` → `sold` transitions. Server-side validation of transitions and real-time risk assessment (humidity, weight loss, age). Automated blocking of sales for high-risk or invalid lots.
    - **AI Advanced Vanilla (AI AVANCÉE VANILLE)**: ML-based risk classification using RandomForest, humidity/loss forecasting with SimpleLinearRegression, and integration of Madagascar rainy season boosts. Provides detailed predictions, risk event logging, and a dedicated AI dashboard with model status and alerts.
- **CRM Commercial**: Kanban and list views for prospects, deals, and leads. Multi-step forms with adaptive fiscal fields. Excel import/export. AI-driven scoring for leads. Quote management with workflow and conditional blocking. Activity logging. Email templates and automated reminders. Client management with rich fields and access restrictions.
    - **Conversion Engine**: Atomic Drizzle transactions for converting prospects to clients, migrating associated data, and generating audit logs. Supports manual, deal creation, and quote acceptance triggers. Includes risk-level assignment and conversion alerts/logs.

## System Design Choices
- **Event-Driven Automation**: Automated creation of lots, stock movements, and journal entries based on business events (e.g., `POST /api/purchases`).
- **Data Integrity**: Server-side business rules enforce data consistency (e.g., `sale` quantity validation against `lot` stock).
- **Scalability**: Monorepo structure supports independent development and deployment of modules.
- **Maintainability**: Clear separation of concerns with `lib/`, `artifacts/`, and `routes/` directories.
- **Security**: RBAC implementation for fine-grained control over features and data access.

# External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **API Framework**: Express 5
- **Frontend Framework**: React
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Routing**: Wouter
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API Codegen**: Orval
- **Monorepo Tool**: pnpm workspaces
- **Excel Processing**: SheetJS (`xlsx`)
- **File Uploads**: `multer`
- **Machine Learning**: `ml-random-forest`, `ml-regression-simple-linear`
- **PDF Generation**: HTML auto-print (for payslips)
- **Email**: Nodemailer (for reminders)
- **Session Management**: `connect-pg-simple`
- **Toast Notifications**: `sonner`
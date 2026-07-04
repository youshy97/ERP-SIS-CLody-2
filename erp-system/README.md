# Nexus ERP — Enterprise Project Lifecycle Management

Full-traceability ERP for an engineering / procurement / construction company:
**Intake → BOQ (versioned) → Approval Gate → Procurement → Warehouse → Execution → Finance → Closure.**

This is a working MVP, not a mockup: real PostgreSQL schema with triggers, a modular Express API
enforcing the business rules, and a role-based React dashboard.

## Stack

- **Database:** PostgreSQL (schema in `backend/db/schema.sql`) — versioning, soft deletes, audit triggers, traceability views
- **Backend:** Node.js / Express, modular monolith (`backend/src/modules/*`), JWT auth, Zod validation
- **Frontend:** React (Vite) + Tailwind, role-based dashboard, Recharts

## 1. Start PostgreSQL

```bash
docker compose up -d
```

This starts Postgres on `localhost:5432` with db `erp_db` / user `erp_user` / pass `erp_pass`.
(No Docker? Point `DATABASE_URL` at any Postgres 14+ instance instead.)

## 2. Load the schema + seed data

```bash
psql postgresql://erp_user:erp_pass@localhost:5432/erp_db -f backend/db/schema.sql
psql postgresql://erp_user:erp_pass@localhost:5432/erp_db -f backend/db/seed.sql
```

This creates every table/trigger/view and seeds one admin login:
`admin@erp.local` / `Admin@12345` — **change this password after first login.**

## 3. Run the backend

```bash
cd backend
cp .env.example .env      # edit DATABASE_URL / JWT_SECRET if needed
npm install
npm run dev                # http://localhost:4000
```

## 4. Run the frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173, proxies /api -> :4000
```

Log in with the seed admin, then use `POST /api/auth/register` (as admin/management) to create
real users for each role: `project_manager`, `project_controller`, `department_manager`,
`management`, `site_engineer`, `warehouse_officer`, `finance_officer`.

## Architecture notes

**Why this shape:**

- **BOQ is a separate versioned entity, never overwritten in place.** Every reprice or scope
  change creates a new `boqs` row (`parent_boq_id` links it to what it supersedes), tagged
  `minor`/`major`, with a required reason. Old versions are marked `superseded`, never deleted.
- **The approval gate is enforced server-side, not just in the UI.** `POST /boq/:id/send-to-customer`
  hard-checks `status = 'approved'` in the database before allowing it — a BOQ literally cannot
  reach "sent" without going through `project_controller` review + `management` approval first.
- **Traceability is a foreign-key chain, not a convention.** `boq_items.pr_id/po_id` and the
  `PO → GRN → stock → material_issues` chain are real FKs, queryable in one shot via the
  `v_item_traceability` view (`GET /api/warehouse/traceability/:boqItemId`).
- **No hard deletes anywhere.** Every table has `deleted_at`; every mutating write goes through
  `withAudit()`, which sets Postgres session variables that a DB-level trigger reads to write
  `audit_log` rows with who / when / why / what-changed — even if someone bypasses the API and
  writes SQL directly, the trigger still fires.
- **Warehouse is a mandatory choke point.** There is no code path from PO straight to a project;
  material must land in `grn` → pass inspection → become `stock` → get formally `issue`d.

## What's here vs. what's next

Implemented end-to-end: auth + roles, project CRUD, full BOQ versioning + approval workflow,
procurement (suppliers/PR/RFQ comparison/PO for local+international), warehouse (GRN/inspection/
stock/issue), execution phases + progress, finance (% payment schedules/invoices/payments),
role-based dashboards (employee/department/management), audit log query API.

Reasonable next increments for a v2: file/document attachments (customer proposals, supplier
quotes), email notifications on approval-gate events, a proper migration tool (the schema is
currently applied as one `.sql` file — fine for MVP, swap in `node-pg-migrate` or similar once
multiple environments exist), and pagination/filtering on the larger list endpoints.

-- =====================================================================
-- Enterprise Project Lifecycle ERP - PostgreSQL Schema
-- Engineering / Procurement / Construction
-- Design principles: soft-delete only, full audit trail, versioned BOQ,
-- strict traceability chain: BOQ -> PR -> PO -> GRN -> Stock -> Issue
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM (
  'employee', 'site_engineer', 'project_manager', 'project_controller',
  'department_manager', 'management', 'warehouse_officer', 'finance_officer', 'admin'
);

CREATE TYPE project_status AS ENUM (
  'intake', 'requirements_gathering', 'boq_preparation', 'internal_review',
  'management_approval', 'customer_proposal', 'customer_response',
  'repricing', 'procurement', 'execution', 'invoicing', 'closed', 'cancelled'
);

CREATE TYPE boq_status AS ENUM (
  'draft', 'review', 'sent', 'approved', 'rejected', 'repricing', 'superseded'
);

CREATE TYPE boq_change_type AS ENUM ('minor', 'major');

CREATE TYPE pr_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'converted_to_po', 'cancelled');
CREATE TYPE po_status AS ENUM ('draft', 'issued', 'partially_received', 'received', 'closed', 'cancelled');
CREATE TYPE po_type AS ENUM ('local', 'international');

CREATE TYPE grn_status AS ENUM ('pending_inspection', 'accepted', 'rejected', 'partially_accepted');

CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE approval_entity AS ENUM ('boq', 'pr', 'po', 'invoice', 'change_order');

CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled');

CREATE TYPE phase_status AS ENUM ('not_started', 'in_progress', 'delayed', 'completed', 'on_hold');

-- ---------------------------------------------------------------------
-- USERS & ROLES
-- ---------------------------------------------------------------------
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  department VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- soft delete, no hard deletes anywhere in this system
);

-- ---------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(150),
  contact_email VARCHAR(150),
  contact_phone VARCHAR(50),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- 1) PROJECT MODULE (root entity)
-- ---------------------------------------------------------------------
CREATE TABLE projects (
  project_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_code VARCHAR(50) UNIQUE NOT NULL,
  project_name VARCHAR(250) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(customer_id),  -- single customer per project
  beneficiary VARCHAR(200),
  contact_info TEXT,
  received_date DATE,
  description TEXT,
  status project_status NOT NULL DEFAULT 'intake',
  project_manager_id UUID REFERENCES users(user_id),
  project_controller_id UUID REFERENCES users(user_id),
  department_manager_id UUID REFERENCES users(user_id),
  exchange_rate NUMERIC(14,6) NOT NULL DEFAULT 1,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  contract_value NUMERIC(18,2),
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_projects_status ON projects(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_customer ON projects(customer_id);

-- ---------------------------------------------------------------------
-- 2) BOQ MODULE (versioned, linked - not embedded)
-- ---------------------------------------------------------------------
CREATE TABLE boqs (
  boq_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(project_id),
  version INT NOT NULL,
  status boq_status NOT NULL DEFAULT 'draft',
  change_type boq_change_type,             -- minor/major relative to previous version
  parent_boq_id UUID REFERENCES boqs(boq_id),  -- link to the version it supersedes
  total_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_selling NUMERIC(18,2) NOT NULL DEFAULT 0,
  profit NUMERIC(18,2) GENERATED ALWAYS AS (total_selling - total_cost) STORED,
  exchange_rate NUMERIC(14,6) NOT NULL DEFAULT 1,
  reason_for_version TEXT,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(project_id, version)
);

CREATE INDEX idx_boqs_project ON boqs(project_id);

CREATE TABLE boq_sections (
  section_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  boq_id UUID NOT NULL REFERENCES boqs(boq_id) ON DELETE CASCADE,
  section_name VARCHAR(150) NOT NULL, -- Materials / Civil Works / Logistics / Installation / custom
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE boq_items (
  item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_id UUID NOT NULL REFERENCES boq_sections(section_id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit VARCHAR(30),
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  selling_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  profit_percent NUMERIC(7,3) GENERATED ALWAYS AS (
    CASE WHEN selling_price = 0 THEN 0
    ELSE ROUND(((selling_price - unit_cost) / NULLIF(selling_price,0)) * 100, 3) END
  ) STORED,
  line_total_cost NUMERIC(18,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  line_total_selling NUMERIC(18,2) GENERATED ALWAYS AS (quantity * selling_price) STORED,
  supplier_id UUID,  -- FK added after suppliers table defined
  pr_id UUID,        -- FK added after PR table defined
  po_id UUID,        -- FK added after PO table defined
  status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending/sourced/ordered/received/issued
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_boq_items_section ON boq_items(section_id);

-- ---------------------------------------------------------------------
-- 3) PROCUREMENT MODULE
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
  supplier_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_name VARCHAR(200) NOT NULL,
  supplier_type VARCHAR(20) NOT NULL DEFAULT 'local', -- local / international
  contact_person VARCHAR(150),
  contact_email VARCHAR(150),
  contact_phone VARCHAR(50),
  country VARCHAR(100),
  rating NUMERIC(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE boq_items ADD CONSTRAINT fk_boq_item_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id);

CREATE TABLE purchase_requests (
  pr_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pr_code VARCHAR(50) UNIQUE NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(project_id),
  boq_item_id UUID NOT NULL REFERENCES boq_items(item_id),
  status pr_status NOT NULL DEFAULT 'draft',
  quantity_requested NUMERIC(14,3) NOT NULL,
  requested_by UUID REFERENCES users(user_id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE boq_items ADD CONSTRAINT fk_boq_item_pr FOREIGN KEY (pr_id) REFERENCES purchase_requests(pr_id);

CREATE TABLE comparison_sheets (
  comparison_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pr_id UUID NOT NULL REFERENCES purchase_requests(pr_id),
  supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id),
  quoted_price NUMERIC(18,4) NOT NULL,
  lead_time_days INT,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_orders (
  po_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_code VARCHAR(50) UNIQUE NOT NULL,
  pr_id UUID NOT NULL REFERENCES purchase_requests(pr_id),
  project_id UUID NOT NULL REFERENCES projects(project_id),
  supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id),
  po_type po_type NOT NULL DEFAULT 'local',
  status po_status NOT NULL DEFAULT 'draft',
  quantity_ordered NUMERIC(14,3) NOT NULL,
  unit_price NUMERIC(18,4) NOT NULL,
  total_value NUMERIC(18,2) GENERATED ALWAYS AS (quantity_ordered * unit_price) STORED,
  expected_delivery_date DATE,
  issued_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE boq_items ADD CONSTRAINT fk_boq_item_po FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id);

-- ---------------------------------------------------------------------
-- 4) WAREHOUSE MODULE (single central warehouse)
-- PO -> GRN -> Inspection -> Stock -> Issue to Project
-- ---------------------------------------------------------------------
CREATE TABLE grn (
  grn_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grn_code VARCHAR(50) UNIQUE NOT NULL,
  po_id UUID NOT NULL REFERENCES purchase_orders(po_id),
  quantity_received NUMERIC(14,3) NOT NULL,
  status grn_status NOT NULL DEFAULT 'pending_inspection',
  received_by UUID REFERENCES users(user_id),
  inspected_by UUID REFERENCES users(user_id),
  inspection_notes TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  inspected_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE stock (
  stock_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  boq_item_id UUID NOT NULL REFERENCES boq_items(item_id),
  grn_id UUID NOT NULL REFERENCES grn(grn_id),
  quantity_available NUMERIC(14,3) NOT NULL DEFAULT 0,
  location VARCHAR(100) DEFAULT 'Main Warehouse',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE material_issues (
  issue_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_code VARCHAR(50) UNIQUE NOT NULL,
  stock_id UUID NOT NULL REFERENCES stock(stock_id),
  project_id UUID NOT NULL REFERENCES projects(project_id),
  quantity_issued NUMERIC(14,3) NOT NULL,
  issued_by UUID REFERENCES users(user_id),
  received_by_site UUID REFERENCES users(user_id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  deleted_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- 5) EXECUTION MODULE (internal execution only, no subcontractors)
-- ---------------------------------------------------------------------
CREATE TABLE execution_phases (
  phase_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(project_id),
  phase_name VARCHAR(150) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status phase_status NOT NULL DEFAULT 'not_started',
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  planned_start DATE,
  planned_end DATE,
  actual_start DATE,
  actual_end DATE,
  site_engineer_id UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE progress_updates (
  update_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phase_id UUID NOT NULL REFERENCES execution_phases(phase_id),
  progress_percent NUMERIC(5,2) NOT NULL,
  notes TEXT,
  updated_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6) FINANCE MODULE (percentage-of-contract payment plans)
-- ---------------------------------------------------------------------
CREATE TABLE payment_schedules (
  schedule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(project_id),
  milestone_name VARCHAR(150) NOT NULL,   -- e.g. "Advance Payment", "On Delivery", "On Completion"
  percentage NUMERIC(5,2) NOT NULL CHECK (percentage BETWEEN 0 AND 100),
  due_date DATE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE invoices (
  invoice_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_code VARCHAR(50) UNIQUE NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(project_id),
  schedule_id UUID REFERENCES payment_schedules(schedule_id),
  amount NUMERIC(18,2) NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  issued_date DATE,
  due_date DATE,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE payments (
  payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(invoice_id),
  amount_paid NUMERIC(18,2) NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50),
  reference_no VARCHAR(100),
  recorded_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 7) APPROVAL SYSTEM (critical gate)
-- Project Controller = review only, Project Manager = execution/prep,
-- Management = final approval only. No BOQ goes to customer without it.
-- ---------------------------------------------------------------------
CREATE TABLE approvals (
  approval_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type approval_entity NOT NULL,
  entity_id UUID NOT NULL,           -- polymorphic ref to boq_id / pr_id / po_id / invoice_id
  requested_by UUID REFERENCES users(user_id),
  reviewed_by UUID REFERENCES users(user_id),      -- project_controller step
  approved_by UUID REFERENCES users(user_id),      -- management step (final authority)
  review_status approval_status NOT NULL DEFAULT 'pending',
  review_comment TEXT,
  final_status approval_status NOT NULL DEFAULT 'pending',
  final_comment TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ
);

CREATE INDEX idx_approvals_entity ON approvals(entity_type, entity_id);

-- ---------------------------------------------------------------------
-- 8) AUDIT LOG (mandatory, generic, append-only)
-- who / when / why / what changed, for every mutating action
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,        -- INSERT / UPDATE / SOFT_DELETE
  changed_by UUID REFERENCES users(user_id),
  reason TEXT,
  old_values JSONB,
  new_values JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON audit_log(changed_at);

-- Generic audit trigger function: logs INSERT/UPDATE at the row level.
-- App layer is responsible for setting `app.current_user_id` and
-- `app.change_reason` via SET LOCAL before each transaction so the
-- trigger can attribute the change (see backend/src/db/withAudit.js).
CREATE OR REPLACE FUNCTION fn_audit_trigger() RETURNS TRIGGER AS $$
DECLARE
  v_user UUID;
  v_reason TEXT;
BEGIN
  BEGIN
    v_user := current_setting('app.current_user_id', true)::UUID;
  EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  BEGIN
    v_reason := current_setting('app.change_reason', true);
  EXCEPTION WHEN OTHERS THEN v_reason := NULL; END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log(table_name, record_id, action, changed_by, reason, old_values, new_values)
    VALUES (TG_TABLE_NAME, (to_jsonb(NEW)->>(TG_ARGV[0]))::UUID, 'INSERT', v_user, v_reason, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log(table_name, record_id, action, changed_by, reason, old_values, new_values)
    VALUES (TG_TABLE_NAME, (to_jsonb(NEW)->>(TG_ARGV[0]))::UUID, 'UPDATE', v_user, v_reason, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach audit triggers to the critical traceability tables.
-- TG_ARGV[0] is the primary key column name (used to populate record_id).
CREATE TRIGGER trg_audit_projects AFTER INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger('project_id');
CREATE TRIGGER trg_audit_boqs AFTER INSERT OR UPDATE ON boqs
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger('boq_id');
CREATE TRIGGER trg_audit_boq_items AFTER INSERT OR UPDATE ON boq_items
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger('item_id');
CREATE TRIGGER trg_audit_purchase_requests AFTER INSERT OR UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger('pr_id');
CREATE TRIGGER trg_audit_purchase_orders AFTER INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger('po_id');
CREATE TRIGGER trg_audit_grn AFTER INSERT OR UPDATE ON grn
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger('grn_id');
CREATE TRIGGER trg_audit_material_issues AFTER INSERT OR UPDATE ON material_issues
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger('issue_id');
CREATE TRIGGER trg_audit_invoices AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger('invoice_id');
CREATE TRIGGER trg_audit_approvals AFTER INSERT OR UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger('approval_id');
CREATE TRIGGER trg_audit_execution_phases AFTER INSERT OR UPDATE ON execution_phases
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger('phase_id');

-- ---------------------------------------------------------------------
-- updated_at auto-touch trigger (generic, reused across tables)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_projects BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_touch_boqs BEFORE UPDATE ON boqs FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_touch_boq_items BEFORE UPDATE ON boq_items FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_touch_pr BEFORE UPDATE ON purchase_requests FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_touch_po BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_touch_invoices BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_touch_phases BEFORE UPDATE ON execution_phases FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------
-- VIEW: full traceability chain, BOQ item -> PR -> PO -> GRN -> Stock -> Issue
-- ---------------------------------------------------------------------
CREATE VIEW v_item_traceability AS
SELECT
  bi.item_id, bi.description, bi.quantity AS boq_quantity,
  pr.pr_id, pr.pr_code, pr.status AS pr_status,
  po.po_id, po.po_code, po.status AS po_status, po.po_type,
  g.grn_id, g.grn_code, g.status AS grn_status, g.quantity_received,
  s.stock_id, s.quantity_available,
  mi.issue_id, mi.issue_code, mi.quantity_issued, mi.project_id AS issued_to_project
FROM boq_items bi
LEFT JOIN purchase_requests pr ON pr.pr_id = bi.pr_id
LEFT JOIN purchase_orders po ON po.po_id = bi.po_id
LEFT JOIN grn g ON g.po_id = po.po_id
LEFT JOIN stock s ON s.grn_id = g.grn_id AND s.boq_item_id = bi.item_id
LEFT JOIN material_issues mi ON mi.stock_id = s.stock_id;

-- ---------------------------------------------------------------------
-- VIEW: management dashboard summary per project
-- ---------------------------------------------------------------------
CREATE VIEW v_project_financial_summary AS
SELECT
  p.project_id, p.project_code, p.project_name, p.status,
  COALESCE(SUM(DISTINCT b.total_selling) FILTER (WHERE b.status = 'approved'), 0) AS approved_boq_value,
  COALESCE(SUM(i.amount) FILTER (WHERE i.status <> 'cancelled'), 0) AS total_invoiced,
  COALESCE(SUM(pay.amount_paid), 0) AS total_collected,
  COALESCE(SUM(i.amount) FILTER (WHERE i.status <> 'cancelled'), 0) - COALESCE(SUM(pay.amount_paid), 0) AS outstanding
FROM projects p
LEFT JOIN boqs b ON b.project_id = p.project_id AND b.deleted_at IS NULL
LEFT JOIN invoices i ON i.project_id = p.project_id AND i.deleted_at IS NULL
LEFT JOIN payments pay ON pay.invoice_id = i.invoice_id
GROUP BY p.project_id, p.project_code, p.project_name, p.status;

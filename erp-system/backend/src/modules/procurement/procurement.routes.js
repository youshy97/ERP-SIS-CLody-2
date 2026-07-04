const router = require('express').Router();
const { z } = require('zod');
const pool = require('../../db/pool');
const { withAudit } = require('../../db/withAudit');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

// ===================== SUPPLIERS =====================
router.get('/suppliers', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY supplier_name`);
  res.json(rows);
});

router.post('/suppliers', authorize('project_manager', 'project_controller', 'management'), async (req, res) => {
  const schema = z.object({
    supplierName: z.string().min(2),
    supplierType: z.enum(['local', 'international']).default('local'),
    contactPerson: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    country: z.string().optional(),
  });
  const d = schema.parse(req.body);
  const { rows } = await pool.query(
    `INSERT INTO suppliers (supplier_name, supplier_type, contact_person, contact_email, contact_phone, country)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [d.supplierName, d.supplierType, d.contactPerson, d.contactEmail, d.contactPhone, d.country]
  );
  res.status(201).json(rows[0]);
});

// ===================== PURCHASE REQUESTS =====================
router.get('/pr', async (req, res) => {
  const { projectId, status } = req.query;
  const conditions = ['pr.deleted_at IS NULL'];
  const params = [];
  if (projectId) { params.push(projectId); conditions.push(`pr.project_id = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`pr.status = $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT pr.*, bi.description AS item_description FROM purchase_requests pr
     JOIN boq_items bi ON bi.item_id = pr.boq_item_id
     WHERE ${conditions.join(' AND ')} ORDER BY pr.created_at DESC`,
    params
  );
  res.json(rows);
});

router.post('/pr', authorize('project_manager', 'project_controller'), async (req, res) => {
  const schema = z.object({
    prCode: z.string().min(2),
    projectId: z.string().uuid(),
    boqItemId: z.string().uuid(),
    quantityRequested: z.number().positive(),
    notes: z.string().optional(),
  });
  const d = schema.parse(req.body);

  const result = await withAudit({ userId: req.user.userId, reason: 'PR created from approved BOQ item' }, async (client) => {
    const pr = await client.query(
      `INSERT INTO purchase_requests (pr_code, project_id, boq_item_id, quantity_requested, requested_by, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,'submitted') RETURNING *`,
      [d.prCode, d.projectId, d.boqItemId, d.quantityRequested, req.user.userId, d.notes]
    );
    // link back to BOQ item for traceability
    await client.query(`UPDATE boq_items SET pr_id = $1, status = 'sourced' WHERE item_id = $2`, [pr.rows[0].pr_id, d.boqItemId]);
    return pr.rows[0];
  });

  res.status(201).json(result);
});

// ===================== COMPARISON SHEET (RFQ) =====================
router.post('/pr/:prId/comparison', authorize('project_manager', 'project_controller'), async (req, res) => {
  const schema = z.object({
    supplierId: z.string().uuid(),
    quotedPrice: z.number().positive(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    notes: z.string().optional(),
  });
  const d = schema.parse(req.body);
  const { rows } = await pool.query(
    `INSERT INTO comparison_sheets (pr_id, supplier_id, quoted_price, lead_time_days, notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.prId, d.supplierId, d.quotedPrice, d.leadTimeDays, d.notes]
  );
  res.status(201).json(rows[0]);
});

router.get('/pr/:prId/comparison', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cs.*, s.supplier_name FROM comparison_sheets cs
     JOIN suppliers s ON s.supplier_id = cs.supplier_id
     WHERE cs.pr_id = $1 ORDER BY cs.quoted_price ASC`,
    [req.params.prId]
  );
  res.json(rows);
});

// Select winning supplier from comparison sheet -> approves PR
router.post('/pr/:prId/select-supplier/:comparisonId', authorize('project_controller', 'management'), async (req, res) => {
  const result = await withAudit({ userId: req.user.userId, reason: 'Supplier selected from RFQ comparison' }, async (client) => {
    await client.query(`UPDATE comparison_sheets SET is_selected = FALSE WHERE pr_id = $1`, [req.params.prId]);
    await client.query(`UPDATE comparison_sheets SET is_selected = TRUE WHERE comparison_id = $1`, [req.params.comparisonId]);
    return client.query(`UPDATE purchase_requests SET status = 'approved' WHERE pr_id = $1 RETURNING *`, [req.params.prId]);
  });
  res.json(result.rows[0]);
});

// ===================== PURCHASE ORDERS =====================
router.get('/po', async (req, res) => {
  const { projectId, status, type } = req.query;
  const conditions = ['po.deleted_at IS NULL'];
  const params = [];
  if (projectId) { params.push(projectId); conditions.push(`po.project_id = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`po.status = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`po.po_type = $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT po.*, s.supplier_name FROM purchase_orders po
     JOIN suppliers s ON s.supplier_id = po.supplier_id
     WHERE ${conditions.join(' AND ')} ORDER BY po.created_at DESC`,
    params
  );
  res.json(rows);
});

router.post('/po', authorize('project_controller', 'management'), async (req, res) => {
  const schema = z.object({
    poCode: z.string().min(2),
    prId: z.string().uuid(),
    supplierId: z.string().uuid(),
    poType: z.enum(['local', 'international']),
    quantityOrdered: z.number().positive(),
    unitPrice: z.number().positive(),
    expectedDeliveryDate: z.string().optional(),
  });
  const d = schema.parse(req.body);

  const result = await withAudit({ userId: req.user.userId, reason: 'PO issued to selected supplier' }, async (client) => {
    const pr = await client.query(`SELECT * FROM purchase_requests WHERE pr_id = $1`, [d.prId]);
    if (!pr.rows[0]) throw Object.assign(new Error('PR not found'), { status: 404 });
    if (pr.rows[0].status !== 'approved') throw Object.assign(new Error('PR must be approved before a PO can be issued'), { status: 409 });

    const po = await client.query(
      `INSERT INTO purchase_orders
        (po_code, pr_id, project_id, supplier_id, po_type, status, quantity_ordered, unit_price, expected_delivery_date, issued_by)
       VALUES ($1,$2,$3,$4,$5,'issued',$6,$7,$8,$9) RETURNING *`,
      [d.poCode, d.prId, pr.rows[0].project_id, d.supplierId, d.poType, d.quantityOrdered, d.unitPrice, d.expectedDeliveryDate, req.user.userId]
    );

    await client.query(`UPDATE purchase_requests SET status = 'converted_to_po' WHERE pr_id = $1`, [d.prId]);
    await client.query(`UPDATE boq_items SET po_id = $1, status = 'ordered' WHERE item_id = $2`, [po.rows[0].po_id, pr.rows[0].boq_item_id]);
    return po.rows[0];
  });

  res.status(201).json(result);
});

module.exports = router;

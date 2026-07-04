const router = require('express').Router();
const { z } = require('zod');
const pool = require('../../db/pool');
const { withAudit } = require('../../db/withAudit');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

// ===================== GRN (Goods Receipt Note) =====================
// No direct delivery to project without a warehouse GRN entry - enforced here.
router.get('/grn', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT g.*, po.po_code, po.project_id FROM grn g
     JOIN purchase_orders po ON po.po_id = g.po_id
     WHERE g.deleted_at IS NULL ORDER BY g.received_at DESC`
  );
  res.json(rows);
});

router.post('/grn', authorize('warehouse_officer', 'project_controller'), async (req, res) => {
  const schema = z.object({
    grnCode: z.string().min(2),
    poId: z.string().uuid(),
    quantityReceived: z.number().positive(),
  });
  const d = schema.parse(req.body);

  const result = await withAudit({ userId: req.user.userId, reason: 'Goods received from supplier' }, async (client) => {
    const po = await client.query(`SELECT * FROM purchase_orders WHERE po_id = $1`, [d.poId]);
    if (!po.rows[0]) throw Object.assign(new Error('PO not found'), { status: 404 });

    const grn = await client.query(
      `INSERT INTO grn (grn_code, po_id, quantity_received, received_by, status)
       VALUES ($1,$2,$3,$4,'pending_inspection') RETURNING *`,
      [d.grnCode, d.poId, d.quantityReceived, req.user.userId]
    );

    const newPoStatus = d.quantityReceived >= po.rows[0].quantity_ordered ? 'received' : 'partially_received';
    await client.query(`UPDATE purchase_orders SET status = $1 WHERE po_id = $2`, [newPoStatus, d.poId]);
    return grn.rows[0];
  });

  res.status(201).json(result);
});

// Inspection step - required before goods become usable stock
router.post('/grn/:grnId/inspect', authorize('warehouse_officer', 'project_controller'), async (req, res) => {
  const schema = z.object({
    decision: z.enum(['accepted', 'rejected', 'partially_accepted']),
    notes: z.string().optional(),
    acceptedQuantity: z.number().nonnegative().optional(),
  });
  const d = schema.parse(req.body);

  const result = await withAudit({ userId: req.user.userId, reason: d.notes || 'GRN inspection' }, async (client) => {
    const grn = await client.query(
      `UPDATE grn SET status = $1, inspection_notes = $2, inspected_by = $3, inspected_at = now()
       WHERE grn_id = $4 RETURNING *`,
      [d.decision, d.notes, req.user.userId, req.params.grnId]
    );
    if (!grn.rows[0]) throw Object.assign(new Error('GRN not found'), { status: 404 });

    if (d.decision !== 'rejected') {
      const po = await client.query(`SELECT * FROM purchase_orders WHERE po_id = $1`, [grn.rows[0].po_id]);
      const pr = await client.query(`SELECT * FROM purchase_requests WHERE pr_id = $1`, [po.rows[0].pr_id]);
      const qty = d.acceptedQuantity ?? grn.rows[0].quantity_received;

      const stock = await client.query(
        `INSERT INTO stock (boq_item_id, grn_id, quantity_available) VALUES ($1,$2,$3) RETURNING *`,
        [pr.rows[0].boq_item_id, grn.rows[0].grn_id, qty]
      );
      await client.query(`UPDATE boq_items SET status = 'received' WHERE item_id = $1`, [pr.rows[0].boq_item_id]);
      return { grn: grn.rows[0], stock: stock.rows[0] };
    }
    return { grn: grn.rows[0] };
  });

  res.json(result);
});

// ===================== STOCK =====================
router.get('/stock', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT st.*, bi.description AS item_description
     FROM stock st JOIN boq_items bi ON bi.item_id = st.boq_item_id
     WHERE st.quantity_available > 0 ORDER BY st.created_at DESC`
  );
  res.json(rows);
});

// ===================== MATERIAL ISSUE (warehouse -> site) =====================
router.post('/issue', authorize('warehouse_officer', 'project_controller'), async (req, res) => {
  const schema = z.object({
    issueCode: z.string().min(2),
    stockId: z.string().uuid(),
    projectId: z.string().uuid(),
    quantityIssued: z.number().positive(),
    receivedBySite: z.string().uuid().optional(),
    notes: z.string().optional(),
  });
  const d = schema.parse(req.body);

  const result = await withAudit({ userId: req.user.userId, reason: 'Material issued to site' }, async (client) => {
    const stock = await client.query(`SELECT * FROM stock WHERE stock_id = $1 FOR UPDATE`, [d.stockId]);
    if (!stock.rows[0]) throw Object.assign(new Error('Stock record not found'), { status: 404 });
    if (Number(stock.rows[0].quantity_available) < d.quantityIssued) {
      throw Object.assign(new Error('Insufficient stock available'), { status: 409 });
    }

    const issue = await client.query(
      `INSERT INTO material_issues (issue_code, stock_id, project_id, quantity_issued, issued_by, received_by_site, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [d.issueCode, d.stockId, d.projectId, d.quantityIssued, req.user.userId, d.receivedBySite, d.notes]
    );

    await client.query(
      `UPDATE stock SET quantity_available = quantity_available - $1 WHERE stock_id = $2`,
      [d.quantityIssued, d.stockId]
    );
    await client.query(`UPDATE boq_items SET status = 'issued' WHERE item_id = $1`, [stock.rows[0].boq_item_id]);

    return issue.rows[0];
  });

  res.status(201).json(result);
});

// ===================== TRACEABILITY =====================
router.get('/traceability/:boqItemId', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM v_item_traceability WHERE item_id = $1`, [req.params.boqItemId]);
  res.json(rows);
});

module.exports = router;

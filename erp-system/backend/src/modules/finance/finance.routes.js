const router = require('express').Router();
const { z } = require('zod');
const pool = require('../../db/pool');
const { withAudit } = require('../../db/withAudit');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

// ===================== PAYMENT SCHEDULES (% of contract) =====================
router.get('/schedule/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM payment_schedules WHERE project_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
    [req.params.projectId]
  );
  res.json(rows);
});

router.post('/schedule', authorize('finance_officer', 'management'), async (req, res) => {
  const schema = z.object({
    projectId: z.string().uuid(),
    milestones: z.array(z.object({
      milestoneName: z.string().min(2),
      percentage: z.number().min(0).max(100),
      dueDate: z.string().optional(),
    })),
  });
  const d = schema.parse(req.body);

  const totalPct = d.milestones.reduce((sum, m) => sum + m.percentage, 0);
  if (totalPct > 100.01) {
    return res.status(400).json({ error: `Payment schedule percentages sum to ${totalPct}%, cannot exceed 100%` });
  }

  const result = await withAudit({ userId: req.user.userId, reason: 'Payment schedule defined' }, async (client) => {
    const inserted = [];
    for (const [idx, m] of d.milestones.entries()) {
      const row = await client.query(
        `INSERT INTO payment_schedules (project_id, milestone_name, percentage, due_date, sort_order)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [d.projectId, m.milestoneName, m.percentage, m.dueDate, idx]
      );
      inserted.push(row.rows[0]);
    }
    return inserted;
  });

  res.status(201).json(result);
});

// ===================== INVOICES =====================
router.get('/invoices/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, COALESCE(SUM(p.amount_paid),0) AS amount_paid
     FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.invoice_id
     WHERE i.project_id = $1 AND i.deleted_at IS NULL
     GROUP BY i.invoice_id ORDER BY i.created_at DESC`,
    [req.params.projectId]
  );
  res.json(rows);
});

router.post('/invoices', authorize('finance_officer', 'management'), async (req, res) => {
  const schema = z.object({
    invoiceCode: z.string().min(2),
    projectId: z.string().uuid(),
    scheduleId: z.string().uuid().optional(),
    amount: z.number().positive(),
    dueDate: z.string().optional(),
  });
  const d = schema.parse(req.body);

  const result = await withAudit({ userId: req.user.userId, reason: 'Invoice raised against contract milestone' }, (client) => client.query(
    `INSERT INTO invoices (invoice_code, project_id, schedule_id, amount, status, issued_date, due_date, created_by)
     VALUES ($1,$2,$3,$4,'issued',CURRENT_DATE,$5,$6) RETURNING *`,
    [d.invoiceCode, d.projectId, d.scheduleId, d.amount, d.dueDate, req.user.userId]
  ));

  res.status(201).json(result.rows[0]);
});

// ===================== PAYMENTS =====================
router.post('/payments', authorize('finance_officer', 'management'), async (req, res) => {
  const schema = z.object({
    invoiceId: z.string().uuid(),
    amountPaid: z.number().positive(),
    paidAt: z.string().optional(),
    paymentMethod: z.string().optional(),
    referenceNo: z.string().optional(),
  });
  const d = schema.parse(req.body);

  const result = await withAudit({ userId: req.user.userId, reason: 'Payment recorded' }, async (client) => {
    const payment = await client.query(
      `INSERT INTO payments (invoice_id, amount_paid, paid_at, payment_method, reference_no, recorded_by)
       VALUES ($1,$2,COALESCE($3,CURRENT_DATE),$4,$5,$6) RETURNING *`,
      [d.invoiceId, d.amountPaid, d.paidAt, d.paymentMethod, d.referenceNo, req.user.userId]
    );

    const totals = await client.query(
      `SELECT i.amount, COALESCE(SUM(p.amount_paid),0) AS paid
       FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.invoice_id
       WHERE i.invoice_id = $1 GROUP BY i.amount`,
      [d.invoiceId]
    );
    const { amount, paid } = totals.rows[0];
    const status = Number(paid) >= Number(amount) ? 'paid' : 'partially_paid';
    await client.query(`UPDATE invoices SET status = $1 WHERE invoice_id = $2`, [status, d.invoiceId]);

    return payment.rows[0];
  });

  res.status(201).json(result);
});

module.exports = router;

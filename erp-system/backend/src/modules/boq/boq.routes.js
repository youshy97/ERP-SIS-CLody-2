const router = require('express').Router();
const { z } = require('zod');
const pool = require('../../db/pool');
const { withAudit } = require('../../db/withAudit');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

// ---- List all BOQ versions for a project -------------------------------
router.get('/project/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM boqs WHERE project_id = $1 AND deleted_at IS NULL ORDER BY version DESC`,
    [req.params.projectId]
  );
  res.json(rows);
});

// ---- Get one BOQ version with full sections + items ----------------------
router.get('/:boqId', async (req, res) => {
  const boq = await pool.query(`SELECT * FROM boqs WHERE boq_id = $1 AND deleted_at IS NULL`, [req.params.boqId]);
  if (!boq.rows[0]) return res.status(404).json({ error: 'BOQ not found' });

  const sections = await pool.query(
    `SELECT * FROM boq_sections WHERE boq_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
    [req.params.boqId]
  );
  const items = await pool.query(
    `SELECT i.* FROM boq_items i
     JOIN boq_sections s ON s.section_id = i.section_id
     WHERE s.boq_id = $1 AND i.deleted_at IS NULL ORDER BY i.created_at`,
    [req.params.boqId]
  );

  const sectionsWithItems = sections.rows.map((s) => ({
    ...s,
    items: items.rows.filter((i) => i.section_id === s.section_id),
  }));

  res.json({ ...boq.rows[0], sections: sectionsWithItems });
});

const createBoqSchema = z.object({
  projectId: z.string().uuid(),
  sections: z.array(z.object({
    sectionName: z.string().min(1),
    items: z.array(z.object({
      description: z.string().min(1),
      unit: z.string().optional(),
      quantity: z.number().nonnegative(),
      unitCost: z.number().nonnegative(),
      sellingPrice: z.number().nonnegative(),
    })),
  })),
  exchangeRate: z.number().positive().optional(),
});

// ---- Create BOQ V1 (first version for a project) --------------------------
router.post('/', authorize('project_manager', 'project_controller'), async (req, res) => {
  const d = createBoqSchema.parse(req.body);

  const boq = await withAudit({ userId: req.user.userId, reason: 'Initial BOQ preparation' }, async (client) => {
    const existing = await client.query(
      `SELECT COALESCE(MAX(version),0) AS max_v FROM boqs WHERE project_id = $1`, [d.projectId]
    );
    if (existing.rows[0].max_v !== 0) {
      throw Object.assign(new Error('Project already has a BOQ. Use the new-version endpoint instead.'), { status: 409 });
    }

    const boqRow = await client.query(
      `INSERT INTO boqs (project_id, version, status, exchange_rate, created_by)
       VALUES ($1, 1, 'draft', $2, $3) RETURNING *`,
      [d.projectId, d.exchangeRate || 1, req.user.userId]
    );
    const boqId = boqRow.rows[0].boq_id;

    let totalCost = 0, totalSelling = 0;
    for (const [idx, section] of d.sections.entries()) {
      const sec = await client.query(
        `INSERT INTO boq_sections (boq_id, section_name, sort_order) VALUES ($1,$2,$3) RETURNING section_id`,
        [boqId, section.sectionName, idx]
      );
      for (const item of section.items) {
        await client.query(
          `INSERT INTO boq_items (section_id, description, unit, quantity, unit_cost, selling_price)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [sec.rows[0].section_id, item.description, item.unit || null, item.quantity, item.unitCost, item.sellingPrice]
        );
        totalCost += item.quantity * item.unitCost;
        totalSelling += item.quantity * item.sellingPrice;
      }
    }

    const updated = await client.query(
      `UPDATE boqs SET total_cost = $1, total_selling = $2 WHERE boq_id = $3 RETURNING *`,
      [totalCost, totalSelling, boqId]
    );
    return updated.rows[0];
  });

  res.status(201).json(boq);
});

const newVersionSchema = z.object({
  changeType: z.enum(['minor', 'major']),
  reasonForVersion: z.string().min(5),
  sections: z.array(z.object({
    sectionName: z.string().min(1),
    items: z.array(z.object({
      description: z.string().min(1),
      unit: z.string().optional(),
      quantity: z.number().nonnegative(),
      unitCost: z.number().nonnegative(),
      sellingPrice: z.number().nonnegative(),
    })),
  })),
});

// ---- Create a new BOQ version (repricing / scope change) ------------------
// Old version is marked 'superseded'; a full new version is created linked
// via parent_boq_id, preserving complete history (never overwrite in place).
router.post('/:boqId/new-version', authorize('project_manager', 'project_controller'), async (req, res) => {
  const d = newVersionSchema.parse(req.body);

  const result = await withAudit(
    { userId: req.user.userId, reason: d.reasonForVersion },
    async (client) => {
      const parent = await client.query(`SELECT * FROM boqs WHERE boq_id = $1`, [req.params.boqId]);
      if (!parent.rows[0]) throw Object.assign(new Error('Parent BOQ not found'), { status: 404 });

      await client.query(`UPDATE boqs SET status = 'superseded' WHERE boq_id = $1`, [req.params.boqId]);

      const newBoq = await client.query(
        `INSERT INTO boqs (project_id, version, status, change_type, parent_boq_id, exchange_rate, reason_for_version, created_by)
         VALUES ($1,$2,'draft',$3,$4,$5,$6,$7) RETURNING *`,
        [parent.rows[0].project_id, parent.rows[0].version + 1, d.changeType, req.params.boqId,
          parent.rows[0].exchange_rate, d.reasonForVersion, req.user.userId]
      );
      const boqId = newBoq.rows[0].boq_id;

      let totalCost = 0, totalSelling = 0;
      for (const [idx, section] of d.sections.entries()) {
        const sec = await client.query(
          `INSERT INTO boq_sections (boq_id, section_name, sort_order) VALUES ($1,$2,$3) RETURNING section_id`,
          [boqId, section.sectionName, idx]
        );
        for (const item of section.items) {
          await client.query(
            `INSERT INTO boq_items (section_id, description, unit, quantity, unit_cost, selling_price)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [sec.rows[0].section_id, item.description, item.unit || null, item.quantity, item.unitCost, item.sellingPrice]
          );
          totalCost += item.quantity * item.unitCost;
          totalSelling += item.quantity * item.sellingPrice;
        }
      }

      const updated = await client.query(
        `UPDATE boqs SET total_cost = $1, total_selling = $2 WHERE boq_id = $3 RETURNING *`,
        [totalCost, totalSelling, boqId]
      );
      return updated.rows[0];
    }
  );

  res.status(201).json(result);
});

// ---- Submit BOQ for internal review (Project Controller step) -------------
router.post('/:boqId/submit-review', authorize('project_manager'), async (req, res) => {
  const result = await withAudit(
    { userId: req.user.userId, reason: 'Submitted for internal review' },
    (client) => client.query(
      `UPDATE boqs SET status = 'review' WHERE boq_id = $1 AND status = 'draft' RETURNING *`,
      [req.params.boqId]
    )
  );
  if (!result.rows[0]) return res.status(409).json({ error: 'BOQ must be in draft status to submit for review' });

  await pool.query(
    `INSERT INTO approvals (entity_type, entity_id, requested_by) VALUES ('boq', $1, $2)`,
    [req.params.boqId, req.user.userId]
  );

  res.json(result.rows[0]);
});

// ---- CRITICAL GATE: BOQ cannot go to customer without Management approval --
// Two-step: Project Controller reviews, Management gives final approval.
router.post('/:boqId/review', authorize('project_controller'), async (req, res) => {
  const { decision, comment } = req.body; // decision: 'approved' | 'rejected'
  await pool.query(
    `UPDATE approvals SET review_status = $1, review_comment = $2, reviewed_by = $3, reviewed_at = now()
     WHERE entity_type = 'boq' AND entity_id = $4 AND review_status = 'pending'`,
    [decision, comment, req.user.userId, req.params.boqId]
  );
  if (decision === 'rejected') {
    await pool.query(`UPDATE boqs SET status = 'rejected' WHERE boq_id = $1`, [req.params.boqId]);
  }
  res.json({ success: true });
});

router.post('/:boqId/approve', authorize('management'), async (req, res) => {
  const { decision, comment } = req.body; // decision: 'approved' | 'rejected'

  const result = await withAudit(
    { userId: req.user.userId, reason: comment || 'Management approval decision' },
    async (client) => {
      await client.query(
        `UPDATE approvals SET final_status = $1, final_comment = $2, approved_by = $3, approved_at = now()
         WHERE entity_type = 'boq' AND entity_id = $4 AND final_status = 'pending'`,
        [decision, comment, req.user.userId, req.params.boqId]
      );
      const newStatus = decision === 'approved' ? 'approved' : 'rejected';
      return client.query(
        `UPDATE boqs SET status = $1 WHERE boq_id = $2 RETURNING *`,
        [newStatus, req.params.boqId]
      );
    }
  );

  res.json(result.rows[0]);
});

// ---- Mark BOQ as sent to customer (only allowed once approved) ------------
router.post('/:boqId/send-to-customer', authorize('project_manager'), async (req, res) => {
  const check = await pool.query(`SELECT status FROM boqs WHERE boq_id = $1`, [req.params.boqId]);
  if (!check.rows[0]) return res.status(404).json({ error: 'BOQ not found' });
  if (check.rows[0].status !== 'approved') {
    return res.status(403).json({ error: 'BOQ must have Management approval before it can be sent to the customer.' });
  }
  const result = await withAudit(
    { userId: req.user.userId, reason: 'Sent to customer' },
    (client) => client.query(`UPDATE boqs SET status = 'sent' WHERE boq_id = $1 RETURNING *`, [req.params.boqId])
  );
  res.json(result.rows[0]);
});

module.exports = router;

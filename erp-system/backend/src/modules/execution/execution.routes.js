const router = require('express').Router();
const { z } = require('zod');
const pool = require('../../db/pool');
const { withAudit } = require('../../db/withAudit');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

router.get('/phases/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ep.*, u.full_name AS site_engineer_name FROM execution_phases ep
     LEFT JOIN users u ON u.user_id = ep.site_engineer_id
     WHERE ep.project_id = $1 AND ep.deleted_at IS NULL ORDER BY ep.sort_order`,
    [req.params.projectId]
  );
  res.json(rows);
});

router.post('/phases', authorize('project_manager', 'department_manager'), async (req, res) => {
  const schema = z.object({
    projectId: z.string().uuid(),
    phaseName: z.string().min(2),
    sortOrder: z.number().int().default(0),
    plannedStart: z.string().optional(),
    plannedEnd: z.string().optional(),
    siteEngineerId: z.string().uuid().optional(),
  });
  const d = schema.parse(req.body);
  const result = await withAudit({ userId: req.user.userId, reason: 'Execution phase created' }, (client) => client.query(
    `INSERT INTO execution_phases (project_id, phase_name, sort_order, planned_start, planned_end, site_engineer_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [d.projectId, d.phaseName, d.sortOrder, d.plannedStart, d.plannedEnd, d.siteEngineerId]
  ));
  res.status(201).json(result.rows[0]);
});

// Site Engineer submits progress; Project Controller/Dept Manager is final authority on record
router.post('/phases/:phaseId/progress', authorize('site_engineer', 'project_manager', 'department_manager'), async (req, res) => {
  const schema = z.object({
    progressPercent: z.number().min(0).max(100),
    notes: z.string().optional(),
  });
  const d = schema.parse(req.body);

  const result = await withAudit({ userId: req.user.userId, reason: d.notes || 'Progress update' }, async (client) => {
    await client.query(
      `INSERT INTO progress_updates (phase_id, progress_percent, notes, updated_by) VALUES ($1,$2,$3,$4)`,
      [req.params.phaseId, d.progressPercent, d.notes, req.user.userId]
    );
    const status = d.progressPercent >= 100 ? 'completed' : d.progressPercent > 0 ? 'in_progress' : 'not_started';
    return client.query(
      `UPDATE execution_phases SET progress_percent = $1::numeric, status = $2,
         actual_start = COALESCE(actual_start, CASE WHEN $1::numeric > 0 THEN CURRENT_DATE END),
         actual_end = CASE WHEN $1::numeric >= 100 THEN CURRENT_DATE ELSE actual_end END
       WHERE phase_id = $3 RETURNING *`,
      [d.progressPercent, status, req.params.phaseId]
    );
  });

  res.json(result.rows[0]);
});

module.exports = router;

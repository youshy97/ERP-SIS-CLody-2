const router = require('express').Router();
const { z } = require('zod');
const pool = require('../../db/pool');
const { withAudit } = require('../../db/withAudit');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

// ---- List / filter projects -------------------------------------------------
router.get('/', async (req, res) => {
  const { status, customerId, search } = req.query;
  const conditions = ['p.deleted_at IS NULL'];
  const params = [];

  if (status) { params.push(status); conditions.push(`p.status = $${params.length}`); }
  if (customerId) { params.push(customerId); conditions.push(`p.customer_id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conditions.push(`(p.project_name ILIKE $${params.length} OR p.project_code ILIKE $${params.length})`); }

  const { rows } = await pool.query(
    `SELECT p.*, c.customer_name
     FROM projects p JOIN customers c ON c.customer_id = p.customer_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.created_at DESC`,
    params
  );
  res.json(rows);
});

// ---- Get single project with rollup info ------------------------------------
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, c.customer_name FROM projects p
     JOIN customers c ON c.customer_id = p.customer_id
     WHERE p.project_id = $1 AND p.deleted_at IS NULL`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Project not found' });

  const boqs = await pool.query(
    `SELECT boq_id, version, status, total_cost, total_selling, profit, created_at
     FROM boqs WHERE project_id = $1 AND deleted_at IS NULL ORDER BY version DESC`,
    [req.params.id]
  );
  const phases = await pool.query(
    `SELECT phase_id, phase_name, status, progress_percent FROM execution_phases
     WHERE project_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
    [req.params.id]
  );

  res.json({ ...rows[0], boqVersions: boqs.rows, executionPhases: phases.rows });
});

const createSchema = z.object({
  projectCode: z.string().min(2),
  projectName: z.string().min(2),
  customerId: z.string().uuid(),
  beneficiary: z.string().optional(),
  contactInfo: z.string().optional(),
  receivedDate: z.string().optional(),
  description: z.string().optional(),
  projectManagerId: z.string().uuid().optional(),
  projectControllerId: z.string().uuid().optional(),
  exchangeRate: z.number().positive().optional(),
  currency: z.string().optional(),
  contractValue: z.number().nonnegative().optional(),
});

// ---- Create project (Project Manager / Controller / Management / Admin) -----
router.post('/', authorize('project_manager', 'project_controller', 'management'), async (req, res) => {
  const d = createSchema.parse(req.body);

  const result = await withAudit(
    { userId: req.user.userId, reason: 'Project intake' },
    (client) => client.query(
      `INSERT INTO projects
        (project_code, project_name, customer_id, beneficiary, contact_info, received_date,
         description, project_manager_id, project_controller_id, exchange_rate, currency,
         contract_value, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [d.projectCode, d.projectName, d.customerId, d.beneficiary, d.contactInfo, d.receivedDate,
        d.description, d.projectManagerId, d.projectControllerId, d.exchangeRate || 1,
        d.currency || 'USD', d.contractValue, req.user.userId]
    )
  );

  res.status(201).json(result.rows[0]);
});

const updateSchema = createSchema.partial().extend({
  status: z.enum([
    'intake', 'requirements_gathering', 'boq_preparation', 'internal_review',
    'management_approval', 'customer_proposal', 'customer_response',
    'repricing', 'procurement', 'execution', 'invoicing', 'closed', 'cancelled',
  ]).optional(),
  reason: z.string().min(3, 'A reason is required for any project change (audit trail).'),
});

// ---- Update project (lifecycle status, assignments, etc.) -------------------
router.patch('/:id', authorize('project_manager', 'project_controller', 'management'), async (req, res) => {
  const d = updateSchema.parse(req.body);
  const fields = [];
  const params = [];
  const map = {
    projectName: 'project_name', beneficiary: 'beneficiary', contactInfo: 'contact_info',
    description: 'description', status: 'status', projectManagerId: 'project_manager_id',
    projectControllerId: 'project_controller_id', exchangeRate: 'exchange_rate',
    contractValue: 'contract_value',
  };
  for (const [key, col] of Object.entries(map)) {
    if (d[key] !== undefined) { params.push(d[key]); fields.push(`${col} = $${params.length}`); }
  }
  if (!fields.length) return res.status(400).json({ error: 'No updatable fields provided' });
  params.push(req.params.id);

  const result = await withAudit(
    { userId: req.user.userId, reason: d.reason },
    (client) => client.query(
      `UPDATE projects SET ${fields.join(', ')} WHERE project_id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params
    )
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' });
  res.json(result.rows[0]);
});

// ---- Soft delete / cancel project (no hard delete ever) ---------------------
router.delete('/:id', authorize('management', 'admin'), async (req, res) => {
  const reason = req.body?.reason || 'Project cancelled/archived';
  const result = await withAudit(
    { userId: req.user.userId, reason },
    (client) => client.query(
      `UPDATE projects SET deleted_at = now(), status = 'cancelled' WHERE project_id = $1 RETURNING project_id`,
      [req.params.id]
    )
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' });
  res.json({ success: true });
});

module.exports = router;

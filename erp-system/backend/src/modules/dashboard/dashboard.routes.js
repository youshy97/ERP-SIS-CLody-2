const router = require('express').Router();
const pool = require('../../db/pool');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

// ---- Employee (daily): my tasks / alerts -----------------------------------
router.get('/employee', async (req, res) => {
  const phases = await pool.query(
    `SELECT ep.*, p.project_name FROM execution_phases ep
     JOIN projects p ON p.project_id = ep.project_id
     WHERE ep.site_engineer_id = $1 AND ep.deleted_at IS NULL AND ep.status <> 'completed'
     ORDER BY ep.planned_end ASC NULLS LAST`,
    [req.user.userId]
  );
  const pendingApprovals = await pool.query(
    `SELECT * FROM approvals WHERE requested_by = $1 AND final_status = 'pending' ORDER BY requested_at DESC`,
    [req.user.userId]
  );
  res.json({ myPhases: phases.rows, myPendingApprovals: pendingApprovals.rows });
});

// ---- Department (weekly): progress, BOQ changes, procurement status -------
router.get('/department', authorize('project_controller', 'department_manager', 'management'), async (req, res) => {
  const progress = await pool.query(
    `SELECT p.project_id, p.project_name, p.status,
            AVG(ep.progress_percent) AS avg_progress
     FROM projects p LEFT JOIN execution_phases ep ON ep.project_id = p.project_id AND ep.deleted_at IS NULL
     WHERE p.deleted_at IS NULL GROUP BY p.project_id, p.project_name, p.status
     ORDER BY p.project_name`
  );
  const boqChanges = await pool.query(
    `SELECT b.boq_id, b.project_id, p.project_name, b.version, b.change_type, b.status, b.created_at
     FROM boqs b JOIN projects p ON p.project_id = b.project_id
     WHERE b.deleted_at IS NULL ORDER BY b.created_at DESC LIMIT 20`
  );
  const procurementStatus = await pool.query(
    `SELECT status, COUNT(*) AS count FROM purchase_orders WHERE deleted_at IS NULL GROUP BY status`
  );
  res.json({ progressByProject: progress.rows, recentBoqChanges: boqChanges.rows, procurementStatus: procurementStatus.rows });
});

// ---- Management (real-time + monthly): revenue, profit, cash flow, risk ---
router.get('/management', authorize('management', 'admin'), async (req, res) => {
  const financials = await pool.query(`SELECT * FROM v_project_financial_summary ORDER BY outstanding DESC`);

  const revenueAndProfit = await pool.query(
    `SELECT SUM(total_selling) AS total_revenue_pipeline, SUM(profit) AS total_profit_pipeline
     FROM boqs WHERE status = 'approved' AND deleted_at IS NULL`
  );

  const cashFlow = await pool.query(
    `SELECT date_trunc('month', paid_at) AS month, SUM(amount_paid) AS collected
     FROM payments GROUP BY 1 ORDER BY 1 DESC LIMIT 12`
  );

  const projectStatus = await pool.query(
    `SELECT status, COUNT(*) AS count FROM projects WHERE deleted_at IS NULL GROUP BY status`
  );

  // Simple delay/risk indicator: phases past planned_end but not completed
  const delays = await pool.query(
    `SELECT ep.phase_id, ep.phase_name, p.project_name, ep.planned_end, ep.progress_percent
     FROM execution_phases ep JOIN projects p ON p.project_id = ep.project_id
     WHERE ep.deleted_at IS NULL AND ep.status <> 'completed' AND ep.planned_end < CURRENT_DATE
     ORDER BY ep.planned_end ASC`
  );

  res.json({
    projectFinancials: financials.rows,
    revenueAndProfit: revenueAndProfit.rows[0],
    monthlyCashFlow: cashFlow.rows,
    projectStatusBreakdown: projectStatus.rows,
    delayedPhases: delays.rows,
  });
});

module.exports = router;

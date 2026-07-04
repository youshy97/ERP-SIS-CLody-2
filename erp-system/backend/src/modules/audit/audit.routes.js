const router = require('express').Router();
const pool = require('../../db/pool');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

// Full audit history for a specific record (e.g. a BOQ, PO, invoice...)
router.get('/:tableName/:recordId', authorize('project_controller', 'department_manager', 'management', 'admin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, u.full_name AS changed_by_name
     FROM audit_log a LEFT JOIN users u ON u.user_id = a.changed_by
     WHERE a.table_name = $1 AND a.record_id = $2
     ORDER BY a.changed_at DESC`,
    [req.params.tableName, req.params.recordId]
  );
  res.json(rows);
});

module.exports = router;

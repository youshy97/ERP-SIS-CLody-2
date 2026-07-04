const pool = require('./pool');

/**
 * Runs `fn(client)` inside a transaction, first setting the local
 * session variables that the `fn_audit_trigger()` DB trigger reads:
 *   app.current_user_id  -> who made the change
 *   app.change_reason    -> why (free text, e.g. "BOQ repricing after customer rejection")
 *
 * Every write inside modules/* should go through this so the mandatory
 * audit trail (who / when / why / what changed) is always populated.
 */
async function withAudit({ userId, reason }, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', userId || '']);
    await client.query('SELECT set_config($1, $2, true)', ['app.change_reason', reason || '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withAudit };

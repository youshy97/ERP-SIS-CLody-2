function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }

  if (err.code === '23505') { // unique_violation
    return res.status(409).json({ error: 'Duplicate record', detail: err.detail });
  }
  if (err.code === '23503') { // foreign_key_violation
    return res.status(409).json({ error: 'Related record not found / referenced elsewhere', detail: err.detail });
  }
  if (err.code === '23514') { // check_violation
    return res.status(400).json({ error: 'Invalid value', detail: err.detail });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
}

module.exports = errorHandler;

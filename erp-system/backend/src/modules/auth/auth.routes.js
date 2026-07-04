const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const pool = require('../../db/pool');
const { authenticate, authorize } = require('../../middleware/auth');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const { rows } = await pool.query(
    `SELECT user_id, full_name, email, password_hash, role, is_active
     FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );
  const user = rows[0];
  if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { userId: user.user_id, role: user.role, fullName: user.full_name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  res.json({ token, user: { id: user.user_id, name: user.full_name, email: user.email, role: user.role } });
});

const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum([
    'employee', 'site_engineer', 'project_manager', 'project_controller',
    'department_manager', 'management', 'warehouse_officer', 'finance_officer', 'admin',
  ]),
  department: z.string().optional(),
});

// Only admins/management create new accounts - no public self-signup for an internal ERP
router.post('/register', authenticate, authorize('admin', 'management'), async (req, res) => {
  const data = registerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 10);

  const { rows } = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role, department)
     VALUES ($1,$2,$3,$4,$5) RETURNING user_id, full_name, email, role`,
    [data.fullName, data.email, passwordHash, data.role, data.department || null]
  );

  res.status(201).json(rows[0]);
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;

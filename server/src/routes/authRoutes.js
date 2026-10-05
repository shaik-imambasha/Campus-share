const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { auth, sign } = require('../middleware/auth');

const router = express.Router();
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (message, status = 400, code = 'BAD_REQUEST') => Object.assign(new Error(message), { status, code });
const emailRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dummyHash = bcrypt.hashSync('campusshare-invalid-login-password', 12);
const validEmail = value => typeof value === 'string' && value.length <= 255 && emailRE.test(value.trim());
const publicUser = user => ({
  id: user.id, name: user.name, email: user.email, college: user.college,
  department: user.department, year: user.year, hostel: user.hostel,
  role: user.role, status: user.status, auth_version: user.auth_version,
});

router.post('/register', asyncRoute(async (req, res) => {
  const { name, email, password, college, department, year, hostel } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) throw fail('Name must be between 2 and 120 characters.');
  if (!validEmail(email)) throw fail('Enter a valid email address.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) throw fail('Password must be 8–72 characters.');
  if (typeof college !== 'string' || college.trim().length < 2 || college.trim().length > 160) throw fail('Enter your college or campus.');
  if (department !== undefined && (typeof department !== 'string' || department.length > 160)) throw fail('Department must be 160 characters or fewer.');
  if (year !== undefined && year !== '' && (!Number.isInteger(Number(year)) || Number(year) < 1 || Number(year) > 6)) throw fail('Year must be between 1 and 6.');
  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    const { rows } = await pool.query(
      `INSERT INTO users(name,email,password_hash,college,department,year,hostel)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,name,email,college,department,year,hostel,role,status,auth_version`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, college.trim(), department?.trim() || null, year || null, hostel?.trim() || null],
    );
    user = rows[0];
  } catch (error) {
    if (error.code === '23505') throw fail('An account may already exist for that email. Try signing in.', 409, 'ACCOUNT_EXISTS');
    throw error;
  }
  const safeUser = publicUser(user);
  res.status(201).json({ success: true, user: safeUser, token: sign(safeUser) });
}));

router.post('/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  if (!validEmail(email) || typeof password !== 'string' || password.length < 1 || password.length > 72) throw fail('Incorrect email or password.', 401, 'INVALID_CREDENTIALS');
  const { rows } = await pool.query(
    `SELECT id,name,email,password_hash,college,department,year,hostel,role,status,auth_version
       FROM users WHERE email=$1`, [email.trim().toLowerCase()],
  );
  const candidate = rows[0];
  const matched = await bcrypt.compare(password || '', candidate?.password_hash || dummyHash);
  if (!candidate || !matched || candidate.status !== 'active') throw fail('Incorrect email or password.', 401, 'INVALID_CREDENTIALS');
  const user = publicUser(candidate);
  res.json({ success: true, user, token: sign(user) });
}));

router.get('/me', auth, (req, res) => res.json({ user: req.user }));
module.exports = router;

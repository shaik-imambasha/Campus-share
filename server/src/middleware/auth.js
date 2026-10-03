const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
function sign(user) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw Object.assign(new Error('JWT_SECRET must be at least 32 characters.'), { status: 500 });
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d', issuer: 'campusshare' });
}
async function auth(req, _res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw Object.assign(new Error('Please sign in to continue.'), { status: 401 });
    const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'campusshare' });
    const { rows } = await pool.query('SELECT id,name,email,college,department,year,hostel,role,status FROM users WHERE id=$1', [payload.sub]);
    if (!rows[0] || rows[0].status !== 'active') throw Object.assign(new Error('Account is unavailable.'), { status: 401 });
    req.user = rows[0]; next();
  } catch (e) { next(e.status ? e : Object.assign(new Error('Invalid or expired session.'), { status: 401 })); }
}
function admin(req, _res, next) { if (req.user?.role !== 'admin') return next(Object.assign(new Error('Administrator access required.'), { status: 403 })); next(); }
module.exports = { auth, admin, sign };

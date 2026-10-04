const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { auth, sign } = require('../middleware/auth');
const { isEmailConfigured, sendEmailVerification, sendLoginApproval, sendPasswordReset } = require('../services/email');

const router = express.Router();
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (message, status = 400, code = 'BAD_REQUEST') => Object.assign(new Error(message), { status, code });
const emailRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const purposes = { login: 'login_approval', verify: 'email_verification', reset: 'password_reset' };
const dummyHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

const randomToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = value => crypto.createHash('sha256').update(value).digest('hex');
const validEmail = value => typeof value === 'string' && value.length <= 255 && emailRE.test(value.trim());
const publicUser = user => ({
  id: user.id, name: user.name, email: user.email, college: user.college,
  department: user.department, year: user.year, hostel: user.hostel,
  role: user.role, status: user.status, email_verified: user.email_verified,
  auth_version: user.auth_version,
});

async function makeToken(userId, purpose, challengeId, expiresMinutes) {
  const token = randomToken();
  const challengeHash = challengeId ? hashToken(challengeId) : null;
  const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);
  const { rows } = await pool.query(
    'INSERT INTO auth_email_tokens(user_id,purpose,token_hash,challenge_hash,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [userId, purpose, hashToken(token), challengeHash, expiresAt],
  );
  return { id: rows[0].id, token, challengeHash };
}

async function sendOrInvalidate(tokenRow, send) {
  try {
    await send();
  } catch {
    await pool.query('UPDATE auth_email_tokens SET invalidated_at=NOW() WHERE id=$1 AND used_at IS NULL', [tokenRow.id]);
    console.error('CampusShare authentication email delivery failed.');
    throw fail('We could not send the email link. Please try again shortly.', 503, 'EMAIL_DELIVERY_FAILED');
  }
}

async function issueVerification(user, challengeId) {
  const row = await makeToken(user.id, purposes.verify, challengeId, 60);
  await sendOrInvalidate(row, () => sendEmailVerification(user, row.token, challengeId));
}

async function issueLoginApproval(user, challengeId) {
  const row = await makeToken(user.id, purposes.login, challengeId, 15);
  await sendOrInvalidate(row, () => sendLoginApproval(user, row.token, challengeId));
}

async function resendForChallenge(challengeId, purpose) {
  if (typeof challengeId !== 'string' || challengeId.length < 40 || challengeId.length > 64 || !isEmailConfigured()) return;
  const challengeHash = hashToken(challengeId);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (u.id) u.id,u.name,u.email,u.college,u.department,u.year,u.hostel,u.role,u.status,u.email_verified,u.auth_version
       FROM auth_email_tokens t JOIN users u ON u.id=t.user_id
      WHERE t.challenge_hash=$1 AND t.purpose=$2 AND u.status='active'
      ORDER BY u.id,t.created_at DESC`,
    [challengeHash, purpose],
  );
  const user = rows[0];
  if (!user || (purpose === purposes.verify && user.email_verified) || (purpose === purposes.login && !user.email_verified)) return;
  await pool.query('UPDATE auth_email_tokens SET invalidated_at=NOW() WHERE challenge_hash=$1 AND purpose=$2 AND used_at IS NULL AND invalidated_at IS NULL', [challengeHash, purpose]);
  if (purpose === purposes.login) await issueLoginApproval(user, challengeId);
  else await issueVerification(user, challengeId);
}

async function consumeToken(rawToken, purpose) {
  if (typeof rawToken !== 'string' || rawToken.length < 40 || rawToken.length > 64) throw fail('This link is invalid. Please request a new one.', 400, 'LINK_INVALID');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT t.id,t.expires_at,t.used_at,t.invalidated_at,u.id AS user_id,u.name,u.email,u.college,u.department,u.year,u.hostel,u.role,u.status,u.email_verified,u.auth_version
         FROM auth_email_tokens t JOIN users u ON u.id=t.user_id
        WHERE t.token_hash=$1 AND t.purpose=$2 FOR UPDATE OF t,u`,
      [hashToken(rawToken), purpose],
    );
    const tokenRow = rows[0];
    if (!tokenRow) throw fail('This link is invalid. Please request a new one.', 400, 'LINK_INVALID');
    if (tokenRow.used_at || tokenRow.invalidated_at) throw fail('This verification link has already been used.', 410, 'LINK_USED');
    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) throw fail('Verification link expired. Please request a new one.', 410, 'LINK_EXPIRED');
    if (tokenRow.status !== 'active') throw fail('This account is unavailable. Please contact CampusShare support.', 403, 'ACCOUNT_UNAVAILABLE');

    await client.query('UPDATE auth_email_tokens SET used_at=NOW() WHERE id=$1', [tokenRow.id]);
    if (purpose === purposes.verify && !tokenRow.email_verified) {
      await client.query('UPDATE users SET email_verified=TRUE,updated_at=NOW() WHERE id=$1', [tokenRow.user_id]);
      tokenRow.email_verified = true;
    }
    if (purpose === purposes.login && !tokenRow.email_verified) throw fail('Please verify your email address before signing in.', 403, 'EMAIL_NOT_VERIFIED');
    const user = publicUser({ ...tokenRow, id: tokenRow.user_id });
    await client.query('COMMIT');
    return { user, token: sign(user) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

router.post('/register', asyncRoute(async (req, res) => {
  const { name, email, password, college, department, year, hostel } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) throw fail('Name must be between 2 and 120 characters.');
  if (!validEmail(email)) throw fail('Enter a valid email address.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) throw fail('Password must be 8–72 characters.');
  if (year !== undefined && year !== null && year !== '' && (!Number.isInteger(Number(year)) || Number(year) < 1 || Number(year) > 6)) throw fail('Year must be between 1 and 6.');
  if (!isEmailConfigured()) throw fail('Email verification is not configured. Please contact the CampusShare administrator.', 503, 'EMAIL_NOT_CONFIGURED');

  const hash = await bcrypt.hash(password, 12);
  let user;
  try {
    const { rows } = await pool.query(
      `INSERT INTO users(name,email,password_hash,college,department,year,hostel,email_verified)
       VALUES($1,$2,$3,$4,$5,$6,$7,FALSE)
       RETURNING id,name,email,college,department,year,hostel,role,status,email_verified,auth_version`,
      [name.trim(), email.trim().toLowerCase(), hash, college?.trim() || null, department?.trim() || null, year || null, hostel?.trim() || null],
    );
    user = rows[0];
  } catch (error) {
    if (error.code === '23505') throw fail('An account may already exist for that email. Try signing in or resetting the password.', 409, 'ACCOUNT_EXISTS');
    throw error;
  }

  const challengeId = randomToken();
  try {
    await issueVerification(user, challengeId);
    res.status(202).json({ success: true, verificationRequired: true, challengeId });
  } catch (error) {
    if (error.code !== 'EMAIL_DELIVERY_FAILED') throw error;
    res.status(503).json({ success: false, message: error.message, challengeId });
  }
}));

router.post('/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  if (!validEmail(email) || typeof password !== 'string' || password.length < 1 || password.length > 72) throw fail('Please enter a valid email and password.');
  const normalized = email.trim().toLowerCase();
  const { rows } = await pool.query(
    `SELECT id,name,email,password_hash,college,department,year,hostel,role,status,email_verified,auth_version
       FROM users WHERE email=$1`, [normalized],
  );
  const candidate = rows[0];
  const matched = await bcrypt.compare(password, candidate?.password_hash || dummyHash);
  if (!candidate || !matched || candidate.status !== 'active') throw fail('Incorrect email or password.', 401, 'INVALID_CREDENTIALS');
  const user = publicUser(candidate);
  if (!isEmailConfigured()) throw fail('Email approval is not available right now. Please try again later.', 503, 'EMAIL_NOT_CONFIGURED');
  const challengeId = randomToken();
  if (!user.email_verified) {
    await issueVerification(user, challengeId);
    res.status(202).json({ success: true, verificationRequired: true, challengeId });
    return;
  }
  await issueLoginApproval(user, challengeId);
  res.status(202).json({ success: true, approvalRequired: true, challengeId });
}));

router.post('/approval/approve', asyncRoute(async (req, res) => {
  const result = await consumeToken(req.body?.token, purposes.login);
  res.json(result);
}));

router.post('/approval/resend', asyncRoute(async (req, res) => {
  await resendForChallenge(req.body?.challengeId, purposes.login);
  res.json({ success: true, message: 'If this approval request is still valid, a new link has been sent.' });
}));

router.post('/verification/verify', asyncRoute(async (req, res) => {
  const result = await consumeToken(req.body?.token, purposes.verify);
  res.json(result);
}));

router.post('/verification/resend', asyncRoute(async (req, res) => {
  await resendForChallenge(req.body?.challengeId, purposes.verify);
  res.json({ success: true, message: 'If this verification request is still valid, a new link has been sent.' });
}));

router.post('/password/forgot', asyncRoute(async (req, res) => {
  const email = req.body?.email;
  if (!validEmail(email)) throw fail('Enter a valid email address.');
  const generic = { success: true, message: 'If an active account matches that address, a password reset link will be sent.' };
  if (!isEmailConfigured()) return res.json(generic);
  const { rows } = await pool.query(
    `SELECT id,name,email FROM users WHERE email=$1 AND status='active' AND email_verified=TRUE`,
    [email.trim().toLowerCase()],
  );
  if (!rows[0]) return res.json(generic);
  const user = rows[0];
  const row = await makeToken(user.id, purposes.reset, null, 30);
  try {
    await sendPasswordReset(user, row.token);
  } catch {
    await pool.query('UPDATE auth_email_tokens SET invalidated_at=NOW() WHERE id=$1', [row.id]);
    console.error('CampusShare password reset email delivery failed.');
  }
  res.json(generic);
}));

router.post('/password/reset', asyncRoute(async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) throw fail('Password must be 8–72 characters.');
  if (typeof token !== 'string' || token.length < 40 || token.length > 64) throw fail('This link is invalid. Please request a new one.', 400, 'LINK_INVALID');
  const nextHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT t.id,t.expires_at,t.used_at,t.invalidated_at,u.id AS user_id
         FROM auth_email_tokens t JOIN users u ON u.id=t.user_id
        WHERE t.token_hash=$1 AND t.purpose=$2 AND u.status='active' AND u.email_verified=TRUE
        FOR UPDATE OF t,u`, [hashToken(token), purposes.reset],
    );
    const row = rows[0];
    if (!row) throw fail('This link is invalid. Please request a new one.', 400, 'LINK_INVALID');
    if (row.used_at || row.invalidated_at) throw fail('This verification link has already been used.', 410, 'LINK_USED');
    if (new Date(row.expires_at).getTime() <= Date.now()) throw fail('Verification link expired. Please request a new one.', 410, 'LINK_EXPIRED');
    await client.query('UPDATE users SET password_hash=$1,auth_version=auth_version+1,updated_at=NOW() WHERE id=$2', [nextHash, row.user_id]);
    await client.query('UPDATE auth_email_tokens SET used_at=NOW() WHERE id=$1', [row.id]);
    await client.query('UPDATE auth_email_tokens SET invalidated_at=NOW() WHERE user_id=$1 AND id<>$2 AND used_at IS NULL AND invalidated_at IS NULL', [row.user_id, row.id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Password updated. Please sign in using your new password.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/me', auth, (req, res) => res.json({ user: req.user }));

module.exports = router;

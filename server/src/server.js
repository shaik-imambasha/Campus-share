require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const health = require('./routes/healthRoutes');
const api = require('./routes/apiRoutes');
const authApi = require('./routes/authRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s => s.trim()), credentials: true }));
app.use(express.json({ limit: '1mb' }));
const authLimit = limit => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many attempts. Please wait a little before trying again.' }),
});
app.use('/api/auth', authLimit(30));
app.use('/api/auth/login', authLimit(8));
app.use('/api/auth/register', authLimit(5));
app.get('/api', (_req, res) => res.json({ name: 'CampusShare API', version: '1.0.0', status: 'online' }));
app.use('/api/health', health);
app.use('/api/auth', authApi);
app.use('/api', api);
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, '0.0.0.0', () => console.log(`CampusShare API running on port ${PORT}`));

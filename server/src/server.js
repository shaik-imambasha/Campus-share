require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const health = require('./routes/healthRoutes');
const api = require('./routes/apiRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s => s.trim()), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
app.get('/api', (_req, res) => res.json({ name: 'CampusShare API', version: '1.0.0', status: 'online' }));
app.use('/api/health', health);
app.use('/api', api);
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, () => console.log(`CampusShare API running on port ${PORT}`));

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const { authenticate, requireCsrfHeader, requireRole, requireTenant, requireActiveSubscription } = require('./middleware/auth');
const { AppError, now } = require('./utils/common');
const { PERMISSIONS, MODULES } = require('./utils/permissions');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireCsrfHeader);

  api.get('/health', (req, res) => res.json({ ok: true }));
  // serverNow: arayüzün tarih varsayılanlarını sunucu saatiyle (DEMO_NOW dahil) hizalaması için
  api.get('/meta', (req, res) => res.json({ permissions: PERMISSIONS, modules: MODULES, serverNow: now() }));
  api.use('/auth', require('./routes/auth'));

  // Buradan sonrası oturum gerektirir
  api.use(authenticate);
  api.use('/profile', require('./routes/profile'));
  api.use('/admin', requireRole('super_admin'), require('./routes/superadmin'));
  api.use('/business', requireTenant, requireRole('tenant_admin'), require('./routes/business'));

  // İşletme iş verisi: kiracı bağlamı + abonelik kontrolü (süre dolduysa salt okunur)
  const ops = express.Router();
  ops.use(requireTenant, requireActiveSubscription);
  ops.use('/devices', require('./routes/devices'));
  ops.use('/customers', require('./routes/customers'));
  ops.use('/suppliers', require('./routes/suppliers'));
  ops.use('/', require('./routes/transactions'));
  ops.use('/reports', require('./routes/reports'));
  ops.use('/stock-counts', require('./routes/stockCounts'));
  api.use(ops);

  api.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Kaynak bulunamadı')));
  app.use('/api', api);

  // Derlenmiş React arayüzü (npm run build sonrası)
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false }));
    app.get('*', (req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };

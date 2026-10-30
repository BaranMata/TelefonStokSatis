const db = require('../db');
const { clockNow, AppError, now, addDays, money, parseJson } = require('../utils/common');
const { getPaymentProvider } = require('./payment');

function planRow(plan) {
  return plan && { ...plan, modules: parseJson(plan.modules, []), is_trial: !!plan.is_trial, is_active: !!plan.is_active };
}

/** Kiracının geçerli aboneliği, planı ve süresinin dolup dolmadığı. */
function getCurrent(tenantId) {
  let sub = db.one(
    "SELECT * FROM subscriptions WHERE tenant_id = ? AND status IN ('active','expired') ORDER BY id DESC LIMIT 1",
    tenantId,
  );
  if (!sub) return { subscription: null, plan: null, expired: true, daysLeft: 0 };
  const ts = now();
  if (sub.status === 'active' && sub.ends_at < ts) {
    db.run("UPDATE subscriptions SET status = 'expired' WHERE id = ?", sub.id);
    sub = { ...sub, status: 'expired' };
  }
  const plan = planRow(db.one('SELECT * FROM plans WHERE id = ?', sub.plan_id));
  const msLeft = new Date(sub.ends_at.replace(' ', 'T')) - clockNow();
  return {
    subscription: sub,
    plan,
    expired: sub.status === 'expired',
    daysLeft: Math.max(0, Math.ceil(msLeft / 86400000)),
  };
}

function usage(tenantId) {
  return {
    users: db.one('SELECT COUNT(*) c FROM users WHERE tenant_id = ? AND is_active = 1', tenantId).c,
    pendingInvites: db.one('SELECT COUNT(*) c FROM invitations WHERE tenant_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?', tenantId, now()).c,
    devices: db.one("SELECT COUNT(*) c FROM devices WHERE tenant_id = ? AND status <> 'sold'", tenantId).c,
  };
}

const unlimited = (n) => n === -1;

function assertCanAddUser(tenantId) {
  const { plan } = getCurrent(tenantId);
  if (!plan) throw new AppError(402, 'NO_SUBSCRIPTION', 'Aktif abonelik bulunamadı');
  const u = usage(tenantId);
  if (!unlimited(plan.max_users) && u.users + u.pendingInvites >= plan.max_users) {
    throw new AppError(403, 'LIMIT_EXCEEDED', `Planınızın kullanıcı limiti (${plan.max_users}) doldu. Planınızı yükseltin.`);
  }
}

function assertCanAddDevices(tenantId, count) {
  const { plan } = getCurrent(tenantId);
  if (!plan) throw new AppError(402, 'NO_SUBSCRIPTION', 'Aktif abonelik bulunamadı');
  const u = usage(tenantId);
  if (!unlimited(plan.max_devices) && u.devices + count > plan.max_devices) {
    throw new AppError(403, 'LIMIT_EXCEEDED', `Planınızın stok limiti (${plan.max_devices} cihaz) aşılıyor. Mevcut: ${u.devices}, eklenmek istenen: ${count}.`);
  }
}

/** Yeni abonelik dönemi başlatır; önceki aktif kaydı 'replaced' yapar. Aynı plan yenileniyorsa süre kalan günün üzerine eklenir. */
function activate(tenantId, planId, cycle) {
  return db.tx(() => {
    const plan = db.one('SELECT * FROM plans WHERE id = ?', planId);
    if (!plan) throw new AppError(404, 'NOT_FOUND', 'Plan bulunamadı');
    const ts = now();
    const current = db.one("SELECT * FROM subscriptions WHERE tenant_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", tenantId);
    let start = ts;
    if (current && current.plan_id === planId && current.ends_at > ts && cycle !== 'trial') start = current.ends_at;
    const days = cycle === 'trial' ? plan.trial_days : cycle === 'yearly' ? 365 : 30;
    db.run("UPDATE subscriptions SET status = 'replaced' WHERE tenant_id = ? AND status IN ('active','expired')", tenantId);
    const r = db.run(
      "INSERT INTO subscriptions (tenant_id, plan_id, billing_cycle, status, starts_at, ends_at, created_at) VALUES (?,?,?,'active',?,?,?)",
      tenantId, planId, cycle, ts, addDays(start, days), ts,
    );
    return Number(r.lastInsertRowid);
  });
}

function startTrial(tenantId) {
  const trial = db.one('SELECT * FROM plans WHERE is_trial = 1 AND is_active = 1 ORDER BY id LIMIT 1');
  if (!trial) throw new AppError(500, 'NO_TRIAL_PLAN', 'Deneme planı tanımlı değil');
  return activate(tenantId, trial.id, 'trial');
}

/** Ödeme alıp aboneliği başlatır. Ödeme sağlayıcısı soyut arayüz üzerinden çağrılır. */
async function checkout(tenantId, planId, cycle, paymentToken) {
  const plan = db.one('SELECT * FROM plans WHERE id = ? AND is_active = 1', planId);
  if (!plan || plan.is_trial) throw new AppError(400, 'INVALID_PLAN', 'Satın alınabilir bir plan seçin');
  const amount = money(cycle === 'yearly' ? plan.price_yearly : plan.price_monthly);
  const provider = getPaymentProvider();
  const r = db.run(
    "INSERT INTO payments (tenant_id, plan_id, billing_cycle, amount, currency, provider, status, created_at) VALUES (?,?,?,?, 'TRY', ?, 'pending', ?)",
    tenantId, planId, cycle, amount, provider.name, now(),
  );
  const paymentId = Number(r.lastInsertRowid);
  let result;
  try {
    result = await provider.charge({ amount, currency: 'TRY', description: `${plan.name} (${cycle})`, paymentToken, metadata: { tenantId, planId, paymentId } });
  } catch (err) {
    result = { status: 'failed', providerRef: null, failureReason: err.message };
  }
  if (result.status !== 'succeeded') {
    db.run("UPDATE payments SET status = 'failed', failure_reason = ? WHERE id = ?", result.failureReason || 'Ödeme başarısız', paymentId);
    throw new AppError(402, 'PAYMENT_FAILED', result.failureReason || 'Ödeme başarısız');
  }
  return db.tx(() => {
    const subscriptionId = activate(tenantId, planId, cycle);
    db.run("UPDATE payments SET status = 'succeeded', provider_ref = ?, subscription_id = ? WHERE id = ?", result.providerRef, subscriptionId, paymentId);
    return { paymentId, subscriptionId, amount };
  });
}

module.exports = { getCurrent, usage, assertCanAddUser, assertCanAddDevices, activate, startTrial, checkout, planRow };

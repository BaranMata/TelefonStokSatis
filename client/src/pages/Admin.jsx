// Süper Admin ekranları
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, qs } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { ACTIONS, CYCLE, ROLE, SUB_STATUS, date, dateTime, limitText, money } from '../lib/format';
import { errorText } from '../components/Pickers';
import { Badge, Card, ErrorBox, Field, Icon, Loading, Modal, PageHead, Pagination, Progress, Stat, TenantBadge, useToast } from '../components/ui';

// ---------------------------------------------------------------- genel bakış
export function AdminOverview() {
  const { data, error } = useFetch('/admin/stats');
  const tenants = useFetch('/admin/tenants');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const t = data.totals;
  return (
    <>
      <PageHead title="Platform Genel Bakış" sub="Kullanım istatistikleri ve işletme durumu" />
      <div className="grid grid-4">
        <Stat icon="building" label="İşletme" value={t.tenants} hint={`${t.activeTenants} aktif · ${t.suspendedTenants} askıda · ${t.closedTenants} kapalı`} />
        <Stat icon="users" label="Aktif kullanıcı" value={t.users} />
        <Stat icon="phone" label="Kayıtlı cihaz" value={t.devices} hint={`Son 30 gün ${t.transactions30d} işlem`} />
        <Stat icon="card" label="Abonelik geliri (30 gün)" value={money(t.revenue30d)} hint={`Toplam ${money(t.revenueTotal)} · son 7 gün ${t.errors7d} hata kaydı`} />
      </div>
      <div className="grid grid-main mt">
        <Card title="Son 30 gün platform işlem hacmi">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.dailyActivity.map((d) => ({ ...d, label: d.day.slice(8, 10) + '.' + d.day.slice(5, 7) }))} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar isAnimationActive={false} dataKey="count" name="İşlem" fill="#1f6feb" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Plan dağılımı" bodyClass="table-wrap">
          <table>
            <tbody>{data.planDistribution.map((p) => <tr key={p.name}><td>{p.name}</td><td className="num"><b>{p.count}</b> işletme</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
      {tenants.data && (
        <Card title="İşletmelerin kullanım durumu" className="mt" actions={<Link to="/admin/isletmeler" className="small">Yönet</Link>} bodyClass="table-wrap">
          <table>
            <thead><tr><th>İşletme</th><th>Durum</th><th>Plan</th><th style={{ minWidth: 140 }}>Kullanıcı</th><th style={{ minWidth: 140 }}>Stok</th><th className="num">İşlem</th><th>Son faaliyet</th></tr></thead>
            <tbody>
              {tenants.data.items.map((x) => (
                <tr key={x.id}>
                  <td><Link to={`/admin/isletmeler/${x.id}`}><b>{x.name}</b></Link></td>
                  <td><TenantBadge status={x.status} /></td>
                  <td>{x.plan?.name} {x.subscription?.status === 'expired' && <Badge color="red">Süresi doldu</Badge>}</td>
                  <td><div className="small">{x.usage.users} / {limitText(x.plan?.max_users)}</div><Progress value={x.usage.users} max={x.plan?.max_users} /></td>
                  <td><div className="small">{x.usage.devices} / {limitText(x.plan?.max_devices)}</div><Progress value={x.usage.devices} max={x.plan?.max_devices} /></td>
                  <td className="num">{x.usage.transactions}</td>
                  <td className="small">{dateTime(x.last_activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- işletmeler
function StatusActions({ tenant, onDone }) {
  const toast = useToast();
  const change = async (status) => {
    const label = { active: 'etkinleştirilsin', suspended: 'askıya alınsın', closed: 'kapatılsın' }[status];
    const reason = status === 'active' ? null : window.prompt(`${tenant.name} ${label} mı? Gerekçe:`);
    if (status !== 'active' && reason === null) return;
    try {
      await api.patch(`/admin/tenants/${tenant.id}/status`, { status, reason });
      toast('İşletme durumu güncellendi', 'success');
      onDone();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <div className="row" style={{ gap: 6 }}>
      {tenant.status !== 'active' && <button className="btn sm success" onClick={() => change('active')}>Etkinleştir</button>}
      {tenant.status === 'active' && <button className="btn sm" onClick={() => change('suspended')}>Askıya al</button>}
      {tenant.status !== 'closed' && <button className="btn sm danger" onClick={() => change('closed')}>Kapat</button>}
    </div>
  );
}

export function Tenants() {
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ q: '', status: '' });
  const { data, reload } = useFetch(`/admin/tenants${qs(f)}`);
  const plans = useFetch('/admin/plans');
  const [create, setCreate] = useState(null);

  const save = async () => {
    try {
      const r = await api.post('/admin/tenants', { ...create, planId: Number(create.planId) });
      toast('İşletme oluşturuldu', 'success');
      setCreate(null);
      nav(`/admin/isletmeler/${r.tenant.id}`);
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };
  const set = (k) => (e) => setCreate({ ...create, [k]: e.target.value });

  return (
    <>
      <PageHead title="İşletmeler" sub="Kiracı işletmeleri oluşturun, etkinleştirin, askıya alın veya kapatın" actions={<button className="btn primary" onClick={() => setCreate({ name: '', phone: '', email: '', adminName: '', adminEmail: '', adminPassword: '', planId: plans.data?.items[0]?.id || '', cycle: 'trial' })}><Icon name="plus" />Yeni işletme</button>} />
      <Card bodyClass="">
        <div className="card-body filters">
          <Field label="Ara"><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Ad, e-posta" /></Field>
          <Field label="Durum"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Tümü</option><option value="active">Aktif</option><option value="suspended">Askıda</option><option value="closed">Kapalı</option></select></Field>
        </div>
        {!data ? <Loading /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>İşletme</th><th>İletişim</th><th>Durum</th><th>Plan</th><th>Abonelik bitişi</th><th className="num">Kullanıcı</th><th className="num">Stok</th><th>İşlemler</th></tr></thead>
              <tbody>
                {data.items.map((t) => (
                  <tr key={t.id}>
                    <td><Link to={`/admin/isletmeler/${t.id}`}><b>{t.name}</b></Link><div className="small muted">{t.slug} · {date(t.created_at)}</div></td>
                    <td className="small">{t.email}<br />{t.phone}</td>
                    <td><TenantBadge status={t.status} /></td>
                    <td>{t.plan?.name} <span className="small muted">{CYCLE[t.subscription?.billing_cycle]}</span></td>
                    <td className="small">{t.subscription ? <>{date(t.subscription.ends_at)} {t.subscription.status === 'expired' ? <Badge color="red">Doldu</Badge> : <span className="muted">({t.subscription.daysLeft} gün)</span>}</> : '—'}</td>
                    <td className="num">{t.usage.users}/{limitText(t.plan?.max_users)}</td>
                    <td className="num">{t.usage.devices}/{limitText(t.plan?.max_devices)}</td>
                    <td><StatusActions tenant={t} onDone={reload} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {create && (
        <Modal wide title="Yeni işletme oluştur" onClose={() => setCreate(null)} footer={<><button className="btn" onClick={() => setCreate(null)}>Vazgeç</button><button className="btn primary" onClick={save}>Oluştur</button></>}>
          <div className="stack">
            <b>İşletme</b>
            <div className="form-grid">
              <Field label="İşletme adı *"><input value={create.name} onChange={set('name')} /></Field>
              <Field label="Telefon"><input value={create.phone} onChange={set('phone')} /></Field>
              <Field label="E-posta"><input type="email" value={create.email} onChange={set('email')} /></Field>
            </div>
            <b>İlk işletme admini</b>
            <div className="form-grid">
              <Field label="Ad soyad *"><input value={create.adminName} onChange={set('adminName')} /></Field>
              <Field label="E-posta *"><input type="email" value={create.adminEmail} onChange={set('adminEmail')} /></Field>
              <Field label="Geçici şifre *"><input value={create.adminPassword} onChange={set('adminPassword')} placeholder="En az 8 karakter, harf + rakam" /></Field>
            </div>
            <b>Abonelik</b>
            <div className="form-grid">
              <Field label="Plan"><select value={create.planId} onChange={set('planId')}>{plans.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="Dönem"><select value={create.cycle} onChange={set('cycle')}><option value="trial">Deneme</option><option value="monthly">Aylık</option><option value="yearly">Yıllık</option></select></Field>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function TenantDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, reload } = useFetch(`/admin/tenants/${id}`);
  const plans = useFetch('/admin/plans');
  const [assign, setAssign] = useState(null);
  if (!data) return <Loading />;
  const t = data.tenant;
  const doAssign = async () => {
    try {
      await api.put(`/admin/tenants/${t.id}/subscription`, { planId: Number(assign.planId), cycle: assign.cycle });
      toast('Plan atandı', 'success');
      setAssign(null);
      reload();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };
  return (
    <>
      <PageHead title={t.name} sub={<><TenantBadge status={t.status} /> &nbsp;{t.email} · {t.phone}</>} actions={<><Link to="/admin/isletmeler" className="btn">← İşletmeler</Link><button className="btn" onClick={() => setAssign({ planId: t.plan?.id, cycle: 'monthly' })}>Plan ata</button><StatusActions tenant={t} onDone={reload} /></>} />
      <div className="grid grid-4">
        <Stat label="Plan" value={t.plan?.name || '—'} hint={t.subscription ? `${CYCLE[t.subscription.billing_cycle]} · bitiş ${date(t.subscription.ends_at)}` : ''} />
        <Stat label="Kullanıcı" value={`${t.usage.users} / ${limitText(t.plan?.max_users)}`} hint={`${t.usage.pendingInvites} bekleyen davet`} />
        <Stat label="Stoktaki cihaz" value={`${t.usage.devices} / ${limitText(t.plan?.max_devices)}`} />
        <Stat label="Toplam işlem" value={t.usage.transactions} hint={`Son faaliyet ${dateTime(t.last_activity_at)}`} />
      </div>
      <div className="grid grid-2 mt">
        <Card title="Kullanıcılar" bodyClass="table-wrap">
          <table>
            <thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>Son giriş</th></tr></thead>
            <tbody>{data.admins.map((u) => <tr key={u.id}><td>{u.full_name}</td><td className="small">{u.email}</td><td className="small">{ROLE[u.role]}</td><td>{u.is_active ? <Badge color="green">Aktif</Badge> : <Badge color="red">Pasif</Badge>}</td><td className="small">{dateTime(u.last_login_at)}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card title="Abonelik geçmişi" bodyClass="table-wrap">
          <table>
            <thead><tr><th>Plan</th><th>Dönem</th><th>Başlangıç</th><th>Bitiş</th><th>Durum</th></tr></thead>
            <tbody>{data.subscriptions.map((s) => <tr key={s.id}><td>{s.plan_name}</td><td>{CYCLE[s.billing_cycle]}</td><td className="small">{date(s.starts_at)}</td><td className="small">{date(s.ends_at)}</td><td><Badge color={s.status === 'active' ? 'green' : s.status === 'expired' ? 'red' : ''}>{SUB_STATUS[s.status]}</Badge></td></tr>)}</tbody>
          </table>
        </Card>
      </div>
      <Card title="Ödemeler" className="mt" bodyClass="table-wrap">
        <table>
          <thead><tr><th>Tarih</th><th>Plan</th><th className="num">Tutar</th><th>Sağlayıcı</th><th>Durum</th></tr></thead>
          <tbody>{data.payments.map((p) => <tr key={p.id}><td className="small">{dateTime(p.created_at)}</td><td>{p.plan_name} · {CYCLE[p.billing_cycle]}</td><td className="num">{money(p.amount)}</td><td className="mono small">{p.provider}</td><td>{p.status === 'succeeded' ? <Badge color="green">Başarılı</Badge> : <Badge color="red">{p.failure_reason || 'Başarısız'}</Badge>}</td></tr>)}</tbody>
        </table>
        {!data.payments.length && <div className="empty">Ödeme yok</div>}
      </Card>
      {assign && (
        <Modal title="Plan ata (manuel)" onClose={() => setAssign(null)} footer={<><button className="btn" onClick={() => setAssign(null)}>Vazgeç</button><button className="btn primary" onClick={doAssign}>Ata</button></>}>
          <div className="stack">
            <div className="alert info small">Örneğin havale ile ödeme alınan işletmeler için. Ödeme kaydı oluşturmadan yeni abonelik dönemi başlatır.</div>
            <Field label="Plan"><select value={assign.planId} onChange={(e) => setAssign({ ...assign, planId: e.target.value })}>{plans.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Dönem"><select value={assign.cycle} onChange={(e) => setAssign({ ...assign, cycle: e.target.value })}><option value="trial">Deneme</option><option value="monthly">Aylık (30 gün)</option><option value="yearly">Yıllık (365 gün)</option></select></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------- planlar
const MODULE_LABELS = { stock: 'Stok', sales: 'Alış/satış', trade: 'Takas', reports: 'Raporlar', export: 'Excel/PDF', barcode: 'Barkod', stock_count: 'Stok sayımı' };

export function Plans() {
  const toast = useToast();
  const { data, reload } = useFetch('/admin/plans');
  const [edit, setEdit] = useState(null);
  if (!data) return <Loading />;
  const save = async () => {
    const body = { ...edit, price_monthly: Number(edit.price_monthly), price_yearly: Number(edit.price_yearly), max_users: Number(edit.max_users), max_devices: Number(edit.max_devices), trial_days: Number(edit.trial_days || 0) };
    delete body.id; delete body.created_at; delete body.tenant_count;
    try {
      if (edit.id) await api.put(`/admin/plans/${edit.id}`, body);
      else await api.post('/admin/plans', body);
      toast('Plan kaydedildi', 'success');
      setEdit(null);
      reload();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  return (
    <>
      <PageHead title="Planlar ve Limitler" sub="Abonelik planları, fiyatlar, kullanıcı / stok limitleri ve modüller (-1 = sınırsız)" actions={<button className="btn primary" onClick={() => setEdit({ code: '', name: '', price_monthly: 0, price_yearly: 0, max_users: 3, max_devices: 100, modules: ['stock', 'sales'], is_trial: false, trial_days: 0, is_active: true })}><Icon name="plus" />Yeni plan</button>} />
      <Card bodyClass="table-wrap">
        <table>
          <thead><tr><th>Plan</th><th className="num">Aylık</th><th className="num">Yıllık</th><th className="num">Kullanıcı</th><th className="num">Cihaz</th><th>Modüller</th><th className="num">İşletme</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b> <span className="small muted mono">{p.code}</span>{p.is_trial && <div><Badge color="orange">Deneme · {p.trial_days} gün</Badge></div>}</td>
                <td className="num">{money(p.price_monthly)}</td><td className="num">{money(p.price_yearly)}</td>
                <td className="num">{limitText(p.max_users)}</td><td className="num">{limitText(p.max_devices)}</td>
                <td className="small">{p.modules.map((m) => MODULE_LABELS[m]).join(', ')}</td>
                <td className="num">{p.tenant_count}</td>
                <td>{p.is_active ? <Badge color="green">Satışta</Badge> : <Badge>Pasif</Badge>}</td>
                <td><button className="btn sm" onClick={() => setEdit({ ...p })}>Düzenle</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {edit && (
        <Modal wide title={edit.id ? `${edit.name} planını düzenle` : 'Yeni plan'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Vazgeç</button><button className="btn primary" onClick={save}>Kaydet</button></>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="Kod"><input value={edit.code} onChange={set('code')} /></Field>
              <Field label="Ad"><input value={edit.name} onChange={set('name')} /></Field>
              <Field label="Aylık fiyat ₺"><input type="number" value={edit.price_monthly} onChange={set('price_monthly')} /></Field>
              <Field label="Yıllık fiyat ₺"><input type="number" value={edit.price_yearly} onChange={set('price_yearly')} /></Field>
              <Field label="Kullanıcı limiti"><input type="number" value={edit.max_users} onChange={set('max_users')} /></Field>
              <Field label="Cihaz (stok) limiti"><input type="number" value={edit.max_devices} onChange={set('max_devices')} /></Field>
              <label className="checkbox"><input type="checkbox" checked={edit.is_trial} onChange={(e) => setEdit({ ...edit, is_trial: e.target.checked })} />Deneme planı</label>
              {edit.is_trial && <Field label="Deneme süresi (gün)"><input type="number" value={edit.trial_days} onChange={set('trial_days')} /></Field>}
              <label className="checkbox"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />Satışta</label>
            </div>
            <b>Modüller</b>
            <div className="row">
              {Object.entries(MODULE_LABELS).map(([k, l]) => (
                <label key={k} className="checkbox"><input type="checkbox" checked={edit.modules.includes(k)} onChange={(e) => setEdit({ ...edit, modules: e.target.checked ? [...edit.modules, k] : edit.modules.filter((m) => m !== k) })} />{l}</label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------- günlükler
export function AuditLogs() {
  const [f, setF] = useState({ tenantId: '', action: '', from: '', to: '', page: 1 });
  const { data } = useFetch(`/admin/audit-logs${qs({ ...f, pageSize: 40 })}`);
  const tenants = useFetch('/admin/tenants');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1 });
  return (
    <>
      <PageHead title="İşlem Günlükleri" sub="Platform genelindeki denetim kayıtları (kim, ne zaman, ne yaptı)" />
      <Card bodyClass="">
        <div className="card-body filters">
          <Field label="İşletme"><select value={f.tenantId} onChange={set('tenantId')}><option value="">Tümü</option>{tenants.data?.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="İşlem (içerir)"><input value={f.action} onChange={set('action')} placeholder="ör. login, sale, admin" /></Field>
          <Field label="Başlangıç"><input type="date" value={f.from} onChange={set('from')} /></Field>
          <Field label="Bitiş"><input type="date" value={f.to} onChange={set('to')} /></Field>
        </div>
        {!data ? <Loading /> : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Zaman</th><th>İşletme</th><th>Kullanıcı</th><th>İşlem</th><th>Kayıt</th><th>Ayrıntı</th><th>IP</th></tr></thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id}>
                      <td className="small">{dateTime(a.created_at)}</td>
                      <td className="small">{a.tenant_name || <Badge color="blue">Platform</Badge>}</td>
                      <td className="small">{a.user_name || '—'}<div className="muted">{a.user_email}</div></td>
                      <td>{ACTIONS[a.action] || a.action}<div className="small muted mono">{a.action}</div></td>
                      <td className="small muted">{a.entity ? `${a.entity} #${a.entity_id ?? ''}` : '—'}</td>
                      <td className="small mono" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.details || ''}>{a.details}</td>
                      <td className="small muted">{a.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ ...f, page })} />
          </>
        )}
      </Card>
    </>
  );
}

export function ErrorLogs() {
  const [f, setF] = useState({ status: '', page: 1 });
  const { data } = useFetch(`/admin/error-logs${qs({ ...f, pageSize: 40 })}`);
  const [open, setOpen] = useState(null);
  return (
    <>
      <PageHead title="Hata Kayıtları" sub="Sunucu hataları (5xx) ile yetki, limit ve çakışma hataları (402 / 403 / 409)" />
      <Card bodyClass="">
        <div className="card-body filters">
          <Field label="HTTP durum"><select value={f.status} onChange={(e) => setF({ status: e.target.value, page: 1 })}><option value="">Tümü</option><option value="500">500 Sunucu hatası</option><option value="402">402 Abonelik / ödeme</option><option value="403">403 Yetki / limit</option><option value="409">409 Çakışma</option></select></Field>
        </div>
        {!data ? <Loading /> : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Zaman</th><th>Durum</th><th>İstek</th><th>Mesaj</th><th>İşletme</th><th>Kullanıcı</th></tr></thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr key={e.id} className={e.stack ? 'clickable' : ''} onClick={() => e.stack && setOpen(e)}>
                      <td className="small">{dateTime(e.created_at)}</td>
                      <td><Badge color={e.status >= 500 ? 'red' : e.status === 409 ? 'orange' : ''}>{e.status}</Badge></td>
                      <td className="mono small">{e.method} {e.path}</td>
                      <td>{e.message}</td>
                      <td className="small">{e.tenant_name || '—'}</td>
                      <td className="small">{e.user_email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length && <div className="empty">Hata kaydı yok</div>}
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ ...f, page })} />
          </>
        )}
      </Card>
      {open && <Modal wide title="Hata ayrıntısı" onClose={() => setOpen(null)}><pre className="mono small" style={{ whiteSpace: 'pre-wrap' }}>{open.stack}</pre></Modal>}
    </>
  );
}

export function Backups() {
  const toast = useToast();
  const { data, reload } = useFetch('/admin/backups');
  const [busy, setBusy] = useState(false);
  if (!data) return <Loading />;
  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post('/admin/backups');
      toast(`Yedek alındı: ${r.fileName}`, 'success');
      reload();
    } finally {
      setBusy(false);
    }
  };
  const restore = async (fileName) => {
    if (!window.confirm(`${fileName} yedeğine geri dönülsün mü?\nMevcut veriler önce otomatik olarak yedeklenecek.`)) return;
    try {
      const r = await api.post('/admin/backups/restore', { fileName });
      toast(`Geri yüklendi. Güvenlik yedeği: ${r.safetyBackup}`, 'success');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const KIND = { auto: ['blue', 'Otomatik'], manual: ['green', 'Manuel'], pre_restore: ['orange', 'Geri yükleme öncesi'], restore: ['red', 'Geri yükleme'] };
  return (
    <>
      <PageHead title="Yedekleme" sub="Veritabanı otomatik olarak düzenli aralıklarla yedeklenir; istenen yedeğe geri dönülebilir" actions={<button className="btn primary" disabled={busy} onClick={create}><Icon name="database" />Şimdi yedek al</button>} />
      <div className="grid grid-main">
        <Card title={`Yedek dosyaları (${data.items.length})`} bodyClass="table-wrap">
          <table>
            <thead><tr><th>Dosya</th><th>Tür</th><th className="num">Boyut</th><th>Tarih</th><th></th></tr></thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.fileName}>
                  <td className="mono small">{b.fileName}</td>
                  <td><Badge color={KIND[b.kind][0]}>{KIND[b.kind][1]}</Badge></td>
                  <td className="num">{(b.size / 1024).toFixed(0)} KB</td>
                  <td className="small">{dateTime(b.createdAt)}</td>
                  <td><button className="btn sm danger" onClick={() => restore(b.fileName)}>Geri yükle</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.items.length && <div className="empty">Henüz yedek yok</div>}
        </Card>
        <Card title="Yedekleme geçmişi" bodyClass="table-wrap">
          <table>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id}><td><Badge color={KIND[h.kind][0]}>{KIND[h.kind][1]}</Badge></td><td className="small">{dateTime(h.created_at)}<div className="muted">{h.user_email || 'zamanlayıcı'}</div></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

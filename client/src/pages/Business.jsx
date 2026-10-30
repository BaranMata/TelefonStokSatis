// İşletme Admini ekranları
import { useEffect, useState } from 'react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/hooks';
import { ACTIONS, CYCLE, ROLE, SUB_STATUS, date, dateTime, limitText, moduleList, money } from '../lib/format';
import { errorText } from '../components/Pickers';
import { Badge, Card, ErrorBox, Field, Icon, Loading, Modal, PageHead, Pagination, Progress, useToast } from '../components/ui';

// ---------------------------------------------------------------- işletme profili
export function BusinessProfile() {
  const toast = useToast();
  const { refresh } = useAuth();
  const { data } = useFetch('/business/profile');
  const [form, setForm] = useState(null);
  useEffect(() => { if (data) setForm(data.tenant); }, [data]);
  if (!form) return <Loading />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put('/business/profile', { name: form.name, tax_no: form.tax_no, phone: form.phone, email: form.email || null, address: form.address });
      await refresh();
      toast('İşletme profili güncellendi', 'success');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };
  return (
    <>
      <PageHead title="İşletme Profili" sub={`Kayıt tarihi ${date(form.created_at)} · kısa ad: ${form.slug}`} />
      <Card>
        <form onSubmit={save} className="form-grid">
          <Field label="İşletme adı *"><input required value={form.name} onChange={set('name')} /></Field>
          <Field label="Vergi no"><input value={form.tax_no || ''} onChange={set('tax_no')} /></Field>
          <Field label="Telefon"><input value={form.phone || ''} onChange={set('phone')} /></Field>
          <Field label="E-posta"><input type="email" value={form.email || ''} onChange={set('email')} /></Field>
          <Field label="Adres" className="full"><textarea value={form.address || ''} onChange={set('address')} /></Field>
          <div className="full"><button className="btn primary">Kaydet</button></div>
        </form>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- personel
function PermissionChecks({ perms, value, onChange }) {
  return (
    <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
      {Object.entries(perms).map(([k, label]) => (
        <label key={k} className="checkbox small">
          <input type="checkbox" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((p) => p !== k))} />
          {label}
        </label>
      ))}
    </div>
  );
}

export function Staff() {
  const toast = useToast();
  const { user } = useAuth();
  const { data, reload, error } = useFetch('/business/staff');
  const [invite, setInvite] = useState(null);
  const [edit, setEdit] = useState(null);
  const [link, setLink] = useState(null);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;

  const sendInvite = async () => {
    try {
      const r = await api.post('/business/staff/invite', invite);
      setInvite(null);
      setLink(`${window.location.origin}${r.inviteLink}`);
      reload();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };
  const saveEdit = async () => {
    try {
      await api.put(`/business/staff/${edit.id}`, { full_name: edit.full_name, phone: edit.phone, role: edit.role, permissions: edit.permissions, is_active: edit.is_active });
      toast('Personel güncellendi', 'success');
      setEdit(null);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const revoke = async (id) => {
    await api.delete(`/business/staff/invitations/${id}`);
    reload();
  };

  return (
    <>
      <PageHead title="Personel ve Yetkiler" sub="Personel davet edin, rol ve yetki atayın, devre dışı bırakın" actions={<button className="btn primary" onClick={() => setInvite({ email: '', full_name: '', role: 'user', permissions: ['stock.view', 'sale.create', 'customer.manage'] })}><Icon name="plus" />Personel davet et</button>} />
      {link && <div className="alert info" style={{ marginBottom: 16 }}>Davet oluşturuldu. E-posta altyapısı olmadığından bağlantıyı personele kendiniz iletebilirsiniz:<br /><span className="mono">{link}</span></div>}
      <Card bodyClass="table-wrap">
        <table>
          <thead><tr><th>Ad soyad</th><th>E-posta</th><th>Rol</th><th>Yetkiler</th><th>Durum</th><th>Son giriş</th><th></th></tr></thead>
          <tbody>
            {data.items.map((u) => (
              <tr key={u.id}>
                <td><b>{u.full_name}</b>{u.id === user.id && <span className="small muted"> (siz)</span>}</td>
                <td className="small">{u.email}</td>
                <td><Badge color={u.role === 'tenant_admin' ? 'blue' : ''}>{ROLE[u.role]}</Badge></td>
                <td className="small" style={{ maxWidth: 320 }}>{u.role === 'tenant_admin' ? 'Tüm yetkiler' : u.permissions.map((p) => data.permissions[p]).join(', ') || '—'}</td>
                <td>{u.is_active ? <Badge color="green">Aktif</Badge> : <Badge color="red">Devre dışı</Badge>}</td>
                <td className="small">{dateTime(u.last_login_at)}</td>
                <td><button className="btn sm" onClick={() => setEdit({ ...u })}>Düzenle</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {data.invitations.length > 0 && (
        <Card title="Bekleyen davetler" className="mt" bodyClass="table-wrap">
          <table>
            <thead><tr><th>E-posta</th><th>Ad</th><th>Rol</th><th>Davet eden</th><th>Son geçerlilik</th><th></th></tr></thead>
            <tbody>
              {data.invitations.map((i) => (
                <tr key={i.id}><td>{i.email}</td><td>{i.full_name || '—'}</td><td>{ROLE[i.role]}</td><td className="small">{i.invited_by}</td><td className="small">{dateTime(i.expires_at)}</td><td><button className="btn sm danger" onClick={() => revoke(i.id)}>İptal et</button></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {invite && (
        <Modal wide title="Personel davet et" onClose={() => setInvite(null)} footer={<><button className="btn" onClick={() => setInvite(null)}>Vazgeç</button><button className="btn primary" onClick={sendInvite}>Davet gönder</button></>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="E-posta *"><input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
              <Field label="Ad soyad"><input value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} /></Field>
              <Field label="Rol">
                <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                  <option value="user">Kullanıcı</option>
                  <option value="tenant_admin">İşletme Admini</option>
                </select>
              </Field>
            </div>
            {invite.role === 'user' ? <><b>Yetkiler</b><PermissionChecks perms={data.permissions} value={invite.permissions} onChange={(permissions) => setInvite({ ...invite, permissions })} /></> : <div className="alert info">İşletme admini tüm yetkilere sahiptir.</div>}
          </div>
        </Modal>
      )}
      {edit && (
        <Modal wide title={`${edit.full_name} — düzenle`} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Vazgeç</button><button className="btn primary" onClick={saveEdit}>Kaydet</button></>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="Ad soyad"><input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
              <Field label="Telefon"><input value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              <Field label="Rol">
                <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                  <option value="user">Kullanıcı</option>
                  <option value="tenant_admin">İşletme Admini</option>
                </select>
              </Field>
              <label className="checkbox" style={{ alignSelf: 'end' }}><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />Hesap aktif</label>
            </div>
            {edit.role === 'user' && <><b>Yetkiler</b><PermissionChecks perms={data.permissions} value={edit.permissions} onChange={(permissions) => setEdit({ ...edit, permissions })} /></>}
            <div className="small muted">Rol, yetki veya aktiflik değiştiğinde kullanıcının açık oturumları sonlandırılır.</div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------- faaliyet geçmişi
export function Activity() {
  const [f, setF] = useState({ userId: '', action: '', from: '', to: '', page: 1 });
  const { data } = useFetch(`/business/activity${qs({ ...f, pageSize: 30 })}`);
  const staff = useFetch('/business/staff');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1 });
  const groups = [['', 'Tümü'], ['auth', 'Oturum'], ['sale', 'Satış'], ['purchase', 'Alış'], ['trade', 'Takas'], ['device', 'Cihaz'], ['staff', 'Personel'], ['customer', 'Müşteri'], ['report', 'Rapor'], ['subscription', 'Abonelik'], ['stock_count', 'Sayım']];
  return (
    <>
      <PageHead title="Faaliyet Geçmişi" sub="İşletmenizdeki tüm kullanıcı işlemlerinin denetim kaydı" />
      <Card bodyClass="">
        <div className="card-body filters">
          <Field label="Kullanıcı"><select value={f.userId} onChange={set('userId')}><option value="">Tümü</option>{staff.data?.items.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
          <Field label="İşlem grubu"><select value={f.action} onChange={set('action')}>{groups.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Başlangıç"><input type="date" value={f.from} onChange={set('from')} /></Field>
          <Field label="Bitiş"><input type="date" value={f.to} onChange={set('to')} /></Field>
        </div>
        {!data ? <Loading /> : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Zaman</th><th>Kullanıcı</th><th>İşlem</th><th>Kayıt</th><th>Ayrıntı</th><th>IP</th></tr></thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id}>
                      <td className="small">{dateTime(a.created_at)}</td>
                      <td>{a.user_name || '—'}</td>
                      <td>{ACTIONS[a.action] || a.action}</td>
                      <td className="small muted">{a.entity ? `${a.entity} #${a.entity_id ?? ''}` : '—'}</td>
                      <td className="small mono" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.details || ''}>{a.details || ''}</td>
                      <td className="small muted">{a.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length && <div className="empty">Kayıt yok</div>}
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ ...f, page })} />
          </>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- abonelik
export function Subscription() {
  const toast = useToast();
  const { refresh } = useAuth();
  const { data, reload } = useFetch('/business/subscription');
  const [checkout, setCheckout] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <Loading />;
  const { current, usage, plans, history, payments } = data;
  const plan = current.plan;

  const pay = async () => {
    setBusy(true);
    try {
      const r = await api.post('/business/subscription/checkout', checkout);
      toast(`Ödeme alındı (${money(r.amount)}), abonelik etkin`, 'success');
      setCheckout(null);
      await refresh();
      reload();
    } catch (e) {
      toast(e.message, 'error');
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Abonelik" sub="Plan, limit kullanımı ve ödeme geçmişi" />
      <div className="grid grid-main">
        <Card title="Mevcut plan">
          {plan ? (
            <div className="stack">
              <div className="row">
                <h2>{plan.name}</h2>
                <Badge color={current.expired ? 'red' : 'green'}>{current.expired ? 'Süresi doldu' : 'Aktif'}</Badge>
                <Badge>{CYCLE[current.subscription.billing_cycle]}</Badge>
              </div>
              <div className="muted">{current.expired ? `Bitiş: ${dateTime(current.subscription.ends_at)} — sistem salt okunur modda` : `Bitiş: ${dateTime(current.subscription.ends_at)} · ${current.daysLeft} gün kaldı`}</div>
              <div>
                <div className="row small" style={{ justifyContent: 'space-between' }}><span>Kullanıcı (aktif + bekleyen davet)</span><b>{usage.users + usage.pendingInvites} / {limitText(plan.max_users)}</b></div>
                <Progress value={usage.users + usage.pendingInvites} max={plan.max_users} />
              </div>
              <div>
                <div className="row small" style={{ justifyContent: 'space-between' }}><span>Stoktaki cihaz</span><b>{usage.devices} / {limitText(plan.max_devices)}</b></div>
                <Progress value={usage.devices} max={plan.max_devices} />
              </div>
              <div className="small"><span className="muted">Modüller:</span> {moduleList(plan.modules)}</div>
            </div>
          ) : <div className="empty">Aktif abonelik yok</div>}
        </Card>
        <Card title="Ödeme altyapısı">
          <p className="small muted" style={{ marginTop: 0 }}>Ödemeler soyut <b>PaymentProvider</b> arayüzü üzerinden alınır. Bu kurulumda <b>test (mock) sağlayıcı</b> etkindir: gerçek para hareketi olmaz, kart bilgisi istenmez.</p>
          <p className="small muted">Gerçek bir sağlayıcı (iyzico, PayTR, Stripe…) için yalnızca yeni bir adaptör yazılması yeterlidir.</p>
        </Card>
      </div>

      <h2 className="mt" style={{ marginBottom: 12 }}>Planlar</h2>
      <div className="grid grid-3">
        {plans.map((p) => (
          <Card key={p.id} className={plan?.id === p.id ? 'current-plan' : ''}>
            <div className="stack">
              <div className="row"><h2>{p.name}</h2>{plan?.id === p.id && <Badge color="blue">Mevcut</Badge>}</div>
              <div><b style={{ fontSize: 22 }}>{money(p.price_monthly)}</b><span className="muted"> / ay</span> <span className="small muted">veya {money(p.price_yearly)} / yıl</span></div>
              <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                <li>{limitText(p.max_users)} kullanıcı</li>
                <li>{limitText(p.max_devices)} cihaz stok limiti</li>
                <li>{p.modules.length} modül: {moduleList(p.modules)}</li>
              </ul>
              <div className="row">
                <button className="btn primary sm" onClick={() => setCheckout({ planId: p.id, cycle: 'monthly', paymentToken: 'tok_success', plan: p })}>Aylık al</button>
                <button className="btn sm" onClick={() => setCheckout({ planId: p.id, cycle: 'yearly', paymentToken: 'tok_success', plan: p })}>Yıllık al</button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-2 mt">
        <Card title="Ödeme geçmişi" bodyClass="table-wrap">
          <table>
            <thead><tr><th>Tarih</th><th>Plan</th><th className="num">Tutar</th><th>Durum</th><th>Referans</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="small">{dateTime(p.created_at)}</td><td>{p.plan_name} <span className="small muted">{CYCLE[p.billing_cycle]}</span></td><td className="num">{money(p.amount)}</td>
                  <td>{p.status === 'succeeded' ? <Badge color="green">Başarılı</Badge> : p.status === 'failed' ? <Badge color="red" >Başarısız</Badge> : <Badge>Bekliyor</Badge>}{p.failure_reason && <div className="small muted">{p.failure_reason}</div>}</td>
                  <td className="mono small">{p.provider}{p.provider_ref ? `:${p.provider_ref}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!payments.length && <div className="empty">Ödeme yok</div>}
        </Card>
        <Card title="Abonelik geçmişi" bodyClass="table-wrap">
          <table>
            <thead><tr><th>Plan</th><th>Dönem</th><th>Başlangıç</th><th>Bitiş</th><th>Durum</th></tr></thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id}><td>{s.plan_name}</td><td>{CYCLE[s.billing_cycle]}</td><td className="small">{date(s.starts_at)}</td><td className="small">{date(s.ends_at)}</td><td><Badge color={s.status === 'active' ? 'green' : s.status === 'expired' ? 'red' : ''}>{SUB_STATUS[s.status]}</Badge></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {checkout && (
        <Modal title={`${checkout.plan.name} — ${CYCLE[checkout.cycle]} ödeme`} onClose={() => setCheckout(null)} footer={<><button className="btn" onClick={() => setCheckout(null)}>Vazgeç</button><button className="btn primary" disabled={busy} onClick={pay}>{busy ? 'İşleniyor…' : `Öde: ${money(checkout.cycle === 'yearly' ? checkout.plan.price_yearly : checkout.plan.price_monthly)}`}</button></>}>
          <div className="stack">
            <div className="alert info small">Test ödeme sağlayıcısı. Gerçek entegrasyonda burada sağlayıcının güvenli ödeme formu açılır ve sunucuya yalnızca tek kullanımlık ödeme belirteci gelir.</div>
            <Field label="Test senaryosu">
              <select value={checkout.paymentToken} onChange={(e) => setCheckout({ ...checkout, paymentToken: e.target.value })}>
                <option value="tok_success">Başarılı ödeme</option>
                <option value="tok_fail">Reddedilen kart</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}

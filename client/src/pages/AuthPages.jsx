import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ROLE } from '../lib/format';
import { Field, Icon } from '../components/ui';

function AuthShell({ children }) {
  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="brand" style={{ padding: 0, marginBottom: 28 }}>
          <div className="brand-logo"><Icon name="phone" size={18} /></div>
          <div>Telefon Takip<small>Stok ve Satış Takip Sistemi</small></div>
        </div>
        <h1>Telefon alım satımı yapan işletmeler için bulut tabanlı stok ve satış yönetimi</h1>
        <p>IMEI bazlı stok takibi, alış-satış-takas işlemleri, kâr/marj hesabı ve raporlar tek panelde.</p>
        <ul>
          <li>IMEI / barkod ile hızlı arama ve stok sayımı</li>
          <li>Cihaz bazında kâr, zarar ve marj</li>
          <li>Rol tabanlı yetkilendirme ve denetim kayıtları</li>
          <li>Excel / PDF raporlar</li>
        </ul>
      </div>
      <div className="auth-form">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}

const DEMO = [
  ['admin@telefonsaas.local', 'Admin1234', 'super_admin', 'Platform'],
  ['yonetici@yildiz.example', 'Demo1234', 'tenant_admin', 'Yıldız İletişim'],
  ['satis@yildiz.example', 'Demo1234', 'user', 'Yıldız İletişim · satış'],
  ['depo@yildiz.example', 'Demo1234', 'user', 'Yıldız İletişim · depo'],
];

export function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.email, form.password);
      nav(loc.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h2>Giriş yap</h2>
      <p className="muted">Hesabınıza erişmek için bilgilerinizi girin.</p>
      <form onSubmit={submit} className="stack" style={{ marginTop: 18 }}>
        {error && <div className="alert error">{error}</div>}
        <Field label="E-posta"><input type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Şifre"><input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
        <div className="row small" style={{ justifyContent: 'space-between' }}>
          <Link to="/sifremi-unuttum">Şifremi unuttum</Link>
          <Link to="/kayit">Ücretsiz deneme başlat</Link>
        </div>
      </form>
      <div className="card card-body demo-list" style={{ marginTop: 22 }}>
        <b>Demo hesapları</b> <span className="muted">(seed verisi)</span>
        {DEMO.map(([email, password, role, note]) => (
          <button key={email} type="button" className="btn sm" onClick={() => setForm({ email, password })}>
            <span><b>{ROLE[role]}</b> — {note}<br /><span className="muted">{email}</span></span>
          </button>
        ))}
      </div>
    </AuthShell>
  );
}

export function Register() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ businessName: '', fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/auth/register', form);
      await refresh();
      nav('/');
    } catch (err) {
      setError(err.details ? err.details.map((d) => d.message).join(', ') : err.message);
    }
  };
  return (
    <AuthShell>
      <h2>14 gün ücretsiz deneyin</h2>
      <p className="muted">İşletmenizi oluşturun; kredi kartı gerekmez.</p>
      <form onSubmit={submit} className="stack" style={{ marginTop: 18 }}>
        {error && <div className="alert error">{error}</div>}
        <Field label="İşletme adı"><input required value={form.businessName} onChange={set('businessName')} /></Field>
        <Field label="Ad soyad"><input required value={form.fullName} onChange={set('fullName')} /></Field>
        <Field label="E-posta"><input type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Telefon"><input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Şifre (en az 8 karakter, harf ve rakam)"><input type="password" required minLength={8} value={form.password} onChange={set('password')} /></Field>
        <button className="btn primary">Hesap oluştur</button>
        <Link to="/giris" className="small">Zaten hesabım var</Link>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    const r = await api.post('/auth/forgot-password', { email });
    setMsg(r.message);
  };
  return (
    <AuthShell>
      <h2>Şifremi unuttum</h2>
      <p className="muted">E-posta adresinize şifre yenileme bağlantısı gönderilir.</p>
      <form onSubmit={submit} className="stack" style={{ marginTop: 18 }}>
        {msg && <div className="alert success">{msg} <br /><span className="small">Geliştirme ortamında e-postalar sunucu konsoluna ve mail_outbox tablosuna yazılır.</span></div>}
        <Field label="E-posta"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <button className="btn primary">Bağlantı gönder</button>
        <Link to="/giris" className="small">Girişe dön</Link>
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/reset-password', { token: params.get('token'), password });
      setDone(true);
      setTimeout(() => nav('/giris'), 1500);
    } catch (err) {
      setError(err.details ? err.details.map((d) => d.message).join(', ') : err.message);
    }
  };
  return (
    <AuthShell>
      <h2>Yeni şifre belirleyin</h2>
      <form onSubmit={submit} className="stack" style={{ marginTop: 18 }}>
        {error && <div className="alert error">{error}</div>}
        {done && <div className="alert success">Şifreniz güncellendi, giriş sayfasına yönlendiriliyorsunuz.</div>}
        <Field label="Yeni şifre"><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <button className="btn primary">Şifreyi güncelle</button>
      </form>
    </AuthShell>
  );
}

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ fullName: '', password: '' });
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get(`/auth/invitation/${token}`).then((i) => { setInfo(i); setForm((f) => ({ ...f, fullName: i.full_name || '' })); }).catch((e) => setError(e.message));
  }, [token]);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/accept-invite', { token, ...form });
      await refresh();
      nav('/');
    } catch (err) {
      setError(err.details ? err.details.map((d) => d.message).join(', ') : err.message);
    }
  };
  return (
    <AuthShell>
      <h2>Daveti kabul et</h2>
      {info && <p className="muted"><b>{info.tenant_name}</b> sizi <b>{ROLE[info.role]}</b> olarak davet etti ({info.email}).</p>}
      <form onSubmit={submit} className="stack" style={{ marginTop: 18 }}>
        {error && <div className="alert error">{error}</div>}
        <Field label="Ad soyad"><input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
        <Field label="Şifre"><input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <button className="btn primary" disabled={!info}>Hesabımı oluştur</button>
      </form>
    </AuthShell>
  );
}

import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/hooks';
import { ROLE } from '../lib/format';
import { errorText } from '../components/Pickers';
import { Badge, Card, Field, PageHead, useToast } from '../components/ui';

export default function Profile() {
  const { user, tenant, refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: user.full_name, phone: user.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const meta = useFetch(user.role === 'user' ? '/meta' : null).data;

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put('/profile', form);
      await refresh();
      toast('Profil güncellendi', 'success');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };
  const changePw = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast('Yeni şifreler eşleşmiyor', 'error');
    try {
      await api.put('/profile/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Şifre değiştirildi; diğer cihazlardaki oturumlar kapatıldı', 'success');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <>
      <PageHead title="Profilim" sub={`${ROLE[user.role]}${tenant ? ` · ${tenant.name}` : ''}`} />
      <div className="grid grid-2">
        <Card title="Kişisel bilgiler">
          <form onSubmit={save} className="stack">
            <Field label="E-posta"><input value={user.email} disabled /></Field>
            <Field label="Ad soyad"><input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Telefon"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <div><button className="btn primary">Kaydet</button></div>
          </form>
        </Card>
        <Card title="Şifre değiştir">
          <form onSubmit={changePw} className="stack">
            <Field label="Mevcut şifre"><input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
            <Field label="Yeni şifre (en az 8 karakter, harf + rakam)"><input type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Yeni şifre (tekrar)"><input type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
            <div><button className="btn primary">Şifreyi değiştir</button></div>
          </form>
        </Card>
      </div>
      {user.role === 'user' && meta && (
        <Card title="Yetkilerim" className="mt">
          <div className="row">
            {Object.entries(meta.permissions).map(([k, label]) => <Badge key={k} color={user.permissions.includes(k) ? 'green' : ''}>{user.permissions.includes(k) ? '✓' : '✗'} {label}</Badge>)}
          </div>
        </Card>
      )}
    </>
  );
}

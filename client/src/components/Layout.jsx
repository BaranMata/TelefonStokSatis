import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE, date } from '../lib/format';
import { Icon } from './ui';

/** Rol, yetki ve plan modülüne göre menü. Sunucu aynı kuralları ayrıca zorunlu tutar. */
function menu({ user, can, hasModule }) {
  if (user.role === 'super_admin') {
    return [
      { section: 'Platform' },
      { to: '/admin', icon: 'dashboard', label: 'Genel Bakış', end: true },
      { to: '/admin/isletmeler', icon: 'building', label: 'İşletmeler' },
      { to: '/admin/planlar', icon: 'layers', label: 'Planlar ve Limitler' },
      { section: 'İzleme' },
      { to: '/admin/islem-gunlugu', icon: 'activity', label: 'İşlem Günlükleri' },
      { to: '/admin/hatalar', icon: 'alert', label: 'Hata Kayıtları' },
      { to: '/admin/yedekler', icon: 'database', label: 'Yedekleme' },
    ];
  }
  const items = [{ section: 'İşletme' }];
  if (can('report.view') && hasModule('reports')) items.push({ to: '/', icon: 'dashboard', label: 'Panel', end: true });
  if (can('stock.view', 'stock.edit', 'sale.create') && hasModule('stock')) items.push({ to: '/stok', icon: 'phone', label: 'Stok' });
  if (can('purchase.create') && hasModule('stock')) items.push({ to: '/alis', icon: 'download', label: 'Alış / Stok Girişi' });
  if (can('sale.create') && hasModule('sales')) items.push({ to: '/satis', icon: 'cart', label: 'Satış' });
  if (can('trade.create') && hasModule('trade')) items.push({ to: '/takas', icon: 'swap', label: 'Takas' });
  if (can('report.view', 'sale.create', 'purchase.create', 'trade.create')) items.push({ to: '/islemler', icon: 'list', label: 'İşlemler' });
  if (can('customer.manage', 'sale.create', 'trade.create')) items.push({ to: '/musteriler', icon: 'users', label: 'Müşteriler' });
  if (can('supplier.manage', 'purchase.create')) items.push({ to: '/tedarikciler', icon: 'truck', label: 'Tedarikçiler' });
  if (can('stock.count') && hasModule('stock_count')) items.push({ to: '/sayim', icon: 'clipboard', label: 'Stok Sayımı' });
  if (can('report.view') && hasModule('reports')) items.push({ to: '/raporlar', icon: 'chart', label: 'Raporlar' });
  if (can('stock.view', 'stock.edit') && hasModule('barcode')) items.push({ to: '/etiketler', icon: 'barcode', label: 'Barkod Etiketleri' });
  if (user.role === 'tenant_admin') {
    items.push(
      { section: 'Yönetim' },
      { to: '/yonetim/isletme', icon: 'building', label: 'İşletme Profili' },
      { to: '/yonetim/personel', icon: 'users', label: 'Personel ve Yetkiler' },
      { to: '/yonetim/faaliyet', icon: 'activity', label: 'Faaliyet Geçmişi' },
      { to: '/yonetim/abonelik', icon: 'card', label: 'Abonelik' },
    );
  }
  return items;
}

export default function Layout() {
  const auth = useAuth();
  const { user, tenant, subscription, logout } = auth;
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const items = menu(auth);
  const initials = user.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('');

  return (
    <div className="layout">
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <div className="brand-logo"><Icon name="phone" size={18} /></div>
          <div>
            Telefon Takip
            <small>{tenant ? tenant.name : 'Platform Yönetimi'}</small>
          </div>
        </div>
        <nav className="nav">
          {items.map((it, i) =>
            it.section ? <div key={i} className="nav-section">{it.section}</div> : (
              <NavLink key={it.to} to={it.to} end={it.end}><Icon name={it.icon} />{it.label}</NavLink>
            ),
          )}
          <div className="nav-section">Hesap</div>
          <NavLink to="/profil"><Icon name="user" />Profilim</NavLink>
        </nav>
        {subscription?.plan && (
          <div className="sidebar-foot">
            Plan: <b style={{ color: '#fff' }}>{subscription.plan.name}</b>
            <br />
            {subscription.expired ? 'Süresi doldu' : `Bitiş: ${date(subscription.ends_at)} (${subscription.daysLeft} gün)`}
          </div>
        )}
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Menü"><Icon name="menu" /></button>
          <div className="spacer" />
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div className="meta">
              <b>{user.full_name}</b>
              <small>{ROLE[user.role]}</small>
            </div>
            <button className="btn sm" title="Çıkış" onClick={async () => { await logout(); nav('/giris'); }}><Icon name="logout" /><span className="hide-sm">Çıkış</span></button>
          </div>
        </header>
        {subscription?.expired && (
          <div className="banner danger">
            <b>Abonelik süreniz doldu.</b> Sistem salt okunur modda; yeni işlem yapılamaz.
            {user.role === 'tenant_admin' ? <Link to="/yonetim/abonelik">Aboneliği yenile →</Link> : <span>İşletme yöneticinize başvurun.</span>}
          </div>
        )}
        {!subscription?.expired && subscription?.plan?.is_trial && subscription.daysLeft <= 5 && (
          <div className="banner warn">
            Ücretsiz deneme süresinin bitmesine <b>{subscription.daysLeft} gün</b> kaldı.
            {user.role === 'tenant_admin' && <Link to="/yonetim/abonelik">Plan seç →</Link>}
          </div>
        )}
        <main className="content" key={loc.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

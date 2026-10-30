import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import { Login, Register, ForgotPassword, ResetPassword, AcceptInvite } from './pages/AuthPages';
import Dashboard from './pages/Dashboard';
import Stock from './pages/Stock';
import DeviceDetail from './pages/DeviceDetail';
import Purchase from './pages/Purchase';
import Sale from './pages/Sale';
import Trade from './pages/Trade';
import Transactions from './pages/Transactions';
import { Customers, Suppliers } from './pages/Parties';
import StockCount from './pages/StockCount';
import Reports from './pages/Reports';
import Labels from './pages/Labels';
import Profile from './pages/Profile';
import { BusinessProfile, Staff, Activity, Subscription } from './pages/Business';
import { AdminOverview, Tenants, TenantDetail, Plans, AuditLogs, ErrorLogs, Backups } from './pages/Admin';

function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/giris" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user, can, hasModule } = useAuth();
  if (user.role === 'super_admin') return <Navigate to="/admin" replace />;
  if (can('report.view') && hasModule('reports')) return <Dashboard />;
  if (can('stock.view', 'stock.edit', 'sale.create')) return <Navigate to="/stok" replace />;
  return <Navigate to="/profil" replace />;
}

const tenantRoles = ['tenant_admin', 'user'];

export default function App() {
  return (
    <Routes>
      <Route path="/giris" element={<Login />} />
      <Route path="/kayit" element={<Register />} />
      <Route path="/sifremi-unuttum" element={<ForgotPassword />} />
      <Route path="/sifre-yenile" element={<ResetPassword />} />
      <Route path="/davet" element={<AcceptInvite />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="profil" element={<Profile />} />

        <Route path="stok" element={<RequireAuth roles={tenantRoles}><Stock /></RequireAuth>} />
        <Route path="stok/:id" element={<RequireAuth roles={tenantRoles}><DeviceDetail /></RequireAuth>} />
        <Route path="alis" element={<RequireAuth roles={tenantRoles}><Purchase /></RequireAuth>} />
        <Route path="satis" element={<RequireAuth roles={tenantRoles}><Sale /></RequireAuth>} />
        <Route path="takas" element={<RequireAuth roles={tenantRoles}><Trade /></RequireAuth>} />
        <Route path="islemler" element={<RequireAuth roles={tenantRoles}><Transactions /></RequireAuth>} />
        <Route path="musteriler" element={<RequireAuth roles={tenantRoles}><Customers /></RequireAuth>} />
        <Route path="tedarikciler" element={<RequireAuth roles={tenantRoles}><Suppliers /></RequireAuth>} />
        <Route path="sayim" element={<RequireAuth roles={tenantRoles}><StockCount /></RequireAuth>} />
        <Route path="raporlar" element={<RequireAuth roles={tenantRoles}><Reports /></RequireAuth>} />
        <Route path="etiketler" element={<RequireAuth roles={tenantRoles}><Labels /></RequireAuth>} />

        <Route path="yonetim/isletme" element={<RequireAuth roles={['tenant_admin']}><BusinessProfile /></RequireAuth>} />
        <Route path="yonetim/personel" element={<RequireAuth roles={['tenant_admin']}><Staff /></RequireAuth>} />
        <Route path="yonetim/faaliyet" element={<RequireAuth roles={['tenant_admin']}><Activity /></RequireAuth>} />
        <Route path="yonetim/abonelik" element={<RequireAuth roles={['tenant_admin']}><Subscription /></RequireAuth>} />

        <Route path="admin" element={<RequireAuth roles={['super_admin']}><AdminOverview /></RequireAuth>} />
        <Route path="admin/isletmeler" element={<RequireAuth roles={['super_admin']}><Tenants /></RequireAuth>} />
        <Route path="admin/isletmeler/:id" element={<RequireAuth roles={['super_admin']}><TenantDetail /></RequireAuth>} />
        <Route path="admin/planlar" element={<RequireAuth roles={['super_admin']}><Plans /></RequireAuth>} />
        <Route path="admin/islem-gunlugu" element={<RequireAuth roles={['super_admin']}><AuditLogs /></RequireAuth>} />
        <Route path="admin/hatalar" element={<RequireAuth roles={['super_admin']}><ErrorLogs /></RequireAuth>} />
        <Route path="admin/yedekler" element={<RequireAuth roles={['super_admin']}><Backups /></RequireAuth>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

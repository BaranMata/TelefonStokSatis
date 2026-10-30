import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api';
import { syncClock } from './format';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, tenant: null, subscription: null });

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      setState({ loading: false, ...me });
      return me;
    } catch {
      setState({ loading: false, user: null, tenant: null, subscription: null });
      return null;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ loading: false, user: null, tenant: null, subscription: null }));
    // Sayfalar tarih varsayılanlarını hesaplamadan önce sunucu saatini al
    api.get('/meta').then((m) => syncClock(m.serverNow)).catch(() => {}).finally(refresh);
  }, [refresh]);

  const login = async (email, password) => {
    await api.post('/auth/login', { email, password });
    return refresh();
  };
  const logout = async () => {
    await api.post('/auth/logout');
    setState({ loading: false, user: null, tenant: null, subscription: null });
  };

  /** Arayüzde menü / buton gösterimi için; asıl kontrol sunucuda yapılır */
  const can = (...perms) => {
    const u = state.user;
    if (!u) return false;
    if (u.role === 'tenant_admin') return true;
    return u.role === 'user' && perms.some((p) => u.permissions.includes(p));
  };
  const hasModule = (m) => !!state.subscription?.plan?.modules?.includes(m);

  return <AuthContext.Provider value={{ ...state, refresh, login, logout, can, hasModule }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

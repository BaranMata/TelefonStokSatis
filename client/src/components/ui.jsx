import { createContext, useCallback, useContext, useState } from 'react';
import { STATUS, TENANT_STATUS } from '../lib/format';

// ---------------------------------------------------------------- simgeler (satır içi SVG)
const paths = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  phone: 'M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2zm0 3v13h10V5H7zm4 14.5h2',
  cart: 'M7 18a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4zM5.2 4H21l-2 8H7.4L5.2 4zM3 2h2l3 12h11',
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3',
  swap: 'M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm13 0a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  barcode: 'M3 5v14M6 5v14M10 5v14M13 5v14M17 5v14M21 5v14',
  clipboard: 'M9 2h6v4H9zM8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-7 9l2 2 4-4',
  building: 'M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16M9 7h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2',
  card: 'M2 5h20v14H2zM2 10h20',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8z',
  layers: 'M12 2l10 5-10 5L2 7l10-5zm-10 10l10 5 10-5M2 17l10 5 10-5',
  alert: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  database: 'M12 2c4.97 0 9 1.34 9 3v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5c0-1.66 4.03-3 9-3zm9 3c0 1.66-4.03 3-9 3S3 6.66 3 5m18 7c0 1.66-4.03 3-9 3s-9-1.34-9-3',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35',
  menu: 'M3 6h18M3 12h18M3 18h18',
  x: 'M18 6L6 18M6 6l12 12',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm0 0v6h6',
};
export function Icon({ name, size }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

// ---------------------------------------------------------------- temel bileşenler
export const Card = ({ title, actions, children, className = '', bodyClass = 'card-body' }) => (
  <div className={`card ${className}`}>
    {(title || actions) && (
      <div className="card-head">
        {typeof title === 'string' ? <h3>{title}</h3> : title}
        {actions && <div className="actions">{actions}</div>}
      </div>
    )}
    <div className={bodyClass}>{children}</div>
  </div>
);

export const Stat = ({ label, value, hint, icon }) => (
  <div className="card stat">
    <div className="label">{icon && <Icon name={icon} size={15} />}{label}</div>
    <div className="value">{value}</div>
    {hint && <div className="hint">{hint}</div>}
  </div>
);

export const PageHead = ({ title, sub, actions }) => (
  <div className="page-head">
    <div>
      <h1>{title}</h1>
      {sub && <div className="sub">{sub}</div>}
    </div>
    {actions && <div className="actions">{actions}</div>}
  </div>
);

export function Field({ label, error, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

export const Badge = ({ color, children }) => <span className={`badge ${color || ''}`}>{children}</span>;

const statusColor = { in_stock: 'green', reserved: 'orange', sold: 'blue' };
export const StatusBadge = ({ status }) => <Badge color={statusColor[status]}>{STATUS[status]}</Badge>;
const tenantColor = { active: 'green', suspended: 'orange', closed: 'red' };
export const TenantBadge = ({ status }) => <Badge color={tenantColor[status]}>{TENANT_STATUS[status]}</Badge>;

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <div className="pagination small">{total} kayıt</div>;
  return (
    <div className="pagination small">
      <span>{total} kayıt · Sayfa {page}/{pages}</span>
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Önceki</button>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Sonraki</button>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn link" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Empty = ({ children = 'Kayıt bulunamadı' }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="empty">Yükleniyor…</div>;
export const ErrorBox = ({ error }) => (error ? <div className="alert error">{error.message}</div> : null);

export function Progress({ value, max }) {
  if (max === -1) return <div className="small muted">Sınırsız</div>;
  const p = Math.min(100, max ? (value / max) * 100 : 0);
  return <div className={`progress ${p >= 100 ? 'danger' : p >= 80 ? 'warn' : ''}`}><div style={{ width: `${p}%` }} /></div>;
}

// ---------------------------------------------------------------- bildirimler
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'info') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, type }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-host">{items.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}</div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

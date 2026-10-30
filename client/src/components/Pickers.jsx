import { useEffect, useState } from 'react';
import { api, qs } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { clockNow } from '../lib/format';
import { Field, Modal } from './ui';

/** Müşteri / tedarikçi arama ve seçme kutusu; gerekirse yeni kayıt ekler */
export function PartyPicker({ kind = 'customers', value, onChange, label, allowEmpty = true, emptyLabel = 'Seçilmedi' }) {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const isCustomer = kind === 'customers';
  const nameKey = isCustomer ? 'full_name' : 'name';

  useEffect(() => {
    api.get(`/${kind}${qs({ q: dq, pageSize: 50 })}`).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [kind, dq]);

  const selected = items.find((i) => i.id === value);
  return (
    <Field label={label}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 140 }} />
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
          {allowEmpty && <option value="">{emptyLabel}</option>}
          {value && !selected && <option value={value}>#{value}</option>}
          {items.map((i) => <option key={i.id} value={i.id}>{i[nameKey]}{i.phone ? ` — ${i.phone}` : ''}</option>)}
        </select>
        {can(isCustomer ? 'customer.manage' : 'supplier.manage') && <button type="button" className="btn" onClick={() => setAdding(true)}>+ Yeni</button>}
      </div>
      {adding && (
        <QuickParty kind={kind} onClose={() => setAdding(false)} onCreated={(item) => { setItems((x) => [item, ...x]); onChange(item.id); setAdding(false); }} />
      )}
    </Field>
  );
}

function QuickParty({ kind, onClose, onCreated }) {
  const isCustomer = kind === 'customers';
  const [form, setForm] = useState({ name: '', phone: '' });
  const [error, setError] = useState(null);
  const save = async () => {
    try {
      const body = isCustomer ? { full_name: form.name, phone: form.phone } : { name: form.name, phone: form.phone };
      const { item } = await api.post(`/${kind}`, body);
      onCreated(item);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Modal title={isCustomer ? 'Yeni müşteri' : 'Yeni tedarikçi'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn primary" onClick={save}>Kaydet</button></>}>
      {error && <div className="alert error">{error}</div>}
      <div className="stack">
        <Field label={isCustomer ? 'Ad soyad' : 'Firma adı'}><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Telefon"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export const PaymentFields = ({ value, onChange, dueLabel = 'Ödenen tutar' }) => (
  <>
    <Field label="Ödeme yöntemi">
      <select value={value.paymentMethod} onChange={(e) => onChange({ ...value, paymentMethod: e.target.value })}>
        <option value="cash">Nakit</option>
        <option value="card">Kredi kartı</option>
        <option value="transfer">Havale / EFT</option>
        <option value="installment">Taksit</option>
        <option value="mixed">Karma</option>
      </select>
    </Field>
    <Field label={`${dueLabel} (boş = tamamı)`}>
      <input type="number" min="0" step="0.01" value={value.paidAmount ?? ''} onChange={(e) => onChange({ ...value, paidAmount: e.target.value === '' ? null : Number(e.target.value) })} />
    </Field>
    <Field label="İşlem tarihi">
      <input type="datetime-local" value={value.occurredAt} onChange={(e) => onChange({ ...value, occurredAt: e.target.value })} />
    </Field>
  </>
);

export const nowLocal = () => {
  const d = clockNow();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
export const toApiDate = (s) => (s ? s.replace('T', ' ') : undefined);

/** Sunucunun doğrulama hata ayrıntılarını okunur metne çevirir */
export const errorText = (e) => (e.details ? `${e.message}: ${e.details.map((d) => `${d.path} — ${d.message}`).join('; ')}` : e.message);

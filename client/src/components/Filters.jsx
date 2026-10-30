import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/hooks';
import { Field } from './ui';

/** Tarih, işlem türü, IMEI, ürün ve kullanıcı filtreleri (işlemler ve raporlarda ortak) */
export default function TxFilters({ f, setF, extra }) {
  const { can } = useAuth();
  const users = useFetch(can('report.view') ? '/reports/users' : null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1 });
  return (
    <div className="filters">
      <Field label="Başlangıç"><input type="date" value={f.from} onChange={set('from')} /></Field>
      <Field label="Bitiş"><input type="date" value={f.to} onChange={set('to')} /></Field>
      <Field label="İşlem türü">
        <select value={f.type} onChange={set('type')}>
          <option value="">Tümü</option>
          <option value="purchase">Alış</option>
          <option value="sale">Satış</option>
          <option value="trade">Takas</option>
          <option value="sale,trade">Satış + takas</option>
        </select>
      </Field>
      <Field label="IMEI"><input value={f.imei} onChange={set('imei')} placeholder="Kısmi arama" /></Field>
      <Field label="Ürün"><input value={f.product} onChange={set('product')} placeholder="ör. iPhone 13" /></Field>
      {users.data && (
        <Field label="Kullanıcı">
          <select value={f.userId} onChange={set('userId')}>
            <option value="">Tümü</option>
            {users.data.items.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </Field>
      )}
      {extra}
    </div>
  );
}

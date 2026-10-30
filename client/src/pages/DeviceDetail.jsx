import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/hooks';
import { CONDITION, MOVEMENT, STATUS, TX_TYPE, dateTime, money, pct } from '../lib/format';
import Barcode from '../components/Barcode';
import { PartyPicker, errorText } from '../components/Pickers';
import { Badge, Card, ErrorBox, Field, Icon, Loading, Modal, PageHead, StatusBadge, useToast } from '../components/ui';

export function DeviceFields({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="form-grid">
      <Field label="Marka *"><input required value={value.brand} onChange={set('brand')} list="brand-list" /></Field>
      <Field label="Model *"><input required value={value.model} onChange={set('model')} /></Field>
      <Field label="Hafıza"><input value={value.storage || ''} onChange={set('storage')} placeholder="128 GB" /></Field>
      <Field label="Renk"><input value={value.color || ''} onChange={set('color')} /></Field>
      <Field label="IMEI * (15 hane)"><input required value={value.imei} onChange={set('imei')} inputMode="numeric" maxLength={15} className="mono" /></Field>
      <Field label="Seri no"><input value={value.serial_no || ''} onChange={set('serial_no')} /></Field>
      <Field label="Kondisyon">
        <select value={value.condition} onChange={set('condition')}>
          {Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Etiket fiyatı (₺)"><input type="number" min="0" value={value.list_price ?? ''} onChange={set('list_price')} /></Field>
      <Field label="Not" className="full"><input value={value.notes || ''} onChange={set('notes')} /></Field>
    </div>
  );
}

export default function DeviceDetail() {
  const { id } = useParams();
  const { can, hasModule } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch(`/devices/${id}`);
  const [edit, setEdit] = useState(null);
  const [reserve, setReserve] = useState(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { item: d, movements, transactions } = data;

  const saveEdit = async () => {
    try {
      await api.put(`/devices/${d.id}`, { ...edit, list_price: edit.list_price === '' ? null : edit.list_price });
      toast('Cihaz güncellendi', 'success');
      setEdit(null);
      reload();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };
  const doReserve = async () => {
    try {
      await api.post(`/devices/${d.id}/reserve`, reserve);
      toast('Cihaz rezerve edildi', 'success');
      setReserve(null);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const unreserve = async () => {
    try {
      await api.post(`/devices/${d.id}/unreserve`);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHead
        title={`${d.brand} ${d.model}`}
        sub={<>{[d.storage, d.color, CONDITION[d.condition]].filter(Boolean).join(' · ')} &nbsp; <StatusBadge status={d.status} /></>}
        actions={<>
          <Link className="btn" to="/stok">← Stok</Link>
          {hasModule('barcode') && <Link className="btn" to={`/etiketler?ids=${d.id}`}><Icon name="printer" />Etiket</Link>}
          {can('stock.edit') && <button className="btn" onClick={() => setEdit({ brand: d.brand, model: d.model, storage: d.storage, color: d.color, imei: d.imei, serial_no: d.serial_no, condition: d.condition, list_price: d.list_price, notes: d.notes, version: d.version })}>Düzenle</button>}
          {can('stock.edit') && d.status === 'in_stock' && <button className="btn" onClick={() => setReserve({ customerId: null, note: '' })}>Rezerve et</button>}
          {can('stock.edit') && d.status === 'reserved' && <button className="btn" onClick={unreserve}>Rezervi kaldır</button>}
          {can('sale.create') && d.status !== 'sold' && <Link className="btn primary" to={`/satis?device=${d.id}`}><Icon name="cart" />Sat</Link>}
        </>}
      />
      <div className="grid grid-main">
        <Card title="Cihaz bilgileri">
          <dl className="kv">
            <dt>IMEI</dt><dd className="mono">{d.imei}</dd>
            <dt>Seri no</dt><dd className="mono">{d.serial_no || '—'}</dd>
            <dt>Barkod</dt><dd className="mono">{d.barcode}</dd>
            <dt>Alış maliyeti</dt><dd>{money(d.purchase_price)}</dd>
            <dt>Etiket fiyatı</dt><dd>{money(d.list_price)}</dd>
            {d.status === 'reserved' && <><dt>Rezerve</dt><dd>{d.reserved_for_name || 'Müşteri belirtilmedi'} {d.reserved_note && <span className="muted">— {d.reserved_note}</span>}</dd></>}
            {d.status === 'sold' && <>
              <dt>Satış fiyatı</dt><dd>{money(d.sale_price)} <span className="muted small">({dateTime(d.sold_at)})</span></dd>
              <dt>Kâr / zarar</dt><dd className={d.profit >= 0 ? 'pos' : 'neg'}><b>{money(d.profit)}</b> · marj {pct(d.margin)}</dd>
            </>}
            <dt>Not</dt><dd>{d.notes || '—'}</dd>
            <dt>Kayıt</dt><dd className="small muted">{dateTime(d.created_at)} · sürüm {d.version}</dd>
          </dl>
        </Card>
        <Card title="Barkod">
          <div style={{ textAlign: 'center' }}><Barcode value={d.barcode} /></div>
          <div className="small muted" style={{ textAlign: 'center' }}>IMEI: {d.imei}</div>
        </Card>
      </div>

      <div className="grid grid-side mt">
        <Card title="Stok hareket geçmişi">
          <ul className="timeline">
            {movements.map((m) => (
              <li key={m.id}>
                <b>{MOVEMENT[m.type]}</b> {m.from_status !== m.to_status && m.to_status && <span className="small muted">({STATUS[m.from_status] || '—'} → {STATUS[m.to_status]})</span>}
                <div className="small muted">{dateTime(m.created_at)} · {m.user_name || 'sistem'}{m.note ? ` · ${m.note}` : ''}</div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="İşlemler" bodyClass="table-wrap">
          <table>
            <thead><tr><th>Tarih</th><th>İşlem</th><th>Taraf</th><th className="num">Fiyat</th><th className="num">Kâr</th></tr></thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i}>
                  <td className="small">{dateTime(t.occurred_at)}</td>
                  <td><Badge color={t.direction === 'out' ? 'green' : 'blue'}>{TX_TYPE[t.type]} · {t.direction === 'out' ? 'çıkış' : 'giriş'}</Badge> <span className="small muted">#{t.id}</span></td>
                  <td>{t.customer_name || t.supplier_name || '—'}</td>
                  <td className="num">{money(t.unit_price)}</td>
                  <td className="num">{t.direction === 'out' ? <span className={t.unit_price - t.unit_cost >= 0 ? 'pos' : 'neg'}>{money(t.unit_price - t.unit_cost)}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {edit && (
        <Modal wide title="Cihazı düzenle" onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Vazgeç</button><button className="btn primary" onClick={saveEdit}>Kaydet</button></>}>
          <DeviceFields value={edit} onChange={setEdit} />
        </Modal>
      )}
      {reserve && (
        <Modal title="Cihazı rezerve et" onClose={() => setReserve(null)} footer={<><button className="btn" onClick={() => setReserve(null)}>Vazgeç</button><button className="btn primary" onClick={doReserve}>Rezerve et</button></>}>
          <div className="stack">
            <PartyPicker label="Müşteri" value={reserve.customerId} onChange={(customerId) => setReserve({ ...reserve, customerId })} />
            <Field label="Not (ör. kapora)"><input value={reserve.note} onChange={(e) => setReserve({ ...reserve, note: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

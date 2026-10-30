import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isValidImei } from '../lib/imei';
import { CONDITION, money } from '../lib/format';
import { PartyPicker, PaymentFields, errorText, nowLocal, toApiDate } from '../components/Pickers';
import { Card, Field, Icon, Modal, PageHead, useToast } from '../components/ui';

const emptyRow = () => ({ brand: '', model: '', storage: '', color: '', imei: '', serial_no: '', condition: 'used', cost: '', list_price: '' });

/** "Marka;Model;Hafıza;Renk;IMEI;Seri no;Maliyet;Etiket fiyatı" satırlarını ayrıştırır (; , veya sekme) */
function parseBulk(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^marka/i.test(l))
    .map((l) => {
      const c = l.split(/[;\t,]/).map((x) => x.trim());
      return { ...emptyRow(), brand: c[0] || '', model: c[1] || '', storage: c[2] || '', color: c[3] || '', imei: c[4] || '', serial_no: c[5] || '', cost: c[6] || '', list_price: c[7] || '' };
    });
}

export default function Purchase() {
  const { hasModule } = useAuth();
  const toast = useToast();
  const [partyType, setPartyType] = useState('supplier');
  const [partyId, setPartyId] = useState(null);
  const [rows, setRows] = useState([emptyRow()]);
  const [pay, setPay] = useState({ paymentMethod: 'transfer', paidAmount: null, occurredAt: nowLocal() });
  const [notes, setNotes] = useState('');
  const [bulk, setBulk] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const setRow = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const dupImeis = new Set(rows.map((r) => r.imei).filter((v, i, a) => v && a.indexOf(v) !== i));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        supplierId: partyType === 'supplier' ? partyId : null,
        customerId: partyType === 'customer' ? partyId : null,
        devices: rows.map((r) => ({ ...r, cost: Number(r.cost), list_price: r.list_price === '' ? null : Number(r.list_price) })),
        ...pay,
        occurredAt: toApiDate(pay.occurredAt),
        notes,
      };
      const res = await api.post('/purchases', body);
      setResult(res);
      setRows([emptyRow()]);
      toast(`${res.deviceIds.length} cihaz stoka eklendi`, 'success');
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Alış / Stok Girişi" sub="Tekli veya toplu cihaz girişi; her cihaz için barkod otomatik oluşturulur" actions={<button type="button" className="btn" onClick={() => setBulk('')}><Icon name="file" />Toplu yapıştır (CSV)</button>} />
      {result && (
        <div className="alert success" style={{ marginBottom: 16 }}>
          İşlem #{result.transactionId} kaydedildi, {result.deviceIds.length} cihaz stokta.{' '}
          {hasModule('barcode') && <Link to={`/etiketler?ids=${result.deviceIds.join(',')}`}>Barkod etiketlerini yazdır →</Link>}
        </div>
      )}
      <form onSubmit={submit} className="stack">
        <Card title="Kimden alındı?">
          <div className="form-grid">
            <Field label="Kaynak">
              <select value={partyType} onChange={(e) => { setPartyType(e.target.value); setPartyId(null); }}>
                <option value="supplier">Tedarikçi (toptan)</option>
                <option value="customer">Bireysel kişi (ikinci el)</option>
              </select>
            </Field>
            <div style={{ gridColumn: 'span 2' }}>
              <PartyPicker key={partyType} kind={partyType === 'supplier' ? 'suppliers' : 'customers'} label={partyType === 'supplier' ? 'Tedarikçi' : 'Satıcı kişi'} value={partyId} onChange={setPartyId} />
            </div>
          </div>
        </Card>

        <Card title={`Cihazlar (${rows.length})`} actions={<button type="button" className="btn sm" onClick={() => setRows([...rows, emptyRow()])}><Icon name="plus" />Satır ekle</button>} bodyClass="table-wrap">
          <table>
            <thead><tr><th>Marka *</th><th>Model *</th><th>Hafıza</th><th>Renk</th><th>IMEI *</th><th>Seri no</th><th>Kondisyon</th><th>Maliyet ₺ *</th><th>Etiket ₺</th><th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const bad = r.imei && (!isValidImei(r.imei) || dupImeis.has(r.imei));
                return (
                  <tr key={i}>
                    <td><input required value={r.brand} onChange={(e) => setRow(i, 'brand', e.target.value)} style={{ minWidth: 90 }} /></td>
                    <td><input required value={r.model} onChange={(e) => setRow(i, 'model', e.target.value)} style={{ minWidth: 120 }} /></td>
                    <td><input value={r.storage} onChange={(e) => setRow(i, 'storage', e.target.value)} style={{ minWidth: 70 }} /></td>
                    <td><input value={r.color} onChange={(e) => setRow(i, 'color', e.target.value)} style={{ minWidth: 80 }} /></td>
                    <td>
                      <input required className="mono" maxLength={15} value={r.imei} onChange={(e) => setRow(i, 'imei', e.target.value.replace(/\D/g, ''))} style={{ minWidth: 140, borderColor: bad ? 'var(--danger)' : undefined }} />
                      {bad && <div className="small neg">{dupImeis.has(r.imei) ? 'Listede tekrar' : 'Geçersiz IMEI'}</div>}
                    </td>
                    <td><input value={r.serial_no} onChange={(e) => setRow(i, 'serial_no', e.target.value)} style={{ minWidth: 90 }} /></td>
                    <td>
                      <select value={r.condition} onChange={(e) => setRow(i, 'condition', e.target.value)} style={{ minWidth: 115 }}>
                        {Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td><input required type="number" min="0" value={r.cost} onChange={(e) => setRow(i, 'cost', e.target.value)} style={{ minWidth: 90 }} /></td>
                    <td><input type="number" min="0" value={r.list_price} onChange={(e) => setRow(i, 'list_price', e.target.value)} style={{ minWidth: 90 }} /></td>
                    <td>{rows.length > 1 && <button type="button" className="btn sm danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Sil</button>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={7}>Toplam</td><td className="num">{money(total)}</td><td colSpan={2}></td></tr></tfoot>
          </table>
        </Card>

        <Card title="Ödeme">
          <div className="form-grid">
            <PaymentFields value={pay} onChange={setPay} />
            <Field label="Not" className="full"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
        </Card>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" disabled={busy}>{busy ? 'Kaydediliyor…' : `Alışı kaydet (${rows.length} cihaz, ${money(total)})`}</button>
        </div>
      </form>

      {bulk !== null && (
        <Modal wide title="Toplu cihaz girişi" onClose={() => setBulk(null)} footer={<><button className="btn" onClick={() => setBulk(null)}>Vazgeç</button><button className="btn primary" onClick={() => { const p = parseBulk(bulk); if (p.length) setRows(p); setBulk(null); }}>Satırları aktar</button></>}>
          <p className="small muted">Excel'den kopyalayıp yapıştırabilirsiniz. Sütun sırası: <b>Marka; Model; Hafıza; Renk; IMEI; Seri no; Maliyet; Etiket fiyatı</b></p>
          <textarea rows={10} className="mono" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Apple;iPhone 13;128 GB;Mavi;356938035643809;F2LXK1;21500;24500\nSamsung;Galaxy A55;256 GB;Lacivert;352099001761481;R58T;14000;16000'} />
          <div className="small muted">{parseBulk(bulk).length} satır algılandı</div>
        </Modal>
      )}
    </>
  );
}

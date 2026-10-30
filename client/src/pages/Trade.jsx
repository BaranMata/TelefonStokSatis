import { useState } from 'react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import DeviceCart from '../components/DeviceCart';
import { DeviceFields } from './DeviceDetail';
import { PartyPicker, PaymentFields, errorText, nowLocal, toApiDate } from '../components/Pickers';
import { Card, Field, Icon, PageHead, useToast } from '../components/ui';

const emptyIncoming = () => ({ brand: '', model: '', storage: '', color: '', imei: '', serial_no: '', condition: 'used', list_price: '', notes: '', value: '' });

export default function Trade() {
  const toast = useToast();
  const [customerId, setCustomerId] = useState(null);
  const [outgoing, setOutgoing] = useState([]);
  const [incoming, setIncoming] = useState([emptyIncoming()]);
  const [pay, setPay] = useState({ paymentMethod: 'cash', paidAmount: null, occurredAt: nowLocal() });
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const outTotal = outgoing.reduce((s, i) => s + Number(i.price || 0), 0);
  const inTotal = incoming.reduce((s, i) => s + Number(i.value || 0), 0);
  const diff = outTotal - inTotal;

  const submit = async (e) => {
    e.preventDefault();
    if (!customerId) return toast('Takas için müşteri seçin', 'error');
    if (!outgoing.length) return toast('Müşteriye verilecek cihazı ekleyin', 'error');
    setBusy(true);
    try {
      const res = await api.post('/trades', {
        customerId,
        outgoing: outgoing.map((i) => ({ deviceId: i.device.id, price: Number(i.price) })),
        incoming: incoming.map((d) => ({ ...d, value: Number(d.value), list_price: d.list_price === '' ? null : Number(d.list_price) })),
        ...pay,
        occurredAt: toApiDate(pay.occurredAt),
        notes,
      });
      setResult(res);
      setOutgoing([]);
      setIncoming([emptyIncoming()]);
      toast('Takas kaydedildi', 'success');
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Takas" sub="Müşterinin cihazı takas değeriyle stoka alınır; fark takas bedeli olarak tahsil edilir / ödenir" />
      {result && (
        <div className="alert success" style={{ marginBottom: 16 }}>
          Takas #{result.transactionId} kaydedildi. Takas bedeli: <b>{money(result.tradeDifference)}</b> {result.tradeDifference >= 0 ? '(müşteriden tahsil)' : '(müşteriye ödenecek)'} · Satış kârı {money(result.profit)}
        </div>
      )}
      <form onSubmit={submit} className="stack">
        <Card title="Müşteri"><PartyPicker label="Müşteri *" value={customerId} onChange={setCustomerId} allowEmpty emptyLabel="Müşteri seçin" /></Card>
        <Card title="1) Müşteriye verilecek cihaz(lar) — stoktan"><DeviceCart items={outgoing} setItems={setOutgoing} /></Card>
        <Card title="2) Müşteriden alınan cihaz(lar)" actions={<button type="button" className="btn sm" onClick={() => setIncoming([...incoming, emptyIncoming()])}><Icon name="plus" />Cihaz ekle</button>}>
          <div className="stack">
            {incoming.map((d, i) => (
              <div key={i} className="card card-body" style={{ background: '#fafbfd' }}>
                <div className="row" style={{ marginBottom: 10 }}>
                  <b>Gelen cihaz {i + 1}</b>
                  {incoming.length > 1 && <button type="button" className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={() => setIncoming(incoming.filter((_, j) => j !== i))}>Kaldır</button>}
                </div>
                <DeviceFields value={d} onChange={(v) => setIncoming(incoming.map((x, j) => (j === i ? v : x)))} />
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <Field label="Takas değeri (maliyet) ₺ *"><input required type="number" min="0" value={d.value} onChange={(e) => setIncoming(incoming.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} /></Field>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="3) Takas bedeli ve ödeme">
          <div className="grid grid-3" style={{ marginBottom: 14 }}>
            <div><div className="muted small">Verilen cihaz(lar)</div><b>{money(outTotal)}</b></div>
            <div><div className="muted small">Alınan cihaz(lar)</div><b>{money(inTotal)}</b></div>
            <div><div className="muted small">{diff >= 0 ? 'Müşteri öder' : 'Müşteriye ödenir'}</div><b className={diff >= 0 ? 'pos' : 'neg'} style={{ fontSize: 18 }}>{money(Math.abs(diff))}</b></div>
          </div>
          <div className="form-grid">
            <PaymentFields value={pay} onChange={setPay} dueLabel="Ödenen fark" />
            <Field label="Not" className="full"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
        </Card>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Takası tamamla'}</button>
        </div>
      </form>
    </>
  );
}

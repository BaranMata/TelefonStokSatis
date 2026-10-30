import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { money } from '../lib/format';
import DeviceCart from '../components/DeviceCart';
import { PartyPicker, PaymentFields, errorText, nowLocal, toApiDate } from '../components/Pickers';
import { Card, Field, PageHead, useToast } from '../components/ui';

export default function Sale() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [items, setItems] = useState([]);
  const [customerId, setCustomerId] = useState(null);
  const [pay, setPay] = useState({ paymentMethod: 'card', paidAmount: null, occurredAt: nowLocal() });
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  // Cihaz detayından "Sat" ile gelindiyse cihazı sepete ekle
  useEffect(() => {
    const id = params.get('device');
    if (id) api.get(`/devices/${id}`).then(({ item }) => {
      if (item.status !== 'sold') {
        setItems([{ device: item, price: item.list_price ?? item.purchase_price }]);
        if (item.reserved_for) setCustomerId(item.reserved_for);
      }
    });
  }, [params]);

  const total = items.reduce((s, i) => s + Number(i.price || 0), 0);
  const submit = async (e) => {
    e.preventDefault();
    if (!items.length) return toast('Satılacak cihaz ekleyin', 'error');
    setBusy(true);
    try {
      const res = await api.post('/sales', {
        customerId,
        items: items.map((i) => ({ deviceId: i.device.id, price: Number(i.price) })),
        ...pay,
        occurredAt: toApiDate(pay.occurredAt),
        notes,
      });
      setResult(res);
      setItems([]);
      setNotes('');
      toast('Satış kaydedildi, stok güncellendi', 'success');
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Satış" sub="Cihazı okutun, fiyatı onaylayın; stok otomatik güncellenir" />
      {result && (
        <div className="alert success" style={{ marginBottom: 16 }}>
          Satış #{result.transactionId}: gelir {money(result.revenue)}, maliyet {money(result.cost)}, kâr <b>{money(result.profit)}</b>
        </div>
      )}
      <form onSubmit={submit} className="stack">
        <Card title="Satılacak cihazlar"><DeviceCart items={items} setItems={setItems} /></Card>
        <Card title="Müşteri ve ödeme">
          <div className="form-grid">
            <div style={{ gridColumn: 'span 2' }}><PartyPicker label="Müşteri" value={customerId} onChange={setCustomerId} emptyLabel="Perakende (kayıtsız müşteri)" /></div>
            <PaymentFields value={pay} onChange={setPay} dueLabel="Tahsil edilen" />
            <Field label="Not" className="full"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
        </Card>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" disabled={busy || !items.length}>{busy ? 'Kaydediliyor…' : `Satışı tamamla (${money(total)})`}</button>
        </div>
      </form>
    </>
  );
}

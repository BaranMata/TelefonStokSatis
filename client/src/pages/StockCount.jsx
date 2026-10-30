import { useState } from 'react';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { dateTime } from '../lib/format';
import { Badge, Card, Field, Loading, PageHead, Stat, StatusBadge, useToast } from '../components/ui';

const RESULT = { ok: ['green', 'Bulundu'], not_in_stock: ['orange', 'Satılmış cihaz'], unknown: ['red', 'Kayıtsız'] };

function ActiveCount({ id, onClosed }) {
  const toast = useToast();
  const { data, reload } = useFetch(`/stock-counts/${id}`);
  const [code, setCode] = useState('');
  if (!data) return <Loading />;
  const c = data.item;
  const scan = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      const r = await api.post(`/stock-counts/${id}/scan`, { code: code.trim() });
      if (r.result !== 'ok') toast(r.result === 'unknown' ? 'Bu kod stokta kayıtlı değil' : 'Bu cihaz satılmış görünüyor', 'error');
      setCode('');
      reload();
    } catch (err) {
      toast(err.message, 'error');
      setCode('');
    }
  };
  const close = async () => {
    if (!window.confirm('Sayım kapatılsın mı? Okutulmayan cihazlar "eksik" olarak işaretlenecek.')) return;
    const r = await api.post(`/stock-counts/${id}/close`);
    toast(`Sayım kapatıldı: ${r.found}/${r.expected} bulundu, ${r.missing} eksik`, 'success');
    onClosed();
  };
  const okCount = data.scans.filter((s) => s.result === 'ok').length;
  return (
    <div className="stack">
      <div className="grid grid-4">
        <Stat label="Beklenen" value={c.status === 'open' ? okCount + data.missing.length : c.expected} />
        <Stat label="Okutulan (bulundu)" value={c.status === 'open' ? okCount : c.found} />
        <Stat label="Eksik" value={c.status === 'open' ? data.missing.length : c.missing} />
        <Stat label="Beklenmeyen" value={data.scans.filter((s) => s.result !== 'ok').length} />
      </div>
      {c.status === 'open' && (
        <Card title={`Sayım #${c.id} — okutma`} actions={<button className="btn success" onClick={close}>Sayımı kapat</button>}>
          <form onSubmit={scan} className="row" style={{ flexWrap: 'nowrap' }}>
            <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="IMEI veya barkod okutun…" />
            <button className="btn primary">Okut</button>
          </form>
        </Card>
      )}
      <div className="grid grid-2">
        <Card title={`Okutulanlar (${data.scans.length})`} bodyClass="table-wrap scroll-box">
          <table>
            <thead><tr><th>Kod</th><th>Cihaz</th><th>Sonuç</th><th>Saat</th></tr></thead>
            <tbody>
              {data.scans.map((s) => (
                <tr key={s.id}><td className="mono">{s.code}</td><td>{s.brand ? `${s.brand} ${s.model}` : '—'}</td><td><Badge color={RESULT[s.result][0]}>{RESULT[s.result][1]}</Badge></td><td className="small">{dateTime(s.created_at).slice(-5)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={`${c.status === 'open' ? 'Henüz okutulmayan' : 'Eksik çıkan'} cihazlar (${data.missing.length})`} bodyClass="table-wrap scroll-box">
          <table>
            <thead><tr><th>Cihaz</th><th>IMEI</th><th>Durum</th></tr></thead>
            <tbody>
              {data.missing.map((d) => <tr key={d.id}><td>{d.brand} {d.model} <span className="small muted">{d.storage}</span></td><td className="mono">{d.imei}</td><td><StatusBadge status={d.status} /></td></tr>)}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

export default function StockCount() {
  const toast = useToast();
  const list = useFetch('/stock-counts');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState(null);
  if (!list.data) return <Loading />;
  const open = list.data.items.find((c) => c.status === 'open');
  const current = selected ?? open?.id;

  const start = async () => {
    try {
      const r = await api.post('/stock-counts', { note });
      setSelected(r.id);
      list.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHead title="Stok Sayımı" sub="Raftaki cihazları okutun; sistem kayıtlarıyla karşılaştırılır" />
      {!open && (
        <Card title="Yeni sayım başlat">
          <div className="row">
            <Field label="Açıklama"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ör. Ekim ayı sonu sayımı" /></Field>
            <button className="btn primary" style={{ alignSelf: 'flex-end' }} onClick={start}>Sayımı başlat</button>
          </div>
        </Card>
      )}
      {current && <div className="mt"><ActiveCount key={current} id={current} onClosed={() => list.reload()} /></div>}
      <Card title="Geçmiş sayımlar" className="mt" bodyClass="table-wrap">
        <table>
          <thead><tr><th>No</th><th>Başlangıç</th><th>Kapanış</th><th>Açıklama</th><th>Sayan</th><th className="num">Beklenen</th><th className="num">Bulunan</th><th className="num">Eksik</th><th></th></tr></thead>
          <tbody>
            {list.data.items.map((c) => (
              <tr key={c.id}>
                <td>#{c.id}</td><td className="small">{dateTime(c.started_at)}</td><td className="small">{c.closed_at ? dateTime(c.closed_at) : <Badge color="orange">Açık</Badge>}</td>
                <td>{c.note || '—'}</td><td className="small">{c.started_by_name}</td>
                <td className="num">{c.expected}</td><td className="num">{c.found ?? '—'}</td><td className="num">{c.missing ?? '—'}</td>
                <td><button className="btn sm" onClick={() => setSelected(c.id)}>Görüntüle</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data.items.length && <div className="empty">Henüz sayım yapılmadı</div>}
      </Card>
    </>
  );
}

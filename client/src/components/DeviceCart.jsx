import { useEffect, useState } from 'react';
import { api, qs } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { money, pct } from '../lib/format';
import { ScanBox } from '../pages/Stock';
import { StatusBadge, useToast } from './ui';

/** Satış / takas için stoktan cihaz seçme listesi (okutma veya arama ile) */
export default function DeviceCart({ items, setItems }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [results, setResults] = useState([]);

  const add = (d) => {
    if (d.status === 'sold') return toast(`${d.brand} ${d.model} satılmış`, 'error');
    if (items.some((i) => i.device.id === d.id)) return toast('Cihaz zaten listede', 'error');
    setItems([...items, { device: d, price: d.list_price ?? Math.round(d.purchase_price * 1.15) }]);
    setQ('');
    setResults([]);
  };

  // Yazıldıkça stoktaki (satılabilir) cihazlar aranır
  useEffect(() => {
    if (!dq || dq.length < 2) return setResults([]);
    let alive = true;
    api.get(`/devices${qs({ q: dq, status: 'in_stock,reserved', pageSize: 8 })}`).then((r) => alive && setResults(r.items)).catch(() => {});
    return () => { alive = false; };
  }, [dq]);

  const totals = items.reduce((s, i) => ({ price: s.price + Number(i.price || 0), cost: s.cost + i.device.purchase_price }), { price: 0, cost: 0 });
  const profit = totals.price - totals.cost;

  return (
    <div className="stack">
      <div className="grid grid-2">
        <ScanBox onFound={add} placeholder="IMEI / barkod okutun ve Enter'a basın" autoFocus />
        <div style={{ position: 'relative' }}>
          <input placeholder="veya marka / model ile arayın…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && results.length > 0 && (
            <div className="card" style={{ position: 'absolute', zIndex: 10, left: 0, right: 0, top: 40, maxHeight: 280, overflow: 'auto' }}>
              {results.map((d) => (
                <button type="button" key={d.id} className="btn" style={{ width: '100%', justifyContent: 'space-between', border: 0, borderRadius: 0 }} onClick={() => add(d)}>
                  <span>{d.brand} {d.model} {d.storage} <span className="muted small">{d.color}</span></span>
                  <span className="mono small">{d.imei}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Cihaz</th><th>IMEI</th><th>Durum</th><th className="num">Maliyet</th><th className="num">Satış fiyatı ₺</th><th className="num">Kâr</th><th></th></tr></thead>
          <tbody>
            {items.map((it, i) => {
              const p = Number(it.price || 0) - it.device.purchase_price;
              return (
                <tr key={it.device.id}>
                  <td><b>{it.device.brand} {it.device.model}</b><div className="small muted">{[it.device.storage, it.device.color].filter(Boolean).join(' · ')}</div></td>
                  <td className="mono">{it.device.imei}</td>
                  <td><StatusBadge status={it.device.status} />{it.device.reserved_for_name && <div className="small muted">{it.device.reserved_for_name}</div>}</td>
                  <td className="num">{money(it.device.purchase_price)}</td>
                  <td className="num"><input type="number" min="0" value={it.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} style={{ width: 120, textAlign: 'right' }} /></td>
                  <td className={`num ${p >= 0 ? 'pos' : 'neg'}`}>{money(p)}</td>
                  <td><button type="button" className="btn sm danger" onClick={() => setItems(items.filter((_, j) => j !== i))}>Çıkar</button></td>
                </tr>
              );
            })}
            {!items.length && <tr><td colSpan={7} className="empty">Henüz cihaz eklenmedi</td></tr>}
          </tbody>
          {items.length > 0 && (
            <tfoot><tr><td colSpan={3}>Toplam</td><td className="num">{money(totals.cost)}</td><td className="num">{money(totals.price)}</td><td className={`num ${profit >= 0 ? 'pos' : 'neg'}`}>{money(profit)} <span className="small muted">{pct(totals.price ? (profit / totals.price) * 100 : null)}</span></td><td></td></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

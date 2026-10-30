import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced, useFetch } from '../lib/hooks';
import { CONDITION, money } from '../lib/format';
import { Card, ErrorBox, Field, Icon, Loading, PageHead, Pagination, StatusBadge, useToast } from '../components/ui';

/** IMEI / barkod okutma kutusu: okuyucu Enter gönderdiğinde cihaz bulunur */
export function ScanBox({ onFound, placeholder = 'IMEI, barkod veya seri no okutun…', autoFocus }) {
  const [code, setCode] = useState('');
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      const { item } = await api.get(`/devices/lookup${qs({ code: code.trim() })}`);
      onFound(item);
      setCode('');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return (
    <form onSubmit={submit} className="row" style={{ flexWrap: 'nowrap' }}>
      <input autoFocus={autoFocus} value={code} onChange={(e) => setCode(e.target.value)} placeholder={placeholder} />
      <button className="btn primary"><Icon name="search" />Bul</button>
    </form>
  );
}

export default function Stock() {
  const nav = useNavigate();
  const { can, hasModule } = useAuth();
  const [f, setF] = useState({ q: '', status: 'in_stock,reserved', brand: '', condition: '', page: 1 });
  const q = useDebounced(f.q);
  const { data, error, loading } = useFetch(`/devices${qs({ ...f, q, pageSize: 25 })}`);
  const meta = useFetch('/devices/meta/brands');
  const [selected, setSelected] = useState(new Set());
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1 });
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <PageHead
        title="Stok"
        sub="Cihaz kayıtları, durum takibi ve hızlı arama"
        actions={<>
          {selected.size > 0 && hasModule('barcode') && <Link className="btn" to={`/etiketler?ids=${[...selected].join(',')}`}><Icon name="printer" />{selected.size} etiket yazdır</Link>}
          {can('purchase.create') && <Link className="btn primary" to="/alis"><Icon name="plus" />Stok girişi</Link>}
        </>}
      />
      <div className="grid grid-main" style={{ marginBottom: 16 }}>
        <Card title="Hızlı arama (IMEI / barkod okuyucu)">
          <ScanBox onFound={(d) => nav(`/stok/${d.id}`)} autoFocus />
        </Card>
        <Card>
          {data && <div className="row" style={{ justifyContent: 'space-around' }}>
            <div><div className="muted small">Listelenen cihaz</div><b style={{ fontSize: 20 }}>{data.summary.count}</b></div>
            <div><div className="muted small">Toplam maliyet</div><b style={{ fontSize: 20 }}>{money(data.summary.stock_cost)}</b></div>
          </div>}
        </Card>
      </div>
      <Card bodyClass="">
        <div className="card-body filters">
          <Field label="Ara"><input value={f.q} onChange={set('q')} placeholder="Marka, model, IMEI…" /></Field>
          <Field label="Durum">
            <select value={f.status} onChange={set('status')}>
              <option value="in_stock,reserved">Stokta + rezerve</option>
              <option value="in_stock">Stokta</option>
              <option value="reserved">Rezerve</option>
              <option value="sold">Satıldı</option>
              <option value="">Tümü</option>
            </select>
          </Field>
          <Field label="Marka">
            <select value={f.brand} onChange={set('brand')}>
              <option value="">Tümü</option>
              {meta.data?.brands.map((b) => <option key={b.brand}>{b.brand}</option>)}
            </select>
          </Field>
          <Field label="Kondisyon">
            <select value={f.condition} onChange={set('condition')}>
              <option value="">Tümü</option>
              {Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? <Loading /> : data && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th style={{ width: 30 }}></th><th>Cihaz</th><th>IMEI</th><th>Barkod</th><th>Kondisyon</th><th>Durum</th><th className="num">Maliyet</th><th className="num">Etiket fiyatı</th><th className="num">Satış / kâr</th></tr>
                </thead>
                <tbody>
                  {data.items.map((d) => (
                    <tr key={d.id} className="clickable" onClick={() => nav(`/stok/${d.id}`)}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} /></td>
                      <td><b>{d.brand} {d.model}</b><div className="small muted">{[d.storage, d.color].filter(Boolean).join(' · ')}</div></td>
                      <td className="mono">{d.imei}</td>
                      <td className="mono">{d.barcode}</td>
                      <td className="small">{CONDITION[d.condition]}</td>
                      <td><StatusBadge status={d.status} />{d.reserved_for_name && <div className="small muted">{d.reserved_for_name}</div>}</td>
                      <td className="num">{money(d.purchase_price)}</td>
                      <td className="num">{money(d.list_price)}</td>
                      <td className="num">{d.status === 'sold' ? <>{money(d.sale_price)}<div className={`small ${d.profit >= 0 ? 'pos' : 'neg'}`}>{money(d.profit)}</div></> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length && <div className="empty">Filtreye uyan cihaz yok</div>}
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ ...f, page })} />
          </>
        )}
      </Card>
    </>
  );
}

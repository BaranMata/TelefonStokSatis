import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { download, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced, useFetch } from '../lib/hooks';
import { TX_TYPE, daysAgo, date, money, pct, today } from '../lib/format';
import TxFilters from '../components/Filters';
import { Card, Field, Icon, Loading, PageHead, Stat, useToast } from '../components/ui';
import { CHART_COLORS } from './Dashboard';

const k = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}B` : v);

function ExportButtons({ report, query }) {
  const { can, hasModule } = useAuth();
  const toast = useToast();
  if (!can('report.export') || !hasModule('export')) return null;
  const go = (format) => download(`/reports/export${qs({ ...query, report, format })}`, `rapor.${format}`).catch((e) => toast(e.message, 'error'));
  return <><button className="btn sm" onClick={() => go('xlsx')}><Icon name="file" />Excel</button><button className="btn sm" onClick={() => go('pdf')}><Icon name="file" />PDF</button></>;
}

function PeriodTab({ query }) {
  const [groupBy, setGroupBy] = useState('day');
  const q = { ...query, groupBy };
  const { data } = useFetch(`/reports/period${qs(q)}`);
  if (!data) return <Loading />;
  const t = data.totals;
  const chart = [...data.rows].reverse();
  return (
    <div className="stack">
      <div className="grid grid-4">
        <Stat label="Gelir" value={money(t.revenue)} hint={`${t.sold_count} cihaz satıldı`} />
        <Stat label="Satılan malın maliyeti" value={money(t.cost)} />
        <Stat label="Tahmini kâr" value={<span className={t.profit >= 0 ? 'pos' : 'neg'}>{money(t.profit)}</span>} hint={`Marj ${pct(t.margin)}`} />
        <Stat label="Alış (stoka giren)" value={money(t.purchase_total)} hint={`${t.purchase_count} cihaz`} />
      </div>
      <Card
        title={
          <div className="row">
            <h3>Alış-satış raporu</h3>
            <div className="tabs" style={{ margin: 0, border: 0 }}>
              {[['day', 'Günlük'], ['week', 'Haftalık'], ['month', 'Aylık']].map(([v, l]) => <button key={v} className={groupBy === v ? 'active' : ''} onClick={() => setGroupBy(v)}>{l}</button>)}
            </div>
          </div>
        }
        actions={<ExportButtons report="period" query={q} />}
        bodyClass=""
      >
        <div className="card-body">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={k} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Bar isAnimationActive={false} dataKey="purchase_total" name="Alış" fill="#7a869a" />
              <Bar isAnimationActive={false} dataKey="revenue" name="Gelir" fill="#1f6feb" />
              <Bar isAnimationActive={false} dataKey="profit" name="Kâr" fill="#12805c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Dönem</th><th className="num">Alınan</th><th className="num">Alış tutarı</th><th className="num">Satılan</th><th className="num">Gelir</th><th className="num">Maliyet</th><th className="num">Kâr</th><th className="num">Marj</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.period}>
                  <td>{r.period}</td><td className="num">{r.purchase_count}</td><td className="num">{money(r.purchase_total)}</td><td className="num">{r.sale_count}</td>
                  <td className="num">{money(r.revenue)}</td><td className="num">{money(r.cost)}</td><td className={`num ${r.profit >= 0 ? 'pos' : 'neg'}`}>{money(r.profit)}</td><td className="num">{pct(r.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DistributionTab() {
  const [status, setStatus] = useState('');
  const { data } = useFetch(`/reports/distribution${qs({ status })}`);
  return (
    <Card
      title={<div className="row"><h3>Marka / model dağılımı</h3><select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}><option value="">Stokta + rezerve</option><option value="sold">Satılanlar</option><option value="all">Tüm kayıtlar</option></select></div>}
      actions={<ExportButtons report="distribution" query={{ status }} />}
      bodyClass=""
    >
      {!data ? <Loading /> : (
        <div className="grid grid-side" style={{ padding: 18 }}>
          <ResponsiveContainer width="100%" height={Math.max(220, data.brands.length * 42)}>
            <BarChart data={data.brands} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="brand" width={80} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar isAnimationActive={false} dataKey="count" name="Adet" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Marka</th><th>Model</th><th className="num">Adet</th><th className="num">Stokta</th><th className="num">Rezerve</th><th className="num">Satıldı</th><th className="num">Maliyet</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.brand + r.model}><td>{r.brand}</td><td>{r.model}</td><td className="num"><b>{r.count}</b></td><td className="num">{r.in_stock}</td><td className="num">{r.reserved}</td><td className="num">{r.sold}</td><td className="num">{money(r.cost)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function DeviceProfitTab({ query }) {
  const { data } = useFetch(`/reports/device-profit${qs(query)}`);
  if (!data) return <Loading />;
  return (
    <Card title="Cihaz bazında kâr / zarar" actions={<ExportButtons report="device-profit" query={query} />} bodyClass="table-wrap">
      <table>
        <thead><tr><th>Tarih</th><th>Cihaz</th><th>IMEI</th><th>İşlem</th><th>Müşteri</th><th className="num">Maliyet</th><th className="num">Satış</th><th className="num">Kâr/Zarar</th><th className="num">Marj</th><th>Kullanıcı</th></tr></thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={`${r.transaction_id}-${r.device_id}`}>
              <td className="small">{date(r.occurred_at)}</td>
              <td><Link to={`/stok/${r.device_id}`}>{r.brand} {r.model}</Link> <span className="small muted">{r.storage}</span></td>
              <td className="mono">{r.imei}</td><td className="small">{TX_TYPE[r.type]}</td><td className="small">{r.customer_name || '—'}</td>
              <td className="num">{money(r.cost)}</td><td className="num">{money(r.price)}</td><td className={`num ${r.profit >= 0 ? 'pos' : 'neg'}`}><b>{money(r.profit)}</b></td><td className="num">{pct(r.margin)}</td><td className="small">{r.user_name}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={5}>Toplam ({data.rows.length} cihaz)</td><td className="num">{money(data.totals.cost)}</td><td className="num">{money(data.totals.price)}</td><td className="num">{money(data.totals.profit)}</td><td className="num">{pct(data.totals.margin)}</td><td></td></tr></tfoot>
      </table>
      {!data.rows.length && <div className="empty">Bu filtrede satış yok</div>}
    </Card>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('period');
  const [f, setF] = useState({ from: daysAgo(30), to: today(), type: '', imei: '', product: '', userId: '' });
  const imei = useDebounced(f.imei);
  const product = useDebounced(f.product);
  const query = { ...f, imei, product };
  const presets = [['Bugün', 0], ['Son 7 gün', 6], ['Son 30 gün', 29], ['Son 90 gün', 89]];
  return (
    <>
      <PageHead title="Raporlar" sub="Gelir, maliyet, tahmini kâr ve dağılım raporları" />
      <div className="tabs">
        {[['period', 'Alış-satış (dönemsel)'], ['profit', 'Cihaz bazında kâr'], ['distribution', 'Marka / model dağılımı']].map(([v, l]) => <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>{l}</button>)}
      </div>
      {tab !== 'distribution' && (
        <Card className="no-print" bodyClass="card-body">
          <TxFilters f={f} setF={setF} extra={<Field label="Hızlı tarih"><select onChange={(e) => e.target.value !== '' && setF({ ...f, from: daysAgo(Number(e.target.value)), to: today() })} defaultValue=""><option value="">Seçin…</option>{presets.map(([l, d]) => <option key={d} value={d}>{l}</option>)}</select></Field>} />
        </Card>
      )}
      <div className="mt">
        {tab === 'period' && <PeriodTab query={query} />}
        {tab === 'profit' && <DeviceProfitTab query={query} />}
        {tab === 'distribution' && <DistributionTab />}
      </div>
    </>
  );
}

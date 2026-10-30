import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { TX_TYPE, dateTime, money, pct } from '../lib/format';
import { Badge, Card, ErrorBox, Loading, PageHead, Stat } from '../components/ui';

export const CHART_COLORS = ['#1f6feb', '#12805c', '#e8710a', '#9e3fd6', '#d6336c', '#0b8ba1', '#7a869a'];
const k = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}B` : v);

function PeriodCard({ title, s }) {
  return (
    <Card title={title}>
      <dl className="kv small" style={{ gridTemplateColumns: '1fr auto' }}>
        <dt>Satılan cihaz</dt><dd className="right">{s.sold_count}</dd>
        <dt>Gelir</dt><dd className="right">{money(s.revenue)}</dd>
        <dt>Maliyet</dt><dd className="right">{money(s.cost)}</dd>
        <dt>Tahmini kâr</dt><dd className={`right ${s.profit >= 0 ? 'pos' : 'neg'}`}><b>{money(s.profit)}</b> <span className="muted">({pct(s.margin)})</span></dd>
        <dt>Alınan cihaz</dt><dd className="right">{s.purchase_count} · {money(s.purchase_total)}</dd>
      </dl>
    </Card>
  );
}

export default function Dashboard() {
  const { tenant } = useAuth();
  const { data, error, loading } = useFetch('/reports/dashboard');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { stock, today, week, month, series, brandDistribution, topModels, recent } = data;
  const chart = series.map((d) => ({ ...d, label: d.day.slice(8, 10) + '.' + d.day.slice(5, 7) }));

  return (
    <>
      <PageHead title="Panel" sub={`${tenant.name} — genel durum`} actions={<Link className="btn" to="/raporlar">Detaylı raporlar</Link>} />
      <div className="grid grid-4">
        <Stat icon="phone" label="Stoktaki cihaz" value={stock.in_stock + stock.reserved} hint={`${stock.in_stock} stokta · ${stock.reserved} rezerve`} />
        <Stat icon="layers" label="Stok maliyeti" value={money(stock.stock_cost)} hint={`Etiket değeri ${money(stock.stock_list_value)}`} />
        <Stat icon="cart" label="Bugünkü satış" value={money(today.revenue)} hint={`${today.sold_count} cihaz · kâr ${money(today.profit)}`} />
        <Stat icon="chart" label="Bu ay tahmini kâr" value={money(month.profit)} hint={`Marj ${pct(month.margin)} · ${month.sold_count} satış`} />
      </div>

      <div className="grid grid-main mt">
        <Card title="Son 30 gün: gelir ve kâr">
          <ResponsiveContainer width="100%" height={270}>
            <ComposedChart data={chart} margin={{ left: -10, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={3} />
              <YAxis tickFormatter={k} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Bar isAnimationActive={false} dataKey="revenue" name="Gelir" fill="#1f6feb" radius={[3, 3, 0, 0]} />
              <Line isAnimationActive={false} dataKey="profit" name="Kâr" stroke="#12805c" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Stokta marka dağılımı">
          <ResponsiveContainer width="100%" height={270}>
            <PieChart>
              <Pie isAnimationActive={false} data={brandDistribution} dataKey="count" nameKey="brand" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {brandDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} cihaz`, n]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-3 mt">
        <PeriodCard title="Bugün" s={today} />
        <PeriodCard title="Bu hafta" s={week} />
        <PeriodCard title="Bu ay" s={month} />
      </div>

      <div className="grid grid-side mt">
        <Card title="Bu ay en çok satan modeller" bodyClass="">
          {topModels.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={topModels.map((m) => ({ ...m, name: `${m.brand} ${m.model}` }))} layout="vertical" margin={{ left: 30, right: 20, top: 10 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar isAnimationActive={false} dataKey="count" name="Adet" fill="#0b8ba1" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty">Bu ay satış yok</div>}
        </Card>
        <Card title="Son işlemler" actions={<Link to="/islemler" className="small">Tümü</Link>} bodyClass="table-wrap">
          <table>
            <thead><tr><th>Tarih</th><th>Tür</th><th>Taraf</th><th>Kullanıcı</th><th className="num">Tutar</th></tr></thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td className="small">{dateTime(t.occurred_at)}</td>
                  <td><Badge color={t.type === 'sale' ? 'green' : t.type === 'trade' ? 'orange' : 'blue'}>{TX_TYPE[t.type]}</Badge></td>
                  <td>{t.customer_name || t.supplier_name || '—'}</td>
                  <td className="small">{t.user_name}</td>
                  <td className="num">{money(t.type === 'purchase' ? t.total_in : t.total_out)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

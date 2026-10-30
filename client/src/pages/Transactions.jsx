import { useState } from 'react';
import { Link } from 'react-router-dom';
import { download, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced, useFetch } from '../lib/hooks';
import { PAYMENT, PAYMENT_STATUS, TX_TYPE, daysAgo, dateTime, money, today } from '../lib/format';
import TxFilters from '../components/Filters';
import { Badge, Card, ErrorBox, Icon, Loading, Modal, PageHead, Pagination, useToast } from '../components/ui';

const typeColor = { purchase: 'blue', sale: 'green', trade: 'orange' };

function TxDetail({ id, onClose }) {
  const { data } = useFetch(`/transactions/${id}`);
  if (!data) return null;
  const t = data.item;
  return (
    <Modal wide title={`${TX_TYPE[t.type]} #${t.id}`} onClose={onClose}>
      <dl className="kv small">
        <dt>Tarih</dt><dd>{dateTime(t.occurred_at)}</dd>
        <dt>{t.supplier_name ? 'Tedarikçi' : 'Müşteri'}</dt><dd>{t.supplier_name || t.customer_name || 'Perakende'} {t.customer_phone && <span className="muted">· {t.customer_phone}</span>}</dd>
        <dt>Kullanıcı</dt><dd>{t.user_name}</dd>
        <dt>Ödeme</dt><dd>{PAYMENT[t.payment_method]} · {PAYMENT_STATUS[t.payment_status]} ({money(t.paid_amount)})</dd>
        {t.type === 'trade' && <><dt>Takas bedeli</dt><dd><b>{money(t.net_amount)}</b> {t.net_amount >= 0 ? '(müşteriden alındı)' : '(müşteriye ödendi)'}</dd></>}
        {t.notes && <><dt>Not</dt><dd>{t.notes}</dd></>}
      </dl>
      <div className="table-wrap mt">
        <table>
          <thead><tr><th>Yön</th><th>Cihaz</th><th>IMEI</th><th className="num">Maliyet</th><th className="num">Fiyat</th><th className="num">Kâr</th></tr></thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.id}>
                <td><Badge color={i.direction === 'out' ? 'green' : 'blue'}>{i.direction === 'out' ? 'Çıkış' : 'Giriş'}</Badge></td>
                <td><Link to={`/stok/${i.device_id}`}>{i.brand} {i.model}</Link> <span className="small muted">{i.storage}</span></td>
                <td className="mono">{i.imei}</td>
                <td className="num">{money(i.unit_cost)}</td>
                <td className="num">{money(i.unit_price)}</td>
                <td className={`num ${i.profit >= 0 ? 'pos' : 'neg'}`}>{i.direction === 'out' ? money(i.profit) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export default function Transactions() {
  const { can, hasModule } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ from: daysAgo(30), to: today(), type: '', imei: '', product: '', userId: '', page: 1 });
  const imei = useDebounced(f.imei);
  const product = useDebounced(f.product);
  const query = { ...f, imei, product };
  const { data, error, loading } = useFetch(`/transactions${qs({ ...query, pageSize: 25 })}`);
  const [open, setOpen] = useState(null);
  const exp = (format) => download(`/transactions/export${qs({ ...query, page: undefined, format })}`, `islemler.${format}`).catch((e) => toast(e.message, 'error'));

  return (
    <>
      <PageHead
        title="İşlemler"
        sub="Alış, satış ve takas kayıtları"
        actions={can('report.export') && hasModule('export') && <>
          <button className="btn" onClick={() => exp('xlsx')}><Icon name="file" />Excel</button>
          <button className="btn" onClick={() => exp('pdf')}><Icon name="file" />PDF</button>
        </>}
      />
      <Card bodyClass="">
        <div className="card-body"><TxFilters f={f} setF={setF} /></div>
        <ErrorBox error={error} />
        {loading && !data ? <Loading /> : data && (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>No</th><th>Tarih</th><th>Tür</th><th>Taraf</th><th>Ürünler</th><th className="num">Giren</th><th className="num">Satış</th><th className="num">Kâr</th><th>Ödeme</th><th>Kullanıcı</th></tr></thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr key={t.id} className="clickable" onClick={() => setOpen(t.id)}>
                      <td className="muted">#{t.id}</td>
                      <td className="small">{dateTime(t.occurred_at)}</td>
                      <td><Badge color={typeColor[t.type]}>{TX_TYPE[t.type]}</Badge></td>
                      <td>{t.customer_name || t.supplier_name || <span className="muted">Perakende</span>}</td>
                      <td className="small" style={{ maxWidth: 260 }}>{t.products}</td>
                      <td className="num">{t.total_in ? money(t.total_in) : '—'}</td>
                      <td className="num">{t.total_out ? money(t.total_out) : '—'}</td>
                      <td className={`num ${t.profit >= 0 ? 'pos' : 'neg'}`}>{t.items_out ? money(t.profit) : '—'}</td>
                      <td className="small">{PAYMENT[t.payment_method]}{t.payment_status !== 'paid' && <> · <Badge color="orange">{PAYMENT_STATUS[t.payment_status]}</Badge></>}</td>
                      <td className="small">{t.user_name}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={5}>Filtre toplamı</td><td className="num">{money(data.sums.total_in)}</td><td className="num">{money(data.sums.total_out)}</td><td className="num">{money(data.sums.profit)}</td><td colSpan={2}></td></tr></tfoot>
              </table>
            </div>
            {!data.items.length && <div className="empty">Filtreye uyan işlem yok</div>}
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ ...f, page })} />
          </>
        )}
      </Card>
      {open && <TxDetail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

import { Fragment, useState } from 'react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced, useFetch } from '../lib/hooks';
import { TX_TYPE, dateTime, money } from '../lib/format';
import { errorText } from '../components/Pickers';
import { Badge, Card, ErrorBox, Field, Icon, Loading, Modal, PageHead, Pagination, useToast } from '../components/ui';

const CONFIG = {
  customers: {
    title: 'Müşteriler',
    sub: 'Satış, takas ve bireysel alım yapılan kişiler',
    perm: 'customer.manage',
    nameKey: 'full_name',
    fields: [['full_name', 'Ad soyad *'], ['phone', 'Telefon'], ['email', 'E-posta'], ['national_id', 'T.C. kimlik no'], ['address', 'Adres', true], ['notes', 'Not', true]],
    columns: [['full_name', 'Ad soyad'], ['phone', 'Telefon'], ['email', 'E-posta'], ['address', 'Adres']],
  },
  suppliers: {
    title: 'Tedarikçiler',
    sub: 'Toptan cihaz alımı yapılan firmalar',
    perm: 'supplier.manage',
    nameKey: 'name',
    fields: [['name', 'Firma adı *'], ['contact_name', 'Yetkili'], ['phone', 'Telefon'], ['email', 'E-posta'], ['tax_no', 'Vergi no'], ['address', 'Adres', true], ['notes', 'Not', true]],
    columns: [['name', 'Firma'], ['contact_name', 'Yetkili'], ['phone', 'Telefon'], ['tax_no', 'Vergi no']],
  },
};

function PartyPage({ kind }) {
  const cfg = CONFIG[kind];
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useFetch(`/${kind}${qs({ q: dq, page, pageSize: 25 })}`);
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const canManage = can(cfg.perm);

  const save = async () => {
    try {
      const body = Object.fromEntries(cfg.fields.map(([k]) => [k, edit[k] || null]));
      if (edit.id) await api.put(`/${kind}/${edit.id}`, body);
      else await api.post(`/${kind}`, body);
      toast('Kaydedildi', 'success');
      setEdit(null);
      reload();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };
  const remove = async (row) => {
    if (!window.confirm(`${row[cfg.nameKey]} silinsin mi?`)) return;
    try {
      await api.delete(`/${kind}/${row.id}`);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHead title={cfg.title} sub={cfg.sub} actions={canManage && <button className="btn primary" onClick={() => setEdit({})}><Icon name="plus" />Yeni kayıt</button>} />
      <Card bodyClass="">
        <div className="card-body"><input placeholder="Ad, telefon, e-posta ile ara…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 360 }} /></div>
        <ErrorBox error={error} />
        {loading && !data ? <Loading /> : data && (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr>{cfg.columns.map(([k, l]) => <th key={k}>{l}</th>)}<th className="num">İşlem</th><th></th></tr></thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => setView(r.id)}>
                      {cfg.columns.map(([k], i) => <td key={k}>{i === 0 ? <b>{r[k]}</b> : r[k] || <span className="muted">—</span>}</td>)}
                      <td className="num">{r.tx_count}</td>
                      <td className="right" onClick={(e) => e.stopPropagation()}>
                        {canManage && <><button className="btn sm" onClick={() => setEdit(r)}>Düzenle</button> <button className="btn sm danger" onClick={() => remove(r)}>Sil</button></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.items.length && <div className="empty">Kayıt yok</div>}
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      {edit && (
        <Modal title={edit.id ? 'Kaydı düzenle' : 'Yeni kayıt'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Vazgeç</button><button className="btn primary" onClick={save}>Kaydet</button></>}>
          <div className="form-grid">
            {cfg.fields.map(([k, l, full]) => (
              <Field key={k} label={l} className={full ? 'full' : ''}><input value={edit[k] || ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>
            ))}
          </div>
        </Modal>
      )}
      {view && <PartyView kind={kind} id={view} onClose={() => setView(null)} />}
    </>
  );
}

function PartyView({ kind, id, onClose }) {
  const { data } = useFetch(`/${kind}/${id}`);
  if (!data) return null;
  const cfg = CONFIG[kind];
  return (
    <Modal wide title={data.item[cfg.nameKey]} onClose={onClose}>
      <dl className="kv small">
        {cfg.fields.slice(1).map(([k, l]) => <Fragment key={k}><dt>{l}</dt><dd>{data.item[k] || '—'}</dd></Fragment>)}
      </dl>
      <h3 className="mt">İşlem geçmişi ({data.transactions.length})</h3>
      <div className="table-wrap mt">
        <table>
          <thead><tr><th>No</th><th>Tarih</th><th>Tür</th><th className="num">Giren</th><th className="num">Satış</th><th>Kullanıcı</th></tr></thead>
          <tbody>
            {data.transactions.map((t) => (
              <tr key={t.id}><td>#{t.id}</td><td className="small">{dateTime(t.occurred_at)}</td><td><Badge>{TX_TYPE[t.type]}</Badge></td><td className="num">{money(t.total_in)}</td><td className="num">{money(t.total_out)}</td><td className="small">{t.user_name}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export const Customers = () => <PartyPage kind="customers" />;
export const Suppliers = () => <PartyPage kind="suppliers" />;

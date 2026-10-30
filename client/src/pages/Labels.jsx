import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api';
import { money } from '../lib/format';
import Barcode from '../components/Barcode';
import { Card, Icon, PageHead, useToast } from '../components/ui';
import { ScanBox } from './Stock';

export default function Labels() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [showPrice, setShowPrice] = useState(true);
  const ids = params.get('ids') || '';

  useEffect(() => {
    if (!ids) return setItems([]);
    api.get(`/devices/labels${qs({ ids })}`).then((r) => setItems(r.items)).catch((e) => toast(e.message, 'error'));
  }, [ids, toast]);

  const setIds = (list) => setParams(list.length ? { ids: list.join(',') } : {});
  const addAllInStock = async () => {
    const r = await api.get('/devices?status=in_stock&pageSize=200');
    setIds(r.items.map((d) => d.id));
  };

  return (
    <>
      <div className="no-print">
        <PageHead
          title="Barkod Etiketleri"
          sub="Code128 barkodlu raf / kutu etiketleri; tarayıcıdan yazdırılır"
          actions={<>
            <button className="btn" onClick={addAllInStock}>Tüm stoktakileri ekle</button>
            {items.length > 0 && <button className="btn" onClick={() => setIds([])}>Temizle</button>}
            <button className="btn primary" disabled={!items.length} onClick={() => window.print()}><Icon name="printer" />Yazdır ({items.length})</button>
          </>}
        />
        <Card>
          <div className="grid grid-2">
            <ScanBox onFound={(d) => !items.some((i) => i.id === d.id) && setIds([...items.map((i) => i.id), d.id])} placeholder="Etiket eklemek için IMEI / barkod okutun" />
            <label className="checkbox"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />Etikette fiyat göster</label>
          </div>
        </Card>
      </div>
      <div className="labels mt">
        {items.map((d) => (
          <div className="barcode-label" key={d.id}>
            <div className="t">{d.brand} {d.model}</div>
            <div className="s">{[d.storage, d.color].filter(Boolean).join(' · ')}</div>
            <Barcode value={d.barcode} height={42} width={1.5} fontSize={11} />
            <div className="s">IMEI {d.imei}</div>
            {showPrice && d.list_price != null && <div className="t" style={{ marginTop: 2 }}>{money(d.list_price)}</div>}
          </div>
        ))}
      </div>
      {!items.length && <div className="empty no-print">Etiket listesi boş. Stok sayfasından cihaz seçin veya burada okutun.</div>}
    </>
  );
}

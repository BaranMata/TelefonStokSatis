import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/** Code128 barkod (SVG) */
export default function Barcode({ value, height = 50, width = 1.6, fontSize = 13 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && value) JsBarcode(ref.current, value, { format: 'CODE128', height, width, fontSize, margin: 4, displayValue: true });
  }, [value, height, width, fontSize]);
  return <svg ref={ref} />;
}

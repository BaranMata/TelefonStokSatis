// Tablo biçimindeki rapor verisini Excel (xlsx) veya PDF olarak üretir.
const ExcelJS = require('exceljs');
const { clockNow } = require('../utils/common');
const PDFDocument = require('pdfkit');

// Türkçe karakterler için gömülü yazı tipi (pdfkit'in varsayılan Helvetica'sı ş, ğ, ı içermez)
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const fmtMoney = (n) => (n == null ? '' : Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/**
 * @param {{title:string, subtitle?:string, columns:{key:string,header:string,width?:number,type?:'money'|'number'|'text'|'percent'}[], rows:object[], totals?:object}} report
 */
async function toExcel(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Telefon Stok ve Satış Takip Sistemi';
  const ws = wb.addWorksheet(report.title.slice(0, 30));
  ws.addRow([report.title]).font = { bold: true, size: 14 };
  if (report.subtitle) ws.addRow([report.subtitle]).font = { italic: true, color: { argb: 'FF666666' } };
  ws.addRow([]);
  const header = ws.addRow(report.columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  });
  for (const row of report.rows) ws.addRow(report.columns.map((c) => row[c.key] ?? ''));
  if (report.totals) {
    const t = ws.addRow(report.columns.map((c, i) => (i === 0 ? 'TOPLAM' : report.totals[c.key] ?? '')));
    t.font = { bold: true };
  }
  report.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width || 16;
    if (c.type === 'money') col.numFmt = '#,##0.00 [$₺-41F]';
    if (c.type === 'percent') col.numFmt = '0.0"%"';
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: report.columns.length > 6 ? 'landscape' : 'portrait', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('r', FONT);
    doc.registerFont('b', FONT_BOLD);

    doc.font('b').fontSize(14).text(report.title);
    if (report.subtitle) doc.font('r').fontSize(9).fillColor('#555').text(report.subtitle).fillColor('#000');
    doc.moveDown(0.6);

    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const totalW = report.columns.reduce((s, c) => s + (c.width || 16), 0);
    const widths = report.columns.map((c) => ((c.width || 16) / totalW) * usable);
    const fmt = (c, v) => (c.type === 'money' ? fmtMoney(v) : c.type === 'percent' && v !== '' && v != null ? `%${Number(v).toFixed(1)}` : v == null ? '' : String(v));

    const drawRow = (values, { bold = false, fill = null } = {}) => {
      doc.font(bold ? 'b' : 'r').fontSize(8);
      const heights = values.map((v, i) => doc.heightOfString(v, { width: widths[i] - 6 }));
      const h = Math.max(...heights) + 6;
      if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
      const y = doc.y;
      let x = doc.page.margins.left;
      if (fill) doc.rect(x, y, usable, h).fill(fill).fillColor(bold && fill === '#1F4E79' ? '#fff' : '#000');
      values.forEach((v, i) => {
        const right = ['money', 'number', 'percent'].includes(report.columns[i].type);
        doc.text(v, x + 3, y + 3, { width: widths[i] - 6, align: right ? 'right' : 'left' });
        x += widths[i];
      });
      doc.fillColor('#000');
      doc.moveTo(doc.page.margins.left, y + h).lineTo(doc.page.margins.left + usable, y + h).strokeColor('#ddd').lineWidth(0.5).stroke();
      doc.x = doc.page.margins.left;
      doc.y = y + h;
    };

    drawRow(report.columns.map((c) => c.header), { bold: true, fill: '#1F4E79' });
    report.rows.forEach((r, idx) => drawRow(report.columns.map((c) => fmt(c, r[c.key])), { fill: idx % 2 ? '#F3F6FA' : null }));
    if (report.totals) drawRow(report.columns.map((c, i) => (i === 0 ? 'TOPLAM' : fmt(c, report.totals[c.key] ?? ''))), { bold: true, fill: '#E2E8F0' });

    doc.moveDown(1).font('r').fontSize(7).fillColor('#888').text(`Oluşturulma: ${clockNow().toLocaleString('tr-TR')} — ${report.rows.length} satır`, doc.page.margins.left);
    doc.end();
  });
}

async function send(res, format, report, baseName) {
  const stamp = clockNow().toISOString().slice(0, 10);
  if (format === 'pdf') {
    const buf = await toPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}-${stamp}.pdf"`);
    return res.send(buf);
  }
  const buf = await toExcel(report);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}-${stamp}.xlsx"`);
  return res.send(buf);
}

module.exports = { toExcel, toPdf, send };

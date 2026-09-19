import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function clean(v, fallback = '—') {
  const s = String(v ?? '').trim();
  return s || fallback;
}

// Standard PDF fonts do not contain every Unicode glyph used by the web UI.
// Normalize common symbols so PDF generation cannot fail on ₹, arrows, smart quotes, etc.
function safeText(v, fallback = '—') {
  return clean(v, fallback)
    .replace(/₹/g, 'Rs. ')
    .replace(/[→➜➔]/g, '->')
    .replace(/[←]/g, '<-')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, '-')
    .replace(/·/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 1200);
}

function wrap(text, max = 92) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function addText(page, text, x, y, font, size, color, maxWidth = 0) {
  const safe = safeText(text);
  const lines = maxWidth ? wrap(safe, Math.max(30, Math.floor(maxWidth / (size * 0.52)))) : [safe];
  for (const line of lines) {
    page.drawText(line, { x, y, size, font, color });
    y -= size * 1.45;
  }
  return y;
}

async function buildPdf(report, email) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.08, 0.10, 0.14);
  const grey = rgb(0.40, 0.44, 0.50);
  const orange = rgb(1, 0.36, 0.10);
  const line = rgb(0.88, 0.89, 0.91);
  const pale = rgb(0.98, 0.97, 0.96);
  const W = 595, H = 842, margin = 42, content = W - margin * 2;
  let page = pdf.addPage([W, H]);
  let y = H - margin;

  const newPage = () => { page = pdf.addPage([W, H]); y = H - margin; };
  const ensure = (need = 50) => { if (y < margin + need) newPage(); };
  const heading = (t) => { ensure(50); page.drawText(safeText(t), { x: margin, y, size: 17, font: bold, color: black }); y -= 25; };
  const para = (t, size = 10) => { ensure(40); y = addText(page, t, margin, y, regular, size, grey, content); y -= 7; };
  const row = (label, value) => {
    ensure(24);
    page.drawText(safeText(label), { x: margin, y, size: 9, font: bold, color: grey });
    y = addText(page, value, 190, y, regular, 9, black, content - 148);
    y -= 4;
  };

  page.drawText('MOTOWORTH', { x: margin, y, size: 11, font: bold, color: orange });
  page.drawText('Detailed Buyer Report', { x: margin, y: y - 24, size: 26, font: bold, color: black });
  page.drawText(safeText(new Date(report.generatedAt || Date.now()).toLocaleString('en-IN')), { x: margin, y: y - 41, size: 9, font: regular, color: grey });
  y -= 62;

  page.drawRectangle({ x: margin, y: y - 82, width: content, height: 82, color: pale, borderColor: line, borderWidth: 1 });
  page.drawText(safeText(report.modelName), { x: margin + 16, y: y - 24, size: 18, font: bold, color: black });
  page.drawText('Your MotoWorth estimate', { x: margin + 16, y: y - 44, size: 9, font: bold, color: grey });
  page.drawText(safeText(report.estimate?.fairPrice), { x: margin + 16, y: y - 70, size: 24, font: bold, color: orange });
  y -= 105;

  heading('1. Bike & buyer inputs');
  for (const [k, v] of Object.entries(report.rows || {})) row(k.replace(/([A-Z])/g, ' $1'), v);
  if (report.checked?.length) {
    y -= 4;
    page.drawText('Known history / wear', { x: margin, y, size: 10, font: bold, color: black });
    y -= 17;
    for (const x of report.checked) { y = addText(page, '- ' + x, margin, y, regular, 9, grey, content); y -= 3; }
  }

  heading('2. Valuation & negotiation');
  row('Buyer range', report.estimate?.fairRange);
  row('Confidence', report.estimate?.confidence);
  row('Opening offer', report.estimate?.openingOffer);
  row('Target close', report.estimate?.targetClose);
  row('Walk-away', report.estimate?.walkAway);
  row('Repair reserve', report.estimate?.repairReserve);
  para(`${report.market?.title}: ${report.market?.text}`);
  para(`${report.negotiation?.title}: ${report.negotiation?.text}`);
  para(`Negotiation guidance: ${report.negotiation?.verdict}. ${report.negotiation?.verdictText}`);
  para(`Suggested conversation: ${report.negotiation?.script}`);

  heading('3. Brand & ownership lens');
  para(report.brand?.theme);
  para(report.brand?.lens);

  heading('4. Ownership-today lens');
  row('Fuel', report.today?.fuel);
  row('Service', report.today?.service);
  row('Parts', report.today?.parts);
  row('Use fit', report.today?.useFit);
  row('Fuel / 1,000 km', report.today?.fuelPer1000);
  row('Fuel / month', report.today?.fuelPerMonth);
  para(report.today?.assumption);
  if (report.today?.why?.length) para('Why it can make sense now: ' + report.today.why.join('; '));
  if (report.today?.pause?.length) para('Reasons to pause / walk away: ' + report.today.pause.join('; '));

  heading('5. Scoring signals');
  row('Condition', report.scoring?.condition);
  row('History', report.scoring?.history);
  row('Ask vs value', report.scoring?.asking);

  heading('6. Market position, sources & methodology');
  para(`Market position: ${report.market?.title}. ${report.market?.text}`);
  para('MotoWorth combines source-backed reference pricing with age, mileage, condition, ownership, history, repair reserve, registration context, ownership-today context and optional market evidence. It is decision support, not a certified appraisal or guarantee of transaction price.');
  for (const s of (report.sources || []).slice(0, 20)) para(`${s.label}: ${s.href}`, 8);

  ensure(40);
  page.drawText(`Report requested with: ${safeText(email)}`, { x: margin, y, size: 8, font: regular, color: grey });
  y -= 14;
  page.drawText('Verify the motorcycle physically, inspect documents, confirm service history and check current local market evidence before closing.', { x: margin, y, size: 8, font: regular, color: grey });

  return pdf.save();
}

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });
  try {
    const { email, report, consent } = req.body || {};
    const normalizedEmail = validEmail(email);
    if (!normalizedEmail) return res.status(400).json({ ok: false, message: 'Enter a valid email address.' });
    if (!consent?.reportDelivery) return res.status(400).json({ ok: false, message: 'Please consent to use your email to generate the requested report.' });
    if (!report?.modelName) return res.status(400).json({ ok: false, message: 'Calculate a valuation before requesting the report.' });

    const pdfBytes = await buildPdf(report, normalizedEmail);
    const slug = safeText(report.modelName, 'bike').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'bike';
    const filename = `motoworth-${slug}-buyer-report.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (e) {
    console.error('MotoWorth PDF generation failed:', e);
    return res.status(500).json({ ok: false, message: 'Could not generate the PDF report. Please try again.' });
  }
}

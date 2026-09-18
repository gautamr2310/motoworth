import dns from 'node:dns/promises';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const CATALOGUE_PATH = path.join(process.cwd(), 'data', 'catalogue.v2.json');

function bad(status, message, extra = {}) {
  return new Response(JSON.stringify({ ok: false, error: message, ...extra }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function normalize(s = '') {
  return String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function stripTags(s = '') {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(s = '') {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function textFromNode(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textFromNode).filter(Boolean).join(' ');
  if (typeof v === 'object') return v.name || v.title || v.value || v.description || '';
  return '';
}

function parseJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = decodeHtml(m[1].trim());
    try {
      const parsed = JSON.parse(raw);
      const push = (x) => {
        if (!x) return;
        if (Array.isArray(x)) x.forEach(push);
        else if (x['@graph']) x['@graph'].forEach(push);
        else blocks.push(x);
      };
      push(parsed);
    } catch (_) {}
  }
  return blocks;
}

function getMeta(html, key, attr = 'property') {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  return decodeHtml((html.match(re)?.[1] || html.match(re2)?.[1] || '').trim());
}

function parseMoney(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '').replace(/₹/g, '').replace(/INR/ig, '').replace(/Rs\.?/ig, '').trim();
  const lakhMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|l)\b/i);
  if (lakhMatch) return Math.round(Number(lakhMatch[1]) * 100000);
  const croreMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:crore|cr)\b/i);
  if (croreMatch) return Math.round(Number(croreMatch[1]) * 10000000);
  const num = Number(cleaned.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) && num > 0 ? Math.round(num) : null;
}

function extractPrice(text) {
  const patterns = [
    /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.\d+)?)\s*(lakh|lac|crore|cr)?/ig,
    /([0-9][0-9,]*(?:\.\d+)?)\s*(lakh|lac|crore|cr)\b/ig
  ];
  const candidates = [];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      const amount = parseMoney(`${m[1]} ${m[2] || ''}`);
      if (amount && amount >= 15000 && amount <= 50000000) candidates.push(amount);
    }
  }
  if (!candidates.length) return null;
  // Listings commonly repeat price in OG + body. Use the most frequent candidate.
  const freq = new Map(candidates.map(v => [v, candidates.filter(x => x === v).length]));
  return [...freq.entries()].sort((a,b) => b[1]-a[1] || a[0]-b[0])[0][0];
}

function extractKm(text) {
  const re = /(\d{1,3}(?:,\d{3})*|\d{4,6})\s*(?:km|kms|kilometers|kilometres)\b/ig;
  const vals = [];
  let m;
  while ((m = re.exec(text))) {
    const n = Number(m[1].replace(/,/g, ''));
    if (n >= 50 && n <= 1000000) vals.push(n);
  }
  if (!vals.length) return null;
  return vals.sort((a,b) => a-b)[0];
}

function extractYear(text) {
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1])).filter(y => y >= 2000 && y <= new Date().getFullYear());
  if (!years.length) return null;
  // Prefer years close to a label like year/model/registered/registration.
  const labeled = [...text.matchAll(/(?:year|model|registered|registration|regn|reg\.?)\D{0,20}(20\d{2})/ig)].map(m => Number(m[1])).filter(y => y >= 2000 && y <= new Date().getFullYear());
  return labeled[0] || years[0];
}

function extractCity(text) {
  const cities = [
    ['Bengaluru','Bengaluru'],['Bangalore','Bengaluru'],['Mumbai','Mumbai'],['Delhi','Delhi NCR'],['New Delhi','Delhi NCR'],
    ['Gurgaon','Delhi NCR'],['Gurugram','Delhi NCR'],['Noida','Delhi NCR'],['Hyderabad','Hyderabad'],['Pune','Pune'],['Chennai','Chennai'],
    ['Kolkata','Kolkata'],['Ahmedabad','Ahmedabad'],['Jaipur','Jaipur'],['Kochi','Other India'],['Mysuru','Other India'],['Mysore','Other India'],
    ['Lucknow','Other India'],['Chandigarh','Other India'],['Indore','Other India'],['Surat','Other India']
  ];
  const n = normalize(text);
  for (const [needle, canonical] of cities) if (n.includes(normalize(needle))) return canonical;
  return null;
}

function inferSeller(text) {
  const n = normalize(text);
  if (/\b(dealer|showroom|automobile dealer|business seller|certified dealer|used bike dealer)\b/.test(n)) return { value: 'dealer', confidence: 'medium' };
  if (/\b(first owner|single owner|direct owner|private seller|individual seller|owner selling)\b/.test(n)) return { value: 'owner', confidence: 'medium' };
  return { value: null, confidence: 'low' };
}

function inferCondition(text) {
  const n = normalize(text);
  if (/\b(accident|accidental|frame damage|chassis damage|structural repair|major damage)\b/.test(n)) return { value: 'poor', confidence: 'medium', evidence: 'listing text mentions accident/damage' };
  if (/\b(excellent condition|mint condition|like new|showroom condition|pristine)\b/.test(n)) return { value: 'excellent', confidence: 'medium', evidence: 'listing text describes excellent condition' };
  if (/\b(average condition|fair condition|needs work|work required)\b/.test(n)) return { value: 'fair', confidence: 'medium', evidence: 'listing text suggests work is required' };
  if (/\b(well maintained|good condition|immaculate|very good condition)\b/.test(n)) return { value: 'good', confidence: 'low', evidence: 'listing text describes good maintenance/condition' };
  return { value: null, confidence: 'low' };
}

function canonicalUrl(raw) {
  const url = new URL(raw);
  url.hash = '';
  return url.toString();
}

function validPublicHost(hostname, addresses) {
  const lower = hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(lower) || lower.endsWith('.local')) return false;
  return addresses.every(ip => !isPrivateIp(ip));
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a,b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    return x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb');
  }
  return true;
}

function matchModel(title, description, catalogue) {
  const hay = normalize(`${title} ${description}`);
  const brandHits = catalogue.brands.filter(b => hay.includes(normalize(b.name)));
  const candidates = catalogue.models.map(m => {
    const brand = catalogue.brands.find(b => b.id === m.brand_id);
    const modelN = normalize(m.name);
    const brandN = normalize(brand?.name || '');
    let score = 0;
    if (modelN && hay.includes(modelN)) score += 5 + Math.min(modelN.length / 10, 2);
    if (brandN && hay.includes(brandN)) score += 3;
    const tokens = modelN.split(' ').filter(t => t.length >= 3);
    score += tokens.filter(t => hay.includes(t)).length * 0.5;
    return { m, score };
  }).filter(x => x.score >= 5).sort((a,b) => b.score-a.score);
  const best = candidates[0];
  if (!best) return null;
  const runner = candidates[1];
  const confidence = best.score >= 8 && (!runner || best.score - runner.score >= 1.2) ? 'high' : 'medium';
  return { id: best.m.id, brand: catalogue.brands.find(b => b.id === best.m.brand_id)?.name || '', model: best.m.name, confidence };
}

function pickJsonLd(jsonlds) {
  const out = { title: '', description: '', price: null, year: null, km: null, brand: '', model: '', city: '', sellerType: null, image: '' };
  for (const j of jsonlds) {
    const type = Array.isArray(j['@type']) ? j['@type'].join(' ') : (j['@type'] || '');
    const offer = j.offers || j.offer;
    if (!out.title) out.title = textFromNode(j.name || j.headline);
    if (!out.description) out.description = textFromNode(j.description);
    if (!out.image) out.image = textFromNode(j.image);
    if (!out.price && offer) out.price = parseMoney(textFromNode(offer.price || offer.lowPrice || offer.priceSpecification?.price));
    if (!out.brand) out.brand = textFromNode(j.brand);
    if (!out.model) out.model = textFromNode(j.model);
    if (!out.year) out.year = Number(j.vehicleModelDate || j.modelDate || j.productionDate || j.datePosted) || null;
    if (!out.km) {
      const q = j.mileageFromOdometer || j.mileage;
      const v = textFromNode(q?.value || q);
      if (v) out.km = extractKm(v) || Number(String(v).replace(/[^0-9]/g,'')) || null;
    }
    const addr = j.address || j.location?.address;
    if (!out.city) out.city = textFromNode(addr?.addressLocality || addr);
    if (!out.sellerType) {
      const seller = j.seller || j.offers?.seller;
      const st = normalize(textFromNode(seller?.['@type'] || seller?.type || seller));
      if (st.includes('organization') || st.includes('automotivebusiness')) out.sellerType = 'dealer';
      else if (st.includes('person')) out.sellerType = 'owner';
    }
    if (type && /product|vehicle|offer|itemlist/i.test(type)) {
      // keep gathered fields; multiple JSON-LD nodes are common.
    }
  }
  return out;
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (_) { return bad(400, 'Send JSON with a listingUrl.'); }
  const raw = String(body?.listingUrl || '').trim();
  if (!raw) return bad(400, 'Listing URL is required.');
  let url;
  try { url = new URL(raw); } catch (_) { return bad(400, 'That does not look like a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) return bad(400, 'Only http and https listing URLs are supported.');
  if (url.port && !['80','443'].includes(url.port)) return bad(400, 'Custom ports are not supported.');

  let addresses;
  try { addresses = (await dns.lookup(url.hostname, { all: true })).map(x => x.address); } catch (_) { return bad(400, 'The listing host could not be resolved.'); }
  if (!validPublicHost(url.hostname, addresses)) return bad(400, 'That URL cannot be fetched safely.');

  let res;
  try {
    res = await fetch(canonicalUrl(raw), {
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
      headers: {
        'user-agent': 'MotoWorth-Listing-Analyzer/1.0 (+https://www.motoworth.com)',
        'accept': 'text/html,application/xhtml+xml'
      }
    });
  } catch (_) {
    return bad(502, 'MotoWorth could not fetch this listing. The marketplace may require a browser session or may block automated requests.', { fallback: 'manual' });
  }
  if (!res.ok) return bad(502, `The listing returned HTTP ${res.status}.`, { fallback: 'manual' });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return bad(415, 'That URL does not return an HTML listing page.', { fallback: 'manual' });
  const html = (await res.text()).slice(0, 3_500_000);

  const jsonlds = parseJsonLd(html);
  const ld = pickJsonLd(jsonlds);
  const title = ld.title || getMeta(html, 'og:title') || getMeta(html, 'twitter:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const description = ld.description || getMeta(html, 'og:description') || getMeta(html, 'description', 'name');
  const image = ld.image || getMeta(html, 'og:image');
  const bodyText = stripTags(html);
  const price = ld.price || extractPrice(`${title} ${description} ${bodyText}`);
  const km = ld.km || extractKm(`${title} ${description} ${bodyText}`);
  const year = ld.year || extractYear(`${title} ${description} ${bodyText}`);
  const city = extractCity(`${ld.city} ${title} ${description} ${bodyText}`) || null;
  const seller = ld.sellerType ? { value: ld.sellerType, confidence: 'high' } : inferSeller(`${title} ${description} ${bodyText}`);
  const condition = inferCondition(`${title} ${description}`);

  let catalogue = { brands: [], models: [], variants: [] };
  try { catalogue = JSON.parse(fs.readFileSync(CATALOGUE_PATH, 'utf8')); } catch (_) {}
  const model = matchModel(title, `${description} ${bodyText.slice(0, 10000)}`, catalogue);
  const matchedModel = catalogue.models.find(m => m.id === model?.id);
  const variant = matchedModel ? catalogue.variants.find(v => v.model_id === matchedModel.id && normalize(`${title} ${description}`).includes(normalize(v.name))) : null;

  const fields = {
    brand: model?.brand || ld.brand || null,
    model: model?.model || ld.model || null,
    variant: variant?.name || null,
    year: year || null,
    km: km || null,
    city,
    seller_type: seller.value,
    condition: condition.value,
    asking_price_inr: price || null
  };
  const extracted = Object.entries(fields).filter(([,v]) => v !== null).length;
  const missing = Object.entries(fields).filter(([,v]) => v === null).map(([k]) => k);
  const confidence = extracted >= 6 && model?.confidence === 'high' ? 'high' : extracted >= 4 ? 'medium' : 'low';

  return new Response(JSON.stringify({
    ok: true,
    source: { url: canonicalUrl(raw), final_url: res.url, domain: url.hostname, fetched_at: new Date().toISOString() },
    listing: { title: decodeHtml(title).slice(0, 220), description: decodeHtml(description).slice(0, 1200), image, fields, matched_model_id: model?.id || null, extraction_confidence: confidence, missing_fields: missing },
    notes: [
      'Fields extracted from publicly returned page metadata/HTML; they should be confirmed before a purchase decision.',
      ...(seller.value ? [] : ['Seller type could not be determined from the listing.']),
      ...(condition.value ? [] : ['Condition was not reliably stated in the listing; MotoWorth will start from a neutral condition assumption.'])
    ]
  }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

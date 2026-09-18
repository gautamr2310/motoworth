export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Use POST.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  const rawUrl = String(body?.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ ok: false, code: 'MISSING_URL', message: 'Paste a listing URL.' });
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch (_) {
    return res.status(400).json({ ok: false, code: 'INVALID_URL', message: 'That does not look like a valid listing URL.' });
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const olx = host === 'olx.in' || host.endsWith('.olx.in');

  // OLX India currently prohibits automated scraping/data-mining in its Terms.
  // We therefore do not attempt to bypass its protections here.
  if (olx) {
    return res.status(200).json({
      ok: false,
      code: 'SOURCE_BLOCKED',
      source: 'OLX',
      message: 'OLX is not available for automated server-side fetching. Open the listing in your browser and paste the listing text into MotoWorth to extract the details, or use a permitted/authorized integration.',
      url: rawUrl,
      next: 'PASTE_TEXT'
    });
  }

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MotoWorth/1.0; +https://www.motoworth.com/)'
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        code: `HTTP_${response.status}`,
        source: host,
        message: `The marketplace returned HTTP ${response.status}. MotoWorth will not try to bypass that restriction. You can still paste the visible listing text for extraction.`,
        url: rawUrl,
        next: 'PASTE_TEXT'
      });
    }

    const title = matchMeta(text, 'og:title') || matchMeta(text, 'twitter:title') || matchTag(text, 'title');
    const description = matchMeta(text, 'og:description') || matchMeta(text, 'description') || '';
    const image = matchMeta(text, 'og:image') || '';
    const jsonLd = extractJsonLd(text);
    const combined = [title, description, ...jsonLd.map(v => safeStringify(v))].join('\n');

    return res.status(200).json({
      ok: true,
      source: host,
      url: rawUrl,
      data: {
        title: clean(title),
        description: clean(description),
        image: image || null,
        rawText: clean(combined).slice(0, 18000)
      }
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      code: 'FETCH_ERROR',
      source: host,
      message: 'MotoWorth could not fetch this listing. You can still paste the visible listing text for extraction.',
      url: rawUrl,
      next: 'PASTE_TEXT'
    });
  }
}

function matchMeta(html, key) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${esc}["'][^>]*>`, 'i');
  const re3 = new RegExp(`<meta[^>]+name=["']${esc}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
  const m = html.match(re1) || html.match(re2) || html.match(re3);
  return m ? decodeEntities(m[1]) : '';
}

function matchTag(html, tag) {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ')) : '';
}

function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const value = JSON.parse(m[1].trim());
      Array.isArray(value) ? out.push(...value) : out.push(value);
    } catch (_) { /* ignore malformed JSON-LD */ }
  }
  return out;
}

function safeStringify(value) {
  try { return JSON.stringify(value); } catch (_) { return ''; }
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

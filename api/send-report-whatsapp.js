import { put } from '@vercel/blob';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const clean = (v, fallback = '—') => String(v ?? '').trim() || fallback;
const money = (v) => clean(v);
const esc = (v) => clean(v).replace(/\s+/g, ' ').slice(0, 500);

function wrap(text, max = 92) {
  const words = String(text || '').split(/\s+/);
  const lines = []; let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function addText(page, text, x, y, font, size, color, maxWidth = 0) {
  const lines = maxWidth ? wrap(text, Math.max(30, Math.floor(maxWidth / (size * 0.52)))) : [String(text)];
  for (const line of lines) { page.drawText(line, { x, y, size, font, color }); y -= size * 1.45; }
  return y;
}

async function buildPdf(report) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.08,0.10,0.14), grey = rgb(0.40,0.44,0.50), orange = rgb(1,0.36,0.10), line = rgb(0.88,0.89,0.91), pale = rgb(0.98,0.97,0.96);
  const W=595, H=842, margin=42, content=W-margin*2;
  let page = pdf.addPage([W,H]), y=H-margin;
  const newPage=()=>{page=pdf.addPage([W,H]);y=H-margin};
  const ensure=(need=50)=>{if(y<margin+need)newPage()};
  const heading=(t)=>{ensure(50); page.drawText(t,{x:margin,y,size:17,font:bold,color:black}); y-=25};
  const para=(t,size=10)=>{ensure(40); y=addText(page,esc(t),margin,y,regular,size,grey,content); y-=7};
  const row=(label,value)=>{ensure(24); page.drawText(label,{x:margin,y,size:9,font:bold,color:grey}); page.drawText(esc(value),{x:190,y,size:9,font:regular,color:black}); y-=17;};

  page.drawText('MOTOWORTH',{x:margin,y,size:11,font:bold,color:orange});
  page.drawText('Detailed Buyer Report',{x:margin,y:y-24,size:26,font:bold,color:black});
  page.drawText(new Date(report.generatedAt||Date.now()).toLocaleString('en-IN'),{x:margin,y:y-41,size:9,font:regular,color:grey});
  y-=62;
  page.drawRectangle({x:margin,y:y-82,width:content,height:82,color:pale,borderColor:line,borderWidth:1});
  page.drawText(esc(report.modelName),{x:margin+16,y:y-24,size:18,font:bold,color:black});
  page.drawText('Your MotoWorth estimate',{x:margin+16,y:y-44,size:9,font:bold,color:grey});
  page.drawText(esc(report.estimate?.fairPrice),{x:margin+16,y:y-70,size:24,font:bold,color:orange});
  y-=105;

  heading('1. Bike & buyer inputs');
  for(const [k,v] of Object.entries(report.rows||{})) row(k.replace(/([A-Z])/g,' $1'),v);
  if(report.checked?.length){y-=4; page.drawText('Known history / wear',{x:margin,y,size:10,font:bold,color:black}); y-=17; for(const x of report.checked) { y=addText(page,'• '+esc(x),margin,y,regular,9,grey,content); y-=3; }}

  heading('2. Valuation & negotiation');
  row('Buyer range',report.estimate?.fairRange); row('Confidence',report.estimate?.confidence); row('Opening offer',report.estimate?.openingOffer); row('Target close',report.estimate?.targetClose); row('Walk-away',report.estimate?.walkAway); row('Repair reserve',report.estimate?.repairReserve);
  para(`${report.market?.title}: ${report.market?.text}`); para(`${report.negotiation?.title}: ${report.negotiation?.text}`); para(`Negotiation guidance: ${report.negotiation?.verdict}. ${report.negotiation?.verdictText}`); para(`Suggested conversation: ${report.negotiation?.script}`);

  heading('3. Brand & ownership lens');
  para(report.brand?.theme); para(report.brand?.lens);

  heading('4. Ownership-today lens');
  row('Fuel',report.today?.fuel); row('Service',report.today?.service); row('Parts',report.today?.parts); row('Use fit',report.today?.useFit); row('Fuel / 1,000 km',report.today?.fuelPer1000); row('Fuel / month',report.today?.fuelPerMonth); para(report.today?.assumption);
  if(report.today?.why?.length){para('Why it can make sense now: '+report.today.why.join('; '));}
  if(report.today?.pause?.length){para('Reasons to pause / walk away: '+report.today.pause.join('; '));}

  heading('5. Scoring signals');
  row('Condition',report.scoring?.condition); row('History',report.scoring?.history); row('Ask vs value',report.scoring?.asking);

  heading('6. Sources & methodology');
  para('MotoWorth combines source-backed reference pricing with age, mileage, condition, ownership, history, repair reserve, registration context, ownership-today context and optional market evidence. It is decision support, not a certified appraisal or guarantee of transaction price.');
  for(const s of (report.sources||[]).slice(0,20)) para(`${s.label}: ${s.href}`,8);
  y-=10; page.drawText('Verify the motorcycle physically, inspect documents, confirm service history and check current local market evidence before closing.',{x:margin,y,size:8,font:regular,color:grey});
  return pdf.save();
}

function normalizeIndianNumber(raw){ const digits=String(raw||'').replace(/\D/g,''); return /^91[6-9]\d{9}$/.test(digits)?digits:null; }

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,message:'Method not allowed'});
  try{
    const {phone,report,consent}=req.body||{};
    const to=normalizeIndianNumber(phone);
    if(!to) return res.status(400).json({ok:false,message:'Invalid WhatsApp number.'});
    if(!consent?.reportDelivery) return res.status(400).json({ok:false,message:'Report delivery consent is required.'});
    if(!report?.modelName) return res.status(400).json({ok:false,message:'Calculate a valuation before requesting the report.'});
    const required=['BLOB_READ_WRITE_TOKEN','WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_TEMPLATE_NAME'];
    const missing=required.filter(k=>!process.env[k]);
    if(missing.length) return res.status(503).json({ok:false,message:'WhatsApp report delivery is not configured yet. Missing server configuration: '+missing.join(', ')});

    const pdfBytes=await buildPdf(report);
    const slug=String(report.modelName).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'bike';
    const blob=await put(`reports/${slug}-${Date.now()}.pdf`,pdfBytes,{access:'public',contentType:'application/pdf',addRandomSuffix:true});

    const graph=`https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const body={messaging_product:'whatsapp',to,type:'template',template:{name:process.env.WHATSAPP_TEMPLATE_NAME,language:{code:process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en_US'},components:[{type:'body',parameters:[{type:'text',text:esc(report.modelName)},{type:'text',text:blob.url}]}]}};
    const wa=await fetch(graph,{method:'POST',headers:{Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const waJson=await wa.json().catch(()=>({}));
    if(!wa.ok) return res.status(502).json({ok:false,message:'WhatsApp could not be reached or the template was rejected.',details:waJson?.error?.message||'WhatsApp API error'});

    // Optional durable consent webhook/CRM handoff. Never send marketing without the separate checkbox.
    if(process.env.LEAD_WEBHOOK_URL){
      try{ await fetch(process.env.LEAD_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:to,reportModel:report.modelName,consent,consentedAt:consent.consentedAt,reportUrl:blob.url})}); }catch(_){ /* delivery must not fail because CRM webhook is unavailable */ }
    }
    return res.status(200).json({ok:true,reportUrl:blob.url,messageId:waJson?.messages?.[0]?.id||null});
  }catch(e){console.error(e);return res.status(500).json({ok:false,message:'Could not prepare or send the MotoWorth report.'});}
}

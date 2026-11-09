import {getStore} from '@netlify/blobs';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validate,hash,source,validUrl} from '../core.mjs';
import {totals,budgetPdf} from '../budget-pdf.mjs';
import {handleAdmin} from '../cloud-admin.mjs';
const load=async name=>JSON.parse(await readFile(process.cwd()+'/tienda/'+name,'utf8'));
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async function(request,context){
 try{
 const cfg=await load('deploy-context.json');if(!cfg.preview)return json({error:'Producción no habilitada.'},503);
 const url=new URL(request.url),route=url.pathname.replace(/^\/api\/|^\/\.netlify\/functions\/commerce\/?/,'');
 const products=await load('catalogue/products.json'),groups=await load('catalogue/groups.json');
 const store=()=>getStore({name:'adela-preview-orders-pr-'+cfg.review,consistency:'strong'});
 if(url.pathname.startsWith('/api/admin/'))return handleAdmin(request,{cfg,store:store(),auth:getStore({name:'adela-preview-auth-pr-'+cfg.review,consistency:'strong'}),products,research:await load('catalogue/pricing-research.json'),ip:context.ip});
 if(request.method==='GET'){
  if(route==='products')return json({products,test_mode:true,privacy_version:'preview-ficticia-2026-11-08'});
  if(route==='visual-catalogue')return json({groups});
  if(route==='session')return json({authenticated:false,setup_needed:false,csrf:null});
  if(route==='product-detail'){
   const sku=url.searchParams.get('sku'),g=groups.find(g=>g.id===sku||g.product_ids.some(id=>products.some(p=>p.id===id&&p.sku===sku))),p=products.find(p=>p.sku===sku)||products.find(p=>g?.product_ids.includes(p.id));
   if(!p)return json({error:'Ficha no encontrada.'},404);
   return json({...p,images:g?.images||[...(p.photo?[{url:p.photo}]:[])],approved:!!p.test,warranty:null,test_mode:true,source:source(url.searchParams.get('origen')),source_label:{marketplace:'Facebook Marketplace',facebook:'Facebook',tienda:'Tienda online',google:'Google',whatsapp:'WhatsApp'}[source(url.searchParams.get('origen'))],links:{whatsapp_url:'',planned_shop_url:url.origin+'/producto/'+p.sku,public_status:'Preview privada, no compartir como tienda de producción'}});
  }
  if(route==='document'||route==='receipt'){
   const token=url.searchParams.get('token')||'';if(!/^[a-f0-9]{64}$/.test(token))return json({error:'No autorizado.'},401);
   const record=await store().get('orders/'+token,{type:'json'});if(!record)return json({error:'Solicitud no encontrada.'},404);
   if(route==='document'){if(url.searchParams.get('order_id')!==record.order_id||url.searchParams.get('kind')!=='presupuesto')return json({error:'Documento no autorizado.'},403);const bytes=await budgetPdf(record);return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename=presupuesto-prueba.pdf','Cache-Control':'no-store'}})}
   return json({order_id:record.order_id,status:record.status,test:true,items:record.items.map(({sku,name,qty})=>({sku,name,qty})),created_at:record.created_at});
  }
  return json({error:'Acceso administrativo no habilitado desde la API pública. Usa la consola autenticada de Netlify.'},401);
 }
 if(request.method!=='POST')return json({error:'Método no permitido.'},405);
 if(request.headers.get('origin')!==url.origin)return json({error:'Origen no autorizado.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Tipo inválido.'},415);
 const raw=await request.text();if(raw.length>16000)return json({error:'Solicitud demasiado grande.'},413);
 const d=JSON.parse(raw);
 if(route==='event'){
  if(!['product_view','link_shown','shop_link_click','whatsapp_click'].includes(d.kind)||!products.some(p=>p.id===d.product_id))return json({error:'Evento inválido.'},400);
  let allowed=false;const ip=hash(context.ip||'unknown'),minute=Math.floor(Date.now()/60000);
  for(let n=0;n<20;n++){const slot=await store().setJSON('event-limits/'+ip+'/'+minute+'/'+n,{test:true},{onlyIfNew:true});if(slot.modified){allowed=true;break}}
  if(!allowed)return json({error:'Límite de medición alcanzado.'},429);
  await store().setJSON('events/'+randomUUID(),{kind:d.kind,product_id:d.product_id,origin:source(d.origin),origin_url:validUrl(String(d.origin_url||'')),reference:String(d.origin_reference||'').slice(0,120),campaign:String(d.campaign||'').slice(0,120),created_at:new Date().toISOString(),test:true,conversation_confirmed:false},{onlyIfNew:true});
  return json({ok:true,measured:true,test:true,conversation_confirmed:false});
 }
 if(route!=='cart-order')return json({error:'Acción bloqueada en preview.'},403);
 const record=validate(d,products),token=hash(d.idempotency_key),key='orders/'+token,payload_hash=hash(raw);
 const existing=await store().get(key,{type:'json'});
 const response=r=>({order_id:r.order_id,status:r.status,test:true,line_count:r.items.length,fulfillment:r.fulfillment,payment_method:r.payment_method,shipping_pending:r.fulfillment==='Contra entrega',total_confirmed:r.quote_totals?.total??null,total_products:r.items.some(i=>i.unit_price==null)?null:r.items.reduce((a,i)=>a+i.qty*i.unit_price,0),receipt_token:token,document_token:token,quote_id:'PRES-'+r.order_id,message:'PRUEBA persistida en almacenamiento independiente. No se cobra, envía ni confirma venta.'});
 if(existing)return existing.payload_hash===payload_hash?json({...response(existing),replayed:true}):json({error:'No reutilices la referencia para otros datos.'},409);
 // Fixed time slots use create-only keys, never read/modify/write counters.
 let allowed=false;const ip=hash(context.ip||'unknown'),minute=Math.floor(Date.now()/60000);
 for(let n=0;n<5;n++){const r=await store().setJSON('limits/'+ip+'/'+minute+'/'+n,{test:true},{onlyIfNew:true});if(r.modified){allowed=true;break}}
 if(!allowed)return json({error:'Límite de pruebas alcanzado; espera un minuto.'},429);
 record.order_id='PRUEBA-NF-'+token.slice(0,12).toUpperCase();record.payload_hash=payload_hash;record.quote_totals=totals(record.items,products,record.fulfillment);
 const saved=await store().setJSON(key,record,{onlyIfNew:true});
 if(!saved.modified){const current=await store().get(key,{type:'json'});if(!current||current.payload_hash!==payload_hash)return json({error:'Conflicto de solicitud.'},409);return json({...response(current),replayed:true})}
 return json(response(record),201);
 }catch(e){return json({error:e instanceof SyntaxError?'JSON inválido.':/Missing|configuration|ENOENT|blob|fetch/i.test(e.message)?'Almacenamiento temporalmente no disponible; no se confirma pedido.':e.message},400)}
}

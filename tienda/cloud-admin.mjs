import {probeSmtpTls,verifySmtpAuthentication} from './smtp-check.mjs';
import {mailReadiness,prepareOrderEmail} from './mail-preparation.mjs';
/* Independent preview administrator. Never imports local accounts or grants Meta access. */
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {orderNotice,requestPdf} from './order-documents.mjs';
import {budgetPdf} from './budget-pdf.mjs';
import {priceReview} from './pricing.mjs';
import {productDraft,photoUpload,categories} from './owner-products.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex'),random=()=>randomBytes(32).toString('hex');
const equal=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y)};
const cookie=(name,value,age)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const cookies=request=>Object.fromEntries((request.headers.get('cookie')||'').split(';').map(s=>s.trim().split('=')));
export class AdminError extends Error{constructor(message,status=400){super(message);this.status=status}}
const fail=(message,status=400)=>{throw new AdminError(message,status)};
const json=(d,status=200,headers={})=>new Response(JSON.stringify(d),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
export function passwordRecord(password){if(typeof password!=='string'||password.length<16||password.length>128)fail('Usa una contraseña exclusiva de 16 a 128 caracteres.');const salt=randomBytes(16).toString('hex');return {salt,hash:scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864}).toString('hex')}}
export function verifyPassword(password,record){if(typeof password!=='string'||password.length>128)return false;const derived=scryptSync(password,record.salt,64,{N:32768,r:8,p:1,maxmem:67108864}).toString('hex');return equal(derived,record.hash)}
export async function records(store,prefix,limit=500){const out=[];for await(const page of store.list({prefix,paginate:true})){for(const b of page.blobs){if(out.length>=limit)fail('Se supera el límite seguro de exportación; requiere paginación adicional.',409);const r=await store.getWithMetadata(b.key,{type:'json'});if(r)out.push({key:b.key,version:r.etag,...r.data})}}return out}
export async function rateSlot(store,scope,identity,limit,windowMs,now=Date.now()){
 const bucket=Math.floor(now/windowMs),who=hash(identity||'unknown');for(let n=0;n<limit;n++){const r=await store.setJSON(`limits/${scope}/${who}/${bucket}/${n}`,{expires_at:now+windowMs},{onlyIfNew:true});if(r.modified)return}fail('Demasiados intentos; espera antes de volver a probar.',429)
}
async function audit(store,action,reference){await store.setJSON('audit/'+Date.now()+'-'+randomBytes(8).toString('hex'),{action,reference,created_at:new Date().toISOString(),test:true},{onlyIfNew:true})}
async function newSession(auth){const token=random(),csrf=random();await auth.setJSON('sessions/'+hash(token),{csrf,expires_at:Date.now()+4*3600000,role:'admin'},{onlyIfNew:true});return {token,csrf}}
async function session(auth,request){const token=cookies(request)['__Host-adela_admin']||'';if(!/^[a-f0-9]{64}$/.test(token))return null;const s=await auth.get('sessions/'+hash(token),{type:'json'});return s&&s.expires_at>Date.now()?{...s,key:'sessions/'+hash(token)}:null}
async function body(request,max=16384){if(request.headers.get('origin')!==new URL(request.url).origin)fail('Origen no autorizado.',403);if(!request.headers.get('content-type')?.startsWith('application/json'))fail('Tipo de solicitud inválido.',415);const text=await request.text();if(text.length>max)fail('Solicitud demasiado grande.',413);try{return JSON.parse(text)}catch{fail('JSON inválido.')}}

export async function handleAdmin(request,{cfg,store,auth,products,research=[],ip,smtpEnv=process.env,smtpChecks={tls:probeSmtpTls,auth:verifySmtpAuthentication}}){
 try{
  if(!cfg.preview||!/^\d+$/.test(cfg.review||''))fail('Administración no habilitada fuera de preview.',503);
  const url=new URL(request.url),route=url.pathname.replace(/^\/api\/admin\//,'');const admin=await auth.get('identity/admin',{type:'json'}),s=await session(auth,request);
  if(request.method==='GET'&&route==='session'){
   if(s)return json({authenticated:true,role:'admin',csrf:s.csrf,setup_needed:false});
   if(admin)return json({authenticated:false,setup_needed:false});
   // This first-account flow is reachable only on the canonical private Team-protected preview.
   if(url.hostname!==`deploy-preview-${cfg.review}--catalogo-adela.netlify.app`)return json({authenticated:false,setup_needed:false,setup_blocked:true});
   const nonce=random(),csrf=random();await auth.setJSON('setup/'+hash(nonce),{csrf,expires_at:Date.now()+900000},{onlyIfNew:true});return json({authenticated:false,setup_needed:true,csrf},200,{'Set-Cookie':cookie('__Host-adela_setup',nonce,900)});
  }
  if(request.method==='POST'&&['login','setup'].includes(route)){
   const d=await body(request);await rateSlot(auth,route,ip,5,900000);
   if(route==='setup'){
    if(admin)fail('Ya existe administrador. No se reemplaza.',409);
    if(url.hostname!==`deploy-preview-${cfg.review}--catalogo-adela.netlify.app`)fail('Alta limitada a la preview canónica privada.',403);
    const n=cookies(request)['__Host-adela_setup']||'',intent=await auth.get('setup/'+hash(n),{type:'json'});
    if(!n||!intent||intent.expires_at<=Date.now()||!equal(intent.csrf,request.headers.get('x-csrf-token')))fail('Alta no autorizada o caducada.',403);
    if(d.owner_confirmed!==true)fail('El propietario debe crear personalmente su acceso.');
    const record=passwordRecord(d.password),saved=await auth.setJSON('identity/admin',{...record,created_at:new Date().toISOString()},{onlyIfNew:true});if(!saved.modified)fail('Ya existe administrador.',409);await audit(auth,'admin_created','owner');
   }else if(!admin||!verifyPassword(d.password,admin))fail('Credenciales incorrectas.',401);
   const created=await newSession(auth);await audit(auth,'login','admin');return json({authenticated:true,csrf:created.csrf},200,{'Set-Cookie':cookie('__Host-adela_admin',created.token,14400)});
  }
  if(!s)fail('Inicia sesión de administración.',401);
  if(request.method==='GET'){
   if(route==='data'){
    const [orders,drafts,events,backups,history]=await Promise.all([records(store,'orders/'),records(store,'product-drafts/'),records(store,'events/'),records(store,'backup-index/'),records(auth,'audit/')]);
    const ownerProducts=await records(store,'owner-products/'),reads=await records(store,'notice-reads/'),mailDrafts=await records(store,'email-drafts/'),notices=orders.map(o=>orderNotice(o,reads.find(r=>r.order_id===o.order_id))).sort((a,b)=>b.created_at.localeCompare(a.created_at));
    return json({orders,drafts,events,backups,audit:history,products,notices,mail_drafts:mailDrafts.map(({eml,...draft})=>draft),mail_readiness:mailReadiness(smtpEnv),smtp_last_check:await auth.get('settings/smtp-last-check',{type:'json'}),notice_delivery:{channel:'CRM interno',external_enabled:false,email_enabled:false,proposed_email:'venta@adelacomunicaciones.com',email_verified:false,mailbox_owner_confirmed:true,provider_configured:false,whatsapp_enabled:false},owner_products:ownerProducts,product_categories:categories,research,test:true,real_sales_enabled:false,storage:'Netlify Blobs · almacenes exclusivos de PR '+cfg.review});
   }
   if(route==='email-draft'){
    const token=url.searchParams.get('order_token')||'';if(!/^[a-f0-9]{64}$/.test(token))fail('Referencia inválida.');const draft=await store.get('email-drafts/'+token,{type:'json'});if(!draft)fail('Primero prepara el borrador.',404);
    return new Response(draft.eml,{headers:{'Content-Type':'message/rfc822','Content-Disposition':'attachment; filename=borrador-'+draft.order_id+'.eml','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(route==='document'){
    const token=url.searchParams.get('order_token')||'',kind=url.searchParams.get('kind');if(!/^[a-f0-9]{64}$/.test(token)||!['presupuesto','solicitud'].includes(kind))fail('Documento inválido.');
    const order=await store.get('orders/'+token,{type:'json'});if(!order||order.test!==true)fail('Solicitud de prueba no encontrada.',404);
    const bytes=await(kind==='solicitud'?requestPdf(order):budgetPdf(order));return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename='+kind+'-'+order.order_id+'.pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(route==='product-image'){
    const id=url.searchParams.get('id')||'';if(!/^[a-f0-9]{64}$/.test(id))fail('Imagen inválida.');
    const asset=await store.get('owner-images/'+id,{type:'json'});if(!asset)fail('Fotografía no encontrada.',404);
    return new Response(Buffer.from(asset.base64,'base64'),{headers:{'Content-Type':asset.mime,'Content-Length':String(asset.bytes),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
   }
   if(route==='backup'){
    const id=url.searchParams.get('id')||'';if(!/^[a-f0-9]{32}$/.test(id))fail('Referencia inválida.');const b=await auth.get('backups/'+id,{type:'json'});if(!b)fail('Copia no encontrada.',404);return json(b,200,{'Content-Disposition':'attachment; filename="adela-preview-backup-'+id+'.json"'});
   }
   fail('Ruta administrativa no encontrada.',404);
  }
  if(request.method!=='POST')fail('Método no permitido.',405);
  if(!equal(s.csrf,request.headers.get('x-csrf-token')))fail('Token CSRF inválido.',403);
  const d=await body(request,route==='product-image'?2850000:16384);
  if(route==='product-image'){
   await rateSlot(auth,'upload',ip,12,60000);let asset;try{asset=photoUpload(d)}catch(e){fail(e.message)}
   await store.setJSON('owner-images/'+asset.id,asset,{onlyIfNew:true});await audit(auth,'owner_image_saved',asset.id);
   return json({id:asset.id,mime:asset.mime,width:asset.width,height:asset.height,url:'/api/admin/product-image?id='+asset.id});
  }
  if(route==='product-save'){
   if(typeof d.sku!=='string'||!d.sku.match(/^(OWN-[A-Z0-9][A-Z0-9-]{0,31}|ADE-\d{4})$/))fail('Código inválido.');
   const key='owner-products/'+d.sku,current=await store.getWithMetadata(key,{type:'json'});
   if(d.sku.startsWith('ADE-')&&!products.some(p=>p.sku===d.sku&&!p.test))fail('Producto original inexistente.');
   if(current&&(!current.etag||d.expected_version!==current.etag)||!current&&d.expected_version)fail('El producto cambió; recarga antes de guardar.',409);
   let draft;try{draft=productDraft(d,current?.data)}catch(e){fail(e.message)}
   for(const id of draft.images.filter(x=>!x.startsWith('/media/')))if(!await store.get('owner-images/'+id,{type:'json'}))fail('Primero sube la fotografía.');
   const saved=await store.setJSON(key,draft,current?{onlyIfMatch:current.etag}:{onlyIfNew:true});if(!saved.modified)fail('Otro operador guardó este código; recarga.',409);
   await audit(auth,'owner_product_saved',draft.sku);return json({...draft,version:saved.etag});
  }
  if(route==='smtp-check'){
   if(d.confirm_no_send!==true||!['tls','auth'].includes(d.mode))fail('Confirma una prueba sin envío.');
   if(d.mode==='auth'&&!mailReadiness(smtpEnv).credentials_configured)fail('Faltan variables SMTP privadas. No se ha intentado autenticar.',409);
   await rateSlot(auth,'smtp-check',ip,3,900000);
   const result=await(d.mode==='tls'?smtpChecks.tls():smtpChecks.auth(smtpEnv));const safe={...result,mode:d.mode,external_enabled:false};await auth.setJSON('settings/smtp-last-check',safe);await audit(auth,'smtp_check_'+(safe.ok?'passed':'failed'),d.mode);return json(safe);
  }
  if(route==='email-prepare'){
   if(!/^[a-f0-9]{64}$/.test(d.order_token||''))fail('Referencia de pedido inválida.');const order=await store.get('orders/'+d.order_token,{type:'json'});if(!order||order.test!==true)fail('Solicitud de prueba no encontrada.',404);
   const draft=prepareOrderEmail(order,new URL(request.url).origin),saved=await store.setJSON('email-drafts/'+d.order_token,draft,{onlyIfNew:true});if(saved.modified)await audit(auth,'email_draft_prepared',order.order_id);const existing=await store.get('email-drafts/'+d.order_token,{type:'json'});const {eml,...safe}=existing;return json({...safe,reused:!saved.modified});
  }
  if(route==='notice-read'){
   if(!/^[a-f0-9]{64}$/.test(d.order_token||''))fail('Referencia de aviso inválida.');const order=await store.get('orders/'+d.order_token,{type:'json'});if(!order||order.test!==true)fail('Solicitud de prueba no encontrada.',404);
   const read={order_id:order.order_id,read:true,read_at:new Date().toISOString()},saved=await store.setJSON('notice-reads/'+d.order_token,read,{onlyIfNew:true});if(saved.modified)await audit(auth,'notice_read',order.order_id);return json({ok:true,read:true,external_sent:false});
  }
  if(route==='logout'){await auth.setJSON(s.key,{expires_at:0,csrf:'',role:'revoked'});return json({ok:true},200,{'Set-Cookie':cookie('__Host-adela_admin','',0)})}
  if(route==='order-state'){
   if(!/^[a-f0-9]{64}$/.test(d.order_token||''))fail('Referencia de pedido inválida.');
   const key='orders/'+d.order_token,current=await store.getWithMetadata(key,{type:'json'});if(!current||current.data.test!==true)fail('Solo pedidos ficticios.',404);
   const allowed={'Nuevo':['Contactado','Pendiente de confirmación','Descartado'],'Contactado':['Pendiente de confirmación','Descartado'],'Pendiente de confirmación':['Contactado','Venta simulada','Descartado'],'Venta simulada':[],'Descartado':[]};
   if(!(allowed[current.data.status]||[]).includes(d.status))fail('Transición no permitida.');
   if(d.status==='Venta simulada'&&(d.human_verified!==true||current.data.quote_totals?.total==null))fail('Faltan importes confirmados y revisión humana simulada.');
   if(typeof current.etag!=='string'||!current.etag||d.expected_version!==current.etag)fail('El pedido cambió; recarga antes de guardar.',409);
   const updated={...current.data,status:d.status,updated_at:new Date().toISOString(),history:[...(current.data.history||[]),{from:current.data.status,to:d.status,at:new Date().toISOString(),simulated:true}]};
   const saved=await store.setJSON(key,updated,{onlyIfMatch:current.etag});if(!saved.modified)fail('Otro operador cambió el pedido; recarga.',409);await audit(auth,'order_state',updated.order_id);return json({ok:true,status:updated.status,test:true});
  }
  if(route==='product-review'){
   const p=products.find(p=>p.sku===d.sku&&!p.test);if(!p)fail('Producto no encontrado.');const review=priceReview(p,d,products);
   if(d.approve===true&&!review.can_approve)fail(review.reasons.join('; '));
   const draft={sku:p.sku,approved_price:d.approved_price??null,total_unit_cost:d.total_unit_cost??null,stock:d.stock??null,warranty:String(d.warranty||'').slice(0,500),reference_price:d.reference_price??null,reference_url:String(d.reference_url||'').slice(0,500),reference_seller_id:String(d.reference_seller_id||'').slice(0,30),reference_verified:d.reference_verified===true,same_model_condition:d.same_model_condition===true,costs_confirmed:d.costs_confirmed===true,tax_basis_confirmed:d.tax_basis_confirmed===true,photo_verified:d.photo_verified===true,model_verified:d.model_verified===true,human_reviewed:d.human_reviewed===true,...review,status:d.approve===true?'Aprobado solo para revisión; no habilita ventas':'Pendiente',updated_at:new Date().toISOString()};
   await store.setJSON('product-drafts/'+p.sku,draft);await audit(auth,'product_review',p.sku);return json(draft);
  }
  if(route==='backup'){
   const orders=await records(store,'orders/'),drafts=await records(store,'product-drafts/'),owner_products=await records(store,'owner-products/'),owner_images=await records(store,'owner-images/'),notice_reads=await records(store,'notice-reads/'),email_drafts=await records(store,'email-drafts/');if(orders.some(o=>o.test!==true))fail('No exportar datos reales en este laboratorio.');
   const id=randomBytes(16).toString('hex'),snapshot={schema:'adela-preview-backup-v1',test:true,created_at:new Date().toISOString(),orders,drafts,owner_products,owner_images,notice_reads,email_drafts};
   if(JSON.stringify(snapshot).length>24000000)fail('La copia supera 24 MB; requiere exportación paginada antes de añadir más imágenes.',409);
   const checksum=hash(JSON.stringify(snapshot));
   await auth.setJSON('backups/'+id,{...snapshot,checksum},{onlyIfNew:true});await store.setJSON('backup-index/'+id,{id,created_at:snapshot.created_at,orders:orders.length,checksum},{onlyIfNew:true});await audit(auth,'backup_created',id);return json({id,orders:orders.length,checksum,download_url:'/api/admin/backup?id='+id});
  }
  if(route==='restore-drill'){
   if(!/^[a-f0-9]{32}$/.test(d.backup_id||''))fail('Copia inválida.');const b=await auth.get('backups/'+d.backup_id,{type:'json'});if(!b||b.test!==true||b.schema!=='adela-preview-backup-v1')fail('Copia de laboratorio no encontrada.');const {checksum,...snapshot}=b;if(hash(JSON.stringify(snapshot))!==checksum)fail('La copia no supera la comprobación de integridad.');
   const drill=randomBytes(16).toString('hex');for(const o of b.orders){if(o.test!==true)fail('No se restauran pedidos reales.');await auth.setJSON('restore-drills/'+drill+'/'+hash(o.key),o,{onlyIfNew:true})}
   const restored=await records(auth,'restore-drills/'+drill+'/');if(restored.length!==b.orders.length)fail('Conteo de restauración incorrecto.',500);
   for(const asset of [...(b.owner_products||[]),...(b.owner_images||[]),...(b.notice_reads||[]),...(b.email_drafts||[])])await auth.setJSON('restore-catalogue/'+drill+'/'+hash(asset.key),asset,{onlyIfNew:true});
   const catalogueRestored=await records(auth,'restore-catalogue/'+drill+'/');if(catalogueRestored.length!==(b.owner_products||[]).length+(b.owner_images||[]).length+(b.notice_reads||[]).length+(b.email_drafts||[]).length)fail('Conteo de catálogo incorrecto.',500);
   await audit(auth,'restore_drill_passed',drill);return json({ok:true,restored:restored.length,catalogue_restored:catalogueRestored.length,active_orders_overwritten:false,drill_id:drill});
  }
  fail('Acción no habilitada.',404);
 }catch(e){return json({error:e instanceof AdminError?e.message:'No se pudo completar la operación administrativa.'},e instanceof AdminError?e.status:500)}
}

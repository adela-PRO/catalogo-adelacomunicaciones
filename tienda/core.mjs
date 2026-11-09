import {createHash} from 'node:crypto';
export const hash=s=>createHash('sha256').update(s).digest('hex');
export const source=s=>['marketplace','facebook','tienda','google','whatsapp'].includes(s)?s:'tienda';
export function validate(d,products){
 if(d.fictitious!==true||d.privacy!==true)throw Error('Solo pruebas ficticias con aceptación de privacidad.');
 if(d.website)throw Error('Formulario rechazado.');
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(d.idempotency_key||''))throw Error('Referencia de solicitud inválida.');
 if(!/^CLIENTE FICTICIO[ A-ZÁÉÍÓÚÑ0-9—-]{0,90}$/i.test(d.name||'')||!/^000\d{7,12}$/.test(d.phone||''))throw Error('Usa CLIENTE FICTICIO y teléfono de prueba empezando por 000. No introduzcas datos reales.');
 for(const k of ['sector','address','reference','province','municipality','campaign','origin_reference'])if(typeof(d[k]??'')!=='string'||String(d[k]||'').length>500)throw Error('Campo inválido: '+k);
 if((d.sector||'').trim().length<2)throw Error('Indica sector ficticio.');
 if(!['Recoger en tienda','Contra entrega'].includes(d.fulfillment))throw Error('Modalidad inválida.');
 if(d.fulfillment==='Contra entrega')for(const k of ['address','reference','province','municipality'])if((d[k]||'').trim().length<2)throw Error('Completa '+k+' ficticio.');
 if(!Array.isArray(d.items)||!d.items.length||d.items.length>20)throw Error('Carrito inválido.');
 const email=String(d.email||'');if(email&&!/^[^\s@]+@[^\s@]+\.invalid$/.test(email))throw Error('Usa correo de prueba terminado en .invalid.');
 const seen=new Set();const lines=d.items.map(i=>{const p=products.find(p=>p.id===i.product_id);if(!p||seen.has(p.id)||!Number.isInteger(i.qty)||i.qty<1||i.qty>100)throw Error('Producto o cantidad inválidos.');seen.add(p.id);return {product_id:p.id,sku:p.sku,name:p.name,qty:i.qty,unit_price:p.approved_price,origin_code:source(i.origin||d.origin),origin_url:validUrl(i.origin_url||d.origin_url||''),origin_reference:String(i.origin_reference||p.sku).slice(0,120),campaign:String(i.campaign||d.campaign||'').slice(0,120)}});
 return {test:true,status:'Nuevo',created_at:new Date().toISOString(),customer:{name:d.name,phone:d.phone,sector:d.sector,email},items:lines,fulfillment:d.fulfillment,delivery:d.fulfillment==='Contra entrega'?Object.fromEntries(['address','reference','province','municipality'].map(k=>[k,d[k]])):null,origin_code:source(d.origin),campaign:String(d.campaign||'').slice(0,120),consents:[{purpose:'Gestionar pedido',accepted:true},{purpose:'Promociones',accepted:d.marketing===true,channel:d.marketing_channel==='Teléfono'?'Teléfono':'WhatsApp'}],privacy_version:'preview-ficticia-2026-11-08'};
}
export function validUrl(s){if(!s)return '';if(!/^https:\/\/www\.facebook\.com\/(marketplace\/item\/\d+\/?|[A-Za-z0-9.]+\/posts\/[A-Za-z0-9]+\/?)$/.test(s))throw Error('Publicación de origen inválida.');return s;}

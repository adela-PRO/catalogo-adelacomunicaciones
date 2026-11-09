import {createHash} from 'node:crypto';
export const commercialMailbox='venta@adelacomunicaciones.com';
export function mailReadiness(env={}){
 return {provider:'Hostinger Mail',recipient:commercialMailbox,mailbox_owner_confirmed:true,delivery_test_verified:false,host:'smtp.hostinger.com',port:465,secure:true,credentials_configured:env.ADELA_SMTP_USER===commercialMailbox&&typeof env.ADELA_SMTP_PASSWORD==='string'&&env.ADELA_SMTP_PASSWORD.length>0,external_enabled:false,status:'Transporte SMTP preparado solo para pruebas de conexión; envío externo bloqueado'};
}
export function prepareOrderEmail(order,base){
 if(order.test!==true||!/^PRUEBA-NF-[A-Z0-9-]+$/.test(order.order_id||''))throw Error('Solo pedidos ficticios con referencia válida.');
 const url=new URL(base);if(!/^deploy-preview-\d+--catalogo-adela\.netlify\.app$/.test(url.hostname)||url.protocol!=='https:')throw Error('Solo CRM privado de preview autorizado.');
 const subject='[PRUEBA SIN ENVÍO] Nueva solicitud '+order.order_id;
 const lines=['ADELA COMUNICACIONES SRL','BORRADOR DE PRUEBA — NO ENVIADO','', 'Referencia: '+order.order_id,'Modalidad: '+(order.fulfillment==='Contra entrega'?'Contra entrega':'Recoger en tienda'),'Origen declarado: '+(['marketplace','facebook','tienda','google','whatsapp'].includes(order.origin_code)?order.origin_code:'tienda'),'Productos: '+order.items.map(i=>String(i.sku).replace(/[^A-Z0-9-]/g,'')+' × '+i.qty).join(', '),'','Abre el CRM con tu acceso administrativo para consultar los datos del cliente:',url.origin+'/admin','','No confirma venta, pago, existencias ni entrega.','No contiene contraseña, enlace privado del comprador ni dirección o teléfono del cliente.'];
 const text=lines.join('\n'),id=createHash('sha256').update('adela-owner-order-v1:'+order.order_id).digest('hex');
 const eml=['From: Adela Tienda <'+commercialMailbox+'>','To: '+commercialMailbox,'Subject: =?UTF-8?B?'+Buffer.from(subject).toString('base64')+'?=','Message-ID: <'+id+'@adelacomunicaciones.com>','Date: '+new Date(order.created_at).toUTCString(),'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','X-Unsent: 1','X-Adela-Mode: draft-not-sent','',Buffer.from(text).toString('base64').match(/.{1,76}/g).join('\r\n'),''].join('\r\n');
 return {order_id:order.order_id,to:commercialMailbox,from:commercialMailbox,subject,text,eml,message_id:id,status:'Borrador preparado · NO ENVIADO',external_sent:false,created_at:new Date().toISOString()};
}

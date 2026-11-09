import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
export function orderNotice(order,read=null){
 if(order.test!==true||!/^PRUEBA-NF-[A-Z0-9-]+$/.test(order.order_id||''))throw Error('Solo solicitudes de prueba verificables.');
 return {id:order.order_id,order_token:order.key?.split('/')[1]||null,title:'Nueva solicitud de prueba',created_at:order.created_at,customer:order.customer.name,fulfillment:order.fulfillment,origin:order.origin_code,read:read?.read===true,read_at:read?.read_at||null,delivery_channel:'CRM interno',external_sent:false};
}
export async function requestPdf(order){
 if(order.test!==true)throw Error('Solo documentos de prueba.');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),ink=rgb(.07,.18,.20),muted=rgb(.29,.38,.40);let page,y;
 const clean=s=>String(s??'Pendiente').replace(/[^\x20-\x7E\xA0-\xFF]/g,'-');
 const fresh=()=>{page=pdf.addPage([595,842]);page.drawRectangle({x:0,y:750,width:595,height:92,color:rgb(.06,.24,.23)});page.drawText('ADELA COMUNICACIONES SRL',{x:40,y:798,font:bold,size:18,color:rgb(1,1,1)});page.drawText('CONSTANCIA DE SOLICITUD - PRUEBA',{x:40,y:773,font:bold,size:12,color:rgb(.8,.94,.88)});y=720};fresh();
 const line=(text,strong=false,size=10)=>{for(const part of clean(text).match(/.{1,85}(?:\s|$)|.{1,85}/g)||['']){if(y<65)fresh();page.drawText(part.trim(),{x:40,y,font:strong?bold:font,size,color:strong?ink:muted});y-=size+7}};
 const section=text=>{y-=10;line(text,true,12)};
 line('NO ES FACTURA FISCAL NI RECIBO DE PAGO.',true,12);line('No confirma venta, disponibilidad, reserva de stock ni entrega.');
 section('Referencia: '+order.order_id);line('Fecha de registro (UTC): '+order.created_at);line('Estado al descargar: '+order.status);line('Modalidad: '+order.fulfillment);line('Pago solicitado: '+(order.payment_method||(order.fulfillment==='Recoger en tienda'?'Pagar al recoger':'Contra entrega')));
 section('Cliente de prueba');line('Nombre: '+order.customer.name);line('Telefono ficticio: '+order.customer.phone);line('Correo: '+(order.customer.email||'No proporcionado (opcional)'));
 if(order.delivery){section('Datos ficticios de entrega');line('Provincia: '+order.delivery.province);line('Municipio: '+order.delivery.municipality);line('Sector: '+order.customer.sector);line('Direccion: '+order.delivery.address);line('Referencias: '+order.delivery.reference)}else{section('Recogida por coordinar');line('Plaza Valbuena, Monte Largo, segundo nivel, Bajos de Haina, San Cristobal.');line('Horario pendiente de confirmar. Coordina antes de visitar.')}
 section('Productos solicitados');for(const item of order.items){line(item.sku+' | '+item.name,true);line('Cantidad: '+item.qty+' | Precio unitario de prueba: '+(item.unit_price==null?'Pendiente de cotizacion':'RD$ '+Number(item.unit_price).toFixed(2)));}
 const unknown=order.items.some(i=>i.unit_price==null),known=order.items.reduce((n,i)=>n+(i.unit_price==null?0:Math.round(i.unit_price*100)*i.qty),0)/100;
 section('Importes y condiciones');line(unknown?'Importe de productos: pendiente de cotizacion.':'Importe de productos de prueba: RD$ '+known.toFixed(2));if(unknown)line('Importe conocido parcial: RD$ '+known.toFixed(2)+'; no es el total.');line('Transporte, impuestos aplicables y total final: sujetos a confirmacion.');line('Origen declarado: '+(order.origin_code||'Pendiente'));line('Campana: '+(order.campaign||'No proporcionada'));
 section('Contacto comercial');line('WhatsApp: 809-216-4861 | venta@adelacomunicaciones.com');line('Conserva esta referencia. No se ha cobrado ni enviado ningun producto.');line('Los permisos para promociones se registran aparte del pedido.');
 pdf.setTitle('Solicitud de prueba '+order.order_id);pdf.setAuthor('Adela Comunicaciones SRL');return pdf.save();
}

import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
export function totals(lines,products,mode){
 const rows=lines.map(i=>{const p=products.find(p=>p.id===i.product_id);if(p?.approved_price==null||!p?.test)return {...i,base:null,tax:null,total:null};const gross=Math.round(p.approved_price*100)*i.qty,base=Math.round(gross/1.18);return {...i,base:base/100,tax:(gross-base)/100,total:gross/100}});
 const ready=rows.every(i=>i.total!==null),shipping=mode==='Recoger en tienda'?0:null;
 return {lines:rows,subtotal:ready?rows.reduce((s,i)=>s+i.base,0):null,itbis:ready?rows.reduce((s,i)=>s+i.tax,0):null,discount:0,shipping,total:ready&&shipping!==null?rows.reduce((s,i)=>s+i.total,0)+shipping:null};
}
export async function budgetPdf(record){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);let page=pdf.addPage([595,842]),y=790;
 const line=(s,size=10,strong=false)=>{const text=String(s).replace(/[^\x20-\x7E\xA0-\xFF]/g,'-'),parts=text.match(/.{1,82}(?:\s|$)|.{1,82}/g)||[''];for(const part of parts){if(y<45){page=pdf.addPage([595,842]);y=790}page.drawText(part.trim(),{x:40,y,size,font:strong?bold:font,color:rgb(.08,.16,.25)});y-=size+6}};
 const amount=n=>n==null?'Pendiente de confirmar':Number(n).toFixed(2);
 line('ADELA COMUNICACIONES SRL',18,true);line('PRESUPUESTO DE PRUEBA - NO PAGADO',14,true);line('NO ES FACTURA FISCAL. Solo datos ficticios.',11,true);line('Plaza Valbuena, Monte Largo, segundo nivel, Bajos de Haina, San Cristobal, RD.');line('venta@adelacomunicaciones.com | Tel./WhatsApp 809-216-4861');line('RNC, NCF y e-CF: no confirmados / no emitidos.');y-=10;
 line('Pedido: '+record.order_id,11,true);line('Fecha: '+record.created_at);line('Cliente ficticio: '+record.customer.name);line('Correo: '+(record.customer.email||'Pendiente'));line('Modalidad: '+record.fulfillment);
 if(record.delivery)for(const k of ['province','municipality','address','reference'])line(k+': '+record.delivery[k]);y-=10;
 for(const i of record.quote_totals.lines){line(i.sku+' | '+i.name+' | Cantidad '+i.qty,10,true);line('Base RD$ '+amount(i.base)+' | ITBIS RD$ '+amount(i.tax)+' | Importe RD$ '+amount(i.total))}
 for(const [label,key] of [['Subtotal','subtotal'],['Descuento','discount'],['ITBIS','itbis'],['Entrega','shipping'],['TOTAL RD$','total']])line(label+': '+amount(record.quote_totals[key]),11,key==='total');y-=8;
 line('GARANTÍA DEL PRODUCTO',12,true);line('Plazo y condiciones por producto: pendientes de aprobación. Se conservan los derechos legales aplicables. Soporte: venta@adelacomunicaciones.com; indica el pedido.');line('Validez de prueba: 24 horas desde creación. Plazo comercial definitivo pendiente.');line('Disponibilidad, impuestos aplicables, cobertura, entrega y total sujetos a confirmación. No se reserva stock ni se confirma pago. Modelos PDF definitivos pendientes de recibir.');
 return pdf.save();
}

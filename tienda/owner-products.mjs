import {createHash} from 'node:crypto';
export const categories=['Cámaras y DVR','Routers y ONU/OLT','Switches','Fibra óptica','UPS','Seguridad','Accesorios','Otros'];
export function productDraft(d,previous=null){
 const text=(key,max,required=false)=>{const v=d[key]??'';if(typeof v!=='string'||v.length>max||required&&!v.trim())throw Error('Revisa el campo '+key);return v.trim()};
 const sku=text('sku',40,true);if(!/^(?:OWN-[A-Z0-9][A-Z0-9-]{0,31}|ADE-\d{4})$/.test(sku))throw Error('Código inválido: usa OWN- seguido de letras, números o guiones.');
 const name=text('name',160,true),category=text('category',60,true);if(!categories.includes(category))throw Error('Selecciona una categoría válida.');
 const numeric=(key,integer=false)=>{const v=d[key];if(v===null||v===undefined||v==='')return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000000||integer&&!Number.isInteger(v))throw Error('Valor inválido: '+key);return v};
 if(!Array.isArray(d.images)||d.images.length>6||d.images.some(x=>typeof x!=='string'||!(/^[a-f0-9]{64}$/.test(x)||/^\/media\/COM-[A-Za-z0-9.-]+$/.test(x))))throw Error('Máximo seis fotografías válidas.');
 return {sku,name,category,brand:text('brand',80),model:text('model',120),description:text('description',5000),warranty:text('warranty',500),condition:text('condition',80),proposed_price:numeric('proposed_price'),total_unit_cost:numeric('total_unit_cost'),stock:numeric('stock',true),images:[...new Set(d.images)],status:'Borrador privado',approved:false,real_sales_enabled:false,created_at:previous?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
}
// Permit raster formats only, cap both bytes and pixel count before storage.
export function photoUpload(d){
 if(typeof d.base64!=='string'||d.base64.length>2796204||!d.base64.length||d.base64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(d.base64))throw Error('Imagen inválida o superior a 2 MB.');
 const bytes=Buffer.from(d.base64,'base64');if(bytes.length>2097152||bytes.toString('base64')!==d.base64)throw Error('Imagen inválida o superior a 2 MB.');
 let mime,width,height;
 if(bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(8)===13&&bytes.subarray(-8,-4).toString()==='IEND'){
  mime='image/png';width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
 }else if(bytes.length>10&&bytes.readUInt16BE(0)===0xffd8&&bytes.readUInt16BE(bytes.length-2)===0xffd9){
  mime='image/jpeg';let offset=2;while(offset+4<bytes.length){if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===218||marker===217)break;const size=bytes.readUInt16BE(offset);if(size<2||offset+size>bytes.length)break;if([192,193,194].includes(marker)&&size>=8){height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);break}offset+=size}
 }else throw Error('Solo se admiten fotografías JPEG o PNG; no SVG, HTML ni archivos ejecutables.');
 if(!width||!height||width>8000||height>8000||width*height>25000000)throw Error('Dimensiones inválidas o imagen demasiado grande.');
 const id=createHash('sha256').update(bytes).digest('hex');return {id,mime,width,height,bytes:bytes.length,base64:d.base64,created_at:new Date().toISOString()};
}

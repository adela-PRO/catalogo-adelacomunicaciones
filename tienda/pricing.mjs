// Only arithmetic and approval gates. External evidence must be checked by a person.
export const ownSeller='100082243980834';
export function priceReview(p,d,catalogue=[]){
 const numeric=(v)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const reasons=[];const price=d.approved_price,cost=d.total_unit_cost,reference=d.reference_price;
 const target=numeric(reference)&&reference>0?Math.round(reference*90)/100:null;
 if(!numeric(reference)||reference<=0)reasons.push('Precio comparable pendiente');
 if(!/^https:\/\/www\.facebook\.com\/marketplace\/item\/\d+\/?$/.test(d.reference_url||''))reasons.push('Enlace de Marketplace verificable pendiente');
 if(!/^\d+$/.test(d.reference_seller_id||'')||d.reference_seller_id===ownSeller)reasons.push('Vendedor independiente pendiente de verificar');
 const clean=s=>String(s||'').split('?')[0].replace(/\/$/,'');
 if(catalogue.some(x=>x.listing_url&&clean(x.listing_url)===clean(d.reference_url)))reasons.push('No usar una publicación propia como referencia competitiva');
 if(d.reference_verified!==true||d.same_model_condition!==true)reasons.push('Modelo, condición, unidad y moneda comparables sin verificar');
 if(!numeric(cost)||d.costs_confirmed!==true)reasons.push('Costo total por unidad pendiente');
 if(d.tax_basis_confirmed!==true)reasons.push('Base de impuestos y costos de venta pendiente');
 if(!numeric(price)||price<=0)reasons.push('Precio de venta pendiente');
 if(numeric(price)&&numeric(cost)&&price<cost)reasons.push('Bloqueado: el precio genera pérdida');
 if(!Number.isInteger(d.stock)||d.stock<=0)reasons.push('Stock positivo físicamente confirmado pendiente');
 if(d.photo_verified!==true||!p.photo)reasons.push('Fotografía pendiente');
 if(d.model_verified!==true)reasons.push('Identificación física pendiente');
 if(typeof d.warranty!=='string'||!d.warranty.trim()||/pendiente|por confirmar/i.test(d.warranty))reasons.push('Garantía pendiente');
 if(d.human_reviewed!==true)reasons.push('Revisión humana pendiente');
 return {target_10_percent_below:target,profit_before_unlisted_costs:numeric(price)&&numeric(cost)?Math.round((price-cost)*100)/100:null,can_approve:reasons.length===0,reasons,price_approved:false,real_sales_enabled:false};
}

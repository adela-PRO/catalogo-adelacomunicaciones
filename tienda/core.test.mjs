import test from 'node:test';import assert from 'node:assert/strict';
import {validate,hash,source,validUrl} from './core.mjs';
const products=[{id:1,sku:'ADE-0008',name:'MikroTik',approved_price:null},{id:2,sku:'DEMO-001',name:'Demostración',approved_price:1500}];
const payload=()=>({name:'CLIENTE FICTICIO NETLIFY',phone:'0000000022',sector:'SECTOR FICTICIO',fictitious:true,privacy:true,marketing:false,idempotency_key:'prueba-1234567890123456',fulfillment:'Contra entrega',address:'DIRECCION FICTICIA',province:'PROVINCIA FICTICIA',municipality:'MUNICIPIO FICTICIO',reference:'REFERENCIA FICTICIA',origin:'marketplace',campaign:'PREVIEW',items:[{product_id:1,qty:2},{product_id:2,qty:1,origin:'facebook'}]});
test('carrito conserva importes desconocidos y origen por línea',()=>{const r=validate(payload(),products);assert.equal(r.items[0].unit_price,null);assert.equal(r.items[1].origin_code,'facebook');assert.equal(r.status,'Nuevo');assert.equal(r.test,true)});
test('bloquea datos reales',()=>{for(const patch of [{name:'Juan Perez'},{phone:'8095555555'},{fictitious:false}])assert.throws(()=>validate({...payload(),...patch},products))});
test('privacidad obligatoria, promociones separadas',()=>{assert.throws(()=>validate({...payload(),privacy:false},products));assert.equal(validate(payload(),products).consents[1].accepted,false)});
test('contra entrega requiere datos mínimos',()=>{for(const key of ['address','reference','province','municipality'])assert.throws(()=>validate({...payload(),[key]:''},products))});
test('recogida no guarda dirección de entrega',()=>{assert.equal(validate({...payload(),fulfillment:'Recoger en tienda',address:''},products).delivery,null)});
test('cantidades y duplicados inválidos',()=>{for(const qty of [0,-1,1.5,101,true])assert.throws(()=>validate({...payload(),items:[{product_id:1,qty}]},products));assert.throws(()=>validate({...payload(),items:[{product_id:1,qty:1},{product_id:1,qty:1}]},products))});
test('no confía precios enviados por cliente',()=>{const r=validate({...payload(),items:[{product_id:1,qty:1,unit_price:1}]},products);assert.equal(r.items[0].unit_price,null)});
test('origen y URLs controlados',()=>{assert.equal(source('unknown'),'tienda');assert.throws(()=>validUrl('https://evil.example/'));assert.equal(validUrl('https://www.facebook.com/marketplace/item/123/'),'https://www.facebook.com/marketplace/item/123/')});
test('idempotencia usa hash estable no reversible',()=>{assert.equal(hash('key'),hash('key'));assert.notEqual(hash('key'),hash('another'));assert.equal(hash('key').length,64)});
test('rechaza honeypot y campos fuera de límite',()=>{assert.throws(()=>validate({...payload(),website:'spam'},products));assert.throws(()=>validate({...payload(),sector:'x'.repeat(501)},products))});

import {totals,budgetPdf} from './budget-pdf.mjs';
test('preview no presupone impuestos de productos reales',()=>{assert.equal(totals([{product_id:1,qty:1}],products,'Recoger en tienda').total,null)});
test('presupuesto PDF válido y cifras calculadas en servidor',async()=>{const record={order_id:'PRUEBA-NF-TEST',created_at:'2026-11-08',customer:{name:'CLIENTE FICTICIO',email:'test@example.invalid'},fulfillment:'Recoger en tienda',quote_totals:totals([{product_id:2,sku:'DEMO-001',name:'Demostración',qty:1}],products.map(p=>({...p,test:p.id===2})),'Recoger en tienda')};assert.equal(record.quote_totals.total,1500);assert.equal(record.quote_totals.itbis,228.81);const bytes=await budgetPdf(record);assert.equal(Buffer.from(bytes).subarray(0,4).toString(),'%PDF')});

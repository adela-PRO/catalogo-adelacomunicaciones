import {cp,mkdir,writeFile} from 'node:fs/promises';
// This branch cannot replace production, including accidental merge or --prod.
if(process.env.CONTEXT!=='deploy-preview')throw Error('Solo Deploy Preview autorizado. Producción bloqueada.');
if(!/^\d+$/.test(process.env.REVIEW_ID||''))throw Error('Falta identificador de PR para aislar almacenamiento.');
await mkdir('tienda/dist',{recursive:true});
await cp('tienda/web','tienda/dist',{recursive:true});
await cp('tienda/media','tienda/dist/media',{recursive:true});
await writeFile('tienda/dist/robots.txt','User-agent: *\nDisallow: /\n');
await writeFile('tienda/deploy-context.json',JSON.stringify({preview:true,review:process.env.REVIEW_ID}));
console.log('Preview preparada: catálogo seleccionado, 0 datos personales migrados; producción bloqueada.');

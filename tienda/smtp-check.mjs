import nodemailer from 'nodemailer';
import {connect} from 'node:tls';
import {commercialMailbox} from './mail-preparation.mjs';
const host='smtp.hostinger.com';
export function smtpOptions(env){
 if(env.ADELA_SMTP_USER!==commercialMailbox||typeof env.ADELA_SMTP_PASSWORD!=='string'||!env.ADELA_SMTP_PASSWORD||env.ADELA_SMTP_PASSWORD.length>1024)throw Error('Credenciales SMTP privadas pendientes.');
 return {host,port:465,secure:true,auth:{user:commercialMailbox,pass:env.ADELA_SMTP_PASSWORD},tls:{servername:host,rejectUnauthorized:true,minVersion:'TLSv1.2'},connectionTimeout:8000,greetingTimeout:5000,socketTimeout:10000,dnsTimeout:5000,logger:false,debug:false,transactionLog:false,disableFileAccess:true,disableUrlAccess:true,pool:false};
}
export function safeSmtpFailure(error){
 const code=String(error?.code||'');return {ok:false,code:['EAUTH','ETIMEDOUT','ECONNECTION','ESOCKET','EDNS','ETLS','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)?code:'SMTP_CHECK_FAILED',message:code==='EAUTH'?'Hostinger no aceptó la autenticación. Revisa las credenciales en Netlify sin enviarlas al chat.':'No se pudo completar la prueba segura. No se reduce la validación TLS ni se envía correo.',mail_sent:false,delivery_verified:false,checked_at:new Date().toISOString()};
}
export async function verifySmtpAuthentication(env,createTransport=nodemailer.createTransport){
 let transport,timer;try{
  const options=smtpOptions(env);transport=createTransport(options);
  await Promise.race([transport.verify(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Timeout'),{code:'ETIMEDOUT'})),15000)})]);
  return {ok:true,connection_authenticated:true,host,port:465,tls_verified:true,mail_sent:false,delivery_verified:false,recipient_validated:false,checked_at:new Date().toISOString()};
 }catch(e){return safeSmtpFailure(e)}finally{clearTimeout(timer);try{transport?.close()}catch{}}
}
export async function probeSmtpTls(connectTls=connect){
 return new Promise(resolve=>{let socket,finished=false,timer;const finish=r=>{if(finished)return;finished=true;clearTimeout(timer);socket?.destroy();resolve(r)};
  try{socket=connectTls({host,port:465,servername:host,rejectUnauthorized:true,minVersion:'TLSv1.2'},()=>{if(!socket.authorized)return finish(safeSmtpFailure({code:'ETLS'}));finish({ok:true,host,port:465,tls_verified:true,protocol:socket.getProtocol(),connection_authenticated:false,mail_sent:false,delivery_verified:false,checked_at:new Date().toISOString()})});socket.once('error',e=>finish(safeSmtpFailure(e)));timer=setTimeout(()=>finish(safeSmtpFailure({code:'ETIMEDOUT'})),10000)}catch(e){finish(safeSmtpFailure(e))}
 });
}

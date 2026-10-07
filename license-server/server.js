import http from 'node:http'; import crypto from 'node:crypto';
const PORT=process.env.PORT||10000, ADMIN=process.env.ADMIN_TOKEN, PRIVATE_KEY=process.env.SIGNING_PRIVATE_KEY;
const licenses=new Map();
const json=(res,code,data)=>{res.writeHead(code,{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization'});res.end(JSON.stringify(data));};
const body=req=>new Promise((ok,bad)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{ok(s?JSON.parse(s):{})}catch(e){bad(e)}})});
const sign=payload=>{if(!PRIVATE_KEY)throw Error('Signing key is not configured');const data=Buffer.from(JSON.stringify(payload)).toString('base64url');const sig=crypto.sign('sha256',Buffer.from(data),PRIVATE_KEY).toString('base64url');return {payload:data,signature:sig,alg:'ES256'}};
const auth=req=>ADMIN&&req.headers.authorization===`Bearer ${ADMIN}`;
http.createServer(async(req,res)=>{try{
 if(req.method==='OPTIONS')return json(res,204,{});
 if(req.url==='/health')return json(res,200,{ok:true,service:'finora-license'});
 if(req.url==='/admin/licenses'&&req.method==='POST'){if(!auth(req))return json(res,401,{error:'unauthorized'});const x=await body(req);if(!x.key)return json(res,400,{error:'key required'});licenses.set(x.key,{...x,revoked:false,devices:[]});return json(res,201,{ok:true});}
 if(req.url==='/activate'&&req.method==='POST'){const x=await body(req),l=licenses.get(x.key);if(!l||l.revoked)return json(res,403,{error:'invalid_or_revoked'});const max=Number(l.maxDevices||1);if(!l.devices.includes(x.installationId)&&l.devices.length>=max)return json(res,403,{error:'device_limit'});if(!l.devices.includes(x.installationId))l.devices.push(x.installationId);const now=Date.now(),payload={product:'Factor-easyPro',licenseKey:x.key,installationId:x.installationId,maxCompanies:Math.min(5,Number(l.maxCompanies||1)),maxUsers:Math.min(4,Number(l.maxUsers||4)),maxDevices:max,perpetual:!!l.perpetual,expiresAt:l.expiresAt||null,issuedAt:new Date(now).toISOString(),leaseUntil:new Date(now+30*86400000).toISOString()};return json(res,200,{entitlement:sign(payload)});}
 if(req.url==='/admin/revoke'&&req.method==='POST'){if(!auth(req))return json(res,401,{error:'unauthorized'});const x=await body(req),l=licenses.get(x.key);if(!l)return json(res,404,{error:'not_found'});l.revoked=true;return json(res,200,{ok:true});}
 return json(res,404,{error:'not_found'});
}catch(e){return json(res,500,{error:'server_error'});}}).listen(PORT);

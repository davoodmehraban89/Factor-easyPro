const enc=new TextEncoder();
function b64uToBytes(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
function canonical(obj){if(Array.isArray(obj))return '['+obj.map(canonical).join(',')+']';if(obj&&typeof obj==='object')return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+canonical(obj[k])).join(',')+'}';return JSON.stringify(obj)}
export async function verifyEntitlement(token,publicJwk){
 if(!token?.payload||!token?.signature||!publicJwk)return false;
 try{const key=await crypto.subtle.importKey('jwk',publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,b64uToBytes(token.signature),enc.encode(canonical(token.payload)))}catch{return false}
}
export function validateEntitlementPayload(p,installationId,now=Date.now()){
 if(!p||p.product!=='Factor-easyPro'||typeof installationId!=='string'||!installationId||
    p.installationId!==installationId||!Number.isFinite(now))return false;
 const parseRequiredDate=(value)=>typeof value==='string'&&value.trim()!==''?Date.parse(value):NaN;
 if(p.notBefore!==undefined&&p.notBefore!==null){
  const start=parseRequiredDate(p.notBefore);
  if(!Number.isFinite(start)||now<start)return false;
 }
 if(p.perpetual!==true){
  const expiry=parseRequiredDate(p.expiresAt);
  // A non-perpetual entitlement without a real expiration is not a license.
  if(!Number.isFinite(expiry)||now>expiry)return false;
 }
 return Number.isSafeInteger(p.maxCompanies)&&p.maxCompanies>=1&&p.maxCompanies<=5&&
        Number.isSafeInteger(p.maxUsers)&&p.maxUsers>=1&&p.maxUsers<=4&&
        Number.isSafeInteger(p.maxDevices)&&p.maxDevices>=1;
}
export {canonical};

const enc=new TextEncoder();
function b64uToBytes(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
function canonical(obj){if(Array.isArray(obj))return '['+obj.map(canonical).join(',')+']';if(obj&&typeof obj==='object')return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+canonical(obj[k])).join(',')+'}';return JSON.stringify(obj)}
export async function verifyEntitlement(token,publicJwk){
 if(!token?.payload||!token?.signature||!publicJwk)return false;
 try{const key=await crypto.subtle.importKey('jwk',publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,b64uToBytes(token.signature),enc.encode(canonical(token.payload)))}catch{return false}
}
export function validateEntitlementPayload(p,installationId,now=Date.now()){
 if(!p||p.product!=='Factor-easyPro'||p.installationId!==installationId)return false;
 if(p.notBefore&&now<new Date(p.notBefore).getTime())return false;
 if(!p.perpetual&&p.expiresAt&&now>new Date(p.expiresAt).getTime())return false;
 return Number(p.maxCompanies)>=1&&Number(p.maxCompanies)<=5&&Number(p.maxUsers)>=1&&Number(p.maxUsers)<=4&&Number(p.maxDevices)>=1;
}
export {canonical};

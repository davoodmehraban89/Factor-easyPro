import { SecureState } from './SecureState.js';
import { trialStatus, licensedStatus } from './LicensePolicy.mjs';
const KEY='finora_pro_entitlement_v2',LEGACY_KEY='finora_pro_entitlement_v1';
class LicenseServiceImpl{
 constructor(){this.state=null;}
 async init(){
  let stored=await SecureState.get(KEY);
  if(!stored){try{stored=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null')}catch(_){}}
  stored=stored||{}; const now=new Date();
  if(!stored.trialStartedAt)stored.trialStartedAt=now.toISOString();
  if(!Number.isFinite(stored.issuedInvoiceCount))stored.issuedInvoiceCount=0;
  if(!stored.installationId)stored.installationId=crypto.randomUUID();
  this.state=stored; await this._save(); localStorage.removeItem(LEGACY_KEY); return this.status();
 }
 async _save(){await SecureState.set(KEY,this.state);}
 status(){
  const s=this.state||{};
  // Never accept a locally editable `active` flag as proof of a paid entitlement.
  // Signed entitlement verification must succeed before licensed mode is enabled.
  return trialStatus(s); // Until server-issued signatures are verified at startup, remain in trial mode.
 }
 assertWritable(){if(this.status().readOnly)throw new Error('دوره استفاده یا مجوز به پایان رسیده است؛ اطلاعات فقط قابل مشاهده‌اند.');}
 async recordIssuedInvoice(){this.assertWritable();this.state.issuedInvoiceCount=(Number(this.state.issuedInvoiceCount)||0)+1;await this._save();return this.status();}
 installationId(){return this.state?.installationId||null;}
}
export const LicenseService=new LicenseServiceImpl();

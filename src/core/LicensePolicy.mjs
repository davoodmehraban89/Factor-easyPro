export const TRIAL_DAYS=15;
export const TRIAL_INVOICE_LIMIT=20;
export const OFFLINE_LEASE_DAYS=30;
export const WARNING_DAY=25;
export function trialStatus(state,nowMs=Date.now()){
 const started=new Date(state?.trialStartedAt||nowMs),elapsedDays=Math.floor((nowMs-started.getTime())/86400000),invoiceCount=Number(state?.issuedInvoiceCount)||0;
 return{mode:'trial',elapsedDays,invoiceCount,daysRemaining:Math.max(0,TRIAL_DAYS-elapsedDays),invoicesRemaining:Math.max(0,TRIAL_INVOICE_LIMIT-invoiceCount),readOnly:elapsedDays>=TRIAL_DAYS||invoiceCount>=TRIAL_INVOICE_LIMIT,maxCompanies:5,maxUsers:4,maxDevices:1};
}
export function licensedStatus(license,nowMs=Date.now()){
 const checked=license?.lastOnlineCheckAt?new Date(license.lastOnlineCheckAt):null,ageDays=checked?(nowMs-checked.getTime())/86400000:Infinity;
 const expired=!license?.perpetual&&license?.expiresAt&&nowMs>new Date(license.expiresAt).getTime();
 return{mode:'licensed',readOnly:!!expired||ageDays>OFFLINE_LEASE_DAYS,warning:ageDays>=WARNING_DAY,maxCompanies:Math.min(5,Number(license?.maxCompanies)||1),maxUsers:Math.min(4,Number(license?.maxUsers)||1),maxDevices:Number(license?.maxDevices)||1};
}

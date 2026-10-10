const FALLBACK_PREFIX='finora_secure_fallback:';
async function tauriInvoke(command,args){
 const invoke=globalThis.__TAURI_INTERNALS__?.invoke;
 if(typeof invoke!=='function') return null;
 return invoke(command,args);
}
export const SecureState={
 async get(key){
  const protectedValue=localStorage.getItem(FALLBACK_PREFIX+key); if(!protectedValue)return null;
  try{
   const clear=await tauriInvoke('unprotect_local_state',{value:protectedValue});
   return JSON.parse(clear ?? protectedValue);
  }catch(error){
   if (globalThis.__TAURI_INTERNALS__?.invoke) throw new Error('داده امن ویندوز قابل بازیابی نیست؛ از بازنشانی خودکار جلوگیری شد', { cause: error });
   try{return JSON.parse(protectedValue)}catch{return null}
  }
 },
 async set(key,value){
  const clear=JSON.stringify(value);
  try{
   const protectedValue=await tauriInvoke('protect_local_state',{value:clear});
   localStorage.setItem(FALLBACK_PREFIX+key,protectedValue ?? clear);
  }catch(error){
   if (globalThis.__TAURI_INTERNALS__?.invoke) throw new Error('ذخیره امن ویندوز ناموفق بود', { cause: error });
   localStorage.setItem(FALLBACK_PREFIX+key,clear)
  }
 },
 remove(key){ localStorage.removeItem(FALLBACK_PREFIX+key); }
};

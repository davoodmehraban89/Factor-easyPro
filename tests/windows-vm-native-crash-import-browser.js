(async () => {
  const check=(value,message)=>{if(!value)throw Error(message);};
  check(!!globalThis.__TAURI_INTERNALS__?.invoke,
    'Crash restore must run in real installed native WebView2');
  const store=FINORA.Storage;
  const company=await FINORA.Company.current();
  check(company?.id && FINORA.Auth.isAdmin(),
    'A04 crash test needs an authenticated synthetic administrator');
  const total=50000;
  const rows=Array.from({length:total},(_,i)=>({
    id:'vm-a04-crash-contact-'+i,companyId:company.id,
    name:'VM ONLY interrupted restore '+i,ownerUserId:FINORA.Auth.current().id
  }));
  const nativeTransaction=store.transaction.bind(store);
  const state={staged:0,armed:false,committed:false,error:null};
  globalThis.__VM_A04_CRASH=state;
  // Observe actual importAll -> StorageService.transaction -> tx.putRaw.
  // This does not introduce a fake implementation or modify app source.
  store.transaction=(stores,fn,mode)=>nativeTransaction(stores,async tx=>{
    const proxy={
      ...tx,
      putRaw:async (name,item)=>{
        const result=await tx.putRaw(name,item);
        if(name==='contacts'){
          state.staged++;
          if(state.staged===20)state.armed=true;
        }
        return result;
      }
    };
    return fn(proxy);
  },mode);
  store.importAll({app:'Factor-easyPro',version:7,data:{contacts:rows}})
    .then(()=>{state.committed=true;},e=>{state.error=String(e);});
  const deadline=Date.now()+60000;
  while(!state.armed && !state.error && Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  check(state.armed && !state.committed && !state.error,
    'Real restore did not reach a safely observable mid-transaction stage');
  return {armed:true,staged:state.staged,committed:false,total,
    scenario:'real-StorageService.importAll-mid-write'};
})()
import { StorageService } from './StorageService.js';
import { Auth } from './Auth.js';
import { EventBus } from './EventBus.js';

const ACTIVE_KEY = 'finora_active_company';
const MAX_COMPANIES = 5;

class CompanyServiceImpl {
  constructor(){ this.activeCompanyId = null; }
  async init(){
    const user=Auth.current();
    let companies=await StorageService.getAll('companies');
    if(!companies.length){
      const c=await StorageService.put('companies',{id:'company_default',ownerUserId:user.id,name:'شرکت اصلی',isDefault:true});
      companies=[c];
    }
    await this._migrateLegacy(companies[0].id);
    const allowed=this.allowedFor(user,companies);
    const remembered=localStorage.getItem(ACTIVE_KEY);
    this.activeCompanyId=allowed.some(c=>c.id===remembered)?remembered:allowed[0]?.id;
    if(this.activeCompanyId)localStorage.setItem(ACTIVE_KEY,this.activeCompanyId);
    return this.current();
  }
  allowedFor(user,companies){
    if(user?.role==='admin') return companies.slice(0,MAX_COMPANIES);
    const ids=Array.isArray(user?.companyIds)?user.companyIds:[];
    if (!ids.length && companies.length === 1) return companies;
    return companies.filter(c=>ids.includes(c.id));
  }
  async list(){ return this.allowedFor(Auth.current(),await StorageService.getAll('companies')); }
  async current(){ const list=await this.list(); return list.find(c=>c.id===this.activeCompanyId)||list[0]||null; }
  async select(id){
    const list=await this.list(); if(!list.some(c=>c.id===id)) throw new Error('دسترسی به این شرکت مجاز نیست');
    this.activeCompanyId=id; localStorage.setItem(ACTIVE_KEY,id); EventBus.emit('company:changed',id); return this.current();
  }
  async requireSelection(){
    const list=await this.list();
    if(list.length<=1){ if(list[0]) await this.select(list[0].id); return this.current(); }
    return new Promise(resolve=>{
      const root=document.createElement('div'); root.setAttribute('dir','rtl');
      root.style.cssText='position:fixed;inset:0;z-index:2147482999;display:flex;align-items:center;justify-content:center;background:#0f172a;font-family:inherit';
      root.innerHTML=`<div style="width:min(92vw,420px);background:#fff;border-radius:16px;padding:26px"><h2 style="margin:0 0 8px">انتخاب شرکت</h2><p style="color:#64748b">شرکتی را که می‌خواهید با اطلاعات آن کار کنید انتخاب کنید.</p><div id="companyChoices" style="display:grid;gap:8px"></div></div>`;
      const box=root.querySelector('#companyChoices');
      list.forEach(c=>{const b=document.createElement('button');b.type='button';b.textContent=c.name||'شرکت';b.style.cssText='padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;cursor:pointer;font:inherit';b.onclick=async()=>{await this.select(c.id);root.remove();resolve(c)};box.appendChild(b)});
      document.body.appendChild(root);
    });
  }
  async create(data){
    if(!Auth.isAdmin()) throw new Error('فقط مدیر می‌تواند شرکت ایجاد کند');
    const all=await StorageService.getAll('companies'); if(all.length>=MAX_COMPANIES) throw new Error('حداکثر ۵ شرکت مجاز است');
    return StorageService.put('companies',{...data,id:StorageService.uid('cmp_'),ownerUserId:Auth.current().id});
  }
  async _migrateLegacy(defaultCompanyId){
    const marker=await StorageService.get('settings','company_scope_migration_v1'); if(marker?.done)return;
    const scoped=['contacts','products','units','categories','treasury','invoices','invoice_items','stock_movements','transactions','cheques','expenses'];
    for(const store of scoped){ const rows=await StorageService.getAll(store); for(const row of rows){ if(!row.companyId) await StorageService.put(store,{...row,companyId:defaultCompanyId}); } }
    await StorageService.put('settings',{id:'company_scope_migration_v1',done:true,at:new Date().toISOString()});
  }
}
export const CompanyService=new CompanyServiceImpl();

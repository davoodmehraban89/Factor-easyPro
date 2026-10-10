import { CompanyService } from './CompanyService.js';
import { StorageService } from './StorageService.js';

const COMPANY_SCOPED = new Set(['contacts','products','units','categories','treasury','invoices','invoice_items','stock_movements','transactions','cheques','expenses','account_chart','fiscal_periods','journal_entries','journal_lines','warehouses','inventory_balances','stocktakes','stocktake_lines','settlements','account_mappings']);

class DataScopeImpl {
  async companyId(){ const c=await CompanyService.current(); if(!c) throw new Error('شرکت فعالی انتخاب نشده است'); return c.id; }
  async list(store){ return COMPANY_SCOPED.has(store) ? StorageService.getByCompany(store,await this.companyId()) : StorageService.getAll(store); }
  async stamp(store,obj){ if(!COMPANY_SCOPED.has(store)) return obj; return {...obj,companyId:await this.companyId()}; }
}
export const DataScope=new DataScopeImpl();

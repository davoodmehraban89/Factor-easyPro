'use strict';
const TERMS = ['FACTURE','FACTART','SANAD','Sum_Price','Takhfif','Sum_Levy','Sum_Scot','Tedad','Buy_Price','Price_BS','INSERT','UPDATE','DELETE','EXEC','sp_executesql'];
function assessProcedureSignals(r) {
 const errors = [];
 if (!r || typeof r !== 'object' || Array.isArray(r)) errors.push('invalid report');
 else {
  if (r.schemaVersion !== 1 || r.database !== 'HolooBackup_050808_LAB_20261110') errors.push('wrong source');
  if (r.metadataOnly !== true || r.lexicalOnly !== true || r.dynamicSqlAndIndirectCallsUnresolved !== true || r.financialSemanticsVerified !== false || r.productionWriteGate !== 'NO-GO') errors.push('unsafe flags');
  if (!Array.isArray(r.procedures) || !Number.isSafeInteger(r.procedureCount) || r.procedureCount < 1 || r.procedureCount !== r.procedures.length) errors.push('invalid count');
  if (Array.isArray(r.procedures)) {
   const seen = new Set();
   for (const [i,p] of r.procedures.entries()) {
    if (!p || typeof p.schema !== 'string' || !p.schema.trim() || p.schema !== p.schema.trim() || typeof p.name !== 'string' || !p.name.trim() || p.name !== p.name.trim()) { errors.push('invalid identity '+i); continue; }
    const key = (p.schema+'.'+p.name).toLowerCase();
    if (seen.has(key)) errors.push('duplicate identity '+i);
    seen.add(key);
    if (typeof p.definitionAvailable !== 'boolean' || !p.signals || typeof p.signals !== 'object' || Array.isArray(p.signals)) { errors.push('invalid signals '+i); continue; }
    if (Object.keys(p.signals).length !== TERMS.length || Object.keys(p.signals).some(k => !TERMS.includes(k))) errors.push('unknown signals '+i);
    for (const term of TERMS) {
     const value = p.signals[term];
     if (p.definitionAvailable ? !Number.isSafeInteger(value) || value < 0 : value !== null) errors.push('invalid '+term+' '+i);
    }
   }
  }
 }
 return { status: errors.length ? 'INVALID_EVIDENCE' : 'LEXICAL_ONLY', errors, financialSemanticsVerified:false, productionWriteGate:'NO-GO' };
}
module.exports = { assessProcedureSignals };

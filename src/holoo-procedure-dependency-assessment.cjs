'use strict';
const LAB='HolooBackup_050808_LAB_20261110';
const TABLES=new Set(['FACTURE','FACTART','SANAD']);
function assessProcedureDependencies(e){
 const fail=(reason)=>({status:'INVALID_EVIDENCE',reason,productionWriteGate:'NO-GO'});
 if(!e||e.schemaVersion!==1||e.database!==LAB||e.metadataOnly!==true||e.productionWriteGate!=='NO-GO'||e.dependencyCoverageComplete!==false||e.dynamicSqlAndIndirectCallsUnresolved!==true||e.financialSemanticsVerified!==false)return fail('Untrusted LAB evidence or unsupported safety assertions');
 if(!Array.isArray(e.dependencyRows)||!Number.isSafeInteger(e.dependencyRowCount)||!Number.isSafeInteger(e.procedureCount)||e.dependencyRowCount!==e.dependencyRows.length)return fail('Invalid dependency counts');
 const procedures=new Set(),tables=new Set(),unresolved=[];
 for(const row of e.dependencyRows){
  if(!row||typeof row.procedure_schema!=='string'||!row.procedure_schema.trim()||typeof row.procedure_name!=='string'||!row.procedure_name.trim()||(typeof row.referenced_entity_name!=='string'||!TABLES.has(row.referenced_entity_name.toUpperCase()))||!Number.isSafeInteger(row.referenced_minor_id)||row.referenced_minor_id<0||![false,true,0,1].includes(row.is_ambiguous)||![false,true,0,1].includes(row.is_caller_dependent))return fail('Malformed catalog dependency row');
  procedures.add(JSON.stringify([row.procedure_schema,row.procedure_name]));tables.add(row.referenced_entity_name.toUpperCase());
  if(row.is_ambiguous===true||row.is_ambiguous===1||row.is_caller_dependent===true||row.is_caller_dependent===1)unresolved.push({procedure_schema:row.procedure_schema,procedure_name:row.procedure_name,table:row.referenced_entity_name});
 }
 if(procedures.size!==e.procedureCount)return fail('Distinct procedure count mismatch');
 return {status:'CATALOG_ONLY',productionWriteGate:'NO-GO',procedureCount:procedures.size,dependencyRowCount:e.dependencyRows.length,referencedTables:[...tables].sort(),ambiguousOrCallerDependent:unresolved,financialSemanticsVerified:false,dynamicSqlAndIndirectCallsUnresolved:true};
}
module.exports={assessProcedureDependencies};

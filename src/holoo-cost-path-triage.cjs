'use strict';
const { assessProcedureSignals } = require('./holoo-procedure-signals-assessment.cjs');
const TARGETS = ['CheckGeymatTamamShodeh2', 'UpdateGeymatTamamShodehInHavaleh'];
function triageCostPaths(report) {
  const assessment = assessProcedureSignals(report);
  if (assessment.status !== 'LEXICAL_ONLY') return {status:'INVALID_EVIDENCE', errors:assessment.errors, productionWriteGate:'NO-GO'};
  const candidates = TARGETS.map(name => {
    const matches = report.procedures.filter(p => p.name.toLowerCase() === name.toLowerCase());
    if (matches.length !== 1) return {name, status:'UNRESOLVED', reason:matches.length ? 'ambiguous procedure name' : 'procedure absent'};
    const p = matches[0];
    if (!p.definitionAvailable) return {name, schema:p.schema, status:'UNRESOLVED', reason:'definition unavailable'};
    if (['Buy_Price','Price_BS'].every(t => p.signals[t] === 0)) return {name:p.name, schema:p.schema, status:'UNRESOLVED', reason:'no direct price token evidence; quantity alone cannot establish a cost path'};
    return {
      name:p.name, schema:p.schema, status:'LEXICAL_CANDIDATE',
      signals:Object.fromEntries(['FACTURE','FACTART','SANAD','Tedad','Buy_Price','Price_BS','INSERT','UPDATE','DELETE','EXEC','sp_executesql'].map(t=>[t,p.signals[t]]))
    };
  });
  return {status:'LEXICAL_TRIAGE_ONLY', database:report.database, candidates,
    limitations:['Token counts include comments and string literals','Dynamic SQL and indirect calls unresolved','No formula, inventory posting or accounting relationship verified'],
    financialSemanticsVerified:false, productionWriteGate:'NO-GO'};
}
module.exports = { triageCostPaths };

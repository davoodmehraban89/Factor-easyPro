'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {evaluateReadOnlyRisk}=require('../src/holoo-readonly-risk-evaluator.cjs');
function generateReport({runner=spawnSync}={}){
 const script=path.join(__dirname,'holoo-lab-principal-inventory.ps1');
 const result=runner('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Json'],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true});
 if(result.error || result.status!==0 || !result.stdout) throw new Error('Read-only LAB inventory failed; risk report unavailable');
 let inventory;
 try{inventory=JSON.parse(result.stdout);}catch{throw new Error('Invalid LAB inventory JSON');}
 const report=evaluateReadOnlyRisk(inventory);
 return {...report,source:'live-readonly-lab-principal-inventory',schemaVersion:1};
}
if(require.main===module){
 try{process.stdout.write(JSON.stringify(generateReport())+'\n');process.exitCode=2;}
 catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
module.exports={generateReport};

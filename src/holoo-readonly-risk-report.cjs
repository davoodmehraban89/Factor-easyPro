'use strict';
const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
const {evaluateReadOnlyRisk}=require('./holoo-readonly-risk-evaluator.cjs');
const SCRIPT=resolve(__dirname,'..','scripts','holoo-lab-principal-inventory.ps1');
function loadAndEvaluate({platform=process.platform,run=spawnSync}={}){
 if(platform!=='win32') throw new Error('Approved Windows LAB required');
 const result=run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',SCRIPT,'-Json'],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true});
 if(result.error || result.status!==0 || !result.stdout) throw new Error('LAB principal inventory failed');
 let inventory;
 try {inventory=JSON.parse(result.stdout);}catch{throw new Error('Invalid LAB principal inventory JSON');}
 if(inventory.schemaVersion!==1 || inventory.productionWriteGate!=='NO-GO') throw new Error('Untrusted LAB inventory gate');
 return evaluateReadOnlyRisk(inventory);
}
if(require.main===module){
 try {process.stdout.write(JSON.stringify(loadAndEvaluate())+'\n');process.exitCode=2;}
 catch(error){process.stderr.write(error.message+'\n');process.exitCode=2;}
}
module.exports={loadAndEvaluate};

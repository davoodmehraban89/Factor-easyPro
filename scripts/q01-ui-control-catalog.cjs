'use strict';
// Q01 source-level inventory. This is NOT a runtime click test and is
// intentionally separate from the installed WebView2 native-click report.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const paths=['index.html',...fs.readdirSync(path.join(root,'src','views'))
  .filter(x=>x.endsWith('.js')).sort().map(x=>'src/views/'+x)];
const controls=[],summary=[];
const risk=/\b(?:delete|wipe|remove|restore|save|post|submit|confirm|activate|seed|commit|final|approve|closePeriod|logout|export|import|download|print|settle|apply|reset|changeStatus|_save|_apply|_commit)\s*\(/i;
const line=(s,i)=>s.slice(0,i).split('\n').length;
for(const file of paths){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 const matches=[...source.matchAll(/on(?:click|change|input|submit|mousedown|blur|focus|keyup|keydown)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)];
 let highRisk=0;
 for(const hit of matches){
   const action=hit[1]||hit[2]||'';
   const risky=risk.test(action);
   if(risky)highRisk++;
   controls.push({file,line:line(source,hit.index),action:action.slice(0,250),
     category:risky?'sensitive-write-or-export':'navigation-or-other',
     evidence:'declared-source-handler',runtimeClicked:false,
     warning:'source reference does not prove successful click'});
 }
 // Controls without inline handlers may use event listeners/delegation.
 // Keep them in the inventory instead of incorrectly calling them dead.
 let noInline=0;
 for(const hit of source.matchAll(/<button\b[^>]*>/g)){
   const tag=hit[0];
   if(!/\bon(?:click|change|input|submit)\s*=/.test(tag))noInline++;
 }
 const mainNav=[...source.matchAll(/data-page="([a-z]+)"/g)]
   .map(hit=>({route:hit[1],line:line(source,hit.index)}));
 summary.push({file,inlineEventBindings:matches.length,sensitiveBindings:highRisk,
   buttonsWithoutInlineEvents:noInline,mainNav});
}
const report={
  kind:'Q01 static UI source inventory, not click coverage',
  filesScanned:paths.length,
  eventBindings:controls.length,
  sensitiveBindings:controls.filter(x=>x.category==='sensitive-write-or-export').length,
  buttonsWithoutInlineEvents:summary.reduce((n,x)=>n+x.buttonsWithoutInlineEvents,0),
  controlStatus:'source-declared-only',
  allButtonsClicked:false,
  sourceFiles:summary,controls
};
const filename=process.argv[2]||path.join(root,'q01-ui-static-catalog.json');
fs.writeFileSync(filename,JSON.stringify(report,null,2),'utf8');
process.stdout.write(JSON.stringify({file:path.basename(filename),filesScanned:report.filesScanned,
  eventBindings:report.eventBindings,sensitiveBindings:report.sensitiveBindings,
  buttonsWithoutInlineEvents:report.buttonsWithoutInlineEvents,
  allButtonsClicked:false})+'\n');

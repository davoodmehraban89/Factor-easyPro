const http=require('http');
const port=Number(process.env.CDP_PORT||9229);
http.get(`http://127.0.0.1:${port}/json`,r=>{let raw='';r.on('data',x=>raw+=x);r.on('end',()=>{
 const pages=JSON.parse(raw),url=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl;
 if(!url)throw Error('No page');
 const ws=new WebSocket(url);
 ws.onopen=()=>{const expression=process.env.CDP_EXPR||'JSON.stringify({title:document.title,overlay:!!document.getElementById("finoraAuthOverlay"),page:document.getElementById("pageContent")?.innerText.slice(0,300),view:typeof window.InvoicesView,button:document.querySelector("#pageContent button")?.outerHTML})';ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));};
 ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id===1){
  console.log(JSON.stringify(msg.result||msg.error));
  if(msg.error||msg.result?.exceptionDetails||msg.result?.result?.subtype==='error') process.exitCode=1;
  ws.close();
 }};
 ws.onerror=e=>{process.exitCode=1;console.error('CDP error',e.message);};
 });});
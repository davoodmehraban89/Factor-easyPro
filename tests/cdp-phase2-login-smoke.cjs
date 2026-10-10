process.env.CDP_PORT='9252';
process.env.CDP_EXPR=`document.getElementById('faPass').value='SmokeTestOnly-83471!';document.getElementById('faPass2').value='SmokeTestOnly-83471!';document.getElementById('faSubmit').click();'submitted'`;
require('./cdp-smoke.cjs');

process.env.CDP_PORT='9232';
process.env.CDP_EXPR=`document.getElementById('faUser').value='مدیر';document.getElementById('faPass').value='SmokeTestOnly-83471!';document.getElementById('faSubmit').click();'submitted'`;
require('./cdp-smoke.cjs');
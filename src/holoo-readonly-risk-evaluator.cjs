'use strict';
const LAB='HolooBackup_050808_LAB_20261110';
const DML=new Set(['INSERT','UPDATE','DELETE','MERGE','TRUNCATE','ALTER','CONTROL','TAKE OWNERSHIP']);
function evaluateReadOnlyRisk(inventory){
 if(!inventory || inventory.identity?.database_name!==LAB || inventory.readOnlyInventory!==true) throw new Error('Untrusted or non-LAB inventory');
 if(!Array.isArray(inventory.databasePermissions) || !Array.isArray(inventory.databaseRoleMemberships) || !Array.isArray(inventory.serverRoleMemberships)) throw new Error('Incomplete inventory');
 // Fail closed on malformed catalog rows; never silently discard missing principals or permission states.
 for(const permission of inventory.databasePermissions){
  if(!permission || typeof permission.principal_name!=='string' || typeof permission.permission_name!=='string' || typeof permission.state_desc!=='string' || typeof permission.class_desc!=='string') throw new Error('Malformed database permission evidence');
 }
 for(const membership of inventory.databaseRoleMemberships){
  if(!membership || typeof membership.role_name!=='string' || typeof membership.member_name!=='string') throw new Error('Malformed database role evidence');
 }
 for(const membership of inventory.serverRoleMemberships){
  if(!membership || !('role_name' in membership) || !('member_name' in membership)) throw new Error('Malformed server role evidence');
 }
 const publicGrants=inventory.databasePermissions.filter(p=>p.principal_name==='public' && ['GRANT','GRANT_WITH_GRANT_OPTION'].includes(p.state_desc));
 const mutationGrants=publicGrants.filter(p=>DML.has(p.permission_name));
 const executeGrants=publicGrants.filter(p=>p.permission_name==='EXECUTE');
 const blockers=[];
 if(mutationGrants.length) blockers.push({code:'PUBLIC_MUTATION_GRANTS',count:mutationGrants.length,targets:[...new Set(mutationGrants.map(p=>p.object_name||p.class_desc||'UNKNOWN'))].sort()});
 if(executeGrants.length) blockers.push({code:'PUBLIC_EXECUTE_GRANTS',count:executeGrants.length});
 if(inventory.serverRoleMemberships.some(m=>m.role_name===null || m.member_name===null)) blockers.push({code:'UNRESOLVED_SERVER_ROLE_MEMBER',detail:'SQL catalog contains an unresolved server role member or role name'});
 blockers.push({code:'PROPOSED_IDENTITY_NOT_VERIFIED',detail:'Current administrator inventory cannot prove effective permissions of an unprovisioned Windows identity'});
 blockers.push({code:'WINDOWS_GROUP_AND_OWNERSHIP_PATHS_UNVERIFIED',detail:'Inherited group rights, ownership chaining, and indirect calls require independent validation'});
 return {database:LAB,status:'NO-GO',databaseWideReadOnlyProven:false,publicExecuteGrantCount:executeGrants.length,publicMutationGrantCount:mutationGrants.length,blockers,sqlChangesPerformed:false};
}
module.exports={evaluateReadOnlyRisk};

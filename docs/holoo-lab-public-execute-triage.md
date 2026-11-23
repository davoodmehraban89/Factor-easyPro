# Public EXECUTE risk triage — LAB, 2026-11-22

**Status: NO-GO.** Read-only catalog inspection of `ARAM\TNC` / `HolooBackup_050808_LAB_20261110`. No stored procedure executed and no SQL grants or data modified.

## Observed evidence

- 31 `public` EXECUTE grants, all 31 module definitions visible.
- Eight definitions contain DML keywords (`INSERT`, `UPDATE`, `DELETE`, `MERGE`, or `TRUNCATE`):
  - `dbo.dt_adduserobject`
  - `dbo.dt_adduserobject_vcs`
  - `dbo.dt_checkoutobject`
  - `dbo.dt_droppropertiesbyid`
  - `dbo.dt_dropuserobjectbyid`
  - `dbo.dt_isundersourcecontrol`
  - `dbo.dt_setpropertybyid`
  - `dbo.dt_setpropertybyid_u`
- These are **textual signals**, not proof of executed writes; comments, unreachable branches, and quoted strings can cause false positives. Conversely, dynamically constructed SQL can evade detection.
- Catalog query `sys.sql_expression_dependencies` returned zero edges for the examined grant set. **Zero edges is not proof of no nested calls**; metadata visibility, legacy definitions, and dynamic SQL can limit results.
- `public` also has direct DML grants on `dbo.dtproperties`; a principal with only explicitly granted SELECT on invoice tables is not necessarily database-wide read-only.

## Security decision

1. Do not provision or approve a dedicated read-only account yet. The current runtime permission gate examines three invoice tables and common elevated roles, but **does not establish database-wide non-mutability**.
2. Review the eight procedure bodies and their invoked procedures manually, then the other 23 definitions; investigate ownership chaining and dynamic SQL.
3. Independently inventory effective privileges of a proposed non-admin Windows principal, including inherited `public`, Windows groups, server-level grants, and executable procedures. This requires a specifically authorized isolated test and rollback plan.
4. Maintain production writes as **NO-GO**. No changes to SQL principals, privileges, services, or Holoo records are authorized by this report.

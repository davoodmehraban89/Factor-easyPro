# LAB public EXECUTE: body-level review — 2026-11-22

Status: **NO-GO**. Evidence gathered by read-only `SELECT` from `sys.objects` and `sys.sql_modules` on `ARAM\TNC` / `HolooBackup_050808_LAB_20261110`. No procedure was invoked.

## Direct mutations found in procedure bodies

- `dbo.dt_adduserobject`: `INSERT dbo.dtproperties`, `UPDATE dbo.dtproperties`.
- `dbo.dt_adduserobject_vcs`: `INSERT dbo.dtproperties`, `UPDATE dbo.dtproperties`.
- `dbo.dt_droppropertiesbyid`: `DELETE FROM dbo.dtproperties`.
- `dbo.dt_dropuserobjectbyid`: `DELETE FROM dbo.dtproperties`.
- `dbo.dt_setpropertybyid`: `UPDATE dbo.dtproperties`, `INSERT dbo.dtproperties`.
- `dbo.dt_setpropertybyid_u`: `UPDATE dbo.dtproperties`, `INSERT dbo.dtproperties`; also calls `dbo.dt_generateansiname`.

## External or indirect operations requiring manual review

- `dbo.dt_checkoutobject`: references `master.dbo.sp_OACreate`, `sp_OAMethod`, `sp_OAGetProperty`; invokes `dbo.dt_getpropertiesbyid_vcs`; creates a temporary table. Potential external COM operations; no successful execution has been demonstrated.
- `dbo.dt_isundersourcecontrol`: references the same `sp_OA*` family and `dbo.dt_getpropertiesbyid_vcs`; inserts into a temporary table. This is not evidence of direct persistent-table mutation by this procedure, but is an additional external-call security review item.

## Interpretation and next gate

- Six of the eight prioritized public-EXECUTE procedures contain **confirmed persistent-table DML statements** in their definitions. This is a stronger finding than a keyword scan, but does not establish that a future limited account can successfully execute them.
- Existing `public` INSERT/UPDATE/DELETE grants on `dbo.dtproperties` are a separate direct-permission risk.
- Do not declare the proposed identity database-wide read-only or enable production writes. Require an approved isolated principal test, full effective-permission assessment, and review of remaining public EXECUTE procedures and nested calls.
- No SQL data, login, permission, or service changes were performed.

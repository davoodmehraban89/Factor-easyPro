# LAB SQL permission findings — 2026-11-22

Status: **NO-GO**. Evidence: read-only execution of `scripts/holoo-lab-principal-inventory.ps1` against `ARAM\TNC` / `HolooBackup_050808_LAB_20261110`.

## Observed inventory

- Current login: `ARAM\Davood`, database user: `dbo`; 14 database principals, 1 database role-membership record, 168 database permission records, 4 server role-membership records.
- Database permissions grouped by grantee and permission: `public` has 130 `GRANT SELECT`, 31 `GRANT EXECUTE`, 3 `GRANT REFERENCES`, and one each `GRANT INSERT`, `GRANT UPDATE`, `GRANT DELETE`; `dbo` has one `GRANT CONNECT`.
- The three `public` DML grants target **`dbo.dtproperties`**, not `dbo.FACTURE`, `dbo.FACTART`, or `dbo.SANAD`.
- `public` is inherited by every database user; the presence of these grants means a future account with only three explicit table SELECT grants is **not necessarily database-wide read-only**.
- The 31 `public EXECUTE` grants require per-object inspection: an EXECUTE grant can expose data mutations through stored procedures even when direct table DML is denied.

## Required before identity provisioning

1. Read-only inspect all 31 public EXECUTE target object definitions and permissions, including dynamic SQL, ownership chaining, and callable nested procedures. Record unknown or encrypted definitions as blockers.
2. Check effective permissions for the proposed account on **all objects**, plus server-level grants and inherited Windows groups; checking three invoice tables alone is insufficient.
3. Decide whether to isolate the lab in a distinct database with tighter `public` privileges or otherwise establish a tested effective read-only identity. Do not modify Holoo default grants without a reviewed compatibility and rollback plan.
4. No SQL principal, GRANT, REVOKE, DENY, data writes, or service changes have been performed as part of this finding.

**Important limitation:** counts are catalog metadata, not proof that every permission is effective for a specific identity. No stored procedure was executed to test mutation.

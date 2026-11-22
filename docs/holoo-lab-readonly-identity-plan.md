# Holoo disposable LAB: dedicated read-only SQL identity — execution HOLD

Status: **DESIGN ONLY / NO-GO**. This document is not authorization to run DDL, GRANT, DENY, CREATE LOGIN, or to change any Holoo database. Do not run against Holoo1, Holoo6, or any production/restore reference.

## Scope and prerequisites

- SQL instance: `ARAM\TNC` (SQL Server 2008 R2 Express); sole target database: `HolooBackup_050808_LAB_20261110`.
- Preserve the existing `ARAM\Davood` owner login and all existing Holoo permissions unchanged.
- Provision a **dedicated non-admin Windows identity** with a documented owner and secure credential management. The current scripts use Integrated Security; changing a connection string alone cannot change the Windows security token. Run the process under the dedicated identity or use a separately reviewed credential broker.
- Before any provisioning: explicit approval, verified recoverable LAB backup, inventory of existing server/database principals and grants, and a tested rollback. Record operator, time, evidence, and change ticket.
- Verify this identity is not in `sysadmin`, `securityadmin`, `db_owner`, `db_datawriter`, `db_ddladmin`, or other inherited server/database roles with elevated capabilities; no `CONTROL SERVER`, `CONTROL DATABASE`, `ALTER`, `EXECUTE`, `IMPERSONATE`, or ownership chaining privilege that would allow mutation.
- SQL Server 2008 R2 does not provide a reliable security boundary merely by setting `ApplicationIntent=ReadOnly`.

## Proposed permissions (not executable commands)

1. Create/map only the dedicated identity in the disposable LAB database, with no server-wide administrative roles or default broad database roles.
2. Grant the minimum `CONNECT` and `SELECT` on `dbo.FACTURE`, `dbo.FACTART`, and `dbo.SANAD` only; do not grant `db_datareader` broadly.
3. Inspect all effective permissions and inherited group memberships, including public, guest, Windows groups, database ownership, and server roles. The existing gate tests common roles and object DML, but is not a complete SQL Server privilege proof.
4. Execute permission audit and all three fixed counts under the **same dedicated Windows identity**. Compare against a fresh read-only structural audit; record login and database user evidence.
5. Perform negative tests for DML/DDL only in a separately approved isolated fixture, never against live Holoo or the verified LAB data. Prefer inspection of effective permissions without issuing writes.
6. Keep the production write gate NO-GO; read-only acceptance does not imply invoice-write authorization.

## Rollback / abort criteria

- Before change, record principal/grant snapshots and verify the LAB restore point. Abort if snapshot/backup or approval is missing.
- Rollback is scoped to removing only newly introduced LAB user grants and the newly introduced dedicated principal after confirming no other dependency. Never revoke permissions from `ARAM\Davood` or other existing identities.
- Abort on any elevated inherited role, unexpected database, inconsistent counts, unverified principal, or permission audit `BLOCKED`. Preserve audit logs and do not automatically retry with an admin identity.

## Current evidence

- Current `ARAM\Davood` maps to `dbo`, has `db_owner` and object DML privileges; the read-only gate correctly blocks it.
- The dedicated identity has **not** been provisioned or tested. SQL writes and permission changes performed in this phase: **zero**.

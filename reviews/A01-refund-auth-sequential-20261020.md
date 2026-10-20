# A01 refund authorization — scoped sequential review (2026-10-20)

This is three sequential assistant passes, not three independent agents and not an accountant signoff. Scope is the narrow PR #122 role-control fix, not full A01.

## Pass 1: functional
Read src/core/RetailPostingService.js and tests/retail-phase2.test.mjs. Existing tests cover sale-return credit available after payments, negative/refund-overlimit cases, concurrent payout attempts and balanced journal creation. New authorization check covers payment tied to sale_return before journal or treasury writes. Authorized manager payout remains available.

## Pass 2: security and atomicity
Auth.isAdmin() is checked inside RetailPostingService.recordCash, rather than relying on visible UI. Regression executes a clerk call with access to the company and proves no change to the return invoice, treasury, posted journals or audit count. This is a local application permission boundary; privileged direct IndexedDB modification remains outside its protection.

## Pass 3: platform, regression and edge scope
PR quality run 39385076660 on SHA 90558e5247b41c7adf40aeac65b6bdd3470db165: 267/267 Linux, 267/267 Windows and build/audit/installer success; installed NSIS/Tauri/WebView2 Windows VM run 39385076705 success. On merged main SHA caa5995d5b71f1a8c89b07941bcd7f8870a723d8: quality run 39385956523 (267/267 Linux and Windows, build/audit/installer) success; native VM run 39385956551 success.

## Disposition
Narrow A01 manager-refund permission patch is verified. A01 gate remains UNACCEPTED: full sales/purchase and cheque corrections, reason-coded refund workflow, period rules, idempotency, representative-ledger reconciliation and independent accountant review still require separate evidence. No customer backup, independent reviewer agents, real physical power-loss tests or public release are claimed.

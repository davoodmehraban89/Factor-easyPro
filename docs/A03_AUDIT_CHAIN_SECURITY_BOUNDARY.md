# A03 client audit security boundary

The application rejects direct audit-event writes through StorageService. It records SHA-256 hashes linked through prevHash and checks the chain on backup restore.

An exported backup stores its final hash and event count as an anchor. This detects tail deletion only while the anchor itself remains trusted and unchanged. An attacker who can edit the backup can recompute the chain and replace its anchor. An independently stored or signed checkpoint is required for stronger tamper evidence.

Client-side authorization is not a security boundary against a hostile local operator. Browser developer tools, raw IndexedDB access, modified JavaScript, or filesystem access can bypass the application service layer. Restored legacy metadata uses deterministic defaults and is not evidence of original actor identity or timestamps.

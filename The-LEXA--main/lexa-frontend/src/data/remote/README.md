# Future remote provider boundary

There is deliberately no remote API implementation in this frontend milestone. When a backend is ready, implement the business-facing contracts in `src/data/contracts/` and replace the local provider registry. The server must authoritatively enforce authentication, workspace isolation, permissions, approvals, concurrency and audit history. Never trust a client-provided workspace ID or role as proof of access.

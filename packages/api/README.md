# @openjiuwen/relay-api-server

OfficeClaw API server package.

It exports the server entry points used by the OfficeClaw runtime and depends on the shared contracts and core runtime package.

## Install

```bash
pnpm add @openjiuwen/relay-api-server
```

## Exports

- `@openjiuwen/relay-api-server`
- `@openjiuwen/relay-api-server/server`

## Provider Packages

Storage, evidence, scheduler, auth, metrics, and catalog implementations are loaded through provider modules. Install provider packages separately and point the runtime at them with the corresponding `OFFICE_CLAW_*_PROVIDER_MODULES` environment variables.

For example, SQLite evidence and scheduler support is provided by `@openjiuwen/relay-storage-sqlite`:

```bash
pnpm add @openjiuwen/relay-storage-sqlite
```

```bash
OFFICE_CLAW_EVIDENCE_PROVIDER=sqlite
OFFICE_CLAW_EVIDENCE_PROVIDER_MODULES=@openjiuwen/relay-storage-sqlite/evidence
OFFICE_CLAW_SCHEDULER_PROVIDER=sqlite
OFFICE_CLAW_SCHEDULER_PROVIDER_MODULES=@openjiuwen/relay-storage-sqlite/scheduler
```

# @openjiuwen/relay-web-contracts

Web plugin contracts for OfficeClaw frontend extensions.

## Install

```bash
pnpm add @openjiuwen/relay-api-server-contracts
```

## Auth Provider Contract

```ts
import type { WebAuthPlugin } from '@openjiuwen/relay-web-contracts/auth';

export const myWebAuthPlugin: WebAuthPlugin = {
  id: 'my-auth-web',
  displayName: 'My Auth Web',
  routes: [
    { path: '/login', module: 'my-auth/login' },
    { path: '/login/callback', module: 'my-auth/login/callback' },
  ],
};
```

## Runtime Wiring

Install your web auth package into the app, then let the host register route modules:

```bash
pnpm add @examples/my-auth-web
```

The host app will import the plugin, read `routes`, and mount the route entries.

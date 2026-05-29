# @openjiuwen/relay-api-server-contracts

Plugin contracts for OfficeClaw extensions. Auth is the first extension point.

## Install

```bash
pnpm add @openjiuwen/relay-api-server-contracts
```

## Auth Provider Contract

```ts
import type { AuthProvider } from '@openjiuwen/relay-api-server-contracts/auth';

const myProvider: AuthProvider = {
  id: 'my-provider',
  displayName: 'My Provider',
  presentation: {
    mode: 'form',
    fields: [
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
    submitLabel: 'Sign In',
  },
  async authenticate(input) {
    // Your authentication logic
    return {
      success: true,
      principal: {
        userId: input.credentials.username as string,
        displayName: 'User',
        expiresAt: null,
      },
    };
  },
};

export default myProvider;
```

## Runtime Wiring

Install your auth provider package into the app, then point the auth runtime at it:

```bash
CAT_CAFE_AUTH_PROVIDER=my-provider
CAT_CAFE_AUTH_PROVIDER_MODULES=@examples/my-auth-provider
```

The platform will:

1. import the module listed in `CAT_CAFE_AUTH_PROVIDER_MODULES`
2. collect exported auth providers
3. activate the provider whose `id` matches `CAT_CAFE_AUTH_PROVIDER`

See [Build an Auth Provider](../../docs/guides/build-auth-provider.md) for the full walkthrough.

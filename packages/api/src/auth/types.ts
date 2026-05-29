/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Auth types for the platform runtime.
 *
 * Re-exports the plugin-api contract and adds platform-only types
 * that providers never see (session records, auth context, etc.).
 */

// Re-export the full plugin-api auth contract
export type {
  AuthenticateFailure,
  AuthenticateInput,
  AuthenticateOutcome,
  AuthenticateResult,
  AuthFieldOption,
  AuthFieldSchema,
  AuthPresentation,
  AuthPresentationMode,
  AuthProvider,
  AuthSessionInfo,
  ExternalPrincipal,
} from '@openjiuwen/relay-api-server-contracts/auth';

// ---------------------------------------------------------------------------
// Platform-only types (not exposed to third-party providers)
// ---------------------------------------------------------------------------

/** Internal session record managed by SessionAuthority. */
export interface AuthSessionRecord {
  sessionId: string;
  providerId: string;
  userId: string;
  displayName?: string;
  createdAt: string;
  expiresAt: string | null;
  /** Opaque provider-owned data. Only the provider interprets this. */
  providerState?: unknown;
}

/**
 * The minimal, provider-agnostic auth context injected into every request.
 * Business code reads ONLY this — never provider internals.
 */
export interface AuthContext {
  userId: string;
  sessionId: string;
  providerId: string;
  authenticated: boolean;
}

/** Public config returned by /api/auth/session for unauthenticated users. */
export interface AuthProviderPublicConfig {
  hascode?: boolean;
  [key: string]: unknown;
}

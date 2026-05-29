/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Auth Plugin API — the contract that third-party auth providers implement.
 *
 * Java analogy:
 *   - This file is the `interface AuthProvider` jar.
 *   - Third-party packages implement this interface and export an object.
 *   - The main project installs the package, sets `.env`, and the runtime loads it.
 *
 * Design constraints (F140):
 *   - Provider ID is a runtime string, never an enum/union.
 *   - Provider only converts credentials → identity. No session, no middleware, no business logic.
 *   - postLoginInit is provider-declared, platform-triggered, failure does not roll back auth.
 *   - providerState is opaque to the platform — only the provider interprets it.
 */

// ---------------------------------------------------------------------------
// Presentation — tells the frontend how to render the login UI
// ---------------------------------------------------------------------------

export type AuthPresentationMode = 'auto' | 'form' | 'redirect';

export interface AuthFieldOption {
  value: string;
  label: string;
}

export interface AuthFieldSchema {
  name: string;
  label: string;
  type: 'text' | 'password' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: AuthFieldOption[];
}

export interface AuthPresentation {
  /** How the frontend should handle login for this provider. */
  mode: AuthPresentationMode;
  /** Form fields (only meaningful when mode is 'form'). */
  fields: AuthFieldSchema[];
  /** Label for the submit button. */
  submitLabel?: string;
  /** Human-readable description shown on the login page. */
  description?: string;
  /** Redirect URL (only meaningful when mode is 'redirect'). */
  redirectUrl?: string;
}

// ---------------------------------------------------------------------------
// ExternalPrincipal — the identity result from a provider
// ---------------------------------------------------------------------------

/**
 * What a provider returns after successful authentication.
 * The platform takes this and issues an internal session.
 */
export interface ExternalPrincipal {
  /** User identifier, unique within this provider's namespace. */
  userId: string;
  /** Display name for the user (shown in UI viewer/profile). */
  displayName?: string;
  /** When the provider's credential expires. null = never. */
  expiresAt: Date | null;
  /** Opaque provider-owned data. Stored in session, only the provider reads it. */
  providerState?: unknown;
}

// ---------------------------------------------------------------------------
// AuthProvider — the main contract
// ---------------------------------------------------------------------------

export interface AuthenticateInput {
  /** Credentials submitted by the user (form fields, callback params, etc.). */
  credentials: Record<string, unknown>;
}

export interface AuthenticateResult {
  success: true;
  principal: ExternalPrincipal;
}

export interface AuthenticateFailure {
  success: false;
  message: string;
  /** If true, the frontend should show a promotion-code / invite-code field. */
  needCode?: boolean;
}

export type AuthenticateOutcome = AuthenticateResult | AuthenticateFailure;

/**
 * Session info passed to provider hooks (refresh, logout, postLoginInit).
 * The provider can read its own providerState from here.
 */
export interface AuthSessionInfo {
  sessionId: string;
  userId: string;
  providerId: string;
  providerState: unknown;
  expiresAt: Date | null;
}

export interface ProtocolCredentialResult {
  baseUrl: string;
  apiKey: string;
  defaultHeaders: Record<string, string>;
}

/**
 * The contract that every auth provider must satisfy.
 *
 * Required: id, displayName, presentation, authenticate.
 * Optional: bootstrap, handleCallback, refresh, logout, restoreSession, postLoginInit, getPublicConfig, resolveProtocolCredential.
 */
export interface AuthProvider {
  /** Unique provider identifier (runtime string, never hardcoded in platform). */
  readonly id: string;
  /** Human-readable name shown in logs and admin UI. */
  readonly displayName: string;
  /** Tells the frontend how to render the login experience. */
  readonly presentation: AuthPresentation;

  /**
   * Called once at startup. Use for provider-level initialization
   * (e.g., validate config, warm up connections).
   */
  bootstrap?(): Promise<void>;

  /**
   * Core: convert credentials into an identity.
   * Must NOT perform business side-effects (MaaS init, model refresh, etc.).
   */
  authenticate(input: AuthenticateInput): Promise<AuthenticateOutcome>;

  /**
   * Handle OAuth/redirect callback (for redirect-mode providers).
   * Called when the user returns from the external auth page.
   */
  handleCallback?(params: Record<string, string>): Promise<AuthenticateOutcome>;

  /**
   * Try to restore a session after server restart.
   * Return an ExternalPrincipal if the session can be recovered, or null.
   */
  restoreSession?(userId: string): Promise<ExternalPrincipal | null>;

  /**
   * Refresh provider credentials before they expire.
   * Return updated principal, or null if refresh is not possible.
   */
  refresh?(session: AuthSessionInfo): Promise<ExternalPrincipal | null>;

  /**
   * Provider-side cleanup on logout (e.g., revoke external tokens).
   */
  logout?(session: AuthSessionInfo): Promise<void>;

  /**
   * Provider-declared post-login initialization.
   * Platform triggers this AFTER session issuance.
   * Failure here does NOT roll back the successful authentication.
   *
   * Use for: MaaS subscription, model refresh, quota allocation, etc.
   */
  postLoginInit?(session: AuthSessionInfo): Promise<void>;

  /**
   * Return provider-specific public config (shown to unauthenticated users).
   * Example: whether a promotion code has been remembered.
   */
  getPublicConfig?(): Promise<Record<string, unknown>>;

  /**
   * Resolve LLM-call credentials for a named protocol.
   * Only implemented by auth providers whose cloud sessions carry model-call
   * credentials (e.g., huawei-cas provides huawei_maas credentials).
   *
   * Platform looks up the session and passes AuthSessionInfo to the provider;
   * the provider reads its own providerState — same pattern as refresh/logout.
   *
   * @returns Credential bundle for LLM API calls, or null if not supported.
   */
  resolveProtocolCredential?(
    protocol: string,
    session: AuthSessionInfo,
  ): ProtocolCredentialResult | null;
}

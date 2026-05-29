/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Web Auth Plugin API — frontend contract for auth route bundles.
 *
 * This package intentionally stays framework-light:
 * - routes are runtime strings
 * - modules are provider-owned entry ids
 * - host app decides how to resolve/render modules
 */

export interface WebAuthRouteEntry {
  /** Route path exposed by the auth web plugin, e.g. /login/callback */
  path: string;
  /** Provider-owned module id. Host resolves this id to a route component. */
  module: string;
}

export interface WebAuthPlugin {
  /** Unique plugin id, e.g. huawei-cas-web */
  id: string;
  /** Human-readable plugin name */
  displayName: string;
  /** Route map contributed by the plugin */
  routes: WebAuthRouteEntry[];
}

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RuntimeProviderProfile } from '../config/provider-profiles.js';
import { validateRuntimeProviderBinding } from '../config/provider-binding-compat.js';
import { resolveRuntimeProviderProfileById } from '../config/provider-profiles.js';

export async function resolveEmbeddedAgentTeamsBinding(
  projectRoot: string,
  accountRef?: string | null,
): Promise<{ accountRef: string; profile: RuntimeProviderProfile } | null> {
  const trimmedAccountRef = accountRef?.trim();
  if (!trimmedAccountRef) return null;
  const profile = await resolveRuntimeProviderProfileById(projectRoot, trimmedAccountRef);
  if (!profile) return null;
  const compatibilityError = validateRuntimeProviderBinding('acp', profile, undefined, {
    embeddedAcpRuntime: true,
  });
  if (compatibilityError) return null;
  return { accountRef: trimmedAccountRef, profile };
}

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export function getAntigravitySmokeSkipReason({ env = process.env, runtimeReachable } = {}) {
  if (env.RUN_ANTIGRAVITY_SMOKE !== 'true') {
    return 'RUN_ANTIGRAVITY_SMOKE=true not set';
  }

  if (!runtimeReachable) {
    return 'Antigravity not running on port 9000';
  }

  return null;
}

export async function runAntigravityRoundTripSmoke(
  client,
  { prompt = 'Reply with just the word "pong"', pollTimeoutMs = 60_000 } = {},
) {
  try {
    await client.connect();
    await client.newConversation();
    await client.sendMessage(prompt);
    return await client.pollResponse(pollTimeoutMs);
  } finally {
    try {
      await client.disconnect();
    } catch {
      // Best-effort cleanup: a hanging smoke test must not leave the CDP socket behind.
    }
  }
}

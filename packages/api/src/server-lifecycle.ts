/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export async function startServer(): Promise<string> {
  const { main } = await import('./index.js');
  await main();

  const port = process.env.API_SERVER_PORT ?? '3004';
  const host = process.env.API_SERVER_HOST ?? '127.0.0.1';
  return `http://${host}:${port}`;
}

export async function stopServer(): Promise<void> {
  const { _stopForProgrammatic } = await import('./index.js');
  await _stopForProgrammatic();
}

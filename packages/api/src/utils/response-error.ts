/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export async function getErrorMessage(
  response: Response,
): Promise<{ error_code: string; error_message: string }> {
  const data: unknown = await response.json();

  if (data && typeof data === 'object') {
    const errorCode = Reflect.get(data, 'error_code');
    const errorMessage = Reflect.get(data, 'error_message') ?? Reflect.get(data, 'error_msg');

    return {
      error_code: typeof errorCode === 'string' ? errorCode : response.status.toString(),
      error_message: typeof errorMessage === 'string' ? errorMessage : response.statusText,
    };
  }

  return { error_code: response.status.toString(), error_message: response.statusText };
}

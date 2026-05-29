/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/** Shared 401 error with hint for cats to use text-based @mention instead. */
export const EXPIRED_CREDENTIALS_ERROR = {
  error: 'Invalid or expired callback credentials',
  hint: '如果只是想 @队友，直接在回复文本里另起一行、行首写 @智能体名，并在同一段写明确动作请求（如：请确认/请处理/请决策，免费且永不过期）。Callback token 有生命周期限制（默认约2小时，成功校验会刷新），仅用于异步中途汇报。',
};

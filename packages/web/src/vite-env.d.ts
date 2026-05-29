/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly API_CLOWDER_HOST: string;
  readonly DEFAULT_API_CLIENT_URL: string;
  readonly CAN_CREATE_MODEL: string;
  readonly NEXT_PUBLIC_API_URL?: string;
  readonly NEXT_PUBLIC_PROD_API_URL?: string;
  readonly NEXT_PUBLIC_PROD_FRONTEND_HOST?: string;
  readonly NEXT_PUBLIC_WHISPER_URL?: string;
  readonly NEXT_PUBLIC_LLM_POSTPROCESS_URL?: string;
  readonly NEXT_PUBLIC_PROJECT_ROOT?: string;
  readonly NEXT_PUBLIC_DEBUG_SKIP_FILE_CHANGE_UI?: string;
  readonly NEXT_PUBLIC_CAS_LOGOUT_URL?: string;
  readonly NEXT_PUBLIC_FEEDBACK_SAVE_W3ACCOUNT?: string;
  readonly NEXT_PUBLIC_FEEDBACK_SAVE_SURVEY_ID?: string;
  readonly NEXT_PUBLIC_FEEDBACK_SAVE_SERVICE_ID?: string;
  readonly NEXT_PUBLIC_FEEDBACK_SAVE_CONTACT_ID?: string;
  readonly NEXT_PUBLIC_JSDELIVR_HOST?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

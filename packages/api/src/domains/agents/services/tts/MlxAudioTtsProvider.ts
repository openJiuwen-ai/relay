/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F34: MLX-Audio TTS Provider
 *
 * Implements ITtsProvider by calling the local Python TTS server
 * (scripts/tts-api.py) via HTTP. The Python server wraps mlx-audio
 * and serves an OpenAI-compatible /v1/audio/speech endpoint.
 */

import type { ITtsProvider, TtsSynthesizeRequest, TtsSynthesizeResult } from '@openjiuwen/relay-shared';

export interface MlxAudioTtsProviderOptions {
  /** Base URL of the Python TTS server (default: http://localhost:9879) */
  readonly baseUrl?: string;
  /** Model to request (default: mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16) */
  readonly model?: string;
  /** Request timeout in ms (default: 30000) */
  readonly timeoutMs?: number;
}

export class MlxAudioTtsProvider implements ITtsProvider {
  readonly id = 'mlx-audio';
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options?: MlxAudioTtsProviderOptions) {
    this.baseUrl = options?.baseUrl ?? process.env.TTS_URL!;
    this.model = options?.model ?? 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16';
    this.timeoutMs = options?.timeoutMs ?? 30_000;
  }

  async synthesize(request: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    const url = `${this.baseUrl}/v1/audio/speech`;

    // F066: Build request body with optional clone params for Qwen3-TTS Base
    const body = JSON.stringify({
      input: request.text,
      voice: request.voice,
      model: this.model,
      response_format: request.format ?? 'wav',
      speed: request.speed ?? 1.0,
      lang_code: request.langCode ?? 'z',
      ...(request.refAudio ? { ref_audio: request.refAudio } : {}),
      ...(request.refText ? { ref_text: request.refText } : {}),
      ...(request.instruct ? { instruct: request.instruct } : {}),
      ...(request.temperature != null ? { temperature: request.temperature } : {}),
    });

    // Clone mode (ref_audio/instruct) is much slower — use longer timeout
    const hasCloneParams = !!(request.refAudio || request.instruct);
    const effectiveTimeout = hasCloneParams ? Math.max(this.timeoutMs, 120_000) : this.timeoutMs;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => 'unknown');
        throw new Error(`TTS server returned ${response.status}: ${detail}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audio = new Uint8Array(arrayBuffer);

      // Respect actual format from server (edge-tts may return mp3 when wav was requested)
      // Whitelist to prevent path traversal via malicious header values
      const serverFormat = response.headers.get('x-audio-format');
      const ALLOWED_FORMATS = new Set(['wav', 'mp3']);
      const actualFormat = serverFormat && ALLOWED_FORMATS.has(serverFormat) ? serverFormat : (request.format ?? 'wav');

      return {
        audio,
        format: actualFormat,
        metadata: {
          provider: this.id,
          model: this.model,
          voice: request.voice,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F34/F066/F103: Cat Voice Configuration
 * Per-agent TTS voice settings, mirroring agent-budgets.ts pattern.
 *
 * Priority: env var override > office-claw-config.json voiceConfig > hardcoded defaults (by breedId)
 *
 * F103: Each agent (not each breed) has independent voice config in office-claw-config.json.
 * loadVoicesFromJson() iterates ALL variants, keyed by agentId — same pattern as avatar/color.
 * Hardcoded breed defaults remain as fallback for cats without explicit voiceConfig.
 *
 * Env vars:
 *   GENSHIN_VOICE_DIR     → base dir for genshin reference audio
 *   CAT_OPUS_TTS_VOICE    → per-agent voice ID override (legacy)
 *   CAT_CODEX_TTS_VOICE   → per-agent voice ID override (legacy)
 *   CAT_GEMINI_TTS_VOICE  → per-agent voice ID override (legacy)
 */

import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import type { VoiceConfig } from '@openjiuwen/relay-shared';
import { officeClawRegistry } from '@openjiuwen/relay-shared';
import { resolveBreedId } from './breed-resolver.js';
import { getAllAgentIdsFromConfig, loadAgentConfig } from './office-claw-config-loader.js';

const VOICE_ENV_KEYS = {
  opus: 'CAT_OPUS_TTS_VOICE',
  codex: 'CAT_CODEX_TTS_VOICE',
  gemini: 'CAT_GEMINI_TTS_VOICE',
} as const;

/**
 * Base directory for Genshin reference audio files.
 * Override with GENSHIN_VOICE_DIR env var.
 */
function genshinVoiceDir(): string {
  return process.env.GENSHIN_VOICE_DIR ?? join(homedir(), 'projects/relay-station/GPT-SoVITS/character-models/genshin');
}

/**
 * F103: Base directory for all character voice models (parent of genshin/ and honkai-starrail/).
 * Priority: CHARACTER_VOICE_DIR > dirname(GENSHIN_VOICE_DIR) > hardcoded default.
 * This ensures backward compat: users who only set GENSHIN_VOICE_DIR still get correct paths.
 */
function characterVoiceBaseDir(): string {
  if (process.env.CHARACTER_VOICE_DIR) return process.env.CHARACTER_VOICE_DIR;
  if (process.env.GENSHIN_VOICE_DIR) return dirname(process.env.GENSHIN_VOICE_DIR);
  return join(homedir(), 'projects/relay-station/GPT-SoVITS/character-models');
}

/**
 * Hardcoded defaults — keyed by breedId so all variants share the same voice.
 *
 * F066 E-type unified scheme: Qwen3-TTS Base clone with Genshin character refs.
 * voice IDs are Kokoro-compatible (zm_yunjian) for mlx-audio fallback;
 * clone mode (qwen3-clone provider) ignores voice and uses refAudio instead.
 *   宪宪 → 流浪者 (Wanderer): 调皮狡黠、得意戏弄
 *   砚砚 → 魈 (Xiao): 傲娇冰山、表面严厉实际关心
 *   烁烁 → 班尼特 (Bennett): 阳光开心、充满热情兴奋
 */
function buildDefaultVoices(): Record<string, VoiceConfig> {
  const base = genshinVoiceDir();
  return {
    ragdoll: {
      voice: 'zm_yunjian',
      langCode: 'zh',
      speed: 1.0,
      refAudio: join(base, '流浪者/vo_wanderer_dialog_greetingMorning.wav'),
      refText: '快醒醒，太阳要晒屁股咯。哈，你不会以为我会这么叫你起床吧？',
      instruct: '用一个调皮狡黠的少年语气说话，带着得意和戏弄',
      temperature: 0.3,
    },
    'maine-coon': {
      voice: 'zm_yunjian',
      langCode: 'zh',
      speed: 1.0,
      refAudio: join(base, '魈/vo_xiao_dialog_close2.wav'),
      refText: '别被污染，我不会留情的。我是说，既然是你，你应该能够保持坚定。',
      instruct: '用一个傲娇冰山少年的语气说话，表面严厉实际关心',
      temperature: 0.3,
    },
    siamese: {
      voice: 'zm_yunjian',
      langCode: 'zh',
      speed: 1.0,
      refAudio: join(base, '班尼特/vo_bennett_dialog_greetingNight.wav'),
      refText: '晚上好！今天的冒险怎么样？',
      instruct: '用一个超级阳光开心的小男孩语气说话，充满热情和兴奋',
      temperature: 0.3,
    },
  };
}

/** Conservative fallback for unknown/dynamic cats */
const GLOBAL_FALLBACK_VOICE: VoiceConfig = {
  voice: 'zm_yunjian',
  langCode: 'zh',
  speed: 1.0,
};

// Lazily built default voices (avoids calling homedir() at import time in tests)
let defaultVoices: Record<string, VoiceConfig> | null = null;
function getDefaultVoices(): Record<string, VoiceConfig> {
  if (!defaultVoices) defaultVoices = buildDefaultVoices();
  return defaultVoices;
}

// Cache from office-claw-config.json
let cachedJsonVoices: Record<string, VoiceConfig> | null = null;

/**
 * F103: Load per-agentId voices from all variants (not just breed defaults).
 * Each variant's agentId gets its own voice config — same pattern as avatar/color.
 *
 * Relative refAudio paths (not starting with /) are resolved against CHARACTER_VOICE_DIR.
 * This lets office-claw-config.json use clean paths like "genshin/流浪者/xxx.wav".
 */
function loadVoicesFromJson(): Record<string, VoiceConfig> {
  if (cachedJsonVoices) return cachedJsonVoices;

  try {
    const config = loadAgentConfig();
    const baseDir = characterVoiceBaseDir();
    cachedJsonVoices = {};
    for (const breed of config.breeds) {
      for (const variant of breed.variants) {
        if (variant.voiceConfig) {
          const agentId = variant.agentId ?? breed.agentId;
          const vc = variant.voiceConfig;
          cachedJsonVoices[agentId] =
            vc.refAudio && !isAbsolute(vc.refAudio) ? { ...vc, refAudio: join(baseDir, vc.refAudio) } : vc;
        }
      }
    }
    return cachedJsonVoices;
  } catch {
    cachedJsonVoices = {};
    return cachedJsonVoices;
  }
}

/**
 * Get TTS voice config for an agent.
 * Priority: env var override (voice only) > office-claw-config.json > hardcoded defaults (by breedId)
 */
export function getAgentVoice(agentName: string): VoiceConfig {
  // 1. Get base voice from JSON or default (resolve breedId for DEFAULT_VOICES)
  const jsonVoices = loadVoicesFromJson();
  const breedId = resolveBreedId(agentName);
  const defaults = getDefaultVoices();
  const baseVoice: VoiceConfig =
    jsonVoices[agentName] ?? (breedId ? defaults[breedId] : undefined) ?? defaults[agentName] ?? GLOBAL_FALLBACK_VOICE;

  // 2. Check for per-agent env var override (voice ID only)
  const perAgentEnvKey = VOICE_ENV_KEYS[agentName as keyof typeof VOICE_ENV_KEYS];
  const perAgentEnvValue = process.env[perAgentEnvKey];
  if (perAgentEnvValue?.trim()) {
    return {
      ...baseVoice,
      voice: perAgentEnvValue.trim(),
    };
  }

  return baseVoice;
}

/**
 * Get all agent voices (for diagnostics/display)
 */
export function getAllAgentVoices(): Record<string, VoiceConfig> {
  const result: Record<string, VoiceConfig> = {};
  // F032 P2: use dynamic config fallback instead of hardcoded agent names
  const registryIds = officeClawRegistry.getAllIds();
  const allIds = registryIds.length > 0 ? registryIds.map(String) : getAllAgentIdsFromConfig();
  for (const agentName of allIds) {
    result[agentName] = getAgentVoice(agentName);
  }
  return result;
}

/** Clear cached voices (for testing) */
export function clearVoiceCache(): void {
  cachedJsonVoices = null;
  defaultVoices = null;
}

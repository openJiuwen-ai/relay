/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * SymlinkManager — no-op stubs.
 *
 * OfficeClaw skills live in office-claw-skills/ and .office-claw/skills/.
 * JiuwenClaw reads them via JIUWENCLAW_SHARED_SKILLS_DIRS.
 * No symlinks to external CLI directories are created or removed.
 */

export type ProviderMounts = Record<string, boolean>;

export async function createProviderSymlinks(_skillName: string, _skillsDir: string): Promise<ProviderMounts> {
  return {};
}

export async function removeProviderSymlinks(_skillName: string): Promise<void> {}

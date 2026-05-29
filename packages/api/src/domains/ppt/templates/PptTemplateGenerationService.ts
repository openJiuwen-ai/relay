/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { stat } from 'node:fs/promises';
import { createModuleLogger } from '../../../infrastructure/logger.js';
import { PptTemplateStore, type PptTemplateRecord } from './PptTemplateStore.js';

const log = createModuleLogger('ppt-template-generate-service');
const DEFAULT_GENERATION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const DEFAULT_PROGRESS_LOG_INTERVAL_MS = 5 * 60 * 1000;

export class PptTemplateGenerationError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly detail?: string;

  constructor(input: { message: string; code: string; statusCode: number; detail?: string }) {
    super(input.message);
    this.name = 'PptTemplateGenerationError';
    this.code = input.code;
    this.statusCode = input.statusCode;
    this.detail = input.detail;
  }
}

export interface PptTemplateSkillInvocationResult {
  stdout?: string;
  stderr?: string;
}

export type InvokePptTemplateSkill = (input: {
  prompt: string;
  originFilePath: string;
  outputRoot: string;
  signal?: AbortSignal;
}) => Promise<PptTemplateSkillInvocationResult>;

export interface PptTemplateGenerationServiceOptions {
  store: PptTemplateStore;
  hostRoot: string;
  invokeSkill: InvokePptTemplateSkill;
  generationTimeoutMs?: number;
  progressLogIntervalMs?: number;
}

async function ensureFileExists(filePath: string): Promise<void> {
  const info = await stat(filePath);
  if (!info.isFile() || info.size <= 0) {
    throw new Error(`Generated template file missing or empty: ${filePath}`);
  }
}

function normalizePromptPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function buildGenerationPrompt(input: {
  originFilePath: string;
  outputRoot: string;
}): string {
  const outputRoot = normalizePromptPath(input.outputRoot);
  const originFilePath = normalizePromptPath(input.originFilePath);
  return [
    '请使用 ppt-template-generate skill 生成一个 PPT 风格模板。',
    `源 PPT 文件路径：${originFilePath}`,
    `模板保存根目录：${outputRoot}`,
    '',
    '要求：',
    '1. 必须生成 PPT 风格模板，而不是普通总结或分析文本。',
    '2. 生成结果必须保存在指定的 .office-claw/ppt-template 目录下。',
    '3. 生成结果目录中必须包含模板主文件（.md）、slides/ 预览图目录，以及 temp/ 提取产物目录。',
    '4. 请根据 PPT 风格自行生成模板名称；如果目录名冲突，请按 skill 约定处理目录重名，但最终输出目录和模板主文件名称必须保持一致。',
    '',
    '参考指令：',
    '将此ppt生成一个风格模板，放在.office-claw/ppt-template目录下，输出模板目录及其必要产物。',
  ].join('\n');
}

export class PptTemplateGenerationService {
  constructor(private readonly options: PptTemplateGenerationServiceOptions) {}

  private async invokeSkillWithTimeout(input: {
    templateId: string;
    requestedName: string;
    prompt: string;
    originFilePath: string;
    outputRoot: string;
    beforeTemplateDirs: readonly string[];
  }): Promise<PptTemplateSkillInvocationResult> {
    const timeoutMs = this.options.generationTimeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS;
    const progressLogIntervalMs = this.options.progressLogIntervalMs ?? DEFAULT_PROGRESS_LOG_INTERVAL_MS;
    const startedAt = Date.now();
    const abortController = new AbortController();

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    try {
      log.info(
        {
          templateId: input.templateId,
          requestedName: input.requestedName,
          timeoutMs,
        },
        '[ppt-template-generate] skill invocation started',
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          abortController.abort();
          reject(
            new PptTemplateGenerationError({
              code: 'ppt_template_generation_timeout',
              statusCode: 504,
              message: `PPT template generation timed out after ${Math.round(timeoutMs / 1000)} seconds`,
              detail: 'PPT 模板生成超时，请稍后重试或检查生成器日志',
            }),
          );
        }, timeoutMs);
      });

      heartbeat = setInterval(() => {
        this.options.store
          .getGenerationOutputSnapshot(input.beforeTemplateDirs)
          .then((outputSnapshot) => {
            log.info(
              {
                templateId: input.templateId,
                requestedName: input.requestedName,
                elapsedMs: Date.now() - startedAt,
                timeoutMs,
                outputSnapshot,
              },
              '[ppt-template-generate] skill invocation still running',
            );
          })
          .catch((error: unknown) => {
            log.warn(
              {
                templateId: input.templateId,
                requestedName: input.requestedName,
                elapsedMs: Date.now() - startedAt,
                timeoutMs,
                error: error instanceof Error ? error.message : String(error),
              },
              '[ppt-template-generate] skill invocation still running; output snapshot failed',
            );
          });
      }, progressLogIntervalMs);

      return await Promise.race([
        this.options.invokeSkill({
          prompt: input.prompt,
          originFilePath: input.originFilePath,
          outputRoot: input.outputRoot,
          signal: abortController.signal,
        }),
        timeoutPromise,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (heartbeat) clearInterval(heartbeat);
    }
  }

  async generateFromUpload(input: { name: string; fileName: string; buffer: Buffer }): Promise<PptTemplateRecord> {
    const requestedName = input.name.trim();
    log.info({ fileName: input.fileName, requestedName }, '[ppt-template-generate] upload received');
    const originFilePath = await this.options.store.saveUploadedSource(input.fileName, input.buffer);
    const record = await this.options.store.createUserTemplate({
      name: requestedName,
      originFileName: input.fileName,
      originFilePath,
      status: 'generating',
    });
    log.info(
      {
        templateId: record.templateId,
        requestedName,
        originFilePath,
      },
      '[ppt-template-generate] transient template created',
    );

    const prompt = buildGenerationPrompt({
      originFilePath,
      outputRoot: this.options.store.rootDir,
    });
    log.info(
      {
        templateId: record.templateId,
        requestedName,
        outputRoot: this.options.store.rootDir,
      },
      '[ppt-template-generate] scanning existing template directories before generation',
    );
    const beforeTemplateDirs = await this.options.store.getPersistedTemplateDirs();
    log.info(
      {
        templateId: record.templateId,
        requestedName,
        outputRoot: this.options.store.rootDir,
        templateDirCountBefore: beforeTemplateDirs.length,
      },
      '[ppt-template-generate] invoking skill',
    );

    try {
      const skillResult = await this.invokeSkillWithTimeout({
        templateId: record.templateId,
        requestedName,
        prompt,
        originFilePath,
        outputRoot: this.options.store.rootDir,
        beforeTemplateDirs,
      });
      log.info(
        {
          templateId: record.templateId,
          requestedName,
          stdoutLength: skillResult.stdout?.length ?? 0,
          stderrLength: skillResult.stderr?.length ?? 0,
        },
        '[ppt-template-generate] skill invocation finished',
      );

      log.info(
        {
          templateId: record.templateId,
          requestedName,
        },
        '[ppt-template-generate] scanning generated output directories',
      );

      const updated = await this.options.store.finalizeGeneratedTemplate(record.templateId, {
        expectedName: requestedName,
        beforeTemplateDirs,
      });

      if (!updated) {
        const afterTemplateDirs = await this.options.store.getPersistedTemplateDirs();
        log.error(
          {
            templateId: record.templateId,
            requestedName,
            beforeTemplateDirs,
            afterTemplateDirs,
          },
          '[ppt-template-generate] output directory scan did not yield a finalized template',
        );
        throw new Error(`Generated template directory was not discovered after skill finished: ${requestedName}`);
      }

      if (updated.templateDir) {
        await ensureFileExists(`${updated.templateDir}/${updated.name}.md`);
      }

      log.info(
        {
          templateId: updated.templateId,
          finalizedName: updated.name,
          templateDir: updated.templateDir,
          requestedName,
        },
        '[ppt-template-generate] template finalized from directory scan',
      );

      return updated;
    } catch (error) {
      const normalizedError = this.normalizeGenerationError(error);
      log.error(
        {
          templateId: record.templateId,
          name: requestedName,
          error: normalizedError.message,
        },
        '[ppt-template-generate] generation failed',
      );

      await this.options.store.markGenerationFailed(record.templateId, normalizedError.message).catch(() => {
        // Best-effort failure state write-back.
      });
      throw normalizedError;
    }
  }

  private normalizeGenerationError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('VLM_DEPENDENCY_MISSING')) {
      return new PptTemplateGenerationError({
        code: 'ppt_template_dependency_missing',
        statusCode: 503,
        message,
        detail: message,
      });
    }
    return error instanceof Error ? error : new Error(message);
  }
}

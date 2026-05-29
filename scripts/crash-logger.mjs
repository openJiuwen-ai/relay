/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * 崩溃日志管理器 - Node.js 版本
 * 支持日志轮转和崩溃报告生成
 */
export class CrashLogger {
  constructor(projectRoot, serviceName) {
    this.projectRoot = projectRoot;
    this.serviceName = serviceName;
    this.logsDir = path.join(projectRoot, 'logs', serviceName);
    this.crashReportDir = path.join(projectRoot, 'logs', 'crash-reports');
    this.logFilePath = path.join(this.logsDir, `${serviceName}.log`);
    this.maxLogFileSize = 10 * 1024 * 1024; // 10MB
    this.maxArchiveCount = 5;
    this.maxCrashReports = 100;

    fs.mkdirSync(this.logsDir, { recursive: true });
    fs.mkdirSync(this.crashReportDir, { recursive: true });

    this.setupCrashHandlers();
  }

  setupCrashHandlers() {
    // 捕获未处理的 Promise rejection
    process.on('unhandledRejection', (reason, promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.writeCrashReport(error, {
        source: 'unhandledRejection',
        promise: String(promise),
      });
      this.appendLog(`FATAL: Unhandled rejection - ${error.message}`);
    });

    // 捕获未捕获的异常
    process.on('uncaughtException', (error, origin) => {
      this.writeCrashReport(error, {
        source: 'uncaughtException',
        origin,
      });
      this.appendLog(`FATAL: Uncaught exception - ${error.message}`);
      // 给崩溃报告写入时间，然后退出
      setTimeout(() => process.exit(1), 100);
    });

    // 捕获进程退出
    process.on('exit', (code) => {
      if (code !== 0) {
        this.appendLog(`Process exiting with code ${code}`);
      }
    });

    // 捕获 SIGTERM/SIGINT
    ['SIGTERM', 'SIGINT'].forEach((signal) => {
      process.on(signal, () => {
        this.appendLog(`Received ${signal}, shutting down gracefully`);
        process.exit(0);
      });
    });
  }

  appendLog(message) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `${timestamp} ${message}\n`;
      fs.appendFileSync(this.logFilePath, logEntry, 'utf8');
      this.checkAndRotateLog();
    } catch (err) {
      // 日志写入失败时静默处理
      console.error('Failed to write log:', err.message);
    }
  }

  checkAndRotateLog() {
    try {
      const stats = fs.statSync(this.logFilePath);
      if (stats.size < this.maxLogFileSize) {
        return;
      }

      // 轮转日志
      for (let i = this.maxArchiveCount - 1; i >= 1; i--) {
        const oldPath = `${this.logFilePath}.${i}`;
        const newPath = `${this.logFilePath}.${i + 1}`;
        if (fs.existsSync(oldPath)) {
          if (fs.existsSync(newPath)) {
            fs.unlinkSync(newPath);
          }
          fs.renameSync(oldPath, newPath);
        }
      }

      const archivePath = `${this.logFilePath}.1`;
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
      fs.renameSync(this.logFilePath, archivePath);
    } catch (err) {
      // 轮转失败时继续写入当前文件
      console.error('Failed to rotate log:', err.message);
    }
  }

  writeCrashReport(error, context = {}) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const reportBaseName = `crash-${this.serviceName}-${timestamp}`;
      const jsonPath = path.join(this.crashReportDir, `${reportBaseName}.json`);
      const logPath = path.join(this.crashReportDir, `${reportBaseName}.log`);

      // 生成结构化崩溃报告
      const report = {
        timestamp: new Date().toISOString(),
        service: this.serviceName,
        exception: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: error.code,
        },
        process: {
          pid: process.pid,
          version: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
        },
        system: {
          hostname: os.hostname(),
          type: os.type(),
          release: os.release(),
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          cpus: os.cpus().length,
          loadavg: os.loadavg(),
        },
        context,
      };

      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

      // 复制最近的日志到崩溃报告
      if (fs.existsSync(this.logFilePath)) {
        fs.copyFileSync(this.logFilePath, logPath);
      }

      this.cleanupOldCrashReports();
    } catch (err) {
      // 崩溃报告写入失败时静默处理
      console.error('Failed to write crash report:', err.message);
    }
  }

  cleanupOldCrashReports() {
    try {
      const files = fs
        .readdirSync(this.crashReportDir)
        .filter((f) => f.startsWith(`crash-${this.serviceName}-`) && f.endsWith('.json'))
        .map((f) => path.join(this.crashReportDir, f))
        .sort();

      if (files.length <= this.maxCrashReports) {
        return;
      }

      for (let i = 0; i < files.length - this.maxCrashReports; i++) {
        const baseName = path.basename(files[i], '.json');
        fs.unlinkSync(files[i]);
        const logFile = path.join(this.crashReportDir, `${baseName}.log`);
        if (fs.existsSync(logFile)) {
          fs.unlinkSync(logFile);
        }
      }
    } catch (err) {
      // 清理失败时忽略
      console.error('Failed to cleanup old crash reports:', err.message);
    }
  }

  /**
   * 创建子进程状态快照（用于记录多服务状态）
   */
  captureProcessSnapshot(childProcesses = []) {
    const snapshot = {
      timestamp: new Date().toISOString(),
      parent: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
      children: childProcesses.map((child) => ({
        pid: child.pid,
        killed: child.killed,
        exitCode: child.exitCode,
        signalCode: child.signalCode,
        spawnfile: child.spawnfile,
      })),
    };

    const snapshotPath = path.join(
      this.crashReportDir,
      `snapshot-${this.serviceName}-${Date.now()}.json`
    );
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
    return snapshot;
  }
}

/**
 * 创建全局崩溃日志实例
 */
export function createCrashLogger(projectRoot, serviceName) {
  return new CrashLogger(projectRoot, serviceName);
}

#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * 崩溃日志查看工具
 *
 * 用法：
 *   node scripts/view-crash-logs.mjs                    # 列出所有崩溃报告
 *   node scripts/view-crash-logs.mjs --latest           # 查看最新崩溃
 *   node scripts/view-crash-logs.mjs --service api      # 查看指定服务崩溃
 *   node scripts/view-crash-logs.mjs --clean            # 清理旧崩溃报告
 */
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const crashReportDir = path.join(projectRoot, 'logs', 'crash-reports');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    latest: args.includes('--latest'),
    service: args.find((arg, i) => args[i - 1] === '--service'),
    clean: args.includes('--clean'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function listCrashReports(service = null) {
  if (!fs.existsSync(crashReportDir)) {
    console.log('No crash reports found.');
    return [];
  }

  let files = fs
    .readdirSync(crashReportDir)
    .filter((f) => f.startsWith('crash-') && f.endsWith('.json'));

  if (service) {
    files = files.filter((f) => f.includes(`-${service}-`));
  }

  return files
    .map((f) => {
      const filePath = path.join(crashReportDir, f);
      const stats = fs.statSync(filePath);
      return {
        name: f,
        path: filePath,
        mtime: stats.mtime,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function displayCrashReport(reportPath) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (error) {
    console.error(`\n⚠️  Cannot read crash report: ${path.basename(reportPath)}`);
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    console.error(
      '   The report may be truncated (process killed mid-write) or from an incompatible version.',
    );
    return false;
  }
  if (!report || typeof report !== 'object') {
    console.error(`\n⚠️  Cannot read crash report: ${path.basename(reportPath)} (unexpected JSON shape)`);
    return false;
  }

  const exception = report.exception ?? {};
  const processInfo = report.process ?? {};
  const systemInfo = report.system ?? {};

  console.log('\n' + '='.repeat(80));
  console.log(`Crash Report: ${path.basename(reportPath)}`);
  console.log('='.repeat(80));

  console.log(`\n📅 Timestamp: ${report.timestamp ?? 'unknown'}`);
  console.log(`🔧 Service: ${report.service || 'desktop'}`);

  console.log('\n💥 Exception:');
  console.log(`  Type: ${exception.name || exception.type || 'Unknown'}`);
  console.log(`  Message: ${exception.message ?? 'n/a'}`);
  if (exception.code) {
    console.log(`  Code: ${exception.code}`);
  }

  console.log('\n📚 Stack Trace:');
  const stack = exception.stack || exception.stackTrace;
  if (stack) {
    console.log(stack.split('\n').map(line => `  ${line}`).join('\n'));
  }

  console.log('\n⚙️  Process Info:');
  console.log(`  PID: ${processInfo.pid || processInfo.id || 'unknown'}`);
  if (processInfo.version) {
    console.log(`  Node Version: ${processInfo.version}`);
  }
  if (processInfo.workingSet) {
    console.log(`  Memory: ${(processInfo.workingSet / 1024 / 1024).toFixed(2)} MB`);
  } else if (processInfo.memoryUsage) {
    const mem = processInfo.memoryUsage;
    console.log(`  Memory RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Memory Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} / ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  }

  console.log('\n🖥️  System Info:');
  console.log(`  OS: ${systemInfo.os || systemInfo.type || 'unknown'} ${systemInfo.release || ''}`);
  if (systemInfo.hostname) {
    console.log(`  Hostname: ${systemInfo.hostname}`);
  }
  if (systemInfo.cpus) {
    console.log(`  CPUs: ${systemInfo.cpus}`);
  }

  if (report.context && Object.keys(report.context).length > 0) {
    console.log('\n📝 Context:');
    for (const [key, value] of Object.entries(report.context)) {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  // 检查是否有对应的日志文件
  const logPath = reportPath.replace('.json', '.log');
  if (fs.existsSync(logPath)) {
    console.log(`\n📄 Full log available at: ${logPath}`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
  return true;
}

function cleanOldReports(daysOld = 7) {
  if (!fs.existsSync(crashReportDir)) {
    console.log('No crash reports directory found.');
    return;
  }

  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  const files = fs.readdirSync(crashReportDir);
  for (const file of files) {
    const filePath = path.join(crashReportDir, file);
    const stats = fs.statSync(filePath);

    if (stats.mtime.getTime() < cutoffTime) {
      fs.unlinkSync(filePath);
      deletedCount++;
      console.log(`Deleted: ${file}`);
    }
  }

  console.log(`\nCleaned up ${deletedCount} old crash reports (older than ${daysOld} days).`);
}

function showHelp() {
  console.log(`
Crash Log Viewer

Usage:
  node scripts/view-crash-logs.mjs [options]

Options:
  --latest              Show the most recent crash report
  --service <name>      Filter by service name (api, agent, desktop, etc.)
  --clean               Delete crash reports older than 7 days
  -h, --help            Show this help message

Examples:
  node scripts/view-crash-logs.mjs
  node scripts/view-crash-logs.mjs --latest
  node scripts/view-crash-logs.mjs --service api
  node scripts/view-crash-logs.mjs --clean
`);
}

function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  if (args.clean) {
    cleanOldReports();
    return;
  }

  const reports = listCrashReports(args.service);

  if (reports.length === 0) {
    console.log('No crash reports found.');
    return;
  }

  if (args.latest) {
    if (!displayCrashReport(reports[0].path)) {
      process.exitCode = 1;
    }
  } else {
    console.log(`\nFound ${reports.length} crash report(s):\n`);
    reports.forEach((report, index) => {
      const age = Math.floor((Date.now() - report.mtime.getTime()) / 1000 / 60);
      const ageStr = age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`;
      console.log(`  ${index + 1}. ${report.name} (${ageStr})`);
    });
    console.log('\nUse --latest to view the most recent crash report.');
  }
}

main();

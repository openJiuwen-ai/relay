#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * 崩溃日志测试脚本
 *
 * 用法：
 *   node scripts/test-crash-logging.mjs --csharp     # 测试 C# launcher 崩溃
 *   node scripts/test-crash-logging.mjs --nodejs     # 测试 Node.js 崩溃
 *   node scripts/test-crash-logging.mjs --check      # 检查崩溃报告
 */

import { createCrashLogger } from './crash-logger.mjs';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const args = process.argv.slice(2);

// 测试 Node.js 崩溃
if (args.includes('--nodejs')) {
  console.log('🧪 Testing Node.js crash logging...\n');

  const crashLogger = createCrashLogger(projectRoot, 'test');
  crashLogger.appendLog('Test service started');
  crashLogger.appendLog('Simulating crash in 2 seconds...');

  setTimeout(() => {
    console.log('💥 Triggering crash...\n');

    // 选择一种崩溃方式：

    // 方式 1: 未捕获异常
    throw new Error('Test crash: simulating uncaught exception');

    // 方式 2: Promise rejection（取消注释测试）
    // Promise.reject(new Error('Test crash: unhandled rejection'));

    // 方式 3: 空引用
    // const obj = null;
    // obj.property;
  }, 2000);
}

// 测试 C# 崩溃（生成测试代码）
else if (args.includes('--csharp')) {
  console.log('🧪 Testing C# crash logging...\n');
  console.log('请按以下步骤操作：\n');
  console.log('1. 打开文件: packaging/windows/desktop/ClowderDesktop.cs');
  console.log('2. 找到 InitializeAsync() 方法（约第 322 行）');
  console.log('3. 在方法开头添加以下代码：\n');
  console.log('   try');
  console.log('   {');
  console.log('       // 测试崩溃');
  console.log('       throw new InvalidOperationException("Test crash: simulating launcher failure");');
  console.log('   }');
  console.log('   catch (Exception ex)');
  console.log('   {');
  console.log('       AppendLog("Launcher failed: " + ex);');
  console.log('       var context = new System.Collections.Generic.Dictionary<string, object>();');
  console.log('       context.Add("phase", "test-crash");');
  console.log('       _crashLogger.WriteCrashReport(ex, context);');
  console.log('       throw; // 重新抛出以触发全局处理器');
  console.log('   }\n');
  console.log('4. 重新编译并运行：');
  console.log('   node scripts/build-windows-installer.mjs --launcher-only');
  console.log('   ./dist/windows/bundle/OfficeClaw.exe\n');
  console.log('5. 检查崩溃报告：');
  console.log('   node scripts/test-crash-logging.mjs --check\n');
}

// 检查崩溃报告
else if (args.includes('--check')) {
  console.log('📋 Checking crash reports...\n');

  const crashReportDir = path.join(projectRoot, 'logs', 'crash-reports');

  if (!fs.existsSync(crashReportDir)) {
    console.log('❌ No crash reports directory found.');
    console.log(`   Expected: ${crashReportDir}\n`);
    process.exit(1);
  }

  const files = fs.readdirSync(crashReportDir)
    .filter(f => f.startsWith('crash-') && f.endsWith('.json'))
    .map(f => {
      const filePath = path.join(crashReportDir, f);
      const stats = fs.statSync(filePath);
      return { name: f, path: filePath, mtime: stats.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    console.log('❌ No crash reports found.');
    console.log('   Run a crash test first:\n');
    console.log('   node scripts/test-crash-logging.mjs --nodejs\n');
    process.exit(1);
  }

  console.log(`✅ Found ${files.length} crash report(s):\n`);

  files.slice(0, 5).forEach((file, index) => {
    const age = Math.floor((Date.now() - file.mtime.getTime()) / 1000);
    const ageStr = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`;
    console.log(`${index + 1}. ${file.name} (${ageStr})`);
  });

  console.log('\n📄 Latest crash report:\n');
  const latest = JSON.parse(fs.readFileSync(files[0].path, 'utf8'));
  console.log(`Service: ${latest.service || 'desktop'}`);
  console.log(`Time: ${latest.timestamp}`);
  console.log(`Exception: ${latest.exception.name || latest.exception.type}`);
  console.log(`Message: ${latest.exception.message}`);

  if (latest.context) {
    console.log(`Context: ${JSON.stringify(latest.context, null, 2)}`);
  }

  console.log('\n✅ Crash logging is working!\n');
  console.log('View full report:');
  console.log(`  node scripts/view-crash-logs.mjs --latest\n`);
}

// 显示帮助
else {
  console.log('崩溃日志测试工具\n');
  console.log('用法:');
  console.log('  node scripts/test-crash-logging.mjs --nodejs     # 测试 Node.js 崩溃');
  console.log('  node scripts/test-crash-logging.mjs --csharp     # 显示 C# 测试步骤');
  console.log('  node scripts/test-crash-logging.mjs --check      # 检查崩溃报告\n');
  console.log('示例流程:');
  console.log('  1. node scripts/test-crash-logging.mjs --nodejs');
  console.log('  2. node scripts/test-crash-logging.mjs --check');
  console.log('  3. node scripts/view-crash-logs.mjs --latest\n');
}

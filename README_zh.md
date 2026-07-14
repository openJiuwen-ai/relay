<div align="center">

# Relay

**多智能体协作平台 — 让 AI 团队为你工作**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9+-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

**简体中文** | [English](README.md)

</div>

---

## 简介

Relay 是一个多智能体协作平台，通过统一的界面进行协作开发、代码审查、任务管理，将多个 AI Agent 组织成一个真正的团队。

> **大多数框架帮你调用 Agent，Relay 帮他们协同工作。**

## 快速开始

**前置条件：** Node.js 20+、pnpm 9+、Git

```bash
# 1. 克隆
git clone https://gitcode.com/openJiuwen/relay.git
cd relay

# 2. 安装依赖
pnpm install

# 3. 构建
pnpm build

# 4. 配置
cp .env.example .env
# 编辑 .env，配置华为云 MaaS API Key

# 5. 启动
pnpm start
```

打开 http://localhost:3003 开始使用。

## 架构简介

Relay 是平台的核心引擎，采用 Python 构建：

**核心能力：**

| 模块 | 说明 |
|-----|------|
| **技能系统** | 按需加载技能包（TDD、调试、审查等） |
| **通道系统** | Web、小艺、飞书等多平台接入 |
| **记忆系统** | 会话记忆、长期记忆、跨会话知识持久化 |
| **浏览器自动化** | 自动化 Web 操作，扩展 Agent 能力边界 |
| **任务规划** | 拆解复杂任务，自动编排执行步骤 |
| **定时任务** | 支持 cron 定时触发，自动执行计划任务 |

**生态兼容：**
- 支持华为云 MaaS 多种模型
- 与小艺开放平台原生集成
- 自托管，数据完全自主可控

## 功能

### 主页界面

<!-- 截图待补充：docs/assets/ 目录下需放置 home.png, models.png, agents.png, skills.png, channels.png, scheduled-tasks.png, runtime-status.png -->

多智能体对话，支持 @提及路由、线程隔离、富文本卡片回复。

### 模型管理

配置和管理华为云 MaaS 模型，支持多模型切换。

### 智能体管理

配置智能体角色、技能、协作策略。

### 技能系统

动态加载技能包，按需扩展 Agent 能力。

### 渠道管理

飞书、小艺等多渠道接入配置。

### 定时任务

创建、管理定时任务，自动执行计划操作。

### 运行时状态

实时监控智能体运行状态和资源使用。

## 参与贡献

欢迎贡献！请遵循以下流程：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开源许可

本项目基于 [Apache License 2.0](LICENSE) 开源。

基于 Apache License, Version 2.0 许可。除非符合许可条款，否则不得使用本文件。

---

<p align="center">
  <em>构建 AI 团队，不只是 Agent。</em>
</p>
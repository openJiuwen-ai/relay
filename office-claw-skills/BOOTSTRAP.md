# OfficeClaw Skills Bootstrap

<EXTREMELY_IMPORTANT>
你已加载 OfficeClaw Skills。路由规则定义在 `manifest.yaml`。

## Skills 目录（共 4 大类 12 个）

### 办公套件

| Skill | 触发场景 |
|-------|----------|
| `minimax-pdf` | 高视觉质量 PDF 生成、填表与重设计 |
| `minimax-xlsx` | Excel / CSV / TSV 创建、分析、零损编辑与校验 |
| `official-doc-formatter` | 按国标公文规范格式化 Word 文档 |

### 企业协作

| Skill | 触发场景 |
|-------|----------|
| `meeting-autopilot-pro` | 会议全生命周期准备、记录、跟进与行动项追踪 |
| `email-manager` | 邮件发送、查收、回复、标记与多邮箱管理 |

### 自媒体

| Skill | 触发场景 |
|-------|----------|
| `daily-briefing` | 每日销售简报、优先级和会前准备 |
| `knowledge-organizer-xiaping` | 文章/笔记整理、归档、摘要与同步 |
| `lidan-writing-framework` | 用七步框架把复杂概念写清楚 |
| `canned-responses-review` | 常见法务询问模板回复与升级识别 |
| `openai-whisper-cn` | 本地语音转文字、音频转录、会议录音转文本 |

### 开发与工程

| Skill | 触发场景 |
|-------|----------|
| `skill-creator` | 创建、迭代、评估和优化 skill 的开发工作流 |
| `skill-vetter` | 安全优先的 skill 审核与风险评估，用于安装前审查 |

## 说明

- 当前官方清单以 `office-claw-skills/` 顶层目录中的实际 skill 为准。
- `BOOTSTRAP.md` 负责分类速览，`manifest.yaml` 负责路由与元数据。
- 
## 关键规则

1. **Skill 适用就必须使用。**
2. **`manifest.yaml` 是触发、路由、描述的单一真相源。**
3. **`BOOTSTRAP.md` 只维护官方 skills 的分类速览，不承载实现细节。**
4. **`refs/` 是参考材料，不是独立 skill。**
5. **新增或修改 skill 时，必须同时同步目录、`manifest.yaml` 与 `BOOTSTRAP.md`。**
6. **技能分类按 4 大类组织：办公套件、企业协作、自媒体、开发与工程**

## 使用方式

- **Claude**: Skills 自动触发（`~/.claude/skills/`）
- **Codex**: 读取对应 `SKILL.md` 后执行
- **Gemini**: Skills 自动触发（`~/.gemini/skills/`）

## 新增/修改 skill

1. 在 `{skills-dir}/{name}/` 创建或更新 `SKILL.md`
2. 在 `manifest.yaml` 添加或更新路由条目（按 4 大类分组）
3. 在 `BOOTSTRAP.md` 将 skill 放入正确分类
4. 保持顶��目录、注册表与说明文档一致
5. 运行校验，确认目录、注册表与 refs 一致

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.
</EXTREMELY_IMPORTANT>

# ChatInput 重构说明

## 目标与原则
- 保持功能行为不变（发送、排队、菜单、模板、工作区、历史、补全逻辑一致）。
- 主组件只保留跨模块编排；本地 UI 逻辑尽量下沉到子组件或 hook。
- 统一类型定义，减少跨文件重复声明与强制类型断言。

## 当前架构
- `ChatInput.tsx`
  - 负责跨域状态编排与数据流拼装（发送流、队列流、菜单协同、草稿同步等）。
  - 不再承载 mention/skill 输入细节与键盘分支实现细节。
- `types.ts`
  - 统一维护 `ChatInputProps`、`WorkspaceOptionItem`、`WorkspaceMenuItem`、`SelectedTemplateSummary`。
- `components/ChatInputLayout.tsx`
  - 已完成视图壳抽取（用于承载大段 JSX 结构）。
  - 已接入 `ChatInput.tsx` 主渲染出口，作为主视图壳承载 JSX 结构。

## hooks 职责
- `useChatInputInputFlow.ts`：输入变更流（触发 mention/skill 菜单、索引初始化等）。
- `useChatInputKeyboard.ts`：键盘策略层（菜单导航、路径补全导航、历史建议接受、发送热键）。
- `useChatInputSendFlow.ts`：发送与排队发送行为、payload 规范化。
- `useChatInputTemplateFlow.ts`：模板弹层开关与模板选择回写。
- `useTemplateMode.ts`：引导模式与已选模板状态。
- `useMentionSkillActions.ts`：mention/skill 插入动作与 mention 菜单定位计算。
- `useMentionMenuPositioning.ts`：mention 菜单定位副作用（输入变化、窗口 resize/scroll）。
- `useSkillOptionsSource.ts`：技能列表加载、缓存更新订阅与加载态管理。
- `useCloseMenusCoordinator.ts`：统一关闭菜单时的附加清理（搜索词、工作区过滤）。
- `useWorkspaceMenu.ts`：工作区过滤、菜单项构建、菜单项选择分发。
- `useBottomLeftControls.ts`：左下角技能入口相关行为（锚点记录、跳转技能管理）。
- `useBottomRightActions.ts`：右下角工作区搜索键盘交互、附件选择触发。
- `usePanelMenuCoordinator.ts`：面板激活态协调与索引边界同步。
- `usePanelSearchFill.ts`：mention/skill 搜索过滤与索引重置。
- `useQueueManager.ts`：消息队列数据与删除/置顶/清空操作。
- `useQuickActions.ts`：快捷场景与提示词链路。
- `useAttachmentManager.ts`：附件选择、粘贴、删除。

## components 职责
- `RichTextarea.tsx`：输入内核（富文本 token 渲染、selection/composition 能力）。
- `ChatInputMenus.tsx`：mention 菜单显示与交互。
- `SkillMenuPanel.tsx`：技能菜单显示与交互。
- `ChatInputBottomLeft.tsx` / `ChatInputSkillControls.tsx`：左下角操作区（技能、引导模式、风格模板）。
- `ChatInputBottomRight.tsx`：右下角操作区（工作区、附件、发送/停止/排队）。
- `QuickActionsPanel.tsx`：快捷场景入口与提示词。
- `ChatInputQueuePanel.tsx`：队列展示与操作。
- `PathCompletionMenu.tsx`：路径补全候选。
- `ImagePreview.tsx`：附件预览。
- `HistorySearchModal.tsx`：历史检索弹层。
- `TemplatePicker.tsx`：模板选择器。
- 移动工具栏旧链路已移除，不再作为新 ChatInput 目录组件维护。
- `ChatInputLayout.tsx`：ChatInput 的视图壳（已接入，承载主要 JSX 结构）。

## 本轮重构已完成优化
- 去除 `ChatInput.tsx` 中 `workspaceMenuItems as WorkspaceMenuItem[]` 强制断言，类型链路已打通。
- 键盘逻辑重构为策略函数，降低单函数复杂度。
- mention 菜单定位副作用已下沉至 `useMentionMenuPositioning.ts`。
- 技能加载链路已下沉至 `useSkillOptionsSource.ts`。
- 菜单关闭统一清理已下沉至 `useCloseMenusCoordinator.ts`。
- 草稿同步 / pending insert 消费 / 历史建议同步已分别下沉到独立 hook。
- whisper 未激活链路已从新 ChatInput 主链路移除。
- 公共类型集中到 `types.ts`。




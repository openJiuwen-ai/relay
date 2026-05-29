---
name: official-doc-formatter
description: Format Word documents to official Chinese government and enterprise document standards, including requests, plans, attachments, heading hierarchy, spacing, fonts, and punctuation rules. Use when users need to normalize or restyle formal DOCX materials, especially official memos, requests, plans, notices, or attachment documents that must match GB/T-style formatting conventions.
---

# official-doc-formatter 技能文档

## 概述
本技能用于格式化Word文档，严格遵循GB/T 9704-2012国家标准及用户自定义规范。

## 支持的文档类型

### 1. 请示
- **大标题**：方正小标宋简体二号，顶格居中
- **称谓**：仿宋_GB2312三号，顶格（如"公司领导："）
- **一级标题**：黑体三号，缩进1.27cm
- **二级标题**：楷体_GB2312三号，缩进1.27cm
- **三级标题**：仿宋_GB2312三号，缩进1.27cm
- **四级标题**：仿宋_GB2312三号，缩进1.27cm
- **五级标题**：仿宋_GB2312三号，缩进1.27cm
- **正文**：仿宋_GB2312三号，缩进1.27cm
- **结束语**：仿宋_GB2312三号，缩进0.74cm（如"妥否，请批示。"）
- **附件列表**：仿宋_GB2312三号，缩进0.74cm，1.2.3.完全对齐
- **落款/日期**：仿宋_GB2312三号，右对齐

### 2. 方案
- **大标题**：方正小标宋简体二号，顶格居中
- **无称谓**
- **一级标题**：黑体三号，缩进1.27cm
- **二级标题**：楷体_GB2312三号，缩进1.27cm
- **三级标题**：仿宋_GB2312三号，缩进1.27cm
- **四级标题**：仿宋_GB2312三号，缩进1.27cm
- **正文**：仿宋_GB2312三号，缩进1.27cm
- **无落款和日期**

### 3. 附件
- **附件标识**：黑体三号，顶格（如"附件1"）
- **大标题**：方正小标宋简体二号，顶格（与附件标识空一行）
- **一级标题**：黑体三号，缩进1.27cm
- **二级标题**：楷体_GB2312三号，缩进1.27cm
- **三级标题**：仿宋_GB2312三号，缩进1.27cm
- **正文**：仿宋_GB2312三号，缩进1.27cm
- **无落款和日期**

## 通用格式规范

### 页面设置
- 页边距：上3.7cm / 下3.5cm / 左2.8cm / 右2.6cm

### 字体规范
- **中文**：根据元素类型使用对应字体
- **英文/数字**：统一使用Times New Roman三号（16pt）
- **所有文字颜色**：默认黑色

### 缩进规范
- 缩进1.27cm ≈ 2字符
- 缩进0.74cm ≈ 1字符

### 标题层级说明
| 层级 | 格式示例 | 字体 | 缩进 |
|------|----------|------|------|
| 大标题 | 关于XXX的请示 | 方正小标宋简体二号 | 0cm（顶格居中） |
| 一级标题 | 一、运营现状分析 | 黑体三号 | 1.27cm |
| 二级标题 | （一）核心数据表现 | 楷体_GB2312三号 | 1.27cm |
| 三级标题 | 1.用户规模 | 仿宋_GB2312三号 | 1.27cm |
| 四级标题 | （1）新用户 | 仿宋_GB2312三号 | 1.27cm |
| 五级标题 | ① 功能说明 | 仿宋_GB2312三号 | 1.27cm |

### 行间距
- 全文行间距：固定值28磅
- **XML值**：`w:line="560"`（单位为twips，28磅 × 20 = 560）

### 标点符号
- 正文结尾自动添加句号（除日期外）
- 日期格式不加句号（如"2026年3月13日"）
- **所有引号必须使用中文弯引号**：`""`（U+201C/U+201D），而非英文直引号 `""`（U+0022）

## 空行规范（重要）

### 请示类文档空行位置
| 位置 | 空行数量 | 说明 |
|------|---------|------|
| 大标题后 | 1个 | 标题和称谓之间 |
| 结束语后 | 1个 | "妥否，请批示。"和"附件："之间 |
| 其他位置 | 0个 | 段落之间紧密相连，无额外空行 |

### 附件格式
- "附件："和"1. xxx"在同一行（不换行）
- 附件2另起一行，缩进对齐

## 使用方法

### 命令格式
```bash
python3 format_docx_v7.py <输入文件> <输出文件> <文档类型>
```

### 文档类型参数
- `请示` - 请示类公文
- `方案` - 方案类文档
- `附件` - 附件类文档
- `general` - 通用格式

### 示例
```bash
# 格式化请示文档
python3 format_docx_v7.py input.docx output.docx 请示

# 格式化方案文档
python3 format_docx_v7.py input.docx output.docx 方案

# 格式化附件文档
python3 format_docx_v7.py input.docx output.docx 附件
```

## 技术实现

### 中英文混排处理
脚本实现了智能中英文分离：
- 中文部分：使用指定的中文字体（如仿宋_GB2312）
- 英文/数字部分：自动切换为Times New Roman

### 标题检测优先级
1. 附件标识（附件1）
2. 三级标题（1.XXX）
3. 大标题
4. 称谓
5. 一级标题（一、）
6. 二级标题（（一））
7. 四级标题（（1））
8. 五级标题（①）
9. 附件说明
10. 附件列表项
11. 结束语
12. 落款/日期
13. 正文

### python-docx 常见陷阱（重要）

#### 1. 行间距设置错误
**错误代码**：
```python
para.paragraph_format.line_spacing = 28  # 错误！这会被解释为240twips的倍数
```

**正确代码**：
```python
from docx.enum.text import WD_LINE_SPACING
para.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
para.paragraph_format.line_spacing = Pt(28)  # 正确：明确指定单位
```

**原因**：python-docx的 `line_spacing` 属性接受的是twips单位（1/20磅），直接传28会被解释为28twips而非28磅。必须使用 `Pt(28)` 明确指定单位。

#### 2. 空行处理
**错误做法**：直接添加空paragraph
```python
doc.add_paragraph()  # 可能继承错误的样式
```

**正确做法**：显式设置空行样式
```python
def add_empty_paragraph(doc):
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    p.paragraph_format.line_spacing = Pt(28)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    return p
```

#### 3. 引号字符错误
**错误**：使用英文直引号
```python
text = '以下简称"数据宝公司"'  # U+0022 直引号
```

**正确**：使用中文弯引号
```python
LQUOTE = '\u201c'  # "
RQUOTE = '\u201d'  # "
text = f'以下简称{LQUOTE}数据宝公司{RQUOTE}'  # U+201C/U+201D 弯引号
```

### 注意事项
- 大标题检测排除包含逗号、句号的正文
- 三级标题检测优先于附件列表检测
- 附件列表项仅匹配短文本（长度<30字符）
- 日期后不加句号
- **始终验证生成的XML**：使用 `unzip -p file.docx word/document.xml | grep -o 'w:line="[^"]*"'` 检查行间距值是否正确（应为560）

## 更新历史

### 2026-03-17 v5
- 优化空行处理：称谓、各级标题、正文之间不留空行，保持紧凑排版
- 2026-03-17 v4
- 新增强制中文弯引号：所有英文双引号/单引号自动转换为中文弯引号
  - 英文 `"` → 中文 `“”`
  - 英文 `'` → 中文 `‘’`
- 2026-03-17 v3
- 新增完整格式规范覆盖：纪要、信函、发文、抄送、页码、印发机关等各类公文元素
- 完整遵循GB/T 9704-2012国家标准所有细节
- 强化要求：所有数字必须使用Times New Roman字体
- 页边距：上37mm/下35mm/左28mm/右26mm
- 行间距：全文固定值28磅，版记单倍行距
- 补充版头、附件说明、发文机关署名、成文日期、印章、抄送机关、印发机关、页码、信函、纪要等格式规范

### 2026-03-13 v2
- 新增"空行规范"章节，明确请示文档的空行位置
- 新增"python-docx常见陷阱"章节，记录行间距、空行、引号等常见错误
- 更新标点符号规范，强调使用中文弯引号
- 添加XML验证方法，便于调试

### 2026-03-13 v1
- 基于用户提供的正确格式样例，全面更新格式规范
- 修正了标题层级、缩进、字体等所有细节
- 实现了中英文混排的智能字体处理

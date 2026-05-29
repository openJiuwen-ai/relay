# 文档生成错误复盘 - 2026-03-13

## 问题总览

本次文档生成经历了3轮修正才达到规范要求。以下是详细的错误分析和解决方案。

---

## 错误1：行间距异常（严重）

### 现象
- 一句话占一整页
- 文档内容极度稀疏

### 根因
python-docx库的行间距参数容易设置错误：
```python
# 错误代码
para.paragraph_format.line_spacing = 28  # 被解释为28 twips，实际是336磅

# 错误结果
# XML中显示为 w:line="6720"（12倍行距！）
```

### 正确做法
```python
from docx.enum.text import WD_LINE_SPACING
from docx.shared import Pt

para.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
para.paragraph_format.line_spacing = Pt(28)  # 必须明确指定单位

# 正确结果
# XML中显示为 w:line="560"（28磅，符合规范）
```

### 验证方法
```bash
unzip -p file.docx word/document.xml | grep -o 'w:line="[^"]*"'
# 正确值应为 560（28磅）
```

---

## 错误2：空行缺失/多余

### 现象
- 用户反馈"文件那么多空行"
- 段落之间过于密集或过于稀疏

### 根因
不了解请示文档的空行规范。

### 正确规范（请示类）

| 位置 | 空行数量 | 说明 |
|------|---------|------|
| 大标题后 | 1个 | 标题与称谓之间 |
| 结束语后 | 1个 | "妥否，请批示。"与"附件："之间 |
| 其他位置 | 0个 | 段落之间紧密相连 |

### 正确代码
```python
def add_empty_paragraph(doc):
    """添加规范的空行"""
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    p.paragraph_format.line_spacing = Pt(28)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    return p
```

### 特别说明
- "附件："和"1. xxx"在同一行（不换行）
- 附件2另起一行
- 段落之间不要多余空行

---

## 错误3：引号类型错误

### 现象
- 用户提示"所有引号要用中文的双引号"

### 根因
代码中使用了英文直引号（U+0022）而非中文弯引号（U+201C/U+201D）。

### 对比

| 类型 | 字符 | Unicode | 视觉效果 |
|------|------|---------|---------|
| 英文直引号 | " | U+0022 | 垂直的 |
| 中文左引号 | " | U+201C | 向左弯曲 |
| 中文右引号 | " | U+201D | 向右弯曲 |

### 正确做法
```python
# 定义中文引号常量
LQUOTE = '\u201c'  # 左引号 "
RQUOTE = '\u201d'  # 右引号 "

# 在字符串中使用
text = f'以下简称{LQUOTE}数据宝公司{RQUOTE}'
# 结果：以下简称"数据宝公司"
```

---

## 经验总结

### 1. 参考文件分析
拿到用户提供的正确样例后，应：
- 解压docx文件
- 分析XML结构（`word/document.xml`）
- 提取关键参数（行间距、缩进、字体等）

### 2. 代码生成验证
每次生成后应验证：
```bash
# 1. 检查行间距
unzip -p file.docx word/document.xml | grep -o 'w:line="[^"]*"'

# 2. 检查引号类型
unzip -p file.docx word/document.xml | grep '以下简称' | python3 -c "
import sys
s = sys.stdin.read()
for i,c in enumerate(s):
    if c in ['\\\"', '\\\"']:
        print(f'{c} at {i}: U+{ord(c):04X}')"
```

### 3. 规范文档维护
所有格式规范应及时更新到SKILL.md：
- 空行规范
- 常见陷阱
- 验证方法

---

## 后续行动

✅ 已完成：
1. 修正所有文档格式问题
2. 更新official-doc-formatter/SKILL.md文档
3. 总结本次复盘记录

📋 建议：
- 今后生成文档前，先查阅SKILL.md中的"常见陷阱"章节
- 生成后使用XML验证方法自检
- 积累更多正确样例，建立格式数据库

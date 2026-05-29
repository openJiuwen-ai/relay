---
name: email-manager
description: 邮件管理工具，支持发送、查收、回复、标记邮件，兼容 QQ 邮箱、Gmail、163 邮箱、Outlook 等主流邮箱服务。
---

# 邮件管理

统一邮件管理工具，通过 IMAP / SMTP 协议收发邮件。

## 安全要求

- 凭据只允许保存在 Windows Credential Manager
- 配置文件中只允许保存 `imap_pass_ref` / `smtp_pass_ref`
- 不支持明文 `imap_pass` / `smtp_pass`
- 不支持环境变量 `IMAP_PASS` / `SMTP_PASS`

## 快速开始

### 1. 写入密钥

```powershell
python scripts/wincred_store.py set --kind imap --user "your-email@qq.com" --secret "your-imap-secret"
python scripts/wincred_store.py set --kind smtp --user "your-email@qq.com" --secret "your-smtp-secret"
```

### 2. 配置邮箱

参考 [references/setup.md](references/setup.md) 创建 `config.json`，在配置中填写 `imap_pass_ref` 和 `smtp_pass_ref`。

### 3. 常用操作

发送邮件：

```powershell
python scripts/smtp_sender.py send --to "receiver@example.com" --subject "主题" --body "正文"
```

查看邮件：

```powershell
python scripts/imap_reader.py list --limit 10
```

标记邮件：

```powershell
python scripts/imap_reader.py mark --id 123 --action read
```

联调检查：

```powershell
python scripts/healthcheck.py all
```

## 文档

- [references/setup.md](references/setup.md)
- [references/send.md](references/send.md)
- [references/receive.md](references/receive.md)
- [references/accounts.md](references/accounts.md)
- [references/user-guide.md](references/user-guide.md)

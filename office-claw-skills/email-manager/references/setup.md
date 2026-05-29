# 邮箱配置指南

`email-manager` 现在只支持通过 Windows Credential Manager 保存邮箱密钥。

不再支持以下方式：

- `config.json` 中的明文 `imap_pass` / `smtp_pass`
- 环境变量 `IMAP_PASS` / `SMTP_PASS`

## 1. 获取授权码

常见邮箱都需要先开启 IMAP/SMTP，并生成授权码或应用专用密码。

- QQ 邮箱: `imap.qq.com:993` / `smtp.qq.com:587`
- Gmail: `imap.gmail.com:993` / `smtp.gmail.com:587`
- 163 邮箱: `imap.163.com:993` / `smtp.163.com:465`
- Outlook: `outlook.office365.com:993` / `smtp.office365.com:587`

## 2. 把密钥写入 Windows 凭据管理器

在 `email-manager` 目录下执行：

```powershell
python scripts/wincred_store.py set --kind imap --user "your-email@qq.com" --secret "your-imap-secret"
python scripts/wincred_store.py set --kind smtp --user "your-email@qq.com" --secret "your-smtp-secret"
```

命令会返回引用，例如：

```text
wincred://OfficeClaw/email-manager/imap/your-email%40qq.com
wincred://OfficeClaw/email-manager/smtp/your-email%40qq.com
```

## 3. 创建 `config.json`

```json
{
  "imap_host": "imap.qq.com",
  "imap_port": 993,
  "imap_user": "your-email@qq.com",
  "imap_pass_ref": "wincred://OfficeClaw/email-manager/imap/your-email%40qq.com",
  "smtp_host": "smtp.qq.com",
  "smtp_port": 587,
  "smtp_user": "your-email@qq.com",
  "smtp_pass_ref": "wincred://OfficeClaw/email-manager/smtp/your-email%40qq.com",
  "smtp_from": "your-email@qq.com"
}
```

## 4. 可选环境变量

只允许使用非敏感字段和 secret ref：

```powershell
$env:IMAP_HOST="imap.qq.com"
$env:IMAP_PORT="993"
$env:IMAP_USER="your-email@qq.com"
$env:IMAP_PASS_REF="wincred://OfficeClaw/email-manager/imap/your-email%40qq.com"

$env:SMTP_HOST="smtp.qq.com"
$env:SMTP_PORT="587"
$env:SMTP_USER="your-email@qq.com"
$env:SMTP_PASS_REF="wincred://OfficeClaw/email-manager/smtp/your-email%40qq.com"
$env:SMTP_FROM="your-email@qq.com"
```

## 5. 测试连接

```powershell
python scripts/smtp_sender.py test
python scripts/imap_reader.py list --limit 1
python scripts/healthcheck.py all
```

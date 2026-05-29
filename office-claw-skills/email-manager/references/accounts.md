# 多账号配置

推荐做法是每个邮箱账号使用单独的 `config.<name>.json` 文件，并且每个账号的密钥都放在 Windows Credential Manager 中。

## 示例

目录结构：

```text
email-manager/
|- config.qq.json
|- config.gmail.json
`- scripts/
```

`config.qq.json`:

```json
{
  "imap_host": "imap.qq.com",
  "imap_port": 993,
  "imap_user": "user@qq.com",
  "imap_pass_ref": "wincred://OfficeClaw/email-manager/imap/user%40qq.com",
  "smtp_host": "smtp.qq.com",
  "smtp_port": 587,
  "smtp_user": "user@qq.com",
  "smtp_pass_ref": "wincred://OfficeClaw/email-manager/smtp/user%40qq.com",
  "smtp_from": "user@qq.com"
}
```

`config.gmail.json`:

```json
{
  "imap_host": "imap.gmail.com",
  "imap_port": 993,
  "imap_user": "user@gmail.com",
  "imap_pass_ref": "wincred://OfficeClaw/email-manager/imap/user%40gmail.com",
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_user": "user@gmail.com",
  "smtp_pass_ref": "wincred://OfficeClaw/email-manager/smtp/user%40gmail.com",
  "smtp_from": "user@gmail.com"
}
```

## 使用指定配置

```powershell
python scripts/smtp_sender.py send --config config.qq.json --to "target@example.com" --subject "Test" --body "Hello"
python scripts/imap_reader.py list --config config.gmail.json --limit 10
```

## 注意

- 不要在任意配置文件中写入明文密码
- 不要设置 `IMAP_PASS` 或 `SMTP_PASS`
- 每个账号都应该有独立的 `imap_pass_ref` 和 `smtp_pass_ref`

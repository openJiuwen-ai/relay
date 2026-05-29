# 发送邮件

发送前先确认 `config.json` 中已经配置 `smtp_pass_ref`，并且对应密钥已经通过 `scripts/wincred_store.py set` 写入 Windows Credential Manager。

## 基本发送

```powershell
python scripts/smtp_sender.py send --to "receiver@example.com" --subject "主题" --body "正文"
```

## 发送 HTML 邮件

```powershell
python scripts/smtp_sender.py send --to "receiver@example.com" --subject "HTML" --body "<h1>标题</h1><p>正文</p>" --html
```

## 发送带附件的邮件

```powershell
python scripts/smtp_sender.py send --to "receiver@example.com" --subject "附件邮件" --body "请查收附件" --attach "D:\\docs\\file.pdf"
```

## 抄送和密送

```powershell
python scripts/smtp_sender.py send --to "to@example.com" --cc "cc@example.com" --bcc "bcc@example.com" --subject "主题" --body "正文"
```

## 测试 SMTP 连接

```powershell
python scripts/smtp_sender.py test
```

## 约束

- 明文 `smtp_pass` 已禁用
- 环境变量 `SMTP_PASS` 已禁用
- 附件会做基础路径安全校验，系统敏感目录下的文件不会被附加

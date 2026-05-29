# Email Manager 用户操作指引

这份指引面向最终用户，按顺序操作即可完成邮箱接入、联调和日常使用。

## 1. 准备信息

在开始前，请先确认以下信息：

- 邮箱地址
- 邮箱服务商的 IMAP 服务器和端口
- 邮箱服务商的 SMTP 服务器和端口
- 邮箱授权码或应用专用密码

常见服务商参数：

| 邮箱 | IMAP | SMTP |
|------|------|------|
| QQ 邮箱 | `imap.qq.com:993` | `smtp.qq.com:587` |
| Gmail | `imap.gmail.com:993` | `smtp.gmail.com:587` |
| 163 邮箱 | `imap.163.com:993` | `smtp.163.com:465` |
| Outlook | `outlook.office365.com:993` | `smtp.office365.com:587` |

## 2. 写入密钥到 Windows 凭据管理器

进入 `office-claw-skills/email-manager` 目录后执行：

```powershell
python scripts/wincred_store.py set --kind imap --user "your-email@example.com" --secret "your-imap-secret"
python scripts/wincred_store.py set --kind smtp --user "your-email@example.com" --secret "your-smtp-secret"
```

执行成功后会返回两个引用：

- `imap_pass_ref`
- `smtp_pass_ref`

## 3. 创建配置文件

在当前目录创建 `config.json`：

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

注意：

- 不要填写 `imap_pass`
- 不要填写 `smtp_pass`
- 配置文件里只能放 `*_pass_ref`

## 4. 执行联调

先跑完整联调：

```powershell
python scripts/healthcheck.py all
```

预期结果：

- `smtp_config` 成功
- `imap_config` 成功
- `smtp_login` 成功
- `imap_login` 成功

如果只想单独检查某一项：

```powershell
python scripts/healthcheck.py config
python scripts/healthcheck.py smtp
python scripts/healthcheck.py imap
```

## 5. 功能验证

发送测试邮件：

```powershell
python scripts/smtp_sender.py send --to "receiver@example.com" --subject "联调测试" --body "这是一封测试邮件"
```

读取最新邮件：

```powershell
python scripts/imap_reader.py list --limit 5
```

读取单封邮件：

```powershell
python scripts/imap_reader.py read --id 123
```

## 6. 常见问题排查

### 1. `smtp_config` 或 `imap_config` 失败

通常是以下原因：

- `config.json` 缺字段
- `*_pass_ref` 没填
- 还残留了明文 `imap_pass` / `smtp_pass`

### 2. `smtp_login` 失败

通常是以下原因：

- SMTP 主机或端口错误
- 授权码错误
- 邮箱没有开启 SMTP
- 服务商要求特定加密策略

### 3. `imap_login` 失败

通常是以下原因：

- IMAP 主机或端口错误
- 授权码错误
- 邮箱没有开启 IMAP
- 文件夹名不正确

### 4. Secret ref 找不到

重新写入一次凭据：

```powershell
python scripts/wincred_store.py set --kind imap --user "your-email@example.com" --secret "your-imap-secret"
python scripts/wincred_store.py set --kind smtp --user "your-email@example.com" --secret "your-smtp-secret"
```

## 7. 交付建议

正式交付给用户前，至少完成下面四项：

1. `python scripts/healthcheck.py all` 成功
2. 成功发送一封测试邮件
3. 成功读取一封真实邮件
4. 确认配置文件中没有任何明文密码

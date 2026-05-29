# 收取邮件

读取前先确认 `config.json` 中已经配置 `imap_pass_ref`，并且对应密钥已经通过 `scripts/wincred_store.py set` 写入 Windows Credential Manager。

## 查看邮件列表

```powershell
python scripts/imap_reader.py list --limit 10
python scripts/imap_reader.py list --unread
```

## 读取单封邮件

```powershell
python scripts/imap_reader.py read --id 123
```

## 搜索邮件

```powershell
python scripts/imap_reader.py search --query "发票"
python scripts/imap_reader.py search --query "会议" --limit 50
```

## 标记邮件

```powershell
python scripts/imap_reader.py mark --id 123 --action read
python scripts/imap_reader.py mark --id 123 --action unread
python scripts/imap_reader.py mark --id 123 --action star
python scripts/imap_reader.py mark --id 123 --action unstar
```

## 约束

- 明文 `imap_pass` 已禁用
- 环境变量 `IMAP_PASS` 已禁用
- 邮件正文返回长度默认限制为 5000 字符

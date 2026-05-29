# @openjiuwen/relay-web

OfficeClaw 前端

## 本地启动

项目启动需要依赖：`Node.js`、`pnpm`、`Python`、`Redis`。

推荐依赖版本：
- `Node.js`: `>= 22.16.0`
- `pnpm`: `>= 9.15.4`
- `Python`: `>= 3.13.1`
- `Redis`: `>= 5.0.14.1`

方式1：一键启动

```bash
pnpm i

# alias pnpm dev:a
pnpm dev:all
```

方式2：前后端分开启动

```bash
# alias pnpm dev:b
pnpm dev:backend
# alias pnpm dev:f
pnpm dev:frontend
```

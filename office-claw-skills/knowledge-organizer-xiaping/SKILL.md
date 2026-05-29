---
name: knowledge-organizer
license: MIT
description: An OpenClaw- and Codex-compatible knowledge organization skill for importing articles, organizing notes, syncing to Feishu and Tencent IMA, applying tags, archiving content, generating summaries, and suggesting related notes.
env:
  - OPENCLAW_KB_ROOT
  - FEISHU_APP_ID
  - FEISHU_APP_SECRET
  - FEISHU_ACCESS_TOKEN
  - FEISHU_KB_ID
  - FEISHU_FOLDER_ID
  - FEISHU_WIKI_NODE
  - IMA_OPENAPI_CLIENTID
  - IMA_OPENAPI_APIKEY
---

# Knowledge Organizer

This skill turns article links, drafts, and notes into structured Markdown with duplicate checks, tags, summaries, related-note suggestions, image downloads, and optional sync targets for Obsidian, Feishu, and Tencent IMA.

## Use Cases

- Store content in a knowledge base
- Organize articles
- Apply tags
- Archive notes
- Generate summaries
- Suggest related notes

## Capabilities

- Generate Obsidian-ready notes with YAML frontmatter, wikilinks, embeds, and block IDs
- If `draft.images` is present, download images into `assets/` and keep relative references in the note body; common fields like `src`, `data_src`, `data-original`, `data-lazy-src`, `srcset`, `url`, `image_url`, and `original` are supported
- Run duplicate detection before writing, covering URL, hash, alias, and similarity checks
- Treat duplicate hits as normal control flow; the CLI returns a structured decision result
- Recommend directly linkable related notes
- Validate tags against the knowledge-base tag contract
- Sync to Feishu through the official OpenClaw `openclaw-lark` plugin
- Sync to Tencent IMA through the direct import_doc OpenAPI flow
- Orchestrate `destination=obsidian|feishu|ima` with `mode=once|sync`

## Usage

- For Obsidian, set `destination=obsidian`, provide `vault_root`, and let the runtime write directly to local markdown files.
- For Feishu, set `destination=feishu` and make sure the OpenClaw `openclaw-lark` plugin is available for `feishu-create-doc` and `feishu-update-doc`.
- For Tencent IMA, set `destination=ima` and configure `IMA_OPENAPI_CLIENTID` and `IMA_OPENAPI_APIKEY` before syncing.
- Use `mode=once` for a single import run, or `mode=sync` to skip items whose content hash has not changed.
- The shared sync orchestrator lives in `scripts/knowledge_sync.py`, and can be used with `--markdown-path`, `--folder-path`, or `--link`.

## Usage Examples

- Obsidian: `python3 -m scripts.knowledge_sync --destination obsidian --mode once --state .sync-state.json --vault-root /path/to/vault --markdown-path draft.md`
- Feishu: `python3 -m scripts.knowledge_sync --destination feishu --mode once --state .sync-state.json --markdown-path draft.md`
- Tencent IMA: `python3 -m scripts.knowledge_sync --destination ima --mode sync --state .sync-state.json --folder-path drafts/`
- Disable one or more destinations: add `--disable obsidian,feishu` to skip the selected targets when invoking the sync orchestrator.

## Workflow

1. Get content: use a browser for public-account links, prefer `xiaohongshu-mcp` for Xiaohongshu links, use `web_fetch` for other web pages, and process user-provided content directly
2. Normalize the source: use `scripts/import_sources.py`, `scripts/import_normalizer.py`, and `scripts/import_models.py` to build a shared `ImportDraft`
3. Check duplicates before final write: prefer URL + title + similarity checks, and treat duplicate hits as normal control flow
4. Choose a destination: `scripts/knowledge_sync.py` dispatches to `obsidian`, `feishu`, or `ima`
5. Render or import: `scripts/obsidian_note.py` generates the content and destination path, while `scripts/feishu_kb.py` and `scripts/ima_kb.py` build the sync payloads
6. Write or sync: runtime writes directly to `destination_path` for Obsidian, or stores `SyncStateRecord` for Feishu/IMA

For WeChat public-account imports, read `references/wechat-import.md` before doing browser extraction, image handling, or final write.

## Execution Rules

- After reading this skill, follow its workflow before improvising your own path
- Do not skip duplicate checks on import tasks
- If a browser/evaluate call fails twice because of parameter misuse, stop blind retries and re-read the workflow / reference
- Prefer reusing bundled scripts over hand-writing a parallel pipeline when the scripts already cover the task
- For article imports, separate the pipeline into: fetch/normalize → duplicate-check → render → write, instead of mixing all steps together
- Before running script-based import flows, prefer checking `scripts/check_runtime.py` to confirm Python and knowledge-base paths are available
- For Feishu import, prefer the official OpenClaw `openclaw-lark` plugin (`feishu-create-doc` / `feishu-update-doc`) and use Lark Markdown with `<image url="..."/>` / `<file url="..." name="..."/>`
- For IMA import, use the direct OpenAPI `import_doc` flow with `IMA_OPENAPI_CLIENTID` and `IMA_OPENAPI_APIKEY`

## Contract

- Input: structured draft, title aliases, source metadata, summary, bullets, excerpts, images, related notes, and vault root
- Output: `RenderedNote(content, destination_path)` for Obsidian, or a `SyncStateRecord`-backed import result for Feishu/IMA
- Frontmatter must include `title`, `aliases`, `tags`, `source_type`, `source_url`, `published`, `created`, `updated`, `importance`, `status`, and `canonical_hash`
- Before writing tags, require at least 1 domain tag and 1 type tag, with a total of 5-10 tags
- Vault root must be a non-empty absolute path
- Vault root should come from `OPENCLAW_KB_ROOT` when available
- This contract covers frontmatter / wikilink / embed / block id rules
- Feishu payloads use `title` + `markdown` + placement fields (`folder_token` / `wiki_node` / `wiki_space`)
- IMA payloads use `content_format=1`, `content`, and optional `folder_id`

## WeChat Notes

- WeChat article links (`mp.weixin.qq.com`) are a special case: default to `browser`, not `web_fetch`
- Prefer the container order documented in `references/wechat-import.md` when extracting正文
- For image extraction, prefer `data-src`, then `src`, then `data-original` / `data_src` / `original`
- Preserve or add `from=appmsg` on WeChat image URLs when needed
- Normalize image fields before conversion when possible (treat resolved `data-src` as the final `src`)
- Strip common tail noise (scan prompts, 授权提示, 阅读原文引导) before final render
- `browser act` with evaluation must include `fn`; missing `fn` is a caller error, not a reason to improvise blindly

## Xiaohongshu Notes

- Xiaohongshu links are a special case: default to `xiaohongshu-mcp`, not generic `web_fetch`
- Prefer checking MCP status first when the workflow depends on local login/session
- Prefer `detail` for complete note content; use `search` → `detail` only when direct note identifiers are missing
- Treat Xiaohongshu as a structured content source, not just a webpage snapshot
- Preserve source metadata such as author, publish time, tags, images, and engagement when available

## `draft.images` Example

```yaml
images:
  - path: /absolute/path/to/local.png
    alt: Local image
  - src: https://example.com/cover.png
    alt: Remote image
  - srcset: https://example.com/cover-1x.png 1x, https://example.com/cover-2x.png 2x
    alt: Responsive image
```

`path` is for local files. `src` / `data_src` / `data-original` / `data-lazy-src` / `original` etc. are used for remote images; `srcset` prefers the highest-value candidate.

## Compatibility

- OpenClaw 兼容
- Codex 兼容
- Obsidian vault 工作流

## Project Links

- GitHub repository: <https://github.com/cjke84/knowledge-organizer>

## Output Template

```text
✅ Stored in knowledge base

📁 Location: knowledge-base/xxx.md
🏷️ Tags: tag1, tag2, tag3
📋 Summary: one-sentence summary
⭐ Importance: core
🔗 Related notes: xxx, yyy
```

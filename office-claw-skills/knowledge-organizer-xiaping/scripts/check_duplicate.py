#!/usr/bin/env python3
"""
知识库去重检测脚本
检查新文章是否与知识库已有文章重复
"""

import hashlib
import json
import re
import sys
from typing import Any

try:
    from .settings import DEFAULT_KB_PATH, resolve_vault_root
    from .markdown_helpers import (
        load_frontmatter,
        scan_knowledge_base,
        similarity,
        strip_frontmatter,
    )
except ImportError:  # Allow running the script directly.
    from settings import DEFAULT_KB_PATH, resolve_vault_root
    from markdown_helpers import (
        load_frontmatter,
        scan_knowledge_base,
        similarity,
        strip_frontmatter,
    )
SNIPPET_CAP = 1000
TITLE_WEIGHT = 0.3
CONTENT_WEIGHT = 0.7
TITLE_ALIAS_WEIGHT = 0.85
BODY_SIMILARITY_THRESHOLD = 0.7
OVERWRITE_SIMILARITY_THRESHOLD = 0.9

def _normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalize_url(value: Any) -> str:
    # Keep "exact match" semantics (after whitespace normalization only).
    return _normalize_text(value)


def _normalize_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_normalize_text(item) for item in value if _normalize_text(item)]
    text = _normalize_text(value)
    return [text] if text else []


def _sanitized_body(content: str) -> str:
    body = strip_frontmatter(content)
    lines = body.splitlines()
    cleaned: list[str] = []
    skipped_title = False

    for line in lines:
        if not skipped_title and line.lstrip().startswith("# "):
            skipped_title = True
            continue
        cleaned.append(line)

    return _normalize_text("\n".join(cleaned))


def _body_hash(content: str) -> str:
    return hashlib.sha256(_sanitized_body(content).encode("utf-8")).hexdigest()


def _structure_signature(content: str) -> str:
    body = strip_frontmatter(content)
    lines = body.splitlines()
    headings = sum(1 for line in lines if line.lstrip().startswith("#"))
    bullets = sum(1 for line in lines if line.lstrip().startswith(("-", "*")))
    quotes = sum(1 for line in lines if line.lstrip().startswith(">"))
    code_fences = sum(1 for line in lines if line.lstrip().startswith("```"))
    wikilinks = body.count("[[")
    return f"h{headings}|b{bullets}|q{quotes}|c{code_fences}|w{wikilinks}"


def _frontmatter_terms(frontmatter: dict[str, Any], title: str) -> list[str]:
    # "title + alias overlap" only.
    return [title, *_normalize_list(frontmatter.get("aliases"))]


def _alias_overlap(left_terms: list[str], right_terms: list[str]) -> float:
    left_set = {term.lower() for term in left_terms if term}
    right_set = {term.lower() for term in right_terms if term}
    if not left_set or not right_set:
        return 0.0
    intersection = len(left_set & right_set)
    union = len(left_set | right_set)
    return intersection / union if union else 0.0


def _match_priority(match_type: str) -> int:
    # Deterministic, Obsidian-friendly priority:
    # 1) canonical URL exact match
    # 2) canonical hash exact match
    # 3) title + alias overlap
    # 4) body similarity fallback
    return {
        "canonical_url": 0,
        "sanitized_content_hash": 1,
        "title_alias_overlap": 2,
        "body_structure": 3,
        "body_similarity": 4,
    }.get(match_type, 99)


def _match_action(match_type: str, score: float) -> str:
    if match_type in {"canonical_url", "sanitized_content_hash"}:
        return "skip"
    if match_type == "title_alias_overlap":
        return "merge"
    if match_type == "body_structure":
        return "overwrite" if score >= OVERWRITE_SIMILARITY_THRESHOLD else "merge"
    if match_type == "body_similarity" and score >= OVERWRITE_SIMILARITY_THRESHOLD:
        return "overwrite"
    return "create_new_version"


def _build_match(
    article: dict[str, Any],
    *,
    match_type: str,
    score: float,
    reason: str,
) -> dict[str, Any]:
    return {
        "path": article["path"],
        "relative_path": article["relative_path"],
        "title": article["title"],
        "match_type": match_type,
        "score": round(score, 2),
        "reason": reason,
    }


def detect_duplicate(
    new_title: str,
    new_content: str,
    kb_path: str | None = None,
    threshold: float = 0.7,
) -> dict[str, Any]:
    """
    检查新文章是否与已有文章重复

    Args:
        new_title: 新文章标题
        new_content: 新文章内容（可包含 frontmatter）
        kb_path: 知识库路径
        threshold: 相似度阈值

    Returns:
        结构化重复决策
    """
    resolved_kb_path = resolve_vault_root(kb_path)
    articles = scan_knowledge_base(resolved_kb_path)
    new_frontmatter = load_frontmatter(new_content)
    new_title = _normalize_text(new_title or new_frontmatter.get("title") or "Untitled")
    new_aliases = _normalize_list(new_frontmatter.get("aliases"))
    new_url = _normalize_url(new_frontmatter.get("source_url") or new_frontmatter.get("url"))
    new_hash = _body_hash(new_content)
    new_structure = _structure_signature(new_content)
    new_body = _sanitized_body(new_content)

    matches: list[dict[str, Any]] = []

    for article in articles:
        article_frontmatter = load_frontmatter(article["content"])
        article_title = _normalize_text(article["title"] or article_frontmatter.get("title") or "Untitled")
        article_terms = _frontmatter_terms(article_frontmatter, article_title)
        article_url = _normalize_url(article_frontmatter.get("source_url") or article_frontmatter.get("url"))
        article_hash = _body_hash(article["content"])
        article_structure = _structure_signature(article["content"])
        article_body = _sanitized_body(article["content"])

        if new_url and article_url and new_url == article_url:
            matches.append(
                _build_match(
                    article,
                    match_type="canonical_url",
                    score=1.0,
                    reason="canonical_url exact match",
                )
            )
            continue

        if new_hash and article_hash and new_hash == article_hash:
            matches.append(
                _build_match(
                    article,
                    match_type="sanitized_content_hash",
                    score=0.98,
                    reason="sanitized content hash exact match",
                )
            )
            continue

        alias_overlap = _alias_overlap([new_title, *new_aliases], article_terms)
        if alias_overlap > 0:
            matches.append(
                _build_match(
                    article,
                    match_type="title_alias_overlap",
                    score=TITLE_ALIAS_WEIGHT * alias_overlap,
                    reason="title+alias overlap",
                )
            )
            continue

        structure_similarity = similarity(new_structure, article_structure)
        if structure_similarity >= BODY_SIMILARITY_THRESHOLD:
            matches.append(
                _build_match(
                    article,
                    match_type="body_structure",
                    score=structure_similarity,
                    reason="body structure similarity",
                )
            )
            continue

        title_sim = similarity(new_title.lower(), article_title.lower())
        content_sim = similarity(new_body[:SNIPPET_CAP], article_body[:SNIPPET_CAP])
        combined_sim = TITLE_WEIGHT * title_sim + CONTENT_WEIGHT * content_sim

        if combined_sim >= threshold:
            matches.append(
                _build_match(
                    article,
                    match_type="body_similarity",
                    score=combined_sim,
                    reason="body similarity fallback",
                )
            )

    matches.sort(
        key=lambda item: (
            _match_priority(item["match_type"]),
            -item["score"],
            item.get("relative_path") or "",
            item["title"],
        )
    )
    top_match = matches[0] if matches else None

    if not top_match:
        return {
            "action": "create_new_version",
            "matches": [],
            "reason": "No strong duplicate match found",
        }

    action = _match_action(top_match["match_type"], top_match["score"])
    return {
        "action": action,
        "matches": matches,
        "reason": top_match["reason"],
    }


def check_duplicate(
    new_title: str,
    new_content: str,
    kb_path: str | None = None,
    threshold: float = 0.7,
) -> dict[str, Any]:
    return detect_duplicate(new_title, new_content, kb_path, threshold)


def decide_duplicate(
    new_title: str,
    new_content: str,
    kb_path: str | None = None,
    threshold: float = 0.7,
) -> dict[str, Any]:
    """Public helper alias to emphasize the structured decision API."""
    return detect_duplicate(new_title, new_content, kb_path, threshold)

def main():
    """命令行入口"""
    import argparse

    parser = argparse.ArgumentParser(description='知识库去重检测')
    parser.add_argument('title', help='新文章标题')
    parser.add_argument('--content', help='新文章内容（或从 stdin 读取）')
    parser.add_argument(
        '--kb',
        default=None,
        help=f'知识库路径（默认: {DEFAULT_KB_PATH}，受 OPENCLAW_KB_ROOT 环境变量控制）',
    )
    parser.add_argument('--threshold', type=float, default=0.7, help='相似度阈值')
    parser.add_argument('--json', action='store_true', help='JSON 输出')

    args = parser.parse_args()

    # 获取内容
    if args.content:
        content = args.content
    else:
        content = sys.stdin.read()

    # 检查重复
    decision = check_duplicate(args.title, content, args.kb, args.threshold)

    if args.json:
        print(json.dumps(decision, ensure_ascii=False, indent=2))
    else:
        matches = decision["matches"]
        if matches:
            print(f"⚠️ {decision['reason']}（action={decision['action']}）\n")
            for dup in matches:
                print(f"  • {dup['title']}")
                print(f"    路径: {dup['relative_path']}")
                print(f"    类型: {dup['match_type']}")
                print(f"    分数: {dup['score']*100:.0f}%\n")
        else:
            print("✅ 未发现重复文章")

    # Duplicate detection is a normal control-flow result, not a tool failure.
    return 0

if __name__ == '__main__':
    sys.exit(main())

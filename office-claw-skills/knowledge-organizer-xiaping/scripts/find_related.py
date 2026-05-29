#!/usr/bin/env python3
"""
知识库关联文章查找脚本
基于标签和内容相似度推荐相关文章
"""

import json
import sys
import re
from pathlib import Path
from typing import Any, Iterable

try:
    from .settings import DEFAULT_KB_PATH, resolve_vault_root
    from .markdown_helpers import load_frontmatter, scan_knowledge_base, similarity
except ImportError:  # Allow running the script directly.
    from settings import DEFAULT_KB_PATH, resolve_vault_root
    from markdown_helpers import load_frontmatter, scan_knowledge_base, similarity

RELATED_TAG_WEIGHT = 0.6
RELATED_KEYWORD_WEIGHT = 0.2
RELATED_TITLE_WEIGHT = 0.2
RELATED_TITLE_SIMILARITY_SKIP = 0.95
RELATED_SCORE_THRESHOLD = 0.1


def _normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalize_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_normalize_text(item) for item in value if _normalize_text(item)]
    text = _normalize_text(value)
    return [text] if text else []


def _title_alias_terms(frontmatter: dict[str, Any], article_title: str) -> list[str]:
    return [article_title, *_normalize_list(frontmatter.get("aliases"))]


def tag_overlap(tags1: Iterable[str], tags2: Iterable[str]) -> float:
    """计算标签重叠度"""
    tags1 = list(tags1)
    tags2 = list(tags2)
    if not tags1 or not tags2:
        return 0.0

    lower1 = set(t.lower() for t in tags1)
    lower2 = set(t.lower() for t in tags2)

    intersection = len(lower1 & lower2)
    union = len(lower1 | lower2)

    return intersection / union if union > 0 else 0.0


def _wikilink_title(title: str) -> str:
    return f"[[{title}]]"


def find_related(
    tags: list[str],
    title: str,
    kb_path: str | None = None,
    limit: int = 5,
    keywords: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
    """
    查找相关文章

    Args:
        tags: 新文章的标签列表
        title: 新文章标题
        kb_path: 知识库路径
        limit: 返回数量限制
        keywords: 可选关键词列表

    Returns:
        相关文章列表
    """
    resolved_kb_path = resolve_vault_root(kb_path)
    articles = scan_knowledge_base(resolved_kb_path)
    related = []

    keyword_values = [_normalize_text(k).lower() for k in keywords] if keywords else []
    query_title = _normalize_text(title)
    query_terms = [query_title] if query_title else []

    for article in articles:
        article_frontmatter = load_frontmatter(article["content"])
        article_title = _normalize_text(article.get("title")) or Path(
            article.get("relative_path") or article.get("path") or ""
        ).stem
        article_title_terms = _title_alias_terms(article_frontmatter, article_title)
        article_related_terms = _normalize_list(
            article_frontmatter.get("related") or article_frontmatter.get("related_notes")
        )
        tag_sim = tag_overlap(tags, article["tags"])
        title_sim = max(
            similarity(query_title.lower(), term.lower()) for term in article_title_terms if term
        ) if query_title and article_title_terms else 0.0

        if title_sim > RELATED_TITLE_SIMILARITY_SKIP:
            continue

        keyword_sim = tag_overlap(keyword_values, article["keywords"])
        alias_bonus = 0.0
        if query_terms:
            alias_bonus = tag_overlap(query_terms, article_title_terms)
        related_bonus = 0.0
        if query_terms:
            related_bonus = tag_overlap(query_terms, article_related_terms)
        score = (
            RELATED_TAG_WEIGHT * tag_sim
            + RELATED_KEYWORD_WEIGHT * keyword_sim
            + RELATED_TITLE_WEIGHT * max(title_sim, alias_bonus, related_bonus)
        )

        if score > RELATED_SCORE_THRESHOLD:
            related.append(
                {
                    "relative_path": article["relative_path"],
                    "title": article_title,
                    "wikilink": _wikilink_title(article_title),
                    "score": round(score, 2),
                }
            )

    related.sort(key=lambda x: x["score"], reverse=True)
    return related[:limit]


def main():
    """命令行入口"""
    import argparse

    parser = argparse.ArgumentParser(description="知识库关联文章查找")
    parser.add_argument("tags", nargs="*", help="标签列表")
    parser.add_argument("--keywords", nargs="*", help="关键词列表")
    parser.add_argument("--title", help="文章标题")
    parser.add_argument(
        "--kb",
        default=None,
        help=f"知识库路径（默认: {DEFAULT_KB_PATH}，受 OPENCLAW_KB_ROOT 环境变量控制）",
    )
    parser.add_argument("--limit", type=int, default=5, help="返回数量")
    parser.add_argument("--json", action="store_true", help="JSON 输出")

    args = parser.parse_args()
    related = find_related(
        args.tags, args.title or "", args.kb, args.limit, args.keywords
    )

    if args.json:
        print(json.dumps(related, ensure_ascii=False, indent=2))
    else:
        if related:
            print(f"🔗 找到 {len(related)} 篇相关文章：\n")
            for r in related:
                print(f"  • {r['title']}")
                print(f"    路径: {r.get('relative_path', '')}")
                print(f"    相关度: {r['score']*100:.0f}%\n")
        else:
            print("未找到相关文章")


if __name__ == "__main__":
    main()

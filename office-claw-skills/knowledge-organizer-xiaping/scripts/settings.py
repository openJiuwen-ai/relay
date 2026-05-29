import os

_DEFAULT_KB_LITERAL = "~/Documents/Obsidian/KKKK/知识库"
DEFAULT_KB_PATH = os.path.expanduser(_DEFAULT_KB_LITERAL)


def _expand_path(path: str | None) -> str | None:
    if not path:
        return None
    return os.path.expanduser(path)


def resolve_vault_root(config_root: str | None = None) -> str:
    """Resolve the knowledge base root with the proper priority."""
    env_root = _expand_path(os.environ.get("OPENCLAW_KB_ROOT"))
    if env_root:
        return env_root
    config_root = _expand_path(config_root)
    if config_root:
        return config_root
    return DEFAULT_KB_PATH

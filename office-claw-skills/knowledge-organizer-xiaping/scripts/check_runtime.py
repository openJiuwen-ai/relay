#!/usr/bin/env python3
import json
import os
import shutil
import sys
from pathlib import Path


def find_python():
    for cmd in ("python3", "python"):
        path = shutil.which(cmd)
        if not path:
            continue
        return cmd
    return None


def main():
    py = find_python()
    kb_root = os.environ.get("OPENCLAW_KB_ROOT", "").strip()
    result = {
        "python_cmd": py,
        "python_found": bool(py),
        "kb_root": kb_root,
        "kb_root_exists": bool(kb_root and Path(kb_root).expanduser().exists()),
        "assets_exists": bool(kb_root and (Path(kb_root).expanduser() / "assets").exists()),
    }
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()

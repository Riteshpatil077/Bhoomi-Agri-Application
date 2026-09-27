"""Fail CI when application code passes hand-written SQL strings to execution APIs."""
from __future__ import annotations

import ast
from pathlib import Path
import sys


APP_DIR = Path(__file__).resolve().parents[1] / "app"
EXECUTION_METHODS = {"execute", "exec_driver_sql"}


def main() -> int:
    violations: list[str] = []
    for path in APP_DIR.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr in EXECUTION_METHODS:
                violations.append(f"{path.relative_to(APP_DIR.parent)}:{node.lineno}: direct SQL execution API")
    if violations:
        print("Direct SQL execution APIs are forbidden in backend/app; use ORM query APIs:", file=sys.stderr)
        print("\n".join(violations), file=sys.stderr)
        return 1
    print("No direct SQL execution APIs found in backend/app.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

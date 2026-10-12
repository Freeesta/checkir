"""Prints the labels of .github/labels.yml as tab-separated `name<TAB>color<TAB>description` lines, for the `labels` workflow.

    python3 tools/sync_labels.py
"""
from __future__ import annotations

from pathlib import Path

import yaml

LABELS = Path(__file__).resolve().parent.parent / ".github" / "labels.yml"


def load() -> list[dict]:
    return yaml.safe_load(LABELS.read_text(encoding="utf-8"))


def main() -> None:
    for label in load():
        print(f"{label['name']}\t{label['color']}\t{label['description']}")


if __name__ == "__main__":
    main()

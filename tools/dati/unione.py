"""Merged views of the per-substance files: data/sources.json (shared) + data/substances/<id>/sources.json, and data/substances/<id>/aliases.json."""
import json
from pathlib import Path


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def substance_dirs(root: Path) -> list[Path]:
    return sorted(p for p in (root / "substances").glob("*") if p.is_dir())


def source_files(root: Path) -> list[Path]:
    """The shared file first, then the file of each substance that has one."""
    return [p for p in [root / "sources.json", *(d / "sources.json" for d in substance_dirs(root))] if p.is_file()]


def all_sources(root: Path) -> list[dict]:
    return [s for p in source_files(root) for s in load(p)["sources"]]


def alias_files(root: Path) -> list[Path]:
    return [p for p in (d / "aliases.json" for d in substance_dirs(root)) if p.is_file()]

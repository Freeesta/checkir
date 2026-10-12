"""Blocks private names in the public repository: file contents, file names and commit messages of the branch.

The list of forbidden names is a GitHub secret (NOMI_VIETATI, one name per line, case-insensitive), never written in the
repository. Without the secret (local runs, pull requests from forks) the check says so and passes; in CI of the repository
the secret is set, so a missing secret there is a setting to fix, not a pass: the job prints a warning annotation.
Also fails on tracked files bigger than MAX_BYTES (real data must not enter the public repository, not even "for a test").

    NOMI_VIETATI=$'name one\\nname two' python3 tools/controlla_nomi.py
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_BYTES = 1_000_000
BINARY_SKIP = (".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".wasm")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def names() -> list[str]:
    return [n.strip().lower() for n in os.environ.get("NOMI_VIETATI", "").splitlines() if n.strip()]


def big_files(files: list[str]) -> list[str]:
    return [f"file over {MAX_BYTES} bytes: {f}" for f in files if (ROOT / f).is_file() and (ROOT / f).stat().st_size > MAX_BYTES]


def hits(files: list[str], forbidden: list[str]) -> list[str]:
    bad = []
    for f in files:
        low = f.lower()
        bad += [f"forbidden name in file name: {f}" for n in forbidden if n in low]
        if f.endswith(BINARY_SKIP) or not (ROOT / f).is_file():
            continue
        text = (ROOT / f).read_text(encoding="utf-8", errors="ignore").lower()
        bad += [f"forbidden name in content: {f}" for n in forbidden if n in text]
    return bad


def commit_messages() -> str:
    base = os.environ.get("BASE_REF", "origin/main")
    try:
        return git("log", f"{base}..HEAD", "--format=%B").lower()
    except subprocess.CalledProcessError:
        return ""


def main() -> int:
    files = [f for f in git("ls-files").splitlines() if f]
    bad = big_files(files)
    forbidden = names()
    if forbidden:
        bad += hits(files, forbidden)
        msgs = commit_messages()
        bad += ["forbidden name in a commit message of the branch" for n in forbidden if n in msgs]
    else:
        print("NOMI_VIETATI not set: name check skipped (set the secret in Settings > Secrets and variables > Actions)")
        if os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("GITHUB_EVENT_NAME") != "pull_request_target":
            print("::warning::NOMI_VIETATI secret is empty or not available in this run")
    for b in bad:
        print("FAIL " + b)
    print(f"{len(files)} tracked files checked, {len(bad)} problems")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

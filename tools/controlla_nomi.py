"""Blocks private names in the public repository: file contents, file names and commit messages of the branch.

The list of forbidden patterns is a GitHub secret (NOMI_VIETATI, one per line), never written in the repository. Every line is a
case-insensitive regular expression (a plain name is a valid regex; escape dots and other metacharacters, e.g. `UBC-\\d{4}-\\d{5}`).
A line that is not a valid regex fails the check, so a typo cannot silently weaken it. Without the secret (local runs, pull requests from forks) the check says so and passes; in CI of the repository
the secret is set, so a missing secret there is a setting to fix, not a pass: the job prints a warning annotation.
Also fails on tracked files bigger than MAX_BYTES (real data must not enter the public repository, not even "for a test").

    NOMI_VIETATI=$'name one\\nname two' python3 tools/controlla_nomi.py
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_BYTES = 1_000_000
BINARY_SKIP = (".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".wasm")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def names() -> list[re.Pattern[str]]:
    return compile_patterns(os.environ.get("NOMI_VIETATI", ""))


def compile_patterns(text: str) -> list[re.Pattern[str]]:
    """One case-insensitive regex per non-empty line; an invalid line raises ValueError naming its line number."""
    out = []
    for n, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        try:
            out.append(re.compile(line.strip(), re.IGNORECASE))
        except re.error as e:
            raise ValueError(f"NOMI_VIETATI line {n} is not a valid regular expression: {e}") from e
    return out


def big_files(files: list[str]) -> list[str]:
    return [f"file over {MAX_BYTES} bytes: {f}" for f in files if (ROOT / f).is_file() and (ROOT / f).stat().st_size > MAX_BYTES]


def hits(files: list[str], forbidden: list[re.Pattern[str]]) -> list[str]:
    bad = []
    for f in files:
        bad += [f"forbidden pattern in file name: {f}" for n in forbidden if n.search(f)]
        if f.endswith(BINARY_SKIP) or not (ROOT / f).is_file():
            continue
        text = (ROOT / f).read_text(encoding="utf-8", errors="ignore")
        bad += [f"forbidden pattern in content: {f}" for n in forbidden if n.search(text)]
    return bad


def commit_messages() -> str:
    base = os.environ.get("BASE_REF", "origin/main")
    try:
        return git("log", f"{base}..HEAD", "--format=%B")
    except subprocess.CalledProcessError:
        return ""


def main() -> int:
    files = [f for f in git("ls-files").splitlines() if f]
    bad = big_files(files)
    try:
        forbidden = names()
    except ValueError as e:
        print(f"FAIL {e}")
        return 1
    if forbidden:
        bad += hits(files, forbidden)
        msgs = commit_messages()
        bad += ["forbidden pattern in a commit message of the branch" for n in forbidden if n.search(msgs)]
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

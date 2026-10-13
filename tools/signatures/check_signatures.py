"""Entry point of the `signatures` workflow: `python3 tools/signatures/check_signatures.py <owner/repo> <pull request number>`.

Reads the pull request through the GitHub API with GITHUB_TOKEN (read-only metadata and file contents) and exits 1 with one
`key param=value` line per finding. It never runs or interpolates anything that comes from the pull request.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import evaluate as ev
import sheets as sh

API = "https://api.github.com"
REPO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


class GitHubClient:
    """The few read calls the rules need; tests replace this class with a fake that has the same methods."""

    def __init__(self, repo: str, number: int, token: str):
        self.repo, self.number, self.token = repo, number, token
        self._pr: dict | None = None

    def request(self, url: str, accept: str = "application/vnd.github+json"):
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.token}", "Accept": accept,
                                                   "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "checkir-signatures"})
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read().decode("utf-8")

    def paginate(self, path: str) -> list[dict]:
        out: list[dict] = []
        for page in range(1, 31):
            batch = json.loads(self.request(f"{API}/repos/{self.repo}/pulls/{self.number}/{path}?per_page=100&page={page}"))
            out += batch
            if len(batch) < 100:
                break
        return out

    def pr(self) -> dict:
        if self._pr is None:
            self._pr = json.loads(self.request(f"{API}/repos/{self.repo}/pulls/{self.number}"))
        return self._pr

    def files(self) -> list[dict]:
        return self.paginate("files")

    def commits(self) -> list[dict]:
        return self.paginate("commits")

    def reviews(self) -> list[dict]:
        return self.paginate("reviews")

    def file_at(self, path: str, side: str) -> str | None:
        """Content of a file at the pull request 'base' or 'head' commit; None if it does not exist there."""
        sha = self.pr()[side]["sha"]
        url = f"{API}/repos/{self.repo}/contents/{urllib.parse.quote(path)}?ref={sha}"
        try:
            return self.request(url, "application/vnd.github.raw+json")
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return None
            raise


def format_finding(key: str, params: dict) -> str:
    safe = {k: (v if isinstance(v, str) and sh.SAFE_ID.match(v) else "?") for k, v in params.items()}
    return " ".join([key] + [f"{k}={v}" for k, v in sorted(safe.items())])


def main(argv: list[str]) -> int:
    if len(argv) != 3 or not REPO.match(argv[1]) or not argv[2].isdigit():
        print("usage: check_signatures.py <owner/repo> <number>", file=sys.stderr)
        return 2
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        print("signatures.no_token", file=sys.stderr)
        return 2
    findings = ev.evaluate(GitHubClient(argv[1], int(argv[2]), token), datetime.now(timezone.utc).date())
    for key, params in findings:
        print(format_finding(key, params))
    print(f"signatures: {'FAILED' if findings else 'ok'} ({len(findings)} findings)")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

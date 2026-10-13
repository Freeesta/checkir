"""Nightly step: `python3 tools/signatures/run_expiry.py <owner/repo>` opens, updates or closes the review-deadline issues.

Needs GITHUB_TOKEN with `issues: write`. Prints one line per action; `--dry-run` prints them without changing anything.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import expiry
import check_signatures as cs

ROOT = Path(__file__).resolve().parent.parent.parent


class IssuesClient:
    def __init__(self, repo: str, token: str):
        self.repo, self.token = repo, token

    def call(self, method: str, path: str, payload: dict | None = None):
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(f"{cs.API}/repos/{self.repo}/{path}", data=data, method=method, headers={
            "Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json", "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "checkir-expiry"})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode() or "null")

    def open_issues(self) -> list[dict]:
        """Open issues (not pull requests) that carry one of the state labels."""
        found: dict[int, dict] = {}
        for label in expiry.STATE_LABELS:
            for page in range(1, 11):
                batch = self.call("GET", f"issues?state=open&labels={label}&per_page=100&page={page}")
                for i in batch:
                    if "pull_request" not in i:
                        found[i["number"]] = {"number": i["number"], "title": i["title"], "body": i.get("body") or "",
                                              "labels": [l["name"] for l in i["labels"]]}
                if len(batch) < 100:
                    break
        return list(found.values())

    def apply(self, action: dict) -> None:
        op = action["op"]
        if op == "create":
            self.call("POST", "issues", {k: action[k] for k in ("title", "body", "labels")})
        elif op == "update":
            self.call("PATCH", f"issues/{action['number']}", {"body": action["body"], "labels": action["labels"]})
        else:
            self.call("POST", f"issues/{action['number']}/comments", {"body": "The sheet was renewed: closing."})
            self.call("PATCH", f"issues/{action['number']}", {"state": "closed", "state_reason": "completed"})


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if a != "--dry-run"]
    token = os.environ.get("GITHUB_TOKEN", "")
    if len(args) != 1 or not cs.REPO.match(args[0]) or not token:
        print("usage: GITHUB_TOKEN=... run_expiry.py <owner/repo> [--dry-run]", file=sys.stderr)
        return 2
    client = IssuesClient(args[0], token)
    today = datetime.now(timezone.utc).date()
    actions = expiry.plan(expiry.load_sheets(ROOT), client.open_issues(), today)
    for action in actions:
        print(action["op"], action.get("title") or action["number"])
        if "--dry-run" not in argv:
            client.apply(action)
    print(f"expiry: {len(actions)} actions")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

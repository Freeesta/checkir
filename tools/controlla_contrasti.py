"""Checks the WCAG 2.2 contrast of the colour roles in web/style.css against the page background, light and dark.

Roles are the CSS variables --color-* (values resolved through the --oi-* Okabe-Ito palette). Minimum ratios follow the
identity rules: text roles 4.5:1, graphic roles 3:1; None = not checked because the role is limited to thick lines or to a tint.
Also checks the text colours against the background (4.5:1).

    python3 tools/controlla_contrasti.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parent.parent / "web" / "style.css"
# role -> (minimum light, minimum dark)
MIN: dict[str, tuple[float | None, float | None]] = {
    "--color-brand": (4.5, 4.5),
    "--color-sample": (4.5, 4.5),
    "--color-reference": (None, 3.0),
    "--color-residual": (3.0, 3.0),
    "--color-alert": (3.0, 4.5),
    "--text": (4.5, 4.5),
    "--text-muted": (4.5, 4.5),
}


def luminance(hex_color: str) -> float:
    rgb = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def ratio(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def blocks(css: str) -> tuple[dict[str, str], dict[str, str]]:
    """Return the variables of the light theme (:root) and the dark overrides (inside prefers-color-scheme: dark)."""
    dark_start = css.index("prefers-color-scheme: dark")
    light = dict(re.findall(r"(--[\w-]+):\s*([^;]+);", css[:dark_start]))
    dark = dict(re.findall(r"(--[\w-]+):\s*([^;]+);", css[dark_start : css.index("}", css.index("}", dark_start) + 1)]))
    return light, {**light, **dark}


def resolve(value: str, env: dict[str, str]) -> str:
    m = re.fullmatch(r"var\((--[\w-]+)\)", value.strip().split("/*")[0].strip())
    return resolve(env[m.group(1)], env) if m else value.strip().split()[0]


def forced_dark_differs(css: str) -> bool:
    """The `:root[data-theme="dark"]` block must repeat exactly the variables of the dark media block."""
    m = re.search(r':root\[data-theme="dark"\]\s*\{([^}]*)\}', css)
    if not m:
        return True
    forced = dict(re.findall(r"(--[\w-]+):\s*([^;]+);", m.group(1)))
    start = css.index("prefers-color-scheme: dark")
    media = dict(re.findall(r"(--[\w-]+):\s*([^;]+);", css[start : css.index("}", css.index("}", start) + 1)]))
    return forced != media


def problems(css: str) -> list[str]:
    bad = ["the forced dark theme block differs from the dark media block"] if forced_dark_differs(css) else []
    for theme, env, idx in (("light", blocks(css)[0], 0), ("dark", blocks(css)[1], 1)):
        bg = resolve(env["--bg"], env)
        for role, mins in MIN.items():
            if mins[idx] is None:
                continue
            fg = resolve(env[role], env)
            r = ratio(fg, bg)
            if r < mins[idx]:
                bad.append(f"{theme} {role} {fg} on {bg}: {r:.2f}:1 < {mins[idx]}:1")
    return bad


def main() -> int:
    bad = problems(CSS.read_text(encoding="utf-8"))
    for b in bad:
        print("FAIL " + b)
    print(f"{len(bad)} problems")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

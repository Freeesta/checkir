"""Minimal JCAMP-DX reader/writer for the XYPOINTS=(XY..XY) layout used by the open library (standard library only)."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Jcamp:
    headers: dict[str, str] = field(default_factory=dict)
    xs: list[float] = field(default_factory=list)
    ys: list[float] = field(default_factory=list)
    comments: list[tuple[int, str]] = field(default_factory=list)  # (line number, text after '$$')


def parse(text: str) -> Jcamp:
    """Raises ValueError (with the line number) when the file is not readable JCAMP-DX of this layout."""
    out = Jcamp()
    in_data = False
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if "$$" in line:
            line, _, comment = line.partition("$$")
            out.comments.append((n, comment.strip()))
            line = line.strip()
        if not line:
            continue
        if line.startswith("##"):
            key, _, value = line[2:].partition("=")
            key = key.strip().upper()
            in_data = key == "XYPOINTS"
            if not in_data:
                out.headers[key] = value.strip()
            continue
        if not in_data:
            raise ValueError(f"line {n}: data outside ##XYPOINTS")
        parts = line.replace(",", " ").split()
        try:
            x, y = float(parts[0]), float(parts[1])
        except (IndexError, ValueError) as e:
            raise ValueError(f"line {n}: expected 'x y' pair, got '{line}'") from e
        out.xs.append(x)
        out.ys.append(y)
    for key in ("TITLE", "XUNITS", "YUNITS", "RESOLUTION", "SAMPLING PROCEDURE", "END"):
        if key not in out.headers:
            raise ValueError(f"missing header ##{key}")
    if len(out.xs) < 2:
        raise ValueError("fewer than 2 data points")
    return out


def write(headers: dict[str, str], xs: list[float], ys: list[float], comments: list[str] = ()) -> str:
    lines = ["##TITLE=" + headers["TITLE"], "##JCAMP-DX=5.01", "##DATA TYPE=INFRARED SPECTRUM"]
    lines += [f"##{k}={v}" for k, v in headers.items() if k != "TITLE"]
    lines += [f"$$ {c}" for c in comments]
    lines += [f"##FIRSTX={xs[0]:.1f}", f"##LASTX={xs[-1]:.1f}", f"##NPOINTS={len(xs)}", "##XYPOINTS=(XY..XY)"]
    lines += [f"{x:.1f}, {y:.6f}" for x, y in zip(xs, ys)]
    return "\n".join([*lines, "##END=", ""])

"""Generates data/substances/<id>/structure.svg from substance.smiles for every sheet with `structure_svg: true`.

    python3 tools/dati/genera_strutture.py             # write the files
    python3 tools/dati/genera_strutture.py --verifica  # fail if a file is missing, stale, or exists without the flag (CI)

The drawing is black on transparent: every colour is `currentColor`, no font is loaded (atom labels are paths), the root has
role="img" and an aria-label with the IUPAC name. Needs RDKit (version pinned in requirements.txt, only used by the tools).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SUBSTANCES = ROOT / "data" / "substances"


def render(smiles: str, label: str) -> str:
    from rdkit import Chem  # noqa: PLC0415
    from rdkit.Chem.Draw import rdMolDraw2D  # noqa: PLC0415

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"RDKit cannot read the SMILES '{smiles}'")
    drawer = rdMolDraw2D.MolDraw2DSVG(320, 240)
    opts = drawer.drawOptions()
    opts.clearBackground = False
    opts.useBWAtomPalette()
    opts.padding = 0.08
    drawer.DrawMolecule(mol)
    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()
    svg = re.sub(r"<\?xml[^>]*\?>\s*", "", svg)
    svg = re.sub(r"<!--.*?-->\s*", "", svg, flags=re.S)
    svg = re.sub(r"<metadata>.*?</metadata>\s*", "", svg, flags=re.S)
    svg = re.sub(r"<rect style='opacity:1\.0;fill:#[0-9A-Fa-f]{6};stroke:none'[^>]*/>\s*", "", svg)
    svg = re.sub(r"#[0-9A-Fa-f]{6}\b", "currentColor", svg)
    safe = label.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")
    svg = re.sub(r"<svg\b", f'<svg role="img" aria-label="{safe}"', svg, count=1)
    svg = re.sub(r"\s(width|height)=['\"][^'\"]*['\"]", "", svg, count=2)
    return svg.strip() + "\n"


def wanted() -> dict[Path, str]:
    out: dict[Path, str] = {}
    for sheet in sorted(SUBSTANCES.glob("*/datasheet/datasheet.json")):
        if json.loads(sheet.read_text(encoding="utf-8")).get("structure_svg"):
            sub = json.loads((sheet.parent.parent / "substance.json").read_text(encoding="utf-8"))
            out[sheet.parent.parent / "structure.svg"] = render(sub["smiles"], sub.get("iupac") or sub["names"]["en"]["preferred"])
    return out


def main(argv: list[str]) -> int:
    want = wanted()
    if argv == ["--verifica"]:
        bad = [f"{p.relative_to(ROOT)}: missing or stale (run tools/dati/genera_strutture.py)" for p, s in want.items() if not p.is_file() or p.read_text(encoding="utf-8") != s]
        bad += [f"{p.relative_to(ROOT)}: exists but its sheet has no structure_svg" for p in sorted(SUBSTANCES.glob("*/structure.svg")) if p not in want]
        print("\n".join(bad) if bad else "OK")
        return 1 if bad else 0
    if argv:
        print(__doc__)
        return 2
    for p, s in want.items():
        p.write_text(s, encoding="utf-8")
    print(f"{len(want)} structure(s) written")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

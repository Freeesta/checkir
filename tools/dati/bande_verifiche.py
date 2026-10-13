"""Rules re-checked locally on reference spectra (2026-10-13): class they are diagnostic for and opaque spectrum ids.

The ids are salted hashes of library entries kept in a private place: never a file name or a sample code.
A rule listed here moves from draft to verified_spectra; reviewers sign it later (status reviewed).
"""

CATHINONES = ("vs-31eb58599154", "vs-d49d56071832", "vs-35555f68cdd4", "vs-8c229d4bd6ff")
MDMA = ("vs-a34d792833b1", "vs-fa323ec80c0c")
KETAMINE = ("vs-f27ceb76a44f", "vs-9a166e00cc5e", "vs-b23c76e609c8")
FENTANYLS = ("vs-a45b83753f88", "vs-4cacee75a167", "vs-c3fe976fb1a3", "vs-99d35767b8b9")

# rule id -> (class, strength, spectrum ids)
VERIFIED = {
    "co.aryl_ketone": ("synthetic_cathinones", "strong", CATHINONES),
    "o_ch2_o.c_o": ("methylenedioxy", "supporting", MDMA),
    "o_ch2_o.ring": ("methylenedioxy", "supporting", MDMA),
    "co.ketone.sat": ("arylcyclohexylamines", "supporting", KETAMINE),
    "co.amide": ("fentanyls", "supporting", FENTANYLS),
}

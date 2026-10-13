"""Band assignments of the 13 demo substances (source table of data/bands/substance-bands/*.json).

Band = (position, tolerance, intensity, shape, rule_id, group, mode, sources, measured). Group and mode default to the ones of the
generic rule when rule_id is given. intensity: s strong, m medium, w weak, v variable. shape: s sharp, m medium, b broad, B very broad.
measured: True when the band was found on every spectrum listed in `spectra` (library entries re-checked locally, opaque ids only).
A band is verified_spectra only when at least two spectra of the substance were checked; otherwise it stays draft.
Positions are rounded to integers; numbers come from the cited sources and from the local re-check, never from a single instrument.
"""

SWG, ROD, UNO = "swgdrug-cocaine", "rodrigues2013", "unodc-cocaine2012"

SUBSTANCES = [
    {"substance": "cocaine", "form": "hydrochloride", "spectra": ("vs-88f33b27b982", "vs-7978c81846f0"),
     "note": "Positions re-checked on two library spectra of the hydrochloride (ATR). The two C=O are assigned to the methyl ester (higher) and the benzoate (lower) following the monograph; to be confirmed by the reviewer. The N-H+ envelope is much weaker in ATR than in KBr.",
     "bands": [
         (2540, 40, "w", "B", "nhplus.stretch", None, None, (ROD, "mendez-hernandez2020", "smith-amine-salts"), True),
         (1728, 6, "m", "s", "co.ester.sat", None, None, (SWG, ROD), True),
         (1712, 6, "s", "s", "co.ester.conj", None, None, (SWG, ROD, UNO), True),
         (1265, 6, "s", "s", "c_c_o.ester.arom", None, None, (ROD, "smith-arom-esters"), True),
         (1105, 6, "s", "s", "o_c_c.ester", None, None, (SWG, ROD), True),
         (729, 6, "s", "s", "oop.mono", None, None, (SWG, ROD, "mendez-hernandez2020"), True),
     ]},
    {"substance": "cocaine", "form": "base", "spectra": ("vs-c5566b020537", "vs-5d51a6dc9d0e"),
     "note": "Free base (crack): no N-H+ envelope, a clear C-H band near 2945 and the out-of-plane band near 712 instead of ~729 of the hydrochloride. The C-O-C bands sit higher than in the hydrochloride (~1273 and ~1108).",
     "bands": [
         (2945, 10, "m", "m", None, "methyl", "stretch_asym", (ROD, "mendez-hernandez2020"), True),
         (1734, 6, "s", "s", "co.ester.sat", None, None, (SWG, ROD), True),
         (1707, 6, "s", "s", "co.ester.conj", None, None, (SWG, ROD, UNO), True),
         (1273, 6, "s", "s", "c_c_o.ester.arom", None, None, (SWG, ROD), True),
         (1108, 6, "s", "s", "o_c_c.ester", None, None, (SWG, ROD), True),
         (712, 6, "s", "s", "oop.mono", None, None, (SWG, ROD, UNO), True),
     ]},
    {"substance": "mdma", "form": "hydrochloride", "spectra": ("vs-a34d792833b1", "vs-fa323ec80c0c"),
     "note": "The three methylenedioxy bands together (~1244, ~1032, ~930) are what points to the group; one band alone does not. Street material and the reference standard differ by a few cm-1 (930 against 922); the N-H2+ sub-band near 2450 is labelled in the monograph (KBr) and was seen on one library spectrum only.",
     "bands": [
         (2450, 20, "w", "B", "nh2plus.stretch", None, None, ("swgdrug-mdma", "smith-amine-salts"), False),
         (1489, 6, "s", "s", "ring.c_c_1500", None, None, ("swgdrug-mdma", "smith-benzene"), True),
         (1442, 6, "m", "s", "ch2.scissoring", None, None, ("swgdrug-mdma",), True),
         (1244, 8, "s", "s", "c_o.aryl_ether", "methylenedioxy", None, ("swgdrug-mdma", "smith-ethers"), True),
         (1032, 8, "s", "s", "o_ch2_o.c_o", None, None, ("swgdrug-mdma", "smith-ethers"), True),
         (930, 10, "s", "s", "o_ch2_o.ring", None, None, ("swgdrug-mdma", "smith-ethers"), True),
         (800, 8, "s", "s", "oop.124", None, None, ("swgdrug-mdma", "smith-benzene"), True),
     ]},
    {"substance": "ketamine", "form": "hydrochloride", "spectra": ("vs-f27ceb76a44f", "vs-9a166e00cc5e"),
     "note": "The C=O of the cyclohexanone sits higher (~1720) than in cathinones (~1686); the free base is lower (~1699). The strongest band near 772 is the ortho-disubstituted ring; the positional isomers differ in this region.",
     "bands": [
         (2685, 30, "w", "B", "nh2plus.stretch", None, None, ("swgdrug-ketamine", "smith-amine-salts"), True),
         (1720, 6, "m", "s", "co.ketone.sat", None, None, ("swgdrug-ketamine", "smith-carbonyl"), True),
         (772, 6, "s", "s", "oop.ortho", None, None, ("swgdrug-ketamine", "smith-benzene"), True),
         (719, 6, "m", "s", None, "benzene_ortho", "oop", ("swgdrug-ketamine",), True),
     ]},
    {"substance": "amphetamine", "form": "sulfate-racemate", "spectra": ("vs-a097a01e67aa",),
     "note": "Positions from the monograph and from one library entry that looks like the d-form (NH3+ bend ~1539). The racemate is reported higher (~1553 on a library entry that cannot be cited): the tolerance of the NH3+ band covers both and the distinction is left to the reviewer. The sulfate band is the most intense and the one that separates it from the hydrochloride.",
     "bands": [
         (1539, 15, "w", "m", "nh3plus.bend", None, None, ("swgdrug-amphetamine", "smith-amine-salts"), True),
         (1049, 20, "s", "B", "sulfate.stretch", None, None, ("swgdrug-amphetamine", "smith-inorg2"), True),
         (737, 6, "m", "s", "oop.mono", None, None, ("swgdrug-amphetamine", "smith-benzene"), True),
         (698, 6, "s", "s", "ring.mono_bend", None, None, ("swgdrug-amphetamine", "smith-benzene"), True),
     ]},
    {"substance": "4-mmc", "form": "hydrochloride", "spectra": ("vs-31eb58599154",),
     "note": "One library spectrum checked so far (draft). Position isomers (3-MMC, 2-MMC) have the same C=O: the para-ring band near 833 is what tells them apart, and only with a candidate.",
     "bands": [
         (2715, 20, "w", "B", "nh2plus.stretch", None, None, ("swgdrug-4mmc", "vujovic2020"), True),
         (1686, 6, "s", "s", "co.aryl_ketone", None, None, ("swgdrug-4mmc", "vujovic2020", "goncalves2021"), True),
         (1606, 6, "m", "s", "ring.c_c_1600", None, None, ("swgdrug-4mmc", "vujovic2020"), True),
         (833, 6, "s", "s", "oop.para", None, None, ("swgdrug-4mmc", "smith-benzene"), True),
     ]},
    {"substance": "4-cmc", "form": "hydrochloride", "spectra": (),
     "note": "Values from the monograph only; no local spectrum of this substance was available (draft).",
     "bands": [
         (2698, 20, "w", "B", "nh2plus.stretch", None, None, ("swgdrug-4cmc", "smith-amine-salts"), False),
         (1687, 6, "s", "s", "co.aryl_ketone", None, None, ("swgdrug-4cmc",), False),
         (1588, 6, "s", "s", "ring.c_c_1600", None, None, ("swgdrug-4cmc",), False),
         (840, 6, "s", "s", "oop.para", None, None, ("swgdrug-4cmc", "smith-benzene"), False),
     ]},
    {"substance": "thca-a", "form": "free-acid", "spectra": ("vs-4559b1d2e5ae",),
     "note": "One library entry labelled THC with the same bands (identity of the label to be checked): draft. The C=O is shifted down by the internal hydrogen bond, so nothing is expected near 1700.",
     "bands": [
         (1612, 8, "s", "m", None, "carboxylic_acid", "stretch", ("swgdrug-thca-a",), True),
         (1250, 8, "s", "m", "c_o.phenol", None, None, ("swgdrug-thca-a",), True),
         (1184, 8, "m", "s", None, "ether", "stretch_asym", ("swgdrug-thca-a",), True),
         (1119, 8, "m", "s", "c_o_c.ether", None, None, ("swgdrug-thca-a",), True),
     ]},
    {"substance": "caffeine", "form": "anhydrous", "spectra": ("vs-6571fe9826b6",),
     "note": "The two coupled C=O (~1692 and ~1645) and the strong isolated band at ~744 are what recognise caffeine in a mixture; in mixtures the C=O move by 5-10 cm-1. One library spectrum checked so far (draft).",
     "bands": [
         (1692, 10, "s", "s", "co.imide", None, None, ("nist-webbook", "dzodic2024"), True),
         (1645, 10, "s", "s", "co.amide", None, None, ("nist-webbook", "dzodic2024"), True),
         (1546, 10, "m", "s", None, "imine", "stretch", ("nist-webbook",), True),
         (1212, 10, "m", "s", None, "amine", "stretch", ("nist-webbook",), True),
         (744, 8, "s", "s", None, "aromatic_ring", "oop", ("nist-webbook",), True),
     ]},
    {"substance": "paracetamol", "form": "solid", "spectra": (),
     "note": "Numbers from the NIST mull spectrum (polymorph not declared) and from service spectra of the architect; no open source with a polymorph assignment (draft). Tolerance 10 for a minor component of a mixture.",
     "bands": [
         (1651, 10, "s", "s", "co.amide", None, None, ("nist-webbook", "dzodic2024"), False),
         (1609, 10, "m", "s", "ring.c_c_1600", None, None, ("nist-webbook", "dzodic2024"), False),
         (1562, 10, "m", "s", "amide.ii", None, None, ("nist-webbook",), False),
         (1504, 10, "s", "s", "ring.c_c_1500", None, None, ("nist-webbook",), False),
         (1224, 10, "s", "s", "c_o.phenol", None, None, ("nist-webbook", "smith-co-bond"), False),
         (835, 8, "m", "s", "oop.para", None, None, ("nist-webbook", "smith-benzene"), False),
     ]},
    {"substance": "cellulose", "form": "microcrystalline", "spectra": ("vs-c37a27732694",),
     "note": "Broad O-H and a group of strong C-O bands around 1000-1100; the exact subpeaks depend on crystallinity. No open ATR source with these numbers (draft).",
     "bands": [
         (3330, 50, "m", "b", "oh.hbonded", None, None, ("smith-co-bond", "coates2000"), True),
         (1103, 10, "m", "s", "c_o_c.ether", None, None, ("smith-co-bond",), True),
         (1029, 15, "s", "b", "c_o.alcohol", None, None, ("smith-co-bond", "coates2000"), True),
     ]},
    {"substance": "phenacetin", "form": "solid", "spectra": (),
     "note": "Numbers from the NIST KBr spectrum and from the architect's notes; the aryl-ethyl ether near 1241 and 1047 separate it from paracetamol (draft).",
     "bands": [
         (1657, 10, "s", "s", "co.amide", None, None, ("nist-webbook",), False),
         (1555, 10, "m", "s", "amide.ii", None, None, ("nist-webbook",), False),
         (1508, 10, "s", "s", "ring.c_c_1500", None, None, ("nist-webbook",), False),
         (1241, 10, "s", "s", "c_o.aryl_ether", None, None, ("nist-webbook", "smith-ethers"), False),
         (1047, 8, "m", "s", "c_o_c.ether", None, None, ("nist-webbook", "smith-ethers"), False),
         (825, 8, "s", "s", "oop.para", None, None, ("nist-webbook", "smith-benzene"), False),
     ]},
    {"substance": "levamisole", "form": "hydrochloride", "spectra": (),
     "note": "No open source with levamisole bands was found: positions come from a library entry of the architect and the sources only justify the group assignment (draft).",
     "bands": [
         (1529, 12, "m", "b", None, "imine", "stretch", ("smith-nitrogen",), False),
         (1215, 10, "m", "s", "cn.aliphatic_amine", None, None, ("smith-amines23",), False),
         (739, 8, "s", "s", "oop.mono", None, None, ("smith-benzene",), False),
         (694, 8, "s", "s", "ring.mono_bend", None, None, ("smith-benzene",), False),
     ]},
]

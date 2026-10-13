"""Explanation texts (it, en) of the main bands of bande_sostanze.py: key (substance, form, position) -> (it, en).

One or two sentences at chemist level. Style: "compatibile con / tipico di / atteso per"; integer positions with "~"; no health content.
"""

TEXTS = {
    ("cocaine", "hydrochloride", 1728): (
        "Banda a ~1728 cm-1: C=O del metil estere, atteso per la cocaina cloridrato insieme alla banda a ~1712.",
        "Band at ~1728 cm-1: C=O of the methyl ester, expected for cocaine hydrochloride together with the band at ~1712."),
    ("cocaine", "hydrochloride", 1712): (
        "Banda a ~1712 cm-1: C=O del benzoato (estere coniugato); con ~1728 forma il doppietto tipico degli esteri del tropano.",
        "Band at ~1712 cm-1: C=O of the benzoate (conjugated ester); with ~1728 it makes the doublet typical of tropane esters."),
    ("cocaine", "hydrochloride", 729): (
        "Banda a ~729 cm-1: deformazione fuori piano dell'anello monosostituito; nella base libera cade più in basso, a ~712.",
        "Band at ~729 cm-1: out-of-plane bend of the monosubstituted ring; in the free base it falls lower, at ~712."),
    ("cocaine", "base", 1734): (
        "Banda a ~1734 cm-1: C=O del metil estere nella forma base; nel cloridrato è a ~1728.",
        "Band at ~1734 cm-1: C=O of the methyl ester in the base form; in the hydrochloride it is at ~1728."),
    ("cocaine", "base", 712): (
        "Banda a ~712 cm-1: deformazione fuori piano dell'anello monosostituito, compatibile con la forma base (nel sale è a ~729).",
        "Band at ~712 cm-1: out-of-plane bend of the monosubstituted ring, compatible with the base form (in the salt it is at ~729)."),
    ("mdma", "hydrochloride", 1244): (
        "Banda a ~1244 cm-1: C-O-C aril-alchilico del gruppo metilendiossi; da sola non basta, conta la tripletta con ~1032 e ~930.",
        "Band at ~1244 cm-1: aryl-alkyl C-O-C of the methylenedioxy group; alone it is not enough, the triplet with ~1032 and ~930 counts."),
    ("mdma", "hydrochloride", 930): (
        "Banda a ~930 cm-1: modo dell'anello diossolico O-CH2-O; nei campioni di strada può cadere a ~922.",
        "Band at ~930 cm-1: mode of the dioxole ring O-CH2-O; in street samples it may fall at ~922."),
    ("ketamine", "hydrochloride", 1720): (
        "Banda a ~1720 cm-1: C=O del cicloesanone, più alto di quello dei catinoni (~1686); la base libera è a ~1699.",
        "Band at ~1720 cm-1: C=O of the cyclohexanone, higher than that of cathinones (~1686); the free base is at ~1699."),
    ("ketamine", "hydrochloride", 772): (
        "Banda a ~772 cm-1: la più intensa, deformazione fuori piano dell'anello orto-disostituito.",
        "Band at ~772 cm-1: the strongest, out-of-plane bend of the ortho-disubstituted ring."),
    ("amphetamine", "sulfate-racemate", 1049): (
        "Banda a ~1049 cm-1: stiramento del solfato, molto intensa e larga; distingue il solfato dal cloridrato.",
        "Band at ~1049 cm-1: sulfate stretch, very intense and broad; it tells the sulfate from the hydrochloride."),
    ("4-mmc", "hydrochloride", 1686): (
        "Banda a ~1686 cm-1: C=O aril-chetonico, tipico dei catinoni; cade vicino a caffeina, lidocaina e ammidi.",
        "Band at ~1686 cm-1: aryl-ketone C=O, typical of cathinones; it falls near caffeine, lidocaine and amides."),
    ("4-mmc", "hydrochloride", 833): (
        "Banda a ~833 cm-1: deformazione fuori piano dell'anello para-disostituito; indizio del 4-sostituito, solo con un candidato.",
        "Band at ~833 cm-1: out-of-plane bend of the para-disubstituted ring; a hint of the 4-substituted isomer, only with a candidate."),
    ("4-cmc", "hydrochloride", 840): (
        "Banda a ~840 cm-1: deformazione fuori piano dell'anello para-disostituito, atteso per il 4-CMC cloridrato.",
        "Band at ~840 cm-1: out-of-plane bend of the para-disubstituted ring, expected for 4-CMC hydrochloride."),
    ("thca-a", "free-acid", 1612): (
        "Banda a ~1612 cm-1: C=O dell'acido legato da un legame a idrogeno interno; per questo non va cercata a ~1700.",
        "Band at ~1612 cm-1: C=O of the acid held by an internal hydrogen bond; for this reason it is not looked for at ~1700."),
    ("caffeine", "anhydrous", 1692): (
        "Banda a ~1692 cm-1: primo dei due C=O accoppiati della caffeina (l'altro è a ~1645); in miscela può spostarsi di 5-10 cm-1.",
        "Band at ~1692 cm-1: first of the two coupled C=O of caffeine (the other is at ~1645); in a mixture it may move by 5-10 cm-1."),
    ("caffeine", "anhydrous", 1212): (
        "Banda a ~1212 cm-1: stiramento C–N degli anelli xantinici (pirimidindione e imidazolo) della caffeina; non è un etere.",
        "Band at ~1212 cm-1: C–N stretching of the caffeine xanthine rings (pyrimidinedione and imidazole); not an ether."),
    ("caffeine", "anhydrous", 744): (
        "Banda a ~744 cm-1: molto intensa e isolata, la più utile per riconoscere la caffeina in miscela.",
        "Band at ~744 cm-1: very intense and isolated, the most useful to recognise caffeine in a mixture."),
    ("paracetamol", "solid", 1224): (
        "Banda a ~1224 cm-1: stiramento C-O del fenolo, intensa; con ~1651 e ~835 è compatibile con il paracetamolo.",
        "Band at ~1224 cm-1: phenol C-O stretch, strong; together with ~1651 and ~835 it is compatible with paracetamol."),
    ("cellulose", "microcrystalline", 1029): (
        "Banda a ~1029 cm-1: gruppo di bande C-O intense e larghe, tipiche dei polisaccaridi; non basta a distinguere cellulosa da zuccheri.",
        "Band at ~1029 cm-1: group of strong broad C-O bands, typical of polysaccharides; it does not tell cellulose from sugars."),
    ("phenacetin", "solid", 1241): (
        "Banda a ~1241 cm-1: C-O-C aril-etilico, intensa; con ~1047 distingue la fenacetina dal paracetamolo.",
        "Band at ~1241 cm-1: aryl-ethyl C-O-C, strong; with ~1047 it tells phenacetin from paracetamol."),
    ("levamisole", "hydrochloride", 1529): (
        "Banda a ~1529 cm-1, larga: stiramento C=N dell'amidina protonata; da confermare, manca una fonte aperta con le sue bande.",
        "Band at ~1529 cm-1, broad: C=N stretch of the protonated amidine; to be confirmed, no open source with its bands was found."),
}

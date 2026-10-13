"""Explanation texts of the band rules, part 1 (counsellor and chemist levels, Italian and English).

id: (counsellor it, counsellor en, chemist it, chemist en). Style: tools/dati/controlla_bande.py enforces the forbidden words; the rest
(only "compatible with / typical of", integer positions with "~", no conclusion on the sample) is checked in review. Written by us, never copied.
"""
TESTI_A = {
 "oh.free": (
  "Questo picco viene da un gruppo O-H non legato alle molecole vicine. Nei solidi è raro e da solo non indica la sostanza.",
  "This peak comes from an O-H group not bonded to its neighbours. Rare in solids; alone it does not indicate the substance.",
  "Stiramento O-H libero (non legato a idrogeno), stretto, ~3580-3650 cm⁻¹; compatibile con un OH impedito o isolato, raro nei solidi. Falso amico: l'OH del talco (~3675).",
  "Free (non-hydrogen-bonded) O-H stretching, sharp, ~3580-3650 cm⁻¹; compatible with a hindered or isolated OH, rare in solids. False friend: the talc OH (~3675)."),
 "oh.hbonded": (
  "Questo picco largo viene da gruppi O-H legati tra loro (legame a idrogeno), come in alcoli, zuccheri o acqua. Da solo non indica la sostanza.",
  "This broad peak comes from O-H groups bonded together (hydrogen bonding), as in alcohols, sugars or water. Alone it does not indicate the substance.",
  "Stiramento O-H con legame a idrogeno, forte e molto largo, ~3200-3570 cm⁻¹; compatibile con alcoli, fenoli, zuccheri, acqua. Falsi amici: acqua adsorbita; N-H di ammidi e ammine (più stretti).",
  "Hydrogen-bonded O-H stretching, strong and very broad, ~3200-3570 cm⁻¹; compatible with alcohols, phenols, sugars, water. False friends: adsorbed water; N-H of amides and amines (narrower)."),
 "oh.acid": (
  "Questo picco molto largo viene dall'O-H di un acido e copre i picchi vicini. Da solo non indica la sostanza.",
  "This very broad peak comes from the O-H of an acid and covers nearby peaks. On its own it does not indicate the substance.",
  "Stiramento O-H del dimero dell'acido carbossilico, molto largo, ~2500-3300 cm⁻¹, spesso senza massimo e sovrapposto alle C-H. Atteso con il C=O ~1680-1730. Falso amico: inviluppo N-H⁺ dei sali d'ammina.",
  "O-H stretching of the carboxylic acid dimer, very broad, ~2500-3300 cm⁻¹, often without a maximum and overlapping the C-H bands. Expected together with C=O at ~1680-1730. False friend: the N-H⁺ envelope of amine salts."),
 "h2o.stretch": (
  "Questo picco largo può venire da acqua trattenuta dal campione. Non indica la sostanza, ma l'acqua cambia l'aspetto dello spettro.",
  "This broad peak can come from water held by the sample. It does not indicate the substance, but water changes the look of the spectrum.",
  "Stiramento O-H dell'acqua adsorbita o di cristallizzazione, ~3300-3500 cm⁻¹, largo; atteso con la deformazione H-O-H ~1610-1650. Nei sali igroscopici è un contaminante frequente; falso amico: O-H legato a idrogeno.",
  "O-H stretching of adsorbed or crystal water, ~3300-3500 cm⁻¹, broad; expected with the H-O-H bend at ~1610-1650. A frequent contaminant of hygroscopic salts; false friend: hydrogen-bonded O-H."),
 "talc.oh": (
  "Questo picco stretto viene da un gruppo O-H dentro un minerale a strati. Da solo non basta.",
  "This sharp peak comes from an O-H group inside a layered mineral. On its own it is not enough.",
  "Stiramento Mg-OH del talco, stretto, ~3670-3685 cm⁻¹; atteso con la banda Si-O larga ~950-1200. Falso amico: O-H libero.",
  "Mg-OH stretching of talc, sharp, ~3670-3685 cm⁻¹; expected with the broad Si-O band at ~950-1200. False friend: free O-H."),
 "nh.amine1": (
  "Questo picco, spesso doppio, viene dai legami N-H di un gruppo NH2. Da solo non dice quale sostanza ci sia.",
  "This peak, often double, comes from the N-H bonds of an NH2 group. On its own it does not say which substance is present.",
  "Stiramenti N-H dell'ammina primaria (base libera): due bande, asimmetrica e simmetrica, ~3250-3510 cm⁻¹, medie e più strette dell'O-H. Falso amico: O-H legato a idrogeno.",
  "N-H stretching of a primary amine (free base): two bands, asymmetric and symmetric, ~3250-3510 cm⁻¹, medium and narrower than O-H. False friend: hydrogen-bonded O-H."),
 "nh.amine2": (
  "Questo picco debole viene dal legame N-H di un'ammina con un solo idrogeno sull'azoto. In una miscela può sparire.",
  "This weak peak comes from the N-H bond of an amine with a single hydrogen on the nitrogen. In a mixture it can vanish.",
  "Stiramento N-H dell'ammina secondaria (base libera), una banda debole, ~3280-3400 cm⁻¹; in miscela può non vedersi. Falso amico: N-H di ammide.",
  "N-H stretching of a secondary amine (free base), one weak band, ~3280-3400 cm⁻¹; it may not be visible in a mixture. False friend: amide N-H."),
 "nh.amide": (
  "Questo picco viene dal legame N-H di un'ammide. Si legge con i picchi del carbonile e da solo non indica la sostanza.",
  "This peak comes from the N-H bond of an amide. It is read with the carbonyl peaks; alone it does not indicate the substance.",
  "Stiramento N-H di ammide, ~3170-3370 cm⁻¹, media; da confermare con l'ammide I (~1630-1690) e l'ammide II. Falso amico: O-H legato a idrogeno.",
  "Amide N-H stretching, ~3170-3370 cm⁻¹, medium; to be confirmed by amide I (~1630-1690) and amide II. False friend: hydrogen-bonded O-H."),
 "nh.indole": (
  "Questo picco stretto viene dal legame N-H di un anello con azoto. Da solo non dice quale sostanza ci sia.",
  "This sharp peak comes from the N-H bond of a ring containing nitrogen. On its own it does not say which substance is present.",
  "Stiramento N-H di indolo o eterociclo non alchilato, ~3380-3490 cm⁻¹, stretto; nei solidi il legame a idrogeno lo abbassa. Manca una fonte aperta per l'indolo solido: regola da confermare su spettri di riferimento.",
  "N-H stretching of an indole or non-alkylated heterocycle, ~3380-3490 cm⁻¹, sharp; in solids hydrogen bonding lowers it. No open source for solid indole: rule to be confirmed on reference spectra."),
 "nh3plus.stretch": (
  "Questo picco molto largo viene da un sale in cui l'azoto porta tre idrogeni. Lo produce la forma di sale, non la molecola base.",
  "This very broad peak comes from a salt where the nitrogen carries three hydrogens. The salt form produces it, not the free base.",
  "Stiramento N-H⁺ di sale d'ammina primaria (per esempio anfetamina), inviluppo molto largo ~2800-3200 cm⁻¹ con le C-H sovrapposte; atteso con due deformazioni NH₃⁺. Falso amico: O-H dell'acido.",
  "N-H⁺ stretching of a primary amine salt (for example amphetamine), very broad envelope ~2800-3200 cm⁻¹ with overlapping C-H; expected with two NH₃⁺ bends. False friend: acid O-H."),
 "nh2plus.stretch": (
  "Questo picco molto largo viene da un sale in cui l'azoto porta due idrogeni. Dipende dalla forma di sale e si trova in molte sostanze.",
  "This very broad peak comes from a salt where the nitrogen carries two hydrogens. It depends on the salt form and occurs in many substances.",
  "Stiramento N-H⁺ di sale d'ammina secondaria (metanfetamina, MDMA, catinoni N-metilici), inviluppo molto largo ~2200-3100 cm⁻¹ con sottobande; le fonti discordano sull'estremo basso, quindi la finestra è larga. Falsi amici: O-H dell'acido; N-H⁺ terziario.",
  "N-H⁺ stretching of a secondary amine salt (methamphetamine, MDMA, N-methyl cathinones), very broad envelope ~2200-3100 cm⁻¹ with sub-bands; sources disagree on the low end, hence the wide window. False friends: acid O-H; tertiary N-H⁺."),
 "nhplus.stretch": (
  "Questo picco molto largo viene da un sale in cui l'azoto porta un solo idrogeno. Dice che c'è un sale, non quale.",
  "This very broad peak comes from a salt in which the nitrogen carries a single hydrogen. It says a salt is present, not which one.",
  "Stiramento N-H⁺ di sale d'ammina terziaria (per esempio cocaina cloridrato), inviluppo molto largo ~2300-2700 cm⁻¹; distingue il sale dalla base libera, che non lo ha. Falso amico: N-H⁺ secondario.",
  "N-H⁺ stretching of a tertiary amine salt (for example cocaine hydrochloride), very broad envelope ~2300-2700 cm⁻¹; it distinguishes the salt from the free base, which lacks it. False friend: secondary N-H⁺."),
 "nhplus.combination": (
  "Questi picchi deboli, ravvicinati, accompagnano il picco largo dei sali d'ammina. Non vanno scambiati per altri gruppi.",
  "These weak, closely spaced peaks accompany the broad peak of amine salts. They should not be mistaken for other groups.",
  "Serie di armoniche e bande di combinazione dei sali d'ammina, deboli, ~2000-2800 cm⁻¹ («pettine»); da non assegnare a C≡C o C≡N.",
  "Series of overtones and combination bands of amine salts, weak, ~2000-2800 cm⁻¹ (a «comb»); not to be assigned to C≡C or C≡N."),
 "ch.aromatic": (
  "Questo picco debole viene dai legami C-H di un anello piatto di carbonio. Mostra un anello, non quale sostanza sia.",
  "This weak peak comes from the C-H bonds of a flat carbon ring. It shows a ring, not which substance it is.",
  "Stiramento C-H aromatico, debole e stretto, ~3000-3130 cm⁻¹ (sopra 3000 = anello o insaturazione). Falso amico: C-H vinilico.",
  "Aromatic C-H stretching, weak and sharp, ~3000-3130 cm⁻¹ (above 3000 = ring or unsaturation). False friend: vinyl C-H."),
 "ch.vinyl": (
  "Questo picco viene dal legame C-H accanto a un doppio legame tra carboni. Si legge con il picco del doppio legame.",
  "This peak comes from the C-H bond next to a carbon-carbon double bond. It is read together with the peak of the double bond.",
  "Stiramento =C-H di alchene, ~3010-3100 cm⁻¹, medio; da confermare con C=C ~1620-1680. Falso amico: C-H aromatico.",
  "=C-H stretching of an alkene, ~3010-3100 cm⁻¹, medium; to be confirmed by C=C at ~1620-1680. False friend: aromatic C-H."),
 "ch3.stretch_asym": (
  "Questo picco viene dai legami C-H di un gruppo metile (CH3). Quasi tutte le molecole organiche ne hanno uno, quindi dice poco.",
  "This peak comes from the C-H bonds of a methyl group (CH3). Almost all organic molecules have one, so it tells little.",
  "Stiramento asimmetrico C-H del metile, ~2950-2975 cm⁻¹, medio e stretto; poco diagnostico da solo.",
  "Asymmetric C-H stretching of a methyl group, ~2950-2975 cm⁻¹, medium and sharp; of little diagnostic value on its own."),
 "ch3.stretch_sym": (
  "Questo picco viene dai legami C-H di un gruppo metile (CH3), mossi insieme. Quasi tutte le molecole organiche ne hanno uno.",
  "This peak comes from the C-H bonds of a methyl group (CH3) moving together. Almost all organic molecules have one.",
  "Stiramento simmetrico C-H del metile, ~2860-2885 cm⁻¹, medio e stretto. Falso amico: stiramento simmetrico del CH₂.",
  "Symmetric C-H stretching of a methyl group, ~2860-2885 cm⁻¹, medium and sharp. False friend: symmetric CH₂ stretching."),
 "ch2.stretch_asym": (
  "Questo picco viene dai legami C-H di un gruppo CH2, presente nelle catene di carbonio. Dice poco su quale sostanza ci sia.",
  "This peak comes from the C-H bonds of a CH2 group, found in carbon chains. It tells little about which substance is present.",
  "Stiramento asimmetrico C-H del metilene, ~2915-2936 cm⁻¹, medio e stretto; ubiquitario, poco diagnostico da solo. Intense negli oli e nelle paraffine.",
  "Asymmetric C-H stretching of a methylene group, ~2915-2936 cm⁻¹, medium and sharp; ubiquitous, of little diagnostic value on its own. Intense in oils and paraffins."),
 "ch2.stretch_sym": (
  "Questo picco viene dai legami C-H di un gruppo CH2, mossi insieme. Dice poco su quale sostanza ci sia.",
  "This peak comes from the C-H bonds of a CH2 group moving together. It tells little about which substance is present.",
  "Stiramento simmetrico C-H del metilene, ~2845-2865 cm⁻¹, medio e stretto. Falso amico: stiramento simmetrico del CH₃.",
  "Symmetric C-H stretching of a methylene group, ~2845-2865 cm⁻¹, medium and sharp. False friend: symmetric CH₃ stretching."),
 "och3.stretch": (
  "Questo picco viene dal gruppo metile attaccato a un ossigeno (metossi). Aiuta a riconoscere certe molecole, ma si può confondere con altri picchi vicini.",
  "This peak comes from the methyl group attached to an oxygen (methoxy). It helps to recognise certain molecules but can be confused with nearby peaks.",
  "Stiramento simmetrico C-H di O-CH₃ (metossi), ~2810-2850 cm⁻¹, medio e stretto. Falsi amici: N-CH₃ e C-H aldeidico.",
  "Symmetric C-H stretching of O-CH₃ (methoxy), ~2810-2850 cm⁻¹, medium and sharp. False friends: N-CH₃ and aldehyde C-H."),
 "nch3.stretch": (
  "Questo picco viene dal gruppo metile attaccato a un azoto. Si vede soprattutto quando l'azoto non è in forma di sale.",
  "This peak comes from the methyl group attached to a nitrogen. It is seen mainly when the nitrogen is not in salt form.",
  "Stiramento simmetrico C-H di N-CH₃, ~2765-2825 cm⁻¹, medio; atteso per le ammine come base libera, la regola si esclude se c'è l'inviluppo N-H⁺. Falsi amici: O-CH₃ e C-H aldeidico.",
  "Symmetric C-H stretching of N-CH₃, ~2765-2825 cm⁻¹, medium; expected for amines as free bases, the rule is excluded when the N-H⁺ envelope is present. False friends: O-CH₃ and aldehyde C-H."),
 "cho.fermi": (
  "Questo picco, spesso doppio, viene dal legame C-H di un'aldeide. Si può confondere con i picchi dei sali d'ammina.",
  "This peak, often double, comes from the C-H bond of an aldehyde. It can be confused with the peaks of amine salts.",
  "Stiramento C-H aldeidico, doppietto per risonanza di Fermi, ~2695-2830 cm⁻¹; il picco a ~2720 è il più isolato. Falsi amici: N-CH₃ e il «pettine» dei sali.",
  "Aldehyde C-H stretching, a Fermi-resonance doublet, ~2695-2830 cm⁻¹; the peak at ~2720 is the most isolated. False friends: N-CH₃ and the salt «comb»."),
 "cn.nitrile": (
  "Questo picco stretto viene da un legame triplo tra carbonio e azoto. Cade in una zona quasi vuota dello spettro.",
  "This sharp peak comes from a triple bond between carbon and nitrogen. It falls in an almost empty region of the spectrum.",
  "Stiramento C≡N del nitrile, ~2210-2280 cm⁻¹, stretto; l'intensità varia tra le fonti, non usarla come criterio. Falsi amici: CO₂ dell'aria; armoniche dei sali.",
  "C≡N stretching of a nitrile, ~2210-2280 cm⁻¹, sharp; intensity varies between sources, do not use it as a criterion. False friends: air CO₂; salt overtones."),
 "cc.triple": (
  "Questo picco debole viene da un legame triplo tra due carboni. Se la molecola è simmetrica può mancare del tutto.",
  "This weak peak comes from a triple bond between two carbons. If the molecule is symmetric it can be absent altogether.",
  "Stiramento C≡C dell'alchino, ~2100-2260 cm⁻¹, debole; negli alchini interni simmetrici può mancare. Falsi amici: CO₂ dell'aria; armoniche dei sali.",
  "C≡C stretching of an alkyne, ~2100-2260 cm⁻¹, weak; it can be absent in symmetric internal alkynes. False friends: air CO₂; salt overtones."),
 "co2.artifact": (
  "Questo picco non viene dal campione ma dall'anidride carbonica dell'aria. Può cambiare tra fondo e misura.",
  "This peak does not come from the sample but from the carbon dioxide in the air. It can change between background and measurement.",
  "Stiramento asimmetrico della CO₂ atmosferica (doppietto ~2340/2360), ~2280-2400 cm⁻¹: artefatto del fondo, da mascherare o ignorare; segnalare se è intenso. Non è una banda del campione.",
  "Asymmetric stretching of atmospheric CO₂ (doublet ~2340/2360), ~2280-2400 cm⁻¹: a background artefact, to be masked or ignored and flagged if intense. It is not a band of the sample."),
 "co2.artifact_bend": (
  "Questo picco stretto non viene dal campione ma dall'anidride carbonica dell'aria, come quello vicino a 2350.",
  "This sharp peak does not come from the sample but from the carbon dioxide in the air, like the one near 2350.",
  "Deformazione O=C=O della CO₂ atmosferica, ~660-675 cm⁻¹, stretta, accompagna la banda ~2340/2360: artefatto del fondo, non del campione.",
  "O=C=O bending of atmospheric CO₂, ~660-675 cm⁻¹, sharp, accompanies the band at ~2340/2360: a background artefact, not a band of the sample."),
 "aromatic.overtones": (
  "Questi piccoli picchi deboli, in gruppo, accompagnano un anello aromatico. Non vanno scambiati per un carbonile debole.",
  "This group of small weak peaks accompanies an aromatic ring. They should not be mistaken for a weak carbonyl.",
  "Armoniche e bande di combinazione dell'anello aromatico («dita del benzene»), deboli, ~1650-2000 cm⁻¹; il disegno dipende dalla sostituzione. Falso amico: ammide I debole.",
  "Aromatic ring overtones and combination bands («benzene fingers»), weak, ~1650-2000 cm⁻¹; the pattern depends on the substitution. False friend: a weak amide I."),
 "co.imide": (
  "Questo picco o gruppo di picchi viene dai carbonili di un'immide, un gruppo con due C=O vicini. Si legge con il suo N-H.",
  "This peak or group of peaks comes from the carbonyls of an imide, a group with two neighbouring C=O. It is read with its N-H.",
  "Stiramenti C=O di immide, banda forte con più componenti, ~1670-1790 cm⁻¹ (esempio: barbiturici, xantine); atteso con N-H immidico ~3100-3270. Una sola fonte indipendente. Falso amico: estere saturo.",
  "Imide C=O stretching, strong multi-component band, ~1670-1790 cm⁻¹ (examples: barbiturates, xanthines); expected with imide N-H at ~3100-3270. A single independent source. False friend: saturated ester."),
 "nh.imide": (
  "Questo picco viene dal legame N-H di un'immide, un gruppo con due C=O vicini. Si legge con i picchi del carbonile.",
  "This peak comes from the N-H bond of an imide, a group with two neighbouring C=O. It is read with the carbonyl peaks.",
  "Stiramento N-H di immide, ~3100-3270 cm⁻¹, medio; il legame a idrogeno nel solido lo abbassa molto rispetto alla fase gas. Atteso con C=O immidico. Falso amico: N-H di ammide.",
  "Imide N-H stretching, ~3100-3270 cm⁻¹, medium; hydrogen bonding in the solid lowers it strongly compared to the gas phase. Expected with imide C=O. False friend: amide N-H."),
 "co.ester.sat": (
  "Questo picco intenso viene dal doppio legame carbonio-ossigeno di un estere. Gli esteri sono comuni: da solo non indica la sostanza.",
  "This intense peak comes from the carbon-oxygen double bond of an ester. Esters are common: on its own it does not indicate the substance.",
  "Stiramento C=O di estere saturo, forte e stretto, ~1725-1755 cm⁻¹ (acetati degli oppiacei, estere metilico della cocaina). Atteso con C-C-O ~1160-1250. Falsi amici: aldeide, chetone saturo.",
  "Saturated ester C=O stretching, strong and sharp, ~1725-1755 cm⁻¹ (opiate acetates, the methyl ester of cocaine). Expected with C-C-O at ~1160-1250. False friends: aldehyde, saturated ketone."),
 "co.ester.conj": (
  "Questo picco intenso viene dal carbonile di un estere legato a un anello. Cade un po' più in basso di quello di un estere comune.",
  "This intense peak comes from the carbonyl of an ester attached to a ring. It falls a little lower than that of an ordinary ester.",
  "Stiramento C=O di estere coniugato (benzoato), forte e stretto, ~1700-1730 cm⁻¹; atteso con C-C-O aromatico ~1250-1310. Falsi amici: chetone saturo, acido carbossilico.",
  "Conjugated ester (benzoate) C=O stretching, strong and sharp, ~1700-1730 cm⁻¹; expected with aromatic C-C-O at ~1250-1310. False friends: saturated ketone, carboxylic acid."),
 "co.ketone.sat": (
  "Questo picco intenso viene dal carbonile di un chetone. Da solo non dice quale sostanza ci sia.",
  "This intense peak comes from the carbonyl of a ketone. On its own it does not say which substance is present.",
  "Stiramento C=O di chetone saturo (per esempio cicloesanone), forte e stretto, ~1700-1725 cm⁻¹; più alto dei chetoni coniugati. Falsi amici: estere coniugato, acido carbossilico.",
  "Saturated ketone C=O stretching (for example cyclohexanone), strong and sharp, ~1700-1725 cm⁻¹; higher than conjugated ketones. False friends: conjugated ester, carboxylic acid."),
 "co.aryl_ketone": (
  "Questo picco intenso viene dal carbonile di un chetone legato a un anello. Altri gruppi cadono vicino, quindi da solo non basta.",
  "This intense peak comes from the carbonyl of a ketone attached to a ring. Other groups fall nearby, so it is not enough alone.",
  "Stiramento C=O di aril-chetone (catinoni), forte e stretto, ~1660-1700 cm⁻¹; la finestra è larga perché polimorfi diversi cadono a posizioni diverse. Falsi amici: ammidi, caffeina, lidocaina.",
  "Aryl ketone (cathinones) C=O stretching, strong and sharp, ~1660-1700 cm⁻¹; the window is wide because polymorphs fall at different positions. False friends: amides, caffeine, lidocaine."),
 "co.acid": (
  "Questo picco intenso viene dal carbonile di un acido. Si legge insieme al picco largo dell'O-H dell'acido.",
  "This intense peak comes from the carbonyl of an acid. It is read together with the broad O-H peak of the acid.",
  "Stiramento C=O di acido carbossilico (dimero), forte, ~1680-1730 cm⁻¹; atteso con O-H molto largo ~2500-3300 e wag O-H ~900-960. Falsi amici: estere coniugato, chetone saturo.",
  "Carboxylic acid (dimer) C=O stretching, strong, ~1680-1730 cm⁻¹; expected with very broad O-H at ~2500-3300 and O-H wag at ~900-960. False friends: conjugated ester, saturated ketone."),
 "co.aldehyde": (
  "Questo picco intenso viene dal carbonile di un'aldeide. Si legge insieme ai suoi picchi C-H caratteristici.",
  "This intense peak comes from the carbonyl of an aldehyde. It is read together with its characteristic C-H peaks.",
  "Stiramento C=O di aldeide, forte e stretto, ~1685-1740 cm⁻¹; atteso con il doppietto C-H ~2695-2830. Falso amico: estere saturo.",
  "Aldehyde C=O stretching, strong and sharp, ~1685-1740 cm⁻¹; expected with the C-H doublet at ~2695-2830. False friend: saturated ester."),
}

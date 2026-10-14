"""Explanation texts of the band rules, part 2 (counsellor and chemist levels, Italian and English). See bande_testi_a.py for the format."""
TESTI_B = {
 "co.amide": (
  "Questo picco intenso viene dal carbonile di un'ammide, gruppo presente in molte molecole. Altri gruppi cadono vicino: da solo non basta.",
  "This intense peak comes from the carbonyl of an amide, a group in many molecules. Other groups fall nearby: alone it is not enough.",
  "Stiramento C=O di ammide (ammide I), forte, ~1630-1690 cm⁻¹ (fentanili, caffeina, lidocaina, paracetamolo, cannabinoidi sintetici); più basso dei chetoni. Falsi amici: deformazione dell'acqua, aril-chetone, C=C.",
  "Amide C=O stretching (amide I), strong, ~1630-1690 cm⁻¹ (fentanyls, caffeine, lidocaine, paracetamol, synthetic cannabinoids); lower than ketones. False friends: water bending, aryl ketone, C=C."),
 "amide.ii": (
  "Questo picco viene dal movimento combinato dei legami N-H e C-N di un'ammide. Si legge insieme al picco del carbonile.",
  "This peak comes from the combined motion of the N-H and C-N bonds of an amide. It is read together with the carbonyl peak.",
  "Ammide II (deformazione N-H con stiramento C-N), forte, ~1515-1570 cm⁻¹; atteso con l'ammide I. Mancante nelle ammidi terziarie. Una sola fonte (più NIST). Falsi amici: NO₂ asimmetrico, NH₃⁺.",
  "Amide II (N-H bending with C-N stretching), strong, ~1515-1570 cm⁻¹; expected with amide I. Absent in tertiary amides. A single source (plus NIST). False friends: asymmetric NO₂, NH₃⁺."),
 "cc.alkene": (
  "Questo picco viene da un doppio legame tra due carboni. Spesso è debole e si confonde con altri picchi vicini.",
  "This peak comes from a double bond between two carbons. It is often weak and can be confused with other nearby peaks.",
  "Stiramento C=C di alchene, intensità variabile, ~1620-1680 cm⁻¹; da confermare con =C-H ~3010-3100. Falso amico: ammide I.",
  "Alkene C=C stretching, variable intensity, ~1620-1680 cm⁻¹; to be confirmed by =C-H at ~3010-3100. False friend: amide I."),
 "cn.imine": (
  "Questo picco viene da un doppio legame tra carbonio e azoto. Altri gruppi cadono nella stessa zona.",
  "This peak comes from a double bond between carbon and nitrogen. Other groups fall in the same region.",
  "Stiramento C=N di immina, media, ~1590-1690 cm⁻¹, finestra larga e sovrapposta a C=C e ammide I. Falsi amici: ammide I, C=C.",
  "Imine C=N stretching, medium, ~1590-1690 cm⁻¹, a wide window overlapping C=C and amide I. False friends: amide I, C=C."),
 "h2o.bend": (
  "Questo picco largo può venire da acqua trattenuta dal campione. Non dice quale sostanza ci sia.",
  "This broad peak can come from water held by the sample. It does not say which substance is present.",
  "Deformazione H-O-H dell'acqua adsorbita o di cristallizzazione, ~1610-1650 cm⁻¹, larga; atteso con lo stiramento O-H ~3300-3500. Falsi amici: ammide I, scissoring NH₂.",
  "H-O-H bending of adsorbed or crystal water, ~1610-1650 cm⁻¹, broad; expected with O-H stretching at ~3300-3500. False friends: amide I, NH₂ scissoring."),
 "nh2.scissoring": (
  "Questo picco largo viene dal movimento a forbice di un gruppo NH2. Si legge insieme ai picchi N-H più in alto.",
  "This broad peak comes from the scissoring motion of an NH2 group. It is read together with the N-H peaks higher up.",
  "Scissoring NH₂ di ammina primaria, media e larga, ~1560-1650 cm⁻¹; atteso con le due bande N-H ~3250-3510. Falsi amici: acqua, ammide I.",
  "NH₂ scissoring of a primary amine, medium and broad, ~1560-1650 cm⁻¹; expected with the two N-H bands at ~3250-3510. False friends: water, amide I."),
 "nh3plus.bend": (
  "Questi picchi deboli, spesso due, vengono dalla flessione di un gruppo con carica positiva sull'azoto, nei sali di ammine primarie.",
  "These weak peaks, often two, come from the bending of a group with a positive charge on nitrogen, in primary amine salts.",
  "Deformazioni NH₃⁺ di sale d'ammina primaria, deboli, spesso due, ~1500-1625 cm⁻¹; attese con l'inviluppo N-H⁺ ~2800-3200. Falsi amici: anello ~1600, ammide II.",
  "NH₃⁺ bends of a primary amine salt, weak, often two, ~1500-1625 cm⁻¹; expected with the N-H⁺ envelope at ~2800-3200. False friends: ring ~1600, amide II."),
 "nh2plus.bend": (
  "Questo picco debole viene dalla flessione di un gruppo con carica positiva sull'azoto. Si trova nei sali di ammine secondarie.",
  "This weak peak comes from the bending of a group with a positive charge on the nitrogen. It is found in secondary amine salts.",
  "Deformazione NH₂⁺ di sale d'ammina secondaria, una banda debole, ~1560-1620 cm⁻¹; attesa con l'inviluppo N-H⁺. Una sola fonte. Falso amico: anello ~1600.",
  "NH₂⁺ bend of a secondary amine salt, one weak band, ~1560-1620 cm⁻¹; expected with the N-H⁺ envelope. A single source. False friend: ring ~1600."),
 "carboxylate.asym": (
  "Questo picco largo viene dal gruppo carbossilato, la forma carica di un acido. Si legge insieme a un picco più in basso.",
  "This broad peak comes from the carboxylate group, the charged form of an acid. It is read together with a peak lower down.",
  "Stiramento asimmetrico COO⁻, forte e largo, ~1550-1610 cm⁻¹; atteso con lo stiramento simmetrico ~1300-1420. Falso amico: NO₂ asimmetrico.",
  "Asymmetric COO⁻ stretching, strong and broad, ~1550-1610 cm⁻¹; expected with the symmetric stretch at ~1300-1420. False friend: asymmetric NO₂."),
 "carboxylate.sym": (
  "Questo picco largo viene dal gruppo carbossilato, la forma carica di un acido. Si legge insieme a un picco più in alto.",
  "This broad peak comes from the carboxylate group, the charged form of an acid. It is read together with a peak higher up.",
  "Stiramento simmetrico COO⁻, medio e largo, ~1300-1420 cm⁻¹; atteso con quello asimmetrico ~1550-1610. Regola da usare solo con un candidato. Falso amico: ombrello del CH₃.",
  "Symmetric COO⁻ stretching, medium and broad, ~1300-1420 cm⁻¹; expected with the asymmetric stretch at ~1550-1610. Rule to be used with a candidate only. False friend: CH₃ umbrella."),
 "ring.c_c_1600": (
  "Questo picco viene dal movimento dei legami dell'anello aromatico. Mostra un anello, non quale sostanza sia.",
  "This peak comes from the motion of the bonds of the aromatic ring. It shows a ring, not which substance it is.",
  "Stiramento C=C dell'anello aromatico, intensità variabile, ~1580-1620 cm⁻¹; regola da usare solo con un candidato. Falsi amici: deformazione NH₂⁺, C=N.",
  "Aromatic ring C=C stretching, variable intensity, ~1580-1620 cm⁻¹; rule to be used with a candidate only. False friends: NH₂⁺ bend, C=N."),
 "ring.c_c_1500": (
  "Questo picco viene dal movimento dei legami dell'anello aromatico. Mostra un anello, non quale sostanza sia.",
  "This peak comes from the motion of the bonds of the aromatic ring. It shows a ring, not which substance it is.",
  "Stiramento C=C dell'anello aromatico, intensità variabile, ~1440-1515 cm⁻¹; regola da usare solo con un candidato. Falso amico: scissoring del CH₂.",
  "Aromatic ring C=C stretching, variable intensity, ~1440-1515 cm⁻¹; rule to be used with a candidate only. False friend: CH₂ scissoring."),
 "no2.stretch_asym": (
  "Questo picco intenso viene da un gruppo nitro (un azoto con due ossigeni). Si legge insieme a un secondo picco del gruppo.",
  "This intense peak comes from a nitro group (a nitrogen with two oxygens). It is read together with a second peak of the group.",
  "Stiramento asimmetrico NO₂, forte, ~1485-1560 cm⁻¹ (nitazeni con 5-nitro); atteso con quello simmetrico ~1290-1390. Falsi amici: ammide II, carbossilato.",
  "Asymmetric NO₂ stretching, strong, ~1485-1560 cm⁻¹ (5-nitro nitazenes); expected with the symmetric stretch at ~1290-1390. False friends: amide II, carboxylate."),
 "no2.stretch_sym": (
  "Questo picco intenso viene da un gruppo nitro (un azoto con due ossigeni). Si legge insieme a un secondo picco del gruppo.",
  "This intense peak comes from a nitro group (a nitrogen with two oxygens). It is read together with a second peak of the group.",
  "Stiramento simmetrico NO₂, forte, ~1290-1390 cm⁻¹; atteso con quello asimmetrico ~1485-1560. Falsi amici: ombrello del CH₃, nitrato inorganico.",
  "Symmetric NO₂ stretching, strong, ~1290-1390 cm⁻¹; expected with the asymmetric stretch at ~1485-1560. False friends: CH₃ umbrella, inorganic nitrate."),
 "ch2.scissoring": (
  "Questo picco viene dalla flessione a forbice dei due idrogeni di un gruppo CH2. Quasi tutte le molecole con catene ne hanno uno.",
  "This peak comes from the scissoring bend of the two hydrogens of a CH2 group. Almost all molecules with chains have one.",
  "Scissoring del CH₂, medio e stretto, ~1445-1485 cm⁻¹; poco diagnostico da solo. Falsi amici: C=C dell'anello ~1500, deformazione asimmetrica del CH₃.",
  "CH₂ scissoring, medium and sharp, ~1445-1485 cm⁻¹; of little diagnostic value on its own. False friends: ring C=C ~1500, asymmetric CH₃ bend."),
 "ch3.bend_asym": (
  "Questo picco viene dalla flessione dei legami C-H di un gruppo metile. Quasi tutte le molecole organiche ne hanno uno.",
  "This peak comes from the bending of the C-H bonds of a methyl group. Almost all organic molecules have one.",
  "Deformazione asimmetrica del CH₃, media, ~1430-1470 cm⁻¹, sovrapposta allo scissoring del CH₂; regola da usare solo con un candidato.",
  "Asymmetric CH₃ bend, medium, ~1430-1470 cm⁻¹, overlapping the CH₂ scissoring; rule to be used with a candidate only."),
 "ch3.umbrella": (
  "Questo picco viene dalla flessione «a ombrello» di un gruppo metile. Quasi tutte le molecole organiche ne hanno uno.",
  "This peak comes from the «umbrella» bend of a methyl group. Almost all organic molecules have one.",
  "Deformazione simmetrica (ombrello) del CH₃, media, ~1365-1385 cm⁻¹. Falso amico: NO₂ simmetrico.",
  "Symmetric CH₃ bend (umbrella), medium, ~1365-1385 cm⁻¹. False friend: symmetric NO₂."),
 "carbonate.stretch": (
  "Questo picco largo e intenso viene da un carbonato, un sale minerale, e non da una molecola organica. Si trova in alcuni tagli.",
  "This broad, intense peak comes from a carbonate, a mineral salt, and not from an organic molecule. It is found in some cutting agents.",
  "Stiramento asimmetrico CO₃²⁻, forte e largo, ~1400-1510 cm⁻¹ (carbonato di calcio, bicarbonato); atteso con la banda ~850-885 e senza C-H. Falso amico: scissoring del CH₂.",
  "Asymmetric CO₃²⁻ stretching, strong and broad, ~1400-1510 cm⁻¹ (calcium carbonate, bicarbonate); expected with the band at ~850-885 and without C-H. False friend: CH₂ scissoring."),
 "carbonate.oop": (
  "Questo picco viene da un carbonato, un sale minerale. Si legge insieme a un picco più largo vicino a 1400.",
  "This peak comes from a carbonate, a mineral salt. It is read together with a broader peak near 1400.",
  "Deformazione fuori piano di CO₃²⁻, media e stretta, ~850-885 cm⁻¹; attesa con la banda ~1400-1510. Falso amico: C-H fuori piano dei para-disostituiti.",
  "Out-of-plane bending of CO₃²⁻, medium and sharp, ~850-885 cm⁻¹; expected with the band at ~1400-1510. False friend: out-of-plane C-H of para-disubstituted rings."),
 "nitrate.stretch": (
  "Questo picco largo e intenso viene da un nitrato, un sale minerale. Si trova in alcuni sali e tagli.",
  "This broad, intense peak comes from a nitrate, a mineral salt. It is found in some salts and cutting agents.",
  "Stiramento asimmetrico NO₃⁻, forte e largo, ~1340-1400 cm⁻¹. Falso amico: NO₂ simmetrico dei composti nitro.",
  "Asymmetric NO₃⁻ stretching, strong and broad, ~1340-1400 cm⁻¹. False friend: symmetric NO₂ of nitro compounds."),
 "c_o.aryl_ether": (
  "Questo picco intenso viene dal legame tra un anello e un ossigeno (etere con un anello). Altri gruppi cadono nella stessa zona.",
  "This intense peak comes from the bond between a ring and an oxygen (an ether on a ring). Other groups fall in the same region.",
  "Stiramento asimmetrico C-O dell'etere arilico, forte e stretto, ~1200-1300 cm⁻¹ (metilendiossi ~1244); finestra larga. Falsi amici: C-C-O degli esteri aromatici, C-N aromatico.",
  "Asymmetric C-O stretching of an aryl ether, strong and sharp, ~1200-1300 cm⁻¹ (methylenedioxy ~1244); a wide window. False friends: C-C-O of aromatic esters, aromatic C-N."),
 "c_c_o.ester.arom": (
  "Questo picco intenso viene da un legame dell'estere attaccato a un anello. Si legge con il picco del carbonile.",
  "This intense peak comes from a bond of the ester attached to a ring. It is read with the carbonyl peak.",
  "Stiramento asimmetrico C-C-O di estere aromatico, forte, ~1250-1310 cm⁻¹; atteso con il C=O coniugato ~1700-1730. Una sola fonte. Falso amico: etere arilico.",
  "Asymmetric C-C-O stretching of an aromatic ester, strong, ~1250-1310 cm⁻¹; expected with conjugated C=O at ~1700-1730. A single source. False friend: aryl ether."),
 "c_c_o.ester.sat": (
  "Questo picco intenso viene da un legame dell'estere. Si legge con il picco del carbonile.",
  "This intense peak comes from a bond of the ester. It is read with the carbonyl peak.",
  "Stiramento asimmetrico C-C-O di estere saturo, forte, ~1160-1250 cm⁻¹ (acetati ~1230-1240, cocaina ~1265-1275); atteso con C=O ~1725-1755; regola da usare solo con un candidato. Una sola fonte. Falso amico: C-O degli alcoli.",
  "Asymmetric C-C-O stretching of a saturated ester, strong, ~1160-1250 cm⁻¹ (acetates ~1230-1240, cocaine ~1265-1275); expected with C=O at ~1725-1755; rule to be used with a candidate only. A single source. False friend: alcohol C-O."),
 "o_c_c.ester": (
  "Questo picco intenso viene da un altro legame dell'estere, in basso nello spettro. Si legge con il picco del carbonile.",
  "This intense peak comes from another bond of the ester, low in the spectrum. It is read with the carbonyl peak.",
  "Stiramento O-C-C di estere, forte, ~1030-1130 cm⁻¹ (cocaina ~1105); atteso con C=O ~1700-1755; regola da usare solo con un candidato. Una sola fonte. Falso amico: C-O degli alcoli.",
  "O-C-C stretching of an ester, strong, ~1030-1130 cm⁻¹ (cocaine ~1105); expected with C=O at ~1700-1755; rule to be used with a candidate only. A single source. False friend: alcohol C-O."),
 "c_o.phenol": (
  "Questo picco intenso viene dal legame tra un anello e un gruppo O-H (fenolo). Si legge con il picco largo dell'O-H.",
  "This intense peak comes from the bond between a ring and an O-H group (phenol). It is read with the broad O-H peak.",
  "Stiramento C-O del fenolo, forte e stretto, ~1200-1260 cm⁻¹ (paracetamolo ~1224); atteso con O-H legato a idrogeno; regola da usare solo con un candidato. Falso amico: etere arilico.",
  "Phenol C-O stretching, strong and sharp, ~1200-1260 cm⁻¹ (paracetamol ~1224); expected with hydrogen-bonded O-H; rule to be used with a candidate only. False friend: aryl ether."),
 "c_o.alcohol": (
  "Questo picco intenso e largo viene dal legame C-O di alcoli e zuccheri. Molte sostanze ne hanno, quindi da solo non basta.",
  "This intense, broad peak comes from the C-O bond of alcohols and sugars. Many substances have one, so it is not enough alone.",
  "Stiramento C-O di alcoli e polialcoli, forte, ~1000-1210 cm⁻¹ (zuccheri 1000-1150, mannitolo ~1017); atteso con O-H legato a idrogeno. Falsi amici: esteri, solfati, silicati.",
  "C-O stretching of alcohols and polyols, strong, ~1000-1210 cm⁻¹ (sugars 1000-1150, mannitol ~1017); expected with hydrogen-bonded O-H. False friends: esters, sulfates, silicates."),
 "c_o_c.ether": (
  "Questo picco intenso viene da un ossigeno tra due carboni (etere). Altri gruppi cadono nella stessa zona.",
  "This intense peak comes from an oxygen between two carbons (an ether). Other groups fall in the same region.",
  "Stiramento asimmetrico C-O-C di etere, forte e stretto, ~1050-1150 cm⁻¹; regola da usare solo con un candidato. Falso amico: C-O degli alcoli.",
  "Asymmetric C-O-C stretching of an ether, strong and sharp, ~1050-1150 cm⁻¹; rule to be used with a candidate only. False friend: alcohol C-O."),
 "cn.aromatic_amine": (
  "Questo picco di media intensità viene dal legame tra un anello e un azoto. Altri gruppi cadono nella stessa zona.",
  "This medium-intensity peak comes from the bond between a ring and a nitrogen. Other groups fall in the same region.",
  "Stiramento C-N di ammina aromatica, medio, ~1250-1360 cm⁻¹; regola da usare solo con un candidato. Falso amico: etere arilico.",
  "Aromatic amine C-N stretching, medium, ~1250-1360 cm⁻¹; rule to be used with a candidate only. False friend: aryl ether."),
 "cn.aliphatic_amine": (
  "Questo picco debole viene dal legame tra un carbonio e un azoto. Cade in una zona affollata.",
  "This weak peak comes from the bond between a carbon and a nitrogen. It falls in a crowded region.",
  "Stiramento C-N di ammina alifatica, debole, ~1020-1250 cm⁻¹, in una zona affollata; regola da usare solo con un candidato. Falso amico: C-O degli alcoli.",
  "Aliphatic amine C-N stretching, weak, ~1020-1250 cm⁻¹, in a crowded region; rule to be used with a candidate only. False friend: alcohol C-O."),
 "o_ch2_o.c_o": (
  "Questo picco viene da un anello con due ossigeni uniti da un CH2 (metilendiossi). Da solo non basta: conta l'insieme di tre picchi.",
  "This peak comes from a ring with two oxygens joined by a CH2 (methylenedioxy). It is not enough alone: the set of three peaks matters.",
  "Stiramento C-O dell'O-CH₂-O, medio, ~1030-1055 cm⁻¹; atteso con l'etere arilico ~1244 e la banda dell'anello ~930 (la tripletta insieme, mai una banda sola). Falso amico: C-O degli alcoli.",
  "C-O stretching of O-CH₂-O, medium, ~1030-1055 cm⁻¹; expected with the aryl ether at ~1244 and the ring band at ~930 (the triplet together, never one band alone). False friend: alcohol C-O."),
 "o_ch2_o.ring": (
  "Questo picco viene da un anello con due ossigeni uniti da un CH2 (metilendiossi). Da solo non basta: conta l'insieme di tre picchi.",
  "This peak comes from a ring with two oxygens joined by a CH2 (methylenedioxy). It is not enough alone: the set of three peaks matters.",
  "Banda dell'anello metilendiossi (deformazione O-CH₂-O), media, ~915-950 cm⁻¹ (~930); atteso con l'etere arilico ~1244 e C-O ~1031. Falso amico: wag O-H dell'acido.",
  "Methylenedioxy ring band (O-CH₂-O bending), medium, ~915-950 cm⁻¹ (~930); expected with the aryl ether at ~1244 and C-O at ~1031. False friend: acid O-H wag."),
 "sulfate.stretch": (
  "Questo picco molto largo e intenso viene da un solfato, un sale minerale. Si trova in alcune forme di sale e in alcuni tagli.",
  "This very broad, intense peak comes from a sulfate, a mineral salt. It is found in some salt forms and in some cutting agents.",
  "Stiramento asimmetrico SO₄²⁻, forte e molto largo, ~1040-1145 cm⁻¹ (anfetamina solfato ~1050); atteso con la deformazione ~600-680; si esclude se ci sono C-H alifatiche intense. Falsi amici: C-O degli alcoli e degli zuccheri, fosfato, silicato.",
  "Asymmetric SO₄²⁻ stretching, strong and very broad, ~1040-1145 cm⁻¹ (amphetamine sulfate ~1050); expected with the bend at ~600-680; excluded when strong aliphatic C-H is present. False friends: alcohol and sugar C-O, phosphate, silicate."),
 "sulfate.bend": (
  "Questi picchi di media intensità vengono da un solfato, un sale minerale. Si leggono insieme al picco largo vicino a 1100.",
  "These medium-intensity peaks come from a sulfate, a mineral salt. They are read together with the broad peak near 1100.",
  "Deformazione di SO₄²⁻, media, spesso doppietto, ~600-680 cm⁻¹; attesa con lo stiramento ~1040-1145.",
  "SO₄²⁻ bending, medium, often a doublet, ~600-680 cm⁻¹; expected with the stretch at ~1040-1145."),
 "phosphate.stretch": (
  "Questo picco molto largo e intenso viene da un fosfato, un sale minerale. Si trova in alcuni tagli.",
  "This very broad, intense peak comes from a phosphate, a mineral salt. It is found in some cutting agents.",
  "Stiramento asimmetrico PO₄³⁻, forte e molto largo, ~1000-1100 cm⁻¹ (fosfato dicalcico). Falsi amici: solfato, silicato.",
  "Asymmetric PO₄³⁻ stretching, strong and very broad, ~1000-1100 cm⁻¹ (dicalcium phosphate). False friends: sulfate, silicate."),
 "silicate.si_o": (
  "Questo picco molto largo e intenso viene da un silicato, un minerale come il talco. Si trova in alcuni tagli.",
  "This very broad, intense peak comes from a silicate, a mineral such as talc. It is found in some cutting agents.",
  "Stiramento asimmetrico Si-O, forte e molto largo, ~950-1200 cm⁻¹ (talco ~1018 in KBr, ~973 in ATR: forte spostamento). Atteso con Mg-OH ~3675. Falsi amici: C-O degli alcoli, solfato.",
  "Asymmetric Si-O stretching, strong and very broad, ~950-1200 cm⁻¹ (talc ~1018 in KBr, ~973 in ATR: a strong shift). Expected with Mg-OH at ~3675. False friends: alcohol C-O, sulfate."),
 "oh.acid_wag": (
  "Questo picco largo viene dal movimento fuori piano dell'O-H di un acido. Si legge insieme ai picchi dell'acido.",
  "This broad peak comes from the out-of-plane motion of the O-H of an acid. It is read together with the peaks of the acid.",
  "Wag O-H fuori piano dell'acido carbossilico (dimero), medio e largo, ~900-960 cm⁻¹; atteso con C=O ~1680-1730 e O-H ~2500-3300; regola da usare solo con un candidato. Falso amico: banda dell'anello metilendiossi.",
  "Out-of-plane O-H wag of the carboxylic acid (dimer), medium and broad, ~900-960 cm⁻¹; expected with C=O at ~1680-1730 and O-H at ~2500-3300; rule to be used with a candidate only. False friend: methylenedioxy ring band."),
 "oop.124": (
  "Questi picchi intensi vengono dalla flessione fuori piano dei C-H di un anello con tre sostituenti. Da soli non bastano.",
  "These intense peaks come from the out-of-plane bending of the C-H bonds of a ring with three substituents. They are not enough alone.",
  "C-H fuori piano del benzene 1,2,4-trisostituito, forte, ~790-900 cm⁻¹; una sola fonte (LibreTexts, che riproduce Sigma-Aldrich), regola dalla sola letteratura finché non verificata su spettri. Solo con un candidato. Falsi amici: para-disostituito, carbonato.",
  "Out-of-plane C-H of 1,2,4-trisubstituted benzene, strong, ~790-900 cm⁻¹; a single source (LibreTexts, reproducing Sigma-Aldrich), literature only until verified on spectra. Candidate only. False friends: para-disubstituted, carbonate."),
 "oop.para": (
  "Questo picco intenso viene dalla flessione fuori piano dei C-H di un anello con due sostituenti opposti. Da solo non basta.",
  "This intense peak comes from the out-of-plane bending of the C-H bonds of a ring with two opposite substituents. It is not enough alone.",
  "C-H fuori piano del benzene para-disostituito, forte e stretto, ~790-860 cm⁻¹ (4-MMC ~833); solo con un candidato. Falso amico: 1,2,4-trisostituito.",
  "Out-of-plane C-H of para-disubstituted benzene, strong and sharp, ~790-860 cm⁻¹ (4-MMC ~833); candidate only. False friend: 1,2,4-trisubstituted."),
 "oop.meta": (
  "Questo picco intenso viene dalla flessione fuori piano dei C-H di un anello con due sostituenti in posizione intermedia. Da solo non basta.",
  "This intense peak comes from the out-of-plane bending of ring C-H bonds when two substituents sit in a middle position. Alone it is not enough.",
  "C-H fuori piano del benzene meta-disostituito, forte e stretto, ~750-810 cm⁻¹; la terza banda cade a ~690 o ~880 secondo le fonti. Solo con un candidato. Falso amico: monosostituito.",
  "Out-of-plane C-H of meta-disubstituted benzene, strong and sharp, ~750-810 cm⁻¹; the third band falls at ~690 or ~880 depending on the source. Candidate only. False friend: monosubstituted."),
 "oop.ortho": (
  "Questo picco intenso viene dalla flessione fuori piano dei C-H di un anello con due sostituenti vicini. Da solo non basta.",
  "This intense peak comes from the out-of-plane bending of the C-H bonds of a ring with two neighbouring substituents. It is not enough alone.",
  "C-H fuori piano del benzene orto-disostituito, forte e stretto, ~735-770 cm⁻¹ (ketamina ~772); solo con un candidato. Falso amico: monosostituito.",
  "Out-of-plane C-H of ortho-disubstituted benzene, strong and sharp, ~735-770 cm⁻¹ (ketamine ~772); candidate only. False friend: monosubstituted."),
 "oop.mono": (
  "Questo picco intenso viene dalla flessione fuori piano dei C-H di un anello con un solo sostituente. Si legge con un picco vicino a 700.",
  "This intense peak comes from the out-of-plane bending of ring C-H bonds when the ring has one substituent. Read it with a peak near 700.",
  "C-H fuori piano del benzene monosostituito, forte e stretto, ~710-770 cm⁻¹; atteso con la banda dell'anello ~680-710. Solo con un candidato. Falsi amici: orto- e meta-disostituito.",
  "Out-of-plane C-H of monosubstituted benzene, strong and sharp, ~710-770 cm⁻¹; expected with the ring band at ~680-710. Candidate only. False friends: ortho- and meta-disubstituted."),
 "ring.mono_bend": (
  "Questo picco intenso viene dalla flessione dell'anello di un benzene con un solo sostituente. Si legge con un picco poco sopra.",
  "This intense peak comes from the ring bending of a benzene with a single substituent. It is read with a peak just above.",
  "Deformazione dell'anello del benzene monosostituito, forte e stretta, ~680-710 cm⁻¹; attesa con l'oop ~710-770. Solo con un candidato. Falso amico: deformazione del solfato.",
  "Ring bend of monosubstituted benzene, strong and sharp, ~680-710 cm⁻¹; expected with the out-of-plane band at ~710-770. Candidate only. False friend: sulfate bending."),
 "ch2.rocking": (
  "Questo picco di media intensità viene dal dondolio di una catena di gruppi CH2. Si trova in oli e paraffine.",
  "This medium-intensity peak comes from the rocking of a chain of CH2 groups. It is found in oils and paraffins.",
  "Rocking del CH₂ in catena lunga, medio, ~715-750 cm⁻¹; atteso con le C-H del metilene. Solo con un candidato. Falso amico: C-H fuori piano del benzene monosostituito.",
  "CH₂ rocking in a long chain, medium, ~715-750 cm⁻¹; expected with the methylene C-H bands. Candidate only. False friend: out-of-plane C-H of monosubstituted benzene."),
 "c_cl.aliphatic": (
  "Questo picco intenso, in una zona molto affollata, può venire da un legame tra carbonio e cloro. Da solo non basta.",
  "This intense peak, in a very crowded region, can come from a bond between carbon and chlorine. It is not enough alone.",
  "Stiramento C-Cl alifatico, forte, ~550-850 cm⁻¹, finestra molto larga; solo con un candidato. Falsi amici: C-H fuori piano del benzene.",
  "Aliphatic C-Cl stretching, strong, ~550-850 cm⁻¹, a very wide window; candidate only. False friends: out-of-plane C-H of benzene."),
}

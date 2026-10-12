# Sicurezza
## Segnalare una vulnerabilità
Usa la segnalazione privata di GitHub: scheda **Security** del repository → **Report a vulnerability**. Non aprire una issue pubblica. Risponderemo con una prima valutazione e, se confermata, con una correzione e un avviso.

## Cosa copre
Il sito è statico: tutto gira nel browser e nessun file dell'utente viene inviato. Rientrano nel perimetro la pagina (CSP, service worker), il motore `.wasm`, i lettori di file e le dipendenze.

## Versioni
Si corregge l'ultima versione pubblicata.

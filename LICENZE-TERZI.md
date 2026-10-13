# Componenti di terzi
Ogni componente incluso nel sito o nel motore, con la sua licenza. Si aggiorna quando cambia `Cargo.lock` o `package-lock.json`; `cargo-deny` (job `deny`) controlla le licenze delle dipendenze Rust. I testi completi delle licenze vanno anche dentro il sito quando un componente li richiede.

## Motore (Rust, compilato in .wasm)
| Componente | Licenza | Uso |
|---|---|---|
| wasm-bindgen e crate collegati | MIT OR Apache-2.0 | ponte tra pagina e motore |

## Pagina
Nessun componente di terzi: moduli ES scritti nel progetto, senza bundler. Le icone di `web/icons.svg` sono disegnate nel progetto (nessuna icona di terzi).

## Solo sviluppo e test (non nel sito)
| Componente | Licenza | Uso |
|---|---|---|
| axe-core | MPL-2.0 | controlli di accessibilità nei test |
| Playwright | Apache-2.0 | test nel browser |
| TypeScript | Apache-2.0 | controllo dei tipi JSDoc (`tsc`) |

## Librerie spettrali
Nessuna libreria di terzi nel repository. Quelle usate dal sito arrivano con una voce per ente: licenza, condizioni di redistribuzione e attribuzione, da definire nel pacchetto dati.

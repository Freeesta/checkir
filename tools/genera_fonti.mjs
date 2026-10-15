// Writes site/bands/sources.json: the shared sources and those of each substance in one file, read by the card of the peak.
import { mkdir, writeFile } from "node:fs/promises";
import { loadSources } from "./unisci_dati.mjs";

const root = new URL("../", import.meta.url);
await mkdir(new URL("site/bands/", root), { recursive: true });
await writeFile(new URL("site/bands/sources.json", root), JSON.stringify({ schema: "sources/1", sources: await loadSources(new URL("data/", root)) }));

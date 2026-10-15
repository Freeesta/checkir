// Libraries of the built site in the tests. Most scenarios use a synthetic library and expect that only `swgdrug-ir`
// (plus the demo library they switch on) takes part in the comparison; the others that are on by default are switched
// off in the browser by `quiet`, unless a context is created with `{ allLibraries: true }` (the library scenarios).
const CORE = new Set(["swgdrug-ir", "checkir-demo"]);

async function published(base) {
  return (await (await fetch(new URL("librerie/libraries.json", base))).json()).libraries;
}

/** Header count "N · M" (active libraries · spectra): those on by default (only the core ones unless `all`), plus the demo library. */
export async function chipCount(base, { withDemo = false, all = false } = {}) {
  const on = (await published(base)).filter((l) => (withDemo && l.id === "checkir-demo") || (l.enabled && (all || CORE.has(l.id))));
  return `${on.length} · ${on.reduce((n, l) => n + l.spectra, 0)}`;
}

/** The browser with `newContext` switching off the public libraries that are not core ones, unless `allLibraries` is set. */
export function quiet(browser, base) {
  const open = browser.newContext.bind(browser);
  browser.newContext = async ({ allLibraries, ...options } = {}) => {
    const ctx = await open(options);
    if (!allLibraries) {
      const off = (await published(base)).filter((l) => l.enabled && !CORE.has(l.id)).map((l) => `checkir.libsw.${l.id}`);
      await ctx.addInitScript((keys) => { try { for (const k of keys) localStorage.setItem(k, "0"); } catch { /* storage unavailable */ } }, off);
    }
    return ctx;
  };
  return browser;
}

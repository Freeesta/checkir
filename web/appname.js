// @ts-check
/** The only place where the visible product name is written (display spelling). */
export const APP_NAME = "checkIR";
/** The only place where the repository is written: GitHub owner (user or organisation) and name. A transfer changes these two lines. */
export const REPO_OWNER = "Freeesta";
export const REPO_NAME = "checkir";
/** Base of the project on GitHub (text; followed only on click). */
export const GITHUB_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/`;
/** Public address of the site (GitHub Pages of the repository): absolute URLs of the social preview are built from it. */
const PAGES_HOST = REPO_OWNER.toLowerCase() + ".github.io";
export const SITE_URL = `https://${PAGES_HOST}/${REPO_NAME}/`;
/** Technical identifier: prefix of the service-worker cache and of every name stored in the browser. Decided once, never renamed. */
export const APP_ID = "checkir";
/** Prefix of every name stored in the browser (localStorage). */
export const STORAGE_PREFIX = APP_ID + ".";

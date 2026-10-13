// Synthetic JCAMP-DX file whose metadata are "canaries": values that identify a person, a computer or a moment.
// None of them may ever leave the page (network) or stay in it (browser storage, exported files).
export const CANARIES = {
  sample: "CANARIO-CAMPIONE-7Q",
  path: "C:\\Users\\CANARIO\\Desktop\\Spettri",
  operator: "CANARIO-OPERATORE",
  serial: "CANARIO-SERIALE-9Z",
  date: "2031-07-19",
  time: "13:47:31",
  fileName: "CANARIO-FILE.jdx",
};

/** Every string to look for (case-insensitive). */
export const CANARY_STRINGS = [CANARIES.sample, CANARIES.path, "CANARIO", CANARIES.serial, CANARIES.date, CANARIES.time, "19/07/2031"];

/** A small valid JCAMP-DX (XYDATA, 5 points) carrying the canaries in the usual instrument fields. */
export function canaryJcamp() {
  const ys = [0.1, 0.35, 0.8, 0.35, 0.1];
  return [
    `##TITLE=${CANARIES.sample}`,
    "##JCAMP-DX=4.24",
    "##DATA TYPE=INFRARED SPECTRUM",
    `##ORIGIN=${CANARIES.operator}`,
    `##OWNER=${CANARIES.operator}`,
    `##LONG DATE=${CANARIES.date} ${CANARIES.time}`,
    `##SOURCE REFERENCE=${CANARIES.path}\\${CANARIES.fileName}`,
    `##SPECTROMETER/DATA SYSTEM=Scan on IRSpirit, SNO: ${CANARIES.serial}`,
    "##XUNITS=1/CM",
    "##YUNITS=ABSORBANCE",
    "##FIRSTX=4000",
    "##LASTX=3996",
    "##NPOINTS=5",
    "##FIRSTY=0.1",
    "##XYDATA=(X++(Y..Y))",
    `4000 ${ys.join(" ")}`,
    "##END=",
    "",
  ].join("\n");
}

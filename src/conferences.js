// Static mapping from CONF.CSV (CGID -> CNAM)
// CNAM is trimmed to avoid trailing-space issues (e.g., "MEAC ").
export const CONFERENCES_BY_CGID = Object.freeze({
  "0": "ACC",
  "1": "Big Ten",
  "2": "Big 12",
  "3": "American",
  "4": "CUSA",
  "5": "Independent",
  "6": "Ivy League",
  "7": "MAC",
  "8": "MEAC",
  "9": "Mt West",
  "10": "PAC",
  "11": "SEC",
  "12": "SWAC",
  "13": "Sun Belt",
  "14": "WAC",
  "15": "Historic",
  "16": "Mascots",
  "17": "Generic",
  "18": "CAA",
  "19": "Big Sky",
  "20": "Missouri Valley",
  "21": "Southern",
  "22": "Southland",
  "23": "Ohio Valley",
  "24": "Patriot League",
});

export function getConferenceName(cgid) {
  const key = String(cgid ?? "").trim();
  return CONFERENCES_BY_CGID[key] || `Unknown (CGID ${key || "?"})`;
}

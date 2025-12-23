import { db } from "./db";

const BASE_PATH = import.meta.env?.BASE_URL || "/";
const QUOTES_URL = new URL("coach_quotes.txt", `${window.location.origin}${BASE_PATH}`).toString();
let cachedQuotes = null;
let loadPromise = null;

async function loadCoachQuotes() {
  if (cachedQuotes) return cachedQuotes;
  if (!loadPromise) {
    loadPromise = (async () => {
      const res = await fetch(QUOTES_URL, { cache: "force-cache" });
      if (!res.ok) throw new Error("Failed to load coach quotes.");
      const text = await res.text();
      const quotes = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      cachedQuotes = quotes;
      return quotes;
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

function pickRandomQuote(quotes) {
  if (!quotes?.length) return "";
  const idx = Math.floor(Math.random() * quotes.length);
  return quotes[idx] || "";
}

export async function getOrCreateCoachQuote({ dynastyId, ccid }) {
  if (!dynastyId || !ccid) return "";

  const coachKey = [dynastyId, String(ccid)];
  const existing = await db.coachQuotes.get(coachKey);
  if (existing?.quote) return existing.quote;

  let quotes = [];
  try {
    quotes = await loadCoachQuotes();
  } catch {
    return "";
  }

  const quote = pickRandomQuote(quotes);
  if (!quote) return "";

  await db.coachQuotes.put({ dynastyId, ccid: String(ccid), quote });
  return quote;
}

export async function ensureCoachQuotesForSeason({ dynastyId, coachIds }) {
  if (!dynastyId || !coachIds?.length) return;

  let quotes = [];
  try {
    quotes = await loadCoachQuotes();
  } catch {
    return;
  }

  if (!quotes.length) return;

  const uniqueIds = Array.from(new Set(coachIds.map((id) => String(id)).filter(Boolean)));
  if (!uniqueIds.length) return;

  const keys = uniqueIds.map((id) => [dynastyId, id]);
  const existing = await db.coachQuotes.bulkGet(keys);

  const toCreate = [];
  for (let i = 0; i < keys.length; i += 1) {
    if (existing[i]) continue;
    const ccid = keys[i][1];
    const quote = pickRandomQuote(quotes);
    if (!quote) continue;
    toCreate.push({ dynastyId, ccid, quote });
  }

  if (toCreate.length) {
    await db.coachQuotes.bulkPut(toCreate);
  }
}

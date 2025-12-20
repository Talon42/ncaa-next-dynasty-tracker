import Dexie from "dexie";

export const db = new Dexie("dynasty-tracker-v1");

db.version(1).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
});

export async function ensureDefaultDynasty() {
  const existing = await db.dynasties.get("default");
  if (existing) return existing;

  const d = {
    id: "default",
    name: "My Dynasty",
    startYear: 2024,
    currentYear: 2024,
  };

  await db.dynasties.put(d);
  return d;
}

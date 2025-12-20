import Dexie from "dexie";

export const db = new Dexie("dynasty-tracker-v1");

// v1 stores
db.version(1).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
});

// v2 adds settings
db.version(2).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
  settings: "key",
});

const ACTIVE_KEY = "activeDynastyId";

export async function ensureAtLeastOneDynasty() {
  const count = await db.dynasties.count();
  if (count > 0) return;

  const d = {
    id: crypto.randomUUID(),
    name: "My Dynasty",
    startYear: 2024,
    currentYear: 2024,
  };

  await db.dynasties.put(d);
  await db.settings.put({ key: ACTIVE_KEY, value: d.id });
}

export async function listDynasties() {
  await ensureAtLeastOneDynasty();
  return db.dynasties.toArray();
}

export async function getActiveDynastyId() {
  await ensureAtLeastOneDynasty();

  const row = await db.settings.get(ACTIVE_KEY);
  if (row?.value) return row.value;

  const first = await db.dynasties.toCollection().first();
  if (first) {
    await db.settings.put({ key: ACTIVE_KEY, value: first.id });
    return first.id;
  }
  return null;
}

export async function setActiveDynastyId(id) {
  await db.settings.put({ key: ACTIVE_KEY, value: id });
}

export async function createDynasty({ name, startYear }) {
  const yr = Number(startYear);
  if (!name?.trim()) throw new Error("Dynasty name is required.");
  if (!Number.isFinite(yr)) throw new Error("Start year must be a number.");

  const d = {
    id: crypto.randomUUID(),
    name: name.trim(),
    startYear: yr,
    currentYear: yr,
  };

  await db.dynasties.put(d);
  await setActiveDynastyId(d.id);
  return d;
}

export async function getDynasty(id) {
  return db.dynasties.get(id);
}

export async function deleteDynasty(dynastyId) {
  // Delete dynasty + all data scoped to it
  await db.transaction("rw", db.dynasties, db.teams, db.teamSeasons, db.games, db.settings, async () => {
    await db.teams.where({ dynastyId }).delete();
    await db.teamSeasons.where({ dynastyId }).delete();
    await db.games.where({ dynastyId }).delete();
    await db.dynasties.delete(dynastyId);

    // If it was active, pick a new active dynasty (or create one)
    const active = await db.settings.get(ACTIVE_KEY);
    if (active?.value === dynastyId) {
      const remaining = await db.dynasties.toCollection().first();
      if (remaining) {
        await db.settings.put({ key: ACTIVE_KEY, value: remaining.id });
      } else {
        // Ensure there is always at least one dynasty
        const d = {
          id: crypto.randomUUID(),
          name: "My Dynasty",
          startYear: 2024,
          currentYear: 2024,
        };
        await db.dynasties.put(d);
        await db.settings.put({ key: ACTIVE_KEY, value: d.id });
      }
    }
  });
}

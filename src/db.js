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

export async function listDynasties() {
  return db.dynasties.toArray();
}

export async function getActiveDynastyId() {
  const row = await db.settings.get(ACTIVE_KEY);
  const id = row?.value ?? null;
  if (!id) return null;

  const exists = await db.dynasties.get(id);
  if (!exists) return null;

  return id;
}

export async function setActiveDynastyId(idOrNull) {
  if (!idOrNull) {
    await db.settings.put({ key: ACTIVE_KEY, value: null });
    return;
  }
  await db.settings.put({ key: ACTIVE_KEY, value: idOrNull });
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
  if (!id) return null;
  return db.dynasties.get(id);
}

export async function deleteDynasty(dynastyId) {
  await db.transaction("rw", db.dynasties, db.teams, db.teamSeasons, db.games, db.settings, async () => {
    await db.teams.where({ dynastyId }).delete();
    await db.teamSeasons.where({ dynastyId }).delete();
    await db.games.where({ dynastyId }).delete();
    await db.dynasties.delete(dynastyId);

    const active = await db.settings.get(ACTIVE_KEY);
    if (active?.value === dynastyId) {
      // IMPORTANT: no auto-create. Just unset active and let the app show the create splash.
      await db.settings.put({ key: ACTIVE_KEY, value: null });
    }
  });
}

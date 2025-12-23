import Dexie from "dexie";

export const db = new Dexie("dynasty-tracker-v1");

// v1
db.version(1).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
});

// v2 (settings)
db.version(2).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
  settings: "key",
});

// v3 (logos)
db.version(3).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
  settings: "key",

  // Base logos from bundled CSV keyed by normalized team name (global, not per dynasty)
  logoBaseByName: "nameKey",

  // Resolved logo per dynasty + TGID (what schedule will use)
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",

  // Optional manual overrides per dynasty + TGID (future UI)
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
});

// v4 (team stats)
db.version(4).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  games: "[dynastyId+seasonYear+week+homeTgid+awayTgid], dynastyId, seasonYear, week",
  settings: "key",

  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",

  // TSSE season snapshot per team
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
});

// v5 (performance indexes)
db.version(5).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",

  // Add indexes to fetch a team's games without scanning the whole dynasty
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",

  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
});

// v6 (rebuild indexes) — same schema as v5
// NOTE: If you previously deployed a corrupted schema, v7 below forces a rebuild with the corrected schema.
db.version(6).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
});


// v7 (force rebuild with corrected schema) — same schema as v6
db.version(7).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
});


// v8 (postseason bowl metadata)
db.version(8).stores({
  dynasties: "id, name, startYear, currentYear",
  teams: "[dynastyId+tgid], dynastyId, tgid",
  teamSeasons: "[dynastyId+seasonYear+tgid],[dynastyId+tgid], dynastyId, seasonYear, tgid",
  games:
    "[dynastyId+seasonYear+week+homeTgid+awayTgid],[dynastyId+homeTgid],[dynastyId+awayTgid],[dynastyId+seasonYear+homeTgid],[dynastyId+seasonYear+awayTgid], dynastyId, seasonYear, week, homeTgid, awayTgid",
  settings: "key",
  logoBaseByName: "nameKey",
  teamLogos: "[dynastyId+tgid], dynastyId, tgid",
  logoOverrides: "[dynastyId+tgid], dynastyId, tgid",
  teamStats: "[dynastyId+seasonYear+tgid], dynastyId, seasonYear, tgid",
  bowlGames: "[dynastyId+seasonYear+sewn+sgnm], dynastyId, seasonYear, sewn, sgnm",
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
  await db.settings.put({ key: ACTIVE_KEY, value: idOrNull ?? null });
}

export async function createDynasty({ name, startYear }) {
  const yr = Number(startYear);
  if (!name?.trim()) throw new Error("Dynasty name is required.");
  if (!Number.isFinite(yr)) throw new Error("Start year is invalid.");

  const id = crypto.randomUUID();
  await db.dynasties.add({
    id,
    name: name.trim(),
    startYear: yr,
    currentYear: yr,
  });

  await setActiveDynastyId(id);
  return id;
}

export async function getDynasty(id) {
  if (!id) return null;
  return db.dynasties.get(id);
}

export async function deleteDynasty(id) {
  // Delete dynasty itself
  await db.dynasties.delete(id);

  // Delete all related records
  await Promise.all([
    db.teams.where("dynastyId").equals(id).delete(),
    db.teamSeasons.where("dynastyId").equals(id).delete(),
    db.games.where("dynastyId").equals(id).delete(),
    db.teamStats.where("dynastyId").equals(id).delete(),
    db.teamLogos.where("dynastyId").equals(id).delete(),
    db.logoOverrides.where("dynastyId").equals(id).delete(),
    db.bowlGames.where("dynastyId").equals(id).delete(),
  ]);

  const active = await getActiveDynastyId();
  if (active === id) {
    await setActiveDynastyId(null);
  }
}

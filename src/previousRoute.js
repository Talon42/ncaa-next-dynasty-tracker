const STORAGE_KEY = "dt_prev_route";

export function readPreviousRoute() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function writePreviousRoute(route) {
  if (!route) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, route);
  } catch {
    // Ignore storage failures (private mode, disabled storage, etc.)
  }
}

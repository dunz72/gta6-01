// Neon Bay — save game in localStorage: money, mission progress, best score
// (cash earned in one life) and whether the story is finished.

const KEY = 'neonbay-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: typeof data.money === 'number' ? data.money : 0,
      missionIndex: typeof data.missionIndex === 'number' ? data.missionIndex : 0,
      bestScore: typeof data.bestScore === 'number' ? data.bestScore : 0,
      storyDone: !!data.storyDone,
    };
  } catch (_) {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (_) {
    // Storage unavailable (private mode, sandbox) — the game still runs.
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (_) {}
}

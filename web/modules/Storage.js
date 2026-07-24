const SETTINGS_STORAGE_KEY = "clade_game_settings";
const DAILY_SHARE_STORAGE_KEY = "clade_game_daily_share";

const DEFAULT_SETTINGS = {
  // daily stats
  played: 0,
  won: 0,
  currentStreak: 0,
  longestStreak: 0,
  totalPlayed: 0,
  totalWon: 0,
  lastCompletedDailyDate: null,

  // settings
  speciesPoolSize: 2, // Default to Large (Index 2)
  rootTID: 0, // Default to system root TID 0
  theme: "dark",
};

function migrateStorageShape(savedData) {
  if (!savedData || typeof savedData !== "object") {
    return { data: { ...DEFAULT_SETTINGS }, didChange: true };
  }

  const migratedData = {
    ...DEFAULT_SETTINGS,
    ...savedData,
  };

  let didChange = false;
  const isLegacyStatsShape =
    !Object.hasOwn(savedData, "totalPlayed") &&
    Object.hasOwn(savedData, "played");

  if (isLegacyStatsShape) {
    migratedData.totalPlayed = Number.isFinite(savedData.played)
      ? savedData.played
      : 0;
    migratedData.totalWon = Number.isFinite(savedData.won) ? savedData.won : 0;
    migratedData.played = 0;
    migratedData.won = 0;
    migratedData.currentStreak = 0;
    migratedData.longestStreak = 0;
    migratedData.lastCompletedDailyDate = null;
    didChange = true;
  }

  Object.entries(DEFAULT_SETTINGS).forEach(([key, defaultValue]) => {
    if (!Object.hasOwn(migratedData, key) || migratedData[key] == null) {
      migratedData[key] = defaultValue;
      didChange = true;
    }
  });

  return { data: migratedData, didChange };
}

function loadStorage() {
  try {
    const savedData = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    const { data, didChange } = migrateStorageShape(savedData);
    if (didChange) {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data));
    }
    return data;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveGameSettings(speciesPoolSize, rootTID) {
  const savedData = loadStorage();
  savedData.speciesPoolSize = speciesPoolSize;
  savedData.rootTID = rootTID;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(savedData));
}

export function loadGameSettings() {
  const savedData = loadStorage();
  return {
    speciesPoolSize: savedData.speciesPoolSize,
    rootTID: savedData.rootTID,
  };
}

export function saveTheme(theme) {
  const savedData = loadStorage();
  savedData.theme = theme;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(savedData));
}

export function loadTheme() {
  const savedData = loadStorage();
  return savedData.theme;
}

export function saveGameStats(stats) {
  const savedData = loadStorage();
  savedData.played = stats.played;
  savedData.won = stats.won;
  savedData.currentStreak = stats.currentStreak;
  savedData.longestStreak = stats.longestStreak;
  savedData.totalPlayed = stats.totalPlayed;
  savedData.totalWon = stats.totalWon;
  savedData.lastCompletedDailyDate = stats.lastCompletedDailyDate;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(savedData));
}

export function loadGameStats() {
  const savedData = loadStorage();
  return {
    played: savedData.played,
    won: savedData.won,
    currentStreak: savedData.currentStreak,
    longestStreak: savedData.longestStreak,
    totalPlayed: savedData.totalPlayed,
    totalWon: savedData.totalWon,
    lastCompletedDailyDate: savedData.lastCompletedDailyDate,
  };
}

export function saveDailyShareContent(dateKey, content) {
  localStorage.setItem(
    DAILY_SHARE_STORAGE_KEY,
    JSON.stringify({ dateKey, content }),
  );
}

export function loadDailyShareContent(dateKey) {
  if (!dateKey) return "";

  try {
    const savedData = JSON.parse(localStorage.getItem(DAILY_SHARE_STORAGE_KEY));
    return savedData?.dateKey === dateKey ? savedData.content : "";
  } catch {
    return "";
  }
}

export function clearDailyShareContent() {
  localStorage.removeItem(DAILY_SHARE_STORAGE_KEY);
}

export function hasOpenedBefore() {
  const savedData = loadStorage();
  if (savedData.totalPlayed > 0) {
    return true;
  }
  return false;
}

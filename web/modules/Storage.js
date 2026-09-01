const SETTINGS_STORAGE_KEY = "clade_game_settings";
// Holds the share text for the most recently completed daily challenge.
const DAILY_SHARE_STORAGE_KEY = "clade_game_daily_share";
// Holds the active game until it is completed or deliberately restarted.
const IN_PROGRESS_GAME_STORAGE_KEY = "clade_game_in_progress";
// Stores the completed daily run so it can be replayed without changing stats.
const DAILY_GAME_STORAGE_KEY = "clade_game_completed_daily";
// One failure bucket plus one bucket for each possible winning turn count.
const GUESS_DISTRIBUTION_SIZE = 26;

// Return a fresh array so profiles never share a mutable default distribution.
function createEmptyGuessDistribution() {
  return Array(GUESS_DISTRIBUTION_SIZE).fill(0);
}

const DEFAULT_SETTINGS = {
  // daily stats
  played: 0,
  won: 0,
  currentStreak: 0,
  longestStreak: 0,
  totalPlayed: 0,
  totalWon: 0,
  lastCompletedDailyDate: null,
  dailyGuessDistribution: createEmptyGuessDistribution(),
  totalGuessDistribution: createEmptyGuessDistribution(),

  // settings
  speciesPoolSize: 2, // Default to Large (Index 2)
  rootTID: 0, // Default to system root TID 0
  theme: "dark",
};

function createDefaultSettings() {
  return {
    ...DEFAULT_SETTINGS,
    dailyGuessDistribution: createEmptyGuessDistribution(),
    totalGuessDistribution: createEmptyGuessDistribution(),
  };
}

// Reject malformed or stale distribution data before it reaches the UI.
function isValidGuessDistribution(value) {
  return (
    Array.isArray(value) &&
    value.length === GUESS_DISTRIBUTION_SIZE &&
    value.every((count) => Number.isInteger(count) && count >= 0)
  );
}

function migrateStorageShape(savedData) {
  if (!savedData || typeof savedData !== "object") {
    return { data: createDefaultSettings(), didChange: true };
  }

  const migratedData = {
    ...createDefaultSettings(),
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
    if (!Object.hasOwn(savedData, key) || migratedData[key] == null) {
      migratedData[key] = Array.isArray(defaultValue)
        ? createEmptyGuessDistribution()
        : defaultValue;
      didChange = true;
    }
  });

  ["dailyGuessDistribution", "totalGuessDistribution"].forEach((key) => {
    // Existing profiles receive a complete zero-filled distribution on migration.
    if (!isValidGuessDistribution(migratedData[key])) {
      migratedData[key] = createEmptyGuessDistribution();
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
    return createDefaultSettings();
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
  // Copy arrays so storage never retains a reference to mutable game state.
  savedData.dailyGuessDistribution = [...stats.dailyGuessDistribution];
  savedData.totalGuessDistribution = [...stats.totalGuessDistribution];
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
    dailyGuessDistribution: [...savedData.dailyGuessDistribution],
    totalGuessDistribution: [...savedData.totalGuessDistribution],
  };
}

export function saveDailyShareContent(dateKey, content) {
  // Associate the share result with its date to prevent stale daily shares.
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

export function saveInProgressGame(gameData) {
  // Replace the single active-game snapshot after every valid action.
  localStorage.setItem(
    IN_PROGRESS_GAME_STORAGE_KEY,
    JSON.stringify(gameData),
  );
}

export function loadInProgressGame() {
  try {
    const savedData = JSON.parse(
      localStorage.getItem(IN_PROGRESS_GAME_STORAGE_KEY),
    );
    return savedData && typeof savedData === "object" ? savedData : null;
  } catch {
    return null;
  }
}

export function clearInProgressGame() {
  localStorage.removeItem(IN_PROGRESS_GAME_STORAGE_KEY);
}

export function saveCompletedDailyGame(dateKey, gameData) {
  // Only the current daily game is retained; each completed result replaces it.
  localStorage.setItem(
    DAILY_GAME_STORAGE_KEY,
    JSON.stringify({ dateKey, ...gameData }),
  );
}

export function loadCompletedDailyGame(dateKey) {
  try {
    const savedData = JSON.parse(localStorage.getItem(DAILY_GAME_STORAGE_KEY));
    if (savedData?.dateKey !== dateKey) {
      // A prior day's result cannot be replayed as today's daily challenge.
      localStorage.removeItem(DAILY_GAME_STORAGE_KEY);
      return null;
    }

    return savedData;
  } catch {
    return null;
  }
}

export function clearCompletedDailyGame() {
  // Clearing profile statistics must also remove the replayable daily result.
  localStorage.removeItem(DAILY_GAME_STORAGE_KEY);
}

export function hasOpenedBefore() {
  const savedData = loadStorage();
  if (savedData.totalPlayed > 0) {
    return true;
  }
  return false;
}

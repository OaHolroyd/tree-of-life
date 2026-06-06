const SETTINGS_STORAGE_KEY = "clade_game_settings";

const DEFAULT_SETTINGS = {
  // player stats
  played: 0,
  won: 0,
  currentStreak: 0,
  longestStreak: 0,

  // settings
  speciesPoolSize: 1, // Default to Medium (Index 1)
  rootTID: 0, // Default to system root TID 0
};

function loadStorage() {
  return (
    JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)) || DEFAULT_SETTINGS
  );
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

export function saveGameStats(stats) {
  const savedData = loadStorage();
  savedData.played = stats.played;
  savedData.won = stats.won;
  savedData.currentStreak = stats.currentStreak;
  savedData.longestStreak = stats.longestStreak;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(savedData));
}

export function loadGameStats() {
  const savedData = loadStorage();
  return {
    played: savedData.played,
    won: savedData.won,
    currentStreak: savedData.currentStreak,
    longestStreak: savedData.longestStreak,
  };
}

export function hasOpenedBefore() {
  const savedData = loadStorage();
  if (savedData.played > 0) {
    return false;
    return true;
  }
  return false;
}

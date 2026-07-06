import { CLADE_LIST } from "./data/clades.js";
import {
  DAILY_ROOT_TID,
  DAILY_SPECIES_POOL_SIZE,
  Game,
  GameState,
} from "./modules/Game.js";
import { Tree } from "./modules/Tree.js";
import { getSuggestions } from "./modules/Autocomplete.js";
import {
  loadGameSettings,
  saveGameSettings,
  hasOpenedBefore,
  loadTheme,
  saveTheme,
} from "./modules/Storage.js";

// ====================================
//   CONSTANTS AND APP STATE
// ====================================
const AVAILABLE_ROOT_TIDS = [
  0, // Animalia
  6, // Vertebrata
  10, // Tetrapods
  12, // Sauria
  15, // Aves
  39, // Mammalia
  53, // Actinopterygii
  66, // Protostomia
  69, // Arthropoda
  74, // Insecta
];
const IMAGE_ROTATION_PERIOD = 1000;

// clade sheet state
let currentFocusIndex = -1;
let startY = 0;
let livePeekOffset = 0;

// clade inspection state
let activeInspectionID = -1;
let mysteryImageInterval = null;
let currentMysteryImageTID = -1;
let dailyRefreshTimeout = null;
let lastKnownDateKey = "";
let configuredSpeciesPoolSize = DAILY_SPECIES_POOL_SIZE;
let configuredRootTID = DAILY_ROOT_TID;

// Game and core UI state
const game = new Game(-1, 0, 1);
let suggestionList = game.getSpeciesTIDs(true);
const treeUI = new Tree(document.getElementById("tree-container"));

// ====================================
//   DOM ELEMENTS
// ====================================

const rightPanel = document.querySelector(".right-panel");
const guessInput = document.getElementById("guess-input");
const dropdown = document.getElementById("suggestions-dropdown");
const submitBtn = document.getElementById("submit-guess-btn");
const hintBtn = document.getElementById("game-hint-btn");
const restartBtn = document.getElementById("game-restart-btn");
const guessCount = document.getElementById("guesses-count");
const gameModeLabel = document.getElementById("game-mode-label");

const modalOverlay = document.getElementById("game-over-modal");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const restartGameBtn = document.getElementById("restart-btn");

const appHeader = document.querySelector(".app-header");
const controlsSection = document.querySelector(".controls-section");
const cladeCard = document.getElementById("clade-card");
const cardHeader = cladeCard.querySelector(".card-header");
const cladeScroll = document.querySelector(".clade-scroll-content");
const cladeImage = document.getElementById("clade-image");

const faqModal = document.getElementById("faq-modal");
const settingsModal = document.getElementById("settings-modal");
const themeToggleBtn = document.getElementById("nav-theme-btn");
const openSettingsBtn = document.getElementById("nav-settings-btn");
const openFaqBtn = document.getElementById("nav-faq-btn");
const clearDataBtn = document.getElementById("clear-data-btn");
const resetDefaultsBtn = document.getElementById("reset-defaults-btn");
const rootNodeSelect = document.getElementById("root-node-select");
const settingsLockMessage = document.getElementById("settings-lock-message");
const speciesPoolRadios = Array.from(
  document.querySelectorAll('input[name="species-pool"]'),
);

const pwaModal = document.getElementById("pwa-prompt-modal");
const pwaCloseBtn = document.getElementById("close-pwa-prompt-btn");
const pwaInstructions = document.getElementById("pwa-instructions-container");
const nativeInstallBtn = document.getElementById("pwa-native-install-btn");
const themeColorMetaTags = document.querySelectorAll(
  'meta[name="theme-color"]',
);
const backgroundColorMetaTag = document.querySelector(
  'meta[name="background-color"]',
);
const VALID_THEMES = new Set(["dark", "light"]);

function getCurrentDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDailyGamePending() {
  return !game.hasCompletedDailyGame();
}

function updateSettingsLockState() {
  const isLocked = isDailyGamePending();

  speciesPoolRadios.forEach((radio) => {
    radio.disabled = isLocked;
  });
  rootNodeSelect.disabled = isLocked;
  resetDefaultsBtn.disabled = isLocked;

  if (!settingsLockMessage) {
    return;
  }

  settingsLockMessage.textContent = isLocked
    ? "Today's daily challenge uses the large species pool, starting from Animalia. Finish it to change these settings."
    : "Settings apply to games you start after finishing today's daily challenge.";
}

// ====================================
//   GAME INTERACTION FUNCTIONS
// ====================================

/**
 * Restart the game and UI
 * @param {int} tid - if set to -1 it will be chosen at random
 */
function restartGame(tid = -1) {
  guessInput.removeAttribute("disabled", "");
  if (isDailyGamePending()) {
    game.restartDailyGame();
  } else {
    game.restartCustomGame(tid, configuredRootTID, configuredSpeciesPoolSize);
  }

  suggestionList = game.getSpeciesTIDs(true);

  treeUI.reset();
  treeUI.updateTreeLayout(game.getCurrentTree());
  inspectClade(game.getBestTID());

  updateHintButtonState();
  updateGameModeLabel();
  guessCount.innerHTML = game.guessesRemaining;
  updateSettingsLockState();
}

function updateHintButtonState() {
  if (!hintBtn) return;

  hintBtn.innerHTML = `Hint (${game.hint_cost})`;
  hintBtn.disabled = !game.canHint();
}

function updateGameModeLabel() {
  if (!gameModeLabel) return;

  gameModeLabel.textContent = game.isDailyMode() ? "Daily" : "Practice";
}

function handleGuessSubmit() {
  const guess = guessInput.value.trim();

  if (guess === "") {
    console.log("Empty guess submitted. Ignoring.");
    return;
  }

  const [isValid, hasEnded, updatedNodes] = game.submitGuess(guess);
  if (isValid) {
    treeUI.updateTreeLayout(updatedNodes);
  }

  guessCount.innerHTML = game.guessesRemaining;
  updateHintButtonState();

  // Clear the input box for the next guess
  guessInput.value = "";
  hideDropdown();
  guessInput.focus();

  // invalid guess submitted
  if (!isValid) {
    return;
  }

  // guess has ended the game
  if (hasEnded) {
    // prevent further inputs
    guessInput.setAttribute("disabled", "");

    // show the answer in the clade inspector and tree
    inspectClade(game.answer);
    treeUI.revealAnswer(game.tree[game.answer]);

    // prepare popover text
    if (game.state === GameState.WON) {
      modalTitle.textContent = "You win!";
    } else {
      modalTitle.textContent = "Game Over";
    }

    // populate the stats inside the popover
    const currentStats = game.getStats();
    modalMessage.innerHTML = `
      Current Streak: <strong>${currentStats.currentStreak}</strong> |
      Longest Streak: <strong>${currentStats.longestStreak}</strong><br>
      Daily Wins: ${currentStats.won} / ${currentStats.played}<br>
      All Games: ${currentStats.totalWon} / ${currentStats.totalPlayed}
    `;

    // show the popover
    modalOverlay.classList.remove("hidden");
    updateSettingsLockState();
    return;
  }

  // show info for best clade
  inspectClade(game.getBestTID(), false);
}

// ====================================
//   UI FUNCTIONS
// ====================================

function startMysteryImageShuffler() {
  // Clear any existing interval just in case to prevent memory leaks
  if (mysteryImageInterval) {
    clearInterval(mysteryImageInterval);
  }

  // fallback to the root image in case
  currentMysteryImageTID = game.root;

  // start up the rotation through the images
  mysteryImageInterval = setInterval(() => {
    // only do an update if we are inspecting the answer clade
    if (
      activeInspectionID === game.answer &&
      game.state === GameState.PLAYING
    ) {
      // pick a random index (not the previous one)
      let tid = game.getRandomSpeciesTID();
      while (tid === currentMysteryImageTID) {
        tid = game.getRandomSpeciesTID();
      }
      currentMysteryImageTID = tid;

      cladeImage.src = game.tree[currentMysteryImageTID].image;
    }
  }, IMAGE_ROTATION_PERIOD);
}

function updateDropdown() {
  const query = guessInput.value.trim();
  const matches = getSuggestions(query, game.guesses, suggestionList);

  // Reset state
  dropdown.innerHTML = "";
  currentFocusIndex = -1;

  if (matches.length === 0) {
    hideDropdown();
    return;
  }

  // Build suggestion items
  matches.forEach((matchText) => {
    const item = document.createElement("div");
    item.classList.add("suggestion-item");
    item.textContent = matchText;

    // Mouse Click interaction
    item.addEventListener("click", () => {
      guessInput.value = matchText;
      hideDropdown();
      guessInput.focus();
      handleGuessSubmit();
    });

    dropdown.appendChild(item);
  });

  showDropdown();
}

function showDropdown() {
  dropdown.classList.remove("hidden");
}

function hideDropdown() {
  dropdown.classList.add("hidden");
  currentFocusIndex = -1;
}

function setFocusState(items) {
  if (!items || items.length === 0) return;

  // Strip previous active classes
  Array.from(items).forEach((item) => item.classList.remove("active"));

  if (currentFocusIndex >= items.length) currentFocusIndex = 0;
  if (currentFocusIndex < 0) currentFocusIndex = items.length - 1;

  const activeItem = items[currentFocusIndex];
  activeItem.classList.add("active");

  // KEYBOARD SCROLL FIX: Adjusts scroll position if user targets hidden items out of view
  const containerTop = dropdown.scrollTop;
  const containerBottom = containerTop + dropdown.clientHeight;
  const itemTop = activeItem.offsetTop;
  const itemBottom = itemTop + activeItem.clientHeight;

  if (itemTop < containerTop) {
    dropdown.scrollTop = itemTop; // Scroll up
  } else if (itemBottom > containerBottom) {
    dropdown.scrollTop = itemBottom - dropdown.clientHeight; // Scroll down
  }
}

function inspectClade(tid, shouldOpenMobile = false) {
  const clade = CLADE_LIST[tid];
  activeInspectionID = tid;
  if (!clade) return;
  document
    .querySelectorAll(".tree-node")
    .forEach((n) => n.classList.remove("selected"));
  const activeNode = document.getElementById(`node-${tid}`);
  if (activeNode) activeNode.classList.add("selected");

  // hide answer details while playing
  let sci_name = clade.sci_name;
  let com_name = clade.com_name || "No common name";
  let text = clade.text;
  let image = clade.image;
  if (tid === game.answer && game.state === GameState.PLAYING) {
    sci_name = "Mystery animal";
    com_name = "Keep guessing!";
    text = "";

    image = game.tree[currentMysteryImageTID].image;
  }

  document.getElementById("clade-sci-name").textContent = sci_name;
  document.getElementById("clade-com-name").textContent = com_name;
  document.getElementById("clade-text").textContent = text;
  document.getElementById("clade-image").src = image;

  // Only pop the drawer up if we are on mobile AND explicitly allowed to
  if (shouldOpenMobile && window.innerWidth <= 600) {
    cladeCard.classList.add("expanded");
    activateCladeMobileSheet();
  }
}

function recalculateMobileLayout() {
  // If the user resizes to desktop view, clean up mobile-specific inline styles
  if (window.innerWidth > 600) {
    cladeCard.style.removeProperty("--header-height");
    cladeCard.style.removeProperty("--sheet-peek");
    return;
  }

  // 1. Measure the real-time pixel heights of ALL stacking elements
  const navHeaderHeight = appHeader.offsetHeight;
  const guessControlsHeight = controlsSection.offsetHeight;
  const currentCardHeaderHeight = cardHeader.offsetHeight;
  const viewportHeight = window.innerHeight;

  // 2. The maximum workspace space the card can expand inside
  // (Total screen minus the top nav header and the guess input header)
  const cardMaxAvailableHeight =
    viewportHeight - navHeaderHeight - guessControlsHeight;

  // 3. The exact sliding distance down to leave only the card header peeking out
  livePeekOffset = cardMaxAvailableHeight - currentCardHeaderHeight;

  // 4. Inject these precise values directly into the CSS Custom Properties
  cladeCard.style.setProperty(
    "--header-height",
    `${guessControlsHeight + navHeaderHeight}px`,
  );
  cladeCard.style.setProperty("--sheet-peek", `${livePeekOffset}px`);
}

function updateThemeMetaTags() {
  const computedStyle = getComputedStyle(document.body);
  const themeColor = computedStyle.getPropertyValue("--color-surface-header");
  const backgroundColor = computedStyle.getPropertyValue(
    "--color-surface-canvas",
  );

  themeColorMetaTags.forEach((metaTag) => {
    metaTag.setAttribute("content", themeColor.trim());
  });

  if (backgroundColorMetaTag) {
    backgroundColorMetaTag.setAttribute("content", backgroundColor.trim());
  }
}

function updateThemeToggleButton(theme) {
  if (!themeToggleBtn) return;

  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${nextTheme} mode`;
  themeToggleBtn.setAttribute("title", label);
  themeToggleBtn.setAttribute("aria-label", label);
}

function applyTheme(theme) {
  const resolvedTheme = VALID_THEMES.has(theme) ? theme : "dark";
  document.body.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
  updateThemeToggleButton(resolvedTheme);
  updateThemeMetaTags();
}

function toggleModalState(targetModalElement, shouldShow) {
  if (shouldShow) {
    targetModalElement.classList.remove("hidden");
  } else {
    targetModalElement.classList.add("hidden");
  }
}

function blurGuessInput() {
  if (document.activeElement === guessInput) {
    guessInput.blur();
  }
}

function populateSettingsStats() {
  const stats = game.getStats();

  // Calculate the win percentage accurately
  const winRate =
    stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

  // Inject computed stats directly into the text wrapper frames
  document.getElementById("stat-played").textContent = stats.played;
  document.getElementById("stat-winrate").textContent = `${winRate}%`;
  document.getElementById("stat-streak").textContent = stats.currentStreak;
  document.getElementById("stat-max-streak").textContent = stats.longestStreak;
  document.getElementById("stat-total-played").textContent = stats.totalPlayed;
  document.getElementById("stat-total-won").textContent = stats.totalWon;
}

function initializeRootNodeDropdown() {
  const selectElement = document.getElementById("root-node-select");

  // Clear any structural template residuals just in case
  selectElement.innerHTML = "";

  AVAILABLE_ROOT_TIDS.forEach((tid) => {
    // Look up the matching object inside your core taxonomy array
    const node = CLADE_LIST[tid];

    if (node) {
      // Create a brand new option element node
      const option = document.createElement("option");
      option.value = tid;

      // Format the string. Handles cases where common name might be missing
      const displayName = node.com_name
        ? `${node.sci_name} (${node.com_name})`
        : node.sci_name;

      // Append a clear structural note for the default starting profile
      option.textContent = tid === 0 ? `${displayName} (Default)` : displayName;

      // Append the option to our select dropdown menu tree
      selectElement.appendChild(option);
    } else {
      console.warn(
        `Initialization warning: TID ${tid} was not found in CLADE_LIST.`,
      );
    }
  });
}

function saveSettings() {
  const selectElement = document.getElementById("root-node-select");

  // 1. Gather the selected integer index from our species pool radios
  const activeRadio = document.querySelector(
    'input[name="species-pool"]:checked',
  );
  const speciesPoolSize = speciesPoolRadios.indexOf(activeRadio);
  const rootTID = parseInt(selectElement.value, 10);
  configuredSpeciesPoolSize = speciesPoolSize;
  configuredRootTID = rootTID;

  // 3. Serialize and commit to client profile memory
  saveGameSettings(speciesPoolSize, rootTID);
}

function loadAndApplySettings() {
  // 1. Fetch saved memory payload string, parse it, or drop back to defaults
  const savedData = loadGameSettings();

  // 2. Synchronize the Radio buttons UI
  if (speciesPoolRadios[savedData.speciesPoolSize]) {
    speciesPoolRadios[savedData.speciesPoolSize].checked = true;
  }

  // 3. Synchronize the Dropdown select element UI
  const selectElement = document.getElementById("root-node-select");
  if (selectElement) {
    selectElement.value = savedData.rootTID.toString();
  }

  configuredSpeciesPoolSize = savedData.speciesPoolSize;
  configuredRootTID = savedData.rootTID;
  restartGame();
  updateSettingsLockState();

  // STUB: Inform your core gameplay loop modules to update their state configurations
  // game.setDifficultyPoolByIndex(settings.speciesPoolIndex);
  // game.setRootTaxonomyID(settings.rootTID);
}

function handleDailyRefresh() {
  const currentDateKey = getCurrentDateKey();
  if (currentDateKey === lastKnownDateKey) {
    return;
  }

  lastKnownDateKey = currentDateKey;
  toggleModalState(modalOverlay, false);
  restartGame();
  populateSettingsStats();
}

function scheduleNextDailyRefresh() {
  if (dailyRefreshTimeout) {
    clearTimeout(dailyRefreshTimeout);
  }

  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 0, 50);

  dailyRefreshTimeout = window.setTimeout(
    () => {
      handleDailyRefresh();
      scheduleNextDailyRefresh();
    },
    Math.max(1000, nextMidnight.getTime() - Date.now()),
  );
}

function activateCladeMobileSheet() {
  console.log("activateCladeMobileSheet");

  blurGuessInput();

  // Inject state configuration layout modifier flag properties
  document.body.classList.add("clade-card-active");
  cladeCard.classList.add("expanded");
}

function deactivateCladeMobileSheet() {
  console.log("deactivateCladeMobileSheet");
  document.body.classList.remove("clade-card-active");
  cladeCard.classList.remove("expanded");
}

applyTheme(loadTheme());

// ====================================
//   EVENT LISTENERS
// ====================================

// Run it again if the user rotates their phone or scales their browser window container layout
window.addEventListener("resize", recalculateMobileLayout);

// Trigger filtering updates whenever typing occurs
guessInput.addEventListener("input", updateDropdown);

// Keyboard interception framework
guessInput.addEventListener("keydown", (e) => {
  const items = dropdown.getElementsByClassName("suggestion-item");

  if (dropdown.classList.contains("hidden") || items.length === 0) {
    // Standard action if menu is closed
    if (e.key === "Enter") {
      handleGuessSubmit();
    }
    return;
  }

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault(); // Prevents cursor text-jumping behavior
      currentFocusIndex++;
      setFocusState(items);
      break;

    case "ArrowUp":
      e.preventDefault();
      currentFocusIndex--;
      setFocusState(items);
      break;

    case "Enter":
      e.preventDefault();
      // If an item is active via arrow keys, select it.
      if (currentFocusIndex > -1 && items[currentFocusIndex]) {
        guessInput.value = items[currentFocusIndex].textContent;
        hideDropdown();
      }

      // submit
      handleGuessSubmit();
      break;

    case "Escape":
      hideDropdown();
      break;
  }
});

// Dismiss the menu if the user clicks anywhere outside the input interface
document.addEventListener("click", (e) => {
  if (e.target !== guessInput && e.target !== dropdown) {
    hideDropdown();
  }
});

// Link the function to the click action of the button
submitBtn.addEventListener("click", handleGuessSubmit);

// Pipeline Trigger: Handle Resetting the Entire Ecosystem Loop
restartGameBtn.addEventListener("click", () => {
  // 1. Hide the centered dialog interface
  modalOverlay.classList.add("hidden");

  // 2. Start the next available game for the current day state
  restartGame();
  guessInput.focus();
});

// --- Mobile Touch Gestures (Drag-to-Swipe Mechanics) ---
cardHeader.addEventListener(
  "touchstart",
  (e) => {
    startY = e.touches[0].clientY;
    cladeCard.style.transition = "none";
  },
  { passive: true },
);

cardHeader.addEventListener(
  "touchmove",
  (e) => {
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    if (cladeCard.classList.contains("expanded") && deltaY > 0) {
      // Smoothly dragging downwards away from the control bar deck line boundary
      cladeCard.style.transform = `translateY(${deltaY}px)`;
    } else if (!cladeCard.classList.contains("expanded") && deltaY < 0) {
      // Smoothly pulling upwards using the exact live automated peek offset calculation
      cladeCard.style.transform = `translateY(${livePeekOffset + deltaY}px)`;
    }
  },
  { passive: true },
);

cardHeader.addEventListener("touchend", (e) => {
  cladeCard.style.transition = "transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)";

  const endY = e.changedTouches[0].clientY;
  const totalDelta = endY - startY;

  if (Math.abs(totalDelta) > 65) {
    if (totalDelta > 0) {
      deactivateCladeMobileSheet();
    } else {
      activateCladeMobileSheet();
    }
  }

  cladeCard.style.transform = "";
});

cardHeader.addEventListener("click", (e) => {
  if (window.innerWidth <= 600 && e.target.tagName !== "BUTTON") {
    if (cladeCard.classList.contains("expanded")) {
      deactivateCladeMobileSheet();
    } else {
      activateCladeMobileSheet();
    }
  }
});

// Automatically blur the input and close the keyboard if the clade sheet is scrolled
cladeScroll.addEventListener("scroll", () => {
  blurGuessInput();
});

// 1. Open Button Interaction Registrations
openSettingsBtn.addEventListener("click", () => {
  populateSettingsStats();
  updateSettingsLockState();
  toggleModalState(settingsModal, true);
});

openFaqBtn.addEventListener("click", () => {
  toggleModalState(faqModal, true);
});

themeToggleBtn.addEventListener("click", () => {
  const nextTheme = document.body.dataset.theme === "light" ? "dark" : "light";
  applyTheme(nextTheme);
  saveTheme(nextTheme);
});

// 2. Automated Event Capture for Close Switches inside the layers
document.querySelectorAll(".modal-overlay").forEach((overlayElement) => {
  // Close if clicking the specific dark background backdrop area layer frame directly
  overlayElement.addEventListener("click", (e) => {
    if (e.target === overlayElement) {
      toggleModalState(overlayElement, false);
    }
  });

  // Close if hitting the internal cross configuration escape buttons
  const closeBtn = overlayElement.querySelector(".close-modal-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      toggleModalState(overlayElement, false);
    });
  }
});

// 3. Functional Settings Administrative Storage Erasure Action Stub
clearDataBtn.addEventListener("click", () => {
  const confirmation = confirm(
    "Are you completely sure you want to clear your local game progress metrics? This action will permanently erase both daily and total stats.",
  );
  if (confirmation) {
    game.eraseStats();
    populateSettingsStats();
    toggleModalState(modalOverlay, false);
    restartGame();

    toggleModalState(settingsModal, false);
  }
});

speciesPoolRadios.forEach((radio) => {
  radio.addEventListener("change", (e) => {
    if (isDailyGamePending()) {
      updateSettingsLockState();
      return;
    }

    const selectedIndex = parseInt(e.target.value, 10);
    console.log(
      `Difficulty change detected! Selected species pool size: ${selectedIndex}`,
    );
    saveSettings();

    // STUB: Hook into your game loading engine here
    // game.setDifficultyPool(selectedSize);
    // game.restartMatch();
    configuredSpeciesPoolSize = selectedIndex;
    restartGame(-1);
  });
});

rootNodeSelect.addEventListener("change", (e) => {
  if (isDailyGamePending()) {
    updateSettingsLockState();
    return;
  }

  const selectedTID = parseInt(e.target.value, 10);
  console.log(
    `Root node change detected! Selected target TID parameter: ${selectedTID}`,
  );
  saveSettings();

  // STUB: Hook into your taxonomy generation mapping framework here
  // game.setRootTaxonomyID(parseInt(selectedTID));
  // game.restartMatch();
  configuredRootTID = selectedTID;
  restartGame(-1);
});

resetDefaultsBtn.addEventListener("click", () => {
  if (isDailyGamePending()) {
    updateSettingsLockState();
    return;
  }

  console.log(
    "Restoring settings configurations back to system factory defaults...",
  );

  // Reset the UI states inside the settings panel wrapper DOM
  document.getElementById("list-large").checked = true;
  rootNodeSelect.value = "0";
  saveSettings();
  configuredSpeciesPoolSize = DAILY_SPECIES_POOL_SIZE;
  configuredRootTID = DAILY_ROOT_TID;
  restartGame(-1);

  // STUB: Fire notifications to update your internal engine memory states
  // game.setDifficultyPool("medium");
  // game.setRootTaxonomyID(0);
  // game.restartMatch();
});

// 1. Hook up Hint interaction loop listener
hintBtn.addEventListener("click", () => {
  game.getHint();
  treeUI.updateTreeLayout(game.getCurrentTree());
  inspectClade(game.getBestTID());
  updateHintButtonState();
  guessCount.innerHTML = game.guessesRemaining;
});

// 2. Hook up Restart match interaction listener
restartBtn.addEventListener("click", () => {
  let confirmRestart = true;
  if (game.state == GameState.PLAYING) {
    confirmRestart = confirm(
      "Are you sure you want to abandon this match and start a clean game session layout?",
    );
  }

  if (confirmRestart) {
    restartGame();

    // Ensure button values adapt safely to the newly generated match state parameters
    updateHintButtonState();
  }
});

// Automatically blur the input and close the keyboard if the tree is scrolled
rightPanel.addEventListener("scroll", () => {
  blurGuessInput();
});

// --- Global Initialization Pipeline Loop ---
document.addEventListener("DOMContentLoaded", () => {
  // Start up the UI
  lastKnownDateKey = getCurrentDateKey();
  treeUI.onNodeClick((clickedTid) => {
    // Route the clicked ID down to our helper function to update template cards
    inspectClade(clickedTid, true);
  });
  initializeRootNodeDropdown();
  loadAndApplySettings();
  startMysteryImageShuffler();
  recalculateMobileLayout();
  scheduleNextDailyRefresh();

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      handleDailyRefresh();
    }
  });

  // Register PWA service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register(new URL("../sw.js", import.meta.url))
        .then((registration) => {
          console.log(
            "ServiceWorker successfully registered with scope footprint: ",
            registration.scope,
          );
        })
        .catch((error) => {
          console.error("ServiceWorker registration failed: ", error);
        });
    });
  }
});

// Prompt PWA installation
document.addEventListener("DOMContentLoaded", () => {
  let deferredPrompt = null;

  // --- A. Native Android/Chrome Interception ---
  // Chrome fires this event if the site meets PWA criteria and isn't installed yet
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // Stop the default mini-infobar from popping up
    deferredPrompt = e; // Cache the event so we can trigger it manually later

    // Evaluate if this is a first-time mobile visitor
    evaluatePromptTrigger();
  });

  // --- B. Evaluate Prompt Conditions ---
  function evaluatePromptTrigger() {
    const isMobileSize = window.matchMedia("(max-width: 768px)").matches;

    // Assume your storage utility function returns false on their absolute first visit
    const isFirstTime = !hasOpenedBefore();

    if (isFirstTime && isMobileSize) {
      showPWAPrompt();
    }
  }

  // --- C. Build Conditional UI Content Structures ---
  function showPWAPrompt() {
    // Determine the device platform user agent profile if not explicitly flagged by Chrome
    const userAgent = navigator.userAgent || window.opera;
    let os = null;
    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      os = "ios";
    } else if (/android/i.test(userAgent)) {
      os = "android";
    } else {
      return; // Exit silently on standard desktop environments
    }

    // Don't show the prompt if the app is already running inside PWA mode (standalone)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return;
    }

    // Inject step-by-step guidance parameters
    if (os === "ios") {
      pwaInstructions.innerHTML = `
          <div class="pwa-instructions-card">
            <ol class="pwa-instructions-list">
              <li>
                Tap the <strong>Share</strong> button
                <svg class="pwa-inline-icon" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
                  <path d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z"/>
                  <path d="M24 7h2v21h-2z"/>
                  <path d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z"/>
                </svg>
                on the right side of the search bar.
              </li>
              <li>Scroll down through the options menu.</li>
              <li>Tap <strong>Add to Home Screen</strong>.</li>
            </ol>
          </div>`;
      nativeInstallBtn.classList.add("hidden");
    } else if (os === "android") {
      pwaInstructions.innerHTML = `
        <p class="pwa-install-copy">Click the install button below to automatically add the game to your applications drawer.</p>`;
      nativeInstallBtn.classList.remove("hidden"); // Reveal the hidden native trigger button
    }

    // Display the completed modal layout
    pwaModal.classList.remove("hidden");
  }

  // --- D. Action Listeners ---
  if (nativeInstallBtn) {
    nativeInstallBtn.addEventListener("click", async () => {
      if (!deferredPrompt) return;

      pwaModal.classList.add("hidden"); // Hide modal overlay framework
      deferredPrompt.prompt(); // Reveal native Android system setup dialog

      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User installation choice outcome evaluated: ${outcome}`);
      deferredPrompt = null; // Clear out cached request memory references
    });
  }

  if (pwaCloseBtn) {
    pwaCloseBtn.addEventListener("click", () => {
      pwaModal.classList.add("hidden");
    });
  }

  // --- E. Direct Fallback Check for iOS Safari ---
  // iOS doesn't support 'beforeinstallprompt', so we have to call evaluation directly on page load
  setTimeout(() => {
    // Only execute if Android setup didn't already intercept the event routine
    if (!deferredPrompt) {
      evaluatePromptTrigger();
    }
  }, 1000);
});

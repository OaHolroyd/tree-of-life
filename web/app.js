import { CLADE_LIST } from "./data/clades.js";
import { Game, GameState } from "./modules/Game.js";
import { Tree } from "./modules/Tree.js";
import { getSuggestions } from "./modules/Autocomplete.js";
import { loadGameSettings, saveGameSettings } from "./modules/Storage.js";

const AVAILABLE_ROOT_TIDS = [0, 2, 3, 5, 10];

// Create the game state and logic
const game = new Game(-1, 0, 1);
let suggestionList = game.getSpeciesTIDs(true);

// Instantiate the visual Canvas rendering layer, passing its target container
const treeUI = new Tree(document.getElementById("tree-container"));
treeUI.updateTreeLayout(game.getCurrentTree());

// --- DOM Elements ---
const guessInput = document.getElementById("guess-input");
const dropdown = document.getElementById("suggestions-dropdown");
const submitBtn = document.getElementById("submit-guess-btn");
const hintBtn = document.getElementById("game-hint-btn");
const restartBtn = document.getElementById("game-restart-btn");
const guessCount = document.getElementById("guesses-count");
guessCount.innerHTML = game.guessesRemaining; // force this to always be correct if we change the backend

const modalOverlay = document.getElementById("game-over-modal");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const restartGameBtn = document.getElementById("restart-btn");

const appHeader = document.querySelector(".app-header");
const controlsSection = document.querySelector(".controls-section");
const cladeCard = document.getElementById("clade-card");
const cardHeader = cladeCard.querySelector(".card-header");

const settingsModal = document.getElementById("settings-modal");
const faqModal = document.getElementById("faq-modal");
const openSettingsBtn = document.getElementById("nav-settings-btn");
const openFaqBtn = document.getElementById("nav-faq-btn");
const clearDataBtn = document.getElementById("clear-data-btn");

const resetDefaultsBtn = document.getElementById("reset-defaults-btn");
const rootNodeSelect = document.getElementById("root-node-select");

// UI state
let currentFocusIndex = -1; // Tracks which suggestion item is highlighted (-1 means none)
let startY = 0;
let livePeekOffset = 0;

const imageRotationPeriod = 1000;
let activeInspectionID = -1;
let mysteryImageInterval = null;
let currentMysteryImageTID = -1;

/**
 * Restart the game
 * @param {int} tid - TID of the answer
 */
function restartGame(tid = -1) {
  game.restart(tid, game.root, game.size);
  suggestionList = game.getSpeciesTIDs(true);
  treeUI.reset();
  treeUI.updateTreeLayout(game.getCurrentTree());
  inspectClade(game.getBestTID());
  updateHintButtonState();
}

/**
 * Utility tracker loop to refresh the clickable state of your Hint selector.
 * You should call this function inside your initialization routine AND
 * right after a user makes any guess or unlocks a new node layer!
 */
function updateHintButtonState() {
  if (!hintBtn) return;

  const isAvailable = game.canHint();
  hintBtn.innerHTML = `Hint (${game.hint_cost})`;

  // Setting the disabled property to false makes it clickable; true locks it out
  hintBtn.disabled = !isAvailable;
}
updateHintButtonState();

// Register a guess submission from the input field
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
    console.log(`Handle invalid guess: "${guess}"`);
    return;
  }

  // guess has ended the game
  if (hasEnded) {
    console.log(`Handle game end`);
    inspectClade(game.answer);

    // 1. Fire the reveal function on the rendering framework
    treeUI.revealAnswer(game.tree[game.answer]);

    // 2. Check the game state engine to determine victory conditions
    if (game.state === GameState.WON) {
      modalTitle.textContent = "You win!";
      // modalMessage.textContent = `The answer was ${game.tree[game.answer].com_name}. You got it in ${game.getTurnsTaken()} guesses!`;
    } else {
      modalTitle.textContent = "Game Over";
      // modalMessage.textContent = `Out of turns! The correct clade answer was: ${game.tree[game.answer].com_name}.`;
    }

    // Populate the stats directly inside your modal body string
    const currentStats = game.getStats();
    modalMessage.innerHTML = `
      Current Streak: <strong>${currentStats.currentStreak}</strong> |
      Longest Streak: <strong>${currentStats.longestStreak}</strong><br>
      Games Won: ${currentStats.won} / ${currentStats.played}
    `;

    // 3. Drop down the centered banner overlay
    modalOverlay.classList.remove("hidden");
    return;
  }

  // show info for best clade
  inspectClade(game.getBestTID(), false);
}

/**
 * Starts a background loop that selects a random species image
 * from the game's currently active pool every imageRotationPeriod ms.
 */
function startMysteryImageShuffler() {
  // Clear any existing interval just in case to prevent memory leaks
  if (mysteryImageInterval) clearInterval(mysteryImageInterval);

  // Fallback default image in case our lookup loop below fails
  currentMysteryImageTID = game.root;

  // 2. Spin up the interval loop
  mysteryImageInterval = setInterval(() => {
    // Pick a new completely random index from our image array
    let tid = game.getRandomSpeciesTID();
    while (tid === currentMysteryImageTID) {
      tid = game.getRandomSpeciesTID();
    }
    currentMysteryImageTID = tid;

    // CRUCIAL: If the player is currently inspecting the secret answer,
    // force the live HTML image tag to update instantly without needing a re-click!
    if (
      activeInspectionID === game.answer &&
      game.state === GameState.PLAYING
    ) {
      document.getElementById("clade-image").src =
        game.tree[currentMysteryImageTID].image;
    }
  }, imageRotationPeriod); // Speed modifier (in milliseconds)
}
startMysteryImageShuffler();

// Renders the matched entries into HTML items
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

// Highlights an item and manages scrolling position
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

// show the details for the clade at TID
function inspectClade(tid) {
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

  // TODO: maybe limit this to when the screen is sufficiently narrow?
  activateCladeMobileSheet();
}

// allow clicking a node to reveal clade details
treeUI.onNodeClick((clickedTid) => {
  // Route the clicked ID down to our helper function to update template cards
  inspectClade(clickedTid);
});

/**
 * Automatically pops the sheet open if we are on a smaller viewport screen size
 */
function openMobileDrawer() {
  if (window.innerWidth <= 600) {
    cladeCard.classList.add("expanded");
  }
}

/**
 * Dynamically measures DOM nodes and feeds exact parameters to CSS rules.
 * Updated to account for the persistent top navigation app-header.
 */
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

recalculateMobileLayout();

/**
 * Global modular utility hook to handle toggling visibility wrappers
 * @param {HTMLElement} targetModalElement
 * @param {boolean} shouldShow
 */
function toggleModalState(targetModalElement, shouldShow) {
  if (shouldShow) {
    targetModalElement.classList.remove("hidden");
  } else {
    targetModalElement.classList.add("hidden");
  }
}

// Function to pull stats data metrics from engine storage profiles
function populateSettingsStats() {
  // Pull data from local storage, fallback to empty defaults if a brand new profile
  const stats = JSON.parse(localStorage.getItem("clade_game_stats")) || {
    played: 0,
    won: 0,
    currentStreak: 0,
    longestStreak: 0,
  };

  // Calculate the win percentage accurately
  const winRate =
    stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

  // Inject computed stats directly into the text wrapper frames
  document.getElementById("stat-played").textContent = stats.played;
  document.getElementById("stat-winrate").textContent = `${winRate}%`;
  document.getElementById("stat-streak").textContent = stats.currentStreak;
  document.getElementById("stat-max-streak").textContent = stats.longestStreak;
}

// Hook into your global UI panel inspector mechanism
// to trigger the sheet slide whenever data alters
const baseInspectClade = inspectClade;
inspectClade = function (tid, shouldOpenMobile = true) {
  baseInspectClade(tid); // Update text, imagery, and selected borders

  // Only pop the drawer up if we are on mobile AND explicitly allowed to
  if (shouldOpenMobile && window.innerWidth <= 600) {
    cladeCard.classList.add("expanded");
  }
};

/**
 * Automatically builds the root node select list using data from CLADE_LIST
 */
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
  const speciesRadios = Array.from(
    document.querySelectorAll('input[name="species-pool"]'),
  );
  const activeRadio = document.querySelector(
    'input[name="species-pool"]:checked',
  );
  const speciesPoolSize = speciesRadios.indexOf(activeRadio);
  const rootTID = parseInt(selectElement.value, 10);

  // 3. Serialize and commit to client profile memory
  saveGameSettings(speciesPoolSize, rootTID);
}

function loadAndApplySettings() {
  // 1. Fetch saved memory payload string, parse it, or drop back to defaults
  const savedData = loadGameSettings();

  // 2. Synchronize the Radio buttons UI
  const speciesRadios = document.querySelectorAll('input[name="species-pool"]');
  if (speciesRadios[savedData.speciesPoolSize]) {
    speciesRadios[savedData.speciesPoolSize].checked = true;
  }

  // 3. Synchronize the Dropdown select element UI
  const selectElement = document.getElementById("root-node-select");
  if (selectElement) {
    selectElement.value = savedData.rootTID.toString();
  }

  game.size = savedData.speciesPoolSize;
  game.root = savedData.rootTID;
  restartGame();

  // STUB: Inform your core gameplay loop modules to update their state configurations
  // game.setDifficultyPoolByIndex(settings.speciesPoolIndex);
  // game.setRootTaxonomyID(settings.rootTID);
}

function activateCladeMobileSheet() {
  console.log("activateCladeMobileSheet");
  guessCount.innerHTML = "ON";

  // Force document body to clear out old active focus elements safely
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  // Inject state configuration layout modifier flag properties
  document.body.classList.add("clade-card-active");

  // Crucial iOS Hack: A micro-timeout forces WebKit to redraw layout layers,
  // snapping the touch engine back to reality before the user starts swiping.
  setTimeout(() => {
    if (cladeCard) {
      cladeCard.style.display = "none";
      cladeCard.offsetHeight; // Triggers a forced structural hardware reflow
      cladeCard.style.display = "flex";
    }
  }, 10);
}

function deactivateCladeMobileSheet() {
  console.log("deactivateCladeMobileSheet");
  guessCount.innerHTML = "OFF";
  document.body.classList.remove("clade-card-active");
}

// --- Event Listeners ---

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

  // 2. Select a new random tid sequence out of your python or static module arrays
  restartGame();

  // 3. Wipe out the old layout records from the canvas simulation tracker
  treeUI.reset(); // Make sure to add this small reset hook in TreePhysics.js!

  // 4. Feed the new initial state (the fresh root nodes) straight to the layout engine
  treeUI.updateTreeLayout(game.getCurrentTree());

  // 5. Re-focus inputs and sidebar information frames
  guessCount.innerHTML = game.guessesRemaining;
  inspectClade(0);
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
      cladeCard.classList.remove("expanded"); // Swiped down to collapse
    } else {
      activateCladeMobileSheet();
      cladeCard.classList.add("expanded"); // Swiped up to cover tree
    }
  }

  cladeCard.style.transform = "";
});

cardHeader.addEventListener("click", (e) => {
  if (window.innerWidth <= 600 && e.target.tagName !== "BUTTON") {
    cladeCard.classList.toggle("expanded");

    if (cladeCard.classList.contains("expanded")) {
      activateCladeMobileSheet();
    } else {
      deactivateCladeMobileSheet();
    }
  }
});

// 1. Open Button Interaction Registrations
openSettingsBtn.addEventListener("click", () => {
  populateSettingsStats();
  toggleModalState(settingsModal, true);
});

openFaqBtn.addEventListener("click", () => {
  toggleModalState(faqModal, true);
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
    "Are you completely sure you want to clear your local game progress metrics? This action will permanently erase your current streaks data records.",
  );
  if (confirmation) {
    game.eraseStats();
    populateSettingsStats();

    toggleModalState(settingsModal, false);
  }
});

document.querySelectorAll('input[name="species-pool"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    const selectedIndex = parseInt(e.target.value, 10);
    console.log(
      `Difficulty change detected! Selected species pool size: ${selectedIndex}`,
    );
    saveSettings();

    // STUB: Hook into your game loading engine here
    // game.setDifficultyPool(selectedSize);
    // game.restartMatch();
    game.size = selectedIndex;
    restartGame(-1);
  });
});

rootNodeSelect.addEventListener("change", (e) => {
  const selectedTID = parseInt(e.target.value, 10);
  console.log(
    `Root node change detected! Selected target TID parameter: ${selectedTID}`,
  );
  saveSettings();

  // STUB: Hook into your taxonomy generation mapping framework here
  // game.setRootTaxonomyID(parseInt(selectedTID));
  // game.restartMatch();
  game.root = selectedTID;
  restartGame(-1);
});

resetDefaultsBtn.addEventListener("click", () => {
  console.log(
    "Restoring settings configurations back to system factory defaults...",
  );

  // Reset the UI states inside the settings panel wrapper DOM
  document.getElementById("list-medium").checked = true;
  rootNodeSelect.value = "0";
  saveSettings();
  game.size = 1;
  game.root = 0;
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
  const confirmRestart = confirm(
    "Are you sure you want to abandon this match and start a clean game session layout?",
  );
  if (confirmRestart) {
    console.log("Reinitializing gameplay loop frameworks...");

    restartGame();

    // Ensure button values adapt safely to the newly generated match state parameters
    updateHintButtonState();
  }
});

// --- Global Initialization Pipeline Loop ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Build your dynamic drop-down nodes inside the HTML container DOM
  initializeRootNodeDropdown();

  // 2. Immediately look up, apply, and sync persistent configurations
  loadAndApplySettings();

  if (guessInput) {
    // Force coordinates to snap back to origin point when keyboard closes
    guessInput.addEventListener("blur", () => {
      window.scrollTo(0, 0);
    });

    // Automatically blur the input and close the keyboard if the tree is scrolled
    const rightPanel = document.querySelector(".right-panel");
    if (rightPanel) {
      rightPanel.addEventListener("scroll", () => {
        if (document.activeElement === guessInput) {
          guessInput.blur();
        }
      });
    }

    // Automatically blur the input and close the keyboard if the clade sheet is scrolled
    const cladeScroll = document.querySelector(".clade-scroll-content");
    if (cladeScroll) {
      cladeScroll.addEventListener("scroll", () => {
        if (document.activeElement === guessInput) {
          guessInput.blur();
        }
      });
    }
  }

  // --- Register PWA Service Worker Core Engine ---
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
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

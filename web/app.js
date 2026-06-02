import { CLADE_LIST } from "./data/clades.js";
import { Game, GameState } from "./modules/Game.js";
import { Tree } from "./modules/Tree.js";
import { getSuggestions } from "./modules/Autocomplete.js";

// Create the game state and logic
const game = new Game(4);

// Instantiate the visual Canvas rendering layer, passing its target container
const treeUI = new Tree(document.getElementById("tree-container"));
treeUI.updateTreeLayout(game.getCurrentTree());

// --- DOM Elements ---
const guessInput = document.getElementById("guess-input");
const dropdown = document.getElementById("suggestions-dropdown");
const submitBtn = document.getElementById("submit-guess-btn");
const guessCount = document.getElementById("guesses-count");
guessCount.innerHTML = game.guessesRemaining; // force this to always be correct if we change the backend

// UI state
let currentFocusIndex = -1; // Tracks which suggestion item is highlighted (-1 means none)

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

  // Clear the input box for the next guess
  guessInput.value = "";
  hideDropdown();
  guessInput.focus();

  // invalid guess submitted
  if (!isValid) {
    console.log(`Handle invalid guess: "${guess}"`);
    return;
  }

  // show info for best clade
  inspectClade(game.getBestTID());

  // guess has ended the game
  if (hasEnded) {
    console.log(`Handle game end`);

    treeUI.revealAnswer(game.tree[game.answer]);

    return;
  }
}

// Renders the matched entries into HTML items
function updateDropdown() {
  const query = guessInput.value.trim();
  const matches = getSuggestions(query, game.guesses);

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
    sci_name = "??? ???";
    com_name = "Mystery animal";
    text = "Keep guessing to find the mystery animal";
    image = CLADE_LIST[0].image;
  }

  document.getElementById("clade-sci-name").textContent = sci_name;
  document.getElementById("clade-com-name").textContent = com_name;
  document.getElementById("clade-text").textContent = text;
  document.getElementById("clade-image").src = image;
}

// allow clicking a node to reveal clade details
treeUI.onNodeClick((clickedTid) => {
  // Route the clicked ID down to our helper function to update template cards
  inspectClade(clickedTid);
});

// --- Event Listeners ---

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

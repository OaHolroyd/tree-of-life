import { CLADE_LIST } from "./data/clades.js";
import { Game, GameState } from "./modules/Game.js";
import { Tree } from "./modules/Tree.js";
import { getDummySuggestions } from "./modules/Autocomplete.js";

// Create the game state and logic
const game = new Game(4);

// Instantiate the visual Canvas rendering layer, passing its target container
const treeUI = new Tree(document.getElementById("tree-container"));
treeUI.updateTreeLayout(game.getCurrentTree());

// --- DOM Elements ---
const guessInput = document.getElementById("guess-input");
const dropdown = document.getElementById("suggestions-dropdown");
const submitBtn = document.getElementById("submit-guess-btn");

// UI state
let currentFocusIndex = -1; // Tracks which suggestion item is highlighted (-1 means none)

// This is your dummy game-engine function
function handleGuessSubmit() {
  const guess = guessInput.value.trim();

  if (guess === "") {
    console.log("Empty guess submitted. Ignoring.");
    return;
  }

  const [isValid, hasEnded, updatedNodes] = game.submitGuess(guess);
  if (isValid) {
    console.log(updatedNodes);
    treeUI.updateTreeLayout(updatedNodes);
  }

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
    const answerNode = document.getElementById(`node-${game.answer}`);
    answerNode.innerHTML = `<div class="node-sci">${game.tree[game.answer].com_name}</div>`;
    return;
  }
}

// Renders the matched entries into HTML items
function updateDropdown() {
  const query = guessInput.value.trim();
  const matches = getDummySuggestions(query);

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

// Highlights an item and manages scrolling position programmatically
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

// --- Left Panel Display Sync ---
function inspectClade(tid) {
  const clade = CLADE_LIST[tid];
  if (!clade) return;
  document
    .querySelectorAll(".tree-node")
    .forEach((n) => n.classList.remove("selected"));
  const activeNode = document.getElementById(`node-${tid}`);
  if (activeNode) activeNode.classList.add("selected");

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

treeUI.onNodeClick((clickedTid) => {
  // Route the clicked ID down to our helper function to update template cards
  inspectClade(clickedTid);
});

// Wait for the HTML elements to load in the browser
document.addEventListener("DOMContentLoaded", () => {
  // DUMMY SIMULATION: Unlocks a new branch node every 3.5 seconds so you can see the entry animation!
  // setTimeout(() => discoverClade(CLADE_LIST[2]), 3500); // Unlocks Cnidaria
  // setTimeout(() => discoverClade(CLADE_LIST[3]), 7000); // Unlocks Protostomia
  // setTimeout(() => discoverClade(CLADE_LIST[4]), 10500); // Unlocks Deuterostomia

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
        // If an item is active via arrow keys, select it. Otherwise, submit input value directly.
        if (currentFocusIndex > -1 && items[currentFocusIndex]) {
          guessInput.value = items[currentFocusIndex].textContent;
          hideDropdown();
        } else {
          handleGuessSubmit();
        }
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
});

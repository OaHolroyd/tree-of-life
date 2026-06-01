import { CLADE_DATABASE } from "./data/clades.js";
import { getDummySuggestions } from "./modules/Autocomplete.js";

// --- DOM Elements ---
const guessInput = document.getElementById("guess-input");
const dropdown = document.getElementById("suggestions-dropdown");
const submitBtn = document.getElementById("submit-guess-btn");
const container = document.getElementById("tree-container");
const canvas = document.getElementById("tree-canvas");
const overlay = document.getElementById("node-overlay");

// UI state
let currentFocusIndex = -1; // Tracks which suggestion item is highlighted (-1 means none)

// Tree layout configuration constants
const ctx = canvas.getContext("2d");
const SPRING_LENGTH = 140; // Ideal distance between parent & child
const K_SPRING = 0.05; // Pull elasticity strength
const REPULSION = 4000; // How aggressively nodes push away from each other
const FRICTION = 0.82; // Damping multiplier slows things down to rest safely
let nodes = [];

// --- 2. Initialize Nodes with Layout Guess Positions ---
function initPhysicsEngine() {
  const width = container.clientWidth;

  // Map ALL records into physics memory immediately, regardless of visibility
  nodes = Object.values(CLADE_DATABASE).map((clade) => {
    const isRoot = clade.ptid === null;
    return {
      ...clade,
      x: isRoot ? width / 2 : width / 2 + (Math.random() * 40 - 20),
      y: isRoot ? 60 : 150,
      vx: 0,
      vy: 0,
      isRoot: isRoot,
      element: null, // Track if HTML element is spawned
      spawned: false, // Tracker for DOM generation
    };
  });

  // Sync initial visible DOM nodes
  syncNodeDOM();

  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  requestAnimationFrame(updatePhysicsFrame);
}

// --- 3. Anti-Bounce DOM Sync Function ---
// Checks our state array and ONLY creates elements that don't exist yet
function syncNodeDOM() {
  nodes.forEach((node) => {
    if (node.visible && !node.spawned) {
      if (node.ptid !== null) {
        const parent = nodes.find((n) => n.tid === node.ptid);
        const visibleSiblings = nodes.filter(
          (n) => n.ptid === node.ptid && n.visible && n.spawned,
        );

        if (parent) {
          // FIX part 1: Instead of spawning perfectly on top of the parent,
          // stagger them horizontally based on how many siblings already exist.
          // If it's the first child, it goes slightly left. Subsequent ones step right.
          const siblingOffset = visibleSiblings.length * 40 - 20;

          node.x = parent.x + siblingOffset;
          node.y = parent.y + 40; // Push it slightly below the parent vertically
        }
      }

      const div = document.createElement("div");
      div.className = "tree-node";
      div.id = `node-${node.tid}`;
      div.innerHTML = `<div class="node-sci">${node.sci_name}</div>`;
      div.style.left = `${node.x}px`;
      div.style.top = `${node.y}px`;

      div.addEventListener("click", () => inspectClade(node.tid));
      overlay.appendChild(div);

      node.element = div;
      node.spawned = true;
    }
  });
}

// --- 4. Game Action Loop: Unlock New Information ---
function discoverClade(tid) {
  const node = nodes.find((n) => n.tid === tid);
  if (node && !node.visible) {
    node.visible = true; // Wake up the visibility flag
    syncNodeDOM(); // Safely inject it into the DOM stream
    inspectClade(tid); // Select it automatically in the dashboard panel
    console.log(`Clade "${node.sci_name}" smoothly entered the ecosystem.`);
  }
}

// --- 5. The Live Loop Simulation Engine ---
function updatePhysicsFrame() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  // ONLY apply physics logic to nodes that are active/visible in the game state
  const activeNodes = nodes.filter((n) => n.visible);

  // Repulsion Phase (Active nodes only)
  for (let i = 0; i < activeNodes.length; i++) {
    for (let j = i + 1; j < activeNodes.length; j++) {
      let dx = activeNodes[j].x - activeNodes[i].x;
      let dy = activeNodes[j].y - activeNodes[i].y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;

      if (dist < 300) {
        let force = REPULSION / (dist * dist);

        // FIX part 2: VELOCITY CAP
        // Clamp the maximum force exerted in a single frame to 15.
        // This prevents the infinite force bug when nodes are extremely close.
        if (force > 8) force = 8;

        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;

        if (!activeNodes[i].isRoot) {
          activeNodes[i].vx -= fx;
          activeNodes[i].vy -= fy;
        }
        if (!activeNodes[j].isRoot) {
          activeNodes[j].vx += fx;
          activeNodes[j].vy += fy;
        }
      }
    }
  }

  // Spring Attraction Phase (Active nodes only)
  activeNodes.forEach((node) => {
    if (node.ptid !== null) {
      const parent = activeNodes.find((n) => n.tid === node.ptid);
      if (parent) {
        let dx = parent.x - node.x;
        let dy = parent.y + 60 - node.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;

        let displacement = dist - SPRING_LENGTH;
        let force = displacement * K_SPRING;
        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;

        if (!node.isRoot) {
          node.vx += fx;
          node.vy += fy;
        }
        if (!parent.isRoot) {
          parent.vx -= fx;
          parent.vy -= fy;
        }
      }
    }

    if (!node.isRoot) {
      node.vy += 0.35;
    }
  });

  // Render Frame and Draw Smooth Curves
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#30363d";
  ctx.lineWidth = 1.5;

  activeNodes.forEach((node) => {
    if (!node.isRoot) {
      node.x += node.vx;
      node.y += node.vy;
      node.vx *= FRICTION;
      node.vy *= FRICTION;

      const margin = 50;
      if (node.x < margin) {
        node.x = margin;
        node.vx *= -0.5;
      }
      if (node.x > width - margin) {
        node.x = width - margin;
        node.vx *= -0.5;
      }
      if (node.y > height - margin) {
        node.y = height - margin;
        node.vy *= -0.5;
      }
    }

    if (node.element) {
      node.element.style.left = `${node.x}px`;
      node.element.style.top = `${node.y}px`;
    }

    if (node.ptid !== null) {
      const parent = activeNodes.find((n) => n.tid === node.ptid);
      if (parent) {
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        let midY = (node.y + parent.y) / 2;
        ctx.bezierCurveTo(node.x, midY, parent.x, midY, parent.x, parent.y);
        ctx.stroke();
      }
    }
  });

  requestAnimationFrame(updatePhysicsFrame);
}

// --- Functions ---

// This is your dummy game-engine function
function handleGuessSubmit() {
  const userGuess = guessInput.value.trim();

  if (userGuess === "") {
    console.log("Empty guess submitted. Ignoring.");
    return;
  }

  // Dummy processing logic
  console.log(`Dummy function intercepted guess: "${userGuess}"`);

  // This is where you will add your future tree comparison logic!
  // e.g., runGameTurn(userGuess);

  // Clear the input box for the next guess
  guessInput.value = "";
  hideDropdown();
  guessInput.focus();
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
  const clade = CLADE_DATABASE[tid];
  if (!clade) return;
  document
    .querySelectorAll(".tree-node")
    .forEach((n) => n.classList.remove("selected"));
  const activeNode = document.getElementById(`node-${tid}`);
  if (activeNode) activeNode.classList.add("selected");
  document.getElementById("clade-sci-name").textContent = clade.sci_name;
  document.getElementById("clade-com-name").textContent =
    clade.com_name || "No common name";
  document.getElementById("clade-text").textContent = clade.text;
  document.getElementById("clade-image").src = clade.image;
}

// Initialize Simulation
initPhysicsEngine();

// Wait for the HTML elements to load in the browser
document.addEventListener("DOMContentLoaded", () => {
  // DUMMY SIMULATION: Unlocks a new branch node every 3.5 seconds so you can see the entry animation!
  setTimeout(() => discoverClade(4), 3500); // Unlocks Cnidaria
  setTimeout(() => discoverClade(7), 7000); // Unlocks Protostomia
  setTimeout(() => discoverClade(8), 10500); // Unlocks Deuterostomia

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

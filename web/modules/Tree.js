import { CladeState } from "../data/clades.js";

/**
 * Tree - Pure Rendering & Animation Engine
 * Handles particle physics simulation and canvas rendering for the tree UI.
 */
export class Tree {
  /**
   * @param {HTMLElement} containerElement - The DOM container (#tree-container)
   */
  constructor(containerElement) {
    // 1. Cache DOM references and extract Canvas contexts
    this.container = containerElement;
    this.canvas = this.container.querySelector(".tree-canvas");
    this.overlay = this.container.querySelector(".node-overlay");
    this.ctx = this.canvas.getContext("2d");

    // 2. Physics Configuration Constants
    this.SPRING_LENGTH = 50;
    this.K_SPRING = 0.05;
    this.REPULSION = 4000;
    this.FRICTION = 0.82;
    this.GRAVITY = 0.2;
    this.MAX_FORCE = 8;

    // 3. Internal Tracking Repositories
    this.nodes = []; // Holds persistent engine properties (x, y, vx, vy, inflation, element)
    this.nodeClickHandler = null; // Callback hook for when a user selects a node

    // 4. Set canvas pixel dimensions to match initial bounds
    this.resizeCanvas();

    // 5. Kick off the continuous rendering lifecycle loop
    this.tick = this.tick.bind(this); // Bind to maintain class context inside RAF
    requestAnimationFrame(this.tick);
  }

  /**
   * Reset the tree ready for a new game
   */
  reset() {
    this.nodes = [];
    this.overlay.innerHTML = "";
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.resizeCanvas();
  }

  /**
   * Main Data Synchronization Bridge.
   * Compares currently running nodes against the list of active/visible nodes
   * handed down from the Game controller.
   * @param {Array} visibleNodesData - Array of plain node data objects from Game class
   */
  updateTreeLayout(visibleNodesData) {
    const width = this.container.clientWidth;

    visibleNodesData.forEach((cladeData) => {
      // Check if this node is already registered in our active simulation array
      let existingNode = this.nodes.find((n) => n.tid === cladeData.tid);

      if (!existingNode) {
        const isRoot = cladeData.sub_ptid === null;

        // Construct the simulation track state for this brand new node
        existingNode = {
          ...cladeData,
          x: isRoot ? width / 2 : width / 2,
          y: isRoot ? 60 : 150,
          vx: 0,
          vy: 0,
          isRoot: isRoot,
          element: null,
          spawned: false,
          inflation: 0.01, // Soft spawning start
        };

        // Trigger smooth spawn alignment relative to its parent
        if (!isRoot && cladeData.sub_ptid !== null) {
          const parent = this.nodes.find((n) => n.tid === cladeData.sub_ptid);
          if (parent) {
            const visibleSiblings = this.nodes.filter(
              (n) => n.sub_ptid === cladeData.sub_ptid && n.spawned,
            );
            const siblingOffset = visibleSiblings.length * 40 - 20;

            existingNode.x = parent.x + siblingOffset;
            existingNode.y = parent.y + 40;
          }
        }

        this.nodes.push(existingNode);
      } else {
        // update the info for this node
        Object.assign(existingNode, cladeData);
      }
    });

    // Sync the HTML elements to match our updated particle engine status
    this.syncNodeDOM();
  }

  /**
   * Safely translates newly registered simulation states into active HTML node elements
   */
  syncNodeDOM() {
    this.nodes.forEach((node) => {
      if (!node.spawned) {
        let name = node.sci_name;
        if (node.rank === "species") {
          name = node.com_name;
        }
        if (node.state == CladeState.ANSWER) {
          name = "???";
        }

        const div = document.createElement("div");
        div.className = "tree-node";
        div.id = `node-${node.tid}`;
        div.innerHTML = `<div class="node-sci">${name}</div>`;

        // Route internal click event outward to the main orchestrator callback
        div.addEventListener("click", () => {
          if (this.nodeClickHandler) this.nodeClickHandler(node.tid);
        });

        this.overlay.appendChild(div);
        node.element = div;
        node.spawned = true;

        // Fire smooth CSS scale transition on next rendering pass
        requestAnimationFrame(() => {
          div.style.opacity = "1";
          div.style.transform = "translate(-50%, -50%) scale(1)";
        });
      }
    });
  }

  /**
   * Registers an external callback hook to run when a tree node element is clicked.
   * @param {Function} callback - Receives (tid) parameter
   */
  onNodeClick(callback) {
    this.nodeClickHandler = callback;
  }

  /**
   * Reveals the name of the answer on it's node
   */
  revealAnswer(answerNode) {
    const answerDiv = document.getElementById(`node-${answerNode.tid}`);
    answerDiv.innerHTML = `<div class="node-sci">${answerNode.com_name}</div>`;
  }

  /**
   * Synchronizes canvas rendering buffer allocations to match DOM bounding metrics
   */
  resizeCanvas() {
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;
  }

  /**
   * The continuous math update and paint loop. Runs via requestAnimationFrame.
   */
  tick() {
    this.resizeCanvas();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // --- Step 1: Manage Sizing Maturity ---
    this.nodes.forEach((node) => {
      if (node.inflation < 1.0) {
        node.inflation += 0.015;
        if (node.inflation > 1.0) node.inflation = 1.0;
      }
    });

    // --- Step 2: Global Mutual Node Repulsion ---
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        let dx = this.nodes[j].x - this.nodes[i].x;
        let dy = this.nodes[j].y - this.nodes[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;

        if (dist < 300) {
          let combinedInflation =
            this.nodes[i].inflation * this.nodes[j].inflation;
          let force = (this.REPULSION * combinedInflation) / (dist * dist);

          if (force > this.MAX_FORCE) force = this.MAX_FORCE;

          let fx = (dx / dist) * force;
          let fy = (dy / dist) * force;

          if (!this.nodes[i].isRoot) {
            this.nodes[i].vx -= fx;
            this.nodes[i].vy -= fy;
          }
          if (!this.nodes[j].isRoot) {
            this.nodes[j].vx += fx;
            this.nodes[j].vy += fy;
          }
        }
      }
    }

    // --- Step 3: Branch Connection Spring Forces ---
    this.nodes.forEach((node) => {
      if (node.sub_ptid !== null) {
        const parent = this.nodes.find((n) => n.tid === node.sub_ptid);
        if (parent) {
          let dx = parent.x - node.x;
          let dy = parent.y + 60 - node.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;

          let currentTargetLength = this.SPRING_LENGTH * node.inflation;
          let displacement = dist - currentTargetLength;
          let force = displacement * this.K_SPRING;

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
        node.vy += this.GRAVITY * node.inflation; // Apply directional tree gravity
      }
    });

    // --- Step 4: Apply Velocities, Check Bounds, Clear Context Canvas ---
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.lineWidth = 1.5;

    this.nodes.forEach((node) => {
      if (!node.isRoot) {
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= this.FRICTION;
        node.vy *= this.FRICTION;

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
      } else {
        node.x = width / 2;
        node.y = 60; // Keep locked vertically
      }

      // Reposition the corresponding interactive text container block
      if (node.element) {
        node.element.style.left = `${node.x}px`;
        node.element.style.top = `${node.y}px`;
      }

      // Render Connection Lines via Spline Curves
      if (node.sub_ptid !== null) {
        const parent = this.nodes.find((n) => n.tid === node.sub_ptid);
        if (parent) {
          this.ctx.beginPath();
          this.ctx.moveTo(node.x, node.y);
          let midY = (node.y + parent.y) / 2;
          this.ctx.bezierCurveTo(
            node.x,
            midY,
            parent.x,
            midY,
            parent.x,
            parent.y,
          );

          this.ctx.strokeStyle = `rgba(48, 54, 61, ${node.inflation})`;
          this.ctx.stroke();
        }
      }
    });

    // Continue looping indefinitely
    requestAnimationFrame(this.tick);
  }
}

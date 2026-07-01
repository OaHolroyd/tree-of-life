import { CladeState } from "../data/clades.js";

/**
 * Tree - Pure Rendering & Animation Engine.
 * Handles particle physics simulation and canvas rendering for the tree UI.
 */
export class Tree {
  /**
   * @param {HTMLElement} containerElement - The DOM container (#tree-container)
   */
  constructor(containerElement) {
    this.container = containerElement;
    this.canvas = this.container.querySelector(".tree-canvas");
    this.overlay = this.container.querySelector(".node-overlay");
    this.ctx = this.canvas.getContext("2d");
    // Physics layout constants.
    this.SPRING_LENGTH = 60;
    this.K_SPRING = 0.05;
    this.REPULSION = 2000;
    this.FRICTION = 0.82;
    this.GRAVITY = 0.2;
    this.MAX_FORCE = 0.5;

    this.nodes = [];
    this.nodeClickHandler = null;
    this.answerTid = null;
    this.resizeCanvas();

    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  getTreeLineColor(opacity) {
    const treeLineRGB = getComputedStyle(document.body)
      .getPropertyValue("--color-tree-line-rgb")
      .trim();

    return `rgba(${treeLineRGB || "48, 54, 61"}, ${opacity})`;
  }

  /**
   * Reset the tree ready for a new game.
   */
  reset() {
    this.nodes = [];
    this.answerTid = null;
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
      let existingNode = this.nodes.find((n) => n.tid === cladeData.tid);

      if (cladeData.state === CladeState.ANSWER) {
        this.answerTid = cladeData.tid;
      }

      if (!existingNode) {
        const isRoot = cladeData.sub_ptid === null;

        existingNode = {
          ...cladeData,
          x: isRoot ? width / 2 : width / 2,
          y: isRoot ? 60 : 150,
          vx: 0,
          vy: 0,
          isRoot,
          element: null,
          spawned: false,
          inflation: 0.01,
        };

        if (!isRoot && cladeData.sub_ptid !== null) {
          const parent = this.nodes.find((n) => n.tid === cladeData.sub_ptid);
          const child = this.nodes.find((n) => n.sub_ptid === cladeData.tid);

          if (parent && child) {
            const visibleSiblings = this.nodes.filter(
              (n) => n.sub_ptid === cladeData.sub_ptid && n.spawned,
            );
            const siblingOffset = visibleSiblings.length * 40 - 20;

            existingNode.x = parent.x + siblingOffset;
            existingNode.y = (parent.y + child.y) / 2;
          } else if (parent) {
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
        Object.assign(existingNode, cladeData);
        existingNode.isRoot = existingNode.sub_ptid === null;
      }
    });

    this.syncNodeDOM();
    this.updateNodeProximityStyles();
  }

  /**
   * Safely translates newly registered simulation states into active HTML node elements.
   */
  syncNodeDOM() {
    this.nodes.forEach((node) => {
      const label = this.getNodeLabel(node);

      if (!node.spawned) {
        const div = document.createElement("div");
        if (node.rank == "Species") {
          div.className = "tree-node species-node";
        } else {
          div.className = "tree-node clade-node";
        }
        div.id = `node-${node.tid}`;
        div.innerHTML = label;

        div.addEventListener("click", () => {
          if (this.nodeClickHandler) this.nodeClickHandler(node.tid);
        });

        this.overlay.appendChild(div);
        node.element = div;
        node.spawned = true;

        requestAnimationFrame(() => {
          div.style.opacity = "1";
          div.style.transform = "translate(-50%, -50%) scale(1)";
        });
      } else if (node.element) {
        node.element.innerHTML = label;
      }
    });
  }

  updateNodeProximityStyles() {
    if (this.nodes.length === 0) return;

    const answerTid =
      this.answerTid ??
      this.nodes.find((node) => node.state === CladeState.ANSWER)?.tid;
    if (answerTid === undefined || answerTid === null) return;

    const adjacency = new Map();
    this.nodes.forEach((node) => adjacency.set(node.tid, []));

    this.nodes.forEach((node) => {
      if (node.sub_ptid !== null && adjacency.has(node.sub_ptid)) {
        adjacency.get(node.tid).push(node.sub_ptid);
        adjacency.get(node.sub_ptid).push(node.tid);
      }
    });

    const distances = new Map([[answerTid, 0]]);
    const queue = [answerTid];

    while (queue.length > 0) {
      const currentTid = queue.shift();
      const currentDistance = distances.get(currentTid);

      adjacency.get(currentTid).forEach((neighborTid) => {
        if (!distances.has(neighborTid)) {
          distances.set(neighborTid, currentDistance + 1);
          queue.push(neighborTid);
        }
      });
    }

    const maxDistance = Math.max(...distances.values(), 0);

    this.nodes.forEach((node) => {
      if (!node.element) return;

      const distance = distances.get(node.tid) ?? maxDistance;
      const closeness = maxDistance === 0 ? 1 : 1 - distance / maxDistance;
      const hue = Math.round(closeness * 120);
      node.element.style.setProperty("--node-proximity-hue", `${hue}deg`);
    });
  }

  getNodeLabel(node) {
    let name = node.sci_name;

    if (node.rank === "Species") {
      name = node.com_name;
    }
    if (node.state === CladeState.ANSWER) {
      name = "???";
    }

    return `<div">${name}</div>`;
  }

  /**
   * Registers an external callback hook to run when a tree node element is clicked.
   * @param {Function} callback - Receives (tid) parameter
   */
  onNodeClick(callback) {
    this.nodeClickHandler = callback;
  }

  /**
   * Reveals the name of the answer on its node.
   */
  revealAnswer(answerNode) {
    this.answerTid = answerNode.tid;
    const answerDiv = document.getElementById(`node-${answerNode.tid}`);
    if (answerDiv) {
      answerDiv.innerHTML = `<div class="node-com">${answerNode.com_name}</div>`;
    }
    this.updateNodeProximityStyles();
  }

  /**
   * Synchronizes canvas rendering buffer allocations to match DOM bounding metrics.
   */
  resizeCanvas(height = this.container.clientHeight) {
    const width = this.container.clientWidth;
    const pixelRatio = window.devicePixelRatio || 1;

    this.canvas.width = Math.max(1, width * pixelRatio);
    this.canvas.height = Math.max(1, height * pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  /**
   * The continuous math update and paint loop. Runs via requestAnimationFrame.
   */
  tick() {
    this.resizeCanvas();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.nodes.forEach((node) => {
      if (node.inflation < 1.0) {
        node.inflation += 0.015;
        if (node.inflation > 1.0) node.inflation = 1.0;
      }
    });

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
        node.vy += this.GRAVITY * node.inflation;
      }
    });

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
        node.y = 60;
      }

      if (node.element) {
        node.element.style.left = `${node.x}px`;
        node.element.style.top = `${node.y}px`;
      }

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

          this.ctx.strokeStyle = this.getTreeLineColor(node.inflation);
          this.ctx.stroke();
        }
      }
    });

    requestAnimationFrame(this.tick);
  }
}

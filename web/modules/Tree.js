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
    this.INFLUENCE_DIST = 300;
    this.DESKTOP_SPRING_LENGTH = 60;
    this.MOBILE_SPRING_LENGTH = 40;
    this.SPRING_LENGTH = this.DESKTOP_SPRING_LENGTH;
    this.K_SPRING = 0.05;
    this.REPULSION = 2000;
    this.FRICTION = 0.82;
    this.GRAVITY = 0.2;
    this.MAX_FORCE = 0.5;
    this.FRAME_INTERVAL = 1000 / 30;

    this.nodes = [];
    this.nodeByTid = new Map();
    this.nodeClickHandler = null;
    this.answerTid = null;
    this.treeLineRGB = "48, 54, 61";
    this.activeTheme = null;
    this.lastCanvasWidth = 0;
    this.lastCanvasHeight = 0;
    this.lastPixelRatio = 0;
    this.lastContainerHeight = 0;
    this.resizeCanvas();

    this.previousTime = null;
    this.limiter = 0.0;
    this.newNodes = true;
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  updateSpringLength() {
    this.SPRING_LENGTH =
      window.innerWidth <= 600
        ? this.MOBILE_SPRING_LENGTH
        : this.DESKTOP_SPRING_LENGTH;
  }

  refreshThemeCache() {
    const theme = document.body.dataset.theme || "dark";
    if (theme === this.activeTheme) return;

    this.activeTheme = theme;
    this.treeLineRGB =
      getComputedStyle(document.body)
        .getPropertyValue("--color-tree-line-rgb")
        .trim() || "48, 54, 61";
  }

  getNodeTransform(x, y, scale = 1) {
    return `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
  }

  measureLabelTextWidth(labelElement, text) {
    const computedStyle = getComputedStyle(labelElement);
    this.ctx.save();
    this.ctx.font =
      computedStyle.font ||
      `${computedStyle.fontStyle} ${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;
    const width = this.ctx.measureText(text).width;
    this.ctx.restore();
    return width;
  }

  updateNodeLabelWidth(nodeElement) {
    const labelElement = nodeElement.querySelector(".tree-node-label");
    if (!labelElement) return;

    labelElement.style.width = "";

    const maxWidth = 92;
    const maxLines = 3;
    const labelText = labelElement.textContent?.trim() || "";
    const words = labelText.split(/\s+/).filter(Boolean);

    if (words.length < 2) return;

    const lineWidths = (lines) =>
      Math.max(
        ...lines.map((line) => this.measureLabelTextWidth(labelElement, line)),
      );

    let bestTwoLineWidth = Infinity;
    for (let splitIndex = 1; splitIndex < words.length; splitIndex++) {
      const candidateWidth = lineWidths([
        words.slice(0, splitIndex).join(" "),
        words.slice(splitIndex).join(" "),
      ]);

      if (candidateWidth < bestTwoLineWidth) {
        bestTwoLineWidth = candidateWidth;
      }
    }

    let bestWidth = bestTwoLineWidth;

    if (bestTwoLineWidth > maxWidth && maxLines >= 3 && words.length >= 3) {
      bestWidth = maxWidth;

      for (let firstSplit = 1; firstSplit < words.length - 1; firstSplit++) {
        for (
          let secondSplit = firstSplit + 1;
          secondSplit < words.length;
          secondSplit++
        ) {
          const candidateWidth = lineWidths([
            words.slice(0, firstSplit).join(" "),
            words.slice(firstSplit, secondSplit).join(" "),
            words.slice(secondSplit).join(" "),
          ]);

          if (candidateWidth < bestWidth) {
            bestWidth = candidateWidth;
          }
        }
      }
    }

    if (bestWidth < maxWidth) {
      labelElement.style.width = `${Math.ceil(bestWidth + 2)}px`;
    }
  }

  getTreeLineColor(opacity) {
    return `rgba(${this.treeLineRGB}, ${opacity})`;
  }

  /**
   * Reset the tree ready for a new game.
   */
  reset() {
    this.nodes = [];
    this.nodeByTid.clear();
    this.answerTid = null;
    this.overlay.innerHTML = "";
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.resizeCanvas();
  }

  rebuildDerivedData() {
    this.nodeByTid.clear();

    this.nodes.forEach((node) => {
      node.nchildren = 1;
      node.parentNode = null;
      this.nodeByTid.set(node.tid, node);
    });

    this.nodes.forEach((node) => {
      if (node.sub_ptid !== null) {
        const parentNode = this.nodeByTid.get(node.sub_ptid) || null;
        node.parentNode = parentNode;
        if (parentNode) {
          parentNode.nchildren += 1;
        }
      }
    });
  }

  /**
   * Main Data Synchronization Bridge.
   * Compares currently running nodes against the list of active/visible nodes
   * handed down from the Game controller.
   * @param {Array} visibleNodesData - Array of plain node data objects from Game class
   */
  updateTreeLayout(visibleNodesData) {
    const width = this.container.clientWidth;

    let new_clades = [];
    visibleNodesData.forEach((cladeData) => {
      let existingNode = this.nodes.find((n) => n.tid === cladeData.tid);

      if (cladeData.state === CladeState.ANSWER) {
        this.answerTid = cladeData.tid;
      }

      if (!existingNode) {
        this.newNodes = true;
        new_clades.push(cladeData);
      } else {
        Object.assign(existingNode, cladeData);
        existingNode.isRoot = existingNode.sub_ptid === null;
      }
    });

    new_clades.forEach((cladeData) => {
      const isRoot = cladeData.sub_ptid === null;

      let existingNode = {
        ...cladeData,
        x: isRoot ? width / 2 : width / 2,
        y: isRoot ? 60 : 150,
        vx: 0,
        vy: 0,
        isRoot,
        element: null,
        spawned: false,
        inflation: 0.01,
        target_link: this.SPRING_LENGTH,
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
    });

    this.rebuildDerivedData();
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
        div.style.left = "0";
        div.style.top = "0";
        div.style.opacity = "0";
        div.style.transform = this.getNodeTransform(node.x, node.y, 0.96);

        div.addEventListener("click", () => {
          if (this.nodeClickHandler) this.nodeClickHandler(node.tid);
        });

        this.overlay.appendChild(div);
        node.element = div;
        node.spawned = true;

        requestAnimationFrame(() => {
          div.style.opacity = "1";
          div.style.transform = this.getNodeTransform(node.x, node.y, 1);
          this.updateNodeLabelWidth(div);
        });
      } else if (node.element) {
        node.element.innerHTML = label;
        this.updateNodeLabelWidth(node.element);
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

    return `<div class="tree-node-label">${name}</div>`;
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
      answerDiv.innerHTML = `<div class="tree-node-label node-com">${answerNode.com_name}</div>`;
    }
    this.updateNodeProximityStyles();
  }

  /**
   * Synchronizes canvas rendering buffer allocations to match DOM bounding metrics.
   */
  resizeCanvas(height = this.container.clientHeight) {
    const width = this.container.clientWidth;
    const pixelRatio = window.devicePixelRatio || 1;

    if (height !== this.lastContainerHeight) {
      this.container.style.height = `${height}px`;
      this.lastContainerHeight = height;
    }

    const nextCanvasWidth = Math.max(1, width * pixelRatio);
    const nextCanvasHeight = Math.max(1, height * pixelRatio);

    if (
      nextCanvasWidth !== this.lastCanvasWidth ||
      nextCanvasHeight !== this.lastCanvasHeight ||
      pixelRatio !== this.lastPixelRatio
    ) {
      this.canvas.width = nextCanvasWidth;
      this.canvas.height = nextCanvasHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      this.lastCanvasWidth = nextCanvasWidth;
      this.lastCanvasHeight = nextCanvasHeight;
      this.lastPixelRatio = pixelRatio;
    }
  }

  getViewportHeight() {
    return (
      this.container.parentElement?.clientHeight || this.container.clientHeight
    );
  }

  getRequiredHeight() {
    const viewportHeight = this.getViewportHeight();
    const margin = 50;
    const bottomPadding = 90;

    const predictedBottom = this.nodes.reduce((maxBottom, node) => {
      const nextY = node.isRoot ? 60 : node.y + node.vy;
      return Math.max(maxBottom, nextY);
    }, 60);

    return Math.max(
      viewportHeight,
      Math.ceil(predictedBottom + margin + bottomPadding),
    );
  }

  /**
   * The continuous math update and paint loop. Runs via requestAnimationFrame.
   */
  tick(timestamp) {
    this.refreshThemeCache();
    this.updateSpringLength();

    if (this.previousTime === null) {
      this.previousTime = timestamp;
    }

    // scale dt to prevent animation speed depending on screen refresh rate
    // NOTE: this does mean that sufficiently slowly refreshing screen might
    // cause numerical instabilities
    let dt = (timestamp - this.previousTime) / 17.0;
    this.previousTime = timestamp;

    // if a new node has been added, add a limiter to the dynamics
    if (this.newNodes) {
      this.newNodes = false;
      this.limiter = 0.1;
    }
    this.limiter += dt * 0.05;
    if (this.limiter > 1.0) this.limiter = 1.0;
    dt *= this.limiter;

    this.resizeCanvas(this.getRequiredHeight());
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // compute how dense the nodes are vertically
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodes[i].density = 0.0;
    }
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        // work out the vertical distance between the nodes
        const dy = Math.abs(this.nodes[j].y - this.nodes[i].y);
        const s = Math.exp(-(dy * dy) / (60 * 60)); // TODO think of another function
        if (dy > 0) {
          this.nodes[i].density += s;
          this.nodes[j].density += s;
        }
      }
    }

    // slowly limit/grow the target link length depending on the density of nodes vertically
    for (let i = 0; i < this.nodes.length; i++) {
      const target_scale = 0.5 + 0.5 * Math.tanh(this.nodes[i].density);
      const target_link = this.SPRING_LENGTH * target_scale;

      // apply relaxation to prevent sharp movements
      this.nodes[i].target_link =
        0.2 * this.nodes[i].target_link + 0.8 * target_link;
    }

    // slowly increase the amount of force that a node can experience
    // this prevents newly created nodes zooming about
    this.nodes.forEach((node) => {
      if (node.inflation < 1.0) {
        node.inflation += dt * 0.015;
        if (node.inflation > 1.0) node.inflation = 1.0;
      }
    });

    // compute pairwise interactions
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        // work out the gap between the nodes
        let dx = this.nodes[j].x - this.nodes[i].x;
        let dy = this.nodes[j].y - this.nodes[i].y;

        // prevent exactly overlapping nodes
        if (dx == 0.0) dx = 0.01;
        if (dy == 0.0) dy = 0.01;

        let dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // distant nodes do not influence one another
        if (dist < this.INFLUENCE_DIST) {
          // compute total force, accounting for early-time limiting and overall limiting
          let combinedInflation =
            this.nodes[i].inflation * this.nodes[j].inflation;
          let force = (this.REPULSION * combinedInflation) / (dist * dist);
          if (force > this.MAX_FORCE) force = this.MAX_FORCE;

          // increase horizontal force
          // TODO: this is largely to separate labels, could remove if
          // we computed distance between label edges rather than node
          // centres
          let fx = 2 * (dx / dist) * force;
          let fy = (dy / dist) * force;

          // vertically distant points don't influence each other horizontally
          const ady = Math.abs(dy);
          // TODO: play with the distance and falloff
          if (ady > 100) {
            fx *= Math.exp(1 - ady / 100);
          }

          // apply the forces to each node in opposing directions
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

    // try to ensure all linked nodes are a distance of SPRING_LENGTH apart
    this.nodes.forEach((node) => {
      if (node.parentNode) {
        const parent = node.parentNode;
        let dx = parent.x - node.x;
        let dy = parent.y + 60 - node.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;

        let currentTargetLength =
          (node.target_link * node.inflation * (parent.nchildren + 1)) / 4;
        let displacement = dist - currentTargetLength;
        let ratio = Math.abs(displacement) / (10 * currentTargetLength);
        let force = displacement * this.K_SPRING * (1 + ratio); // increase the force as we get further from the target

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

      // use a gravity-like force to ensure a top-down tree
      if (!node.isRoot) {
        node.vy += this.GRAVITY * node.inflation;
      }
    });

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.lineWidth = 1.5;

    // move the nodes
    this.nodes.forEach((node) => {
      if (!node.isRoot) {
        node.x += dt * node.vx;
        node.y += dt * node.vy;
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
        node.element.style.transform = this.getNodeTransform(node.x, node.y, 1);
      }

      if (node.sub_ptid !== null) {
        if (node.parentNode) {
          const parent = node.parentNode;
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

import { CLADE_LIST, CladeState } from "../data/clades.js";
import { SPECIES_LISTS } from "../data/species.js";
import { loadGameStats, saveGameStats } from "./Storage.js";

const NUM_CLADES = CLADE_LIST.length;
const NUM_GUESSES = [18, 22, 25];
export const DAILY_ROOT_TID = 0;
export const DAILY_SPECIES_POOL_SIZE = 2;

const GAME_MODE = Object.freeze({
  DAILY: "daily",
  CUSTOM: "custom",
});

export const GameState = Object.freeze({
  PLAYING: 0,
  WON: 1,
  LOST: 2,
});

export const GuessInfo = Object.freeze({
  NONE: 0, // bad guess, no info
  LOW: 1, // bad guess, got some info
  MEDIUM: 2, // good guess, unfortunately no advance
  HIGH: 3, // good guess, advanced the tree
  ANSWER: 4, // good guess, got the answer
});

function getCurrentDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateDayNumber(dateKey) {
  const [year, month, day] = dateKey
    .split("-")
    .map((value) => parseInt(value, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function mixUint32(value) {
  let mixed = (value ^ 0x9e3779b9) >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x85ebca6b) >>> 0;
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2ae35) >>> 0;
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

export class Game {
  /**
   * Construct a new Game
   * @param {int} tid - taxon ID (ie the position in CLADE_DATABASE) of the answer
   * @param {int} root - taxon ID (ie the position in CLADE_DATABASE) of the root node
   * @param {int} size - size of the species list (0/1/2, small/medium/large)
   */
  constructor(tid, root = 0, size = 1) {
    this.hint_cost = 3;
    this.root = root;
    this.size = size;
    this.answer = tid;
    this.mode = GAME_MODE.CUSTOM;
    this.tree = CLADE_LIST;
    this.guessesRemaining = NUM_GUESSES[this.size];
    this.guesses = [];
    this.guessStrings = [];
    // Record ordered guesses and hints so saved games can reproduce the tree.
    this.actionHistory = [];
    this.state = GameState.PLAYING; // 0: playing, 1: won, 2: lost
    this.subtree = [];
    this.species_tids = [];
    this.restart(tid, this.root, this.size);

    // Load existing stats or initialize fresh defaults
    this.stats = loadGameStats();
  }

  computeChildren() {
    // Compute the total number of leaves below every node
    // reset the number of leaves so only valid species are non-zero
    this.tree.forEach((node) => {
      node.num_leaves = 0;
      node.children = new Set([]);
    });

    // start at each leaf and go  the tree, incrementing the number of
    // leaves beneath each node as we do so
    SPECIES_LISTS[this.size].forEach((entry) => {
      let tid = entry[1];

      while (true) {
        this.tree[tid].num_leaves += 1;
        let ptid = this.tree[tid].ptid;

        if (ptid === null) {
          break;
        }

        this.tree[ptid].children.add(tid);
        tid = ptid;
      }
    });

    this.tree.forEach((node) => {
      node.children = Array.from(node.children);
    });
  }

  /**
   * Reset the game to a blank state (all nodes hidden and off-chain)
   */
  reset(deep_reset = false) {
    // reset the nodes
    for (let i = 0; i < NUM_CLADES; i++) {
      this.tree[i].state = CladeState.OFF;
      this.tree[i].onChain = false;
      this.tree[i].sub_ptid = this.tree[i].ptid;
    }

    // update the common names of species
    SPECIES_LISTS[this.size].forEach((entry) => {
      let name = entry[0];
      let tid = entry[1];
      this.tree[tid].com_name = name;
    });

    // TODO: also this.tree[0].num_leaves exists
    if (deep_reset) {
      this.computeChildren();
    }
  }

  /**
   * Get a random valid species ID
   * @returns a species TID
   */
  getRandomSpeciesTID() {
    return this.species_tids[
      Math.floor(Math.random() * this.species_tids.length)
    ];
  }

  /**
   * Set the game to the initial condition
   * @param {int} tid - taxon ID (ie the position in CLADE_DATABASE) of the answer
   * @param {int} root - taxon ID (ie the position in CLADE_DATABASE) of the root node
   * @param {int} size - size of the species list (0/1/2, small/medium/large)
   */
  restart(tid = -1, root = 0, size = 2) {
    let deep_reset = false;
    if (this.root !== root || this.size !== size) {
      deep_reset = true;
    }

    this.hint_cost = 3;
    this.root = root;
    this.size = size;

    // if the TID is invalid, pick our own
    this.getSpeciesTIDs();
    if (tid === -1) {
      tid = this.getRandomSpeciesTID();
    }
    console.log(`RESTART (${tid}: ${this.tree[tid].com_name})`);

    this.answer = tid;
    this.guessesRemaining = NUM_GUESSES[this.size];
    this.guesses = [];
    this.guessStrings = [];
    // A restarted game must not inherit actions from the previous board.
    this.actionHistory = [];
    this.state = GameState.PLAYING;

    this.reset(deep_reset);

    this.subtree = new Set([this.root, tid]);

    // show the root node
    this.tree[this.root].sub_ptid = null;
    this.tree[this.root].onChain = true;
    this.tree[this.root].state = CladeState.VISIBLE;

    // go up the tree and add the nodes to the chain
    while (tid != this.root) {
      this.tree[tid].onChain = true;
      this.tree[tid].state = CladeState.HIDDEN;
      tid = this.tree[tid].ptid;
    }

    this.tree[this.answer].state = CladeState.ANSWER;
    this.tree[this.answer].sub_ptid = this.root;
  }

  restartDailyGame() {
    this.mode = GAME_MODE.DAILY;
    const dateKey = getCurrentDateKey();
    let dailyAnswer = this.getDailySpeciesTID(dateKey);

    // add some custom overrides for special dates
    if (dateKey.endsWith("12-25")) {
      // Christmas
      dailyAnswer = 1277;
    }
    if (dateKey.endsWith("08-25")) {
      // Birthday
      const options = [
        762, 662, 139, 1163, 1337, 1336, 1286, 940, 730, 1331, 1267, 381, 1127,
        1009, 764, 1215, 467, 706, 854, 646, 1138, 604, 125,
      ];
      const currentYear = new Date().getFullYear();
      const yearIndex =
        (((currentYear - 2027) % options.length) + options.length) %
        options.length;
      dailyAnswer = options[yearIndex];
    }

    // Keep date overrides playable if the species or clade data changes later.
    const dailySpeciesTIDs = this.getSpeciesTIDs(
      false,
      DAILY_ROOT_TID,
      DAILY_SPECIES_POOL_SIZE,
    );
    if (!dailySpeciesTIDs.includes(dailyAnswer)) {
      dailyAnswer = this.getDailySpeciesTID(dateKey);
    }

    this.restart(dailyAnswer, DAILY_ROOT_TID, DAILY_SPECIES_POOL_SIZE);
  }

  restartCustomGame(tid = -1, root = this.root, size = this.size) {
    this.mode = GAME_MODE.CUSTOM;
    this.restart(tid, root, size);
  }

  /**
   * Generate the currently valid species
   * @param {boolean} includeNames - whether to also include the names in the returned array
   * @returns an array of valid species TIDs (or [name, tid] pairs) for the current setup
   */
  getSpeciesTIDs(includeNames = false, root = this.root, size = this.size) {
    let tids = [];

    SPECIES_LISTS[size].forEach((entry) => {
      let name = entry[0];
      let tid = entry[1];

      // check if the chain starting at this TID passes through the root node,
      // and only add it to the list if it does
      let stid = tid;
      while (this.tree[tid].ptid !== null) {
        if (this.tree[tid].ptid === root) {
          if (includeNames) {
            tids.push([name, stid]);
          } else {
            tids.push(stid);
          }
          break;
        }
        tid = this.tree[tid].ptid;
      }
    });

    if (!includeNames) {
      this.species_tids = tids;
    }

    return tids;
  }

  getDailySpeciesTID(dateKey = getCurrentDateKey()) {
    const dailySpeciesTIDs = this.getSpeciesTIDs(
      false,
      DAILY_ROOT_TID,
      DAILY_SPECIES_POOL_SIZE,
    );
    const mixedDaySeed = mixUint32(getDateDayNumber(dateKey));
    return dailySpeciesTIDs[mixedDaySeed % dailySpeciesTIDs.length];
  }

  /**
   *
   * @returns An array of all the nodes in the current subtree
   */
  getCurrentTree() {
    return Array.from(this.subtree, (i) => this.tree[i]);
  }

  /**
   * @returns the node representing the closest known clade to the answer
   */
  getBestTID() {
    if (this.state === GameState.PLAYING) {
      return this.tree[this.answer].sub_ptid;
    }
    return this.answer;
  }

  /**
   * @returns how many turns the player has taken
   */
  getTurnsTaken() {
    return NUM_GUESSES[this.size] - this.guessesRemaining;
  }

  /**
   * Get the clade that would be the next hint
   * @returns the TID of the hint clade
   */
  getHintTID() {
    let tid = this.answer;

    // go up the chain until we hit something visible
    let ptid = this.tree[tid].ptid;
    while (this.tree[ptid].state !== CladeState.VISIBLE) {
      tid = ptid;
      ptid = this.tree[tid].ptid;
    }

    return tid;
  }

  /**
   * Whether the player can ask for a hint
   * @returns true/false
   */
  canHint() {
    // TODO: also check how close we are to the answer
    if (
      this.guessesRemaining > this.hint_cost &&
      this.getTurnsTaken() > 0 &&
      this.getHintTID() !== this.answer &&
      this.state === GameState.PLAYING
    ) {
      return true;
    }
    return false;
  }

  /**
   * Shows the next clade
   * @param {boolean} recordAction - whether this hint should be persisted
   */
  getHint(recordAction = true) {
    this.guessesRemaining -= this.hint_cost;
    const hint = this.getHintTID();
    this.subtree.add(hint);
    this.tree[hint].state = CladeState.VISIBLE;
    this.tree[this.answer].sub_ptid = hint;
    if (recordAction) {
      this.actionHistory.push({ type: "hint" });
    }
    return this.hint_cost;
  }

  /**
   * Handle a guess submission
   * @param {string} guess - user submitted guess string
   * @param {boolean} saveResult - whether completion should update player stats
   * @param {boolean} recordAction - whether this guess should be persisted
   * @returns an array of:
   *    whether the guess was valid,
   *    whether the game has ended,
   *    an array of nodes to be added to the tree
   *    the level of info the guess gave
   */
  submitGuess(guess, saveResult = true, recordAction = true) {
    // go through the species and find the guess
    let tid = -1;
    const num_species = SPECIES_LISTS[this.size].length;
    for (let i = 0; i < num_species; i++) {
      // SPECIES_LISTS[this.size][i][0] can be a string or a list
      if (
        typeof SPECIES_LISTS[this.size][i][0] === "string" ||
        SPECIES_LISTS[this.size][i][0] instanceof String
      ) {
        if (guess === SPECIES_LISTS[this.size][i][0]) {
          tid = SPECIES_LISTS[this.size][i][1];
        }
      } else {
        for (let j = 0; j < SPECIES_LISTS[this.size][i][0].length; j++) {
          if (guess === SPECIES_LISTS[this.size][i][0][j]) {
            tid = SPECIES_LISTS[this.size][i][1];
          }
        }
      }

      if (tid !== -1) {
        break;
      }
    }

    // early exit if this isn't a real guess or if we've already guessed it
    if (tid === -1 || this.guesses.includes(tid)) {
      return [false, false, [], GuessInfo.NONE];
    }

    this.guesses.push(tid);
    this.guessStrings.push(guess);
    if (recordAction) {
      this.actionHistory.push({ type: "guess", guess });
    }
    this.guessesRemaining--;

    // correct answer means game over
    if (this.answer === tid) {
      if (saveResult) {
        this.saveGameResult(true);
      }
      this.state = GameState.WON;
      this.tree[tid].state = CladeState.VISIBLE;
      return [true, true, [this.tree[tid]], GuessInfo.ANSWER];
    }

    // incorrect guess, update the tree
    // set the guess to be visible then travel up until we find a node that's in the subtree
    let info = GuessInfo.NONE; // default to a bad guess with no new info
    let updated_nodes = [tid]; // record which nodes have been updated
    this.tree[tid].state = CladeState.VISIBLE;
    let ptid = this.tree[tid].ptid;
    while (this.tree[ptid].state === CladeState.OFF) {
      tid = ptid;
      this.tree[tid].state = CladeState.HIDDEN;
      ptid = this.tree[tid].ptid;
    }

    let maybe_low_info = false;
    let maybe_high_info = false;

    // if the new ptid is already the (current) ptid of the answer
    // then this was a good guess but unlucky
    if (
      this.tree[ptid].state === CladeState.VISIBLE &&
      this.tree[this.answer].sub_ptid === ptid
    ) {
      info = GuessInfo.MEDIUM;
    }

    // if the new ptid was hidden and is also on chain then the guess
    // has revealed a new level so is good and lucky
    // NOTE: we don't know if this is the case until a bit later when
    // we've updated the visible subtree
    else if (
      this.tree[ptid].state === CladeState.HIDDEN &&
      this.tree[ptid].onChain
    ) {
      maybe_high_info = true;
    }

    // if the ptid is off chain but was hidden and its parent is the
    // (current) parent of the answer then technically it's a bad guess
    // but often this gives an imperfect player some info
    // NOTE: we don't know if this is the case until a bit later when
    // we've updated the visible subtree
    else if (
      this.tree[ptid].state === CladeState.HIDDEN &&
      !this.tree[ptid].onChain
    ) {
      maybe_low_info = true;
    }

    this.tree[ptid].state = CladeState.VISIBLE;
    updated_nodes.push(ptid);

    // add both nodes to the subtree
    this.subtree.add(updated_nodes[1]);
    this.subtree.add(updated_nodes[0]);

    // define the subtree network
    this.tree[updated_nodes[0]].sub_ptid = ptid;
    this.tree[updated_nodes[0]].com_name = guess;

    // update any existing nodes that are affected by the new interim node `ptid`
    [...this.guesses, this.answer].forEach((tid) => {
      while (tid !== this.root) {
        // go up the tree until we find the next visible node, which will be the sub_ptid
        let ptid = this.tree[tid].ptid;
        while (this.tree[ptid].state === CladeState.HIDDEN && ptid !== 0) {
          ptid = this.tree[ptid].ptid;
        }

        // adjust the subtree link
        if (this.tree[tid].sub_ptid !== ptid) {
          updated_nodes.push(tid);
          this.tree[tid].sub_ptid = ptid;
        }

        // continue up the tree
        tid = ptid;
      }
    });

    let has_ended = false;
    if (this.guessesRemaining === 0) {
      if (saveResult) {
        this.saveGameResult(false);
      }
      this.state = GameState.LOST;
      has_ended = true;
    }

    if (
      maybe_low_info &&
      this.tree[updated_nodes[1]].sub_ptid === this.tree[this.answer].sub_ptid
    ) {
      info = GuessInfo.LOW;
    }

    if (
      maybe_high_info &&
      updated_nodes[1] === this.tree[this.answer].sub_ptid
    ) {
      info = GuessInfo.HIGH;
    }

    console.log(`guess level: ${info}`);

    // ensure that the updated node list is sorted and unique
    updated_nodes = [...new Set(updated_nodes)].toSorted((a, b) => a - b);
    return [
      true,
      has_ended,
      Array.from(updated_nodes, (i) => this.tree[i]),
      info,
    ];
  }

  /**
   * Call this method exactly when hasEnded becomes true
   * @param {boolean} isWin
   */
  saveGameResult(isWin) {
    // Slot zero records failures; winning slots are indexed by turns used.
    const resultIndex = isWin
      ? Math.min(25, Math.max(1, this.getTurnsTaken()))
      : 0;
    this.stats.totalPlayed += 1;
    this.stats.totalGuessDistribution[resultIndex] += 1;

    if (isWin) {
      this.stats.totalWon += 1;
    }

    if (this.mode !== GAME_MODE.DAILY) {
      saveGameStats(this.stats);
      return;
    }

    const todayKey = getCurrentDateKey();
    if (this.stats.lastCompletedDailyDate === todayKey) {
      saveGameStats(this.stats);
      return;
    }

    this.stats.played += 1;
    this.stats.dailyGuessDistribution[resultIndex] += 1;

    if (isWin) {
      this.stats.won += 1;
      this.stats.currentStreak += 1;
      if (this.stats.currentStreak > this.stats.longestStreak) {
        this.stats.longestStreak = this.stats.currentStreak;
      }
    } else {
      this.stats.currentStreak = 0; // Break the streak
    }

    this.stats.lastCompletedDailyDate = todayKey;

    // Commit cleanly to local browser storage
    saveGameStats(this.stats);
  }

  getStats() {
    return this.stats;
  }

  isDailyMode() {
    return this.mode === GAME_MODE.DAILY;
  }

  hasCompletedDailyGame(dateKey = getCurrentDateKey()) {
    return this.stats.lastCompletedDailyDate === dateKey;
  }

  eraseStats() {
    this.stats.played = 0;
    this.stats.won = 0;
    this.stats.currentStreak = 0;
    this.stats.longestStreak = 0;
    this.stats.totalPlayed = 0;
    this.stats.totalWon = 0;
    this.stats.lastCompletedDailyDate = null;
    // Keep the histogram state consistent with the cleared summary totals.
    this.stats.dailyGuessDistribution.fill(0);
    this.stats.totalGuessDistribution.fill(0);
    saveGameStats(this.stats);
  }

  // compute the optimal guess at this point
  getOptimalGuess() {
    // start at the best-known clade
    let tid = this.getBestTID();

    while (true) {
      if (this.tree[tid].num_leaves === 1) {
        break;
      }

      // only retain children that are on the correct branch or have not been guessed
      let options = [];
      this.tree[tid].children.forEach((child_tid) => {
        if (
          this.tree[child_tid].onChain ||
          this.tree[child_tid].state === CladeState.OFF
        ) {
          options.push(child_tid);
        }
      });

      // pick next TID
      tid = options.reduce((max, i) =>
        this.tree[i].num_leaves > this.tree[max].num_leaves ? i : max,
      );
    }
    console.log(`BEST GUESS: ${this.tree[tid].com_name}`);
  }
}

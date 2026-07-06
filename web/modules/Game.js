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

function getCurrentDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
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
    this.state = GameState.PLAYING; // 0: playing, 1: won, 2: lost
    this.subtree = [];
    this.species_tids = [];
    this.restart(tid, this.root, this.size);

    // Load existing stats or initialize fresh defaults
    this.stats = loadGameStats();
  }

  /**
   * Reset the game to a blank state (all nodes hidden and off-chain)
   */
  reset() {
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
  restart(tid = -1, root = 0, size = 1) {
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
    this.state = GameState.PLAYING;

    this.reset();

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
    const dailyAnswer = this.getDailySpeciesTID(dateKey);
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
    return dailySpeciesTIDs[hashString(dateKey) % dailySpeciesTIDs.length];
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
      this.getHintTID() !== this.answer
    ) {
      return true;
    }
    return false;
  }

  /**
   * Shows the next clade
   */
  getHint() {
    this.guessesRemaining -= this.hint_cost;
    const hint = this.getHintTID();
    this.subtree.add(hint);
    this.tree[hint].state = CladeState.VISIBLE;
    this.tree[this.answer].sub_ptid = hint;
  }

  /**
   * Handle a guess submission
   * @param {string} guess - user submitted guess string
   * @returns an array of:
   *    whether the guess was valid,
   *    whether the game has ended,
   *    an array of nodes to be added to the tree
   */
  submitGuess(guess) {
    // go through the species and find the guess
    let tid = -1;
    const num_species = SPECIES_LISTS[this.size].length;
    for (let i = 0; i < num_species; i++) {
      if (guess === SPECIES_LISTS[this.size][i][0]) {
        tid = SPECIES_LISTS[this.size][i][1];
      }
    }

    // early exit if this isn't a real guess or if we've already guessed it
    if (tid === -1 || this.guesses.includes(tid)) {
      return [false, false, []];
    }

    this.guesses.push(tid);
    this.guessesRemaining--;

    // correct answer or out of guesses means game over
    if (this.answer === tid) {
      this.saveGameResult(true);
      this.state = GameState.WON;
      this.tree[tid].state = CladeState.VISIBLE;
      return [true, true, [this.tree[tid]]];
    }

    // incorrect guess, update the tree
    // set the guess to be visible then travel up until we find a node that's in the subtree
    let updated_nodes = [tid]; // record which nodes have been updated
    this.tree[tid].state = CladeState.VISIBLE;
    let ptid = this.tree[tid].ptid;
    while (this.tree[ptid].state === CladeState.OFF) {
      tid = ptid;
      this.tree[tid].state = CladeState.HIDDEN;
      ptid = this.tree[tid].ptid;
    }
    this.tree[ptid].state = CladeState.VISIBLE;
    updated_nodes.push(ptid);

    // add both nodes to the subtree
    this.subtree.add(updated_nodes[1]);
    this.subtree.add(updated_nodes[0]);

    // define the subtree network
    this.tree[updated_nodes[0]].sub_ptid = ptid;

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
      this.saveGameResult(false);
      this.state = GameState.LOST;
      has_ended = true;
    }

    // ensure that the updated node list is sorted and unique
    updated_nodes = [...new Set(updated_nodes)].toSorted((a, b) => a - b);
    return [true, has_ended, Array.from(updated_nodes, (i) => this.tree[i])];
  }

  /**
   * Call this method exactly when hasEnded becomes true
   * @param {boolean} isWin
   */
  saveGameResult(isWin) {
    this.stats.totalPlayed += 1;

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
    saveGameStats(this.stats);
  }
}

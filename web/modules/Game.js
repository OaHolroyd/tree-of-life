import { CLADE_LIST, CladeState } from "../data/clades.js";
import { SPECIES_LISTS, SPECIES_LIST } from "../data/species.js";
import { loadGameStats, saveGameStats } from "./Storage.js";

const NUM_GUESSES = 20;
const NUM_CLADES = CLADE_LIST.length;
const NUM_SPECIES = SPECIES_LIST.length;

export const GameState = Object.freeze({
  PLAYING: 0,
  WON: 1,
  LOST: 2,
});

export class Game {
  /**
   * Construct a new Game
   * @param {int} tid - taxon ID (ie the position in CLADE_DATABASE) of the answer
   * @param {int} root - taxon ID (ie the position in CLADE_DATABASE) of the root node
   * @param {int} size - size of the species list (0/1/2, small/medium/large)
   */
  constructor(tid, root = 0, size = 1) {
    this.root = root;
    this.size = size;
    this.answer = tid;
    this.tree = CLADE_LIST;
    this.guessesRemaining = NUM_GUESSES;
    this.guesses = [];
    this.state = GameState.PLAYING; // 0: playing, 1: won, 2: lost
    this.subtree = [];
    this.restart(tid, this.root, this.size);

    // Load existing stats or initialize fresh defaults
    this.stats = loadGameStats();
  }

  /**
   * Reset the game to a blank state (all nodes hidden and off-chain)
   */
  reset() {
    for (let i = 0; i < NUM_CLADES; i++) {
      this.tree[i].state = CladeState.OFF;
      this.tree[i].onChain = false;
      this.tree[i].sub_ptid = this.tree[i].ptid;
    }
  }

  /**
   * Set the game to the initial condition
   * @param {int} tid - taxon ID (ie the position in CLADE_DATABASE) of the answer
   * @param {int} root - taxon ID (ie the position in CLADE_DATABASE) of the root node
   * @param {int} size - size of the species list (0/1/2, small/medium/large)
   */
  restart(tid, root = 0, size = 1) {
    this.root = root;
    this.size = size;

    // if the TID is invalid, pick our own
    if (tid === -1) {
      const tids = this.getSpeciesTIDs();
      tid = tids[Math.floor(Math.random() * tids.length)];
    }
    console.log(`RESTART (${tid}: ${this.tree[tid].com_name})`);

    this.answer = tid;
    this.guessesRemaining = NUM_GUESSES;
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

  /**
   * Generate the currently valid species
   * @param {boolean} includeNames - whether to also include the names in the returned array
   * @returns an array of valid species TIDs (or [name, tid] pairs) for the current setup
   */
  getSpeciesTIDs(includeNames = false) {
    let tids = [];

    SPECIES_LISTS[this.size].forEach((tid) => {
      // check if the chain starting at this TID passes through the root node,
      // and only add it to the list if it does
      let stid = tid;
      while (this.tree[tid].ptid !== null) {
        if (this.tree[tid].ptid === this.root) {
          if (includeNames) {
            tids.push([this.tree[stid].com_name, stid]);
          } else {
            tids.push(stid);
          }
          break;
        }
        tid = this.tree[tid].ptid;
      }
    });

    return tids;
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
    return NUM_GUESSES - this.guessesRemaining;
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
    for (let i = 0; i < NUM_SPECIES; i++) {
      if (guess === SPECIES_LIST[i][0]) {
        tid = SPECIES_LIST[i][1];
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

    this.subtree.add(tid);

    // incorrect guess, update the tree
    // set the guess to be visible then travel up until we find a node that's in the subtree
    let updated_nodes = [tid]; // record which nodes have been updated
    this.subtree.add(tid);
    this.tree[tid].state = CladeState.VISIBLE;
    let ptid = this.tree[tid].ptid;
    while (this.tree[ptid].state === CladeState.OFF) {
      tid = ptid;
      this.tree[tid].state = CladeState.HIDDEN;
      ptid = this.tree[tid].ptid;
    }
    this.tree[ptid].state = CladeState.VISIBLE;
    updated_nodes.push(ptid);
    this.subtree.add(ptid);

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
      has_ended = true;
    }

    console.log(`  "${guess}" is not the answer (${updated_nodes})`);
    return [true, has_ended, Array.from(updated_nodes, (i) => this.tree[i])];
  }

  /**
   * Call this method exactly when hasEnded becomes true
   * @param {boolean} isWin
   */
  saveGameResult(isWin) {
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

    // Commit cleanly to local browser storage
    saveGameStats(this.stats);
  }

  getStats() {
    return this.stats;
  }

  eraseStats() {
    this.stats.played = 0;
    this.stats.won = 0;
    this.stats.currentStreak = 0;
    this.stats.longestStreak = 0;
    localStorage.setItem("clade_game_stats", JSON.stringify(this.stats));
  }
}

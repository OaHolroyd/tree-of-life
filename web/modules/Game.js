import { CLADE_LIST, CladeState } from "../data/clades.js";
import { SPECIES_LIST } from "../data/species.js";

const NUM_GUESSES = 3;
const NUM_CLADES = CLADE_LIST.length;
const NUM_SPECIES = SPECIES_LIST.length;

export const GameState = Object.freeze({
  PLAYING: 0,
  WON: 1,
  LOST: 2,
});

export class Game {
  constructor(tid) {
    this.answer = tid;
    this.tree = CLADE_LIST;
    this.guessesRemaining = NUM_GUESSES;
    this.guesses = [];
    this.state = 0; // 0: playing, 1: won, 2: lost
    this.subtree = [];
    this.restart(tid);

    // Load existing stats or initialize fresh defaults
    this.stats = JSON.parse(localStorage.getItem("clade_game_stats")) || {
      played: 0,
      won: 0,
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  /**
   * Reset the game to a blank state (all nodes hidden and off-chain)
   */
  reset() {
    for (let i = 0; i < NUM_CLADES; i++) {
      this.tree[i].state = CladeState.OFF;
      this.tree[i].onChain = false;
    }
  }

  /**
   * Set the game to the initial condition
   * @param {int} tid - taxon ID (ie the position in CLADE_DATABASE) of the answer
   */
  restart(tid) {
    console.log(`RESTART (${tid}: ${this.tree[tid].com_name})`);

    this.answer = tid;
    this.guessesRemaining = NUM_GUESSES;
    this.guesses = [];
    this.state = 0;

    this.reset();

    this.subtree = new Set([0, tid]);

    // show the root node
    this.tree[0].onChain = true;
    this.tree[0].state = CladeState.VISIBLE;

    // go up the tree and add the nodes to the chain
    while (tid != 0) {
      this.tree[tid].onChain = true;
      this.tree[tid].state = CladeState.HIDDEN;
      tid = this.tree[tid].ptid;
    }

    this.tree[this.answer].state = CladeState.ANSWER;
    this.tree[this.answer].sub_ptid = 0;
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
      while (tid !== 0) {
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
    localStorage.setItem("clade_game_stats", JSON.stringify(this.stats));
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

#ifndef GAME_H
#define GAME_H


#include "tree.h"


/* ========================================================================== */
/*   TYPE DEFINITIONS                                                         */
/* ========================================================================== */
#define MAX_TURN (50) // max_turn cannot be more than MAX_TURNS

typedef enum {
  GAME_START,
  INVALID_GUESS,
  VALID_GUESS,
  GAME_LOST,
  GAME_WON,
} GameState;

/**
 * The game is composed of a Tree, which defines the game-space, and various
 * state variables, which define the current state of the game.
 */
typedef struct {
  /* fixed game data */
  Tree *tree; // the tree to play the game with
  int max_turn; // maximum number of turns before a loss
  Clade *answer; // pointer to the answer species

  /* varying game status */
  int turn;
  Clade *history[MAX_TURN]; // species guessed this far
  Clade *best_clade; // pointer to the best (ie deepest) clade so far
  GameState state; // last state of the game
} Game;


/* ========================================================================== */
/*   FUNCTION DECLARATIONS                                                    */
/* ========================================================================== */
/**
 * Sets up a game. Returns NULL on failure.
 */
Game *game_init(void);

/**
 * Frees all resources used by the Game.
 */
void game_destroy(Game *game);

/**
 * Resets a game with a new answer ready to play again.
 */
void game_reset(Game *game);

/**
 * Submit a guess, returning the resulting game state.
 */
GameState game_turn(Game *game, const char *guess);

/**
 * Returns 1 if giving a hint is permissible, 0 otherwise.
 */
int game_can_hint(Game *game);

/**
 * Get a hint, advancing by one clade and losing three turns. Returns 1 if a
 * hint was supplied, 0 if it wasn't (too few remaining turns or would reveal
 * the answer).
 */
int game_hint(Game *game);

#endif

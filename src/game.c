#include "game.h"

#include <stdlib.h>

#include "utils.h"
#include "tree.h"
#include "clade-list.h"


/* ========================================================================== */
/*   FUNCTION DEFINITIONS                                                     */
/* ========================================================================== */
Game *game_init(void) {
  Game *game = malloc(sizeof(Game));

  /* create tree */
  game->tree = malloc(sizeof(Tree));
  tree_alloc(game->tree, CLADE_NUM);

  /* load clades into tree */
  for (int i = 0; i < CLADE_NUM; i++) {
    tree_add_clade(game->tree, &CLADE_LIST[i]);
  } // i end

  /* link clades in tree */
  tree_link(game->tree);

  /* set up the game */
  game->max_turn = 20;

  /* set it up to be ready to play */
  game_reset(game);

  return game;
}

void game_destroy(Game *game) {
  free(game->tree);
  free(game);
}

void game_reset(Game *game) {
  /* reset tree parameters */
  for (int i = 0; i < game->tree->size; i++) {
    game->tree->clades[i].on_chain = 0;
  } // i end

  /* pick answer and set chain */
  game->answer = game->tree->species[drand(game->tree->num_species)];
  Clade *clade = game->answer;
  while (clade != game->tree->root) {
    clade->on_chain = 1;
    clade = clade->parent;
  }
  game->tree->root->on_chain = 1;

  /* set to turn zero */
  game->turn = 0;
  game->best_clade = game->tree->root;
  game->state = GAME_START;
}

GameState game_turn(Game *game, const char *guess) {
  /* attempt to find a matching species */
  Clade *species = tree_find_com(game->tree, guess, 1);
  if (species == NULL) {
    return game->state = INVALID_GUESS;
  }

  /* add this to the guess list */
  game->history[game->turn] = species;
  game->turn++;

  /* if it is the answer, the game has been won */
  if (species == game->answer) {
    game->best_clade = species;
    return game->state = GAME_WON;
  }

  /* find the best linking clade */
  Clade *clade = species;
  while (clade->on_chain == 0) {
    clade = clade->parent;
  }

  /* check if it is the new best */
  if (clade->depth > game->best_clade->depth) {
    game->best_clade = clade;
  }

  /* even if it is correct, might be out of turns */
  if (game->turn == game->max_turn) {
    return game->state = GAME_LOST;
  }

  return game->state = VALID_GUESS;
}

int game_can_hint(Game *game) {
  /* if there are three or fewer turns remaining, no hint */
  if (game->max_turn - game->turn <= 3) {
    return 0;
  }

  /* if the hint would reveal the answer, no hint */
  if (game->best_clade == game->answer->parent) {
    return 0;
  }

  /* if it is the first turn, no hint */
  if (game->turn == 0) {
    return 0;
  }

  return 1;
}

int game_hint(Game *game) {
  if (!game_can_hint(game)) {
    return 0;
  }

  /* find the next clade down the chain */
  Clade *hint = NULL;
  for (int i = 0; i < game->best_clade->num_children; i++) {
    if (game->best_clade->children[i]->on_chain) {
      hint = game->best_clade->children[i];
      break;
    }
  } // i end

  /* update with guess */
  game->turn += 3;
  game->best_clade = hint;

  return 1;
}

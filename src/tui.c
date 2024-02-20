#include "tui.h"

/* include notcurses but ignore the warnings associated with it */
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wredundant-decls"
#pragma GCC diagnostic ignored "-Wlogical-op"
#include <notcurses/notcurses.h>
#pragma GCC diagnostic pop

#include "utils.h"
#include "game.h"
#include "clade-list.h"


/* ======================================================================================== */
/*   LAYOUT                                                                                 */
/*                                                                                          */
/*     0    0    1    1    2    2    3    3    4    4    5    5    6    6    7    7         */
/*     0    5    0    5    0    5    0    5    0    5    0    5    0    5    0    5         */
/*    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓    */
/* 00 ┃x╭─────────────────────╮                                                       x┃ 00 */
/* 01 ┃x│ STATS PLANE         │                                                       x┃ 01 */
/* 02 ┃x│                     │                                                       x┃ 02 */
/* 03 ┃x╰─────────────────────╯                                                       x┃ 03 */
/* 04 ┃x╭─────────────────────╮                                                       x┃ 04 */
/* 05 ┃x│ GUESS PLANE         │                                                       x┃ 05 */
/* 06 ┃x╰─────────────────────╯                                                       x┃ 06 */
/* 07 ┃x│ HINT PLANE          │                                                       x┃ 07 */
/* 08 ┃x│                     │                                                       x┃ 08 */
/* 09 ┃x│                     │                                                       x┃ 09 */
/* 10 ┃x│                     │                                                       x┃ 10 */
/* 11 ┃x│                     │                                                       x┃ 11 */
/* 12 ┃x│                     │                                                       x┃ 12 */
/* 13 ┃x│                     │                                                       x┃ 13 */
/* 14 ┃x│                     │                                                       x┃ 14 */
/* 15 ┃x│                     │                                                       x┃ 15 */
/* 16 ┃x│                     │                                                       x┃ 16 */
/* 17 ┃x│                     │                                                       x┃ 17 */
/* 18 ┃x│                     │                                                       x┃ 18 */
/* 19 ┃x│                     │                                                       x┃ 19 */
/* 20 ┃x│                     │                                                       x┃ 20 */
/* 21 ┃x│                     │                                                       x┃ 21 */
/* 22 ┃x╰─────────────────────╯                                                       x┃ 22 */
/* 23 ┃x┄ESC┄PLANE┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄x┃ 23 */
/*    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛    */
/*     0    0    1    1    2    2    3    3    4    4    5    5    6    6    7    7         */
/*     0    5    0    5    0    5    0    5    0    5    0    5    0    5    0    5         */
/*                                                                                          */
/* ======================================================================================== */
/*   TODO LIST                                                                              */
/*  > Add the tree plane (and decide how it will be displayed)                              */
/*  > Write some help/instruction text and allow it to be displayed                         */
/*                                                                                          */
/* ======================================================================================== */



/* ========================================================================== */
/*   TYPE DEFINITIONS                                                         */
/* ========================================================================== */
#define CHEAT_MODE (1)
#define MAX_GUESS (20) // TODO: get this from the clade-list

/**
 * The focus-state represents which plane is currently in focus.
 */
typedef enum Focus {
  FC_GUESS,
  FC_ESC,
  FC_HINT,
} Focus;

/**
 * The UI handles user input, updates the game-state accordingly, and then
 * handles outputting to the screen.
 */
typedef struct GameUI {
  Game *game; // the game to render

  /* focus */
  Focus focus; // the focus state
  Focus prev_focus; // the previous focus state

  /* notcurses */
  struct notcurses *nc;
  unsigned int rows; // rows in terminal
  unsigned int cols; // cols in terminal

  /* image rendering */
  int images_flag; // whether images are supported
  ncblitter_e blitter; // best blitter available
  ncscale_e scaling; // which image scaling to use

  /* planes */
  struct ncplane *pln_std; // standard plane (ie the entire screen)

  struct ncplane *pln_stats; // plane containing game statistics/state
  struct ncplane *pln_guess; // plane for input guess
  struct ncplane *pln_esc; // plane for esc-mode controls
  struct ncplane *pln_tree; // plane for displaying the sub-tree
  struct ncplane *pln_hint; // plane for guess hints (ie completions)

  /* clade plane group */
  struct ncplane *pln_clade; // plane for displaying the best clade
  struct ncplane *pln_clade_text; // plane for displaying the best clade's text
  struct ncplane *pln_clade_img_frame; // plane for displaying the best clade's image
  struct ncplane *pln_clade_img; // plane containing the image

  /* guess state */
  char guess[MAX_GUESS]; // array of chars currently typed in
  int guess_idx; // index of guess
  int guess_len; // length of input
  int guess_max_len; // maximum length of input

  /* hints */
  const char *hints[NUM_SPECIES];
  int hint_idx; // index of scroll position
  int hint_len; // number of hints
  int hint_max_len; // maximum number of hints to find
  int hint_display; // maximum number of hints to display
  int hint_scroll; // how far the list has scrolled down
} GameUI;

/**
 * The update type of a key input to the guess plane.
 */
typedef enum Update {
  UP_NONE, // no change
  UP_ADD_END, // add char to end of guess
  UP_ADD_MID, // add char to middle of guess
  UP_DEL_END, // remove char from end of guess
  UP_DEL_MID, // remove char from middle of guess
  UP_ALL, // all chars of guess changed
} Update;


/* ========================================================================== */
/*   AUXILIARY FUNCTION DEFINITIONS                                           */
/* ========================================================================== */
/* function declarations */
void pln_guess_submit(GameUI *ui);
void pln_clade_update(GameUI *ui);
void pln_esc_update(GameUI *ui);
void pln_guess_update(GameUI *ui);
void pln_stats_update(GameUI *ui);
void pln_hint_update(GameUI *ui, Update update);
void pln_tree_update(GameUI *ui);


/* ======================== */
/*   HELPERS                */
/* ======================== */
// #define CHANNEL(fg, bg) (bg + 0x40u + fg + 0x40u)
// #define CHANNEL(fg, bg) (((((uint64_t)0x40u << 24) + (uint64_t)fg) << 8 + (uint64_t)0x40u) << 24 + fg)

int _notcurses_getvec(struct notcurses* n, const struct timespec* absdl, ncinput* ni, int vcount){
  for(int v = 0 ; v < vcount ; ++v){
    // TODO: sometimes this hangs (probably in a while loop in internal_get)
    uint32_t u = notcurses_get(n, absdl, &ni[v]);
    if(u == (uint32_t)-1){
      if(v == 0){
        return -1;
      }
      return v;
    }else if(u == 0){
      return v;
    }
  }
  return vcount;
}

/**
 * Gobbles up to 1000 inputs over 0.1 seconds. This is useful to prevent
 * garbage being written to the screen when the TUI is launched.
 */
void gobble_inputs(struct notcurses *nc) {
  /* gobble bad inputs in 0.1 seconds */
  #define GOBBLE_LEN (1000)
  ncinput gobble[GOBBLE_LEN];
  for (int i = 0; i < GOBBLE_LEN; i++) {
    gobble[i].id = UINT32_MAX;
  } // i end
  struct timespec ts;
  timespec_get(&ts, TIME_UTC);
  ts.tv_nsec += 100000000; // add a bit of 'gobble' time
  log("");
  _notcurses_getvec(nc, &ts, gobble, GOBBLE_LEN);
  log("");
  for (int i = 0; i < GOBBLE_LEN; i++) {
    if (gobble[i].id == UINT32_MAX) {
      break;
    }

    if (isalpha(gobble[i].id) || isdigit(gobble[i].id)) {
      log("GOBBLED: [%3d] %c", i, gobble[i].id);
    } else {
      log("GOBBLED: [%3d] (%d)", i, gobble[i].id);
    }
  } // i end
}

/**
 * Draws a perimeter round a ncplane.
 */
void ncplane_rounded_perimeter(struct ncplane *n) {
  /* define color/style etc */
  unsigned ctlword = 0;
  uint32_t channels = 0;
  ncchannel_set_rgb8(&channels, 0x00, 0x00, 0x00);
  uint16_t attr = NCSTYLE_NONE;

  /* define cells */
  nccell ul = NCCELL_TRIVIAL_INITIALIZER, ur = NCCELL_TRIVIAL_INITIALIZER;
  nccell ll = NCCELL_TRIVIAL_INITIALIZER, lr = NCCELL_TRIVIAL_INITIALIZER;
  nccell hl = NCCELL_TRIVIAL_INITIALIZER, vl = NCCELL_TRIVIAL_INITIALIZER;
  nccells_rounded_box(n, attr, channels, &ul, &ur, &ll, &lr, &hl, &vl);

  /* draw perimeter */
  ncplane_perimeter(n, &ul, &ur, &ll, &lr, &hl, &vl, ctlword);

  /* drop cells */
  nccell_release(n, &ul); nccell_release(n, &ur);
  nccell_release(n, &ll); nccell_release(n, &lr);
  nccell_release(n, &hl); nccell_release(n, &vl);
}

/**
 * Draws a perimeter round a ncplane starting in the top left that is a maximum
 * of hmax high.
 */
void ncplane_rounded_perimeter_sized(struct ncplane *n, unsigned hmax) {
  /* define color/style etc */
  unsigned ctlword = 0;
  uint32_t channels = 0;
  ncchannel_set_rgb8(&channels, 0x00, 0x00, 0x00);
  uint16_t attr = NCSTYLE_NONE;

  /* define cells */
  nccell ul = NCCELL_TRIVIAL_INITIALIZER, ur = NCCELL_TRIVIAL_INITIALIZER;
  nccell ll = NCCELL_TRIVIAL_INITIALIZER, lr = NCCELL_TRIVIAL_INITIALIZER;
  nccell hl = NCCELL_TRIVIAL_INITIALIZER, vl = NCCELL_TRIVIAL_INITIALIZER;
  nccells_rounded_box(n, attr, channels, &ul, &ur, &ll, &lr, &hl, &vl);

  /* draw perimeter */
  ncplane_cursor_move_yx(n, 0, 0);
  unsigned dimy, dimx;
  ncplane_dim_yx(n, &dimy, &dimx);
  dimy = (hmax < dimy) ? hmax : dimy;
  ncplane_box_sized(n, &ul, &ur, &ll, &lr, &hl, &vl, dimy, dimx, ctlword);

  /* drop cells */
  nccell_release(n, &ul); nccell_release(n, &ur);
  nccell_release(n, &ll); nccell_release(n, &lr);
  nccell_release(n, &hl); nccell_release(n, &vl);
}

/**
 * Set the ui's blitter to the best available, and supply the appropriate
 * scaling.
 */
void set_blitter(GameUI *ui) {
  /* ensure images can be loaded */
  ui->images_flag = notcurses_canopen_images(ui->nc);
  if (!ui->images_flag) {
    return;
  }

  // Potential scaling options
  // NCSCALE_NONE
  // NCSCALE_SCALE
  // NCSCALE_STRETCH
  // NCSCALE_SCALE_HIRES
  // NCSCALE_NONE_HIRES

  /* go from most to least detailed */
  if (notcurses_canpixel(ui->nc)) {
    ui->blitter = NCBLIT_PIXEL;
    ui->scaling = NCSCALE_SCALE_HIRES;
    return;
  }

  // TODO: other blitting methods don't automatically preserve shape
  error("only support for NCBLIT_PIXEL due to scaling issues");
  if (notcurses_cansextant(ui->nc)) {
    // TODO: can't test this one, iTerm2 doesn't support it
    ui->blitter = NCBLIT_3x2;
    ui->scaling = NCSCALE_SCALE;
    return;
  }
  if (notcurses_canquadrant(ui->nc)) {
    ui->blitter = NCBLIT_2x2;
    ui->scaling = NCSCALE_NONE_HIRES;
    return;
  }
  if (notcurses_canhalfblock(ui->nc)) {
    ui->blitter = NCBLIT_2x1;
    ui->scaling = NCSCALE_SCALE;
    return;
  }

  /* fall back to default */
  ui->blitter = NCBLIT_DEFAULT;
  ui->scaling = NCSCALE_NONE;
  return;
}

/**
 * Update all the planes.
 */
void update_all(GameUI *ui) {
  pln_clade_update(ui);
  pln_esc_update(ui);
  pln_guess_update(ui);
  pln_stats_update(ui);
  pln_hint_update(ui, UP_ALL);
  pln_tree_update(ui);
}


/* ======================== */
/*   ESC PLANE              */
/* ======================== */
/**
 * Updates the esc-mode plane
 */
void pln_esc_update(GameUI *ui) {
  ncplane_erase(ui->pln_esc);

  /* set up channels */
  // TODO: can do this statically
  char ecg = ' ';
  uint64_t channels = 0;
  if (ui->focus == FC_ESC) {
    /* highlight if focussed */
    ncchannels_set_fg_rgb8(&channels, 0x00, 0x00, 0x00);
    ncchannels_set_bg_rgb8(&channels, 0xFF, 0xFF, 0xFF);
  } else {
    /* dim if not focussed */
    ncchannels_set_fg_rgb8(&channels, 0x99, 0x99, 0x99);
    ncchannels_set_bg_rgb8(&channels, 0x00, 0x00, 0x00);
  }

  /* set plane base color and style */
  ncplane_set_base(ui->pln_esc, &ecg, NCSTYLE_BOLD, channels);

  /* add text to plane */
  const char text[] = "|  [Q]uit  |  [R]estart  |  [C]lue  |  [H]elp";
  if (ui->focus == FC_ESC) {
    ncplane_putstr_yx(ui->pln_esc, 0, 0, " ESC ON   ");
  } else {
    ncplane_putstr_yx(ui->pln_esc, 0, 0, " ESC OFF  ");
  }
  ncplane_putstr(ui->pln_esc, text);

  /* strick through '[C]lue' if it is not available */
  if (!game_can_hint(ui->game)) {
    ncplane_format(ui->pln_esc, 0, 38, 1, 6, NCSTYLE_STRUCK);
  }
}

/**
 * Sets up the esc-mode plane
 */
void pln_esc_create(GameUI *ui) {
  /* create the plane */
  ncplane_options opts = {
    .y = ui->rows-1, // always use the bottom row
    .x = 1, // margin of 1 cell
    .rows = 1,
    .cols = ui->cols,
    .name = "pln_esc",
    // TODO: add resizing callbacks
  };
  ui->pln_esc = ncplane_create(ui->pln_std, &opts);

  pln_esc_update(ui);
}

/**
 * Handle inputs passed to the esc plane. Returns 1 if need to exit, 0
 * otherwise.
 */
int pln_esc_input(GameUI *ui, ncinput *input) {
  /* unpack info from input */
  uint32_t id = input->id;

  switch (id) {
    /* ESC to toggle off */
    case NCKEY_ESC:
      ui->focus = ui->prev_focus;
      break;

    /* Q to quit */
    case 'Q':
    case 'q':
      return 1;

    /* C for clue */
    case 'C':
    case 'c':
      game_hint(ui->game);
      ui->focus = FC_GUESS;
      update_all(ui);
      break;

    /* R for restart */
    case 'R':
    case 'r':
      game_reset(ui->game);
      ui->focus = FC_GUESS;
      update_all(ui);
      break;

    /* H for help */
    case 'H':
    case 'h':
      // TODO: implement help
      log("TODO: implement help");
      return 1;
      break;

    /* unrecognised input */
    default :
      return 0;
  }

  return 0;
}


/* ======================== */
/*   STATS PLANE            */
/* ======================== */
/**
 * Updates the hints plane
 */
void pln_stats_update(GameUI *ui) {
  /* clear the interior */
  ncplane_erase(ui->pln_stats);
  ncplane_rounded_perimeter(ui->pln_stats);

  /* game has been won */
  if (ui->game->state == GAME_WON) {
    ncplane_putstr_yx(ui->pln_stats, 1, 1, "YOU WIN!");
    ncplane_putstr_yx(ui->pln_stats, 2, 1, "ANSWER");
    ncplane_putstr_yx(ui->pln_stats, 3, 2, ui->game->answer->com_name);
  }

  /* game has been lost */
  else if (ui->game->state == GAME_LOST) {
    ncplane_putstr_yx(ui->pln_stats, 1, 1, "YOU LOSE");
    ncplane_putstr_yx(ui->pln_stats, 2, 1, "ANSWER");
    ncplane_putstr_yx(ui->pln_stats, 3, 2, ui->game->answer->com_name);
  }

  /* game still in progress */
  else {
    /* turn counter */
    ncplane_printf_yx(ui->pln_stats, 1, 1,
                      "turns remaining: %d",
                      ui->game->max_turn - ui->game->turn);

    /* rank string */
    ncplane_printf_yx(ui->pln_stats, 2, 1,
                      "rank: %s",
                      rank_str(ui->game->best_clade->rank));

    /* cheat mode */
    if (CHEAT_MODE) {
      ncplane_putstr_yx(ui->pln_stats, 3, 2, ui->game->answer->com_name);
    }
  }
}

/**
 * Sets up the hints plane
 */
void pln_stats_create(GameUI *ui) {
  /* create the framing plane */
  ncplane_options opts = {
    .y = 0,
    .x = 1,
    .rows = 5,
    .cols = MAX_GUESS + 3,
    .name = "pln_stats",
    // TODO: add resizing callbacks
  };
  ui->pln_stats = ncplane_create(ui->pln_std, &opts);
  ncplane_rounded_perimeter(ui->pln_stats);

  pln_stats_update(ui);
}


/* ======================== */
/*   HINT PLANE             */
/* ======================== */
/**
 * Returns 1 if s starts with sub, 0 otherwise.
 */
static inline int matches_start(const char *s, const char *sub, int sub_len) {
  for (int j = 0; j < sub_len; j++) {
    if (sub[j] != s[j]) {
      return 0;
      break;
    }
  } // j end

  return 1;
}

/**
 * Returns 1 if s contains - but does not begin with - sub, 0 otherwise.
 */
static inline int matches_mid(const char *s, int s_len, const char *sub, int sub_len) {
  for (int k = 1; k < s_len-sub_len+1; k++) {
    /* try and find a match starting at the kth character of s */
    int has_failed = 0;
    for (int j = 0; j < sub_len; j++) {
      if (sub[j] != s[k+j]) {
        has_failed = 1;
        break;
      }
    } // j end

    /* found a match */
    if (!has_failed) {
      return 1;
    }
  } // k end

  return 0;
}

/**
 * Updates the list of completions (or hints) matching the current text.
 */
void populate_hints(GameUI *ui, Update update) {
  /* no guess, no hints */
  if (ui->guess_len == 0) {
    ui->hint_len = 0;
    return;
  }

  /* no update, no change */
  if (update == UP_NONE) {
    return;
  }

  /* updating the hint list is quicker if a char has been added to the end */
  // TODO: fix this
  if (0 && update == UP_ADD_END && ui->guess_len > 1) {
    /* start with no hints in the list */
    int old_hints = ui->hint_len;
    ui->hint_len = 0;

    /* first pass matches start of names only */
    int i = 0; // position in (about to be overwritten) hint list
    for (; i < old_hints; i++) {
      /* stop if hint list is full */
      if (ui->hint_len == ui->hint_max_len) {
        break;
      }

      const char *com_name = ui->hints[i]; // just use the old list

      /* if the start chars don't match then move to the second type of match */
      if (com_name[0] != ui->guess[0]) {
        break;
      }

      /* add to the list if the starts match */
      int match = matches_start(com_name, ui->guess, ui->guess_len);
      if (match) {
        ui->hints[ui->hint_len] = com_name;
        ui->hint_len++;
      }
    } // i end (loop over species)

    /* second pass matches substrings */
    for (; i < old_hints; i++) {
      /* stop if full */
      if (ui->hint_len == ui->hint_max_len) {
        break;
      }

      const char *com_name = ui->hints[i]; // just use the old list

      /* add to the list if the interior matches */
      int match = matches_mid(com_name, (int)strlen(com_name), ui->guess, ui->guess_len);
      if (match) {
        ui->hints[ui->hint_len] = com_name;
        ui->hint_len++;
      }
    } // i end
  }

  /* otherwise iterate though all of the species */
  else {
    /* start with no hints in the list */
    ui->hint_len = 0;

    /* first pass matches start of names only */
    for (int i = 0; i < ui->game->tree->num_species; i++) {
      /* stop if hint list is full */
      if (ui->hint_len == ui->hint_max_len) {
        break;
      }

      /* add to the list if the starts match */
      const char *com_name = ui->game->tree->species[i]->com_name;
      int match = matches_start(com_name, ui->guess, ui->guess_len);
      if (match) {
        ui->hints[ui->hint_len] = com_name;
        ui->hint_len++;
      }
    } // i end (loop over species)

    /* second pass matches substrings */
    for (int i = 0; i < ui->game->tree->num_species; i++) {
      /* stop if full */
      if (ui->hint_len == ui->hint_max_len) {
        break;
      }

      /* add to the list if the interior matches */
      const char *com_name = ui->game->tree->species[i]->com_name;
      int match = matches_mid(com_name, (int)strlen(com_name), ui->guess, ui->guess_len);
      if (match) {
        ui->hints[ui->hint_len] = com_name;
        ui->hint_len++;
      }
    } // i end
  }
}

/**
 * Updates the hints plane
 */
void pln_hint_update(GameUI *ui, Update update) {
  /* update the list of completions */
  populate_hints(ui, update);

  /* clear all */
  ncplane_erase(ui->pln_hint);

  /* draw border hugging list */
  if (ui->hint_len > 0) {
    ncplane_rounded_perimeter_sized(ui->pln_hint, ui->hint_len+2);
  }

  /* compute display shifts */
  int display_idx = ui->hint_idx - ui->hint_scroll;
  int display_count = (ui->hint_display < ui->hint_len) ? ui->hint_display : ui->hint_len;

  /* write hints */
  for (int i = 0; i < display_count; i++) {
    /* fill line with spaces */
    for (unsigned j = 0; j < ncplane_dim_x(ui->pln_hint)-2; j++) {
      ncplane_putchar_yx(ui->pln_hint, 1+i, 1+j, ' ');
    } // j end

    /* then write name */
    ncplane_putstr_yx(ui->pln_hint, 1+i, 1, ui->hints[i+ui->hint_scroll]);
  } // i end

  /* make the list dim */
  uint64_t ch = 0x4055555540000000u;
  ncplane_stain(ui->pln_hint, 0, 0, ncplane_dim_y(ui->pln_hint), ncplane_dim_x(ui->pln_hint), ch, ch, ch, ch);

  /* highlight row at index */
  if (ui->hint_idx > -1) {
    ch = 0x4000000040FFFFFFu;
    ncplane_stain(ui->pln_hint, 1+display_idx, 1, 1, ncplane_dim_x(ui->pln_hint)-2, ch, ch, ch, ch);
  }

  /* add arrows to indicate scrolling availability/progress */
  if (ui->hint_len > ui->hint_display) {
    /* can scroll down */
    if (ui->hint_idx < ui->hint_len-1) {
      ncplane_putwc_yx(ui->pln_hint, ui->hint_display, 0, L'\u2193');
    }

    /* can scroll up */
    if (ui->hint_scroll > 0) {
      ncplane_putwc_yx(ui->pln_hint, 1, 0, L'\u2191');
    }
  }
}

/**
 * Sets up the hints plane
 */
void pln_hint_create(GameUI *ui) {
  /* set up lengths/indexing */
  ui->hint_idx = -1;
  ui->hint_len = 0;
  ui->hint_max_len = NUM_SPECIES;
  ui->hint_max_len = (ui->hint_max_len < (int)ui->rows - 10) ? ui->hint_max_len : (int)ui->rows - 10;
  ui->hint_display = 10;
  ui->hint_scroll = 0;

  /* find location and size of guess plane */
  int y0, x0;
  ncplane_yx(ui->pln_guess, &y0, &x0);
  unsigned rows, cols;
  ncplane_dim_yx(ui->pln_guess, &rows, &cols);

  /* place this plane below the guess plane */
  y0 += rows - 1;
  rows = ui->hint_display + 2;

  /* create the plane */
  ncplane_options opts = {
    .y = y0,
    .x = x0,
    .rows = rows,
    .cols = cols,
    .name = "pln_hint",
    // TODO: add resizing callbacks
  };
  ui->pln_hint = ncplane_create(ui->pln_std, &opts);

  /* place beneath guess plane */
  ncplane_move_below(ui->pln_hint, ui->pln_guess);

  /* reset hints */
  for (int i = 0; i < NUM_SPECIES; i++) {
    ui->hints[i] = NULL;
  } // i end

  pln_hint_update(ui, UP_ALL);
}

/**
 * Submit a guess via the hint list.
 */
void pln_hint_submit(GameUI *ui) {
  /* copy selected name into guess */
  const char *name = ui->hints[ui->hint_idx];
  for (int i = 0; i <= (int)strlen(name); i++) {
    ui->guess[i] = name[i];
  } // i end

  /* submit the guess */
  pln_guess_submit(ui);
}

/**
 * Pass input to the hint plane.
 */
void pln_hint_input(GameUI *ui, ncinput *input) {
  /* unpack info from input */
  uint32_t id = input->id;

  /* enter */
  if (id == NCKEY_ENTER) {
    /* submit the currently highlighted guess */
    pln_hint_submit(ui);
  }

  /* down arrow key */
  else if (id == NCKEY_DOWN) {
    int display_idx = ui->hint_idx - ui->hint_scroll;

    /* at the bottom of the list, can't go down */
    if (ui->hint_idx == ui->hint_len-1) {
      /* do nothing */
    }

    /* in middle of the display, go down normally */
    else if (display_idx < ui->hint_display-1) {
      ui->hint_idx++;
    }

    /* at bottom of the display, go down and scroll */
    else {
      ui->hint_idx++;
      ui->hint_scroll++;
    }

    pln_hint_update(ui, UP_NONE);
  }

  /* up arrow key */
  else if (id == NCKEY_UP) {
    int display_idx = ui->hint_idx - ui->hint_scroll;

    /* at the top of the list, exit to guess plane */
    if (ui->hint_idx == 0) {
      ui->focus = FC_GUESS;
    }

    /* in middle of the display, go up normally */
    else if (display_idx > 0) {
      /* do nothing */
    }

    /* at top of the display, scroll up */
    else if (display_idx == 0) {
      ui->hint_scroll--;
    }

    ui->hint_idx--;
    pln_hint_update(ui, UP_NONE);
  }
}


/* ======================== */
/*   GUESS PLANE            */
/* ======================== */
/**
 * Updates the guess-entry plane
 */
void pln_guess_update(GameUI *ui) {
  /* cursor channels */
  uint64_t ch = 0x4000000040FFFFFFu;

  /* bold if in focus */
  if (ui->focus == FC_GUESS) {
    ncplane_set_styles(ui->pln_guess, NCSTYLE_BOLD);
  } else {
    ncplane_set_styles(ui->pln_guess, NCSTYLE_NONE);
  }

  /* clear the interior */
  ncplane_erase_region(ui->pln_guess, 1, 1, 1, MAX_GUESS);

  /* display the guess */
  for (int i = 0; i < ui->guess_len; i++) {
    if (i == ui->guess_idx) {
      /* fake cursor at correct location */
      nccell ce = NCCELL_INITIALIZER(ui->guess[i], ncplane_styles(ui->pln_guess), ch);
      ncplane_putc_yx(ui->pln_guess, 1, 1+i, &ce);
      nccell_release(ui->pln_guess, &ce);
    } else {
      /* no cursor */
      ncplane_putchar_yx(ui->pln_guess, 1, 1+i, ui->guess[i]);
    }
  } // i end

  /* cursor might be off end */
  if (ui->guess_idx == ui->guess_len) {
    nccell ce = NCCELL_INITIALIZER(' ', ncplane_styles(ui->pln_guess), ch);
    nccell_release(ui->pln_guess, &ce);
    ncplane_putc_yx(ui->pln_guess, 1, 1+ui->guess_len, &ce);
  }
}

/**
 * Sets up the guess-entry plane
 */
void pln_guess_create(GameUI *ui) {
  /* create the framing plane */
  ncplane_options opts = {
    .y = 5,
    .x = 1,
    .rows = 3,
    .cols = MAX_GUESS + 3,
    .name = "pln_guess",
    // TODO: add resizing callbacks
  };
  ui->pln_guess = ncplane_create(ui->pln_std, &opts);
  ncplane_rounded_perimeter(ui->pln_guess);

  /* set up guess state */
  ui->guess_idx = 0; // index of guess
  ui->guess_len = 0; // length of input
  ui->guess_max_len = MAX_GUESS; // maximum length of input
  for (int i = 0; i < MAX_GUESS; i++) {
    ui->guess[i] = '\0';
  } // i end

  pln_guess_update(ui);
}

/**
 * Pass input to the guess plane. Some inputs must be handled outside of this
 * function (UP, DOWN, ENTER). Returns flag to indicate result of input.
 */
void pln_guess_input(GameUI *ui, ncinput *input) {
  /* unpack info from input */
  uint32_t id = input->id;

  /* record if guess has changed */
  Update guess_update = UP_NONE;

  /* ensure letters are lower case */
  if ('A' <= id && id <= 'Z') {
    id += 'a' - 'A';
  }

  switch (id) {
    /* down can enter the hint list */
    case NCKEY_DOWN:
      if (ui->hint_len > 0) {
        ui->focus = FC_HINT;
        ui->hint_idx = 0;
      }
      break;

    /* enter to submit a guess */
    case NCKEY_ENTER:
      pln_guess_submit(ui);
      break;

    /* move left if not at leftmost edge */
    case NCKEY_LEFT:
      if (ui->guess_idx > 0) {
        ui->guess_idx--;
      }
      break;

    /* move right if not past end of input */
    case NCKEY_RIGHT:
      if (ui->guess_idx < ui->guess_len) {
        ui->guess_idx++;
      }
      break;

    /* backspace */
    case NCKEY_BACKSPACE:
      /* only delete backwards if not at leftmost edge */
      if (ui->guess_idx > 0) {
        guess_update = UP_DEL_END;
        ui->guess_idx--; // move one space back

        /* copy subsequent chars backwards by one space */
        int idx = ui->guess_idx + 1;
        while (ui->guess[idx] != '\0') {
          ui->guess[idx-1] = ui->guess[idx];
          idx++;
        }

        ui->guess_len--;

        if (ui->guess_idx < ui->guess_len) {
          guess_update = UP_DEL_MID;
        }
      }
      break;

    /* forward-delete */
    case NCKEY_DEL:
      /* only delete forwards if not at rightmost edge */
      if (ui->guess_idx < ui->guess_len) {
        /* copy subsequent chars backwards by one space */
        int idx = ui->guess_idx + 1;
        while (ui->guess[idx] != '\0') {
          ui->guess[idx-1] = ui->guess[idx];
          idx++;
        }

        ui->guess_len--;
        guess_update = UP_DEL_MID;
      }
      break;

    /* other inputs might be letters */
    default :
      if (('a' <= id && id <= 'z') || id == ' ') {
        /* cant go over the edge of the guess plane */
        if (ui->guess_len < ui->guess_max_len) {
          /* add to end of guess */
          if (ui->guess_idx == ui->guess_len) {
            // TODO: duplicate code
            ui->guess[ui->guess_idx] = (char)id;
            guess_update = UP_ADD_END;
          }

          /* insert into middle of guess */
          else {
            /* move all characters forwards */
            int idx = ui->guess_len;
            while (idx > ui->guess_idx) {
              ui->guess[idx] = ui->guess[idx-1];
              idx--;
            }

            /* insert character */
            // TODO: duplicate code
            ui->guess[ui->guess_idx] = (char)id;
            guess_update = UP_ADD_MID;
          }

          ui->guess_idx++;
          ui->guess_len++;
        }
      }
  }

  /* almost always need to update the hint and the guess planes */
  pln_guess_update(ui);
  pln_hint_update(ui, guess_update);
}

/**
 * Clears the guess plane and resets the 'cursor'
 */
void pln_guess_clear(GameUI *ui) {
  /* overwrite with \0 */
  for (int i = 0; i < ui->guess_len; i++) {
    ui->guess[i] = '\0';
  } // i end

  /* reset guess cursor */
  ui->guess_idx = 0;
  ui->guess_len = 0;

  /* reset hint list */
  ui->hint_len = 0;
  ui->hint_idx = -1;
}

/**
 * Submit a guess.
 */
void pln_guess_submit(GameUI *ui) {
  GameState state = game_turn(ui->game, ui->guess);

  /* indicate invalid guess */
  if (state == INVALID_GUESS) {
    /* flash red */
    uint64_t ch = 0x40FF000040000000u;
    log("%x", ch);
    ncplane_stain(ui->pln_guess, 1, 1, 1, ncplane_dim_x(ui->pln_guess)-2, ch, ch, ch, ch);
    notcurses_render(ui->nc);

    /* pause */
    msleep(200);
  }

  /* clear and update everything */
  ui->focus = FC_GUESS;
  pln_guess_clear(ui);
  pln_guess_update(ui);
  pln_hint_update(ui, UP_ALL);
  pln_clade_update(ui);
  pln_stats_update(ui);
  pln_esc_update(ui);
  pln_tree_update(ui);
  notcurses_render(ui->nc);
}


/* ======================== */
/*   CLADE PLANE            */
/* ======================== */
/**
 * Updates the clade plane.
 */
void pln_clade_update(GameUI *ui) {
  /* display the current best clade */
  Clade *clade = ui->game->best_clade;

  /* get the size */
  unsigned rows, cols;
  ncplane_dim_yx(ui->pln_clade, &rows, &cols);

  /* clear interior */
  ncplane_erase(ui->pln_clade);
  ncplane_rounded_perimeter(ui->pln_clade);
  ncplane_erase(ui->pln_clade_text);
  ncplane_erase(ui->pln_clade_img_frame);


  /* name(s) at the top */
  if (ui->game->best_clade->com_name) {
    ncplane_putstr_yx(ui->pln_clade, 1, 1, clade->com_name);
    ncplane_putstr_yx(ui->pln_clade, 2, 1, clade->sci_name);
    ncplane_format(ui->pln_clade, 2, 1, 1, cols-2, NCSTYLE_ITALIC);
  } else {
    ncplane_putstr_yx(ui->pln_clade, 1, 1, clade->sci_name);
    ncplane_format(ui->pln_clade, 1, 1, 1, cols-2, NCSTYLE_ITALIC);
  }


  /* overwrite text with black */
  char ecg = ' ';
  uint64_t ch = 0x40C7C7C740000000u;
  ncplane_set_base(ui->pln_clade_text, &ecg, NCSTYLE_BOLD, ch);

  /* text under the name */
  size_t bytes = 0;
  ncplane_puttext(ui->pln_clade_text, 0, NCALIGN_LEFT, clade->text, &bytes);


  /* get the next row after the end of the text */
  int y0 = ncplane_cursor_y(ui->pln_clade_text) + 1 + 4;

  /* resize and move the image frame sub-plane */
  ncplane_resize(ui->pln_clade_img_frame, 0, 0, 0, 0, 0, 0, rows-y0-1, cols-2);
  ncplane_move_yx(ui->pln_clade_img_frame, y0, 1);

  /* load the image */
  char img_file[32];
  sprintf(img_file, "data/img/%d.jpg", ui->game->best_clade->tid);
  struct ncvisual *img = ncvisual_from_file(img_file);

  if (!img) {
    return;
  }

  /* get the geometry to decide placement */
  struct ncvisual_options vopts = {
    .n = ui->pln_clade_img_frame, // the plane to render on
    .scaling = ui->scaling, // scaling?
    .y = 0, // y position in plane
    .x = 0, // x position in plane
    .begy = 0,
    .begx = 0,
    .leny = 0,
    .lenx = 0,
    .blitter = ui->blitter, // glyph set to use (maps input to output cells)
    .flags = NCVISUAL_OPTION_CHILDPLANE,
    .transcolor = 0,
    .pxoffy = 0, .pxoffx = 0, // pixel offset if NCBLIT_PIXEL is used
  };
  ncvgeom geom;
  ncvisual_geom(ui->nc, img, &vopts, &geom);

  /* create image in new plane as child on img_frame */
  if (ui->pln_clade_img) {
    /* if it already exists, expand it to the max size and wipe the contents */
    ncplane_resize(ui->pln_clade_img, 0, 0, 0, 0, 0, 0, rows-y0, cols-2);
    ncplane_move_yx(ui->pln_clade_img, 0, 0);

    /* color with black, force a render, and then destroy */
    ncplane_set_base(ui->pln_clade_img, &ecg, NCSTYLE_BOLD, ch);
    notcurses_render(ui->nc);
    ncplane_destroy(ui->pln_clade_img);
  }
  ui->pln_clade_img = ncvisual_blit(ui->nc, img, &vopts); // display image

  /* get parent and child plane geometry */
  unsigned p_rows, p_cols, c_rows, c_cols;
  ncplane_dim_yx(ui->pln_clade_img_frame, &p_rows, &p_cols);
  ncplane_dim_yx(ui->pln_clade_img, &c_rows, &c_cols);

  /* centre in frame by moving the plane containing the image */
  int y_shift = (p_rows - c_rows) / 2;
  int x_shift = (p_cols - c_cols) / 2;
  y_shift = (y_shift > 0) ? y_shift : 0;
  x_shift = (x_shift > 0) ? x_shift : 0;
  ncplane_move_rel(ui->pln_clade_img, y_shift, x_shift);
}

/**
 * Sets up the clade plane.
 */
void pln_clade_create(GameUI *ui) {
  /* find location and size of guess plane */
  int y0, x0;
  ncplane_yx(ui->pln_guess, &y0, &x0);
  unsigned g_rows, g_cols;
  ncplane_dim_yx(ui->pln_guess, &g_rows, &g_cols);

  /* place this plane below the guess plane */
  y0 += g_rows;
  unsigned rows = ui->rows - y0 - 1;
  unsigned cols = ui->cols - 2;
  cols = (cols > 45) ? 45 : cols; // max 45 wide

  /* create the main clade plane */
  ncplane_options opts = {
    .y = y0,
    .x = x0,
    .rows = rows,
    .cols = cols,
    .name = "pln_clade",
    // TODO: add resizing callbacks
  };
  ui->pln_clade = ncplane_create(ui->pln_std, &opts);
  ncplane_rounded_perimeter(ui->pln_clade);
  ncplane_move_below(ui->pln_clade, ui->pln_hint);


  /* create the text sub-plane */
  ncplane_options text_opts = {
    .y = 4, // leave space for com_name, sci_name and a gap
    .x = 1,
    .rows = rows - 5,
    .cols = cols-2,
    .name = "pln_clade_text",
    // TODO: add resizing callbacks
  };
  ui->pln_clade_text = ncplane_create(ui->pln_clade, &text_opts);
  ncplane_move_below(ui->pln_clade_text, ui->pln_hint);


  /* create the image frame sub-plane */
  ncplane_options img_opts = {
    .y = 4, // leave space for com_name, sci_name and a gap
    .x = 1,
    .rows = rows - 5,
    .cols = cols-2,
    .name = "pln_clade_img_frame",
    // TODO: add resizing callbacks
  };
  ui->pln_clade_img_frame = ncplane_create(ui->pln_clade, &img_opts);
  ui->pln_clade_img = NULL; // empty plane for the image

  pln_clade_update(ui);
}


/* ======================== */
/*   TREE PLANE             */
/* ======================== */
/**
 * Updates the tree plane.
 */
void pln_tree_update(GameUI *ui) {
  /* clear all */
  ncplane_erase(ui->pln_tree);

  /* display tree */
  int k = 0;
  for (int i = 0; i < NUM_CLADES; i++) {
    /* then write name */
    if (ui->game->tree->clades[i].subtree_state == ST_VISIBLE) {
      ncplane_putstr_yx(ui->pln_tree, 1+k, 1, ui->game->tree->clades[i].sci_name);
      k++;
    }
  } // i end
}

/**
 * Sets up the tree plane.
 */
void pln_tree_create(GameUI *ui) {
  /* find location and size of clade plane */
  int y0, x0;
  ncplane_yx(ui->pln_clade, &y0, &x0);
  unsigned c_rows, c_cols;
  ncplane_dim_yx(ui->pln_clade, &c_rows, &c_cols);

  /* place this plane right of the clade plane */
  x0 += c_cols;
  unsigned rows = ui->rows - 1;
  unsigned cols = ui->cols - x0;

  /* create the main tree plane */
  ncplane_options opts = {
    .y = 0,
    .x = x0,
    .rows = rows,
    .cols = cols,
    .name = "pln_tree",
    // TODO: add resizing callbacks
  };
  ui->pln_tree = ncplane_create(ui->pln_std, &opts);
  ncplane_rounded_perimeter(ui->pln_tree);


  pln_tree_update(ui);
}


/* ========================================================================== */
/*   FUNCTION DEFINITIONS                                                     */
/* ========================================================================== */
GameUI *gameui_init(void) {
  GameUI *ui = malloc(sizeof(GameUI));

  /* set up the game */
  ui->game = game_init();
  if (!ui->game) {
    log("ERROR: game_init failed");
    free(ui);
    return NULL;
  }


  /* starting state */
  ui->focus = FC_GUESS;
  ui->prev_focus = FC_GUESS;


  /* start notcurses */
  notcurses_options opts = {
    .termtype = NULL,
    .loglevel = NCLOGLEVEL_SILENT,
    .margin_l = 0, .margin_r = 0,
    .margin_t = 0, .margin_b = 0,
    .flags = 0 // NCOPTION_SUPPRESS_BANNERS // to suppress info at end
  };
  ui->nc = notcurses_init(&opts, stdout);

  /* set up images and blitting */
  set_blitter(ui);

  /* set up screen */
  int err = notcurses_enter_alternate_screen(ui->nc);
  if (err == -1) {
    log("ERROR: alternate screen not available");
    gameui_destroy(ui);
    return NULL;
  }

  /* set up standard plane and get dimensions */
  ui->pln_std = notcurses_stdplane(ui->nc);
  ncplane_dim_yx(ui->pln_std, &ui->rows, &ui->cols);

  /* create the other planes */
  pln_esc_create(ui);
  pln_guess_create(ui);
  pln_stats_create(ui);
  pln_hint_create(ui);
  pln_clade_create(ui);
  pln_tree_create(ui);

  /* render the screen */
  notcurses_render(ui->nc);

  return ui;
}

void gameui_destroy(GameUI *ui) {
  /* destroy planes */
  ncplane_destroy(ui->pln_stats);
  ncplane_destroy(ui->pln_guess);
  ncplane_destroy(ui->pln_esc);
  ncplane_destroy(ui->pln_hint);
  ncplane_destroy(ui->pln_clade_text);
  ncplane_destroy(ui->pln_clade_img_frame);
  ncplane_destroy(ui->pln_clade);
  ncplane_destroy(ui->pln_tree);

  /* leave fullscreen */
  notcurses_leave_alternate_screen(ui->nc);

  /* shut down notcurses */
  notcurses_stop(ui->nc);

  /* frees game and TUI resources */
  game_destroy(ui->game);
  free(ui);
}

void gameui_play(GameUI *ui) {
  /* for some reason garbage inputs are sent at the start */
  gobble_inputs(ui->nc);

  /* input struct */
  ncinput input = {0};

  /* game loop */
  while (1) {
    Focus start_focus = ui->focus; // remember start focus

    /* get input */
    uint32_t id = notcurses_get_blocking(ui->nc, &input);
    log("KEY PRESSED: %d [%c]", id, id);

    /* ======================== */
    /*   GLOBAL KEYS            */
    /* ======================== */
    /* toggle esc-mode */
    if (id == NCKEY_ESC) {
      /* toggle esc-mode */
      if (ui->focus == FC_ESC) {
        /* revert to previous focus */
        ui->focus = ui->prev_focus;
        if (ui->prev_focus == FC_ESC) {
          ui->focus = FC_GUESS;
        }
      } else {
        /* enter esc focus */
        ui->focus = FC_ESC;
      }
    }

    /* ======================== */
    /*   ESC-MODE KEYS          */
    /* ======================== */
    else if (ui->focus == FC_ESC) {
      if (pln_esc_input(ui, &input)) {
        break;
      }
    }

    /* ======================== */
    /*   GUESS KEYS             */
    /* ======================== */
    else if (ui->focus == FC_GUESS) {
      pln_guess_input(ui, &input);
    }

    /* ======================== */
    /*   HINT KEYS              */
    /* ======================== */
    else if (ui->focus == FC_HINT) {
      pln_hint_input(ui, &input);
    }

    /* ======================== */
    /*   GAME END               */
    /* ======================== */
    if (ui->game->state == GAME_WON || ui->game->state == GAME_LOST) {
      ui->prev_focus = FC_GUESS;
      ui->focus = FC_ESC;
      pln_clade_update(ui);
      pln_guess_update(ui);
      pln_hint_update(ui, UP_ALL);
      pln_stats_update(ui);
    }

    /* ======================== */
    /*   FOCUS CHANGE           */
    /* ======================== */
    /* update planes that have had a focus change */
    if (start_focus != ui->focus) {
      ui->prev_focus = start_focus;

      if (ui->prev_focus == FC_ESC || ui->focus == FC_ESC) {
        pln_esc_update(ui);
      }

      if (ui->prev_focus == FC_GUESS || ui->focus == FC_GUESS) {
        pln_guess_update(ui);
      }

      if (ui->prev_focus == FC_HINT || ui->focus == FC_HINT) {
        pln_hint_update(ui, UP_NONE);
      }
    }

    /* update the screen */
    notcurses_render(ui->nc);
    log("GAME STATE: [%d] %s (%s)", ui->game->turn, ui->game->best_clade->com_name, ui->game->best_clade->sci_name);
  }
}

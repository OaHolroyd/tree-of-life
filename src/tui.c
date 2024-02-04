#include "tui.h"


/* include notcurses but ignore the warnings associated with it */
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wredundant-decls"
#pragma GCC diagnostic ignored "-Wlogical-op"
#include <notcurses/notcurses.h>
#pragma GCC diagnostic pop

#include "utils.h"
#include "game.h"


/* ========================================================================== */
/*   TYPE DEFINITIONS                                                         */
/* ========================================================================== */
#define MAX_GUESS (25)
#define MAX_HINTS (30)

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
  Game *game;

  struct notcurses *nc;
  unsigned int rows; // rows in terminal
  unsigned int cols; // cols in terminal

  /* images */
  int images_flag; // whether images are supported
  ncblitter_e blitter; // best blitter available
  ncscale_e scaling; // which image scaling to use

  /* planes */
  struct ncplane *pln_std; // standard plane (ie the entire screen)
  struct ncplane *pln_stats; // plane containing game statistics
  struct ncplane *pln_guess; // plane for input guess
  struct ncplane *pln_esc; // plane for esc-mode controls
  struct ncplane *pln_hint; // plane for guess hints (ie completions)
  struct ncplane *pln_clade; // plane for displaying the best clade
  struct ncplane *pln_clade_text; // plane for displaying the best clade's text
  struct ncplane *pln_clade_img; // plane for displaying the best clade's image
  struct ncplane *pln_clade_img_child; // plane containing the image

  /* guess state */
  char guess[MAX_GUESS]; // array of chars currently typed in
  int guess_idx; // index of guess
  int guess_len; // length of input
  int guess_max_len; // maximum length of input

  /* hints */
  const char *hints[MAX_HINTS];
  int hint_idx; // index of scroll position
  int hint_len; // number of hints
  int hint_max_len; // maximum number of hints

  /* focus */
  Focus focus; // the focus state
  Focus prev_focus; // the previous focus state
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
void pln_guess_submit(GameUI *ui);
void pln_clade_update(GameUI *ui);

/* ======================== */
/*   HELPERS                */
/* ======================== */
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
  error("only support for NCBLIT_PIXEL currently due to scaling issues");
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

/* ======================== */
/*   ESC PLANE              */
/* ======================== */
/**
 * Updates the esc-mode plane
 */
void pln_esc_update(GameUI *ui) {
  ncplane_erase(ui->pln_esc);

  char ecg = ' ';
  uint64_t channels = 0;

  /* set up channels */
  if (ui->focus == FC_ESC) {
    ncchannels_set_fg_rgb8(&channels, 0x00, 0x00, 0x00);
    ncchannels_set_bg_rgb8(&channels, 0xFF, 0xFF, 0xFF);
  } else {
    ncchannels_set_fg_rgb8(&channels, 0x99, 0x99, 0x99);
    ncchannels_set_bg_rgb8(&channels, 0x00, 0x00, 0x00);
  }

  /* potential text */
  const char esc_text[] = " ESC ON   |  [Q]uit  |  [R]estart  |  [H]int";

  /* add text to plane */
  ncplane_set_base(ui->pln_esc, &ecg, NCSTYLE_BOLD, channels);
  ncplane_putstr_yx(ui->pln_esc, 0, 0, esc_text);
  if (!game_can_hint(ui->game)) {
    ncplane_format(ui->pln_esc, 0, 38, 1, 6, NCSTYLE_STRUCK);
  }
}

/**
 * Sets up the esc-mode plane
 */
void pln_esc_create(GameUI *ui) {
  /* define dimensions */
  const int width = ui->cols;
  // height is always 1

  /* create the framing plane */
  ncplane_options opts = {
    .y = ui->rows-1,
    .x = 0,
    .rows = 1,
    .cols = width,
    .name = "pln_esc",
    // TODO: add resizing callbacks
  };
  ui->pln_esc = ncplane_create(ui->pln_std, &opts);
  // ncplane_rounded_perimeter(ui->pln_esc);

  pln_esc_update(ui);
}


/* ======================== */
/*   HINT PLANE             */
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
    ncplane_printf_yx(ui->pln_stats, 2, 1, "YOU WIN!");
  }

  /* game has been lost */
  else if (ui->game->state == GAME_LOST) {
    ncplane_printf_yx(ui->pln_stats, 2, 1, "YOU LOSE");
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
    ncplane_printf_yx(ui->pln_stats, 3, 1,
                      "answer: %s",
                      ui->game->answer->com_name);
  }
}

/**
 * Sets up the hints plane
 */
void pln_stats_create(GameUI *ui) {
  /* find location and size of guess plane */
  int y0, x0;
  ncplane_yx(ui->pln_guess, &y0, &x0);
  unsigned rows, cols;
  ncplane_dim_yx(ui->pln_guess, &rows, &cols);

  /* create the framing plane */
  ncplane_options opts = {
    .y = 0,
    .x = 1,
    .rows = 5,
    .cols = cols,
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
 * Updates the hints plane
 */
void pln_hint_update(GameUI *ui, Update change_type) {
  /* update the list of completions */
  // TODO: can be much faster for certain change-types
  if (change_type != UP_NONE && ui->guess_len > 0) {
    // TODO: if it's just a letter added to the end, then update is quicker
    ui->hint_len = 0;

    /* first pass matches start of names only */
    for (int i = 0; i < ui->game->tree->num_species; i++) {
      /* stop if full */
      if (ui->hint_len == ui->hint_max_len) {
        break;
      }

      const char *com_name = ui->game->tree->species[i]->com_name;

      /* check if the starts match */
      int matches_start = 1;
      for (int j = 0; j < ui->guess_len; j++) {
        if (ui->guess[j] != com_name[j]) {
          matches_start = 0;
          break;
        }
      } // j end

      /* add to list */
      if (matches_start) {
        ui->hints[ui->hint_len] = com_name;
        ui->hint_len++;
      }
    } // i end

    /* second pass matches any substring */
    for (int i = 0; i < ui->game->tree->num_species; i++) {
      /* stop if full */
      if (ui->hint_len == ui->hint_max_len) {
        break;
      }

      const char *com_name = ui->game->tree->species[i]->com_name;
      int name_len = (int)strlen(com_name);

      /* check of the interior matches */
      int matches_mid = 0;
      for (int k = 1; k < name_len-ui->guess_len+1; k++) {
        int has_failed = 0;
        for (int j = 0; j < ui->guess_len; j++) {
          if (ui->guess[j] != com_name[k+j]) {
            has_failed = 1;
            break;
          }
        } // j end
        if (!has_failed) {
          matches_mid = 1;
          break;
        }
      } // k end

      /* add to list */
      if (matches_mid) {
        ui->hints[ui->hint_len] = com_name;
        ui->hint_len++;
      }
    } // i end
  }

  /* no hints for no input */
  if (ui->guess_len == 0) {
    ui->hint_len = 0;
  }

  /* clear all */
  ncplane_erase(ui->pln_hint);

  /* draw border hugging list */
  if (ui->hint_len > 0) {
    log("HINT LEN %d", ui->hint_len);
    ncplane_rounded_perimeter_sized(ui->pln_hint, ui->hint_len+2);
  }

  /* write hints */
  for (int i = 0; i < ui->hint_len; i++) {
    /* fill line with spaces */
    for (unsigned j = 0; j < ncplane_dim_x(ui->pln_hint)-2; j++) {
      ncplane_putchar_yx(ui->pln_hint, 1+i, 1+j, ' ');
    } // j end

    /* then write name */
    if (i == ui->hint_idx) {
      ncplane_putstr_yx(ui->pln_hint, 1+i, 1, ui->hints[i]);
    } else {
      ncplane_putstr_yx(ui->pln_hint, 1+i, 1, ui->hints[i]);
    }
  } // i end

  /* color dim */
  uint64_t ch = 0;
  ncchannels_set_fg_rgb8(&ch, 0x55, 0x55, 0x55);
  ncchannels_set_bg_rgb8(&ch, 0x00, 0x00, 0x00);
  ncplane_stain(ui->pln_hint, 0, 0, ui->hint_len+2, ncplane_dim_x(ui->pln_hint), ch, ch, ch, ch);

  /* stain row at index */
  if (ui->hint_idx > -1) {
    ncchannels_set_fg_rgb8(&ch, 0x00, 0x00, 0x00);
    ncchannels_set_bg_rgb8(&ch, 0xFF, 0xFF, 0xFF);
    ncplane_stain(ui->pln_hint, 1+ui->hint_idx, 1, 1, ncplane_dim_x(ui->pln_hint)-2, ch, ch, ch, ch);
  }
}

/**
 * Sets up the hints plane
 */
void pln_hint_create(GameUI *ui) {
  /* find location and size of guess plane */
  int y0, x0;
  ncplane_yx(ui->pln_guess, &y0, &x0);
  unsigned rows, cols;
  ncplane_dim_yx(ui->pln_guess, &rows, &cols);

  /* place this plane below the guess plane */
  y0 += rows - 1;
  rows = ui->rows - y0 - 1;

  /* create the framing plane */
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
  for (int i = 0; i < MAX_HINTS; i++) {
    ui->hints[i] = NULL;
  } // i end

  ui->hint_idx = -1;
  ui->hint_len = 0;
  ui->hint_max_len = (rows - 2 < MAX_HINTS) ? rows - 2 : MAX_HINTS;

  pln_hint_update(ui, UP_ALL);
}

/**
 * Pass input to the hint plane. Some inputs are handled outside of this
 * function (ENTER, DOWN to enter). Returns 1 if focus should return to
 * pln_guess and 0 otherwise.
 */
int pln_hint_input(GameUI *ui, ncinput *input) {
  /* unpack info from input */
  uint32_t id = input->id;

  /* left arrow key */
  if (id == NCKEY_DOWN) {
    /* only move down if there is space to do so */
    if (ui->hint_idx < ui->hint_len-1) {
      ui->hint_idx++;
    }
    pln_hint_update(ui, UP_NONE);
  }

  /* right arrow key */
  else if (id == NCKEY_UP) {
    ui->hint_idx--;
    pln_hint_update(ui, UP_NONE);

    /* might have left the list */
    if (ui->hint_idx == -1) {
      return 1;
    }
  }

  return 0;
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

  pln_guess_submit(ui);
}

/* ======================== */
/*   GUESS PLANE            */
/* ======================== */
/**
 * Updates the guess-entry plane
 */
void pln_guess_update(GameUI *ui) {
  /* cursor channels */
  uint64_t channels = 0;
  ncchannels_set_fg_rgb8(&channels, 0x00, 0x00, 0x00);
  ncchannels_set_bg_rgb8(&channels, 0xFF, 0xFF, 0xFF);

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
      nccell ce = NCCELL_INITIALIZER(ui->guess[i], ncplane_styles(ui->pln_guess), channels);
      ncplane_putc_yx(ui->pln_guess, 1, 1+i, &ce);
    } else {
      /* no cursor */
      ncplane_putchar_yx(ui->pln_guess, 1, 1+i, ui->guess[i]);
    }
  } // i end

  /* cursor might be off end */
  if (ui->guess_idx == ui->guess_len) {
    nccell ce = NCCELL_INITIALIZER(' ', ncplane_styles(ui->pln_guess), channels);
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
    .cols = MAX_GUESS + 2,
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

  /* left arrow key */
  if (id == NCKEY_LEFT) {
    /* only move left if not at leftmost edge */
    if (ui->guess_idx > 0) {
      ui->guess_idx--;
    }
  }

  /* right arrow key */
  else if (id == NCKEY_RIGHT) {
    /* only move right if not past end of input */
    if (ui->guess_idx < ui->guess_len) {
      ui->guess_idx++;
    }
  }

  /* backspace */
  else if (id == NCKEY_BACKSPACE) {
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
  }

  /* forward-delete */
  // TODO: test this
  else if (id == NCKEY_DEL) {
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
  }

  /* letter */
  else if (('a' <= id && id <= 'z') || id == ' ') {
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

  pln_guess_update(ui);

  if (guess_update != UP_NONE) {
    pln_hint_update(ui, guess_update);
  }
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

  if (state == INVALID_GUESS) {
    /* flash red */
    uint64_t ch = 0;
    ncchannels_set_fg_rgb8(&ch, 0xFF, 0x00, 0x00);
    ncchannels_set_bg_rgb8(&ch, 0x00, 0x00, 0x00);
    log("%x", ch);
    ncplane_stain(ui->pln_guess, 1, 1, 1, ncplane_dim_x(ui->pln_guess)-2, ch, ch, ch, ch);
    notcurses_render(ui->nc);

    /* pause */
    msleep(200);

    /* clear and update everything */
    pln_guess_clear(ui);
    pln_guess_update(ui);
    pln_hint_update(ui, UP_NONE);
  } else if (state == VALID_GUESS) {
    /* clear and update everything */
    pln_guess_clear(ui);
    pln_guess_update(ui);
    pln_hint_update(ui, UP_NONE);
  } else if (state == GAME_WON) {
    // won!
    pln_guess_clear(ui);
  } else if (state == GAME_LOST) {
    // lost
    pln_guess_clear(ui);
  }

  ui->focus = FC_GUESS;
  pln_clade_update(ui);
  pln_stats_update(ui);
  notcurses_render(ui->nc);
}

/* ======================== */
/*   CLADE PLANE            */
/* ======================== */
/**
 * Updates the clade plane.
 */
void pln_clade_update(GameUI *ui) {
  /* clear interior */
  ncplane_erase(ui->pln_clade);
  ncplane_rounded_perimeter(ui->pln_clade);
  ncplane_erase(ui->pln_clade_text);
  ncplane_erase(ui->pln_clade_img);

  /* name at the top */
  if (ui->game->best_clade->com_name) {
    ncplane_putstr_yx(ui->pln_clade, 1, 1, ui->game->best_clade->com_name);
    ncplane_putstr_yx(ui->pln_clade, 2, 1, ui->game->best_clade->sci_name);
  } else {
    ncplane_putstr_yx(ui->pln_clade, 1, 1, ui->game->best_clade->sci_name);
  }


  /* text in the middle */
  size_t bytes = 0;
  ncplane_puttext(ui->pln_clade_text, 0, NCALIGN_LEFT, ui->game->best_clade->text, &bytes);


  /* load the image */
  char img_file[32];
  sprintf(img_file, "data/img/%d.jpg", ui->game->best_clade->tid);
  struct ncvisual *img = ncvisual_from_file(img_file);

  if (!img) {
    return;
  }

  /* get the geometry to decide placement */
  struct ncvisual_options vopts = {
    .n = ui->pln_clade_img, // the plane to render on
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

  /* image at the bottom */
  if (ui->pln_clade_img_child) {
    ncplane_destroy(ui->pln_clade_img_child);
  }
  ui->pln_clade_img_child = ncvisual_blit(ui->nc, img, &vopts); // display?

  /* get parent and child plane geometry */
  unsigned p_rows, p_cols, c_rows, c_cols;
  ncplane_dim_yx(ui->pln_clade_img, &p_rows, &p_cols);
  ncplane_dim_yx(ui->pln_clade_img_child, &c_rows, &c_cols);

  /* centre in frame by moving the plane containing the image */
  int y_shift = (p_rows - c_rows) / 2;
  int x_shift = (p_cols - c_cols) / 2;
  y_shift = (y_shift > 0) ? y_shift : 0;
  x_shift = (x_shift > 0) ? x_shift : 0;
  ncplane_move_rel(ui->pln_clade_img_child, y_shift, x_shift);
  log("pr %d, pc %d", p_rows, p_cols);
  log("cr %d, cc %d", c_rows, c_cols);
  // log("cy %d, cx %d", geom.rcelly, geom.rcellx);
  log("ys %d, xs %d", y_shift, x_shift);
  // if (x_shift > 0) {
  //   /* size limited by height */
  //   ncplane_move_rel(ui->pln_clade_img, 0, x_shift);
  // } else if (y_shift > 0) {
  //   /* size limited by width */
  //   ncplane_move_rel(ui->pln_clade_img, y_shift, 0);
  // }
}

/**
 * Sets up the clade plane.
 */
void pln_clade_create(GameUI *ui) {
  /* find location and size of guess plane */
  int y0, x0;
  ncplane_yx(ui->pln_guess, &y0, &x0);
  unsigned guess_rows, guess_cols;
  ncplane_dim_yx(ui->pln_guess, &guess_rows, &guess_cols);

  /* place this plane below the guess plane */
  unsigned rows = ui->rows - 3;
  unsigned cols = ui->cols - x0 - guess_cols - 1;

  /* create the framing plane */
  ncplane_options opts = {
    .y = 0,
    .x = x0 + guess_cols,
    .rows = rows,
    .cols = cols,
    .name = "pln_clade",
    // TODO: add resizing callbacks
  };
  ui->pln_clade = ncplane_create(ui->pln_std, &opts);
  ncplane_rounded_perimeter(ui->pln_clade);

  /* place beneath hint plane */
  ncplane_move_below(ui->pln_clade, ui->pln_hint);

  /* create clade text plane */
  ncplane_dim_yx(ui->pln_clade, &rows, &cols);
  opts.y = 4,
  opts.x = 1,
  opts.rows = (rows-4)/2,
  opts.cols = cols-2,
  opts.name = "pln_clade_text";
  ui->pln_clade_text = ncplane_create(ui->pln_clade, &opts);
  ncplane_move_below(ui->pln_clade_text, ui->pln_hint);

  /* create clade image plane */
  ncplane_yx(ui->pln_clade, &y0, &x0);
  ncplane_dim_yx(ui->pln_clade, &rows, &cols);
  opts.y = 4 + (rows-4)/2,
  opts.x = 1,
  opts.rows = (rows-4)/2,
  opts.cols = cols-2,
  opts.name = "pln_clade_frame";
  ui->pln_clade_img = ncplane_create(ui->pln_clade, &opts);

  ui->pln_clade_img_child = NULL;

  pln_clade_update(ui);
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
  ncplane_move_above(ui->pln_esc, ui->pln_hint);


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
  ncplane_destroy(ui->pln_clade_img);
  ncplane_destroy(ui->pln_clade);

  /* leave fullscreen */
  notcurses_leave_alternate_screen(ui->nc);

  /* shut down notcurses */
  notcurses_stop(ui->nc);

  /* frees game and TUI resources */
  game_destroy(ui->game);
  free(ui);
}

void gameui_play(GameUI *ui) {
  /* input struct */
  ncinput input = {0};

  /* gobble bad inputs in 0.1 seconds */
  #define GOBBLE_LEN (1000)
  ncinput gobble[GOBBLE_LEN];
  for (int i = 0; i < GOBBLE_LEN; i++) {
    gobble[i].id = UINT32_MAX;
  } // i end
  struct timespec ts;
  timespec_get(&ts, TIME_UTC);
  ts.tv_nsec += 100000000; // add a bit of 'gobble' time
  notcurses_getvec(ui->nc, &ts, gobble, GOBBLE_LEN);
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
      /* Q to quit */
      if (id == 'q' || id == 'Q') {
        break;
      }

      /* H for hint */
      if (id == 'h' || id == 'H') {
        game_hint(ui->game);
        ui->focus = FC_GUESS;
        pln_clade_update(ui);
        pln_stats_update(ui);
      }

      /* R for restart */
      if (id == 'r' || id == 'R') {
        game_reset(ui->game);
        ui->focus = FC_GUESS;
        pln_clade_update(ui);
        pln_guess_update(ui);
        pln_hint_update(ui, UP_ALL);
        pln_stats_update(ui);
      }
    }

    /* ======================== */
    /*   GUESS KEYS             */
    /* ======================== */
    else if (ui->focus == FC_GUESS) {
      /* down arrow can transfer to suggestions list */
      if (input.id == NCKEY_DOWN && ui->hint_len > 0) {
        ui->focus = FC_HINT;
        ui->hint_idx = 0;
      }

      /* enter key to submit a guess */
      else if (input.id == NCKEY_ENTER) {
        pln_guess_submit(ui);
      }

      /* other inputs go direct to the guess plane */
      else {
        pln_guess_input(ui, &input);
      }
    }

    /* ======================== */
    /*   HINT KEYS              */
    /* ======================== */
    else if (ui->focus == FC_HINT) {
      /* enter key to submit a guess */
      if (input.id == NCKEY_ENTER) {
        pln_hint_submit(ui);
      }

      /* read input and change focus if gone off the top */
      else {
        int has_left = pln_hint_input(ui, &input);
        if (has_left) {
          ui->focus = FC_GUESS;
        }
      }
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


/* notcurses reference */
// This renders the entire screen and makes it appear.
// int notcurses_render(struct notcurses* nc);

// The first of these renders, the second makes it appear on the screen.
// int ncpile_render(struct ncplane* n);
// int ncpile_rasterize(struct ncplane* n);

// This refreshes the screen without rendering any changes. Useful if the
// screen size has changed.
// int notcurses_refresh(struct notcurses* n, unsigned* restrict y, unsigned* restrict x);

// Enables and moves the cursor y,x
// int notcurses_cursor_enable(struct notcurses* nc, int y, int x);

// Disables the cursor.
// int notcurses_cursor_disable(struct notcurses* nc);

// Move the cursor to a point relative to a plane
// int ncplane_cursor_move_yx(struct ncplane* n, int y, int x);
// int ncplane_cursor_move_rel(struct ncplane* n, int y, int x);

// Checks how many colors are supported
// unsigned notcurses_palette_size(const struct notcurses* nc);

// Can we load images? This requires being built against FFmpeg/OIIO.
// bool notcurses_canopen_images(const struct notcurses* nc);

// Replace the cell at the specified coordinates with the provided cell 'c',
// and advance the cursor by the width of the cell (but not past the end of the
// plane). On success, returns the number of columns the cursor was advanced.
// On failure, -1 is returned.
// int ncplane_putc_yx(struct ncplane* n, int y, int x, const nccell* c);

// Replace the nccell at the specified coordinates with the provided 7-bit char
// 'c'. Advance the cursor by 1. On success, returns 1. On failure, returns -1.
// This works whether the underlying char is signed or unsigned.
// int ncplane_putchar_yx(struct ncplane* n, int y, int x, char c);
// int ncplane_putchar(struct ncplane* n, char c)
// int ncplane_putchar_stained(struct ncplane* n, char c);

// Write a series of EGCs to the current location, using the current style.
// They will be interpreted as a series of columns (according to the definition
// of ncplane_putc()). Advances the cursor by some positive number of columns
// (though not beyond the end of the plane); this number is returned on success.
// On error, a non-positive number is returned, indicating the number of columns
// which were written before the error.
// int ncplane_putstr_yx(struct ncplane* n, int y, int x, const char* gclusters);

// Write the specified text to the plane, breaking lines sensibly, beginning at
// the specified line. Returns the number of columns written. When breaking a
// line, the line will be cleared to the end of the plane (the last line will
// *not* be so cleared). The number of bytes written from the input is written
// to '*bytes' if it is not NULL. Cleared columns are included in the return
// value, but *not* included in the number of bytes written. Leaves the cursor
// at the end of output. A partial write will be accomplished as far as it can;
// determine whether the write completed by inspecting '*bytes'.
// int ncplane_puttext(struct ncplane* n, int y, ncalign_e align, const char* text, size_t* bytes);

// Set the background/foreground alpha and coloring bits of the plane's current
// channels from a single 32-bit value.
// uint64_t ncplane_set_bchannel(struct ncplane* n, uint32_t channel);
// uint64_t ncplane_set_fchannel(struct ncplane* n, uint32_t channel);

#include <stdlib.h>
#include <stdio.h>
#include <time.h>

#include "tui.h"
#include "utils.h"


/* ========================================================================== */
/*   MAIN                                                                     */
/* ========================================================================== */
int main(int argc, char const *argv[]) {
  /* clear the log */
  log_clear();

  /* set random seed */
  srand((unsigned)time(NULL));

  /* set up the game */
  GameUI *ui = gameui_init();

  /* play the game */
  gameui_play(ui);

  /* free resources */
  gameui_destroy(ui);

  return 0;
}

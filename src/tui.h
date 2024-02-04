#ifndef TUI_H
#define TUI_H


/* opaque game user interface */
typedef struct GameUI GameUI;


/* ========================================================================== */
/*   FUNCTION DECLARATIONS                                                    */
/* ========================================================================== */
/**
 * Sets up a game and a TUI. Returns NULL on failure.
 */
GameUI *gameui_init(void);

/**
 * Shuts down the GameUI, freeing all resources.
 */
void gameui_destroy(GameUI *ui);

/**
 * Start receiving user input and rendering the game.
 */
void gameui_play(GameUI *ui);


#endif

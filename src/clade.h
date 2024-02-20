#ifndef CLADE_H
#define CLADE_H

#include <stdio.h>

#include "rank.h"


/* ========================================================================== */
/*   TYPE DEFINITIONS                                                         */
/* ========================================================================== */
#define MAX_SYNONYMS (3) /* maximum number of permitted synonyms */
#define MAX_TEXT (600) /* maximum length of clade text string */
#define MAX_IMAGE (600) /* maximum length of clade image data string */

/**
 * A Clade is a node in the tree describing the Tree of Life. A Tree is simply
 * a root node which is connected to all of its children.
 */
typedef struct Clade {
  /* Clade Members */
  int tid; // taxonomic identifier (corresponding to NCBI database)
  int ptid; // tid of parent clade (0 for no parent)

  const char *com_name; // common name
  const char *sci_name; // scientific name
  int num_synonyms; // number of synonyms
  char const *synonyms[MAX_SYNONYMS]; // pointers into '\0' separated list of synonyms for the common name

  Rank rank; // taxonomic rank

  const char *text; // descriptive text
  const char *image; // illustrative image TODO: as sixel or something else?

  /* Tree Members (these are handled by the Tree only) */
  int depth; // number of steps from root
  struct Clade *parent; // pointer to parent clade
  int num_children; // number of children
  struct Clade **children; // array of pointers to children

  /* Game Members (these are handled by the Game only) */
  int on_chain; // whether this is on the chain from answer species to the root
  int subtree_state; // either not in the subtree, hidden, or visible
} Clade;


/* ========================================================================== */
/*   FUNCTION DECLARATIONS                                                    */
/* ========================================================================== */
/**
 * Fills a clade with details. Note that this is not a deep copy: the char*
 * members are assigned by reference not by value.
 */
void clade_fill(Clade *clade, int tid, int ptid, const char *com_name,
                const char *sci_name, int num_synonyms, char const *synonyms[],
                Rank rank, const char *text, const char *image);

/**
 * Outputs clade information to the output stream. Use 'verbose' to print (0) a
 * very brief summary, (1) all the fields apart from text and image.
 */
void clade_fprint(Clade *clade, FILE * restrict stream, int verbose);

/**
 * As for clade_fprint but prints to stdout.
 */
void clade_print(Clade *clade, int verbose);


#endif

#ifndef TREE_H
#define TREE_H

#include "clade.h"


/* ========================================================================== */
/*   TYPE DEFINITIONS                                                         */
/* ========================================================================== */
/**
 * A Tree is a list of clade which are linked up/down to their parent and
 * children, along with a number of allocated memory pools.
 */
typedef struct {
  Clade *clades; // list of all the clades in the tree in no particular order
  int size; // the number of clades in the tree
  int max_size; // the maximum potential number of clades in the tree

  Clade *root; // the root clade of the tree
  int num_species; // number of species clades
  Clade **species; // pointers to the species (ie leaf clades)

  /* shared memory pools */
  Clade **children; // divided up into clade->children arrays
  Clade **pool; // generic pool for use as a workspace
} Tree;


/* ========================================================================== */
/*   FUNCTION DECLARATIONS                                                    */
/* ========================================================================== */
/**
 * Allocates memory for a Tree with a given maximum size.
 */
void tree_alloc(Tree *tree, int max_size);

/**
 * Copies in the members of clade into the next available slot in tree->clades.
 * Note that this is not a deep copy - all of the char* fields are copied by
 * reference not by value.
 */
void tree_add_clade(Tree *tree, const Clade *clade);

/**
 * Given a Tree whose list of clades has been filled, sets all of the clades'
 * linking properties and Tree properties.
 */
void tree_link(Tree *tree);

/**
 * Frees all memory associated with the Tree. Note that this does not free any
 * of the char* members in the tree->clades, which must be handled separately.
 */
void tree_free(Tree *tree);

/**
 * Find a clade in the tree using one of the fields, returning a pointer to it,
 * or NULL if it is not found. If species is non-zero, only check for species.
 */
Clade *tree_find_tid(Tree *tree, int tid, int species);
Clade *tree_find_com(Tree *tree, const char *com_name, int species);
Clade *tree_find_sci(Tree *tree, const char *sci_name, int species);


#endif

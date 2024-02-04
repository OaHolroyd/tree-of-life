#include "tree.h"

#include <stdlib.h>
#include <string.h>

#include "utils.h"


/* ========================================================================== */
/*   AUXILIARY FUNCTION DEFINITIONS                                           */
/* ========================================================================== */
/**
 * Sets the parent pointer for each clade in the tree.
 */
void set_parents(Tree *tree) {
  Clade *clades = tree->clades;

  for (int i = 0; i < tree->size; i++) {
    for (int j = i+1; j < tree->size; j++) {
      /* i is parent of j */
      if (clades[j].ptid == clades[i].tid) {
        clades[j].parent = &(clades[i]);
      }

      /* j is parent of i */
      else if (clades[j].tid == clades[i].ptid) {
        clades[i].parent = &(clades[j]);
      }
    } // j end
  } // i end
}

/**
 * Sets the array of pointers-to-children for the clades in the tree using
 * sections of memory from the children pool.
 */
void set_children(Tree *tree) {
  Clade *clades = tree->clades;
  Clade **pool = tree->children;

  /* count children */
  for (int i = 0; i < tree->size; i++) {
    for (int j = i+1; j < tree->size; j++) {
      /* i is parent of j */
      if (clades[j].ptid == clades[i].tid) {
        clades[i].num_children++;
      }

      /* j is parent of i */
      else if (clades[j].tid == clades[i].ptid) {
        clades[j].num_children++;
      }
    } // j end
  } // i end

  /* assign children */
  int idx = 0; // cumulative position of index into pool
  for (int i = 0; i < tree->size; i++) {
    /* assign space in memory pool */
    clades[i].children = &(pool[idx]);
    idx += clades[i].num_children;

    /* fill with pointers-to-children */
    int k = 0;
    for (int j = 0; j < tree->size; j++) {
      /* j is a child of clade */
      if (clades[j].ptid == clades[i].tid) {
        clades[i].children[k] = &(clades[j]);
        k++;

        /* found all of the children */
        if (k == clades[i].num_children) {
          break;
        }
      }
    } // j end
  } // i end
}

/**
 * Sets the root node from the clades in the tree. All the clades in the tree
 * must have their parent pointers set before this is called.
 */
void set_root(Tree *tree) {
  const int n = tree->size;
  Clade *clades = tree->clades;

  Clade *root = NULL;
  for (int i = 0; i < n; i++) {
    /* the root is the node with no parent */
    if (clades[i].parent == NULL) {
      /* can't have more than one root */
      if (root != NULL) {
        error("Tree has multiple root nodes.");
      }

      root = &(clades[i]);
    }
  } // i end

  /* no root found */
  if (root == NULL) {
    error("Tree has no root.");
  }

  tree->root = root;
}

/**
 * Sets the depth (number of links from the root) of each clade in the tree.
 */
void set_depths(Tree *tree) {
  Clade **queue = tree->pool;

  /* breadth-first traversal */
  queue[0] = tree->root;
  int next = 0; // index to next clade to be assigned its depth
  int end = 1; // index to the empty spot at the back of the queue
  for (int k = 0; k < tree->size; k++) {
    Clade *clade = queue[next]; // get the next clade
    next++;

    /* root is a special case */
    if (clade == tree->root) {
      clade->depth = 0;
    } else {
      clade->depth = clade->parent->depth + 1;
    }

    /* add all of the children to the queue */
    for (int i = 0; i < clade->num_children; i++) {
      queue[end] = clade->children[i];
      end++;
    } // i end
  } // k end
}

/**
 * Fills the species list with species.
 */
void set_species(Tree *tree) {
  Clade *clades = tree->clades;
  Clade **species = tree->species;

  for (int i = 0; i < tree->size; i++) {
    /* add it to the list if its rank is species */
    if (clades[i].rank == SPECIES) {
      species[tree->num_species] = &(clades[i]);
      tree->num_species++;
    }
  } // i end
}


/* ========================================================================== */
/*   FUNCTION DEFINITIONS                                                     */
/* ========================================================================== */
void tree_alloc(Tree *tree, int max_size) {
  tree->clades = malloc(max_size * sizeof(Clade));
  tree->size = 0;
  tree->max_size = max_size;

  tree->root = NULL;
  tree->species = malloc(max_size * sizeof(Clade*));
  tree->num_species = 0;

  tree->children = malloc(max_size * sizeof(Clade*));
  tree->pool = malloc(max_size * sizeof(Clade*));
}

void tree_add_clade(Tree *tree, const Clade *clade) {
  if (tree->size == tree->max_size) {
    // TODO: could realloc rather than error here
    error("Number of elements in tree cannot exceed %d", tree->max_size);
  }

  /* just copy all members into the next slot */
  tree->clades[tree->size] = *clade;
  tree->size++;
}

void tree_link(Tree *tree) {
  /* define the tree members for the children */
  set_parents(tree);
  set_children(tree);
  set_root(tree);
  set_depths(tree);

  /* make an quick-to-check list of all of the species in the tree */
  set_species(tree);
}

void tree_free(Tree *tree) {
  free(tree->clades);
  free(tree->species);
  free(tree->children);
  free(tree->pool);
}

Clade *tree_find_tid(Tree *tree, int tid, int species) {
  /* search through the species first, since this is typically what is wanted */
  for (int i = 0; i < tree->num_species; i++) {
    if (tree->species[i]->tid == tid) {
      return tree->species[i];
    }
  } // i end

  /* only care about species */
  if (species) {
    return NULL;
  }

  /* then search all of the clades */
  for (int i = 0; i < tree->size; i++) {
    if (tree->clades[i].tid == tid) {
      return &tree->clades[i];
    }
  } // i end

  return NULL;
}

Clade *tree_find_com(Tree *tree, const char *com_name, int species) {
  /* search through the species first, since this is typically what is wanted */
  for (int i = 0; i < tree->num_species; i++) {
    if (strcmp(tree->species[i]->com_name, com_name) == 0) {
      return tree->species[i];
    }
  } // i end

  /* only care about species */
  if (species) {
    return NULL;
  }

  /* then search all of the clades */
  for (int i = 0; i < tree->size; i++) {
    if (strcmp(tree->clades[i].com_name, com_name) == 0) {
      return &tree->clades[i];
    }
  } // i end

  return NULL;
}

Clade *tree_find_sci(Tree *tree, const char *sci_name, int species) {
  /* search through the species first, since this is typically what is wanted */
  for (int i = 0; i < tree->num_species; i++) {
    if (strcmp(tree->species[i]->sci_name, sci_name) == 0) {
      return tree->species[i];
    }
  } // i end

  /* only care about species */
  if (species) {
    return NULL;
  }

  /* then search all of the clades */
  for (int i = 0; i < tree->size; i++) {
    if (strcmp(tree->clades[i].sci_name, sci_name) == 0) {
      return &tree->clades[i];
    }
  } // i end

  return NULL;
}

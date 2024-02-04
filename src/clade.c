#include "clade.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>


/* ========================================================================== */
/*   FUNCTION DEFINITIONS                                                     */
/* ========================================================================== */
void clade_fill(Clade *clade, int tid, int ptid, const char *com_name,
                const char *sci_name, int num_synonyms, char const *synonyms[],
                Rank rank, const char *text, const char *image) {
  /* fill input fields */
  clade->tid = tid;
  clade->ptid = ptid;
  clade->com_name = com_name;
  clade->sci_name = sci_name;
  clade->rank = rank;
  clade->text = text;
  clade->image = image;

  /* unpack synonyms */
  clade->num_synonyms = num_synonyms;
  for (int i = 0; i < MAX_SYNONYMS; i++) {
    clade->synonyms[i] = NULL;
  } // i end
  for (int i = 0; i < num_synonyms; i++) {
    clade->synonyms[i] = synonyms[i];
  } // i end

  /* fill other fields */
  clade->depth = 0;
  clade->parent = NULL;
  clade->num_children = 0;
  clade->children = NULL;
}

void clade_fprint(Clade *clade, FILE * restrict stream, int verbose) {
  /* print all of the members of the clade struct */
  if (verbose) {
    fprintf(stream, "Clade %p {\n", (void*)clade);

    fprintf(stream, "  tid: %d\n", clade->tid);
    fprintf(stream, "  ptid: %d\n", clade->ptid);

    if (clade->com_name != NULL) {
      fprintf(stream, "  com_name: %s\n", clade->com_name);
    } else {
      fprintf(stream, "  com_name: NULL\n");
    }
    fprintf(stream, "  sci_name: %s\n", clade->sci_name);

    fprintf(stream, "  num_synonyms: %d\n", clade->num_synonyms);
    fprintf(stream, "  synonyms: [");
    if (clade->num_synonyms > 0) {
      fprintf(stream, "%s", clade->synonyms[0]);
      for (int i = 1; i < clade->num_synonyms; i++) {
        fprintf(stream, ", %s", clade->synonyms[i]);
      } // i end
    }
    fprintf(stream, "]\n");

    fprintf(stream, "  rank: %d [%s]\n", clade->rank, rank_str(clade->rank));

    if (clade->text != NULL) {
      fprintf(stream, "  text: %p [%ld chars]\n", (const void*)clade->text, strnlen(clade->text, MAX_TEXT));
    } else {
      fprintf(stream, "  text: NULL\n");
    }

    if (clade->image != NULL) {
      fprintf(stream, "  image: %p [%ld chars]\n", (const void*)clade->image, strnlen(clade->image, MAX_IMAGE));
    } else {
      fprintf(stream, "  image: NULL\n");
    }

    fprintf(stream, "  depth: %d\n", clade->depth);
    if (clade->parent != NULL) {
      fprintf(stream, "  parent: %p [%s]\n", (void*)clade->parent, (clade->parent->com_name) ? clade->parent->com_name : clade->parent->sci_name);
    } else {
      fprintf(stream, "  parent: NULL\n");
    }

    fprintf(stream, "  num_children: %d\n", clade->num_children);
    fprintf(stream, "  children: [");
    if (clade->num_children > 0) {
      fprintf(stream, "\n");
      for (int i = 0; i < clade->num_children; i++) {
        fprintf(stream, "    %p [%s],\n", (void*)clade->children[i], (clade->children[i]->com_name) ? clade->children[i]->com_name : clade->children[i]->sci_name);
      } // i end
      fprintf(stream, "  ");
    }
    fprintf(stream, "]\n");

    fprintf(stream, "}\n");
  }

  /* print summary */
  else {
    fprintf(stream, "Clade %p {", (void*)clade);
    fprintf(stream, "%s", (clade->com_name) ? clade->com_name : clade->sci_name);
    fprintf(stream, "}\n");
  }
}

void clade_print(Clade *clade, int verbose) {
  clade_fprint(clade, stdout, verbose);
}

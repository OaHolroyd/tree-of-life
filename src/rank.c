#include "rank.h"

/**
 * Names of the taxonomic ranks. These must match their enum indices with an
 * offset of +2 so that the rank_str function works.
 */
const char *RANK_STR[] = {
  "no rank",
  "clade",
  "superkingdom",
  "kingdom",
  "phylum",
  "subphylum",
  "superclass",
  "class",
  "subclass",
  "infraclass",
  "cohort",
  "subcohort",
  "superorder",
  "order",
  "suborder",
  "infraorder",
  "parvorder",
  "superfamily",
  "family",
  "subfamily",
  "tribe",
  "subtribe",
  "genus",
  "subgenus",
  "species group",
  "species subgroup",
  "species",
};


/* ========================================================================== */
/*   FUNCTION DEFINITIONS                                                     */
/* ========================================================================== */
const char *rank_str(Rank rank) {
  return RANK_STR[rank + 2];
}

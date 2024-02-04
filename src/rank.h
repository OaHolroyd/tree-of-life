#ifndef RANK_H
#define RANK_H


/* ========================================================================== */
/*   TYPE DEFINITIONS                                                         */
/* ========================================================================== */
/**
 * A Rank defines the (ordered) taxonomic ranks. Smaller values correspond to
 * more general ranks.
 */
typedef enum Rank {
  NO_RANK = -2,
  CLADE = -1,

  SUPER_KINGDOM = 0,
  KINGDOM,
  PHYLUM,
  SUB_PHYLUM,
  SUPER_CLASS,
  CLASS,
  SUB_CLASS,
  INFRA_CLASS,
  COHORT,
  SUB_COHORT,
  SUPER_ORDER,
  ORDER,
  SUB_ORDER,
  INFRA_ORDER,
  PARV_ORDER,
  SUPER_FAMILY,
  FAMILY,
  SUB_FAMILY,
  TRIBE,
  SUB_TRIBE,
  GENUS,
  SUB_GENUS,
  SPECIES_GROUP,
  SPECIES_SUBGROUP,
  SPECIES,
} Rank;


/* ========================================================================== */
/*   FUNCTION DECLARATIONS                                                    */
/* ========================================================================== */
/**
 * Returns a pointer to a const string containing the name of the rank.
 */
const char *rank_str(Rank rank);


#endif

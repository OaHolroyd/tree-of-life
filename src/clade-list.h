#ifndef CLADE_LIST_H
#define CLADE_LIST_H

#include "clade.h"

/* the number of predefined clades in the list */
#define NUM_CLADES (1228)

/* the number of species in the list */
#define NUM_SPECIES (767)

/* the length of the longest species name */
#define LEN_SPECIES (29)

/* list of predefined clades (preferably in alphabetical order by com_name) */
extern const Clade CLADE_LIST[NUM_CLADES];

#endif

import { CLADE_LIST } from "../data/clades.js";

export const SPECIES_LIST = [
  ["sponge", 1],
  ["spider", 4],
  ["ladybird", 6],
  ["bee", 7],
  ["aardvark", 8],
  ["platypus", 9],
  ["human", 11],
  ["gorilla", 12],
];

const SMALL_SPECIES_TIDS = [1, 6, 11];
const MEDIUM_SPECIES_TIDS = [1, 4, 6, 8, 11];
const LARGE_SPECIES_TIDS = [1, 4, 6, 7, 8, 9, 11, 12];
export const SPECIES_LISTS = [
  SMALL_SPECIES_TIDS,
  MEDIUM_SPECIES_TIDS,
  LARGE_SPECIES_TIDS,
];

/**
 * Get a random species TID
 * @param {int} size - 0: small, 1: medium, 2: large
 * @returns
 */
export function randomSpeciesTID(size) {
  return SPECIES_LISTS[size][
    Math.floor(Math.random() * SPECIES_LISTS[size].length)
  ];
}

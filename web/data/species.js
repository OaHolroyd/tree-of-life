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

/**
 * Get a random species TID
 * @returns a species TID
 */
export function randomSpeciesTID() {
  return SPECIES_LIST[Math.floor(Math.random() * SPECIES_LIST.length)][0];
}

import { SPECIES_LIST } from "./../data/species.js";

/**
 * Get suggestions for species completions
 * @param {str} query - input string to match to possible species
 * @param {Array[int]} previousGuesses - array of previously-guessed TIDs to exclude
 * @param {int} limit - the maximum number of suggestions returned in the case of poor matches
 * @returns an array of strings of possible completions
 */
export function getSuggestions(query, previousGuesses, limit = 10) {
  query = query.toLowerCase();

  function scoreWord(word) {
    if (previousGuesses.includes(word[1])) {
      return -100000;
    }

    const lower = word[0].toLowerCase();

    if (lower.startsWith(query)) {
      return 10000 - lower.length;
    }

    const contains = lower.indexOf(query);
    if (contains !== -1) {
      return 5000 - contains - lower.length;
    }

    let score = 0;
    let pos = 0;
    let prev = -1;

    for (const c of query) {
      const idx = lower.indexOf(c, pos);

      if (idx === -1) {
        return -Infinity;
      }

      score += 10;
      score += Math.max(0, 20 - idx);

      if (prev !== -1 && idx === prev + 1) {
        score += 15;
      }

      prev = idx;
      pos = idx + 1;
    }

    score -= lower.length;

    return score;
  }

  const scored = SPECIES_LIST.map((word) => ({
    word,
    score: scoreWord(word),
  }))
    .filter((x) => x.score > -Infinity)
    .sort((a, b) => b.score - a.score);

  // split into suggestions we will definitely return and ones we'll
  // only include if we need to bump up to the limit
  const guaranteed = scored.filter((x) => x.score > 4000);
  const others = scored.filter((x) => x.score <= 4000);

  return [
    ...guaranteed,
    ...others.slice(0, Math.max(0, limit - guaranteed.length)),
  ].map((x) => x.word[0]);
}

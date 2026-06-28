/**
 * Get suggestions for species completions
 * @param {str} query - input string to match to possible species
 * @param {Array[int]} previousGuesses - array of previously-guessed TIDs to exclude
 * @param {Array} options - array of [name, TID] pairs of valid options
 * @param {int} limit - the maximum number of suggestions returned in the case of poor matches
 * @returns
 */
export function getSuggestions(query, previousGuesses, options, limit = 10) {
  if (query.length === 0) {
    return [];
  }

  query = query.toLowerCase();

  /**
   * Score a given word/pair of words
   * @param {Array[str | Array[str], int]} word - either a [name, TID] pair or a [[name0, name1, ...], TID] pair
   * @returns [name, score]
   */
  function scoreWord(word) {
    // handle cases where word is actually a list of possible words
    if (word[0] instanceof Array) {
      const scores = word[0].map((w) => scoreWord([w, word[1]])[1]);
      const imax = scores.reduce(
        (iMax, x, i, arr) => (x > arr[iMax] ? i : iMax),
        0,
      );
      return [word[0][imax], scores[imax]];
    }

    if (previousGuesses.includes(word[1])) {
      return [word[0], -Infinity];
    }

    const lower = word[0].toLowerCase();

    if (lower.startsWith(query)) {
      return [word[0], 10000 - lower.length];
    }

    const contains = lower.indexOf(query);
    if (contains !== -1) {
      return [word[0], 5000 - contains - lower.length];
    }

    let score = 0;
    let pos = 0;
    let prev = -1;

    for (const c of query) {
      const idx = lower.indexOf(c, pos);

      if (idx === -1) {
        return [word[0], -Infinity];
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

    return [word[0], score];
  }

  const scored = options
    .map((word) => scoreWord(word))
    .filter((x) => x[1] > -Infinity)
    .sort((a, b) => b[1] - a[1]);

  // split into suggestions we will definitely return and ones we'll
  // only include if we need to bump up to the limit
  const guaranteed = scored.filter((x) => x[1] > 4000);
  const others = scored.filter((x) => x[1] <= 4000);

  return [
    ...guaranteed,
    ...others.slice(0, Math.max(0, limit - guaranteed.length)),
  ].map((x) => x[0]);
}

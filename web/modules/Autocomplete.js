import { SPECIES_LIST } from "./../data/species.js";

// Dummy logic to return matching suggestions
export function getDummySuggestions(query) {
  if (!query) return [];
  const lowerQuery = query.toLowerCase();

  // Returns elements that start with or contain the query string
  // TODO: prioritise the ones that start with the query
  // TODO: add near-misses if the list is empty
  return SPECIES_LIST.reduce((result, [str]) => {
    if (str.toLowerCase().includes(lowerQuery)) result.push(str);
    return result;
  }, []);
}

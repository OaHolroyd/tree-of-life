import { DUMMY_SPECIES } from "./../data/species.js";

// Dummy logic to return matching suggestions
export function getDummySuggestions(query) {
  if (!query) return [];
  const lowerQuery = query.toLowerCase();
  // Returns elements that start with or contain the query string
  return DUMMY_SPECIES.filter((item) =>
    item.toLowerCase().includes(lowerQuery),
  );
}

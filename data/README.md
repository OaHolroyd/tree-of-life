# Data generation
The clades that make up the tree that the game is played on are automatically generated from the [NCBI's taxonomy database](https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/).

The user should provide four files:

### `.env`
This should contain a valid email address, used as part of the `User-Agent` header when using the Wikipedia API, as per their [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy). eg
```
EMAIL=example@email.com
```

### `species.json`
This should contain a sequence of species that will become to leaf nodes of the tree, representing guesses and possible answers.

The file should be formatted as follows,
```json
{
  "species": [
    {
      "short": ["wolf", "dog", "dingo"],
      "scientific": "Canis lupus"
    }
    ...
  ]
}
with each entry consisting of a scientific name and a list of common names. The scientific name should correspond to the one used in the NCBI taxonomy database.
```

### `wiki-names.json`
Sometimes the scientific name of a clade in the NCBI taxonomy database does not match the wikipedia entry, or matches more than one page (eg "puma", which is an animal, a brand, a language, etc.). This file should consist of pairs of taxonomy IDs (TIDs) and Wikipedia article names:

```json
{
  "10046": "Meriones_(rodent)",
  "10088": "Mus_(genus)",
  ...
}
```

### `overwrites.json`
The automated process will, in the vast majority of cases, gather the right information. However, some wiki-text and images may be missing (in the case of clades that Wikipedia does not recognise for example), images might be of poor quality, or (most frequently) the automated text-cleanup process misses something (eg when trying to parse pronunciation guides). This file consists of a list of clades identified by their scientific name and fields to overwrite:

```json
[
  {
    "sci_name": "Osteoglossocephalai",
    "text": "Text about Osteoglossocephalai",
    "image": "https:\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/f\/f2\/xyz.jpeg"
  },
  ...
]
```

See `setup.py` and the intermediate files in `tmp-large`/`tmp-small` for details about what fields are available.

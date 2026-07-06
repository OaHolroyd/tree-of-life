# Data generation
The clades that make up the tree that the game is played on are automatically generated from [Wikispecies](https://species.wikimedia.org/wiki/Main_Page).

The user should provide three files:

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
      "scientific": "Canis lupus",
      "level": 0
    }
    ...
  ]
}
```
with each entry consisting of a scientific name, a list of common names, and a level index (0, 1, or 2), corresponding to the game size at which this species should be included.

### `overwrites.json`
The automated process will, in the vast majority of cases, gather the right information. However, some wiki-text and images may be missing (in the case of clades that Wikipedia does not recognise for example), images might be of poor quality, or (most frequently) the automated text-cleanup process misses something (eg when trying to parse pronunciation guides). This file consists of a list of clades identified by their scientific name and fields to overwrite:

```json
[
  "Osteoglossocephalai": {
    "sci_name": "Name override",
    "text": "Text about Osteoglossocephalai",
    "image": "https:\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/f\/f2\/xyz.jpeg"
  },
  ...
]
```

See `setup.py` and the intermediate files in `tmp` for details about what fields are available, and additional options for customising linkages and other more fine-grained controls.

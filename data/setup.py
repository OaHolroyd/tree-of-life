from pathlib import Path
import os
import json
import textwrap
import requests
import zipfile
import io
import time

from PIL import Image
from dotenv import load_dotenv
import pandas as pd
import networkx as nx
from pyvis.network import Network
import community as community_louvain
import colorsys

SMALL = False
SIZE_EXT = "-small" if SMALL else "-large"

URL = "https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/taxdmp.zip"
BASE_DIR = Path(__file__).parent
TAXDUMP_DIR = BASE_DIR / "taxdump"

TMP_DIR = BASE_DIR / ("tmp" + SIZE_EXT)
TMP_DIR.mkdir(exist_ok=True)


def species_txt_to_json():
    """Convert from the txt format `sci_name (common names)` to json"""
    species = []
    with open(BASE_DIR / f"species{SIZE_EXT}.txt", "r") as fp:
        for line in fp:
            line = line.strip()

            # extract sci name and common name(s)
            line = line.split(" (")
            sci_name = line[0]
            common_names = line[1][:-1].split(", ")
            species.append({"short": common_names, "scientific": sci_name})

    # save intermediate in file
    with open(BASE_DIR / f"species{SIZE_EXT}.json", "w") as fp:
        json.dump({"species": species}, fp, indent=2)


def read_names(update=False) -> pd.DataFrame:
    """
    Reads in the name info from names.dmp
    """
    if update or not Path(TMP_DIR / "names.feather").is_file():
        file = TAXDUMP_DIR / "names.dmp"
        df = pd.read_csv(
            file,
            sep="|",
            usecols=[0, 1, 3],
            names=["tid", "name", "class"],
        )
        df["name"] = df["name"].str.strip()
        df["class"] = df["class"].str.strip()
        df.to_feather(TMP_DIR / "names.feather")
    else:
        df = pd.read_feather(TMP_DIR / "names.feather")
    return df


def read_nodes(update=False) -> pd.DataFrame:
    """
    Reads in the node info from nodes.dmp
    """
    if update or not Path(TMP_DIR / "nodes.feather").is_file():
        filename = TAXDUMP_DIR / "nodes.dmp"
        df = pd.read_csv(
            filename,
            sep="|",
            usecols=[0, 1, 2],
            names=["tid", "ptid", "rank"],
        )
        df["rank"] = df["rank"].str.strip()
        df.to_feather(TMP_DIR / "nodes.feather")
    else:
        df = pd.read_feather(TMP_DIR / "nodes.feather")
    return df


def generate_species(
    names: pd.DataFrame,
    update_short: bool = True,
    update: bool = False,
    verbose: bool = True,
) -> dict:
    """Read the species names (leaves) from species.json"""
    # Try to shortcut from tmp file
    if not update:
        try:
            with open(TMP_DIR / "species.json", "r") as fp:
                species = json.load(fp)["species"]
            return species
        except FileNotFoundError:
            print("tmp file not found, falling back to species.json")
            pass

    # Get a list of the scientific names
    with open(BASE_DIR / f"species{SIZE_EXT}.json", "r") as fp:
        species = json.load(fp)["species"]

    # Find a TID and common names for each one
    n = len(species)
    for i, sp in enumerate(species):
        sci_name = sp["scientific"]
        if verbose:
            print(f"{i + 1:3d}/{n} ({sci_name})")

        # Find all rows with matching scientific name
        rows = names.loc[names["name"] == sci_name]

        # there should only be one match, otherwise something has gone wrong
        if len(rows) != 1:
            # raise RuntimeError(f"{sci_name}: {len(rows)} matches")
            print(f"ERROR: {sci_name}: {len(rows)} matches")
            continue

        # Get the TID
        tid = int(rows["tid"].iloc[0])
        species[i]["tid"] = tid

        # Find short name
        if update_short:
            short_names = []
            rows = names.loc[names["tid"] == tid]
            name_classes = [
                "common name",
                "genbank common name",
                "blast name",
                "scientific name",
            ]
            for name_class in name_classes:
                sub_rows = rows.loc[names["class"] == name_class]
                if len(sub_rows) > 0:
                    short_names = [sub_rows["name"].iloc[0]]
                    break

            for name in short_names:
                if name not in species[i]["short"]:
                    species[i]["short"].append(name)

    # save intermediate in file
    with open(TMP_DIR / "species.json", "w") as fp:
        json.dump({"species": species}, fp, indent=2)

    return species


def filter_graph(
    nodes: pd.DataFrame,
    names: pd.DataFrame,
    species: dict,
    update: bool = False,
    verbose: bool = True,
    root: int | str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Filters the nodes in the graph so only the subgraph with the species as
    leaves remains. Also filters the names to match.

    If root is set (scientific name or NCBI TID) also remove everything
    above this point.
    """
    if (
        (not update)
        and Path(TMP_DIR / "sub_nodes.feather").is_file()
        and Path(TMP_DIR / "sub_names.feather").is_file()
    ):
        sub_nodes = pd.read_feather(TMP_DIR / "sub_nodes.feather")
        sub_names = pd.read_feather(TMP_DIR / "sub_names.feather")

        if verbose:
            print(f"filtered from {len(nodes):,} to {len(sub_nodes):,} nodes")

        return sub_nodes, sub_names

    # find root TID
    if isinstance(root, int):
        root_tid = root
        row = nodes.loc[nodes["tid"] == root]
        if len(row) != 1:
            raise ValueError(f"root with name {root} not found")
    elif isinstance(root, str):
        row = names.loc[names["name"] == root]
        if len(row) == 1:
            root_tid = row.iloc[0]["tid"]
        else:
            raise ValueError(f"root with name {root} not found")
    else:
        root_tid = None

    sub_tids = set()
    nodes["status"] = 0

    def recursive_filter(input_tid):
        """Adds this TID and recurses to the parent"""
        sub_tids.add(input_tid)

        if input_tid == root_tid:
            nodes.loc[nodes["tid"] == input_tid, "ptid"] = 1
            return

        row = nodes.loc[nodes["tid"] == input_tid]
        if len(row) > 0:
            ptid = row["ptid"].iloc[0]
            if row["status"].iloc[0] == 1:
                return
            nodes.at[row.iloc[0].name, "status"] = 1
            if ptid != 1:
                recursive_filter(ptid)

    # add each species TID and travel up the chain of parents
    n = len(species)
    for i, sp in enumerate(species):
        if verbose:
            print(f"{i + 1:3d}/{n} ({sp['short'][0]})")
        recursive_filter(sp["tid"])

    if verbose:
        print(f"filtered from {len(nodes):,} to {len(sub_tids):,} nodes")

    sub_nodes = nodes[nodes["tid"].isin(sub_tids)]
    sub_names = names[names["tid"].isin(sub_tids)]

    sub_nodes.to_feather(TMP_DIR / "sub_nodes.feather")
    sub_names.to_feather(TMP_DIR / "sub_names.feather")

    return sub_nodes, sub_names


def name_nodes(
    nodes: pd.DataFrame,
    names: pd.DataFrame,
    species: dict,
    verbose: bool = True,
) -> pd.DataFrame:
    """
    Gives a scientific and common name to all of the nodes. If species is
    provided then a species short name overrides the common name.
    """
    # add new column for the names
    nodes["com_name"] = ""
    nodes["sci_name"] = ""

    # for each one try and find a correct name
    nodes = nodes.reset_index(drop=True)
    n = len(nodes)
    for i, row in nodes.iterrows():
        tid = row["tid"]
        has_name = False

        if verbose:
            print(f"{i + 1:4d} / {n} ({tid})")

        # try and find a common name
        rows = names.loc[(names["tid"] == tid) & (names["class"] == "common name")]
        if len(rows) > 0:
            nodes.at[i, "com_name"] = rows["name"].iloc[0]
            has_name = True
        else:
            # use other types of common name as a backup
            rows = names.loc[
                (names["tid"] == tid) & (names["class"].str.contains("common name"))
            ]
            if len(rows) > 0:
                nodes.at[i, "com_name"] = rows["name"].iloc[0]
                has_name = True

        # try and find a scientific name
        rows = names.loc[(names["tid"] == tid) & (names["class"] == "scientific name")]
        if len(rows) > 0:
            nodes.at[i, "sci_name"] = rows["name"].iloc[0]
            has_name = True

        # override common name with short name (if it exists)
        if row["rank"] == "species" and species is not None:
            for sp in species:
                if sp["tid"] == tid:
                    # short might be a list of names
                    if isinstance(sp["short"], str):
                        nodes.at[i, "com_name"] = [sp["short"]]
                    else:
                        nodes.at[i, "com_name"] = sp["short"]
                    has_name = True

                    nodes.at[i, "sci_name"] = sp["scientific"]
                    break

        if (not has_name) and verbose:
            print(f"  {tid} has no name")

    return nodes


def _reformat_wiki_text(text: str) -> str:
    """Clean up a wikipedia text string"""
    if text is None:
        return text

    # replace bad character combinations
    text = text.replace(" ()", "")
    text = text.replace("( ", "(")
    text = text.replace(" )", ")")
    text = text.replace('""', '"')

    # split into sentences
    MAX_LEN = 600
    sentences = text.split(".")
    text = ""
    for s in sentences:
        s = s + "."
        if len(text + s) > MAX_LEN:
            break
        text = text + s
    return text


def _batch_request_text(
    session,
    nodes: pd.DataFrame,
    batch: dict[str, int],
) -> pd.DataFrame:
    """
    Make a request to the Wikipedia API to update the text for the nodes in
    the batch
    """
    url = "https://en.wikipedia.org/w/api.php"

    # text request
    params_text = {
        "action": "query",
        "format": "json",
        "redirects": 1,
        "prop": "extracts",
        "exintro": 1,
        "explaintext": 1,
        "titles": "|".join(batch.keys()),
    }
    res = session.get(url, params=params_text, timeout=20)
    if res.status_code != 200:
        raise RuntimeError(f"request returned status code {res.status_code}")
    data_text = res.json()
    time.sleep(1)

    # update batch with replacements
    if "redirects" in data_text["query"]:
        for redirect in data_text["query"]["redirects"]:
            batch[redirect["to"].replace(" ", "_")] = batch[
                redirect["from"].replace(" ", "_")
            ]

    # add text to rows
    for _, val in data_text["query"]["pages"].items():
        key = val["title"].replace(" ", "_")
        if key in batch:
            j = batch[key]
            if "extract" in val:
                text = val["extract"].replace("\n", " ").replace("\t", " ")
                nodes.at[j, "text"] = _reformat_wiki_text(text)

    return nodes


def _batch_request_img(
    session,
    nodes: pd.DataFrame,
    batch: dict[str, int],
) -> pd.DataFrame:
    """
    Make a request to the Wikipedia API to update the images for the nodes in
    the batch
    """
    url = "https://en.wikipedia.org/w/api.php"

    # image request
    params_img = {
        "action": "query",
        "format": "json",
        "redirects": 1,
        "prop": "pageimages",
        "pithumbsize": 500,
        "titles": "|".join(batch.keys()),
    }
    res = session.get(url, params=params_img, timeout=20)
    if res.status_code != 200:
        raise RuntimeError(f"request returned status code {res.status_code}")
    data_img = res.json()
    time.sleep(1)

    # update batch with replacements
    if "redirects" in data_img["query"]:
        for redirect in data_img["query"]["redirects"]:
            batch[redirect["to"].replace(" ", "_")] = batch[
                redirect["from"].replace(" ", "_")
            ]

    # add images to rows
    for _, val in data_img["query"]["pages"].items():
        key = val["title"].replace(" ", "_")
        if key in batch:
            j = batch[key]
            if "thumbnail" in val:
                nodes.at[j, "image"] = val["thumbnail"]["source"]

    return nodes


def make_wiki_name(row, wiki_names: dict[str, str]) -> str:
    """Convert from the scientific name to the wiki name"""
    # make wiki search name
    wiki_name = row["sci_name"].replace(" ", "_")

    # override with supplied data
    if wiki_names.get(str(row["tid"])) is not None:
        wiki_name = wiki_names[str(row["tid"])]

    return wiki_name


def make_wiki_cache(nodes: pd.DataFrame, wiki_names: dict[str, str] | None = None):
    """Save wiki data to a cache"""
    if wiki_names is None:
        wiki_names = {}
        with open(BASE_DIR / "wiki-names.json", "r") as fp:
            wiki_names = json.load(fp)

    data = {}
    for i, row in nodes.iterrows():
        wiki_name = make_wiki_name(row, wiki_names)
        data[wiki_name] = [row["text"], row["image"]]

    with open(TMP_DIR / f"wiki-cache.json", "w") as fp:
        json.dump(data, fp, indent=2)


def add_wikidata(
    nodes: pd.DataFrame,
    email: str,
    update: bool = False,
    reattempt: bool = False,
    verbose: bool = True,
    use_cache: bool = True,
) -> pd.DataFrame:
    """
    Tries to add data from Wikipedia for each node.
    """
    if not update and (TMP_DIR / "wiki_nodes.json").is_file():
        nodes = pd.read_json(TMP_DIR / "wiki_nodes.json")

        if not reattempt:
            make_wiki_cache(nodes, None)
            return nodes

    # add new column for the image url/intro text if they don't already exist
    if "image" not in nodes.columns:
        nodes["image"] = ""
    if "text" not in nodes.columns:
        nodes["text"] = ""

    # set up session
    batch_size = 20
    headers = {
        "User-Agent": f"tree-of-life-bot/0.1 ({email})",
        "Accept-Encoding": "gzip",
    }

    session = requests.Session()
    session.headers.update(headers)

    # try and open wiki-dict
    wiki_names = {}
    with open(BASE_DIR / "wiki-names.json", "r") as fp:
        wiki_names = json.load(fp)

    wiki_cache = {}
    if use_cache:
        with open(TMP_DIR / "wiki-cache.json", "r") as fp:
            wiki_cache = json.load(fp)

    # for each one try and get Wikipedia data
    nodes = nodes.reset_index(drop=True)
    if update or not (TMP_DIR / "wiki_nodes.json").is_file():
        n = len(nodes)
        text_batch = {}
        img_batch = {}
        missing_entries = {}
        count = 0
        for i, row in nodes.iterrows():
            count += 1
            if verbose:
                print(f"{i + 1:4d}/{n} ({row['sci_name']})")

            wiki_name = make_wiki_name(row, wiki_names)

            # Try to use info from the cache where possible, otherwise add them
            # to the next batch to be requested
            text, image = wiki_cache.get(wiki_name, ("", ""))
            if len(text) > 0:
                nodes.at[i, "text"] = text
            else:
                text_batch[wiki_name] = i
            if len(image) > 0:
                nodes.at[i, "image"] = image
            else:
                img_batch[wiki_name] = i

            # Process the text batch once full
            if len(text_batch) == batch_size:
                nodes = _batch_request_text(session, nodes, text_batch)

                # check if any are missing text so we can try again
                for name, j in text_batch.items():
                    if nodes.at[j, "text"] == "":
                        missing_entries[name] = j

                text_batch = {}

            # Process the image batch once full
            if len(img_batch) == batch_size:
                nodes = _batch_request_img(session, nodes, img_batch)

                # check if any are missing images so we can try again
                for name, j in img_batch.items():
                    if nodes.at[j, "image"] == "":
                        missing_entries[name] = j

                img_batch = {}

        # Process the text batch once full
        if len(text_batch) > 0:
            nodes = _batch_request_text(session, nodes, text_batch)

            # check if any are missing text so we can try again
            for name, j in text_batch.items():
                if nodes.at[j, "text"] == "":
                    missing_entries[name] = j

            text_batch = {}

        # Process the image batch once full
        if len(img_batch) > 0:
            nodes = _batch_request_img(session, nodes, img_batch)

            # check if any are missing images so we can try again
            for name, j in img_batch.items():
                if nodes.at[j, "image"] == "":
                    missing_entries[name] = j

            img_batch = {}
    else:
        # Get missing entries from the existing nodes
        missing_entries = {}
        for i, row in nodes.iterrows():
            if (nodes.at[i, "text"] == "") or (nodes.at[i, "image"] == ""):
                wiki_name = make_wiki_name(row, wiki_names)
                missing_entries[wiki_name] = i

    # try missing entries
    print(f"trying {len(missing_entries)} again")
    batch_size = 10
    text_batch = {}
    img_batch = {}
    n = len(missing_entries)
    for i, key in enumerate(missing_entries.keys()):
        if nodes.at[missing_entries[key], "text"] == "":
            text_batch[key] = missing_entries[key]
        if nodes.at[missing_entries[key], "image"] == "":
            img_batch[key] = missing_entries[key]

        # Process the text batch once full
        if len(text_batch) == batch_size:
            nodes = _batch_request_text(session, nodes, text_batch)

            # check if any are missing text so we can try again
            for name, j in text_batch.items():
                if nodes.at[j, "text"] == "":
                    missing_entries[name] = j

            text_batch = {}

        # Process the image batch once full
        if len(img_batch) == batch_size:
            nodes = _batch_request_img(session, nodes, img_batch)

            # check if any are missing images so we can try again
            for name, j in img_batch.items():
                if nodes.at[j, "image"] == "":
                    missing_entries[name] = j

            img_batch = {}

    # Process the text batch once full
    if len(text_batch) > 0:
        nodes = _batch_request_text(session, nodes, text_batch)

        # check if any are missing text so we can try again
        for name, j in text_batch.items():
            if nodes.at[j, "text"] == "":
                missing_entries[name] = j

        text_batch = {}

    # Process the image batch once full
    if len(img_batch) > 0:
        nodes = _batch_request_img(session, nodes, img_batch)

        # check if any are missing images so we can try again
        for name, j in img_batch.items():
            if nodes.at[j, "image"] == "":
                missing_entries[name] = j

        img_batch = {}

    # save as json for human editing
    nodes.to_json(TMP_DIR / "wiki_nodes.json", orient="records", indent=2)

    make_wiki_cache(nodes, wiki_names)

    return nodes


def apply_overwrites(nodes: pd.DataFrame) -> pd.DataFrame:
    """Apply overwrites (from `overwrite.json`) to the nodes"""
    with open(BASE_DIR / "overwrite.json", "r") as fp:
        overwrites = json.load(fp)

    for overwrite in overwrites:
        try:
            node = nodes[nodes["sci_name"] == overwrite["sci_name"]].iloc[0]
        except Exception as e:
            print(f"ERROR: {overwrite['sci_name']} not found in nodes")
            raise e

        for key, val in overwrite.items():
            if key == "sci_name":
                continue
            nodes.at[node.name, key] = val

    return nodes


def clean_text(nodes: pd.DataFrame) -> pd.DataFrame:
    """Performs a second pass, cleaning up mistakes in the wikitext"""
    replacements = {
        "..": ".",
        ". .": ".",
        ".  .": ".",
        ".   .": ".",
        "(;": "(",
        "(,": "(",
        "(  ": "(",
        "( ": "(",
        "    ": " ",
        "   ": " ",
        "  ": " ",
        '"': "'",
    }

    for i, node in nodes.iterrows():
        text = node["text"]
        for a, b in replacements.items():
            text = text.replace(a, b)
        nodes.at[node.name, "text"] = text

    return nodes


def remove_chains(nodes: pd.DataFrame) -> pd.DataFrame:
    """
    Remove chains where no branching occurs

    Importantly this operation decouples the link between a node's TID and the
    one from the NCBI taxonomy database
    """
    # first pass, count the number of children
    nodes["nchildren"] = 0
    for _, node in nodes.iterrows():
        # increment parent child count
        nodes.loc[nodes["tid"] == node["ptid"], "nchildren"] += 1

    # track whether this node has been passed over
    # 0: unchecked, 1: to keep, -1: to remove
    nodes["status"] = 0

    # Start iterating at the leaves and go upwards
    species = nodes[nodes["nchildren"] == 0]
    print(f"removing {len(nodes[nodes['nchildren'] == 1])} singleton nodes... ")
    for i, sp in species.iterrows():
        # travel upwards, identifying chains
        chain = []
        node = sp
        while (node["ptid"] != 1) and (node["status"] == 0):
            nodes.at[node.name, "status"] = 1

            parent = nodes[nodes["tid"] == node["ptid"]].iloc[0]
            if parent["nchildren"] == 1:
                # if this node is the only child of its parent then the parent
                # and the node are part of a chain
                if len(chain) == 0:
                    # start of the chain
                    chain = [node]
                chain.append(parent)
            elif len(chain) > 0:
                # chain has ended and at least two nodes in so can be removed

                # new node will have the following linking IDs
                ptid = chain[-1]["ptid"]
                tid = chain[0]["tid"]

                # decide which clade will be kept
                if chain[0]["nchildren"] == 0:
                    # special chase where chain ends at a leaf/species which
                    # must be retained
                    retained = 0
                else:
                    # otherwise keep the most derived clade _unless_ there is a
                    # significant disparity in how much info is available
                    retained = 0

                    l_cutoff = 200
                    if (
                        chain[retained]["image"] == ""
                        or len(chain[retained]["text"]) < l_cutoff
                    ):
                        for j, link in enumerate(chain):
                            if j != retained:
                                if (
                                    link["image"] != ""
                                    and len(link["text"]) >= l_cutoff
                                ):
                                    retained = j
                                    print(
                                        f"  using {link['sci_name']} over {chain[0]['sci_name']}"
                                    )
                                    break

                    if chain[retained]["image"] == "" and chain[retained]["text"] == "":
                        print(f"  ALL {chain[retained]['sci_name']}")
                    elif chain[retained]["image"] == "":
                        print(f"  IMG {chain[retained]['sci_name']}")
                    elif chain[retained]["text"] == "":
                        print(f"  TXT {chain[retained]['sci_name']}")
                    elif len(chain[retained]["text"]) < 100:
                        print(f"  SHT {chain[retained]['sci_name']}")

                for j, link in enumerate(chain):
                    if j == retained:
                        # keep this one
                        nodes.at[link.name, "tid"] = tid
                        nodes.at[link.name, "nchildren"] = chain[0]["nchildren"]
                        nodes.at[link.name, "ptid"] = ptid
                    else:
                        # mark this for removal
                        nodes.at[link.name, "status"] = -1

                chain = []

            # move upwards
            node = parent

    # remove the nodes that are no longer in the tree
    nodes.drop(nodes[nodes["status"] == -1].index, inplace=True)
    nodes.drop(["status"], axis=1, inplace=True)

    # save as json for human editing
    nodes.to_json(TMP_DIR / "raw_nodes.json", orient="records", indent=2)

    print("WARNING: the following clades are significant polytomies")
    print(nodes.loc[nodes["nchildren"] >= 5, ["sci_name", "com_name", "nchildren"]])

    return nodes


def filter_nodes(nodes: pd.DataFrame, required: str | int) -> pd.DataFrame:
    """Filter nodes do that all complete sub-chains include the specified node"""
    # find node TID
    if isinstance(required, int):
        node_tid = required
        row = nodes.loc[nodes["tid"] == required]
        if len(row) != 1:
            raise ValueError(f"node with TID {required} not found")
    elif isinstance(required, str):
        row = nodes.loc[nodes["sci_name"] == required]
        if len(row) == 1:
            node_tid = row.iloc[0]["tid"]
        else:
            raise ValueError(f"node with name {required} not found")

    # find the species whose lineages pass through the required one
    all_species = nodes.loc[nodes["rank"] == "species"]
    species = []
    for _, sp in all_species.iterrows():
        node = sp
        while node["ptid"] != 1:
            if node["tid"] == node_tid:
                species.append(sp)
                break
            parent = nodes[nodes["tid"] == node["ptid"]].iloc[0]
            node = parent

    # filter by those species
    sub_tids = set()

    def recursive_filter(input_tid):
        """Adds this TID and recurses to the parent"""
        sub_tids.add(input_tid)
        row = nodes.loc[nodes["tid"] == input_tid]
        if len(row) > 0:
            ptid = row["ptid"].iloc[0]
            if ptid != 1:
                recursive_filter(ptid)

    for sp in species:
        recursive_filter(sp["tid"])

    return nodes[nodes["tid"].isin(sub_tids)]


def _group_to_color(group_id):
    """
    Deterministically convert an integer group ID
    into a visually distinct hex color.
    """

    # Spread hues around the color wheel
    hue = (group_id * 0.618033988749895) % 1

    # Fixed saturation/value gives nice vivid colors
    saturation = 0.5
    value = 0.9

    r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)

    return "#{:02x}{:02x}{:02x}".format(
        int(r * 255),
        int(g * 255),
        int(b * 255),
    )


def display_tree(
    nodes: pd.DataFrame,
    min_rank: str = "species",
    outfile: Path | str | None = None,
):
    """
    Create an html graph of the tree.

    Optionally limits the tree to stop at min_rank
    """
    if min_rank != "species":
        sub_tids = set()

        def recursive_filter(input_tid, reached_rank: bool):
            """Adds this TID and recurses to the parent"""
            row = nodes.loc[nodes["tid"] == input_tid]

            if any(row["rank"] == min_rank):
                reached_rank = True

            if reached_rank:
                sub_tids.add(input_tid)

            if len(row) > 0:
                ptid = row["ptid"].iloc[0]
                if ptid != 1:
                    recursive_filter(ptid, reached_rank)

        # add each species TID and travel up the chain of parents
        species = nodes.loc[nodes["rank"] == "species"]
        n = len(species)
        for i, sp in species.iterrows():
            recursive_filter(sp["tid"], False)

        nodes = nodes[nodes["tid"].isin(sub_tids)]

    # create partition
    graph = nx.Graph()
    for _, row in nodes.iterrows():
        node_id = row["tid"]
        graph.add_node(node_id)
        if row.get("ptid"):
            graph.add_edge(row["ptid"], node_id)
    partition = community_louvain.best_partition(graph, resolution=1.0)

    # create directed graph
    graph = nx.DiGraph()
    for _, row in nodes.iterrows():
        node_id = row["tid"]
        group = partition[node_id]
        label = f"{row['sci_name']}\n({row['com_name']})"
        hover_text = "\n".join(textwrap.wrap(row["text"], width=50))
        image = row.get("image")

        # Make label
        label = row["sci_name"]
        if isinstance(row["com_name"], str):
            if len(row["com_name"]) > 0:
                label = f"{row['com_name']}\n({row['sci_name']})"
        elif isinstance(row["com_name"], list):
            if len(row["com_name"][0]) > 0:
                label = f"{row['com_name'][0]}\n({row['sci_name']})"

        if image is not None:
            # Image node
            graph.add_node(
                node_id,
                label=label,
                title=hover_text,
                shape="circularImage",
                image=image,
                size=45,
                borderWidth=3,
                color={
                    "border": _group_to_color(group),
                    "background": "#ffffff",
                    "highlight": {
                        "border": _group_to_color(group),
                        "background": "#ffffff",
                    },
                    "hover": {
                        "border": _group_to_color(group),
                        "background": "#ffffff",
                    },
                },
                font={"size": 18, "vadjust": 80},
            )
        else:
            # Text-only node
            graph.add_node(
                node_id,
                label=label,
                title=hover_text,
                shape="box",
                margin=12,
                font={"size": 18},
            )

        # Add edge to parent if parent exists
        if row.get("ptid"):
            graph.add_edge(row["ptid"], node_id)

    # Create visualization
    net = Network(
        height="900px",
        width="100%",
        directed=True,
        bgcolor="#ffffff",
        font_color="black",
    )
    net.set_options("""
    {
      "layout": {
        "hierarchical": {
          "enabled": true,
          "direction": "UD",
          "sortMethod": "directed",
          "levelSeparation": 350,
          "nodeSpacing": 260
        }
      },
      "physics": {
        "enabled": false
      },
      "edges": {
        "smooth": {
          "type": "cubicBezier"
        }
      }
    }
    """)
    net.from_nx(graph)

    if outfile is None:
        outfile = TMP_DIR / "taxonomy_tree.html"

    net.write_html(str(outfile))


def clade_to_html(clade: dict, save_dir: Path):
    """
    Generates a standalone, styled HTML file for a clade dictionary
    to facilitate quick visual quality control, including a copy-pasteable
    JSON template for data cleaning.
    """
    # Ensure the directory exists
    save_dir.mkdir(parents=True, exist_ok=True)

    # Extract data with safe defaults
    tid = clade.get("tid", "Unknown_TID")
    sci_name = clade.get("sci_name", "Unknown Scientific Name")
    rank = clade.get("rank", "unknown")
    ptid = clade.get("ptid", "N/A")
    nchildren = clade.get("nchildren", 0)
    image_url = clade.get("image", "")
    text_content = clade.get("text", "No descriptive text available.")

    # Handle the polymorphic 'com_name' field (string, list, or empty)
    raw_com_name = clade.get("com_name", "")
    if isinstance(raw_com_name, list):
        clean_list = [name.strip() for name in raw_com_name if name.strip()]
        com_name_str = ", ".join(clean_list) if clean_list else "None"
    elif isinstance(raw_com_name, str) and raw_com_name.strip():
        com_name_str = raw_com_name.strip()
    else:
        com_name_str = "None"

    # Escape quotes in the scientific name to ensure valid JSON in the template box
    json_safe_sci_name = sci_name.replace('"', '\\"')

    # Generate the string snippet for the overwrite box
    overwrite_template = (
        f'{{\n  "sci_name": "{json_safe_sci_name}",\n  "text": "",\n  "image": ""\n}}'
    )

    # Define the HTML template
    html_content = f"""<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>QC: {sci_name} ({tid})</title>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    background-color: #f4f6f9;
                    color: #333;
                    margin: 0;
                    padding: 40px 20px;
                    display: flex;
                    justify-content: center;
                }}
                .card {{
                    background: #ffffff;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
                    max-width: 900px;
                    width: 100%;
                    padding: 30px;
                    box-sizing: border-box;
                }}
                .header {{
                    border-bottom: 2px solid #edf2f7;
                    padding-bottom: 15px;
                    margin-bottom: 25px;
                }}
                .sci-name {{
                    font-size: 2.2rem;
                    margin: 0;
                    color: #1a202c;
                    font-style: italic;
                }}
                .com-name {{
                    font-size: 1.3rem;
                    color: #4a5568;
                    margin: 5px 0 0 0;
                    font-weight: 500;
                }}
                .badge {{
                    display: inline-block;
                    background-color: #e2e8f0;
                    color: #4a5568;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    font-weight: bold;
                    letter-spacing: 0.5px;
                    margin-top: 10px;
                }}
                .content {{
                    display: flex;
                    gap: 30px;
                    flex-wrap: wrap;
                    margin-bottom: 30px;
                }}
                .image-container {{
                    flex: 1 1 350px;
                    max-width: 100%;
                    display: flex;
                    align-items: flex-start;
                    justify-content: center;
                    background: #f7fafc;
                    border-radius: 8px;
                    padding: 10px;
                    border: 1px solid #e2e8f0;
                }}
                .clade-img {{
                    max-width: 100%;
                    max-height: 400px;
                    border-radius: 6px;
                    object-fit: contain;
                }}
                .no-image {{
                    color: #a0aec0;
                    font-style: italic;
                    padding: 100px 0;
                    text-align: center;
                }}
                .details {{
                    flex: 1 1 400px;
                }}
                .meta-table {{
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }}
                .meta-table th, .meta-table td {{
                    text-align: left;
                    padding: 8px 12px;
                    border-bottom: 1px solid #edf2f7;
                }}
                .meta-table th {{
                    color: #718096;
                    font-weight: 600;
                    width: 35%;
                }}
                .meta-table td {{
                    color: #2d3748;
                    font-family: monospace;
                    font-size: 1rem;
                }}
                .text-block {{
                    background: #f8fafc;
                    border-left: 4px solid #3182ce;
                    padding: 15px;
                    border-radius: 0 8px 8px 0;
                    line-height: 1.6;
                    color: #2d3748;
                    white-space: wrap;
                }}
                .overwrite-section {{
                    border-top: 2px dashed #e2e8f0;
                    padding-top: 20px;
                }}
                .overwrite-title {{
                    font-size: 1rem;
                    color: #718096;
                    margin: 0 0 10px 0;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }}
                .overwrite-box {{
                    background: #1e293b;
                    color: #f8fafc;
                    font-family: 'Fira Code', 'Courier New', Courier, monospace;
                    padding: 15px;
                    border-radius: 8px;
                    font-size: 0.95rem;
                    white-space: pre;
                    overflow-x: auto;
                    border: 1px solid #0f172a;
                }}
            </style>
        </head>
        <body>

        <div class="card">
            <div class="header">
                <h1 class="sci-name">{sci_name}</h1>
                <p class="com-name">{com_name_str}</p>
                <span class="badge">{rank}</span>
            </div>

            <div class="content">
                <div class="image-container">
                    {"<img class='clade-img' src='" + image_url + "' alt='Clade Image'>" if image_url else "<div class='no-image'>No Image URL provided</div>"}
                </div>

                <div class="details">
                    <table class="meta-table">
                        <tr><th>Taxon ID (tid)</th><td>{tid}</td></tr>
                        <tr><th>Parent ID (ptid)</th><td>{ptid}</td></tr>
                        <tr><th>Direct Children</th><td>{nchildren}</td></tr>
                    </table>

                    <div class="text-block">
                        {text_content}
                    </div>
                </div>
            </div>

            <div class="overwrite-section">
                <h2 class="overwrite-title">Overwrite JSON Template</h2>
                <pre class="overwrite-box">{overwrite_template}</pre>
            </div>
        </div>

        </body>
        </html>
        """

    # Generate filename and save
    safe_sci_name = "".join(
        c for c in sci_name if c.isalnum() or c in (" ", "_", "-")
    ).replace(" ", "_")
    filename = f"{tid}_{safe_sci_name}.html"
    file_path = save_dir / filename
    file_path.write_text(html_content, encoding="utf-8")


def _enquote(s):
    """makes a string suitable for printing as a string in the header"""
    s = s.translate(
        str.maketrans(
            {
                "\\": r"\\",
                "%": r"%%",
                '"': r"\"",
            }
        )
    )
    return '"' + s + '"'


def _clade_struct_str(clade) -> str:
    """String representation of a clade for use in a list of c-structs"""
    # common name and synonyms
    com_names = clade["com_name"]
    if isinstance(com_names, list):
        com_name = com_names[0]

        if len(com_names) > 1:
            num_synonyms = len(com_names) - 1
            synonyms = f'{{"{com_names[1]}"'
            for name in com_names[2:]:
                synonyms += f', "{name}"'
            synonyms += "}"
        else:
            num_synonyms = 0
            synonyms = "{NULL}"
    else:
        com_name = com_names
        num_synonyms = 0
        synonyms = "{NULL}"
    if com_name == "":
        com_name = "NULL"
    else:
        com_name = _enquote(com_name)

    RANK_STR = {
        "no rank": "NO_RANK",
        "clade": "CLADE",
        "kingdom": "KINGDOM",
        "phylum": "PHYLUM",
        "subphylum": "SUB_PHYLUM",
        "superclass": "SUPER_CLASS",
        "class": "CLASS",
        "subclass": "SUB_CLASS",
        "infraclass": "INFRA_CLASS",
        "cohort": "COHORT",
        "superorder": "SUPER_ORDER",
        "order": "ORDER",
        "suborder": "SUB_ORDER",
        "infraorder": "INFRA_ORDER",
        "parvorder": "PARV_ORDER",
        "superfamily": "SUPER_FAMILY",
        "family": "FAMILY",
        "subfamily": "SUB_FAMILY",
        "tribe": "TRIBE",
        "genus": "GENUS",
        "species": "SPECIES",
    }
    rank = RANK_STR[clade["rank"]]

    text = _enquote(clade["text"])

    image = "NULL"

    lines = [
        "  {",
        f"    .tid = {clade['tid']},",
        f"    .ptid = {clade['ptid']},",
        f"    .com_name = {com_name},",
        f"    .sci_name = {_enquote(clade['sci_name'])},",
        f"    .num_synonyms = {num_synonyms},",
        f"    .synonyms = {synonyms},",
        f"    .rank = {rank},",
        f"    .text = {text},",
        f"    .image = {image},",
        "  },",
    ]

    return "\n".join(lines)


def clades_to_c(nodes: pd.DataFrame):
    """Create a .h and .c file containing all of the clade data from nodes"""
    nnodes = len(nodes)
    nspecies = len(nodes[nodes["rank"] == "species"])

    # sort the nodes and find the longest name string
    clade_list = []
    name_len = 0
    long_name = ""
    for _, clade in nodes.iterrows():
        clade_list.append(clade)

        if clade["rank"] == "species":
            if isinstance(clade["com_name"], str):
                name_len = max(name_len, len(clade["com_name"]))
                if len(clade["com_name"]) == name_len:
                    long_name = clade["com_name"]
            else:
                name_len = max(name_len, len(clade["com_name"][0]))
                if len(clade["com_name"][0]) == name_len:
                    long_name = clade["com_name"][0]
    print(long_name)
    clade_list = sorted(
        clade_list, key=lambda d: d["rank"] + "ZZZZZZ" + str(d["com_name"])
    )

    # make the header
    lines = [
        "#ifndef CLADE_LIST_H",
        "#define CLADE_LIST_H",
        "",
        '#include "clade.h"',
        "",
        "/* the number of predefined clades in the list */",
        f"#define NUM_CLADES ({nnodes})",
        "",
        "/* the number of species in the list */",
        f"#define NUM_SPECIES ({nspecies})",
        "",
        "/* the length of the longest species name */",
        f"#define LEN_SPECIES ({name_len})",
        "",
        "/* list of predefined clades (preferably in alphabetical order by com_name) */",
        "extern const Clade CLADE_LIST[NUM_CLADES];",
        "",
        "#endif",
    ]
    with open(BASE_DIR / "clade-list.h", "w") as fp:
        for line in lines:
            fp.write(line)
            fp.write("\n")

    # make the implementation
    with open(BASE_DIR / "clade-list.c", "w") as fp:
        fp.write('#include "clade-list.h"\n')
        fp.write("\n")
        fp.write("const Clade CLADE_LIST[] = {\n")
        for clade in clade_list:
            fp.write(_clade_struct_str(clade))
            fp.write("\n")
        fp.write("};\n")


def download_images(nodes: pd.DataFrame, email: str):
    (BASE_DIR / "img").mkdir(exist_ok=True)
    n = len(nodes)
    count = 0
    for _, clade in nodes.iterrows():
        count += 1
        print(f"{count:4d} / {n} {clade['sci_name']}")

        if clade["image"].lower().endswith(".jpg") or clade["image"].lower().endswith(
            ".jpeg"
        ):
            img_file = BASE_DIR / "img" / f"{clade['tid']}.jpg"
        elif clade["image"].lower().endswith(".png"):
            img_file = BASE_DIR / "img" / f"{clade['tid']}.png"
        elif clade["image"].lower().endswith(".gif"):
            img_file = BASE_DIR / "img" / f"{clade['tid']}.gif"
        else:
            raise ValueError(f"image format not recognised for {clade['image']}")

        # prefer pngs
        png_file = img_file.with_suffix("").with_suffix(".png")
        if png_file.is_file():
            continue

        # don't download it if we've already got it
        if img_file.is_file():
            image = Image.open(img_file)
            image.save(str(png_file), optimize=True, quality=100)
            img_file.unlink()
            continue

        # download the image
        try:
            response = requests.get(
                clade["image"],
                stream=True,
                timeout=10,
                headers={
                    "User-Agent": f"tree-of-life-bot/0.1 ({email})",
                },
            )
            time.sleep(5)

            if response.status_code != 200:
                raise RuntimeError(f"code {response.status_code}")

            image = Image.open(response.raw).convert("RGB")
            image.save(str(png_file), optimize=True, quality=100)
        except RuntimeError as e:
            print(f"failed {clade['sci_name']}")
            raise e


def main():
    # fetch taxonomy data from NCBI
    if not TAXDUMP_DIR.exists():
        r = requests.get(URL)
        z = zipfile.ZipFile(io.BytesIO(r.content))
        z.extractall(TAXDUMP_DIR)

    # read data from files
    nodes = read_nodes()
    names = read_names()
    species = generate_species(names=names)

    # filter the data to only include the subtree with the species as leaves
    nodes, names = filter_graph(
        nodes=nodes,
        names=names,
        species=species,
        root="Metazoa",
    )

    # give all nodes a scientific name and try to add common name/names
    nodes = name_nodes(nodes=nodes, names=names, species=species, verbose=False)

    # add data from Wikipedia to the nodes
    load_dotenv()
    email = os.getenv("EMAIL")
    nodes = add_wikidata(nodes, email=email)

    # clean up the tree and apply manual overwrites
    nodes = apply_overwrites(nodes)
    nodes = remove_chains(nodes)
    nodes = clean_text(nodes)

    clades_to_c(nodes)
    download_images(nodes, email=email)

    # check if there are new clades we have not checked
    for i, node in nodes.iterrows():
        if (node["rank"] == "species") and (node["com_name"] == ""):
            print(node["sci_name"])

    # # check if there are new clades we have not checked
    # covered = []
    # with open(TMP_DIR / "covered.txt", "r") as fp:
    #     for line in fp.readlines():
    #         covered.append(line.strip())
    # count = 0
    # batch_size = 10
    # for i, node in nodes.iterrows():
    #     if node["sci_name"] not in covered:
    #         print(node["sci_name"])
    #         clade_to_html(node, TMP_DIR / "clades" / f"{count // batch_size:03d}")
    #         count += 1

    # sci_names = [
    #     "Clitellata",
    # ]
    # for name in sci_names:
    #     display_tree(filter_nodes(nodes, name), outfile=TMP_DIR / f"tree-{name}.html")

    # show the graph
    # display_tree(nodes, min_rank="order")
    # display_tree(nodes)


if __name__ == "__main__":
    main()

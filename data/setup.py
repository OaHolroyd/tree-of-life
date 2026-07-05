from time import time, sleep
import os
import random
from pathlib import Path
import json
import re
from typing import Any
import requests
from copy import deepcopy
import xml.etree.ElementTree as ET

from dotenv import load_dotenv
import numpy as np
from itertools import islice
import mwparserfromhell

import networkx as nx
from pyvis.network import Network
import community as community_louvain
import colorsys
import textwrap

load_dotenv()
EMAIL = os.getenv("EMAIL")

BASE_DIR = Path(__file__).parent
TMP_DIR = BASE_DIR / "tmp"
TMP_DIR.mkdir(exist_ok=True)

XML_PATH = (
    Path(__file__).parent.parent.parent.parent.parent
    / "Downloads/specieswiki-20260601-pages-articles.xml"
)
TEST_XML_PATH = (
    Path(__file__).parent.parent.parent.parent.parent / "Downloads/subsection.xml"
)


# These are mostly genera that don't have their own page
MANUAL_LINKS = [
    {"name": "Anoplogaster", "parent": "Anoplogastridae", "rank": "Genus"},
    {"name": "Balanoglossus", "parent": "Ptychoderidae", "rank": "Genus"},
    {"name": "Cariama", "parent": "Cariamidae", "rank": "Genus"},
    {"name": "Cephenemyia", "parent": "Oestrinae", "rank": "Genus"},
    {"name": "Cerastoderma", "parent": "Cardiidae", "rank": "Genus"},
    {"name": "Cryptochiton", "parent": "Acanthochitonidae", "rank": "Genus"},
    {"name": "Dactylotum", "parent": "Acrididae", "rank": "Genus"},
    {"name": "Dodecolopoda", "parent": "Colossendeidae", "rank": "Genus"},
    {"name": "Dracunculus (Dracunculidae)", "parent": "Dracunculidae", "rank": "Genus"},
    {"name": "Eulipoa", "parent": "Megapodiidae", "rank": "Genus"},
    {"name": "Evadne", "parent": "Podonidae", "rank": "Genus"},
    {"name": "Frankliniella", "parent": "Thripinae", "rank": "Genus"},
    {"name": "Leiopathes", "parent": "Leiopathidae", "rank": "Genus"},
    {"name": "Melopsittacus", "parent": "Melopsittacini", "rank": "Genus"},
    {"name": "Nemobius", "parent": "Nemobiini", "rank": "Genus"},
    {"name": "Numida", "parent": "Numididae", "rank": "Genus"},
    {"name": "Pandion", "parent": "Pandionidae", "rank": "Genus"},
    {"name": "Partamona", "parent": "Apidae", "rank": "Genus"},
    {"name": "Placopecten", "parent": "Palliolinae", "rank": "Genus"},
    {"name": "Radianthus", "parent": "Stichodactylidae", "rank": "Genus"},
    {"name": "Rhincodon", "parent": "Rhincodontidae", "rank": "Genus"},
    {"name": "Thromidia", "parent": "Mithrodiidae", "rank": "Genus"},
    {"name": "Trigona", "parent": "Meliponini", "rank": "Genus"},
    {"name": "Musophagiformes", "parent": "Otidimorphae", "rank": "Order"},
    {"name": "Otidiformes", "parent": "Otidimorphae", "rank": "Order"},
    {"name": "Cuculiformes", "parent": "Otidimorphae", "rank": "Order"},
    {"name": "Castorimorpha", "parent": "Supramyomorpha", "rank": "Infraorder"},
    {"name": "Sophophora", "parent": "Drosophila (ICZN)", "rank": "Subgenus"},
    #
    {"name": "Otidimorphae", "parent": "Columbaves", "rank": "Clade"},
    {"name": "Columbimorphae", "parent": "Columbaves", "rank": "Clade"},
    {"name": "Columbaves", "parent": "Neoaves", "rank": "Clade"},
    #
    {"name": "Opisthocomiformes", "parent": "Gruae", "rank": "Order"},
    {"name": "Gruiformes", "parent": "Gruimorphae", "rank": "Order"},
    {"name": "Charadriiformes", "parent": "Gruimorphae", "rank": "Order"},
    {"name": "Gruimorphae", "parent": "Gruae", "rank": "Clade"},
    {"name": "Gruae", "parent": "Elementaves", "rank": "Clade"},
    {"name": "Phaethoquornithes", "parent": "Elementaves", "rank": "Clade"},
    {"name": "Strisores", "parent": "Elementaves", "rank": "Order"},
    {"name": "Eurypygimorphae", "parent": "Phaethoquornithes", "rank": "Clade"},
    {"name": "Aequornithes", "parent": "Phaethoquornithes", "rank": "Clade"},
    {"name": "Phaethoquornithes", "parent": "Elementaves", "rank": "Clade"},
    {"name": "Elementaves", "parent": "Neoaves", "rank": "Clade"},
    #
    {"name": "Strigiformes", "parent": "Hieraves", "rank": "Order"},
    {"name": "Accipitriformes", "parent": "Hieraves", "rank": "Order"},
    {"name": "Hieraves", "parent": "Afroaves", "rank": "Clade"},
    {"name": "Afroaves", "parent": "Telluraves", "rank": "Clade"},
    {"name": "Piciformes", "parent": "Picodynastornithes", "rank": "Order"},
    {"name": "Coraciiformes", "parent": "Picodynastornithes", "rank": "Order"},
    {"name": "Picodynastornithes", "parent": "Picocoraciae", "rank": "Clade"},
    {"name": "Bucerotiformes", "parent": "Picocoraciae", "rank": "Order"},
    {"name": "Picocoraciae", "parent": "Eucavitaves", "rank": "Clade"},
    {"name": "Trogoniformes", "parent": "Eucavitaves", "rank": "Order"},
    {"name": "Eucavitaves", "parent": "Cavitaves", "rank": "Clade"},
    {"name": "Leptosomiformes", "parent": "Cavitaves", "rank": "Order"},
    {"name": "Cavitaves", "parent": "Coraciimorphae", "rank": "Clade"},
    {"name": "Coliiformes", "parent": "Coraciimorphae", "rank": "Order"},
    {"name": "Coraciimorphae", "parent": "Afroaves", "rank": "Clade"},
    #
    {"name": "Araneae", "parent": "Tetrapulmonata", "rank": "Order"},
    {"name": "Amblypygi", "parent": "Tetrapulmonata", "rank": "Order"},
    {"name": "Tetrapulmonata", "parent": "Arachnopulmonata", "rank": "Superorder"},
    {"name": "Pseudoscorpiones", "parent": "Panscorpiones", "rank": "Order"},
    {"name": "Scorpiones", "parent": "Panscorpiones", "rank": "Order"},
    {"name": "Panscorpiones", "parent": "Arachnopulmonata", "rank": "Superorder"},
    {"name": "Arachnopulmonata", "parent": "Arachnida", "rank": "Clade"},
    {"name": "Parasitiformes", "parent": "Arachnida", "rank": "Superorder"},
    {"name": "Cephalosomata", "parent": "Arachnida", "rank": "Clade"},
    {"name": "Poecilophysidea", "parent": "Cephalosomata", "rank": "Clade"},
    {"name": "Palpigradi", "parent": "Cephalosomata", "rank": "Order"},
    {"name": "Solifugae", "parent": "Poecilophysidea", "rank": "Order"},
    {"name": "Acariformes", "parent": "Poecilophysidea", "rank": "Order"},
    #
    {"name": "Vespoidea", "parent": "Aculeata", "rank": "Superfamily"},
    {"name": "Formicoidea", "parent": "Aculeata", "rank": "Superfamily"},
    {"name": "Pompiloidea", "parent": "Aculeata", "rank": "Superfamily"},
    {"name": "Apoidea", "parent": "Aculeata", "rank": "Superfamily"},
    {"name": "Aculeata", "parent": "Apocrita", "rank": "Infraorder"},
    {"name": "Cynipoidea", "parent": "Proctotrupomorpha", "rank": "Superfamily"},
    {"name": "Chalcidoidea", "parent": "Proctotrupomorpha", "rank": "Superfamily"},
    {"name": "Proctotrupomorpha", "parent": "Parasitoida", "rank": "Infraorder"},
    {"name": "Ichneumonoidea", "parent": "Parasitoida", "rank": "Superfamily"},
    {"name": "Parasitoida", "parent": "Apocrita", "rank": "Superfamily"},
    {"name": "Delphinoidea", "parent": "Delphinida", "rank": "Superfamily"},
    {"name": "Inioidea", "parent": "Delphinida", "rank": "Superfamily"},
    #
    {"name": "Caprini", "parent": "Caprinae", "rank": "Tribe"},
    {"name": "Caprinae", "parent": "Bovidae", "rank": "Subfamily"},
    #
    {"name": "Ranidae", "parent": "Victoranura", "rank": "Family"},
    {"name": "Conrauidae", "parent": "Victoranura", "rank": "Family"},
    {"name": "Victoranura", "parent": "Natatanura", "rank": "Clade"},
    {"name": "Natatanura", "parent": "Ranoidea", "rank": "Clade"},
    {"name": "Arthroleptidae", "parent": "Allodapanura", "rank": "Family"},
    {"name": "Microhylidae", "parent": "Allodapanura", "rank": "Family"},
    {"name": "Allodapanura", "parent": "Ranoidea", "rank": "Clade"},
    {"name": "Ranoidea", "parent": "Phthanobatrachia", "rank": "Clade"},
    #
    {"name": "Bufonidae", "parent": "Agastorophrynia", "rank": "Family"},
    {"name": "Dendrobatidae", "parent": "Agastorophrynia", "rank": "Family"},
    {"name": "Hylidae", "parent": "Athesphatanura", "rank": "Family"},
    {"name": "Phyllomedusidae", "parent": "Athesphatanura", "rank": "Family"},
    {"name": "Agastorophrynia", "parent": "Athesphatanura", "rank": "Clade"},
    {"name": "Athesphatanura", "parent": "Phthanobatrachia", "rank": "Clade"},
    {"name": "Phthanobatrachia", "parent": "Neobatrachia", "rank": "Clade"},
    #
    {"name": "Scarinae", "parent": "Labridae", "rank": "Subfamily"},
    {"name": "Moronidae", "parent": "Acanthuriformes", "rank": "Family"},
    {"name": "Sparidae", "parent": "Acanthuriformes", "rank": "Family"},
    {"name": "Lutjanidae", "parent": "Acanthuriformes", "rank": "Family"},
    #
    {"name": "Asinus", "parent": "Equus", "rank": "Subgenus"},
    #
    {"name": "Myrmicinae", "parent": "Formicoid", "rank": "Subfamily"},
    {"name": "Formicinae", "parent": "Formicoid", "rank": "Subfamily"},
    {"name": "Ecitonini", "parent": "Dorylinae", "rank": "Tribe"},
    {"name": "Dorylinae", "parent": "Formicoid", "rank": "Subfamily"},
    {"name": "Paraponerinae", "parent": "Poneroid", "rank": "Subfamily"},
    {"name": "Formicoid", "parent": "Formicidae", "rank": "Clade"},
    {"name": "Poneroid", "parent": "Formicidae", "rank": "Clade"},
    {"name": "Leptanilloid", "parent": "Formicidae", "rank": "Clade"},
    #
    {"name": "Sphyraenidae", "parent": "Centropomoidei", "rank": "Family"},
    {"name": "Centropomoidei", "parent": "Carangiformes", "rank": "Suborder"},
    {"name": "Soleidae", "parent": "Pleuronectoidei", "rank": "Family"},
    {"name": "Pleuronectoidei", "parent": "Carangiformes", "rank": "Suborder"},
    {"name": "Istiophoridae", "parent": "Menoidei", "rank": "Superfamily"},
    {"name": "Xiphiidae", "parent": "Xiphioidea", "rank": "Family"},
    {"name": "Xiphioidea", "parent": "Menoidei", "rank": "Superfamily"},
    {"name": "Menoidei", "parent": "Carangiformes", "rank": "Suborder"},
    {"name": "Carangiformes", "parent": "Carangaria", "rank": "Order"},
    {"name": "Scorpaenoidei", "parent": "Perciformes", "rank": "Suborder"},
    {"name": "Syngnathiformes", "parent": "Percomorpha", "rank": "Order"},
    {"name": "Percomorpha", "parent": "Acanthopterygii", "rank": "Subdivision"},
    #
    {"name": "Pelecaniformes", "parent": "Pelecanes", "rank": "Order"},
    {"name": "Suliformes", "parent": "Pelecanes", "rank": "Order"},
    {"name": "Pelecanes", "parent": "Pelecanimorphae", "rank": "Clade"},
    {"name": "Ciconiiformes", "parent": "Pelecanimorphae", "rank": "Order"},
    {"name": "Pelecanimorphae", "parent": "Feraequornithes", "rank": "Clade"},
    {"name": "Austrodyptornithes", "parent": "Feraequornithes", "rank": "Clade"},
    {"name": "Feraequornithes", "parent": "Aequornithes", "rank": "Clade"},
    #
    {"name": "Ophiuroidea", "parent": "Asterozoa", "rank": "Class"},
    {"name": "Asterozoa", "parent": "Eleutherozoa", "rank": "Superclass"},
    {"name": "Holothuroidea", "parent": "Echinozoa", "rank": "Class"},
    {"name": "Echinoidea", "parent": "Echinozoa", "rank": "Class"},
    {"name": "Echinozoa", "parent": "Eleutherozoa", "rank": "Superclass"},
    #
    {"name": "Otocolobus", "parent": "Leopard cat lineage", "rank": "Genus"},
    {"name": "Prionailurus", "parent": "Leopard cat lineage", "rank": "Genus"},
    {"name": "Leopard cat lineage", "parent": "Felinae", "rank": "Clade"},
    {"name": "Puma", "parent": "Puma lineage", "rank": "Genus"},
    {"name": "Acinonyx", "parent": "Puma lineage", "rank": "Genus"},
    {"name": "Puma lineage", "parent": "Felinae", "rank": "Clade"},
    #
    {"name": "Toxicofera", "parent": "Episquamata", "rank": "Clade"},
    {"name": "Lacertoidea", "parent": "Episquamata", "rank": "Clade"},
    {"name": "Episquamata", "parent": "Unidentata", "rank": "Clade"},
    {"name": "Unidentata", "parent": "Bifurcata", "rank": "Clade"},
    {"name": "Bifurcata", "parent": "Squamata", "rank": "Clade"},
]

MANUAL_REDIRECTS = {
    "Percomorphaceae": "Percomorpha",
    "Caprimulgimorphae": "Strisores",
    "Castorimorphi": "Castorimorpha",
}

RANK_MAP = {
    "dominium": "Domain",
    "dominia": "Domain",
    "superregnum": "Superkingdom",
    "superregna": "Superkingdom",
    "regnum": "Kingdom",
    "regna": "Kingdom",
    "phylum": "Phylum",
    "phyla": "Phylum",
    "superclassis": "Superclass",
    "superclasses": "Superclass",
    "classis": "Class",
    "classes": "Class",
    "superordo": "Superorder",
    "superordines": "Superorder",
    "ordo": "Order",
    "ordines": "Order",
    "subordo": "Suborder",
    "subordines": "Suborder",
    "superfamilia": "Superfamily",
    "superfamiliae": "Superfamily",
    "familia": "Family",
    "familiae": "Family",
    "subfamilia": "Subfamily",
    "subfamiliae": "Subfamily",
    "divisio": "Division",
    "divisiones": "Division",
    "cohors": "Cohort",
    "cohortes": "Cohort",
    "sectio": "Section",
    "sectiones": "Section",
    "tribus": "Tribe",
    "tribus": "Tribe",
    "subtribus": "Subtribe",
    "subtribus": "Subtribe",
    "genus": "Genus",
    "genera": "Genus",
    "subgenus": "Subgenus",
    "subgenera": "Subgenus",
    "series": "Series",
    "series": "Series",
    "species": "Species",
    "species": "Species",
    "varietas": "Variety",
    "varietates": "Variety",
    "forma": "Form",
    "formae": "Form",
    "cladus": "Clade",
    "cladi": "Clade",
    "chimaera genus": "Genus",
    "clade": "Clade",
    "clades": "Clade",
    "clasis": "Class",
    "class": "Class",
    "claudus": "Clade",
    "cohort": "Cohort",
    "cultivar": "Cultivar",
    "division": "Division",
    "epifamilia": "Epifamily",
    "famililia": "Family",
    "family": "Family",
    "famolia": "Family",
    "gdenus": "Genus",
    "gednus": "Genus",
    "generus": "Genus",
    "genius": "Genus",
    "gennus": "Genus",
    "genu": "Genus",
    "genua": "Genus",
    "genud": "Genus",
    "genujs": "Genus",
    "genusd": "Genus",
    "genys": "Genus",
    "gernus": "Genus",
    "geunus": "Genus",
    "geus": "Genus",
    "gewnus": "Genus",
    "ggenus": "Genus",
    "group": "Group",
    "hypordo": "Hyporder",
    "infraclasse": "Infraclass",
    "infraclassis": "Infraclass",
    "infracohors": "Infracohort",
    "infraorden": "Infraorder",
    "infraorder": "Infraorder",
    "infraordo": "Infraorder",
    "infraphylum": "Infraphylum",
    "infraregnum": "Infrakingdom",
    "lectotype species": "Species",
    "magnordo": "Magnorder",
    "megacohors": "Megacohort",
    "microordo": "Microorder",
    "mirordo": "Microorder",
    "nanordo": "Nanoorder",
    "nothogenus": "Nothogenus",
    "nothospecies": "Nothospecies",
    "order": "Order",
    "ordine": "Order",
    "parafamilia": "Parafamily",
    "parvorder": "Parvorder",
    "parvordo": "Parvorder",
    "realm": "Realm",
    "section": "Section",
    "siubgenus": "Subgenus",
    "specie": "Species",
    "species group": "Species group",
    "specis": "Species",
    "speies": "Species",
    "subamilia": "Subfamily",
    "subbgenus": "Subgenus",
    "subclass": "Subclass",
    "subclasse": "Subclass",
    "subclassis": "Subclass",
    "subcohors": "Subcohort",
    "subcohort": "Subcohort",
    "subdivisio": "Subdivision",
    "subdivision": "Subdivision",
    "subenus": "Subgenus",
    "subertribus": "Subtribe",
    "subfamila": "Subfamily",
    "subfamilae": "Subfamily",
    "subfamilie": "Subfamily",
    "subfamillia": "Subfamily",
    "subfamily": "Subfamily",
    "subfamlia": "Subfamily",
    "subfamoly": "Subfamily",
    "subfmilia": "Subfamily",
    "subinfraordinal group": "Subinfraorder group",
    "subinfraordo": "Subinfraorder",
    "suborder": "Suborder",
    "subordine": "Suborder",
    "subordo incertae sedis": "Suborder",
    "suboro": "Suborder",
    "subpecies": "Subspecies",
    "subphylum": "Subphylum",
    "subprdo": "Suborder",
    "subregnum": "Subkingdom",
    "subribus": "Subtribe",
    "subsectio": "Subsection",
    "subsection": "Subsection",
    "subseries": "Subseries",
    "subspecies": "Subspecies",
    "subtaxon": "Subtaxon",
    "subtribe": "Subtribe",
    "suhgenus": "Subgenus",
    "sungenus": "Subgenus",
    "superamilia": "Superfamily",
    "superclass": "Superclass",
    "supercohors": "Supercohort",
    "supercohort": "Supercohort",
    "superdomain": "Superdomain",
    "superfamila": "Superfamily",
    "superfamily": "Superfamily",
    "superfamily group": "Superfamily group",
    "superfamlia": "Superfamily",
    "supergroup": "Supergroup",
    "superorder": "Superorder",
    "superordine": "Superorder",
    "superphylum": "Superphylum",
    "supertribus": "Supertribe",
    "suprafamilia": "Superfamily",
    "surbordo": "Suborder",
    "sybgenus": "Subgenus",
    "sybtribus": "Subtribe",
    "taxon": "Taxon",
    "tibus": "Tribe",
    "tribe": "Tribe",
    "tribes": "Tribe",
    "tribu": "Tribe",
    "type genus": "Genus",
    "type species": "Species",
}

PREVENT_REDIRECT = [
    "Crocodyliformes",
    "Neobatrachia",
    "Delphinida",
    "Caprinae",
    "Percomorpha",
    "Asinus",
    "Lithobates catesbeianus",
    "Mesotriton",
    "Mesotriton alpestris",
    "Thomomys",
    "Thomomys bottae",
]


def parse_articles(xml_path: Path, force: bool = False):
    """
    Parse the XML dump of WikiSpecies page data and extract the useful info:
        * names
        * links (from child to parent)
        * redirects

    This will by default try and load the data from TMP_DIR/page_data.json
    because parsing the XML is very slow.
    """
    if (TMP_DIR / "page_data.json").is_file() and not force:
        with open(TMP_DIR / "page_data.json", "r") as fp:
            return json.load(fp)

    # Parse XML
    t0 = time()
    tree = ET.parse(xml_path)
    print(f"load XML: {time() - t0}")
    t0 = time()
    root = tree.getroot()

    rank_re = re.compile(r"^\s*([A-Za-z][A-Za-z ]*)\s*:", re.MULTILINE)

    # Iterate over pages and extract the data
    links = []
    redirects = {}
    missing_ranks = set()
    for elem in root:
        if not elem.tag.endswith("page"):
            continue

        etitle = elem.find("{*}title")
        etext = elem.find(".//{*}text")
        if etitle is None or etext is None:
            continue

        title = etitle.text
        if title is None:
            continue

        text = etext.text
        if text is None:
            continue

        # Save redirects
        eredirect = elem.find("{*}redirect")
        if eredirect is not None:
            ens = elem.find("{*}ns")
            if ens is not None and ens.text == "0":
                redirects[title] = eredirect.get("title")
            continue

        # Filter out pages we don't care about (eg citations)
        if any([c in title for c in [".", ",", "&", "0", "1"]]):
            continue
        if any([c in title for c in ["Documentation", "Taxon italics"]]):
            continue

        # The page is either a standard taxon page (<title>Clade</title>) or a
        # template page (<title>Template:Clade</title>)
        if title.startswith("Template:"):
            # Template pages typically include the parent clade as a nested template
            name = title[9:]
            code = mwparserfromhell.parse(text)
            for template in code.filter_templates():
                template_name = str(template.name).strip()

                if template_name.lower() == "taxonav":
                    if len(template.params) >= 1:
                        template_name = str(template.params[0].value).strip()

                # Ignore obvious non-taxonomic templates
                if template_name.lower() in {
                    "namespace",
                    "ns:0",
                    "pbr",
                    "sbr",
                    "tbr",
                    "fbr",
                    "gbr",
                    "cbr",
                    "obr",
                    "pagenamee",
                    "BASEPAGENAME",
                }:
                    continue
                if "#if" in template_name.lower():
                    continue
                if "taxon italics" in template_name.lower():
                    continue
                if "taxonav" in template_name.lower():
                    continue

                if template_name.startswith("Template:"):
                    template_name = template_name[9:]

                # Try and find the rank of this node
                rank = rank_re.search(text)
                if rank is not None:
                    rank = (
                        rank.group(1)
                        .strip()
                        .encode("ascii", errors="ignore")
                        .strip()
                        .decode("ascii")
                    )
                    if rank.lower() not in RANK_MAP:
                        missing_ranks.add(rank.lower())
                    rank = RANK_MAP.get(rank.lower())

                # Sometimes there will be weird unicode characters (eg zero-width spaces) but
                # all the data we care about should be ASCII
                links.append(
                    {
                        "name": name.encode("ascii", errors="ignore")
                        .strip()
                        .decode("ascii"),
                        "parent": template_name.encode("ascii", errors="ignore")
                        .strip()
                        .decode("ascii"),
                        "rank": rank,
                    }
                )

    for link in MANUAL_LINKS:
        links = [l for l in links if l["name"] != link["name"]]
        links.append(link)

    redirects = {
        old: new for old, new in redirects.items() if old not in PREVENT_REDIRECT
    }
    redirects |= MANUAL_REDIRECTS

    print(f"parse XML: {time() - t0}")

    with open(TMP_DIR / "page_data.json", "w") as fp:
        json.dump({"links": links, "redirects": redirects}, fp, indent=2)

    return {"links": links, "redirects": redirects}


def find_parents_and_rank_and_name(
    node_name: str,
    data,
    ensure_full: bool = False,
) -> tuple[list[str], str | None, str]:
    """
    For a given node name (scientific name), find all possible parents in the
    data extracted from the XML dump, using redirects where necessary.

    If ensure_full is set to False then the code will only return a parent once.
    """
    parents = []
    rank = None
    true_name = node_name
    has_found = False
    for i, node in enumerate(data["links"]):
        if node["name"] == node_name:
            has_found = True
            if not ensure_full:
                if node.get("handled"):
                    continue
            data["links"][i]["handled"] = True

            parents.append(node["parent"])
            rank = node["rank"]

    if len(parents) == 0 and not has_found:
        if node_name in data["redirects"]:
            true_name = data[node_name]
            _parents, rank, _ = find_parents_and_rank_and_name(true_name, data)
            parents += _parents

    return parents, rank, true_name


# TODO: Should be able to get around this by finding the species page and checking for the genus
MANUAL_GENUS = {
    "Aurelia aurita": "Aurelia (Ulmaridae)",
    "Calopteryx splendens": "Calopteryx (Calopterygidae)",
    "Cyanea capillata": "Cyanea (Cyaneidae)",
    "Cynocephalus volans": "Cynocephalus (Cynocephalidae)",
    "Cystophora cristata": "Cystophora (Phocidae)",
    "Dracunculus medinensis": "Dracunculus (Dracunculidae)",
    "Drosophila melanogaster": "Sophophora",
    "Echinus esculentus": "Echinus (Echinidae)",
    "Glaucidium passerinum": "Glaucidium (Strigidae)",
    "Hystrix africaeaustralis": "Hystrix (Hystricidae)",
    "Mertensia ovum": "Mertensia (Mertensiidae)",
    "Morelia viridis": "Morelia (Pythonidae)",
    "Pieris rapae": "Pieris (Pieridae)",
    "Vandellia cirrhosa": "Vandellia (Trichomycteridae)",
    "Zeus faber": "Zeus (Linnaeus)",
    "Equus hemionus": "Asinus",
    "Equus kiang": "Asinus",
    "Equus africanus": "Asinus",
}


def make_chain(
    node_name: str,
    data,
    ensure_full: bool = False,
) -> list:
    """
    Starting at a named node (scientific name), continue finding parents until
    none are available. If there are nodes with multiple possible parents
    return the longest chain.

    If ensure_full is set to False then the code will stop if it hits a clade
    it has seen before.
    """
    should_print = False
    if node_name == "Drosophila melanogaster":
        should_print = True

    # initialise the chains:
    #    [has_ended, (node_name, rank), (node_name, rank), ..., node_name]
    if re.match(r"[A-Z][a-z]+ [a-z]+", node_name):
        # Species are a special case
        genus = MANUAL_GENUS.get(node_name)
        if genus is None:
            genus = node_name.split(" ")[0]
        chains = [[False, (node_name, "Species"), genus]]
    else:
        chains = [[False, node_name]]
    multiple_chains = False

    # Keep extending the chains until no parents are found.
    # In the case of multiple parents, duplicate the chain and continue
    # growing in both directions.
    while True:
        all_ended = True

        new_chains = []
        for chain in chains:
            # skip if chain has ended
            if chain[0]:
                new_chains.append(chain)
                continue

            if should_print:
                print(chain[-1])

            # find all possible parents, the rank, and apply any redirects
            parents, rank, true_name = find_parents_and_rank_and_name(
                chain[-1], data, ensure_full or multiple_chains
            )
            chain[-1] = true_name

            # no parents found -> chain has ended
            if len(parents) == 0:
                chain[0] = True
                chain[-1] = (chain[-1], rank)
                new_chains.append(chain)
                continue
            all_ended = False

            # otherwise make the chain longer
            for parent in parents:
                # account for redirects
                parent = data["redirects"].get(parent, parent)

                # extend chain
                new_chain = deepcopy(chain)
                new_chain[-1] = (new_chain[-1], rank)
                new_chain.append(parent)
                new_chains.append(new_chain)

        chains = new_chains
        if len(chains) != 1:
            # filter so only the longest are kept
            max_len = max([len(chain) for chain in chains])
            new_chains = []
            for chain in chains:
                if len(chain) == max_len:
                    new_chains.append(chain)
            chains = new_chains

        if len(chains) != 1:
            multiple_chains = True

        if all_ended:
            break

    if len(chains) != 1:
        # if all the chains are identical

        for n0, n1 in zip(chains[0][1:], chains[1][1:]):
            print(f"{n0} {n1}")
        raise RuntimeError("more than one chain found")

    return chains[0][1:]


def apply_redirects(nodes, page_data):
    """
    Enforce the redirects so only the most up to date names are used.

    NOTE: there are some redirects which link down to their descendants
          and so must be ignored.
    """
    redirects = page_data["redirects"]
    for old, new in redirects.items():
        if old in nodes:
            if new in nodes:
                # new already exists, just point everything to it
                # TODO: what if new has a larger TID than old?
                for i, node in nodes.items():
                    if node["ptid"] == nodes[old]["tid"]:
                        nodes[i]["ptid"] = nodes[new]["tid"]
            else:
                # new doesn't exist, move old -> new
                nodes[new] = nodes[old]
                nodes[new]["sci_name"] = new
            nodes.pop(old)
    return nodes


def make_nodes(
    species_list: list[dict[str, Any]],
    data,
    force: bool = False,
    ensure_eukaryota: bool = False,
):
    """
    Take the XML dump data and convert it into linked nodes, starting at each
    entry in the list of species.

    Note that this relies on the scientific names being unique, which, since
    they are derived from the WikiSpecies template data, they should be.

    This will by default try and load the data from TMP_DIR/nodes_0.json
    because parsing the data is fairly slow.
    """
    if (TMP_DIR / "nodes_0.json").is_file() and not force:
        with open(TMP_DIR / "nodes_0.json", "r") as fp:
            return json.load(fp)
    nodes = {}

    def node_from_data(tid: int, ptid: int, sci_name: str, rank: str | None):
        return {"tid": tid, "ptid": ptid, "sci_name": sci_name, "rank": rank}

    n = len(species_list)
    tid = 0
    for i, species in enumerate(species_list):
        print(f"{i + 1:3d}/{n:3d}: {species['scientific']} ({species['common'][0]})")
        chain = make_chain(species["scientific"], data, ensure_eukaryota)

        if ensure_eukaryota and chain[-1][0] != "Eukaryota":
            raise RuntimeError(f"Eukaryota not reached in chain of {species}")

        if chain[-1][0] not in nodes:
            nodes[chain[-1][0]] = node_from_data(tid, -1, chain[-1][0], chain[-1][1])
            tid += 1
        for j in range(len(chain) - 2, -1, -1):
            parent_name = chain[j + 1][0]
            child_name = chain[j][0]

            if child_name in nodes:
                continue

            nodes[child_name] = node_from_data(
                tid, nodes[parent_name]["tid"], child_name, chain[j][1]
            )
            tid += 1
        nodes[species["scientific"]]["com_name"] = species["common"]

    nodes = apply_redirects(nodes, page_data)

    # sort by tid
    nodes_list = sorted(list(nodes.values()), key=lambda n: n["tid"])
    nodes = {n["sci_name"]: n for n in nodes_list}

    with open(TMP_DIR / "nodes_0.json", "w") as fp:
        json.dump({"nodes": nodes}, fp, indent=2)

    return {"nodes": nodes}


def check_nodes(nodes):
    """Ensure that all nodes have the same root"""
    nodes = nodes["nodes"]

    for _, node in nodes.items():
        node["status"] = 0

    root = None
    for _, node in nodes.items():
        tid = node["tid"]
        ptid = node["ptid"]
        parent = None
        for _, _node in nodes.items():
            if _node["tid"] == ptid:
                parent = _node

        tids = {tid}
        while ptid != -1 and parent is not None and parent["status"] == 0:
            nodes[node["sci_name"]]["status"] = 1
            tid = nodes[parent["sci_name"]]["tid"]

            if tid in tids:
                raise RuntimeError(f"cycle detected: repeated TID ({tid})")
            tids.add(tid)

            ptid = nodes[parent["sci_name"]]["ptid"]
            for _, _node in nodes.items():
                if _node["tid"] == ptid:
                    parent = _node
            node = parent

        if root is None:
            root = tid
        else:
            if root != tid:
                if parent is None or parent["status"] == 0:
                    raise ValueError(
                        f"Nodes do not all have the same root_tid ({tid} is likely missing)."
                    )

    for _, node in nodes.items():
        node.pop("status")


def start_session():
    """Set up session with user-agreement compliant headers"""
    headers = {
        "User-Agent": f"tree-of-life-bot/0.1 ({EMAIL})",
        "Accept-Encoding": "gzip",
    }
    session = requests.Session()
    session.headers.update(headers)
    return session


def chunks(iterable, size=50):
    """Iterate through an iterable in batches of size"""
    it = iter(iterable)
    while True:
        batch = list(islice(it, size))
        if not batch:
            break
        yield batch


def get_qids_from_wikispecies(session, titles):
    """Call the WikiSpecies API to get WikiData QIDs for a list of titles"""
    # Make request
    url = "https://species.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "prop": "pageprops",
        "ppprop": "wikibase_item",
        "format": "json",
        "redirects": 1,
        "titles": "|".join(titles),
    }
    res = session.get(url, params=params, timeout=20)
    if res.status_code != 200:
        raise RuntimeError(f"request returned status code {res.status_code}")
    sleep(0.1)

    # Extract data
    data = res.json()
    pages = data["query"]["pages"]
    result = {}
    for page in pages.values():
        title = page.get("title")
        qid = page.get("pageprops", {}).get("wikibase_item")
        if title and qid:
            result[title] = qid

    return result


def get_qids_from_wikidata(session, titles):
    url = "https://www.wikidata.org/w/api.php"
    params = {
        "action": "wbgetentities",
        "sites": "specieswiki",
        "props": "labels",
        "format": "json",
        "languages": "en",
        "titles": "|".join(titles),
    }
    res = session.get(url, params=params, timeout=20)
    if res.status_code != 200:
        raise RuntimeError(f"request returned status code {res.status_code}")
    sleep(0.1)

    # Extract data
    data = res.json()
    result = {}
    if "entities" in data:
        for qid, val in data["entities"].items():
            result[val["labels"]["en"]] = qid
    return result


# All nodes must have a QID, and sometimes we fail to find them automatically
# (or we find the wrong one) and so some must be set manually. Some nodes don't
# have a QID so must have a fake one generated. Fake QIDs are marked with a
# leading underscore.
MANUAL_QIDS = {
    "Acipenserinae": "Q3604574",
    "Metasuchia": "Q3307307",
    "Alligatoroidea": "Q507496",
    "Globidonta": "Q5571040",
    "Alpheus digitalis": "Q4474074",
    "Amblyraja hyperborea": "Q238519",
    "Amynthas mekongianus": "Q48838660",
    "Novaeratitae": "Q19598164",
    "Balanoglossus gigas": "Q2271336",
    "Cephenemyia": "Q4355273",
    "Cephenemyia stimulator": "Q9186604",
    "Cerastoderma edule": "Q21124",
    "Chionodraco hamatus": "Q2353844",
    "Cochliomyia hominivorax": "Q526003",
    "Coenobita perlatus": "Q2702918",
    "Comaster schlegelii": "Q3457867",
    "Longirostres": "Q107389342",
    "Crocodyliformes": "Q3003172",
    "Cryptochiton": "Q1975340",
    "Cryptochiton stelleri": "Q1861188",
    "Culicoides impunctatus": "Q1649781",
    "Dactylotum": "Q5207820",
    "Dactylotum bicolor": "Q13565184",
    "Ensis leei": "Q61697754",
    "Incirrata": "Q21416552",
    "Octopodoidea": "Q20817899",
    "Evadne spinifera": "Q4559342",
    "Evadne": "Q4575907",
    "Glossina morsitans": "Q14601424",
    "Harmonia": "Q141575",
    "Leiobunum rotundum": "Q2392905",
    "Leiopathes glaberrima": "Q4004244",
    "Lissachatina": "Q103781917",
    "Lissachatina fulica": "Q103781974",
    "Lutjanus campechanus": "Q1889210",
    "Macrotermes natalensis": "Q49620889",
    "Makaira nigricans": "Q882668",
    "Mallada signatus": "Q4338695",
    "Megachile rotundata": "Q431061",
    "Millepora complanata": "Q3321841",
    "Morus": "Q1651414",
    "Nemobius sylvestris": "Q386914",
    "Neocrinus decorus": "Q5009664",
    "Ommatoiulus moreletii": "Q7090291",
    "Oryctes": "Q1952376",
    "Ostracion cubicum": "Q116179159",
    "Ostrea edulis": "Q729678",
    "Otobius megnini": "Q10613341",
    "Pandaka pygmaea": "Q244168",
    "Pistillifera": "Q108687888",
    "Panorpoidea": "Q3893387",
    "Paraleptuca chlorophthalmus": "Q63724514",
    "Parexocoetus brachypterus": "Q13688923",
    "Partamona helleri": "Q2044782",
    "Pedetontus unimaculatus": "Q114342312",
    "Placopecten": "Q7200412",
    "Placopecten magellanicus": "Q3016926",
    "Polyipnus triphanos": "Q2447170",
    "Porcellana platycheles": "Q3908455",
    "Radianthus": "Q18606111",
    "Radianthus magnifica": "Q105888748",
    "Solenopsis": "Q1075697",
    "Stenoperla prasina": "Q10678956",
    "Thromidia": "Q18195568",
    "Thromidia catalai": "Q3198119",
    "Trigona crassipes": "Q10828029",
    "Hieraves": "Q124518532",
    "Coraciimorphae": "Q19596468",
    "Eucavitaves": "Q19597157",
    "Picocoraciae": "Q19598622",
    "Picodynastornithes": "Q19598624",
    "Tetrapulmonata": "Q3821682",
    "Aculeata": "Q1251421",
    "Proctotrupomorpha": "Q11996284",
    "Parasitoida": "_Q0000",
    "Victoranura": "_Q0001",
    "Allodapanura": "_Q0002",
    "Agastorophrynia": "_Q0003",
    "Athesphatanura": "_Q0004",
    "Phthanobatrachia": "_Q0005",
    "Neobatrachia": "Q134759",
    "Natatanura": "Q139240716",
    "Ranoidea": "Q6525920",
    "Delphinida": "Q21219068",
    "Caprinae": "Q189804",
    "Percomorpha": "Q258278",
    "Asinus": "Q2305786",
    "Cephalosomata": "_Q0006",
    "Poecilophysidea": "_Q0007",
    "Arachnopulmonata": "Q80024044",
    "Panscorpiones": "_Q0008",
    "Elementaves": "Q125268288",
    "Gruae": "Q19597378",
    "Gruimorphae": "Q27732132",
    "Strisores": "Q5198624",
    "Dorylinae": "Q4037541",
    "Formicoid": "_Q0009",
    "Poneroid": "Q136029847",
    "Menoidei": "Q100148330",
    "Centropomoidei": "Q100146133",
    "Xiphioidea": "Q33189325",
    "Pelecanes": "Q131446239",
    "Pelecanimorphae": "Q111752876",
    "Feraequornithes": "Q119822370",
    "Echinozoa": "Q2698547",
    #
    "Acipenser oxyrinchus": "Q11031462",
    "Cephenemyia stimulator": "Q4355273",
    "Cyclopterus lumpus": "Q18001776",
    "Papilionoidea": "Q11946202",
    "Dicotyles tajacu": "Q125498219",
    "Diomedea exulans": "Q138658075",
    "Diploria labyrinthiformis": "Q2710086",
    "Dodecolopoda mawsoni": "Q4347891",
    "Hippotragini": "Q725271",
    "Istiophoridae": "Q123478185",
    "Sphenodon punctatus": "Q163283",
    "Thomomys bottae": "Q1497037",
    "Castorimorpha": "Q849836",
    "Puma lineage": "_Q0010",
    "Leopard cat lineage": "_Q0011",
    "Episquamata": "Q13518421",
    "Unidentata": "Q139260769",
    "Bifurcata": "Q2902081",
    "Conus geographus": "Q1780734",
    "Haliotis corrugata": "Q3096257",
    "Terebratalia transversa": "Q3268212",
    "Lithobates catesbeianus": "Q159404",
    "Mesotriton": "_Q0012",
    "Mesotriton alpestris": "Q282715",
}


def add_qids(nodes, force: bool = False):
    """Match the WikiSpecies entry to a unique WikiData QID"""
    if (TMP_DIR / "nodes_1.json").is_file() and not force:
        with open(TMP_DIR / "nodes_1.json", "r") as fp:
            return json.load(fp)

    session = start_session()

    # Assign a QID to each node
    nodes = nodes["nodes"]
    titles = nodes.keys()
    count = 0
    n = len(titles)
    for batch in chunks(titles, size=50):
        count += len(batch)
        print(f"{count:4d}/{n}")
        qid_map = get_qids_from_wikispecies(session, batch)

        # Match the qids to the nodes
        unmatched_qids = {}
        for title, qid in qid_map.items():
            try:
                nodes[title]["qid"] = qid
            except:
                unmatched_qids[title] = qid

        # if len(unmatched_qids) != 0:
        #     for t, q in unmatched_qids.items():
        #         print(f"{t}: {q}")
        #     print()
        #     for t in batch:
        #         if "qid" not in nodes[t]:
        #             print(t)
        #     raise RuntimeError("unmatched titles/QIDs")

    # Apply manual overwrites
    for title, qid in MANUAL_QIDS.items():
        nodes[title]["qid"] = qid

    # Check for any nodes without QIDs
    missing = []
    for key, node in nodes.items():
        if "qid" not in node:
            missing.append(key)
    if len(missing) != 0:
        for t in missing:
            print(t)
        raise RuntimeError(
            f"{len(missing)} missing QIDs. Searching wikidata.org is likely to return an entry which can be added to MANUAL_QIDS"
        )

    with open(TMP_DIR / "nodes_1.json", "w") as fp:
        json.dump({"nodes": nodes}, fp, indent=2)

    return {"nodes": nodes}


def get_wikititles_from_qids(session, qids):
    """Call the WikiData API to get Wikipedia titles for a list of QIDs"""
    # remove artificial QIDs which have a leading underscore
    qids = [q for q in qids if not q.startswith("_")]

    # Make request
    url = "https://www.wikidata.org/w/api.php"
    params = {
        "action": "wbgetentities",
        "props": "sitelinks",
        "sitefilter": "enwiki",
        "format": "json",
        "ids": "|".join(qids),
    }
    res = session.get(url, params=params, timeout=20)
    if res.status_code != 200:
        raise RuntimeError(f"request returned status code {res.status_code}")
    sleep(0.1)

    # Extract data
    data = res.json()
    result = {}
    for qid, entity in data.get("entities", {}).items():
        sitelinks = entity.get("sitelinks", {})
        enwiki = sitelinks.get("enwiki")
        if enwiki:
            result[qid] = enwiki["title"]

    return result


def get_wikititles_from_latin(session, latin):
    """Call the Wikipedia API to get Wikipedia titles for a list of Latin names"""
    # Make request
    url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "format": "json",
        "redirects": 1,
        "titles": "|".join(latin),
    }
    res = session.get(url, params=params, timeout=20)
    if res.status_code != 200:
        raise RuntimeError(f"request returned status code {res.status_code}")
    sleep(0.1)

    # Extract data
    data = res.json()

    redirects = data.get("query", {}).get("redirects", {})
    pages = data.get("query", {}).get("pages", {})
    result = {}
    for val in pages.values():
        if "missing" in val:
            continue
        result[val["title"]] = (val["title"], False)

    for redirect in redirects:
        if "tofragment" in redirect:
            continue
        result[redirect["from"]] = (redirect["to"], True)
    return result


MANUAL_WIKITITLES = {"": ""}


def add_wikititles(nodes, force: bool = False):
    """Use the QID to find the Wikipedia page title"""
    if (TMP_DIR / "nodes_2.json").is_file() and not force:
        with open(TMP_DIR / "nodes_2.json", "r") as fp:
            return json.load(fp)
    nodes = nodes["nodes"]

    session = start_session()

    # Assign a wikititle to each node
    node_list = list(nodes.values())
    count = 0
    n = len(node_list)
    for batch in chunks(node_list, size=50):
        count += len(batch)
        print(f"{count:4d}/{n}")
        qids = [node["qid"] for node in batch]
        wikititle_map = get_wikititles_from_qids(session, qids)

        # Match the wikititles to the nodes
        for node in batch:
            if node["qid"] in wikititle_map:
                nodes[node["sci_name"]]["wikititle"] = wikititle_map[node["qid"]]

    # Try another approach for missing entries
    missing = []
    for key, node in nodes.items():
        if "wikititle" not in node:
            missing.append(key)
    count = 0
    n = len(missing)
    for batch in chunks(missing, size=50):
        count += len(batch)
        print(f"{count:4d}/{n}")
        wikititle_map = get_wikititles_from_latin(session, batch)

        # Match the wikititles to the nodes
        for title in missing:
            if title in wikititle_map:
                wikititle, is_redirect = wikititle_map[title]
                nodes[title]["wikititle"] = wikititle
                if is_redirect:
                    nodes[title]["is_redirect"] = True

    # Check for any nodes without wikititles
    missing = []
    for key, node in nodes.items():
        if "wikititle" not in node:
            missing.append(key)
            print(node["sci_name"])
    if len(missing) != 0:
        print(f"WARNING: {len(missing)} missing wikititles")

    # Resolve duplicate wikititles
    # Group the nodes in lists corresponding to each wikititle
    wikititles = {}
    for title, node in nodes.items():
        if "wikititle" in node:
            wikititle = node["wikititle"]
            if wikititle not in wikititles:
                wikititles[wikititle] = []
            wikititles[wikititle].append(node)
    for wikititle, node_list in wikititles.items():
        if len(node_list) == 1:
            continue

        num_non_redirect = 0
        for node in node_list:
            if not node.get("is_redirect", False):
                num_non_redirect += 1
        if num_non_redirect == 1:
            # Only one was not a redirect, so it is the "rightful" owner
            for node in node_list:
                if node.get("is_redirect", False):
                    node.pop("wikititle")
            continue

        found = False
        for node in node_list:
            # Check if any of them have matching title and sci_name, in which
            # case it is (probably!) the rightful owner
            if node["sci_name"] == wikititle:
                found = True
                for _node in node_list:
                    if node["tid"] != _node["tid"]:
                        node.pop("wikititle")
                continue
        if found:
            continue

        # The only other remaining possibility is that:
        #     - there are several nodes with matching wikititles
        #     - all of them are redirects
        #     - none of them are obviously matching
        for node in node_list:
            node.pop("wikititle")

    for title, node in nodes.items():
        if "is_redirect" in node:
            node.pop("is_redirect")

    with open(TMP_DIR / "nodes_2.json", "w") as fp:
        json.dump({"nodes": nodes}, fp, indent=2)

    return {"nodes": nodes}


def get_wikitext_from_wikititles(session, wikititles: list[str]):
    """Call the Wikipedia API to get Wikipedia intro text for a list of titles"""
    # Make request
    url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "format": "json",
        "redirects": 1,
        "prop": "extracts",
        "exintro": 1,
        "explaintext": 1,
        "titles": "|".join(wikititles),
    }
    res = session.get(url, params=params, timeout=20)
    if res.status_code != 200:
        raise RuntimeError(f"request returned status code {res.status_code}")
    sleep(0.1)

    # Extract data
    data = res.json()
    if "batchcomplete" not in data:
        raise RuntimeError("batch not complete, lower batch size")
    redirects = data.get("query", {}).get("redirects", {})
    result = {}
    for _, value in data.get("query", {}).get("pages", {}).items():
        title = value.get("title")
        text = value.get("extract")
        if title and text:
            result[title] = text

    return result, redirects


def add_wikitext(nodes, force: bool = False):
    """Add text from Wikipedia to each node if it is available"""
    if (TMP_DIR / "nodes_3.json").is_file() and not force:
        with open(TMP_DIR / "nodes_3.json", "r") as fp:
            return json.load(fp)
    nodes = nodes["nodes"]

    session = start_session()

    # Get wikitext for each node
    node_list = list(nodes.values())
    count = 0
    n = len(node_list)
    # use smaller batch sizes because the returns are limited
    for batch in chunks(node_list, size=20):
        count += len(batch)
        print(f"{count:4d}/{n}")
        wikititles = [node["wikititle"] for node in batch if "wikititle" in node]
        wikitext_map, redirects = get_wikitext_from_wikititles(session, wikititles)

        # Match the wikitext to the nodes
        for node in batch:
            if "wikititle" in node and node["wikititle"] in wikitext_map:
                nodes[node["sci_name"]]["text"] = wikitext_map[node["wikititle"]]

    # Check for any nodes without text
    missing = []
    for key, node in nodes.items():
        if "text" not in node:
            missing.append(key)
    if len(missing) != 0:
        print(f"WARNING: {len(missing)} missing text")

    with open(TMP_DIR / "nodes_3.json", "w") as fp:
        json.dump({"nodes": nodes}, fp, indent=2)
    return {"nodes": nodes}


def get_wikiimage_from_wikititles(session, wikititles: list[str]):
    """Call the Wikipedia API to get Wikipedia images for a list of titles"""
    # Make request
    url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "format": "json",
        "redirects": 1,
        "prop": "extracts",
        "prop": "pageimages",
        "pithumbsize": 500,
        "titles": "|".join(wikititles),
    }
    res = session.get(url, params=params, timeout=20)
    if res.status_code != 200:
        raise RuntimeError(f"request returned status code {res.status_code}")
    sleep(0.1)

    # Extract data
    data = res.json()
    if "batchcomplete" not in data:
        raise RuntimeError("batch not complete, lower batch size")
    redirects = data.get("query", {}).get("redirects", {})
    result = {}
    for _, value in data.get("query", {}).get("pages", {}).items():
        title = value.get("title")
        image = value.get("thumbnail", {}).get("source", {})
        if title and image:
            result[title] = image

    return result, redirects


def add_wikiimages(nodes, force: bool = False):
    """Add text from Wikipedia to each node if it is available"""
    if (TMP_DIR / "nodes_4.json").is_file() and not force:
        with open(TMP_DIR / "nodes_4.json", "r") as fp:
            return json.load(fp)
    nodes = nodes["nodes"]

    session = start_session()

    # Get wikitext for each node
    node_list = list(nodes.values())
    count = 0
    n = len(node_list)
    # use smaller batch sizes because the returns are limited
    for batch in chunks(node_list, size=50):
        count += len(batch)
        print(f"{count:4d}/{n}")
        wikititles = [node["wikititle"] for node in batch if "wikititle" in node]
        wikiimage_map, redirects = get_wikiimage_from_wikititles(session, wikititles)

        # Match the wikiimage to the nodes
        for node in batch:
            if "wikititle" in node and node["wikititle"] in wikiimage_map:
                nodes[node["sci_name"]]["image"] = wikiimage_map[node["wikititle"]]

    # Check for any nodes without an image
    missing = []
    for key, node in nodes.items():
        if "image" not in node:
            missing.append(key)
    if len(missing) != 0:
        print(f"WARNING: {len(missing)} missing image")

    with open(TMP_DIR / "nodes_4.json", "w") as fp:
        json.dump({"nodes": nodes}, fp, indent=2)
    return {"nodes": nodes}


def set_root(nodes, root: str, force: bool = False):
    """
    Remove all nodes that do not have the root node (specified as either a QID,
    Latin name, or wikititle) as an ancestor or are the root node.

    This assumes that all the species used to initialize the node list are
    descendants of the root node. If this is not the case an error will be
    raised.
    """
    if (TMP_DIR / "nodes_5.json").is_file() and not force:
        with open(TMP_DIR / "nodes_5.json", "r") as fp:
            return json.load(fp)
    nodes = nodes["nodes"]

    root_title = None
    if root[0] == "Q" and root[1].isnumeric():
        # Root is a QID
        for node in nodes.values():
            if node["qid"] == root:
                root_title = node["sci_name"]
                break
    else:
        # Root is a sci name or wikititle
        for node in nodes.values():
            if node["sci_name"] == root or node["wikititle"] == root:
                root_title = node["sci_name"]
                break

    if root_title is None:
        raise ValueError(f"Root '{root}' not found")

    nodes[root_title]["ptid"] = -1

    # If all leaf nodes are descendants of the root then we can just remove the
    # nodes above the root node in the (ordered) node dictionary
    to_remove = []
    for title in nodes.keys():
        if title == root_title:
            break
        to_remove.append(title)
    for title in to_remove:
        print(title)
        nodes.pop(title)

    # Assert that the new tree is well defined
    check_nodes({"nodes": nodes})

    with open(TMP_DIR / "nodes_5.json", "w") as fp:
        json.dump({"nodes": nodes}, fp, indent=2)
    return {"nodes": nodes}


def check_species_genus(nodes):
    """
    Produce small HTML pages with species/genus pairs for manual checking.
    If the genus page has no text, continue up to the first node that does.
    """
    # store which pairs we have checked
    checked_qids = []
    if (TMP_DIR / "checked_species_genus.json").is_file():
        with open(TMP_DIR / "checked_species_genus.json", "r") as fp:
            checked_qids = json.load(fp)

    out_dir = TMP_DIR / "pairs"

    nodes = nodes["nodes"]
    count = -1
    batch_size = 20

    def _escape_html(s: str) -> str:
        return (
            str(s)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    def _find_node_by_tid(tid: int):
        for _node in nodes.values():
            if _node["tid"] == tid:
                return _node
        return None

    for node in nodes.values():
        if node["rank"] != "Species":
            continue

        qid = node["qid"]
        if qid in checked_qids:
            continue

        count += 1
        checked_qids.append(qid)

        # Find the parent node
        ptid = node["ptid"]
        parent = _find_node_by_tid(ptid)
        while parent is not None and "text" not in parent:
            parent = _find_node_by_tid(parent["ptid"])
        if parent is None:
            raise ValueError(f"parent for {node['sci_name']} not found")

        # Make a small HTML file containing the node and parent sci_name,
        # image, and text side-by-side
        (out_dir / f"{count // batch_size}").mkdir(exist_ok=True, parents=True)
        file = out_dir / f"{count // batch_size}" / f"{node['tid']}.html"

        node_name = node["sci_name"]
        node_text = node.get("text", "")
        node_image = node.get("image", "")

        parent_name = parent["sci_name"]
        parent_text = parent.get("text", "")
        parent_image = parent.get("image", "")

        html = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>{_escape_html(node_name)} vs {_escape_html(parent_name)}</title>
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 16px; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
    .card {{ border: 1px solid #ddd; border-radius: 8px; padding: 12px; }}
    .title {{ font-size: 18px; font-weight: 650; margin: 0 0 10px 0; }}
    img {{ max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; }}
    .meta {{ color: #555; font-size: 12px; margin: 8px 0 0 0; }}
    pre {{ white-space: pre-wrap; word-wrap: break-word; background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 10px; }}
  </style>
</head>
<body>
  <div class=\"grid\">
    <div class=\"card\">
      <p class=\"title\">Species: {_escape_html(node_name)}</p>
      {f'<img src="{_escape_html(node_image)}" alt="{_escape_html(node_name)}" />' if node_image else '<div class="meta">(no image)</div>'}
      <pre>{_escape_html(node_text)}</pre>
      <div class=\"meta\">tid={node["tid"]} ptid={node["ptid"]} qid={_escape_html(node.get("qid", ""))} wikititle={_escape_html(node.get("wikititle", ""))}</div>
    </div>

    <div class=\"card\">
      <p class=\"title\">Parent: {_escape_html(parent_name)} ({_escape_html(parent.get("rank", ""))})</p>
      {f'<img src="{_escape_html(parent_image)}" alt="{_escape_html(parent_name)}" />' if parent_image else '<div class="meta">(no image)</div>'}
      <pre>{_escape_html(parent_text)}</pre>
      <div class=\"meta\">tid={parent["tid"]} ptid={parent["ptid"]} qid={_escape_html(parent.get("qid", ""))} wikititle={_escape_html(parent.get("wikititle", ""))}</div>
    </div>
  </div>
</body>
</html>
"""

        with open(file, "w", encoding="utf-8") as fp:
            fp.write(html)

    with open(TMP_DIR / "checked_species_genus.json", "w") as fp:
        json.dump(checked_qids, fp, indent=2)


def filter_nodes(nodes: dict, required: str | int) -> dict:
    """Filter nodes so that all complete sub-chains include the specified node.

    This version operates on the dict-of-dicts structure used elsewhere in this file:
        {"nodes": {sci_name: {"tid": int, "ptid": int, "sci_name": str, ...}, ...}}
    or directly on the inner mapping {sci_name: node_dict}.

    Returns the same shape as the input (i.e. wraps in {"nodes": ...} if provided).
    """
    wrapped = isinstance(nodes, dict) and "nodes" in nodes
    node_map = nodes["nodes"] if wrapped else nodes

    # Build lookup tables
    tid_to_name: dict[int, str] = {}
    for name, node in node_map.items():
        tid_to_name[int(node["tid"])] = name

    # Find required TID
    if isinstance(required, int):
        node_tid = required
        if node_tid not in tid_to_name:
            raise ValueError(f"node with TID {required} not found")
    elif isinstance(required, str):
        if required not in node_map:
            raise ValueError(f"node with name {required} not found")
        node_tid = int(node_map[required]["tid"])
    else:
        raise TypeError("required must be str or int")

    # Find species whose lineages pass through the required node
    all_species = [
        node
        for node in node_map.values()
        if str(node.get("rank", "")).lower() == "species"
    ]

    species: list[dict] = []
    for sp in all_species:
        cur = sp
        while True:
            if int(cur["tid"]) == node_tid:
                species.append(sp)
                break
            ptid = int(cur.get("ptid", -1))
            if ptid == -1:
                break
            parent_name = tid_to_name.get(ptid)
            if parent_name is None:
                break
            cur = node_map[parent_name]

    # Collect all ancestors of those species (including species themselves)
    sub_tids: set[int] = set()

    def recursive_filter(input_tid: int):
        """Adds this TID and recurses to the parent."""
        if input_tid in sub_tids:
            return
        sub_tids.add(input_tid)
        name = tid_to_name.get(input_tid)
        if name is None:
            return
        ptid = int(node_map[name].get("ptid", -1))
        if ptid != -1:
            recursive_filter(ptid)

    for sp in species:
        recursive_filter(int(sp["tid"]))

    filtered = {
        name: node
        for name, node in node_map.items()
        if int(node.get("tid", -999999)) in sub_tids
    }
    return {"nodes": filtered} if wrapped else filtered


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
    nodes: dict,
    min_rank: str = "species",
    outfile: Path | str | None = None,
):
    """Create an html graph of the tree.

    Optionally limits the tree to stop at min_rank.

    This version operates on the dict-of-dicts structure used elsewhere in this file:
        {"nodes": {sci_name: {"tid": int, "ptid": int, "sci_name": str, ...}, ...}}
    or directly on the inner mapping {sci_name: node_dict}.
    """
    wrapped = isinstance(nodes, dict) and "nodes" in nodes
    node_map = nodes["nodes"] if wrapped else nodes

    # Build lookup tables
    tid_to_name: dict[int, str] = {}
    for name, node in node_map.items():
        tid_to_name[int(node["tid"])] = name

    if min_rank.lower() != "species":
        sub_tids: set[int] = set()

        def recursive_filter(input_tid: int, reached_rank: bool):
            """Adds this TID and recurses to the parent."""
            name = tid_to_name.get(input_tid)
            if name is None:
                return
            node = node_map[name]

            if str(node.get("rank", "")).lower() == min_rank.lower():
                reached_rank = True

            if reached_rank:
                sub_tids.add(input_tid)

            ptid = int(node.get("ptid", -1))
            if ptid != -1:
                recursive_filter(ptid, reached_rank)

        # add each species TID and travel up the chain of parents
        species = [
            node
            for node in node_map.values()
            if str(node.get("rank", "")).lower() == "species"
        ]
        for sp in species:
            recursive_filter(int(sp["tid"]), False)

        node_map = {
            name: node
            for name, node in node_map.items()
            if int(node.get("tid", -999999)) in sub_tids
        }

    # create partition
    graph = nx.Graph()
    for node in node_map.values():
        node_id = int(node["tid"])
        graph.add_node(node_id)
        ptid = int(node.get("ptid", -1))
        if ptid != -1:
            graph.add_edge(ptid, node_id)
    partition = community_louvain.best_partition(graph, resolution=1.0)

    # create directed graph
    graph = nx.DiGraph()
    for node in node_map.values():
        node_id = int(node["tid"])
        group = partition.get(node_id, 0)

        hover_text = "\n".join(textwrap.wrap(node.get("text", "") or "", width=50))
        image = node.get("image")

        # Make label
        sci_name = node.get("sci_name") or tid_to_name.get(node_id, str(node_id))
        label = sci_name
        com_name = node.get("com_name")
        if isinstance(com_name, str):
            if len(com_name) > 0:
                label = f"{com_name}\n({sci_name})"
        elif isinstance(com_name, list) and len(com_name) > 0:
            if isinstance(com_name[0], str) and len(com_name[0]) > 0:
                label = f"{com_name[0]}\n({sci_name})"

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
        ptid = int(node.get("ptid", -1))
        if ptid != -1:
            graph.add_edge(ptid, node_id)

    # Create visualization
    net = Network(
        height="900px",
        width="100%",
        directed=True,
        bgcolor="#ffffff",
        # font_color="black",
    )
    net.set_options(
        """
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
    """
    )
    net.from_nx(graph)

    if outfile is None:
        outfile = TMP_DIR / "taxonomy_tree.html"

    net.write_html(str(outfile))


MANUAL_RETAINS = [
    "Feliformia",
    "Actinopterygii",
]


def remove_chains(nodes, force: bool = False):
    """
    Ensure that all nodes are either leaves, the root, or have more than one child
    """
    if (TMP_DIR / "nodes_6.json").is_file() and not force:
        with open(TMP_DIR / "nodes_6.json", "r") as fp:
            return json.load(fp)
    nodes = nodes["nodes"]

    n0 = len(nodes)

    # Remap so that the tid is the key and find the TIDs of the species
    _nodes = {}
    for node in nodes.values():
        _nodes[node["tid"]] = node
    nodes = _nodes

    # Set the status and find the species
    species_tids = []
    for node in nodes.values():
        node["status"] = 0  # not visited
        if node["rank"] == "Species":
            species_tids.append(node["tid"])

    # First pass, count the number of children
    for node in nodes.values():
        nodes[node["tid"]]["nchildren"] = 0
    for node in nodes.values():
        if node["ptid"] == -1:
            continue
        nodes[node["ptid"]]["nchildren"] += 1

    # Go through the tree starting at the species and traveling upwards
    for sp_tid in species_tids:
        # Travel upwards identifying chains
        chain = []
        node = nodes[sp_tid]
        while node["ptid"] != -1 and node["status"] == 0:
            node["status"] = 1  # mark as visited, to be kept

            parent = nodes[node["ptid"]]
            if parent["nchildren"] == 1:
                # if this node is the only child of its parent then the parent
                # and the node are part of a chain
                if len(chain) == 0:
                    # start of the chain
                    chain = [node]
                chain.append(parent)
            elif len(chain) > 0:
                # chain has ended and at least two nodes in so can be removed

                # decide which clade will be kept
                if chain[0]["nchildren"] == 0:
                    # special chase where chain ends at a leaf/species which
                    # must be retained
                    retained = 0
                else:
                    retained = -1

                    # keep the clade in the manual override list
                    for j, link in enumerate(chain):
                        if link["sci_name"] in MANUAL_RETAINS:
                            retained = j
                            break

                    if retained == -1:
                        # otherwise keep the most derived clade _unless_ there is a
                        # significant disparity in how much info is available
                        retained = 0

                        l_cutoff = 200
                        if len(chain[retained].get("text", "")) < l_cutoff:
                            max_len = 0
                            for j, link in enumerate(chain):
                                # choose the clade with the longest text
                                if len(link.get("text", "")) > max_len:
                                    retained = j
                                    max_len = len(link.get("text", ""))

                # Merge and mark nodes for removal
                for j, link in enumerate(chain):
                    if j == retained:
                        # The coalesced node needs to link to the top and
                        # bottom of the original chain
                        link["tid"] = chain[0]["tid"]
                        link["ptid"] = chain[-1]["ptid"]
                        link["nchildren"] = chain[0]["nchildren"]
                    else:
                        link["status"] = -1

                chain = []

            # move upwards
            node = parent

    # Remove nodes, clean up, and remap so the title is the key
    _nodes = {}
    for node in nodes.values():
        if node["status"] == -1:
            continue
        node.pop("status")
        _nodes[node["sci_name"]] = node
    nodes = _nodes

    check_nodes({"nodes": nodes})

    print(f"INFO: removed chains, {n0} -> {len(nodes)} nodes")

    for node in nodes.values():
        if node["nchildren"] > 5:
            print(f"WARNING: {node['sci_name']} has {node['nchildren']} children")

    count = 0
    for node in nodes.values():
        if "text" not in node:
            count += 1

    with open(TMP_DIR / "nodes_6.json", "w") as fp:
        json.dump({"nodes": nodes}, fp, indent=2)
    return {"nodes": nodes}


def reassign_tids(nodes, force: bool = False):
    """
    Ensure that tids are increasing through the nodes
    """
    if (TMP_DIR / "nodes_7.json").is_file() and not force:
        with open(TMP_DIR / "nodes_7.json", "r") as fp:
            return json.load(fp)
    nodes = nodes["nodes"]

    # Assert that parents always come before their children in nodes
    for node in nodes.values():
        if node["tid"] < node["ptid"]:
            raise RuntimeError(f"{node['sci_name']} comes before it's parent in nodes")

    node_list = list(nodes.values())
    for tid, node in enumerate(node_list):
        old_tid = node["tid"]
        node["tid"] = tid
        for node in node_list[tid + 1 :]:
            if node["ptid"] == old_tid:
                node["ptid"] = tid

    with open(TMP_DIR / "nodes_7.json", "w") as fp:
        json.dump({"nodes": nodes}, fp, indent=2)
    return {"nodes": nodes}


def clean_wikitext(text: str, num_chars: int | None = None) -> str:
    """
    Clean common Wikipedia plaintext extraction artifacts and optionally
    truncate to complete sentences within num_chars.
    """

    # Standardise quotes
    text = text.replace('"', "'")

    # Wikipedia-specific artifacts

    # "(; hominoids)" -> "(hominoids)"
    text = re.sub(r"\(\s*;\s*([^)]*?)\)", r"(\1)", text)

    # "(, foo)" -> "(foo)"
    text = re.sub(r"\(\s*,\s*([^)]*?)\)", r"(\1)", text)

    # "(;)" or "( ; )" -> ""
    text = re.sub(r"\(\s*;\s*\)", "", text)

    # Double semicolons inside parentheses
    # "(foo; ; bar)" -> "(foo; bar)"
    text = re.sub(r";\s*;", "; ", text)

    # Empty parentheses
    text = re.sub(r"\(\s*\)", "", text)

    # Collapse repeated periods
    text = re.sub(r"\.\s*\.\s*", ".", text)

    # Remove excess whitespace after opening parenthesis
    text = re.sub(r"\(\s+", "(", text)

    # Remove whitespace before punctuation
    text = re.sub(r"\s+([,.;:])", r"\1", text)

    # Collapse all whitespace
    text = re.sub(r"\s+", " ", text)

    text = text.strip()

    if num_chars is not None and len(text) > num_chars:
        # Find sentence endings
        sentence_ends = [
            m.end() for m in re.finditer(r"(?<=[.!?])(?:['\")\]]*)\s+", text)
        ]

        # Last sentence end within limit
        valid = [pos for pos in sentence_ends if pos <= num_chars]

        if valid:
            text = text[: valid[-1]].strip()
        else:
            # No complete sentence within limit.
            # Fallback: cut at first sentence after limit if available.
            next_end = next((p for p in sentence_ends if p > num_chars), None)

            if next_end:
                text = text[:next_end].strip()
            else:
                text = text[:num_chars].rstrip()

    return text


def clean_text(nodes, force: bool = False):
    """Attempts to automatically clean the wikitext for each node"""
    if (TMP_DIR / "nodes_8.json").is_file() and not force:
        with open(TMP_DIR / "nodes_8.json", "r") as fp:
            return json.load(fp)
    nodes = nodes["nodes"]

    for node in nodes.values():
        if "text" in node:
            node["text"] = clean_wikitext(node["text"], num_chars=600)

    with open(TMP_DIR / "nodes_8.json", "w") as fp:
        json.dump({"nodes": nodes}, fp, indent=2)
    return {"nodes": nodes}


def apply_overwrites(nodes, force: bool = False):
    """Applies overwrite info (typically text and images) to the nodes"""
    if (TMP_DIR / "nodes_9.json").is_file() and not force:
        with open(TMP_DIR / "nodes_9.json", "r") as fp:
            return json.load(fp)
    nodes = nodes["nodes"]

    with open(BASE_DIR / "overwrite.json", "r") as fp:
        overwrites = json.load(fp)

    for sci_name, overwrite in overwrites.items():
        if sci_name not in nodes:
            continue
        for key, val in overwrite.items():
            if key == "text":
                val = clean_wikitext(val)
            nodes[sci_name][key] = val

    with open(TMP_DIR / "nodes_9.json", "w") as fp:
        json.dump({"nodes": nodes}, fp, indent=2)
    return {"nodes": nodes}


def _escape_html(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def check_nodes_final(nodes):
    """
    Produce small HTML pages with species/genus pairs for manual checking.
    If the genus page has no text, continue up to the first node that does.
    """
    # store which pairs we have checked
    checked_qids = []
    if (TMP_DIR / "checked_nodes.json").is_file():
        with open(TMP_DIR / "checked_nodes.json", "r") as fp:
            checked_qids = json.load(fp)

    out_dir = TMP_DIR / "nodes"

    nodes = nodes["nodes"]
    count = -1
    batch_size = 20
    missing_text = 0
    missing_image = 0

    for node in nodes.values():
        qid = node["qid"]
        if qid in checked_qids:
            continue
        checked_qids.append(qid)

        count += 1

        node_name = node["sci_name"]
        node_text = node.get("text", "")
        node_image = node.get("image", "")
        node_rank = node.get("rank", "clade")

        if node_text.endswith("et al."):
            print(f"WARNING: {node_name}'s text ends with 'et al.'")
        for d in range(10):
            if node_text.endswith(f"{d}."):
                print(f"WARNING: {node_name}'s text ends with '{d}.'")
                continue

        if node_text == "":
            missing_text += 1

        if node_image == "":
            missing_image += 1

        html = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>{_escape_html(node_name)}</title>
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 16px; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
    .card {{ border: 1px solid #ddd; border-radius: 8px; padding: 12px; }}
    .title {{ font-size: 18px; font-weight: 650; margin: 0 0 10px 0; }}
    img {{ max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; }}
    .meta {{ color: #555; font-size: 12px; margin: 8px 0 0 0; }}
    pre {{ white-space: pre-wrap; word-wrap: break-word; background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 10px; }}
  </style>
</head>
<body>
  <div class=\"grid\">
    <div class=\"card\">
      <p class=\"title\">{_escape_html(node_rank)}: {_escape_html(node_name)}</p>
      {f'<img src="{_escape_html(node_image)}" alt="{_escape_html(node_name)}" />' if node_image else '<div class="meta">(no image)</div>'}
      <pre>{_escape_html(node_text)}</pre>
      <div class=\"meta\">tid={node["tid"]} ptid={node["ptid"]} qid={_escape_html(node.get("qid", ""))} wikititle={_escape_html(node.get("wikititle", ""))}</div>
    </div>
  </div>
</body>
</html>
"""

        # Make a small HTML file containing the node sci_name, image, and text side-by-side
        (out_dir / f"{count // batch_size}").mkdir(exist_ok=True, parents=True)
        file = out_dir / f"{count // batch_size}" / f"{node['tid']}.html"
        with open(file, "w", encoding="utf-8") as fp:
            fp.write(html)

    if missing_text > 0:
        for node in nodes.values():
            if node.get("text", "") == "":
                print(f"  {node['sci_name']}")
        print(f"WARNING: {missing_text} missing text entries")
    if missing_image > 0:
        for node in nodes.values():
            if node.get("image", "") == "":
                print(f"  {node['sci_name']}")
        print(f"WARNING: {missing_image} missing image entries")

    with open(TMP_DIR / "checked_nodes.json", "w") as fp:
        json.dump(checked_qids, fp, indent=2)


def walk_tree(nodes, node_fn):
    """Walk the tree and call node_fn on each node"""
    nodes = nodes["nodes"]

    children_by_ptid = {}
    roots = []
    for node in nodes.values():
        ptid = node["ptid"]
        if ptid == -1:
            roots.append(node)
        else:
            children_by_ptid.setdefault(ptid, []).append(node)

    for children in children_by_ptid.values():
        children.sort(key=lambda node: node["tid"], reverse=True)
    roots.sort(key=lambda node: node["tid"])

    def walk(node):
        node_fn(node)

        if node["nchildren"] == 0:
            return

        for child in children_by_ptid.get(node["tid"], []):
            walk(child)

    for root in roots:
        walk(root)


def list_species(nodes):
    def print_species(node):
        if node["nchildren"] == 0:
            print(f'  ["{node["com_name"][0]}", {node["tid"]}],')

    walk_tree(nodes, print_species)


def limit_species(nodes, species_tids: list[int]):
    nodes = nodes["nodes"]

    # strip out all nodes in the tree apart from the minimum subset required
    # by the specified species TIDs (plus the original root)
    nodes_by_tid = {node["tid"]: node for node in nodes.values()}

    root_tids = {node["tid"] for node in nodes.values() if node["ptid"] == -1}
    retained_tids = set(root_tids)

    for species_tid in species_tids:
        if species_tid not in nodes_by_tid:
            raise ValueError(f"species TID {species_tid} not found")

        tid = species_tid
        while tid != -1:
            retained_tids.add(tid)
            tid = nodes_by_tid[tid]["ptid"]

    filtered_nodes = {
        name: deepcopy(node)
        for name, node in nodes.items()
        if node["tid"] in retained_tids
    }

    for node in filtered_nodes.values():
        node["nchildren"] = 0

    filtered_nodes_by_tid = {node["tid"]: node for node in filtered_nodes.values()}
    for node in filtered_nodes.values():
        ptid = node["ptid"]
        if ptid != -1 and ptid in retained_tids:
            filtered_nodes_by_tid[ptid]["nchildren"] += 1

    kept_tids = {
        node["tid"]
        for node in filtered_nodes.values()
        if node["ptid"] == -1 or node["nchildren"] != 1
    }

    compressed_nodes = {
        name: node for name, node in filtered_nodes.items() if node["tid"] in kept_tids
    }
    compressed_nodes_by_tid = {node["tid"]: node for node in compressed_nodes.values()}

    for node in compressed_nodes.values():
        ptid = node["ptid"]
        while ptid != -1 and ptid not in kept_tids:
            ptid = filtered_nodes_by_tid[ptid]["ptid"]
        node["ptid"] = ptid
        node["nchildren"] = 0

    for node in compressed_nodes.values():
        ptid = node["ptid"]
        if ptid != -1:
            compressed_nodes_by_tid[ptid]["nchildren"] += 1

    return {"nodes": compressed_nodes}


def compute_stats(nodes):
    nodes = nodes["nodes"]

    # index nodes by TID to make traversal easier
    nodes = {node["tid"]: node for node in nodes.values()}

    species_tids = [node["tid"] for node in nodes.values() if node["nchildren"] == 0]
    print(
        f"NUM SPECIES: {len(species_tids)} ({20 * np.log(len(species_tids)) / np.log(336)})"
    )

    # work out average/max depth of a species
    max_tid = 0
    max_depth = 0
    total_depth = 0
    for _tid in species_tids:
        tid = _tid
        depth = 0
        while _tid != 0:
            _tid = nodes[_tid]["ptid"]
            depth += 1
        total_depth += depth
        if depth > max_depth:
            max_depth = depth
            max_tid = tid
    avg_depth = total_depth / len(species_tids)
    print(f"MAX DEPTH: {max_depth} ({nodes[max_tid]['com_name'][0]})")
    print(f"AVG DEPTH: {avg_depth}")
    print()


def make_js_files(nodes):
    """Make the JS files for the web app"""
    # species.js
    with open(BASE_DIR / "species.json", "r") as fp:
        species = json.load(fp)
    species_levels = {}
    for sp in species:
        species_levels[sp["scientific"]] = sp["level"]

    with open(TMP_DIR / "species.js", "w") as fp:
        sizes = ["LARGE", "MEDIUM", "SMALL"]
        for i, size in enumerate(sizes):
            fp.write(f"const {size}_SPECIES_TIDS = [\n")

            def print_species(node):
                if node["nchildren"] == 0 and species_levels[node["sci_name"]] >= i:
                    fp.write(f'  ["{node["com_name"][0]}", {node["tid"]}],\n')

            walk_tree(nodes, print_species)

            fp.write("];\n")
        fp.write("\n")
        fp.write(f"export const SPECIES_LISTS = [\n")
        for size in reversed(sizes):
            fp.write(f"  {size}_SPECIES_TIDS,\n")
        fp.write("];\n")

    # clades.js
    with open(TMP_DIR / "clades.js", "w") as fp:
        fp.write("""export const CladeState = Object.freeze({
  ANSWER: 0,
  OFF: 1,
  HIDDEN: 2,
  VISIBLE: 3,
});

export class Clade {
  constructor(tid, ptid, sci_name, com_name, text, image, rank) {
    this.tid = tid;
    this.ptid = ptid;
    this.sci_name = sci_name;
    this.com_name = com_name;
    this.text = text;
    this.image = image;
    this.rank = rank;
    this.sub_ptid = ptid;
    this.onChain = false;
    this.state = CladeState.OFF;
  }

  clone() {
    let clone = new Clade(
      this.tid,
      this.ptid,
      this.sci_name,
      this.com_name,
      this.text,
      this.image,
      this.rank,
    );
    clone.sub_ptid = this.sub_ptid;
    clone.onChain = this.onChain;
    clone.state = this.state;
    return clone;
  }
}

export const CLADE_LIST = [
""")

        for node in nodes["nodes"].values():
            fp.write(f"  new Clade(\n")
            fp.write(f"    {node['tid']},\n")
            fp.write(f"    {node['ptid'] if node['ptid'] != -1 else 'null'},\n")
            fp.write(f'    "{node["sci_name"]}",\n')
            fp.write(f'    "{node.get("com_name", [""])[0]}",\n')
            fp.write(f'    "{_escape_html(node["text"])}",\n')
            fp.write(f'    "{node["image"]}",\n')
            fp.write(f'    "{node["rank"]}",\n')
            fp.write(f"  ),\n")

        fp.write("];\n")


def compute_guess_answer_mapping(nodes) -> dict[tuple[int, int], int]:
    """Compute a mapping from (guess_tid, answer_tid) -> # remaining options"""
    # index nodes by TID to make traversal easier
    nodes = nodes["nodes"]
    nodes = {node["tid"]: node for node in nodes.values()}

    species_tids = [node["tid"] for node in nodes.values() if node["nchildren"] == 0]

    # count the total descendants for each node
    for node in nodes.values():
        node["descendants"] = 0
    while nodes[0]["descendants"] != len(species_tids):
        for node in nodes.values():
            node["_descendants"] = 0
        for s_tid in species_tids:
            nodes[s_tid]["descendants"] = 1
            nodes[s_tid]["_descendants"] = 1
        for node in nodes.values():
            if node["ptid"] in nodes:
                nodes[node["ptid"]]["_descendants"] += node["descendants"]

        for node in nodes.values():
            node["descendants"] = node["_descendants"]
    for node in nodes.values():
        node.pop("_descendants")

    mapping = {}
    for answer_tid in species_tids:
        # reset the counts of remaining nodes and mark as on or off chain
        for node in nodes.values():
            node["remaining"] = -1
            node["onchain"] = False
        tid = answer_tid
        while tid != -1:
            nodes[tid]["onchain"] = True
            tid = nodes[tid]["ptid"]

        for guess_tid in species_tids:
            if guess_tid == answer_tid:
                mapping[(guess_tid, answer_tid)] = 0
                continue

            remaining = -1

            # go up the tree until we find a node that has been covered
            # or we're on chain
            tid = guess_tid
            ptid = nodes[tid]["ptid"]
            while tid != -1:
                # print(f"{nodes[tid]['sci_name']}: {nodes[tid]['descendants']}")
                # print(f"  {nodes[ptid]['sci_name']}: {nodes[ptid]['descendants']}")

                # exit conditions
                if nodes[ptid]["onchain"]:
                    remaining = nodes[ptid]["descendants"] - nodes[tid]["descendants"]
                    break
                if nodes[ptid]["remaining"] != -1:
                    remaining = nodes[ptid]["remaining"]
                    break

                # keep going up
                tid = ptid
                ptid = nodes[tid]["ptid"]

            # mark all of the nodes with remaining
            tid = guess_tid
            ptid = nodes[tid]["ptid"]
            while tid != -1:
                nodes[tid]["remaining"] = remaining

                # exit conditions
                if nodes[ptid]["onchain"]:
                    break
                if nodes[ptid]["remaining"] != -1:
                    break

                # keep going up
                tid = ptid
                ptid = nodes[tid]["ptid"]

            mapping[(guess_tid, answer_tid)] = remaining

    # for (g, a), r in mapping.items():
    #     print(f"{nodes[g]['com_name'][0]} ({nodes[a]['com_name'][0]}): {r}")

    return mapping


def optimal_guess(nodes, mapping, possible_tids):
    # index nodes by TID to make traversal easier
    nodes = nodes["nodes"]
    nodes = {node["tid"]: node for node in nodes.values()}

    totals = {g: 0 for g in possible_tids}
    for (g, a), r in mapping.items():
        if g not in possible_tids:
            continue
        if a not in possible_tids:
            continue
        totals[g] += r

    t_min = 1000000000
    for g in possible_tids:
        t_min = min(t_min, totals[g])

    possible_tids.sort(key=lambda g: totals[g])
    possible_guesses = [
        tid for tid in possible_tids if totals[tid] == totals[possible_tids[0]]
    ]
    for i, g in enumerate(possible_guesses):
        mean = totals[g] / len(possible_tids)
        # print(f"  {nodes[g]['com_name'][0]:25s}: {mean:.3f}, {np.sqrt(var):.3f}")

    # break ties at random
    if len(possible_guesses) > 0:
        g = random.choice(possible_guesses)
        mean = totals[g] / len(possible_tids)
        return g, nodes[g], mean

    return -1, None, -1


def make_guess(nodes, answer_tid, guess_tid, possible_tids):
    if guess_tid == answer_tid:
        return []
    if guess_tid not in possible_tids:
        return possible_tids

    # index nodes by TID to make traversal easier
    nodes = nodes["nodes"]
    nodes = {node["tid"]: node for node in nodes.values()}

    # mark nodes as being on chain
    for node in nodes.values():
        node["onchain"] = False
    tid = answer_tid
    while tid != -1:
        nodes[tid]["onchain"] = True
        tid = nodes[tid]["ptid"]

    # find the smallest common clade
    tid = guess_tid
    ptid = nodes[tid]["ptid"]
    while ptid != -1:
        if nodes[ptid]["onchain"]:
            break

        # keep going up
        tid = ptid
        ptid = nodes[tid]["ptid"]
    clade_tid = ptid
    last_tid = tid

    # print(f"GUESS : {nodes[guess_tid]['com_name'][0]}")
    # print(f"ANS   : {nodes[answer_tid]['com_name'][0]}")
    # print(f"CLADE : {nodes[clade_tid]['sci_name']}")
    # print(f"LAST  : {nodes[last_tid]['sci_name']}")

    # filter possible_tids down accounting for the guess
    new_possible_tids = []
    for possible_tid in possible_tids:
        # print(f"  STARTING: {nodes[possible_tid]['com_name'][0]}")
        tid = possible_tid
        while tid != -1:
            # print(f"    {nodes[tid]['sci_name']}")
            if tid == last_tid:
                break
            if tid == clade_tid:
                new_possible_tids.append(possible_tid)
                # print(f"    KEEP")
                break

            tid = nodes[tid]["ptid"]

    # TODO: technically we can also use hint information here

    return new_possible_tids


if __name__ == "__main__":
    with open(BASE_DIR / "species.json", "r") as fp:
        species = json.load(fp)

    page_data = parse_articles(XML_PATH)

    nodes = make_nodes(species, page_data, ensure_eukaryota=False)
    check_nodes(nodes)
    nodes = add_qids(nodes)
    nodes = add_wikititles(nodes)
    nodes = add_wikitext(nodes)
    nodes = add_wikiimages(nodes)
    nodes = set_root(nodes, "Animalia")
    check_species_genus(nodes)
    nodes = remove_chains(nodes)
    nodes = reassign_tids(nodes)
    nodes = clean_text(nodes)
    nodes = apply_overwrites(nodes)
    check_nodes_final(nodes)

    make_js_files(nodes)

    display_names = ["Xerinae"]
    for node in nodes["nodes"].values():
        if node["nchildren"] >= 5 or node["sci_name"] in display_names:
            print(node["sci_name"])
            display_tree(
                filter_nodes(nodes, node["ptid"]),
                outfile=TMP_DIR
                / f"tree_{node['nchildren']:02d}_{node['sci_name']}.html",
            )
    display_tree(nodes, outfile=TMP_DIR / f"tree_full_{len(nodes['nodes'])}.html")
    print()

    # species_tids = {
    #     node["sci_name"]: node["tid"]
    #     for node in nodes["nodes"].values()
    #     if node["nchildren"] == 0
    # }
    # tids = list(species_tids.values())
    # for i in [0]:
    #     tids = []
    #     for sp in species:
    #         if sp["level"] >= i:
    #             tids.append(species_tids[sp["scientific"]])

    #     nodes = limit_species(nodes, tids)
    #     compute_stats(nodes)

    # nodes = limit_species(nodes, [988, 749, 255, 1367, 1295, 1195, 1170])
    # tids = [988, 749, 255, 1367, 1295, 1195, 1170]
    # nodes = limit_species(nodes, tids)
    # display_tree(nodes, outfile=TMP_DIR / f"tree_limited_{len(nodes['nodes'])}.html")
    # mapping = compute_guess_answer_mapping(nodes)
    # optimal_guess(nodes, mapping, tids)

    # mapping = compute_guess_answer_mapping(nodes)

    # num_reps = 10
    # for answer_tid in tids:
    #     answer = ""
    #     total_guesses = 0
    #     for _ in range(num_reps):
    #         possible_tids = tids
    #         num_guesses = 0
    #         while True:
    #             num_guesses += 1
    #             guess_tid, guess_node, mean = optimal_guess(
    #                 nodes, mapping, possible_tids
    #             )
    #             possible_tids = make_guess(nodes, answer_tid, guess_tid, possible_tids)
    #             if len(possible_tids) == 0:
    #                 print(f"ANSWER {guess_node['com_name'][0]} ({num_guesses} guesses)")
    #                 answer = guess_node["com_name"][0]
    #                 break
    #             else:
    #                 print(
    #                     f"GUESS: {guess_node['com_name'][0]}, {len(possible_tids)} possibilities, ({mean:.1f} expected)"
    #                 )
    #         total_guesses += num_guesses
    #         print()
    #     mean_guesses = total_guesses / num_reps

    #     with open(TMP_DIR / "mean_guesses.csv", "a+") as fp:
    #         fp.write(f"{answer_tid},{answer},{mean_guesses}\n")

    # list_species(nodes)
    # display_tree(nodes, outfile=TMP_DIR / f"tree_full_{len(nodes['nodes'])}.html")
    # nodes = limit_species(nodes, [900, 499, 1324, 744])
    # display_tree(nodes, outfile=TMP_DIR / f"tree_full_{len(nodes['nodes'])}.html")
    # exit(1)

    print("force polytomy text to be fairly helpful, esp. ones with 5 or more children")

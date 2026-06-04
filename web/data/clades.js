export const CladeState = Object.freeze({
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
  new Clade(
    0,
    null,
    "Metazoa",
    "Animals",
    "Animals are multicellular, eukaryotic organisms belonging to the biological kingdom Animalia. With few exceptions, animals consume organic material, breathe oxygen, have myocytes and are able to move, can reproduce sexually, and grow from a hollow sphere of cells, the blastula, during embryonic development. Animals form a clade, meaning that they arose from a single common ancestor. Over 1.5 million living animal species have been described, of which around 1.05 million are insects, over 85,000 are molluscs, and around 65,000 are vertebrates.",
    "//upload.wikimedia.org/wikipedia/commons/6/6f/Animal_diversity_b.png",
    "kingdom",
  ),
  new Clade(
    1,
    0,
    "Euplectella aspergillum",
    "sponge",
    "The Venus' flower basket (Euplectella aspergillum) is a species of glass sponge found in the deep waters of the Pacific Ocean, usually at depths below 500 m (1,600 ft). Like other glass sponges, they build their skeletons out of silica, which forms a unique lattice structure consisting of spicules. This body structure is of great interest in materials science as the optical and mechanical properties are in some ways superior to man-made materials. Like other sponges, they feed by filtering sea water to capture plankton and marine snow.",
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/a\/a0\/Euplectella_aspergillum_Okeanos.jpg\/500px-Euplectella_aspergillum_Okeanos.jpg",
    "species",
  ),
  new Clade(
    2,
    0,
    "Arthropoda",
    "arthropods",
    "Arthropods are invertebrates in the phylum Arthropoda. They possess an exoskeleton with a cuticle made of chitin, often mineralised with calcium carbonate, a body with differentiated (metameric) segments, and paired jointed appendages. In order to keep growing, they must go through stages of moulting, a process by which they shed their exoskeleton to reveal a new one. They form an extremely diverse group of up to ten million species. Haemolymph is the analogue of blood for most arthropods.",
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/1\/14\/Arthropoda_collage.png\/500px-Arthropoda_collage.png",
    "phylum",
  ),
  new Clade(
    3,
    0,
    "Mammalia",
    "mammals",
    "A mammal (from Latin  mamma 'breast') is a vertebrate animal of the class Mammalia. Mammals are characterized by the presence of milk-producing mammary glands for feeding their young, a broad neocortex region of the brain, fur or hair, and three middle ear bones. These characteristics distinguish them from reptiles and birds, from which their ancestors diverged in the Carboniferous period over 300 million years ago. Around 6,640 extant species of mammals have been described and divided into 27 orders. The study of mammals is called mammalogy.",
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/8\/81\/Mammal_collage.png\/500px-Mammal_collage.png",
    "class",
  ),
  new Clade(
    4,
    2,
    "Pardosa amentata",
    "spider",
    "Pardosa amentata, otherwise known as the wolf spider or spotted wolf spider is a species of spider in the genus Pardosa belonging to the family of wolf spiders, Lycosidae. The species has a widespread distribution in central Europe and northwestern Europe and are commonly found on the British Isles. The species hunts its prey on the ground rather than weaving a web. It was described in chapter 5 of the book Svenska Spindlar by the Swedish arachnologist and entomologist Carl Alexander Clerck.",
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/0\/0d\/Pardosa_amentata_03.JPG\/500px-Pardosa_amentata_03.JPG",
    "species",
  ),
  new Clade(
    5,
    2,
    "Hexapoda",
    "hexapods",
    "The subphylum Hexapoda (from Greek for 'six legs') or hexapods comprises the largest clade of arthropods and includes most of the extant arthropod species. It includes the crown group class Insecta (true insects), as well as the much smaller class Entognatha, which includes three classes of wingless arthropods that were once considered  Collembola (springtails), Protura (coneheads) and Diplura (two-pronged bristletails).",
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/5\/5f\/Echte_Fleischfliege_Sarcophaga_sp_male_2057_%28cropped%29.jpg\/500px-Echte_Fleischfliege_Sarcophaga_sp_male_2057_%28cropped%29.jpg",
    "class",
  ),
  new Clade(
    6,
    5,
    "Coccinella septempunctata",
    "ladybird",
    "Coccinella septempunctata, commonly known as the seven-spot ladybird (in North America, seven-spotted ladybug, seven-spotted lady beetle), often abbreviated C-7, is a carnivorous beetle native to Europe, most of Asia, and North Africa. It inhabits many regions with a temperate climate. The beetle has been introduced to several other areas, including North America as a biological pest control agent to combat aphid infestations. It is one of approximately 5,000 species of ladybird worldwide.",
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/0\/08\/7-Spotted-Ladybug-Coccinella-septempunctata-sq1.jpg\/500px-7-Spotted-Ladybug-Coccinella-septempunctata-sq1.jpg",
    "species",
  ),
  new Clade(
    7,
    5,
    "Apis mellifera",
    "bee",
    "The western honey bee (Apis mellifera) is the most common of the 7\u201312 species of honey bees worldwide. The genus name Apis is Latin for 'bee', and mellifera is the Latin for 'honey-bearing' or 'honey-carrying', referring to the species' production of honey. Like all honey bee species, the western honey bee is eusocial, creating colonies with a single fertile female (or \"queen\"), many normally non-reproductive females or \"workers\", and a small proportion of fertile males or \"drones\". Individual colonies can house tens of thousands of bees.",
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/4\/4d\/Apis_mellifera_Western_honey_bee.jpg\/500px-Apis_mellifera_Western_honey_bee.jpg",
    "species",
  ),
  new Clade(
    8,
    3,
    "Orycteropus afer",
    "aardvark",
    "The aardvark (Orycteropus afer) is a medium-sized, burrowing, nocturnal mammal native to Africa. The aardvark is the only living member of the genus Orycteropus, the family Orycteropodidae and the order Tubulidentata. The aardvark is an afrotherian, a clade that also includes elephants, manatees, and hyraxes. It is found over much of the southern two-thirds of the African continent, avoiding areas that are mainly rocky.",

    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/f\/f0\/Orycteropus_afer_175359469.jpg\/500px-Orycteropus_afer_175359469.jpg",
    "species",
  ),
  new Clade(
    9,
    3,
    "Ornithorhynchus anatinus",
    "platypus",
    "The platypus (Ornithorhynchus anatinus), sometimes referred to as the duck-billed platypus, is a semiaquatic, egg-laying mammal endemic to eastern Australia, including Tasmania. The platypus is the sole living representative of its family Ornithorhynchidae and genus Ornithorhynchus, though a number of related species appear in the fossil record. Together with the four species of echidna, it is one of the five extant species of monotremes, mammals that lay eggs instead of giving birth to live young.",
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/1\/1a\/Duck-billed_platypus_%28Ornithorhynchus_anatinus%29_Scottsdale.jpg\/500px-Duck-billed_platypus_%28Ornithorhynchus_anatinus%29_Scottsdale.jpg",
    "species",
  ),
  new Clade(
    10,
    3,
    "Hominidae",
    "great apes",
    'The Hominidae (hominids), whose members are known as the great apes, are a taxonomic family of primates that includes eight extant species in four  Pongo (the Bornean, Sumatran and Tapanuli orangutan); Gorilla (the eastern and western gorilla); Pan (the chimpanzee and the bonobo); and Homo, of which only modern humans (Homo sapiens) remain. Numerous revisions in classifying the great apes have caused the use of the term hominid to change over time. The original meaning of "hominid" referred only to humans (Homo) and their closest extinct relatives.',
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/4\/41\/Hominidae_%28extant_species%29.jpg\/500px-Hominidae_%28extant_species%29.jpg",
    "family",
  ),
  new Clade(
    11,
    10,
    "Homo sapiens",
    "human",
    "Humans (Homo sapiens, meaning 'thinking man' or 'wise man') are the most abundant and widespread species of primates, characterized by bipedality, hairlessness, and large, complex brains enabling the development of advanced technology, culture, and language. Humans are highly social beings and tend to live in complex social structures composed of many cooperating and competing groups, from families and kinship networks to political states. Social interactions between humans have established a wide variety of values, social norms, and rituals, which bolster human society.",
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/6\/68\/Akha_cropped_hires.JPG",
    "species",
  ),
  new Clade(
    12,
    10,
    "Gorilla gorilla",
    "gorilla",
    "The western gorilla (Gorilla gorilla) is a great ape found in Africa, one of two species of the hominine genus Gorilla. Large and robust with males weighing around 168 kilograms (370 lb), the species is found in a region of midwest Africa, geographically isolated from the eastern gorilla (Gorilla beringei). The hair of the western species is significantly lighter in colour. The western gorilla is the second largest living primate after the eastern gorilla.",
    "\/\/upload.wikimedia.org\/wikipedia\/commons\/thumb\/5\/50\/Male_gorilla_in_SF_zoo.jpg\/500px-Male_gorilla_in_SF_zoo.jpg",
    "species",
  ),
];

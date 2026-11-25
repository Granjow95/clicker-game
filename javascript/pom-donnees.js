// Plus ou Moins : thèmes de culture générale (valeurs arrondies, stables et vérifiables).
// Globale : POM_THEMES. Si `brut` est vrai (années), la valeur s'affiche sans séparateur de milliers.
const POM_SOURCE = 'Valeurs arrondies, sources encyclopédiques';
const POM_THEMES = [
  {
    question: 'Quel monument est le plus haut ?', categorie: 'Hauteur', unite: 'm', plus: 'Plus haut', moins: 'Moins haut', source: POM_SOURCE,
    items: [
      { nom: 'CN Tower (Toronto)', valeur: 553 }, { nom: 'Taipei 101', valeur: 508 }, { nom: 'Empire State Building', valeur: 443 },
      { nom: 'Tour Eiffel', valeur: 330 }, { nom: 'Tour Montparnasse', valeur: 210 }, { nom: 'Space Needle (Seattle)', valeur: 184 },
      { nom: 'Cathédrale de Cologne', valeur: 157 }, { nom: 'Grande pyramide de Gizeh', valeur: 139 }, { nom: 'Big Ben (tour Elizabeth)', valeur: 96 },
      { nom: 'Statue de la Liberté', valeur: 93 }, { nom: 'Tour de Pise', valeur: 56 }, { nom: 'Arc de triomphe', valeur: 50 },
    ],
  },
  {
    question: 'Quel sommet est le plus élevé ?', categorie: 'Altitude', unite: 'm', plus: 'Plus haut', moins: 'Moins haut', source: POM_SOURCE,
    items: [
      { nom: 'Everest', valeur: 8849 }, { nom: 'K2', valeur: 8611 }, { nom: 'Aconcagua', valeur: 6961 }, { nom: 'Denali', valeur: 6190 },
      { nom: 'Kilimandjaro', valeur: 5895 }, { nom: 'Elbrouz', valeur: 5642 }, { nom: 'Mont Blanc', valeur: 4806 }, { nom: 'Cervin', valeur: 4478 },
      { nom: 'Mont Fuji', valeur: 3776 }, { nom: 'Teide', valeur: 3715 }, { nom: 'Olympe', valeur: 2917 }, { nom: 'Puy de Dôme', valeur: 1465 },
      { nom: 'Ben Nevis', valeur: 1345 },
    ],
  },
  {
    question: 'Quel fleuve est le plus long ?', categorie: 'Longueur', unite: 'km', plus: 'Plus long', moins: 'Moins long', source: POM_SOURCE,
    items: [
      { nom: 'Nil', valeur: 6650 }, { nom: 'Yangtsé', valeur: 6300 }, { nom: 'Congo', valeur: 4700 }, { nom: 'Mékong', valeur: 4350 },
      { nom: 'Volga', valeur: 3530 }, { nom: 'Danube', valeur: 2850 }, { nom: 'Rhin', valeur: 1230 }, { nom: 'Loire', valeur: 1006 },
      { nom: 'Rhône', valeur: 810 }, { nom: 'Seine', valeur: 777 }, { nom: 'Garonne', valeur: 647 }, { nom: 'Tamise', valeur: 346 },
    ],
  },
  {
    question: 'Quel pays est le plus étendu ?', categorie: 'Superficie', unite: 'milliers de km²', plus: 'Plus grand', moins: 'Plus petit', source: POM_SOURCE,
    items: [
      { nom: 'Russie', valeur: 17098 }, { nom: 'Canada', valeur: 9985 }, { nom: 'Brésil', valeur: 8516 }, { nom: 'Australie', valeur: 7692 },
      { nom: 'Inde', valeur: 3287 }, { nom: 'Argentine', valeur: 2780 }, { nom: 'Algérie', valeur: 2382 }, { nom: 'Espagne', valeur: 506 },
      { nom: 'Japon', valeur: 378 }, { nom: 'Allemagne', valeur: 358 }, { nom: 'Italie', valeur: 301 }, { nom: 'Royaume-Uni', valeur: 244 },
      { nom: 'Islande', valeur: 103 }, { nom: 'Suisse', valeur: 41 }, { nom: 'Belgique', valeur: 31 },
    ],
  },
  {
    question: 'Quel film est sorti le plus récemment ?', categorie: 'Année de sortie', unite: '', brut: true, plus: 'Plus récent', moins: 'Plus ancien', source: POM_SOURCE,
    items: [
      { nom: 'Autant en emporte le vent', valeur: 1939 }, { nom: 'Psychose', valeur: 1960 }, { nom: '2001, l’Odyssée de l’espace', valeur: 1968 },
      { nom: 'Le Parrain', valeur: 1972 }, { nom: 'Les Dents de la mer', valeur: 1975 }, { nom: 'Star Wars', valeur: 1977 },
      { nom: 'E.T. l’extra-terrestre', valeur: 1982 }, { nom: 'Retour vers le futur', valeur: 1985 }, { nom: 'Jurassic Park', valeur: 1993 },
      { nom: 'Titanic', valeur: 1997 }, { nom: 'Gladiator', valeur: 2000 }, { nom: 'Avatar', valeur: 2009 },
    ],
  },
  {
    question: 'Quel film dure le plus longtemps ?', categorie: 'Durée', unite: 'min', plus: 'Plus long', moins: 'Plus court', source: POM_SOURCE,
    items: [
      { nom: 'Le Seigneur des anneaux : Le Retour du roi', valeur: 201 }, { nom: 'Titanic', valeur: 194 }, { nom: 'Le Parrain', valeur: 175 },
      { nom: 'Avatar', valeur: 162 }, { nom: 'Gladiator', valeur: 155 }, { nom: 'Pulp Fiction', valeur: 154 }, { nom: 'Forrest Gump', valeur: 142 },
      { nom: 'Matrix', valeur: 136 }, { nom: 'Jurassic Park', valeur: 127 }, { nom: 'Les Dents de la mer', valeur: 124 }, { nom: 'Star Wars', valeur: 121 },
      { nom: 'E.T. l’extra-terrestre', valeur: 115 }, { nom: 'Psychose', valeur: 109 }, { nom: 'Le Roi lion', valeur: 88 }, { nom: 'Toy Story', valeur: 81 },
    ],
  },
  {
    question: 'Quel astre est le plus loin du Soleil ?', categorie: 'Distance moyenne au Soleil', unite: 'millions de km', plus: 'Plus loin', moins: 'Plus proche', source: POM_SOURCE,
    items: [
      { nom: 'Pluton (planète naine)', valeur: 5906 }, { nom: 'Neptune', valeur: 4495 }, { nom: 'Uranus', valeur: 2871 }, { nom: 'Saturne', valeur: 1433 },
      { nom: 'Jupiter', valeur: 778 }, { nom: 'Cérès (planète naine)', valeur: 414 }, { nom: 'Mars', valeur: 228 }, { nom: 'Terre', valeur: 150 },
      { nom: 'Vénus', valeur: 108 }, { nom: 'Mercure', valeur: 58 },
    ],
  },
  {
    question: 'Quel événement est le plus récent ?', categorie: 'Année', unite: '', brut: true, plus: 'Plus récent', moins: 'Plus ancien', source: POM_SOURCE,
    items: [
      { nom: 'Les attentats du 11 septembre', valeur: 2001 }, { nom: 'La chute du mur de Berlin', valeur: 1989 }, { nom: 'Tchernobyl', valeur: 1986 },
      { nom: 'Les premiers pas sur la Lune', valeur: 1969 }, { nom: 'Le lancement de Spoutnik', valeur: 1957 }, { nom: 'La fin de la Seconde Guerre mondiale', valeur: 1945 },
      { nom: 'Le début de la Première Guerre mondiale', valeur: 1914 }, { nom: 'Le naufrage du Titanic', valeur: 1912 }, { nom: 'Le vol des frères Wright', valeur: 1903 },
      { nom: 'L’inauguration de la tour Eiffel', valeur: 1889 }, { nom: 'La bataille de Waterloo', valeur: 1815 }, { nom: 'La Révolution française', valeur: 1789 },
      { nom: 'Colomb en Amérique', valeur: 1492 }, { nom: 'La prise de Constantinople', valeur: 1453 }, { nom: 'La bataille de Hastings', valeur: 1066 },
    ],
  },
];

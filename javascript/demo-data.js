// DONNÉES FICTIVES : aperçu des écrans Plus ou Moins et Course de frappe.
// Rien ici n'est vérifié ni envoyé au serveur. Toute valeur affichée vient de ce fichier et
// s'accompagne du bandeau « données fictives » (voir index.html). À remplacer par de vraies données.
// Constantes globales (déclarées dans eslint.config.js) : DEMO_POM_THEMES, DEMO_POM_RECORD,
// DEMO_POM_SOURCE, DEMO_FRAPPE_CODE, DEMO_FRAPPE_PHRASES, DEMO_FRAPPE_JOUEURS.

const DEMO_POM_SOURCE = 'Exemple non vérifié';
const DEMO_POM_RECORD = 12;

// Chaque thème : question, libellé de catégorie, unité, textes des deux boutons, éléments (nom + valeur).
const DEMO_POM_THEMES = [
  {
    question: 'Lequel est le plus haut ?', categorie: 'Hauteur de', unite: 'm', plus: 'Plus haut', moins: 'Moins haut',
    items: [{ nom: 'La tour Eiffel', valeur: 330 }, { nom: 'Big Ben (tour Elizabeth)', valeur: 96 }, { nom: 'La statue de la Liberté', valeur: 93 }, { nom: 'Le Burj Khalifa', valeur: 828 }],
  },
  {
    question: 'Lequel dure le plus longtemps ?', categorie: 'Durée du film', unite: 'min', plus: 'Plus long', moins: 'Moins long',
    items: [{ nom: 'Titanic (1997)', valeur: 194 }, { nom: 'Le Retour du roi (2003)', valeur: 201 }, { nom: 'Toy Story (1995)', valeur: 81 }],
  },
  {
    question: 'Lequel a le plus d’habitants ?', categorie: 'Population de', unite: 'M', plus: 'Plus peuplé', moins: 'Moins peuplé',
    items: [{ nom: 'Tokyo', valeur: 37 }, { nom: 'Paris (agglomération)', valeur: 11 }, { nom: 'Lagos', valeur: 15 }],
  },
];

const DEMO_FRAPPE_CODE = 'ZOOM';

const DEMO_FRAPPE_PHRASES = [
  'Le chat dort sur le clavier et personne n’ose le déranger.',
  'Une phrase courte, un chrono qui tourne et dix doigts pressés.',
];

// Joueurs fictifs : « mpm » sert à faire avancer leur voiture ; null = abandon.
const DEMO_FRAPPE_JOUEURS = [
  { nom: 'Léa', pret: true, mpm: 52, precision: 97 },
  { nom: 'Toi', moi: true, pret: false },
  { nom: 'Yanis', pret: true, mpm: 38, precision: 94 },
  { nom: 'Sofia', hote: true, pret: true, mpm: null, precision: 0 },
];

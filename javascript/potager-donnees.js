/* global module */
// Potager : données d'équilibrage (cultures, améliorations, quêtes, niveaux). Globale POTAGER_DONNEES.
// Toutes les durées sont en secondes. « rare » : nécessite la serre.
const POTAGER_DONNEES = (() => {
  const CULTURES = [
    { id: 'radis',     nom: 'Radis',     niveau: 1,  cout: 2,    temps: 10,    vente: 4,     xp: 1,   forme: 'racine', couleur: '#D8454F' },
    { id: 'carotte',   nom: 'Carotte',   niveau: 2,  cout: 5,    temps: 25,    vente: 11,    xp: 2,   forme: 'racine', couleur: '#E8832A' },
    { id: 'laitue',    nom: 'Laitue',    niveau: 3,  cout: 12,   temps: 60,    vente: 28,    xp: 4,   forme: 'rond',   couleur: '#8CCB4B' },
    { id: 'tomate',    nom: 'Tomate',    niveau: 4,  cout: 30,   temps: 150,   vente: 75,    xp: 8,   forme: 'rond',   couleur: '#D8321F' },
    { id: 'mais',      nom: 'Maïs',      niveau: 6,  cout: 70,   temps: 300,   vente: 175,   xp: 16,  forme: 'epi',    couleur: '#F2C94C' },
    { id: 'fraise',    nom: 'Fraise',    niveau: 8,  cout: 160,  temps: 600,   vente: 420,   xp: 32,  forme: 'rond',   couleur: '#E5476B' },
    { id: 'potiron',   nom: 'Potiron',   niveau: 10, cout: 400,  temps: 1500,  vente: 1100,  xp: 80,  forme: 'gros',   couleur: '#E67E22' },
    { id: 'tournesol', nom: 'Tournesol', niveau: 13, cout: 1500, temps: 3600,  vente: 4300,  xp: 240, forme: 'fleur',  couleur: '#F5C518', rare: true },
    { id: 'orchidee',  nom: 'Orchidée',  niveau: 17, cout: 6000, temps: 14400, vente: 18000, xp: 800, forme: 'fleur',  couleur: '#B66BD6', rare: true },
  ];

  // Niveau max par amélioration, coût = base * croissance^niveau actuel. `niveau` : niveau de ferme requis.
  const AMELIORATIONS = [
    { id: 'arrosoir',   nom: 'Arrosoir',   niveau: 1, base: 50,   croissance: 1.8, max: 10, effet: '+15 % de vitesse de pousse par niveau' },
    { id: 'engrais',    nom: 'Engrais',    niveau: 2, base: 80,   croissance: 1.9, max: 10, effet: '+20 % de rendement par niveau' },
    { id: 'etal',       nom: 'Étal',       niveau: 3, base: 120,  croissance: 1.9, max: 10, effet: '+10 % de prix de vente par niveau' },
    { id: 'epouvantail', nom: 'Épouvantail', niveau: 5, base: 200, croissance: 2.2, max: 10, effet: '+5 % de chance de récolte double par niveau' },
    { id: 'panier',     nom: 'Panier',     niveau: 4, base: 400,  croissance: 1,   max: 1,  effet: 'Récolte et replante automatiquement' },
    { id: 'serre',      nom: 'Serre',      niveau: 8, base: 5000, croissance: 4,   max: 3,  effet: 'Débloque les cultures rares, +10 % de vitesse par niveau pour elles' },
  ];

  const PARCELLES = { depart: 4, max: 16, base: 60, croissance: 1.65 };
  const NIVEAU_MAX = 30;
  const PLAFOND_HORS_LIGNE = 8 * 3600; // secondes

  // XP cumulée nécessaire pour atteindre le niveau L (index L-1) : somme de 15 * k^1.7.
  const SEUILS_XP = [0];
  for (let k = 1; k < NIVEAU_MAX; k++) SEUILS_XP.push(SEUILS_XP[k - 1] + Math.round(15 * Math.pow(k, 1.7)));

  // Quêtes en chaîne : les trois premières non réclamées sont affichées. La progression est lue dans les stats cumulées.
  // type : recolte (cible = id de culture ou absente), plante, gagner, amelio, parcelles, niveau
  const QUETES = [
    { id: 'q1',  type: 'recolte',   n: 5,      pieces: 20 },
    { id: 'q2',  type: 'recolte',   n: 10,     cible: 'radis',     pieces: 30,    xp: 5 },
    { id: 'q3',  type: 'plante',    n: 15,     pieces: 40 },
    { id: 'q4',  type: 'recolte',   n: 20,     cible: 'carotte',   pieces: 80,    xp: 10 },
    { id: 'q5',  type: 'amelio',    n: 1,      pieces: 100 },
    { id: 'q6',  type: 'gagner',    n: 500,    pieces: 150 },
    { id: 'q7',  type: 'parcelles', n: 6,      pieces: 200,   xp: 20 },
    { id: 'q8',  type: 'recolte',   n: 15,     cible: 'laitue',    pieces: 250 },
    { id: 'q9',  type: 'niveau',    n: 5,      pieces: 300 },
    { id: 'q10', type: 'recolte',   n: 25,     cible: 'tomate',    pieces: 600,   xp: 60 },
    { id: 'q11', type: 'gagner',    n: 5000,   pieces: 800 },
    { id: 'q12', type: 'recolte',   n: 150,    pieces: 1500 },
    { id: 'q13', type: 'amelio',    n: 8,      pieces: 2500 },
    { id: 'q14', type: 'recolte',   n: 20,     cible: 'potiron',   pieces: 6000,  xp: 200 },
    { id: 'q15', type: 'parcelles', n: 12,     pieces: 5000 },
    { id: 'q16', type: 'gagner',    n: 100000, pieces: 20000 },
    { id: 'q17', type: 'niveau',    n: 15,     pieces: 15000 },
    { id: 'q18', type: 'recolte',   n: 10,     cible: 'tournesol', pieces: 40000, xp: 800 },
    { id: 'q19', type: 'recolte',   n: 1000,   pieces: 50000 },
  ];

  return { CULTURES, AMELIORATIONS, PARCELLES, NIVEAU_MAX, PLAFOND_HORS_LIGNE, SEUILS_XP, QUETES };
})();

if (typeof module !== 'undefined') module.exports = POTAGER_DONNEES;

// Mots de Gribouille : noms français faciles à dessiner (uniques après normalizeWord, 4 à 30 caractères).
const WORDS = `
chat,chien,cheval,vache,cochon,mouton,poule,canard,lapin,souris,éléphant,girafe,lion,tigre,singe,zèbre,
crocodile,serpent,grenouille,tortue,escargot,papillon,abeille,araignée,fourmi,coccinelle,poisson,requin,
baleine,dauphin,pieuvre,crabe,étoile de mer,hippocampe,pingouin,hibou,perroquet,flamant rose,cygne,aigle,
kangourou,panda,ours,loup,renard,hérisson,écureuil,chauve-souris,dinosaure,licorne,dragon,fantôme,sirène,
pirate,robot,sorcière,vampire,clown,cowboy,astronaute,chevalier,princesse,bonhomme de neige,père noël,
pomme,banane,fraise,cerise,citron,orange,ananas,pastèque,raisin,carotte,tomate,champignon,maïs,oignon,
brocoli,pomme de terre,pizza,hamburger,frites,gâteau,glace,bonbon,sucette,biscuit,croissant,baguette,
fromage,oeuf au plat,crêpe,sandwich,popcorn,donut,chocolat,
maison,château,église,pont,tour eiffel,igloo,tente,cabane,moulin,phare,pyramide,fusée,avion,hélicoptère,
bateau,voilier,sous-marin,voiture,camion,tracteur,vélo,moto,train,montgolfière,trottinette,skateboard,
ambulance,tank,
soleil,lune,étoile,nuage,arc-en-ciel,éclair,flocon,volcan,montagne,cascade,désert,plage,palmier,cactus,
sapin,tournesol,rose,champignon vénéneux,feuille,arbre,fleur,herbe,
table,chaise,canapé,lampe,miroir,fenêtre,porte,escalier,armoire,tapis,rideau,horloge,bougie,bouteille,
verre,tasse,assiette,fourchette,cuillère,couteau,casserole,poêle,parapluie,valise,sac à dos,cadenas,
ciseaux,marteau,tournevis,échelle,brouette,balai,seau,arrosoir,
téléphone,ordinateur,télévision,appareil photo,casque audio,guitare,piano,tambour,trompette,violon,micro,
ballon,raquette,haltère,filet de pêche,canne à pêche,cerf-volant,yoyo,toupie,puzzle,cartes,échiquier,
trampoline,toboggan,balançoire,
chapeau,casquette,lunettes,chaussure,botte,chaussette,écharpe,gant,cravate,robe,pantalon,couronne,bague,
collier,montre,sac à main,
main,pied,oeil,oreille,bouche,dent,coeur,cerveau,squelette,
livre,crayon,gomme,règle,cartable,globe,boussole,carte au trésor,loupe,télescope,microscope,thermomètre,
pelle,pioche,hache,épée,bouclier,arc et flèche,canon,drapeau,trésor,coffre,
panneau stop,feu rouge,barrière,tente de cirque,montagne russe,grande roue,igloo glacé,moulin à vent,
cheminée,boîte aux lettres,lit superposé,hamac,piscine,douche,brosse à dents,savon,poubelle,aspirateur
`;

const GRIBOUILLE_WORDS = [...new Set(WORDS.split(",").map((w) => w.replace(/\s+/g, " ").trim()).filter(Boolean))];

module.exports = { GRIBOUILLE_WORDS };

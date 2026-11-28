// Mots de Gribouille (uniques après normalizeWord dans les deux listes, 4 à 30 caractères).
// Faciles : noms courants, faciles à dessiner.
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

// Difficiles : animaux rares, objets précis, lieux célèbres, métiers, phénomènes, créatures, situations et notions.
const HARD_WORDS = `
ornithorynque,mille-pattes,caméléon,paresseux,raton laveur,hippopotame,rhinocéros,chameau,dromadaire,lama,
koala,castor,taupe,limace,méduse,homard,scorpion,moustique,libellule,chenille,cocon,colibri,toucan,autruche,
paon,vautour,pélican,morse,narval,orque,poisson-lune,
épouvantail,marionnette,boomerang,sablier,kaléidoscope,tire-bouchon,taille-crayon,attrape-rêves,mappemonde,
scaphandre,paratonnerre,lampadaire,girouette,cadran solaire,boule à neige,boule disco,ventilateur,radiateur,
grille-pain,micro-ondes,machine à laver,lave-vaisselle,réfrigérateur,cafetière,mixeur,fer à repasser,
sèche-cheveux,rasoir,pince à linge,trousseau de clés,tirelire,porte-monnaie,distributeur de billets,
caisse enregistreuse,photocopieuse,imprimante,clavier,manette,casque de réalité virtuelle,clé usb,
cornemuse,accordéon,harpe,xylophone,contrebasse,saxophone,harmonica,triangle,partition,métronome,
éolienne,barrage,aqueduc,colisée,statue de la liberté,tour de pise,muraille de chine,sphinx,stonehenge,
totem,temple grec,arc de triomphe,gratte-ciel,usine,centrale nucléaire,station-service,péage,
radeau,catamaran,paquebot,dirigeable,parachute,deltaplane,planche à voile,téléphérique,télésiège,
patinoire,bowling,fléchettes,baby-foot,flipper,machine à sous,manège,auto-tamponneuse,
satellite,station spatiale,trou noir,éclipse,aurore boréale,tornade,tsunami,avalanche,sables mouvants,
oasis,mirage,geyser,stalactite,fossile,météorite,constellation,marée basse,coucher de soleil,
jardinier,boulanger,pompier,facteur,plombier,dentiste,chirurgien,détective,espion,magicien,acrobate,
dompteur,mime,jongleur,funambule,ventriloque,plongeur,apiculteur,bûcheron,arbitre,chef d'orchestre,
momie,zombie,loup-garou,cyclope,minotaure,centaure,phénix,yéti,extraterrestre,soucoupe volante,
cauchemar,fou rire,coup de foudre,insomnie,vertige,éternuement,hoquet,chair de poule,mal de mer,
embouteillage,file d'attente,pique-nique,anniversaire,mariage,déménagement,cambriolage,naufrage,
marée noire,recyclage,photosynthèse,gravité,électricité,évolution,digestion,
feu d'artifice,course de relais,bataille de polochons,bonhomme de pain d'épices,chasse au trésor,
tour de magie,partie d'échecs,selfie,panne de courant,coup de soleil,
bulle de savon,château de sable,boule de neige,toile d'araignée,nid d'oiseau,ruche,fourmilière,
terrier,épi de blé,botte de foin,citrouille,pomme de pin,noix de coco,artichaut,asperge,aubergine,
raclette,fondue,sushi,kebab,spaghettis,croque-monsieur,barbe à papa,pomme d'amour,
`;

const toList = (text) => [...new Set(text.split(",").map((w) => w.replace(/\s+/g, " ").trim()).filter(Boolean))];
const GRIBOUILLE_WORDS = toList(WORDS);
const GRIBOUILLE_HARD_WORDS = toList(HARD_WORDS);

module.exports = { GRIBOUILLE_WORDS, GRIBOUILLE_HARD_WORDS };

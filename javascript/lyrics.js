// ======= 📁 javascript/lyrics.js =======
// Regroupe :
//  - Catalogue de chansons (démo)
//  - Page de sélection (recherche, filtres, tri, cards)
//  - Page jeu (révélation instantanée, compteur "X/Total", retour sélection)
//  - Feu d’artifices à la fin

/* ------------------ CATALOGUE (démo) ------------------ */
window.LYRICS_SONGS = [
  {
    id: "goldman-quand-la-musique",
    title: "Quand la musique est bonne",
    artist: "Jean-Jacques Goldman",
    year: 1982,
    genre: "Chanson française",
    cover: "images/covers/goldman.png",
    lyrics: `J'ai trop saigné sur les Gibson
J'ai trop rôdé dans les Tobacco road
Y'a plus qu'les caisses qui me résonnent
Et quand j'me casse, j'voyage toujours en fraude
Des champs d'coton dans ma mémoire
Trois not' d'blues c'est un peu d'amour noir
Quand j'suis trop court, quand j'suis trop tard
C'est un recours pour une autr' histoire
Quand la musique est bonne (Bonne, bonne, bonne)
Quand la musique donne (Donne, donne, donne)
Quand la musique sonne (sonne), sonne (sonne), sonne (sonne)
Quand elle ne triche pas (Quand elle ne triche pas)
Quand la musique est bonne (Bonne, bonne, bonne)
Quand la musique donne (Donne, donne, donne)
Quand la musique sonne (sonne), sonne (sonne), sonne (sonne)
Quand elle guide mes pas (Quand elle guide mes pas)
J'ai plus l'amour, j'ai pas le temps
J'ai plus l'humour, j'sais plus d'où vient le vent
J'ai plus qu'un clou, une étincelle
Des trucs en plomb qui me brisent les ailes
Un peu de swing, un peu du King
Pas mal de feeling et de décibels
C'est pas l'usine, c'est pas la mine
Mais ça suffit pour se faire la belle
Quand la musique est bonne (Bonne, bonne, bonne)
Quand la musique donne (Donne, donne, donne)
Quand la musique sonne (sonne), sonne (sonne), sonne (sonne)
Quand elle ne triche pas (Quand elle guide mes pas)
Quand la musique est bonne (Bonne, bonne, bonne)
Quand la musique donne (Donne, donne, donne)
Quand la musique sonne (sonne), sonne (sonne), sonne (sonne)
Quand elle guide mes pas (Quand elle guide mes pas)
Quand la musique est bonne (Bonne, bonne, bonne)
Quand la musique donne (Donne, donne, donne)
Quand la musique sonne (sonne), sonne (sonne), sonne (sonne)
Quand elle ne triche pas (Quand elle ne triche pas)
Quand la musique est bonne (Bonne, bonne, bonne)
Quand la musique donne (Donne, donne, donne)
Quand la musique sonne (sonne), sonne (sonne), sonne (sonne)
Quand elle guide mes pas (Quand elle guide mes pas)
Quand la musique est bonne (Bonne, bonne, bonne)
Quand la musique donne (Donne, donne, donne)
Quand la musique sonne (sonne), sonne (sonne), sonne (sonne)
Quand elle ne triche pas (Quand elle ne triche pas)
Quand la musique est bonne (Bonne, bonne, bonne)
Quand la musique donne (Donne, donne, donne)
Quand la musique sonne (sonne), sonne (sonne), sonne (sonne)
Quand elle guide mes pas (Quand elle guide mes pas)
Quand la musique est bonne (Bonne, bonne, bonne)
Quand la musique donne (Donne, donne, donne)`,
  },
  {
    id: "francegall-ella",
    title: "Ella, elle l’a",
    artist: "France Gall",
    year: 1987,
    genre: "Chanson française",
    cover: "images/covers/france-gall.png",
    lyrics: `C'est comme une gaieté comme un sourire
quelque chose dans la voix qui paraît nous dire viens
qui nous fait sentir étrangement bien
c'est comme tout l'histoir du peuple noir
qui se balance entre l'amour et l'désespoir
quelque chose qui dance en toi, si tu l'a tu l'a
ella elle l'a ce je n'sais qoi
que d'autres n'ont pas qui nous met dans un drôle d'état
ella elle l'a ella elle l'a, cette drôle de voix cette drôle de joie
ce don du ciel qui la rend belle ella elle l'a ella elle l'a
Elle a ce tout petit supplément d'âme
cet indéfinissable charme cette petite flamme
Tape sur des tonneaux sur des pianos
sur tout ce que dieu peut te mettre entre les mains
montre ton rire ou ton chagrin
mais que tu n'aies rien que tu sois roi
que tu cherches encore les pouvoirs qui dorment en toi
tu vois ca ne s'achète pas quand tu l'as tu l'as
Ella elle l'a ce je n'sais quoi
que d'autres n'ont pas qui nous met dans un drôle d'état
ella ella l'a ella elle l'a ella elle l'a ella elle l'a
ella elle l'a ella elle l'a ella elle l'a ella elle l'a ella elle l'a
Ella elle l'a ce je n'sais quoi
que d'autres n'ont pas qui nous met dans un drôle d'état
ella ella l'a ella elle l'a cette drôle de voix cette drôle de joie
ce don du ciel qui la rend belle ella elle l'a ella elle l'a ella elle l'a
Elle a ce tout petit supplément d'âme
cet indéfinissable charme cette petite flamme
Tape sur des tonneaux sur des pianos
sur tout ce que dieu peut te mettre entre les mains
montre ton rire ou ton chagrin
mais que tu n'aies rien que tu sois roi
que tu cherches encore les pouvoirs qui dorment en toi
tu vois ca ne s'achète pas quand tu l'as tu l'as
Ella elle l'a ce je n'sais quoi
que d'autres n'ont pas qui nous met dans un drôle d'état
ella ella l'a ella elle l'a ella elle l'a ella elle l'a
ella elle l'a ella elle l'a ella elle l'a ella elle l'a ella elle l'a
Ella elle l'a ce je n'sais quoi
que d'autres n'ont pas qui nous met dans un drôle d'état
ella ella l'a ella elle l'a cette drôle de voix cette drôle de joie
ce don du ciel qui la rend belle ella elle l'a ella elle l'a ella elle l'a`,
  },
  {
    id: "johnny-allumer-le-feu",
    title: "Allumer le feu",
    artist: "Johnny Hallyday",
    year: 1998,
    genre: "Rock français",
    cover: "images/covers/johnny.png",
    lyrics: `Tourner le temps à l'orage
Revenir à l'état sauvage
Forcer les portes, les barrages
Sortir le loup de sa cage
Sentir le vent qui se déchaîne
Battre le sang dans nos veines
Monter le son des guitares
Et le bruit des motos qui démarrent
Il suffira d'une étincelle
D'un rien, d'un geste
Il suffira d'une étincelle
Et d'un mot d'amour
Pour
Allumer le feu
Allumer le feu
Et faire danser les diables et les dieux
Allumer le feu
Allumer le feu
Et voir grandir la flamme dans vos yeux
Allumer le feu
Laisser derrière toutes nos peines
Nos haches de guerre, nos problèmes
Se libérer de nos chaînes
Lâcher le lion dans l'arène
Je veux la foudre et l'éclair
L'odeur de poudre, le tonnerre
Je veux la fête et les rires
Je veux la foule en délire
Il suffira d'une étincelle
D'un rien, d'un contact
Il suffira d'une étincelle
D'un peu de jour
Pour
Allumer le feu
Allumer le feu
Et faire danser les diables et les dieux
Allumer le feu
Allumer le feu
Et voir grandir la flamme dans vos yeux
Allumer le feu
Il suffira d'une étincelle
D'un rien, d'un geste
Il suffira d'une étincelle
D'un mot d'amour pour
Allumer le feu
Allumer le feu
Et faire danser les diables et les dieux
Allumer le feu
Allumer le feu
Et voir grandir la flamme dans vos yeux
Oh, allumer le feu
Allumer le feu
Et faire danser, les diables et les dieux
Allumer le feu (allumer le feu)
Allumer le feu (allumer le feu)`,
  },
  {
    id: "mylenefarmer-desenchantee",
    title: "Désenchantée",
    artist: "Mylène Farmer",
    year: 1991,
    genre: "Pop française",
    cover: "images/covers/mylene-farmer.png",
    lyrics: `Nager dans les eaux troubles
Des lendemains
Attendre ici la fin
Flotter dans l'air trop lourd
Du presque rien
A qui tendre la main

Si je dois tomber de haut
Que ma chute soit lente
Je n'ai trouvé de repos
Que dans l'indifférence
Pourtant, je voudrais retrouver l'innocence
Mais rien n'a de sens, et rien ne va

Tout est chaos
A côté
Tous mes idéaux : des mots
Abimés...
Je cherche une âme, qui
Pourra m'aider
Je suis
D'une géneration désenchantée
Désenchantée

Qui pourrait m'empêcher
De tout entendre
Quand la raison s'effondre
A quel sein se vouer
Qui peut prétendre
Nous bercer dans son ventre

Si la mort est un mystère
La vie n'a rien de tendre
Si le ciel a un enfer
Le ciel peut bien m'attendre
Dis moi,
Dans ces vents contraires comment s'y prendre
Plus rien n'a de sens, plus rien ne va.`,
  },
  {
    id: "nirvana-smells-like-teen-spirit",
    title: "Smells Like Teen Spirit",
    artist: "Nirvana",
    year: 1991,
    genre: "Rock",
    cover: "images/covers/nirvana.png",
    lyrics: `Load up on guns, bring your friends
It's fun to lose and to pretend
She's over-bored, and self-assured
Oh no, I know a dirty word
Hello, hello, hello, how low?
Hello, hello, hello, how low?
Hello, hello, hello, how low?
Hello, hello, hello
With the lights out, it's less dangerous
Here we are now, entertain us
I feel stupid and contagious
Here we are now, entertain us
A mulatto, an albino
A mosquito, my libido, yeah
Hey, yay
I'm worse at what I do best
And for this gift, I feel blessed
Our little group has always been
And always will until the end
Hello, hello, hello, how low?
Hello, hello, hello, how low?
Hello, hello, hello, how low?
Hello, hello, hello
With the lights out, it's less dangerous
Here we are now, entertain us
I feel stupid and contagious
Here we are now, entertain us
A mulatto, an albino
A mosquito, my libido, yeah
Hey, yay
And I forget just why I taste
Oh yeah, I guess it makes me smile
I found it hard, it's hard to find
Oh well, whatever, never mind
Hello, hello, hello, how low?
Hello, hello, hello, how low?
Hello, hello, hello, how low?
Hello, hello, hello
With the lights out, it's less dangerous
Here we are now, entertain us
I feel stupid and contagious
Here we are now, entertain us
A mulatto, an albino
A mosquito, my libido
A denial, a denial
A denial, a denial
A denial, a denial
A denial, a denial
A denial`,
  },
  {
    id: "oasis-wonderwall",
    title: "Wonderwall",
    artist: "Oasis",
    year: 1995,
    genre: "Rock",
    cover: "images/covers/oasis.png",
    lyrics: `Today is gonna be the day that they're gonna throw it back to you
By now, you should've somehow realised what you gotta do
I don't believe that anybody feels the way I do about you now
And backbeat, the word is on the street that the fire in your heart is out
I'm sure you've heard it all before, but you never really had a doubt
I don't believe that anybody feels the way I do about you now
And all the roads we have to walk are winding
And all the lights that lead us there are blinding
There are many things that I would like to say to you
But I don't know how
Because maybe
You're gonna be the one that saves me
And after all
You're my wonderwall
Today was gonna be the day, but they'll never throw it back to you
By now, you should've somehow realised what you're not to do
I don't believe that anybody feels the way I do about you now
And all the roads that lead you there were winding
And all the lights that light the way are blinding
There are many things that I would like to say to you
But I don't know how
I said, "Maybe
You're gonna be the one that saves me
And after all
You're my wonderwall"
I said, "Maybe (I said maybe)
You're gonna be the one that saves me
And after all
You're my wonderwall"
I said, "Maybe (I said maybe)
You're gonna be the one that saves me (saves me)
You're gonna be the one that saves me (saves me)
You're gonna be the one that saves me" (saves me)`,
  },

  // ==== Années 2000 ====
  {
    id: "diams-confessions-nocturnes",
    title: "Confessions nocturnes",
    artist: "Diam’s feat. Vitaa",
    year: 2006,
    genre: "Rap français",
    cover: "images/covers/diams.png",
    lyrics: `Ouais c'est qui là
Mel', c'est Vi' ouvre-moi
Ça va Vi', t'as l'air bizarre, qu'est ce qu'y a
Non, ça va pas non
Ben dis-moi, qu'est qu'il y a
Mel', assieds-toi faut que je te parle, j'ai passé ma journée dans l'noir
Mel', je le sens, je le sais, je le suis, il se fout de moi, ouais
Mais Vi' arrête, tu sais ton mec t'aime, ton mec m'a dit
"Tu sais Mélanie, Vi' c'est une reine et je pourrais crever pour elle"
Faut pas que tu paniques je te jure
Ton mec assure, ton mec assume Vi', ouais
Ton mec est pur, il te trompe pas, j'en suis sûre
Non mais tu sais pas toi, ça fait deux mois que j'sens son odeur
(Quoi)
Qu'elle laisse des messages tous les quarts d'heure
(Mais non)
J'ai infiltré son répondeur, mon mec se tape une autre femme, ouais
Mais tu sais quoi d'elle, t'en as la preuve formelle
Elle s'appelle Andy
Fille de la nuit, elle a un mec qui vit sur Saint-Denis
J'ai pas fini, je les ai vus ensemble mardi
Et je suis sûre que là tout d'suite il est avec elle
J'ai même l'adresse de l'hôtel
J'étais à coté de la plaque, je croyais que ton mec était intact, moi
Pas de trucs bizarres, pas de plans dragues, pas de pétasses
Je croyais que ton mec était à part, qu'il parlait mariage et appart'
Prends ton sac, l'adresse de leur rencard, viens, on va les voir, viens
J'y crois pas
(Calme-toi Vi', ça va aller)
Je ne peux pas, tu sais j'ai peur moi
(Gare-toi là, vas-y, gare-toi là)
Je ne sais pas si j'assume de le voir avec elle
Ok, reste discrète, donne-moi le cric, la bombe lacrymogène
Vite, donne-moi une clé, donne-moi sa plaque, que je la raye sa BM
Que je la crève sa BM, que je la saigne comme il te blesse sa BM
Si tu savais comme j'ai la haine
Je ne crois pas, je ne peux pas, tu sais j'ai peur moi
(Viens, viens on monte, sors de la voiture, viens)
Je ne sais pas si j'assume de le voir avec elle (mais si, viens)
Ne crois pas (j'ai demandé, c'est la chambre 203)
Que j'veux pas (mais si, on va monter)
Je n'y arriverai pas (ok, c'est au deuxième étage)
Je ne sais pas si j'assume de le voir avec elle
Vas-y tape (ouais deux secondes, j'arrive)
Mais qu'est-ce tu fous là
Je te croyais chez ton père mais tu te fous d'moi
J'ai toujours été droite et je vivais pour toi
J'avais confiance en toi, je pouvais crever pour toi
Et toi t'oses baiser cette chienne
Mais ferme ta gueule toi, et si tu veux parler s'te plaît rhabille-toi
Franchement t'as pas d'honneur, t'as pas honte de toi
Prends ton string et casse-toi
Les filles comme toi méritent pas plus qu'un petit bout de trottoir
Mais ferme ta gueule toi aussi, regarde-toi t'es en calcif, putain
Tu fais le miskine mais tu viens de briser mon amie, oh
T'es pas un homme, t'es qu'une victime
T'as un problème avec ton slip ou quoi
Putain vas-y Vitaa, on se casse d'ici, viens, viens
Je ne crois pas (arrête de pleurer s'te plaît)
Je ne peux pas (viens, on va dans la voiture, viens)
Tu sais, j'ai peur moi (rentre dans la voiture, viens)
Je ne sais pas si j'assume de le voir avec elle
Non mais je rêve Mel
Je l'ai pas vu avec elle, et c'était pas sa BM, non c'était pas cet hôtel
Non, non, tu ne rêves pas, ton mec était bien là-bas, Vitaa
C'était bien son taf, c'était bien lui chambre 203, Vitaa
C'était bien ton gars dans les bras d'une petite pétasse
Garde, garde le sang froid, ce bâtard n'est rien sans toi
Ben ouais la vie est une garce, quand t'as décidé d'être droite
Fallait peut-être que tu passes par là, retour à la case départ
Regarde-moi, après les drames que j'ai vécus, j'y croyais plus
Et puis l'amour m'est tombé dessus, je vis le bonheur absolu
J'y croyais pas, j'étais la femme la plus cocue de Paname
Mon ex était dealer de came, je le croyais dans le social
Crois-moi, tu sais ce que c'est que de se sentir trahie
Quand ton mari a sauté toutes les michetonneuses de Paris
Regarde-moi aujourd'hui, j'ai presque la bague au doigt, là
Après tout ça s'te plaît Vitaa, ne désespère pas
Mais qu'est-ce t'en sais toi
Peux-tu me dire ce que fait ton mec et à quel endroit (arrête Vi')
Ce qu'il fait de ses nuits et quand t'es pas là
Et dans quels bras il court étouffer ses pêchés quand t'es avec moi
Es-tu sûre qu'il est fidèle, ouais (mais oui)
As-tu consulté ses mails (non, non)
Fouillé son MSN (non, j'suis pas comme ça)
Capté ses messages, questionné sa mère
Quand elle dit qu'il est chez elle et lui qu'il est chez son frère
Si t'es sûre de toi (ben quoi, ben quoi)
Alors prends ton téléphone, écoute son répondeur et tu verras
(Ok Vi' t'es fatiguée, t'es, t'as la haine arrête s'te plaît, arrête)
Je vais le faire pour toi (arrête, raccroche, raccroche)
J'ai le numéro de ton gars (mais raccroche je te dis putain)
Je vais le faire pour toi, je vais le faire pour toi
Vous êtes bien sur mon répondeur, laissez-moi un message merci
Veuillez composer votre code secret et terminer par dièse
Vous avez deux nouveaux messages
Nouveau message, reçu hier à 22h51
"Ouais poto c'est So'..."
Nouveau message, reçu hier à 23h28
"Ouais bébé c'est moi, ça fait une heure et tu me manques déjà
Vivement demain, tu me manques, tu me manques, tu me manques
Bisous"
C'est bon, t'es calmée là
Mel' (quoi encore)
Tiens-toi prête, faut que je te parle (quoi)
Tu vas passer tes journées dans le noir
Mel', je le sais, je le sens, j'en suis sûre, il se fout de toi, ouais
Entre nous, je fais toujours genre j'assume tout
J'ai aucun regret devant les gens et tout ça
Mais dans le fond j'ai quand même honte d'une chose
C'est vrai que j'avais 15 ans, mais j'ai fait une belle connerie
Ça, je m'en suis rendue compte
Quand j'ai vu ma mère pleurer à mon chevet
Que j'ai vu tous ces gens qui m'aimaient qui pleuraient
À ce moment là je me suis dit
"Mais merde, t'es qu'une grosse égoïste de merde
T'as pas pensé à eux, en vrai"
Comment j'ai pu faire ça, putain
Comment j'ai pu prendre le risque
De rater de vivre tout ce que j'vis aujourd'hui
Putain`,
  },
  {
    id: "kyo-derniere-danse",
    title: "Dernière danse",
    artist: "Kyo",
    year: 2003,
    genre: "Pop rock française",
    cover: "images/covers/kyo.png",
    lyrics: `J'ai longtemps parcouru son corps
Effleuré cent fois son visage
J'ai trouvé de l'or et même quelques étoiles
En essuyant ses larmes
J'ai appris par cœur la pureté de ses formes
Parfois, je les dessine encore
Elle fait partie de moi
Je veux juste une dernière danse
Avant l'ombre et l'indifférence
Un vertige puis le silence
Je veux juste une dernière danse
Je l'ai connue trop tôt, mais c'est pas de ma faute
La flèche a traversé ma peau
C'est une douleur qui se garde
Qui fait plus de bien que de mal
Mais je connais l'histoire, il est déjà trop tard
Dans son regard, on peut apercevoir qu'elle se prépare
Au long voyage
Je veux juste une dernière danse
Avant l'ombre et l'indifférence
Un vertige puis le silence
Je veux juste une dernière danse
Ouh-ouh-ouh-ouh-ouh-ouh-ouh-ouh-ouh (une dernière danse)
Ouh-ouh-ouh-ouh-ouh-ouh-ouh-ouh-ouh (une dernière danse)
Je peux mourir demain, ça ne change rien
J'ai reçu de ses mains
Le bonheur ancré dans mon âme
C'est même trop pour un seul homme
Je l'ai vu partir, sans rien dire
Il fallait seulement qu'elle respire
Merci, d'avoir enchanté ma vie
Avant l'ombre et l'indifférence
Un vertige puis le silence
Je veux juste une dernière danse
J'ai longtemps parcouru son corps
Effleuré cent fois son visage
J'ai trouvé de l'or et même quelques étoiles
En essuyant ses larmes
Et j'ai appris par cœur la pureté de ses formes
Parfois, je les dessine encore
Elle fait partie de moi
Hmm-hmm-hmm-hmm-hmm-hmm-hmm-hmm
Hmm-hmm-hmm-hmm-hmm-hmm-hmm-hmm`,
  },
  {
    id: "amelbent-ma-philosophie",
    title: "Ma philosophie",
    artist: "Amel Bent",
    year: 2004,
    genre: "Pop française",
    cover: "images/covers/amel-bent.png",
    lyrics: `Je n'ai qu'une philosophie
Être acceptée comme je suis
Malgré tout ce qu'on me dit
Je reste le poing levé
Pour le meilleur, comme le pire
Je suis métisse, mais pas martyre
J'avance le cœur léger
Mais toujours, le poing levé
Lever la tête, bomber le torse
Sans cesse redoubler d'efforts
La vie ne m'en laisse pas le choix
Je suis l'as qui bat le roi
Malgré nos peines, nos différences
Et toutes ces injures incessantes
Moi, je lèverai le poing
Encore plus haut, encore plus loin
Viser la Lune
Ça me fait pas peur
Même à l'usure
J'y crois encore et en cœur
Des sacrifices
S'il le faut, j'en ferai
J'en ai déjà fait
Mais toujours, le poing levé
Je ne suis pas comme toutes ces filles
Qu'on dévisage, qu'on déshabille
Moi, j'ai des formes et des rondeurs
Ça sert à réchauffer les cœurs
Fille d'un quartier populaire
Qui a apprit à être fière
Bien plus d'amour, que de misère
Bien plus de cœur, que de pierre
Je n'ai qu'une philosophie
Être acceptée comme je suis
Avec la force et le sourire
Le poing levé vers l'avenir
Lever la tête, bomber le torse
Sans cesse redoubler d'efforts
La vie ne m'en laisse pas le choix
Je suis l'as qui bat le roi
Viser la Lune
Ça me fait pas peur
Même à l'usure
J'y crois encore et en cœur
Des sacrifices
S'il le faut, j'en ferai
J'en ai déjà fait
Mais toujours, le poing levé
Viser la Lune
Ça me fait pas peur
Même à l'usure
J'y crois encore et en cœur
Des sacrifices
S'il le faut, j'en ferai
J'en ai déjà fait
Mais toujours, le poing levé
Viser la Lune
Ça me fait pas peur
Même à l'usure
J'y crois encore et en cœur
Des sacrifices
S'il le faut, j'en ferai
J'en ai déjà fait
Mais toujours, le poing levé`,
  },
  {
    id: "indochine-jai-demande-a-la-lune",
    title: "J’ai demandé à la lune",
    artist: "Indochine",
    year: 2002,
    genre: "Rock français",
    cover: "images/covers/indochine.png",
    lyrics: `J'ai demandé à la lune
Et le soleil ne le sait pas
Je lui ai montré mes brûlures
Et la lune s'est moquée de moi
Et comme le ciel n'avait pas fière allure
Et que je ne guérissais pas
Je me suis dit "quelle infortune"
Et la lune s'est moquée de moi
J'ai demandé à la lune
Si tu voulais encore de moi
Elle m'a dit "j'ai pas l'habitude"
"De m'occuper des cas comme ça"
Et toi et moi
On était tellement sûrs
Et on se disait quelquefois
Que c'était juste une aventure
Et que ça ne durerait pas
Je n'ai pas grand chose à te dire
Et pas grand chose pour te faire rire
Car j'imagine toujours le pire
Et le meilleur me fait souffrir
J'ai demandé à la lune
Si tu voulais encore de moi
Elle m'a dit "j'ai pas l'habitude"
"De m'occuper des cas comme ça"
Et toi et moi
On était tellement sûrs
Et on se disait quelquefois
Que c'était juste une aventure
Et que ça ne durerait pas
Ah, ah, ah`,
  },
  {
    id: "eminem-lose-yourself",
    title: "Lose Yourself",
    artist: "Eminem",
    year: 2002,
    genre: "Rap",
    cover: "images/covers/eminem.png",
    lyrics: `Look, if you had one shot or one opportunity
To seize everything you ever wanted in one moment
Would you capture it or just let it slip?
Yo, his palms are sweaty, knees weak, arms are heavy
There is vomit on his sweater already

Mom's spaghetti, he's nervous
But on the surface he looks calm and ready
To drops bombs, but he keeps on forgetting
What he wrote down, the whole crowd goes so loud

He opens his mouth but the words won't come out
He's choking, how? Everybody's jokin' now
The clock's run out, time's up, over BLOW!
Snap back to reality, oh there goes gravity
Oh, there goes Rabbit, he choked, he's so mad
But he won't give up that easy, no he won't have it
He knows his whole back's to these ropes
It don't matter, he's dope, he knows that
But he's broke, he's so sad that he knows
When he goes back to this mobile home
That's when it's back to the lab again, yo
This whole rhapsody, better go capture this moment
And hope it don't collapse on him
You better lose yourself in the music
The moment you own it you better never let it go, oh
You only get one shot, do not miss your chance to blow
Cuz opportunity comes once in a lifetime, yo
You better lose yourself in the music
The moment you own it you better never let it go, oh
You only get one shot, do not miss your chance to blow
Cuz opportunity comes once in a lifetime, yo
You better
Soul's escapin' through this hole's that is gaping
This world is mines for the taking
Make me king as we move toward a new world order
A normal life is boring
But superstardom's close to post mortem
It only grows harder, homie grows hotter
He blows us all over, these hoes is all on him
Coast to coast shows, he's known as the Globetrotter
Lonely roads got him
He knows he's grown farther from home, he's no father
He goes home and barely knows his own daughter
But hold ya nose cuz here goes the cold water
These hoes don't want him no mo', he's cold prada
They moved on to the next shmo who flows
Who nose dove and sold nada
And so the so proper
His toll, it unfolds and I suppose it's old, partner
But the beat goes on
Duh duh doe, duh doe, dah dah dah dah
No more games, I'ma change for due called rage
Tear this muthafuckin' roof off like two dogs caged
I was playin' in the beginnin', the mood all changed
I've been chewed up and spit out and booed off stage

But I kept rhymin' and stepped writin' the next cipher
Best believe somebody's payin' the pied piper
All the pain inside amplified by the
Fact that I can't get by with my nine to five
And I can't provide the right type of life for my family
Cuz, man, these goddamn food stamps don't buy diapers
And there's no movie, there's no Mekhi Pfifer
This is my life and these times are so hard
And it's gettin' even harder tryin' to feed and water
My seed plus teeter-totter
Caught up between bein' a father and a pre-madonna
Baby momma drama, screamin' on her
Too much for me to wanna stay in one spot
Another damn or not has gotten me to the point
I'm like a snail, I've got to formulate a plot
Or end up in jail or shot
Success is my only muthafuckin' option, failure's not
Momma love you but this trailer's got to go
I cannot grow old in Salem's Lot
So here I go, it's my shot
Feet fail me not
Cuz maybe the only opportunity that I got
Duh doo
You can do anything you set your mind to, man`,
  },
  {
    id: "rihanna-umbrella",
    title: "Umbrella",
    artist: "Rihanna",
    year: 2007,
    genre: "Pop/RnB",
    cover: "images/covers/rihanna.png",
    lyrics: `Uh-huh, uh-huh (yeah, Rihanna)
Uh-huh, uh-huh (good girl gone bad)
Uh-huh, uh-huh (take three, action)
Uh-huh, uh-huh (Hov)
No clouds in my stones
Let it rain, I hydroplane in the bank (aye, aye, aye)
Coming down with the Dow Jones
When the clouds come, we gone, we Roc-A-Fella
We fly higher than weather, in G5's or better (aye, aye, aye)
You know me (you know me)
In anticipation for precipitation, stack chips for the rainy day
Jay, Rain Man is back (aye, aye, aye)
With Little Miss Sunshine, Rihanna, where you at? (Aye, aye)
You have my heart
And we'll never be worlds apart
Maybe in magazines
But you'll still be my star
Baby, 'cause in the dark
You can't see shiny cars
And that's when you need me there
With you, I'll always share
Because
When the sun shine, we shine together
Told you I'll be here forever
Said I'll always be your friend
Took an oath, I'ma stick it out to the end
Now that it's raining more than ever
Know that we'll still have each other
You can stand under my umbrella
You can stand under my umbrella 'ella, 'ella, eh, eh, eh
Under my umbrella 'ella, 'ella, eh, eh, eh
Under my umbrella 'ella, 'ella, eh, eh, eh
Under my umbrella 'ella, 'ella, eh, eh, eh, eh, eh, eh
These fancy things
Will never come in between
You're part of my entity
Here for infinity
When the war has took its part
When the world has dealt its cards
If the hand is hard
Together we'll mend your heart
Because
When the sunshine, we shine together
Told you I'll be here forever
Said I'll always be your friend
Took an oath, I'ma stick it out to the end
Now that it's raining more than ever
Know that we'll still have each other
You can stand under my umbrella
You can stand under my umbrella 'ella, 'ella, eh, eh, eh
Under my umbrella 'ella, 'ella, eh, eh, eh
Under my umbrella 'ella, 'ella, eh, eh, eh
Under my umbrella 'ella, 'ella, eh, eh, eh, eh, eh, eh
You can run into my arms
It's okay, don't be alarmed
Come into me
There's no distance in between our love
So go on and let the rain pour
I'll be all you need and more
Because
When the sun shine, we shine together
Told you I'll be here forever
Said I'll always be your friend
Took an oath, I'ma stick it out to the end
Now that it's raining more than ever
Know that we'll still have each other
You can stand under my umbrella
You can stand under my umbrella 'ella, 'ella, eh, eh, eh
Under my umbrella 'ella, 'ella, eh, eh, eh
Under my umbrella 'ella, 'ella, eh, eh, eh
Under my umbrella 'ella, 'ella, eh, eh, eh, eh, eh, eh
It's raining, raining
Ooh, baby, it's raining, raining
Baby, come into me, come into me
It's raining, raining
Ooh, baby, it's raining, raining
You can always come into me, come into me
It's pouring rain, it's pouring rain
Come into me, come into me
It's pouring rain, it's pouring rain
Come into me, come into me`,
  },
  {
    id: "coldplay-viva-la-vida",
    title: "Viva La Vida",
    artist: "Coldplay",
    year: 2008,
    genre: "Pop rock",
    cover: "images/covers/coldplay.png",
    lyrics: `I used to rule the world
Seas would rise when I gave the word
Now in the morning, I sleep alone
Sweep the streets I used to own
I used to roll the dice
Feel the fear in my enemy's eyes
Listen as the crowd would sing
Now the old king is dead, long live the king
One minute, I held the key
Next the walls were closed on me
And I discovered that my castles stand
Upon pillars of salt and pillars of sand
I hear Jerusalem bells a-ringin'
Roman Cavalry choirs are singin'
Be my mirror, my sword and shield
My missionaries in a foreign field
For some reason, I can't explain
Once you'd gone, there was never, never an honest word
And that was when I ruled the world
It was a wicked and wild wind
Blew down the doors to let me in
Shattered windows and the sound of drums
People couldn't believe what I'd become
Revolutionaries wait
For my head on a silver plate
Just a puppet on a lonely string
Aw, who would ever wanna be king?
I hear Jerusalem bells a-ringin'
Roman Cavalry choirs are singing
Be my mirror, my sword and shield
My missionaries in a foreign field
For some reason, I can't explain
I know Saint Peter won't call my name
Never an honest word
But that was when I ruled the world
Oh-oh-oh, oh-oh, oh
Oh-oh-oh, oh-oh, oh
Oh-oh-oh, oh-oh, oh
Oh-oh-oh, oh-oh, oh
Oh-oh-oh, oh-oh, oh
I hear Jerusalem bells a-ringin'
Roman Cavalry choirs are singin'
Be my mirror, my sword and shield
My missionaries in a foreign field
For some reason I can't explain
I know Saint Peter won't call my name
Never an honest word
But that was when I ruled the world`,
  },
  {
    id: "ladygaga-poker-face",
    title: "Poker Face",
    artist: "Lady Gaga",
    year: 2008,
    genre: "Pop",
    cover: "images/covers/lady-gaga.png",
    lyrics: `I wanna hold 'em like they do in Texas, please
Fold 'em, let 'em hit me, raise it, baby, stay with me (I love it)
LoveGame intuition, play the cards with spades to start
And after he's been hooked, I'll play the one that's on his heart
Oh, whoa-oh, oh, oh
Oh-oh-oh-oh-oh-oh
I'll get him hot, show him what I got
Oh, whoa-oh, oh, oh
Oh-oh-oh-oh-oh-oh
I'll get him hot, show him what I got
Can't read my, can't read my
No, he can't read my poker face
(She's got me like nobody)
Can't read my, can't read my
No, he can't read my poker face
(She's got me like nobody)
P-p-p-poker face, f-f-fuck her face (mum-mum-mum-mah)
P-p-p-poker face, f-f-fuck her face (mum-mum-mum-mah)
I wanna roll with him, a hard pair we will be (hey)
A little gamblin' is fun when you're with me (I love it, woo)
Russian roulette is not the same without a gun
And baby, when it's love, if it's not rough, it isn't fun (fun)
Oh, whoa-oh, oh, oh
Oh-oh-oh-oh-oh-oh
I'll get him hot, show him what I got
Oh, whoa-oh, oh, oh
Oh-oh-oh-oh-oh-oh
I'll get him hot, show him what I got
Can't read my, can't read my
No, he can't read my poker face
(She's got me like nobody)
Can't read my, can't read my
No, he can't read my poker face
(She's got me like nobody)
P-p-p-poker face, f-f-fuck her face (mum-mum-mum-mah)
P-p-p-poker face, f-f-fuck her face (mum-mum-mum-mah)
(Mum-mum-mum-mah)
(Mum-mum-mum-mah)
I won't tell you that I love you, kiss or hug you
'Cause I'm bluffin' with my muffin
I'm not lyin', I'm just stunnin' with my love-glue-gunnin'
Just like a chick in the casino
Take your bank before I pay you out
I promise this, promise this
Check this hand 'cause I'm marvelous
Can't read my, can't read my
No, he can't read my poker face
(She's got me like nobody)
Can't read my, can't read my
No, he can't read my poker face
(She's got me like nobody)
Can't read my, can't read my
No, he can't read my poker face
(She's got me like nobody)
Can't read my, can't read my
No, he can't read my poker face
(She's got me like nobody)
Can't read my, can't read my
No, he can't read my poker face
(She's got me like nobody)
Can't read my, can't read my
No, he can't read my poker face
(She's got me like nobody)
P-p-p-poker face, p-p-poker face
P-p-p-poker face, f-f-fuck her face (she's got me like nobody)
P-p-p-poker face, f-f-fuck her face (mum-mum-mum-mah)
P-p-p-poker face, f-f-fuck her face (mum-mum-mum-mah)
P-p-p-poker face, f-f-fuck her face (mum-mum-mum-mah)
P-p-p-poker face, f-f-fuck her face (mum-mum-mum-mah)
`,
  },

  // ==== Années 2010 ====
  {
    id: "maitregims-sapes-comme-jamais",
    title: "Sapés comme jamais",
    artist: "Maître Gims",
    year: 2015,
    genre: "Rap français",
    cover: "images/covers/maitre-gims.png",
    lyrics: `Sapés comme jamais, sapés comme jamais de jamais
Sapés comme jamais, jamais
Sapés comme jamais, sapés comme jamais de jamais
Sapés comme jamais, jamais

On casse ta porte, c'est la Gestapo
Je vais t'retouver me dit Columbo
Ça veut vendre des tonnes à la Gustavo
Un café sans sucre, j'en ai plein sur l'dos

Hé ouais ma puce, la thune rend beau
Ça va faire 6 ans qu'on met des combos
Je manie les mélos, Warani, Warano
Tu te demandes si c'est pas un complot

Haut les mains, haut les mains
Sauf les mecs sapés en Balmain
Balmain, Balmain
Sarouel façon Aladdin

Haut les mains, haut les mains
Sauf les mecs sapés en Balmain
Balmain, Balmain
Sarouel façon Aladdin

Passe avant minuit (passe avant minuit)
Je vais t'faire vivre un dream (je vais t'faire vivre un dream)
Avance sur la piste
Les yeux sont rivés sur toi
Les habits qui brillent tels Les Mille Et Une Nuits
Paris est vraiment ma-ma-ma-ma

Sapés comme jamais (jamais)
Sapés comme jamais (jamais)
Sapés comme jamais (jamais)
Sapés comme jamais
Loulou' et 'Boutin (bando)
Loulou' et 'Boutin ('Boutin na 'Boutin)
Coco na Chanel (Coco)
Coco na Chanel (Coco Chanel)

Niama na ngwaku des ngwaku
J'contrôle la ne-zo, apprécie mon parcours
Handeck à ta go, sale petit coquin, t'es cocu
Quand elle m'a vu elle t'a plaqué

Ferregamo, peau de croco sur la chaussure
J'suis Congolais, tu vois j'veux dire?
Hein hein, Norbatisé
Maître Gims m'a convoitisé

Charlie Delta localisé
Les mbilas sont focalisés
Sapés comme jaja, jamais
Dorénavant, j'fais des jaloux

J'avoue, je vis que pour la victoire, imbécile
La concurrence à ma vessie
Loubou', Zano' et Hermès
Louis Vuitton sac, j'veux la recette
(Bando na bando)

Passe avant minuit (passe avant minuit)
Je vais t'faire vivre un dream (je vais t'faire vivre un dream)
Avance sur la piste
Les yeux sont rivés sur toi
Les habits qui brillent tels Les Mille Et Une Nuits
Paris est vraiment ma-ma-ma-ma

Sapés comme jamais (jamais)
Sapés comme jamais (jamais)
Sapés comme jamais (jamais)
Sapés comme jamais

Loulou' et 'Boutin (bando)
Loulou' et 'Boutin ('Boutin na 'Boutin)
Coco na Chanel (Coco)
Coco na Chanel (Coco Chanel)

Kinshasa na Brazza (God bless)
Libreville, Abidjan (God bless)
Yaoundé na Douala (God bless)
Bamako na Dakar (God bless)

Dany Synthé oh (God bless)
Bedjik na Darcy hé (God bless)
Bilou na Dem-dem (God bless)
Djuna Djanana hé (God bless)

Sapés comme jamais (jamais)
Sapés comme jamais (jamais)
Sapés comme jamais (jamais)
Sapés comme jamais

Loulou' et 'Boutin (bando)
Loulou' et 'Boutin ('Boutin na 'Boutin)
Coco na Chanel (Coco)
Coco na Chanel (Coco Chanel)`,
  },
  {
    id: "stromae-alors-on-danse",
    title: "Alors on danse",
    artist: "Stromae",
    year: 2010,
    genre: "Electro/rap",
    cover: "images/covers/stromae.png",
    lyrics: `Alors on
Alors on
Alors on
Qui dit étude dit travail
Qui dit taf te dit les thunes
Qui dit argent dit dépenses
Et qui dit crédit dit créance
Qui dit dette te dit huissier
Et lui dit assis dans la merde
Qui dit amour dit les gosses
Dit toujours et dit divorce
Qui dit proches te dit deuils
Car les problèmes ne viennent pas seuls
Qui dit crise te dit monde
Dit famine, dit tiers-monde
Et qui dit fatigue dit réveil
Encore sourd de la veille
Alors on sort pour oublier tous les problèmes
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Et là tu te dis que c'est fini
Car pire que ça ce serait la mort
Quand tu crois enfin que tu t'en sors
Quand y en a plus et ben y en a encore
Est-ce la zik ou les problèmes?
Les problèmes ou bien la musique
Ça te prend les tripes, ça te prend la tête
Et puis tu pries pour que ça s'arrête
Mais c'est ton corps, c'est pas le ciel
Alors tu te bouches plus les oreilles
Et là tu cries encore plus fort
Et ça persiste
Alors on chante
La-la-la-la-la-la
La-la-la-la-la-la
Alors on chante
La-la-la-la-la-la
La-la-la-la-la-la
Alors on chante
Alors on chante
Et puis seulement quand c'est fini
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Alors on danse
Et ben y en a encore
Et ben y en a encore
Et ben y en a encore
Et ben y en a encore
Et ben y en a encore`,
  },
  {
    id: "kendji-color-gitano",
    title: "Color Gitano",
    artist: "Kendji Girac",
    year: 2014,
    genre: "Pop française",
    cover: "images/covers/kendji.png",
    lyrics: `C'est une façon de voir la vie
Un peu plus grand qu'un pays
Un destin, un regard
C'est de la musique et des cris
Un pour tous et tous réunis
Un chemin, une histoire
Mi vida, mi sabor
Mi fuerza, mi amor
Color Gitano
Ma raison, mes valeurs
Ma maison, ma couleur
Color Gitano
Gitano
El color de mi cielo
Gitano
Le cœur qui bat sous ma peau
Gitano
El color de mi cielo
Gitano
Le cœur qui bat sous ma peau
(Gitano)
C'est des guitares, des nuits sans fin
Les mots chaleureux des anciens
Le respect et les liens
C'est ton regard croisant le mien
Nous deux au milieu du chemin
Et soudain tu deviens
Mi vida, mi sabor
Mi fuerza, mi amor
Color Gitano
Ma passion, mon bonheur
Ma maison, ma couleur
Color Gitano
Gitano
El color de mi cielo
Gitano
Le cœur qui bat sous ma peau
Gitano
El color de mi cielo
Gitano
Le cœur qui bat sous ma peau
Dans nos cœurs, dans nos âmes
Dans nos sangs, dans nos flammes
Nos couleurs gitanes (Gitano)
Dans mon cœur, dans mon âme s'enflamment
Mes couleurs gitanes
Gitano
El color de mi cielo
Gitano
Le cœur qui bat sous ma peau
Gitano (Gitano)
El color de mi cielo (el color de mi cielo)
Gitano (Gitano)
Le cœur qui bat sous ma peau (Le cœur qui bat sous ma peau)
Gitano`,
  },
  {
    id: "jul-tchikita",
    title: "Tchikita",
    artist: "Jul",
    year: 2016,
    genre: "Rap français",
    cover: "images/covers/jul.png",
    lyrics: `Tchiki-Tchikita
Tchiki-Tchikita
Tchiki-Tchikita
Tchiki-Tchikita
Tchiki-Tchikita
Tchiki-Tchikita
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Elle a passé toute la nuit à m'peloter
Elle est pas dans l'même del que les filles d'à côté
J'la regarde dans les yeux en sirotant mon cocktail
Elle m'a vu dans l'VIP, me prend pour un mec mortel
C'est pas qu'si elle smoke avec moi j'lui nique sa gram's
Prends mon snap ou mon Facebook moi j'ai pas Instagram
Elle veut me parler me fait la grande la madame
J'ai rien pour toi moi j'vie toujours dans dans ma came
J'plonge dans ses yeux, je m'y noie
J'la regarde je m'y voie
J'plonge dans ses yeux, je m'y noie
J'la regarde je m'y voie
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Mais ou t'étais girl
J't'imaginais comme ça quand j'étais seul
Des fois tu m'fais la gueule
Rien qu'on fait les fiers et qu'on s'engueule
J'vois plus rien devant son boule magique
Je m'évade je deviens très nostalgique
Elle s'est fait belle ouai elle s'est fait les ongles
Elle a fait les plaques sur ses cheveux longo
J'l'aime bien elle est gentille et simple
Pas besoin d'aller la chercher en Lambo
Elle me trouve beau même quand j'le suis pas
Fuis moi j'te suis elle j'la suis elle m'fuit pas
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Elle a l'regard qui tue Tchikita
Cheveux long comme Nikita
Si elle me quitte pas j'la quitte pas
Tchikita Tchikita
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita
C'est Ju-Ju-Jul
Gros big up à Dj Babs
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita
Tchiki-tchikita`,
  },
  {
    id: "soprano-clown",
    title: "Clown",
    artist: "Soprano",
    year: 2014,
    genre: "Pop rap français",
    cover: "images/covers/soprano.png",
    lyrics: `Désolé, ce soir je n'ai pas le sourire
Je fais mine d'être sur la piste malgré la routine
J'ai le maquillage qui coule, mes larmes font de la lessive
Sur mon visage de clown (mon visage de clown)
Je sais bien que vous n'en avez rien à faire
De mes problèmes quotidiens, de mes poubelles, de mes colères
Je suis là pour vous faire oublier, vous voulez que ça bouge
Ce soir je suis payé, je remets mon nez rouge
Désolé les enfants si ce soir je n'suis pas drôle
Mais ce costume coloré me rend ridicule et me colle
J'me cache derrière ce sourire angélique depuis longtemps
Je ne sais plus m'en défaire, mais qui suis-je vraiment?
J'ai perdu mon chemin, avez-vous vu ma détresse?
J'ai l'impression d'être un chien qui essaie de ronger sa laisse
Mais ce soir la salle est pleine, vous voulez que ça bouge
Donc je nettoie ma peine et remets mon nez rouge
Suis-je seul à porter ce masque?
Suis-je seul à faire semblant?
Ce costume qu'on enfile tous les jours
Dis-moi est-il fait sur mesure
Ou nous va-t-il trop grand?
Désolé, ce soir je n'ai pas le sourire
J'ai le maquillage qui coule, mes larmes font de la lessive
Sur mon visage de clown (mon visage de clown)
Oh les mecs, ça va ou quoi?
Bien et toi? Tranquille?
Attends, la belle vie, pas la belle vie
Alors bien? Ah merci les frères, merci, merci voilà
Tu vas au club là? Y'a Sopra'?
Ouais, j'sais, j'vais aller le rejoindre là
Y'a du monde en plus
Ouais, j'dois me dépêcher en plus, oui
2014, encore des places voilà, bon j'vais voir, j'vais voir
Allez ça va, ça va, j'vais voir
Allez ça va
Ça va, ça va, ça va, t'inquiète`,
  },
  {
    id: "adele-rolling-in-the-deep",
    title: "Rolling in the Deep",
    artist: "Adele",
    year: 2010,
    genre: "Soul/Pop",
    cover: "images/covers/adele.png",
    lyrics: `There's a fire starting in my heart
Reaching a fever pitch and it's bringing me out the dark
Finally I can see you crystal clear
Go 'head and sell me out and I'll lay your ship bare
See how I leave with every piece of you
Don't underestimate the things that I will do
There's a fire starting in my heart
Reaching a fever pitch and its bringing me out the dark
The scars of your love remind me of us
They keep me thinking that we almost had it all
The scars of your love they leave me breathless, I can't help feeling
We could have had it all
Rolling in the deep
You had my heart inside of your hand
And you played it to the beat
Baby I have no story to be told
But I've heard one on you and I'm gonna make your head burn
Think of me in the depths of your despair
Making a home down there 'cause mine sure won't be shared
The scars of your love remind me of us
They keep me thinking that we almost had it all
The scars of your love they leave me breathless, I can't help feeling
We could have had it all
Rolling in the deep
You had my heart inside of your hand
And you played it to the beat
We could've had it all
Rolling in the deep
You had my heart inside your hand
But you played it with a beating
Throw your soul through every open door
Count your blessings to find what you look for
Turned my sorrow into treasured gold
You pay me back in kind and reap just what you sow
we could've had it all
We could've had it all
It all, it all, it all,
We could have had it all
Rolling in the deep
You had my heart inside of your hand
And you played it to the beat
We could've had it all
Rolling in the deep
You had my heart inside your hand
But you played it, you played it, you played it, you played it
To the beat`,
  },
  {
    id: "daftpunk-get-lucky",
    title: "Get Lucky",
    artist: "Daft Punk",
    year: 2013,
    genre: "Funk/Electro",
    cover: "images/covers/daft-punk.png",
    lyrics: `Like the legend of the phoenix
All ends with beginnings
What keeps the planet spinning
The force from the beginning (huh, look)
We've come too far
To give up who we are
So let's raise the bar
And our cups to the stars
She's up all night 'til the sun
I'm up all night to get some
She's up all night for good fun
I'm up all night to get lucky
We're up all night 'til the sun
We're up all night to get some
We're up all night for good fun
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
The present has no ribbon
Your gift keeps on giving
What is this I'm feeling?
If you wanna leave, I'm with it, ah
We've come too far
To give up who we are
So, let's raise the bar
And our cups to the stars
She's up all night 'til the sun
I'm up all night to get some
She's up all night for good fun
I'm up all night to get lucky
We're up all night 'til the sun
We're up all night to get some
We're up all night for good fun
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
She's up all night 'til the sun
I'm up all night to get some
She's up all night for good fun
I'm up all night to get lucky
We're up all night 'til the sun
We're up all night to get some
We're up all night for good fun
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
She's up all night 'til the sun
I'm up all night to get some
She's up all night for good fun
I'm up all night to get lucky
We're up all night 'til the sun
We're up all night to get some
We're up all night for good fun
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get-
We're up all night to get-
We're up all night to get-
We're up all night to get-
We're up all night to get-
We're up all night to get-
We're up all night to get-
We're up all night to get-
We're up all night to get- (together)
We're up all night to get (let's get funked again)
We're up all night to get funky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We've come too far
To give up who we are
So, let's raise the bar
And our cups to the stars
She's up all night 'til the sun
I'm up all night to get some
She's up all night for good fun
I'm up all night to get lucky
We're up all night 'til the sun
We're up all night to get some
We're up all night for good fun
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky
We're up all night to get lucky`,
  },
  {
    id: "pharrell-happy",
    title: "Happy",
    artist: "Pharrell Williams",
    year: 2013,
    genre: "Pop",
    cover: "images/covers/pharrell.png",
    lyrics: `It might seem crazy what I'm about to say
Sunshine, she's here, you can take a break
I'm a hot air balloon that could go to space
With the air, like I don't care, baby, by the way

Because I'm happy
Clap along if you feel like a room without a roof
Because I'm happy
Clap along if you feel like happiness is the truth
Because I'm happy
Clap along if you know what happiness is to you
Because I'm happy
Clap along if you feel like that's what you wanna do

Here comes bad news talking this and that (yeah)
Well, give me all you got and don't hold it back (yeah)
Well, I should probably warn you I'll be just fine (yeah)
No offense to you, don't waste your time, here's why

Because I'm happy
Clap along if you feel like a room without a roof
Because I'm happy
Clap along if you feel like happiness is the truth
Because I'm happy
Clap along if you know what happiness is to you
Because I'm happy
Clap along if you feel like that's what you wanna do

(Happy...)
Bring me down
Can't none
Bring me down
My level's too high
Bring me down
Can't none
Bring me down
I said (let me tell you now)
Bring me down
Can't none
Bring me down
My level's too high
Bring me down
Can't none
Bring me down
I said

Because I'm happy
Clap along if you feel like a room without a roof
Because I'm happy
Clap along if you feel like happiness is the truth
Because I'm happy
Clap along if you know what happiness is to you
Because I'm happy
Clap along if you feel like that's what you wanna do

Because I'm happy
Clap along if you feel like a room without a roof
Because I'm happy
Clap along if you feel like happiness is the truth
Because I'm happy
Clap along if you know what happiness is to you
Because I'm happy
Clap along if you feel like that's what you wanna do

(Happy...)
Bring me down
Can't none
Bring me down
My level's too high
Bring me down
Can't none
Bring me down
I said (let me tell you now)

Because I'm happy
Clap along if you feel like a room without a roof
Because I'm happy
Clap along if you feel like happiness is the truth
Because I'm happy
Clap along if you know what happiness is to you
Because I'm happy
Clap along if you feel like that's what you wanna do

Because I'm happy
Clap along if you feel like a room without a roof
Because I'm happy
Clap along if you feel like happiness is the truth
Because I'm happy
Clap along if you know what happiness is to you
Because I'm happy
Clap along if you feel like that's what you wanna do

Hey, c'mon`,
  },
  {
    id: "edsheeran-shape-of-you",
    title: "Shape of You",
    artist: "Ed Sheeran",
    year: 2017,
    genre: "Pop",
    cover: "images/covers/ed-sheeran.png",
    lyrics: `The club isn't the best place to find a lover
So the bar is where I go
Me and my friends at the table doing shots
Drinking fast and then we talk slow
Come over and start up a conversation with just me
And trust me I'll give it a chance now
Take my hand, stop, put Van the Man on the jukebox
And then we start to dance, and now I'm singing like
Girl, you know I want your love
Your love was handmade for somebody like me
Come on now, follow my lead
I may be crazy, don't mind me
Say, boy, let's not talk too much
Grab on my waist and put that body on me
Come on now, follow my lead
Come, come on now, follow my lead
I'm in love with the shape of you
We push and pull like a magnet do
Although my heart is falling too
I'm in love with your body
And last night you were in my room
And now my bedsheets smell like you
Every day discovering something brand new
I'm in love with your body
(Oh-I-oh-I-oh-I-oh-I)
I'm in love with your body
(Oh-I-oh-I-oh-I-oh-I)
I'm in love with your body
(Oh-I-oh-I-oh-I-oh-I)
I'm in love with your body
Every day discovering something brand new
I'm in love with the shape of you
One week in we let the story begin
We're going out on our first date
You and me are thrifty, so go all you can eat
Fill up your bag and I fill up a plate
We talk for hours and hours about the sweet and the sour
And how your family is doing okay
And leave and get in a taxi, then kiss in the backseat
Tell the driver make the radio play, and I'm singing like
Girl, you know I want your love
Your love was handmade for somebody like me
Come on now, follow my lead
I may be crazy, don't mind me
Say, boy, let's not talk too much
Grab on my waist and put that body on me
Come on now, follow my lead
Come, come on now, follow my lead
I'm in love with the shape of you
We push and pull like a magnet do
Although my heart is falling too
I'm in love with your body
And last night you were in my room
And now my bedsheets smell like you
Every day discovering something brand new
I'm in love with your body
(Oh-I-oh-I-oh-I-oh-I)
I'm in love with your body
(Oh-I-oh-I-oh-I-oh-I)
I'm in love with your body
(Oh-I-oh-I-oh-I-oh-I)
I'm in love with your body
Every day discovering something brand new
I'm in love with the shape of you
Come on, be my baby, come on
Come on, be my baby, come on
Come on, be my baby, come on
Come on, be my baby, come on
Come on, be my baby, come on
Come on, be my baby, come on
Come on, be my baby, come on
Come on, be my baby, come on
I'm in love with the shape of you
We push and pull like a magnet do
Although my heart is falling too
I'm in love with your body
And last night you were in my room
And now my bedsheets smell like you
Every day discovering something brand new
I'm in love with your body
Come on, be my baby, come on
Come on (I'm in love with your body), be my baby, come on
Come on, be my baby, come on
Come on (I'm in love with your body), be my baby, come on
Come on, be my baby, come on
Come on (I'm in love with your body), be my baby, come on
Every day discovering something brand new
I'm in love with the shape of you`,
  },

  // ==== Années 2020–2025 ====

  {
    id: "aya-djadja",
    title: "Djadja",
    artist: "Aya Nakamura",
    year: 2018,
    genre: "Pop urbaine",
    cover: "images/covers/aya.png",
    lyrics: `Aya Nakamura, oh yeah
Hello papi, mais qué pasa? (Mais qué pasa?)
J'entends des bails atroces sur moi
À c'qu'il paraît, j'te cours après? (Oh yeah, yeah, yeah)
Mais ça va pas? mais t'es taré, oh ouais
Mais comment ça, le monde est tit-pe? (Eh)
Tu croyais quoi, qu'on s'verrait plus jamais?
J'pourrais t'afficher mais c'est pas mon délire
D'après les rumeurs, tu m'as eue dans ton lit
Oh, Djadja
Y a pas moyen, Djadja
J'suis pas ta catin, Djadja, genre, en catchana baby, tu dead ça
Oh, Djadja
Y a pas moyen, Djadja
J'suis pas ta catin, Djadja, genre, en catchana baby, tu dead ça
Tu penses à moi, j'pense à faire de l'argent
J'suis pas ta daronne, j'te ferai pas la morale
Tu parles sur moi, y a R
Crache encore, y a R
Tu voulais m'avoir, tu savais pas comment faire
Tu jouais un rôle, tu finiras aux enfers
"T'façon, Nakamura, je l'ai couchée"
Le jour où on se croise, faut pas tchouffer
Tu jouais le grand frère pour me salir
Tu cherches des problèmes sans faire exprès
Putain, mais tu déconnes
C'est pas comme ça qu'on fait les choses
Putain, mais tu déconnes
C'est pas comme ça qu'on fait les choses
Putain, mais tu déconnes
C'est pas comme ça qu'on fait les choses
Oh, Djadja
Y a pas moyen, Djadja
J'suis pas ta catin, Djadja, genre, en catchana baby, tu dead ça
Oh, Djadja
Y a pas moyen, Djadja
J'suis pas ta catin, Djadja, genre, en catchana baby, tu dead ça
Oh, Djadja
Y a pas moyen, Djadja
J'suis pas ta catin, Djadja, genre, en catchana baby, tu dead ça
Oh, Djadja
Y a pas moyen, Djadja
J'suis pas ta catin, Djadja, genre, en catchana baby, tu dead ça
Oh, Djadja, j'suis pas ta catin, Djadja, non
Y a pas moyen, Djadja, ouais, en catchana baby, tu dead ça, yeah
Oh, Djadja, j'suis pas ta catin, Djadja, non
Y a pas moyen, Djadja, ouais, en catchana baby, tu dead ça, d'après toi
En catchana, baby tu dead ça, en catchana, baby
En catchana, baby tu dead ça, en catchana, baby
Oh, Djadja
Oh, Djadja
Oh, Djadja`,
  },
  {
    id: "sch-bande-organisee",
    title: "Bande organisée",
    artist: "SCH, Jul, Kofs, Naps, etc.",
    year: 2020,
    genre: "Rap français",
    cover: "images/covers/bande-organisee.png",
    lyrics: `Oui, ma gâtée, RS4 gris nardo, bien sûr qu'ils m'ont raté (gros, bien sûr)
Soleil dans la bulle, sur le Prado, Shifter pro' (Shifter pro')
Contre-sens (ah), ma chérie, tu es à contre-sens
Puta, où tu étais quand j'mettais des sept euros d'essence (hein)
Tu veux nous faire la guerre (hein), par Dieu, c'est B (ah)
Ça prend ton Audi, ça prend ta gadji, ça prend ta CB (eh, eh)
Le téléphone bippe (brr), que tu prends la kew (ew)
C'est Marseille, bébé (ah), sa mère un CDD (ah)
Wesh alors, ma race, tranquille ou quoi (oh, mathafuck)
Grimpe dans la tchop, j'fais 0 à 100 en 2 secondes 3
Guitarisé, oh, AC/DC, oh, on s'croise, c'est sûr, tu es tétanisé
J'ai passé la bague à Tchikita, deux mois après, j'l'ai déjà quitté (ah, ah)
T'es un petit bâtard, j'suis un apache, j'suis un Diakité (eh)
J'suis le capitaine (eh), j'vais les décapiter (eh)
C'est pas la capitale (nan), c'est Marseille, bébé (pah, pah, pah)
1.3, Audi Sport, j'passe la douane, les rapports
Nique ta mère sur la Canebière, nique tes morts sur le Vieux-Port (Santé & Honneur)
Mi amor, c'est les quartiers Sud, c'est les quartiers Nord
Nique ta mère sur la Canebière, nique tes morts sur le Vieux-Port (ah)
J'suis à la zone, sans casque sur un scooter kit-é
Oublie-la, c'est une puta, elle t'a quitté
J'suis ailleurs, c'est d'la moula qu'j'ai effrité
Depuis t'à l'heure, que ça me nique mon briquet
Rafale, flow bazookaw, j'ai des potes qui s'déplacent au cas où
La moto, elle fait "brm, brm, brm, brm", toujours là, demande à Tikow
J'suis dans l'game en claquettes, survêt'
J'fuck les folles qui parlent de moi sur l'net
J'suis sous potion là, j'tire 2-3 sur l'pét'
Au fait, on grimpe, envoie les zéros sur l'chèque
Ah, ah, poto, que pasa, ah, ah, dans la cabesa
Ah, ah, grr, ratata, ah, ah, pour les mapesa
Ah, ah, poto, que pasa, ah, ah, dans la cabesa
Ah, ah, grr, ratata, ah, ah, pour les mapesa
Plus besoin d'aller chez Lacoste depuis qu'j'suis fait d'or et d'platine
Et sur Twitter, j'vois leurs posts, nique leurs mères ceux qui parlent mal d'la team
En bande organisée, personne peut nous canaliser
Dans la zone, ça fume la fusée, pisté par les banalisées
Hasta luego, fais-en un, hasta luego, fais-en deux
Hasta luego, ouh, ouh, hasta luego, bam, bam
C'est du 24 carats (nan), j'rappe depuis l'époque de Cara
La technique, le flow de malade, artistiquement, on se balade (ok)
T-Max, casque Araï, recherché à kech-Marra
J'lui envoie une frappe imparable, j'fais couler son mascara (ah, ah)
Le J, c'est le S (ok), hum, j'sors le RS (vroum, vroum)
Une liasse épaisse, arlabelek', N.A.P.S (ah, ah)
Le, le J, c'est le S (ok), hum, j'sors le RS (vroum, vroum)
Une liasse épaisse, arlabelek', N.A.P.S (ok)
Yo, cesse ton baratin (yeah), t'es qu'un fils de bar à tain-p' (ah)
J'commence le rap avec 7 et 3, à la rivière, j'ai touché la quinte
Yo, j'vise l'or, le platine (ah), à la base, c'était les assises
J'suis un peu d'Zampa, un peu d'Zizou (coup), j'offre un Ricard à Poutine
Jeune trafiquant dans le bâtiment, cavale comme Usain Bolt (ah, ah)
Je connais le maniement de mon département, le soir, pour te froisser ta go' (ah, ah, ah)
Et ça fait, zumba, caféw, caféw, carnaval
J'suis dans l'4x4 teinté, pisté par la banal'
Et ça fait, zumba, caféw, caféw, carnaval
J'suis dans l'4x4 teinté, pisté par la banal'
En bande organisée, personne peut nous canaliser
Dans la zone, ça fume la fusée, pisté par les banalisées
Hasta luego, fais-en un, hasta luego, fais-en deux
Hasta luego, ouh, ouh, hasta luego, bam, bam
Égal, illégal (eh), Alpha, Oméga (vroum)
On fait coup d'état, balle dans la te-tê, c'est la cuenta (vroum)
Poursuite, y a les bleus (bleus), serein, j'sors d'la bleue (bleue)
Ter-ter, guidon, logistique, par terre, du sang balistique
A-tchu-tchu-tcha (tcha), c'est une salvatrucha ('cha)
Trafic haram (ah), Marseille, on trouve des cadavres (ouais)
Marseille hala, plus d'âme, les petits passent à l'acte (ouais)
Milli', j'veux l'milli' comme l'OVNI (hum), ces filha puta, j'les finis
Yah, on les rend amis, ennemis, yah, on les rend ennemis, amis, yah
J'ai les poches pleines, tu m'suis, j'ai fait le calcul de plus le calculer lui, yah (ouh)
Comportement dans la zone, yah, comporte avec les hommes, yah
Garde la pêche, moi, j'ai la forme, forme, temenik, on te déforme
Car c'est trop vrai, t'as l'regard et l'fond mauvais, quand j'galère, toi t'es refait (eh)
Au lit, t'es mauvais (eh), ta gadji, on la connaît (eh, eh)
Au parloir, elle a tourné (eh, eh), cognée par des prisonniers (ouh, ouh)
Tu dois des sous, sous, sous, tu fais la mala dans les "boum, boum, boum"
Pour de la monnaie, on te click, click, boum, l'alcool, on la glou, glou, glou (glou, glou, glou)
Tu dois des sous, sous, sous, tu fais la mala dans les "boum, boum, boum"
Pour de la monnaie, on te click, click, boum, l'alcool, on la glou, glou, glou (glou, glou, glou)
Wesh, tu veux pas la guerre mais pourquoi tu allumes la mèche (mèche, mèche)
J'suis dans la zone, j'évite les putas, wesh
Moi, j'écoute pas les gens et ma Clio, elle est sur les jantes
J'fais que fumer le jaune, des fois, avec un peu de Marie-Jeanne
Hier, j'étais bleu, j'voulais un Porsche GT bleu (bleu)
Y avait le pain, on était plein, y avait pas un, on était deux (deux)
J'suis dans le bloc, ma biche, dans la zone, c'est chacun sa kich' (sa kich')
Y a eu des traîtres, des traîtres, des traîtres, nique sa mère, c'est rien, ma3lich
Au quartier, y a d'la vente d'armes, nouvelle paire, j'paye en espèces
Fais belek, y a les gendarmes, ils sont loin, c'est bon, déstresse
C'est tous pour la plata, retour de flamme, fumar mata (brh)
Ça danse en équipe sur le chant des "ratata"
En bande organisée, personne peut nous canaliser
Dans la zone, ça fume la fusée, pisté par les banalisées
Hasta luego, fais-en un, hasta luego, fais-en deux
Hasta luego, ouh, ouh, hasta luego, bam, bam
En bande organisée, personne peut nous canaliser
Dans la zone, ça fume la fusée, pistés par les banalisées
Hasta luego, fais-en un, hasta luego, fais-en deux
Hasta luego, ouh, ouh, hasta luego, bam, bam`,
  },
  {
    id: "maitregims-vianney-la-meme",
    title: "La même",
    artist: "Maître Gims & Vianney",
    year: 2018,
    genre: "Pop française",
    cover: "images/covers/la-meme.png",
    lyrics: `Mes amis entendaient la vie que j’ai eu
Où les gens m’attendaient, je n’suis pas venu
Si je les emmêle, si je dérange
C’est qu’je suis un pêle-mêle, un mélange
J’suis trop compliqué, je n’choisirai jamais
Que les deux côtés, ne me demandez
Pas où je veux aller, même les singes singent les sages
Et tous ces sages ont fait des cases où tous nous ranger
Eh, eh, aye, aye
Aye, aye, aye
Si je vous gêne, bah c’est la même
Si je vous gêne, bah c’est la même
Eh, eh, aye, aye
Aye, aye, aye
Si je vous gêne, bah c’est la même
Si je vous gêne, bah c’est la même
On prend des boîtes, on y range les gens qu’au fond jamais, jamais l’on ne comprend
Comme l’Homme est fait de mille boîtes, ces boîtes que l’on prend ne sont jamais assez grandes
J’ai suivi mille chemins et serré dix mille mains
On peut aimer Brel et Megui, aimer même nos ennemis
J’suis trop compliqué, je ne rentrerai jamais
Dans vos petites cases, je vis au jour le jour
Alors je zigzague toujours avec ces lunettes noires
J’entends les gens se demander “quand est-ce que tombe le masque?”
Eh, eh, aye, aye
Aye, aye, aye
Si je vous gêne, bah c’est la même
Si je vous gêne, bah c’est la même
Eh, eh, aye, aye
Aye, aye, aye
Si je vous gêne, bah c’est la même
Si je vous gêne, bah c’est la même
T’es entrée dans ma vie, ô ma liberté chérie
La vie, c’est des envies, l’envie avant les avis
T’es entrée dans ma vie, ô ma liberté chérie
La vie, c’est des envies, l’envie avant les avis
Eh, eh, aye, aye
Aye, aye, aye
Si je vous gêne, bah c’est la même
Si je vous gêne, bah c’est la même
Eh, eh, aye, aye
Aye, aye, aye
Si je vous gêne, bah c’est la même
Si je vous gêne, bah c’est la même
Eh, eh, aye, aye
Aye, aye, aye
Si je vous gêne, bah c’est la même
Si je vous gêne, bah c’est la même`,
  },
  {
    id: "theweeknd-blinding-lights",
    title: "Blinding Lights",
    artist: "The Weeknd",
    year: 2020,
    genre: "Synthpop",
    cover: "images/covers/weeknd.png",
    lyrics: `Yeah
I've been tryna call
I've been on my own for long enough
Maybe you can show me how to love, maybe
I'm goin' through withdrawals
You don't even have to do too much
You can turn me on with just a touch, baby
I look around and
Sin City's cold and empty (oh)
No one's around to judge me (oh)
I can't see clearly when you're gone
I said, ooh, I'm blinded by the lights
No, I can't sleep until I feel your touch
I said, ooh, I'm drowning in the night
Oh, when I'm like this, you're the one I trust
(Hey, hey, hey)
I'm running out of time
'Cause I can see the sun light up the sky
So I hit the road in overdrive, baby, oh
The city's cold and empty (oh)
No one's around to judge me (oh)
I can't see clearly when you're gone
I said, ooh, I'm blinded by the lights
No, I can't sleep until I feel your touch
I said, ooh, I'm drowning in the night
Oh, when I'm like this, you're the one I trust
I'm just walking by to let you know (by to let you know)
I could never say it on the phone (say it on the phone)
Will never let you go this time (ooh)
I said, ooh, I'm blinded by the lights
No, I can't sleep until I feel your touch
(Hey, hey, hey)
(Hey, hey, hey)
I said, ooh, I'm blinded by the lights
No, I can't sleep until I feel your touch`,
  },
  {
    id: "miley-flowers",
    title: "Flowers",
    artist: "Miley Cyrus",
    year: 2023,
    genre: "Pop",
    cover: "images/covers/miley.png",
    lyrics: `We were good, we were gold
Kinda dream that can't be sold
We were right 'til we weren't
Built a home and watched it burn
Mm, I didn't wanna leave you, I didn't wanna lie
Started to cry, but then remembered I
I can buy myself flowers
Write my name in the sand
Talk to myself for hours
Say things you don't understand
I can take myself dancing
And I can hold my own hand
Yeah, I can love me better than you can
Can love me better, I can love me better, baby
Can love me better, I can love me better, baby
Paint my nails cherry red
Match the roses that you left
No remorse, no regret
I forgive every word you said
Ooh, I didn't wanna leave you, baby, I didn't wanna fight
Started to cry, but then remembered I
I can buy myself flowers
Write my name in the sand
Talk to myself for hours, yeah
Say things you don't understand
I can take myself dancing, yeah
I can hold my own hand
Yeah, I can love me better than you can
Can love me better, I can love me better, baby
Can love me better, I can love me better, baby
Can love me better, I can love me better, baby
Can love me better, I- (ooh, I)
I didn't wanna leave you, I didn't wanna fight
Started to cry, but then remembered I
I can buy myself flowers (uh-huh)
Write my name in the sand
Talk to myself for hours (yeah)
Say things you don't understand (you never will)
I can take myself dancing, yeah
I can hold my own hand
Yeah, I can love me better than
Yeah, I can love me better than you can
Can love me better, I can love me better, baby (oh, oh)
Can love me better, I can love me better, baby (than you can)
Can love me better, I can love me better, baby
Can love me better, I-`,
  },
];

/* ------------------ UTILITAIRES PARTAGÉS ------------------ */
function normalizeLyricsWord(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .trim();
}
function countWordsToFind(lyrics) {
  const clean = lyrics.replace(/\r\n/g, "\n");
  const regex = /([A-Za-zÀ-ÖØ-öø-ÿ0-9']+)/g;
  let total = 0;
  while (regex.exec(clean) !== null) total++;
  return total;
}

/* ==========================================================
   PAGE SÉLECTION
========================================================== */
(function selectionModule() {
  const $ = (q) => document.querySelector(q);

  const els = {
    root: $("#lyrics-select"),
    grid: $("#ls-grid"),
    search: $("#ls-search"),
    genre: $("#ls-genre"),
    artist: $("#ls-artist"),
    year: $("#ls-year"),
    sort: $("#ls-sort"),
  };

  function initFilters() {
    const genres = new Set();
    const artists = new Set();
    const years = new Set();

    window.LYRICS_SONGS.forEach((s) => {
      if (s.genre) genres.add(s.genre);
      if (s.artist) artists.add(s.artist);
      if (s.year) years.add(s.year);
    });

    function fillSelect(select, values, labelAll) {
      const previous = select.value;
      select.innerHTML = "";
      const optAll = document.createElement("option");
      optAll.value = "";
      optAll.textContent = labelAll;
      select.appendChild(optAll);

      [...values]
        .sort((a, b) => ("" + a).localeCompare("" + b, "fr", { numeric: true }))
        .forEach((v) => {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = v;
          select.appendChild(o);
        });

      if ([...select.options].some((o) => o.value === previous)) {
        select.value = previous;
      }
    }

    fillSelect(els.genre, genres, "Tous les genres");
    fillSelect(els.artist, artists, "Tous les artistes");

    // Années desc
    const sortedYears = [...years].sort((a, b) => b - a);
    const prev = els.year.value;
    els.year.innerHTML = "";
    const optAllY = document.createElement("option");
    optAllY.value = "";
    optAllY.textContent = "Toutes années";
    els.year.appendChild(optAllY);
    sortedYears.forEach((y) => {
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      els.year.appendChild(o);
    });
    if ([...els.year.options].some((o) => o.value === prev))
      els.year.value = prev;
  }

  function getFilteredSorted() {
    const q = (els.search.value || "").toLowerCase().trim();
    const genre = els.genre.value;
    const artist = els.artist.value;
    const year = els.year.value;
    const sort = els.sort.value;

    let list = window.LYRICS_SONGS.map((s) => ({
      ...s,
      words: countWordsToFind(s.lyrics),
    }));

    if (q) {
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q)
      );
    }
    if (genre) list = list.filter((s) => s.genre === genre);
    if (artist) list = list.filter((s) => s.artist === artist);
    if (year) list = list.filter((s) => String(s.year) === String(year));

    switch (sort) {
      case "title-asc":
        list.sort((a, b) => a.title.localeCompare(b.title, "fr"));
        break;
      case "title-desc":
        list.sort((a, b) => b.title.localeCompare(a.title, "fr"));
        break;
      case "artist-asc":
        list.sort((a, b) => a.artist.localeCompare(b.artist, "fr"));
        break;
      case "artist-desc":
        list.sort((a, b) => b.artist.localeCompare(a.artist, "fr"));
        break;
      case "year-asc":
        list.sort((a, b) => a.year - b.year);
        break;
      case "year-desc":
        list.sort((a, b) => b.year - a.year);
        break;
      case "words-asc":
        list.sort((a, b) => a.words - b.words);
        break;
      case "words-desc":
        list.sort((a, b) => b.words - a.words);
        break;
    }
    return list;
  }

  function renderGrid() {
    const data = getFilteredSorted();
    els.grid.innerHTML = "";

    if (data.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ls-empty";
      empty.textContent = "Aucun résultat.";
      els.grid.appendChild(empty);
      return;
    }

    data.forEach((s) => {
      const card = document.createElement("button");
      card.className = "ls-card";
      card.type = "button";
      card.onclick = () => navigateToLyricsGame(s.id);

      const cover = document.createElement("img");
      cover.className = "ls-cover";
      cover.src = s.cover || "images/covers/placeholder.jpg";
      cover.alt = s.title;

      const mid = document.createElement("div");
      mid.className = "ls-mid";
      const title = document.createElement("div");
      title.className = "ls-title";
      title.textContent = s.title;
      const sub = document.createElement("div");
      sub.className = "ls-sub";
      sub.textContent = `${s.artist} • ${s.genre || "—"} • ${s.year || "—"}`;
      mid.appendChild(title);
      mid.appendChild(sub);

      const right = document.createElement("div");
      right.className = "ls-right";
      right.innerHTML = `<span class="ls-chip">${s.words} mots</span>`;

      card.appendChild(cover);
      card.appendChild(mid);
      card.appendChild(right);

      els.grid.appendChild(card);
    });
  }

  function navigateToLyricsGame(songId) {
    document.getElementById("lyrics-select").style.display = "none";
    document.getElementById("lyrics-game").style.display = "block";
    if (typeof window.loadLyricsSongById === "function") {
      window.loadLyricsSongById(songId);
    }
  }

  function wire() {
    els.search.addEventListener("input", renderGrid);
    els.genre.addEventListener("change", renderGrid);
    els.artist.addEventListener("change", renderGrid);
    els.year.addEventListener("change", renderGrid);
    els.sort.addEventListener("change", renderGrid);

    initFilters();
    renderGrid();
  }

  (function observeView() {
    const root = els.root;
    if (!root) return;
    let wired = false;
    const obs = new MutationObserver(() => {
      const visible = root.style.display !== "none";
      if (visible && !wired) {
        wire();
        wired = true;
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ["style"] });
  })();

  window.renderLyricsSelection = function () {
    initFilters();
    renderGrid();
  };
})();

/* ==========================================================
   PAGE JEU + FEUX D’ARTIFICES
========================================================== */
(function gameModule() {
  const $ = (q) => document.querySelector(q);

  const boardEl = () => $("#lyrics-board");
  const progressEl = () => $("#lyrics-progress");
  const guessInput = () => $("#lyrics-guess");

function safeFocus(el) {
  if (!el || document.activeElement === el) return; // ⬅️ évite un refocus inutile (et le scroll)
  try {
    el.focus({ preventScroll: true });
  } catch (_) {
    /* anciens navigateurs */
  }
}


  let st = {
    raw: "",
    tokens: [],
    isWord: [],
    revealed: [],
    map: new Map(),
    totalWords: 0,
    foundWords: 0,
    title: "",
    artist: "",
    finishedCelebrated: false,
    wasAbandoned: false, // 👈 nouveau
  };

  function normalizeTextLyrics(str) {
    return normalizeLyricsWord(str);
  }

  // Révèle tous les mots de la chanson
function revealAllLyrics() {
  if (st.wasAbandoned) return;    // 👈 ignore les clics suivants
  st.wasAbandoned = true;
  st.finishedCelebrated = true;
  for (let i = 0; i < st.revealed.length; i++) {
    if (st.isWord[i]) st.revealed[i] = true;
  }
  updateProgress();
  renderBoard();
}


  // Animation de défaite (overlay + shake)
  function showDefeatAnimation() {
    if (document.getElementById("lyrics-defeat-overlay")) return; // 👈 déjà affiché
    const overlay = document.createElement("div");
    overlay.id = "lyrics-defeat-overlay";
    overlay.innerHTML = `
    <div class="ld-center">
      <div class="ld-icon">💔</div>
      <div class="ld-title">Dommage !</div>
      <div class="ld-sub">Tu peux réessayer ou changer de chanson.</div>
    </div>
  `;
    document.body.appendChild(overlay);

    // Shake du plateau
    boardEl().classList.add("ld-shake");
    setTimeout(() => boardEl().classList.remove("ld-shake"), 700);

    // Disparition douce
    setTimeout(() => overlay.classList.add("out"), 1800);
    setTimeout(() => overlay.remove(), 2400);
  }

  function tokenizeWithPunctuation(text) {
    const clean = text.replace(/\r\n/g, "\n");
    const regex =
      /(\n)|([A-Za-zÀ-ÖØ-öø-ÿ0-9']+)|([^\sA-Za-zÀ-ÖØ-öø-ÿ0-9']+)|(\s+)/g;
    const tokens = [];
    let m;
    while ((m = regex.exec(clean)) !== null) {
      if (m[1]) tokens.push("\n");
      else if (m[2]) tokens.push(m[2]);
      else if (m[3]) tokens.push(m[3]);
      else if (m[4]) tokens.push(" ");
    }
    return tokens;
  }
  const isWordToken = (tok) => /^[A-Za-zÀ-ÖØ-öø-ÿ0-9']+$/.test(tok);

  function buildIndex() {
    st.map.clear();
    st.totalWords = 0;
    st.foundWords = 0;
    st.finishedCelebrated = false;
    st.wasAbandoned = false; // 👈

    st.tokens.forEach((tok, idx) => {
      const word = isWordToken(tok) ? normalizeTextLyrics(tok) : null;
      const w = !!word;
      st.isWord[idx] = w;

      if (w) {
        st.totalWords++;
        if (!st.map.has(word)) st.map.set(word, []);
        st.map.get(word).push(idx);
      } else {
        st.revealed[idx] = true; // ponctuation/espaces/sauts → révélés
      }
    });

    updateProgress();
  }

  function updateProgress() {
    const found = st.revealed.reduce(
      (acc, v, i) => acc + (v && st.isWord[i] ? 1 : 0),
      0
    );
    st.foundWords = found;
    progressEl().textContent = `${found}/${st.totalWords}`;

    // Fin de chanson => célébration
    if (
  st.totalWords > 0 &&
  found === st.totalWords &&
  !st.finishedCelebrated &&
  !st.wasAbandoned
) {
  st.finishedCelebrated = true;
  launchFireworks(2500);
}

  }

  function renderBoard() {
    const container = boardEl();
    container.innerHTML = "";

    st.tokens.forEach((tok, i) => {
      if (tok === "\n") {
        container.appendChild(document.createElement("br"));
        return;
      }

      const span = document.createElement("span");
      span.className = "lyrics-token";

      if (st.revealed[i]) {
        span.classList.add("revealed");
        span.textContent = tok;
      } else if (st.isWord[i]) {
        const visibleLen = tok.replace(/'/g, "").length;
        span.classList.add("hidden");
        span.textContent = "_".repeat(Math.max(1, visibleLen));
        span.title = `${visibleLen} lettre(s)`;
        span.dataset.nword = normalizeTextLyrics(tok); // 👈 ajout
      } else {
        span.textContent = tok;
      }

      container.appendChild(span);
    });
  }

  function setError(msg) {
    let fb = document.getElementById("lyrics-feedback");
    if (!fb) {
      fb = document.createElement("div");
      fb.id = "lyrics-feedback";
      fb.className = "lyrics-feedback hidden";
      const inputRow = document.querySelector(".lyrics-input");
      inputRow?.parentNode?.insertBefore(fb, inputRow.nextSibling);
    }
    if (!msg) {
      fb.textContent = "";
      fb.classList.add("hidden");
    } else {
      fb.textContent = msg;
      fb.classList.remove("hidden");
    }
  }

  function revealWordNormalized(nWord) {
    const indices = st.map.get(nWord);
    if (!indices) return 0;
    let newly = 0;
    for (const i of indices) {
      if (!st.revealed[i]) {
        st.revealed[i] = true;
        newly++;
      }
    }
    return newly;
  }

  function processGuessLive() {
    const input = guessInput();
    const raw = input.value;

    if (!raw) {
      setError("");
      return;
    }

    const endsWithBoundary = /\s$/.test(raw);
    const normalizedAll = normalizeTextLyrics(raw).split(/\s+/).filter(Boolean);
    if (normalizedAll.length === 0) {
      setError("");
      return;
    }

    let gained = 0;
    for (const nWord of normalizedAll) {
      gained += revealWordNormalized(nWord);
    }

      if (gained > 0) {
    updateProgress();
    renderBoard();
    input.value = ""; // ✅ clear pour enchaîner
    setError("");
    // (pas de focus ici)
  } else {
    if (endsWithBoundary) {
      setError("Mot incorrect");
      input.value = "";
      // (pas de focus ici)
    } else {
      setError("");
    }
  }

  }

function onSubmitGuess(e) {
  if (e) e.preventDefault();

  const input = guessInput();
  if (!input.value.trim()) return;
  input.value += " ";
  processGuessLive();
}

  function loadSongById(id) {
    const song = window.LYRICS_SONGS.find((s) => s.id === id);
    if (!song) return;
    initWithLyrics(song.lyrics, song.title, song.artist);
  }

  function loadCustomSong() {
    const txt = document.getElementById("lyrics-custom-text").value.trim();
    const title = document.getElementById("lyrics-custom-title").value.trim();
    const artist = document.getElementById("lyrics-custom-artist").value.trim();
    if (!txt) return;
    initWithLyrics(txt, title || "Paroles perso", artist || "");
  }

  function initWithLyrics(raw, optTitle, optArtist) {
    st.raw = raw;
    st.tokens = tokenizeWithPunctuation(raw);
    st.isWord = new Array(st.tokens.length).fill(false);
    st.revealed = new Array(st.tokens.length).fill(false);
    st.title = optTitle || "";
    st.artist = optArtist || "";
    st.finishedCelebrated = false;

    buildIndex();
    renderBoard();

    const t = st.title || "Paroles personnalisées";
    const a = st.artist || "—";
    guessInput().placeholder = `Tape un mot… (${t}${
      a !== "—" ? " — " + a : ""
    })`;
safeFocus(guessInput());
    setError("");

     // 👉 Mise à jour affichage sous le titre
    const infoEl = document.getElementById("lyrics-song-info");
    if (infoEl) {
      infoEl.textContent = st.title
        ? `${st.title}${st.artist ? " — " + st.artist : ""}`
        : "";
    }

    // ✅ Réactivation du bouton "Abandonner" à chaque nouvelle partie
    const sb = document.getElementById("lyrics-submit");
    if (sb) {
      sb.disabled = false;
      sb.classList.remove("disabled");
      sb.textContent = "Abandonner";
    }
  }


  function backToSelection() {
    // Affiche la page sélection, cache le jeu
    document.getElementById("lyrics-game").style.display = "none";
    document.getElementById("lyrics-select").style.display = "block";
    // Rafraîchit éventuellement la grille si on a modifié le catalogue
    if (window.renderLyricsSelection) window.renderLyricsSelection();
  }

  function wireGameUI() {
    const submitBtn = document.getElementById("lyrics-submit");
    const clearBtn = document.getElementById("lyrics-clear");
    const loadCus = document.getElementById("lyrics-load-custom");
    const backSel = document.getElementById("lyrics-back-select");

    // 👉 Le bouton devient "Abandonner"
    if (submitBtn) {
      submitBtn.textContent = "Abandonner";
      submitBtn.classList.add("btn-danger");
     submitBtn.onclick = (e) => {
  e.preventDefault();
  revealAllLyrics();
  showDefeatAnimation();
  submitBtn.disabled = true;                 // 👈 désactive
  submitBtn.classList.add("disabled");       // (optionnel pour le style)
};

    }

    // Entrée ne doit plus soumettre (on garde la révélation live)
    guessInput().addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.preventDefault();
    });

    // Révélation instantanée pendant la frappe (déjà présent chez toi)
    guessInput().addEventListener("input", processGuessLive);

 clearBtn?.addEventListener("click", () => {
  guessInput().value = "";
  setError("");
});



    loadCus?.addEventListener("click", loadCustomSong);
    backSel?.addEventListener("click", backToSelection);

    // Indice : clic sur un mot caché => révèle ce mot + toutes ses occurrences
    boardEl().addEventListener("click", (e) => {
      const t = e.target;
      if (
        !t.classList.contains("lyrics-token") ||
        !t.classList.contains("hidden")
      )
        return;

      const nWord = t.dataset.nword;
      if (!nWord) return;

      const gained = revealWordNormalized(nWord);
      if (gained > 0) {
        updateProgress();
        renderBoard();
        setError("");
      }
    });
  }

  (function observeView() {
    const root = document.getElementById("lyrics-game");
    if (!root) return;
    let wired = false;
    const obs = new MutationObserver(() => {
      const visible = root.style.display !== "none";
      if (visible && !wired) {
        wireGameUI();
        wired = true;
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ["style"] });
  })();

  // Expose pour la sélection
  window.loadLyricsSongById = loadSongById;

  /* ------------------ FEUX D’ARTIFICES ------------------ */
  function launchFireworks(durationMs = 2500) {
    // Canvas plein écran
    const canvas = document.createElement("canvas");
    canvas.id = "lyrics-fireworks-canvas";
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let W,
      H,
      start = performance.now();
    const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Particules
    const particles = [];
    function burst(x, y) {
      const n = 60 + Math.floor(Math.random() * 30);
      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        const speed = 2 + Math.random() * 4;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 60 + Math.random() * 30,
          color: `hsl(${Math.floor(Math.random() * 360)}, 85%, 60%)`,
          size: 2 + Math.random() * 2,
        });
      }
    }

    // Lancer des salves aléatoires
    function randomBurst() {
      const x = Math.random() * W * 0.8 + W * 0.1;
      const y = Math.random() * H * 0.5 + H * 0.1;
      burst(x, y);
    }

    // Pré-charge quelques salves
    for (let i = 0; i < 3; i++) randomBurst();

    let lastT = start;
    function tick(t) {
      const elapsed = t - start;
      const dt = Math.min(33, t - lastT); // ~30fps cap
      lastT = t;

      // Clear
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.clearRect(0, 0, W, H);

      // Update/draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt / 16;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03; // gravité légère
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        if (p.life >= p.maxLife) particles.splice(i, 1);
      }
      ctx.globalAlpha = 1;

      // Lancer de nouvelles salves pendant la durée
      if (elapsed < durationMs) {
        if (Math.random() < 0.08) randomBurst();
        requestAnimationFrame(tick);
      } else if (particles.length > 0) {
        requestAnimationFrame(tick);
      } else {
        // Fin
        window.removeEventListener("resize", resize);
        canvas.remove();
      }
    }
    requestAnimationFrame(tick);
  }
})();

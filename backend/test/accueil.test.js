const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function corpsAccueil() {
  const debut = html.indexOf('<section data-vue="accueil"');
  assert.notEqual(debut, -1, "section accueil introuvable");
  const fin = html.indexOf('<section data-vue="profil"', debut);
  let corps = html.slice(debut, fin === -1 ? undefined : fin);
  corps = corps.replace(/<header[\s\S]*?<\/header>/g, "").replace(/<footer[\s\S]*?<\/footer>/g, "");
  const v404 = corps.indexOf('data-vue="404"');
  return v404 === -1 ? corps : corps.slice(0, v404);
}

test("accueil : exactement 5 liens #/ distincts dans le corps, sans a/button imbriqué dans un bandeau", () => {
  const corps = corpsAccueil();
  const tous = [...corps.matchAll(/<a\b[^>]*\bhref=(["'])#\/([^"']*)\1/g)].map((m) => m[2]);
  // Le seul lien hors jeu autorisé dans le corps : « Voir ma fiche complète » (#/profil) de la fiche joueur.
  assert.ok(tous.filter((h) => h === "profil").length <= 1, "plus d'un lien vers #/profil dans le corps");
  const hrefs = tous.filter((h) => h !== "profil");
  assert.equal(hrefs.length, 5, `liens de jeu trouvés : ${hrefs.length} (${hrefs.join(", ")})`);
  assert.equal(new Set(hrefs).size, 5, "les 5 liens doivent être distincts");
  for (const m of corps.matchAll(/<a\b[^>]*\bclass="[^"]*\bbandeau\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
    assert.doesNotMatch(m[1], /<(a|button)\b/, "a/button imbriqué dans un .bandeau");
  }
});

function fichiers(cible) {
  const abs = path.join(ROOT, cible);
  if (fs.statSync(abs).isFile()) return [abs];
  return fs.readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath ?? e.path, e.name));
}

// router.js est exclu du grep : il contient légitimement la regex de redirection des anciennes
// adresses (/nouveautes), qui n'est pas un texte affiché. Plus d'astuce `nouveau[t]es` dans la regex.
test("aucune occurrence de « nouveaut » dans index.html, javascript/, styles/", () => {
  const trouves = [];
  for (const cible of ["index.html", "javascript", "styles"]) {
    for (const f of fichiers(cible)) {
      if (path.basename(f) === "router.js") continue;
      const n = (fs.readFileSync(f, "utf8").match(/nouveaut/gi) || []).length;
      if (n) trouves.push(`${path.relative(ROOT, f)} (${n})`);
    }
  }
  assert.deepEqual(trouves, []);
});

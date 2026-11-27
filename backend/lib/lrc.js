const { clean } = require("./util");

const MAX_LINES = 500;
const MAX_TEXT = 200;
const MERGE_MS = 1000;
const MAX_T_MS = 3600 * 1000; // comme la durée d'une chanson : au plus 1 h

// Paroles synchronisées (LRC) -> [{ t (ms), text }] triées, horaires strictement croissants.
// Une ligne à moins d'1 s de la ligne gardée est fusionnée avec elle, une seule fois (syllabes isolées, doublons) ;
// contrairement au solo (parseLRC), la fusion ne s'enchaîne pas sur tout un couplet rapide.
// Une ligne à plusieurs horaires ([00:12.00][00:45.00]refrain) est rangée à chacun d'eux.
function parseLrc(text) {
  if (typeof text !== "string") return [];
  const raw = [];
  for (const row of text.split(/\r?\n/)) {
    const stamps = [];
    let rest = row;
    let m;
    while ((m = /^\s*\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/.exec(rest)) !== null) {
      const sec = Number.parseFloat(m[2].replace(":", "."));
      stamps.push(Math.round((Number.parseInt(m[1], 10) * 60 + sec) * 1000));
      rest = rest.slice(m[0].length);
    }
    if (!stamps.length) continue;
    const line = clean(rest.replace(/<\d+:\d+(?:\.\d+)?>/g, "").replace(/\s+/g, " "), MAX_TEXT);
    if (!line) continue;
    for (const t of stamps) if (Number.isFinite(t) && t <= MAX_T_MS) raw.push({ t, text: line });
  }
  raw.sort((a, b) => a.t - b.t);

  // Fusion bornée : on compare à la ligne gardée (pas à la précédente brute), un couplet rapide ne devient pas une seule ligne.
  const out = [];
  for (const l of raw) {
    const last = out[out.length - 1];
    const fits = last && (last.text + " " + l.text).length <= MAX_TEXT;
    if (last && l.t <= last.t) {
      // Même horaire qu'une ligne gardée : jamais deux lignes au même instant (l'une serait invisible)
      if (fits) last.text = last.text + " " + l.text;
    } else if (last && l.t - last.t < MERGE_MS && fits && !last.merged) {
      last.text = last.text + " " + l.text;
      last.merged = true;
    } else {
      out.push({ t: l.t, text: l.text });
    }
    if (out.length >= MAX_LINES) break;
  }
  return out.map(({ t, text }) => ({ t, text }));
}

module.exports = { parseLrc, MAX_LINES, MAX_TEXT };

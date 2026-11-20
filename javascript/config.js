// Config partagée : adresse du serveur Socket.io / API.
// En local (localhost / 127.0.0.1 / fichier ouvert directement) on vise le backend local,
// sinon le backend de production. Pour changer l'adresse de prod, modifier GRAN_PROD_BACKEND.
const GRAN_PROD_BACKEND = 'https://granjow.onrender.com';
const GRAN_BACKEND = (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:')
  ? 'http://localhost:3000'
  : GRAN_PROD_BACKEND;

// Supabase : URL et clé publishable (publiques par conception, protégées par la RLS).
const GRAN_SUPABASE_URL = 'https://khlunomnidzgjisujioh.supabase.co';
const GRAN_SUPABASE_KEY = 'sb_publishable_Ot_88UeXFmI2b53oP1UChw_lMeWm5Q_';

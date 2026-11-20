// Config partagée : adresse du serveur Socket.io / API.
// En local (localhost / 127.0.0.1 / fichier ouvert directement) on vise le backend local,
// sinon le backend de production. Pour changer l'adresse de prod, modifier GRAN_PROD_BACKEND.
const GRAN_PROD_BACKEND = 'https://granjow.onrender.com';
const GRAN_BACKEND = (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:')
  ? 'http://localhost:3000'
  : GRAN_PROD_BACKEND;

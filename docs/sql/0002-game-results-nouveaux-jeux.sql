-- Migration 0002 : autoriser tous les jeux du registre (javascript/jeux.js) dans public.game_results.
-- APPLIQUÉE le 2026-11-26 sur le projet Supabase (migration 0002_game_results_nouveaux_jeux).
-- Tant qu'elle n'est pas appliquée, la contrainte game_results_game_check rejette gribouille, petit-bac,
-- mot-cache, echo, potager et frappe : l'insertion échoue, backend/lib/results.js logue l'erreur
-- (console.error "game_results : ...") et la partie n'est jamais bloquée (insertion sans attente, erreurs capturées).
-- Quand on ajoute un jeu : l'ajouter ici (nouvelle migration), dans GAMES de results.js et dans GRAN_JEUX.

alter table public.game_results drop constraint game_results_game_check;
alter table public.game_results add constraint game_results_game_check
  check (game = any (array['imposteur','gribouille','petit-bac','karaoke','lyrics','mot-cache','echo','potager','frappe']));

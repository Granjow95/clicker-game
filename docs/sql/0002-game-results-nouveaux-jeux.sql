-- Migration 0002 : autoriser gribouille et petit-bac dans public.game_results.
-- NON APPLIQUÉE : à exécuter manuellement (éditeur SQL Supabase) par le propriétaire du projet.
-- Tant qu'elle n'est pas appliquée, la contrainte game_results_game_check rejette ces deux jeux :
-- l'insertion échoue, backend/lib/results.js logue l'erreur (console.error "game_results : ...")
-- et la partie n'est jamais bloquée (insertion sans attente, erreurs capturées).

alter table public.game_results drop constraint game_results_game_check;
alter table public.game_results add constraint game_results_game_check
  check (game = any (array['imposteur','lyrics','karaoke','gribouille','petit-bac']));

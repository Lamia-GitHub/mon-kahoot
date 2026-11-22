# Mon Kahoot — règles du projet

Application web de quiz en temps réel (type Kahoot) : un hôte lance une partie, les joueurs rejoignent avec un code PIN et répondent en direct.

## Stack technique (à respecter à chaque étape)

- **React + Vite + TypeScript** (mode strict). Pas de JavaScript pur, pas d'autre framework.
- **Tailwind CSS v4** via le plugin `@tailwindcss/vite` (import `@import "tailwindcss";` dans `src/index.css`, pas de `tailwind.config.js` sauf besoin réel).
- **Supabase** (`@supabase/supabase-js`) pour la base de données ET le temps réel (Realtime : `postgres_changes`, broadcast, presence). Pas d'autre backend.
- **lucide-react** pour les icônes.
- **Hébergement statique uniquement** : `npm run build` produit `dist/` déployable tel quel (Netlify, Vercel static, GitHub Pages…).
  - Aucun code serveur, aucune route API, pas de SSR.
  - Toute la logique s'exécute côté client avec la clé `anon` de Supabase ; la sécurité passe par les politiques RLS dans `schema.sql`.
  - Si un routeur est ajouté, utiliser `HashRouter` (ou équivalent) pour éviter les 404 sur un hébergeur statique.
  - `vite.config.ts` utilise `base: './'` pour fonctionner dans un sous-dossier.

## Configuration

- Variables d'environnement dans `.env.local` (non versionné), modèle dans `.env.example` :
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_ADMIN_PIN` — code de l'espace animateur (créer / lancer / supprimer un quiz), demandé une fois par onglet (sessionStorage, `src/lib/adminAuth.ts`). Les joueurs n'ont jamais de code à saisir. C'est un garde-fou côté client, pas une vraie sécurité : la valeur est visible dans le bundle.
- Client Supabase unique : `src/lib/supabase.ts`. Types de la base : `src/types/database.ts`.

## Base de données

- Le schéma de référence est `schema.sql` (à exécuter dans le SQL Editor de Supabase) : il décrit toujours l'état complet et à jour.
- Une base déjà créée se met à jour avec les fichiers de `migrations/` (numérotés, à exécuter dans l'ordre, ré-exécutables). Toute évolution du SQL va dans `schema.sql` ET dans une nouvelle migration.
- L'heure de début d'une question (`question_started_at`) est fixée par un trigger côté Supabase : le client ne l'envoie jamais.
- Un quiz (création comme modification) s'enregistre uniquement via la fonction `save_quiz` (RPC, une seule transaction) : elle gère titre, ajout / modification / suppression / ordre des questions, et refuse la modification d'un quiz dont une partie est en cours.
- Historique : une question qui a déjà reçu des réponses n'est jamais supprimée ni réécrite ; `save_quiz` l'archive (`archived_at` renseigné, `position` vide) et crée une nouvelle version si son contenu change. Toute requête sur les questions « actuelles » d'un quiz (jeu, éditeur, compteurs) doit filtrer `archived_at is null` ; les statistiques (`src/lib/stats.ts`) lisent aussi les versions archivées.
- Scripts de modification de fichiers : ne jamais utiliser `String.replace` avec un texte de remplacement contenant `$` (SQL `$$`) — utiliser `split/join` ou des tranches.
- Tables : `quizzes`, `questions`, `game_sessions` (code PIN), `players`, `answers`.
- Realtime activé sur `game_sessions`, `players`, `answers`.
- Toute modification du schéma doit être reportée dans `schema.sql` ET dans `src/types/database.ts`.

## Commandes

- `npm install` — installer les dépendances
- `npm run dev` — serveur de développement
- `npm run build` — vérification TypeScript + build statique dans `dist/`
- `npm run preview` — prévisualiser le build

## Conventions

- Composants React fonctionnels + hooks, un composant par fichier dans `src/components/` ou `src/pages/`.
- Interface en français.

# Bot X-Ray, simulation papier en ligne

Ce dépôt fait tourner la stratégie de coinman2 / justdance (« prix comme une option ») **en argent fictif**, sur les serveurs de GitHub, toutes les 10 minutes environ, même PC éteint.

- **Résultats :** `RESULTATS.md`, mis à jour à chaque passage.
- **Marchés simulés :** options IBIT/ETHA (cotations CBOE gratuites, 15 min de retard) et marchés Bitcoin/Ether de Kalshi. Réglage : `papier/strategy/config.json`.
- **Règles :** acheter le côté que le modèle juge au moins 3 ¢ trop bon marché après frais, prix entre 20 et 95 ¢, garder jusqu'à l'échéance, 25 $ fictifs par trade, 500 $ au plus en jeu.
- **Aucun ordre réel :** aucune clé de courtier ici, et l'activation ne peut se faire que dans un terminal, à la main.
- **Lancer un passage à la main :** onglet Actions → « Simulation papier » → Run workflow.

Code d'origine : Bot X-Ray (part-timequant.com, licence MIT), plus `scripts/scan-once.js` et `.github/workflows/papier.yml`. Les résultats passés ne promettent rien.

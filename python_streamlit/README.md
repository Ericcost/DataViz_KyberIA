# Volley Analytics — prototype Streamlit

## Lancement

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Structure

- `data.py` — données mock du match (événements, postes, joueurs, rallys)
- `court.py` — construction de la figure Plotly du terrain (deux camps, flux, taille
  des postes proportionnelle au volume d'événements)
- `sankey.py` — deux Sankey :
  - `build_rally_sankey` : séquence d'un rally précis (service → réception → ... → issue)
  - `build_aggregated_sankey` : flux agrégé sur tout le match (utile vue coach)
- `app.py` — assemble tout, avec :
  - sidebar : choix du public (Joueur / Entraîneur) + axe d'analyse (4 modes)
  - vue Joueur : metric cards personnelles en premier, terrain pré-filtré sur le joueur
  - vue Entraîneur : efficacité par poste en premier, accès libre aux 4 axes

## Prochaines étapes suggérées

- Remplacer `data.py` par un chargement depuis un fichier CSV/JSON ou une base de
  données réelle (le format des dicts dans `EVENTS` peut servir de schéma cible).
- Ajouter `streamlit-plotly-events` pour rendre les postes du terrain cliquables
  directement (actuellement la sélection de poste passe par un `selectbox`).
- Ajouter une timeline (slider) pour filtrer par set / par tranche de score.

"""Sunburst à 2 niveaux : catégorie d'événement (couche 1) puis sous-catégorie (couche 2).

Quand `focus_category` est fourni, le sunburst se recentre entièrement sur cette
catégorie : le centre devient la catégorie elle-même avec SON PROPRE total
(et non plus le total global), et la couronne ne montre plus que ses
sous-catégories. Cliquer sur le centre (id="root") permet de revenir à la vue
complète côté app.py.
"""

import plotly.graph_objects as go
from data import CATS, SUBCATEGORIES

_CAT_LABEL_FR = {
    "Service": "Service", "Reception": "Réception", "Passe": "Passe",
    "Attaque": "Attaque", "Block": "Block", "Defense": "Défense",
}


def build_event_sunburst(events, focus_category=None):
    ids, labels, parents, values, colors = [], [], [], [], []

    if focus_category:
        focus_events = [e for e in events if e["category"] == focus_category]
        total = len(focus_events)
        ids.append("root")
        labels.append(_CAT_LABEL_FR.get(focus_category, focus_category))
        parents.append("")
        values.append(total)
        colors.append(CATS[focus_category]["color"])

        by_sub = {}
        for e in focus_events:
            sub = e.get("subcategory") or "Non précisé"
            by_sub.setdefault(sub, []).append(e)
        for sub, sub_evs in by_sub.items():
            ids.append(f"sub::{focus_category}::{sub}")
            labels.append(sub)
            parents.append("root")
            values.append(len(sub_evs))
            colors.append(CATS[focus_category]["color"])
    else:
        total = len(events)
        ids.append("root")
        labels.append("Tous")
        parents.append("")
        values.append(total)
        colors.append("#E5E1D8")

        by_cat = {}
        for e in events:
            by_cat.setdefault(e["category"], []).append(e)

        for cat, evs in by_cat.items():
            cat_id = f"cat::{cat}"
            ids.append(cat_id)
            labels.append(_CAT_LABEL_FR.get(cat, cat))
            parents.append("root")
            values.append(len(evs))
            colors.append(CATS[cat]["color"])

            if cat in SUBCATEGORIES:
                by_sub = {}
                for e in evs:
                    sub = e.get("subcategory") or "Non précisé"
                    by_sub.setdefault(sub, []).append(e)
                for sub, sub_evs in by_sub.items():
                    ids.append(f"sub::{cat}::{sub}")
                    labels.append(sub)
                    parents.append(cat_id)
                    values.append(len(sub_evs))
                    colors.append(CATS[cat]["color"])

    fig = go.Figure(go.Sunburst(
        ids=ids, labels=labels, parents=parents, values=values,
        marker=dict(colors=colors, line=dict(color="white", width=1)),
        branchvalues="total",
        hovertemplate="<b>%{label}</b><br>%{value} événement(s)<extra></extra>",
    ))
    fig.update_layout(
        height=420, margin=dict(l=10, r=10, t=10, b=10),
        annotations=[dict(
            text=f"<b>{total}</b><br><span style='font-size:11px'>événements</span>",
            x=0.5, y=0.5, xref="paper", yref="paper",
            showarrow=False, font=dict(size=22, color="black"),
        )],
    )
    return fig

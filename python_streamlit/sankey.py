"""Sankey du flux du match — reconstruit de zéro.

Logique :
- chaque rally est entièrement reconstitué depuis `all_events` (jamais depuis une
  liste déjà filtrée), pour que le calcul du déroulé et du vainqueur du point
  reste toujours exact, même quand on ne veut représenter qu'une partie du match
- chaque catégorie est numérotée par "touche" dans l'échange (1ère touche après
  un service ou une attaque adverse, 2e touche = la passe, 3e touche = l'attaque ;
  si le point continue, l'échange suivant reprend la numérotation à 4, 5, 6...)
  ce qui donne un graphe en couches, sans boucle
- le graphe se termine TOUJOURS sur l'un des deux seuls nœuds finaux :
  "Point gagné" / "Point perdu"
"""

import plotly.graph_objects as go
from data import CATS

_LABEL_FR = {
    "Service": "Service", "Reception": "Réception", "Passe": "Passe",
    "Attaque": "Attaque", "Block": "Block", "Defense": "Défense",
}

WON_COLOR = "#5C8A2E"
LOST_COLOR = "#C24B3F"


def _rgba(hex_color, alpha):
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return f"rgba({r},{g},{b},{alpha})"


def _full_rallies(scoped_events, all_events):
    """Reconstitue chaque rally concerné par `scoped_events`, intégralement,
    à partir de `all_events`."""
    rally_ids = {e["rally"] for e in scoped_events}
    rallies = {}
    for e in all_events:
        if e["rally"] in rally_ids:
            rallies.setdefault(e["rally"], []).append(e)
    for rally_events in rallies.values():
        rally_events.sort(key=lambda e: e["seq"])
    return rallies


def _exchange_numbers(rally_events):
    """Associe à chaque événement son numéro d'échange : le service est à part
    (échange 0) ; pour le reste, l'échange n correspond à tout ce qui se passe
    entre la (n-1)e et la ne attaque. Block et Défense d'un même échange portent
    donc le même numéro, qu'il y ait eu un bloc ou non sur ce point — c'est ce
    qui garde les colonnes du graphe alignées entre les deux cas de figure."""
    exch = {}
    attacks_seen = 0
    for e in rally_events:
        if e["category"] == "Service":
            exch[e["seq"]] = 0
        else:
            exch[e["seq"]] = attacks_seen + 1
            if e["category"] == "Attaque":
                attacks_seen += 1
    return exch


def _rally_winner(rally_events):
    last = rally_events[-1]
    if last["result"] == "ok":
        return last["origin_side"]
    return "opponent" if last["origin_side"] == "own" else "own"


def build_focused_sankey(category, all_events):
    """Sankey focalisé sur une seule catégorie (Service, Attaque ou Block) : montre
    uniquement les résultats obtenus suite À CE TYPE D'ÉVÉNEMENT précisément, pas
    le déroulé complet du rally.

    Pour chaque occurrence de la catégorie (côté nous), deux cas :
    - c'est le DERNIER événement du rally -> résultat direct (point gagné si "ok",
      point perdu si "ko" — un service/une attaque/un bloc fautif fait perdre le
      point à l'instant même)
    - le rally continue après -> nœud "Continue", puis on rattache l'issue finale
      du rally (qui peut être gagnée ou perdue plus tard, indépendamment de cette
      action précise)
    """
    rallies = {}
    for e in all_events:
        rallies.setdefault(e["rally"], []).append(e)
    for r in rallies.values():
        r.sort(key=lambda e: e["seq"])

    root_label = _LABEL_FR.get(category, category)
    labels = [root_label, "Continue", "Point gagné", "Point perdu"]
    colors = [CATS[category]["color"], "#8A8A8A", WON_COLOR, LOST_COLOR]
    ROOT, CONTINUE, WON, LOST = 0, 1, 2, 3

    edge_counts = {(ROOT, WON): 0, (ROOT, LOST): 0, (ROOT, CONTINUE): 0,
                   (CONTINUE, WON): 0, (CONTINUE, LOST): 0}
    occurrences = 0

    for rally_events in rallies.values():
        for e in rally_events:
            if e["category"] != category or e["origin_side"] != "own":
                continue
            occurrences += 1
            if e is rally_events[-1]:
                edge_counts[(ROOT, WON if e["result"] == "ok" else LOST)] += 1
            else:
                edge_counts[(ROOT, CONTINUE)] += 1
                winner = _rally_winner(rally_events)
                edge_counts[(CONTINUE, WON if winner == "own" else LOST)] += 1

    if occurrences == 0:
        return None

    sources, targets, values, link_colors, link_hovers = [], [], [], [], []
    for (a, b), v in edge_counts.items():
        if v == 0:
            continue
        pct_of_total = round(v / occurrences * 100, 1)
        sources.append(a)
        targets.append(b)
        values.append(v)
        link_colors.append(_rgba(colors[a] if a != CONTINUE else "#8A8A8A", 0.45))
        link_hovers.append(f"{labels[a]} → {labels[b]}<br>{v} cas — {pct_of_total}% des occurrences")

    fig = go.Figure(go.Sankey(
        arrangement="snap",
        node=dict(
            label=labels, color=colors, pad=24, thickness=18,
            line=dict(color="white", width=1),
            hovertemplate="<b>%{label}</b><br>%{value} cas<extra></extra>",
        ),
        link=dict(
            source=sources, target=targets, value=values, color=link_colors,
            customdata=link_hovers, hovertemplate="%{customdata}<extra></extra>",
        ),
    ))
    fig.update_layout(height=320, margin=dict(l=10, r=10, t=10, b=10), font=dict(size=12))
    return fig


def build_aggregated_sankey(scoped_events, all_events):
    """Sankey du flux agrégé du match, basé sur un jeu d'événements filtré."""
    rallies = _full_rallies(scoped_events, all_events)
    if not rallies:
        return None

    total_rallies = len(rallies)

    # 1) lister les nœuds réellement utilisés : (catégorie, échange)
    node_keys = set()
    for rally_events in rallies.values():
        exch = _exchange_numbers(rally_events)
        for e in rally_events:
            node_keys.add((e["category"], exch[e["seq"]]))

    sorted_nodes = sorted(node_keys, key=lambda k: (k[1], k[0]))
    node_index = {k: i for i, k in enumerate(sorted_nodes)}

    node_labels = [_LABEL_FR.get(cat, cat) for cat, _ in sorted_nodes]
    node_colors = [CATS[cat]["color"] for cat, _ in sorted_nodes]

    won_id = len(sorted_nodes)
    lost_id = won_id + 1

    # 2) construire les arêtes à partir des transitions consécutives de chaque rally
    edge_counts = {}
    won_count = lost_count = 0
    for rally_events in rallies.values():
        exch = _exchange_numbers(rally_events)
        node_ids = [node_index[(e["category"], exch[e["seq"]])] for e in rally_events]
        for a, b in zip(node_ids, node_ids[1:]):
            edge_counts[(a, b)] = edge_counts.get((a, b), 0) + 1

        winner = _rally_winner(rally_events)
        final_node = won_id if winner == "own" else lost_id
        edge_counts[(node_ids[-1], final_node)] = edge_counts.get((node_ids[-1], final_node), 0) + 1
        if winner == "own":
            won_count += 1
        else:
            lost_count += 1

    won_pct = round(won_count / total_rallies * 100) if total_rallies else 0
    lost_pct = round(lost_count / total_rallies * 100) if total_rallies else 0
    node_labels += [f"Point gagné ({won_pct}%)", f"Point perdu ({lost_pct}%)"]
    node_colors += [WON_COLOR, LOST_COLOR]

    # chaque lien porte aussi le % qu'il représente sur le total des rallys
    # analysés (et pas seulement sa valeur brute) — utile pour repérer les
    # chemins les plus fréquents d'un coup d'œil
    sources, targets, values, link_colors, link_hovers = [], [], [], [], []
    for (a, b), v in edge_counts.items():
        pct_of_total = round(v / total_rallies * 100, 1) if total_rallies else 0
        sources.append(a)
        targets.append(b)
        values.append(v)
        link_colors.append(_rgba(node_colors[a], 0.4))
        link_hovers.append(
            f"{node_labels[a]} → {node_labels[b]}<br>"
            f"{v} rally(s) — {pct_of_total}% du total des rallys analysés"
        )

    fig = go.Figure(go.Sankey(
        arrangement="snap",
        node=dict(
            label=node_labels,
            color=node_colors,
            pad=28,
            thickness=20,
            line=dict(color="white", width=1),
            hovertemplate="<b>%{label}</b><br>%{value} événement(s)<extra></extra>",
        ),
        link=dict(
            source=sources, target=targets, value=values, color=link_colors,
            customdata=link_hovers,
            hovertemplate="%{customdata}<extra></extra>",
        ),
    ))
    fig.update_layout(height=700, margin=dict(l=10, r=10, t=10, b=10), font=dict(size=13))
    return fig

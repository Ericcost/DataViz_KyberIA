"""Évolution du score au fil de chaque set — un "scoreboard" en petits multiples.

Pour chaque set, on retrace le score cumulé (nous vs adverse) après chaque rally,
sous forme de courbe en escalier (chaque palier = un point marqué). Permet de voir
en un coup d'œil les moments de bascule, les écarts qui se creusent, ou les
retours dans un set.
"""

from plotly.subplots import make_subplots
import plotly.graph_objects as go
from data import SET_SCORES


def build_score_evolution(events, rallies):
    n_sets = len(SET_SCORES)
    titles = [f"Set {i+1} — {own}-{opp}" for i, (own, opp) in enumerate(SET_SCORES)]

    fig = make_subplots(rows=1, cols=n_sets, subplot_titles=titles,
                         horizontal_spacing=0.06)

    for set_no in range(1, n_sets + 1):
        rallies_set = [r for r in rallies if r.startswith(f"S{set_no}-")]
        own_cum, opp_cum = [0], [0]
        for r in rallies_set:
            rally_events = sorted([e for e in events if e["rally"] == r], key=lambda e: e["seq"])
            if not rally_events:
                # le rally peut être absent si `events` est déjà filtré : on
                # retombe sur le dernier score connu sans le faire évoluer
                own_cum.append(own_cum[-1])
                opp_cum.append(opp_cum[-1])
                continue
            last = rally_events[-1]
            winner = last["origin_side"] if last["result"] == "ok" else (
                "opponent" if last["origin_side"] == "own" else "own"
            )
            own_cum.append(own_cum[-1] + (1 if winner == "own" else 0))
            opp_cum.append(opp_cum[-1] + (1 if winner == "opponent" else 0))

        x = list(range(len(own_cum)))

        fig.add_trace(go.Scatter(
            x=x, y=own_cum, mode="lines", line_shape="hv",
            line=dict(color="#185FA5", width=2.5), name="Nous",
            showlegend=(set_no == 1),
            hovertemplate="Point %{x} — Nous : %{y}<extra></extra>",
        ), row=1, col=set_no)

        fig.add_trace(go.Scatter(
            x=x, y=opp_cum, mode="lines", line_shape="hv",
            line=dict(color="#B4441C", width=2.5, dash="dot"), name="Adverse",
            showlegend=(set_no == 1),
            hovertemplate="Point %{x} — Adverse : %{y}<extra></extra>",
        ), row=1, col=set_no)

        fig.update_xaxes(title_text="Point n°", row=1, col=set_no, title_font=dict(size=10))

    fig.update_yaxes(title_text="Score cumulé", row=1, col=1, title_font=dict(size=10))
    fig.update_layout(
        height=340, margin=dict(l=10, r=10, t=40, b=10),
        legend=dict(orientation="h", yanchor="bottom", y=1.08, xanchor="left", x=0),
    )
    return fig

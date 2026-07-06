"""Construction du terrain de volley (Plotly) avec flux d'événements.

Les événements reçus en entrée sont déjà filtrés en amont (par joueur, catégories
visibles, poste sélectionné...) — ce module n'a donc plus de logique de filtrage
interne, seulement de l'affichage.

Les 12 postes (6 nous + 6 adverses) sont TOUJOURS dessinés, même à volume nul,
pour rester cliquables : chaque marqueur porte un `customdata=[side, poste]`
récupérable côté Streamlit via `on_select` pour permettre le clic direct sur le
terrain (filtrage par poste géré dans app.py).
"""

import math
import plotly.graph_objects as go
from data import CATS, OWN, OPP, pos_xy


def _bezier_points(x0, y0, x1, y1, bend, n=24):
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy) or 1
    nx, ny = -dy / length, dx / length
    cx, cy = mx + nx * bend, my + ny * bend

    xs, ys = [], []
    for i in range(n + 1):
        t = i / n
        bx = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1
        by = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1
        xs.append(bx)
        ys.append(by)
    return xs, ys


def build_court_figure(events, mode="aggregated", selected_pos=None):
    fig = go.Figure()

    fig.add_shape(type="line", x0=0.5, x1=3.5, y0=3, y1=3, line=dict(color="grey", width=3))
    for y0, y1 in [(0.5, 2.5), (3.5, 5.5)]:
        fig.add_shape(type="rect", x0=0.5, x1=3.5, y0=y0, y1=y1, line=dict(color="lightgrey", width=1))
        fig.add_shape(type="line", x0=1.5, x1=1.5, y0=y0, y1=y1, line=dict(color="lightgrey", width=0.5))
        fig.add_shape(type="line", x0=2.5, x1=2.5, y0=y0, y1=y1, line=dict(color="lightgrey", width=0.5))
        fig.add_shape(type="line", x0=0.5, x1=3.5, y0=(y0 + y1) / 2, y1=(y0 + y1) / 2,
                      line=dict(color="lightgrey", width=0.5))

    volume = {}
    for e in events:
        volume[(e["origin_side"], e["origin"])] = volume.get((e["origin_side"], e["origin"]), 0) + 1
        volume[(e["dest_side"], e["destination"])] = volume.get((e["dest_side"], e["destination"]), 0) + 1
    max_vol = max(volume.values()) if volume else 1

    def radius(side, pos):
        v = volume.get((side, pos), 0)
        return 16 + math.sqrt(v / max_vol) * 24 if max_vol else 16

    BEND_UNIT = 0.16

    if mode == "rally":
        for e in sorted(events, key=lambda ev: ev["seq"]):
            x0, y0 = pos_xy(e["origin_side"], e["origin"])
            x1, y1 = pos_xy(e["dest_side"], e["destination"])
            bend = BEND_UNIT * 2.2 if e["origin"] <= e["destination"] else -BEND_UNIT * 2.2
            xs, ys = _bezier_points(x0, y0, x1, y1, bend)
            color = CATS[e["category"]]["color"]
            fig.add_trace(go.Scatter(
                x=xs, y=ys, mode="lines",
                line=dict(color=color, width=3, dash="dot" if e["result"] == "ko" else "solid"),
                hovertext=f"{e['seq']}. {e['category']} — {e['player']} — {e['result']}",
                hoverinfo="text", showlegend=False,
            ))
            fig.add_trace(go.Scatter(
                x=[xs[len(xs) // 2]], y=[ys[len(ys) // 2]], mode="markers+text",
                marker=dict(size=20, color="white", line=dict(color=color, width=2)),
                text=[str(e["seq"])], textfont=dict(size=11),
                showlegend=False, hoverinfo="skip",
            ))
    else:
        grouped = {}
        for e in events:
            key = (e["category"], e["origin"], e["origin_side"], e["destination"], e["dest_side"], e["result"])
            grouped[key] = grouped.get(key, 0) + 1

        pairs = {}
        for key in grouped:
            cat, o, o_side, d, d_side, result = key
            pairs.setdefault((o, o_side, d, d_side), []).append(key)

        max_count = max(grouped.values()) if grouped else 1

        for pair_key, keys in pairs.items():
            keys = sorted(keys, key=lambda k: (k[0], k[5]))
            n = len(keys)
            o, o_side, d, d_side = pair_key
            x0, y0 = pos_xy(o_side, o)
            x1, y1 = pos_xy(d_side, d)
            for idx, key in enumerate(keys):
                cat, _, _, _, _, result = key
                count = grouped[key]
                offset = (idx - (n - 1) / 2)
                bend = offset * BEND_UNIT if n > 1 else BEND_UNIT * 0.9
                if bend == 0:
                    bend = BEND_UNIT * 0.9
                xs, ys = _bezier_points(x0, y0, x1, y1, bend)

                width = 1.5 + math.sqrt(count / max_count) * 8.5
                opacity = 0.3 if result == "ko" else 0.85

                fig.add_trace(go.Scatter(
                    x=xs, y=ys, mode="lines",
                    line=dict(color=CATS[cat]["color"], width=width,
                              dash="dot" if result == "ko" else "solid"),
                    opacity=opacity,
                    hovertext=f"{cat} — poste {o} → poste {d} — {count} action(s) — {result}",
                    hoverinfo="text", showlegend=False,
                ))

    all_positions = [("own", p) for p in OWN] + [("opponent", p) for p in OPP]
    for side, p in all_positions:
        x, y = pos_xy(side, p)
        is_selected = selected_pos == (side, p)
        dimmed = selected_pos is not None and not is_selected
        fig.add_trace(go.Scatter(
            x=[x], y=[y], mode="markers+text",
            marker=dict(
                size=radius(side, p),
                color="#E6F1FB" if side == "own" else "#F1EFE8",
                line=dict(color="#185FA5" if is_selected else ("#378ADD" if side == "own" else "#B4B2A9"),
                          width=3 if is_selected else 1.5),
            ),
            opacity=0.35 if dimmed else 1,
            text=[str(p)], textposition="middle center",
            textfont=dict(size=16, color="#1a1a1a", family="Arial Black"),
            customdata=[[side, p]],
            hovertext=f"Poste {p} ({'nous' if side=='own' else 'adverse'}) — "
                      f"{volume.get((side, p), 0)} actions — cliquer pour filtrer",
            hoverinfo="text",
            showlegend=False,
        ))

    fig.update_xaxes(visible=False, range=[0.2, 3.8])
    fig.update_yaxes(visible=False, range=[0.2, 5.8])
    fig.update_layout(
        height=600, margin=dict(l=10, r=10, t=30, b=10),
        plot_bgcolor="white",
        clickmode="event+select",
        annotations=[
            dict(x=2, y=5.6, text="Terrain adverse", showarrow=False, font=dict(size=11, color="grey")),
            dict(x=2, y=0.35, text="Notre terrain", showarrow=False, font=dict(size=11, color="grey")),
        ],
    )
    return fig

"""Dashboard volley-ball — prototype Streamlit.

Lancer avec :  streamlit run app.py
"""

import streamlit as st
import pandas as pd

from data import EVENTS, RALLIES
from court import build_court_figure
from sankey import build_aggregated_sankey, build_focused_sankey
from sunburst import build_event_sunburst
from scoreboard import build_score_evolution
from stats import compute_match_stats

st.set_page_config(page_title="Volley Analytics", layout="wide")

# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
st.sidebar.title("Volley Analytics")
public = st.sidebar.radio("Vue", ["Joueur", "Entraîneur"], index=1, horizontal=True)

st.title("Mon match" if public == "Joueur" else "Volley Analytics")

# ---------------------------------------------------------------------------
# Sélection — tout en haut de page
# ---------------------------------------------------------------------------
st.subheader("Sélection")

own_players = sorted({e["player"] for e in EVENTS if e["origin_side"] == "own"})

sel_cols = st.columns([1, 1, 1.4])
with sel_cols[0]:
    axe = st.radio("Axe", ["Vue agrégée", "Par rally"])
with sel_cols[1]:
    scope = st.radio("Données", ["Toutes", "Nous uniquement", "Adverses uniquement"])
with sel_cols[2]:
    me = st.selectbox("Joueur", own_players, index=None,
                       placeholder="Aucun joueur sélectionné (toute l'équipe)")

if scope == "Nous uniquement":
    scope_events = [e for e in EVENTS if e["origin_side"] == "own"]
elif scope == "Adverses uniquement":
    scope_events = [e for e in EVENTS if e["origin_side"] == "opponent"]
else:
    scope_events = EVENTS

if public == "Joueur" and not me:
    st.info("👈 Sélectionne ton nom ci-dessus pour afficher tes statistiques "
            "et toutes les visualisations filtrées sur tes actions.")
    st.stop()

# ---------------------------------------------------------------------------
# Une seule sélection partagée par tout le dashboard : joueur (ci-dessus) +
# poste cliqué sur le terrain + catégorie cliquée sur le sunburst. Tout le
# reste (terrain, sunburst, sankey) lit ces 3 informations et rien d'autre.
#
# On ne réagit à une sélection de graphique que si elle diffère de la
# dernière qu'on a déjà traitée, pour ne pas la re-déclencher à chaque rerun
# causé par un AUTRE widget (comportement persistant de session_state avec
# st.plotly_chart(on_select=...)).
# ---------------------------------------------------------------------------
st.session_state.setdefault("selected_category", None)
st.session_state.setdefault("selected_position", None)
st.session_state.setdefault("_last_sunburst_click", None)
st.session_state.setdefault("_last_court_click", None)


def _read_selection(widget_key):
    state = st.session_state.get(widget_key)
    if not state:
        return None
    try:
        points = state["selection"]["points"]
    except (TypeError, KeyError):
        return None
    return points[0] if points else None


sunburst_point = _read_selection("sunburst_chart")
if sunburst_point is not None:
    sid = sunburst_point.get("id")
    if sid != st.session_state["_last_sunburst_click"]:
        st.session_state["_last_sunburst_click"] = sid
        if sid == "root":
            st.session_state["selected_category"] = None
        elif sid and sid.startswith("cat::"):
            st.session_state["selected_category"] = sid.split("::")[1]
        # un clic sur une sous-catégorie ("sub::...") ne change pas la sélection :
        # on reste centré sur la catégorie déjà choisie

court_point = _read_selection("court_chart")
if court_point is not None:
    cd = court_point.get("customdata")
    if isinstance(cd, (list, tuple)) and len(cd) == 2:
        click_id = tuple(cd)
        if click_id != st.session_state["_last_court_click"]:
            st.session_state["_last_court_click"] = click_id
            if st.session_state["selected_position"] == click_id:
                st.session_state["selected_position"] = None
            else:
                st.session_state["selected_position"] = click_id

selected_category = st.session_state["selected_category"]
selected_position = st.session_state["selected_position"]

# ---------------------------------------------------------------------------
# Construction du jeu d'événements filtré — LA source unique partagée par
# terrain, sunburst et sankey
# ---------------------------------------------------------------------------
filtered = scope_events
court_mode = "aggregated"

if axe == "Par rally":
    c1, c2 = st.columns(2)
    with c1:
        set_choice = st.selectbox("Set", sorted({e["set"] for e in EVENTS}))
    rallies_in_set = [r for r in RALLIES if r.startswith(f"S{set_choice}-")]
    with c2:
        rally_choice = st.selectbox("Rally", rallies_in_set)
    filtered = [e for e in EVENTS if e["rally"] == rally_choice]
    if scope == "Nous uniquement":
        filtered = [e for e in filtered if e["origin_side"] == "own"]
    elif scope == "Adverses uniquement":
        filtered = [e for e in filtered if e["origin_side"] == "opponent"]
    court_mode = "rally"
else:
    if me:
        filtered = [e for e in filtered if e["player"] == me]
    if selected_position:
        sp_side, sp_pos = selected_position
        filtered = [e for e in filtered if
                    (e["origin"] == sp_pos and e["origin_side"] == sp_side) or
                    (e["destination"] == sp_pos and e["dest_side"] == sp_side)]
    if selected_category:
        filtered = [e for e in filtered if e["category"] == selected_category]
    court_mode = "aggregated"

active_filters = []
if me:
    active_filters.append(f"joueur **{me}**")
if selected_position:
    side, num = selected_position
    active_filters.append(f"poste **{num}** ({'nous' if side == 'own' else 'adverse'})")
if selected_category:
    active_filters.append(f"catégorie **{selected_category}**")
if active_filters:
    st.caption("🔎 Sélection active — " + " · ".join(active_filters) +
               f" → **{len(filtered)}** événement(s)")

st.divider()

# ---------------------------------------------------------------------------
# Vue JOUEUR : KPIs personnels
# ---------------------------------------------------------------------------
if public == "Joueur":
    my_events = [e for e in EVENTS if e["player"] == me]
    st.markdown(f"#### {me}")

    def pct(cat):
        evs = [e for e in my_events if e["category"] == cat]
        if not evs:
            return None
        ok = sum(1 for e in evs if e["result"] == "ok")
        return round(ok / len(evs) * 100)

    points = sum(1 for e in my_events if e["result"] == "ok" and e["category"] in ("Attaque", "Service", "Block"))

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Points marqués", points)
    c2.metric("% réception", f"{pct('Reception')}%" if pct("Reception") is not None else "—")
    c3.metric("% passe", f"{pct('Passe')}%" if pct("Passe") is not None else "—")
    c4.metric("% attaque", f"{pct('Attaque')}%" if pct("Attaque") is not None else "—")
    c5.metric("% défense", f"{pct('Defense')}%" if pct("Defense") is not None else "—")
    st.divider()

# ---------------------------------------------------------------------------
# Vue ENTRAÎNEUR : KPIs collectifs
# ---------------------------------------------------------------------------
else:
    s = compute_match_stats(EVENTS)

    cols = st.columns(5)
    cols[0].metric("Efficacité attaque", f"{s['atk_efficiency']}%",
                    f"{s['kills']} kills / {s['attempts_atk']} tentatives ({s['errors_atk']} fautes)")
    cols[1].metric("Service", f"{s['aces']} aces",
                    f"{s['srv_error_pct']}% d'erreurs sur {s['attempts_srv']} services")
    cols[2].metric("Réception propre", f"{s['recept_pct']}%",
                    f"{s['recept_propre']} / {s['recept_total']} réceptions")
    cols[3].metric("Block", f"{s['blocks_pct']}% favorables",
                    f"{s['blocks_total']} touches, dont {s['block_kills']} contres gagnants "
                    f"et {s['block_faults']} fautes")
    cols[4].metric("Side-out / Break", f"{s['side_out_pct']}% — {s['break_pct']}%",
                    f"side-out {s['side_out_won']}/{s['side_out_total']} · "
                    f"break {s['break_won']}/{s['break_total']}")
    st.divider()

st.subheader("Flux global du match (Sankey)")
st.caption("Reste fixe quels que soient les filtres de sélection : repère global sur tout le match. "
           "Survolez un flux pour voir son volume et sa part du total des rallys.")
sankey_fig = build_aggregated_sankey(EVENTS, EVENTS)
if sankey_fig:
    st.plotly_chart(sankey_fig, use_container_width=True)

st.markdown("**Focus par type d'événement** — ce qui se passe immédiatement après chacune de ces actions précisément "
            "(pas le reste du déroulé du rally).")
focus_cols = st.columns(3)
for col, cat in zip(focus_cols, ["Service", "Attaque", "Block"]):
    with col:
        st.caption(cat)
        focus_fig = build_focused_sankey(cat, EVENTS)
        if focus_fig:
            st.plotly_chart(focus_fig, use_container_width=True)
        else:
            st.caption("Aucune occurrence.")

st.divider()

st.subheader("Évolution du score par set")
st.caption("Score cumulé point par point sur l'ensemble du match (non filtré par la sélection).")
st.plotly_chart(build_score_evolution(EVENTS, RALLIES), use_container_width=True)

st.divider()

# ---------------------------------------------------------------------------
# Détail (sunburst) et Terrain — tous deux pilotés par `filtered`. Le Sankey
# (vue globale, plus bas) reste volontairement fixe sur tout le match.
# ---------------------------------------------------------------------------
left, right = st.columns([3, 2])

with right:
    st.subheader("Détail")
    if axe == "Par rally":
        st.caption("Les clics (catégories, poste) ne s'appliquent pas en mode « Par rally » : "
                   "ce mode montre toujours la séquence complète du rally choisi.")
    else:
        st.caption("Cliquez sur une catégorie pour zoomer dessus, cliquez au centre pour revenir à la vue complète.")
    sb_fig = build_event_sunburst(filtered, focus_category=selected_category if axe != "Par rally" else None)
    st.plotly_chart(sb_fig, use_container_width=True, on_select="rerun", key="sunburst_chart")

    if axe != "Par rally":
        blocks = [e for e in filtered if e["category"] == "Block"]
        if blocks:
            st.markdown("**Détail des blocks**")
            for b in blocks[:10]:
                st.write(f"- {b['player']} — bloc à {b['blockers']} (postes {b['blocker_pos']}) "
                         f"— {'Touche favorable' if b['result']=='ok' else 'Raté'}")
            if len(blocks) > 10:
                st.caption(f"… et {len(blocks) - 10} de plus.")

        if filtered:
            st.markdown("**Détail par catégorie**")
            df = pd.DataFrame(filtered)
            summary = df.groupby("category").agg(
                actions=("result", "count"),
                reussite=("result", lambda s: round((s == "ok").mean() * 100)),
            ).reset_index()
            st.dataframe(summary, use_container_width=True, hide_index=True)

with left:
    st.subheader("Terrain")
    if axe != "Par rally":
        st.caption("Cliquez sur un poste pour ne voir que ses événements (clic à nouveau pour annuler). "
                   "Épaisseur des flèches ∝ √ du volume, toutes les liaisons sont courbées.")
    fig = build_court_figure(filtered, mode=court_mode, selected_pos=selected_position)
    if axe != "Par rally":
        st.plotly_chart(fig, use_container_width=True, on_select="rerun", key="court_chart")
    else:
        st.plotly_chart(fig, use_container_width=True)

"""Données du match — générées procéduralement à une échelle représentative.

Match simulé : 4 sets, scores 25-18 / 26-24 / 21-25 / 25-16 (victoire 3-1),
soit 43 + 50 + 46 + 41 = 180 rallys au total (1 rally = 1 point marqué, conformément
à la règle du point par échange en volley-ball moderne).

Règles métier respectées par le générateur :
- chaque rally démarre systématiquement par un Service
- chaque rally se termine sur un point, pour nous ou pour l'adversaire
- un Block ne peut survenir qu'après une Attaque adverse (origin_side="opponent")
- un Block peut terminer le rally directement (contre gagnant ou faute de contre),
  ou n'être qu'une touche qui prolonge l'échange (auquel cas il est suivi d'une
  Defense, puis d'une Passe et d'une contre-attaque)

Simplifications assumées (à affiner si on branche de vraies données) :
- la rotation de notre équipe est continue sur tout le match (pas de réinitialisation
  stricte par set)
- les joueurs adverses ne sont pas nommés individuellement (label générique "Adv.<poste>"),
  car on ne scoute pas leur effectif au même niveau de détail que le nôtre
- pas de changement de côté de terrain entre les sets (simplification d'affichage :
  "notre terrain" reste toujours en bas du schéma)
"""

import random

CATS = {
    "Service":   {"color": "#185FA5"},
    "Reception": {"color": "#534AB7"},
    "Passe":     {"color": "#993556"},
    "Attaque":   {"color": "#D85A30"},
    "Block":     {"color": "#993C1D"},
    "Defense":   {"color": "#0F6E56"},
}

SUBCATEGORIES = {
    "Service":   ["Flottant", "Sauté", "Cuillère"],
    "Reception": ["Propre", "Transformée"],
    "Passe":     ["Poste 2", "Hors zone 2", "Second ballon"],
    "Attaque":   ["2-1", "3-6", "4"],
    "Block":     ["Simple", "Double", "Triple"],
    "Defense":   ["Defense", "Assist", "Diving", "Freeball"],
}

OWN = {4: (1, 2), 3: (2, 2), 2: (3, 2), 5: (1, 1), 6: (2, 1), 1: (3, 1)}
OPP = {2: (1, 4), 3: (2, 4), 4: (3, 4), 1: (1, 5), 6: (2, 5), 5: (3, 5)}

ROSTER = ["Alexandre", "Olivier", "Margot", "Antoine", "Kheir-Eddine", "Pierre", "Mateo"]
# 7 joueurs pour 6 postes : la rotation tourne sur l'ensemble du roster (mod len(ROSTER)),
# ce qui fait naturellement passer chacun par plusieurs postes au fil du match, comme
# avec un remplaçant qui prend la place d'un titulaire à tour de rôle.

SET_SCORES = [(25, 18), (26, 24), (21, 25), (25, 16)]  # (nous, adverse) par set


def pos_xy(side: str, pos: int):
    return OWN[pos] if side == "own" else OPP[pos]


def _player_at(rotation: int, position: int) -> str:
    """Joueur occupant un poste donné, selon l'index de rotation courant."""
    return ROSTER[(position - 1 + rotation) % len(ROSTER)]


def _weighted(choices_weights):
    choices, weights = zip(*choices_weights)
    return random.choices(choices, weights=weights, k=1)[0]


def _block_detail():
    sub = _weighted([("Double", 55), ("Simple", 35), ("Triple", 10)])
    blockers = {"Simple": 1, "Double": 2, "Triple": 3}[sub]
    return sub, blockers


def _set_point_sequence(own_pts: int, opp_pts: int) -> list:
    """Construit une séquence de vainqueurs de rally dont les totaux correspondent
    exactement au score final donné, en garantissant que le tout dernier rally
    revient bien à l'équipe gagnante du set."""
    winner = "own" if own_pts > opp_pts else "opponent"
    tokens = ["own"] * own_pts + ["opponent"] * opp_pts
    random.shuffle(tokens)
    if tokens[-1] != winner:
        last_winner_idx = max(i for i, t in enumerate(tokens) if t == winner)
        tokens[-1], tokens[last_winner_idx] = tokens[last_winner_idx], tokens[-1]
    return tokens


def _other(team: str) -> str:
    return "opponent" if team == "own" else "own"


def _player_label(team: str, position: int, rotation: int) -> str:
    if team == "own":
        return _player_at(rotation, position)
    return f"Adv.{position}"


def _make_service(server: str, rotation: int, result: str):
    sub = _weighted([("Flottant", 50), ("Sauté", 35), ("Cuillère", 15)])
    dest = _weighted([(1, 30), (5, 35), (6, 35)])
    return dict(category="Service", subcategory=sub, player=_player_label(server, 1, rotation),
                origin=1, origin_side=server, destination=dest, dest_side=_other(server), result=result)


def _make_reception(receiver: str, rotation: int, at_pos: int):
    sub = _weighted([("Propre", 70), ("Transformée", 30)])
    return dict(category="Reception", subcategory=sub, player=_player_label(receiver, at_pos, rotation),
                origin=at_pos, origin_side=receiver, destination=2, dest_side=receiver, result="ok")


def _make_passe(team: str, rotation: int, dest_pos: int):
    sub = _weighted([("Poste 2", 75), ("Second ballon", 15), ("Hors zone 2", 10)])
    return dict(category="Passe", subcategory=sub, player=_player_label(team, 2, rotation),
                origin=2, origin_side=team, destination=dest_pos, dest_side=team, result="ok")


_ATTACK_SUB_BY_POS = {4: "4", 3: "3-6", 2: "2-1"}


def _make_attaque(team: str, rotation: int, origin_pos: int, result: str, opponent_team: str):
    sub = _ATTACK_SUB_BY_POS.get(origin_pos) if team == "own" else None
    target = random.choice([1, 5, 6, 2, 3, 4])
    return dict(category="Attaque", subcategory=sub, player=_player_label(team, origin_pos, rotation),
                origin=origin_pos, origin_side=team, destination=target, dest_side=opponent_team, result=result)


def _make_block(blocking_team: str, rotation: int, at_pos: int, result: str, opponent_team: str):
    sub, blockers = _block_detail()
    blocker_pos = at_pos if blockers == 1 else (
        f"{at_pos}-{min(at_pos + 1, 4) if at_pos < 4 else max(at_pos - 1, 2)}" if blockers == 2
        else "2-3-4"
    )
    return dict(category="Block", subcategory=sub, player=_player_label(blocking_team, at_pos, rotation),
                blockers=blockers, blocker_pos=blocker_pos,
                origin=at_pos, origin_side=blocking_team, destination=at_pos, dest_side=opponent_team,
                result=result)


def _make_defense(team: str, rotation: int, at_pos: int, sub: str):
    return dict(category="Defense", subcategory=sub, player=_player_label(team, at_pos, rotation),
                origin=at_pos, origin_side=team, destination=2, dest_side=team, result="ok")


def _simulate_rally(server: str, own_rotation: int) -> list:
    """Construit la séquence d'événements d'un rally complet. Le vainqueur réel du
    point découle naturellement de la simulation (pas imposé)."""
    receiver = _other(server)
    events = []
    style = _weighted([("ace", 12), ("error", 10), ("kill_or_fault", 38),
                        ("dig_counter", 22), ("block_counter", 18)])

    if style == "ace":
        events.append(_make_service(server, own_rotation, "ok"))
        return events, server
    if style == "error":
        events.append(_make_service(server, own_rotation, "ko"))
        return events, receiver

    events.append(_make_service(server, own_rotation, "ok"))
    recv_pos = events[0]["destination"] if events[0]["dest_side"] == receiver else random.choice([1, 5, 6])
    events.append(_make_reception(receiver, own_rotation, recv_pos))

    attack_pos = random.choice([4, 3, 2])
    events.append(_make_passe(receiver, own_rotation, attack_pos))

    if style == "kill_or_fault":
        result = _weighted([("ok", 60), ("ko", 40)])
        events.append(_make_attaque(receiver, own_rotation, attack_pos, result, server))
        winner = receiver if result == "ok" else server
        return events, winner

    # styles avec prolongation : l'attaque initiale passe toujours ("ok"),
    # elle est ensuite défendue (avec ou sans block) puis contre-attaquée
    events.append(_make_attaque(receiver, own_rotation, attack_pos, "ok", server))
    defending_team = server

    if style == "block_counter":
        block_pos = attack_pos
        block_outcome = _weighted([
            ("kill", 30),            # contre gagnant : point immédiat pour nous
            ("fault", 20),           # faute de contre (filet, hors zone...) : point immédiat adverse
            ("touch_continue", 35),  # simple touche, balle récupérable -> défense puis contre-attaque
            ("miss_continue", 15),   # contre passé, balle encore défendable -> défense puis contre-attaque
        ])

        if block_outcome == "kill":
            events.append(_make_block(defending_team, own_rotation, block_pos, "ok", receiver))
            return events, defending_team
        if block_outcome == "fault":
            events.append(_make_block(defending_team, own_rotation, block_pos, "ko", receiver))
            return events, receiver

        block_result = "ok" if block_outcome == "touch_continue" else "ko"
        events.append(_make_block(defending_team, own_rotation, block_pos, block_result, receiver))
        defense_sub = "Assist"
        defense_pos = block_pos
    else:  # dig_counter
        defense_pos = random.choice([5, 6, 1])
        defense_sub = _weighted([("Diving", 55), ("Freeball", 25), ("Defense", 20)])

    events.append(_make_defense(defending_team, own_rotation, defense_pos, defense_sub))

    counter_pos = random.choice([4, 3, 2])
    events.append(_make_passe(defending_team, own_rotation, counter_pos))

    final_result = _weighted([("ok", 55), ("ko", 45)])
    events.append(_make_attaque(defending_team, own_rotation, counter_pos, final_result, receiver))
    winner = defending_team if final_result == "ok" else receiver
    return events, winner


def _generate_events(seed: int = 7) -> list:
    random.seed(seed)
    events = []
    rally_counter = 0
    server = "own"
    own_rotation = 0

    for set_no, (own_pts, opp_pts) in enumerate(SET_SCORES, start=1):
        planned_winners = iter(_set_point_sequence(own_pts, opp_pts))
        own_score, opp_score = 0, 0

        while own_score < own_pts or opp_score < opp_pts:
            target_winner = next(planned_winners)
            # on retente la simulation tant que le vainqueur naturel ne correspond pas
            # à la séquence planifiée pour le set (garantit le score exact final)
            for _ in range(50):
                rally_events, natural_winner = _simulate_rally(server, own_rotation)
                if natural_winner == target_winner:
                    break
            else:
                rally_events[-1]["result"] = "ok" if rally_events[-1]["origin_side"] == target_winner else "ko"
                natural_winner = target_winner

            rally_counter += 1
            rally_id = f"S{set_no}-R{rally_counter}"
            for i, e in enumerate(rally_events, start=1):
                e["rally"] = rally_id
                e["seq"] = i
                e["set"] = set_no
            events.extend(rally_events)

            if natural_winner == "own":
                own_score += 1
            else:
                opp_score += 1

            if natural_winner != server:
                server = natural_winner
                if server == "own":
                    own_rotation = (own_rotation + 1) % len(ROSTER)

    return events


EVENTS = _generate_events()
PLAYERS = sorted({e["player"] for e in EVENTS if e["origin_side"] == "own"})
RALLIES = sorted({e["rally"] for e in EVENTS}, key=lambda r: (int(r.split("-")[0][1:]), int(r.split("R")[1])))

"""Statistiques globales du match — calculées sur l'ensemble des rallys reconstitués
en entier (jamais sur une liste déjà filtrée, pour les mêmes raisons que pour le
Sankey : sinon le calcul du vainqueur de chaque point devient faux)."""


def _rally_winner(rally_events):
    last = rally_events[-1]
    if last["result"] == "ok":
        return last["origin_side"]
    return "opponent" if last["origin_side"] == "own" else "own"


def compute_match_stats(all_events):
    rallies = {}
    for e in all_events:
        rallies.setdefault(e["rally"], []).append(e)
    for r in rallies.values():
        r.sort(key=lambda e: e["seq"])

    kills = errors_atk = attempts_atk = 0
    aces = errors_srv = attempts_srv = 0
    blocks_total = blocks_ok = block_kills = block_faults = 0
    recept_total = recept_propre = 0

    side_out_won = side_out_total = 0
    break_won = break_total = 0

    for rally_events in rallies.values():
        winner = _rally_winner(rally_events)
        server_side = rally_events[0]["origin_side"]

        if server_side == "own":
            break_total += 1
            if winner == "own":
                break_won += 1
        else:
            side_out_total += 1
            if winner == "own":
                side_out_won += 1

        for e in rally_events:
            if e["category"] == "Attaque" and e["origin_side"] == "own":
                attempts_atk += 1
                if e["result"] == "ko":
                    errors_atk += 1
                elif e is rally_events[-1] and winner == "own":
                    kills += 1
            elif e["category"] == "Service" and e["origin_side"] == "own":
                attempts_srv += 1
                if e["result"] == "ko":
                    errors_srv += 1
                elif len(rally_events) == 1:
                    aces += 1
            elif e["category"] == "Block" and e["origin_side"] == "own":
                blocks_total += 1
                if e["result"] == "ok":
                    blocks_ok += 1
                if e is rally_events[-1]:
                    if e["result"] == "ok" and winner == "own":
                        block_kills += 1
                    elif e["result"] == "ko" and winner == "opponent":
                        block_faults += 1
            elif e["category"] == "Reception" and e["origin_side"] == "own":
                recept_total += 1
                if e.get("subcategory") == "Propre":
                    recept_propre += 1

    def pct(n, d):
        return round(n / d * 100) if d else 0

    return {
        "kills": kills, "errors_atk": errors_atk, "attempts_atk": attempts_atk,
        "atk_efficiency": pct(kills, attempts_atk),
        "aces": aces, "errors_srv": errors_srv, "attempts_srv": attempts_srv,
        "srv_error_pct": pct(errors_srv, attempts_srv),
        "recept_propre": recept_propre, "recept_total": recept_total,
        "recept_pct": pct(recept_propre, recept_total),
        "blocks_total": blocks_total, "blocks_ok": blocks_ok,
        "blocks_pct": pct(blocks_ok, blocks_total),
        "block_kills": block_kills, "block_faults": block_faults,
        "side_out_won": side_out_won, "side_out_total": side_out_total,
        "side_out_pct": pct(side_out_won, side_out_total),
        "break_won": break_won, "break_total": break_total,
        "break_pct": pct(break_won, break_total),
    }

# Test Manager v3.28.0: finder stillinger (point/mål efter runden + rundens 4 kampe), hvor HVER delpost i "tabellen uden sidste runde" (home: homeData i app.js) flytter min plads.
# Resultatet står som SC i tests/e2e/run.mjs (Hjem ↑/↓). Kør: python3 tools/tm-f1-scenarier.py
import random, json, itertools
# team 0 = mig. kamp 0: (0 hjemme, 1 ude) – resten parres 2-3, 4-5, 6-7. Alle (P, GF, GA) er EFTER runden.
def prev_of(now, matches, mut):
    prev = [list(x) for x in now]   # P, GF, GA
    for (h, a, hg, ag) in matches:
        A, B = prev[h], prev[a]
        if mut != 'hGF': A[1] -= hg
        if mut != 'hGA': A[2] -= ag
        if mut != 'aGF': B[1] -= ag
        if mut != 'aGA': B[2] -= hg
        if mut != 'hP': A[0] -= 3 if hg > ag else (0 if mut == 'hDraw0' else 1) if hg == ag else 0
        if mut != 'aP': B[0] -= 3 if ag > hg else (0 if mut == 'aDraw0' else 1) if hg == ag else 0
    return prev
def rank(rows, idx, nosort=False):
    order = list(range(len(rows))) if nosort else sorted(range(len(rows)), key=lambda i: (-rows[i][0], -(rows[i][1] - rows[i][2]), -rows[i][1], i))
    return order.index(idx) + 1
MUTS = ['hGF', 'hGA', 'aGF', 'aGA', 'hP', 'aP', 'hDraw0', 'aDraw0', 'nosort', 'sign']
def move(now, matches, mut=None):
    prev = prev_of(now, matches, mut)
    mp = rank(now, 0)
    pr = rank(prev, 0, nosort=(mut == 'nosort'))
    d = pr - mp
    return -d if mut == 'sign' else d
def keys_distinct(rows):
    k = [(r[0], r[1] - r[2], r[1]) for r in rows]
    return len(set(k)) == len(k)
def search(seed, want):
    rnd = random.Random(seed); found = []; covered = set()
    for _ in range(400000):
        now = [[rnd.randint(8, 14), rnd.randint(8, 14), rnd.randint(5, 12)] for _ in range(8)]
        if not keys_distinct(now): continue
        matches = [(0, 1, rnd.randint(0, 3), rnd.randint(0, 3)), (2, 3, rnd.randint(0, 3), rnd.randint(0, 3)), (4, 5, rnd.randint(0, 3), rnd.randint(0, 3)), (6, 7, rnd.randint(0, 3), rnd.randint(0, 3))]
        # i "nu" skal GF/GA/P efter runden være ≥ rundens bidrag (ellers negative før-værdier)
        prev = prev_of(now, matches, None)
        if any(min(r) < 0 for r in prev): continue
        base = move(now, matches)
        kills = {m for m in MUTS if move(now, matches, m) != base}
        if kills - covered:
            covered |= kills; found.append((now, matches, base, sorted(kills)))
        if covered >= set(want): break
    return found, covered
if __name__ == '__main__':
    f, c = search(1, MUTS)
    print(json.dumps(f)); print(sorted(c), set(MUTS) - c)

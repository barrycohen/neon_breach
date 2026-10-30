#!/usr/bin/env python3
"""Validate every level before it reaches the game.

Four classes of bug:

  seams       a metre-wide void between two floors of the same height. Too
              small to read as a jump, wide enough to fall through.
  isolation   a goal, key, weapon or checkpoint no route reaches.
  gating      the route ignoring locks says a level is fine, but the amber key
              sits behind the amber door. This walks the level the way a player
              does: flood what is reachable now, pick up whatever is in reach,
              open what that unlocks, flood again, until nothing new opens.
  dead locks  a door that starts closed and no trigger or node ever opens.

Movement limits come from the physics harness, not from guesswork:
single jump 9.5m, double 17.7m, double + dash 37.7m.

Run: python3 tools/check-levels.py [--report]
"""
import math, json, glob, sys
from collections import deque

CELL      = 0.5     # sample grid for seams
GCELL     = 1.0     # coarser grid for the reachability graph
STEP_UP   = 0.75    # what the player walks up (STEP in world.js)
JUMP_1    = 9.5     # measured in the engine
JUMP_2    = 17.7
JUMP_DASH = 37.7
MAX_RISE  = 5.5     # under the 5.89m a jump actually gains

# Reach collapses as the landing rises, and small platforms give no run-up.
# Measured in the engine, not assumed: a 7m gap with a 3m rise already needs a
# double jump, while 29m with a 6m drop is a dash. Not every gap is the
# flat-ground 37.7m.
def reach_for(rise):
    if rise <= 0.0:  return JUMP_DASH
    if rise <= 2.0:  return 20.0
    if rise <= 3.5:  return 13.0
    return 9.0
# Tether. TETHER_RANGE matches weapons.js; LAND_R is how far from an anchor the
# reel can put you - it drops you within ARRIVE of the hook with a small pop, so
# anything walkable just under it is fair game. Deliberately tighter than the
# engine allows: a level should not depend on the sloppiest possible arrival.
TETHER_RANGE = 34.0
LAND_R       = 5.0
LAND_DROP    = 9.0    # and you can fall this far from the hook onto a deck
EYE          = 1.62
BOOST_UP  = 7.8    # double jump + one scatter self-boost, measured
SEAM_MAX  = 2.5

def surfaces(level, movers=True):
    """Standing surfaces. A level that marks its floors with "walk" is taken at
    its word - height alone cannot tell a raised platform from a door lintel."""
    geo = [g for g in level.get('geometry', []) if isinstance(g, dict) and 'p' in g]
    tagged = any(g.get('walk') for g in geo)
    out = []
    for g in geo:
        # what rides a platform is only to look at; a falling piece counts where it starts
        if g.get('on') or g.get('nocol'): continue
        x, y, z = g['p']; w, h, d = g['s']
        if tagged:
            if not g.get('walk'): continue
        elif y >= 9 or h > 1.6:
            continue
        out.append((x - w/2, x + w/2, z - d/2, z + d/2, y + h))
    # A moving platform is walkable at both ends of its travel. The flood links
    # the two, because riding it is not a jump the reach rules should have to
    # explain away.
    for m in (level.get('movers', []) if movers else ()):
        # a crane stood in for by ghosts, and a ghost not yet switched on, are not here
        if m.get('ghosts') or m.get('ghost'): continue
        # A glass roof slid over a room (3-3's Armoury, once it is won) would
        # hide the room's floor under it on a grid of one height per cell. It is
        # never the way on, so it is left out: the room below is what is checked.
        if m.get('glass'): continue
        # ...nor is one there only at the very end, over the route (3-3's crown
        # floor and the eye's platforms, over the Well): the Well is what's checked
        if m.get('over'): continue
        w, h, d = m['s']
        ends = [m['p'], m['to']]
        # One height per cell: where the two ends stack (a lift, a core let down
        # from the roof), keep the end it travels to. The other is reached from
        # the landing round it, which the flood links on its own; keeping the
        # higher one always hid the floor the Bastion room's core comes down to.
        if abs(m['p'][0]-m['to'][0]) < w and abs(m['p'][2]-m['to'][2]) < d:
            ends = [m['to']]
        for pt in ends:
            out.append((pt[0]-w/2, pt[0]+w/2, pt[2]-d/2, pt[2]+d/2, pt[1]+h))
    return out

def wall_boxes(level):
    out = []
    for g in level.get('geometry', []):
        if not isinstance(g, dict) or 'p' not in g: continue
        if g.get('on') or g.get('nocol') or g.get('fall'): continue
        x, y, z = g['p']; w, h, d = g['s']
        if h < 1.7: continue
        out.append((x - w/2, x + w/2, y, y + h, z - d/2, z + d/2))
    return out

def door_box(d):
    x, y, z = d['p']; w, h, dd = d['s']
    return (x - w/2, x + w/2, y, y + h, z - dd/2, z + dd/2)

def top_at(surf, x, z):
    best = None
    for x0, x1, z0, z1, t in surf:
        if x0 <= x <= x1 and z0 <= z <= z1 and (best is None or t > best):
            best = t
    return best

class Grid:
    """Floor heights plus a per-cell list of blocker height spans."""
    def __init__(self, surf, x0, z0, nx, nz, cell):
        self.x0, self.z0, self.nx, self.nz, self.cell = x0, z0, nx, nz, cell
        self.top = [[top_at(surf, x0 + i*cell, z0 + j*cell) for j in range(nz)]
                    for i in range(nx)]
        self.blk = [[[] for _ in range(nz)] for _ in range(nx)]
        self.ceil = [[[] for _ in range(nz)] for _ in range(nx)]
    def set_ceilings(self, boxes):
        """The undersides of everything not walked on, per cell: a jump that comes
        down from above cannot land under one. Without it the flood dropped from
        3-1's west gallery through the Furnace's roof and into a squad's closet."""
        for bx0, bx1, by0, by1, bz0, bz1 in boxes:
            i0 = max(0, int((bx0 - self.x0)/self.cell) + 1); i1 = min(self.nx-1, int((bx1 - self.x0)/self.cell))
            j0 = max(0, int((bz0 - self.z0)/self.cell) + 1); j1 = min(self.nz-1, int((bz1 - self.z0)/self.cell))
            for i in range(i0, i1+1):
                for j in range(j0, j1+1): self.ceil[i][j].append(by0)
    def roofed(self, i, j, t, top):
        """Is there a roof over this cell between head height and `top`?"""
        return any(t + 1.9 < c < top for c in self.ceil[i][j])
    def add_blockers(self, boxes):
        for i in range(self.nx):
            for j in range(self.nz): self.blk[i][j] = []
        for bx0, bx1, by0, by1, bz0, bz1 in boxes:
            i0 = max(0, int((bx0 - self.x0)/self.cell)); i1 = min(self.nx-1, int((bx1 - self.x0)/self.cell) + 1)
            j0 = max(0, int((bz0 - self.z0)/self.cell)); j1 = min(self.nz-1, int((bz1 - self.z0)/self.cell) + 1)
            for i in range(i0, i1+1):
                for j in range(j0, j1+1): self.blk[i][j].append((by0, by1))
    def solid(self, i, j, y):
        if not (0 <= i < self.nx and 0 <= j < self.nz): return True
        for y0, y1 in self.blk[i][j]:
            if y0 <= y <= y1: return True
        return False
    def cell_of(self, p):
        return (min(self.nx-1, max(0, int(round((p[0]-self.x0)/self.cell)))),
                min(self.nz-1, max(0, int(round((p[2]-self.z0)/self.cell)))))

def flood(g, start, jump=JUMP_DASH, anchors=(), movers=(), boost=False):
    """Cells reachable from start.

    Walking is the eight-neighbour step-up rule. Jumps go in any direction, not
    along the axes: a staggered climb is the normal shape of a movement puzzle,
    and axis-only scanning calls it unreachable. Only ledge cells are scanned
    for jumps - you cannot launch from the middle of a floor - which keeps the
    candidate set small enough to test exhaustively.

    `anchors` are tether points, and are passed empty until the player is
    holding the tether - otherwise the flood proves a route through a shaft the
    player reaches before the gun that crosses it.

    `movers` are platforms: standing on one end gets you to the other, so the
    two footprints are linked rather than reasoned about as a jump.
    """
    seen = [[False]*g.nz for _ in range(g.nx)]
    si, sj = start
    if g.top[si][sj] is None:
        found = False
        for r in range(1, 6):
            for di in range(-r, r+1):
                for dj in range(-r, r+1):
                    a, b = si+di, sj+dj
                    if 0 <= a < g.nx and 0 <= b < g.nz and g.top[a][b] is not None:
                        si, sj, found = a, b, True; break
                if found: break
            if found: break
        if not found: return seen
    walk = [(i, j) for i in range(g.nx) for j in range(g.nz) if g.top[i][j] is not None]
    B = 8
    buckets = {}
    for i, j in walk: buckets.setdefault((i//B, j//B), []).append((i, j))
    reach = jump / g.cell

    def ledge(i, j):
        # within two cells of a height break, not only right on it: the cell
        # hard against a tall step is inside its collision margin, so the jump
        # has to be tried from the one before it too
        for di in (-2, -1, 0, 1, 2):
            for dj in (-2, -1, 0, 1, 2):
                a, b = i+di, j+dj
                if not (0 <= a < g.nx and 0 <= b < g.nz): return True
                # a launch point is any height break, up or down - jumping onto
                # a plinth from flat ground is as normal as jumping off a ledge
                if g.top[a][b] is None or abs(g.top[i][j] - g.top[a][b]) > STEP_UP: return True
        return False

    # anchors, and the walkable cells each one can put you on. Precomputed:
    # the landing set never changes, only whether the anchor has been reached.
    def flight_clear(p0, p1):
        dx, dy, dz = p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]
        d = (dx*dx + dy*dy + dz*dz) ** 0.5
        n = int(d/g.cell) + 2
        for k in range(1, n - 1):
            f = k/n
            if g.solid(int(round((p0[0]+dx*f - g.x0)/g.cell)),
                       int(round((p0[2]+dz*f - g.z0)/g.cell)), p0[1]+dy*f): return False
        return True

    anc = []
    for a in anchors:
        ax, ay, az = a['p']
        land = []
        for i, j in walk:
            wx, wz = g.x0 + i*g.cell, g.z0 + j*g.cell
            if (wx-ax)**2 + (wz-az)**2 > LAND_R*LAND_R: continue
            t = g.top[i][j]
            if t > ay + 1.0 or t < ay - LAND_DROP: continue
            if g.solid(i, j, t + 0.9): continue
            land.append((i, j))
        # Cutting the line with a jump keeps the reel's speed, and a double
        # jump and two dashes after it carry that a long way. Measured in the
        # engine: from an anchor 11m above the launch, 63m past it before
        # dropping back to launch height.
        fall = []
        for i, j in walk:
            wx, wz = g.x0 + i*g.cell, g.z0 + j*g.cell
            t = g.top[i][j]
            drop = ay - t
            if drop < -2.0: continue
            reach = min(90.0, 45.0 + 1.5*max(0.0, drop))
            if (wx-ax)**2 + (wz-az)**2 > reach*reach: continue
            if g.solid(i, j, t + 0.9): continue
            # and nothing solid in the way. A launch flies over what is below
            # the line from a little above the hook to the landing, not through
            # walls.
            if not flight_clear((ax, ay + 3.0, az), (wx, t + 1.0, wz)): continue
            if g.roofed(i, j, t, ay + 3.0): continue
            fall.append((i, j))
        anc.append({'p': (ax, ay, az), 'land': land, 'fall': fall, 'used': False})

    def los(p0, p1):
        """Clear line between two world points, sampled on the grid."""
        dx, dy, dz = p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]
        d = (dx*dx + dy*dy + dz*dz) ** 0.5
        if d > TETHER_RANGE or d < 0.001: return False
        n = int(d/g.cell) + 2
        for k in range(1, n):
            f = k/n
            if g.solid(int(round((p0[0]+dx*f - g.x0)/g.cell)),
                       int(round((p0[2]+dz*f - g.z0)/g.cell)), p0[1]+dy*f): return False
        return True

    def can_hook(i, j, h, a):
        """Line of sight from a player standing at this cell to the anchor,
        inside tether range. Sampled along the line - the same test the gun
        does with a raycast."""
        # Standing, or at the top of a jump, which sees over a step.
        ax, ay, az = a['p']
        for lift in (EYE, EYE + 5.9, EYE + 7.8):
            px, py, pz = g.x0 + i*g.cell, h + lift, g.z0 + j*g.cell
            dx, dy, dz = ax-px, ay-py, az-pz
            d = (dx*dx + dy*dy + dz*dz) ** 0.5
            if d > TETHER_RANGE or d < 0.001: continue
            n = int(d/g.cell) + 2
            if all(not g.solid(int(round((px+dx*(k/n) - g.x0)/g.cell)),
                               int(round((pz+dz*(k/n) - g.z0)/g.cell)), py+dy*(k/n))
                   for k in range(1, n)):
                return True
        return False

    # each platform as a pair of cell lists, either end reaching the other
    mov = []
    for m in movers:
        mw, mh, md = m['s']
        ends = []
        for pt in (m['p'], m['to']):
            # The footprint plus a ring of landing round it. A lift's two ends
            # share a footprint, and the grid keeps one height per cell, so the
            # lower end is simply not there - you board it from the landing
            # beside it, and that is the cell that has to link.
            cells = [(i, j) for i, j in walk
                     if abs(g.x0 + i*g.cell - pt[0]) <= mw/2 + 1.6
                     and abs(g.z0 + j*g.cell - pt[2]) <= md/2 + 1.6
                     and g.top[i][j] is not None
                     and abs(g.top[i][j] - (pt[1]+mh)) <= 0.6 + 1e-6
                     # and not through a wall: 2-1's shuttle "docked" in an
                     # alcove its own hall's wall still closed off
                     and flight_clear((pt[0], pt[1]+mh+1.0, pt[2]),
                                      (g.x0 + i*g.cell, g.top[i][j] + 1.0, g.z0 + j*g.cell))]
            ends.append(cells)
        if ends[0] and ends[1]: mov.append(ends)

    seen[si][sj] = True
    q = deque([(si, sj)])
    while q:
        i, j = q.popleft(); h = g.top[i][j]
        for ends in mov:
            for a_, b_ in ((0, 1), (1, 0)):
                if (i, j) not in ends[a_]: continue
                for u, v in ends[b_]:
                    if not seen[u][v]: seen[u][v] = True; q.append((u, v))
        for a in anc:
            if a['used'] or not can_hook(i, j, h, a): continue
            # one anchor reaches the next, so a line of them over a void is a
            # route; each one then drops the player onto whatever is under it
            pend = [a]
            while pend:
                b = pend.pop()
                if b['used']: continue
                b['used'] = True
                for u, v in b['land'] + b['fall']:
                    if not seen[u][v]: seen[u][v] = True; q.append((u, v))
                for c in anc:
                    if not c['used'] and los(b['p'], c['p']): pend.append(c)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                a, b = i+di, j+dj
                if not (0 <= a < g.nx and 0 <= b < g.nz) or seen[a][b]: continue
                t = g.top[a][b]
                if t is None or t - h > STEP_UP: continue
                if g.solid(a, b, max(h, t) + 0.9): continue
                seen[a][b] = True; q.append((a, b))
        if not ledge(i, j): continue
        bi, bj = i//B, j//B
        span = int(reach//B) + 1
        for u in range(bi-span, bi+span+1):
            for v in range(bj-span, bj+span+1):
                for a, b in buckets.get((u, v), ()):
                    if seen[a][b]: continue
                    di, dj = a-i, b-j
                    if di*di + dj*dj > reach*reach: continue
                    t = g.top[a][b]
                    # a jump regains 5.5m; a scatter boost on top of it, 7.8 -
                    # straight up, off the edge you are standing at
                    if t - h > (BOOST_UP - 0.3 if boost else MAX_RISE): continue
                    lim = reach_for(t - h) if t - h <= MAX_RISE else 4.0
                    if di*di + dj*dj > (lim/g.cell)**2: continue
                    # you cannot land inside a wall - without this the flood
                    # drops into a door frame and walks out the far side
                    if g.solid(a, b, t + 0.9): continue
                    # nor come down through a roof onto what is under it
                    if g.roofed(a, b, t, max(h, t) + 1.4): continue
                    d = max(abs(di), abs(dj))
                    clear = True
                    for k in range(1, d):
                        f = k/d
                        if g.solid(int(i + di*f), int(j + dj*f), max(h, t) + 1.4):
                            clear = False; break
                    if clear:
                        seen[a][b] = True; q.append((a, b))
    return seen

def near(seen, g, p, r=3, level=False):
    """Something reachable within r cells. With level, it also has to be at
    about the thing's height: without that, the floor at the foot of 2-2's 41m
    spire counted as reaching the core on top of it."""
    i, j = g.cell_of(p)
    for a in range(max(0,i-r), min(g.nx,i+r+1)):
        for b in range(max(0,j-r), min(g.nz,j+r+1)):
            if not seen[a][b]: continue
            if level and getattr(g, 'tagged', False) and g.top[a][b] is not None and not (p[1] - 5.0 <= g.top[a][b] <= p[1] + 1.5):
                continue
            return True
    return False

def in_vol(seen, g, vol):
    p, s = vol['p'], vol['s']
    i0, j0 = g.cell_of([p[0]-s[0]/2, 0, p[2]-s[2]/2])
    i1, j1 = g.cell_of([p[0]+s[0]/2, 0, p[2]+s[2]/2])
    return any(seen[i][j] for i in range(i0, i1+1) for j in range(j0, j1+1))

def subacts(a):
    """The action lists nested in one action: an arena's onClear, a count's
    steps, a spawn's boss phases."""
    out = []
    if a.get('onClear'): out.append(a['onClear'])
    if a.get('a') == 'count': out += list(a.get('do') or [])
    if a.get('a') == 'if': out.append(a.get('do'))
    if a.get('a') == 'after': out.append(a.get('do'))          # later, on a clock
    if a.get('a') == 'start' and a.get('do'): out.append(a['do'])   # once it sets off (`aboard`: with you on it)
    if a.get('a') in ('deliver', 'wreck') and a.get('then'): out.append(a['then'])   # once the cages are up, once it lands
    for sp in [e for dr in a.get('drops') or [] for e in dr.get('enemies') or []] if a.get('a') == 'deliver' else []:
        for ph in sp.get('phases') or []: out.append(ph.get('do'))
    for sp in a.get('enemies') or []:
        for ph in sp.get('phases') or []: out.append(ph.get('do'))
        if sp.get('onDeath'): out.append(sp['onDeath'])
    return out

def breach_sources(lv):
    """(actions, ('breach', key)) for every breach panel with actions of its own."""
    return [(gm.get('do'), ('breach', 'breach#%d' % i)) for i, gm in enumerate(lv.get('geometry', []))
            if isinstance(gm, dict) and gm.get('breach') and gm.get('do')]

def lamp_count(d):
    """How many lamps a door wears: a number, or a list of key colours."""
    n = d.get('lamps', 1)
    return len(n) if isinstance(n, list) else n


def openers(lv, verb='open', field='door'):
    """thing id -> list of ('trigger'|'node'|'key', position) that opens it.

    Used for doors, and for the tracks a level starts dead: a platform nothing
    ever starts is as much a dead lock as a door nothing opens."""
    out = {}
    def scan(acts, where):
        for a in acts or []:
            if a.get('a') == verb and a.get(field):
                out.setdefault(a[field], []).append(where)
            # a `move` sends a platform on: as good as starting it
            if verb == 'start' and a.get('a') == 'move' and a.get('mover') and not a.get('hold'):
                out.setdefault(a['mover'], []).append(where)
            # and what is nested in it: onClear, a count's steps, boss phases
            for sub in subacts(a): scan(sub, where)
    for t in lv.get('triggers', []): scan(t.get('do'), ('trigger', t['vol']))
    for acts, where in breach_sources(lv): scan(acts, where)
    for n in lv.get('nodes', []):    scan(n.get('do'), ('node', n['p']))
    for k in lv.get('keys', []):     scan(k.get('do'), ('node', k['p']))
    for w in lv.get('weapons', []):     scan(w.get('do'), ('node', w['p']))
    # a conduit runs its `do` when first powered, and drives its lifts for as
    # long as it is live - so it starts them, as far as reachability goes
    for c in lv.get('conduits', []):
        scan(c.get('do'), ('conduit', c['p']))
        if verb == 'start' and field == 'mover':
            for mid in c.get('lifts', []) + c.get('bridges', []): out.setdefault(mid, []).append(('conduit', c['p']))
    return out

def deal(lv, problems):
    """A level's lot (its `shuffle`), dealt in the order written, unless NB_DEAL
    names draws to force - "slot=item,slot=item" - each swapped in from whichever
    slot of its group had it, so every arrangement can be checked by hand."""
    import os
    drawn, group, pool = {}, {}, {}
    for sh in lv.get('shuffle', []):
        # more items than slots: the slots get some of them (one layout of several)
        if len(sh['items']) < len(sh['slots']):
            problems.append('%s: a shuffle has %d slots and %d items' % (lv.get('id'), len(sh['slots']), len(sh['items'])))
        for n, it in zip(sh['slots'], sh['items']): drawn[n] = it; group[n] = sh['slots']; pool[n] = sh['items']
    for kv in filter(None, os.environ.get('NB_DEAL', '').split(',')):
        n, it = kv.split('=')
        if n not in drawn: continue
        other = next((m for m in group[n] if drawn[m] == it), None)
        if other is None and it in pool[n]: drawn[n] = it; continue      # one nothing else drew
        if other is None: problems.append('NB_DEAL: no %s in the group of %s' % (it, n)); continue
        drawn[other], drawn[n] = drawn[n], it
    def keep(x):
        if not (isinstance(x, dict) and x.get('when')): return True
        sl, its = x['when']
        if sl not in drawn: problems.append('%s: "when" names a slot no shuffle deals: %s' % (lv.get('id'), sl))
        return drawn.get(sl) in its
    def take(x):
        if isinstance(x, dict) and x.get('deal') and 'dos' in x:
            y = dict(x); y['do'] = x['dos'].get(drawn.get(x['deal']), []); return y
        return x
    for k, v in list(lv.items()):
        if isinstance(v, list) and k != 'shuffle': lv[k] = [take(x) for x in v if keep(x)]
    return lv

def check(path, report=False, warnings=None):
    if warnings is None: warnings = []
    lv = json.load(open(path))
    dealt = []
    lv = deal(lv, dealt)
    if dealt: return dealt
    name = lv.get('id', path)
    surf = surfaces(lv)
    static = surfaces(lv, movers=False)
    problems = []
    # A box with a size of zero or less has no collision and draws inside out: 3-3's
    # pier 1 kerbs, built 74m long the wrong way, looked solid and walked through.
    for kind, items in (('geometry', lv.get('geometry', [])), ('mover', lv.get('movers', []))):
        for gm in items:
            if isinstance(gm, dict) and 's' in gm and any(v <= 0 for v in gm['s']):
                problems.append('%s: %s at %s has size %s - every side must be more than 0' % (name, kind, gm.get('p'), gm['s']))
    if not surf: return ['%s: no walkable geometry' % name]
    xs = [s for q in surf for s in q[:2]]; zs = [s for q in surf for s in q[2:4]]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)

    # ---- seams ----
    # Every floor on the line, not just the highest: one top per sample hid
    # 3-1's two gaps at the foot of the shop's west wall, each under a gantry
    # 17m up. A panel is not a wall standing in a gap: broken, the gap is there.
    fillers = [(gm['p'][0]-gm['s'][0]/2, gm['p'][0]+gm['s'][0]/2, gm['p'][1], gm['p'][1]+gm['s'][1],
                gm['p'][2]-gm['s'][2]/2, gm['p'][2]+gm['s'][2]/2)
               for gm in lv.get('geometry', []) if isinstance(gm, dict) and 'p' in gm and not gm.get('breach')]
    def tops_at(x, z):
        return [t for a0, a1, c0, c1, t in static if a0 <= x <= a1 and c0 <= z <= c1]
    def scan_line(fixed, axis):
        lo, hi = (z0, z1) if axis == 'z' else (x0, x1)
        n = int((hi - lo)/CELL) + 1
        cols = [tops_at(fixed, lo + i*CELL) if axis == 'z' else tops_at(lo + i*CELL, fixed) for i in range(n)]
        levels = sorted(set(round(t, 2) for c in cols for t in c))
        seen = []
        for T in levels:
            if any(abs(T - u) <= STEP_UP for u in seen): continue
            seen.append(T)
            here = [any(abs(t - T) <= STEP_UP for t in c) for c in cols]
            run = None
            for i, h in enumerate(here):
                if not h and run is None:
                    run = i if i and here[i-1] else -1
                elif h and run is not None:
                    width = (i - run)*CELL
                    # the samples either side are floor, so the void is up to a
                    # sample wider than the run: a 3m jump read as 2.5
                    if run >= 0 and width + CELL <= SEAM_MAX:
                        pos = lo + run*CELL
                        mid = pos + width/2
                        px, pz = (fixed, mid) if axis == 'z' else (mid, fixed)
                        # a void with something standing in it is not a hole to
                        # fall through - the wall or block is what stops you
                        if not any(b0 <= px <= b1 and c0 <= pz <= c1 and y0 < T + 1.8 and y1 >= T - 0.05
                                   for b0, b1, y0, y1, c0, c1 in fillers):
                            problems.append('%s: %.1fm seam at %s=%.1f, %s=%.1f..%.1f (floors level at y=%.1f)'
                                            % (name, width, 'x' if axis == 'z' else 'z', fixed, axis, pos, pos+width, T))
                    run = None
    spawn = lv['spawn']['p']
    # Scan both axes across the whole level, not a few lines through the spawn,
    # which a slot running parallel to them would slip between.
    step = 2.0
    v = x0
    while v <= x1:
        scan_line(v, 'z'); v += step
    v = z0
    while v <= z1:
        scan_line(v, 'x'); v += step

    # ---- gated reachability ----
    nx, nz = int((x1-x0)/GCELL)+1, int((z1-z0)/GCELL)+1
    if nx*nz > 250000:
        problems.append('%s: level too large to validate (%dx%d cells)' % (name, nx, nz))
        return problems
    g = Grid(surf, x0, z0, nx, nz, GCELL)
    g.set_ceilings([(gm['p'][0]-gm['s'][0]/2, gm['p'][0]+gm['s'][0]/2, gm['p'][1], gm['p'][1]+gm['s'][1],
                     gm['p'][2]-gm['s'][2]/2, gm['p'][2]+gm['s'][2]/2)
                    for gm in lv.get('geometry', []) if isinstance(gm, dict) and 'p' in gm and not gm.get('walk')
                    and not (gm.get('on') or gm.get('nocol') or gm.get('fall'))])
    # heights are only trusted where floors are tagged: an untagged level's
    # raised blocks never make it into the grid
    g.tagged = any(gm.get('walk') for gm in lv.get('geometry', []) if isinstance(gm, dict))
    walls = wall_boxes(lv)
    doors = lv.get('doors', [])
    opens = openers(lv)
    lamps = openers(lv, 'lamp', 'door')
    # A panel (a geometry piece with an id) is a lock like a door: solid until a
    # `reveal` names it. Treating it as a wall for good read Tutorial 2's rail and
    # 1-2's tether as unreachable - everything behind them with them.
    panels = {gm['id']: (gm['p'][0]-gm['s'][0]/2, gm['p'][0]+gm['s'][0]/2, gm['p'][1],
                         gm['p'][1]+gm['s'][1], gm['p'][2]-gm['s'][2]/2, gm['p'][2]+gm['s'][2]/2)
              for gm in lv.get('geometry', []) if isinstance(gm, dict) and gm.get('id') and not gm.get('breach')}
    reveals = openers(lv, 'reveal', 'panel')
    # A breach panel is a wall until the Sunder breaks it: once the player holds
    # one and can see the panel, it is open. (Only upright ones block; a breach
    # floor stays a floor here.)
    all_breach = {'breach#%d' % i: (gm['p'][0]-gm['s'][0]/2, gm['p'][0]+gm['s'][0]/2, gm['p'][1],
                                    gm['p'][1]+gm['s'][1], gm['p'][2]-gm['s'][2]/2, gm['p'][2]+gm['s'][2]/2)
                  for i, gm in enumerate(lv.get('geometry', []))
                  if isinstance(gm, dict) and gm.get('breach')}
    # only upright ones that stay put are walls; one riding a platform moves away
    breach_boxes = {k: bx for k, bx in all_breach.items()
                    if bx[3] - bx[2] >= 1.7 and not lv['geometry'][int(k[7:])].get('on')}
    breached = set()
    # A breach panel's plates and border are drawn once across each face, so a
    # long thin panel stretches them: keep panels square (4x4, 6x6), and lay a
    # long strip as a row of them.
    for i, gm in enumerate(lv.get('geometry', [])):
        if not (isinstance(gm, dict) and gm.get('breach')): continue
        a_, b_ = sorted(gm['s'])[1:]
        if b_ > a_*1.34:
            warnings.append('%s: breach panel at %s is %.1fx%.1f - its plates stretch; use square panels'
                            % (name, gm['p'], a_, b_))
    flood_walls = [b for b in walls if b not in panels.values() and b not in all_breach.values()]

    # Two faces on the same plane, pointing the same way, both exposed: the
    # renderer has no way to order them and they flicker as the camera moves.
    # Boxes that merely touch (one's max against the other's min) are fine -
    # those faces point away from each other.
    EPS, MINLAP = 0.02, 0.25
    boxes = []
    for gm in lv.get('geometry', []):
        if not isinstance(gm, dict) or 'p' not in gm: continue
        x, y, z = gm['p']; w, h, d = gm['s']
        boxes.append((x-w/2, x+w/2, y, y+h, z-d/2, z+d/2))
    for dr in lv.get('doors', []):
        boxes.append(door_box(dr))
    # Neon trim is generated at build time, not stored in the level, so it is
    # added here: a strip sitting just above the piece's top face, which can
    # land flush with a neighbouring surface.
    for gm in lv.get('geometry', []):
        if not isinstance(gm, dict) or not gm.get('trim'): continue
        x, y, z = gm['p']; w, h, d = gm['s']
        boxes.append((x-w/2, x+w/2, y+h+0.05, y+h+0.15, z-d/2, z+d/2))
    seen_pairs = set()
    for i in range(len(boxes)):
        a1 = boxes[i]
        for j in range(i+1, len(boxes)):
            b1 = boxes[j]
            lap = [min(a1[k*2+1], b1[k*2+1]) - max(a1[k*2], b1[k*2]) for k in range(3)]
            for ax in range(3):
                o1, o2 = [k for k in range(3) if k != ax]
                if lap[o1] <= MINLAP or lap[o2] <= MINLAP:
                    continue
                for side in (0, 1):                     # both mins, or both maxes
                    if abs(a1[ax*2+side] - b1[ax*2+side]) < EPS:
                        key = (round(a1[ax*2+side], 2), ax, side)
                        if key in seen_pairs: break
                        seen_pairs.add(key)
                        mid = ((max(a1[0], b1[0])+min(a1[1], b1[1]))/2,
                               (max(a1[2], b1[2])+min(a1[3], b1[3]))/2,
                               (max(a1[4], b1[4])+min(a1[5], b1[5]))/2)
                        warnings.append('%s: coplanar %s faces at %s=%.2f near (%.0f, %.0f, %.0f) '
                                        '- %.1fx%.1fm of overlap will flicker'
                                        % (name, 'xyz'[ax], 'xyz'[ax], a1[ax*2+side],
                                           mid[0], mid[1], mid[2], lap[o1], lap[o2]))
                        break

    # A wall you can stand on top of is a route, whatever the designer meant: a
    # cover block or a door slab within one scatter-boost of a wall head, and
    # over the wall you go. Launch pads are walkable surfaces AND door slabs - a
    # closed door is a 7m-high step.
    # A launch pad is anything solid the player can end up standing on, which
    # is not the same as the `walk` surfaces: a cover block is never marked
    # walkable and is exactly what gets used to clear a wall.
    pads = [(a, b, c, d, t) for a, b, c, d, t in surf]
    for pc in lv.get('geometry', []):
        if not isinstance(pc, dict) or 'p' not in pc: continue
        px_, py_, pz_ = pc['p']; pw_, ph_, pd_ = pc['s']
        # Walls and ceiling panels are not seeded as stands: a roof is only a
        # stand once the closure proves the player can climb onto it, and
        # seeding every lid made the whole level look reachable from the sky.
        if pc.get('mat') == 'wall':
            # ...except a kerb: a low wall standing on a floor is a step you
            # hop onto, not a lid, and a 0.6m kerb is plenty to launch a boost
            # from.
            # on or against a floor - edge kerbs are built just off the floor
            # they guard, touching it, rather than on it
            on_floor = any(px_-pw_/2 <= a1+0.05 and px_+pw_/2 >= a0-0.05 and
                           pz_-pd_/2 <= c1+0.05 and pz_+pd_/2 >= c0-0.05 and abs(t - py_) < 0.05
                           for a0, a1, c0, c1, t in surf)
            if not (ph_ <= 1.3 and on_floor and min(pw_, pd_) >= 0.5): continue
        elif ph_ < 0.4 or min(pw_, pd_) < 0.8: continue
        pads.append((px_-pw_/2, px_+pw_/2, pz_-pd_/2, pz_+pd_/2, py_+ph_))
    for dr in doors:
        dx, dy, dz = dr['p']; dw, dh, dd = dr['s']
        pads.append((dx-dw/2, dx+dw/2, dz-dd/2, dz+dd/2, dy+dh))
    heads = []
    for wc in lv.get('geometry', []):
        if not isinstance(wc, dict) or wc.get('mat') != 'wall': continue
        wx_, wy_, wz_ = wc['p']; ww_, wh_, wd_ = wc['s']
        # walls, and ceiling panels: a roof you can climb onto is a route just
        # as much as a wall head is, and lidding a room to close an escape
        # only helps if the lid itself is out of reach
        if 1.2 < wh_ < 3.0: continue        # a kerb is meant to be stepped over
        if wh_ <= 1.2 and min(ww_, wd_) < 1.5: continue
        heads.append((wx_-ww_/2, wx_+ww_/2, wy_, wy_+wh_, wz_-wd_/2, wz_+wd_/2))
    # Anything solid sitting on a head - a ceiling, a lintel, the next storey -
    # leaves no room to stand there, so the head is not a route.
    def capped(bx0, bx1, by1, bz0, bz1):
        """Is there no room to stand here?

        Not any overlap: a door slab is thicker than the wall it fills, so the
        lintel covers the middle of its top and leaves a standable lip at each
        edge. Cover has to be total, sampled across the top, or the uncovered
        part is a stand.
        """
        nx = max(2, int((bx1-bx0)/0.4) + 1)
        nz = max(2, int((bz1-bz0)/0.4) + 1)
        for i in range(nx):
            px = bx0 + (bx1-bx0)*(i+0.5)/nx
            for j in range(nz):
                pz = bz0 + (bz1-bz0)*(j+0.5)/nz
                over = False
                for cc in lv.get('geometry', []):
                    if not isinstance(cc, dict) or 'p' not in cc: continue
                    cx_, cy_, cz_ = cc['p']; cw_, ch_, cd_ = cc['s']
                    if cy_ > by1 + 0.9 or cy_ + ch_ <= by1 + 0.15: continue
                    if not (cx_-cw_/2 < px < cx_+cw_/2): continue
                    if not (cz_-cd_/2 < pz < cz_+cd_/2): continue
                    over = True; break
                if not over: return False
        return True

    # Climbing is transitive and it starts from the ground. Seed with what the
    # player can stand on by walking, then take every head that is one boost
    # from there, add ITS top as a new stand, and go again. Without the
    # closure the check reports heads reachable only from a roof the player
    # can never get onto, which buries the real ones.
    def head_gap(h, pad):
        bx0, bx1, _, _, bz0, bz1 = h
        ax0, ax1, az0, az1, _ = pad
        return (max(0.0, max(bx0-ax1, ax0-bx1)) +
                max(0.0, max(bz0-az1, az0-bz1)))

    solids_all = []
    for sc in lv.get('geometry', []):
        if not isinstance(sc, dict) or 'p' not in sc: continue
        sx_, sy_, sz_ = sc['p']; sw_, sh_, sd_ = sc['s']
        if sh_ < 0.4: continue
        solids_all.append((sx_-sw_/2, sx_+sw_/2, sy_, sy_+sh_, sz_-sd_/2, sz_+sd_/2))

    def path_blocked(pad, h):
        """Is there solid geometry between standing on the pad and standing on
        the head? A head on the far side of a wall is not reachable, whatever
        the horizontal gap."""
        x0, y0, z0 = (pad[0]+pad[1])/2, pad[4]+1.0, (pad[2]+pad[3])/2
        x1, y1, z1 = (h[0]+h[1])/2, h[3]+1.0, (h[4]+h[5])/2
        n = 24
        for i in range(1, n):
            f = i/n
            px, py, pz = x0+(x1-x0)*f, y0+(y1-y0)*f, z0+(z1-z0)*f
            for b in solids_all:
                # the head you are climbing onto is not an obstacle to climbing onto it
                if (abs(b[0]-h[0]) < 0.01 and abs(b[1]-h[1]) < 0.01 and
                    abs(b[3]-h[3]) < 0.01 and abs(b[4]-h[4]) < 0.01): continue
                if b[0] < px < b[1] and b[2] < py < b[3] and b[4] < pz < b[5]: return True
        return False

    # A door under a lintel is not a stand: there is no headroom on top of it.
    pads = [pd for pd in pads if not capped(pd[0], pd[1], pd[4], pd[2], pd[3])]

    climbed, frontier = set(), list(pads)
    while frontier:
        gained = []
        for hi, h in enumerate(heads):
            if hi in climbed: continue
            bx0, bx1, by0, by1, bz0, bz1 = h
            if any(t > by1 - 0.6 and ax0 < bx1 and ax1 > bx0 and az0 < bz1 and az1 > bz0
                   for ax0, ax1, az0, az1, t in surf): continue
            if capped(bx0, bx1, by1, bz0, bz1): continue
            for pad in frontier:
                rise = by1 - pad[4]
                if rise <= 0.05 or rise > BOOST_UP: continue
                if head_gap(h, pad) > 2.5: continue
                # A surface directly overhead is a ceiling, not a ledge - you
                # boost into its underside and stop. But only the part of the
                # stand that is actually underneath it is blocked: a door slab
                # proud of its lintel leaves a strip in the open, and that
                # strip is what gets used.
                # Anything solid straight above the stand stops the boost
                # before it ever gets up there - including a neighbouring
                # panel of the very roof being climbed onto.
                if pad[4] < by0 - 0.05:
                    cxm, czm = (pad[0]+pad[1])/2, (pad[2]+pad[3])/2
                    roof = False
                    for b in solids_all:
                        if not (b[0] < cxm < b[1] and b[4] < czm < b[5]): continue
                        if b[2] >= pad[4] + 0.2 and b[2] < by0 - 0.01: roof = True; break
                    if roof: continue
                if path_blocked(pad, h): continue
                climbed.add(hi)
                warnings.append('%s: wall head at (%.0f, %.1f, %.0f) is %.1fm above a stand '
                                'at (%.0f, %.1f, %.0f) - a boost puts the player on top of it'
                                % (name, (bx0+bx1)/2, by1, (bz0+bz1)/2, rise,
                                   (pad[0]+pad[1])/2, pad[4], (pad[2]+pad[3])/2))
                gained.append((bx0, bx1, bz0, bz1, by1))
                break
        frontier = gained

    # A briefing that names a key is wrong for anyone who has rebound it. Text
    # should ask for the action - "{dash}" - and let the HUD fill in the key.
    KEYWORDS = ('SHIFT', 'CTRL', 'SPACE', 'WASD', 'ESDF', 'MOUSE', 'ENTER', 'ESC')
    def scan_keys(acts, where):
        for a in acts or []:
            for fld in ('sub', 'sub2'):
                t = a.get(fld)
                if not isinstance(t, str): continue
                for k in KEYWORDS:
                    if k in t.upper():
                        warnings.append('%s: %s names the key "%s" - use {action} so it '
                                        'follows the player\'s bindings' % (name, where, k))
                        break
            if a.get('onClear'): scan_keys(a['onClear'], where)
    for t in lv.get('triggers', []): scan_keys(t.get('do'), 'a briefing')
    for n in lv.get('nodes', []):    scan_keys(n.get('do'), 'a node briefing')
    for w in lv.get('weapons', []):
        if w.get('brief'): scan_keys([w['brief']], 'the %s pickup' % w.get('id'))

    # Briefing and banner titles are rendered as plain text, subtitles as HTML.
    # An entity in a title prints literally, which is how "SECTOR 1-1 &middot;
    # THE SPINE" reached the screen.
    def scan_titles(acts):
        for a in acts or []:
            for fld in ('title', 'sub', 'sub2', 'label'):
                t2 = a.get(fld)
                # a doubled backslash in a generator prints the escape itself
                if isinstance(t2, str) and '\\u' in t2:
                    problems.append('%s: %r contains a literal \\u escape - it will '
                                    'print as written' % (name, t2[:60]))
            t = a.get('title')
            if isinstance(t, str) and '&' in t:
                problems.append('%s: %r is a plain-text title, so "%s" prints literally'
                                % (name, t, t[t.index('&'):].split(';')[0] + ';'))
            if a.get('onClear'): scan_titles(a['onClear'])
    for t in lv.get('triggers', []): scan_titles(t.get('do'))
    for n in lv.get('nodes', []):    scan_titles(n.get('do'))

    # Checkpoints are only ever set by a `checkpoint` action naming a pad by
    # position (within 2m), so a pad nothing names is never a save, and an action
    # that names no pad saves nothing. A find-and-replace once moved a pad and
    # left its action pointing three metres off it.
    named = []
    def scan_cp(acts):
        for x in acts or []:
            if x.get('a') == 'checkpoint': named.append(x['p'])
            for sub in subacts(x): scan_cp(sub)
    for t in lv.get('triggers', []): scan_cp(t.get('do'))
    for n in lv.get('nodes', []):    scan_cp(n.get('do'))
    for k in lv.get('keys', []):     scan_cp(k.get('do'))
    for w in lv.get('weapons', []):     scan_cp(w.get('do'))
    for c in lv.get('conduits', []): scan_cp(c.get('do'))
    for acts, _ in breach_sources(lv): scan_cp(acts)
    # A checkpoint photographs the level as it stands when it runs, so in one
    # list it goes after whatever sets the level's state. Before them, a death
    # put back the state from before: 3-3's eye stopped hunting on pier 2, and
    # fallen off the landing, it never woke and the span never came.
    LATER = ('gaze', 'after', 'move', 'start', 'stop', 'anchors', 'hazard', 'expose', 'drops')
    def scan_order(acts, where):
        cp = False
        for x in acts or []:
            if x.get('a') == 'checkpoint': cp = True
            elif cp and x.get('a') in LATER:
                problems.append('%s: %s: a checkpoint runs before the `%s` after it in the same list, '
                                'so a death undoes it - put the checkpoint last' % (name, where, x['a']))
            for sub in subacts(x): scan_order(sub, where)
    for i, t in enumerate(lv.get('triggers', [])): scan_order(t.get('do'), 'trigger %d' % i)
    for k in lv.get('keys', []):     scan_order(k.get('do'), 'key')
    for acts, _ in breach_sources(lv): scan_order(acts, 'panel')
    pads = [c['p'] for c in lv.get('checkpoints', [])]
    close = lambda a, b: abs(a[0]-b[0]) < 2 and abs(a[2]-b[2]) < 2
    for c in pads:
        if not any(close(c, q) for q in named):
            problems.append('%s: checkpoint at %s is never set - no checkpoint action names it' % (name, c))
    for q in named:
        if not any(close(c, q) for c in pads):
            problems.append('%s: a checkpoint action names %s, but no pad is there' % (name, q))

    # A fight that has to be won before the way on opens must be an arena, because
    # only an arena lights the HUD's LOCKED chip. need:'clear' holds a trigger just
    # as well but tells the player nothing, so nothing says the fight is compulsory.
    for t in lv.get('triggers', []):
        if t.get('need') != 'clear': continue
        gates = [x['a'] for x in t.get('do') or [] if x['a'] in ('reveal', 'open', 'start', 'uncage')]
        if gates:
            problems.append('%s: a need:"clear" trigger at %s does %s - that makes the fight '
                            'compulsory, so it wants an arena, or LOCKED never shows'
                            % (name, t['vol']['p'], '/'.join(gates)))

    # An enemy standing in a wall is half-buried and often unshootable. Covers
    # both the level's own placements and anything a trigger spawns.
    RAD = {'turret':1.15,'warden':2.7,'bulwark':1.5,'sentinel':1.3,'lancer':1.05,
           'drone':0.8,'rusher':0.75,'node':0.7}
    fall_dys = {f['id']: f.get('dy', 0) for f in lv.get('falls', [])}
    fallen_surf = []
    for gm in lv.get('geometry', []):
        if not isinstance(gm, dict) or not gm.get('fall') or not gm.get('walk'): continue
        x_, y_, z_ = gm['p']; w_, h_, d_ = gm['s']
        fallen_surf.append((x_ - w_/2, x_ + w_/2, z_ - d_/2, z_ + d_/2, y_ + h_ + fall_dys.get(gm['fall'], 0)))
    def check_over_ground(kind, pos, where, fixed):
        """A spawn needs a deck under it.

        Nothing is placed at the height the level asks for: a non-fixed spawn
        resolves its y from whatever is below, so a point over a void resolves
        to the ground under the level and the enemy hovers there, out of reach
        and still counted. A spawn is also jittered by up to 2m unless it is
        fixed, so the margin has to hold too."""
        x, y, z = pos
        # `fixed` pins the authored height, so a flier can be told to appear
        # over a chasm on purpose. Everything else resolves from the deck below.
        if fixed: return
        # Over nothing at all the engine holds the height it was given, so a
        # flier can be told to appear out over a chasm. What still goes wrong is
        # a spot with something under it, far below: it resolves down to that.
        if top_at(surf, x, z) is None: return
        # The engine only looks for ground up to 2.5m above the height asked for
        # (groundAt's maxY). Ask for a height well below the deck and the spawn
        # resolves to whatever is under it, where nothing can hit it.
        # what a fall group comes down on to counts too: 3-2's Bastion has cages
        # of reinforcements let down on to the islands it fought among, which
        # hang 35m higher until the control room lets them go
        under = [t for x0, x1, z0, z1, t in surf + fallen_surf if x0 <= x <= x1 and z0 <= z <= z1 and t <= y+2.5]
        if not under:
            problems.append('%s: %s %s at %s asks for y=%g, but the deck there is at %g - it '
                            'will resolve beneath it' % (name, where, kind, pos, y, top_at(surf, x, z)))
            return
        for dx, dz in ((-2, 0), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2), (-2, 2), (2, -2)):
            if top_at(surf, x+dx, z+dz) is None:
                warnings.append('%s: %s %s at %s is within 2m of an edge, and a spawn '
                                'is scattered by that much' % (name, where, kind, pos))
                return

    def check_clear(kind, pos, where):
        r = RAD.get(kind, 1.0)
        x, y, z = pos
        for bx0, bx1, by0, by1, bz0, bz1 in walls:
            if x+r > bx0 and x-r < bx1 and z+r > bz0 and z-r < bz1 \
               and y+1.2 > by0 and y-0.4 < by1:
                problems.append('%s: %s %s at %s stands inside geometry at (%.0f, %.0f)'
                                % (name, where, kind, pos, (bx0+bx1)/2, (bz0+bz1)/2))
                return
    for e in lv.get('enemies', []):
        if e.get('p'): check_clear(e['kind'], e['p'], 'placed')
    def scan_spawns(acts):
        for a in acts or []:
            if a.get('a') == 'spawn':
                for sp in a.get('enemies', []):
                    if not sp.get('p'): continue
                    if sp.get('fixed'): check_clear(sp['kind'], sp['p'], 'spawned')
                    check_over_ground(sp['kind'], sp['p'], 'spawned', bool(sp.get('fixed')))
            # the crane's cages: each lands on a floor, and what is in it comes out there
            if a.get('a') == 'deliver':
                for dr in a.get('drops', []):
                    check_over_ground('cage', dr['at'], 'crane cage', False)
                    for sp in dr.get('enemies', []):
                        if sp.get('p'): check_over_ground(sp['kind'], sp['p'], 'delivered', bool(sp.get('fixed')))
            # the Gaze's pods: each bursts over a floor, and what it carries comes out there
            if a.get('a') == 'pods':
                for dr in a.get('drops', []):
                    for sp in dr.get('enemies', []):
                        at = sp.get('p') or dr['at']
                        if sp.get('fixed'): check_clear(sp['kind'], at, 'pod')
                        check_over_ground(sp['kind'], at, 'pod', bool(sp.get('fixed')))
            for sub_ in subacts(a):
                if sub_ is not a.get('onClear'): scan_spawns(sub_)
            if a.get('onClear'): scan_spawns(a['onClear'])
    for t in lv.get('triggers', []): scan_spawns(t.get('do'))
    for n in lv.get('nodes', []):      scan_spawns(n.get('do'))
    for k in lv.get('keys', []):       scan_spawns(k.get('do'))
    for w in lv.get('weapons', []):       scan_spawns(w.get('do'))
    for acts, _ in breach_sources(lv):    scan_spawns(acts)
    for e in lv.get('enemies', []):
        if e.get('p'): check_over_ground(e['kind'], e['p'], 'placed', bool(e.get('fixed')))

    # A checkpoint under a crate is a pad the player cannot see and cannot
    # touch. It has to stand in the open on something walkable.
    for n, cp in enumerate(lv.get('checkpoints', [])):
        cx_, cy_, cz_ = cp['p']
        for bx0, bx1, by0, by1, bz0, bz1 in walls:
            if bx0 - 0.5 < cx_ < bx1 + 0.5 and bz0 - 0.5 < cz_ < bz1 + 0.5 \
               and by0 <= cy_ + 0.4 and by1 > cy_ + 0.1:
                problems.append('%s: checkpoint %d at %s is inside or under geometry '
                                'at (%.0f, %.0f)' % (name, n, cp['p'], (bx0+bx1)/2, (bz0+bz1)/2))
                break

    # A vent standing on a checkpoint burns the player every time they touch
    # the pad, and a respawn drops them straight back into it.
    for hz in lv.get('hazards', []):
        if hz.get('t') != 'burner': continue
        bx, by, bz = hz['p']; bw, bh, bd = hz['s']
        for n, cp in enumerate(lv.get('checkpoints', [])):
            cx_, cy_, cz_ = cp['p']
            if abs(cx_-bx) < bw/2 + 1.2 and abs(cz_-bz) < bd/2 + 1.2:
                problems.append('%s: burner at %s covers checkpoint %d at %s'
                                % (name, hz['p'], n, cp['p']))

    # a burner drawn inside a crate looks like the crate is on fire, and the
    # damage volume covers ground the player cannot stand on anyway
    for hz in lv.get('hazards', []):
        if hz.get('t') != 'burner': continue
        hx, hy, hz2 = hz['p']; hw, hh, hd = hz['s']
        for bx0, bx1, by0, by1, bz0, bz1 in walls:
            if hx-hw/2 < bx1 and hx+hw/2 > bx0 and hz2-hd/2 < bz1 and hz2+hd/2 > bz0 \
               and hy-hh/2 < by1 and hy+hh/2 > by0:
                problems.append('%s: burner at %s intersects solid geometry at (%.0f, %.0f)'
                                % (name, hz['p'], (bx0+bx1)/2, (bz0+bz1)/2))
                break

    for d in doors:
        # (`later`: what opens it is in a part of the level not built yet)
        if d.get('lock') == 'script' and not d.get('open') and not d.get('later') and d['id'] not in opens \
                and len(openers(lv, 'lamp', 'door').get(d['id'], [])) < lamp_count(d):
            problems.append('%s: door %s starts sealed and nothing opens it' % (name, d['id']))

    # A door set off its doorway's centre shuts half of it: wall runs straight
    # on from one edge of the slab and the other edge stands in open air. 3-2's
    # control room door sat 2m east of its hole and sealed nothing.
    wall_solid = wall_boxes(lv)
    for d in doors:
        dx, dy, dz = d['p']; dw, dh, dd = d['s']
        along_x = dw >= dd
        lo, hi = (dx - dw/2, dx + dw/2) if along_x else (dz - dd/2, dz + dd/2)
        py = dy + min(dh, 3) / 2
        def walled(s):
            px, pz = (s, dz) if along_x else (dx, s)
            return any(b[0] <= px <= b[1] and b[2] <= py <= b[3] and b[4] <= pz <= b[5] for b in wall_solid)
        sides = (walled(lo - 0.25), walled(hi + 0.25))
        if sides[0] != sides[1]:
            problems.append('%s: door %s at %s has wall past one edge and open air past the other '
                            '- it is off its doorway' % (name, d['id'], d['p']))

    # The tether is a lock like any other: anchors do nothing until the player
    # is carrying the gun, so a shaft crossed by anchors is sealed until the
    # pickup is reached. Levels that start with it in the loadout skip straight
    # to holding it.
    all_movers = [m for m in lv.get('movers', []) if not m.get('ghosts')]
    starts = openers(lv, 'start', 'mover')
    # A crane sent round a ring by `move` actions leg after leg is more than the
    # two ends a track is checked by. Where it stops, the level puts a `ghost`:
    # a stand-in platform, anchor or pylon the engine never builds, switched on
    # here by a `guide` action alongside the `move` that sends the real one.
    guides = {}
    def _guides(acts, where):
        for x in acts or []:
            if x.get('a') == 'guide':
                for gid in x.get('ids') or []: guides.setdefault(gid, []).append(where)
            for sub in subacts(x): _guides(sub, where)
    for t in lv.get('triggers', []): _guides(t.get('do'), ('trigger', t['vol']))
    for n in lv.get('nodes', []):    _guides(n.get('do'), ('node', n['p']))
    for k in lv.get('keys', []):     _guides(k.get('do'), ('node', k['p']))
    for w in lv.get('weapons', []):     _guides(w.get('do'), ('node', w['p']))
    for c in lv.get('conduits', []): _guides(c.get('do'), ('conduit', c['p']))
    for acts, where in breach_sources(lv): _guides(acts, where)
    for m in all_movers:
        if m.get('ghost') and m.get('id') in guides: starts.setdefault(m['id'], []).extend(guides[m['id']])
    guided = set()
    def ghost_ok(x): return not x.get('ghost') or x.get('id') in guided
    for m in all_movers:
        if m.get('start') is False and m.get('id') not in starts:
            problems.append('%s: track %s starts dead and nothing starts it'
                            % (name, m.get('id')))
    running = set(m.get('id') for m in all_movers if m.get('start') is not False)

    # An anchor that starts switched off joins the route once whatever lights it
    # (an `anchors` action on a conduit, trigger, node or key) has been reached.
    # One nothing lights is left out entirely.
    lights = {}
    def _lights(acts, where):
        for x in acts or []:
            if x.get('a') == 'anchors' and not x.get('off'):
                for aid in x.get('ids') or []: lights.setdefault(aid, []).append(where)
            # nested lists too: a boss's phases light things as the fight goes,
            # which is as good as the trigger that starts it, for reachability
            for sub in subacts(x): _lights(sub, where)
    for t in lv.get('triggers', []): _lights(t.get('do'), ('trigger', t['vol']))
    for n in lv.get('nodes', []):    _lights(n.get('do'), ('node', n['p']))
    for k in lv.get('keys', []):     _lights(k.get('do'), ('node', k['p']))
    for w in lv.get('weapons', []):     _lights(w.get('do'), ('node', w['p']))
    for c in lv.get('conduits', []): _lights(c.get('do'), ('conduit', c['p']))
    for acts, where in breach_sources(lv): _lights(acts, where)
    lit = set()
    # one a crane carries round on `move`s is stood in for by `ghost`s at its stops
    pool = [a for a in lv.get('anchors', []) if (not a.get('off') or a.get('id') in lights) and not a.get('ghosts')]
    # an anchor riding a mover is sampled along its run, like a moving pylon
    _moving = []
    for a in pool:
        m = next((v for v in lv.get('movers', []) if v.get('id') == a.get('on')), None)
        if not m: _moving.append(a); continue
        d = [m['to'][k] - m['p'][k] for k in range(3)]
        for step in range(11):
            f = step / 10
            _moving.append(dict(a, p=[a['p'][k] + d[k]*f for k in range(3)]))
    pool = _moving
    # ...and one an action switches off again is gone once that is reached
    # (3-1's gantry anchor, which is only for getting the Sunder)
    offs = {}
    def _offs(acts, where):
        for x in acts or []:
            if x.get('a') == 'anchors' and x.get('off'):
                for aid in x.get('ids') or []: offs.setdefault(aid, []).append(where)
            for sub in subacts(x): _offs(sub, where)
    for t in lv.get('triggers', []): _offs(t.get('do'), ('trigger', t['vol']))
    for c in lv.get('conduits', []): _offs(c.get('do'), ('conduit', c['p']))
    for acts, where in breach_sources(lv): _offs(acts, where)
    for w in lv.get('weapons', []): _offs(w.get('do'), ('node', w['p']))
    gone = set()
    def live_anchors():
        return [a for a in pool if (not a.get('off') or a.get('id') in lit) and ghost_ok(a) and a.get('id') not in gone]
    all_anchors = live_anchors()
    has_tether = 'tether' in (lv.get('loadout') or [])
    has_arc = 'arc' in (lv.get('loadout') or [])
    has_sunder = 'sunder' in (lv.get('loadout') or [])
    has_scatter = 'scatter' in (lv.get('loadout') or [])
    all_pylons = [q for q in lv.get('pylons', []) if not q.get('ghosts')]
    pylon_nodes = []
    for i, q in enumerate(all_pylons):
        m = next((v for v in lv.get('movers', []) if v.get('id') == q.get('on')), None)
        if not m:
            pylon_nodes.append((tuple(q['p']), i)); continue
        d = [m['to'][k] - m['p'][k] for k in range(3)]
        for step in range(11):
            f = step / 10
            pylon_nodes.append((tuple(q['p'][k] + d[k]*f for k in range(3)), i))
    ARC_RANGE, PYLON_HOP = 36, 18
    # Everything an arc cannot pass: every solid piece, doors still shut, panels
    # still up. Rebuilt each pass, since doors and panels open as it goes.
    solids = []
    def clear(a, b, skip=0.9):
        """Is the straight line a->b free of solids? The last `skip` metres are
        ignored, so the thing being aimed at does not block its own shot."""
        L_ = math.dist(a, b)
        if L_ < 1e-6: return True
        dx, dy, dz = ((b[k]-a[k]) for k in range(3))
        tmax = max(0.0, 1.0 - skip/L_)
        for x0, x1, y0, y1, z0, z1 in solids:
            lo, hi = 0.0, tmax
            for o, d, m0, m1 in ((a[0], dx, x0, x1), (a[1], dy, y0, y1), (a[2], dz, z0, z1)):
                if abs(d) < 1e-9:
                    if o <= m0 or o >= m1: lo, hi = 1, 0; break
                    continue
                t0, t1 = (m0-o)/d, (m1-o)/d
                if t0 > t1: t0, t1 = t1, t0
                lo, hi = max(lo, t0), min(hi, t1)
                if lo >= hi: break
            if lo < hi: return False
        return True
    def seen_from(target, rng):
        """Can a player see `target` from within `rng` - standing, or at the
        top of a double jump and a boost?"""
        tx, ty, tz = target
        for i in range(0, g.nx, 2):
            wx = g.x0 + i*g.cell
            if abs(wx - tx) > rng: continue
            for j in range(0, g.nz, 2):
                if not seen[i][j] or g.top[i][j] is None: continue
                wz = g.z0 + j*g.cell
                for lift in (1.6, 1.6 + 7.8):
                    eye = (wx, g.top[i][j] + lift, wz)
                    if math.dist(eye, target) <= rng and clear(eye, target): return True
        return False
    # every place a storm that can be on ever stands, for powering what it covers
    lit_on = set()
    for c in lv.get('conduits', []):
        for hid in (c.get('hazards') or {}).get('on', []): lit_on.add(hid)
    def _ons(acts):
        for x in acts or []:
            if x.get('a') == 'hazard' and x.get('on') is True and x.get('id'): lit_on.add(x['id'])
            for sub in subacts(x): _ons(sub)
    for t in lv.get('triggers', []): _ons(t.get('do'))
    for c in lv.get('conduits', []): _ons(c.get('do'))
    for acts, where in breach_sources(lv): _ons(acts)
    storm_boxes = []
    for h in lv.get('hazards', []):
        if h.get('t') != 'storm' or (h.get('off') and h.get('id') not in lit_on): continue
        x, y, z = h['p']; w, hh, d = h['s']
        if h.get('rise'): hh = max(h['rise'])
        sw = h.get('sweep') or [0, 0, 0]
        for st in range(11) if h.get('sweep') else (5,):
            f = (st - 5) / 5
            cx, cy, cz = x + sw[0]*f, y + sw[1]*f, z + sw[2]*f
            storm_boxes.append((cx - w/2, cx + w/2, cy, cy + hh, cz - d/2, cz + d/2))
    # A trigger that waits on a count fires only once something that counts it
    # has been reached (not merely something above or below it).
    count_srcs = openers(lv, verb='count', field='id')
    need_count = {id(t['vol']): t['need']['count'] for t in lv.get('triggers', [])
                  if isinstance(t.get('need'), dict) and t['need'].get('count')}
    counted = set()
    def reached(kind, where):
        if kind == 'trigger':
            if id(where) in need_count and need_count[id(where)] not in counted: return False
            return in_vol(seen, g, where)
        if kind == 'breach': return where in breached
        if kind != 'conduit': return near(seen, g, where, r=25)
        # An arc reaches a conduit a standing player can see within the Arc's
        # range, or one at the end of a line of pylons they can see the first
        # of. A square window with no walls in it said the switchyard's relay
        # could be powered from the pit, through the shaft wall.
        if not has_arc: return False
        if seen_from(where, ARC_RANGE): return True
        # ...or a storm that covers it, shot anywhere the player can see it
        for bx in storm_boxes:
            x0, x1, y0, y1, z0, z1 = bx
            if not (x0 <= where[0] <= x1 and y0 <= where[1] <= y1 and z0 <= where[2] <= z1): continue
            for fx in (0.25, 0.5, 0.75):
                for fy in (0.3, 0.7):
                    for fz in (0.25, 0.5, 0.75):
                        pt = (x0 + (x1-x0)*fx, y0 + (y1-y0)*fy, z0 + (z1-z0)*fz)
                        if seen_from(pt, ARC_RANGE): return True
        # A pylon riding a mover is sampled along its run: the chain holds if it
        # joins up with the pylon anywhere on it. Samples of one pylon never link
        # to each other - it cannot be in two places in one shot.
        nodes = [n for n in pylon_nodes if ghost_ok(all_pylons[n[1]])]
        live = [n for n in nodes if seen_from(n[0], ARC_RANGE)]
        frontier = list(live)
        while frontier:
            q = frontier.pop()
            for r_ in nodes:
                if r_ in live or r_[1] == q[1]: continue
                if math.dist(q[0], r_[0]) <= PYLON_HOP and clear(q[0], r_[0]):
                    live.append(r_); frontier.append(r_)
        return any(math.dist(q[0], where) <= PYLON_HOP and clear(q[0], where) for q in live)
    # A laser grid with no period is on until a conduit that feeds it is powered:
    # a lock like a door. Timed grids are timing, not a lock, and are not walls.
    grids = {h['id']: door_box(h) for h in lv.get('hazards', [])
             if h.get('t') == 'laser' and not h.get('period') and not h.get('sweep') and h.get('id')}
    storm_walls = set()          # walls to walk, not to shoot: an arc goes straight through
    # A storm that is always on and stays put is a wall as far as the route goes:
    # its shield drain then its bleed make anything long a death. One that drifts,
    # rises, erupts on a beat or is marked passable is timing, not a wall.
    for i, h in enumerate(lv.get('hazards', [])):
        if h.get('t') == 'storm' and not h.get('off') and not h.get('sweep') and not h.get('rise') \
           and not h.get('cycle') and not h.get('passable'):
            grids[h.get('id') or 'storm#%d' % i] = door_box(h)
            storm_walls.add(h.get('id') or 'storm#%d' % i)
    grid_cut = {}
    # a valve conduit switches storms off for as long as it is powered
    for c in lv.get('conduits', []):
        for hid in (c.get('hazards') or {}).get('off', []): grid_cut.setdefault(hid, []).append(('conduit', c['p']))
    for c in lv.get('conduits', []):
        for gid in c.get('grids', []): grid_cut.setdefault(gid, []).append(('conduit', c['p']))
    # ...or anything whose actions switch it off: a node shot, a trigger, a key
    def _cuts(acts, where):
        for x in acts or []:
            if x.get('a') == 'hazard' and x.get('on') is False and x.get('id'):
                grid_cut.setdefault(x['id'], []).append(where)
            for sub in subacts(x): _cuts(sub, where)
    for n in lv.get('nodes', []):    _cuts(n.get('do'), ('node', n['p']))
    for t in lv.get('triggers', []): _cuts(t.get('do'), ('trigger', t['vol']))
    for k in lv.get('keys', []):     _cuts(k.get('do'), ('node', k['p']))
    for w in lv.get('weapons', []):     _cuts(w.get('do'), ('node', w['p']))
    for c in lv.get('conduits', []): _cuts(c.get('do'), ('conduit', c['p']))
    for acts, where in breach_sources(lv): _cuts(acts, where)
    for gid in grids:
        if gid.startswith('storm#') or any(h.get('id') == gid and h.get('t') == 'storm' for h in lv.get('hazards', [])):
            continue                      # a storm nothing switches off is a wall, and may mean to be
        if gid not in grid_cut:
            problems.append('%s: laser grid %s is always on and nothing cuts it' % (name, gid))
    cut = set()
    # A pour: molten that starts off and an action switches on floods what it
    # covers for good. That is the one lock that closes - so from then on the
    # route is walked from where the player stood to set it off, not from the
    # spawn, and the floors under it are gone.
    molten = {h['id']: h for h in lv.get('hazards', []) if h.get('t') == 'molten' and h.get('id') and h.get('off')}
    pours = {}
    def _pours(acts, where):
        for x in acts or []:
            if x.get('a') == 'hazard' and x.get('on') is True and x.get('id') in molten:
                pours.setdefault(x['id'], []).append(where)
            for sub in subacts(x): _pours(sub, where)
    for t in lv.get('triggers', []): _pours(t.get('do'), ('trigger', t['vol']))
    for n in lv.get('nodes', []):    _pours(n.get('do'), ('node', n['p']))
    for c in lv.get('conduits', []): _pours(c.get('do'), ('conduit', c['p']))
    for acts, where in breach_sources(lv): _pours(acts, where)
    poured, origin = set(), g.cell_of(spawn)
    ever = [[False]*g.nz for _ in range(g.nx)]     # everywhere ever walked, before a pour or after
    def molten_box(h):
        x, y, z = h['p']; w, hh, d = h['s']
        return (x - w/2, x + w/2, y - 1, y + hh + 1.2, z - d/2, z + d/2)
    # Falls (3-2): a group's pieces stand where they start until whatever drops
    # the group is reached, then they are floor where they land - or nothing, if
    # they sank. Like a pour, a fall can take away the way you came, so the route
    # walks on from the walked floor still standing nearest what set it off.
    fall_dy = {f['id']: f['dy'] for f in lv.get('falls', [])}
    fall_order = [f['id'] for f in lv.get('falls', [])]
    fall_srcs, expose_srcs = {}, {}
    def _falls(acts, where):
        for x in acts or []:
            if x.get('a') == 'fall' and x.get('id') and not x.get('jolt') and not x.get('more'):
                fall_srcs.setdefault(x['id'], []).append(where)
            if x.get('a') == 'expose':
                for bid in x.get('ids') or []: expose_srcs.setdefault(bid, []).append(where)
            # the crane's scrap opens its clamps as it throws
            if x.get('a') == 'drops':
                for bid in x.get('opens') or []: expose_srcs.setdefault(bid, []).append(where)
            for sub in subacts(x): _falls(sub, where)
    for t in lv.get('triggers', []): _falls(t.get('do'), ('trigger', t['vol']))
    for n in lv.get('nodes', []):    _falls(n.get('do'), ('node', n['p']))
    for k in lv.get('keys', []):     _falls(k.get('do'), ('node', k['p']))
    for c in lv.get('conduits', []): _falls(c.get('do'), ('conduit', c['p']))
    for acts, where in breach_sources(lv): _falls(acts, where)
    for fid in fall_order:
        if fid not in fall_srcs: problems.append('%s: fall %s is never set off' % (name, fid))
    fallen, exposed = set(), set()
    # a breach panel `shut` takes no charge until an `expose` names it
    shut_ids = {'breach#%d' % i: gm.get('id') for i, gm in enumerate(lv.get('geometry', []))
                if isinstance(gm, dict) and gm.get('breach') and gm.get('shut')}
    def retop(x0_, x1_, z0_, z1_):
        for i_ in range(g.nx):
            wx_ = g.x0 + i_*g.cell
            if not (x0_ - g.cell <= wx_ <= x1_ + g.cell): continue
            for j_ in range(g.nz):
                wz_ = g.z0 + j_*g.cell
                if z0_ - g.cell <= wz_ <= z1_ + g.cell: g.top[i_][j_] = top_at(surf, wx_, wz_)
    held, scripted, revealed, order = set(), set(), set(), []
    seen = None
    # Enough rounds for every lock to open one per round, whatever kind it is -
    # counting only doors, keys and weapons ran out part-way through a level
    # whose locks are lifts, conduits and lamps. It stops early when nothing
    # changes.
    for _ in range(len(doors) + len(lv.get('keys', [])) + len(lv.get('weapons', []))
                   + len(lv.get('movers', [])) + len(lv.get('conduits', []))
                   + len(lv.get('hazards', [])) + len(lv.get('anchors', [])) + len(count_srcs) + 8):
        shut = []
        for d in doors:
            lock = d.get('lock')
            if lock and lock != 'script' and lock not in held: shut.append(door_box(d))
            elif lock == 'script' and not d.get('open') and d['id'] not in scripted: shut.append(door_box(d))
        shut += [bx for pid, bx in panels.items() if pid not in revealed]
        shut += [bx for bid, bx in breach_boxes.items() if bid not in breached]
        shut += [bx for gid, bx in grids.items() if gid not in cut and gid not in storm_walls]
        stormy = [bx for gid, bx in grids.items() if gid not in cut and gid in storm_walls]
        g.add_blockers(flood_walls + shut + stormy + [molten_box(molten[hid]) for hid in poured])
        solids[:] = [b for b in walls if b not in panels.values() and b not in all_breach.values()] + shut + [
            (gm['p'][0]-gm['s'][0]/2, gm['p'][0]+gm['s'][0]/2, gm['p'][1], gm['p'][1]+gm['s'][1],
             gm['p'][2]-gm['s'][2]/2, gm['p'][2]+gm['s'][2]/2)
            # thin pieces too, grates included: the Arc does not pass a grate - a
            # cage's grate roof let the first draft of 2-3 power a caged conduit
            # from above
            for gm in lv.get('geometry', []) if isinstance(gm, dict) and 'p' in gm
            and gm['s'][1] < 1.7]
        all_anchors = live_anchors()
        seen = flood(g, origin, anchors=all_anchors if has_tether else (), boost=has_scatter,
                     movers=[m for m in all_movers if m.get('id') in running])
        changed = False
        for cid, srcs in count_srcs.items():
            if cid not in counted and any(reached(kind, where) for kind, where in srcs):
                counted.add(cid); changed = True
        for mid, srcs in starts.items():
            if mid in running: continue
            for kind, where in srcs:
                if reached(kind, where):
                    running.add(mid); order.append('start ' + mid); changed = True
                    break
        for w in lv.get('weapons', []):
            if w.get('id') == 'tether' and not has_tether and near(seen, g, w['p'], level=True):
                has_tether = True; order.append('take tether'); changed = True
            if w.get('id') == 'arc' and not has_arc and near(seen, g, w['p'], level=True):
                has_arc = True; order.append('take arc'); changed = True
            if w.get('id') == 'sunder' and not has_sunder and near(seen, g, w['p'], level=True):
                has_sunder = True; order.append('take sunder'); changed = True
        if has_sunder:  # (after the pickups: a level can start with it)
            for bid, bx in all_breach.items():
                if bid in breached: continue
                if bid in shut_ids and bid not in exposed: continue
                c = ((bx[0]+bx[1])/2, (bx[2]+bx[3])/2, (bx[4]+bx[5])/2)
                keep = solids[:]
                solids[:] = [b for b in solids if b != bx]      # not blocked by itself
                ok = seen_from(c, 60)
                # `round`: a panel meant to be broken by a burst beside it, out of
                # sight round a corner - any spot within the burst's reach of it
                # (1.2m) that can be seen will do
                if not ok and lv['geometry'][int(bid[7:])].get('round'):
                    for sx_ in (-1, 0, 1):
                        for sy_ in (-1, 0, 1):
                            for sz_ in (-1, 0, 1):
                                if ok or (sx_, sy_, sz_) == (0, 0, 0): continue
                                pt = (c[0] + sx_*((bx[1]-bx[0])/2 + 0.9), c[1] + sy_*((bx[3]-bx[2])/2 + 0.9),
                                      c[2] + sz_*((bx[5]-bx[4])/2 + 0.9))
                                ok = seen_from(pt, 60)
                solids[:] = keep
                if ok:
                    breached.add(bid); order.append('sunder breaks %s' % bid); changed = True
                    # a floor panel broken is a hole: what is under it shows through
                    gm = lv['geometry'][int(bid[7:])]
                    if gm.get('walk'):
                        x0_, x1_, y0_, y1_, z0_, z1_ = bx
                        surf[:] = [sf for sf in surf if not (abs(sf[0]-x0_) < 1e-6 and abs(sf[1]-x1_) < 1e-6 and
                                                             abs(sf[2]-z0_) < 1e-6 and abs(sf[3]-z1_) < 1e-6 and abs(sf[4]-y1_) < 1e-6)]
                        for i_ in range(g.nx):
                            wx_ = g.x0 + i_*g.cell
                            if not (x0_ - g.cell <= wx_ <= x1_ + g.cell): continue
                            for j_ in range(g.nz):
                                wz_ = g.z0 + j_*g.cell
                                if z0_ - g.cell <= wz_ <= z1_ + g.cell: g.top[i_][j_] = top_at(surf, wx_, wz_)
        for k in lv.get('keys', []):
            if k.get('colour') in held: continue
            if k.get('on'):
                m = next((v for v in all_movers if v.get('id') == k['on']), None)
                # a riding key is in hand once the track is running and either
                # end of its run can be stood on
                got = bool(m) and k['on'] in running and \
                      any(near(seen, g, pt) for pt in (m['p'], m['to']))
            else:
                got = near(seen, g, k['p'], level=True)
            if got:
                held.add(k['colour']); order.append('key ' + k['colour']); changed = True
        for pid, srcs in reveals.items():
            if pid in revealed: continue
            for kind, where in srcs:
                if reached(kind, where):
                    revealed.add(pid); order.append('%s reveals %s' % (kind, pid)); changed = True
                    break
        # a door with lamps opens when every lamp over it is lit, each by
        # something different
        for did, srcs in lamps.items():
            if did in scripted: continue
            need = next((lamp_count(d) for d in doors if d['id'] == did), 1)
            got = sum(1 for kind, where in srcs if reached(kind, where))
            if got >= need:
                scripted.add(did); order.append('%d lamps open %s' % (got, did)); changed = True
        for gid, srcs in grid_cut.items():
            if gid in cut: continue
            if any(reached(kind, where) for kind, where in srcs):
                cut.add(gid); order.append('conduit cuts %s' % gid); changed = True
        for aid, srcs in lights.items():
            if aid in lit: continue
            if any(reached(kind, where) for kind, where in srcs):
                lit.add(aid); order.append('%s lights anchor %s' % (srcs[0][0], aid)); changed = True
        for did, srcs in opens.items():
            if did in scripted: continue
            for kind, where in srcs:
                if reached(kind, where):
                    scripted.add(did); order.append('%s opens %s' % (kind, did)); changed = True
                    break
        for aid, srcs in offs.items():
            if aid in gone: continue
            if any(reached(kind, where) for kind, where in srcs):
                gone.add(aid); order.append('anchor %s off' % aid); changed = True
        for gid, srcs in guides.items():
            if gid in guided: continue
            if any(reached(kind, where) for kind, where in srcs):
                guided.add(gid); order.append('guide %s' % gid); changed = True
                # a ghost platform is there from now on: both ends of its run
                gm = next((m for m in all_movers if m.get('id') == gid and m.get('ghost')), None)
                if gm:
                    w_, h_, d_ = gm['s']
                    ends = [(pt[0]-w_/2, pt[0]+w_/2, pt[2]-d_/2, pt[2]+d_/2, pt[1]+h_) for pt in (gm['p'], gm['to'])]
                    surf.extend(ends)
                    for x0_, x1_, z0_, z1_, _ in ends:
                        for i_ in range(g.nx):
                            wx_ = g.x0 + i_*g.cell
                            if not (x0_ - g.cell <= wx_ <= x1_ + g.cell): continue
                            for j_ in range(g.nz):
                                wz_ = g.z0 + j_*g.cell
                                if z0_ - g.cell <= wz_ <= z1_ + g.cell: g.top[i_][j_] = top_at(surf, wx_, wz_)
        for hid, srcs in pours.items():
            if hid in poured: continue
            hit = next(((kind, where) for kind, where in srcs if reached(kind, where)), None)
            if hit is None: continue
            poured.add(hid); order.append('pour %s' % hid); changed = True
            # carry on from the walked cell nearest where it was set off - a
            # breach panel by its middle, as for a fall (3-2's bay pits pour as
            # a clamp breaks)
            kind_, w_ = hit
            if kind_ == 'breach':
                bx_ = all_breach[w_]; c = ((bx_[0]+bx_[1])/2, (bx_[2]+bx_[3])/2, (bx_[4]+bx_[5])/2)
            else: c = w_['p'] if isinstance(w_, dict) else w_
            box = molten_box(molten[hid])
            best = None
            for i in range(g.nx):
                for j in range(g.nz):
                    if not seen[i][j] or g.top[i][j] is None: continue
                    wx, wz = g.x0 + i*g.cell, g.z0 + j*g.cell
                    # under the metal, that is: a dais standing out of it is not
                    surf_y = molten[hid]['p'][1] + molten[hid]['s'][1]
                    if box[0] <= wx <= box[1] and box[4] <= wz <= box[5] and g.top[i][j] < surf_y + 0.3: continue
                    dd = math.dist((wx, g.top[i][j], wz), c)
                    if best is None or dd < best[0]: best = (dd, (i, j))
            if best: origin = best[1]
        for bid, pid in shut_ids.items():
            if bid in exposed: continue
            if any(reached(kind, where) for kind, where in expose_srcs.get(pid, [])):
                exposed.add(bid); order.append('expose %s' % pid); changed = True
        for fid in fall_order:
            if fid in fallen: continue
            hit = next(((kind, where) for kind, where in fall_srcs.get(fid, []) if reached(kind, where)), None)
            if hit is None: continue
            fallen.add(fid); order.append('fall ' + fid); changed = True
            for gm in lv.get('geometry', []):
                if not isinstance(gm, dict) or gm.get('fall') != fid or not gm.get('walk'): continue
                x_, y_, z_ = gm['p']; w_, h_, d_ = gm['s']
                old = (x_ - w_/2, x_ + w_/2, z_ - d_/2, z_ + d_/2, y_ + h_)
                surf[:] = [sf for sf in surf if not all(abs(sf[k] - old[k]) < 1e-6 for k in range(5))]
                if y_ + h_ + fall_dy.get(fid, 0) > -1: surf.append(old[:4] + (y_ + h_ + fall_dy.get(fid, 0),))
                retop(*old[:4])
            kind_, w_ = hit
            if kind_ == 'trigger': c_ = w_['p']
            elif kind_ == 'breach':
                bx_ = all_breach[w_]; c_ = ((bx_[0]+bx_[1])/2, (bx_[2]+bx_[3])/2, (bx_[4]+bx_[5])/2)
            else: c_ = w_['p'] if isinstance(w_, dict) else w_
            best = None
            for i in range(g.nx):
                for j in range(g.nz):
                    if not seen[i][j] or g.top[i][j] is None: continue
                    dd = math.dist((g.x0 + i*g.cell, g.top[i][j], g.z0 + j*g.cell), c_)
                    if best is None or dd < best[0]: best = (dd, (i, j))
            if best: origin = best[1]
        for i in range(g.nx):
            for j in range(g.nz):
                if seen[i][j]: ever[i][j] = True
        if not changed: break

    if all_anchors and has_tether:
        live = flood(g, g.cell_of(spawn), anchors=all_anchors, movers=all_movers, boost=has_scatter)
        for a in all_anchors:
            if near(live, g, a['p'], r=int(LAND_R/GCELL) + 1): continue
            # an anchor hanging over nothing is fine if it is a link in a chain -
            # you cut the line and reach for the next one
            ax_, ay_, az_ = a['p']
            if any(b is not a and
                   ((b['p'][0]-ax_)**2 + (b['p'][1]-ay_)**2 + (b['p'][2]-az_)**2)
                   <= TETHER_RANGE*TETHER_RANGE for b in all_anchors): continue
            # ...or a launch: cut with a jump and the speed carries you on to a
            # deck within the measured reach (see the fall model above)
            if any(g.top[i][j] is not None and g.top[i][j] <= ay_ + 2 and
                   math.hypot(g.x0 + i*g.cell - ax_, g.z0 + j*g.cell - az_)
                   <= min(90.0, 45.0 + 1.5*max(0.0, ay_ - g.top[i][j]))
                   for i in range(0, g.nx, 4) for j in range(0, g.nz, 4)
                   if live[i][j]): continue
            warnings.append('%s: anchor at %s has nothing under it and no other '
                            'anchor in reach - it reels the player into a fall'
                            % (name, a['p']))

    # (a goal on such a floor stacked over the route can't be checked on a grid
    # of one height per cell: 3-3's, out of the beaten eye over the Well)
    targets = [('goal', lv.get('goal'))] if not (lv.get('goal') or {}).get('over') else []
    # a core riding a platform is taken where the platform's run ends: 2-3's
    # rises a floor a phase, the Bastion test's rises out of the metal
    gl = lv.get('goal')
    if gl and gl.get('on'):
        gm_ = next((m for m in lv.get('movers', []) if m.get('id') == gl['on']), None)
        # ...or where a platform falling with it comes to rest
        rest = []
        def _rest(acts):
            for x in acts or []:
                if x.get('a') == 'fall' and x.get('mover') == gl['on'] and x.get('to'): rest.append(x['to'])
                # ...or where it lies wrecked (3-2's crane): drifted to x, its middle 0.4m under `floor`
                if x.get('a') == 'wreck' and x.get('mover') == gl['on'] and gm_:
                    h = gm_['s'][1]
                    rest.append([x.get('x', gm_['p'][0]), x.get('floor', 0) - 0.4 - h/2, gm_['p'][2]])
                for sub in subacts(x): _rest(sub)
        for t in lv.get('triggers', []): _rest(t.get('do'))
        for acts, _w in breach_sources(lv): _rest(acts)
        if gm_:
            end = rest[0] if rest else gm_['to']
            targets[0] = ('goal', dict(gl, p=[gl['p'][k] + end[k] - gm_['p'][k] for k in range(3)]))
    for k in lv.get('keys', []):
        if not k.get('on'):
            targets += [('key %s' % k.get('colour'), k)]
            continue
        m = next((v for v in all_movers if v.get('id') == k['on']), None)
        if m is None:
            problems.append('%s: key %s rides track %s, which does not exist'
                            % (name, k.get('colour'), k['on']))
        elif not any(near(seen, g, [pt[0], pt[1], pt[2]], r=4) for pt in (m['p'], m['to'])):
            problems.append('%s: key %s rides track %s, and neither end of it is '
                            'reachable' % (name, k.get('colour'), k['on']))
    targets += [('weapon %s' % w.get('id'), w) for w in lv.get('weapons', [])]
    targets += [('checkpoint %d' % n, c) for n, c in enumerate(lv.get('checkpoints', []))]
    for label, t in targets:
        if not t: continue
        # a pad on a piece that falls is checked where it stood, and was reached then
        if not near(ever, g, t['p'], r=4, level=not t.get('fall')):
            problems.append('%s: %s at %s is not reachable, playing the locks in order' % (name, label, t['p']))

    if report:
        cells = sum(1 for i in range(nx) for j in range(nz) if ever[i][j])
        print('  %-12s %5.0fx%-5.0fm  %5d walkable cells  route: %s'
              % (name, x1-x0, z1-z0, cells, ' -> '.join(order) if order else 'no locks'))
    return problems

if __name__ == '__main__':
    rep = '--report' in sys.argv
    bad, warn = [], []
    # Explicit paths override the glob, so a fixture can be checked on its own.
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    paths = sorted(args) if args else sorted(glob.glob('levels/*.json'))
    if rep: print('\nlevel        size              reachable        acquisition order')
    for path in paths:
        bad += check(path, rep, warn)
    if warn:
        print('\n  surfaces that may flicker (coplanar and facing the same way):')
        for w in warn: print('    ' + w)
    if bad:
        print('\n'.join('  ' + b for b in bad)); print('\n%d problem(s)' % len(bad)); sys.exit(1)
    print('\nall levels pass: no seams, no dead locks, everything reachable playing the locks in order')

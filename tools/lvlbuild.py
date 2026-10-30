"""Level geometry helpers. Rooms come out sealed, so a doorway is the only way in."""
import random
FLOOR_H = 1.0

def box(cx, y, cz, w, h, d, mat='block', trim=None, grate=False, walk=False):
    o = {'p':[round(cx,2), round(y,2), round(cz,2)], 's':[round(w,2), round(h,2), round(d,2)], 'mat':mat}
    if trim: o['trim'] = trim
    if grate: o['grate'] = True
    # walk marks a real standing surface, so the validator doesn't have to
    # guess (a thin door lintel is not a floor)
    if walk: o['walk'] = True
    return o

def room(cx, cz, w, d, h=10, y=0, floor=True, mat='block', trim='cyan',
         wallmat='wall', walltrim='magenta', doors=(), t=1.0, ceiling=False, over=None):
    """doors: (side, offset_along_wall, gap_width, door_height)"""
    out = []
    top = y + FLOOR_H
    if floor:
        out.append(box(cx, y, cz, w, FLOOR_H, d, mat, trim, walk=True))
    # End walls stop at the side walls rather than running through them. Two
    # boxes sharing a corner have coplanar outer faces, which flicker wherever
    # that corner can be seen - from a void, or over a ledge.
    sides = {
        'n': (cx, cz - d/2 - t/2, w, 'x'),
        's': (cx, cz + d/2 + t/2, w, 'x'),
        # Side walls overrun by the wall thickness to cover the corners. Rooms
        # chained end to end do not need that - the next room continues the
        # wall - and the overrun puts two coplanar faces in the same plane,
        # which flickers. over=0 butts them instead.
        'w': (cx - w/2 - t/2, cz, d + (t*2 if over is None else over), 'z'),
        'e': (cx + w/2 + t/2, cz, d + (t*2 if over is None else over), 'z'),
    }
    for side, (sx, sz, span, axis) in sides.items():
        gaps = sorted([dd for dd in doors if dd[0] == side], key=lambda d: d[1])
        if not gaps:
            if axis == 'x': out.append(box(sx, top, sz, span, h, t, wallmat, walltrim))
            else:           out.append(box(sx, top, sz, t, h, span, wallmat, walltrim))
            continue
        lo, hi = -span/2, span/2
        edges = [lo]
        for _, off, gap, dh in gaps:
            edges += [off - gap/2, off + gap/2]
        edges.append(hi)
        for k in range(0, len(edges), 2):                    # wall between openings
            s0, s1 = edges[k], edges[k+1]
            if s1 - s0 <= 0.01: continue
            c, ln = (s0 + s1)/2, s1 - s0
            if axis == 'x': out.append(box(sx + c, top, sz, ln, h, t, wallmat, walltrim))
            else:           out.append(box(sx, top, sz + c, t, h, ln, wallmat, walltrim))
        for _, off, gap, dh in gaps:                         # lintel over each opening
            if h - dh <= 0.05: continue
            if axis == 'x': out.append(box(sx + off, top + dh, sz, gap, h - dh, t, wallmat, walltrim))
            else:           out.append(box(sx, top + dh, sz + off, t, h - dh, gap, wallmat, walltrim))
    if ceiling:
        out.append(box(cx, top + h, cz, w + t*2, 0.6, d + t*2, wallmat))
    return out

def lid(x0, x1, z0, z1, y, mat='wall'):
    """A hand-placed ceiling panel.

    `ceiling=True` sizes its lid to the room plus its walls, which is right for
    a room standing on its own and wrong for a chain of them: neighbours at the
    same height lap each other, and two lids on one plane flicker. Trimming the
    lap instead opened a hole in a duct roof that the player jumped out of. A
    chain gets panels laid by hand so they tile - each one butting the next,
    every wall top covered exactly once.
    """
    return [box((x0+x1)/2, y, (z0+z1)/2, x1-x0, 0.6, z1-z0, mat)]


def corridor(x0, z0, x1, z1, width=8, h=10, y=0, doors=(), **kw):
    cx, cz = (x0 + x1)/2, (z0 + z1)/2
    if abs(z1 - z0) >= abs(x1 - x0):
        return room(cx, cz, width, abs(z1 - z0), h=h, y=y, doors=doors, **kw)
    return room(cx, cz, abs(x1 - x0), width, h=h, y=y, doors=doors, **kw)

def pad(cx, cz, w, d, y=0, mat='block', trim='cyan'):
    return [box(cx, y, cz, w, FLOOR_H, d, mat, trim, walk=True)]


def dedupe_walls(geo, thin=1.7):
    """Stop walls running through each other.

    Every room builds its own walls, so where two rooms abut, one room's end
    wall passes through the neighbour's side wall. Both then present a face on
    the same plane facing into the same space, and coplanar faces flicker.

    A trim is only kept if the slab it removes is still covered by other walls.
    That is checked by sampling, not argued from the shapes: an earlier version
    reasoned about which wall "should" give way and cut sixteen metres out of a
    foundry wall, because two walls crossing at an inside corner each look like
    the one that should yield.
    """
    def span(g, k):
        return (g['p'][1], g['p'][1]+g['s'][1]) if k == 1 else \
               (g['p'][k]-g['s'][k]/2, g['p'][k]+g['s'][k]/2)

    def inside(g, pt):
        for k in range(3):
            lo, hi = span(g, k)
            if pt[k] < lo-0.01 or pt[k] > hi+0.01: return False
        return True

    def covered(slab, others):
        """Sample the slab; every sample must sit inside some other wall."""
        steps = []
        for k in range(3):
            lo, hi = slab[k]
            n = max(2, min(9, int((hi-lo)/0.4)+2))
            steps.append([lo+(hi-lo)*(i+0.5)/n for i in range(n)])
        for x in steps[0]:
            for y in steps[1]:
                for z in steps[2]:
                    if not any(inside(o, (x, y, z)) for o in others):
                        return False
        return True

    walls = [g for g in geo if g['s'][1] >= thin]

    # A wall wholly inside another is doing nothing except giving the renderer
    # two surfaces to choose between on every shared face. Drop it.
    drop = []
    for a in walls:
        for b in walls:
            if a is b or a in drop: continue
            if all(span(b, k)[0] <= span(a, k)[0]+0.01 and
                   span(a, k)[1] <= span(b, k)[1]+0.01 for k in range(3)):
                drop.append(a); break
    for g in drop:
        geo.remove(g); walls.remove(g)

    for _ in range(3):                      # a wall can meet more than one neighbour
        changed = False
        for i, a in enumerate(walls):
            for b in walls[i+1:]:
                if any(min(span(a, k)[1], span(b, k)[1]) -
                       max(span(a, k)[0], span(b, k)[0]) <= 0.01 for k in range(3)):
                    continue                                  # not interpenetrating
                # height counts as an axis: a spine wall rising through the long
                # wall of the room next door overlaps it for its whole upper
                # half, and neither is contained in the other.
                for ax, (lng, sht) in [(ax, p) for ax in (0, 1, 2)
                                       for p in ((a, b), (b, a))]:
                    # either wall may be the one to give way; the coverage test
                    # decides. Only trying the longer one leaves pairs where the
                    # short wall is the redundant piece.
                    # no size guard: the coverage test below is the safety net,
                    # and sometimes the short wall is the redundant one
                    l0, l1 = span(lng, ax); s0, s1 = span(sht, ax)
                    if (s0+s1)/2 < (l0+l1)/2: new0, new1 = max(l0, s1), l1
                    else:                     new0, new1 = l0, min(l1, s0)
                    if new1-new0 < 0.05 or (new0 == l0 and new1 == l1): continue
                    slab = []
                    for k in range(3):
                        slab.append(((l0, new0) if new0 != l0 else (new1, l1))
                                    if k == ax else span(lng, k))
                    if not covered(slab, [w for w in walls if w is not lng]):
                        continue
                    if ax == 1:                       # y is a base, not a centre
                        lng['p'][1] = round(new0, 3)
                    else:
                        lng['p'][ax] = round((new0+new1)/2, 3)
                    lng['s'][ax] = round(new1-new0, 3)
                    changed = True
                    break
        if not changed: break
    return geo


def dedupe_floors(geo, thin=1.7, eps=0.02):
    """Stop two slabs sharing a top surface.

    A seam connector laid over both neighbours, or two ceilings meeting at a
    corner, put two tops on one plane, and they fight for pixels. The smaller
    slab has the shared rectangle cut out of it.

    Cut, not shrunk: shrinking the slab along one axis removes a whole strip,
    and where the overlap only covered part of that strip the rest would become
    a hole. Subtracting the rectangle leaves up to three pieces and no hole.
    """
    def span(g, k):
        return (g['p'][1], g['p'][1]+g['s'][1]) if k == 1 else \
               (g['p'][k]-g['s'][k]/2, g['p'][k]+g['s'][k]/2)
    MIN = 0.2
    moved = 0
    for _ in range(4):
        changed = False
        floors = [g for g in geo if g['s'][1] <= 1.6]
        for i, a in enumerate(floors):
            for b in floors[i+1:]:
                if a.get('_gone') or b.get('_gone'): continue
                if abs(span(a, 1)[1] - span(b, 1)[1]) > eps: continue     # tops differ
                ax0, ax1 = span(a, 0); az0, az1 = span(a, 2)
                bx0, bx1 = span(b, 0); bz0, bz1 = span(b, 2)
                lx = min(ax1, bx1) - max(ax0, bx0)
                lz = min(az1, bz1) - max(az0, bz0)
                if lx <= eps or lz <= eps: continue
                # cut the overlap out of whichever slab is smaller
                sml = a if a['s'][0]*a['s'][2] < b['s'][0]*b['s'][2] else b
                sx0, sx1 = span(sml, 0); sz0, sz1 = span(sml, 2)
                ox0, ox1 = max(ax0, bx0), min(ax1, bx1)
                oz0, oz1 = max(az0, bz0), min(az1, bz1)
                if ox0 <= sx0 + eps and ox1 >= sx1 - eps and \
                   oz0 <= sz0 + eps and oz1 >= sz1 - eps:
                    sml['_gone'] = True                  # wholly covered
                    changed = True; moved += 1
                    continue
                parts = []
                if ox0 - sx0 > MIN: parts.append((sx0, ox0, sz0, sz1))
                if sx1 - ox1 > MIN: parts.append((ox1, sx1, sz0, sz1))
                mx0, mx1 = max(sx0, ox0), min(sx1, ox1)
                if oz0 - sz0 > MIN: parts.append((mx0, mx1, sz0, oz0))
                if sz1 - oz1 > MIN: parts.append((mx0, mx1, oz1, sz1))
                if not parts: continue
                y = sml['p'][1]
                sml['p'][0] = round((parts[0][0]+parts[0][1])/2, 3)
                sml['s'][0] = round(parts[0][1]-parts[0][0], 3)
                sml['p'][2] = round((parts[0][2]+parts[0][3])/2, 3)
                sml['s'][2] = round(parts[0][3]-parts[0][2], 3)
                for px0, px1, pz0, pz1 in parts[1:]:
                    n = dict(sml)
                    n['p'] = [round((px0+px1)/2, 3), y, round((pz0+pz1)/2, 3)]
                    n['s'] = [round(px1-px0, 3), sml['s'][1], round(pz1-pz0, 3)]
                    geo.append(n)
                moved += 1; changed = True
        if not changed: break
    geo[:] = [g for g in geo if not g.pop('_gone', False)]
    return moved


def hide_floor_edges(geo, thin=1.7, eps=0.12):
    """Tuck a floor's edge inside the wall it lands against.

    A floor slab is a metre thick, so its rim is a visible band. Where a room
    meets a neighbour at a different height, that rim sits in the same plane as
    the neighbour's wall face and the two flicker over the whole length of the
    join. The wall already covers that plane, so the rim is redundant: pull it
    a hand's width into the wall, where it cannot be seen (surfaces only a few
    centimetres apart still fight for pixels down a long join).
    """
    def span(g, k):
        return (g['p'][1], g['p'][1]+g['s'][1]) if k == 1 else \
               (g['p'][k]-g['s'][k]/2, g['p'][k]+g['s'][k]/2)
    floors = [g for g in geo if g['s'][1] <= 1.6]
    walls  = [g for g in geo if g['s'][1] >= thin]
    moved = 0
    for f in floors:
        for w in walls:
            for ax in (0, 2):
                o1, o2 = [k for k in range(3) if k != ax]
                if min(span(f,o1)[1], span(w,o1)[1]) - max(span(f,o1)[0], span(w,o1)[0]) <= 0.25: continue
                if min(span(f,o2)[1], span(w,o2)[1]) - max(span(f,o2)[0], span(w,o2)[0]) <= 0.25: continue
                f0, f1 = span(f, ax); w0, w1 = span(w, ax)
                if abs(f1-w1) < 0.02 and w0 < f1-0.02:        # rim flush with the wall's far face
                    f['s'][ax] = round(f['s'][ax]-eps, 3); f['p'][ax] = round(f['p'][ax]-eps/2, 3); moved += 1
                elif abs(f0-w0) < 0.02 and w1 > f0+0.02:
                    f['s'][ax] = round(f['s'][ax]-eps, 3); f['p'][ax] = round(f['p'][ax]+eps/2, 3); moved += 1
    return moved


def drop_buried_trims(geo, thin=1.7):
    """Remove the neon strip from a piece whose top is inside something else.

    Trimming a wall's height moves its trim down with it, and if it now stops
    inside a neighbouring wall the strip is buried there - invisible except for
    its side faces, which sit in the neighbour's own faces and flicker. A top
    that cannot be seen does not need lighting.
    """
    def span(g, k):
        return (g['p'][1], g['p'][1]+g['s'][1]) if k == 1 else \
               (g['p'][k]-g['s'][k]/2, g['p'][k]+g['s'][k]/2)
    # A ceiling panel is only 0.6m tall, so a `thin` cutoff of 1.7 missed it
    # entirely and left lit strips buried in every duct lid.
    solids = [g for g in geo if g['s'][1] >= 0.4]
    dropped = 0
    for g in geo:
        if not g.get('trim'): continue
        top = span(g, 1)[1]
        lo, hi = top+0.05, top+0.15
        for o in solids:
            if o is g: continue
            oy0, oy1 = span(o, 1)
            if oy0 > lo+0.01 or oy1 < hi-0.01: continue
            if all(span(o, k)[0] <= span(g, k)[0]+0.01 and
                   span(g, k)[1] <= span(o, k)[1]+0.01 for k in (0, 2)):
                del g['trim']; dropped += 1
                break
    return dropped


def unstitch_walls(geo, thin=1.7, eps=0.15):
    """Separate two walls that share a face plane and cannot be trimmed.

    Where two rooms meet at a T, one room's wall crosses the end of the other's
    and both present a face on the same plane. Neither is redundant - trimming
    either one opens a hole - so instead the crossing wall is pulled back by a
    hand's width, into the wall it meets (a few centimetres still fights down a
    long join). The face it gives up is inside
    solid geometry, and the retraction is far too small to read as a gap.
    """
    def span(g, k):
        return (g['p'][1], g['p'][1]+g['s'][1]) if k == 1 else \
               (g['p'][k]-g['s'][k]/2, g['p'][k]+g['s'][k]/2)
    walls = [g for g in geo if g['s'][1] >= thin]
    moved = 0
    for i, a in enumerate(walls):
        for b in walls[i+1:]:
            for ax in (0, 2):
                o1, o2 = [k for k in range(3) if k != ax]
                l1 = min(span(a,o1)[1], span(b,o1)[1]) - max(span(a,o1)[0], span(b,o1)[0])
                l2 = min(span(a,o2)[1], span(b,o2)[1]) - max(span(a,o2)[0], span(b,o2)[0])
                if l1*l2 < 0.5 or l1 <= 0.05 or l2 <= 0.05:
                    continue
                for side in (0, 1):
                    if abs(span(a, ax)[side] - span(b, ax)[side]) > 0.02:
                        continue
                    # Retract whichever ends at that plane - but only if the
                    # slab it gives up is nearly all still filled. Retracting the
                    # wrong one cut a 15cm slot down a 16m by 35m wall, which the
                    # renderer is happy with and the player can see through.
                    done = False
                    for g in (a, b):
                        if done: break
                        g0, g1 = span(g, ax)
                        if g1 - g0 < eps + 0.05: continue
                        other = b if g is a else a
                        o0, o1_ = span(other, ax)
                        if side == 0 and o1_ > g0+eps:   slab = (g0, g0+eps)
                        elif side == 1 and o0 < g1-eps:  slab = (g1-eps, g1)
                        else: continue
                        # how much of that slab is left uncovered by other walls?
                        rest = [w for w in walls if w is not g]
                        cell = 0.5
                        free = 0.0
                        k1, k2 = [k for k in range(3) if k != ax]
                        a1, b1_ = span(g, k1); a2, b2_ = span(g, k2)
                        n1 = max(2, int((b1_-a1)/cell)); n2 = max(2, int((b2_-a2)/cell))
                        for i1 in range(n1):
                            for i2 in range(n2):
                                pt = [0, 0, 0]
                                pt[ax] = (slab[0]+slab[1])/2
                                pt[k1] = a1 + (b1_-a1)*(i1+0.5)/n1
                                pt[k2] = a2 + (b2_-a2)*(i2+0.5)/n2
                                if not any(all(span(w, k)[0]-0.01 <= pt[k] <= span(w, k)[1]+0.01
                                               for k in range(3)) for w in rest):
                                    free += ((b1_-a1)/n1) * ((b2_-a2)/n2)
                        if free > 2.0:
                            continue                     # would open a real gap
                        if side == 0: g['p'][ax] = round(g['p'][ax]+eps/2, 3)
                        else:         g['p'][ax] = round(g['p'][ax]-eps/2, 3)
                        g['s'][ax] = round(g['s'][ax]-eps, 3)
                        moved += 1; done = True
                    break
    return moved


def wall(axis, fixed, lo, hi, y0, y1, holes=(), windows=(), t=1, trim='magenta'):
    """A wall `t` thick on the line `fixed`, running along `axis` ('x': at z=fixed,
    'z': at x=fixed) from lo to hi and y0 to y1, with rectangular holes
    (a0, a1, h0, h1). A hole whose index is in `windows` gets glass."""
    cuts = sorted(set([lo, hi] + [c for h in holes for c in (max(lo, h[0]), min(hi, h[1]))]))
    out = []
    for a0, a1 in zip(cuts, cuts[1:]):
        if a1 - a0 < 1e-6: continue
        mid = (a0 + a1)/2
        ys = [y0]
        for h0, h1 in sorted((h[2], h[3]) for h in holes if h[0] <= mid <= h[1]): ys += [h0, h1]
        ys.append(y1)
        for k in range(0, len(ys), 2):
            b0, b1 = ys[k], ys[k + 1]
            if b1 - b0 < 1e-6: continue
            tr = trim if abs(b1 - y1) < 1e-6 else None
            if axis == 'x': out.append(box(mid, b0, fixed, a1 - a0, b1 - b0, t, 'wall', tr))
            else:           out.append(box(fixed, b0, mid, t, b1 - b0, a1 - a0, 'wall', tr))
    for i in windows:
        a0, a1, h0, h1 = holes[i]
        pane = box((a0 + a1)/2, h0, fixed, a1 - a0, h1 - h0, 0.3, 'dark') if axis == 'x' else \
               box(fixed, h0, (a0 + a1)/2, 0.3, h1 - h0, a1 - a0, 'dark')
        pane['window'] = True
        out.append(pane)
    return out


def breach(x, y, z, w, h, d, **kw):
    b = box(x, y, z, w, h, d, 'wall')
    b['breach'] = True
    b.update(kw)
    return b



def warren(L, LATE, slot, xs, zs, fy, H, entry, exit_, n, seed, minpath, pool, pool_do, key=None, loose=None,
           enter_vol=None, key_far=4):
    """A grid of rooms between walls to the roof, every wall with a 4m doorway in
    it, and what fills each doorway - nothing, a panel or plain wall - comes from
    one of `n` layouts made here and dealt by lot. Each layout is a maze: one way
    from `entry` to `exit_` (cells), its branches dead ends behind panels, with
    something from `pool` in each (what it does, `pool_do`) - or `key` (a
    colour), at the end of the longest that ends `key_far` rooms or more from
    the exit, in a room of its own behind a panel with a 'guard' behind it. `loose` is what waits on the way through, set loose by walking in
    at `enter_vol`. Returns the shuffle entry, and the keys, checkpoints and
    triggers the layouts need. `L` takes the walls every layout shares; `LATE`
    the pieces dealt by lot, kept out of the merge passes."""
    nx, nz = len(xs) - 1, len(zs) - 1
    ctr = lambda c: [round((xs[c[0]] + xs[c[0] + 1])/2, 2), fy, round((zs[c[1]] + zs[c[1] + 1])/2, 2)]
    def edge(a, b):
        return (min(a, b), max(a, b))
    # the walls every layout shares: each line of them, a doorway in every room's side
    for i in range(1, nx):
        L(wall('z', xs[i], zs[0], zs[-1], fy, fy + H,
               holes=[((zs[j] + zs[j + 1])/2 - 2, (zs[j] + zs[j + 1])/2 + 2, fy, fy + 4) for j in range(nz)]))
    for j in range(1, nz):
        for i in range(nx):
            lo, hi = xs[i] + (0.5 if i > 0 else 0), xs[i + 1] - (0.5 if i + 1 < nx else 0)
            m = (xs[i] + xs[i + 1])/2
            L(wall('x', zs[j], lo, hi, fy, fy + H, holes=[(m - 2, m + 2, fy, fy + 4)]))
    rng = random.Random(seed)
    layouts, keys, cps, trigs = [], [], [], []
    while len(layouts) < n:
        # a maze by random walk from the way in: long passages, short dead ends
        tree, seen, stack = set(), {entry}, [entry]
        while stack:
            c = stack[-1]
            nb = [(c[0] + dx, c[1] + dz) for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1))]
            nb = [q for q in nb if 0 <= q[0] < nx and 0 <= q[1] < nz and q not in seen]
            if not nb: stack.pop(); continue
            q = rng.choice(nb); tree.add(edge(c, q)); seen.add(q); stack.append(q)
        adj = {}
        for a_, b_ in tree: adj.setdefault(a_, []).append(b_); adj.setdefault(b_, []).append(a_)
        prev, q = {entry: None}, [entry]
        for c in q:
            for d_ in adj[c]:
                if d_ not in prev: prev[d_] = c; q.append(d_)
        path, c = [], exit_
        while c is not None: path.append(c); c = prev[c]
        path.reverse()
        if len(path) < minpath: continue
        on = set(path)
        # the dead ends: everything hanging off the way through, by where it joins
        branches = []
        for c in path:
            for d_ in adj[c]:
                if d_ in on: continue
                sub, st = [], [(d_, c)]
                while st:
                    x_, par = st.pop(); sub.append((x_, par))
                    st += [(y_, x_) for y_ in adj[x_] if y_ != par]
                branches.append((c, d_, sub))
        def far(b_):
            # the cell of a branch furthest from where it joins, and how far
            dist = {b_[1]: 1}
            for x_, par in b_[2]:
                if par in dist: dist[x_] = dist[par] + 1
            x_ = max(dist, key=dist.get); return x_, dist[x_]
        if key:
            # not in sight of the door it opens, and never the first thing found
            ok = [b_ for b_ in branches if far(b_)[1] >= 2 and
                  abs(far(b_)[0][0] - exit_[0]) + abs(far(b_)[0][1] - exit_[1]) >= key_far]
            kb = max(ok, key=lambda b_: far(b_)[1], default=None)
            if not kb: continue
        name = '%s%d' % (slot[0].upper(), len(layouts))
        lay = {'name': name, 'tree': tree, 'panels': {}}
        # panels: the way into every dead end, and some of the way through
        path_edges = [edge(a_, b_) for a_, b_ in zip(path, path[1:])]
        k_ = max(2, len(path_edges)*2//5)
        for e_ in rng.sample(path_edges, k_):
            far_cell = e_[1] if path.index(e_[1]) > path.index(e_[0]) else e_[0]
            lay['panels'][e_] = ('empty', far_cell)
        stuff = pool[:]; rng.shuffle(stuff)
        # A dead end that runs on round corners ends in a fight: one of the
        # pool's enemies, waiting in its last room, so walking it is never for
        # nothing. What is left - health, nothing - goes behind the one-room ones.
        fill = {}
        for b_ in branches:
            if (key and b_ is kb) or far(b_)[1] < 2: continue
            foe = next((i_ for i_ in range(len(stuff) - 1, -1, -1) if stuff[i_] not in ('health', 'empty')), None)
            fill[id(b_)] = (stuff.pop(foe) if foe is not None else 'drones', far(b_)[0])
        for b_ in branches:
            e_ = edge(b_[0], b_[1])
            if key and b_ is kb:
                lay['panels'][e_] = ('empty', b_[1])
                kc = far(b_)[0]
                lay['panels'][edge(kc, dict(b_[2])[kc])] = ('guard', kc)
                at = ctr(kc)
                keys.append({'colour': key, 'p': [at[0], fy + 1, at[2]], 'when': [slot, [name]],
                             'do': [{'a': 'checkpoint', 'p': at}]})
                cps.append({'p': at, 'when': [slot, [name]]})
            else:
                lay['panels'][e_] = fill.get(id(b_)) or (stuff.pop() if stuff else 'empty', b_[1])
            # a long dead end gets a second panel in it
            if len(b_[2]) >= 3 and rng.random() < 0.6 and not (key and b_ is kb):
                x_, par = b_[2][rng.randrange(1, len(b_[2]))]
                lay['panels'][edge(x_, par)] = ('empty', x_)
        if loose and enter_vol:
            acts = []
            for (kind, nn), frac in loose:
                acts.append({'a': 'spawn', 'enemies': [{'kind': kind, 'n': nn, 'p': ctr(path[min(len(path) - 1, int(len(path)*frac))])}]})
            trigs.append({'on': 'enter', 'vol': enter_vol, 'when': [slot, [name]], 'do': acts})
        layouts.append(lay)
        if key: print('  %s: path %d, key at %s, %d rooms from the exit' % (name, len(path), kc,
                      abs(kc[0] - exit_[0]) + abs(kc[1] - exit_[1])))
    names = [l_['name'] for l_ in layouts]
    # what fills each doorway, layout by layout
    def doorway(a_, b_):
        if a_[0] != b_[0]:                       # side by side along x: a wall on x = xs[b]
            m = (zs[a_[1]] + zs[a_[1] + 1])/2
            return (lambda **kw: breach(xs[b_[0]], fy, m, 1.2, 4, 4, **kw)), box(xs[b_[0]], fy, m, 1, 4, 4, 'wall')
        m = (xs[a_[0]] + xs[a_[0] + 1])/2
        return (lambda **kw: breach(m, fy, zs[b_[1]], 4, 4, 1.2, **kw)), box(m, fy, zs[b_[1]], 4, 4, 1, 'wall')
    for i in range(nx):
        for j in range(nz):
            for a_, b_ in ((((i, j), (i + 1, j))), (((i, j), (i, j + 1)))):
                if b_[0] >= nx or b_[1] >= nz: continue
                e_ = (a_, b_)
                shut = [l_['name'] for l_ in layouts if e_ not in l_['tree']]
                paned = [l_ for l_ in layouts if e_ in l_['panels']]
                mk, plug = doorway(a_, b_)
                if shut:
                    plug['when'] = [slot, shut]; LATE.append(plug)
                if paned:
                    dos = {}
                    for l_ in paned:
                        what, cell = l_['panels'][e_]
                        dos[l_['name']] = pool_do[what](ctr(cell))
                    LATE.append(mk(when=[slot, [l_['name'] for l_ in paned]], deal=slot, dos=dos))
    return {'slots': [slot], 'items': names}, keys, cps, trigs

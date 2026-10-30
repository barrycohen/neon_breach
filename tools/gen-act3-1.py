#!/usr/bin/env python3
"""Sector 3-1 - The Casting Floor.

Out through four rooms round the molten hall where the Bastion wades, seen
through glass all the way; a switch at the far end pours metal into all of
them; then back through the same four rooms, higher up, over the metal, to a
red hatch over the hall and down into the Bastion's arena. Every room asks
something on the way out and something else on the way back. The design and
its reasons are in docs/campaign-design.md under "Sector 3-1". North is -z.

  HALL          x -20..20   z -20..20   the arena: molten pool, four platforms, the core hanging
  PATTERN SHOP  x -12..12   z 21..41    out at 1: shuttered; the Sunder on the gantry; a relay in a
                                        niche under it lifts the grid's shutter, and one of the nine
                                        panels, dealt by lot, hides the relay that lifts the rest;
                                        back at 18: the gantry, up the grid's top-left alcove to the loft
  THE WARREN    x -50..-19  z 21..47    out at 1: 5x4 rooms, one of six mazes dealt by lot, and a key
  MOULDING LINE x -50..-21  z -20..20   out: a carrier from 1 to 9.5, started by the block filling it,
                                        held at three shutters across the track till the wave each
                                        lets out of a hatch is dead, then on when you're aboard with
                                        your shield back; two platforms off the track; a death starts
                                        the line again; back at 18: a crane's anchor
  THE RACK ROOM x -50..-21  z -41..-21  out at 9.5: 4x3 rooms, one of six mazes dealt by lot
  PATTERN STORE x -20..20   z -46..-21  out at 9.5: three rows of racks, breached through; back:
                                        the rack tops, and a hoist up the middle one, under fire from
                                        pens behind laser grids in both side walls
  VENT FLOOR    x 21..50    z -20..20   out at 9.5: a weaver in the wall, behind a shutter a storm
                                        lifts, a panel and a grate only the Rail goes through; then
                                        the control room at 18 and the pour; back: the catwalk at 18,
                                        under fire from a pen behind a laser grid
  THE LOFT      x 6..20     z 6..20     20, in the hall's roof: the hatch and the glass tube
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lvlbuild import box, room, lid, dedupe_walls, dedupe_floors, hide_floor_edges, drop_buried_trims, unstitch_walls, \
    wall, breach, warren as _warren

G, HAZ, MARKS = [], [{'t': 'void', 'below': -30}], []
def L(*items):
    for it in items:
        if isinstance(it, list): G.extend(it)
        else: G.append(it)

def sill(x, z, w, d, top):
    return box(x, top - 1, z, w, 1, d, 'block', None, walk=True)

def link_x(xa, xb, zc, width, h, y=0, lidded=True):
    x0, x1 = min(xa, xb) + 0.5, max(xa, xb) - 0.5
    cx, ln, top = (x0 + x1)/2, x1 - x0, y + 1
    out = [box(cx, y, zc, ln, 1, width, 'block', 'cyan', walk=True)]
    for sd in (-1, 1): out.append(box(cx, top, zc + sd*(width/2 + 0.5), ln, h, 1, 'wall', 'magenta'))
    out += [sill(xa, zc, 1, width, top), sill(xb, zc, 1, width, top)]
    if lidded: out += lid(x0, x1, zc - width/2 - 1, zc + width/2 + 1, top + h)
    return out

def rects_of(cells, x0, z0, c):
    """Greedy rectangles covering a set of (i, j) grid cells."""
    left = set(cells); out = []
    for (i, j) in sorted(cells, key=lambda t: (t[1], t[0])):
        if (i, j) not in left: continue
        i1 = i
        while (i1 + 1, j) in left: i1 += 1
        j1 = j
        while all((k, j1 + 1) in left for k in range(i, i1 + 1)): j1 += 1
        for k in range(i, i1 + 1):
            for m in range(j, j1 + 1): left.discard((k, m))
        out.append((x0 + i*c, x0 + (i1 + 1)*c, z0 + j*c, z0 + (j1 + 1)*c))
    return out

def corridor(rects, y, h, skip=()):
    """A corridor whose floor is the union of `rects` (x0, x1, z0, z1) at top `y`,
    walled 1m round its outline and lidded at y+h. Walls along the lines in
    `skip` ((axis, fixed): a room's wall the corridor opens through) are left
    out. Built from the outline, so an L's corners close."""
    c = 0.5
    X0 = min(r[0] for r in rects) - 1; Z0 = min(r[2] for r in rects) - 1
    X1 = max(r[1] for r in rects) + 1; Z1 = max(r[3] for r in rects) + 1
    nx, nz = int(round((X1 - X0)/c)), int(round((Z1 - Z0)/c))
    inside = set()
    for i in range(nx):
        for j in range(nz):
            cx, cz = X0 + (i + 0.5)*c, Z0 + (j + 0.5)*c
            if any(r[0] < cx < r[1] and r[2] < cz < r[3] for r in rects): inside.add((i, j))
    band = set()
    for i in range(nx):
        for j in range(nz):
            if (i, j) in inside: continue
            if not any((i + a, j + b) in inside for a in (-2, -1, 0, 1, 2) for b in (-2, -1, 0, 1, 2)): continue
            cx, cz = X0 + (i + 0.5)*c, Z0 + (j + 0.5)*c
            if any((ax == 'x' and abs(cz - f) < 0.5) or (ax == 'z' and abs(cx - f) < 0.5) for ax, f in skip): continue
            band.add((i, j))
    out = []
    for a, b, d0, d1 in rects_of(inside, X0, Z0, c):
        out.append(box((a + b)/2, y - 1, (d0 + d1)/2, b - a, 1, d1 - d0, 'block', 'cyan', walk=True))
    for a, b, d0, d1 in rects_of(band, X0, Z0, c):
        out.append(box((a + b)/2, y, (d0 + d1)/2, b - a, h, d1 - d0, 'wall'))
    for a, b, d0, d1 in rects_of(inside | band, X0, Z0, c):
        out.append(box((a + b)/2, y + h, (d0 + d1)/2, b - a, 0.6, d1 - d0, 'wall'))
    return out

def panel(pid, x, y, z, w, h, d):
    """A shutter: amber, ribbed, it sinks out of the way when `reveal`ed."""
    p = box(x, y, z, w, h, d, 'block', 'amber'); p['id'] = pid
    return p

def storm(sid, x, y, z, w, h, d, **kw):
    s = {'t': 'storm', 'p': [x, y, z], 's': [w, h, d]}
    if sid: s['id'] = sid
    s.update(kw)
    return s

def vent(x, z, w=4, y=1):
    b = box(x, y, z, w, 0.2, w, 'dark')
    b['vent'] = True
    return b

def cage(x, y, z, w, h, d):
    """A grate box round a conduit: seen through, but no Arc gets in - only a
    storm round it does."""
    t = 0.3
    return [box(x, y, z - d/2 + t/2, w, h, t, 'dark', grate=True), box(x, y, z + d/2 - t/2, w, h, t, 'dark', grate=True),
            box(x - w/2 + t/2, y, z, t, h, d - 2*t, 'dark', grate=True), box(x + w/2 - t/2, y, z, t, h, d - 2*t, 'dark', grate=True),
            box(x, y + h, z, w, t, d, 'dark', grate=True)]

def pen(x0, x1, z0, z1, y0, y1, open_):
    """A pen let into a wall: floor, lid and three walls round the inside
    x0..x1 z0..z1 y0..y1, open on the side `open_` ('-x', '+x', '-z', '+z'),
    where the wall it is let into stands - with a hole cut in it, and a laser
    grid across the hole. What is in it can shoot out and be shot, and can't
    get out or fall."""
    cx, cz, w, d = (x0 + x1)/2, (z0 + z1)/2, x1 - x0, z1 - z0
    out = [box(cx, y0 - 1, cz, w, 1, d, 'block', None, walk=True), box(cx, y1, cz, w, 1, d, 'wall')]
    for side, b in (('-x', box(x0 - 0.5, y0 - 1, cz, 1, y1 - y0 + 2, d + 2, 'wall')),
                    ('+x', box(x1 + 0.5, y0 - 1, cz, 1, y1 - y0 + 2, d + 2, 'wall')),
                    ('-z', box(cx, y0 - 1, z0 - 0.5, w, y1 - y0 + 2, 1, 'wall')),
                    ('+z', box(cx, y0 - 1, z1 + 0.5, w, y1 - y0 + 2, 1, 'wall'))):
        if side == open_: continue
        # the x sides run long, past the z ends, so the corners close; on the
        # open side they stop at the wall it is let into
        if side in ('-x', '+x') and open_ in ('-z', '+z'):
            b['s'][2] = d + 1; b['p'][2] = round(cz + (0.5 if open_ == '-z' else -0.5), 2)
        out.append(b)
    return out

def grid(gid, x, y, z, w, h, d):
    return {'t': 'laser', 'id': gid, 'p': [x, y, z], 's': [w, h, d], 'dmg': 30}

LATE = []    # pieces dealt by lot, kept out of the merge passes: fused with a neighbour, a closet's back would stay when it should go

def warren(*a, **kw): return _warren(L, LATE, *a, **kw)

def molten(mid, x, z, w, d, top, depth=1.5, **kw):
    """Molten metal to `top`, `depth` deep - down to the floor under it, or it only
    burns the top of the pool and you stand safe on the floor beneath. Poured, it
    rises into place."""
    m = {'t': 'molten', 'p': [x, top - depth, z], 's': [w, depth, d], 'burn': 100}
    if mid: m['id'] = mid
    m.update(kw)
    return m

TOP = 28                     # the halls' roof
OUT, BACK = 9.5, 18          # the north rooms' floor; the way back, everywhere
HZW = -13                    # the weaver's housing in the vent floor's east wall
LOFT = 20                    # level with the shop grid's top row: the ledge off it is the loft's door

# ================================================================ THE LINES
# The three halls - the Moulding Line, the hall, the Vent Floor - stand side by
# side between two long walls, and share the walls between them. Windows in
# every one look into the hall.
L(wall('x', 20.5, -51, 51, -5, TOP, holes=[
    (-30, -26, 0, 6),                      # out: the annex onto the carrier's dock
    (-8, 8, 2, 8),                         # the shop's windows
    (-25, -21, BACK - 1, BACK + 4),        # back: off the crane's landing into the shop
    (13, 17, LOFT - 1, LOFT + 4)],         # back: the ledge beside the shop's grid into the loft
    windows=[1]))
# Back: pens let into the walls high up, laser grids across them - what is in
# them shoots out and can be shot, and can't come out or fall in the metal.
# Before them, the way back's enemies dropped into the metal between the racks,
# hard to see and harmless; these have to be fought. Each fight shuts a door
# till it is won, and the grids go off with it.
VPEN = (32, 40, -24.5, -21, BACK + 1, BACK + 7)                               # the vent floor's, over the catwalk's north end
SPENS = [(-24.5, -21, -34, -26, 21, 26.5, '+x'), (21, 24.5, -34, -26, 21, 26.5, '-x')]   # the store's, west and east
L(pen(*VPEN, '+z'))
for x0, x1, z0, z1, y0, y1, o_ in SPENS: L(pen(x0, x1, z0, z1, y0, y1, o_))
HAZ += [grid('g_vpen', 36, BACK + 1, -20.5, 8, 6, 0.3),
        grid('g_spenW', -20.5, 21, -30, 0.3, 5.5, 8), grid('g_spenE', 20.5, 21, -30, 0.3, 5.5, 8)]
L(wall('x', -20.5, -51, 51, -5, TOP, holes=[
    (-30, -26, OUT - 1, OUT + 5),          # out: the carrier's far dock to the store
    (-50, -47, BACK - 1, BACK + 4),        # back: from the store onto the crane's catwalk
    (-16, 16, OUT + 1.5, OUT + 7.5),       # the store's windows
    (26, 30, OUT - 1, OUT + 5),            # out: store to vent floor
    (46, 50, BACK - 1, BACK + 4),          # back: off the vent floor's catwalk to the store
    (32, 40, BACK + 1, BACK + 7)],         # back: the vent floor's pen
    windows=[2]))
L(wall('z', -20.5, -20, 20, -5, TOP, holes=[(-16, -4, 3, 13), (4, 16, 3, 13)], windows=[0, 1]))      # moulding | hall
L(wall('z', 20.5, -20, 20, -5, TOP, holes=[(-16, 10, OUT + 1.5, OUT + 7.5)], windows=[0]))           # hall | vent floor
L(wall('z', 50.5, -20, 20, OUT - 1, TOP, holes=[(HZW - 2, HZW + 2, OUT + 2, OUT + 6)]))                                    # (the moulding line's west wall, with its hatches, is with the line)
L(lid(-51, 51, -21, 21, TOP))
L(sill(-28, 20.5, 4, 1, 1), sill(-23, 20.5, 4, 1, BACK), sill(15, 20.5, 4, 1, LOFT),
  sill(-28, -20.5, 4, 1, OUT), sill(-48.5, -20.5, 3, 1, BACK), sill(28, -20.5, 4, 1, OUT), sill(48, -20.5, 4, 1, BACK))

# ================================================================= THE HALL
# Four platforms in the corners, each a double jump from the next, and the
# core hanging over the middle. The Bastion wades round under it all level.
for ix, iz in ((12, -12), (-12, -12), (-12, 12), (12, 12)):
    L(box(ix, -12, iz, 9, 14, 9, 'block', 'amber', walk=True))               # top 2
BED = box(0, -4.7, 0, 40, 1, 40, 'block'); BED['bed'] = True; L(BED)
HAZ.append({'id': 'pool', 't': 'molten', 'p': [0, -4, 0], 's': [40, 1.5, 40], 'burn': 70})
# the loft, in the roof over the south-east platform; its way down is a hatch
# and a glass tube, so nothing in it can be shot from above
HX, HZ = 12, 12
L(box(8.25, LOFT - 1, 13, 4.5, 1, 14, 'block', 'cyan', walk=True),           # x 6..10.5
  box(16.75, LOFT - 1, 13, 6.5, 1, 14, 'block', 'cyan', walk=True),          # x 13.5..20
  box(HX, LOFT - 1, 8.25, 3, 1, 4.5, 'block', 'cyan', walk=True),            # z 6..10.5
  box(HX, LOFT - 1, 16.75, 3, 1, 6.5, 'block', 'cyan', walk=True))           # z 13.5..20
L(breach(HX, LOFT - 1, HZ, 3, 1, 3, walk=True, boss=True))
L(wall('z', 5.5, 5, 20, LOFT, TOP), wall('x', 5.5, 6, 20, LOFT, TOP))
TUBE = 13
for pane in (box(HX - 1.65, TUBE, HZ, 0.3, LOFT - 1 - TUBE, 3.6, 'dark'), box(HX + 1.65, TUBE, HZ, 0.3, LOFT - 1 - TUBE, 3.6, 'dark'),
             box(HX, TUBE, HZ - 1.65, 3, LOFT - 1 - TUBE, 0.3, 'dark'), box(HX, TUBE, HZ + 1.65, 3, LOFT - 1 - TUBE, 0.3, 'dark')):
    pane['window'] = True; L(pane)


# ============================================================== PATTERN SHOP
# Out: you come in, the door shuts, and the windows and the way on are behind
# shutters. The Sunder is on the gantry, by tether; its anchor goes out when you
# take it, so once down you stay down. Under the gantry's west end, too deep in
# the wall to see from up there, a panel hides a relay: that lifts the shutters
# off the windows and off the east wall's nine panels, three by three - you
# break those with the Bastion in view - and one of them hides the relay that
# opens the way on.
# Back: the floor is metal. In along the gantry, across into the grid's top
# row - the alcoves you opened are footholds - and up to the loft's door.
L(room(0, 49, 10, 8, h=6, doors=[('n', 0, 6, 6)]))                           # arrival, z 45..53
L(box(0, 0, 43.25, 6, 1, 3.5, 'block', 'cyan', walk=True))                  # z 41.5..45
L(wall('z', -3.5, 42, 45, 1, 7), wall('z', 3.5, 42, 45, 1, 7), lid(-4, 4, 42, 45, 7))
L(box(0, 0, 31, 24, 1, 20, 'block', 'cyan', walk=True))                      # the floor, z 21..41, under the gantry too
EXZ = 37.25                                                                   # the way on, west into the warren
NZ = 23                                                                       # the niche under the gantry's west end
L(wall('z', -12.5, 21, 41, 1, 26, holes=[(EXZ - 2, EXZ + 2, 0, 5), (21, 25, 0, 4), (21, 25, BACK - 1, BACK + 4)]))
COLS, ROWS = (27, 32, 37), (10, 15, 20)                                       # the grid: alcove floors at 10, 15, 20
L(wall('z', 12.5, 21, 41, 1, 26, holes=[(zc - 2, zc + 2, rw, rw + 4) for zc in COLS for rw in ROWS]))
L(wall('x', 41.5, -13, 13, 1, 26, holes=[(-3, 3, 1, 7)]))
L(lid(-13, 13, 21, 42, 26))
L(box(-5.5, BACK - 1, 23, 13, 1, 4, 'block', 'cyan', walk=True))             # the gantry x -12..1, 18
L(sill(-12.5, 23, 1, 4, BACK), sill(-12.5, NZ, 1, 4, 1), sill(-12.5, EXZ, 1, 4, 1))   # the gantry's door; the niche's mouth, the way on's
# the niche, x -18..-13 z 21..25, 3m high: its panel 3.5m in, where a burst at
# its mouth - all the gantry can see of it - is too far away to break it
L(box(-15.5, 0, NZ, 5, 1, 4, 'block', None, walk=True))
L(box(-15.5, 1, 25.5, 5, 3, 1, 'wall'), box(-15.5, 4, 23.5, 5, 0.6, 5, 'wall'))
L(breach(-16.5, 1, NZ, 1.2, 3, 4))
# the grid's alcoves, x 13..17, behind the east wall; and beside the first
# column, level with its top alcove, the loft's ledge - that alcove is the only
# way on to it
L(box(17.5, 9, 31.5, 1, 18, 17, 'wall'))                                     # their back, z 23..40
L(box(15, 9, 24.5, 4, 10, 1, 'wall'), box(15, 9, 29.5, 4, 15, 1, 'wall'),
  box(15, 9, 34.5, 4, 15, 1, 'wall'), box(15, 9, 39.5, 4, 15, 1, 'wall'))   # between them (the first's end under the ledge)
for zc in COLS:
    for rw in ROWS:
        L(box(15, rw - 1, zc, 4, 1, 4, 'block', None, walk=True))
# the top-left one's back wall has an amber square on it, as the game marks
# somewhere there is something to do: with every panel broken it is the one
# that is more than a hole (on its floor, from below, it would be only a line).
SIGNS = [{'p': [16.95, ROWS[2] + 2, COLS[0]], 'face': 'x', 's': [3.2, 3.2], 'trim': 'amber'},
         # and in it, which way: north, to the loft door
         {'p': [16.88, ROWS[2] + 2, COLS[0]], 'face': 'x', 's': [2.0, 2.4], 'arrow': '-z'}]
L(box(15, 24, 30.25, 4, 1, 18.5, 'wall'))                                     # their roof, and the ledge's, z 21..39.5
L(box(15, LOFT - 1, 23, 4, 1, 4, 'block', 'cyan', walk=True))                # the ledge x 13..17 z 21..25, 20
L(box(17.5, LOFT - 1, 22, 1, 6, 2, 'wall'))
# A shuttered panel fills its wall's thickness, and its shutter lies flat on the
# wall's face: a panel proud of the wall would hold its shutter off it, and a
# burst beside the shutter would get into the slot behind and break the panel
# before the shutter was down.
L(panel('sh_grid', 11.75, 9.8, 32, 0.5, 14.4, 14.4))                          # over all nine
# What is behind each panel is dealt by lot, every time: the relay is in a
# different place each play, and so is everything else.
def sp(kind, n):
    return lambda at: [{'a': 'spawn', 'enemies': [{'kind': kind, 'n': n, 'p': at}]}]
def drop(at): return [{'a': 'drop', 'p': [at[0], at[1] + 0.5, at[2]], 'hp': 1, 'life': 900}]
GRID_ITEMS = ['relay', 'mites', 'drones', 'rushers', 'sentinel', 'lancer', 'severer', 'mites', 'empty']
GRID_DO = {'relay': lambda at: [], 'empty': lambda at: [], 'mites': sp('mite', 4), 'drones': sp('drone', 2),
           'rushers': sp('rusher', 3), 'sentinel': sp('sentinel', 1), 'lancer': sp('lancer', 1), 'severer': sp('severer', 1)}
GRID_SLOTS, RELAYS = [], []
for ci, zc in enumerate(COLS):
    for ri, rw in enumerate(ROWS):
        n = 'g%d%d' % (ci, ri); GRID_SLOTS.append(n)
        b = breach(12.5, rw, zc, 1.0, 4, 4); b['deal'] = n
        b['dos'] = {it: GRID_DO[it]([15, rw, zc]) for it in sorted(set(GRID_ITEMS))}
        L(b)
        # the relay hangs high in its alcove, where an arc from the floor can find it
        RELAYS.append({'id': 'c_shop', 'p': [13.4, rw + 2.5, zc], 'when': [n, ['relay']], 'do': [
            {'a': 'reveal', 'panel': 'sh_exit'},
            {'a': 'checkpoint', 'p': [0, 1, 34]}]})
RELAYS.append({'id': 'c_grid', 'p': [-17.5, 2.5, NZ], 'do': [           # the grid, and the windows on the hall while you work at it
    {'a': 'reveal', 'panel': 'sh_grid'}, {'a': 'reveal', 'panel': 'sh_win'}, {'a': 'checkpoint', 'p': [-4, 1, 28]}]})
SHUFFLE = [{'slots': GRID_SLOTS, 'items': GRID_ITEMS}]
L(panel('sh_win', 0, 2, 21.15, 16, 6, 0.3))                                   # over the windows
L(breach(-12.5, 1, EXZ, 1.0, 4, 4), panel('sh_exit', -11.75, 1, EXZ, 0.5, 4.6, 4.4))   # the way on, and its shutter
L(box(-4, 1, 37, 3.6, 2.6, 3.6, 'block', 'cyan'), box(5, 1, 30, 3.6, 2.6, 3.6, 'block', 'cyan'))
# the passage west, x -18..-13
L(box(-16, 0, EXZ, 6, 1, 4, 'block', 'cyan', walk=True))                    # x -19..-13, under the warren's wall too
L(wall('x', EXZ - 2.5, -18, -13, 1, 7), wall('x', EXZ + 2.5, -18, -13, 1, 7), lid(-18, -13, EXZ - 3, EXZ + 3, 7))
# back: off the crane's landing to the gantry
L(corridor([(-25, -13, 21, 25)], BACK, 5, skip=[('x', 20.5), ('z', -12.5)]))

# ============================================================== THE WARREN
# Out of the shop to the carrier's dock: twenty rooms, x -50..-19 z 21..47, and
# which of their doorways are open, which are panels and which are wall is one
# of six layouts, dealt by lot. The dock's door wants the lime key, at the end of
# the longest dead end that is well away from that door, behind a panel of its
# own with a sentinel and drones behind it; the rest hold lancers, sentinels,
# drones, a severer, mites, health, or nothing. No rushers: out of a panel at
# arm's length there is no time to shoot one.
AX, AZ = [-50, -43.5, -37, -31, -25, -19], [21, 27.5, 34, 40.5, 47]
L(box(-34.5, 0, 34, 31, 1, 26, 'block', 'cyan', walk=True))
L(wall('x', 47.5, -51, -18, 1, 7), wall('z', -50.5, 21, 47, 1, 7),
  wall('z', -18.5, 21, 47, 1, 7, holes=[(EXZ - 2, EXZ + 2, 1, 5)]))
L(lid(-51, -18, 21, 48, 7))
WARREN_DO = {'mites': sp('mite', 4), 'drones': sp('drone', 2), 'lancer': sp('lancer', 1), 'sentinel': sp('sentinel', 1),
             'severer': sp('severer', 1), 'health': drop, 'empty': lambda at: [],
             'guard': lambda at: [{'a': 'spawn', 'enemies': [{'kind': 'sentinel', 'n': 1, 'p': at},
                                                             {'kind': 'drone', 'n': 2, 'p': at}]}]}
sh, KEYS, KEY_CPS, WARREN_TRIGS = warren(
    'annex', AX, AZ, 1, 6, (4, 2), (3, 0), 6, 31, 9,
    ['lancer', 'mites', 'health', 'drones', 'sentinel', 'severer', 'empty', 'lancer', 'health', 'mites'], WARREN_DO, key='lime',
    loose=[(('sentinel', 1), 0.4), (('drone', 2), 0.75)],
    enter_vol={'p': [-15.5, 2.5, EXZ], 's': [4, 3, 4]})
SHUFFLE.append(sh)

# ============================================================= MOULDING LINE
# Out: a carrier with a block on it, filling it, at its dock. Breach the block
# and it shuttles to the first shutter across the track. Ride it there and the
# dock shuts behind you, a hatch high in the west wall opens, and a wave comes
# out of it; the carrier holds there till the last of them is dead. Then the
# shutter lifts and the hatch shuts, and the carrier waits for you: it sets off
# for the next when you are aboard with your shield back. Two platforms stand
# off the track between the stops, somewhere to go in a fight; the pour sinks
# them. A death anywhere on the line starts it again from the dock - the
# checkpoints at the stops put you back on a carrier under fire with nothing
# left, and hung in the air over the metal after. The last shutter is the far
# dock's door, 8.5m up, past anything a jump does. Nothing is shot open here:
# the waves are the way on.
# Back: the metal rises over the docks. From the catwalk in the north-west
# corner to the landing in the south-east is too far to jump: the way across is
# an anchor riding a crane line overhead, lit by the pour.
# The line's bed is at 0, a metre under the docks: whatever is in the metal is
# in it to the waist, and you see it. Deep, it closed over your head and over
# anything that fell in, and the bottom looked like dry floor.
BEDM = box(-35.5, -1, 0, 29, 1, 40, 'block'); BEDM['bed'] = True; L(BEDM)
HAZ.append(molten(None, -35.5, 0, 29, 40, 0.6, depth=1.6))                     # under the docks' lip: they stay safe
HAZ.append(molten('lava_m', -35.5, 0, 29, 40, 1.3, depth=2.3, off=True, riseFrom=0.6, riseT=6))   # over the docks
L(box(-28, 0, 16, 4, 1, 8, 'block', 'cyan', walk=True))                      # the dock x -30..-26 z 12..20
# Its roof is a ledge the first fight could be fought from - uncovered, and no
# better than the carrier. Built up to the roof it stood in the crane's swing.
L(wall('z', -30.5, 12, 20, 1, 6), wall('z', -25.5, 12, 20, 1, 6), lid(-31, -25, 12, 20, 6))
L(box(-28, OUT - 1, -18, 4, 1, 4, 'block', 'cyan', walk=True))              # the far dock x -30..-26 z -20..-16, 9.5,
L(box(-30.5, OUT, -18.35, 1, TOP - OUT, 3.3, 'wall'), box(-25.5, OUT, -18.35, 1, TOP - OUT, 3.3, 'wall'))  # walled to the roof
L(box(-28, OUT + 5, -16.35, 4, TOP - OUT - 5, 0.7, 'wall'))                   # over its door
CA_D1, CA_D2 = [-28, 0, 9.9], [-28, OUT - 1, -13.9]
def on_line(t): return [-28, round(CA_D1[1] + (CA_D2[1] - CA_D1[1])*t, 3), round(CA_D1[2] + (CA_D2[2] - CA_D1[2])*t, 3)]
STOPS = [on_line(0.25), on_line(0.55), CA_D2]
DOCK_CP = {'a': 'checkpoint', 'p': [-28, 1, 16]}
# as tall as it is wide, and 2cm in from the carrier's edges: flush with them,
# its sides and the carrier's shared a plane, and the edge flickered. The dock's
# checkpoint is taken on arriving there, before the block: a death on the line
# puts it back, and the carrier parked behind it.
L(breach(-28, 1, CA_D1[2], 3.96, 3.96, 3.96, on='A', id='cube', do=[{'a': 'start', 'mover': 'A'}]))
# the platforms off the track: P1 a jump from the first stop, P2 from the
# second (and a double jump from P1); 12m and more from the hatches, so nothing
# gets into one. Movers only so the pour can sink them, rather than leave them
# somewhere to be stuck over the metal on the way back.
PLATS = [('P1', [-36, 3.5, 6]), ('P2', [-36, 6.5, -7])]
PLAT_SINK = 0.3                                                               # their tops, sunk: under the metal at 1.3
# Each stop's wave, out of a hatch in the west wall; and what is at the stop
WAVES = [
    [('lancer', 1), ('sentinel', 1), ('drone', 2)],
    [('severer', 1), ('lancer', 2), ('drone', 2)],
    [('bulwark', 1), ('sentinel', 1), ('lancer', 1), ('drone', 2)]]
# each hatch's z, and its floor: further over the carrier at its stop than a
# boost, or you could get into one and be shut in it when the wave was down
HATCHES = [(6, 12), (-2, 14.5), (-10, 18.5)]
BODY = {'drone': 0.8, 'lancer': 1.05, 'severer': 1.0, 'sentinel': 1.3, 'bulwark': 1.5}
def bay_spawn(wave, hy, hz):
    # Each its own place down the middle of the bay, the small ones at the back
    # and the big ones in its mouth. All on one spot, scattered by two metres,
    # some started deep in the bay, and the push apart threw them through its
    # walls - out behind the room's, where nothing could reach them.
    kinds = sorted((kd for kd, nn in wave for _ in range(nn)), key=BODY.get)
    return [{'kind': kd, 'n': 1, 'fixed': True, 'p': [round(-53.1 + 0.9*i, 2), hy + 1, hz]}
            for i, kd in enumerate(kinds)]
LINE_TRIGS, HATCH_DOORS, GATE_DOORS = [], [], []
WEST_HOLES = []
for k, st in enumerate(STOPS):
    sy, sz = st[1], st[2]
    hz, hy = HATCHES[k]
    # the hatch: a bay 3m into the wall, behind a door
    WEST_HOLES.append((hz - 2, hz + 2, hy, hy + 4))
    L(box(-52.5, hy - 1, hz, 3, 1, 4, 'block', None),                          # (the wall under the hatch is its sill)
      wall('x', hz - 2.5, -54.5, -51, hy - 1, hy + 4), wall('x', hz + 2.5, -54.5, -51, hy - 1, hy + 4),
      wall('z', -54.5, hz - 2, hz + 2, hy - 1, hy + 4), lid(-55, -51, hz - 3, hz + 3, hy + 4))
    HATCH_DOORS.append({'id': 'dHatch%d' % k, 'p': [-50.5, hy, hz], 's': [1.2, 4, 4], 'lock': 'script'})
    clear = [{'a': 'seal', 'door': 'dHatch%d' % k}]
    vol = {'p': [-28, round(sy + 2.5, 3), sz], 's': [4, 3, 4]}                 # on the carrier at the stop
    if k < 2:
        # the gate: a shutter across the track in a frame no higher than it (up
        # to the roof, the frame's head would be a wall for drones to hide behind)
        zg = round(sz - 2.45, 3)
        # Its posts stand clear of the carrier by more than your feet hang over
        # its edge: flush with it, a post took you off the edge as you went by,
        # and up on top of it.
        GATE_DOORS.append({'id': 'dGate%d' % k, 'p': [-28, round(sy - 0.5, 3), zg], 's': [5.8, 6.5, 0.6], 'lock': 'script'})
        L(box(-31.3, 0, zg, 0.8, round(sy + 6.6, 3), 0.6, 'wall'), box(-24.7, 0, zg, 0.8, round(sy + 6.6, 3), 0.6, 'wall'),
          box(-28, round(sy + 6, 3), zg, 5.8, 0.6, 0.6, 'wall', 'magenta'))
        clear += [{'a': 'open', 'door': 'dGate%d' % k},
                  {'a': 'drop', 'p': [-28, sy + 1.5, sz], 'hp': 1, 'life': 900},
                  {'a': 'count', 'id': 'line%d' % k}]
        # on again only with you aboard and your shield back
        LINE_TRIGS.append({'on': 'enter', 'vol': vol, 'need': {'count': 'line%d' % k, 'shield': True}, 'do': [
            {'a': 'move', 'mover': 'A', 'to': STOPS[k + 1], 'period': 6 if k == 0 else 8},
            {'a': 'guide', 'ids': [['g_s1', 'g_ride'][k]]}]})
    else:
        clear += [{'a': 'open', 'door': 'dFar'}, {'a': 'checkpoint', 'p': [-28, OUT, -18]}]
    start = [{'a': 'move', 'mover': 'A', 'to': st, 'period': 6}]                # it waits here till the wave is down
    if k == 0: start.append({'a': 'seal', 'door': 'dDock'})
    LINE_TRIGS.append({'on': 'enter', 'vol': vol, **({'need': {'count': 'line%d' % (k - 1)}} if k else {}), 'do': start + [
        {'a': 'open', 'door': 'dHatch%d' % k},
        {'a': 'spawn', 'enemies': bay_spawn(WAVES[k], hy, hz)},
        {'a': 'arena', 'onClear': clear}]})
L(wall('z', -50.5, -20, 20, -5, TOP, holes=WEST_HOLES))
L(box(-48.5, BACK - 1, -18.5, 3, 1, 3, 'block', 'cyan', walk=True))          # the catwalk x -50..-47 z -20..-17, 18
L(box(-23, BACK - 1, 18.5, 4, 1, 3, 'block', 'cyan', walk=True))             # the landing x -25..-21 z 17..20, 18

# ============================================================ THE RACK ROOM
# Off the far dock to the store: twelve rooms, x -50..-21 z -41..-21 at 9.5,
# dealt the same way, without a key.
RX, RZ = [-50, -43.5, -37, -31, -21], [-41, -34.5, -28, -21]
L(box(-35.5, OUT - 1, -31, 29, 1, 20, 'block', 'cyan', walk=True))
L(wall('z', -50.5, -42, -21, OUT, OUT + 5.5), wall('x', -41.5, -51, -21, OUT, OUT + 5.5))
L(lid(-51, -21, -42, -21, OUT + 5.5))
sh, _, _, RACK_TRIGS = warren(
    'racks', RX, RZ, OUT, 5.5, (3, 2), (3, 0), 6, 7, 6,
    ['lancer', 'mites', 'health', 'drones', 'sentinel', 'empty'], WARREN_DO,
    loose=[(('lancer', 1), 0.5), (('mite', 4), 0.85)],
    enter_vol={'p': [-28, OUT + 1.5, -22.5], 's': [4, 3, 2]})
SHUFFLE.append(sh)

# ============================================================= PATTERN STORE
# Out: three rows of pattern racks across the store, 5m deep. Each row has a
# panel through it at the bottom, and none of the rows has a gap: breach your
# way through, west to east, with something waiting in every bay. Bulwarks hold
# the last.
# Back: the metal covers the floor. The first rack top is level with the
# balcony; the middle one stands 8m higher, under the roof, and a hoist between
# them is the only way up; down from it to the last, 21, and the far balcony.
L(box(0, OUT - 1, -33.5, 40, 1, 25, 'block', 'cyan', walk=True))            # x -20..20 z -46..-21
# A closet in the north wall beside the middle row's panel, x 3..7: out of the
# panel you turn right, to the sentinel, and its door opens on your left. The
# lancers in it stood in the open corner before, in plain sight of the panel.
L(box(5, OUT - 1, -49, 4, 1, 4, 'block', None, walk=True),
  wall('z', 2.5, -51.5, -47, OUT - 1, OUT + 5), wall('z', 7.5, -51.5, -47, OUT - 1, OUT + 5),
  wall('x', -51.5, 2, 8, OUT - 1, OUT + 5), lid(2, 8, -52, -47, OUT + 5))
L(wall('x', -46.5, -21, 21, OUT - 1, TOP, holes=[(3, 7, OUT, OUT + 5)]),
  wall('z', -20.5, -46, -21, OUT - 1, TOP, holes=[(-40, -36, OUT - 1, OUT + 5), (-45, -42, BACK - 1, BACK + 4), (-34, -26, 21, 26.5)]),
  wall('z', 20.5, -46, -21, OUT - 1, TOP, holes=[(-40, -36, OUT - 1, OUT + 5), (-45, -42, BACK - 1, BACK + 4), (-34, -26, 21, 26.5)]))
L(lid(-21, 21, -47, -21, TOP))
L(sill(-20.5, -38, 1, 4, OUT), sill(20.5, -38, 1, 4, OUT), sill(-20.5, -43.5, 1, 3, BACK), sill(20.5, -43.5, 1, 3, BACK))
RACKS = [(-10, -26, 21), (0, -41, 26), (10, -26, BACK)]                       # each row's x, the z of its panel, its top
for rx, pz, top in RACKS:
    for z0, z1 in ((-46, pz - 2), (pz + 2, -21)):
        if z1 - z0 > 0: L(box(rx, OUT, (z0 + z1)/2, 5, top - OUT, z1 - z0, 'block', None, walk=True))
    L(box(rx, OUT + 4, pz, 5, top - OUT - 4, 4, 'block', None, walk=True))   # over the panel
    L(breach(rx, OUT, pz, 5, 4, 4))
for bx in (-17.75, 17.75):                                                    # balconies at the back doors, 18
    L(box(bx, BACK - 1, -43.5, 4.5, 1, 3, 'block', 'cyan', walk=True))
# out: on to the vent floor
L(corridor([(21, 30, -40, -36), (26, 30, -36, -21)], OUT, 5, skip=[('z', 20.5), ('x', -20.5)]))
# back: from the vent floor's catwalk round to the store, and on to the moulding line
L(corridor([(46, 50, -45, -21), (21, 46, -45, -42)], BACK, 5, skip=[('x', -20.5), ('z', 20.5)]))
L(corridor([(-50, -47, -45, -21), (-47, -21, -45, -42)], BACK, 5, skip=[('x', -20.5), ('z', -20.5)]))

# ================================================================ VENT FLOOR
# Out: the weaver is shut in a housing in the east wall and weaves the room -
# what it covers takes next to nothing. Behind a shutter, a panel, then a
# grate: break the cover in the floor across the room and a storm rises from
# the vent under it; arc through the storm to the relay caged beside it and the
# shutter drops; the Sunder takes the panel; and only the Rail goes through the
# grate. Won, the door to the stairs opens:
# up to a control room at 18, windows over the floor, and the relay that pours
# the metal - you watch it fill the room below.
# Back: out of the control room's other door, north along the catwalk at 18.
# The vent and its relay are in the south-west of the floor, 37m from the
# weaver, so the storm is somewhere you have to be.
WX, WZ = 25, 4                                                                # the cover, x 23..27 z 2..6
RZ = WZ + 4.3                                                                 # the relay, caged beside it
for x0, x1, z0, z1 in ((21, 46, -20, WZ - 2), (21, 46, WZ + 2, 15), (21, WX - 2, WZ - 2, WZ + 2), (WX + 2, 46, WZ - 2, WZ + 2)):
    L(box((x0 + x1)/2, OUT - 1, (z0 + z1)/2, x1 - x0, 1, z1 - z0, 'block', 'cyan', walk=True))
L(box(48, OUT - 1, -2.5, 4, 1, 35, 'block', None, walk=True))                # the strip x 46..50, under the catwalk
L(box(WX, OUT - 1.5, WZ, 4, 0.5, 4, 'block', None))                          # the recess
L(vent(WX, WZ, y=OUT - 1))
L(breach(WX, OUT - 0.3, WZ, 4, 0.3, 4, id='cover', walk=True, do=[{'a': 'hazard', 'id': 's_vent', 'on': True}]))
L(cage(WX, OUT, RZ, 3.6, 3.4, 3.6))
# it pours up out of the vent, over the relay: 8m across, or its puffs are
# sized to a narrow side and it reads as a haze
HAZ.append(storm('s_vent', WX, OUT, (WZ - 3 + RZ + 3)/2, 8, 8, RZ + 3 - (WZ - 3), off=True, rise=[0.3, 8], riseT=3))
# the housing, x 51..60: the shutter on the wall's face, the panel in its mouth,
# the grate a metre in, and the weaver far enough behind it that a burst on the
# grate cannot reach it
L(panel('sh_weave', 49.75, OUT + 1.6, HZW, 0.5, 4.8, 4.4))     # past the mouth on every side
L(breach(50.5, OUT + 2, HZW, 1.0, 4, 4))
L(box(52, OUT + 2, HZW, 0.3, 4, 4, 'dark', grate=True))
L(box(55.5, OUT + 1, HZW, 9, 1, 6, 'wall'), box(55.5, OUT + 6, HZW, 9, 1, 6, 'wall'),
  box(55.5, OUT + 2, HZW - 2.5, 9, 4, 1, 'wall'), box(55.5, OUT + 2, HZW + 2.5, 9, 4, 1, 'wall'),
  box(59.5, OUT + 2, HZW, 1, 4, 4, 'wall'))
L(box(48, BACK - 1, -6.5, 4, 1, 27, 'block', 'cyan', walk=True))             # the catwalk x 46..50 z -20..7, 18
L(box(48, BACK - 1, 18, 4, 1, 4, 'block', 'cyan', walk=True))               # the landing at the stairs' top
# the control room, x 36..50 z 8..15 at 18, between the stairs and the catwalk
L(box(43, BACK - 1, 11.5, 14, 1, 7, 'block', 'cyan', walk=True))
L(wall('x', 7.5, 35, 50, BACK - 1, BACK + 5, holes=[(37, 45, BACK + 1, BACK + 4), (46, 50, BACK - 1, BACK + 4)], windows=[0]))
L(wall('z', 35.5, 8, 15, BACK - 1, BACK + 5, holes=[(9, 14, BACK + 1, BACK + 4)], windows=[0]))
L(lid(35, 50, 7, 15, BACK + 5))
L(sill(48, 7.5, 4, 1, BACK), sill(48, 15.5, 4, 1, BACK))
L(box(43, BACK, 14.3, 4, 1.1, 1.4, 'block', 'cyan'))                         # the console
# the stairs, behind the door the fight opens
L(wall('x', 15.5, 21, 50, OUT - 1, TOP, holes=[(22, 26, OUT - 1, OUT + 4), (46, 50, BACK - 1, BACK + 4)]))
L(sill(24, 15.5, 4, 1, OUT))
L(box(24, OUT - 1, 18, 4, 1, 4, 'block', 'cyan', walk=True))                # the foot x 22..26 z 16..20
N_ST = 14
for i in range(N_ST):
    x0, x1 = 26 + i*(20/N_ST), 26 + (i + 1)*(20/N_ST)
    L(box(round((x0 + x1)/2, 3), OUT - 1, 18, round(x1 - x0, 3), 1 + (BACK - OUT)*(i + 1)/N_ST, 4, 'block', 'cyan', walk=True))

CTRL_CP = {'a': 'checkpoint', 'p': [43, BACK, 11]}
POUR = [
    {'a': 'brief', 'title': 'THE POUR', 'sub': 'Every room you came through is filling with metal.'},
    {'a': 'hazard', 'id': 'lava_m', 'on': True}, {'a': 'hazard', 'id': 'lava_shop', 'on': True},
    {'a': 'hazard', 'id': 'lava_niche', 'on': True}, {'a': 'hazard', 'id': 'lava_pass', 'on': True},
    {'a': 'hazard', 'id': 'lava_store', 'on': True}, {'a': 'hazard', 'id': 'lava_vent', 'on': True},
    # every way out of a flooded room at its floor shuts: nobody wades out of it
    {'a': 'seal', 'door': 'dStairs'}, {'a': 'seal', 'door': 'dVentS'}, {'a': 'seal', 'door': 'dStoreE'},
    {'a': 'seal', 'door': 'dStoreW'}, {'a': 'seal', 'door': 'dWarren'}, {'a': 'seal', 'door': 'dShopW'},
    {'a': 'seal', 'door': 'dAmbush'},
    {'a': 'open', 'door': 'dCtrl'}, {'a': 'open', 'door': 'dLoft'}, {'a': 'open', 'door': 'dBackShop'},
    {'a': 'open', 'door': 'dLineN'}, {'a': 'open', 'door': 'dLineS'},
    {'a': 'anchors', 'ids': ['t1']}, {'a': 'start', 'mover': 'H'},
    *[{'a': 'move', 'mover': pid, 'to': [pp[0], PLAT_SINK - 1, pp[2]], 'period': 12} for pid, pp in PLATS],
    {'a': 'spawn', 'enemies': [{'kind': 'drone', 'n': 2, 'p': [38, BACK + 3, -6]}]},
    CTRL_CP]
# A metre deep over each floor, and no more: under your eyes, so in it you see
# it. The shop's runs on under the gantry, into the niche and the passage -
# stopped at the shop's wall, it left both to stand in.
SHOP_LAVA = ['lava_shop', 'lava_niche', 'lava_pass']
HAZ += [molten('lava_shop', 0, 31, 24, 20, 2.1, depth=1.6, off=True, riseFrom=1),
        molten('lava_niche', -15, NZ, 6, 4, 2.1, depth=1.6, off=True, riseFrom=1),
        molten('lava_pass', -13.5, EXZ, 3, 4, 2.1, depth=1.6, off=True, riseFrom=1),
        molten('lava_store', 0, -33.5, 40, 25, OUT + 1.1, depth=1.6, off=True, riseFrom=OUT),
        molten('lava_vent', 35.5, -2.5, 29, 35, OUT + 1.1, depth=1.6, off=True, riseFrom=OUT, riseT=9)]

# Something in a pen: put exactly there, and held at its height. Left to find
# its own, it found the pen's lid below its probe for the ground and hovered up
# through it, out over the store.
PEN_HOVER = {'lancer': 3.8, 'sentinel': 3.6}
def penned(kind, x, floor, z):
    return {'kind': kind, 'n': 1, 'p': [x, floor + PEN_HOVER[kind], z], 'fixed': True, 'y': floor + PEN_HOVER[kind]}

def spawn(*specs): return {'a': 'spawn', 'enemies': [{'kind': k, 'n': n, 'p': p} for k, n, p in specs]}

LEVEL = {
 'id': 'act3-1', 'name': 'SECTOR 3-1', 'subtitle': 'THE CASTING FLOOR', 'act': 3,
 'floor': False, 'floorY': 0, 'quietLoad': True,
 'loadout': ['pulse', 'scatter', 'rail', 'tether', 'arc'],
 'spawn': {'p': [0, 1, 50], 'yaw': 0},
 'hazards': HAZ,
 'geometry': G,
 'marks': MARKS,
 'signs': SIGNS,
 'movers': [
   # the carrier: parked at its dock until the block on it is broken, then to the first gate and back
   {'id': 'A', 'p': CA_D1, 'to': STOPS[0], 's': [4, 1, 4], 'period': 6, 'start': False, 'mat': 'block', 'trim': 'amber'},
   {'id': 'g_s1', 'p': CA_D1, 'to': STOPS[1], 's': [4, 1, 4], 'start': False, 'ghost': True},   # (its runs after)
   {'id': 'g_ride', 'p': CA_D1, 'to': CA_D2, 's': [4, 1, 4], 'start': False, 'ghost': True},
   *[{'id': pid, 'p': pp, 'to': [pp[0], PLAT_SINK - 1, pp[2]], 's': [5, 1, 5], 'period': 12, 'start': False,
      'mat': 'block', 'trim': 'amber'} for pid, pp in PLATS],
   # the crane line's trolley, carrying an anchor
   {'id': 'T1', 'p': [-43, 23, -12], 'to': [-43, 23, 4], 's': [2, 0.6, 2], 'period': 9, 'mat': 'block', 'trim': 'amber'},
   # the store's hoist, from the first rack top to the middle one's; still till the pour
   {'id': 'H', 'p': [5, BACK - 1, -31], 'to': [5, 25, -31], 's': [5, 1, 4], 'period': 10, 'start': False,
    'mat': 'block', 'trim': 'amber'},
   {'id': 'core_lift', 'p': [0, 10, 0], 'to': [0, 1, 0], 's': [6, 1, 6], 'period': 12, 'start': False,
    'mat': 'block', 'trim': 'amber'},
 ],
 'anchors': [{'p': [-12, 14, -12]}, {'p': [12, 14, -12]}, {'p': [-12, 14, 12]}, {'p': [8.5, 14, 8.5]},
             {'id': 'ag', 'p': [-5, 22, 23]},                              # up to the gantry: out once the Sunder is taken
             {'id': 't1', 'p': [-43, 21.5, -12], 'on': 'T1', 'off': True}],
 'shuffle': SHUFFLE,
 'conduits': RELAYS + [
   {'id': 'c_pour', 'p': [43, BACK + 1.7, 14.3], 'do': POUR},
   {'id': 'c_weave', 'p': [WX, OUT + 1.6, RZ], 'do': [{'a': 'reveal', 'panel': 'sh_weave'}]},
 ],
 'pylons': [], 'nodes': [], 'enemies': [],
 'keys': KEYS,
 'doors': [
   {'id': 'dEntry', 'p': [0, 1, 41.5], 's': [6, 6, 1.2], 'lock': 'script', 'open': True},
   {'id': 'dShopW', 'p': [-15, 1, EXZ], 's': [1.2, 4, 4], 'lock': 'script', 'open': True},
   {'id': 'dWarren', 'p': [-28, 1, 20.5], 's': [4, 5, 1.2], 'lock': 'lime'},
   {'id': 'dFar', 'p': [-28, OUT, -16.35], 's': [4, 5, 0.7], 'lock': 'script'},
   # the dock's mouth, shut behind you when the first fight starts - or you fight
   # it from under the dock's roof
   {'id': 'dDock', 'p': [-28, 1, 12.3], 's': [4, 5, 0.6], 'lock': 'script', 'open': True},
   # the moulding line's two doors high up, on to the way back: shut till the
   # pour. Open, a drone in the second wave flew out of the south one into the
   # passage to the gantry, and the fight could not be won.
   {'id': 'dLineS', 'p': [-23, BACK, 20.5], 's': [4, 4, 1.2], 'lock': 'script'},
   {'id': 'dLineN', 'p': [-48.5, BACK, -20.5], 's': [3, 4, 1.2], 'lock': 'script'},
   # the way back's two pens hold these
   {'id': 'dCatN', 'p': [48, BACK, -20.5], 's': [4, 4, 1.2], 'lock': 'script'},
   {'id': 'dStoreBW', 'p': [-20.5, BACK, -43.5], 's': [1.2, 4, 3], 'lock': 'script'},
 ] + HATCH_DOORS + GATE_DOORS + [
   {'id': 'dStoreW', 'p': [-20.5, OUT, -38], 's': [1.2, 5, 4], 'lock': 'script', 'open': True},
   {'id': 'dStoreE', 'p': [20.5, OUT, -38], 's': [1.2, 5, 4], 'lock': 'script'},
   {'id': 'dAmbush', 'p': [5, OUT, -46.5], 's': [4, 5, 1.2], 'lock': 'script'},
   {'id': 'dVentS', 'p': [28, OUT, -20.5], 's': [4, 5, 1.2], 'lock': 'script', 'open': True},
   {'id': 'dStairs', 'p': [24, OUT, 15.5], 's': [4, 4, 1.2], 'lock': 'script'},
   {'id': 'dCtrl', 'p': [48, BACK, 7.5], 's': [4, 4, 1.2], 'lock': 'script'},
   {'id': 'dLoft', 'p': [15, LOFT, 20.5], 's': [4, 4, 1.2], 'lock': 'script'},
   # the way back into the shop: shut until the pour, or the gantry you take the
   # Sunder from is a way round the shop's shutters
   {'id': 'dBackShop', 'p': [-12.5, BACK, 23], 's': [1.2, 4, 4], 'lock': 'script'},
 ],
 'weapons': [{'id': 'sunder', 'p': [-8, BACK + 1.6, 23],
              'brief': {'title': 'SUNDER RECOVERED',
                        'sub': 'The <b>SUNDER</b>&rsquo;s charge bursts where it hits, and breaks reinforced panels.'},
              # its anchor has done its job: on the way back it would be a way to
              # the loft's ledge that skips the grid, and down here a way back up
              # to shoot the grid from the gantry
              'do': [{'a': 'anchors', 'ids': ['ag'], 'off': True}]}],
 'checkpoints': [{'p': [0, 1, 50]}, {'p': [0, 1, 38]}, {'p': [-4, 1, 28]}, {'p': [0, 1, 34]},  # arrival, sealed in, grid open, shutters up
                 ] + KEY_CPS + [
                 {'p': [-28, 1, 16]}, {'p': [-28, OUT, -18]},     # the carrier's dock; the far dock
                 {'p': [-17, OUT, -38]}, {'p': [17, OUT, -38]},              # store: in, won
                 {'p': [24, OUT, -17]}, {'p': [35, OUT, 12]}, {'p': [43, BACK, 11]},   # vent floor: in, won; the control room
                 {'p': [48, BACK, 5]}, {'p': [48, BACK, -17]},                # back: the catwalk, before its pen and after
                 {'p': [17.75, BACK, -43.5]}, {'p': [-17.75, BACK, -43.5]},  # the store, before its pens and after
                 {'p': [-48.5, BACK, -18.5]}, {'p': [-23, BACK, 18.5]},     # crane, landing
                 {'p': [15, LOFT, 17.5]}, {'p': [HX, 2, HZ]}],               # in the loft, the Bastion down
 'triggers': [
  {'on': 'enter', 'vol': {'p': [0, 4, 49], 's': [10, 8, 8]}, 'do': [
    {'a': 'brief', 'title': 'SECTOR 3-1 · THE CASTING FLOOR',
     'sub': 'The foundry&rsquo;s heart, sealed shut in reinforced plate.'},
    {'a': 'spawn', 'enemies': [{'kind': 'bastion', 'n': 1, 'p': [-8, -4, 0], 'y': -0.6, 'wade': -2.5, 'dormant': True,
                                'patrol': [[-8, 0], [0, -8], [8, 0], [0, 8]]}]},
    {'a': 'checkpoint', 'p': [0, 1, 50]}]},
  {'on': 'enter', 'vol': {'p': [0, 4, 38], 's': [14, 6, 4]}, 'do': [
    {'a': 'seal', 'door': 'dEntry'}, {'a': 'checkpoint', 'p': [0, 1, 38]}]},
 ] + WARREN_TRIGS + [
  # the moulding line: into the carrier's dock, and a fight at every stop
  {'on': 'enter', 'vol': {'p': [-28, 2, 15], 's': [4, 2, 4]}, 'do': [DOCK_CP]},
 ] + LINE_TRIGS + [
  {'on': 'enter', 'vol': {'p': [-28, OUT + 0.5, -18], 's': [4, 1, 4]}, 'do': [
    {'a': 'checkpoint', 'p': [-28, OUT, -18]}]},
 ] + RACK_TRIGS + [
  # the store: something in every bay
  # Out of the middle row's panel you turn right, to the sentinel: two lancers
  # wait in a closet on your left, and its door opens as you come out.
  {'on': 'enter', 'vol': {'p': [-17, OUT + 2, -38], 's': [6, 4, 8]}, 'do': [
    spawn(('mite', 4, [-5, OUT, -32]), ('rusher', 2, [-5, OUT, -24]),
          ('sentinel', 1, [5, OUT, -36]), ('lancer', 1, [5, OUT, -24])),
    {'a': 'spawn', 'enemies': [{'kind': 'lancer', 'n': 1, 'p': [x, OUT + 3.8, -49], 'fixed': True, 'y': OUT + 3.8} for x in (4.1, 5.9)]},
    {'a': 'checkpoint', 'p': [-17, OUT, -38]}]},
  {'on': 'enter', 'vol': {'p': [5, OUT + 1.5, -40.5], 's': [5, 3, 5]}, 'do': [{'a': 'open', 'door': 'dAmbush'}]},
  {'on': 'enter', 'vol': {'p': [14, OUT + 1, -33.5], 's': [5, 2, 25]}, 'do': [
    spawn(('bulwark', 2, [17, OUT, -30]), ('drone', 2, [16, OUT + 3, -42])),
    {'a': 'arena', 'onClear': [{'a': 'open', 'door': 'dStoreE'}, {'a': 'checkpoint', 'p': [17, OUT, -38]}]}]},
  {'on': 'enter', 'vol': {'p': [24, OUT + 1.5, -38], 's': [4, 3, 4]}, 'do': [
    spawn(('rusher', 2, [28, OUT, -28]), ('sentinel', 1, [28, OUT, -23]))]},
  # the vent floor
  {'on': 'enter', 'vol': {'p': [28, OUT + 2, -17], 's': [6, 4, 6]}, 'do': [
    # what the weaver does, and that it can be got at: the room is hard to work out without it
    {'a': 'brief', 'title': 'WOVEN', 'sub': 'A weaver locked in the wall shields everything here. Free it to make the fight fair.'},
    {'a': 'spawn', 'enemies': [{'kind': 'weaver', 'n': 1, 'p': [57, OUT + 4, HZW], 'fixed': True, 'pin': True, 'weaveR': 48},
                               {'kind': 'bulwark', 'n': 1, 'p': [34, OUT, 0]},
                               {'kind': 'sentinel', 'n': 1, 'p': [35, OUT, 6]},
                               {'kind': 'drone', 'n': 2, 'p': [38, OUT + 3, -8]}]},
    {'a': 'arena', 'onClear': [{'a': 'open', 'door': 'dStairs'}, {'a': 'drop', 'p': [35, OUT + 0.5, 12], 'hp': 1},
                               {'a': 'checkpoint', 'p': [35, OUT, 12]}]},
    {'a': 'checkpoint', 'p': [24, OUT, -17]}]},
  {'on': 'enter', 'vol': {'p': [43, BACK + 1, 11.5], 's': [14, 2, 7]}, 'do': [CTRL_CP]},
  # back: the vent floor's pen, out of the control room on to the catwalk
  {'on': 'enter', 'vol': {'p': [48, BACK + 1, 5], 's': [4, 2, 4]}, 'do': [
    {'a': 'spawn', 'enemies': [penned('lancer', 34, BACK + 1, -23), penned('lancer', 38, BACK + 1, -23),
                               penned('sentinel', 36, BACK + 1, -22.5)]},
    {'a': 'arena', 'onClear': [{'a': 'hazard', 'id': 'g_vpen', 'on': False}, {'a': 'open', 'door': 'dCatN'},
                               {'a': 'checkpoint', 'p': [48, BACK, -17]}]},
    {'a': 'checkpoint', 'p': [48, BACK, 5]}]},
  {'on': 'enter', 'vol': {'p': [48, BACK + 1.5, -26], 's': [4, 3, 4]}, 'do': [spawn(('mite', 4, [32, BACK, -43.5]))]},
  # the store's pens, across the rack tops; the way out west shut till they're down
  {'on': 'enter', 'vol': {'p': [17.75, BACK + 1, -43.5], 's': [4.5, 2, 3]}, 'do': [
    # three in the west one: with two, once the east pen was down they would be
    # the last two and marked through the walls, long before they can be seen
    {'a': 'spawn', 'enemies': [penned(k, 22.75, 21, z) for k, z in (('lancer', -32), ('sentinel', -28))] +
                              [penned(k, -22.75, 21, z) for k, z in (('lancer', -32.6), ('sentinel', -30), ('lancer', -27.4))]},
    {'a': 'arena', 'onClear': [{'a': 'hazard', 'id': 'g_spenW', 'on': False}, {'a': 'hazard', 'id': 'g_spenE', 'on': False},
                               {'a': 'open', 'door': 'dStoreBW'}, {'a': 'checkpoint', 'p': [-17.75, BACK, -43.5]}]},
    {'a': 'checkpoint', 'p': [17.75, BACK, -43.5]}]},
  {'on': 'enter', 'vol': {'p': [-23, BACK + 1.5, -43.5], 's': [4, 3, 3]}, 'do': [spawn(('rusher', 2, [-48.5, BACK, -30]))]},
  {'on': 'enter', 'vol': {'p': [-48.5, BACK + 0.5, -18.5], 's': [3, 1, 3]}, 'do': [
    {'a': 'checkpoint', 'p': [-48.5, BACK, -18.5]}]},
  {'on': 'enter', 'vol': {'p': [-23, BACK + 0.5, 18.5], 's': [4, 1, 3]}, 'do': [
    {'a': 'checkpoint', 'p': [-23, BACK, 18.5]}]},
  # through the loft's door, which only the pour opens - not on the ledge in
  # front of it, which the tether reaches long before
  {'on': 'enter', 'vol': {'p': [15, LOFT + 0.5, 17], 's': [6, 1, 5]}, 'do': [
    {'a': 'checkpoint', 'p': [15, LOFT, 17.5]}]},
  # down the tube
  {'on': 'enter', 'vol': {'p': [HX, 2.5, HZ], 's': [9, 1, 9]}, 'do': [
    {'a': 'brief', 'title': 'BASTION', 'sub': 'Three Sunder hits break its shield.'},
    {'a': 'arena', 'onClear': [{'a': 'hazard', 'id': 'pool', 'on': False},
                               {'a': 'move', 'mover': 'core_lift', 'to': [0, 1, 0], 'period': 12}, {'a': 'uncage'},
                               {'a': 'checkpoint', 'p': [HX, 2, HZ]}]},
    {'a': 'wake'},
    {'a': 'spawn', 'enemies': [{'kind': 'drone', 'n': 3, 'p': [-12, 6, -12]}]},
    {'a': 'drop', 'p': [-12, 2.5, -12], 'hp': 1}, {'a': 'drop', 'p': [12, 2.5, -12], 'hp': 1}]},
 ],
 'goal': {'t': 'artifact', 'id': 'core-a3-1', 'p': [0, 12.8, 0], 'on': 'core_lift', 'locked': True, 'cage': 2.2, 'cageH': 4},
}

dedupe_walls(G); unstitch_walls(G); dedupe_floors(G); hide_floor_edges(G); drop_buried_trims(G)
G.extend(LATE)
for g in G:
    assert isinstance(g, dict) and 'p' in g and 's' in g, g
    assert all(isinstance(v, (int, float)) for v in g['p'] + g['s']), g
json.dump(LEVEL, open('levels/act3-1.json', 'w'), indent=1)
print('levels/act3-1.json: %d geometry pieces' % len(G))

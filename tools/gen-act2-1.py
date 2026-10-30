#!/usr/bin/env python3
"""Sector 2-1 - The Well (rework).

A power plant you bring back to life. The shaft is the hub: you keep coming back
to it, and it changes as the plant comes on. Three generator wings open off it,
and each one's relay lights a lamp on the gate to the top floor, where the
finale is. The design, and why it is this shape, is in docs/campaign-design.md
under "Sector 2-1 - rework".

  PIT          shaft floor, 1       the Arc next door; the amber door is in view
  EAST LEDGE   shaft, 15            two wings off it, any order
  SWITCHYARD   east, 15             a pylon riding a crane; a machine you boost onto
  TRANSFORMER  north, 15 / 27       the amber key rides a powered shuttle
  TURBINE ROOM east, pit level      behind the amber door: platforms, housings, a rail node
  NW LEDGE     shaft, 31            behind the three-lamp gate
  TURBINE HALL north-west, 31       the finale: hold three conduits live at once

Every generator restored *feeds* a conduit: it lights up for good and no Coil
can drain it - the switchyard feeds the pit lift, the transformer its shuttle,
the turbine room its own platforms. The top lift behind the gate is left for you
to switch on, so it never reads as broken. North is -z.
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lvlbuild import box, room, lid, dedupe_walls, dedupe_floors, hide_floor_edges, drop_buried_trims, unstitch_walls

G = []
def L(*items):
    for it in items:
        if isinstance(it, list): G.extend(it)
        else: G.append(it)

def holed_wall(axis, fixed, u0, u1, y0, y1, holes, trim='magenta'):
    """A 1m wall with rectangular holes cut in it, as plain boxes. holes are
    (u_centre, width, bottom, top); the piece under a hole is its sill - floor,
    and untrimmed."""
    cuts = sorted({u0, u1} | {c - w/2 for c, w, _, _ in holes} | {c + w/2 for c, w, _, _ in holes})
    out = []
    for a, b in zip(cuts, cuts[1:]):
        if b - a < 0.01: continue
        mid = (a + b) / 2
        gaps = sorted((lo, hi) for c, w, lo, hi in holes if c - w/2 < mid < c + w/2)
        spans, y = [], y0
        for lo, hi in gaps:
            if lo > y: spans.append((y, lo))
            y = max(y, hi)
        if y < y1: spans.append((y, y1))
        for s0, s1 in spans:
            sill = s1 < y1
            t = None if sill else trim
            if axis == 'x': out.append(box((a + b)/2, s0, fixed, b - a, s1 - s0, 1.0, 'wall', t, walk=sill))
            else:           out.append(box(fixed, s0, (a + b)/2, 1.0, s1 - s0, b - a, 'wall', t, walk=sill))
    return out

def kerb(x0, x1, z0, z1, y):
    """A 0.6m kerb. Kept to 0.6 high: a kerb is a launch pad for a boost."""
    return box((x0 + x1)/2, y, (z0 + z1)/2, x1 - x0, 0.6, z1 - z0, 'wall', 'magenta')

def sill(x, z, w, d, top):
    return box(x, top - 1, z, w, 1, d, 'block', None, walk=True)

def link_z(za, zb, xc, width, h, y=0, lidded=False):
    """A corridor along z between two walls centred on za and zb."""
    z0, z1 = min(za, zb) + 0.5, max(za, zb) - 0.5
    cz, ln, top = (z0 + z1)/2, z1 - z0, y + 1
    out = [box(xc, y, cz, width, 1, ln, 'block', 'cyan', walk=True)]
    for sd in (-1, 1): out.append(box(xc + sd*(width/2 + 0.5), top, cz, 1, h, ln, 'wall', 'magenta'))
    if lidded: out += lid(xc - width/2 - 1, xc + width/2 + 1, z0, z1, top + h)
    return out

def cover(*spots, y=1):
    return [box(cx, y, cz, 3.6, 2.6, 3.6, 'block', 'cyan') for cx, cz in spots]

def mover(mid, p, to, s, period, trim='amber'):
    return {'id': mid, 'p': p, 'to': to, 's': s, 'period': period,
            'mat': 'block', 'trim': trim, 'start': False}

# ================================================================= THE SHAFT
SHAFT_LO, SHAFT_HI = -14, 52
L(holed_wall('x',  32.5, -33, 33, SHAFT_LO, SHAFT_HI, [(0, 8, 1, 8)]))                     # south: arrival
L(holed_wall('z', -32.5, -32, 32, SHAFT_LO, SHAFT_HI, [(20, 8, 1, 8)]))                    # west: switchgear
L(holed_wall('z',  32.5, -32, 32, SHAFT_LO, SHAFT_HI, [(-22, 8, 15, 22), (20, 8, 1, 7)]))  # east: switchyard, turbine room
L(holed_wall('x', -32.5, -33, 33, SHAFT_LO, SHAFT_HI, [(26, 8, 15, 22), (-16, 8, 31, 38)]))  # north: transformer, top floor

L(box(0, 0, 20, 64, 1, 24, 'block', 'cyan', walk=True))            # pit, z 8..32
L(kerb(-32, 20, 7.4, 8, 1), kerb(28, 32, 7.4, 8, 1))               #   north edge, lift 1 at x 20..28
L(box(20, 14, -16, 24, 1, 32, 'block', 'cyan', walk=True))         # east ledge, x 8..32 z -32..0
L(kerb(8, 20, 0, 0.6, 15), kerb(28, 32, 0, 0.6, 15))               #   south edge, lift 1 docks
L(kerb(7.4, 8, -15, 0, 15))                                        #   west edge south of the gate
L(box(-16, 30, -20, 32, 1, 24, 'block', 'cyan', walk=True))        # NW ledge, x -32..0 z -32..-8
L(kerb(-32, 0, -8, -7.4, 31))
L(kerb(0, 0.6, -16, -8, 31))

# The top lift is boxed in behind a gate with three lamps, one per generator.
FT = 27
L(holed_wall('z', 20.5, -32, -16, 15, FT, [(-24, 6, 15, 22)]))     # the fence, and its gate
L(box(10.5, 15, -15.5, 21, FT - 15, 1, 'wall', 'magenta'))         # south fence
L(box(-0.5, 15, -24, 1, 15, 17, 'wall', 'magenta'))                # west, under the NW ledge

# ================================================================ PIT LEVEL
L(room(0, 45, 16, 24, h=10, doors=[('n', 0, 18, 10)]))             # arrival; the shaft wall is its north wall
L(room(-49, 20, 32, 24, h=12, doors=[('e', 0, 26, 12)]))          # switchgear
L(box(-58, 1, 20, 4, 1.4, 4, 'block', 'amber'))                    # the Arc's plinth
L(cover((-44, 13), (-44, 27), (-54, 12)))

# ============================================================== SWITCHYARD
# A balcony over a drop, and in front of it a machine block 7m up - only a
# scatter boost gets you onto it, and only from on top of it can you see out
# across the yard. A pylon rides a crane that runs while its conduit is live,
# and the chain on to the relay only joins while it is in the middle third of
# its run. The yard's Coil goes for the crane.
L(room(66, -22, 66, 36, h=24, y=14, floor=False, doors=[('w', 0, 38, 24)]))
L(box(39, 14, -22, 12, 1, 20, 'block', 'cyan', walk=True))        # balcony x 33..45 z -32..-12
L(box(48.5, 14, -22, 7, 7.6, 24, 'block', 'amber', walk=True))     # the machine, x 45..52, top 21.6 - 6.6m, past a double jump
# The fixed pylon is 38m from the machine's edge - past the Arc's 36 - so the
# chain has to go through the crane's pylon. At 35.7m it could be hit direct.
L(box(97.5, 18, -10, 3, 1, 4, 'block', 'amber'))                   # the relay's bracket
L(box(90, 25.6, -22, 0.4, 12.4, 0.4, 'wall'))                      # the fixed pylon's hanger, to the roof

# ============================================================= TRANSFORMER
# A tall hall. The amber key and the relay are together in an alcove in the far
# wall, and the only way in is a shuttle that runs from the west catwalk - 12m
# up, which the tether reaches - while its conduit is live. The Coils drain it
# mid-run.
# lidded, and its lid more than a boost above the ledge: open wall tops here
# would be a step up onto the gate's fence, and over it to the top lift
L(link_z(-32.5, -41.5, 26, 8, 8, y=14, lidded=True))               # corridor from the east ledge
L(sill(26, -41.5, 8, 1, 15))
# No east wall of its own: the holed wall below is the east wall (with both,
# the room's full-height wall would seal the alcove's mouth).
L(room(30, -72, 52, 60, h=26, y=14, doors=[('s', -4, 8, 7), ('e', 0, 62, 26)]))   # x 4..56 z -42..-102
L(box(7, 15, -80, 6, 12, 40, 'block', 'cyan', walk=True))          # west catwalk x 4..10, top 27
# The mouth comes down to the shuttle's own height so it can run through it.
# One wall, floor to top, with the mouth cut in it: a low wall with the holed
# part stacked on it would bury its top trim along the join, and flicker.
L(holed_wall('z', 56.5, -103, -41, 15, 41, [(-94, 6, 26, 32)]))    # the alcove mouth
L(box(63, 26, -94, 12, 1, 12, 'block', 'amber', walk=True))        # alcove floor x 57..69 z -100..-88, top 27
# walled as high as the hall, and open to the sky: a lid over it would be a ledge
L(box(63, 27, -100.5, 14, 14, 1, 'wall', 'magenta'), box(63, 27, -87.5, 14, 14, 1, 'wall', 'magenta'),
  box(69.5, 27, -94, 1, 14, 12, 'wall', 'magenta'))
L(cover((24, -56), (40, -76), (22, -88), y=15))

# ============================================================ TURBINE ROOM
# Behind the amber door, over a drop. Two platforms that run while the room's
# conduit is live, a turbine housing between them 7m up - a scatter boost off
# the first platform - and the relay walled in at the far end until a rail
# round through a grate cuts its node.
# the shaft wall is its west wall; its own walls are high enough that the
# relay's cubby roof is not a way out
# 40m from the entry ledge to the housing's step - past a double jump and dash -
# so the first platform is the way across
# 42m from the housing to the far ledge - past a double jump and dash - and the
# relay 53m out, past the Arc: the second platform is the way over too
L(room(92, 20, 118, 24, h=28, floor=False, over=0, doors=[('w', 0, 8, 6)]))  # x 33..151 z 8..32
L(box(39, 0, 20, 12, 1, 24, 'block', 'cyan', walk=True))           # entry ledge x 33..45
L(box(86, 0, 20, 2, 1, 8, 'block', 'cyan', walk=True))             # the housing's step x 85..87, top 1
L(box(90, 1, 20, 6, 6.6, 8, 'block', 'amber', walk=True))          # housing x 87..93, top 7.6 - 6.6m up
L(box(142, 7, 20, 14, 1, 24, 'block', 'cyan', walk=True))          # far ledge x 135..149, top 8
# the relay's cubby runs right back to the end wall - with a gap behind it you
# could walk round and power the relay without the node
L(box(147, 8, 15.5, 8, 5, 1, 'wall', 'magenta'), box(147, 8, 24.5, 8, 5, 1, 'wall', 'magenta'),
  box(147, 13, 20, 9, 1, 10, 'wall'))                              # the relay's cubby, x 143..151
L(dict(p=[142.5, 8, 20], s=[1, 5, 8], mat='wall', id='relaypanel'))
# the node in a niche against the end wall, behind one grate facing back
# down the room: only a rail round reaches it, and there is no way round
L(box(149.5, 8, 26.5, 3, 5, 1, 'wall', 'magenta'), box(149.5, 8, 31.5, 3, 5, 1, 'wall', 'magenta'),
  box(149.5, 13, 29, 3, 1, 6, 'wall'))                             # sides and roof, x 148..151
L(box(147.85, 8, 29, 0.3, 5, 4, 'dark', grate=True))               # the grate, x 147.7..148

# ============================================================== TOP FLOOR
L(link_z(-32.5, -35.5, -16, 8, 8, y=30, lidded=True))              # NW ledge to the hall
L(room(-34, -66, 60, 60, h=20, y=30, doors=[('s', 18, 8, 7)]))     # the turbine hall x -64..-4 z -36..-96
L(sill(-16, -35.5, 8, 1, 31))
L(box(-34, 31, -66, 5, 1.6, 4, 'block', 'amber'))                  # the core's pedestal
L(cover((-50, -48), (-18, -48), (-52, -84), (-16, -84), (-34, -88), y=31))

HOLD = ['h_n', 'h_w', 'h_e']

LEVEL = {
 'id': 'act2-1', 'name': 'SECTOR 2-1', 'subtitle': 'THE WELL', 'act': 2,
 'floor': False, 'floorY': 0, 'quietLoad': True,
 'loadout': ['pulse', 'scatter', 'rail', 'tether'],
 'spawn': {'p': [0, 1, 52], 'yaw': 0},
 'hazards': [{'t': 'void', 'below': -14}],
 'geometry': G,
 'movers': [
   mover('lift1', [24, 0, 4], [24, 14, 4], [8, 1, 8], 10),
   mover('lift2', [4, 14, -24], [4, 30, -24], [8, 1, 8], 11),
   dict(mover('crane', [74, 24, -36], [74, 24, -8], [2, 0.6, 2], 12, trim='cyan'), mat='wall'),
   mover('shuttle', [12, 26, -94], [55, 26, -94], [4, 1, 4], 16),   # waits at the catwalk; docks in the alcove
   mover('t1', [48, 0, 20], [82, 0, 20], [5, 1, 5], 14),
   mover('t2', [96, 7, 20], [132, 7, 20], [5, 1, 5], 16),
 ],
 'conduits': [
   # the shaft
   {'id': 'c_pit', 'p': [14, 1.6, 11], 'lifts': ['lift1'],
    'do': [{'a': 'spawn', 'enemies': [{'kind': 'coil', 'n': 2, 'p': [0, 9, 18]}]},
           {'a': 'brief', 'title': 'COIL', 'sub': 'Coils drain the power from anything you&rsquo;ve switched on.'},
           # the shaft stays contested until a generator feeds its lift
           {'a': 'waves', 'every': 40, 'enemies': [{'kind': 'coil', 'n': 1, 'p': [0, 20, -10]}],
            'until': {'fed': 'c_pit'}}]},
   {'id': 'c_lift2', 'p': [11, 15.6, -29], 'lifts': ['lift2']},
   # switchyard
   {'id': 'c_crane', 'p': [38, 15.6, -14], 'lifts': ['crane']},
   {'id': 'r_yard', 'p': [97.5, 20.6, -10],
    'do': [{'a': 'lamp', 'door': 'gB', 'banner': 'TOP GATE'}, {'a': 'feed', 'conduit': 'c_pit'},
           {'a': 'checkpoint', 'p': [39, 15, -28]}]},
   # transformer
   # on the floor at the hall's far side: over 36m from the catwalk and the
   # shuttle's run, so when a Coil stops it you have to go back down for it
   {'id': 'c_shuttle', 'p': [50, 16.6, -54], 'lifts': ['shuttle'],
    'do': [{'a': 'spawn', 'enemies': [{'kind': 'coil', 'n': 2, 'p': [30, 22, -86]},
                                      {'kind': 'drone', 'n': 2, 'p': [20, 22, -60]}]}]},
   {'id': 'r_trans', 'p': [66, 28.6, -94],
    'do': [{'a': 'lamp', 'door': 'gB', 'banner': 'TOP GATE'},
           {'a': 'feed', 'conduit': 'c_shuttle'}, {'a': 'checkpoint', 'p': [63, 27, -91]}]},
   # turbine room
   {'id': 'c_turb', 'p': [42, 2.6, 12], 'lifts': ['t1', 't2'],
    'do': [{'a': 'spawn', 'enemies': [{'kind': 'coil', 'n': 2, 'p': [90, 14, 20]}]}]},
   {'id': 'r_turb', 'p': [146, 9.6, 20],
    'do': [{'a': 'lamp', 'door': 'gB', 'banner': 'TOP GATE'}, {'a': 'feed', 'conduit': 'c_turb'},
           {'a': 'anchors', 'ids': ['ret1', 'ret2']},
           {'a': 'checkpoint', 'p': [138, 8, 27]}]},
   # the turbine hall: all three live at once opens the core's cage
   {'id': 'h_n', 'p': [-34, 32.6, -52]},
   {'id': 'h_w', 'p': [-46, 32.6, -73]},
   {'id': 'h_e', 'p': [-22, 32.6, -73]},
 ],
 'pylons': [{'p': [74, 25.6, -36], 'on': 'crane'}, {'p': [90, 24, -22]}],
 'anchors': [{'p': [8.5, 32, -80]},
             # the turbine room's way home: dark until its relay is powered, then
             # two quick reels back to the entry ledge instead of both platforms
             {'p': [110, 18, 20], 'id': 'ret1', 'off': True},
             {'p': [80, 18, 20], 'id': 'ret2', 'off': True}],
 'doors': [
   {'id': 'dA', 'p': [-32.5, 1, 20], 's': [1.2, 7, 8], 'lock': 'script', 'open': True},
   {'id': 'dAmber', 'p': [32.5, 1, 20], 's': [1.2, 6, 8], 'lock': 'amber'},
   {'id': 'gB', 'p': [20.5, 15, -24], 's': [1.2, 7, 6], 'lock': 'script', 'lamps': 3},
   {'id': 'dCore', 'p': [-16, 31, -35.5], 's': [8, 7, 1.2], 'lock': 'script', 'open': True, 'boss': True},
 ],
 'keys': [{'colour': 'amber', 'p': [60, 28.4, -97]}],
 'weapons': [{'id': 'arc', 'p': [-58, 3.4, 20],
              'brief': {'title': 'ARC RECOVERED',
                        'sub': 'The <b>ARC</b> jumps between targets. Fire it into a dead conduit to power it up.'}}],
 'nodes': [{'p': [149.8, 10.5, 29], 'label': '', 'do': [{'a': 'reveal', 'panel': 'relaypanel'}]}],
 'enemies': [],
 # blast marks where a scatter jump is the way up
 'marks': [{'p': [43, 15, -22]},                                   # the switchyard machine's foot
           {'p': [86, 1, 20], 'r': 0.8}],                          # the turbine housing's step, 2m wide
 # Before and after each event, and nothing saved by standing on it.
 'checkpoints': [{'p': [0, 1, 50]},                                 # arrival
                 {'p': [-38, 1, 20]}, {'p': [-50, 1, 26]},          # switchgear: in, after the mites
                 {'p': [24, 15, -4]},                               # the east ledge
                 {'p': [39, 15, -16]}, {'p': [39, 15, -28]},        # switchyard: in, relay
                 {'p': [26, 15, -48]}, {'p': [63, 27, -91]},        # transformer: in, relay
                 {'p': [40, 1, 27]}, {'p': [138, 8, 27]},           # turbine room: in, relay
                 {'p': [-4, 31, -16]}, {'p': [-34, 31, -42]}],      # top floor: in, the hall won
 'triggers': [
  {'on': 'enter', 'vol': {'p': [0, 5, 50], 's': [16, 10, 12]}, 'do': [
    {'a': 'brief', 'title': 'SECTOR 2-1 · THE WELL',
     'sub': 'The foundry&rsquo;s power plant. Nothing in it has run since the lockdown.'},
    {'a': 'checkpoint', 'p': [0, 1, 50]}]},
  {'on': 'enter', 'vol': {'p': [0, 5, 24], 's': [40, 10, 12]}, 'do': [
    {'a': 'spawn', 'enemies': [{'kind': 'drone', 'n': 2, 'p': [-10, 1, 14]}]}]},
  {'on': 'enter', 'vol': {'p': [-38, 5, 20], 's': [8, 10, 20]}, 'do': [
    {'a': 'checkpoint', 'p': [-38, 1, 20]}]},
  {'on': 'enter', 'need': 'arc', 'vol': {'p': [-49, 5, 20], 's': [32, 10, 24]}, 'do': [
    {'a': 'seal', 'door': 'dA'},
    {'a': 'spawn', 'enemies': [{'kind': 'mite', 'n': 8, 'p': [-40, 1, 14]},
                               {'kind': 'mite', 'n': 8, 'p': [-40, 1, 27]}]},
    {'a': 'arena', 'onClear': [{'a': 'open', 'door': 'dA'}, {'a': 'checkpoint', 'p': [-50, 1, 26]}]}]},
  {'on': 'enter', 'vol': {'p': [24, 18, -6], 's': [14, 8, 8]}, 'do': [
    {'a': 'checkpoint', 'p': [24, 15, -4]}]},

  {'on': 'enter', 'vol': {'p': [39, 18, -22], 's': [10, 8, 20]}, 'do': [
    {'a': 'checkpoint', 'p': [39, 15, -16]},
    {'a': 'spawn', 'enemies': [{'kind': 'coil', 'n': 1, 'p': [66, 26, -22]},
                               {'kind': 'drone', 'n': 3, 'p': [64, 22, -14], 'fixed': True},
                               {'kind': 'lancer', 'n': 1, 'p': [90, 26, -30], 'fixed': True}]}]},
  {'on': 'enter', 'vol': {'p': [26, 18, -48], 's': [12, 8, 8]}, 'do': [
    {'a': 'checkpoint', 'p': [26, 15, -48]}]},
  {'on': 'enter', 'vol': {'p': [39, 5, 20], 's': [12, 10, 24]}, 'do': [
    {'a': 'checkpoint', 'p': [40, 1, 27]},
    {'a': 'spawn', 'enemies': [{'kind': 'drone', 'n': 2, 'p': [84, 10, 16], 'fixed': True},
                               {'kind': 'lancer', 'n': 1, 'p': [142, 8, 14]}]}]},
  # back on the entry ledge with the relay done: save here, not at the far end
  {'on': 'enter', 'need': {'fed': 'c_turb'}, 'vol': {'p': [39, 5, 20], 's': [12, 10, 24]}, 'do': [
    {'a': 'checkpoint', 'p': [40, 1, 27]}]},
  {'on': 'enter', 'vol': {'p': [-3, 34, -24], 's': [6, 8, 10]}, 'do': [
    {'a': 'checkpoint', 'p': [-4, 31, -16]}]},

  # The turbine hall. Clearing it is not enough: the core's cage opens while all
  # three conduits round it are live at once, and the Coils keep coming for
  # them. A weaver at the back shields whatever is near it.
  {'on': 'enter', 'vol': {'p': [-34, 35, -44], 's': [56, 8, 14]}, 'do': [
    {'a': 'seal', 'door': 'dCore'},
    {'a': 'brief', 'title': 'HOLD THE POWER',
     'sub': 'The core&rsquo;s cage opens while all three conduits are live.'},
    {'a': 'arm'},
    {'a': 'spawn', 'enemies': [{'kind': 'weaver', 'n': 1, 'p': [-34, 31, -90]},
                               {'kind': 'coil', 'n': 2, 'p': [-34, 31, -80]},
                               {'kind': 'drone', 'n': 3, 'p': [-50, 31, -70]},
                               {'kind': 'mite', 'n': 8, 'p': [-20, 31, -80]}]},
    {'a': 'waves', 'every': 20, 'first': 14,
     'enemies': [{'kind': 'coil', 'n': 2, 'p': [-34, 31, -90]},
                 {'kind': 'mite', 'n': 4, 'p': [-50, 31, -90]}],
     'until': 'cage'},
    {'a': 'arena', 'onClear': [{'a': 'open', 'door': 'dCore'},
                               {'a': 'checkpoint', 'p': [-34, 31, -42]}]}]},
 ],
 'goal': {'t': 'artifact', 'id': 'core-a2-1', 'p': [-34, 34.4, -66], 'locked': True,
          'cage': 2.4, 'cageH': 4.5, 'hold': {'conduits': HOLD, 'need': 12}},
}

dedupe_walls(G); unstitch_walls(G); dedupe_floors(G); hide_floor_edges(G); drop_buried_trims(G)
for g in G:
    assert isinstance(g, dict) and 'p' in g and 's' in g, g
    assert all(isinstance(v, (int, float)) for v in g['p'] + g['s']), g
json.dump(LEVEL, open('levels/act2-1.json', 'w'), indent=1)
print('levels/act2-1.json: %d geometry pieces' % len(G))

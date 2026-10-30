#!/usr/bin/env python3
"""Sector 2-2 - The Divide (rework).

Two halves of the cooling plant with a 48m drop between them, and what you need
is always on the other side: you work the chasm from both edges rather than
crossing it once each way. The design, and why it is this shape, is in
docs/campaign-design.md under "Sector 2-2 - rework". North is -z; the chasm is
x -24..24.

  WEST LOW        1    arrival, a grid run, the west ledge      CROSSING 1 east
  CUTTING FLOOR   1    east: sweeping grids, bays to duck into, the cyan key,
                       and a balcony with a rail shot back across the gap
  CROSSING 2           an anchor riding a crane along the chasm, and a loose Severer
  WEST UPPER      17   the grid the rail shot cut, the cyan door, a switch room
                       whose Coils fight you for a grid, then a scatter climb
  CROSSING 3      30   the longest, through a timed grid hung in the air
  COOLING TOWER        islands up a tall shaft, the core on the spire. Severers
                       hold the anchors between them; a weaver hidden in the
                       high nest shields the Severers. Climb to it, rail it.
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
    (u_centre, width, bottom, top); the piece under a hole is its sill."""
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

def sill(x, z, w, d, top):
    return box(x, top - 1, z, w, 1, d, 'block', None, walk=True)

def cover(*spots, y=1):
    return [box(cx, y, cz, 3.6, 2.6, 3.6, 'block', 'cyan') for cx, cz in spots]

def grid(gid, x, y, z, w, h, d, **kw):
    g = {'t': 'laser', 'p': [x, y, z], 's': [w, h, d], 'dmg': 30}
    if gid: g['id'] = gid
    if kw.get('period') and 'duty' not in kw: kw['duty'] = kw['period'] / 2
    g.update(kw)
    return g

HAZ = [{'t': 'void', 'below': -20}]

# ================================================================== WEST LOW
L(room(-42, 12, 28, 16, h=8, doors=[('n', 0, 8, 6)]))                       # arrival, x -56..-28 z 4..20
L(room(-42, -18.5, 8, 43, h=8, over=0, doors=[('s', 0, 8, 8), ('n', 0, 8, 8)]))  # grid run, z 3..-40
L(lid(-47, -37, -40, 3, 9))
L(sill(-42, 3.5, 8, 1, 1), sill(-42, -40.5, 8, 1, 1))
for i, gz in enumerate((-10, -26)):
    HAZ.append(grid(None, -42, 1, gz, 8, 8, 0.3, period=2.8, duty=1.5, phase=-0.8 * i))
L(room(-38, -54, 28, 26, h=14, doors=[('s', -4, 8, 8), ('e', 0, 26, 14)]))  # west ledge x -52..-24 z -41..-67
L(cover((-46, -60), (-32, -48)))

# ============================================================ THE CUTTING FLOOR
L(room(34, -54, 20, 26, h=12, doors=[('w', 0, 26, 12), ('n', 2, 8, 8)]))    # east landing x 24..44 z -41..-67
# A long lidded hall. Three grids sweep along it rather than blink, and six bays
# in its east wall are where you wait for one to pass - under fire from the
# turrets at the far end, by the cyan key.
BAYS = (-80, -94, -108, -122, -136, -150)
L(room(36, -114, 16, 92, h=8, doors=[('s', 0, 8, 8), ('w', -41, 6, 6)] +
       [('e', bz + 114, 6, 6) for bz in BAYS]))                              # x 28..44 z -68..-160
L(lid(27, 45, -161, -68, 9))
L(sill(36, -67.5, 8, 1, 1))
for bz in BAYS:
    L(room(47, bz, 4, 6, h=8, doors=[('w', 0, 6, 6)]))                       # bay x 45..49
    L(lid(45, 50, bz - 4, bz + 4, 9))
    L(sill(44.5, bz, 1, 6, 1))
# One period for all three, a third of it apart, so the pattern repeats exactly.
# Periods of 7, 8 and 6 drifted apart and never made the same wave twice.
HAZ.append(grid('s1', 36, 1, -90, 16, 8, 0.3, sweep=[0, 0, 12], sweepPeriod=7))
HAZ.append(grid('s2', 36, 1, -118, 16, 8, 0.3, sweep=[0, 0, 12], sweepPeriod=7, sweepPhase=7/3))
HAZ.append(grid('s3', 36, 1, -141, 16, 8, 0.3, sweep=[0, 0, 10], sweepPeriod=7, sweepPhase=14/3))
L(box(36, 1, -157, 3, 0.6, 3, 'block', 'cyan'))                            # the cyan key's plinth - low: a boost off it hit the hall's roof
for tx in (30, 42):
    L(box(tx, 1, -158, 2.6, 0.6, 2.6, 'block', 'amber'))                    # turret mounts
# the balcony: 8m out over the drop, so the crane's anchor is a short reel
L(box(21.5, 0, -155, 11, 1, 10, 'block', 'cyan', walk=True))              # x 16..27 z -150..-160
L(sill(27.5, -155, 1, 6, 1))

# ================================================================ WEST UPPER
# The landing crossing 2 brings you to. Its way in is an always-on grid, fed by
# a node on a pillar out in the chasm - behind a grate that faces west, so the
# line to it is from the landing: you cross first, then rail it, and can never
# be stranded on the landing for not having shot it from the balcony.
L(room(-32, -155, 16, 20, h=14, y=16, doors=[('e', 0, 20, 14), ('w', 0, 6, 7)]))  # x -40..-24 z -145..-165
L(sill(-40.5, -155, 1, 6, 17))
HAZ.append(grid('g_west', -40.5, 17, -155, 0.3, 7, 6))
# no trim on the pillar: its niche stands flush on the top edge, and the two flickered
L(box(-14, -20, -141, 3, 40, 5, 'wall'))                                   # the node's pillar, from the void
L(box(-12.75, 20, -141, 0.5, 4, 5, 'wall'),                                # its niche: back, sides, roof
  box(-14.25, 20, -143.25, 2.5, 4, 0.5, 'wall'), box(-14.25, 20, -138.75, 2.5, 4, 0.5, 'wall'),
  box(-14, 24, -141, 3, 0.5, 5, 'wall', 'magenta'))
L(box(-15.35, 20, -141, 0.3, 4, 4, 'dark', grate=True))                    # the grate, facing west

L(room(-50, -155, 18, 20, h=10, y=16, doors=[('e', 0, 6, 7), ('n', 0, 6, 7)]))    # lobby x -59..-41
L(room(-50, -180, 24, 28, h=12, y=16, doors=[('s', 0, 6, 7), ('n', 0, 6, 7)]))    # switch room z -166..-194
L(sill(-50, -165.5, 6, 1, 17), sill(-50, -194.5, 6, 1, 17))
L(cover((-58, -172), (-42, -188), (-56, -188), y=17))
HAZ.append(grid('g_climb', -50, 17, -194.5, 6, 7, 0.3))
# the climb: two steps of 6.6m, each a scatter boost, out onto the top ledge
L(room(-50, -205, 20, 20, h=26, y=16, doors=[('s', 0, 6, 7), ('e', 0, 22, 26)]))  # x -60..-40 z -195..-215
L(holed_wall('z', -39.5, -216, -194, 17, 43, [(-212, 6, 30.2, 37)]))
L(box(-55, 17, -210, 10, 6.6, 10, 'block', 'amber', walk=True))            # step 1 x -60..-50, top 23.6
L(box(-45, 17, -212, 10, 13.2, 6, 'block', 'amber', walk=True))            # step 2 x -50..-40 z -209..-215, top 30.2
L(box(-31.5, 29.2, -212, 15, 1, 14, 'block', 'cyan', walk=True))          # west top x -39..-24 z -205..-219
L(box(-31.5, 30.2, -204.5, 15, 10, 1, 'wall', 'magenta'), box(-31.5, 30.2, -219.5, 15, 10, 1, 'wall', 'magenta'))

# ================================================================ CROSSING 3
# A timed grid hangs in the air between two pillars across the launch, long
# enough that there is no swinging round it: the tower's wall closes the north
# end, and the south end runs past where a launch could turn.
for pz in (-184.5, -220.5):
    L(box(10, -20, pz, 1.2, 70, 1, 'wall', 'magenta'))
HAZ.append(grid('g_air', 10, 20, -202.5, 0.3, 30, 36, period=3.0, duty=1.5))
L(box(34, 29.2, -213, 20, 1, 16, 'block', 'cyan', walk=True))             # east top x 24..44 z -205..-221
L(box(34, 30.2, -204.5, 20, 10, 1, 'wall', 'magenta'))

# ============================================================= COOLING TOWER
# A tall round shaft at the chasm's end. Its south wall is built here with the
# gate in it; the room's own is left out so the two cannot fight.
L(room(20, -252, 60, 60, h=67, y=12, over=0, doors=[('s', 0, 62, 67)]))    # x -10..50 z -222..-282, floor 13
L(holed_wall('x', -221.5, -11, 51, 13, 80, [(34, 8, 30.2, 37.2)]))
L(box(-10.5, 13, -282.5, 1, 67, 1, 'wall'), box(50.5, 13, -282.5, 1, 67, 1, 'wall'))   # the north corners
L(box(34, 13, -225, 16, 17.2, 6, 'block', 'cyan', walk=True))            # the entry bastion x 26..42, top 30.2
L(box(0, 13, -244, 12, 23, 12, 'block', 'cyan', walk=True))              # island 1 x -6..6 z -238..-250, top 36
# The lancer's perch, in the far corner: the one place that sees into the nest,
# through a slot in its east wall. Two boosts up from the floor, by a step, and
# more than a dash from the bastion, so the way there is across the floor.
L(box(37.25, 13, -277, 8.5, 6.6, 8, 'block', 'cyan', walk=True))         # the step x 33..41.5 z -273..-281, top 19.6
# amber: there is something to do up here
L(box(45.5, 13, -277.25, 8, 13.2, 7.5, 'block', 'amber', walk=True))     # the perch x 41.5..49.5 z -273.5..-281, top 26.2
L(box(10, 13, -266, 12, 31, 12, 'block', 'amber', walk=True))            # the nest x 4..16 z -260..-272, top 44
# the parapet stands half a metre in from the edge: flush, it sat on the nest's
# trim and the two flickered
L(box(10, 44, -271, 11, 5, 1, 'wall', 'magenta'), box(10, 44, -261, 11, 5, 1, 'wall', 'magenta'),
  box(5, 44, -266, 1, 5, 9, 'wall', 'magenta'))
# The east wall has the slot the perch sees through. Outside it, a ledge below
# the nest's trim cuts off the steeper lines up from the floor, and a fin on its
# south side the lines in from the bastion, which otherwise saw straight through.
L(holed_wall('z', 15, -270.5, -261.5, 44, 49, [(-266.5, 7, 45.5, 48.5)]))
L(box(18, 42, -266.5, 4, 1, 7, 'block'))                                   # the ledge x 16..20, top 43
L(box(18, 43, -262.75, 5, 6, 0.5, 'wall', 'magenta'))                      # the fin x 15.5..20.5 z -262.5..-263
# The spire: its anchor is out of island 1's reach, and its top is 8m over the
# nest's anchor, so a launch off that one falls short. Only the nest reaches it.
L(box(31, 13, -264, 6, 51, 6, 'block', 'amber', walk=True))              # the spire x 28..34 z -261..-267, top 64
# The spire's anchor is dark until the conduit at its foot is powered. The
# conduit sits in an alcove on the west face, roofed and walled so that only the
# floor sees into it: from anywhere higher you have to come down.
# Its roof has amber trim, to say there is something in there; its sides have
# none, as theirs would be buried in the roof and flicker.
L(box(25.75, 13, -261.75, 4.5, 4.5, 0.5, 'wall'), box(25.75, 13, -266.25, 4.5, 4.5, 0.5, 'wall'),
  box(25.75, 17.5, -264, 4.5, 0.5, 5, 'wall', 'amber'))                    # alcove x 23.5..28, open west
# An arrow on its south wall, round to the open side, which is easily missed
SIGNS = [{'p': [25.75, 15.25, -261.47], 'face': 'z', 's': [2.6, 3.2], 'arrow': '-x'}]
L(cover((20, -232), (44, -240), (-2, -268), (26, -275), y=13))

LEVEL = {
 'id': 'act2-2', 'name': 'SECTOR 2-2', 'subtitle': 'THE DIVIDE', 'act': 2,
 'floor': False, 'floorY': 0, 'quietLoad': True,
 'loadout': ['pulse', 'scatter', 'rail', 'tether', 'arc'],
 'spawn': {'p': [-42, 1, 16], 'yaw': 0},
 'hazards': HAZ,
 'geometry': G,
  # The crane runs 10m either side of the balcony and the landing, both at z -155.
 # Its anchor hangs 5m over the landing's floor, 20m from the balcony's tip and
 # 20m from the landing. (No further north: from there the anchor would be in
 # reach of crossing 3's, and the whole west upper floor could be skipped.)
 'movers': [dict({'id': 'crane', 'p': [-4, 23, -165], 'to': [-4, 23, -145], 's': [2, 0.6, 2],
                  'period': 12, 'mat': 'wall', 'trim': 'cyan'})],
 'conduits': [
   {'id': 'c_sw', 'p': [-42, 18.6, -178], 'grids': ['g_climb'],
    'do': [{'a': 'checkpoint', 'p': [-50, 17, -190]}]},
   # the spire's: lights its anchor, and the last of the tower comes out on the floor
   {'id': 'c_spire', 'p': [26.6, 14.6, -264],
    'do': [{'a': 'anchors', 'ids': ['sp']}, {'a': 'checkpoint', 'p': [20, 13, -264]},
           {'a': 'spawn', 'join': True, 'enemies': [
             {'kind': 'severer', 'n': 1, 'p': [27, 64, -256], 'holds': 'sp'},
             {'kind': 'mite', 'n': 8, 'p': [10, 13, -278]},
             {'kind': 'drone', 'n': 2, 'p': [40, 15, -250]}]}]},
 ],
 'pylons': [],
 'anchors': [
   {'p': [0, 12, -54], 'hold': 'c1'},                                       # crossing 1
   {'p': [-4, 21.8, -165], 'on': 'crane'},                                  # crossing 2, riding the crane
   {'p': [0, 38, -212]},                                                    # crossing 3
   {'p': [0, 42, -238.3], 'hold': 'i1'},                                    # tower: floor to island 1, over its south lip
   {'p': [10, 56, -266], 'hold': 'i3'},                                     #   island 1 to the nest
   {'id': 'sp', 'p': [29.5, 69, -264], 'hold': 'sp', 'off': True},         #   the nest to the spire, once its conduit is lit
 ],
 'doors': [
   {'id': 'dCyan', 'p': [-50, 17, -165.5], 's': [6, 7, 1.2], 'lock': 'cyan'},
   {'id': 'dGate', 'p': [34, 30.2, -221.5], 's': [8, 7, 1.2], 'lock': 'script', 'open': True, 'boss': True},
 ],
 'keys': [{'colour': 'cyan', 'p': [36, 3.0, -157],
           'do': [{'a': 'checkpoint', 'p': [31, 1, -154]}]}],
 'weapons': [],
 # the node that feeds the west grid: only a rail round, from the landing
 'nodes': [{'p': [-13.8, 21.8, -141], 'label': '',
            'do': [{'a': 'hazard', 'id': 'g_west', 'on': False},
                   {'a': 'banner', 'title': 'GRID DOWN', 'sub': ''}]}],
 'enemies': [],
 'signs': SIGNS,
 'marks': [{'p': [-55, 17, -203]}, {'p': [-51.8, 23.6, -211.5], 'r': 1.1},   # the west climb
           {'p': [37, 13, -271.8], 'r': 1.0}, {'p': [40, 19.6, -277], 'r': 1.0}],  # the perch's step
 # Before and after each event, and nothing saved by standing on it.
 'checkpoints': [{'p': [-42, 1, 14]},                                       # arrival
                 {'p': [-40, 1, -47]},                                      # the west ledge
                 {'p': [36, 1, -54]},                                       # east landing
                 {'p': [31, 1, -154]},                                      # the cyan key
                 {'p': [25, 1, -152]}, {'p': [21, 1, -155]},                # the balcony: in, cleared
                 {'p': [-30, 17, -150]},                                    # west upper landing
                 {'p': [-50, 17, -170]}, {'p': [-50, 17, -190]},            # switch room: in, grid cut
                 {'p': [-30, 30.2, -212]},                                  # west top
                 {'p': [34, 30.2, -210]},                                   # east top, at the gate
                 {'p': [0, 36, -246]}, {'p': [8, 44, -268]},                # island 1, the nest
                 {'p': [20, 13, -264]},                                     # the spire's conduit, powered
                 {'p': [30, 30.2, -225]}],                                  # the tower won
 'triggers': [
  {'on': 'enter', 'vol': {'p': [-42, 5, 12], 's': [28, 10, 16]}, 'do': [
    {'a': 'brief', 'title': 'SECTOR 2-2 · THE DIVIDE',
     'sub': 'The foundry&rsquo;s cooling plant. Two halves of it, with a long drop between them.'},
    {'a': 'checkpoint', 'p': [-42, 1, 14]}]},
  {'on': 'enter', 'vol': {'p': [-40, 5, -47], 's': [16, 10, 8]}, 'do': [
    {'a': 'checkpoint', 'p': [-40, 1, -47]},
    {'a': 'spawn', 'enemies': [{'kind': 'severer', 'n': 1, 'p': [14, 14, -58], 'holds': 'c1'}]},
    {'a': 'brief', 'title': 'SEVERER',
     'sub': 'Severers shut tether anchors down. Kill one and its anchor comes back.'}]},
  {'on': 'enter', 'vol': {'p': [34, 5, -54], 's': [20, 10, 26]}, 'do': [
    {'a': 'checkpoint', 'p': [36, 1, -54]}]},
  {'on': 'enter', 'vol': {'p': [36, 5, -72], 's': [16, 8, 6]}, 'do': [
    {'a': 'spawn', 'enemies': [{'kind': 'turret', 'n': 1, 'p': [30, 2.2, -158], 'fixed': True},
                               {'kind': 'turret', 'n': 1, 'p': [42, 2.2, -158], 'fixed': True},
                               {'kind': 'drone', 'n': 2, 'p': [36, 1, -104]}]}]},
  # the balcony: a loose Severer comes for the crane's anchor
  # Once they are dead that is saved, so a missed crossing costs the jump only.
  {'on': 'enter', 'vol': {'p': [21.5, 4, -155], 's': [11, 8, 10]}, 'do': [
    {'a': 'checkpoint', 'p': [25, 1, -152]},
    {'a': 'spawn', 'enemies': [{'kind': 'severer', 'n': 1, 'p': [4, 22, -140]},
                               {'kind': 'drone', 'n': 2, 'p': [6, 20, -160]}]},
    {'a': 'arena', 'quiet': True, 'onClear': [{'a': 'checkpoint', 'p': [21, 1, -155]}]}]},
  {'on': 'enter', 'vol': {'p': [-32, 21, -155], 's': [16, 8, 20]}, 'do': [
    {'a': 'checkpoint', 'p': [-30, 17, -150]},
    {'a': 'spawn', 'enemies': [{'kind': 'drone', 'n': 2, 'p': [-50, 17, -155]}]}]},
  # the switch room: Coils fight you for the conduit that holds the climb's grid down
  {'on': 'enter', 'vol': {'p': [-50, 21, -170], 's': [24, 8, 8]}, 'do': [
    {'a': 'checkpoint', 'p': [-50, 17, -170]},
    {'a': 'spawn', 'enemies': [{'kind': 'coil', 'n': 3, 'p': [-50, 17, -186]},
                               {'kind': 'drone', 'n': 2, 'p': [-44, 17, -182]},
                               {'kind': 'sentinel', 'n': 1, 'p': [-56, 17, -184]}]}]},
  {'on': 'enter', 'vol': {'p': [-31.5, 34, -212], 's': [15, 8, 14]}, 'do': [
    {'a': 'checkpoint', 'p': [-30, 30.2, -212]},
    {'a': 'spawn', 'enemies': [{'kind': 'severer', 'n': 1, 'p': [8, 38, -200]},
                               {'kind': 'drone', 'n': 2, 'p': [12, 34, -214]}]}]},
  {'on': 'enter', 'vol': {'p': [34, 34, -211], 's': [20, 8, 12]}, 'do': [
    {'a': 'checkpoint', 'p': [34, 30.2, -210]}]},

  # The cooling tower. Severers hold the anchors up the islands. The one on the
  # nest's is woven - nothing hurts it - by a weaver walled into the nest, and
  # the link runs down into it. Island 1's holder dies like any other, so you
  # climb that far and find the way on shut. The nest's one slot faces the
  # lancer's perch in the far corner: down across the floor, up the step, rail
  # the weaver through it, and climb again. In the nest the spire's anchor is
  # dark: its conduit is at the spire's foot, seen only from the floor, and
  # powering it brings the last of them out down there. Then up a third time.
  # The trigger is 3m in from the gate: at the gate's line, it sealed on the
  # player standing in the doorway and threw them back out.
  {'on': 'enter', 'vol': {'p': [34, 34, -226.25], 's': [16, 8, 3.5]}, 'do': [
    {'a': 'seal', 'door': 'dGate'},
    {'a': 'spawn', 'enemies': [
      {'kind': 'weaver', 'n': 1, 'p': [10, 44, -266], 'weaveR': 70, 'weaveCut': 1.0, 'weaveHolds': ['i3']},
      {'kind': 'severer', 'n': 1, 'p': [4, 40, -234], 'holds': 'i1'},
      {'kind': 'severer', 'n': 1, 'p': [14, 52, -254], 'holds': 'i3'},
      {'kind': 'lancer', 'n': 1, 'p': [45.5, 26.2, -277]},
      {'kind': 'mite', 'n': 8, 'p': [20, 13, -250]},
      {'kind': 'drone', 'n': 2, 'p': [30, 13, -240]}]},
    # LOCKED holds until the spire's conduit has been powered, whatever is dead
    {'a': 'arena', 'need': {'powered': 'c_spire'},
     'onClear': [{'a': 'uncage'}, {'a': 'open', 'door': 'dGate'},
                 {'a': 'checkpoint', 'p': [30, 30.2, -225]}]}]},
  {'on': 'enter', 'vol': {'p': [0, 43, -243], 's': [14, 14, 16]}, 'do': [
    {'a': 'checkpoint', 'p': [0, 36, -246]}]},
  {'on': 'enter', 'vol': {'p': [10, 47, -266], 's': [9, 6, 9]}, 'do': [
    {'a': 'checkpoint', 'p': [8, 44, -268]}]},
 ],
 'goal': {'t': 'artifact', 'id': 'core-a2-2', 'p': [31, 65.8, -264], 'locked': True, 'cage': 2.2, 'cageH': 4.5},
}

dedupe_walls(G); unstitch_walls(G); dedupe_floors(G); hide_floor_edges(G); drop_buried_trims(G)
for g in G:
    assert isinstance(g, dict) and 'p' in g and 's' in g, g
    assert all(isinstance(v, (int, float)) for v in g['p'] + g['s']), g
json.dump(LEVEL, open('levels/act2-2.json', 'w'), indent=1)
print('levels/act2-2.json: %d geometry pieces' % len(G))

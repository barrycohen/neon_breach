#!/usr/bin/env python3
"""Sector 3-2 - The Gantries.

A descent through the charging hall, the foundry's biggest room. You come in
under its roof and work down to its floor: you bring the gantries down to make
each way down, and you watch the ones behind you go. All the while the crane
carrying the core runs the length of the hall overhead. The plan and its
reasons are in docs/campaign-design.md under "Sector 3-2". North is -z.

  THE HALL      x -70..22   z -30..30   slag at 1 that kills; the gantries over it
    the roof walk   44, z 24..30, west to east, glassed on the hall side down
                    to the slag; its middle span stands 11m up on two props:
                    break the panels in them and it drops into the gap
    the north tier  28, z -20..-12, east to west: L0, S0, S1, a 42m gap the
                    Severer's anchor crosses, S2 and L1; pens in the north wall
    the control room 28, over L1 in the corner: shut in, arc the relay, and
                    the tier falls in front of you, into the slag, as stones
  THE TOWER     x 22..34                in the hall's middle, to 53.4; the crane
                                        runs over it
    the top room    44, off the roof walk
    the shaft       a cage on one cable fills it: break the clamp and ride it
                    down 16m
    the bottom room 28, an ambush; out west onto the north tier
    the tunnel      3, z -28..-22, under it all, from the slag into the bay
  THE HOPPER    x -91..-71  z -30..-10  behind the control room: a floor of
                                        panels at 28 that goes a wave at a time,
                                        and the last panel rides you down
  THE BAY       x 34..70                the hall's east end, floor at 3, its
                                        north and south floors over slag: the
                                        crane fought and its cradle brought down
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lvlbuild import box, lid, dedupe_walls, dedupe_floors, hide_floor_edges, drop_buried_trims, unstitch_walls, \
    wall, breach

G, HAZ = [], [{'t': 'void', 'below': -30}]
def L(*items):
    for it in items:
        if isinstance(it, list): G.extend(it)
        else: G.append(it)

def panel(pid, x, y, z, w, h, d):
    """A shutter: amber, ribbed, it sinks out of the way when `reveal`ed."""
    p = box(x, y, z, w, h, d, 'block', 'amber'); p['id'] = pid
    return p

def sill(x, z, w, d, top):
    return box(x, top - 1, z, w, 1, d, 'block', None, walk=True)

def fall(fid, x, y, z, w, h, d, mat='block', trim='amber', walk=True):
    """A piece of a fall group: it comes down when the group does."""
    b = box(x, y, z, w, h, d, mat, trim, walk=walk)
    b['fall'] = fid
    return b

def rider(on, x, y, z, w, h, d, mat='block', trim=None):
    """A piece that rides a platform, to look at only."""
    b = box(x, y, z, w, h, d, mat, trim)
    b['on'] = on; b['nocol'] = True
    return b

def cage_pen(x0, x1, y0, y1, z0, z1):
    """A cage stood out from the north wall over the tier: floor, roof, and
    laser grids along its front and sides - what is in it shoots out and is
    shot, from any angle, and can't get out. Pens let into the wall were seen
    only through their mouth, and from most of the tier not at all."""
    cx, cz, w, d = (x0 + x1)/2, (z0 + z1)/2, x1 - x0, z1 - z0
    return [box(cx, y0 - 1, cz, w, 1, d, 'block', None, walk=True), box(cx, y1, cz, w, 1, d, 'wall', 'magenta')]

def grid(gid, x, y, z, w, h, d):
    return {'t': 'laser', 'id': gid, 'p': [x, y, z], 's': [w, h, d], 'dmg': 30}

PEN_HOVER = {'lancer': 3.8, 'sentinel': 3.6}
def penned(kind, x, floor, z):
    return {'kind': kind, 'n': 1, 'p': [x, floor + PEN_HOVER[kind], z], 'fixed': True, 'y': floor + PEN_HOVER[kind]}
def spawn(*specs): return {'a': 'spawn', 'enemies': [{'kind': k, 'n': n, 'p': p} for k, n, p in specs]}
def flier(kind, n, p): return {'kind': kind, 'n': n, 'p': p, 'fixed': True}
def sp(kind, n):
    return lambda at: [{'a': 'spawn', 'enemies': [{'kind': kind, 'n': n, 'p': at}]}]
def drop(at): return [{'a': 'drop', 'p': [at[0], at[1] + 0.5, at[2]], 'hp': 1, 'life': 900}]

ROOF = 67            # the hall's roof: room over the crane for the core riding on it
WALK = 44            # the roof walk
TIER = 28            # the north tier, the tower's bottom room, the warren
SLAG = 1.0           # the slag's surface: it kills
STONE = 1.6          # the top of a span lying in it
BAYF = 3             # the bay's floor
TT = 53.4            # the tower's walls; the crane passes over them
RAIL = 59            # the crane's rails, along the long walls
CB = 60              # the crane beam's underside
CRT = 55             # the top of the hoist block, under the beam
HZ = 18              # where along the beam the hoist hangs: clear of the core's plinth on top
TIER_DY = round(STONE - 1 - (TIER - 1), 3)     # a tier piece, top 28, lying in the slag with its top at 1.6
CAB_TOP = 41         # the control room's roof: over a boost from the tier
HOP_TOP = 40         # the hopper's
CX = 52              # where the cradle comes down in the bay
GALB = TIER + 6      # the bottom room's walkway, where the cage stops
BR_TOP = 43          # the bottom room's roof: two storeys

# ================================================================== THE HALL
# Walls to the roof, from below the slag. The west part's floor is slag: a fall
# from any gantry lands in it, never on a lower part of the way on.
L(wall('z', -70.5, -30, 30, -3, ROOF, holes=[
    (25, 29, WALK - 1, WALK + 4.5),        # the arrival room on to the roof walk
    (-29, -25, TIER - 1, TIER + 5),        # the control room into the hopper
    (-19, -15, STONE - 1, STONE + 4.4)]))  # the hopper's foot out on to what fell
# The bay's three outer walls open on to space: wide openings from a sill just
# over its floor up to under the crane's rails, with posts between. Over the sill
# is a fall, and that is allowed. (Three blank walls 60m high made the last
# arena a box.)
SPACE_Y0, SPACE_Y1 = BAYF + 0.6, 54
BAY_GAPS_X = [(34.5, 45.5), (46.5, 57.5), (58.5, 69.5)]
BAY_GAPS_Z = [(-29.5, -10.5), (-9.5, 9.5), (10.5, 29.5)]
L(wall('z', 70.5, -30, 30, -3, ROOF, holes=[(a, b, SPACE_Y0, SPACE_Y1) for a, b in BAY_GAPS_Z]))
L(wall('x', 30.5, -71, 71, -3, ROOF, holes=[(a, b, SPACE_Y0, SPACE_Y1) for a, b in BAY_GAPS_X]))
# The north wall, and two cages stood out from it over the north tier, each
# over the end of a pair of spans, where you stand.
PENS = [(-19, -11), (3, 11)]
PEN_Y0, PEN_Y1, PEN_Z1 = 31, 36.5, -26             # the cages' floor, roof and front
PEN_EZ = -28         # what is in them stands in the middle
L(wall('x', -30.5, -71, 71, -3, ROOF, holes=[(a, b, SPACE_Y0, SPACE_Y1) for a, b in BAY_GAPS_X]))
PEN_GRIDS = []
for x0, x1 in PENS:
    L(cage_pen(x0, x1, PEN_Y0, PEN_Y1, -30, PEN_Z1))
    hh, cz = PEN_Y1 - PEN_Y0, (-30 + PEN_Z1)/2
    for gid, gb in (('g_pen%d' % x0, ((x0 + x1)/2, PEN_Z1, x1 - x0 + 0.3, 0.3)),
                    ('g_pen%dw' % x0, (x0, cz, 0.3, PEN_Z1 + 30)),
                    ('g_pen%de' % x0, (x1, cz, 0.3, PEN_Z1 + 30))):
        HAZ.append(grid(gid, gb[0], PEN_Y0, gb[1], gb[2], hh, gb[3])); PEN_GRIDS.append(gid)
# The roof stops at the tower's east wall: over the bay it is open to space,
# like its walls, and the crane runs out under the stars.
L(lid(-71, 34, -31, 31, ROOF))
# x -70..22: a metre deep on a bed, and it burns (70/s, about 3s to live) - off
# a stone, you can jump back on, rather than dying outright.
HAZ.append({'t': 'molten', 'p': [-24, SLAG - 1.6, 0], 's': [92, 1.6, 60], 'burn': 70})
HBED = box(-24, SLAG - 2, 0, 92, 1, 60, 'block'); HBED['bed'] = True; L(HBED)
# the crane's rails, along the long walls, under the roof
L(box(0, RAIL, -29, 140, 1, 2, 'wall'), box(0, RAIL, 29, 140, 1, 2, 'wall'))

# ============================================================ THE ROOF WALK
# You come in at the west end under the roof, the whole hall below you and the
# crane passing overhead with the core. The walk's middle 44m is gone: past a
# dash. The span that crossed it hangs 11m up on two hangers - past a boost -
# from clamps on the south wall. Break both and it drops into place.
L(box(-80.5, WALK - 1, 25, 19, 1, 10, 'block', 'cyan', walk=True),           # the arrival room x -90..-71 z 20..30
  wall('x', 19.5, -91, -71, WALK, WALK + 6), wall('x', 30.5, -91, -71, WALK, WALK + 6),
  wall('z', -90.5, 20, 30, WALK, WALK + 6), lid(-91, -71, 19, 31, WALK + 6))
L(sill(-70.5, 27, 1, 4, WALK))
L(box(-58, WALK - 1, 27, 24, 1, 6, 'block', 'cyan', walk=True),              # the walk west x -70..-46
  box(10, WALK - 1, 27, 24, 1, 6, 'block', 'cyan', walk=True))               #   and east x -2..22
# Glass along the walk's north side, to above any boost: you see the hall,
# the tier and the crane, and you can't jump out across it on to the tier -
# 36m away and 16m down, a dash and a fall reached it.
GLASS_TOP = 56
PANES = [(-70 + 11.5*k + 0.5, -70 + 11.5*(k + 1) - 0.5) for k in range(8)]      # x -70..22, posts between
# Down to the slag under it: stopped at the walk, a drop into the gap went under
# the glass and out across the hall, and a double jump and a dash made the tier.
L(wall('x', 23.5, -70, 22, -3, GLASS_TOP, holes=[(a, b, WALK, GLASS_TOP - 1) for a, b in PANES],
       windows=list(range(len(PANES)))))
SPAN_UP = 11
L(fall('span', -24, WALK - 1 + SPAN_UP, 27, 43.9, 1, 6))
# It stands on two props in the gap, one under each end, each with a breach
# panel in it level with the walk: from the end of the walk you see both, the
# far one 44m off across the gap, the two set apart across the walk's width so
# the near one's post doesn't hide the far one. (Hung from clamps over it, the
# span hid the far one, and its own end hid the near one.) Break both and the
# props go down into the slag and the span drops into place.
STRUTS = []
SB = WALK - 0.5                                  # the strut's base: it stands 1.5m proud of the walk
for k, (px, pz) in enumerate(((-44.8, 25.6), (-3.2, 28.4))):
    L(fall('props', px, SLAG - 1, pz, 0.8, SB - SLAG + 1, 0.8, mat='wall', trim=None, walk=False),
      fall('props', px, SB + 2, pz, 0.8, WALK - 1 + SPAN_UP - (SB + 2), 0.8, mat='wall', trim=None, walk=False))
    STRUTS.append(breach(px, SB, pz, 2, 2, 2, id='strut%d' % k, do=[{'a': 'count', 'id': 'struts', 'do': [
        [{'a': 'fall', 'id': 'span', 'jolt': True}],
        [{'a': 'fall', 'id': 'props'}, {'a': 'fall', 'id': 'span'}, {'a': 'checkpoint', 'p': [-50, WALK, 27]}]]}]))
L(STRUTS)
CABLES = []

# ================================================================= THE TOWER
# In the hall's middle, x 22..34, walls to 53.4: the crane runs over it. The
# walk comes in at the top room; a cage fills the shaft on one cable, and the
# clamp on the cable is the way down - ride it, or follow it. The bottom room is
# an ambush, and its door opens on the north tier. Under it all, the tunnel from
# the slag into the bay.
# Glass in both long walls: the shaft looks over the hall as you go down it, and
# the bottom room over the north tier one way and down into the bay the other.
L(wall('z', 22.5, -30, 30, -3, TT, holes=[(25, 29, WALK - 1, WALK + 4.5), (-18, -14, TIER - 1, TIER + 5),
                                          (-28, -22, BAYF - 1, BAYF + 9), (12.2, 17.8, TIER + 0.5, TT - 1.5),
                                          (-12, 5, TIER + 0.2, BR_TOP - 1), (-21, 29.5, SLAG - 0.5, TIER - 1.5)],
       windows=[3, 4, 5]))
L(wall('z', 33.5, -30, 30, -3, TT, holes=[(-28, -22, BAYF - 1, BAYF + 9), (-18, 5, TIER + 0.2, BR_TOP - 1),
                                          (-21, 29.5, BAYF, TIER - 1.5), (12.2, 17.8, TIER + 0.5, TT - 1.5)], windows=[1, 2, 3]))
# Under the bottom room the tower is glass both sides, slag to bay: from either
# arena you see into the other. Its ceiling there, under the shaft and the top
# room's stair of rooms, is a slab, so what you see through it is a room.
L(box(28, TIER - 1.5, 21, 10, 0.5, 18, 'block'))
L(lid(22, 34, -30, 30, TT))
L(box(28, WALK - 1, 24.5, 10, 1, 11, 'block', 'cyan', walk=True))            # the top room x 23..33 z 19..30
L(sill(22.5, 27, 1, 4, WALK))
# the shaft x 23..29 z 12..18, between the two rooms, against the glass
L(wall('x', 18.5, 23, 33, TIER - 1, TT, holes=[(24, 28, WALK - 1, WALK + 4)]),
  wall('x', 11.5, 23, 33, TIER - 1, TT, holes=[(24, 28, GALB - 1, GALB + 4)]),
  # glass on its east side too, and in the tower's wall beyond: riding the
  # cage down you look out over the bay where it ends
  wall('z', 29.5, 12, 18, TIER - 1, TT, holes=[(12.2, 17.8, TIER + 0.5, TT - 1.5)], windows=[0]))
L(sill(26, 18.5, 4, 1, WALK), sill(26, 11.5, 4, 1, GALB))
# the cage: a floor and its east side, open to the rooms either end, to the
# glass and to the clamp above. It drops 10m and jams at the bottom room's
# walkway, braking for the last three - into the middle of the fight there.
CAGE = [fall('cage', 26, WALK - 1, 15, 5.8, 1, 5.8, trim='amber'),
        # its east side a rail at the waist, not a wall: you see over it, out through the glass
        fall('cage', 28.75, WALK, 15, 0.3, 1.1, 5.8, mat='wall', trim='amber', walk=False)]   # (not 'dark', which is flat black)
L(CAGE)
L(breach(26, 51, 15, 1.6, 1.6, 1.6, id='cageclamp', do=[{'a': 'fall', 'id': 'cage'}]))
for cx in (23.4, 28.6):
    for cz in (12.4, 17.6):
        CABLES.append({'a': [cx, WALK, cz], 'b': [26, 51, 15], 'cut': {'fall': 'cage'}})
# the bottom room x 23..33 z -20..11, at 28, two storeys: a ledge at 34 across
# its south end, where the cage stops, solid to the floor, and the rest open
# to the roof. One hard wave, from the floor and the air: fight it from the
# ledge, or drop and fight it on the floor - there is no need to climb back.
# (A walkway down the east side to a stair left an overhang the mites and
# drones went under, filled the room, and stood in front of the east glass.)
L(box(28, TIER - 1, -7.5, 10, 1, 25, 'block', 'cyan', walk=True))            # the floor x 23..33 z -20..5
L(wall('x', -20.5, 23, 33, TIER - 1, BR_TOP), lid(23, 33, -21, 11, BR_TOP))
L(box(28, TIER - 1, 8, 10, GALB - TIER + 1, 6, 'block', 'cyan', walk=True))  # the ledge x 23..33 z 5..11
L(sill(22.5, -16, 1, 4, TIER))
L(box(26, TIER, -6, 3.6, 2.4, 3.6, 'block', 'cyan'), box(31, TIER, -16, 3.6, 2.4, 3.6, 'block', 'cyan'))
# L0: the tier's landing outside the bottom room's door
L(box(19, TIER - 1, -16, 6, 1, 8, 'block', 'cyan', walk=True))              # x 16..22
# the tunnel x 22..34 z -28..-22 at 3, under everything, into the bay
L(box(28, BAYF - 1, -25, 10, 1, 6, 'block', 'cyan', walk=True))           # x 23..33, the sills in the walls
L(wall('x', -28.5, 23, 33, BAYF - 1, BAYF + 9), wall('x', -21.5, 23, 33, BAYF - 1, BAYF + 9), lid(23, 33, -29, -21, BAYF + 9))

# ===================================================== THE SPARE SECTIONS
# Five gantry sections hung over the middle of the hall at 37 - past a boost
# from the tier, and walled off from the walk. They let go with the tier, and
# land as islands in the slag: with the tier's spans, where the Bastion is
# fought, with enough ground to fight it on.
ISL_Y = 37
# 7m apart, and 14.5m from the spans: between them, a channel the Bastion wades
# (it keeps clear of anything it would wade into, and it is 9m across)
# The second and fourth sink under the slag as the Bastion weakens: what is left
# is three, 23m apart - a jump with a dash between each.
ISLANDS = [(-54, 7, 'isl'), (-38, 10, 'islB'), (-22, 7, 'isl'), (-6, 10, 'islD'), (8, 7, 'isl')]
for ix, iz, fid in ISLANDS:
    L(fall(fid, ix, ISL_Y - 1, iz, 9, 1, 9))
    for dx, dz in ((-4.1, -4.1), (4.1, 4.1)):
        CABLES.append({'a': [ix + dx, ISL_Y, iz + dz], 'b': [ix + dx, ROOF, iz + dz], 'cut': {'fall': fid}, 'r': 0.07})
ISL_SINK = -1.4              # an island sunk: its top 0.8m under the slag

# ============================================================ THE NORTH TIER
# East to west along z -20..-12 at 28: L0, S0, S1, a 42m gap, S2 and L1 end to end. Old spans
# on hangers from the north wall. Pens in the wall over them hold lancers and
# sentinels behind laser grids, and a Severer holds the anchor over the gap:
# the way on, L1's door into the west tower, is shut till all of them are down.
# Through L1's door the tier goes behind you into the slag, where it lies as
# the way on once you are down.
# S2 meets L1, so the far side of the gap is a 20m landing; L1 reaches 2m further
# north, to the control room's door
TIER_PIECES = [('s0', 4, 13, -20), ('s1', -8, 1, -20), ('s2', -62, -50, -20), ('l1', -70, -62, -22)]
for fid, x0, x1, z0 in TIER_PIECES:
    L(fall(fid, (x0 + x1)/2, TIER - 1, (z0 - 12)/2, x1 - x0, 1, -12 - z0))
    for xc in (x0 + 0.6, x1 - 0.6):
        if xc < -49: continue                     # the control room is in the way: it holds them
        CABLES.append({'a': [xc, TIER, z0 + 0.4], 'b': [xc, 40, -30], 'cut': {'fall': fid}, 'r': 0.08})
BAY_SINK = 0.8               # how far the bay's pit floors go down
FALLS = [{'id': 'span', 'dy': -SPAN_UP, 'warn': 1.4}, {'id': 'props', 'dy': -60, 'warn': 1.4},
         {'id': 'cage', 'dy': -(WALK - GALB), 'warn': 1.0, 'brake': 3},
         # one after another, away from the control room
         {'id': 'l1', 'dy': TIER_DY, 'warn': 0.8}, {'id': 's2', 'dy': TIER_DY, 'warn': 1.5},
         {'id': 's1', 'dy': TIER_DY, 'warn': 2.3}, {'id': 's0', 'dy': TIER_DY, 'warn': 3.1},
         # the spare sections hung over the middle of the hall: they go last
         *[{'id': fid, 'dy': round(STONE - ISL_Y, 3), 'warn': 3.9} for fid in ('isl', 'islB', 'islD')],
         # the hopper's floor from the middle out, a wave at a time, and last the
         # outer ring with you on it, braking at the bottom, over the slag
         {'id': 'hC', 'dy': -TIER, 'warn': 2.0}, {'id': 'hR', 'dy': -TIER, 'warn': 2.0},
         {'id': 'hO', 'dy': TIER_DY, 'warn': 2.5, 'brake': 4},
         # the bay's north and south floors: down into the metal, a metre under it
         *[{'id': fid, 'dy': -BAY_SINK, 'warn': 2.5} for fid in ('bN', 'bS', 'bE', 'bWN')],
         {'id': 'bWS', 'dy': -BAY_SINK, 'warn': 3}]
TA = [-33, 33, -16]          # over the gap, nearer its far side: the Severer holds it

# ============================================================ THE CONTROL ROOM
# A cab in the hall's north-west corner over L1, glassed floor to roof east
# along the tier and south over it. In through its door off L1: the door shuts
# behind you and a shutter lifts off the relay. Its console is up a stair, on a
# gallery 6m over the tier, so the near spans are seen falling rather than edge
# on. Arc the relay and the gantry lets go - L1 first,
# right under you, then the rest rolling away east, then the sections hung over
# the hall - and you watch it all fall. Nobody is on the tier by then: a drop on
# to the spans lying in the slag would be a way to the bay's door with no way back up.
GAL = TIER + 6                                                                # the gallery
L(box(-68, TIER - 1, -26.5, 4, 1, 7, 'block', 'cyan', walk=True))            # the landing x -70..-66, at the door
N_ST = 10
for i in range(N_ST):                                                        # the stair x -66..-56 along the north wall
    L(box(-65.5 + i, TIER - 1, -28.5, 1, 1 + (GAL - TIER)*(i + 1)/N_ST, 3, 'block', 'cyan', walk=True))
# The gallery is solid down to the landing's floor: as a slab, the space under it
# opened from the landing straight down into the slag, and its door shut nothing in.
L(box(-53, TIER - 1, -28.5, 6, GAL - TIER + 1, 3, 'block', 'cyan', walk=True),   # x -56..-50 at the stair's head,
  box(-58, TIER - 1, -25, 16, GAL - TIER + 1, 4, 'block', 'cyan', walk=True))    #   and along the south glass, x -66..-50
L(wall('z', -49.5, -30, -22, TIER - 1, CAB_TOP, holes=[(-29.5, -23.5, TIER + 0.2, CAB_TOP - 1)], windows=[0]),
  wall('x', -22.5, -70, -49, TIER - 1, CAB_TOP, holes=[(-70, -66, TIER - 1, TIER + 5), (-65.5, -50, TIER + 0.2, CAB_TOP - 1)],
       windows=[1]),
  lid(-70, -49, -30, -22, CAB_TOP))
L(sill(-68, -22.5, 4, 1, TIER))
L(box(-51, GAL, -27, 1.2, 1.0, 3.6, 'block', 'cyan'))                        # the console, at the east glass
L(panel('sh_rel', -52, GAL, -27, 0.3, 3, 4.4))                               # its shutter
RELEASE = [{'a': 'anchors', 'ids': ['tA'], 'off': True}, {'a': 'fall', 'id': 'l1'}, {'a': 'fall', 'id': 's2'}, {'a': 'fall', 'id': 's1'}, {'a': 'fall', 'id': 's0'},
           {'a': 'fall', 'id': 'isl'}, {'a': 'fall', 'id': 'islB'}, {'a': 'fall', 'id': 'islD'}, {'a': 'open', 'door': 'dHop'}, {'a': 'checkpoint', 'p': [-68, TIER, -28]}]

# ================================================================ THE HOPPER
# Behind the cab, in the west tower: a 25m square of floor panels on hangers at
# 28, over a 27m drop into slag. Three waves, held at their height over it, and
# the floor goes from the middle out: each wave won, the next ring shakes and
# drops - the middle panel, then the eight round it - and a few seconds later
# the next wave comes. The third is fought on the outer ring alone, and when it
# is won the whole ring goes down with you on it, braking at the bottom, to
# lie over the slag by the door out.
# (Panels going one at a time in the middle of a fight, the one by the door
# among them, read as random; and the last few going together left you
# guessing which one to be on.)
HOP_C = [-96, -91, -86, -81, -76]                                              # each column's west edge
HOP_R = [-35, -30, -25, -20, -15]                                              # each row's north edge
HX0, HX1, HZ0, HZ1 = -96, -71, -35, -10
HCX, HCZ = (HX0 + HX1)/2, (HZ0 + HZ1)/2
def ring(c, r): return max(abs(c - 2), abs(r - 2))
HOP = {(c, r): ('hC', 'hR', 'hO')[ring(c, r)] for c in range(5) for r in range(5)}
assert len(HOP) == 25
def cell(c, r): return HOP_C[c] + 2.5, HOP_R[r] + 2.5
for (c, r), fid in HOP.items():
    x, z = cell(c, r)
    L(fall(fid, x, TIER - 1, z, 4.96, 1, 4.96))
    for dx, dz in ((-2.1, -2.1), (2.1, 2.1)):
        CABLES.append({'a': [x + dx, TIER, z + dz], 'b': [x + dx, HOP_TOP, z + dz], 'cut': {'fall': fid}})
# a bed under all of it, just below where they come to rest: off a panel
# before its own has come down, you fell through the slag into nothing
HOPBED = box(HCX, -1.05, HCZ, HX1 - HX0, 1, HZ1 - HZ0, 'block'); HOPBED['bed'] = True; L(HOPBED)
# The inner panels come to rest a metre under the slag, a floor you wade on.
# Each wave comes down through the roof: three openings to the sky over the
# outer ring's middles, north, south and west, and a cage let down through each
# to hang half way down. (Not hatches in the walls, which would be somewhere to
# hide from the fight, and to be shut in after it.)
HOLES = [(2, 0), (2, 4), (0, 2)]                 # the cells under them: N, S, W
HOLE = 4.0                                       # square, inside its cell: clear of the walls
CAGE_AT = TIER + 6                               # where the cages stop: half way down, out of reach
def lid_holes(x0, x1, z0, z1, y, holes, mat='wall'):
    """A lid with square holes in it, laid in strips that tile."""
    xs = sorted({x0, x1} | {e for hx0, hx1, _, _ in holes for e in (hx0, hx1)})
    out = []
    for a, b_ in zip(xs, xs[1:]):
        cuts = sorted((hz0, hz1) for hx0, hx1, hz0, hz1 in holes if hx0 <= (a + b_)/2 <= hx1)
        zs = [z0] + [e for c in cuts for e in c] + [z1]
        for k in range(0, len(zs), 2):
            if zs[k + 1] - zs[k] > 1e-6: out.append(box((a + b_)/2, y, (zs[k] + zs[k + 1])/2, b_ - a, 0.6, zs[k + 1] - zs[k], mat))
    return out
ROOF_HOLES = []
for c, r in HOLES:
    x, z = cell(c, r)
    h = HOLE/2
    ROOF_HOLES.append((x - h, x + h, z - h, z + h))
    # open to the sky over it; an amber frame all round it underneath, where you see it
    L(box(x, HOP_TOP - 0.3, z - h - 0.2, HOLE + 0.8, 0.3, 0.4, 'neonA'), box(x, HOP_TOP - 0.3, z + h + 0.2, HOLE + 0.8, 0.3, 0.4, 'neonA'),
      box(x - h - 0.2, HOP_TOP - 0.3, z, 0.4, 0.3, HOLE, 'neonA'), box(x + h + 0.2, HOP_TOP - 0.3, z, 0.4, 0.3, HOLE, 'neonA'))
def drop_in(*cages):
    """A wave let down from the roof: one list of enemies per opening, N, S, W."""
    drops = []
    for (c, r), es in zip(HOLES, cages):
        if not es: continue
        x, z = cell(c, r)
        at = [x, CAGE_AT, z]
        # Let out where it hangs, and down to a height each holds whatever goes
        # from under it. (Down on the floor, you could walk into a cage.)
        drops.append({'at': at, 'enemies': [dict(e, p=at, fixed=True, **({'y': TIER + HOVER[e['kind']]} if e['kind'] in HOVER else {}))
                                            for e in es]})
    # down from over the roof, on cables from far up out of sight
    return {'a': 'deliver', 'movers': [], 'top': HOP_TOP + 14, 'cable': HOP_TOP + 90, 'drops': drops}
# no trim on their tops: under a lid with holes in it, it showed through, flickering
L(wall('x', HZ0 - 0.5, HX0 - 1, HX1, -3, HOP_TOP, trim=None), wall('z', HX0 - 0.5, HZ0, HZ1, -3, HOP_TOP, trim=None),
  wall('x', HZ1 + 0.5, HX0 - 1, HX1, -3, HOP_TOP, trim=None), lid_holes(HX0 - 1, HX1, HZ0 - 1, HZ1 + 1, HOP_TOP, ROOF_HOLES),
  wall('z', -70.5, HZ0 - 1, -31, -3, HOP_TOP, trim=None))                               # north of the hall's own west wall
L(sill(-70.5, -27, 1, 4, TIER), sill(-70.5, -17, 1, 4, STONE))
# It burns rather than killing outright: off the ring's inner edge there is a
# moment to get back up on it. What falls in that is not you is gone at once,
# well above it: a bulwark burning slowly down there held the wave open, out of
# sight, while you looked for an angle on it.
HAZ.append({'t': 'molten', 'p': [HCX, SLAG - 1.6, HCZ], 's': [HX1 - HX0, 1.6, HZ1 - HZ0], 'burn': 70, 'kill': TIER - 4})
# anywhere on the floor 2m past the door, then it shuts: a strip in from the door
# let you skirt round it to the back corner with nothing happening
HOP_IN = {'p': [(HX0 - 73)/2, TIER + 2, HCZ], 's': [-73 - HX0, 4, HZ1 - HZ0]}
HOP_ALL = {'p': [HCX, TIER + 1, HCZ], 's': [HX1 - HX0, 2, HZ1 - HZ0]}
# Saved as a wave is won, with the next one on its clock: a death puts you
# back on the ring with those seconds to go, never into the middle of it.
HOP_CP = {'a': 'checkpoint', 'p': [-73.5, TIER, -22.5], 'hp': 0.6}
HOP_GAP = 5            # won: the next ring goes, and this long after, the next wave
# Heights over the floor's level, held over the hole as well: every kind, those
# that hug the floor too - the bulwark, given none, followed the floor down
# into the hole every time the middle went
HOVER = {'drone': 2.6, 'sentinel': 3.6, 'lancer': 3.8, 'weaver': 4.2, 'warden': 4.4,
         'bulwark': 2.4, 'rusher': 1.2, 'mite': 1.0}
def hover(kind, x, z):
    return {'kind': kind, 'n': 1, 'p': [x, TIER + HOVER[kind], z], 'fixed': True, 'y': TIER + HOVER[kind]}
def walker(kind, n, c, r):
    x, z = cell(c, r)
    return {'kind': kind, 'n': n, 'p': [x, TIER, z]}
HOP_N = 3
def hop_wave(n, enemies):
    if n < HOP_N:
        won = [{'a': 'fall', 'id': ('hC', 'hR')[n - 1]}, {'a': 'drop', 'p': [-73.5, TIER + 0.5, -22.5], 'hp': 1},
               {'a': 'after', 't': HOP_GAP, 'do': [{'a': 'count', 'id': 'hop%d' % n}]}, HOP_CP]
    else:
        won = [{'a': 'count', 'id': 'hop%d' % n}, {'a': 'after', 't': 1.5, 'do': [{'a': 'fall', 'id': 'hO'}]}]
    return {'on': 'enter', 'vol': HOP_IN if n == 1 else HOP_ALL,
            **({'need': {'count': 'hop%d' % (n - 1)}} if n > 1 else {}), 'do': (
        [{'a': 'seal', 'door': 'dHop'}] if n == 1 else []) + [enemies, {'a': 'arena', 'onClear': won}]}
def E(kind, n=1): return {'kind': kind, 'n': n}
HOP_TRIGS = [
    hop_wave(1, drop_in([E('drone'), E('sentinel')], [E('drone', 2)], [E('mite', 3)])),
    hop_wave(2, drop_in([E('lancer'), E('rusher', 2)], [E('lancer'), E('bulwark')], [E('drone', 2), E('sentinel')])),
    # under a warden held at its height over the hole: what walked the outer
    # ring only ran off it into the pit
    hop_wave(3, drop_in([E('lancer'), E('drone')], [E('lancer'), E('drone')], [E('warden')])),
]

# ============================================================== WHAT FELL
# Out at the foot on to the tier and the sections lying in the slag, where the
# Bastion has waded all level. It wakes: its shot covers whatever you stand on,
# and the crane comes over and throws scrap at you too - what lands on a span
# stays there. The bay's door opens when the Bastion is dead.
def drops(box_, floor, every, warn, dmg, mx, size, first, opens=None):
    d = {'a': 'drops', 'from': 'cradle', 'box': box_, 'floor': floor, 'every': every, 'warn': warn, 'dmg': dmg,
         'max': mx, 's': size, 'first': first, 'avoid': [[CX, 0, 5], [36, -25, 7], [-73.5, -17.5, 4], [-66, -16, 3]]}
    if opens: d['opens'] = opens; d['open'] = 1.8
    return d
# As it weakens the ground goes: an island sinks, then the other. Nothing else
# comes, so the fight stays a duel rather than a scramble.
BASTION_PHASES = [
    {'at': 0.66, 'do': [{'a': 'fall', 'id': 'islB', 'more': ISL_SINK, 'warn': 3}]},
    {'at': 0.33, 'do': [{'a': 'fall', 'id': 'islD', 'more': ISL_SINK, 'warn': 3}]},
]
# Down with the ring, the foot door opens. Out of it, it shuts behind you and
# the Bastion wakes: an arena, with no way back into the hopper to shelter in.
# When it is dead it saves, and then the crane comes over and lets a cage down
# on the middle island: the bay's door opens when that is cleared too.
FOOT = [{'a': 'open', 'door': 'dFoot'}, {'a': 'drop', 'p': [-73.5, STONE + 0.5, -22.5], 'hp': 1}]
BASTION_IN = [{'a': 'seal', 'door': 'dFoot'},
        # saved where the arena starts, as a death in the Bastion fight does: at
        # its far end, a death in the cage's fight put you on the wrong side of it
        {'a': 'arena', 'onClear': [{'a': 'drop', 'p': [-66, STONE + 0.5, -16], 'hp': 2}, {'a': 'count', 'id': 'bast'},
                                   {'a': 'checkpoint', 'p': [-66, STONE, -16], 'hp': 0.6}]},
        {'a': 'wake'},
        {'a': 'move', 'mover': 'crane', 'to': [-40, CB, 0], 'period': 20, 'then': {'to': [0, CB, 0], 'period': 18, 'loop': True}},
        {'a': 'move', 'mover': 'cradle', 'to': [-40, CRT - 0.6, HZ], 'period': 20,
         'then': {'to': [0, CRT - 0.6, HZ], 'period': 18, 'loop': True}},
        drops([-70, 20, -22, 20], STONE, 4.0, 1.5, 30, 8, [2.4, 1.6, 2.4], 6),
        {'a': 'checkpoint', 'p': [-66, STONE, -16], 'hp': 0.6}]                 # L1's pad, fallen, out of the door
ISL_DROP = [-22, STONE, 7]
AFTER_BASTION = [
    {'a': 'deliver', 'movers': ['crane', 'cradle'],
     'drops': [{'at': ISL_DROP, 'enemies': [dict(e, p=ISL_DROP) for e in (
         {'kind': 'bulwark', 'n': 1}, {'kind': 'lancer', 'n': 1}, {'kind': 'sentinel', 'n': 1},
         {'kind': 'rusher', 'n': 2}, {'kind': 'mite', 'n': 4})]}]},
    {'a': 'arena', 'onClear': [{'a': 'open', 'door': 'dBay'}, {'a': 'open', 'door': 'dBayIn'},
                               {'a': 'drop', 'p': [-3.5, STONE + 0.5, -16], 'hp': 1},
                               {'a': 'checkpoint', 'p': [-3.5, STONE, -16]}]}]

# =================================================================== THE BAY
# The hall's east end, floor at 3: a west strip where the tunnel comes in, a
# middle where the cradle comes down, an east strip, and north and south
# floors over slag that go as the fight does.
# What stays is the middle, round where the cradle comes down, x 34..60 z
# -10..10: solid down to the pits' bottom - as slabs, a wade under one went out
# of the world. The rest is five sections that go as the fight does, down into
# the metal: the north and south, the east end, then the west end's two halves.
L(box(40, -1, 0, 12, BAYF + 1, 20, 'block', 'cyan', walk=True),               # x 34..46 z -10..10
  box(53, -1, 0, 14, BAYF + 1, 20, 'block', 'cyan', walk=True))               # x 46..60 z -10..10
BAY_SECTIONS = [('bN', 58, -20, 24, 20), ('bS', 58, 20, 24, 20), ('bE', 65, 0, 10, 20),
                ('bWN', 40, -20, 12, 20), ('bWS', 40, 20, 12, 20)]
# They sink a little and the metal wells up over them, 0.6m deep and just under
# the bay's floor: you wade out, and what went in with them can get out too,
# rather than being stuck in a pit or out of reach.
for fid, cx, cz, w, d in BAY_SECTIONS:
    L(fall(fid, cx, BAYF - 1, cz, w, 1, d))
    HAZ.append({'t': 'molten', 'id': 'slag_' + fid, 'p': [cx, BAYF - 1.8, cz], 's': [w, 1.6, d], 'burn': 70,
                'off': True, 'riseFrom': BAYF - 1.6, 'riseT': 5})
def sink(fid): return [{'a': 'fall', 'id': fid}, {'a': 'hazard', 'id': 'slag_' + fid, 'on': True}]
# and a word as it starts to shake, which floor: they go in the shake's few seconds
def floor_goes(where, *fids):
    return [{'a': 'banner', 'title': where + ' FLOOR GIVING WAY', 'danger': True}] + [x for f in fids for x in sink(f)]
L(sill(33.5, -25, 1, 6, BAYF), sill(22.5, -25, 1, 6, BAYF))
# cover on the west end's two halves, going down with them: the north one stood
# on the middle at z -8, where the cages come down at z -6, and they met
L(fall('bWN', 40, BAYF, -12, 4, 2.2, 4, trim='cyan', walk=False), fall('bWS', 40, BAYF, 12, 4, 2.2, 4, trim='cyan', walk=False), fall('bE', 66, BAYF, -4, 4, 2.2, 4, trim='cyan', walk=False),
  fall('bN', 56, BAYF, -20, 4, 2.2, 4, trim='cyan', walk=False), fall('bS', 60, BAYF, 20, 4, 2.2, 4, trim='cyan', walk=False))

# ================================================================= THE CRANE
# A beam across the hall on rails along the long walls, running its length all
# level, with the core riding on top of it - seen from across the hall, out of
# sight from under it - and a hoist hanging under it that throws scrap and
# carries the cages. It is brought down in the bay: five clamps along its
# underside hold it up. Four of them go one at a time, a wave between each, and
# when the last wave is dead the middle one lights: break that and it falls,
# while you are looking up at it, and the core lies on it in the slag.
# Along the underside, z -30..30: clamps at 0, 12 and 24 each way; the cages
# come down at 6 either side of the middle or round 18, out of their way;
# the hoist hangs at 18 south, and the driver's cab is at the south end.
CRANE_RUN = 70
CR_P = [CX, CB, 0]; CR_TO = [-52, CB, 0]
CD_P = [CX, CRT - 0.6, HZ]; CD_TO = [-52, CRT - 0.6, HZ]
TROLLEY = rider('cradle', CX, CB + 2.5, HZ, 5, 1.2, 5, 'block', 'amber'); TROLLEY['flat'] = True
PLINTH = rider('crane', CX, CB + 2.5, 0, 2.4, 0.6, 2.4, 'block', 'amber'); PLINTH['keep'] = True
L(TROLLEY, PLINTH,
  rider('crane', CX, CB + 2.5, 27.5, 4, 1, 3, 'wall'), rider('crane', CX, CB + 2.5, -27.5, 4, 1, 3, 'wall'),   # the end carriages
  rider('crane', CX, CB - 3.2, 28, 2.6, 3, 2.6, 'block', 'amber'))            # the driver's cab
# Amber along the beam's and the hoist's bottom edges: a trim sits on top, and
# from the bay floor 57m down they would be a dark line on a dark roof.
L([rider('crane', CX + sx*1.5, CB - 0.25, 0, 0.5, 0.5, 59.4, 'neonA') for sx in (-1, 1)],
  [rider('cradle', CX + sx*2.2, CRT - 0.85, HZ, 0.4, 0.4, 4.0, 'neonA') for sx in (-1, 1)],
  [rider('cradle', CX, CRT - 0.85, HZ + sz*2.2, 4.0, 0.4, 0.4, 'neonA') for sz in (-1, 1)])
# the hoist's cables, from the trolley on top down past the beam's sides
for dx in (-2.1, 2.1):
    for dz in (-1.8, 1.8):
        CABLES.append({'a': [CX + dx, CB + 2.5, HZ + dz], 'aOn': 'cradle', 'aFlat': True,
                       'b': [CX + dx, CRT, HZ + dz], 'bOn': 'cradle', 'cut': {'mover': 'cradle'}, 'r': 0.1})
# outside in, the middle last
CLAMP_Z = [-24, 24, -12, 12, 0]
CLAMP_IDS = ['clamp%d' % k for k in range(5)]
CLAMP_S = 3.6                 # 57m over the bay floor: big enough to see which one is lit, and to hit
BAY_BOX = [34, 70, -30, 30]
# It throws all fight long. Once nothing it let out is still alive, one clamp
# lights - in turn, with a glow round it - and stays lit till it is broken: each
# clamp is a fight and then a shot.
def bay_drops(every): return drops(BAY_BOX, BAYF, every, 1.4, 40, 10, [3, 2, 3], 2.5)
BAY_ALL = {'p': [52, BAYF + 8, 0], 's': [36, 20, 60]}      # all of it, standing on scrap and cover too
# Halfway, with two clamps gone and the third lit, it saves, so a death at the
# end isn't the whole fight again.
BAY_CP = {'a': 'checkpoint', 'p': [36, BAYF, -3], 'hp': 0.6}
# The middle one lights when the last wave is dead, and the throwing stops: all
# there is to do is look up and break it.
PHASE_TRIGS = [{'on': 'enter', 'vol': BAY_ALL, 'need': {'count': 'cl%d' % k, 'clear': True},
                'do': [{'a': 'expose', 'ids': [CLAMP_IDS[k]]}, {'a': 'banner', 'title': 'CLAMP %d OF 5' % (k + 1)}]
                      + ([BAY_CP] if k == 2 else [])
                      + ([{'a': 'drops', 'on': False}] if k == 4 else [])} for k in range(5)]
# Each wave comes down in cages from the crane, either side of the middle clamp,
# on the floor that stays.
def bay_cages(north, south, x=40):
    return {'a': 'deliver', 'join': True, 'movers': ['crane', 'cradle'],
            'drops': [{'at': [x, BAYF, z], 'enemies': [dict(e, p=[x, BAYF, z]) for e in es]}
                      for z, es in ((-6, north), (6, south))]}
# where it waits to be finished: over the east end, so it falls along the east wall
PARK = 63
CLAMP_DO = [{'a': 'count', 'id': 'clamps', 'do': [
    # the north floor goes
    [*floor_goes('NORTH', 'bN'), bay_drops(2.6), {'a': 'count', 'id': 'cl1'},
     bay_cages([{'kind': 'sentinel', 'n': 1}, {'kind': 'drone', 'n': 2}],
               [{'kind': 'lancer', 'n': 1}, {'kind': 'mite', 'n': 3}])],
    # then the south, and it throws faster
    [*floor_goes('SOUTH', 'bS'), bay_drops(2.3), {'a': 'count', 'id': 'cl2'},
     bay_cages([{'kind': 'lancer', 'n': 2}, {'kind': 'drone', 'n': 3}],
               [{'kind': 'bulwark', 'n': 1}, {'kind': 'rusher', 'n': 2}])],
    # then the east end - the biggest wave, under a weaver: kill it first
    [*floor_goes('EAST', 'bE'), bay_drops(1.9), {'a': 'count', 'id': 'cl3'},
     bay_cages([{'kind': 'weaver', 'n': 1}, {'kind': 'lancer', 'n': 1}, {'kind': 'sentinel', 'n': 1}],
               [{'kind': 'bulwark', 'n': 1}, {'kind': 'rusher', 'n': 2}, {'kind': 'mite', 'n': 3}])],
    # the west end goes, and what is left is the middle. The crane
    # brings the last of them right there, then goes over the east end and waits
    [*floor_goes('WEST', 'bWS', 'bWN'), {'a': 'count', 'id': 'cl4'},
     dict(bay_cages([{'kind': 'mite', 'n': 4}, {'kind': 'drone', 'n': 2}],
                    [{'kind': 'mite', 'n': 4}, {'kind': 'rusher', 'n': 2}, {'kind': 'drone', 'n': 1}], x=CX),
          then=[{'a': 'move', 'mover': 'crane', 'to': [PARK, CB, 0], 'period': 6},
                {'a': 'move', 'mover': 'cradle', 'to': [PARK, CRT - 0.6, HZ], 'period': 6}])]]}]
CLAMPS = []
for k, z in enumerate(CLAMP_Z):
    CLAMPS.append(breach(CX, CB - CLAMP_S + 0.6, z, CLAMP_S, CLAMP_S - 0.6, CLAMP_S, id=CLAMP_IDS[k], on='crane', shut=True,
                         **({'do': CLAMP_DO} if k < 4 else {})))
L(CLAMPS)

BAY_IN = [
    {'a': 'seal', 'door': 'dBayIn'},
    {'a': 'brief', 'title': 'THE CRANE', 'sub': 'Look up. Shoot out its clamps as they light.'},
    # Over the bay, and up and down it over the floor that stays, never out of
    # sight: called away for a cage, it comes back to this.
    {'a': 'move', 'mover': 'crane', 'to': [44, CB, 0], 'period': 22,
     'then': {'to': [60, CB, 0], 'period': 16, 'loop': True}},
    {'a': 'move', 'mover': 'cradle', 'to': [44, CRT - 0.6, HZ], 'period': 22,
     'then': {'to': [60, CRT - 0.6, HZ], 'period': 16, 'loop': True}},
    dict(bay_drops(2.8), first=15), {'a': 'count', 'id': 'cl0'},
    # the first of them in cages too: nothing in this fight just appears
    bay_cages([{'kind': 'sentinel', 'n': 1}, {'kind': 'drone', 'n': 2}], [{'kind': 'sentinel', 'n': 1}, {'kind': 'lancer', 'n': 1}]),
    # The middle clamp broken, it goes: the hoist drops, the trolley on top of
    # the beam goes with the beam (`flat` - left out, it hung in the air), and the beam comes off
    # its rails into the slag along the east wall, broken, with the core on it.
    {'a': 'arena', 'need': {'breached': CLAMP_IDS},
     'onClear': [{'a': 'wreck', 'mover': 'crane', 'flat': 'cradle', 'with': ['cradle'], 'x': PARK, 'floor': BAYF - 0.2,
                  'then': [{'a': 'uncage'}, {'a': 'open', 'door': 'dBayIn'}, {'a': 'open', 'door': 'dBay'},
                           {'a': 'drop', 'p': [57, BAYF + 0.5, 2], 'hp': 2},
                           {'a': 'checkpoint', 'p': [56, BAYF, 4]}]},
                 {'a': 'checkpoint', 'p': [37, BAYF, 4]}]},
    {'a': 'checkpoint', 'p': [40, BAYF, -25]}]

# ======================================================== THE BOTTOM ROOM
BR_ALL = {'p': [28, (TIER + BR_TOP)/2, -4.5], 's': [10, BR_TOP - TIER, 31]}
BR_CP = {'a': 'checkpoint', 'p': [28, GALB, 8]}                                # on the walkway, where the cage stops
# One wave, and a hard one, rather than three with lulls between that leave you
# waiting to see whether there is more. Saved as you arrive, before it: a
# death brings it in fresh.
BR_TRIGS = [
    {'on': 'enter', 'vol': BR_ALL, 'do': [BR_CP]},
    {'on': 'enter', 'vol': BR_ALL, 'do': [
        {'a': 'spawn', 'enemies': [{'kind': 'warden', 'n': 1, 'p': [27, TIER, -12]},
                                   {'kind': 'weaver', 'n': 1, 'p': [28, TIER, -5]},
                                   {'kind': 'bulwark', 'n': 1, 'p': [25, TIER, -16]}, {'kind': 'bulwark', 'n': 1, 'p': [29, TIER, -9]},
                                   {'kind': 'lancer', 'n': 1, 'p': [25, TIER, -2]}, {'kind': 'lancer', 'n': 1, 'p': [30, TIER, -18]},
                                   {'kind': 'mite', 'n': 4, 'p': [27, TIER, -17]}]},
        {'a': 'arena', 'onClear': [{'a': 'open', 'door': 'dL0'}, {'a': 'drop', 'p': [28, GALB + 0.5, 7], 'hp': 1},
                                   {'a': 'drop', 'p': [28, TIER + 0.5, -14], 'hp': 1},
                                   {'a': 'checkpoint', 'p': [28, TIER, -14]}]}]},
]

LEVEL = {
 'id': 'act3-2', 'name': 'SECTOR 3-2', 'subtitle': 'THE GANTRIES', 'act': 3,
 'floor': False, 'floorY': 0, 'quietLoad': True, 'space': True,
 # enemies stay in the hall, or in the west tower and the arrival room: the bay is open to space
 'enemyBoxes': [[-71, 71, -31, 31], [-100, -70, -40, 35]],
 'loadout': ['pulse', 'scatter', 'rail', 'tether', 'arc', 'sunder'],
 'spawn': {'p': [-84, WALK, 25], 'yaw': -1.5708},
 'hazards': HAZ,
 'geometry': G,
 'falls': FALLS,
 'cables': CABLES,
 'movers': [
   {'id': 'crane', 'p': CR_P, 'to': CR_TO, 's': [3, 2.5, 60], 'period': CRANE_RUN, 'mat': 'block', 'trim': 'amber'},
   {'id': 'cradle', 'p': CD_P, 'to': CD_TO, 's': [4.4, 0.6, 4.4], 'period': CRANE_RUN, 'mat': 'dark', 'trim': 'amber'},
 ],
 'anchors': [{'id': 'tA', 'p': TA, 'hold': 'tA'}],
 'conduits': [{'id': 'c_rel', 'p': [-51, GAL + 1.8, -27], 'do': RELEASE}],
 'pylons': [], 'nodes': [], 'enemies': [], 'keys': [],
 'doors': [
   {'id': 'dTop', 'p': [22.5, WALK, 27], 's': [1.2, 4.5, 4], 'lock': 'script'},
   {'id': 'dL0', 'p': [22.5, TIER, -16], 's': [1.2, 5, 4], 'lock': 'script'},
   {'id': 'dWT', 'p': [-68, TIER, -22.5], 's': [4, 5, 1.2], 'lock': 'script'},
   {'id': 'dHop', 'p': [-70.5, TIER, -27], 's': [1.2, 5, 4], 'lock': 'script'},
   {'id': 'dFoot', 'p': [-70.5, STONE, -17], 's': [1.2, 4.4, 4], 'lock': 'script'},
   # the bay's door, at the tunnel's west end: shut till you come down. A fall
   # past it from the tier meets it shut.
   {'id': 'dBay', 'p': [22.5, BAYF, -25], 's': [1.2, 9, 6], 'lock': 'script'},
   # and its inner door, in the bay's wall: it shuts behind you, so the tunnel
   # is not somewhere to stand out of the fight
   {'id': 'dBayIn', 'p': [33.5, BAYF, -25], 's': [1.2, 9, 6], 'lock': 'script', 'boss': True},
 ],
 'weapons': [],
 'checkpoints': [{'p': [-84, WALK, 25]}, {'p': [-50, WALK, 27]}, {'p': [2, WALK, 27]}, {'p': [18, WALK, 27]},
                 {'p': [28, WALK, 25]}, {'p': [28, GALB, 8]}, {'p': [28, TIER, -14]},
                 {'p': [19, TIER, -16]}, {'p': [-66, TIER, -16], 'fall': 'l1'}, {'p': [-68, TIER, -28]},
                 {'p': [-73.5, TIER, -22.5], 'fall': 'hO'},
                 {'p': [-3.5, TIER, -16], 'fall': 's1'}, {'p': [28, BAYF, -25]},
                 {'p': [40, BAYF, -25]}, {'p': [36, BAYF, -3]}, {'p': [37, BAYF, 4]}, {'p': [56, BAYF, 4]}],
 'triggers': [
  {'on': 'enter', 'vol': {'p': [-84, WALK + 2, 25], 's': [10, 4, 8]}, 'do': [
    {'a': 'brief', 'title': 'SECTOR 3-2 · THE GANTRIES', 'sub': 'The charging hall. Its crane carries the core.'},
    # wading the slag under the gantries all level, seen from all of it
    {'a': 'spawn', 'enemies': [{'kind': 'bastion', 'n': 1, 'p': [-30, SLAG + 1.9, -2], 'y': SLAG + 1.9, 'wade': SLAG,
                                'dormant': True, 'patrol': [[-50, -5], [-30, -5], [-10, -5], [6, -5], [-30, -4]],
                                'phases': BASTION_PHASES}]},
    {'a': 'checkpoint', 'p': [-84, WALK, 25]}]},
  {'on': 'enter', 'vol': {'p': [-60, WALK + 2, 27], 's': [6, 4, 6]}, 'do': [
    # inside the glass, over the gap: on the far side of it they could not be shot
    {'a': 'spawn', 'enemies': [flier('drone', 2, [-30, WALK + 4, 27])]}]},
  # over the span: the far end of the walk holds the tower's door
  {'on': 'enter', 'vol': {'p': [1.5, WALK + 1, 27], 's': [5, 2, 6]}, 'do': [
    spawn(('sentinel', 1, [16, WALK, 27]), ('lancer', 1, [19, WALK, 26])),
    {'a': 'spawn', 'enemies': [flier('drone', 2, [12, WALK + 4, 27])]},
    {'a': 'arena', 'onClear': [{'a': 'open', 'door': 'dTop'}, {'a': 'drop', 'p': [18, WALK + 0.5, 27], 'hp': 1},
                               {'a': 'checkpoint', 'p': [18, WALK, 27]}]},
    {'a': 'checkpoint', 'p': [2, WALK, 27]}]},
  {'on': 'enter', 'vol': {'p': [28, WALK + 1, 25], 's': [10, 2, 10]}, 'do': [{'a': 'checkpoint', 'p': [28, WALK, 25]}]},
  # the bottom room: one hard wave over its two storeys
 ] + BR_TRIGS + [
  {'on': 'enter', 'vol': {'p': [19, TIER + 1, -16], 's': [6, 2, 8]}, 'do': [{'a': 'checkpoint', 'p': [19, TIER, -16]}]},
  # on to the tier: the pens wake, and the Severer takes the gap's anchor
  {'on': 'enter', 'vol': {'p': [8.5, TIER + 1, -16], 's': [9, 2, 8]}, 'do': [
    {'a': 'spawn', 'enemies': [penned('lancer', -17, PEN_Y0, PEN_EZ), penned('sentinel', -15, PEN_Y0, PEN_EZ),
                               penned('lancer', -13, PEN_Y0, PEN_EZ),
                               penned('lancer', 5, PEN_Y0, PEN_EZ), penned('sentinel', 9, PEN_Y0, PEN_EZ),
                               {'kind': 'severer', 'n': 1, 'p': [-31, 33, -14], 'fixed': True, 'holds': 'tA'}]},
    {'a': 'arena', 'onClear': [{'a': 'hazard', 'id': gid, 'on': False} for gid in PEN_GRIDS] + [
                               {'a': 'count', 'id': 'tier1'}, {'a': 'drop', 'p': [-3.5, TIER + 0.5, -14], 'hp': 1}]}]},
  # Over the gap and at the control room's door, saved; then the crane comes
  # over and lets a cage down on S2's far end, and that is all: you watch it
  # come. Fliers in off the hall as it came took your eyes off the moment the
  # crane turns on you. A death puts you back on L1 with the cage still to come.
  {'on': 'enter', 'vol': {'p': [-66, TIER + 0.5, -16], 's': [8, 1, 8]}, 'do': [{'a': 'checkpoint', 'p': [-66, TIER, -16], 'hp': 0.6}]},
  {'on': 'enter', 'vol': {'p': [-66, TIER + 1, -17], 's': [8, 2, 10]}, 'need': {'count': 'tier1'}, 'do': [
    {'a': 'deliver', 'movers': ['crane', 'cradle'],
     'drops': [{'at': [-52.5, TIER, -16], 'enemies': [{'kind': 'bulwark', 'n': 1, 'p': [-52.5, TIER, -16]},
                                                      {'kind': 'sentinel', 'n': 1, 'p': [-52.5, TIER, -16]},
                                                      {'kind': 'rusher', 'n': 2, 'p': [-52.5, TIER, -16]},
                                                      {'kind': 'mite', 'n': 4, 'p': [-52.5, TIER, -16]}]}]},
    {'a': 'arena', 'onClear': [{'a': 'open', 'door': 'dWT'}, {'a': 'drop', 'p': [-66, TIER + 0.5, -16], 'hp': 1}]}]},
  # into the cab: shut in, and the relay uncovered
  {'on': 'enter', 'vol': {'p': [-68, TIER + 1, -28], 's': [4, 2, 4]}, 'do': [
    {'a': 'seal', 'door': 'dWT'}, {'a': 'reveal', 'panel': 'sh_rel'}, {'a': 'checkpoint', 'p': [-68, TIER, -28]}]},
 ] + HOP_TRIGS + [
  # the foot: out on to what fell, under the crane
  # anywhere on the hopper's floor once the third wave is won: on the last panel,
  # or in the slag having gone down with the set before it
  {'on': 'enter', 'vol': {'p': [HCX, STONE, HCZ], 's': [HX1 - HX0, 4, HZ1 - HZ0]}, 'need': {'count': 'hop%d' % HOP_N}, 'do': FOOT},
  {'on': 'enter', 'vol': {'p': [-66, STONE + 1, -17], 's': [7, 3, 9]}, 'need': {'count': 'hop%d' % HOP_N}, 'do': BASTION_IN},
  # anywhere out on what fell, once the Bastion is dead (and saved)
  {'on': 'enter', 'vol': {'p': [-25, STONE + 3, 0], 's': [96, 8, 60]}, 'need': {'count': 'bast'}, 'do': AFTER_BASTION},
  {'on': 'enter', 'vol': {'p': [28, BAYF + 1, -25], 's': [8, 2, 6]}, 'do': [
    {'a': 'drops', 'on': False}, {'a': 'checkpoint', 'p': [28, BAYF, -25]}]},
  {'on': 'enter', 'vol': {'p': [40, BAYF + 1, -24], 's': [8, 2, 12]}, 'do': BAY_IN},
 ] + PHASE_TRIGS,
 # on top of the crane, on its plinth: no cage - nothing reaches it up there till it falls
 'goal': {'t': 'artifact', 'id': 'core-a3-2', 'p': [CX, CB + 3.1 + 1.1, 0], 'on': 'crane', 'locked': True, 'cage': 0},
}

# what falls or rides stays out of the merge passes: trimmed to fit its
# neighbours where it starts, it would arrive cut short where it ends up
MOVING = [g for g in G if g.get('fall') or g.get('on')]
G[:] = [g for g in G if not (g.get('fall') or g.get('on'))]
dedupe_walls(G); unstitch_walls(G); dedupe_floors(G); hide_floor_edges(G); drop_buried_trims(G)
G.extend(MOVING)
for g in G:
    assert isinstance(g, dict) and 'p' in g and 's' in g, g
    assert all(isinstance(v, (int, float)) for v in g['p'] + g['s']), g
json.dump(LEVEL, open('levels/act3-2.json', 'w'), indent=1)
print('levels/act3-2.json: %d geometry pieces' % len(G))

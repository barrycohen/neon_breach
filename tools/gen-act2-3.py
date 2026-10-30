#!/usr/bin/env python3
"""Sector 2-3 - The Stacks (rework).

The foundry's exhaust yard, where the plant vents its charge as storms - and
the level is about making them do what you want. Three new rules, each the
subject of one stack:

  a storm can rise and fall like a tide     THE FLUE, west
  a valve conduit moves a storm             THE DIVERTER, east
  a storm carries the Arc: shoot one and    THE CONDENSER, south-east
  it powers every conduit inside it

The yard between them erupts from its vents; each stack you finish shuts the
two vents it feeds and opens a short way back. The relays light three lamps
on the Main Stack's gate, and the Dynamo is inside: three phases up the
stack, the storm rising under you. The design and its reasons are in
docs/campaign-design.md under "Sector 2-3 - rework". North is -z.

  ARRIVAL        x -10..10    z 126..138
  YARD           x -50..50    z 26..126     open to the sky
  FLUE           x -82..-62   z 42..62      a shaft 55m tall, six steps up it
  DIVERTER       x 58..120    z 52..108     two stormed ducts and a valve hall
  CONDENSER      x 10..81     z 140..170    a low hall, a high one, a lift up a chimney
  MAIN STACK     x -25..25    z -40..10     base 1, gallery 26, deck 52
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lvlbuild import box, room, lid, dedupe_walls, dedupe_floors, hide_floor_edges, drop_buried_trims, unstitch_walls

G, HAZ, SHELTERS, MARKS = [], [{'t': 'void', 'below': -20}], [], []
def L(*items):
    for it in items:
        if isinstance(it, list): G.extend(it)
        else: G.append(it)

def sill(x, z, w, d, top):
    """Floor in the wall slot under a doorway between two rooms."""
    return box(x, top - 1, z, w, 1, d, 'block', None, walk=True)

def link_x(xa, xb, zc, width, h, y=0, lidded=True):
    """A corridor along x between two rooms' walls centred on xa and xb."""
    x0, x1 = min(xa, xb) + 0.5, max(xa, xb) - 0.5
    cx, ln, top = (x0 + x1)/2, x1 - x0, y + 1
    out = [box(cx, y, zc, ln, 1, width, 'block', 'cyan', walk=True)]
    for sd in (-1, 1): out.append(box(cx, top, zc + sd*(width/2 + 0.5), ln, h, 1, 'wall', 'magenta'))
    out += [sill(xa, zc, 1, width, top), sill(xb, zc, 1, width, top)]
    if lidded: out += lid(x0, x1, zc - width/2 - 1, zc + width/2 + 1, top + h)
    return out

def link_z(za, zb, xc, width, h, y=0, lidded=True):
    """The same along z."""
    z0, z1 = min(za, zb) + 0.5, max(za, zb) - 0.5
    cz, ln, top = (z0 + z1)/2, z1 - z0, y + 1
    out = [box(xc, y, cz, width, 1, ln, 'block', 'cyan', walk=True)]
    for sd in (-1, 1): out.append(box(xc + sd*(width/2 + 0.5), top, cz, 1, h, ln, 'wall', 'magenta'))
    out += [sill(xc, za, width, 1, top), sill(xc, zb, width, 1, top)]
    if lidded: out += lid(xc - width/2 - 1, xc + width/2 + 1, z0, z1, top + h)
    return out

def storm(sid, x, y, z, w, h, d, **kw):
    s = {'t': 'storm', 'p': [x, y, z], 's': [w, h, d]}
    if sid: s['id'] = sid
    s.update(kw)
    return s

def cover(*spots, y=1, h=2.6):
    return [box(cx, y, cz, 3.6, h, 3.6, 'block', 'cyan') for cx, cz in spots]

def cage(x, y, z, w, h, d):
    """A grate box round a conduit: seen through, but no Arc gets in - only a
    storm round it does."""
    t = 0.3
    return [box(x, y, z - d/2 + t/2, w, h, t, 'dark', grate=True), box(x, y, z + d/2 - t/2, w, h, t, 'dark', grate=True),
            box(x - w/2 + t/2, y, z, t, h, d - 2*t, 'dark', grate=True), box(x + w/2 - t/2, y, z, t, h, d - 2*t, 'dark', grate=True),
            box(x, y + h, z, w, t, d, 'dark', grate=True)]

def cubby(x, y, z, w, d, along, h=3.4):
    """A shelter niche on a ledge against a wall: a roof and two cheeks, and the
    space inside is somewhere no storm reaches. `along` is the axis the opening
    faces across ('x' - the cheeks stand at either end in z)."""
    out = [box(x, y + h, z, w, 0.4, d, 'wall', 'amber')]
    if along == 'x':
        out += [box(x, y, z - d/2 + 0.25, w, h, 0.5, 'wall'), box(x, y, z + d/2 - 0.25, w, h, 0.5, 'wall')]
        SHELTERS.append({'p': [x, y, z], 's': [w, h, d - 1.0]})
    else:
        out += [box(x - w/2 + 0.25, y, z, 0.5, h, d, 'wall'), box(x + w/2 - 0.25, y, z, 0.5, h, d, 'wall')]
        SHELTERS.append({'p': [x, y, z], 's': [w - 1.0, h, d]})
    return out

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

def recess(axis, fixed, out_dir, u, w, floor, h=3.4, depth=2.5):
    """A niche let into a wall: outside the storm's box, so nothing reaches in.
    `fixed` is the wall's centre, `out_dir` which way is out of the room."""
    o = fixed + out_dir*(0.5 + depth/2)                          # middle of the niche
    back = fixed + out_dir*(0.5 + depth + 0.5)
    if axis == 'z':      # the wall runs along z, at x = fixed
        return [box(o, floor - 1, u, depth, 1, w, 'block', None, walk=True),
                box(back, floor - 1, u, 1, h + 1, w + 2, 'wall'),
                box(o, floor, u - w/2 - 0.5, depth, h, 1, 'wall'), box(o, floor, u + w/2 + 0.5, depth, h, 1, 'wall'),
                box(o + out_dir*0.5, floor + h, u, depth + 1, 0.4, w + 2, 'wall', 'amber')]   # roof stops at the wall
    return [box(u, floor - 1, o, w, 1, depth, 'block', None, walk=True),
            box(u, floor - 1, back, w + 2, h + 1, 1, 'wall'),
            box(u - w/2 - 0.5, floor, o, 1, h, depth, 'wall'), box(u + w/2 + 0.5, floor, o, 1, h, depth, 'wall'),
            box(u, floor + h, o + out_dir*0.5, w + 2, 0.4, depth + 1, 'wall', 'amber')]

def vent(x, z, w=10):
    """A grille in the yard floor, where a plume comes up."""
    b = box(x, 1, z, w, 0.2, w, 'dark')
    b['vent'] = True
    return b

# ==================================================================== ARRIVAL
L(room(0, 132.5, 20, 11, h=8, over=0, doors=[('n', 0, 8, 6)]))                 # x -10..10 z 127..138

# ======================================================================= YARD
# Open to the sky. Vents erupt on a beat: one in front of each stack's way in,
# one in front of the way back (or on the way in, for the Condenser, which has
# no separate way back), and two in the middle that never stop. Every trip is
# timed, and a stack done shuts its two - which also tells you it is done.
L(room(0, 76, 100, 100, h=22, doors=[
    ('s', 0, 8, 6), ('s', 30, 8, 7),                      # arrival; the condenser
    ('w', 24, 8, 7),                                      # the flue
    ('e', 24, 8, 7), ('e', -18, 6, 7),                    # the diverter, in and back
    ('n', 0, 10, 9)]))                                    # the Main Stack's gate
L(sill(0, 126.5, 8, 1, 1))
L(cover((-14, 110), (14, 86), (-30, 82), (30, 82), (-12, 44), (12, 44), (-36, 40), (36, 40)))
PLUME = dict(cycle=None)
def plume(sid, x, z, period, phase, w=12, h=16):
    L(vent(x, z, w - 2))
    HAZ.append(storm(sid, x, 1, z, w, h, w, cycle={'period': period, 'duty': period*0.5, 'phase': phase}))
plume('v_flue_in', -44, 100, 9, 0.0)                     # in front of the flue's door
plume('v_flue_mid', -26, 88, 8, 3.0, w=10)               # and on the way to it
plume('v_div_in', 44, 100, 9, 4.5)
plume('v_div_back', 44, 58, 8, 1.0)
plume('v_con_in', 30, 120, 9, 2.0)
plume('v_con_mid', 14, 110, 8, 6.0, w=10)        # on the way to the condenser
plume('v_mid1', -6, 78, 11, 1.5, w=14, h=18)             # two in the middle that never stop
plume('v_mid2', 18, 52, 10, 5.0, w=14, h=18)

# ================================================================= WEST: FLUE
# In by a lobby and a duct, and back the same way (one door: a second beside it
# would leave a strip of floor to fall into).
L(link_x(-50.5, -61.5, 100, 8, 7))
L(room(-70, 100, 16, 16, h=10, doors=[('e', 0, 8, 7), ('n', -3, 8, 7)]))    # lobby x -78..-62 z 92..108
L(link_z(91.5, 62.5, -73, 8, 7))                                             # duct x -77..-69
# The flue: a shaft open to the sky, and a storm that rises up it and falls
# back. Six steps spiral up its walls, each 5.6m over the last - one scatter
# boost apiece, and never two at once - to a deck above the storm's reach. The
# four the storm reaches have a niche let into the wall beside them, which it
# never gets into: go when it falls, and hide when it comes back up.
# The west and north walls are built here, with the niches let into them.
L(room(-72, 52, 20, 20, h=54, doors=[('s', -1, 8, 7)]))                      # x -82..-62 z 42..62
G[:] = [g for g in G if not (abs(g['p'][0] + 82.5) < 0.01 and g['s'][0] == 1.0 and 41 <= g['p'][2] <= 63)
                      and not (abs(g['p'][2] - 41.5) < 0.01 and g['s'][2] == 1.0 and -83 <= g['p'][0] <= -61)]
L(holed_wall('z', -82.5, 41, 63, 1, 55, [(53, 5, 6.6, 10), (47, 5, 12.2, 15.6)]))
L(holed_wall('x', 41.5, -82, -62, 1, 55, [(-73, 5, 17.8, 21.2), (-67, 5, 23.4, 26.8)]))
L(recess('z', -82.5, -1, 53, 5, 6.6), recess('z', -82.5, -1, 47, 5, 12.2),
  recess('x', 41.5, -1, -73, 5, 17.8), recess('x', 41.5, -1, -67, 5, 23.4))
HAZ.append(storm('s_tide', -72, 1, 52, 20, 27, 20, rise=[0.5, 27], period=18))   # to 28: the fifth step is clear of it
# the second runs to the north wall: stopping 2m short would leave a pocket with no way out
# Edge to edge all the way: the fourth runs to the east wall, so there is no
# strip behind it to fall into.
# 5.6m apart: a boost reaches 7.8, so this leaves room for a scrappy one six
# times running - and two at once, 11.2, is still out of reach.
STEPS = [(-79, 53, 6, 6, 6.6), (-79, 46, 6, 8, 12.2), (-73, 45, 6, 6, 17.8),     # (x, z, w, d, top)
         (-66, 45, 8, 6, 23.4), (-65, 51, 6, 6, 29.0), (-65, 58, 6, 8, 34.6)]
for x, z, w, d, top in STEPS:
    L(box(x, 1, z, w, top - 1, d, 'block', 'amber', walk=True))
MARKS += [{'p': [-78.7, 1, 56.95], 'r': 0.9}, {'p': [-77.5, 6.6, 50.8], 'r': 0.8},   # the first where you come in
          {'p': [-76.8, 12.2, 46.8], 'r': 0.8}, {'p': [-70.8, 17.8, 46.2], 'r': 0.8},
          {'p': [-66, 23.4, 47.2], 'r': 0.8}, {'p': [-65, 29.0, 53.2], 'r': 0.8}]
# vents in its floor, where the tide comes up
L(vent(-72, 51.5, 6), vent(-72, 58.5, 6))

# ============================================================== EAST: DIVERTER
# Two ducts, both full of storm. The valve at the far end of the first, seen
# down the duct through the storm, clears it. In the hall a second valve,
# fenced on top of a pillar, clears the second - and sends the storm back into
# the first behind you. The hall's Coils drain valves, and a drained valve
# only ever brings a storm back: neither valve can be skipped by waiting for
# them. (With the second duct clear to start, a Coil draining the first valve
# cleared it for you.)
L(link_x(57.5, 50.5, 100, 8, 7))
L(room(66, 100, 16, 16, h=10, doors=[('w', 0, 8, 7), ('e', 0, 8, 7)]))      # J x 58..74 z 92..108
L(link_x(99.5, 74.5, 100, 8, 7))                                             # duct A
# A storm packed into a duct is the plant's full charge: it strips a shield in a
# fraction of a second and kills in one more. At the yard's strength it could be
# run through, and then neither valve mattered.
DUCT = dict(drain=300, bleed=300)       # a jump and two dashes still died in it at 150
HAZ.append(storm('s_da', 87, 1, 100, 24.5, 7, 7.6, **DUCT))
L(room(110, 80, 20, 48, h=14, doors=[('w', 20, 8, 7), ('w', -20, 8, 7)]))   # the valve hall x 100..120 z 56..104
L(box(115, 1, 72, 5, 7, 5, 'block', 'amber', walk=True))                     # the pillar x 112.5..117.5, top 8
for gx, gz, gw, gd in ((115, 69.65, 5, 0.3), (115, 74.35, 5, 0.3), (112.65, 72, 0.3, 4.4), (117.35, 72, 0.3, 4.4)):
    L(box(gx, 8, gz, gw, 2.6, gd, 'dark', grate=True))                        # its fence, to 10.6
L(box(107, 1, 72, 4, 4, 4, 'block', 'cyan', walk=True))                      # the step x 105..109, top 5
# Up arrows on the pillar and on the tide room's first step, so a new player
# sees that either is the way up.
SIGNS = [{'p': [115, 4.5, 74.53], 'face': 'z', 's': [2.6, 3.2], 'arrow': 'up'},
         {'p': [-79, 3.8, 56.03], 'face': 'z', 's': [2.6, 3.2], 'arrow': 'up'}]
MARKS.append({'p': [107.6, 5, 72], 'r': 0.9})
MARKS.append({'p': [104.05, 1, 72.2], 'r': 0.9})                            # and up onto the step
L(cover((106, 92), (114, 88)))
L(link_x(99.5, 74.5, 60, 8, 7))                                              # duct B
HAZ.append(storm('s_db', 87, 1, 60, 24.5, 7, 7.6, **DUCT))
L(room(66, 60, 16, 16, h=10, doors=[('e', 0, 8, 7), ('w', -2, 6, 7)]))      # the relay room x 58..74 z 52..68
L(link_x(57.5, 50.5, 58, 6, 7))                                              # the way back

# ========================================================= SOUTH-EAST: CONDENSER
# A low hall and a high one beside it, and a lift that rises straight up a
# chimney from one to the floor of the other. Each hall has a storm drifting
# across it, and what matters in each - the lift's conduit below, the relay
# above - sits in a grate cage no shot gets into. Wait for the storm to cover
# it, and shoot the storm. The Coils drain the lift's conduit through its cage.
# There is no separate way back: the way in is beside it.
L(link_z(126.5, 139.5, 30, 8, 7))
# (no wall trim in either hall: it ran along the tops of walls their roofs sit on, and flickered)
L(room(30, 155, 40, 30, h=11, floor=False, walltrim=None, doors=[('n', 0, 8, 7)]))   # low hall x 10..50 z 140..170
# its floor, round the lift's pit: the platform rests in it flush with the floor
for x0, x1, z0, z1 in ((10, 50, 140, 152), (10, 50, 158, 170), (10, 44, 152, 158)):
    L(box((x0 + x1)/2, 0, (z0 + z1)/2, x1 - x0, 1, z1 - z0, 'block', 'cyan', walk=True))
L(box(47, -0.6, 155, 6, 1, 6, 'block', None))                                # the pit's bottom, at 0.4
L(box(50.5, -0.6, 155, 1, 1.6, 6, 'wall'))                                   # and under the wall behind it
# its roof, round the chimney the lift rises through (x 44..50 z 152..158)
L(lid(9.5, 50.5, 139.5, 152, 12), lid(9.5, 50.5, 158, 170.5, 12), lid(9.5, 44, 152, 158, 12))
# (no trim: the chimney's lid sits on their tops, and the buried trim flickered)
L(box(43.5, 12.6, 155, 1, 11.4, 6, 'wall'),
  box(47.25, 12.6, 151.5, 6.5, 11.4, 1, 'wall'), box(47.25, 12.6, 158.5, 6.5, 11.4, 1, 'wall'))
L(lid(43, 50.5, 151, 159, 24))
L(box(50.5, 12, 155, 1, 1, 6, 'block', None, walk=True))                     # the lift's step off, over the wall
L(cage(40, 1, 164, 5, 3.4, 5))                                               # the lift's conduit, caged
HAZ.append(storm('s_cl', 30, 1, 160, 12, 9, 12, sweep=[14, 0, 0], period=14))
L(cover((22, 150), (30, 162), (16, 166)))
# the high hall, on a plinth: its floor at 13
L(room(66, 155, 30, 30, h=11, y=12, floor=False, walltrim=None, doors=[('w', 0, 6, 11)]))  # x 51..81 z 140..170
L(lid(50.5, 81.5, 139.5, 170.5, 24))
L(box(66, 0, 155, 30, 13, 30, 'block', 'cyan', walk=True))
L(cage(72, 13, 147, 5, 3.4, 5))                                              # the relay, caged
HAZ.append(storm('s_cu', 66, 13, 147, 10, 9, 12, sweep=[10, 0, 0], period=12))
L(cover((64, 160), (76, 162), y=13))

# ================================================================= MAIN STACK
# Through the gate, an antechamber, then the stack: a 50m square shaft open to
# the sky. A gallery ring 6m wide round its walls at 26, and a deck ring
# inside that at 52, standing on columns; the mouth in the middle runs the
# full height. The Dynamo fights at the base, then rises - the storm flooding
# up behind it - to the gallery, then the deck.
L(link_z(25.5, 10.5, 0, 10, 9))
L(room(0, -15, 50, 50, h=62, doors=[('s', 0, 10, 9)]))                       # x -25..25 z -40..10, walls to 63
# Over the way in, both rings leave an 11m gap: the base under them has to
# reach the door.
for x0, x1, z0, z1 in ((-25, 25, -40, -34), (-25, -5.5, 4, 10), (5.5, 25, 4, 10), (-25, -19, -34, 4), (19, 25, -34, 4)):
    L(box((x0 + x1)/2, 25, (z0 + z1)/2, x1 - x0, 1, z1 - z0, 'block', 'cyan', walk=True))   # gallery, top 26
for x0, x1, z0, z1 in ((-19, 19, -34, -28), (-19, -5.5, -2, 4), (5.5, 19, -2, 4), (-19, -13, -28, -2), (13, 19, -28, -2)):
    L(box((x0 + x1)/2, 51, (z0 + z1)/2, x1 - x0, 1, z1 - z0, 'block', 'amber', walk=True))  # deck, top 52
for cx, cz in ((-16, -31), (16, -31), (-16, 1), (16, 1)):
    L(box(cx, 1, cz, 2, 50, 2, 'wall'))                                      # the deck's columns
L(cover((-16, -15), (16, -15)))                                              # clear of the conduits
# phase 2: two caged conduits hung in the mouth from a beam, and a storm that
# swings between them - shoot it while it holds one
# Two beams, north to south across the mouth, so the middle stays clear for the
# core to rise through.
for cx in (-8, 8):
    L(box(cx, 50, -15, 1.5, 1, 26, 'wall', 'magenta'))                       # a beam, deck to deck
    L(box(cx, 37.2, -15, 0.4, 12.8, 0.4, 'wall'))                            # its hanger, from the cage's roof
    L(cage(cx, 33.5, -15, 3.4, 3.4, 3.4))
HAZ.append(storm('s_core', 0, 30, -15, 12, 12, 12, sweep=[8, 0, 0], period=10, off=True, glow=False))
# the floods, the first to below the gallery, the second to below the deck
HAZ.append(storm('s_rise1', 0, 1, -15, 50, 23, 50, rise=[0.5, 23], riseT=22, off=True))
HAZ.append(storm('s_rise2', 0, 1, -15, 50, 44, 50, rise=[23, 44], riseT=24, off=True))   # to 45: clear air under the deck
# (no storm on the deck: phase 3 is enough to do without one)

# A relay lights a lamp on the gate, shuts the two yard vents its stack feeds,
# and opens its short way back if it has one - plus anything of its own.
RELAY = lambda x, y, z, vents, door, cp, also=(): {'p': [x, y, z], 'do': [
    {'a': 'lamp', 'door': 'dBoss', 'banner': 'MAIN STACK'},
    {'a': 'hazard', 'id': vents[0], 'on': False}, {'a': 'hazard', 'id': vents[1], 'on': False},
    *([{'a': 'open', 'door': door}] if door else []), *also, {'a': 'checkpoint', 'p': cp}]}

# The phases stop the game to say what changed: as banners, mid-fight, they went unread
DYNAMO_PHASES = [
  {'at': 0.66, 'do': [
    {'a': 'boss', 'y': 36, 'strike': {'every': 3.0}, 'summon': False},     # no more Coils below you
    {'a': 'hazard', 'id': 's_rise1', 'on': True}, {'a': 'hazard', 'id': 's_core', 'on': True},
    {'a': 'anchors', 'ids': ['g1', 'g2', 'g3', 'g4']},
    {'a': 'move', 'mover': 'core_lift', 'to': [0, 25, -15], 'period': 16},   # the core rises a floor
    {'a': 'drop', 'p': [0, 27, -37], 'hp': 2}, {'a': 'drop', 'p': [0, 27, 7.5], 'hp': 2},
    {'a': 'brief', 'key': 'storm1', 'title': 'STORM RISING', 'sub': 'The anchors up to the gallery are lit.', 'sub2': 'The anchors up to the gallery are lit.', 'danger': True}]},
  {'at': 0.33, 'do': [
    {'a': 'boss', 'y': 62, 'strike': {'every': 2.6}},
    {'a': 'hazard', 'id': 's_rise1', 'on': False}, {'a': 'hazard', 'id': 's_rise2', 'on': True},
    {'a': 'hazard', 'id': 's_core', 'on': False},
    {'a': 'anchors', 'ids': ['t%d' % k for k in range(1, 9)]},
    {'a': 'beacons', 'ids': ['g1', 'g2', 'g3', 'g4'], 'on': False},          # so the deck's lines stand out
    {'a': 'move', 'mover': 'core_lift', 'to': [0, 51, -15], 'period': 16},   # and another
    {'a': 'drop', 'p': [-16, 53, -24], 'hp': 2}, {'a': 'drop', 'p': [16, 53, -6], 'hp': 2},
    {'a': 'brief', 'key': 'storm2', 'title': 'STORM RISING', 'sub': 'The anchors up to the deck are lit.', 'sub2': 'The anchors up to the deck are lit.', 'danger': True},
    {'a': 'spawn', 'enemies': [{'kind': 'severer', 'n': 1, 'p': [-10, 50, -34], 'holds': 't1'},
                               {'kind': 'severer', 'n': 1, 'p': [-20, 50, -24], 'holds': 't5'}]}]},
]

LEVEL = {
 'id': 'act2-3', 'name': 'SECTOR 2-3', 'subtitle': 'THE STACKS', 'act': 2,
 'floor': False, 'floorY': 0, 'quietLoad': True,
 'loadout': ['pulse', 'scatter', 'rail', 'tether', 'arc'],
 'spawn': {'p': [0, 1, 135], 'yaw': 0},
 'hazards': HAZ,
 'shelters': SHELTERS,
 'geometry': G,
 'marks': MARKS,
 'signs': SIGNS,
 'movers': [{'id': 'lift', 'p': [47, 0.4, 155], 'to': [47, 12.4, 155], 's': [6, 0.6, 6], 'period': 9,
             'start': False, 'mat': 'block', 'trim': 'amber'},
            # the core's platform, in the middle of the stack: each phase of the
            # fight sends it up a floor, so it is waiting at the deck at the end
            {'id': 'core_lift', 'p': [0, 1, -15], 'to': [0, 25, -15], 's': [6, 1, 6], 'period': 16,
             'start': False, 'once': True, 'mat': 'block', 'trim': 'amber'}],
 'conduits': [
   # the flue's also stills its tide, so the way back is a drop down the shaft
   dict(id='r_flue', **RELAY(-65, 36.2, 60, ['v_flue_in', 'v_flue_mid'], None, [-66, 34.6, 57],
                             [{'a': 'hazard', 'id': 's_tide', 'on': False}])),
   dict(id='r_div', **RELAY(60, 2.6, 64, ['v_div_in', 'v_div_back'], 'dDivOut', [66, 1, 60])),
   dict(id='r_con', **RELAY(72, 14.6, 147, ['v_con_in', 'v_con_mid'], None, [66, 13, 152])),
   # the Diverter's valves: the first, at the far end of duct A, clears it; the
   # second, on the pillar, clears duct B and fills A again. Later in the list wins.
   {'id': 'v1', 'p': [106, 2.6, 100], 'hazards': {'off': ['s_da']}},
   {'id': 'v2', 'p': [115, 8.9, 72], 'hazards': {'on': ['s_da'], 'off': ['s_db']}},
   {'id': 'c_lift', 'p': [40, 2.6, 164], 'lifts': ['lift']},
   # the Main Stack's discharge conduits: base, the two caged in the mouth, deck
   {'id': 'd_b1', 'p': [-9, 2.6, -24], 'discharge': True}, {'id': 'd_b2', 'p': [9, 2.6, -24], 'discharge': True},
   {'id': 'd_b3', 'p': [-9, 2.6, -6], 'discharge': True}, {'id': 'd_b4', 'p': [9, 2.6, -6], 'discharge': True},
   {'id': 'd_m1', 'p': [-8, 35.2, -15], 'discharge': True}, {'id': 'd_m2', 'p': [8, 35.2, -15], 'discharge': True},
   {'id': 'd_t1', 'p': [-10, 53.6, -31], 'discharge': True}, {'id': 'd_t2', 'p': [10, 53.6, 1], 'discharge': True},
   {'id': 'd_t3', 'p': [-16, 53.6, -24], 'discharge': True}, {'id': 'd_t4', 'p': [16, 53.6, -6], 'discharge': True},
 ],
 'pylons': [],
 'anchors': [
   # the stack: base to gallery, lit as the storm starts to rise
   {'id': 'g1', 'p': [0, 31, -34.3], 'off': True, 'beacon': 26}, {'id': 'g2', 'p': [12, 31, 4.3], 'off': True, 'beacon': 26},
   {'id': 'g3', 'p': [-19.3, 31, -15], 'off': True, 'beacon': 26}, {'id': 'g4', 'p': [19.3, 31, -15], 'off': True, 'beacon': 26},
   # gallery to deck, just inside the deck's outer lip
   # Two a side, so one is always within the tether's reach of the gallery.
   # (Beacons: a line of light down from each.)
   *[{'id': 't%d' % (k + 1), 'p': p, 'off': True, 'beacon': 30, **({'hold': 't%d' % (k + 1)} if k in (0, 4) else {})}
     for k, p in enumerate([[-10, 56.5, -33.7], [10, 56.5, -33.7], [-12, 56.5, 3.7], [12, 56.5, 3.7],
                            [-18.7, 56.5, -24], [-18.7, 56.5, -6], [18.7, 56.5, -24], [18.7, 56.5, -6]])],
 ],
 'doors': [
   {'id': 'dBoss', 'p': [0, 1, 25.5], 's': [10, 9, 1.2], 'lock': 'script', 'lamps': 3},
   {'id': 'dBase', 'p': [0, 1, 10.5], 's': [10, 9, 1.2], 'lock': 'script', 'open': True, 'boss': True},
   {'id': 'dDivOut', 'p': [50.5, 1, 58], 's': [1.2, 7, 6], 'lock': 'script'},
 ],
 'keys': [], 'weapons': [], 'nodes': [], 'enemies': [],
 # Before and after each event, and nothing saved by standing on it.
 'checkpoints': [{'p': [0, 1, 136]},                                        # arrival
                 {'p': [0, 1, 118]},                                        # the yard
                 {'p': [-70, 1, 104]}, {'p': [-73, 1, 66]}, {'p': [-66, 34.6, 57]}, # flue: lobby, foot, done
                 {'p': [66, 1, 104]}, {'p': [104, 1, 96]}, {'p': [66, 1, 60]},      # diverter: in, hall, done
                 {'p': [30, 1, 144]}, {'p': [56, 13, 155]}, {'p': [66, 13, 152]},   # condenser: in, up, done
                 {'p': [0, 1, 18]},                                         # the stack's antechamber
                 {'p': [0, 1, -12]}],                                       # the fight won
 'triggers': [
  {'on': 'enter', 'vol': {'p': [0, 5, 132], 's': [20, 10, 12]}, 'do': [
    {'a': 'brief', 'title': 'SECTOR 2-3 · THE STACKS',
     'sub': 'The foundry&rsquo;s exhaust yard, where the plant vents its charge as storms.'},
    {'a': 'checkpoint', 'p': [0, 1, 136]}]},
  {'on': 'enter', 'vol': {'p': [0, 5, 118], 's': [30, 10, 12]}, 'do': [
    {'a': 'checkpoint', 'p': [0, 1, 118]},
    {'a': 'brief', 'title': 'STORM', 'sub': 'Storms drain your shield, and then your health.'},
    {'a': 'spawn', 'enemies': [{'kind': 'drone', 'n': 3, 'p': [0, 1, 70]},
                               {'kind': 'sentinel', 'n': 1, 'p': [20, 1, 64]}]}]},
  # the flue
  {'on': 'enter', 'vol': {'p': [-70, 5, 100], 's': [16, 10, 16]}, 'do': [
    {'a': 'checkpoint', 'p': [-70, 1, 104]},
    {'a': 'spawn', 'enemies': [{'kind': 'drone', 'n': 2, 'p': [-73, 1, 76]}]}]},
  {'on': 'enter', 'vol': {'p': [-73, 5, 66], 's': [8, 10, 6]}, 'do': [
    {'a': 'checkpoint', 'p': [-73, 1, 66]},
    {'a': 'spawn', 'enemies': [{'kind': 'drone', 'n': 2, 'p': [-72, 20, 52]},
                               {'kind': 'sentinel', 'n': 1, 'p': [-65, 34.6, 58]}]}]},
  # the diverter
  {'on': 'enter', 'vol': {'p': [66, 5, 100], 's': [16, 10, 16]}, 'do': [
    {'a': 'checkpoint', 'p': [66, 1, 104]},
    # the first valve is shot through a storm: whichever stack comes first says so
    {'a': 'brief', 'title': 'CONDUCTION', 'sub': 'An Arc shot into a storm powers what is inside it.'},
    {'a': 'spawn', 'enemies': [{'kind': 'drone', 'n': 2, 'p': [66, 1, 96]}]}]},
  {'on': 'enter', 'vol': {'p': [104, 5, 96], 's': [8, 10, 10]}, 'do': [
    {'a': 'checkpoint', 'p': [104, 1, 96]},
    {'a': 'spawn', 'enemies': [{'kind': 'coil', 'n': 2, 'p': [112, 1, 80]},
                               {'kind': 'sentinel', 'n': 1, 'p': [112, 1, 62]}]}]},
  # the condenser
  {'on': 'enter', 'vol': {'p': [30, 5, 144], 's': [20, 10, 8]}, 'do': [
    {'a': 'checkpoint', 'p': [30, 1, 144]},
    {'a': 'brief', 'title': 'CONDUCTION', 'sub': 'An Arc shot into a storm powers what is inside it.'},
    {'a': 'spawn', 'enemies': [{'kind': 'coil', 'n': 2, 'p': [30, 1, 162]},
                               {'kind': 'mite', 'n': 6, 'p': [40, 1, 160]}]}]},
  # the top of the lift is inside it: arriving is enough, stepping off or not.
  # And the high hall feeds the lift from here on: a Coil below that drained it
  # could leave it parked in the chimney, the only way down.
  {'on': 'enter', 'vol': {'p': [52, 16, 155], 's': [16, 6, 8]}, 'do': [
    {'a': 'feed', 'conduit': 'c_lift'},
    {'a': 'checkpoint', 'p': [56, 13, 155]},
    {'a': 'spawn', 'enemies': [{'kind': 'lancer', 'n': 1, 'p': [78, 13, 166]},
                               {'kind': 'drone', 'n': 2, 'p': [70, 14, 150]}]}]},
  # the Main Stack
  {'on': 'enter', 'vol': {'p': [0, 5, 18], 's': [10, 10, 10]}, 'do': [
    {'a': 'checkpoint', 'p': [0, 1, 18]}]},
  {'on': 'enter', 'vol': {'p': [0, 6, 2], 's': [24, 12, 8]}, 'do': [
    {'a': 'seal', 'door': 'dBase'},
    {'a': 'brief', 'title': 'DYNAMO',
     'sub': 'Nothing gets through its shield. A powered conduit near it will knock the shield down.'},
    {'a': 'spawn', 'enemies': [
      # the storm ends with it, so what is left down below can be mopped up
      {'kind': 'dynamo', 'n': 1, 'p': [0, 1, -30], 'phases': DYNAMO_PHASES, 'onDeath': [
        {'a': 'hazard', 'id': 's_rise1', 'on': False}, {'a': 'hazard', 'id': 's_rise2', 'on': False},
        {'a': 'hazard', 'id': 's_core', 'on': False},
        {'a': 'banner', 'title': 'DYNAMO DOWN', 'sub': 'The storm is dying.'}]},
      {'kind': 'drone', 'n': 2, 'p': [0, 1, -10]}]},
    # health at the start, in two corners of the base
    {'a': 'drop', 'p': [-21, 2, 6], 'hp': 1}, {'a': 'drop', 'p': [21, 2, 6], 'hp': 1},
    # the room clear, the core - risen to the deck with the fight - is let out
    {'a': 'arena', 'onClear': [
      {'a': 'uncage'}, {'a': 'open', 'door': 'dBase'},
      {'a': 'checkpoint', 'p': [0, 1, -12]}]}]},
 ],
 'goal': {'t': 'artifact', 'id': 'core-a2-3', 'p': [0, 3.8, -15], 'on': 'core_lift', 'locked': True, 'cage': 2.2, 'cageH': 4.5},
}

dedupe_walls(G); unstitch_walls(G); dedupe_floors(G); hide_floor_edges(G); drop_buried_trims(G)
for g in G:
    assert isinstance(g, dict) and 'p' in g and 's' in g, g
    assert all(isinstance(v, (int, float)) for v in g['p'] + g['s']), g
json.dump(LEVEL, open('levels/act2-3.json', 'w'), indent=1)
print('levels/act2-3.json: %d geometry pieces' % len(G))

#!/usr/bin/env python3
"""Sector 3-3 - The Citadel. Part I: the Causeway; Part II: the Undercroft.

A march on a fortress you can see from the first step. You arrive on a bare
landing in open space; the citadel stands 370m north at the end of a broken
causeway, and the Authority's eye hangs over its crown tower in turning rings,
throwing its light - the Gaze - down on everything you cross. Where it rests on
you, lightning follows, and the lightning hits whatever is in its ring: enemies
too, and the conductors nothing else can break. Everything that fights you here
it throws at you, in pods from the eye. Part I ends when the portcullis rises.
The plan and its reasons are in docs/campaign-design.md under "Sector 3-3".
North is -z.

  THE LANDING   z 4..16       bare; the eye wakes, sends its first pod, and the
                              span comes out of pier 1 to fetch you
  GAP 1         z 4..-50      the span: ride it in, under the sweep
  PIER 1        z -50..-124   the first fight, sealed by a gate at its head.
                              The eye hunts you here
  GAP 2         z -124..-214  the eye runs a span out, then breaks it: three
                              anchors where it hung, the middle one travelling
  PIER 2        z -214..-280  the amber key, caged beside a conductor on an
                              island off the pier: bring the eye down on it
  THE BARBICAN  z -280..-282  the wall across the causeway, the amber door
  THE FORECOURT z -282..-320  the gatehouse fight: three clamps on platforms
                              out in it, broken by the eye's lightning
  THE GATEHOUSE z -320..-326  wall, portcullis, counterweights in slots
Part II, west of the tower and 27m down, is laid out at its own heading below.
It ends at the lift in the Lift Hall, where a core stands in for Part III.
"""
import json, math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lvlbuild import box, dedupe_walls, dedupe_floors, hide_floor_edges, drop_buried_trims, unstitch_walls, \
    wall, breach

G, HAZ = [], [{'t': 'void', 'below': -40}]
G2 = []                       # pieces kept out of the merge passes (the crown's spires)
def L(*items):
    for it in items:
        if isinstance(it, list): G.extend(it)
        else: G.append(it)
def far(*items):
    """The citadel: seen from the whole causeway, so the fog never hides it."""
    out = []
    for it in items:
        for b in (it if isinstance(it, list) else [it]):
            b['far'] = True; out.append(b)
    L(out)

def kerb(x, z, w, d):
    return box(x, DECK, z, w, 1.1, d, 'block', 'magenta')
def post(x, z, on=None):
    """Cover: what the Gaze can't see through."""
    b = box(x, DECK, z, 2.4, 2.8, 1.2, 'block', 'cyan')
    if on: b['on'] = on
    return b
def cover(x, z):
    return box(x, DECK, z, 3.6, 2.6, 3.6, 'block', 'cyan')
def glass(x0, x1, z, y0, y1):
    g = box((x0 + x1)/2, y0, z, x1 - x0, y1 - y0, 0.3, 'dark'); g['window'] = True
    return g
def E(kind, n=1, **kw): return dict({'kind': kind, 'n': n}, **kw)
def pods(*drops, first=0.4, gap=0.7, join=False):
    """The Gaze's garrison: a pod thrown from the eye to each spot, bursting into
    what it carries. (at, [enemies])"""
    a = {'a': 'pods', 'first': first, 'gap': gap, 'drops': [{'at': at, 'enemies': list(es)} for at, es in drops]}
    if join: a['join'] = True
    return a

D0, D1, D2 = 1, 5, 9  # the landing; pier 1; pier 2 and everything after it
DECK = D0

# ============================================================= THE LANDING
# x -7..7 z 4..16, bare, open to space all round: nothing to do but watch.
L(box(0, DECK - 1, 10, 14, 1, 12, 'block', 'cyan', walk=True))

# ====================================================== GAP 1 AND THE SPAN
# The span, 12 wide and 50 long, lies in the trench down pier 1's middle when
# you arrive. Once the eye is awake it runs the span out to you - you watch it
# come, so you know it moves - and shuttles until you ride it in, when it
# parks in the trench for the fight. Four metres up on the far side, the gap is
# past any dash or boost.
SPAN_OUT = [0, D0 - 1, -21]            # z 4..-46, its south end at the landing's edge
SPAN_IN = [0, D1 - 1, -75]             # z -50..-100, in the trench, flush with the pier
SPAN = {'id': 'span1', 'p': SPAN_IN, 'to': SPAN_OUT, 's': [12, 1, 50], 'period': 14, 'dwell': 3,
        'start': False, 'mat': 'block', 'trim': 'amber'}
DECK = D1
L(post(-3, -64, on='span1'), post(3, -86, on='span1'))      # as it lies in the trench

# =================================================================== PIER 1
# x -18..18 z -50..-124: decks either side of the trench, x -6..6 z -50..-100,
# and across its head. Two turret pedestals at the head; cover down both sides.
# The head's north edge is glass with a gate in it: the fight is sealed in.
P1_Z1 = -124
L(box(-12, DECK - 1, (-50 + P1_Z1)/2, 12, 1, -50 - P1_Z1, 'block', 'cyan', walk=True),   # x -18..-6, the whole length
  box(12, DECK - 1, (-50 + P1_Z1)/2, 12, 1, -50 - P1_Z1, 'block', 'cyan', walk=True),
  box(0, DECK - 1, (-100 + P1_Z1)/2, 12, 1, -100 - P1_Z1, 'block', 'cyan', walk=True))   # the head, past the trench
L(kerb(-18.3, (-50 + P1_Z1)/2, 0.6, -50 - P1_Z1), kerb(18.3, (-50 + P1_Z1)/2, 0.6, -50 - P1_Z1),
  kerb(-12, -49.7, 12, 0.6), kerb(12, -49.7, 12, 0.6))
L(post(-12, -60), post(12, -68), post(-11, -82), post(11, -92), post(-13, -96), post(4, -104))
PEDESTALS = [(-13, -117), (13, -117)]
for x, z in PEDESTALS:
    L(box(x, DECK, z, 4, 3, 4, 'block', 'cyan', walk=True))
L(cover(-6, -110), cover(7, -114))
# The head's glass, 16m high (a boost from the gate's top falls short), round
# its corners and down its sides: going round it is over the void.
GL_TOP = DECK + 16
L(glass(-18.6, -6, P1_Z1 - 0.15, DECK, GL_TOP), glass(6, 18.6, P1_Z1 - 0.15, DECK, GL_TOP),
  glass(-6, 6, P1_Z1 - 0.15, DECK + 6, GL_TOP))
L(box(-18.75, DECK, (P1_Z1 - 100)/2, 0.3, GL_TOP - DECK, -100 - P1_Z1, 'dark'), box(18.75, DECK, (P1_Z1 - 100)/2, 0.3, GL_TOP - DECK, -100 - P1_Z1, 'dark'))
G[-1]['window'] = G[-2]['window'] = True

# =========================================================== GAP 2, BROKEN
# 90m, past any launch. When pier 1's fight is won the eye runs a span out
# from under pier 2 all the way to you - and as it arrives, strikes it, and it
# bursts. 20m long (not the whole gap, or it could be sprinted across before
# it went) and level with pier 1 all the way. A way across is left, knowingly:
# a full air kit onto it in a half-second window 2.25-2.5s into its run, then
# a second one off its far end, reaches pier 2 - with one try and that timing,
# hardly anyone will. The anchors its cables hung from light up: one fixed off
# pier 1's head, one travelling across the gap's middle, one fixed short of pier 2.
P2_Z0 = -214
SPAN2_L = 20
SPAN2_RET = [0, D1 - 1, -216 - SPAN2_L/2]           # z -216..-236, under pier 2
SPAN2_IN = [0, D1 - 1, -124 - SPAN2_L/2]            # z -124..-144, flush with pier 1's head
SPAN2 = {'id': 'span2', 'p': SPAN2_RET, 'to': SPAN2_IN, 's': [12, 1, SPAN2_L], 'period': 14, 'start': False,
         'mat': 'block', 'trim': 'amber'}
# the span that goes back out when the lockdown lifts (the campaign's end),
# under pier 2 below the one that breaks
# (parked, not dead: only the end's `move` sends it). Hidden (`clip`) till it
# rises, so it is never mistaken for the one that broke.
SPAN2B = dict(SPAN2, id='span2b', p=[0, D1 - 3, SPAN2_RET[2]], to=[0, D1 - 3, SPAN2_RET[2]], clip=D1 - 1); SPAN2B.pop('start')
A1 = [-3, D1 + 15, -142]
A2_Y, A2_Z = D1 + 17, -168
A3 = [3, D2 + 12, -192]
TROLLEY = {'id': 'trolley', 'p': [-10, A2_Y + 1.4, A2_Z], 'to': [10, A2_Y + 1.4, A2_Z], 's': [1.6, 0.8, 1.6],
           'period': 8, 'mat': 'block', 'trim': 'amber'}
ANCHORS = [{'id': 'a1', 'p': A1, 'off': True},
           {'id': 'a2', 'p': [-10, A2_Y, A2_Z], 'on': 'trolley', 'off': True},
           {'id': 'a3', 'p': A3, 'off': True}]

# =================================================================== PIER 2
DECK = D2
# x -18..18 z -214..-280. Cover down its length; the amber key on an island off
# its west side, in a cage, beside a conductor - in the open, in the eye's sight.
L(box(0, DECK - 1, (P2_Z0 - 280)/2, 36, 1, P2_Z0 + 280, 'block', 'cyan', walk=True))
L(kerb(-18.3, (P2_Z0 - 280)/2, 0.6, P2_Z0 + 280), kerb(18.3, (P2_Z0 - 280)/2, 0.6, P2_Z0 + 280),
  kerb(0, P2_Z0 + 0.3, 36, 0.6))
L(post(-8, -224), post(9, -230), cover(-10, -246), cover(10, -252), post(-4, -262), post(12, -268), post(-13, -270))
ISLE_TOP = DECK + 2
L(box(-29, ISLE_TOP - 1, -240, 8, 1, 12, 'block', 'amber', walk=True))         # x -33..-25 z -234..-246: amber, the conductors' colour
KEY_P = [-29, ISLE_TOP + 1.2, -242]
# dead steel till the key's guards are down, so the key can't be taken (with
# the eye breaking the conductor) while the fight is still on
L(breach(-29, ISLE_TOP, -237, 1.6, 1.4, 1.6, id='condKey', conductor=True, rod=3.2, shut=True,
         do=[{'a': 'uncage', 'key': 'amber'}]))

# ============================================================= THE BARBICAN
# The wall across the causeway, z -280..-282, 120m wide: going round its end is
# a 70m flight over nothing. 38m over the pier: a launch off the middle ledge's
# anchor, 29m up, can't reach its top. The amber door in it.
BARB_TOP = DECK + 38
far(wall('x', -281, -60, 60, -10, BARB_TOP, t=2, holes=[(-3, 3, DECK, DECK + 6)]))

# ============================================================ THE FORECOURT
# x -30..30 z -282..-320, open to space at its sides over a kerb. Three clamp
# platforms stand out in it, each a different climb: the west by riding the
# counterweight lift, the middle by tether, the east by a boost off a buttress.
# Out here the eye sees them (on the gatehouse's face, the wall would hide them).
L(box(0, DECK - 1, -301, 60, 1, 38, 'block', 'cyan', walk=True))
L(kerb(-30.3, -301, 0.6, 38), kerb(30.3, -301, 0.6, 38))
for x, z in ((-24, -288), (26, -285), (-9, -292), (6, -287), (-26, -314), (27, -316)):
    L(cover(x, z))
# key: (x, z, top)
LEDGES = {'W': (-19, -304, DECK + 16), 'C': (0, -309, DECK + 24), 'E': (19, -304, DECK + 12.8)}
LX = {k: v[0] for k, v in LEDGES.items()}
LZ = {k: v[1] for k, v in LEDGES.items()}
LY = {k: v[2] for k, v in LEDGES.items()}
for k, (x, z, y) in LEDGES.items():
    L(box(x, y - 1, z, 8, 1, 6, 'block', 'cyan', walk=True),               # the platform
      box(x, DECK, z, 2, y - 1 - DECK, 2, 'block', None))                  # on its pillar
# the west platform's lift: the counterweight block that rides up beside it,
# its top 2m off the floor at its foot and flush with the platform at its head
LIFT_W = {'id': 'liftW', 'p': [LX['W'], DECK, LZ['W'] + 5], 's': [4, 2, 4], 'to': [LX['W'], LY['W'] - 2, LZ['W'] + 5],
          'period': 12, 'dwell': 2.5, 'mat': 'block', 'trim': 'amber', 'start': False}
# the east platform's climb: a step a double jump up (2.8: a standing double
# jump rises 3.8), then the buttress and the platform, each a boost up (5: a
# double jump and a boost rise about 6.7)
# (the buttress stands 2m off the platform: up against it, a jump from its top
# would hit the platform's underside)
L(box(LX['E'], DECK, LZ['E'] + 12, 4, 2.8, 4, 'block', 'cyan', walk=True),       # z -290..-294
  box(LX['E'], DECK, LZ['E'] + 6.75, 4, 7.8, 3.5, 'block', 'cyan', walk=True))   # z -295.5..-299
# blast marks on the step and the buttress: a scatter jump is the way up each;
# each in the middle of its block, small enough to sit inside it
MARKS = [{'p': [LX['E'], DECK + 2.8, LZ['E'] + 12], 'r': 1.0}, {'p': [LX['E'], DECK + 7.8, LZ['E'] + 6.75], 'r': 1.0}]
# the middle platform's anchor, over its near lip
TC = [0, LY['C'] + 5, LZ['C'] + 7]

# ============================================================ THE GATEHOUSE
# z -320..-326, 40m high, with the portcullis's opening in the middle. Over the
# gate, three counterweights hang in slots, one for each clamp: break the clamp
# and its counterweight drops.
WALL_TOP = DECK + 40
GZ0, GZ1 = -320, -326                  # the wall's face and back
SLOT_D = 3                             # the slots' depth into the wall
SLOT_X = {'W': -14, 'C': 0, 'E': 14}
SLOT_LO, SLOT_HI = DECK + 15, WALL_TOP - 2
holes = [(-6, 6, DECK, DECK + 12)] + [(x - 1.5, x + 1.5, SLOT_LO, SLOT_HI) for x in SLOT_X.values()]
far(wall('x', GZ0 - SLOT_D/2, -60, 60, -10, WALL_TOP, t=SLOT_D, holes=holes))
far(wall('x', (GZ0 - SLOT_D + GZ1)/2, -60, 60, -10, WALL_TOP, t=GZ0 - SLOT_D - GZ1, holes=[(-6, 6, DECK, DECK + 12)]))
for x in SLOT_X.values():              # amber up each slot's sides, where the counterweight runs
    for sx in (-1.6, 1.6):
        far(box(x + sx, SLOT_LO, GZ0 + 0.075, 0.2, SLOT_HI - SLOT_LO, 0.15, 'neonA'))
    # glass over its mouth: you see it fall, and can't climb in under it
    g = box(x, SLOT_LO, GZ0 - 0.3, 3, SLOT_HI - SLOT_LO, 0.3, 'dark'); g['window'] = True; L(g)
CW_H = 4
# z -320.6..-322.8: 0.3 behind the glass's pane (a face on the pane's plane
# would flicker against it all the way down)
CW_Z = GZ0 - 1.7
COUNTERWEIGHTS = [{'id': 'cw' + k, 'p': [x, SLOT_HI - CW_H, CW_Z], 'to': [x, SLOT_HI - CW_H, CW_Z],
                   's': [2.6, CW_H, 2.2], 'period': 4, 'mat': 'block', 'trim': 'amber'}
                  for k, x in SLOT_X.items()]
def cw_drop(k): return {'a': 'fall', 'mover': 'cw' + k, 'to': [SLOT_X[k], SLOT_LO, CW_Z], 'warn': 0.4}

# Behind the wall: the passage under the gate's arch, z -326..-338, and the
# gallery off it to the west, along the back of the wall, to the Undercroft.
# East of the passage, the inner ward; north, the crown tower.
far(box(0, DECK + 12, -332, 12, WALL_TOP - DECK - 12, 12, 'wall'),             # over the arch
    box(33, -10, -332, 54, WALL_TOP + 10, 12, 'wall', 'magenta'),               # the inner ward, x 6..60
    box(36, -10, -362, 24, WALL_TOP + 10, 48, 'wall', 'magenta'),               # x 24..48, beside the tower (the Storm roof's hall stands past it)
    box(-55.5, -10, -332, 21, WALL_TOP + 10, 12, 'wall', 'magenta'))            # the gallery's far end, x -66..-45
L(box(0, DECK - 1, -332, 12, 1, 12, 'block', 'cyan', walk=True))                # the passage's floor (the wall is the floor under the gate)
# (the gallery's floor is Part II's: it falls)
# The crown tower stands on a wider foot: the foot x -24..24 z -338..-386 up
# to 70, the tower, x -18..18 z -352..-372, on up to 128. Both are hollow: the
# Well, open to the sky under the eye, and at its foot the Lift Hall (Part II's
# end). (The foot stops at 70: run up to the top at that width, the tower would
# stand in the eye's way to the gatehouse forecourt.)
TOWER_TOP = DECK + 119
TZ = -362
TW0, TW1 = -24, 24                      # the foot's outer faces
BW = 17                                 # the Well's walls' inner faces, x and z about TZ, in the foot
TL = 70                                 # the foot's head
UZ = 7                                  # the Well's half-depth above it, where the tower is 20 deep
TB = -25                                # its foot: any lower, it hangs under the citadel seen from the landing
# (their heads, at 70, are off the route: Part III goes over the roofs)
far(box(0, TB, -341.5, 48, TL - TB, 7, 'wall', 'magenta'),                     # the foot: south, z -338..-345
    # (the north wall, z -379..-386, is Part III's: a stair inside it, the Armoury's way in)
    box(20.5, TB, -362, 7, TL - TB, 34, 'wall', 'magenta'),                   # east, x 17..24
    # its roof, either side of the Well (not marked as floor, though you can
    # walk it: to the checker it would hide the Well's ledges under it)
    # (south of the tower, z -355..-345, the Well is open to the sky - the eye's
    # light into it, the Dynamo fight's included, comes in that way - under
    # glass: the light still passes, and you can't drop into the Well from the roofs)
    box(0, TL - 2, (-379 + TZ - UZ)/2, 2*BW, 2, TZ - UZ + 379, 'wall'),
    # (to 2m short of its head: the crown's floor is its top course, and
    # the spires' footings at its corners)
    # (their heads walked on, once the crown's floor has gone: the eye's light lands on them)
    box(0, TL, -353.5, 36, TOWER_TOP - 2 - TL, 3, 'wall', 'magenta', walk=True),   # the tower: south, z -352..-355
    box(0, TL, -370.5, 36, TOWER_TOP - 2 - TL, 3, 'wall', 'magenta', walk=True),   # north, z -369..-372
    # (standing on the foot's trim, not in it: from TL, the trim along the foot's
    # inner edge would be flush with their faces, a flickering line in the Well)
    # (the west to 2m short of the others: the walkway over it is its head)
    box(-17.5, TL + 0.1, TZ, 1, TOWER_TOP - 4 - TL - 0.1, 2*UZ, 'wall'),     # west and east, x 17..18
    box(17.5, TL + 0.1, TZ, 1, TOWER_TOP - 2 - TL - 0.1, 2*UZ, 'wall', 'magenta'))
_wg = box(0, TL - 0.3, -350, 2*BW, 0.3, 10, 'dark'); _wg['window'] = True; _wg['rib'] = [4.25, -BW, -355]; L(_wg)
# (the citadel's body behind, x -30..47 z -386..-456 up to 80, is Part III's:
# the Armoury is in it)
# The crown, x -18..17 z -378..-346 at 128: the spires stand on footings at
# the tower's corners; the rest of its floor rises out of the tower's top when
# the Authority is fought, and falls away when its body is beaten. (Up all the
# time, it would shadow the Well, and the gatehouse forecourt, from the eye.)
CR = TOWER_TOP
FOOT = {'SW': (-18, -10, -356, -349), 'SE': (10, 17, -356, -349), 'NW': (-18, -10, -375, -368), 'NE': (10, 17, -375, -368)}
SPIRE_AT = {k: ((x0 + x1)/2, (z0 + z1)/2) for k, (x0, x1, z0, z1) in FOOT.items()}
SPIRES = list(SPIRE_AT.values())
# (from 0.1 over the walls' heads, on their neon: from the head itself, their
# faces would meet the neon's and flicker along it)
CRB = CR - 1.9
for k, (x0, x1, z0, z1) in FOOT.items():
    L(box((x0 + x1)/2, CRB, (z0 + z1)/2, x1 - x0, CR - CRB, z1 - z0, 'block', 'amber', walk=True))
# Walkways west and east between the footings, 3m wide like the north and
# south walls' heads, under the floor till it goes, so all four sides match.
# On the west, it is the wall's head (the wall's own neon beside the
# walkway's would be a double edge); on the east, from the gate's wall in.
L(box(-16.5, CR - 4, TZ, 3, 2, 2*UZ, 'wall', 'magenta', walk=True),        # west, x -18..-15 z -369..-355
  box(15.5, CR - 4, TZ, 3, 2, 2*UZ, 'wall', 'magenta', walk=True))         # east, x 14..17
# Solid - you fight among them - but the eye's light and sight pass them
# (`lightThru`): as shadows they would blind it across the Registry. Platforms that
# never move, so they can go over when their conductors break (`topple`).
SPIRE_MV = [{'id': 'sp' + k, 'p': [x, CR, z], 'to': [x, CR, z], 's': [2, 65, 2], 'mat': 'wall', 'trim': 'amber',
             'lightThru': True, 'far': True, 'over': True} for k, (x, z) in SPIRE_AT.items()]

# ================================================================= THE GAZE
EYE = [0, TOWER_TOP + 52, TZ]
G_WAKE = {'path': [[0, -80]], 'period': 20}                       # on pier 1, where the span lies
G_SPAN = {'path': [[-1, -8], [1, -24], [-1, -40], [1, -60], [-1, -80], [1, -96]], 'period': 22}   # kept on the span: its pool hanging off the side poured light into space
HUNT1 = {'hunt': True, 'follow': 8, 'r': 5, 'sends': {'kind': 'drone', 'n': 2, 'max': 3}}
SPAN2_HIT = -136                       # where the eye strikes it: 12m from the gate
G_SPAN2 = {'hunt': False, 'calm': True, 'sends': None, 'path': [[0, SPAN2_HIT]], 'period': 20, 'follow': 20}   # quick: there before the span; and not after you
G_GAP = {'path': [[-12, -220], [12, -228], [-12, -236], [12, -244]], 'period': 16, 'follow': 8, 'calm': False}
HUNT2 = {'hunt': True, 'follow': 6.5, 'r': 5, 'sends': {'kind': 'drone', 'n': 2, 'max': 3}}
HUNT3 = {'hunt': True, 'follow': 8, 'r': 5.5, 'lock': 1.0, 'sends': {'kind': 'drone', 'n': 2, 'max': 4}}
HAZ.append(dict({'t': 'gaze', 'id': 'gaze', 'p': EYE, 'eyeR': 8, 'r': 5, 'lock': 1.0, 'follow': 8, 'off': True,
                 'asleep': True, 'tethers': [[sx, TOWER_TOP + 65, sz] for sx, sz in SPIRES],
                 'brief': {'title': 'THE GAZE', 'sub': 'Where its light rests, lightning follows.'}}, **G_WAKE))
def gaze(cfg): return dict({'a': 'gaze', 'id': 'gaze'}, **cfg)

# ============================================================== PIER 1 FIGHT
P1_ALL = {'p': [0, D1 + 3, (-50 + P1_Z1)/2], 's': [36, 8, -50 - P1_Z1]}
P1_CP = {'a': 'checkpoint', 'p': [-12, D1, -54]}
TUR = [dict(E('turret'), p=[x, D1 + 3 + 0.6, z], fixed=True) for x, z in PEDESTALS]   # 0.6 up sits it on the pedestal
P1_IN = [
    # the span parks in its trench, as floor: shuttling, it would leave a pit
    # down the middle of the fight that anything on foot would walk into
    {'a': 'move', 'mover': 'span1', 'to': SPAN_IN, 'period': 6},
    gaze(HUNT1),
    pods(([PEDESTALS[0][0], D1 + 3.6, PEDESTALS[0][1]], [TUR[0]]), ([PEDESTALS[1][0], D1 + 3.6, PEDESTALS[1][1]], [TUR[1]]),
         ([0, D1 + 1, -108], [E('lancer', 2)]), ([-12, D1 + 1, -88], [E('rusher', 2)]), ([12, D1 + 1, -96], [E('rusher')])),
    {'a': 'arena', 'onClear': [{'a': 'count', 'id': 'p1a'}, {'a': 'drop', 'p': [0, D1 + 0.5, -104], 'hp': 1}]},
]
P1_W2 = [
    pods(([-10, D1 + 1, -112], [E('bulwark')]), ([10, D1 + 1, -106], [E('bulwark')]), ([0, D1 + 1, -116], [E('sentinel')]),
         ([-12, D1 + 1, -70], [E('mite', 4)]), ([12, D1 + 1, -80], [E('drone', 2)]), first=1.5),
    {'a': 'arena', 'onClear': [
        {'a': 'drop', 'p': [0, D1 + 0.5, -104], 'hp': 2},
        # the gate opens at once, and the span comes out to you, and the eye
        # breaks it as it arrives: it bursts and goes down in pieces. (Opened
        # first, so the gate doesn't hide it.) The eye moves on to pier 2.
        {'a': 'open', 'door': 'dSpan'},
        gaze(G_SPAN2),
        # It comes all the way in, to the gate, and is struck as it settles: on
        # it or not, it goes. A fall with it plays it all again, so the scene can
        # be watched properly. The checkpoint after it is taken with the anchors lit.
        # The eye's light, waiting over the gap, is out till the span comes under it.
        {'a': 'after', 't': 2.0, 'do': [{'a': 'move', 'mover': 'span2', 'to': SPAN2_IN, 'period': 14}]},
        {'a': 'after', 't': 9.4, 'do': [gaze({'strikeAt': [0, D1, SPAN2_HIT]})]},
        {'a': 'after', 't': 10.5, 'do': [{'a': 'fall', 'mover': 'span2', 'to': [0, -80, -169], 'warn': 0.05, 'shatter': [0, SPAN2_HIT]}]},
        {'a': 'after', 't': 12.5, 'do': [{'a': 'anchors', 'ids': ['a1', 'a2', 'a3']}, gaze(G_GAP),
                                         {'a': 'checkpoint', 'p': [0, D1, -119], 'hp': 0.6}]},
        # last: the checkpoint photographs the timers above, so a death replays them
        {'a': 'checkpoint', 'p': [0, D1, -119], 'hp': 0.6}]},
]

# ============================================================== PIER 2 FIGHT
# The key's guards: a weaver shielding them, sentinels, bulwarks, lancers.
P2_ALL = {'p': [0, D2 + 5, (P2_Z0 - 280)/2], 's': [70, 14, P2_Z0 + 280]}
P2_IN = [
    gaze(HUNT2),
    pods(([0, D2 + 1, -258], [E('weaver')]), ([-8, D2 + 1, -236], [E('sentinel')]), ([8, D2 + 1, -252], [E('sentinel')]),
         ([-6, D2 + 1, -266], [E('bulwark')]), ([10, D2 + 1, -240], [E('bulwark')]),
         ([-12, D2 + 1, -256], [E('lancer')]), ([12, D2 + 1, -262], [E('lancer')])),
    # not sealed (quiet: no LOCKED), but the conductor wakes only when it's won
    {'a': 'arena', 'quiet': True, 'onClear': [{'a': 'expose', 'ids': ['condKey']}, {'a': 'count', 'id': 'p2'}]},
]

# ======================================================== THE GATEHOUSE FIGHT
# Sealed in on the forecourt, the eye hunting. Three clamps hold the portcullis,
# one on each platform, broken only by the eye's lightning - and taken one at a
# time, east, west, middle. Only the east's is live at first; the others are
# dead steel. Break one and its counterweight drops, a lamp lights and the
# garrison sends more; kill everything, and the next comes within reach and
# wakes - the west's lift starts, then the middle's anchor lights. (All three
# open at once, you could break them all at a run and leave with the fight
# still on you; or take on every wave together.) The last lamp opens the gate.
FORE_ALL = {'p': [0, DECK + 10, -302], 's': [60, 30, 36]}       # z -284..-320: the door is at -281
FORE_CP = {'a': 'checkpoint', 'p': [0, DECK, -287], 'hp': 0.6}
WAVE_B = pods(([-10, DECK + 1, -298], [E('bulwark')]), ([14, DECK + 1, -292], [E('sentinel')]),
              ([0, DECK + 1, -298], [E('rusher', 3)]), ([LX['C'], LY['C'] + 1, LZ['C'] - 1], [E('lancer')]), join=True, first=1.0)
WAVE_C = pods(([-4, DECK + 1, -288], [E('bulwark')]), ([4, DECK + 1, -288], [E('bulwark')]),
              ([-18, DECK + 1, -292], [E('mite', 4)]), ([25, DECK + 1, -300], [E('lancer')]),
              ([0, DECK + 1, -300], [E('weaver')]), join=True, first=1.0)
# The last clamp brings down the Warden, Act I's boss, for the Act I part:
# the gate's last lamp is its. The eye's lightning hurts it too, so standing
# your ground near it brings both down on you both.
WARDEN = dict(E('warden'), hpMul=2.6)
CLAMP_DO = {'E': [WAVE_B, gaze({'follow': 9.5}), FORE_CP],
            'W': [WAVE_C, gaze({'follow': 11, 'lock': 0.85}), FORE_CP],
            'C': [pods(([0, DECK + 1, -300], [WARDEN]), join=True, first=1.0), gaze({'sends': None, 'bdmg': 160})]}
for k in LEDGES:
    L(breach(LX[k] + 2, LY[k], LZ[k] - 1, 1.6, 1.4, 1.6, id='clamp' + k, conductor=True, rod=3.2, shut=k != 'E',
             do=([{'a': 'lamp', 'door': 'dGate'}] if k != 'C' else []) + [cw_drop(k)] + CLAMP_DO[k]))
def stage(clamp, then):
    """A step of the fight: over when its clamp is broken and nothing is left."""
    return {'a': 'arena', 'need': {'breached': [clamp]}, 'onClear': [{'a': 'drop', 'p': [0, DECK + 0.5, -304], 'hp': 1}] + then}
FORE_IN = [
    {'a': 'seal', 'door': 'dAmber'},
    {'a': 'brief', 'title': 'THE GATEHOUSE', 'sub': 'The portcullis hangs from three clamps.'},
    gaze(HUNT3),
    pods(([LX['E'], LY['E'] + 1, LZ['E']], [E('sentinel')]), ([-10, DECK + 1, -300], [E('bulwark')]),
         ([10, DECK + 1, -300], [E('bulwark')]), ([0, DECK + 1, -296], [E('rusher', 3)]),
         ([LX['W'] - 2, LY['W'] + 1, LZ['W']], [E('lancer')]), first=1.2),
    stage('clampE', [{'a': 'count', 'id': 'gE'}]),
    FORE_CP]
FORE_W = [{'a': 'start', 'mover': 'liftW'}, {'a': 'expose', 'ids': ['clampW']},
          stage('clampW', [{'a': 'count', 'id': 'gW'}]), FORE_CP]
FORE_C = [{'a': 'anchors', 'ids': ['tC']}, {'a': 'expose', 'ids': ['clampC']},
          stage('clampC', [{'a': 'lamp', 'door': 'dGate'},
                           # done: it stops hunting and patrols, slowly, side to side along the
                           # one line the platforms don't shade - just inside the barbican
                           gaze({'hunt': False, 'sends': None, 'bdmg': 0, 'path': [[-26, -287], [26, -287]], 'period': 30}),
                           {'a': 'checkpoint', 'p': [0, DECK, -330]}]),
          FORE_CP]

# ###################################################### PART II: THE UNDERCROFT
# The citadel's works, cut down into its foundations but open to the sky, so
# the eye still sees in. West of the tower, out of the eye's sight at its foot:
#
#   THE GALLERY   x -45..-6 z -326..-338, at the gate's level: the eye breaks
#                 it behind you as you run it, to a balcony over the works
#   THE LANDING   x -50..-24 z -342..-392, 27m down: the Lift Hall's door, its
#                 three locks a lamp each in its key's colour
#   THE CUT       x -163..-50: walkways either side of a molten channel, storm
#                 vents rolling along them. A conductor up on a pier holds the
#                 sluice; a lift runs up to it while its conduit is live, and
#                 Coils come for the conduit. Broken, the metal drains away and
#                 the way on is down the empty channel
#   THE WEIR      x -215..-165: the metal pours over into the spillway, a pit
#                 with walls. One anchor across, a Severer holding it, a Weaver
#                 shielding them from a pen in the far cliff, behind a grate
#   THE REGISTRY  x -200..-90 z -448..-514: a roofless maze of records stacks,
#                 in three parts. Each part's key opens the door of its colour
#                 into the next, and the eye shuts the way back behind you. Each
#                 key's cage is held by a conductor somewhere else, a cable
#                 between them: follow it
#   THE DRAIN     from the maze's south-east corner home to the landing, storm
#                 vents erupting along it in a rolling wave
#   THE LIFT HALL the foot of the Well, glass-roofed, the eye looking straight
#                 down: the Dynamo, its shield knocked down by conduits caged
#                 in the storm vents
BED = -18                     # the works' floor
REG = BED + 2                 # the Registry's: 2m over the weir, so the spillway is past an air kit
T_CUT = DECK + 12             # the Cut's walls' heads, 12m over the gallery
def kerb2(x, y, z, w, d):
    return box(x, y, z, w, 1.1, d, 'block', 'magenta')
def cover2(x, y, z):
    return box(x, y, z, 3.6, 2.6, 3.6, 'block', 'cyan')
def vent(x, y, z, w, d):
    b = box(x, y, z, w, 0.2, d, 'dark'); b['vent'] = True
    return b
def storm(sid, x0, x1, z0, z1, y, h=8, **kw):
    s = {'t': 'storm', 'id': sid, 'p': [(x0 + x1)/2, y, (z0 + z1)/2], 's': [x1 - x0, h, z1 - z0]}
    s.update(kw)
    return s
def vent_storm(sid, x0, x1, z0, z1, y, period, duty, phase, h=8, harms=True, vx=None, vz=None, **kw):
    """A vent in the floor, and the storm it erupts on a beat. It burns
    enemies too. (vx/vz: the vent's own range, where the storm runs on past it)"""
    a0, a1 = vx or (x0 + 1, x1 - 1)
    b0, b1 = vz or (z0 + 1, z1 - 1)
    L(vent((a0 + a1)/2, y, (b0 + b1)/2, a1 - a0, b1 - b0))
    HAZ.append(storm(sid, x0, x1, z0, z1, y, h, cycle={'period': period, 'duty': duty, 'phase': phase}, harms=harms, **kw))
def bed(x, z, w, d):
    b = box(x, BED - 6, z, w, 3.5, d, 'block'); b['bed'] = True; b['walk'] = True
    return b
def metal(mid, x, z, w, d, **kw):
    m = {'t': 'molten', 'id': mid, 'p': [x, BED - 2.5, z], 's': [w, 1.5, d], 'burn': 45}
    m.update(kw)
    return m
MAST_TOP = 2.2
def mast(x, y, z):
    """A cable's post on a stack's glass, where the cable crosses it: out of
    reach, nothing to touch (as a collider it would throw a sight shadow)."""
    b = box(x, y, z, 0.4, MAST_TOP, 0.4, 'dark'); b['nocol'] = True
    return b
CABLES2 = []
def wire(points, lit=None, col=None):
    """A cable through `points`; `lit` glows it (in `col`) while it carries power."""
    for a, b in zip(points, points[1:]):
        c = {'a': a, 'b': b, 'r': 0.12}
        if lit: c['lit'] = lit
        if col: c['litCol'] = col
        CABLES2.append(c)

# ============================================================== THE GALLERY
# x -45..-6, behind the gatehouse wall. Its floor is four sections and a last
# piece that stands: as you come into it the eye strikes them one after
# another, from behind you, and they burst and fall. A door shuts the way
# back to the passage, so nobody is left on the wrong side of the gap.
GAL_X = [-7.2, -14.7, -22.2, -29.7, -37.2]
GALLERY = [{'id': 'gal%d' % (k + 1), 'p': [(GAL_X[k] + GAL_X[k + 1])/2, DECK - 1, -332],
            'to': [(GAL_X[k] + GAL_X[k + 1])/2, DECK - 1, -332], 's': [GAL_X[k] - GAL_X[k + 1], 1, 12],
            'period': 4, 'mat': 'block', 'trim': 'cyan'} for k in range(4)]
# the strip the gallery's door stands on, x -7.2..-6, next to the passage: it stays
L(box(-6.6, DECK - 1, -332, 1.2, 1, 12, 'block', 'cyan', walk=True))
L(box((-45 + GAL_X[4])/2, DECK - 1, -332, GAL_X[4] + 45, 1, 12, 'block', 'cyan', walk=True))   # x -45..-37.2, the balcony's end
# The Cut's south wall, z -338..-342, with the balcony through it
L(wall('x', -340, -215, TW0, BED - 4, T_CUT, t=4, holes=[(-45, -35, DECK - 1, T_CUT)]))
L(box(-40, DECK - 1, -343, 10, 1, 10, 'block', 'cyan', walk=True))           # the balcony, x -45..-35 z -338..-348
# (no kerb: you go over its edge)

# =============================================================== THE LANDING
L(box(-37, BED - 4, -367, 26, 4, 50, 'block', 'cyan', walk=True),          # x -50..-24 z -342..-392
  kerb2(-50.3, BED, -367, 0.6, 26))                                           # over the end of the channel
# under the citadel's body past the tower's foot, x -24..-17 z -386..-392, so
# it isn't open to space beside the landing
L(box(-20.5, BED - 4, -389, 7, -10 - (BED - 4), 6, 'wall', 'magenta'))
# the Cut's north wall, z -392..-396, the drain's mouth in it
DX0, DX1 = -47, -39
L(wall('x', -394, -165, TW0, BED - 4, T_CUT, t=4, holes=[(DX0, DX1, BED, BED + 8)]))
# the Well's west wall, with the Lift Hall's door, and a window up into the Well
HALL_DOOR = (-366, -358)
for b in wall('z', -20.5, -379, -345, TB, TL, t=7,
              holes=[(HALL_DOOR[0], HALL_DOOR[1], BED, BED + 8), (-374, -350, BED + 12, BED + 44)], windows=[1]):
    if not b.get('window'): b['far'] = True
    L(b)

# =================================================================== THE CUT
# x -163..-50: walkways along each side, the metal down the middle
C0, C1 = -163, -50
CM, CW = (C0 + C1)/2, C1 - C0
L(box(CM, BED - 4, -348, CW, 4, 12, 'block', 'cyan', walk=True),             # south walkway, z -342..-354
  box(CM, BED - 4, -386, CW, 4, 12, 'block', 'cyan', walk=True),             # north, z -380..-392
  bed(CM, -367, CW, 26))
HAZ.append(metal('m_cut', CM, -367, CW, 26))
# the east half: vents across both walkways, erupting in a wave that rolls
# along them - west on the south side, east on the north - so you go with it
for k, (x0, x1) in enumerate(((-68, -58), (-84, -74), (-100, -90))):
    vent_storm('sR%d' % k, x0, x1, -354, -342, BED, 8, 4, -k*1.6)
    vent_storm('sN%d' % k, x0, x1, -392, -380, BED, 8, 4, -(2 - k)*1.6 - 4)
# the pier, 8m up out of the metal - past any jump - and the sluice's
# conductor on it; the lift that rises to it beside it, running while its
# conduit is live
PIER = (-132, -367)
L(box(PIER[0], BED - 2.5, PIER[1], 10, 10.5, 10, 'block', 'amber', walk=True))   # x -137..-127 z -362..-372, top BED+8
LIFT_S = {'id': 'liftS', 'p': [-129, BED - 1, -357], 'to': [-129, BED + 7, -357], 's': [6, 1, 6], 'period': 8,
          'start': False, 'mat': 'block', 'trim': 'amber'}
COND_S_P = [-118, BED + 2.6, -383]        # on the north walkway's edge: an Arc's reach from the south walkway
# the west half's vents
vent_storm('sCa', -118, -108, -354, -342, BED, 8, 4.5, 0)
vent_storm('sCb', -152, -142, -392, -380, BED, 8, 4.5, 3)
vent_storm('sCc', -160, -150, -354, -342, BED, 9, 5, 5.5)
# the sluice: a wall across the Cut, x -165..-163, its gate across the channel
L(wall('z', -164, -392, -342, BED - 4, BED + 16, t=2, holes=[(-379.5, -354.5, BED - 2.5, BED + 8)]))

# ================================================================== THE WEIR
# x -215..-165: deck along the south and west; past the gate, the channel runs
# on dry, a step up to the deck, and beside it the metal pours over the north
# edge into the spillway
L(box(-190, BED - 4, -348, 50, 4, 12, 'block', 'cyan', walk=True),           # z -342..-354
  box(-200, BED - 4, -375, 30, 4, 42, 'block', 'cyan', walk=True),           # x -215..-185 z -354..-396
  bed(-175, -375, 20, 42),                                                    # x -185..-165 z -354..-396
  # stairs up out of the channel to the deck, z -360..-354
  box(-175, BED - 2.5, -359, 8, 0.625, 2, 'block', 'cyan', walk=True),
  box(-175, BED - 2.5, -357, 8, 1.25, 2, 'block', 'cyan', walk=True),
  box(-175, BED - 2.5, -355, 8, 1.875, 2, 'block', 'cyan', walk=True),
  # the metal's kerbs, over its surface (1.5 up), so it never shows edge-on
  # over them from the drained Cut
  box(-175, BED - 2.5, -366.3, 20, 1.7, 0.6, 'block', 'magenta'),
  box(-165.3, BED - 2.5, -373.05, 0.6, 1.7, 12.9, 'block', 'magenta'))       # in the gate, z -366.6..-379.5
HAZ.append(metal('m_weir', -175, -381, 20, 30))                               # z -366..-396
# the north edge is left open in line with the anchor - the launch - with a
# stub of kerb at the west end
L(kerb2(-215.3, BED, -369, 0.6, 54), kerb2(-211, BED, -396.3, 8, 0.6))
vent_storm('sWa', -200, -190, -354, -342, BED, 8, 4.5, 1)
vent_storm('sWb', -213, -201, -378, -366, BED, 9, 5, 4)
vent_storm('sWc', -184, -174, -354, -342, BED, 8, 4.5, 5.5)
# the metal going over the edge, down into the sump
SUMP_Y = -38
HAZ.append({'t': 'cascade', 'id': 'fall_weir', 'p': [-175, SUMP_Y + 1, -396.15], 's': [20, BED - 1 - SUMP_Y - 1]})

# ============================================================= THE SPILLWAY
# z -396..-448, 52m: past a full air kit, with the far bank 2m up. The anchor
# over it; the sump far below, in a pit with walls - south the cliff under the
# works, west a wall, north the bank's cliff with the weaver's pen in it, east
# the dam the drain runs on.
A_SPILL = [-191, BED + 15, -420]         # over the bank court's middle: any further west, the launch flies past the court
SP_X1 = -98                              # the dam's face
HAZ.append({'t': 'molten', 'id': 'm_sump', 'p': [(-215 + SP_X1)/2, SUMP_Y, -422], 's': [SP_X1 + 215, 1, 52]})
L(box(-119.5, -40, -394, 191, BED - 6 + 40, 4, 'wall'),                       # the works' cliff, x -215..-24 z -392..-396
  box(-200, BED - 6, -394, 30, 2, 4, 'wall'), box(-94.5, BED - 6, -394, 141, 2, 4, 'wall'),
  box(-217, -40, -426, 4, BED + 40, 60, 'wall'))                              # the west wall, x -219..-215 z -396..-456

# ============================================================== THE REGISTRY
# Five by three courts, 22m across, between records stacks: 4.5m of steel
# with glass over it to 11m, past any boost. The eye sees over the steel, and
# you see where you can't yet go. Three parts:
#   A  the bank court (where the anchor lands you), and the two courts north
#      of it. The cyan key; the cyan door into B
#   B  the middle and the north-west. The magenta key; the magenta door into C
#   C  the east. The lime key; the lime door into the drain, home
RX = [-200, -178, -156, -134, -112, -90]
RZ = [-448, -470, -492, -514]      # the bank's edge 52m over the spillway from the weir's
RH = 11                       # the glass's head
SH = 4.5                      # the steel's
PEN = (-186, RZ[0] - 4)
L(wall('x', -452, -215, SP_X1, -40, REG - 4, t=8, holes=[(PEN[0] - 6, PEN[0] + 6, REG - 12, REG - 4)]),
  box(PEN[0], REG - 13, -456.5, 14, 9, 1, 'wall'),                            # the pen's back
  box(PEN[0], REG - 12, RZ[0] - 0.15, 12, 8, 0.3, 'dark', grate=True))       # its grate
def stack(axis, line, a0, a1, holes=()):
    """A records stack: steel, glass above, with doorways (a0, a1) through
    the steel. The glass is as thick as the steel: thinner, it left a ledge
    along the steel's top either side of it that a boost could stand on."""
    out = wall(axis, line, a0, a1, REG, REG + SH, t=1, holes=[(h0, h1, REG, REG + SH) for h0, h1 in holes])
    m = (a0 + a1)/2
    g = box(m, REG + SH, line, a1 - a0, RH - SH, 1, 'dark') if axis == 'x' else box(line, REG + SH, m, 1, RH - SH, a1 - a0, 'dark')
    g['window'] = True
    return out + [g]
def cell(i, j):
    return ((RX[i] + RX[i + 1])/2, (RZ[j] + RZ[j + 1])/2)
# x -201..-88.5 z -447..-515, the stacks' feet on it. Half a metre past the
# outer stacks and the bank's kerb (and the drain's east wall): flush with
# them, its neon would flicker under their faces. 6 deep, its
# foot down in the cliff
L(box(-144.75, REG - 6, (RZ[0] + RZ[3])/2, 112.5, 6, RZ[0] - RZ[3] + 2, 'block', 'cyan', walk=True))
MAZE_DOORS = []
SH_AT = {}
def edge(axis, line, a0, a1, kind, sid=None, lock='script'):
    m = (a0 + a1)/2
    L(stack(axis, line, a0, a1, holes=[] if kind == 'solid' else [(m - 3, m + 3)]))
    if kind == 'door':
        MAZE_DOORS.append({'id': sid, 'p': [m, REG, line] if axis == 'x' else [line, REG, m],
                           's': [6, SH, 1.2] if axis == 'x' else [1.2, SH, 6], 'lock': lock})
    if sid: SH_AT[sid] = [m, REG, line] if axis == 'x' else [line, REG, m]
# between courts side by side: (i|i+1, row j) on x = RX[i+1]
V = {(0, 0): None, (1, 0): ('solid',), (2, 0): ('gap',), (3, 0): ('solid',),
     (0, 1): ('gap',), (1, 1): ('door', 'dCyan', 'cyan'), (2, 1): ('door', 'dMagenta', 'magenta'), (3, 1): ('gap',),
     (0, 2): ('gap',), (1, 2): ('gap',), (2, 2): ('gap',), (3, 2): ('solid',)}
# between courts one behind the other: (col i, row j|j+1) on z = RZ[j+1]
H = {(0, 0): ('solid',), (1, 0): ('door', 'sB', 'script'), (2, 0): ('solid',), (3, 0): ('gap',), (4, 0): ('gap',),
     (0, 1): ('solid',), (1, 1): ('solid',), (2, 1): ('gap',), (3, 1): ('solid',), (4, 1): ('gap',)}
for (i, j), k in V.items():
    if k: edge('z', RX[i + 1], RZ[j + 1], RZ[j], k[0], *k[1:])
for (i, j), k in H.items():
    edge('x', RZ[j + 1], RX[i], RX[i + 1], k[0], *k[1:])
# the outer stacks: west and north over nothing, east with the valve's niche,
# south over the spillway, open where the bank faces it, and the lime door
NZ = cell(4, 1)[1]                 # the valve's niche, in the east stack
NICHE = (NZ - 3, NZ + 3)
DR0, DR1 = SP_X1, -90              # the drain's south leg, x -98..-90
L(wall('z', RX[0], RZ[3], RZ[0], REG, REG + RH, t=1),
  wall('x', RZ[3], RX[0] + 0.5, RX[5] - 0.5, REG, REG + RH, t=1),
  stack('z', RX[5], RZ[3], RZ[0], holes=[NICHE]),
  stack('x', RZ[0], -165, RX[5] - 0.5, holes=[(DR0, DR1 - 0.5)]))
MAZE_DOORS.append({'id': 'dLime', 'p': [(DR0 + DR1 - 0.5)/2, REG, RZ[0]], 's': [DR1 - 0.5 - DR0, SH, 1.2], 'lock': 'lime'})
L(kerb2((RX[0] - 165)/2, REG, RZ[0] + 0.2, -165 - RX[0], 0.6))

# Where a conductor stands, the eye has to be able to rest round it: its pool
# keeps 8m or so off a stack on its side (east and south). Each is placed
# where the ground 2.5m round it is clear. Each holds a
# key's cage in another court, a cable over the stacks between them, lit in
# the key's colour while the conductor is live.
# K1: the cage in the court north-west of the bank; its conductor out in the
# bank court, dead till the guards of the court north of the bank are down
K1_CAGE = (cell(0, 1)[0], cell(0, 1)[1] + 2)
K1_COND = (-174, -462)
L(breach(K1_COND[0], REG, K1_COND[1], 1.6, 1.4, 1.6, id='condK1', conductor=True, rod=3.2, shut=True,
         do=[{'a': 'uncage', 'key': 'cyan'}]))
TOP = REG + RH + MAST_TOP                  # where a cable crosses a stack
K1_M = (-181, RZ[1])                       # on the stack between the bank court and the cage's
L(mast(K1_M[0], REG + RH, K1_M[1]))
wire([[K1_COND[0], REG + 4.6, K1_COND[1]], [K1_M[0], TOP, K1_M[1]], [K1_CAGE[0], REG + 2.7, K1_CAGE[1]]],
     lit={'live': 'condK1'}, col='cyan')
L(cover2(cell(1, 1)[0] + 3, REG, cell(1, 1)[1] - 4), cover2(cell(0, 1)[0] + 5, REG, cell(0, 1)[1] - 5))
# K2: the cage in the court north of the middle; its conductor in the middle
# north court, dead till a conduit behind glass in the north-west corner is
# powered - over the stacks, by pylon - its cable lighting up to it
K2_CAGE = (cell(1, 2)[0], cell(1, 2)[1] - 3)
K2_COND = (cell(2, 2)[0], cell(2, 2)[1] - 6)      # off the doorway's line
L(breach(K2_COND[0], REG, K2_COND[1], 1.6, 1.4, 1.6, id='condK2', conductor=True, rod=3.2, shut=True,
         do=[{'a': 'uncage', 'key': 'magenta'}]))
BOX2 = (-196.5, RZ[3] + 3.5)       # the conduit's glass box, in the north-west court's corner, 6m square inside
# (as tall as the stacks: lower, its head would be a ledge a boost from the outer walls' heads)
for b in (box(-193, REG, RZ[3] + 4, 1, RH, 7, 'dark'), box(-196.5, REG, RZ[3] + 7, 6, RH, 1, 'dark')):
    b['window'] = True; L(b)
# the conduit's cable: up over the box's corner, along the stacks between the
# north courts, down to the conductor
K2_M = [(-193, REG + RH, RZ[3] + 7), (RX[1], REG + RH, -510), (RX[2], REG + RH, -510)]
L([mast(*m) for m in K2_M])
wire([[BOX2[0], REG + 3.2, BOX2[1]]] + [[x, y + MAST_TOP, z] for x, y, z in K2_M] + [[K2_COND[0], REG + 4.6, K2_COND[1]]],
     lit={'conduit': 'cK2'})
K2_M2 = (RX[2], RZ[2] - 4)                 # and the conductor's, back over to the cage
L(mast(K2_M2[0], REG + RH, K2_M2[1]))
wire([[K2_COND[0], REG + 4.6, K2_COND[1]], [K2_M2[0], TOP, K2_M2[1]], [K2_CAGE[0], REG + 2.7, K2_CAGE[1]]],
     lit={'live': 'condK2'}, col='magenta')
# K3: its conductor in the north-east court, live, but in a storm that never
# stops while it stands, burning anything beside it. A valve in the court
# next door holds the storm down while it is powered: walled in behind a
# grate, a storm vent erupting over it carries the Arc in. Coils drain it.
# The cage is across the maze, in the court by the bank, the cable lit lime
# from the start.
K3C = cell(4, 2)
K3_COND = (K3C[0], K3C[1] + 4)
K3_CAGE = (cell(2, 0)[0] + 2, cell(2, 0)[1])
L(vent(K3C[0] - 1, REG, K3C[1] - 1, 6, 6))
HAZ.append(storm('sK3', K3C[0] - 6, K3C[0] + 6, K3C[1] - 6, K3C[1] + 6, REG, 8, harms=True))
L(breach(K3_COND[0], REG, K3_COND[1], 1.6, 1.4, 1.6, id='condK3', conductor=True, rod=3.2,
         do=[{'a': 'uncage', 'key': 'lime'}]))
K3_M = [(RX[4], -499), (RX[3], RZ[1])]      # on the stack west of it, then where four stacks meet
L([mast(x, REG + RH, z) for x, z in K3_M])
wire([[K3_COND[0], REG + 4.6, K3_COND[1]]] + [[x, TOP, z] for x, z in K3_M] + [[K3_CAGE[0], REG + 2.7, K3_CAGE[1]]],
     lit={'live': 'condK3'}, col='lime')
# the niche, x -89.5..-86 behind the east stack
L(box(-85.5, REG, NZ, 1, SH, 8, 'wall'), box(-87.75, REG, NZ - 3.5, 3.5, SH, 1, 'wall'),
  box(-87.75, REG, NZ + 3.5, 3.5, SH, 1, 'wall'), box(-87.25, REG + SH, NZ, 4.5, 1, 8, 'wall'),
  box(RX[5], REG, NZ, 0.3, SH, 6, 'dark', grate=True))
vent_storm('sV3', -103, -85, NZ - 7, NZ + 7, REG, 7, 4.5, 0, vx=(-102, -91))
L(cover2(cell(3, 0)[0] - 4, REG, cell(3, 0)[1] + 3), cover2(cell(3, 1)[0] + 4, REG, cell(3, 1)[1] + 4))

# ================================================================= THE DRAIN
# Home from the maze's south-east corner: south over the spillway on its dam,
# x -98..-90, then east, z -404..-396, to the landing. Open to the sky, 11m
# walls. Vents along it erupt in a wave that rolls the way you're going, a
# little slower than you run: keep to the gap between storms.
DZ0, DZ1 = -404, -396
DE = DX1                                   # its east end, x -39
DN = RZ[0] + 0.5                           # its north end, under the maze floor's lip
L(box(SP_X1 - 0.5, -40, (DN + DZ1)/2, 1, BED + 11 + 40, DZ1 - DN, 'wall'),      # the dam's face, x -99..-98
  box((SP_X1 + DE + 1)/2, -40, (DN + DZ1)/2, DE + 1 - SP_X1, BED + 40, DZ1 - DN, 'block', 'cyan', walk=True),   # the dam, x -98..-38
  box(DR1 + 0.5, BED, (DN + DZ0 - 1)/2, 1, 11, DZ0 - 1 - DN, 'wall'),       # the south leg's east side, z -447.5..-405
  box((DR1 + DE + 1)/2, BED, DZ0 - 0.5, DE + 1 - DR1, 11, 1, 'wall'),       # the east leg's north side, x -90..-38
  box(DE + 0.5, BED, (DZ0 + DZ1)/2, 1, 11, DZ1 - DZ0, 'wall'))               # its end
# the step down from the maze into it
# (into the dam's face: flush with it, the dam's neon would flicker under it)
L(box((DR0 - 0.5 + DR1)/2, BED, RZ[0] + 2, DR1 - DR0 + 0.5, 1, 4, 'block', 'cyan', walk=True))
DRAIN_V = 9                                # the wave, m/s (you run 13.2)
DRAIN = []                                 # (x0, x1, z0, z1, distance along)
CORNER = (DZ0 + DZ1)/2 - RZ[0]              # how far along the drain its corner is
for z in (-438, -427, -416):
    DRAIN.append((DR0, DR1, z - 4, z + 4, z - RZ[0]))
for x in (-83, -72, -61, -50):
    DRAIN.append((x - 4, x + 4, DZ0, DZ1, CORNER + x - (DR0 + DR1)/2))
for k, (x0, x1, z0, z1, s) in enumerate(DRAIN):
    vent_storm('sD%d' % k, x0, x1, z0, z1, BED, 6, 3.5, round(-s/DRAIN_V, 2), harms=False, drain=120, bleed=60,
               vx=(x0 + 0.5, x1 - 0.5), vz=(z0 + 0.5, z1 - 0.5))

# ============================================================= THE LIFT HALL
# the Well's foot, x -17..17 z -345..-379: glass over it
GR = BED + 20
L(box(0, TB, TZ, 2*BW, BED - TB, 2*BW, 'block', 'cyan', walk=True))
# the glass, with a hole where the lift goes up through it (x 8.5..17 z -366.25..-357.75),
# its ribs on one 4.25m grid across all three panes, so they line up
GRID = 2*BW/8
for gl in (box(-4.25, GR, TZ, 25.5, 0.3, 2*BW, 'dark'), box(12.75, GR, -372.625, 8.5, 0.3, 12.75, 'dark'),
           box(12.75, GR, -351.375, 8.5, 0.3, 12.75, 'dark')):
    gl['window'] = True; gl['rib'] = [GRID, -BW, TZ - BW]; L(gl)
# and over the inner half of the west wall's window bay, x -20.35..-17, so
# there is no edge to walk off into the hall
_bay = box(-18.675, GR, TZ, 3.35, 0.3, 24, 'dark'); _bay['window'] = True; _bay['rib'] = [GRID, -BW, TZ - BW]; L(_bay)
L(cover2(4, BED, -352), cover2(2, BED, -362))
# the lift, caged against the east wall, x 9..17 z -358..-366
L(box(13, BED, -357.5, 8, GR - BED, 1, 'wall'), box(13, BED, -366.5, 8, GR - BED, 1, 'wall'),
  wall('z', 9.5, -367, -357, BED, GR, t=1, holes=[(-365, -359, BED, BED + 8)]))
# the vents, and in each a conduit caged in a grate: an Arc through the
# storm when it is up powers it, and it throws its charge into the Dynamo
# (one conduit: with three, the shield would always be easy to get down)
HALL_VENTS = [('sH1', -14, -4, -359, -349, 0), ('sH2', -1, 9, -376, -366, 3), ('sH3', -15, -5, -377, -367, 6)]
HALL_CONDUITS = []
for sid, x0, x1, z0, z1, ph in HALL_VENTS:
    vent_storm(sid, x0, x1, z0, z1, BED, 9, 5, ph)
    cx, cz = (x0 + x1)/2, (z0 + z1)/2
    if sid != 'sH2': continue
    # (wider than the conduit's 1.4m reach, so no shot touches it through the bars)
    L(box(cx, BED + 0.2, cz, 3.6, 3.6, 3.6, 'dark', grate=True))
    HALL_CONDUITS.append({'id': 'd' + sid, 'p': [cx, BED + 1.6, cz], 'discharge': True})
# The Authority, hanging in the Well over the hall: an armoured body on four
# cables, dark, its seams burning, its head turned up to the eye. (Drawn and
# run by js/authority.js: Part III's end hauls it up to the crown to fight.)
# Solid, but the eye's light passes it: as a shadow on the Lift Hall it would
# have changed the Dynamo fight under it. In the middle of the Well, and low
# enough that the line from the gallery to the hoist's anchor clears it.
AB = (4, TZ)
AUTH_HANG = [AB[0], 34, AB[1]]
# its four cables straight up the Well to the tower's inner faces near the top
# (not out to the spires, which would run them up through the ledge you tether
# to and out of the roof beside the tower)
AUTH_CABLES = [[sx*16.6, 126, TZ + sz*6] for sx in (-1, 1) for sz in (-1, 1)]
CABLES = CABLES2

# ================================================================== PART III
# Up through the citadel to the eye. The lift carries you up the Well past the
# Authority's body till the eye jams it; a stair inside the north wall; the
# west ledge, struck down behind you; the south gallery; an anchor up to the
# Armoury's wall. The Armoury: the Bastion on a floor of iron plates over the
# quench. Then over the citadel's roofs, each higher than the last, to the
# red frame at the crown, where the Authority and its eye are fought.
J_TOP = 21                          # where the eye jams the lift: its top
# The lifts are 0.3 thick, resting on the floor at the foot of their run (1m
# thick, they would sink 0.7 into it).
LIFT_T = 0.3
LIFT3_UP = [13.5, J_TOP - LIFT_T, -362]
# (filling its cage, 0.1 clear of the walls, so there is no edge to step off
# and be shut in at the bottom by the sealed door)
LIFT3 = {'id': 'lift3', 'p': [13.5, BED, -362], 'to': LIFT3_UP, 's': [6.8, LIFT_T, 7.8], 'once': True,
         'start': False, 'period': 30, 'mat': 'block', 'trim': 'amber'}
# Once the lift is up through the Lift Hall's glass, a glass hatch slides out of
# the east wall over the hole it went up through: off the lift, you land on the
# glass, not back in the cage. (The lift's underside clears the glass 7.9s in.)
HATCH_T = 8.1
HATCH = {'id': 'hatch', 'p': [21.4, BED + 20, -362], 'to': [12.75, BED + 20, -362], 's': [8.5, 0.3, 8.5], 'start': False,
         'once': True, 'period': 2.4, 'glass': True, 'rib': [GRID, -BW, TZ - BW]}
LIFT3_JAM = [13.5, J_TOP - LIFT_T - 1.2, -362]                  # dropped 1.2 as it jams
# where the eye's lightning hits it: its east side, against the shaft wall
LIFT_HIT = [16.2, J_TOP - 0.3, -362]
# E1: a ledge along the east wall from the lift to the north wall, x 13..17
# z -379..-366. It slides out of the wall as the lift jams, as does the west
# ledge when the stair is opened: there all along, they would shadow the Lift
# Hall from the eye, and the Dynamo fight with it.
E1_TOP = J_TOP + 1                  # 22
# (parked 15cm back in the wall: its face flush with the wall's would flicker)
E1 = {'id': 'e1', 'p': [19.15, E1_TOP - 1, -372.5], 'to': [15, E1_TOP - 1, -372.5], 's': [4, 1, 13], 'start': False,
      'once': True, 'period': 3, 'mat': 'block', 'trim': 'cyan'}
# The north wall, z -386..-379, 7 thick: a stair inside it from E1 (22) up
# west to the west ledge (36), behind a breach panel; and at 56, the way
# through into the Armoury
ST_TOP = E1_TOP + 14                # 36
far(box(0, TB, -382.5, 48, E1_TOP - 1 - TB, 7, 'wall'))                 # to 21
# (the floor runs on through both doorways in it: a wall head flush with the
# floor either side of it would flicker along its edges)
L(wall('x', -379.5, -24, 24, E1_TOP - 1, 44, t=1, trim=None,
       holes=[(13, 17, E1_TOP - 1, E1_TOP + 4), (-16, -12, E1_TOP - 1, ST_TOP + 4)]),
  box(15, E1_TOP - 1, -379.5, 4, 1, 1, 'block', walk=True),
  box(-20, E1_TOP - 1, -382, 8, 45 - E1_TOP, 4, 'wall'),                # its ends, x -24..-16 and 17..24
  box(20.5, E1_TOP - 1, -382, 7, 45 - E1_TOP, 4, 'wall'),
  box(14.5, E1_TOP - 1, -382, 5, 1, 4, 'block', walk=True))             # the stair's foot, x 12..17
for k in range(20):
    x1 = 12 - 1.2*k
    L(box(x1 - 0.6, E1_TOP - 1, -382, 1.2, 1 + 0.7*(k + 1), 4, 'block', walk=True))
L(box(-14, E1_TOP - 1, -381.5, 4, ST_TOP - E1_TOP + 1, 5, 'block', walk=True))   # its head, x -16..-12, out through the doorway
far(box(0, E1_TOP - 1, -385, 48, 45 - E1_TOP, 2, 'wall'))               # the stair's outer skin
STAIR_PANEL = breach(15, E1_TOP, -379.5, 4, 4, 1, id='bStair')
L(STAIR_PANEL)
AF = 56                             # the Armoury's floor, and the passage to it
far(box(-13.5, 44, -382.5, 21, AF - 44, 7, 'wall'), box(13.5, 44, -382.5, 21, AF - 44, 7, 'wall'),
    box(-13.5, AF, -382.5, 21, 6, 7, 'wall'), box(13.5, AF, -382.5, 21, 6, 7, 'wall'),
    box(-3.5, AF + 6, -382.5, 41, TL - AF - 6, 7, 'wall', 'magenta'),
    box(20.5, AF + 6, -382.5, 7, TL - AF - 6, 7, 'wall', 'magenta'))
L(box(0, 44, -382.5, 6, AF - 44, 7, 'block', walk=True),               # the passage's floor, x -3..3
  breach(0, AF, -379.5, 6, 6, 1, id='bArm'))
# W1: the west ledge, x -17..-12, from the stair's head south to the gallery,
# in three sections the eye strikes down behind you
W1 = [(-379, -369.7), (-369.7, -360.3), (-360.3, -351)]
WELL_W = [{'id': 'w1%d' % k, 'p': [-19.65, ST_TOP - 1, (z0 + z1)/2], 'to': [-14.5, ST_TOP - 1, (z0 + z1)/2],
           's': [5, 1, z1 - z0], 'start': False, 'once': True, 'period': 3 + k, 'mat': 'block', 'trim': 'cyan'}
          for k, (z0, z1) in enumerate(W1)]
# G1: the south gallery, x -17..17 z -351..-345, along the wall in the roof's
# shadow. (Out in the eye's light, it would shadow half the Lift Hall below from
# the eye, and the Dynamo fight with it; its rail is glass for the same reason)
L(box(0, ST_TOP - 1, -348, 34, 1, 6, 'block', 'cyan', walk=True),
  cover2(-6, ST_TOP, -347), cover2(8, ST_TOP, -347))
G1_RAIL = box(2.5, ST_TOP, -350.85, 29, 1.2, 0.3, 'dark'); G1_RAIL['window'] = True
L(G1_RAIL)
# N2: the ledge at the Armoury's wall, x -6..6 z -379..-370; the anchor up to
# it on the cable the body is hauled by, lit when the gallery is won. The cable
# runs from the body's top up past N2's lip into the roof over it.
N2_TOP = AF
L(box(0, N2_TOP - 1, -374.5, 12, 1, 9, 'block', 'cyan', walk=True))
# 2m in over N2's near lip (nearer, a reel leaves you hanging off it), beside
# the hoist cable (not on it, or the cable runs through the anchor)
A_N2 = [-2.5, 61.5, -372]
_hb = [AB[0], 43.7, AB[1]]                # (the Authority's head, where it hangs)
_ht = [1, 61.5, -372]                # the cable's line, up past the anchor into the roof
_hk = (TL - 2 - _hb[1])/(_ht[1] - _hb[1])
HOIST = [_hb, [round(_hb[i] + (_ht[i] - _hb[i])*_hk, 2) for i in range(3)]]
# The Armoury, in the citadel's body: x -22..22 z -434..-386, its floor iron
# plates over the quench, under a glass roof the eye sees through. (The plates start
# 8m off the south wall: nearer, the wall's head would keep the eye's light off
# the first row.) The quench is cold, and the Bastion is made of molten metal: a
# plate cracked under it drops it in, and nothing else gets through its red
# shield. It floats on the plates' charge, so over a cracked one it falls.
AZ0, AZ1 = -434, -386
R1_TOP = 80                         # the body's roof: the first of the roofs
def wide(b):
    """A floor, though small: the Bastion's shot doesn't cover the whole of it."""
    b['wide'] = True
    return b
far(box(-26, -10, -421, 8, R1_TOP + 10, 70, 'wall', 'magenta'),                   # x -30..-22
    box(34.5, -10, -421, 25, R1_TOP + 10, 70, 'wall', 'magenta', walk=True),       # x 22..47
    box(0, -10, -445, 44, R1_TOP + 10, 22, 'wall', 'magenta', walk=True))          # x -22..22 z -456..-434
QY = AF - 2                                                            # the quench's surface, 1m under the plates
# It drains you like lava rather than killing outright, and is shallow: from
# its bed a double jump (2.5m) gets you back out through the hole you fell in.
# (Its bed is no floor to anything that hovers: what falls in sinks, and is
# gone at once - the Bastion aside - rather than holding the fight shut from
# out of reach.)
L(dict(box(0, -10, (AZ0 + AZ1)/2, 44, QY - 0.5 + 10, AZ1 - AZ0, 'block'), bed=True))
HAZ.append({'t': 'molten', 'id': 'quench', 'p': [0, QY - 0.5, (AZ0 + AZ1)/2], 's': [44, 0.5, AZ1 - AZ0], 'cold': True,
            'burn': 70, 'kill': QY - 1})
L(wide(box(0, AF - 1, -390, 44, 1, 8, 'block', 'cyan', walk=True)),     # the walkway round: south, z -394..-386
  wide(box(0, AF - 1, -432, 44, 1, 4, 'block', 'cyan', walk=True)),     # north, z -434..-430
  wide(box(-20, AF - 1, -412, 4, 1, 36, 'block', 'cyan', walk=True)),   # west, z -430..-394
  wide(box(20, AF - 1, -412, 4, 1, 36, 'block', 'cyan', walk=True)))    # east
PX = [-13.5, -4.5, 4.5, 13.5]
PZ = [-398.5, -407.5, -416.5, -425.5]
# (edged in amber, the game's "something happens here": plain, they would read
# as one floor.) The holes stay open - unless more than six are, when one is
# hoisted back up out of the quench 20s after it is clear, so the floor can
# never run out.
PLATES = [{'id': 'pl%d%d' % (i, j), 'p': [x, AF - 1, z], 'to': [x, AF - 1, z], 's': [9, 1, 9], 'period': 4,
           'plate': True, 'refill': 20, 'spare': 6, 'mat': 'block' if (i + j) % 2 else 'wall', 'trim': 'amber'}
          for i, x in enumerate(PX) for j, z in enumerate(PZ)]
# the way out, once the Bastion is down: a lift in the north-east corner up to
# the roof
# (3.8 deep, not 4: flush with the walkway's edge, its face would flicker against it)
LIFT_A = {'id': 'liftA', 'p': [19, AF, -432.1], 'to': [19, R1_TOP - LIFT_T, -432.1], 's': [6, LIFT_T, 3.8], 'period': 14,
          'start': False, 'mat': 'block', 'trim': 'amber'}
# Glass over the Armoury's south wall, which stops at the foot's head (70): the
# Armoury's wall up to the roof (no higher, or it would stand in the way of
# the first roof's fence). A drop onto the foot's head round the tower is
# allowed: there is a way back up from it, and from the wall heads at 49 below.
L(glass(-22, 22, AZ1 - 0.15, TL, R1_TOP))
# The way back up from round the tower: a lift up the body's south face, from
# the wall head east of the tower (49) to the body's roof east of the Armoury
# (80), running from the start, so landing by it always leads somewhere. The
# wall heads south of the tower run round to it, and the foot's head (70) is a
# drop onto either. (Not anchors up from the heads to the foot's head: they work
# only from a band 10-15m out from the face, nearer, the line runs into the face
# under the lip.)
LIFT_RET = {'id': 'liftRet', 'p': [43, WALL_TOP, -382.9], 'to': [43, R1_TOP - LIFT_T, -382.9], 's': [6, LIFT_T, 6],
            'period': 12, 'mat': 'block', 'trim': 'amber'}
# A glass roof over the Armoury, and the first roof's fight is fought across it
# with the Armoury below: a roof of glass, to see into the level. (The rest of
# the roofs stand on the citadel's solid body: nothing of the level is under
# them.) There from the start: the eye sees, and strikes, through glass. Its
# first piece stops short of the lift's shaft; one from the east wing closes the
# rest beside the shaft. (Platforms going nowhere: walked on like a skylight.)
LID_RIB = [4, 0, -386]
LID = [{'id': 'lid%d' % k, 'p': [cx, R1_TOP - 0.3, cz], 'to': [cx, R1_TOP - 0.3, cz], 's': [w, 0.3, d],
        'glass': True, 'rib': LID_RIB}
       for k, (cx, cz, w, d) in enumerate([(-3, -428, 38, 12), (0, -416, 44, 12), (0, -404, 44, 12), (0, -392.15, 44, 11.7)])]
LID.append({'id': 'lidB', 'p': [19, R1_TOP - 0.3, -426], 'to': [19, R1_TOP - 0.3, -426], 's': [6, 0.3, 8],
            'glass': True, 'rib': LID_RIB})
# The roofs: three, each higher than the last, an anchor up to each lit when
# the fight on the one before is won. The Armoury's roof (R1, 80); the Foundry
# (R2, 92), its crucibles open, molten metal 1.5m under the beams; the Storm
# roof (R3, 106), vent bands erupting across it in a wave that rolls the way
# you go, glass between them over the storm works in the hall below. Then the
# last anchor, lit when the Storm roof's fight is won, up to the crown landing (128).
L(cover2(30, R1_TOP, -402), cover2(40, R1_TOP, -426), cover2(28, R1_TOP, -446),
  cover2(-10, R1_TOP, -444), cover2(9, R1_TOP, -447))
R2_TOP = 92
R2X, R2Z = (52, 92), (-440, -392)
BEAMS_X = [(52, 57), (69, 75), (87, 92)]
BEAMS_Z = [(-440, -435), (-419, -413), (-397, -392)]
CRUC_X = [(57, 69), (75, 87)]
CRUC_Z = [(-435, -419), (-413, -397)]
for x0, x1 in BEAMS_X:
    far(box((x0 + x1)/2, -10, (R2Z[0] + R2Z[1])/2, x1 - x0, R2_TOP + 10, R2Z[1] - R2Z[0], 'block', 'cyan', walk=True))
for z0, z1 in BEAMS_Z:
    for x0, x1 in CRUC_X:
        far(box((x0 + x1)/2, -10, (z0 + z1)/2, x1 - x0, R2_TOP + 10, z1 - z0, 'block', 'cyan', walk=True))
# They burn, as the level's other pools do, rather than killing outright: 3m
# deep, a double jump (3.8) from the bed gets you back out. What falls in is
# gone at once.
CRUC_BED = R2_TOP - 3
for x0, x1 in CRUC_X:
    for z0, z1 in CRUC_Z:
        far(dict(box((x0 + x1)/2, -10, (z0 + z1)/2, x1 - x0, CRUC_BED + 10, z1 - z0, 'block'), bed=True))
        HAZ.append({'t': 'molten', 'id': 'cr%d%d' % (x0, -z0), 'p': [(x0 + x1)/2, CRUC_BED, (z0 + z1)/2],
                    's': [x1 - x0, 1.5, z1 - z0], 'burn': 45, 'kill': CRUC_BED + 1.5})
L(cover2(72, R2_TOP, -402), cover2(72, R2_TOP, -430), cover2(54.5, R2_TOP, -406), cover2(89.5, R2_TOP, -426))
A_R2 = [55, R2_TOP + 5, -416]       # over the Foundry's west beam, from the Armoury's roof
# While a roof's fight is on, glass walls rise round it out of its edges, so
# its garrison can't be picked off from a roof below where none can follow.
# 12m: from cover, a boost clears 7.8. Down in the beams under them till then.
# Live: touching one stings and throws you back, so the edge is never a safe
# place to skirt along, and staying on is half the fight.
FENCE_H = 12
FENCE_SHOCK = 20
def fence(i, x0, x1, z0, z1, top, period=1.6, clip=False):
    # (parked 0.3 under the roof: its head flush with the roof's top would flicker)
    f = {'id': i, 'p': [(x0 + x1)/2, top - FENCE_H - 0.3, (z0 + z1)/2], 'to': [(x0 + x1)/2, top, (z0 + z1)/2],
         's': [x1 - x0, FENCE_H, z1 - z0], 'start': False, 'once': True, 'period': period, 'glass': True,
         'shock': FENCE_SHOCK}
    # (with nothing under the deck to park it in: none of it below its top)
    if clip: f['clip'] = top - 0.3
    return f
FENCES2 = [fence('f2w', R2X[0], R2X[0] + 0.3, R2Z[0] + 0.3, R2Z[1] - 0.3, R2_TOP),
           fence('f2e', R2X[1] - 0.3, R2X[1], R2Z[0] + 0.3, R2Z[1] - 0.3, R2_TOP),
           fence('f2n', R2X[0], R2X[1], R2Z[0], R2Z[0] + 0.3, R2_TOP),
           fence('f2s', R2X[0], R2X[1], R2Z[1] - 0.3, R2Z[1], R2_TOP)]
# Round the Armoury's roof too, and all the way round the Storm roof: every roof
# alike, fully enclosed. The first roof's stand over the Armoury, with nothing
# under them to park in: clipped.
FENCES1 = [fence('f1w', -30, -29.7, -455.7, -386.3, R1_TOP, clip=True),
           fence('f1e', 46.7, 47, -455.7, -386.3, R1_TOP, clip=True),
           fence('f1n', -30, 47, -456, -455.7, R1_TOP, clip=True),
           fence('f1s', -30, 47, -386.3, -386, R1_TOP, clip=True)]
COND_R2 = [72, R2_TOP, -416]        # on the middle crossing, lava on every side
R3_TOP = 106
R3X, R3Z = (48, 92), (-384, -340)
far(box(70, -10, (R3Z[0] + R3Z[1])/2, 44, R3_TOP - 14 + 10, R3Z[1] - R3Z[0], 'wall'))   # to 92 (no trim: the hall's walls stand on its edge)
# the storm works under the roof: walls round, a storm churning inside (seen
# through the glass), the roof on top
far(box(48.5, R3_TOP - 14, -362, 1, 13, 44, 'wall'), box(91.5, R3_TOP - 14, -362, 1, 13, 44, 'wall'),
    box(70, R3_TOP - 14, -383.5, 42, 13, 1, 'wall'), box(70, R3_TOP - 14, -340.5, 42, 13, 1, 'wall'))
HAZ.append(storm('sR3in', 49, 91, -383, -341, R3_TOP - 14, h=12, harms=False))
# west to east: the far end (8 wide, so its cover isn't sheltering in the
# storm), B3, glass, B2, glass, B1, the end you arrive at
R3_STRIPS = [(48, 56, 'solid'), (56, 64, 'band'), (64, 68, 'glass'), (68, 76, 'band'), (76, 80, 'glass'),
             (80, 88, 'band'), (88, 92, 'solid')]
for x0, x1, kind in R3_STRIPS:
    if kind == 'glass':
        g = box((x0 + x1)/2, R3_TOP - 0.3, -362, x1 - x0, 0.3, 44, 'dark', walk=True); g['window'] = True
        g['rib'] = [4, 0, -340]; L(g)
        far(box((x0 + x1)/2, R3_TOP - 1, -383.5, x1 - x0, 0.7, 1, 'wall'), box((x0 + x1)/2, R3_TOP - 1, -340.5, x1 - x0, 0.7, 1, 'wall'))
    else:
        # (the far strip untrimmed: its kerbs stand where the trim would flicker under them)
        far(box((x0 + x1)/2, R3_TOP - 1, -362, x1 - x0, 1, 44, 'block', 'cyan' if x0 == R3X[1] - 4 else None, walk=True))
R3_WAVE = 9                         # m/s: you run 13.2
for k, (x0, x1, kind) in enumerate([q for q in R3_STRIPS if q[2] == 'band'][::-1]):
    vent_storm('sR3%d' % k, x0, x1, R3Z[0], R3Z[1], R3_TOP, 6.5, 3.6, round(-12*k/R3_WAVE, 2), h=9, drain=120, bleed=60,
               vx=(x0 + 0.5, x1 - 0.5), vz=(R3Z[0] + 0.5, R3Z[1] - 0.5))
# kerbs down its long sides (not on the strip you arrive on)
L(kerb2(68, R3_TOP, R3Z[0] + 0.3, 40, 0.6), kerb2(68, R3_TOP, R3Z[1] - 0.3, 40, 0.6),
  cover2(51.5, R3_TOP, -360), cover2(51.5, R3_TOP, -374))      # (clear of the line up to the crown's anchor, along z -349)
A_R3 = [90, R3_TOP + 5, -381]       # over the end you arrive at, from the Foundry's south beam
# and along the Storm roof's north edge, facing the Foundry (so the garrison
# can't chase you back onto it, into the vents): inside the kerb, down in the
# hall's north wall till then
FENCES3 = [fence('f3n', R3X[0], R3X[1], R3Z[0] + 0.6, R3Z[0] + 0.9, R3_TOP),
           # (not the north one alone, which you could jump out round the ends of)
           fence('f3s', R3X[0], R3X[1], R3Z[1] - 0.9, R3Z[1] - 0.6, R3_TOP),
           fence('f3w', R3X[0], R3X[0] + 0.3, R3Z[0] + 0.9, R3Z[1] - 0.9, R3_TOP),
           fence('f3e', R3X[1] - 0.3, R3X[1], R3Z[0] + 0.9, R3Z[1] - 0.9, R3_TOP)]
# the crown landing, x 18.2..34 z -359..-345, against the tower's head, and the
# anchor over its east lip, from the Storm roof's far end
# (from the red frame's face: from inside the wall, its top would be flush
# with the gate's sill, and flicker across the gate's foot)
CL_TOP = TOWER_TOP
L(box(26.1, CL_TOP - 1, -352, 15.8, 1, 14, 'block', 'magenta', walk=True),
  kerb2(25.95, CL_TOP, -345.3, 14.9, 0.6))
A_TOP = [32, CL_TOP + 4, -349]
# fenced while its fight is on, north, east and south (the red frame is the
# west), so it can't be fought from the roofs below.
# Rising out of its edges from nowhere: there is nothing under it.
FENCES_CL = [fence('fCn', 18.2, 34, -359, -358.7, CL_TOP, clip=True),
             fence('fCe', 33.7, 34, -358.7, -345.3, CL_TOP, clip=True),
             fence('fCs', 18.2, 34, -345.3, -345, CL_TOP, clip=True)]
# the red frame: a gate onto the tower's head, the crown behind it, its wall
# standing on the tower's east wall and 5m past both ends of the crown's floor
# (short of the tower's corners, the rim would be a hop from the landing; only
# 1m past the crown's, you could jump round its end onto the landing)
# (the gate 4m north of the landing's middle, clear of the spire just inside)
L(wall('z', 17.6, -383, -341, CRB, CL_TOP + 9, t=1.2, holes=[(-359, -353, CL_TOP, CL_TOP + 6)]))
# The places for the cores, in two rings high over the tower round an empty
# middle (js/ending.js makes them), above where the eye hangs, as if it guards
# them: seen from all over the level, and from anywhere round the citadel at
# the end. And the beacon the last core lights, risen out of the Authority's
# well at the end.
CORES = [0, EYE[1] + 26, TZ]
BEACON = [0, CR + 16, TZ]
# The crown's floor, in four quarters round the hole the Authority comes up
# through (x -6..6 z -368..-356) and the spires' footings: 2m thick, down in the
# tower's top (`clip`) till it rises. Each quarter falls away when its body is
# beaten.
CROWN_Q = {'N': [(-18, 17, -378, -375), (-10, 10, -375, -368)], 'S': [(-18, 17, -349, -346), (-10, 10, -356, -349)],
           'W': [(-18, -6, -368, -356)], 'E': [(6, 17, -368, -356)]}
CROWN = []
for q, rects in CROWN_Q.items():
    for k, (x0, x1, z0, z1) in enumerate(rects):
        x, z = (x0 + x1)/2, (z0 + z1)/2
        CROWN.append({'id': 'cr%s%d' % (q, k), 'p': [x, CRB - 2, z], 'to': [x, CRB, z], 's': [x1 - x0, CR - CRB, z1 - z0], 'clip': CRB,
                      'start': False, 'once': True, 'period': 3, 'mat': 'block', 'trim': 'magenta', 'q': q,
                      'over': True})          # (to the checker: over the Well, which is what it checks)


# ============================================================ PART II'S ORDERS
G_BALC = {'hunt': False, 'sends': None, 'path': [[-40, -346]], 'period': 20}
G_CUT = {'hunt': False, 'sends': None, 'path': [[-62, -348], [-158, -348], [-158, -386], [-62, -386]], 'period': 34}
HUNT_CUT = {'hunt': True, 'follow': 9, 'r': 5, 'lock': 0.9, 'sends': {'kind': 'drone', 'n': 2, 'max': 3}}
HUNT_REG = {'hunt': True, 'follow': 8, 'r': 5, 'lock': 1.0, 'sends': {'kind': 'drone', 'n': 2, 'max': 3}}
CALM = {'sends': None}                      # still hunting, but sending nothing: between fights
HUNT_HALL = {'hunt': True, 'follow': 10, 'r': 5.5, 'lock': 0.85, 'sends': {'kind': 'drone', 'n': 2, 'max': 4}}
def strikes(*ids):
    """The eye's lightning on doors it is about to shut."""
    return [gaze({'strikeAt': [SH_AT[i][0], REG, SH_AT[i][2]]}) for i in ids]
def shut_behind(door):
    return strikes(door) + [{'a': 'after', 't': 1.2, 'do': [{'a': 'seal', 'door': door}]}]
CP2 = {k: {'a': 'checkpoint', 'p': p} for k, p in {
    'land': [-30, BED, -348], 'cut': [-58, BED, -386], 'sluice': [-150, BED, -386], 'weir': [-170, BED, -348],
    'bank': [-188, REG, RZ[0] - 8], 'A': [-167, REG, RZ[1] - 4], 'K1': [-195, REG, RZ[1] - 5],
    'B': [-140, REG, RZ[1] - 5], 'K2': [-162, REG, RZ[2] - 4], 'C': [-128, REG, RZ[1] - 5],
    'K3': [-150, REG, RZ[0] - 4], 'home': [-44, BED, -386], 'hall': [-8, BED, -362],
    'won': [-2, BED, -368]}.items()}
def cp_hp(k, hp):
    return dict(CP2[k], hp=hp)
def fight(arena_extra=None, quiet=True, then=()):
    a = {'a': 'arena', 'quiet': quiet, 'onClear': [gaze(CALM)] + list(then)}
    if arena_extra: a.update(arena_extra)
    return a
# The gallery: the eye breaks it behind you, a section a second
def gal_fall(k, t):
    x = GALLERY[k]['p'][0]
    return [{'a': 'after', 't': t, 'do': [gaze({'strikeAt': [x, DECK, -332]})]},
            {'a': 'after', 't': t + 1.15, 'do': [{'a': 'fall', 'mover': GALLERY[k]['id'], 'to': [x, -80, -332], 'warn': 0.3,
                                                  'shatter': [x, -332]}]}]
GAL_IN = [{'a': 'seal', 'door': 'dGal'}, gaze(G_BALC)] + [a for k in range(4) for a in gal_fall(k, 0.1 + k*1.0)] + \
    [gaze({'send': {'kind': 'drone', 'n': 2, 'short': 14}})]
# The Cut, east half: a wave by pod along the walkways, the eye hunting. Won,
# the pier's conductor wakes.
R2_IN = [
    gaze(HUNT_CUT),
    pods(([-70, BED + 1, -348], [E('rusher', 3)]), ([-92, BED + 1, -386], [E('lancer')]), ([-104, BED + 1, -348], [E('bulwark')]),
         ([-112, BED + 1, -386], [E('lancer')]), ([-84, BED + 1, -348], [E('sentinel')]), first=0.6),
    # won, it keeps: dying on the lift doesn't bring the whole wave back
    fight(quiet=False, then=[{'a': 'expose', 'ids': ['condS']}, {'a': 'drop', 'p': [-104, BED + 0.5, -348], 'hp': 1}, CP2['cut']]),
    CP2['cut']]
# the lift's conduit, the first time it is live: the eye sends Coils for it
CUT2 = [gaze(HUNT_CUT),
        pods(([-120, BED + 1, -386], [E('coil')]), ([-146, BED + 1, -386], [E('coil')]), ([-140, BED + 1, -348], [E('lancer')]),
             ([-104, BED + 1, -386], [E('lancer')]), ([-150, BED + 1, -348], [E('mite', 4)]), first=0.8)]
SLUICE = [{'a': 'open', 'door': 'dSluice'}, {'a': 'banner', 'title': 'SLUICE OPEN'},
          {'a': 'hazard', 'id': 'm_cut', 'on': False}, gaze(CALM), CP2['sluice']]
L(breach(PIER[0] - 2, BED + 8, PIER[1] - 2, 1.6, 1.4, 1.6, id='condS', conductor=True, rod=3.2, shut=True, do=SLUICE))
WEIR_IN = [
    gaze(HUNT_CUT),
    {'a': 'spawn', 'enemies': [dict(E('weaver'), p=[PEN[0], REG - 12 + 4.2, PEN[1]], fixed=True, weaveR=80, weaveCut=1.0)]},
    pods(([A_SPILL[0], A_SPILL[1] + 2, A_SPILL[2] + 6], [dict(E('severer'), holds='spill')]),
         ([-196, REG + 1, RZ[0] - 5], [E('lancer')]), ([-170, REG + 1, RZ[0] - 5], [E('lancer')]),
         ([-184, REG + 1, RZ[0] - 14], [E('sentinel')]), first=0.8),
    fight(quiet=False, then=[{'a': 'open', 'door': 'sB'}, {'a': 'drop', 'p': [-180, REG + 0.5, RZ[0] - 12], 'hp': 2}]),
    cp_hp('weir', 0.6)]
A_IN = [
    gaze(HUNT_REG),
    pods(([cell(1, 1)[0] - 4, REG + 1, cell(1, 1)[1] + 4], [E('bulwark')]), ([cell(1, 1)[0] + 5, REG + 1, cell(1, 1)[1] + 6], [E('sentinel')]),
         ([cell(1, 1)[0], REG + 1, cell(1, 1)[1] + 1], [E('mite', 4)]), ([cell(0, 1)[0] - 4, REG + 1, cell(0, 1)[1] - 6], [E('bulwark')]),
         ([cell(0, 1)[0] + 3, REG + 1, cell(0, 1)[1] + 4], [E('lancer')])),
    fight(then=[{'a': 'expose', 'ids': ['condK1']}, {'a': 'drop', 'p': [cell(1, 1)[0] - 3, REG + 0.5, cell(1, 1)[1]], 'hp': 1}]),
    CP2['A']]
B_IN = shut_behind('dCyan') + [{'a': 'conduit', 'id': 'cK2', 'on': True}, CP2['B']]
B2_IN = [
    gaze(HUNT_REG),
    pods(([cell(2, 2)[0] - 4, REG + 1, cell(2, 2)[1] + 6], [E('lancer')]), ([cell(1, 2)[0] + 6, REG + 1, cell(1, 2)[1] + 6], [E('lancer')]),
         ([cell(1, 2)[0], REG + 1, cell(1, 2)[1]], [E('sentinel')]), ([cell(2, 2)[0] + 5, REG + 1, cell(2, 2)[1] - 5], [E('rusher', 3)])),
    fight()]
NOOK = cell(3, 2)
NOOK_IN = [
    gaze(HUNT_REG),
    pods(([NOOK[0] + 4, REG + 1, NOOK[1] - 4], [E('bulwark')]), ([NOOK[0] - 2, REG + 1, NOOK[1] + 4], [E('rusher', 3)])),
    fight(then=[{'a': 'drop', 'p': [NOOK[0] + 5, REG + 0.5, NOOK[1] - 6], 'hp': 2, 'ammo': 2}])]
C_IN = shut_behind('dMagenta') + [CP2['C']]
C1_IN = [
    gaze(HUNT_REG),
    pods(([cell(3, 0)[0], REG + 1, cell(3, 0)[1]], [E('rusher', 3)]), ([cell(2, 0)[0] - 3, REG + 1, cell(2, 0)[1]], [E('lancer')]),
         ([cell(3, 0)[0] + 6, REG + 1, cell(3, 0)[1] - 6], [E('sentinel')]), ([cell(2, 0)[0] + 6, REG + 1, cell(2, 0)[1] + 5], [E('bulwark')])),
    fight()]
C2_IN = [
    gaze(HUNT_REG),
    pods(([cell(4, 1)[0] - 4, REG + 1, cell(4, 1)[1] - 6], [E('coil')]), ([K3C[0] - 7, REG + 1, K3C[1] + 8], [E('coil')]),
         ([cell(4, 1)[0] - 6, REG + 1, cell(4, 1)[1] + 6], [E('bulwark')])),
    fight()]
HALL_IN = [
    {'a': 'seal', 'door': 'dHall'},
    gaze(HUNT_HALL),
    pods(([-10, BED + 1, -372], [E('bulwark')]), ([4, BED + 1, -350], [E('bulwark')]), ([-4, BED + 1, -362], [E('mite', 5)]),
         ([-13, BED + 1, -350], [E('lancer')]), ([6, BED + 1, -376], [E('lancer')]), first=1.0),
    {'a': 'arena', 'onClear': [{'a': 'count', 'id': 'hall1'}, {'a': 'drop', 'p': [-6, BED + 0.5, -362], 'hp': 1}]},
    CP2['hall']]
# The Dynamo: down the beam like everything else. Its shield goes down when a
# conduit near it is powered - here, only through the storm it stands in.
# The eye's lightning hurts it while its shield is down.
HALL_W2 = [
    gaze(dict(HUNT_HALL, sends=None, bdmg=260)),
    pods(([0, BED + 1, -362], [E('dynamo')]), ([-12, BED + 1, -356], [E('lancer')]), ([6, BED + 1, -352], [E('lancer')]), first=1.5),
    {'a': 'after', 't': 4, 'do': [{'a': 'boss', 'strike': {'every': 5.5}}]},
    {'a': 'arena', 'onClear': [
        {'a': 'open', 'door': 'dLift'}, {'a': 'open', 'door': 'dHall'}, {'a': 'drop', 'p': [-6, BED + 0.5, -362], 'hp': 2},
        gaze({'hunt': False, 'sends': None, 'bdmg': 0, 'path': [[-10, -352], [-10, -372]], 'period': 20}),
        cp_hp('won', 0.6)]},
    CP2['hall']]
TRIG2 = [
  # the balcony: the Undercroft below, and the eye's light down the Cut
  {'on': 'enter', 'vol': {'p': [-40, DECK + 2, -343], 's': [10, 4, 10]}, 'do': [gaze(G_CUT)]},
  # the gallery falls behind you
  {'on': 'enter', 'vol': {'p': [-22, DECK + 2, -332], 's': [16, 4, 12]}, 'do': GAL_IN},
  # the landing: the Lift Hall's door, and what opens it
  {'on': 'enter', 'vol': {'p': [-37, BED + 2, -367], 's': [26, 4, 50]}, 'do': [
    CP2['land']]},
  {'on': 'enter', 'vol': {'p': [(C0 - 54)/2, BED + 2, -367], 's': [-54 - C0, 6, 50]}, 'do': R2_IN},
  {'on': 'enter', 'vol': {'p': [-191, BED + 2, -369], 's': [48, 6, 54]}, 'do': WEIR_IN},
  {'on': 'enter', 'vol': {'p': [(RX[0] + RX[2])/2, REG + 1.5, (RZ[0] + RZ[1])/2], 's': [44, 3, 22]}, 'do': [CP2['bank']]},
  {'on': 'enter', 'vol': {'p': [cell(1, 1)[0], REG + 2, cell(1, 1)[1]], 's': [22, 4, 22]}, 'do': A_IN},
  # through the cyan door: the eye shuts it behind you
  {'on': 'enter', 'vol': {'p': [RX[2] + 14, REG + 2, cell(2, 1)[1]], 's': [16, 4, 22]}, 'do': B_IN},
  {'on': 'enter', 'vol': {'p': [cell(2, 2)[0], REG + 2, cell(2, 2)[1]], 's': [22, 4, 22]}, 'do': B2_IN},
  {'on': 'enter', 'vol': {'p': [NOOK[0], REG + 2, NOOK[1]], 's': [20, 4, 20]}, 'do': NOOK_IN},
  # through the magenta door
  {'on': 'enter', 'vol': {'p': [RX[3] + 14, REG + 2, cell(3, 1)[1]], 's': [16, 4, 22]}, 'do': C_IN},
  {'on': 'enter', 'vol': {'p': [(RX[2] + RX[4])/2, REG + 2, cell(3, 0)[1]], 's': [44, 4, 22]}, 'do': C1_IN},
  {'on': 'enter', 'vol': {'p': [cell(4, 1)[0], REG + 2, cell(4, 1)[1]], 's': [22, 4, 22]}, 'do': C2_IN},
  # out of the drain
  {'on': 'enter', 'vol': {'p': [-50, BED + 2, (DZ0 + DZ1)/2], 's': [20, 4, 8]}, 'do': [CP2['home']]},
  {'on': 'enter', 'vol': {'p': [0, BED + 2, -362], 's': [22, 4, 30]}, 'do': HALL_IN},
  {'on': 'enter', 'vol': {'p': [0, BED + 2, -362], 's': [34, 6, 34]}, 'need': {'count': 'hall1'}, 'do': HALL_W2},
]
KEYS2 = [
  {'colour': 'cyan', 'p': [K1_CAGE[0], REG + 1.2, K1_CAGE[1]], 'cage': [1.0, 2.6],
   'do': [{'a': 'lamp', 'door': 'dHall'}, CP2['K1']]},
  {'colour': 'magenta', 'p': [K2_CAGE[0], REG + 1.2, K2_CAGE[1]], 'cage': [1.0, 2.6],
   'do': [{'a': 'lamp', 'door': 'dHall'}, CP2['K2']]},
  {'colour': 'lime', 'p': [K3_CAGE[0], REG + 1.2, K3_CAGE[1]], 'cage': [1.0, 2.6],
   'do': [{'a': 'lamp', 'door': 'dHall'}, {'a': 'open', 'door': 'dReturn'}, CP2['K3']]},
]
CONDUITS2 = [
  {'id': 'cS', 'p': COND_S_P, 'lifts': ['liftS'], 'do': CUT2},
  # dead till you are through the cyan door: a double jump off cover in the
  # part before can reach a pylon over the glass
  {'id': 'cK2', 'p': [BOX2[0], REG + 2.6, BOX2[1]], 'off': True, 'do': [{'a': 'expose', 'ids': ['condK2']}]},
  {'id': 'cV3', 'p': [-87.5, REG + 2.6, NZ], 'hazards': {'off': ['sK3']}},
] + HALL_CONDUITS
# K2's pylons: scattered over the relay's own court, under the sky, rather than
# in a line leading straight to the key. Wherever one is hit, the arc runs through every one of them before it
# comes down into the relay, from the one over its box: that one is the only
# one that sees down into it, and the relay is nearer it than any other pylon
# is. Laid out by search against the chain's rule (nearest untouched thing
# within 18m).
PYLONS2 = [{'p': [x, REG + dy, z]} for x, dy, z in (
    (BOX2[0], 12, BOX2[1]), (-183.7, 15.1, -509.5), (-186.9, 15.3, -498.1), (-195.3, 16.8, -499.6),
    (-181.1, 15.5, -494.5), (-197.6, 14, -494.8), (-188.1, 17.5, -505.4), (-180, 17.2, -504.2))]
# arrows up at them, in that court, either side of its doorway from the cage's
SIGNS2 = [{'arrow': 'up', 'p': [RX[1] - 0.53, REG + 2.4, z], 's': [2, 2.6], 'face': 'x', 'trim': 'cyan'}
          for z in (-496, -510)]
ANCHORS2 = [{'id': 'aSpill', 'p': A_SPILL, 'hold': 'spill'}]
DOORS2 = [
  {'id': 'dGal', 'p': [-6.6, DECK, -332], 's': [1.2, 12, 12], 'lock': 'script', 'open': True},
  {'id': 'dSluice', 'p': [-164, BED - 2.5, -367], 's': [2.2, 10.5, 25], 'lock': 'script'},
  {'id': 'dReturn', 'p': [(DX0 + DX1)/2, BED, -394], 's': [DX1 - DX0, 8, 4.2], 'lock': 'script'},
  {'id': 'dHall', 'p': [TW0 + 0.6, BED, (HALL_DOOR[0] + HALL_DOOR[1])/2], 's': [1.2, 8, 8], 'lock': 'script',
   'lamps': ['cyan', 'magenta', 'lime'], 'wall': 1.2},
  {'id': 'dLift', 'p': [9.5, BED, -362], 's': [1.2, 8, 6], 'lock': 'script'},
] + MAZE_DOORS
CHECKPOINTS2 = [{'p': v['p']} for v in CP2.values()]
# (the Lift Hall's only up to 12m: Part III's ledges up the Well over it each
# keep their own; and through its doorway, so hiding there doesn't keep the mites off you.
# Boxes are shrunk by an enemy's size, so two that only touch leave a gap none
# can cross: they overlap)
ENEMY_BOXES2 = [[-215, -24, -392, -342], [-215, -165, RZ[0], -392], [-200, -90, RZ[3], RZ[0]],
                [-17, 17, -379, -345, -30, 12], [-23, -13, HALL_DOOR[0], HALL_DOOR[1], -30, 12]]

# =========================================================== PART III'S ORDERS
HUNT_WELL = {'hunt': True, 'follow': 9, 'r': 5, 'lock': 1.0, 'sends': {'kind': 'drone', 'n': 2, 'max': 3}}
G_WELL = {'hunt': False, 'sends': None, 'path': [[0, -357], [0, -366]], 'period': 16}
HUNT_ARM = {'hunt': True, 'follow': 8, 'r': 4.5, 'lock': 0.9, 'sends': {'kind': 'drone', 'n': 1, 'max': 2}, 'bdmg': 300}
HUNT_ROOF = {'hunt': True, 'follow': 9, 'r': 5, 'lock': 0.9, 'sends': {'kind': 'drone', 'n': 2, 'max': 3}}
CP3 = {k: {'a': 'checkpoint', 'p': p} for k, p in {
    'jam': [15, E1_TOP, -372], 'stair': [-14, ST_TOP, -382], 'g1': [2, ST_TOP, -348], 'n2': [0, N2_TOP, -376],
    'arm': [8, AF, -388], 'armwon': [8, AF, -432], 'r1': [30, R1_TOP, -436], 'r2': [54.5, R2_TOP, -420],
    'r3': [90, R3_TOP, -372], 'crown': [26, CL_TOP, -350],
    # on the spires' footings, clear of the spire and its conductor
    'SE': [11.5, CR, -354.5], 'SW': [-11.5, CR, -354.5], 'NE': [11.5, CR, -369.5], 'NW': [-11.5, CR, -369.5]}.items()}
# The kill boxes, on once Part III has begun. You can fall anywhere: onto the
# Lift Hall's glass, the foot's head round the tower, the wall heads at 49, and
# on down into Parts I and II, so the whole level can be revisited, with a way
# back up from each. Only the lift's cage still kills: sealed, nothing in it
# leads out. What else falls is killed (`enemies`, a line for them alone),
# rather than holding its fight shut from out of reach.
def void(i, below, box, enemies=False):
    v = {'t': 'void', 'id': i, 'below': below, 'box': box, 'off': True}
    if enemies: v['enemies'] = True
    return v
# (Not over the Lift Hall's glass: you can get down to it and back up, and the
# drones the eye sends up the Well after you hover low over it.)
VOIDS3 = [void('vCage', GR - 0.5, [9, 17, -366, -358]),
          void('vEcE', WALL_TOP + 2, [24, 92, -386, -320], True), void('vScE', WALL_TOP + 2, [-66, 24, -338, -320], True),
          void('vE', WALL_TOP + 2, [24, 500, -800, -386], True), void('vE2', WALL_TOP + 2, [92, 500, -386, -320], True),
          void('vE3', WALL_TOP + 2, [24, 500, -320, -100], True),
          void('vN', WALL_TOP + 2, [-40, 100, -800, AZ1], True),
          void('vS', WALL_TOP + 2, [-60, 24, -320, -100], True),
          void('vW', T_CUT + 4, [-500, -24, -800, -100], True),
          void('vTE', TL + 2, [17, 24, -386, -338], True), void('vTSE', TL + 2, [-24, 24, -345, -338], True)]
# The ways back up from Parts I and II, running once Part III has begun, to the
# wall heads at 49 (and from them the return lift up to the roofs): from the
# forecourt up the gatehouse's face; from the Lift Hall's landing to the
# balcony, and from the gallery's end (all that is left of it) up beside the
# wall at its far end. Hidden under the floor till then: standing idle in Parts
# I and II, amber-trimmed, they would say something happens there. At the foot
# of their run they sink back into it.
LIFT_F = {'id': 'liftF', 'p': [9, DECK - LIFT_T, -317.85], 'clip': DECK, 'to': [9, WALL_TOP - LIFT_T, -317.85], 's': [4, LIFT_T, 4],
          'period': 14, 'start': False, 'mat': 'block', 'trim': 'amber'}
LIFT_L = {'id': 'liftL', 'p': [-40, BED - LIFT_T, -351], 'clip': BED, 'to': [-40, DECK - LIFT_T, -351], 's': [5, LIFT_T, 5],
          'period': 10, 'start': False, 'mat': 'block', 'trim': 'amber'}
LIFT_G = {'id': 'liftG', 'p': [-42.9, DECK - LIFT_T, -332], 'clip': DECK, 'to': [-42.9, WALL_TOP - LIFT_T, -332], 's': [4, LIFT_T, 4],
          'period': 14, 'start': False, 'mat': 'block', 'trim': 'amber'}
LIFTS_BACK = [LIFT_F, LIFT_L, LIFT_G]
# ...and the maze's doors the eye shut behind you open again, so a fall into
# a court between two of them doesn't shut you in
PART3_ON = [{'a': 'start', 'mover': m['id']} for m in LIFTS_BACK] + \
    [{'a': 'open', 'door': d, 'quiet': True} for d in ('dCyan', 'dMagenta')]
def voids(*ids): return [{'a': 'hazard', 'id': i, 'on': True} for i in ids]
# (a moment after you land: raised as you came in on the line, one would come up into you)
def fences_up(fs): return [{'a': 'after', 't': 0.4, 'do': [{'a': 'start', 'mover': f['id']} for f in fs]}]
def fences_down(fs): return [{'a': 'move', 'mover': f['id'], 'to': f['p'], 'period': 4} for f in fs]
# The lift: up past the body, the eye after you down the shaft, till it
# strikes the lift and it drops and sticks
# (it waits at the bottom for you to be on it, so it can't go up without you)
# (its drones come up to you rather than staying on the glass, out of reach)
LIFT_IN = [{'a': 'start', 'mover': 'lift3', 'aboard': True, 'do': [
    {'a': 'seal', 'door': 'dLift'}, gaze(HUNT_WELL),
    {'a': 'after', 't': 4, 'do': [pods(([4, 10, -352], [dict(E('drone', 2), fixed=True)]), first=0.2)]},
    {'a': 'after', 't': HATCH_T, 'do': [{'a': 'start', 'mover': 'hatch'}] + voids(*[v['id'] for v in VOIDS3]) + PART3_ON},
    {'a': 'after', 't': 14.2, 'do': [gaze({'strikeAt': LIFT_HIT})]},
    {'a': 'after', 't': 15.3, 'do': [{'a': 'move', 'mover': 'lift3', 'to': LIFT3_JAM, 'period': 1.2}, {'a': 'start', 'mover': 'e1'},
                                     {'a': 'banner', 'title': 'LIFT JAMMED'}]},
    {'a': 'after', 't': 16.2, 'do': [{'a': 'stop', 'mover': 'lift3'}, {'a': 'anchors', 'ids': ['aWE1']}, CP3['jam']]}]}]
# The way back up from the Well's floor: whatever you fall onto, an anchor
# brings you back to the route. From the Lift Hall's glass to the east ledge
# (2m in over its lip), lit once it is out. From the stair's head over to the
# gallery, lit once the west ledge has fallen, since back up the stair after
# that is a dead end.
A_WE1 = [15, 28, -373]
A_WG = [-14.5, 40, -349]
# the stair: what waits inside the wall comes down it at you
STAIR_IN = [
    {'a': 'start', 'mover': 'w10'}, {'a': 'start', 'mover': 'w11'}, {'a': 'start', 'mover': 'w12'},
    {'a': 'spawn', 'enemies': [dict(E('rusher', 3), p=[-14, ST_TOP, -382]), dict(E('mite', 4), p=[-1.8, E1_TOP + 8.4, -382])]},
    fight(quiet=False, then=[CP3['stair']])]
# the west ledge: struck down behind you as you run it
def w1_fall(k, t):
    x, z = WELL_W[k]['to'][0], WELL_W[k]['to'][2]
    return [{'a': 'after', 't': t, 'do': [gaze({'strikeAt': [x, ST_TOP, z]})]},
            {'a': 'after', 't': t + 1.15, 'do': [{'a': 'fall', 'mover': WELL_W[k]['id'], 'to': [x, -80, z],
                                                  'warn': 0.3, 'shatter': [x, z]}]}]
W1_IN = [gaze(G_WELL)] + [a for k in range(3) for a in w1_fall(k, 0.2 + 0.75*k)] + \
    [{'a': 'after', 't': 3, 'do': [{'a': 'anchors', 'ids': ['aWG']}]}]
# the gallery: pods down the shaft. Won, the hoist cable's anchor lights
G1_IN = [
    gaze(HUNT_WELL),
    pods(([-12, ST_TOP + 1, -348], [E('lancer')]), ([12, ST_TOP + 1, -348], [E('lancer')]),
         ([0, ST_TOP + 1, -348], [E('bulwark')]), ([-8, ST_TOP + 1, -349], [E('rusher', 3)]),
         ([-8, ST_TOP + 6, -354], [dict(E('drone', 2), fixed=True)]), first=0.6),
    fight(quiet=False, then=[{'a': 'anchors', 'ids': ['aN2']}, {'a': 'drop', 'p': [-2, ST_TOP + 0.5, -348], 'hp': 2},
                             CP3['g1']])]
# The Armoury: the Bastion, down the beam. Its red shield turns the Sunder;
# the eye's lightning cracks the plates, and over a cracked one it falls into
# the quench, which hurts it, and opens it to everything for a few seconds.
# It comes for you, so you can lead it. As it weakens the eye sends more.
BASTION3 = dict(E('bastion'), hpMul=1.6, range=7, rides=True, proof=True, quench=0.12, phases=[
    {'at': 0.7, 'do': [pods(([-14, AF + 1, -430], [E('mite', 4)]), ([14, AF + 3, -390], [E('lancer')]), first=0.4)]},
    {'at': 0.4, 'do': [pods(([0, AF + 1, -390], [E('bulwark')]), ([14, AF + 1, -430], [E('mite', 4)]), first=0.4)]},
    {'at': 0.2, 'do': [pods(([-14, AF + 3, -390], [E('lancer')]), ([0, AF + 1, -432], [E('rusher', 3)]), first=0.4)]}])
ARM_IN = [
    {'a': 'seal', 'door': 'dArm'},
    # (one briefing for the fight: the plate falls silently after it)
    {'a': 'brief', 'title': 'THE ARMOURY', 'sub': "Crack a plate with the eye's lightning; in the quench below, the Bastion can be hurt."},
    gaze(HUNT_ARM),
    pods(([0, AF + 1, -418], [BASTION3]), ([-14, AF + 3, -428], [E('lancer')]),
         ([14, AF + 3, -428], [E('lancer')]), first=1.2),
    # (opened again once it is won: sealed, there would be no way back up from
    # the Well to the roofs)
    {'a': 'arena', 'onClear': [
        {'a': 'open', 'door': 'dArm'},
        gaze({'hunt': False, 'sends': None, 'bdmg': 0, 'path': [[-5, -404], [5, -420]], 'period': 20}),
        {'a': 'start', 'mover': 'liftA'}, {'a': 'drop', 'p': [8, AF + 0.5, -432], 'hp': 2},
        dict(CP3['armwon'], hp=0.6)]},
    CP3['arm']]
# The roofs. The Armoury's: a wave across it. Won, the anchor up to the
# Foundry lights.
# (and the Armoury's lift held at the top, plugging its shaft, while its fight
# is on: down, its shaft would be a way out of the fence)
LIFT_A_RUN = {'a': 'move', 'mover': 'liftA', 'to': LIFT_A['p'], 'period': 14,
              'then': {'to': LIFT_A['to'], 'period': 14, 'loop': True}}
R1_IN = fences_up(FENCES1) + [
    {'a': 'move', 'mover': 'liftA', 'to': LIFT_A['to'], 'period': 6},
    gaze(HUNT_ROOF),
    pods(([-12, R1_TOP + 1, -398], [E('lancer')]), ([42, R1_TOP + 1, -400], [E('lancer')]),
         ([2, R1_TOP + 1, -412], [E('bulwark')]), ([36, R1_TOP + 1, -446], [E('rusher', 3)]),
         ([-8, R1_TOP + 1, -446], [E('mite', 4)]), first=0.8),
    fight(quiet=False, then=fences_down(FENCES1) + [LIFT_A_RUN, {'a': 'anchors', 'ids': ['aR2']}, {'a': 'drop', 'p': [36, R1_TOP + 0.5, -430], 'hp': 1},
                             CP3['r1']]),
    CP3['r1']]
# The Foundry: beams between open crucibles. Won, its conductor wakes, on the
# crossing in the middle; the eye's lightning on it lights the anchor on.
R2_IN = fences_up(FENCES2) + [
    gaze(HUNT_ROOF),
    pods(([89.5, R2_TOP + 1, -437], [E('lancer')]), ([89.5, R2_TOP + 1, -395], [E('lancer')]),
         ([72, R2_TOP + 1, -437], [E('sentinel')]), ([72, R2_TOP + 1, -400], [E('bulwark')]),
         ([54.5, R2_TOP + 1, -437], [E('mite', 4)]), first=0.6),
    fight(quiet=False, then=fences_down(FENCES2) + [{'a': 'expose', 'ids': ['condR2']}, {'a': 'drop', 'p': [54.5, R2_TOP + 0.5, -410], 'hp': 1}]),
    CP3['r2']]
L(breach(COND_R2[0], R2_TOP, COND_R2[2], 1.6, 1.4, 1.6, id='condR2', conductor=True, rod=3.2, shut=True,
         do=[{'a': 'anchors', 'ids': ['aR3']}, CP3['r2']]))
# The Storm roof: across the vents with its garrison shooting from the far end,
# (the last anchor lit when it is won, like the others)
R3_IN = fences_up(FENCES3) + [
    gaze(HUNT_ROOF),
    pods(([52, R3_TOP + 1, -356], [E('lancer')]), ([52, R3_TOP + 1, -368], [E('lancer')]),
         ([53, R3_TOP + 1, -362], [E('bulwark')]), ([66, R3_TOP + 1, -362], [E('mite', 4)]),
         ([70, R3_TOP + 1, -350], [E('lancer')]), first=0.8),
    fight(quiet=False, then=fences_down(FENCES3) + [{'a': 'anchors', 'ids': ['aTop']}, {'a': 'drop', 'p': [52, R3_TOP + 0.5, -362], 'hp': 2}, CP3['r3']]),
    CP3['r3']]
# The crown landing: a fight; won, the crown's floor rises out of the tower's
# top, and the red frame's gate opens onto it
CROWN_UP = [{'a': 'start', 'mover': m['id']} for m in CROWN]
CL_IN = fences_up(FENCES_CL) + [gaze(HUNT_ROOF),
         pods(([22, CL_TOP + 1, -349], [E('lancer')]), ([30, CL_TOP + 1, -354], [E('bulwark')]),
              ([28, CL_TOP + 5, -350], [dict(E('drone', 3), fixed=True)]), first=0.5),
         fight(quiet=False, then=fences_down(FENCES_CL) + CROWN_UP + [
             gaze({'hunt': False, 'sends': None, 'path': [[0, -362]], 'period': 20}),
             {'a': 'after', 't': 2.6, 'do': [{'a': 'open', 'door': 'dCrown'}]},
             {'a': 'drop', 'p': [26, CL_TOP + 0.5, -352], 'hp': 2, 'ammo': 2},
             dict(CP3['crown'], hp=0.6)])]

# ============================================================= THE AUTHORITY
# Three parts, a checkpoint at each, sealed in on the crown with a fall a death.
# 1. Its body, hauled up the Well to stand in the hole in the crown's floor:
#    Sunder its four plates off, Rail the cores behind the grates. The eye
#    hunts you, and its lightning hurts it beside a side it has lost.
# 2. Beaten, it falls back down the Well and the floor goes, a quarter at a
#    time, leaving the spires on their footings. Only the eye's lightning
#    breaks a spire's conductor; each one broken cuts the spire's arc to the
#    eye. The eye fights with more beams; anchors on the spires.
# 3. The last arc cut, the eye falls, sheds its rings and the housing round
#    it, and flies loose over the crown, burning where its light holds you.
#    Two platforms rise out of the Well. Rail its pupil, which looks where its
#    light lands. It falls, and the last core is in what's left of it.
# A fall from the crown while its fight is on kills at once, wherever it goes:
# otherwise, off its rims you would land on the roofs below, and back up by the
# anchors find the frame's gate sealed. With the eye dead it is off and the
# gate open: free to go where you like and come back for the core.
VCROWN = void('vCrown', CR - 10, [-120, 140, -520, -250])
HUNT_AUTH = {'hunt': True, 'follow': 8, 'r': 4.5, 'lock': 1.0, 'cool': 2.2, 'sends': None, 'bdmg': 260, 'path': [[0, -362]]}
AUTH_UP = [0, CR + 2, TZ]                # its chest's middle, standing in the hole
AUTHORITY = dict(E('authority'), p=AUTH_UP, fixed=True, phases=[
    {'at': 0.7, 'do': [pods(([-14, CR + 1, -376], [E('mite', 4)]), ([12, CR + 6, -348], [dict(E('drone', 2), fixed=True)]), first=0.4)]},
    {'at': 0.4, 'do': [pods(([-14, CR + 4, -348], [E('lancer')]), ([12, CR + 1, -376], [E('rusher', 3)]), first=0.4)]},
    {'at': 0.2, 'do': [pods(([0, CR + 1, -350], [E('mite', 4)]), ([0, CR + 6, -374], [dict(E('drone', 2), fixed=True)]), first=0.4)]}])
def spire_pods(*at):
    return pods(*[([x, CR + 6, z], [dict(E(k), fixed=True)]) for x, z, k in at], first=0.6)
# the floor going: the body first, then each quarter, its warning long enough to get onto a footing
def floor_falls(t0):
    out = []
    for k, q in enumerate('WNES'):
        for m in [c for c in CROWN if c['q'] == q]:
            x, z = m['to'][0], m['to'][2]
            out.append({'a': 'after', 't': t0 + 1.1*k, 'do': [{'a': 'fall', 'mover': m['id'], 'to': [x, -80, z], 'warn': 1.6, 'shatter': [x, z]}]})
    return out
SPIRE_HUNT = {'hunt': True, 'follow': 8.5, 'r': 4.5, 'lock': 1.0, 'cool': 2.0, 'sends': None, 'bdmg': 0, 'beams': 1}
EYE_FLY = {'c': [0, CR + 16, TZ], 'rx': 7, 'rz': 3, 'period': 22}
EYE_HUNT = {'hunt': True, 'follow': 7.5, 'r': 4.5, 'lock': 0.9, 'cool': 1.8, 'sends': None, 'bdmg': 0, 'beams': 0, 'burn': 22, 'fly': EYE_FLY}
EYE_REST = [0, CRB + 4, -370.5]          # where it falls: across the north wall's head
# where the ending's camera stops (its bearing from the tower's middle, 0 south),
# and where it is then: what the dead eye turns to look at, so it's seen eye on
END_ANG = -0.95
END_CAM = [round(math.sin(END_ANG)*50, 1), CR + 16 + 8, round(TZ + math.cos(END_ANG)*50, 1)]
# and everything it sent goes with it
EYE_WON = [
    {'a': 'killall'},
    gaze({'die': EYE_REST, 'face': END_CAM, 'hunt': False, 'beams': 0, 'burn': 0}),
    {'a': 'hazard', 'id': 'vCrown', 'on': False},
    {'a': 'after', 't': 2.6, 'do': [{'a': 'uncage'}, {'a': 'drop', 'p': [-8, CRB + 0.5, -353.5], 'hp': 2},
                                    {'a': 'open', 'door': 'dCrown'}]},
    # last, so it photographs the timer above; without it, a fall before you
    # took the core would bring the eye back to fight again
    CP3['SW']]
# (on its death, not a fight's end: its fight starts from a conductor's breaking,
# which a checkpoint can't put back as a fight)
EYE = dict(E('eye'), onDeath=EYE_WON, p=[EYE_FLY['c'][0] + EYE_FLY['rx'], EYE_FLY['c'][1], TZ], fixed=True, phases=[
    {'at': 0.66, 'do': [spire_pods((-14, -362, 'drone'), (14, -362, 'drone'), (0, -353.5, 'severer'))]},
    {'at': 0.33, 'do': [spire_pods((-9, -353.5, 'drone'), (9, -370.5, 'drone'), (0, -370.5, 'severer'), (0, -353.5, 'drone'))]}])
EYE_DROP = [
    gaze(dict(EYE_HUNT, drop=True)),
    {'a': 'brief', 'title': 'THE EYE', 'sub': 'Rail the pupil.'},
    {'a': 'after', 't': 3.4, 'do': [{'a': 'spawn', 'enemies': [EYE]},
                                    spire_pods((-9, -353.5, 'drone'), (9, -370.5, 'drone')),
                                    # (on footings, clear of their spires and conductors)
                                    pods(([-11, CR + 1, -350], [E('lancer')]), ([11, CR + 1, -374], [E('lancer')]), first=0.9)]}]
# each spire's conductor: its arc cut, and the count of them
SPIRE_N = [[{'a': 'banner', 'title': 'SPIRE DOWN', 'sub': '1 OF 4'}, spire_pods((0, -353.5, 'severer'), (0, -370.5, 'drone'))],
           [{'a': 'banner', 'title': 'SPIRE DOWN', 'sub': '2 OF 4'}, gaze({'beams': 2}), spire_pods((-14, -362, 'drone'), (14, -362, 'drone'))],
           [{'a': 'banner', 'title': 'SPIRE DOWN', 'sub': '3 OF 4'}, spire_pods((0, -353.5, 'severer'), (0, -370.5, 'severer'))],
           EYE_DROP]
# (on the footings' inner sides: by the red frame's wall, the eye wouldn't put
# its light where it would shine through the wall, and never come for you there)
COND_SP = {'SW': (-11.2, -350.6), 'SE': (11.2, -350.6), 'NW': (-11.2, -373.4), 'NE': (11.2, -373.4)}
for k, (x, z) in COND_SP.items():
    L(breach(x, CR, z, 1.6, 1.4, 1.6, id='cond' + k, conductor=True, rod=3.2, shut=True,
             do=[gaze({'cut': list(SPIRE_AT[k])}),
                 {'a': 'topple', 'mover': 'sp' + k, 'dir': [1 if SPIRE_AT[k][0] > 0 else -1, 1 if SPIRE_AT[k][1] > TZ else -1]},
                 {'a': 'count', 'id': 'spires', 'do': SPIRE_N}, CP3[k]]))
AUTH_WON = [
    {'a': 'authority', 'do': 'fall'},
    {'a': 'drop', 'p': [11.5, CR + 0.5, -352], 'hp': 2, 'ammo': 2}] + floor_falls(2.2) + [
    {'a': 'after', 't': 7.5, 'do': [
        gaze(SPIRE_HUNT), {'a': 'expose', 'ids': ['cond' + k for k in COND_SP]},
        spire_pods((0, -353.5, 'severer'), (-14, -362, 'drone'), (14, -362, 'drone'))]},
    CP3['SE']]
AUTH_IN = [
    {'a': 'seal', 'door': 'dCrown'}, {'a': 'hazard', 'id': 'vCrown', 'on': True},
    {'a': 'brief', 'title': 'THE AUTHORITY', 'sub': 'Sunder its armour off, then Rail the cores behind it.'},
    gaze(HUNT_AUTH),
    # (on a clock, so a death before it is up hauls it again)
    {'a': 'after', 't': 0.2, 'do': [{'a': 'authority', 'do': 'haul'}]},
    {'a': 'after', 't': 11.5, 'do': [{'a': 'spawn', 'enemies': [AUTHORITY]}, CP3['SE']]},
    {'a': 'arena', 'onClear': AUTH_WON},
    CP3['SE']]
TRIG3 = [
  # from its door across the lift itself, 6m high, so a double jump through
  # the doorway can't pass over it
  {'on': 'enter', 'vol': {'p': [11, BED + 3, -362], 's': [10.2, 6, 6.2]}, 'do': LIFT_IN},
  {'on': 'enter', 'vol': {'p': [-14.5, ST_TOP + 2, -377], 's': [5, 4, 4]}, 'do': W1_IN},
  {'on': 'enter', 'vol': {'p': [0, ST_TOP + 2, -348], 's': [34, 4, 6]}, 'do': G1_IN},
  {'on': 'enter', 'vol': {'p': [0, N2_TOP + 2, -374.5], 's': [12, 4, 9]}, 'do': [CP3['n2']]},
  {'on': 'enter', 'vol': {'p': [0, AF + 2, -412], 's': [40, 4, 36]}, 'do': ARM_IN},
  # onto the Armoury's roof, anywhere (1.5m in from its fences), not just off
  # one side of the lift
  {'on': 'enter', 'vol': {'p': [8.5, R1_TOP + 2, -421], 's': [74, 4, 67]}, 'do': R1_IN},
  # (each 2m in from where its fences rise: you come in over the edge on the line)
  {'on': 'enter', 'vol': {'p': [73, R2_TOP + 2, -416], 's': [38, 4, 48]}, 'do': R2_IN},
  {'on': 'enter', 'vol': {'p': [89.5, R3_TOP + 2, -362], 's': [3, 4, 40]}, 'do': R3_IN},
  {'on': 'enter', 'vol': {'p': [25.5, CL_TOP + 2, -352], 's': [14, 4, 10]}, 'do': CL_IN},
  # through the gate onto the crown
  {'on': 'enter', 'vol': {'p': [11, CR + 2, -357], 's': [10, 4, 14]}, 'do': AUTH_IN},
]
# Each of Part III's fights switches the kill boxes on too, not just the jam:
# whatever way you got in (the dev panel's teleports), nothing that falls from
# a deck can end up hovering somewhere far below, holding a fight shut
for t in TRIG3[1:]:
    t['do'] = voids(*[v['id'] for v in VOIDS3]) + PART3_ON + t['do']
STAIR_PANEL['do'] = STAIR_IN
ANCHORS3 = [{'id': 'aWE1', 'p': A_WE1, 'off': True}, {'id': 'aWG', 'p': A_WG, 'off': True},
            {'id': 'aN2', 'p': A_N2, 'off': True}, {'id': 'aR2', 'p': A_R2, 'off': True},
            {'id': 'aR3', 'p': A_R3, 'off': True}, {'id': 'aTop', 'p': A_TOP, 'off': True}]
DOORS3 = [{'id': 'dArm', 'p': [0, AF, -385.4], 's': [6, 6, 1.2], 'lock': 'script', 'open': True, 'boss': True},
          {'id': 'dCrown', 'p': [17.6, CL_TOP, -356], 's': [1.2, 6, 6], 'lock': 'script', 'boss': True, 'later': True}]
for m in CROWN: m.pop('q', None)
MOVERS3 = LIFTS_BACK + [LIFT3, HATCH, E1] + WELL_W + PLATES + [LIFT_A, LIFT_RET] + LID + FENCES1 + FENCES2 + FENCES3 + FENCES_CL + \
    CROWN + SPIRE_MV
CABLES3 = []                    # (the hoist line is the Authority's: js/authority.js draws it)
# Each deck keeps its own: [x0, x1, z0, z1, y0, y1], so nothing drifts off one
# deck and sinks out of reach, holding its fight's lock shut. 'fly': only
# drones, which come up the Well after you.
# (Shrunk by an enemy's size, boxes that only touch leave a gap none can cross:
# where they should pass, they overlap.)
ENEMY_BOXES3 = [[11, 17, -379, -358, 17, 32],                      # the jammed lift, the east ledge
                [-16, 17, -384, -380, 20, 44],                     # the stair
                [13, 17, -384, -372, 20, 32],                      # through its panel onto the ledge
                [-17, -12, -384, -345, 33, 46],                    # the stair's head, the west ledge
                [-17, 17, -351, -345, 33, 46],                     # the gallery
                [-17, 17, -379, -345, GR + 3, TL - 2, 'fly'],      # up the Well
                [-22, 22, AZ0, AZ1, AF - 6, AF + 20],              # the Armoury
                [22, 47, -456, AZ1, R1_TOP - 2, R1_TOP + 11], [-22, 27, -456, AZ0, R1_TOP - 2, R1_TOP + 11],
                # the glass over the Armoury, round the lift's shaft
                [-22, 16, AZ0 - 3, AZ1, R1_TOP - 2, R1_TOP + 11], [-22, 25, -430, AZ1, R1_TOP - 2, R1_TOP + 11],
                [R2X[0], R2X[1], R2Z[0], R2Z[1], R2_TOP - 3, R2_TOP + 12],
                [R3X[0], R3X[1], R3Z[0], R3Z[1], R3_TOP - 3, R3_TOP + 14],
                [18, 34, -359, -345, CL_TOP - 2, CL_TOP + 14],
                # the crown: over the hole and the spires' footings, and the air between
                [-18, 17, -378, -346, CR - 4, CR + 24]]
# ...and once its floor has gone, what walks is kept to the walkways and the
# footings (overlapping, so it can get round the corners) and only drones go
# over the hole, which the Severers would otherwise walk off into
CROWN_RING = [[-18, 17, -372, -369], [-18, 17, -355, -352], [-18, -15, -375, -349], [14, 17, -375, -349],
              [-18, -10, -375, -368], [10, 17, -375, -368], [-18, -10, -356, -349], [10, 17, -356, -349]]
CROWN_RING_BOXES = [b + [CR - 4, CR + 24] for b in CROWN_RING] + [[-18, 17, -378, -346, CR - 4, CR + 24, 'fly']]

# Eight stations round the citadel, dark, far out in space: when the lockdown
# lifts at the end, a core flies out to each from the rings and it lights
# (js/ending.js builds them)
STATIONS = []
for k in range(8):
    a = k/8*2*math.pi + 0.35
    x, z, y = round(math.cos(a)*340), round(-250 + math.sin(a)*340), (60, 115, 85, 140, 70, 125, 95, 150)[k]
    STATIONS.append([x, y, z])

LEVEL = {
 'id': 'act3-3', 'name': 'SECTOR 3-3', 'subtitle': 'THE CITADEL', 'act': 3,
 'floor': False, 'floorY': 0, 'quietLoad': True, 'space': True, 'planet': [320, 130, -120], 'dronesFly': True,
 # enemies stay over the decks, and over the first span's run
 'enemyBoxes': [[-7, 7, 4, 16], [-6, 6, -50, 4], [-18, 18, -124, -50], [-18, 18, -280, -214],
                [-30, 30, -320, -282]] + ENEMY_BOXES2 + ENEMY_BOXES3,
 'loadout': ['pulse', 'scatter', 'rail', 'tether', 'arc', 'sunder'],
 'spawn': {'p': [0, D0, 12], 'yaw': 0},
 'hazards': HAZ + VOIDS3 + [VCROWN],
 'geometry': G,
 'movers': [SPAN, SPAN2, SPAN2B, TROLLEY, LIFT_W] + COUNTERWEIGHTS + [LIFT_S] + GALLERY + MOVERS3,
 'anchors': ANCHORS + [{'id': 'tC', 'p': TC, 'off': True}] + ANCHORS2 + ANCHORS3,
 'marks': MARKS, 'signs': SIGNS2,
 'cables': CABLES + CABLES3,
 'conduits': CONDUITS2, 'pylons': PYLONS2, 'nodes': [], 'enemies': [], 'weapons': [],
 'keys': [{'colour': 'amber', 'p': KEY_P, 'cage': [1.0, 2.6],
           'do': [{'a': 'checkpoint', 'p': [-15, D2, -238]}]}] + KEYS2,
 'doors': [
   {'id': 'dSpan', 'p': [0, D1, P1_Z1 - 0.15], 's': [12, 6, 0.6], 'lock': 'script'},
   {'id': 'dAmber', 'p': [0, D2, -281], 's': [6, 6, 2.2], 'lock': 'amber'},
   {'id': 'dGate', 'p': [0, D2, GZ0 - 0.6], 's': [12, 12, 1.2], 'lock': 'script', 'lamps': 3},
 ] + DOORS2 + DOORS3,
 'checkpoints': [{'p': [0, D0, 12]}, {'p': [-12, D1, -54]}, {'p': [0, D1, -119]}, {'p': [0, D2, -220]},
                 {'p': [-15, D2, -238]}, {'p': [0, D2, -287]}, {'p': [0, D2, -330]}] + CHECKPOINTS2 +
                [{'p': v['p']} for v in CP3.values()],
 'triggers': [
  # arrival: the message, then - with nothing else going on - the eye wakes,
  # sends its first pod onto pier 1, and runs the span out to fetch you
  {'on': 'enter', 'vol': {'p': [0, D0 + 2, 10], 's': [14, 4, 12]}, 'do': [
    {'a': 'brief', 'title': 'SECTOR 3-3 · THE CITADEL', 'sub': 'The citadel that ordered the lockdown. It is still watching.'},
    {'a': 'after', 't': 1.5, 'do': [{'a': 'hazard', 'id': 'gaze', 'on': True}]},
    {'a': 'after', 't': 5.5, 'do': [gaze({'send': {'kind': 'drone', 'n': 3, 'short': 16}})]},
    {'a': 'after', 't': 9.0, 'do': [
        gaze(G_SPAN),
        {'a': 'move', 'mover': 'span1', 'to': SPAN_OUT, 'period': 14, 'then': {'to': SPAN_IN, 'period': 14, 'loop': True}}]},
    # a checkpoint goes last in its list: it photographs the level as it stands,
    # timers above it included, so a fall off the landing doesn't leave the eye asleep
    {'a': 'checkpoint', 'p': [0, D0, 12]}]},
  # pier 1: the fight, sealed by the gate at its head
  {'on': 'enter', 'vol': P1_ALL, 'do': P1_IN + [P1_CP]},
  {'on': 'enter', 'vol': P1_ALL, 'need': {'count': 'p1a'}, 'do': P1_W2},
  # pier 2: the key's guards
  # (the checkpoint after the eye's orders, so a death on pier 2 doesn't put it
  # back on its patrol, away from the key's conductor)
  {'on': 'enter', 'vol': P2_ALL, 'do': P2_IN + [{'a': 'checkpoint', 'p': [0, D2, -220]}]},
  # near the cage: what breaks it (a puzzle, but one that wants saying)
  # (on landing on the island, not on the pier near it)
  # (and once it is live: dead steel, the line would only puzzle)
  {'on': 'enter', 'vol': {'p': [-29, ISLE_TOP + 1.5, -240], 's': [8, 4, 12]}, 'need': {'count': 'p2'}, 'do': [
    {'a': 'brief', 'title': 'CONDUCTOR', 'sub': "Only the eye's lightning breaks a conductor."}]},
  {'on': 'enter', 'vol': FORE_ALL, 'do': FORE_IN},
  {'on': 'enter', 'vol': FORE_ALL, 'need': {'count': 'gE'}, 'do': FORE_W},
  {'on': 'enter', 'vol': FORE_ALL, 'need': {'count': 'gW'}, 'do': FORE_C},
 ] + TRIG2 + TRIG3,
 # the last core, out of the beaten eye, on the west platform
 'goal': {'t': 'artifact', 'id': 'core-a3-3', 'p': [-8, CRB + 1.3, -353.5], 'locked': True, 'hidden': True, 'cage': 0, 'over': True},
 'authority': {'hang': AUTH_HANG, 'up': AUTH_UP, 'rest': [AB[0], GR + 0.3 + 4.6, AB[1]], 'deck': CR,
               'cables': AUTH_CABLES, 'hoist': HOIST[1]},
 'ending': {'cores': CORES, 'beacon': BEACON, 'around': [0, 118, TZ], 'endAng': END_ANG, 'stations': STATIONS,
            'spans': [{'a': 'move', 'mover': 'span1', 'to': SPAN_OUT, 'period': 10},
                      {'a': 'move', 'mover': 'span2b', 'to': SPAN2_IN, 'period': 10}]},
}
# the crown's floor going: its one box (the list's last) for the ring round the hole
assert LEVEL['enemyBoxes'][-1] == [-18, 17, -378, -346, CR - 4, CR + 24]
AUTH_WON.insert(1, {'a': 'enemyBoxes', 'boxes': LEVEL['enemyBoxes'][:-1] + CROWN_RING_BOXES})

dedupe_walls(G); unstitch_walls(G); dedupe_floors(G); hide_floor_edges(G); drop_buried_trims(G)
G.extend(G2)
json.dump(LEVEL, open('levels/act3-3.json', 'w'), indent=1)
print('levels/act3-3.json: %d geometry pieces' % len(G))

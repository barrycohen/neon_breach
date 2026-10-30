#!/usr/bin/env python3
"""Act I, Sector 1-2: THE RESERVOIR.

Same 2.5D discipline as 1-1 - one connected plan, no walkable surface directly
above another, every zone sharing a real edge with the next. Bigger than 1-1 in
both axes, and built around two things 1-1 did not have: the tether, and an
enemy that has to be killed in a particular order.

Zone plan (x, z, floor top):

  INTAKE        -13..13    118..142     1     arrival, quiet
  TANK ONE      -56..56     54..118     1     drained tank, wide; the mite swarm
  CHAN A        -96..-56    92..102     1  |
  CHAN B        -96..-86    36..92      1  |  sluice runs, tight and blind
  CHAN C       -126..-96    36..46      1  |
  VALVE HALL   -126..-86   -12..36      1     conduit behind a grate: rail it open
  SLUICE       -108..-96   -44..-12     1     gated by that conduit
  PUMP GALLERY -112..-48   -96..-44     1     wide, hard - the weaver holds it
  JUNCTION      -48..-8   -124..-64     1     the fork: sealed gate on, open way east
  SPILLWAY       -8..64   -140..-96   void    the climb - jump, then tether
  CATWALK        64..112  -140..-104   26     high and narrow, AMBER KEY at the end
  CASCADE        64..112  -104..-60   26>1    staged 5m drops back to the deck
  RETURN         -8..64    -80..-64     1     the loop closes at the junction
  CORE APPR     -48..-8   -168..-124    1     through the amber gate
  CYAN SPUR     -88..-48   -160..-140    1     CYAN KEY, guarded
  CORE          -60..48   -240..-168    1     arena

The order the player meets things, which is the point of the layout:

  sealed sluice gate (valve hall)  ->  the conduit that opens it, behind a grate
  AMBER gate (junction, sealed)    ->  the spillway climb  ->  AMBER key (catwalk)
  CYAN gate (core approach)        ->  CYAN key (spur, a few steps back)

Both gates are seen before the thing that opens them, and the spillway loop
returns to the junction rather than making the player walk the level backwards.

Heights are chosen against the measured numbers, not guessed:
  P1->P2   8m gap,  3m rise   double jump
  P2->P3  14m gap,  8m rise   above what any jump regains - tether only
  P3->P4  16m gap,  7m rise   tether only
  P4->CAT 30m gap,  7m rise   tether only, and the longest reel in the level
Cascade drops are 5m, inside the 5.5m a double jump regains, so the way back
up is open and the descent is not a one-way commitment.
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lvlbuild import (box, room, pad, lid, dedupe_walls, dedupe_floors,
                      hide_floor_edges, drop_buried_trims, unstitch_walls)

G = []
def L(*items):
    for it in items:
        if isinstance(it, list): G.extend(it)
        else: G.append(it)

# ---------------------------------------------------------------- INTAKE
L(room(0, 130, 26, 24, h=9, over=0, doors=[('n', 0, 8, 6)]))

# ---------------------------------------------------------------- TANK ONE
# The widest room in the level, first, so everything after it reads as tight.
L(room(0, 86, 112, 64, h=16, doors=[('s', 0, 8, 6), ('w', 11, 6, 5)]))
for cx, cz, w, d, hh in [(-34, 106, 10, 10, 3.4), (28, 104, 12, 8, 3.4),
                         (-8, 92, 9, 14, 4.4), (36, 84, 10, 10, 3.4),
                         (-38, 76, 14, 8, 3.4), (10, 68, 11, 9, 4.4),
                         (-16, 62, 9, 9, 3.4), (40, 62, 8, 12, 3.4)]:
    L(box(cx, 1, cz, w, hh, d, 'block', 'cyan'))

# ---------------------------------------------------------------- CHANNELS
L(room(-76, 97, 40, 10, h=5.5, over=0, walltrim=None, doors=[('e', 0, 6, 5), ('n', -15, 6, 5)]))
L(room(-91, 64, 10, 56, h=5.5, over=0, walltrim=None, doors=[('s', 0, 6, 5), ('w', -23, 6, 5)]))
L(room(-111, 41, 30, 10, h=5.5, over=0, walltrim=None, doors=[('e', 0, 6, 5), ('n', 0, 6, 5)]))

# Lids over the duct chain, tiled so no two share a plane and every wall top
# is covered exactly once.
L(lid(-127, -97, 35, 47, 6.5))     # over channel C
L(lid( -97, -85, 35, 91, 6.5))     # over channel B, up to where A starts
L(lid( -97, -55, 91, 103, 6.5))    # over channel A

# ---------------------------------------------------------------- VALVE HALL
# The conduit alcove opens off the hall's west wall, so it does not fight the
# north wall the sluice door already stands in. The grate fills the opening:
# nothing walks through it, and only the rail reaches what is behind it.
# The opening is a slot, not a doorway: 2.2m wide and 1.6m tall, eight metres
# up the west wall. A full-height door gap gives no lintel, so the wall either
# side of the slot is built back in by hand.
L(room(-106, 12, 40, 48, h=16, doors=[('s', -5, 6, 5), ('n', 4, 6, 5), ('w', 0, 2.2, 16)]))
for cx, cz, w, d, hh in [(-118, 24, 8, 8, 3.4), (-94, 18, 9, 10, 3.4), (-116, 0, 10, 8, 4.2)]:
    L(box(cx, 1, cz, w, hh, d, 'block', 'cyan'))
# the one thing in the hall worth climbing, and the only place the angle works
L(box(-106, 1, 12, 9, 4.2, 9, 'block', 'amber'))
L(box(-126.5, 1, 12, 1.0, 8.0, 2.2, 'wall', 'magenta'))     # wall below the slot
L(box(-126.5, 10.6, 12, 1.0, 6.4, 2.2, 'wall', 'magenta'))  # wall above the slot
# The grate sits a metre deeper in the alcove than the slot, so the plate over
# the slot has no face in the same plane as it - flush, that edge flickers.
L(box(-127.4, 9.0, 12, 0.7, 1.6, 2.2, 'dark', grate=True))  # the grate itself
L(dict(p=[-126.5, 9.0, 12], s=[1.0, 1.6, 2.2], mat='wall', id='sluice'))
# An overhang over the slot. Without it the shot is a matter of backing up far
# enough; with it, a line from the deck is cut off whatever the range, and the
# only way to see the conduit is from on top of something.
L(box(-123.5, 7.0, 12, 5.0, 1.0, 10, 'wall', 'magenta'))
L(box(-133, 0, 12, 13, 1.0, 12, 'block', 'amber'))          # alcove deck - not walkable
L(box(-133, 1, 5.5, 13, 15, 1.0, 'wall', 'magenta'))        # alcove south wall
L(box(-133, 1, 18.5, 13, 15, 1.0, 'wall', 'magenta'))       # alcove north wall
L(box(-140.0, 1, 12, 1.0, 15, 12, 'wall', 'magenta'))       # alcove back wall
L(box(-133, 16, 12, 13, 0.6, 12, 'wall'))                   # lid: no dropping in

# ---------------------------------------------------------------- SLUICE
L(room(-102, -28, 12, 32, h=15, over=0, walltrim=None, doors=[('s', 0, 6, 5), ('n', 0, 6, 5)]))

L(lid(-109, -95, -45, -11, 16.0))  # over the sluice, clear of a boost off the gate itself

# ---------------------------------------------------------------- PUMP GALLERY
# The tether is the room's reward: it sits in a niche in the far wall behind a
# panel that drops when the fight is won, and taking it is what opens the doors,
# so nobody walks out of here without it.
L(room(-80, -70, 64, 52, h=15, doors=[('s', -22, 6, 5), ('e', -2, 8, 6), ('e', 6.5, 1.6, 15),
                                      ('n', 24, 4, 4)]))
# Cover, kept off the line from the doorway to the weaver and its charges, so
# the room's whole point is in sight from the door.
for cx, cz, w, d, hh in [(-106, -62, 10, 10, 3.6), (-70, -52, 12, 8, 3.6),
                         (-104, -82, 9, 12, 4.4), (-58, -76, 10, 10, 3.6),
                         (-76, -90, 12, 8, 3.6)]:
    L(box(cx, 1, cz, w, hh, d, 'block', 'magenta'))
L(dict(p=[-56, 1, -96.5], s=[4, 4, 1], mat='wall', id='tethernook'))
L(box(-56, 0, -98.5, 4, 1, 5, 'block'))                            # niche floor, under the doorway too
L(box(-56, 1, -101.5, 6, 4, 1, 'wall', 'magenta'))                 # back
L(box(-58.5, 1, -99, 1, 4, 4, 'wall', 'magenta'))                  # sides
L(box(-53.5, 1, -99, 1, 4, 4, 'wall', 'magenta'))
L(box(-56, 5, -99.5, 6, 11, 5, 'wall', 'magenta'))                 # solid to the wall tops

# ---------------------------------------------------------------- JUNCTION
# Two ways on: the sealed amber gate ahead, and the spillway to the east. The
# gate is met first from every approach, which is the point of putting it here.
L(room(-28, -94, 40, 60, h=18, doors=[('w', 14, 32, 18), ('n', 0, 8, 6),
                                      ('e', -16, 8, 6), ('e', 22, 8, 6)]))
for cx, cz, w, d, hh in [(-40, -108, 8, 8, 3.4), (-16, -100, 9, 9, 3.4)]:
    L(box(cx, 1, cz, w, hh, d, 'block', 'cyan'))

# ---------------------------------------------------------------- SPILLWAY
# No floor: everything here is a platform over the void.
L(room(28.5, -118, 71, 44, h=40, floor=False, doors=[('w', 0, 46, 40), ('e', 0, 46, 40)]))
PLATS = [( 3, -110, 20, 12,  0),   # P1, level with the junction deck
         (26, -110, 12, 12,  3),   # P2, double jump: 8m gap onto a 3m rise
         (46, -114, 12, 12, 11),   # P3, tether only from here on
         (44, -130, 12, 12, 18),   # P4
         ]
for cx, cz, w, d, y in PLATS:
    L(box(cx, y, cz, w, 1.0, d, 'block', 'cyan', walk=True))

# ---------------------------------------------------------------- CATWALK
L(room(88, -122, 48, 36, h=20, y=25, floor=False, over=0, doors=[('w', -6, 8, 8), ('s', 0, 50, 20)]))
for cx, cz, w, d in [(71, -128, 14, 14), (84, -130, 12, 10),
                     (98, -117, 16, 28), (78.5, -109.5, 23, 13)]:
    L(box(cx, 25, cz, w, 1.0, d, 'block', 'amber', walk=True))
# Somewhere to get up out of the swarm. A narrow deck over a void is a bad
# place to learn that mites cannot climb.
L(box(96, 26, -128, 6, 2.6, 6, 'block', 'cyan'))

# ---------------------------------------------------------------- CASCADE
# Staged drops back to the deck. Kerbs, not walls: they read as an overflow
# channel and they stop a misjudged landing becoming a fall.
# The last tread before the deck is deliberately missing: the drop from the
# 11m tread to the deck is one-way, so the loop can only be walked in the
# direction it was designed for. Walk in from the return end and you reach the
# bottom of the cascade, look up, and have to go and find the tether.
STEPS = [(88, -99.5, 20, 7, 25), (88, -92.5, 20, 7, 20), (88, -85.5, 20, 7, 15),
         (88, -78.5, 20, 7, 10)]
for cx, cz, w, d, y in STEPS:
    L(box(cx, y, cz, w, 1.0, d, 'block', 'cyan', walk=True))
    L(box(cx - w/2 - 0.3, y + 1.0, cz, 0.6, 1.1, d, 'wall', 'magenta'))
    L(box(cx + w/2 + 0.3, y + 1.0, cz, 0.6, 1.1, d, 'wall', 'magenta'))
# The deck at the bottom. Its kerbs run along the open ends rather than the
# sides, where a lone stub of wall beside the doorway would read as a mistake.
L(box(81, 0, -64.0, 34, 1.0, 8, 'block', 'cyan', walk=True))
L(box(81, 1.0, -68.3, 34, 1.1, 0.6, 'wall', 'magenta'))
L(box(81, 1.0, -59.7, 34, 1.1, 0.6, 'wall', 'magenta'))

# ---------------------------------------------------------------- RETURN
# 10 high, not 8: from the cascade deck's kerb (2.1) a scatter boost reaches an
# 8m wall head, and from there the cascade's last step - the one-way drop
# beaten from below, and the amber key without the tether.
L(room(28.5, -72, 71, 16, h=10, doors=[('e', 4.5, 7, 5), ('w', 0, 18, 10)]))   # west end open full height: the junction's wall is the wall

# ---------------------------------------------------------------- CORE APPROACH
# 18 high, to match the junction, rather than 16 with a cap along the west wall:
# a cap would bury this wall's top trim with its sides flush, a flickering line.
L(room(-28, -146, 40, 44, h=18, doors=[('s', 0, 8, 6), ('w', -4, 6, 5), ('n', 0, 8, 7)]))
for cx, cz, w, d, hh in [(-40, -134, 8, 8, 3.4), (-16, -156, 9, 9, 3.4)]:
    L(box(cx, 1, cz, w, hh, d, 'block', 'cyan'))

# ---------------------------------------------------------------- ANTECHAMBER
L(room(-28, -182, 40, 28, h=22, over=0, doors=[('s', 0, 8, 7), ('n', 0, 8, 7)]))

# ---------------------------------------------------------------- CYAN SPUR
# No doorway west into the shaft: it led only to the drop, and the way in is the
# tether, over the wall. An arrow up the wall says so.
L(room(-68, -150, 40, 20, h=9, doors=[('e', 0, 6, 5)]))
# The shaft: no floor, one ledge, one anchor. Step in without the tether and
# you fall into the void.
L(room(-104, -150, 32, 28, h=26, floor=False, doors=[('e', 0, 30, 26)]))
L(box(-104, 13, -150, 16, 1.0, 16, 'block', 'cyan', walk=True))   # key ledge

# ---------------------------------------------------------------- CORE
L(room(-6, -232, 108, 72, h=22, doors=[('s', -22, 8, 7)]))
for cx, cz, w, d, hh in [(-34, -212, 10, 10, 2.8), (20, -214, 11, 9, 2.8),
                         (-30, -246, 12, 10, 3.2), (28, -248, 10, 10, 3.2),
                         (0, -228, 9, 9, 2.4)]:
    L(box(cx, 1, cz, w, hh, d, 'block', 'cyan'))
L(box(-6, 1, -240, 12, 1.4, 12, 'block', 'amber', walk=True))     # artifact plinth

LEVEL = {
 'id':'act1-2', 'name':'SECTOR 1-2', 'subtitle':'THE RESERVOIR', 'act':1,
 'floor': False, 'floorY': 0,
 'quietLoad': True,

 'loadout':['pulse','scatter','rail'],
 'spawn':{'p':[0,1,136],'yaw':0},
 'hazards':[{'t':'void','below':-14},
            {'t':'burner','p':[-88,4,-62],'s':[10,6,10],'dmg':22,'period':3.2,'duty':1.2},
            {'t':'burner','p':[-64,4,-66],'s':[10,6,10],'dmg':22,'period':2.8,'duty':1.2},
            {'t':'burner','p':[-100,4,30],'s':[8,6,8],'dmg':20,'period':3.6,'duty':1.1},
            {'t':'burner','p':[-96,4,4],'s':[8,6,8],'dmg':20,'period':2.9,'duty':1.2}],
 'geometry': G,
 'doors':[
   {'id':'d_tank',  'p':[-56,1,97],'s':[2.4,5,6],'lock':'script','open':True},
   {'id':'d_sluice','p':[-102,1,-12],'s':[6,6,2.4],'lock':'script'},
   {'id':'d_pumpN', 'p':[-102,1,-43.5],'s':[6,5,1.2],'lock':'script','open':True},
   {'id':'d_pumpE', 'p':[-47.5,1,-72],'s':[1.2,6,8],'lock':'script','open':True},
   # one wall here, not two back to back, which a 2.4m slab would stick out
   # past, its top lip's cap hanging in the air on the far side
   {'id':'d_spill', 'p':[-7.5,1,-110],'s':[1.2,6,8],'lock':'script','open':True},
   {'id':'d_amber', 'p':[-28,1,-124],'s':[8,6,2.6],'lock':'amber'},
   {'id':'d_cyan',  'p':[-28,1,-168],'s':[8,7,2.6],'lock':'cyan'},
   {'id':'d_core',  'p':[-28,1,-196],'s':[8,7,2.6],'lock':'script','open':True,'boss':True},
 ],
 'keys':[{'colour':'amber','p':[100,27.4,-112],
          # Saves last, after the ambush is on the books: a death from here
          # keeps the turret and lancers you already killed dead, and brings
          # back only the ambush, not all three fights at once. The pad is past
          # the key, clear of where the ambush springs.
          'do':[{'a':'spawn','enemies':[{'kind':'mite','n':7,'p':[96,27.0,-120]},
                                        {'kind':'rusher','n':2,'p':[84,27.2,-110]}]},
                # The climb's door shuts the moment the key is yours, and only
                # then: before it the climb is free to come and go, so nobody is
                # ever shut out of it without the key, and after it the way on is
                # the cascade. Keys survive a death and replay what they did, so
                # it stays shut after a respawn.
                {'a':'seal','door':'d_spill'},
                {'a':'checkpoint','p':[100,26,-106]}]},
         {'colour':'cyan', 'p':[-110,15.4,-156]}],
 'anchors':[{'p':[46,17,-114]},    # onto P3
            {'p':[44,24,-130]},    # onto P4
            {'p':[71,31,-128]},    # onto the catwalk - the longest reel here
            {'p':[-104,19,-150]}],  # onto the cyan ledge, up the shaft
 'weapons':[{'id':'tether','p':[-56,2.6,-99],
             'brief':{'title':'TETHER RECOVERED',
                      'sub':'Fire it at an anchor to pull yourself there. Press {jump} to let go and keep your speed.'}}],
 'nodes':[{'p':[-131,9.8,12],'label':'SLUICE GATE OPEN',
           'do':[{'a':'open','door':'d_sluice'},
                 {'a':'spawn','enemies':[{'kind':'sentinel','n':2,'p':[-110,4.6,4]},
                                         {'kind':'rusher','n':3,'p':[-100,2.2,14]}]}]}],
 'enemies':[],
 # blast marks: by the tank's tallest block, where the mites cannot follow you up,
 # and by the sluice hall's block, the one place high enough to see the conduit
 'marks':[{'p':[-8,1,100.5],'r':1.2}, {'p':[-105.9,1,17.7],'r':1.0}],
 'signs':[{'p':[-87.97,7.4,-150],'face':'x','s':[2.6,3.2],'arrow':'up'}],
 'checkpoints':[{'p':[0,1,136]},{'p':[0,1,110]},{'p':[-76,1,97]},
                {'p':[-106,1,28]},{'p':[-102,1,-40]},{'p':[-51,1,-72]},
                {'p':[-28,1,-70]},{'p':[6,1,-110]},{'p':[46,12,-114]},
                {'p':[88,26,-110]},{'p':[100,26,-106]},{'p':[88,11,-78.5]},{'p':[-3,1,-72]},{'p':[-28,1,-130]},{'p':[-86,1,-150]},{'p':[-28,1,-176]},
                {'p':[-14,1,-230]}],   # set by the boss fight, at the moment it is won

 'triggers':[
  {'on':'enter','vol':{'p':[0,5,136],'s':[26,10,24]},'do':[
    {'a':'brief','title':'SECTOR 1-2 · THE RESERVOIR',
     'sub':'The foundry&rsquo;s coolant reservoir, drained dry. The sluices are jammed shut.'},
    {'a':'checkpoint','p':[0,1,136]}]},
  # tank one: the swarm. Wide ground, weak enemies, a lot of them.
  {'on':'enter','vol':{'p':[0,6,104],'s':[112,14,20]},'do':[
    {'a':'brief','title':'SWARM',
     'sub':'Mites are weak alone but deadly in numbers. They can&rsquo;t climb.'},
    {'a':'seal','door':'d_tank'},
    {'a':'spawn','enemies':[{'kind':'mite','n':9,'p':[0,2.0,76]},
                            {'kind':'rusher','n':3,'p':[-20,2.2,68]}]},
    {'a':'spawn','enemies':[{'kind':'mite','n':7,'p':[24,2.0,60]},
                            {'kind':'drone','n':3,'p':[-30,3.6,62]}]},
    {'a':'checkpoint','p':[0,1,110]},
    {'a':'arena','onClear':[{'a':'open','door':'d_tank'},
                            # the pad is already past the gate, so it cannot be
                            # taken early - but saving it here is what stops a
                            # death in the doorway costing the whole swarm again
                            {'a':'checkpoint','p':[-76,1,97]},
                            {'a':'banner','title':'GATE UNSEALED','sub':''}]}]},
  {'on':'enter','vol':{'p':[-91,4,72],'s':[10,8,32]},'do':[
    {'a':'spawn','enemies':[{'kind':'rusher','n':3,'p':[-91,2.2,44]},
                            {'kind':'drone','n':2,'p':[-91,3.6,50]}]}]},
  # The sluice conduit is the way on, so it can't be shootable the moment you
  # walk in, or the whole room could be run past. The plate over it comes down
  # when the room is cleared - an arena rather than `need:'clear'`, so it is this
  # room's own hostiles that count and not a straggler left somewhere else.
  {'on':'enter','vol':{'p':[-106,5,20],'s':[40,12,24]},'do':[
    {'a':'spawn','enemies':[{'kind':'turret','n':1,'p':[-120,1.6,16],'fixed':True},
                            {'kind':'drone','n':3,'p':[-100,3.6,8]}]},
    {'a':'checkpoint','p':[-106,1,28]},
    {'a':'arena','onClear':[{'a':'reveal','panel':'sluice'}]}]},
  # pump gallery: the weaver holds the room, and everything in it is tougher
  # while it lives. Placed at the back so the player has to push in to reach it.
  # The fight starts at the doorway, so it is all in view the moment you look
  # in; started deeper, the room could be skirted half-way round first.
  {'on':'enter','vol':{'p':[-102,5,-38],'s':[12,10,10]},'do':[
    {'a':'brief','title':'WEAVER',
     'sub':'A weaver shields the enemies around it. Take it out first.'},
    {'a':'checkpoint','p':[-102,1,-40]},
    {'a':'spawn','enemies':[{'kind':'weaver','n':1,'p':[-88,5.2,-88]},
                            {'kind':'bulwark','n':2,'p':[-70,3.4,-70]},
                            {'kind':'turret','n':1,'p':[-108,1.6,-90],'fixed':True},
                            {'kind':'drone','n':4,'p':[-80,3.6,-80]}]},
    {'a':'arena','onClear':[{'a':'reveal','panel':'tethernook'}]}]},
  # deep enough in that the north door cannot shut on someone in it
  {'on':'enter','vol':{'p':[-80,6,-56],'s':[64,14,10]},'do':[
    {'a':'seal','door':'d_pumpN'},{'a':'seal','door':'d_pumpE'}]},
  {'on':'enter','need':'tether','vol':{'p':[-80,6,-73],'s':[64,14,58]},'do':[   # the niche too
    {'a':'open','door':'d_pumpN'},{'a':'open','door':'d_pumpE'},
    {'a':'checkpoint','p':[-51,1,-72]}]},
  # the catwalk: narrow, high, and covered from across the shaft
  {'on':'enter','vol':{'p':[74,30,-128],'s':[18,12,18]},'do':[
    {'a':'spawn','enemies':[{'kind':'lancer','n':2,'p':[100,29.8,-120]},
                            {'kind':'turret','n':1,'p':[70,26.6,-130],'fixed':True}]},
    {'a':'checkpoint','p':[88,26,-110]}]},
  # The step up at the mouth of the climb - the last ground anyone reaches
  # without the tether, and where the first anchor comes into view - not on
  # the platform above, which is on the far side of a reel.
  {'on':'enter','vol':{'p':[26,7,-110],'s':[18,12,16]},'do':[
    {'a':'brief','title':'ANCHOR','sub':'Tether anchors can only be reached with the <b>TETHER</b>.'}]},

  # The cascade's last step. The drop off it is one-way, so this pad can only be
  # reached by coming down the cascade - the right way round the loop, and
  # almost always with the key's ambush dealt with. Without it, someone who
  # walked the loop backwards would die in the main level and go back to the
  # key with the mites alive again.
  {'on':'enter','vol':{'p':[88,13,-78.5],'s':[20,6,7]},'do':[
    {'a':'checkpoint','p':[88,11,-78.5]}]},

  # arriving somewhere is an event too: the junction, the mouth of the climb,
  # the first platform, and each side of the two locked doors
  {'on':'enter','vol':{'p':[-28,4,-70],'s':[22,10,18]},'do':[
    {'a':'checkpoint','p':[-28,1,-70]}]},
  {'on':'enter','vol':{'p':[6,4,-110],'s':[18,10,14]},'do':[
    {'a':'checkpoint','p':[6,1,-110]}]},
  {'on':'enter','vol':{'p':[46,14,-114],'s':[18,14,18]},'do':[
    {'a':'checkpoint','p':[46,12,-114]}]},
  {'on':'enter','vol':{'p':[-28,4,-132],'s':[22,10,16]},'do':[
    {'a':'checkpoint','p':[-28,1,-130]}]},
  {'on':'enter','vol':{'p':[-28,4,-178],'s':[22,10,16]},'do':[
    {'a':'checkpoint','p':[-28,1,-176]}]},
  # The corridor's mouth, not its length: spanning all 70m, this fired at the
  # west end and saved a pad 36m further on, among the mites - the banner went
  # up with no pad in sight, and a death put you back beside them.
  {'on':'enter','vol':{'p':[0,5,-72],'s':[12,10,16]},'do':[
    {'a':'spawn','enemies':[{'kind':'rusher','n':4,'p':[44,2.2,-72]},
                            {'kind':'mite','n':5,'p':[54,2.0,-72]}]},
    {'a':'checkpoint','p':[-3,1,-72]}]},
  {'on':'enter','vol':{'p':[-44,5,-150],'s':[10,10,20]},'do':[
    {'a':'spawn','enemies':[{'kind':'bulwark','n':1,'p':[-56,3.4,-150]},
                            {'kind':'sentinel','n':2,'p':[-78,4.6,-146]},
                            {'kind':'lancer','n':1,'p':[-62,4.8,-156]}]},
    {'a':'checkpoint','p':[-86,1,-150]}]},
  # the core: a warden, and a weaver keeping it alive
  {'on':'enter','vol':{'p':[-6,6,-214],'s':[108,16,28]},'do':[
    {'a':'seal','door':'d_core'},
    {'a':'spawn','enemies':[{'kind':'warden','n':1,'p':[-6,5.4,-252]},
                            {'kind':'weaver','n':1,'p':[22,5.2,-236]},
                            {'kind':'bulwark','n':2,'p':[-26,3.4,-242]},
                            {'kind':'mite','n':8,'p':[-6,2.0,-246]}]},
    {'a':'arena','onClear':[{'a':'uncage'},
                            {'a':'open','door':'d_core'},
                            {'a':'checkpoint','p':[-14,1,-230]}]}]},
 ],
 'goal':{'t':'artifact','id':'core-a1-2','p':[-6,4.4,-240],'locked':True,'cage':2.6,'cageH':4.8},
}

# A door slab is thicker than the two walls it fills, so a strip of its top
# sticks out past the lintels at each edge. Land on that strip and the collision
# push-out lifts you clean onto the roof, over the gate. Making the slab flush instead puts its
# faces in the walls' own planes and flickers, so cap the strip: a block over
# the door's whole footprint, which swallows the two lintels as it goes.
for _d in LEVEL['doors']:
    if _d.get('boss'): continue          # the portal frame owns that opening
    _dx, _dy, _dz = _d['p']; _dw, _dh, _dd = _d['s']
    _ax = 0 if _dw < _dd else 2          # the slab's thin axis, through the wall
    _t = (_dw, None, _dd)[_ax]
    _proud = (_t - 2.0) / 2              # how far past the two 1m walls it sticks
    if _proud <= 0.01: continue
    for _sn in (-1, 1):
        _c = (_dx, 0, _dz)[_ax] + _sn * (1.0 + _proud / 2)
        _s = [_dw, 2.0, _dd]
        _s[_ax] = _proud
        _p = [_dx, _dy + _dh, _dz]
        _p[_ax] = round(_c, 3)
        L(box(_p[0], _p[1], _p[2], _s[0], _s[1], _s[2], 'wall'))

dedupe_walls(G)
unstitch_walls(G)
dedupe_floors(G)
hide_floor_edges(G)
L(box(-7.5, 0, -72, 1.0, 1.0, 7.0, 'block', walk=True))   # doorway slot, junction -> return
L(box(-7.5, 0, -110, 1.0, 1.0, 8.0, 'block', walk=True))  # doorway slot, junction -> spillway
drop_buried_trims(G)
for g in G:
    assert isinstance(g, dict) and 'p' in g and 's' in g, g
    assert all(isinstance(v, (int, float)) for v in g['p'] + g['s']), g
json.dump(LEVEL, open('levels/act1-2.json', 'w'), indent=1)
print('levels/act1-2.json: %d geometry pieces' % len(G))

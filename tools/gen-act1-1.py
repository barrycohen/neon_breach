#!/usr/bin/env python3
"""Act I, Sector 1-1: THE SPINE.

Laid out as one connected plan with no stacked walkable areas - the validator
uses a 2.5D height field, so a floor above a floor would hide the lower one and
the reachability proof would be worthless. Every zone shares a real edge with
the next; nothing connects corner to corner.

Zone plan (x, z, floor top):

  LANDING    -12..12    48..68     1     drop-in, quiet
  YARD       -40..40     0..48     1     wide open, first fight
  SIDEVAULT  -66..-48    6..26     1     AMBER KEY, off the ducts
  D1         -78..-40   26..32     1  |
  D2         -78..-72   -6..26     1  |  tight twisting ducts
  D3        -100..-72  -12..-6     1  |
  GALLERY   -140..-100 -60..-6   void   climb, CYAN KEY at the top
  PAD       -100..-88  -70..-60   17     dash-span landing
  FOUNDRY    -88..-30 -104..-64   17     wide open, hard fight, burners
  SPINE      -30..-10 -110..-60  17>2    tight descent, 5m drops
  CORE       -40..30  -170..-110   2     arena, artifact

Keys sit a long way from their doors, and both doors come after both keys, so
no route can strand the player behind one:

  AMBER key (sidevault, ~40m in)  ->  AMBER door (foundry exit, ~250m in)
  CYAN  key (gallery top)         ->  CYAN door (core entrance)

Drops in the spine are 5m, inside the 5.5m a double jump regains, so the
descent stays two-way.
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lvlbuild import box, room, pad, lid, dedupe_walls, dedupe_floors, hide_floor_edges, drop_buried_trims, unstitch_walls

G = []
def L(*items):
    for it in items:
        if isinstance(it, list): G.extend(it)
        else: G.append(it)

# ---------------------------------------------------------------- LANDING
L(room(0, 58, 24, 20, h=9, doors=[('n', 0, 8, 6)]))

# ---------------------------------------------------------------- YARD
L(room(0, 24, 80, 48, h=14, doors=[('s', 0, 8, 6), ('w', 5, 6, 5.5), ('e', -6, 7, 6)]))
# cover: a wide room needs something to break sightlines
for cx, cz, w, d, hh in [(-22, 36, 8, 8, 3.4), (18, 34, 10, 6, 3.4), (-6, 20, 7, 12, 4.2),
                         (24, 14, 8, 8, 3.4), (-26, 10, 12, 6, 3.4), (6, 6, 9, 7, 4.2)]:
    L(box(cx, 1, cz, w, hh, d, 'block', 'cyan'))

# ---------------------------------------------------------------- DUCTS
# Its east wall is the yard's own: a duct standing inside the yard would put
# its roof there as a ledge, and a boost from it would clear the yard wall.
L(room(-59.5, 29, 37, 6, h=5.5, walltrim=None, floor=False, doors=[('e', 0, 6, 5.5), ('n', -15.5, 6, 5)]))
L(box(-59, 0, 29, 38, 1.0, 6, 'block', 'cyan', walk=True))    # its floor runs on through the doorway
L(room(-75, 10, 6, 32, h=5.5, walltrim=None, doors=[('s', 0, 6, 5), ('n', 0, 6, 5)]))
L(room(-86, -9, 28, 6, h=5.5, walltrim=None, doors=[('s', 11, 6, 5), ('w', 0, 6, 5)]))

# Tiled lids over the duct chain - see gen-act1-2 for why they are not per-room
L(lid(-101, -71, -13, -5, 6.5))
L(lid( -79, -71,  -5, 25, 6.5))
L(lid( -79, -41,  25, 33, 6.5))

# ---------------------------------------------------------------- SIDEVAULT
L(room(49, 18, 18, 20, h=8, doors=[('w', 0, 7, 5)]))
L(box(49, 1, 18, 6, 1.6, 6, 'block', 'amber', walk=True))          # plinth under the key

# ---------------------------------------------------------------- GALLERY
# A shaft with no floor: everything below -12 is void. Platforms climb 1 -> 21.
# east face: the duct entry, and the open chasm the span crosses
L(room(-120, -33, 40, 54, h=30, floor=False, doors=[('e', 24, 6, 5), ('e', -27, 20, 24)]))
PLATS = [(-106,  -9, 14, 12,  0),   # entry ledge, level with the duct
         # Small platforms give almost no run-up, and a rise costs far more
         # reach than flat ground does - measured, not assumed. So: 3m rises,
         # 7-8m gaps, and 12m-square platforms to push off from.
         (-126, -13, 12, 12,  3),
         (-126, -33, 12, 12,  6),
         (-107, -33, 12, 12,  9),
         (-119, -52, 12, 12, 12)]   # CYAN KEY, and the launch for the span
                                    # - set back west so the span needs a dash
for cx, cz, w, d, y in PLATS:
    L(box(cx, y, cz, w, 1.0, d, 'block', 'cyan', walk=True))
# ledges for the two gallery turrets
L(box(-137.5, 5, -30, 6, 1.0, 6, 'block', 'magenta', walk=True))
L(box(-137.5, 11, -50, 6, 1.0, 6, 'block', 'magenta', walk=True))

# ---------------------------------------------------------------- PAD + FOUNDRY
L(pad(-78, -65, 14, 12, y=6))
L(room(-43, -84, 58, 40, h=16, y=6, doors=[('w', 17, 6, 6), ('e', 17, 6, 6), ('n', -21, 7, 6)]))
for cx, cz, w, d, hh in [(-58, -74, 9, 9, 3.6), (-30, -70, 11, 7, 3.6), (-46, -90, 8, 10, 4.4),
                         (-22, -86, 9, 9, 3.6), (-60, -96, 10, 8, 3.6)]:
    L(box(cx, 7, cz, w, hh, d, 'block', 'magenta'))

# Deep, with the key and its guard at the far end, so the rushers don't spawn
# a second away from the doorway.
L(room(-64, -120, 16, 32, h=10, y=6, doors=[('s', 0, 7, 6)]))
L(box(-64, 7, -128, 6, 1.4, 6, 'block', 'amber', walk=True))   # amber: the thing to do here
L(box(-60, 7, -116, 3.6, 1.4, 3.6, 'block', 'cyan'))        # cover - no taller, or a boost from it clears the wall

# ---------------------------------------------------------------- SPINE
L(room( -4, -65, 20, 10, h=16, y=6, over=0, ceiling=True, doors=[('w', -2, 6, 6), ('n', -6, 6, 6)]))
L(room(-10, -80, 8,  20, h=16, y=4, over=0, ceiling=True, doors=[('n', 0, 6, 6), ('s', 0, 6, 6)]))
L(room( -4, -95, 20, 10, h=16, y=2.5, over=0, ceiling=True, doors=[('s', -6, 6, 6), ('n', 4, 7, 6)]))
L(room( -4,-105, 20, 10, h=16, y=1, over=0, ceiling=True, doors=[('s', 4, 7, 6), ('n', 1, 8, 6)]))

# Each spine level is a 1m slab with nothing under it, so from the level below
# you see straight through the gap beneath the floor above. Skirt it down to
# the next deck. And a 2m drop is a wall to a rusher, which is why they piled
# up at the step: two shallow treads instead, inside the doorway.
# No trim on these: a skirt's top is covered by the floor it supports, so the
# strip is buried - except where it pokes out past the floor's edge, which is
# a sliver of neon standing in mid-air.
L(box( -4, 4,   -65, 20, 2.0, 10, 'block'))     # under SP1
L(box(-10, 2.5, -80,  8, 1.5, 20, 'block'))     # under SP2
L(box( -4, 1,   -95, 20, 1.5, 10, 'block'))     # under SP3
for cx, cz, w, base, top in [(-10, -70.5, 6, 4,   6.33), (-10, -71.5, 6, 4,   5.67),
                             (-10, -90.5, 6, 2.5, 4.5 ), (-10, -91.5, 6, 2.5, 4.0),
                             (  0,-100.5, 7, 1,   3.0 ), (  0,-101.5, 7, 1,   2.5)]:
    L(box(cx, base, cz, w, top-base, 1, 'block', 'cyan', walk=True))

# ---------------------------------------------------------------- CORE
L(room(-5, -140, 70, 60, h=20, y=1, doors=[('s', 1, 8, 7)]))
for cx, cz, w, d, hh in [(-26, -124, 9, 9, 3.6), (14, -126, 10, 8, 3.6),
                         (-24, -150, 11, 9, 4.4), (24, -152, 9, 9, 4.4)]:
    L(box(cx, 2, cz, w, hh, d, 'block', 'cyan'))
L(box(0, 2, -140, 12, 1.4, 12, 'block', 'amber', walk=True))        # artifact plinth

LEVEL = {
 'id':'act1-1', 'name':'SECTOR 1-1', 'subtitle':'THE SPINE', 'act':1,
 'floor': False, 'floorY': 0,
 'quietLoad': True,          # the opening briefing names the level

 'loadout':['pulse','scatter','rail'],
 'spawn':{'p':[0,1,62],'yaw':0},
 'hazards':[{'t':'void','below':-14},
            # foundry vents: the open ground is not all safe ground
            # clear of the cover blocks, and sitting on the deck (floor top 7)
            {'t':'burner','p':[-46,10,-76],'s':[10,6,10],'dmg':22,'period':3.0,'duty':1.2},
            {'t':'burner','p':[-36,10,-98],'s':[10,6,10],'dmg':22,'period':3.4,'duty':1.2}],
 'geometry': G,
 'doors':[
   # Each sits between two walls (the two rooms each build their own), so the
   # slab has to be thick enough to cover both or the gate leaks at the edge.
   {'id':'d_amber','p':[-40.5,1,29],'s':[1.2,5.5,6],'lock':'amber'},   # in the yard's one wall
   {'id':'d_cyan', 'p':[-14,7,-67],'s':[2.6,6,6],'lock':'cyan'},
   # the core gate stands open until the warden wakes, then seals the room
   {'id':'d_core', 'p':[-4,2,-110],'s':[8,7,2.6],'lock':'script','open':True,'boss':True},
 ],
 'keys':[{'colour':'amber','p':[49,3.4,18]},
         {'colour':'cyan', 'p':[-64,9.8,-128]}],
 'nodes':[],
 # Nothing is placed with the level. Two emplacements standing in the gallery
 # from the moment it loads read as two hostiles you cannot find, all the way
 # through the opening rooms.
 'enemies':[],
 # Nothing here is saved by standing on it. Each pad is set by the trigger for
 # arriving somewhere, or by the fight that has just been won - so a save always
 # means something that happened. The two key spurs get one each rather than
 # sending a death back up the spine.
 'checkpoints':[{'p':[0,1,62]},{'p':[0,1,40]},{'p':[44,1,22]},{'p':[-59,1,29]},
                {'p':[-106,1,-9]},{'p':[-119,13,-52]},{'p':[-78,7,-65]},
                {'p':[-64,7,-106]},{'p':[-4,2,-105]},
                # Dark until the fight is won, then set by the fight itself, so
                # dying between the last hostile and the core doesn't mean
                # winning the whole room a second time.
                {'p':[0,2,-132]}],   # set by the fight, at the moment it is won

 # No mid-level briefings. The tutorial teaches keys, doors and gaps; repeating
 # that at a run is just something in the way. One message on arrival naming the
 # place and the job, and one when the cage actually opens, because that is an
 # event the player has to know happened rather than a lesson.
 'triggers':[
  {'on':'enter','vol':{'p':[0,5,58],'s':[24,10,20]},'do':[
    {'a':'brief','title':'SECTOR 1-1 \u00b7 THE SPINE',
     'sub':'The foundry&rsquo;s main transit line. Its core is sealed behind two gates.'},
    {'a':'checkpoint','p':[0,1,62]}]},
  {'on':'enter','vol':{'p':[0,6,38],'s':[80,14,20]},'do':[
    {'a':'spawn','enemies':[{'kind':'drone','n':4,'p':[0,3.6,14]},
                            {'kind':'rusher','n':3,'p':[-14,2.2,10]}]},
    {'a':'checkpoint','p':[0,1,40]}]},
  {'on':'enter','vol':{'p':[49,4,18],'s':[18,8,20]},'do':[
    {'a':'spawn','enemies':[{'kind':'sentinel','n':2,'p':[49,4.6,22]}]},
    {'a':'checkpoint','p':[44,1,22]}]},
  {'on':'enter','vol':{'p':[-59,4,29],'s':[38,8,6]},'do':[
    {'a':'spawn','enemies':[{'kind':'rusher','n':3,'p':[-72,2.2,29]}]},
    {'a':'checkpoint','p':[-59,1,29]}]},
  {'on':'enter','vol':{'p':[-106,5,-9],'s':[18,12,16]},'do':[
    {'a':'spawn','enemies':[{'kind':'turret','n':1,'p':[-138.5,6.6,-30],'yaw':1.57,'fixed':True}]},
    {'a':'spawn','enemies':[{'kind':'turret','n':1,'p':[-138.5,12.6,-50],'yaw':1.57,'fixed':True}]},
    {'a':'checkpoint','p':[-106,1,-9]}]},
  {'on':'enter','vol':{'p':[-64,10,-80],'s':[46,14,32]},'do':[
    {'a':'spawn','enemies':[{'kind':'bulwark','n':2,'p':[-36,9.4,-84]},
                            {'kind':'lancer','n':2,'p':[-24,10.8,-76]},
                            {'kind':'turret','n':1,'p':[-20,7.6,-96],'fixed':True}]},
    {'a':'checkpoint','p':[-78,7,-65]}]},
  {'on':'enter','vol':{'p':[-64,10,-110],'s':[16,10,6]},'do':[
    {'a':'spawn','enemies':[{'kind':'rusher','n':2,'p':[-64,7.2,-132]},
                            {'kind':'drone','n':2,'p':[-64,9.6,-133]}]},
    {'a':'checkpoint','p':[-64,7,-106]}]},
  {'on':'enter','vol':{'p':[-4,9,-65],'s':[20,10,10]},'do':[
    {'a':'spawn','enemies':[{'kind':'rusher','n':2,'p':[-10,6.2,-80]},
                            {'kind':'drone','n':2,'p':[-4,6.1,-95]}]},
    {'a':'checkpoint','p':[-4,2,-105]}]},

  # the high ledge above the turret run, and the last ground before the core gate
  {'on':'enter','vol':{'p':[-119,16,-52],'s':[22,10,20]},'do':[
    {'a':'checkpoint','p':[-119,13,-52]}]},
  {'on':'enter','vol':{'p':[-5,6,-125],'s':[70,16,26]},'do':[
    {'a':'seal','door':'d_core'},
    {'a':'spawn','enemies':[{'kind':'warden','n':1,'p':[0,6.4,-152]},
                            {'kind':'bulwark','n':2,'p':[-12,4.4,-146]},
                            {'kind':'sentinel','n':2,'p':[16,5.6,-148]},
                            {'kind':'drone','n':4,'p':[0,4.6,-158]}]},
    {'a':'arena','onClear':[{'a':'uncage'},
                            {'a':'open','door':'d_core'},
                            {'a':'checkpoint','p':[0,2,-132]}]}]},  # uncage announces itself
 ],
 'goal':{'t':'artifact','id':'core-a1-1','p':[0,4.4,-140],'locked':True,'cage':2.6,'cageH':4.8},
}

# A door slab is thicker than the two walls it fills, so a strip of its top
# sticks out past the lintels at each edge. Land on that strip and the collision
# push-out lifts you clean onto the roof, over the gate. Making the slab flush
# instead puts its faces in the walls' own planes and flickers, so cap the strip: a block over
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

dedupe_walls(G)          # no two walls may run through each other
unstitch_walls(G)        # walls meeting at a T must not share a face plane
dedupe_floors(G)         # no two slabs sharing a top surface
hide_floor_edges(G)      # no floor rim flush with a wall face
# The rim tuck runs the length of an edge, but a doorway has no wall to hide
# behind, so it leaves a slot there. Fill that one span exactly - butting, not
# overlapping, or the tops would flicker against each other.
L(box(-14.0, 6, -67, 0.24, 1.0, 6, 'block', walk=True))
drop_buried_trims(G)     # no neon on a top nothing can see
for g in G:
    assert isinstance(g, dict) and 'p' in g and 's' in g, g
    assert all(isinstance(v,(int,float)) for v in g['p']+g['s']), g
json.dump(LEVEL, open('levels/act1-1.json','w'), indent=1)
print('levels/act1-1.json: %d geometry pieces' % len(G))

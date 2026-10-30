#!/usr/bin/env python3
"""Act I, Sector 1-3: THE DISPATCH.

An open hall of decks over a void, joined only by transfer platforms. No
corridors: the space reads from anywhere in it, which is the opposite of the
blind duct runs 1-1 and 1-2 are built from.

The locks are tracks. Four of the seven start dead, and bringing one live is
what opens a route - by clearing a deck, or by putting a rail round through a
switch housing's slot. The amber key is out over the void on a platform nothing
reaches but its own shuttle.

The route is a single chain, with one out-and-back for the key:

  MUSTER  -t1->  STACK EAST  -t2->  ANVIL  -t3->  STACK WEST  -t4->  NORTH QUAY
  NORTH QUAY  -tk->  KEY DECK  -tk->  back
  NORTH QUAY  -t5->  EAST QUAY  -t6->  GATE DECK  ->  THE CORE

  t1  dead until the muster deck is clear
  t2  dead until switch A, in the housing off the east stack
  t4  dead until switch B, off the west stack
  tk  dead until switch B as well - one switch, the whole north line

Colour carries one meaning and only one: **amber trim means it moves**. Decks
are cyan or magenta, their kerbs magenta, every platform amber.

No two decks are within a dash of each other. Everything is a ride.
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lvlbuild import box, room, dedupe_walls, dedupe_floors, hide_floor_edges, drop_buried_trims, unstitch_walls

G = []
def L(*items):
    for it in items:
        if isinstance(it, list): G.extend(it)
        else: G.append(it)

PW = 12                       # every platform is the same size, so a dock is a dock
DECKS = {}

def deck(name, cx, cz, w, d, y, trim='cyan', docks=(), over=1.2):
    """A deck over the void. Kerbs everywhere except where a platform docks -
    a kerb in a doorway is a lip to trip over. The x kerbs run long and the z
    kerbs butt into them, so the corners come out square.

    over=0 for a deck that butts onto a building instead of standing in open
    air: the corner overrun would otherwise push the kerb a few centimetres
    into the wall it meets, and the two undersides flicker along that seam."""
    DECKS[name] = dict(cx=cx, cz=cz, w=w, d=d, y=y)
    out = [box(cx, y, cz, w, 1.0, d, 'block', trim, walk=True)]
    if 'w' not in docks: out.append(box(cx-w/2-0.3, y+1.0, cz, 0.6, 0.6, d+over, 'wall', 'magenta'))
    if 'e' not in docks: out.append(box(cx+w/2+0.3, y+1.0, cz, 0.6, 0.6, d+over, 'wall', 'magenta'))
    if 'n' not in docks: out.append(box(cx, y+1.0, cz-d/2-0.3, w, 0.6, 0.6, 'wall', 'magenta'))
    if 's' not in docks: out.append(box(cx, y+1.0, cz+d/2+0.3, w, 0.6, 0.6, 'wall', 'magenta'))
    return out

def dock(name, side, along=0):
    """Where a platform has to sit to be flush with that edge of that deck -
    same height, edges touching, no overlap and no step."""
    k = DECKS[name]
    if side == 'e': return [k['cx']+k['w']/2+PW/2, k['y'], k['cz']+along]
    if side == 'w': return [k['cx']-k['w']/2-PW/2, k['y'], k['cz']+along]
    if side == 'n': return [k['cx']+along, k['y'], k['cz']-k['d']/2-PW/2]
    return              [k['cx']+along, k['y'], k['cz']+k['d']/2+PW/2]

def housing(cx, cz, y, face):
    """A switch in a sealed box out over the void. The only opening is a slot
    2.2m wide and 1.6m tall - too short to climb through - and an overhang below
    it cuts every line from deck level, so the shot only works from up on
    something. An earlier version walled only the slot's own width and left the
    rest of the face open, which meant the switch could simply be walked to."""
    W = D = 10; H = 14; SW, SH = 2.2, 1.6
    sy = y + 8
    fx = cx + face*(W/2 - 0.5)
    # No neon inside a sealed box. The deck's strip runs under its own walls,
    # where only the strip's edges show and they fight the wall faces.
    out  = [box(cx, y, cz, W, 1.0, D, 'block')]
    out += [box(cx - face*(W/2-0.5), y+1, cz, 1.0, H, D, 'wall')]
    for sz in (-1, 1):
        out += [box(cx, y+1, cz + sz*(D/2-0.5), W, H, 1.0, 'wall')]
    side = (D - SW)/2 - 0.5
    for sz in (-1, 1):
        out += [box(fx, y+1, cz + sz*(SW/2 + side/2), 1.0, H, side, 'wall')]
    out += [box(fx, y+1, cz, 1.0, sy-(y+1), SW, 'wall')]
    out += [box(fx, sy+SH, cz, 1.0, (y+1+H)-(sy+SH), SW, 'wall')]
    out += [box(fx + face*0.15, sy, cz, 0.7, SH, SW, 'dark', grate=True)]
    out += [box(cx + face*(W/2+2.0), y+6.6, cz, 4.0, 1.0, 8, 'wall', 'magenta')]
    out += [box(cx, y+1+H, cz, W, 0.6, D, 'wall')]
    return out

# ---------------------------------------------------------------- ARRIVAL
L(room(0, 88, 26, 24, h=10, over=0, doors=[('n', 0, 9, 7)]))

# ---------------------------------------------------------------- DECKS
L(deck('muster', 0, 40, 56, 40, 0, 'cyan', docks='es'))
for cx, cz, w, d, hh in [(-18, 50, 9, 9, 3.0), (16, 46, 10, 10, 3.0), (-6, 28, 11, 8, 3.6)]:
    L(box(cx, 1, cz, w, hh, d, 'block', 'magenta'))

L(deck('stackE', 100, 10, 44, 40, 7, 'magenta', docks='wn'))
L(box(112, 8, 10, 10, 4.2, 10, 'block', 'cyan'))          # the climb switch A needs

L(deck('anvil', 0, -60, 52, 44, 14, 'cyan', docks='ew'))
for cx, cz, w, d, hh in [(-16, -48, 10, 10, 3.0), (14, -52, 11, 9, 3.0), (-10, -72, 12, 9, 3.6)]:
    L(box(cx, 15, cz, w, hh, d, 'block', 'magenta'))

L(deck('stackW', -100, -30, 44, 40, 6, 'magenta', docks='en'))
L(box(-112, 7, -30, 10, 4.2, 10, 'block', 'cyan'))        # and the climb for switch B

L(deck('quayN', -70, -150, 50, 48, 10, 'cyan', docks='sne'))
for cx, cz, w, d, hh in [(-84, -136, 10, 10, 3.0), (-56, -164, 11, 11, 3.0)]:
    L(box(cx, 11, cz, w, hh, d, 'block', 'magenta'))

L(deck('keydeck', -80, -230, 18, 18, 10, 'magenta', docks='s'))

L(deck('quayE', 70, -150, 50, 48, 16, 'magenta', docks='wn'))
for cx, cz, w, d, hh in [(56, -136, 10, 10, 3.0), (84, -164, 11, 11, 3.0)]:
    L(box(cx, 17, cz, w, hh, d, 'block', 'cyan'))

# ---------------------------------------------------------------- THE CORE BLOCK
# How far the gate and everything behind it sit beyond the quays. The gap has
# to beat a glide: from a hook 28m off the quay a double jump, a dash and a
# scatter boost still cover about 60m of open air, so the gate deck has to
# start further out than that or the second hook is decoration. Pushing the
# whole block 35m south puts it 71m from the first hook and 40m from the
# second, which is the only window where one hook fails and two work.
SOUTH = -35.0
def sz(z): return z + SOUTH

L(deck('gate', 0, sz(-240), 40, 20, 0, 'cyan', docks='n', over=0))

# The amber gate is the front door of a building, not a wall standing on its own
# out in the open - and because the entry bay is enclosed, the boss gate behind
# it cannot be seen from the hall.
L(room(0, sz(-268), 40, 36, h=30, t=2.0, over=0, doors=[('s', 0, 9, 7), ('n', 0, 44, 30)]))

# The four weaver galleries run down both walls, split into a north and a south
# pair so the two on a side have their own ground and cannot slide into the same
# corner. 58m each with a 12m divider between them.
GAL = 58
L(room(0, sz(-356), 120, 140, h=30, doors=[('s', 0, 9, 7),
                                       ('n', 0, 44, 30),           # head-on to the core deck
                                       ('w', 35, GAL, 9), ('e', 35, GAL, 9),
                                       ('w', -35, GAL, 9), ('e', -35, GAL, 9)]))
for cx, cz, w, d, hh in [(-34, -336, 11, 11, 2.8), (32, -340, 12, 10, 2.8),
                         (-30, -396, 12, 11, 3.2), (34, -392, 11, 11, 3.2),
                         (0, -366, 10, 10, 2.4), (-6, -414, 12, 9, 2.8)]:
    L(box(cx, 1, sz(cz), w, hh, d, 'block', 'cyan'))

# Four weavers, walled into galleries down both sides of the hall. The grate
# stops a body and passes a rail round: nothing else in the room takes damage
# until they are picked off through it. They are not emplacements - give one a
# 16m cell and it sits in it, give it 58m and it runs the length of the wall
# keeping pace with you, which is the difference between a turret and a fight.
for _sx in (-1, 1):
    for _cz in (sz(-391), sz(-321)):
        _ax = _sx*68
        L(box(_ax, 0, _cz, 16, 1.0, GAL, 'block'))
        L(box(_ax + _sx*8.5, 1, _cz, 1.0, 12, GAL, 'wall'))
        for _sz in (-1, 1):
            L(box(_ax, 1, _cz + _sz*(GAL/2 + 0.5), 16, 12, 1.0, 'wall'))
        L(box(_sx*60.35, 1, _cz, 0.7, 8, GAL, 'dark', grate=True))
        # the lid stops at the hall wall's outer face rather than its inner one:
        # running it the last metre put its end face in the same plane as the
        # wall's, which flickers. The lintel above the grate covers the gap.
        L(box(_ax + _sx*0.5, 13, _cz, 15, 0.6, GAL, 'wall'))

# The core is out past the north wall on a deck nothing walks to. The approach
# runs straight up the hall, so the reel goes over the deck's edge rather than
# under it - an earlier version put it behind a side wall, where the line
# passed beneath the deck and ground against its underside until it timed out.
L(box(0, 13, sz(-445), 40, 1.0, 30, 'block', 'magenta', walk=True))
for _sx in (-1, 1):
    L(box(_sx*20.3, 14, sz(-445), 0.6, 1.5, 31.2, 'wall', 'magenta'))
L(box(0, 14, sz(-460.3), 41.2, 1.5, 0.6, 'wall', 'magenta'))

# A kerb across the hall's north doorway. Without it the mites walked out of
# the opening, drifted into the trench under the core deck and hung there to be
# picked off. It sits in the wall plane rather than inside the room - set back
# even a metre and they slip round its ends diagonally.
#
# Height is the whole trick. An enemy rides at floor + hover + bob, and it is
# only pushed out of a box while its centre is within half a radius of the box's
# top - so a low lip is stepped over, not walked into. A mite rides to 2.37 with
# a 0.46 radius, so the kerb has to top out above 2.14; 2.5 also catches rushers
# and leaves the sight line from the floor to the core anchor clear. The heavies
# ride higher and still pass over, which is what stops this reading as a wall.
L(box(0, 1.0, sz(-426.5), 44, 1.5, 1.0, 'wall', 'magenta'))

# ---------------------------------------------------------------- SWITCHES
L(housing(150, 10, 7, -1))      # switch A, well out over the void so the
L(housing(-150, -30, 6, +1))    # switch B - the angle needs the distance

T = lambda a, sa, b, sb, oa=0, ob=0: (dock(a, sa, oa), dock(b, sb, ob))
t1 = T('muster','e','stackE','w')
t2 = T('stackE','n','anvil','e')
t3 = T('anvil','w','stackW','e')
t4 = T('stackW','n','quayN','s')
tk = T('quayN','n','keydeck','s')
t5 = T('quayN','e','quayE','w')

def mover(mid, pair, period, start=True):
    m = {'id':mid, 'p':pair[0], 'to':pair[1], 's':[PW,1,PW],
         'period':period, 'mat':'block', 'trim':'amber'}
    if not start: m['start'] = False
    return m

LEVEL = {
 'id':'act1-3', 'name':'SECTOR 1-3', 'subtitle':'THE DISPATCH', 'act':1,
 'floor': False, 'floorY': 0,
 'quietLoad': True,

 'loadout':['pulse','scatter','rail','tether'],
 'spawn':{'p':[0,1,94],'yaw':0},
 'hazards':[{'t':'void','below':-14},
            {'t':'burner','p':[-20,4,sz(-312)],'s':[8,6,8],'dmg':22,'period':3.0,'duty':1.2},
            {'t':'burner','p':[20,4,sz(-312)],'s':[8,6,8],'dmg':22,'period':2.6,'duty':1.2},
            {'t':'burner','p':[-45,4,sz(-364)],'s':[8,6,8],'dmg':22,'period':3.4,'duty':1.2},
            {'t':'burner','p':[45,4,sz(-364)],'s':[8,6,8],'dmg':22,'period':2.9,'duty':1.2}],
 'geometry': G,

 'movers':[ mover('t1', t1, 10, False), mover('t2', t2, 16, False),
            mover('t3', t3, 13),        mover('t4', t4, 15, False),
            mover('tk', tk, 12, False), mover('t5', t5, 18, False) ],
 # Two hooks out over the void at quay height, one beyond the other. The gate
 # is 69m from the first and 38m from the second, so the first one strands you
 # and the second one lands you - see SOUTH above for why that window exists.
 'anchors':[{'p':[49,24,-202]},     # thrown from the quay's south lip
            {'p':[36,28,-230]},     # and on again, before the first lets go
            # The last reel of Act I. It has to hang high and short: the core
            # deck is 13m above the hall floor, so a hook out over the middle of
            # it puts the line through the deck's own underside - in range, aimed
            # dead at, and refused. From the doorway this one is 23m out at 60
            # degrees, which clears the deck's lip with 4m to spare.
            {'p':[0,24,sz(-432)]}],

 'doors':[
   {'id':'d_amber','p':[0,1,sz(-250)],'s':[9,7,2.4],'lock':'amber'},
   {'id':'d_core', 'p':[0,1,sz(-286)],'s':[9,7,2.6],'lock':'script','open':True,'boss':True},
 ],
 'keys':[{'colour':'amber','p':[-80,12.4,-230],
          'do':[{'a':'start','mover':'t5'},
                {'a':'banner','title':'EAST TRACK LIVE','sub':''}]}],

 'nodes':[
   {'p':[150,15.8,10],'label':'NORTH-WEST TRACK LIVE',
    'do':[{'a':'start','mover':'t2'},
          {'a':'spawn','enemies':[{'kind':'drone','n':3,'p':[100,10.6,10]},
                                  {'kind':'rusher','n':2,'p':[90,9.2,18]}]},
          {'a':'checkpoint','p':[100,8,-6]}]},
   {'p':[-150,14.8,-30],'label':'NORTH LINE LIVE',
    'do':[{'a':'start','mover':'t4'},
          {'a':'start','mover':'tk'},
          {'a':'spawn','enemies':[{'kind':'sentinel','n':2,'p':[-96,10.6,-38]}]},
          {'a':'checkpoint','p':[-100,7,-46]}]},
 ],
 'enemies':[],
 # blast marks by the blocks the two turrets stand on: a scatter jump is the way up
 'marks':[{'p':[105.8,8,9.8],'r':1.0}, {'p':[-105.8,7,-30.4],'r':1.0}],
 'checkpoints':[{'p':[0,1,94]},
                # Every deck has a pad where you land and a pad at the dock you
                # leave from. Nothing here is saved by standing on it - each is
                # set by the trigger for arriving, or by the fight or the switch
                # that frees the way on.
                {'p':[0,1,56]},   {'p':[24,1,40]},
                {'p':[82,8,10]},  {'p':[100,8,-6]},
                {'p':[22,15,-60]},{'p':[-22,15,-60]},   # the anvil
                {'p':[-82,7,-30]},{'p':[-100,7,-46]},
                {'p':[-70,11,-130]},{'p':[-70,11,-170]},{'p':[-49,11,-150]},
                {'p':[49,17,-150]},{'p':[70,17,-170]},  # east quay
                {'p':[0,1,sz(-234)]}, {'p':[0,1,sz(-266)]},
                {'p':[0,1,sz(-424)]}],   # set by the fight, at the moment it is won

 'triggers':[
  {'on':'enter','vol':{'p':[0,5,94],'s':[26,10,24]},'do':[
    {'a':'brief','title':'SECTOR 1-3 \u00b7 THE DISPATCH',
     'sub':'Nothing down here is joined up any more.'},
    {'a':'checkpoint','p':[0,1,94]}]},

  # no doors to seal, so the arena beat is a track that will not run until the
  # deck it leaves from is clear
  {'on':'enter','vol':{'p':[0,6,48],'s':[56,14,20]},'do':[
    {'a':'spawn','enemies':[{'kind':'sentinel','n':2,'p':[0,4.6,30]},
                            {'kind':'bulwark','n':1,'p':[-14,3.4,34]},
                            {'kind':'rusher','n':3,'p':[16,2.2,28]}]},
    {'a':'checkpoint','p':[0,1,56]},
    {'a':'arena','onClear':[{'a':'start','mover':'t1'},
                            {'a':'checkpoint','p':[24,1,40]},
                            {'a':'banner','title':'EAST TRACK LIVE','sub':''}]}]},

  {'on':'enter','vol':{'p':[100,12,10],'s':[44,14,40]},'do':[
    {'a':'spawn','enemies':[{'kind':'lancer','n':2,'p':[100,11.8,-4]},
                            {'kind':'turret','n':1,'p':[112,12.8,10],'fixed':True}]},
    {'a':'checkpoint','p':[82,8,10]}]},

  {'on':'enter','vol':{'p':[0,19,-60],'s':[52,16,44]},'do':[
    {'a':'spawn','enemies':[{'kind':'weaver','n':1,'p':[0,20.2,-74]},
                            {'kind':'bulwark','n':2,'p':[-12,18.4,-66]},
                            {'kind':'lancer','n':2,'p':[14,19.8,-70]},
                            {'kind':'drone','n':3,'p':[0,18.6,-68]}]},
    {'a':'checkpoint','p':[22,15,-60]}]},

  {'on':'enter','vol':{'p':[-100,11,-30],'s':[44,14,40]},'do':[
    {'a':'spawn','enemies':[{'kind':'turret','n':1,'p':[-112,11.8,-30],'fixed':True},
                            {'kind':'drone','n':3,'p':[-96,9.6,-38]}]},
    {'a':'checkpoint','p':[-82,7,-30]}]},

  {'on':'enter','vol':{'p':[-70,15,-136],'s':[50,16,16]},'do':[
    {'a':'spawn','enemies':[{'kind':'mite','n':9,'p':[-70,11.0,-164]},
                            {'kind':'rusher','n':2,'p':[-56,11.2,-160]}]},
    {'a':'checkpoint','p':[-70,11,-130]}]},

  {'on':'enter','vol':{'p':[60,21,-150],'s':[30,16,30]},'do':[
    {'a':'spawn','enemies':[{'kind':'lancer','n':2,'p':[84,18.8,-164]},
                            {'kind':'turret','n':1,'p':[56,17.6,-160],'fixed':True},
                            {'kind':'bulwark','n':1,'p':[70,18.4,-160]}]},
    {'a':'checkpoint','p':[49,17,-150]}]},

  # Leaving is its own event. Without a pad at the dock you go out by, dying on
  # the next deck drops you back at the last fight and makes you win it again.
  {'on':'enter','vol':{'p':[-22,17,-60],'s':[14,10,22]},'do':[
    {'a':'checkpoint','p':[-22,15,-60]}]},
  {'on':'enter','vol':{'p':[-70,13,-168],'s':[22,10,14]},'do':[
    {'a':'checkpoint','p':[-70,11,-170]}]},
  {'on':'enter','vol':{'p':[-51,13,-150],'s':[14,10,22]},'do':[
    {'a':'checkpoint','p':[-49,11,-150]}]},
  {'on':'enter','vol':{'p':[70,19,-168],'s':[26,10,14]},'do':[
    {'a':'checkpoint','p':[70,17,-170]}]},
  # across the tether chain, and through the amber door
  {'on':'enter','vol':{'p':[0,4,sz(-237)],'s':[36,10,18]},'do':[
    {'a':'checkpoint','p':[0,1,sz(-234)]}]},
  {'on':'enter','vol':{'p':[0,4,sz(-266)],'s':[36,10,22]},'do':[
    {'a':'checkpoint','p':[0,1,sz(-266)]}]},

  # deep enough in that the gate cannot shut on someone still in the doorway
  {'on':'enter','vol':{'p':[0,6,sz(-310)],'s':[116,16,36]},'do':[
    {'a':'seal','door':'d_core'},
    # 150 covers the hall from anywhere in any gallery. It went down to 85 to
    # shorten the links, and that turned out to buy a way past the fight: clear
    # the two at one end, walk the swarm to that end, and the survivors could
    # not reach it. The links are kept honest by drawing one per shielded enemy
    # instead, so the radius is free to do its job.
    {'a':'spawn','enemies':[{'kind':'weaver','n':1,'p':[-68,5.2,sz(-391)],'fixed':True,'weaveR':150},
                            {'kind':'weaver','n':1,'p':[68,5.2,sz(-391)],'fixed':True,'weaveR':150},
                            {'kind':'weaver','n':1,'p':[-68,5.2,sz(-321)],'fixed':True,'weaveR':150},
                            {'kind':'weaver','n':1,'p':[68,5.2,sz(-321)],'fixed':True,'weaveR':150}]},
    # the mites arrive first and the heavy things follow, so the room comes at
    # you in two waves without needing a second trigger
    {'a':'spawn','enemies':[{'kind':'mite','n':14,'p':[0,2.0,sz(-344)]},
                            {'kind':'warden','n':1,'p':[-22,5.4,sz(-372)],'hpMul':2.2},
                            {'kind':'warden','n':1,'p':[22,5.4,sz(-372)],'hpMul':2.2},
                            {'kind':'bulwark','n':2,'p':[0,3.4,sz(-352)]},
                            {'kind':'lancer','n':2,'p':[0,4.8,sz(-396)]}]},
    {'a':'arena','onClear':[{'a':'uncage'},
                            {'a':'open','door':'d_core'},
                            {'a':'checkpoint','p':[0,1,sz(-424)]},
                            {'a':'banner','title':'CORE UNSEALED','sub':''}]}]},
 ],
 'goal':{'t':'artifact','id':'core-a1-3','p':[0,15.4,sz(-445)],'locked':True,'cage':2.6,'cageH':4.8},
}

for _d in LEVEL['doors']:
    if _d.get('boss'): continue
    _dx, _dy, _dz = _d['p']; _dw, _dh, _dd = _d['s']
    _ax = 0 if _dw < _dd else 2
    _proud = ((_dw, None, _dd)[_ax] - 2.0) / 2
    if _proud <= 0.01: continue
    for _sn in (-1, 1):
        _s = [_dw, 2.0, _dd]; _s[_ax] = _proud
        _p = [_dx, _dy + _dh, _dz]
        _p[_ax] = round((_dx, 0, _dz)[_ax] + _sn*(1.0 + _proud/2), 3)
        L(box(_p[0], _p[1], _p[2], _s[0], _s[1], _s[2], 'wall'))

dedupe_walls(G); unstitch_walls(G); dedupe_floors(G); hide_floor_edges(G); drop_buried_trims(G)
for g in G:
    assert isinstance(g, dict) and 'p' in g and 's' in g, g
    assert all(isinstance(v, (int, float)) for v in g['p'] + g['s']), g
json.dump(LEVEL, open('levels/act1-3.json', 'w'), indent=1)
print('levels/act1-3.json: %d geometry pieces' % len(G))

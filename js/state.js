/* Shared mutable state. It imports nothing, so every other module can reach it
   without creating an import cycle. */

const game={
  state:'menu', wave:0, alive:0, gate:-1, queue:[], spawnT:0, inter:0, ending:false,
  score:0, combo:1, comboT:0, bestCombo:1, kills:0, shots:0, hits:0, time:0,
  inLevel:false,     // a campaign level is loaded, not the endless arena
  arenaLocked:false  // a room is watching itself: clearing it opens the way on
};

const marks=[];

const enemies=[], bullets=[], pickups=[];

/* Tether anchor points for the level currently loaded. Lives here rather than
   in level.js because weapons.js has to raycast against it, and level.js
   already imports weapons.js. */
const anchors=[];

/* Arc fixtures, for the same reason. A conduit is something the Arc powers and a
   Coil drains; each carries power()/drain() closures, set by level.js, so the
   weapon and the enemy can switch it without importing the level. A pylon only
   relays a chain onward. */
const conduits=[], pylons=[];

/* Storms, for the same reason: an Arc shot into one powers what is inside it,
   and weapons.js cannot import the level. Each carries its live box. */
const storms=[];
// molten pools, for anything that needs their surface: a Sunder round bursts on one
const moltens=[];

/* Breach panels, for the Sunder - each carries breakIt(), set by level.js. */
const breaches=[];
/* Holes a heavy boss keeps out of: floor plates it has crashed through. Each
   is {x0,x1,z0,z1}; the level adds them, enemies.js steers round them. */
const holes=[];
/* The level's kill zones (its `void` hazards, live: `off` switches them), so
   an enemy that goes over the edge into one dies too, rather than hovering
   somewhere below that nobody can reach while its fight waits on it. */
const voids=[];
/* Per-level switches the enemies read. `dronesFly`: over a deep drop a drone
   holds your height rather than sinking to the floor far below. */
const levelFlags={};

export {game, marks, enemies, bullets, pickups, anchors, conduits, pylons, storms, breaches, moltens, holes, voids, levelFlags};

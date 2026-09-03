// ===============================
// TOMBSTONE - this file was split on 27 August 2026
// ===============================
// `AFLP_LivingGear` was one object holding PF2e tables, Daggerheart items, and an
// engine, plus a header comment asserting that living bondage was a PF2e line.
// That was false - Daggerheart is where it was invented - and the conflation
// caused a run of bugs where a PF2e reading silently reached a DH item.
//
// It is now three files, loaded in this order by `index.js`:
//
//   ui/aflp-living-gear-core.js   the engine. No tables, no system knowledge.
//   ui/aflp-living-gear-pf2e.js   AFLP_LivingGear_PF - GRANTS, CURSES, TRAPS.
//   ui/aflp-living-gear-dh.js     AFLP_LivingGear_DH - GRANTS, KEEPS.
//
// This file is left in place ONLY so that a stale copy sitting in an installed
// module directory cannot quietly bind a second set of hooks. It defines nothing.
// Deleting it is safe once no build older than 27 Aug 2026 is in circulation.
console.warn("AFLP | ui/aflp-living-gear.js is a tombstone - see aflp-living-gear-{core,pf2e,dh}.js");

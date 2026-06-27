// ===============================
// AFLP System Resolver (system/index.js)
// ===============================
// Loads the adapter base and every per-system adapter, then selects the one
// matching the running game system and exposes it as AFLP.system. From here
// on, AFLP code calls AFLP.system.* for anything that touches the game system.
//
// Called once from the core init hook (index.js), after the AFLP namespace and
// schema exist and game.system is known.
// ===============================

window.AFLP = window.AFLP || {};

AFLP.resolveSystem = async function () {
  // Load the adapter base (side-effect module that assigns AFLP.SystemAdapter).
  await import("./adapter-base.js");

  const sysId = game.system?.id ?? "unknown";
  AFLP.SYSTEM_ID = sysId;

  let adapter;
  switch (sysId) {
    case "pf2e":
      await import("./pf2e-adapter.js");
      adapter = new AFLP.PF2eAdapter();
      break;
    default:
      console.warn(`AFLP | No adapter for system '${sysId}'; using safe base fallback. AFLP mechanics will be inert.`);
      adapter = new AFLP.SystemAdapter();
  }

  AFLP.system = adapter;
  console.log(`AFLP | System adapter resolved: ${adapter.id}`);
  return adapter;
};

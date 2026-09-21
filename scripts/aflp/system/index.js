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
  // CACHE-BUST BY MODULE VERSION, the same way index.js does for the ui files.
  // Browsers cache import() URLs and will not re-fetch an unchanged one across
  // reloads. The ui imports have carried `?v=<version>` for this reason; these
  // four did not, and it bit on 14 Sept 2026: an edit to `gearUpkeepPhrase`
  // reached the served file but NOT the running world - `fetch` showed the new
  // text while the live getter still returned the old string, across a reload.
  // Every adapter edit before that was reaching the world by luck.
  //
  // Same caveat as index.js: during active development keep DevTools > Network >
  // "Disable cache" ticked, since a same-version edit does not change this query.
  const _v = "?v=" + (game.modules.get("ardisfoxxs-lewd-pf2e")?.version ?? Date.now());

  // Load the adapter base (side-effect module that assigns AFLP.SystemAdapter).
  await import("./adapter-base.js" + _v);

  const sysId = game.system?.id ?? "unknown";
  AFLP.SYSTEM_ID = sysId;

  let adapter;
  switch (sysId) {
    case "pf2e":
    case "sf2e":  // Starfinder 2e is a PF2e-system fork; same adapter.
      await import("./pf2e-adapter.js" + _v);
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

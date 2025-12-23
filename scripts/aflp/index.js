export async function initAFLP() {
  if (window.AFLP) return;

  console.log("AFLP | Initializing core");

  window.AFLP = {
    FLAG_SCOPE: "world",
    UI: {},
  };

  // Shared schema / defaults
  await import("./schema.js");

  // UI class definitions (no rendering)
  await import("./ui/sexual-stats-dialog.js");

  // Prose for cumflation messages
  const { AFLP_PROSE } = await import("./ui/prose.js");
  window.AFLP_PROSE = AFLP_PROSE;

  console.log("AFLP | Ready");
}

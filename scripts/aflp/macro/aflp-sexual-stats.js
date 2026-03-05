// ===============================
// AFLP – Sexual Stats Macro
// ===============================
// - Opens the Sexual Stats dialog for selected tokens.
// - Displays current sexual stats, cum, arousal, cumflation, and lifetime metrics.
// - Supports multiple selected tokens; one dialog per actor.
// ===============================

(async () => {
  // Get all controlled tokens on the canvas
  const tokens = canvas.tokens.controlled;
  if (!tokens.length) {
    return ui.notifications.warn("Select at least one token.");
  }

  for (const token of tokens) {
    const actor = token.actor;
    if (!actor) continue;

    // Ensure all AFLP core flags exist for this actor
    if (window.AFLP?.ensureCoreFlags) {
      await window.AFLP.ensureCoreFlags(actor);
    } else {
      console.error("AFLP schema not loaded or ensureCoreFlags missing");
      continue;
    }

    // Check if the Sexual Stats dialog class is loaded
    if (!window.AFLP?.UI?.SexualStatsDialog) {
      ui.notifications.error("Sexual Stats UI not loaded. Make sure sexual-stats-dialog.js is included.");
      continue;
    }

    try {
      // Instantiate the Sexual Stats Dialog for this actor
      const dlg = new AFLP.UI.SexualStatsDialog(actor);

      // Load actor's sexual stats, cum, coomer, pregnancies, etc.
      await dlg.load();

      // Render the dialog for the user
      dlg.render();
    } catch (err) {
      console.error("Error opening AFLP Sexual Stats Dialog:", err);
      ui.notifications.error("Failed to open Sexual Stats dialog. See console for details.");
    }
  }
})();
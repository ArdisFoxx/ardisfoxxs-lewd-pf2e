// ===============================
// AFLP Macro — Session Zero Setup
// ===============================
// Opens the Session Zero setup dialog to configure AFLP settings
// for your campaign's Lewd Level.
// GM only.

if (!game.user.isGM) {
  ui.notifications.warn("Session Zero setup is for GMs only.");
  return;
}

if (typeof aflpShowSessionZero !== "function") {
  ui.notifications.warn("AFLR: Session Zero dialog not available. Is the module loaded?");
  return;
}

aflpShowSessionZero();

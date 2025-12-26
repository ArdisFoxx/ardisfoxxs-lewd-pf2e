// ===============================
// AFLP Core Bootstrap (index.js)
// ===============================
// Initializes the AFLP global object and loads essential modules:
// - Prevents double initialization
// - Sets up core global object with FLAG_SCOPE and UI container
// - Imports schema and UI definitions
// - Logs status to console for debugging
// ===============================

(async () => {
  // -------------------------------
  // Prevent double initialization
  // -------------------------------
  if (window.AFLP) return;

  console.log("AFLP | Initializing core");

  // -------------------------------
  // Core global object
  // -------------------------------
  window.AFLP = {
    FLAG_SCOPE: "world", // Scope used for storing actor flags
    UI: {},              // Container for UI class definitions (dialogs, windows, etc.)
  };

  // -------------------------------
  // Shared schema
  // -------------------------------
  // Loads AFLP schema definitions, items, and templates
  await import("./schema.js");

  // -------------------------------
  // UI class definitions
  // -------------------------------
  // Loads dialogs, forms, and other UI elements (e.g., SexualStatsDialog)
  await import("./ui/sexual-stats-dialog.js");  
  await import("./ui/cumflation.js");
  
  // -------------------------------
  // Ready log
  // -------------------------------
  console.log("AFLP | Ready");
})();

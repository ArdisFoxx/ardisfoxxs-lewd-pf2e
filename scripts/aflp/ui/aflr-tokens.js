// =============================================================================
// AFLR shared design tokens - the single source of the visual language.
//
// Built from the module mascot River's palette: gold (her makeup), purple (her
// hair), lavender-grey (her horns) and pale lavender (her skin), set on a dark
// violet ground. These are injected once as :root custom properties so every
// AFLR surface - the H-Scene cards, the character sheet, the condition UI -
// references the same tokens instead of carrying its own hard-coded colours.
//
// To restyle the whole platform, change a value here. No top-level import/export
// (loaded via dynamic import like the other UI files); injects on load and again
// on init in case the import resolves after init has already run.
// =============================================================================
(function () {
  const AFLR_TOKENS = `:root {
    /* Grounds and panels */
    --aflr-ground:    #0f0b14;                 /* dark violet-black base */
    --aflr-panel:     rgba(160,139,216,0.06);  /* subtle raised section */
    --aflr-panel-2:   rgba(160,139,216,0.11);  /* stronger raised section */
    --aflr-header-bg: #1c1228;                 /* title-bar fill */

    /* Text - River's skin/horns for emphasis/muted, plus a dim step */
    --aflr-text:       #e8dcfb;                /* pale lavender, emphasis */
    --aflr-text-muted: #bfaad3;                /* lavender-grey, body */
    --aflr-text-dim:   #8f7fb0;                /* dim labels, separators */

    /* Accents */
    --aflr-gold:    #f4b74c;                    /* River's makeup - primary accent */
    --aflr-purple:  #a08bd8;                    /* River's hair - secondary accent */
    --aflr-lavender:#dcc1f8;                    /* River's skin - light tint */

    /* Borders and tracks */
    --aflr-border:        rgba(160,139,216,0.25); /* purple-grey divider */
    --aflr-border-gold:   rgba(244,183,76,0.35);  /* gold-accented border */
    --aflr-track:         rgba(255,255,255,0.06); /* empty pip / bar track */
    --aflr-track-border:  rgba(160,139,216,0.28);

    /* Functional status colours (shared by bars + badges across surfaces) */
    --aflr-arousal:   #d8454a;                 /* arousal / heat - red */
    --aflr-arousal-2: #c02020;
    --aflr-horny:     #c0507f;                 /* horny - pink */
    --aflr-cum:       #9f86d8;                 /* cum / cumflation - purple */
    --aflr-dom:       #d4a64a;                 /* dominating - gold */
    --aflr-sub:       #e07a72;                 /* submitting / mind break - warm red */
    --aflr-denied:    #b49ae0;                 /* denied - light purple */
    --aflr-orgasm:    #50b882;                 /* climax - green */

    /* Type and shape */
    --aflr-serif: var(--font-primary, "Signika", "Bookmania", serif);
    --aflr-radius: 6px;
    --aflr-radius-sm: 3px;
    --aflr-shadow: 0 6px 28px rgba(0,0,0,0.55);
  }`;

  function inject() {
    try {
      if (typeof document === "undefined" || !document.head) return;
      let el = document.getElementById("aflr-tokens");
      if (!el) {
        el = document.createElement("style");
        el.id = "aflr-tokens";
        document.head.appendChild(el);
      }
      el.textContent = AFLR_TOKENS;
    } catch (e) {
      console.warn("AFLP | token injection failed:", e);
    }
  }

  // Inject now (covers dynamic import after init) and on init (covers early load).
  inject();
  if (typeof Hooks !== "undefined") Hooks.once("init", inject);

  // Expose the raw string so other code can reuse it if ever needed.
  window.AFLP = window.AFLP || {};
  window.AFLP.TOKENS = AFLR_TOKENS;
})();

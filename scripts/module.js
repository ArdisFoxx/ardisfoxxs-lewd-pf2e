// ===============================
// AFLP – Module Initialization (module.js)
// ===============================
// Core module script for AFLP system.
// Responsibilities:
// - Sets up socket communication for module-wide logging
// - Hooks into Foundry lifecycle events: init, setup, ready
// - Logs creation and updates of condition/effect items
// - Logs applied damage messages
// - Includes utility functions to extract detailed damage info
// Notes:
// - Fully compatible with all AFLP mechanics including cumflation
// - Damage extraction currently logs for recordkeeping; can be extended
// ===============================

import { setupSocket } from "./socket.js";

// -------------------------------
// Hook: Init
// -------------------------------
// Called once when Foundry initializes modules
Hooks.once("init", async function () {
  setupSocket();

  // Register AFLP custom traits so they appear in the trait selector on all
  // item types and show a description tooltip on mouseover. Must run in init
  // so the dictionaries exist before any item sheets open.
  const aflpTraits = {
    aphrodisiac: {
      label: "Aphrodisiac",
      description: "This item has the aphrodisiac trait, causing heightened arousal and susceptibility to sexual influences in those who consume or are exposed to it."
    },
    bondage: {
      label: "Bondage",
      description: "This item has the bondage trait, used to restrain or bind a creature. Items with this trait interact with the Bondage Princess kink and related AFLP mechanics."
    },
    sexual: {
      label: "Sexual",
      description: "This item has the sexual trait, marking it as inherently erotic in nature. Items with this trait interact with AFLP arousal, kink, and scene mechanics."
    },
  };

  // PF2e stores trait labels in category-specific dicts and descriptions in a shared dict.
  // We inject into every category to ensure the traits appear regardless of item type.
  const traitDicts = [
    "actionTraits", "featTraits", "equipmentTraits", "consumableTraits",
    "spellTraits", "weaponTraits", "armorTraits", "hazardTraits",
  ];
  for (const [key, { label, description }] of Object.entries(aflpTraits)) {
    for (const dict of traitDicts) {
      if (CONFIG.PF2E?.[dict]) CONFIG.PF2E[dict][key] = label;
    }
    if (CONFIG.PF2E?.traitDescriptions) CONFIG.PF2E.traitDescriptions[key] = description;
  }
});

// -------------------------------
// Hook: Ready
// -------------------------------
// Called after Foundry finishes loading world data
Hooks.once("ready", async function () {
  // -------------------------------
  // Track creation of conditions/effects
  // -------------------------------
  Hooks.on("preCreateItem", async (item) => {
    if (item.type !== "condition" && item.type !== "effect") return;
    logEffect(item);
  });

  // Track updates to conditions/effects with badge or value changes
  Hooks.on("updateItem", async (item, changes, _diff, userid) => {
    if (item.type !== "condition" && item.type !== "effect") return;
    if (userid !== game.user.id) return;
    if (isNaN(changes?.system?.badge?.value) && isNaN(changes?.system?.value?.value)) return;
    logEffect(item);
  });

  // Note: Damage-based Lovense events are intentionally removed in AFLP 5.0.
  // Arousal is now a discrete flag system, not tied to HP damage.
  // Arousal events (low/medium/high/cum/edge) are emitted by aflp-lovense.js.

  // -------------------------------
  // Helper: Log an effect item
  // -------------------------------
  // Conditions/effects to always skip (not sexual in nature)
  const LOVENSE_SKIP_SLUGS = new Set(["prone", "grabbed", "restrained", "unconscious",
    "blinded", "deafened", "slowed", "stunned", "sickened", "frightened", "dazzled",
    "off-guard", "encumbered", "quickened", "clumsy", "stupefied", "enfeebled",
    "fleeing", "immobilized", "paralyzed", "petrified", "fascinated"]);

  function logEffect(item) {
    const actor = item.actor;
    if (!actor) return;

    // Skip non-sexual PF2e conditions
    const slug = item.slug ?? item.system?.slug ?? "";
    if (LOVENSE_SKIP_SLUGS.has(slug)) return;

    // Check AFLP_Lovense per-event filtering if available
    if (window.AFLP_Lovense && !AFLP_Lovense.shouldEmit(slug, actor.name)) return;

    let itemName = item.name;
    if (item?.system?.badge?.value) {
      itemName += ` (${item?.system?.badge?.label || item?.system?.badge?.value})`;
    }
    const now = new Date();
    // GIFT mode: broadcast log line
    if (!window.AFLP_Lovense || AFLP_Lovense.useGift()) {
      logForEveryone(`${getFormattedDateTime(now)} ${actor.name}, ${itemName}`);
    }
    // Direct mode: fire toy directly (only GM to avoid multi-fire)
    if (window.AFLP_Lovense && AFLP_Lovense.useDirect() && game.user?.isGM) {
      AFLP_Lovense.emitCondition(actor, slug);
    }
  }

  // -------------------------------
  // Helper: Format date/time for logs
  // -------------------------------
  function getFormattedDateTime(now) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const timeString = now
      .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
      .replace(" ", "");

    return `[${month}/${day}/${year} - ${timeString}]`;
  }

  // -------------------------------
  // Damage extraction utilities (chasarooni special ≽^•⩊•^≼)
  // -------------------------------
  function getDamageList(rolls, split_type) {
    switch (split_type) {
      case "by-damage-type": return extractDamageInfoCombined(rolls);
      case "all": return extractDamageInfoAll(rolls);
      case "none":
      default: return extractDamageInfoSimple(rolls);
    }
  }

  function extractDamageInfoCombined(rolls) {
    return rolls.flatMap(
      (inp) =>
        inp?.terms?.flatMap(
          (term) => term?.rolls?.map((roll) => ({ type: roll.type, value: roll.total })) || []
        ) || []
    );
  }

  function extractDamageInfoAll(rolls) {
    return rolls.flatMap(
      (inp) => inp?.terms?.flatMap((term) => extractTerm(term)) || []
    );
  }

  function extractDamageInfoSimple(rolls) {
    return [{ type: "", value: rolls.total }];
  }

  function extractTerm(term, flavor = "") {
    let result = [];
    const termName = term.constructor.name;

    if (termProcessors[termName]) {
      result = termProcessors[termName](term, result, flavor);
    } else {
      console.error("Unrecognized Term when extracting parts", term);
      result.push({ value: term.total, type: term.flavor || flavor });
    }

    return result;
  }

  const termProcessors = {
    InstancePool: processInstancePool,
    DamageInstance: processDamageInstance,
    Grouping: processGrouping,
    ArithmeticExpression: processArithmeticExpression,
    Die: processDie,
    NumericTerm: processNumericTerm,
  };

  function processGrouping(term, result, flavor) {
    return result.concat(extractTerm(term.term, term.flavor || flavor));
  }

  function processInstancePool(term, result, flavor) {
    return result.concat(term.rolls.flatMap((roll) => extractTerm(roll, term.flavor || flavor)));
  }

  function processDamageInstance(term, result, flavor) {
    result = term.terms.flatMap((item) => extractTerm(item, term.types || flavor));
    const keepPersistent = !!term.options.evaluatePersistent;
    return result
      .filter((res) => (res?.type?.startsWith("persistent,") ? keepPersistent : true))
      .map((r) => ({ value: r.value, type: r.type.replace(/persistent,/g, "") }));
  }

  function processArithmeticExpression(term, result, flavor) {
    const operands = term.operands.map((op) => extractTerm(op, term.flavor || flavor)).flat();
    if (term.operator === "+") return result.concat(operands);
    if (term.operator === "-") {
      const [first, second] = operands;
      second.value = -second.value;
      return result.concat(first, second);
    }
    if (term.operator === "*") {
      const [first, second] = operands;
      return result.concat(...Array(second).fill(first));
    }
    return result;
  }

  function processDie(term, result, flavor) {
    return result.concat(term.results.map((dice) => ({ value: dice.result, type: term.flavor || flavor })));
  }

  function processNumericTerm(term, result, flavor) {
    result.push({ value: term.number, type: term.flavor || flavor });
    return result;
  }
});

// -------------------------------
// Global logging via socketlib
// -------------------------------
async function logForEveryone(msg) {
  socketlib.modules.get("ardisfoxxs-lewd-pf2e").executeForEveryone("logMessage", msg);
}

// ===============================
// AFLP Shared Schema (schema.js)
// ===============================
// - Core schema for AFLP module
// - Configures the flag system for use in AFLP macros and scripts
// - Ensures defaults for sexual stats, genitalia, cumflation, and cock types
// ===============================

// Ensure AFLP global exists
if (!window.AFLP) window.AFLP = {};

AFLP.BASE_CUM_BY_SIZE = {
  tiny: 1,
  sm: 2,
  med: 4,
  lg: 80,
  huge: 1600,
  grg: 32000
};

Object.assign(window.AFLP, {
  SCHEMA_VERSION: 1,
  FLAG_SCOPE: "world",

  // ===============================
  // Core items used in the module
  // ===============================
  items: {
    offspring: {
      slug: "offspring",
      sourceId: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.hoJfZXP5LDhFvKcT"
    },
    egg: {
      slug: "monster-egg",
      sourceId: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.sryUoZQDi1C5P4Fi"
    },

    // Per-hole cumflation effects (1–8)
    cumflationAnal: [
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.AB32KRRMMehRIYX0",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.EIpLOOsqHsX5K96Q",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.dQ6jJapX5ItSME7N",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.z5gR0uIUDVEstEqI",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.GzZVIA8flQ66SMkL",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.IX8TZPSJMmJT6QNC",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.eFPjwpmIXu5nvKiM",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.4xtlAan9Aoatr2Gz"
    ],
    cumflationOral: [
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.3ZM95d0mjhUeJsge",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.St4qxZrXSmNz07QO",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.K1UWpkCZb2nVLVXf",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.WvetoZhM6Jc3DEzw",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.03tDyXmS12BUzGb4",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.e9S89RjSUpE2EhZk",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.crrRExas4d2Mx9qm",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.OqDESxRW0zjuNt3L"
    ],
    cumflationVaginal: [
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.hpRVDUwTYgfLCiIv",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Wb3OIgbpgOzIQmQp",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.fpNnhypftzcwsD3T",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Nn1k1fCC1nE0yg07",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.MZdLB7XZAVAtZn54",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.MMMTnQXp9km4C5HT",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.bBtJA3B22ypwqvLq",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.iiKuzigPIJec7Bio"
    ],

    // Total cumflation effects (1–8)
    cumflationTotal: [
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.M5VbFEA7wikXbC4Q",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.QyHMpQ2pj2wcR91i",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.6P0rsmWx14MQXAEz",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.6qzG65g9NqSu9iVy",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.4jp8zG2TfRrT4y8T",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.li4Npu4XqhE04C8m",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.6dNLoCR1QpbKkZ7Z",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.daPFCWR10Ssrp4Mq"
    ],

    // Cum Slut total overrides (1–8)
    cumSlutTotal: [
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.SCS8b1rPtr8iHZwV",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.QQRDqOzJq7PM59bw",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.dtUe8d0ROUEacRGE",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.dpymEL6QzRqN3LcJ",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.R8remTSWla3YR2Va",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.lr0gqv7s7b9iUIPJ",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.2tUflRcpwq1iWvE6",
      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.1g4jNQNGGcHhhWEn"
    ]
  },

  // ===============================
  // Default genitalia flags
  // ===============================
  genitaliaDefaults: {
    pussy: false,
    cock: false
  },

  // ===============================
  // Default sexual stats
  // ===============================
  sexualDefaults: {
    lifetime: {
      oral: 0,
      vaginal: 0,
      anal: 0,
      facial: 0,
      gangbang: 0,
      cumUnits: 0,
      cumUnitsSpent: 0,
      cumReceived: 0,
      cumGiven: 0,
      mlReceived: { oral: 0, vaginal: 0, anal: 0, facial: 0 },
      timesImpregnated: 0,
      pregnancyHistory: {}
    },
    event: {
      oral: 0,
      vaginal: 0,
      anal: 0,
      facial: 0,
      gangbang: 0
    },
    titles: [],
    favorites: []
  },

  // ===============================
  // Default pregnancy template
  // ===============================
  pregnancyTemplate: {
    sourceUuid: "",
    sourceName: "",
    startedAt: 0,
    gestationTotal: 30,
    gestationRemaining: 30,
    offspring: 0,
    deliveryType: "live"
  },

  // ===============================
  // Cock type defaults
  // ===============================
  cockTypes: {
    cock: true,
    "cock-breeder": true,
    "cock-electrifying": true,
    "cock-fertile": true,
    "cock-flared": true,
    "cock-hemipenis": true,
    "cock-knot": true,
    "cock-ovidepositor": true,
    "cock-pacifying": true,
    "cock-paralyzing": true,
    "cock-slime": true
  },

  // ===============================
  // Default cumflation values
  // ===============================
  cumflationDefaults: { anal: 0, oral: 0, vaginal: 0 },

  // ===============================
  // Compute average total cumflation
  // ===============================
  cumflationTotal(actor) {
    const c = actor.getFlag(this.FLAG_SCOPE, "cumflation") ?? {};
    return Math.floor(((c.anal ?? 0) + (c.oral ?? 0) + (c.vaginal ?? 0)) / 3);
  },

  // ===============================
  // Utility: ensure a single flag exists
  // ===============================
  async ensureFlag(actor, path, value) {
    if (await actor.getFlag(this.FLAG_SCOPE, path) === undefined) {
      await actor.setFlag(this.FLAG_SCOPE, path, structuredClone(value));
    }
  },

  // ===============================
  // Ensure all core AFLP flags exist on an actor
  // ===============================
  async ensureCoreFlags(actor) {
    await this.ensureFlag(actor, "sexual", structuredClone(this.sexualDefaults));
    await this.ensureFlag(actor, "cum", { current: 0, max: 0 });
    await this.ensureFlag(actor, "coomer", { level: 0 });
    await this.ensureFlag(actor, "pussy", this.genitaliaDefaults.pussy);
    await this.ensureFlag(actor, "cock", this.genitaliaDefaults.cock);
    await this.ensureFlag(
      actor,
      "cockTypes",
      Object.fromEntries(Object.keys(this.cockTypes).map(k => [k, false]))
    );
    await this.ensureFlag(actor, "pregnancy", {});
    await this.ensureFlag(actor, "pregnancySourcesHistory", []);
    await this.ensureFlag(actor, "cumflation", structuredClone(this.cumflationDefaults));
    await this.ensureFlag(actor, "schemaVersion", this.SCHEMA_VERSION);
  },

  // ===============================
  // Recalculate cum volume (shared logic)
  // ===============================
  recalculateCum: async actor => {
    if (!actor) {
      console.warn("AFLP.recalculateCum called without actor");
      return null;
    }

    const FLAG = AFLP.FLAG_SCOPE;

    const coomer = (await actor.getFlag(FLAG, "coomer")) ?? { level: 0 };
    const size = actor.system?.traits?.size?.value ?? "med";

    const base =
      AFLP.BASE_CUM_BY_SIZE[size] ??
      AFLP.BASE_CUM_BY_SIZE.med;

    const max = base * (1 + (coomer.level ?? 0));

    await actor.setFlag(FLAG, "cum", { current: max, max });

    return { current: max, max };
  }

});
// ===============================
// AFLP Shared Schema
// ===============================

if (!window.AFLP) window.AFLP = {};

Object.assign(window.AFLP, {
  SCHEMA_VERSION: 1,
  FLAG_SCOPE: "world",

  items: {
    offspring: {
      slug: "offspring",
      sourceId: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Zr7icxzHhdd74K17"
    },
    egg: {
      slug: "monster-egg",
      sourceId: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.sryUoZQDi1C5P4Fi"
    }
  },

  genitaliaDefaults: {
    pussy: false,
    cock: false
  },

  sexualDefaults: {
    lifetime: {
      oral: 0,
      vaginal: 0,
      anal: 0,
      facial: 0,
      gangbang: 0,
      cumReceived: 0,
      cumGiven: 0,
      mlReceived: { oral: 0, vaginal: 0, anal: 0, facial: 0 },
      timesImpregnated: 0,
      impregnationSources: []
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

  pregnancyTemplate: {
    sourceId: "",
    sourceName: "",
    startedAt: 0,
    gestationTotal: 30,
    gestationRemaining: 30,
    offspring: 0,
    deliveryType: "live"
  },

  cockTypes: {
    cock: true,
    "cock-electrifying": true,
    "cock-flared": true,
    "cock-hemipenis": true,
    "cock-knot": true,
    "cock-pacifying": true,
    "cock-paralyzing": true,
    "cock-slime": true,
    "cock-ovidepositor": true
  },

  async ensureFlag(actor, path, value) {
    const existing = actor.getFlag(this.FLAG_SCOPE, path);
    if (existing === undefined) {
      await actor.setFlag(this.FLAG_SCOPE, path, structuredClone(value));
    }
  },

  async ensureCoreFlags(actor) {
    await this.ensureFlag(actor, "sexual", structuredClone(this.sexualDefaults));
    await this.ensureFlag(actor, "cum", structuredClone({ current: 0, max: 0 }));
    await this.ensureFlag(actor, "coomer", structuredClone({ level: 0 }));
    await this.ensureFlag(actor, "pussy", this.genitaliaDefaults.pussy);
    await this.ensureFlag(actor, "cock", this.genitaliaDefaults.cock);
    await this.ensureFlag(
      actor,
      "cockTypes",
      Object.fromEntries(Object.keys(this.cockTypes).map(k => [k, false]))
    );
    await this.ensureFlag(actor, "pregnancy", structuredClone({}));
    await this.ensureFlag(actor, "schemaVersion", this.SCHEMA_VERSION);
  }
});

// ===============================
// AFLP Titles / Achievements
// ===============================
// Defines all earnable titles, detection logic, and automation.
// Called from index.js. The AFLP_Titles object is global.

window.AFLP_Titles = {

  // -----------------------------------------------
  // Title registry
  // Each entry: { id, name, desc, detect(actor, sexual, history, cumflation, pregnancy) → bool }
  // detect() is called after every cum event to check if the title was newly earned.
  // Titles can also be manually toggled in edit mode.
  // -----------------------------------------------
  TITLES: [

    // ── Milestones ──────────────────────────────────────────────────────────
    {
      id: "first-time",
      name: "First Time",
      desc: "Had sex for the first time.",
      detect: (a, s, h) => h.length >= 1,
    },
    {
      id: "no-strings",
      name: "The Hookup",
      desc: "Had 10 or more encounters with no pregnancy.",
      detect: (a, s, h) => h.filter(e => !e.pregnancyResult).length >= 10,
    },
    {
      id: "afterglow-addict",
      name: "Afterglow Addict",
      desc: "Climaxed 20 or more times.",
      detect: (a, s) => (s.lifetime?.timesCummed ?? 0) >= 20,
    },
    {
      id: "deepthroater",
      name: "Deepthroater",
      desc: "Received oral sex 20 or more times.",
      detect: (a, s) => (s.lifetime?.oral ?? 0) >= 20,
    },
    {
      id: "backdoor-enthusiast",
      name: "Backdoor Enthusiast",
      desc: "Received anal sex 20 or more times.",
      detect: (a, s) => (s.lifetime?.anal ?? 0) >= 20,
    },
    {
      id: "facial-collector",
      name: "Facial Collector",
      desc: "Received 20 or more facials.",
      detect: (a, s) => (s.lifetime?.facial ?? 0) >= 20,
    },
    {
      id: "gangbang-queen",
      name: "Gangbang Queen",
      desc: "Been gangbanged 5 or more times.",
      detect: (a, s) => (s.lifetime?.gangbang ?? 0) >= 5,
    },
    {
      id: "well-used",
      name: "Well Used",
      desc: "Received sex in all three holes in a single encounter.",
      detect: (a, s, h) => h.some(e =>
        e.holes?.includes("oral") && e.holes?.includes("vaginal") && e.holes?.includes("anal")
      ),
    },
    {
      id: "total-slut",
      name: "Total Slut",
      desc: "Received sex 50 or more times total.",
      detect: (a, s) => {
        const l = s.lifetime ?? {};
        return (l.oral ?? 0) + (l.vaginal ?? 0) + (l.anal ?? 0) + (l.facial ?? 0) >= 50;
      },
    },
    {
      id: "glass-cannon",
      name: "Glass Bottom",
      desc: "Been creampied 50 or more times.",
      detect: (a, s) => ((s.lifetime?.vaginal ?? 0) + (s.lifetime?.anal ?? 0)) >= 50,
    },
    {
      id: "variety-is-spice",
      name: "Every-Hole Expert",
      desc: "Received sex in all four hole types (oral, vaginal, anal, facial).",
      detect: (a, s) => {
        const l = s.lifetime ?? {};
        return (l.oral ?? 0) > 0 && (l.vaginal ?? 0) > 0 && (l.anal ?? 0) > 0 && (l.facial ?? 0) > 0;
      },
    },
    {
      id: "legendary-hole",
      name: "Legendary Hole",
      desc: "Received sex 100 or more times total.",
      detect: (a, s) => {
        const l = s.lifetime ?? {};
        return (l.oral ?? 0) + (l.vaginal ?? 0) + (l.anal ?? 0) + (l.facial ?? 0) >= 100;
      },
    },
    {
      id: "power-bottom",
      name: "Power Bottom",
      desc: "Received more than 500 total acts across all holes.",
      detect: (a, s) => {
        const l = s.lifetime ?? {};
        return (l.oral ?? 0) + (l.vaginal ?? 0) + (l.anal ?? 0) + (l.facial ?? 0) >= 500;
      },
    },

    // ── Partners ────────────────────────────────────────────────────────────
    {
      id: "cum-bucket",
      name: "Cum Bucket",
      desc: "Received cum from 10 or more separate partners.",
      detect: (a, s, h) => h.length >= 10,
    },
    {
      id: "village-bicycle",
      name: "Village Bicycle",
      desc: "Received sex from 25 or more unique partners.",
      detect: (a, s, h) => {
        const unique = new Set(h.map(e => e.sourceUuid || e.sourceName));
        return unique.size >= 25;
      },
    },

    // ── Cumflation ──────────────────────────────────────────────────────────
    // Thresholds use ml (lifetime, never resets) so a single huge-creature load
    // doesn't trivially unlock everything. Fantasy mode: 1 unit = 250 ml.
    // Medium creature: ~500 ml/cum. Large: ~5,000 ml/cum. Huge: ~100,000 ml/cum.
    {
      id: "belly-full",
      name: "Cum-Stuffed",
      desc: "Received at least 10,000 ml of cum in a single hole over a lifetime (about 20 medium loads or 2 large loads).",
      detect: (a, s) => {
        const r = s.lifetime?.mlReceived;
        if (!r || typeof r !== "object") return false;
        return ["oral","vaginal","anal"].some(h => (r[h] ?? 0) >= 10000);
      },
    },
    {
      id: "stuffed-to-bursting",
      name: "Overflow Dump",
      desc: "Accumulated 40 or more overflow units in a single hole (been packed past maximum repeatedly).",
      detect: (a, s, h, cf, pf, cfo) => ["oral","vaginal","anal"].some(hole => (cfo[hole] ?? 0) >= 40),
    },
    {
      id: "overflowing",
      name: "Leaky",
      desc: "Exceeded Cumflation capacity (overflow triggered) at least once.",
      detect: (a) => {
        const cfo = a.getFlag(AFLP.FLAG_SCOPE, "cumOverflow") ?? {};
        return Object.values(cfo).some(v => v > 0);
      },
    },
    {
      id: "cum-toilet",
      name: "Cum Toilet",
      desc: "Received 50,000 ml or more of cum in total over a lifetime.",
      detect: (a, s) => {
        const r = s.lifetime?.mlReceived;
        if (!r || typeof r !== "object") return false;
        const total = Object.values(r).reduce((acc, v) => acc + (v ?? 0), 0);
        return total >= 50000;
      },
    },

    // ── Pregnancy ───────────────────────────────────────────────────────────
    {
      id: "baby-maker",
      name: "Baby Maker",
      desc: "Been impregnated 3 or more times.",
      detect: (a, s) => (s.lifetime?.timesImpregnated ?? 0) >= 3,
    },
    {
      id: "litter-bearer",
      name: "Litter Bearer",
      desc: "Given birth to 5 or more offspring in a single pregnancy.",
      detect: (a, s, h) => h.some(e => (e.pregnancyResult?.offspring ?? 0) >= 5),
    },
    {
      id: "brood-mother",
      name: "Brood Mother",
      desc: "Been impregnated 10 or more times.",
      detect: (a, s) => (s.lifetime?.timesImpregnated ?? 0) >= 10,
    },
    {
      id: "perpetually-pregnant",
      name: "Walking Womb",
      desc: "Been impregnated 20 or more times.",
      detect: (a, s) => (s.lifetime?.timesImpregnated ?? 0) >= 20,
    },
    {
      id: "egg-layer",
      name: "Egg Layer",
      desc: "Laid eggs from an oviposition pregnancy.",
      detect: (a, s, h) => h.some(e => e.pregnancyResult?.deliveryType === "egg"),
    },
    {
      id: "monster-mommy",
      name: "Monster Mommy",
      desc: "Carried a pregnancy from a monster or creature source.",
      detect: (a, s, h) => h.some(e =>
        e.pregnancyResult && e.pregnancyResult.offspring > 0 &&
        AFLP_Titles._isMonster(e.sourceName)
      ),
    },
    {
      id: "orc-breeder",
      name: "Orc Breeder",
      desc: "Been bred by an orc.",
      detect: (a, s, h) => h.some(e =>
        AFLP_Titles._nameContains(e.sourceName, ["orc", "half-orc", "half orc"]) &&
        e.pregnancyResult?.offspring > 0
      ),
    },

    // ── Conditions & Combat ─────────────────────────────────────────────────
    {
      id: "defeat-fetish",
      name: "Defeat Fetish",
      desc: "Sexually defeated 5 or more times.",
      detect: (a, s) => (s.lifetime?.timesDefeated ?? 0) >= 5,
    },
    {
      id: "mind-gone",
      name: "Mind Gone",
      desc: "Suffered Mind Break 3 or more times.",
      detect: (a, s) => (s.lifetime?.timesMindBroken ?? 0) >= 3,
    },
    {
      id: "size-queen",
      name: "Size Queen",
      desc: "Been with a Large or larger creature (giant, dragon, etc.).",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName,
        ["giant", "dragon", "ogre", "troll", "cyclops", "titan", "elephant", "dinosaur", "whale"]
      )),
    },
    {
      id: "beastmaster",
      name: "Beastmaster",
      desc: "Been with 5 different kinds of creatures.",
      detect: (a, s, h) => {
        const types = new Set(h.map(e => AFLP_Titles._creatureType(e.sourceName)).filter(Boolean));
        return types.size >= 5;
      },
    },

    // ── Creature-Specific (A–Z) ─────────────────────────────────────────────
    {
      id: "celestial-blessed",
      name: "Celestially Blessed",
      desc: "Been intimate with a celestial being.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["angel", "azata", "archon", "agathion", "celestial", "deva", "planetar", "solar"])),
    },
    {
      id: "demon-consort",
      name: "Demon's Consort",
      desc: "Been with a demon or devil.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["demon", "devil", "fiend", "succubus", "incubus", "imp", "balor", "pit fiend"])),
    },
    {
      id: "dragon-hoard",
      name: "Dragon's Hoard",
      desc: "Been claimed by a dragon.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["dragon", "drake", "wyvern"])),
    },
    {
      id: "giant-problem",
      name: "Giant's Toy",
      desc: "Been with a giant.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["giant", "ogre", "ettin", "cyclops", "titan"])),
    },
    {
      id: "goblin-groupie",
      name: "Goblin Groupie",
      desc: "Been with 3 or more goblins.",
      detect: (a, s, h) => h.filter(e => AFLP_Titles._nameContains(e.sourceName, ["goblin"])).length >= 3,
    },
    {
      id: "plant-based",
      name: "Garden Slut",
      desc: "Been used by a plant creature.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["plant", "vine", "tendriculos", "vegepygmy", "mandragora", "leshy"])),
    },
    {
      id: "slime-time",
      name: "Slime Bucket",
      desc: "Been used by a slime or ooze.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["slime", "ooze", "jelly", "pudding", "gelatinous"])),
    },
    {
      id: "tentacle-toy",
      name: "Tentacle Toy",
      desc: "Been used by a creature with tentacles.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["tentacle", "aboleth", "octopus", "kraken", "cephalopod", "shoggoth", "tendriculos"])),
    },
    {
      id: "troll-lover",
      name: "Troll Lover",
      desc: "Been with a troll.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["troll"])),
    },
    {
      id: "undead-embrace",
      name: "Grave Warmer",
      desc: "Been with an undead creature.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["zombie", "skeleton", "vampire", "ghoul", "wight", "wraith", "lich", "revenant", "mummy"])),
    },
    {
      id: "wolf-pack",
      name: "Wolf Pack's Favourite",
      desc: "Been with a wolf, werewolf, or similar.",
      detect: (a, s, h) => h.some(e => AFLP_Titles._nameContains(e.sourceName, ["wolf", "werewolf", "warg", "gnoll"])),
    },
  ],

  // -----------------------------------------------
  // Helper: case-insensitive substring match
  // -----------------------------------------------
  _nameContains(sourceName, keywords) {
    if (!sourceName) return false;
    const lower = sourceName.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
  },

  // -----------------------------------------------
  // Helper: crude creature type bucketing from name
  // -----------------------------------------------
  _creatureType(name) {
    if (!name) return null;
    const n = name.toLowerCase();
    if (["dragon","drake","wyvern"].some(k => n.includes(k))) return "dragon";
    if (["demon","devil","fiend","succubus","incubus","imp"].some(k => n.includes(k))) return "fiend";
    if (["zombie","skeleton","vampire","ghoul","wight","lich"].some(k => n.includes(k))) return "undead";
    if (["orc","goblin","hobgoblin","bugbear","gnoll"].some(k => n.includes(k))) return "humanoid-goblinoid";
    if (["troll","giant","ogre","cyclops","titan"].some(k => n.includes(k))) return "giant";
    if (["wolf","warg","werewolf"].some(k => n.includes(k))) return "beast-canine";
    if (["slime","ooze","jelly","pudding"].some(k => n.includes(k))) return "ooze";
    if (["tentacle","aboleth","kraken","octopus"].some(k => n.includes(k))) return "aberration";
    if (["angel","azata","archon","celestial"].some(k => n.includes(k))) return "celestial";
    if (["plant","vine","leshy","tendriculos"].some(k => n.includes(k))) return "plant";
    return null;
  },

  // -----------------------------------------------
  // Helper: is the source name monster-ish?
  // (rough heuristic — non-PC names that match creature keywords)
  // -----------------------------------------------
  _isMonster(name) {
    if (!name) return false;
    return AFLP_Titles._creatureType(name) !== null;
  },

  // -----------------------------------------------
  // Check all titles for a given actor and award new ones.
  // Called at end of aflp-cum.js after saving state.
  // Returns array of newly-earned title ids.
  // -----------------------------------------------
  async checkAndAward(actor) {
    if (!AFLP.Settings.titlesAutomation) return [];

    const FLAG = AFLP.FLAG_SCOPE;
    const sexual     = structuredClone(actor.getFlag(FLAG, "sexual") ?? {});
    const history    = actor.getFlag(FLAG, "partnerHistory") ?? [];
    const cumflation = actor.getFlag(FLAG, "cumflation") ?? {};
    const cumOverflow = actor.getFlag(FLAG, "cumOverflow") ?? {};
    const pregnancy  = actor.getFlag(FLAG, "pregnancy") ?? {};

    const earned = new Set(sexual.titles ?? []);
    const newlyEarned = [];

    for (const title of AFLP_Titles.TITLES) {
      if (earned.has(title.id)) continue;
      try {
        if (title.detect(actor, sexual, history, cumflation, pregnancy, cumOverflow)) {
          earned.add(title.id);
          newlyEarned.push(title);
        }
      } catch(e) {
        console.warn(`AFLP | Title check error [${title.id}]:`, e);
      }
    }

    if (newlyEarned.length > 0) {
      sexual.titles = [...earned];
      await actor.setFlag(FLAG, "sexual", sexual);
      await AFLP_Titles._announceNewTitles(actor, newlyEarned);
    }

    return newlyEarned;
  },

  // -----------------------------------------------
  // Toast + chat message for newly earned titles
  // -----------------------------------------------
  async _announceNewTitles(actor, titles) {
    for (const title of titles) {
      // Foundry toast notification
      ui.notifications.info(
        `🏆 ${actor.name} earned the title: "${title.name}"`,
        { permanent: false, console: false }
      );

      // Chat card
      await ChatMessage.create({
        content: `
          <div style="
            border: 1px solid #c9a96e;
            border-radius: 4px;
            padding: 8px 12px;
            background: linear-gradient(135deg, rgba(201,169,110,0.08), rgba(201,169,110,0.02));
            font-family: var(--font-primary, serif);
          ">
            <div style="font-size:13px; font-weight:bold; color:#5a4a2a; margin-bottom:4px;">
              🏆 New Title Earned
            </div>
            <div style="font-size:15px; font-weight:bold; color:#191813; margin-bottom:4px;">
              ${actor.name} is now known as…
            </div>
            <div style="font-size:18px; font-weight:bold; color:#8a4a10; margin-bottom:6px;">
              "${title.name}"
            </div>
            <div style="font-size:12px; color:#555; font-style:italic;">
              ${title.desc}
            </div>
          </div>`,
        speaker: { alias: actor.name },
        flags: { "ardisfoxxs-lewd-pf2e": { titleAward: true } },
      });
    }
  },

  // -----------------------------------------------
  // Get all titles an actor currently holds
  // -----------------------------------------------
  getActorTitles(actor) {
    const held = new Set(actor.getFlag(AFLP.FLAG_SCOPE, "sexual.titles") ?? []);
    return AFLP_Titles.TITLES.filter(t => held.has(t.id));
  },

  // -----------------------------------------------
  // Manually set a title on/off (edit mode checkbox)
  // -----------------------------------------------
  async setTitle(actor, titleId, value) {
    const FLAG = AFLP.FLAG_SCOPE;
    const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? {});
    const titles = new Set(sexual.titles ?? []);
    if (value) titles.add(titleId); else titles.delete(titleId);
    sexual.titles = [...titles];
    await actor.setFlag(FLAG, "sexual", sexual);
  },
};

// -----------------------------------------------
// Passive hook: track timesDefeated and timesMindBroken whenever those
// conditions are applied to an actor by any means — spells, items, GM
// drag-and-drop, etc. AFLP_Arousal sets a debounce key via
// _setCounterDebounce() before it calls _applyCondition(), so cases
// handled by the arousal system are skipped here to avoid double-counting.
// -----------------------------------------------
Hooks.on("createItem", async (item, _options, _userId) => {
  // Only run on the GM client — one authoritative writer for flag data.
  if (!game.user.isGM) return;
  if (item.parent?.documentName !== "Actor") return;

  const actor    = item.parent;
  const FLAG     = AFLP.FLAG_SCOPE;
  // PF2e conditions carry their slug at item.slug (ConditionPF2e) or
  // item.system.slug. The sourceId links back to the compendium entry.
  const slug     = item.slug ?? item.system?.slug ?? "";
  const sourceId = item.sourceId ?? item.flags?.core?.sourceId ?? "";

  const isDefeated  = slug === "defeated"   || sourceId.includes(AFLP.conditions?.["defeated"]?.uuid   ?? "NOMATCH");
  const isMindBreak = slug === "mind-break" || sourceId.includes(AFLP.conditions?.["mind-break"]?.uuid ?? "NOMATCH");

  if (!isDefeated && !isMindBreak) return;

  // If AFLP_Arousal already handled this application it set a debounce key —
  // bail out so we don't double-count.
  const debounceKey = `_aflpCondDebounce_${actor.id}_${slug}`;
  if (window[debounceKey]) return;

  const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? AFLP.sexualDefaults);
  sexual.lifetime = sexual.lifetime ?? {};

  if (isDefeated) {
    sexual.lifetime.timesDefeated = (sexual.lifetime.timesDefeated ?? 0) + 1;
    console.log(`AFLP | ${actor.name} Defeated (external) — timesDefeated: ${sexual.lifetime.timesDefeated}`);
  }
  if (isMindBreak) {
    sexual.lifetime.timesMindBroken = (sexual.lifetime.timesMindBroken ?? 0) + 1;
    console.log(`AFLP | ${actor.name} Mind Break (external) — timesMindBroken: ${sexual.lifetime.timesMindBroken}`);
  }

  await actor.setFlag(FLAG, "sexual", sexual);

  if (AFLP.Settings.titlesAutomation) {
    await AFLP_Titles.checkAndAward(actor);
  }
});
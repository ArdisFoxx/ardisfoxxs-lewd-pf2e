// ====================================================
// AFLP H Scene Messages
// ====================================================
window.AFLP = window.AFLP ?? {};

AFLP.Messages = {
  DEFAULTS: {
    "scene-start": [
      "The air between {attacker} and {target} shifts.",
      "{attacker} moves on {target}.",
      "The encounter takes a carnal turn.",
    ],
    "scene-end": [
      "The scene draws to a close.",
      "{target} is released, breathless.",
      "The moment passes, leaving only heat.",
    ],
    "cum": [
      "{attacker} finishes.",
      "A helpless moan escapes as {attacker} lets go.",
      "{attacker} reaches the edge and falls.",
    ],
    "defeated": [
      "{target} collapses, overwhelmed.",
      "The fight drains out of {target} all at once.",
      "{target} goes limp, spent.",
    ],
    "mind-break-1": [
      "{target}\'s resolve wavers.",
      "Something shifts behind {target}\'s eyes.",
    ],
    "mind-break-max": [
      "{target}\'s resistance shatters completely.",
      "There is nothing left of {target}\'s will to fight.",
    ],
    "airlock": [
      "Every hole is filled. {target} is completely taken.",
      "{target} has nowhere left to go.",
    ],
    "exposed-1": [
      "{target} is caught off guard.",
    ],
    "position-set": [
      "{attacker} takes {position} with {target}.",
      "{attacker} uses {target} for {position}.",
    ],

    // ── Cumflation tier messages ─────────────────────────────────────────
    // Fired when a hole's cumflation tier increases. {target} is the receiver.
    "cumflated-vaginal-1": "{target}'s lips are slick with the load left inside them.",
    "cumflated-vaginal-2": "Warm cum drips slowly inside {target}, keeping them slick and ready to receive more.",
    "cumflated-vaginal-3": "The spunk filling {target} presses deeper, seeping into their womb.",
    "cumflated-vaginal-4": "{target}'s body spasms around the overflow of cum.",
    "cumflated-vaginal-5": "{target}'s thighs are coated in the gooey cum leaking from their filled belly.",
    "cumflated-vaginal-6": "Gallons of spunk press outward from {target}, straining to escape.",
    "cumflated-vaginal-7": "The sheer volume of cum packed into {target} makes every movement slow and painful.",
    "cumflated-vaginal-8": "Stretched beyond all measure, every inch of {target} packed with seed - and still their body holds.",

    "cumflated-anal-1": "Cum squelches between {target}'s cheeks as they move, keeping them slick and ready for whoever takes them next.",
    "cumflated-anal-2": "Warm jizz leaks steadily from {target}, a wet reminder of what was done to them.",
    "cumflated-anal-3": "The load dumped into {target} spreads a deep warmth through their belly.",
    "cumflated-anal-4": "{target}'s body clenches, fighting to keep the fat load packed inside.",
    "cumflated-anal-5": "The cum {target} was loaded with runs in thick streams down their thighs.",
    "cumflated-anal-6": "Every step is difficult for {target}, the huge pool of jizz in their bulging belly making it worse.",
    "cumflated-anal-7": "Bred to the hilt, {target}'s belly and ass are visibly rounder, every inch packed with the load forced into them.",
    "cumflated-anal-8": "Cramps seize {target}'s body as sticky jizz stretches every inch of their insides. Holding that volume in takes everything they have.",

    "cumflated-oral-1": "Warmth lingers in {target}'s throat, the taste of {attacker}'s load coating their tongue.",
    "cumflated-oral-2": "{target} glows with the warmth of what they swallowed, belly heavy and full.",
    "cumflated-oral-3": "Cum sloshes in {target}'s belly with every step, a mark of exactly what they are.",
    "cumflated-oral-4": "The load inside {target} presses outward, distending their belly in a way that humiliates and arouses.",
    "cumflated-oral-5": "{target}'s midriff is visibly swollen with the loads taken, plain for anyone to see.",
    "cumflated-oral-6": "{target}'s belly is heavily swollen, cum dribbling steadily from the corners of their mouth as it overflows.",
    "cumflated-oral-7": "{target} stumbles, barely upright, cum leaking in slick ropes from their mouth and coating their chest.",
    "cumflated-oral-8": "The sloshing inside {target} has stopped - there is nowhere left for it to go. Seed leaks from their nostrils and mouth, drenching them.",

    "cumflated-facial-1": "{attacker}'s cum drips down {target}'s face, warm and fresh.",
    "cumflated-facial-2": "Cum coats {target}'s cheeks and chin, glistening with {attacker}'s load.",
    "cumflated-facial-3": "A heavy load mats {target}'s hair and streaks their face.",
    "cumflated-facial-4": "{target}'s features are obscured beneath the thick ropes coating them.",
    "cumflated-facial-5": "Cum runs in streams from {target}'s brow, dripping from their nose and chin.",
    "cumflated-facial-6": "{target}'s face is completely coated, cum pooling at their collarbones.",
    "cumflated-facial-7": "Soaked and dripping, {target}'s face is barely visible beneath the layers of cum.",
    "cumflated-facial-8": "{target} is drenched from crown to chest, every feature slicked and sealed with {attacker}'s seed.",
  },

  get(key, tokens = {}) {
    const custom = this._loadCustom();
    const pool = custom[key] ?? this.DEFAULTS[key];
    if (!pool) return "";
    const raw = Array.isArray(pool)
      ? pool[Math.floor(Math.random() * pool.length)]
      : pool;
    return raw
      .replace(/\{attacker\}/g, tokens.attacker ?? "")
      .replace(/\{target\}/g,   tokens.target   ?? "")
      .replace(/\{position\}/g, tokens.position  ?? "");
  },

  _loadCustom() {
    try {
      const raw = game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_MESSAGES) ?? "";
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },

  async _saveCustom(data) {
    await game.settings.set(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_MESSAGES, JSON.stringify(data));
  },
};

// -----------------------------------------------
// H Scene Messages Editor - ApplicationV2
// -----------------------------------------------
class HSceneMessagesApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id:       "aflp-messages-editor",
    tag:      "div",
    window:   { title: "H Scene Messages", resizable: true, minimizable: true },
    position: { width: 620, height: 560 },
  };

  _esc(str) {
    return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  async _renderHTML() {
    const custom = AFLP.Messages._loadCustom();
    const esc = s => this._esc(s);

    const rows = Object.entries(AFLP.Messages.DEFAULTS).map(([key, def]) => {
      const defStr = Array.isArray(def) ? def.join("\n") : def;
      const custVal = custom[key]
        ? (Array.isArray(custom[key]) ? custom[key].join("\n") : custom[key])
        : "";
      return `<div class="aflp-msg-row">
        <div class="aflp-msg-key">${esc(key)}</div>
        <div class="aflp-msg-cols">
          <div class="aflp-msg-col"><label>Default (read-only)</label>
            <textarea class="aflp-msg-default" readonly>${esc(defStr)}</textarea></div>
          <div class="aflp-msg-col"><label>Custom (blank = use default)</label>
            <textarea class="aflp-msg-custom" data-key="${esc(key)}">${esc(custVal)}</textarea></div>
        </div></div>`;
    }).join("");

    const el = document.createElement("div");
    el.innerHTML = `<style>
      .aflp-msg-intro{padding:10px 14px 6px;font-size:11px;color:#888;border-bottom:1px solid rgba(200,160,80,0.2);}
      .aflp-msg-intro strong{color:#c9a96e;}
      .aflp-msg-scroll{padding:10px 14px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;max-height:420px;}
      .aflp-msg-key{font-size:10px;font-weight:700;color:#c9a96e;text-transform:uppercase;margin-bottom:4px;}
      .aflp-msg-cols{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
      .aflp-msg-col label{display:block;font-size:9px;color:#888;margin-bottom:3px;}
      .aflp-msg-col textarea{width:100%;height:64px;resize:vertical;font-size:11px;background:#111;color:#ddd;
        border:1px solid rgba(200,160,80,0.25);border-radius:3px;padding:4px 6px;box-sizing:border-box;font-family:monospace;}
      .aflp-msg-default{opacity:0.5;}
      .aflp-msg-footer{padding:8px 14px;border-top:1px solid rgba(200,160,80,0.2);display:flex;gap:8px;justify-content:flex-end;}
      .aflp-msg-footer button{padding:5px 16px;font-size:12px;cursor:pointer;}
    </style>
    <div class="aflp-msg-intro">One message per line. Use <strong>{attacker}</strong>, <strong>{target}</strong>, <strong>{position}</strong>. Leave blank to use default.</div>
    <div class="aflp-msg-scroll">${rows}</div>
    <div class="aflp-msg-footer">
      <button class="aflp-msg-reset">Reset All</button>
      <button class="aflp-msg-save">Save</button>
    </div>`;
    return el;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onRender(context, options) {
    const el = this.element;
    el.querySelector(".aflp-msg-save")?.addEventListener("click", async () => {
      const newCustom = {};
      el.querySelectorAll("textarea.aflp-msg-custom").forEach(ta => {
        const val = ta.value.trim();
        if (!val) return;
        const lines = val.split("\n").map(l => l.trim()).filter(Boolean);
        newCustom[ta.dataset.key] = lines.length === 1 ? lines[0] : lines;
      });
      await AFLP.Messages._saveCustom(newCustom);
      ui.notifications.info("AFLP | H Scene messages saved.");
    });
    el.querySelector(".aflp-msg-reset")?.addEventListener("click", async () => {
      await AFLP.Messages._saveCustom({});
      ui.notifications.info("AFLP | Messages reset to defaults.");
      this.render();
    });
  }
}

AFLP.HSceneMessagesApp = HSceneMessagesApp;

// Direct registration - file is dynamically imported after ready fires.
game.settings.registerMenu("ardisfoxxs-lewd-pf2e", "hsceneMessagesMenu", {
  name:    "H Scene Messages",
  label:   "Edit Messages",
  hint:    "Customise the flavor text that appears in H scene log entries. Saved to world, survives module updates.",
  icon:    "fas fa-comment-dots",
  type:    HSceneMessagesApp,
  restricted: true,
});


// -----------------------------------------------
// Cumflation Labels Editor - ApplicationV2
// -----------------------------------------------
class CumflationLabelsApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id:       "aflp-cf-labels-editor",
    tag:      "div",
    window:   { title: "Cumflation Status Labels", resizable: false, minimizable: true },
    position: { width: 460 },
  };

  _esc(s) { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  _load() {
    try {
      const r = game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CF_LABELS) ?? "";
      return r ? JSON.parse(r) : [];
    } catch { return []; }
  }

  async _renderHTML() {
    const custom = this._load();
    // Single source of truth: the H Scene card's CF_LABEL_DEFAULTS, exposed on AFLP.
    // Word and tier come straight from the card so this menu can never drift from it.
    const D = (AFLP.CF_LABEL_DEFAULTS ?? []).map(e => ({
      w: e.word,
      t: e.minTier >= 9 ? "Tier 8 + Facial 8" : "Tier " + e.minTier,
    }));
    const rows = D.map((d, i) => {
      const c = custom[i]?.w ?? "";
      return `<tr>
        <td style="color:#aaa;font-size:11px;padding:4px 8px 4px 0;white-space:nowrap;">${this._esc(d.t)}</td>
        <td style="color:#666;font-size:10px;padding:4px 8px;font-style:italic;">${this._esc(d.w)}</td>
        <td><input type="text" data-i="${i}" value="${this._esc(c)}" placeholder="${this._esc(d.w)}"
          style="width:150px;background:#111;color:#e0c8a0;border:1px solid rgba(200,160,80,0.3);
          border-radius:3px;padding:3px 6px;font-size:11px;font-weight:700;"/></td>
      </tr>`;
    }).join("");
    const el = document.createElement("div");
    el.innerHTML = `<style>
      #aflp-cf-labels-editor .window-content { padding: 0; }
      .aflp-cf-i { padding: 8px 12px 4px; font-size: 10px; color: #777; border-bottom: 1px solid rgba(200,160,80,.15); }
      .aflp-cf-t { padding: 8px 12px; }
      .aflp-cf-f { padding: 6px 12px; border-top: 1px solid rgba(200,160,80,.15); display: flex; justify-content: flex-end; gap: 6px; }
      .aflp-cf-f button { padding: 4px 14px; font-size: 11px; cursor: pointer; }
    </style>
    <div class="aflp-cf-i">Rename each cumflation status label. Leave blank to keep the default.</div>
    <div class="aflp-cf-t">
      <table style="border-collapse:collapse;width:100%">
        <thead><tr>
          <th style="font-size:9px;color:#888;text-align:left;padding-bottom:4px;">Total Cumflation</th>
          <th style="font-size:9px;color:#888;text-align:left;padding-bottom:4px;">Default</th>
          <th style="font-size:9px;color:#888;text-align:left;padding-bottom:4px;">Custom</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="aflp-cf-f">
      <button class="aflp-cf-r">Reset</button>
      <button class="aflp-cf-s">Save</button>
    </div>`;
    return el;
  }

  _replaceHTML(r, c) { c.replaceChildren(r); }

  _onRender(context, options) {
    const el = this.element;
    el.querySelector(".aflp-cf-s")?.addEventListener("click", async () => {
      const c = [...el.querySelectorAll("input[data-i]")].map(x => ({ w: x.value.trim() }));
      await game.settings.set(AFLP.Settings.ID, AFLP.Settings.KEYS.CF_LABELS, JSON.stringify(c));
      ui.notifications.info("AFLP | Cumflation labels saved.");
    });
    el.querySelector(".aflp-cf-r")?.addEventListener("click", async () => {
      await game.settings.set(AFLP.Settings.ID, AFLP.Settings.KEYS.CF_LABELS, "");
      ui.notifications.info("AFLP | Labels reset to defaults.");
      this.render();
    });
  }
}

AFLP.CumflationLabelsApp = CumflationLabelsApp;

game.settings.registerMenu("ardisfoxxs-lewd-pf2e", "cfLabelsMenu", {
  name:       "Cumflation Status Labels",
  label:      "Edit Labels",
  hint:       "Rename the status words shown on H scene cards (Leaking, Stretched, Cumbucket, etc.).",
  icon:       "fas fa-droplet",
  type:       CumflationLabelsApp,
  restricted: true,
});


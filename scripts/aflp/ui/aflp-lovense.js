// ===============================
// AFLP Lovense Integration (5.3)
// ===============================
// Per-player settings in game.user.flags.
// Mode A — GIFT: emits console log lines that GameInterfaceForToys watches
// Mode B — Direct: POSTs directly to Lovense Connect LAN API (requires HTTPS Foundry)
// Mode C — Both: emits log lines AND calls Lovense Connect directly

window.AFLP_Lovense = {

  MODULE: "ardisfoxxs-lewd-pf2e",
  FLAG:   "lovense",

  // ── Named GIFT pattern keys (for YAML export reference)
  PATTERNS: {
    pulse_soft:   { label: "Soft pulse",     giftKey: "vibrator_2"          },
    pulse_med:    { label: "Medium pulse",   giftKey: "vibrator_3"          },
    pulse_strong: { label: "Strong pulse",   giftKey: "vibrator_4"          },
    build_low:    { label: "Low build",      giftKey: "low_intensity_scaled" },
    build_wave:   { label: "Wave (medium)",  giftKey: "untyped_sex"         },
    build_climax: { label: "Climax build",   giftKey: "masturbation"        },
    climax:       { label: "Climax cascade", giftKey: "vibrator_5"          },
    random:       { label: "Random",         giftKey: null                  },
  },

  // ── Direct mode: built-in Lovense Preset names mapped to intensity tiers
  // Available presets in Lovense Connect: pulse, wave, fireworks, earthquake
  DIRECT_PRESETS: {
    arousal_low:    "wave",
    arousal_medium: "pulse",
    arousal_high:   "fireworks",
    cum:            "earthquake",
    edge:           "fireworks",
  },

  EVENTS: {
    arousal_low:    { label: "Arousal (Low)",    emoji: "\u{1F497}", group: "Arousal",    logKey: "AFLP Arousal Low",    pattern: "build_low",    defMinStr: 15, defMaxStr: 30,  defMinDur: 1,  defMaxDur: 2  },
    arousal_medium: { label: "Arousal (Medium)", emoji: "\u{1F493}", group: "Arousal",    logKey: "AFLP Arousal Medium", pattern: "build_wave",   defMinStr: 30, defMaxStr: 55,  defMinDur: 2,  defMaxDur: 4  },
    arousal_high:   { label: "Arousal (High)",   emoji: "\u{1F49E}", group: "Arousal",    logKey: "AFLP Arousal High",   pattern: "build_climax", defMinStr: 55, defMaxStr: 80,  defMinDur: 3,  defMaxDur: 5  },
    cum:            { label: "Cum",              emoji: "\u{1F4A6}", group: "Peak",       logKey: "AFLP Cummed",         pattern: "climax",       defMinStr: 90, defMaxStr: 100, defMinDur: 8,  defMaxDur: 15, chaster: true },
    edge:           { label: "Edged",            emoji: "\u{1F525}", group: "Peak",       logKey: "AFLP Edged",          pattern: "build_climax", defMinStr: 70, defMaxStr: 90,  defMinDur: 3,  defMaxDur: 6,  chaster: true },
    denied:         { label: "Denied",           emoji: "\u{1F512}", group: "Peak",       logKey: "Denied",              pattern: "pulse_strong", defMinStr: 40, defMaxStr: 65,  defMinDur: 2,  defMaxDur: 5,  chaster: true },
    mind_break:     { label: "Mind Break",       emoji: "\u{1F300}", group: "Conditions", logKey: "Mind Break",          pattern: "climax",       defMinStr: 85, defMaxStr: 100, defMinDur: 20, defMaxDur: 45, chaster: true },
    horny:          { label: "Horny",            emoji: "\u{1F321}\uFE0F", group: "Conditions", logKey: "Horny",         pattern: "build_low",    defMinStr: 15, defMaxStr: 35,  defMinDur: 3,  defMaxDur: 6  },
    submitting:     { label: "Submitting",       emoji: "\u{1FA77}", group: "Conditions", logKey: "Submitting",          pattern: "pulse_med",    defMinStr: 20, defMaxStr: 40,  defMinDur: 2,  defMaxDur: 4  },
    exposed:        { label: "Exposed",          emoji: "\u{1F441}\uFE0F", group: "Conditions", logKey: "Exposed",       pattern: "pulse_soft",   defMinStr: 10, defMaxStr: 25,  defMinDur: 1,  defMaxDur: 2  },
    grabbed:        { label: "Grabbed",          emoji: "\u270A",    group: "Conditions", logKey: "Grabbed",             pattern: "pulse_soft",   defMinStr: 15, defMaxStr: 30,  defMinDur: 1,  defMaxDur: 2  },
    bimbofied:      { label: "Bimbofied",        emoji: "\u{1F380}", group: "Conditions", logKey: "Bimbofied",           pattern: "build_low",    defMinStr: 20, defMaxStr: 40,  defMinDur: 3,  defMaxDur: 6  },
    hscene_start:   { label: "H Scene Start",    emoji: "\u{1F5A4}", group: "Scene",      logKey: "Amorous Activity",    special: "sex_start"  },
    hscene_end:     { label: "H Scene End",      emoji: "\u2728",    group: "Scene",      logKey: "Afterglow",           special: "sex_end"    },
  },

  CONDITION_MAP: {
    "denied":     "denied",
    "horny":      "horny",
    "exposed":    "exposed",
    "submitting": "submitting",
    "grabbed":    "grabbed",
    "mind-break": "mind_break",
    "bimbofied":  "bimbofied",
    "afterglow":  "hscene_end",
  },

  CHASTER_DEFAULTS: {
    enabled: false,
    edge_min: 300, edge_max: 600,
    denied_min: 60, denied_max: 180,
    cum_min: 600, cum_max: 1800,
    mind_break_min: 1800, mind_break_max: 3600,
  },

  // ── Accessors ─────────────────────────────────────────────────────────────

  getSettings()      { return game.user.getFlag(this.MODULE, this.FLAG) ?? {}; },
  isEnabled()        { return this.getSettings().enabled !== false; },
  isEventEnabled(k)  { return this.isEnabled() && this.getSettings().events?.[k]?.enabled !== false; },
  getCharacterName() {
    const s = this.getSettings();
    return s.characterName || game.actors?.find(a => a.isOwner && a.type === "character")?.name || game.user.name;
  },
  getChasterSettings() { return { ...this.CHASTER_DEFAULTS, ...(this.getSettings().chaster ?? {}) }; },

  // mode: "gift" | "direct" | "both"
  getMode()          { return this.getSettings().mode ?? "gift"; },
  useGift()          { const m = this.getMode(); return m === "gift" || m === "both"; },
  useDirect()        { const m = this.getMode(); return m === "direct" || m === "both"; },

  // Lovense Connect LAN endpoint — PC app is always 127-0-0-1.lovense.club:30010
  getDirectUrl() {
    const s = this.getSettings();
    const appType = s.directAppType ?? "pc";
    const host = appType === "pc" ? "127-0-0-1.lovense.club" : (s.directHost ?? "127-0-0-1.lovense.club");
    const port = s.directPort ?? 30010;
    return `https://${host}:${port}/command`;
  },

  // ── Emission ──────────────────────────────────────────────────────────────

  shouldEmit(slug) {
    if (!this.isEnabled()) return false;
    const k = this.CONDITION_MAP[slug?.toLowerCase?.()];
    return k ? this.isEventEnabled(k) : true;
  },

  emitArousal(actor, cur, max) {
    if (!this.isEnabled() || !game.user.isGM) return;
    const pct = max > 0 ? cur / max : 0;
    const k = pct >= 0.67 ? "arousal_high" : pct >= 0.34 ? "arousal_medium" : pct > 0 ? "arousal_low" : null;
    if (!k || !this.isEventEnabled(k)) return;
    if (this.useGift())   this._doEmit(actor.name, this.EVENTS[k].logKey);
    if (this.useDirect()) this._directFire(k);
  },

  emitCum(actor) {
    if (!this.isEnabled() || !game.user.isGM || !this.isEventEnabled("cum")) return;
    if (this.useGift())   this._doEmit(actor.name, this.EVENTS.cum.logKey);
    if (this.useDirect()) this._directFire("cum");
  },

  emitEdge(actor) {
    if (!this.isEnabled() || !game.user.isGM || !this.isEventEnabled("edge")) return;
    if (this.useGift())   this._doEmit(actor.name, this.EVENTS.edge.logKey);
    if (this.useDirect()) this._directFire("edge");
  },

  // Called by module.js logEffect for condition items
  emitCondition(actor, slug) {
    const k = this.CONDITION_MAP[slug?.toLowerCase?.()];
    if (!k || !this.isEventEnabled(k)) return;
    if (this.useGift())   this._doEmit(actor.name, this.EVENTS[k].logKey);
    if (this.useDirect()) this._directFire(k);
  },

  // ── GIFT emission ──────────────────────────────────────────────────────────

  _doEmit(name, logKey) {
    const line = `${this._ts()} ${name}, ${logKey}`;
    if (typeof socketlib !== "undefined") {
      try { socketlib.modules.get(this.MODULE).executeForEveryone("logMessage", line); return; } catch { /**/ }
    }
    console.log(line);
  },

  // ── Direct (Lovense Connect LAN) emission ─────────────────────────────────

  _directFire(eventKey) {
    const def = this.EVENTS[eventKey];
    if (!def || def.special) return; // scene start/end managed by GIFT sex_start/end only
    const s   = this.getSettings();
    const ev  = s.events?.[eventKey] ?? {};
    const min = ev.minStr ?? def.defMinStr ?? 20;
    const max = ev.maxStr ?? def.defMaxStr ?? 60;
    const minD = ev.minDur ?? def.defMinDur ?? 1;
    const maxD = ev.maxDur ?? def.defMaxDur ?? 5;

    // Pick random values within configured range
    const strength = Math.round((min + Math.random() * (max - min)) / 100 * 20);
    const duration = Math.round(minD + Math.random() * (maxD - minD));

    // Use a named Preset for intensity-tier events, Function for conditions
    const preset = this.DIRECT_PRESETS[eventKey];
    const body = preset
      ? { command: "Preset", name: preset, timeSec: duration, apiVer: 1 }
      : { command: "Function", action: `Vibrate:${strength}`, timeSec: duration, apiVer: 1 };

    fetch(this.getDirectUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()).then(data => {
      if (data?.code !== 200) console.warn("AFLP Lovense Direct | unexpected response:", data);
    }).catch(err => {
      console.warn("AFLP Lovense Direct | connection error:", err.message);
    });
  },

  // Stop all toys (used by connection test)
  _directStop() {
    fetch(this.getDirectUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "Function", action: "Vibrate:0", timeSec: 0, apiVer: 1 }),
    }).catch(() => {});
  },

  // ── Connection tests ──────────────────────────────────────────────────────

  emitConnectionTest() {
    if (!this.isEnabled()) return;
    if (this.useGift()) {
      const line = `${this._ts()} ${this.getCharacterName()}, AFLP Connected`;
      console.log(line);
    }
    if (this.useDirect()) {
      // Get toy list to verify connection
      fetch(this.getDirectUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "GetToys" }),
      }).then(r => r.json()).then(data => {
        const toys = data?.data?.toys;
        if (toys) {
          const toyList = Object.values(JSON.parse(toys)).map(t => t.nickName || t.name).join(", ");
          console.log(`AFLP Lovense Direct | Connected. Toys: ${toyList || "none detected"}`);
        }
      }).catch(err => {
        console.warn("AFLP Lovense Direct | startup check failed:", err.message,
          "— ensure Lovense Remote is running and Foundry is served over HTTPS");
      });
    }
  },

  testEvent(key) {
    const def = this.EVENTS[key];
    if (!def) return;
    if (this.useGift()) {
      console.log(`${this._ts()} ${this.getCharacterName()}, ${def.logKey}`);
    }
    if (this.useDirect()) {
      this._directFire(key);
    }
    ui.notifications?.info(`AFLP Lovense | Test fired: ${def.label} — check your toy`);
  },

  // Manual connection test — fires 3s pulse then stops; returns a Promise with result text
  async testDirectConnection(host, port) {
    const url = `https://${host}:${port}/command`;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "GetToys" }),
      });
      const data = await r.json();
      if (data?.code === 200) {
        let toys = {};
        try { toys = JSON.parse(data.data?.toys ?? "{}"); } catch { /**/ }
        const names = Object.values(toys).map(t => t.nickName || t.name);
        return { ok: true, msg: names.length ? `Connected — toys: ${names.join(", ")}` : "Connected — no toys detected" };
      }
      return { ok: false, msg: `Lovense Remote responded with code ${data?.code}` };
    } catch (err) {
      return { ok: false, msg: `Could not reach Lovense Remote: ${err.message}. Common causes: (1) Lovense Remote isn't open, (2) Game Mode isn't enabled in the app, (3) you're accessing Foundry over HTTP — Chrome blocks direct connections to local apps from HTTP pages (Private Network Access). Accessing Foundry over HTTPS resolves this.` };
    }
  },

  _ts() {
    const n = new Date(), p = v => String(v).padStart(2, "0");
    const t = n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).replace(" ", "");
    return `[${p(n.getMonth()+1)}/${p(n.getDate())}/${n.getFullYear()} - ${t}]`;
  },

  // ── Settings Dialog ───────────────────────────────────────────────────────

  async openSettings() {
    const cur      = this.getSettings();
    const charName = this.getCharacterName();
    const chaster  = this.getChasterSettings();
    const owned    = game.actors?.filter(a => a.isOwner && a.type === "character") ?? [];
    const self     = this;
    const mode     = cur.mode ?? "gift";
    const dHost    = cur.directHost ?? "127-0-0-1.lovense.club";
    const dPort    = cur.directPort ?? 30010;
    const dAppType = cur.directAppType ?? "pc";

    const actorOpts = owned.map(a =>
      `<option value="${a.name}" ${a.name === charName ? "selected" : ""}>${a.name}</option>`
    ).join("");

    const roleSelect = (role) => {
      const opts = ["both","primary","secondary","none"].map(v =>
        `<option value="${v}" ${role === v ? "selected" : ""}>${{both:"Both",primary:"Primary",secondary:"Secondary",none:"Off"}[v]}</option>`
      ).join("");
      return `<select data-field="role" style="background:#1a1a1a;border:1px solid #c9a96e33;color:#ddd;font-size:11px;padding:2px 3px;border-radius:2px;">${opts}</select>`;
    };

    const groups = [...new Set(Object.values(this.EVENTS).map(e => e.group))];
    const eventRows = groups.map(group => {
      const inGroup = Object.entries(this.EVENTS).filter(([,e]) => e.group === group);
      const hdr = `<tr><td colspan="8" style="padding:7px 4px 2px;font-size:10px;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #c9a96e33;">${group}</td></tr>`;
      return hdr + inGroup.map(([key, def]) => {
        const ev = cur.events?.[key] ?? {};
        const on = ev.enabled !== false;
        const minStr = ev.minStr ?? def.defMinStr ?? 20;
        const maxStr = ev.maxStr ?? def.defMaxStr ?? 60;
        const minDur = ev.minDur ?? def.defMinDur ?? 1;
        const maxDur = ev.maxDur ?? def.defMaxDur ?? 5;
        const evRole = ev.role ?? "both";
        const noSliders = !!def.special;
        const sliderCells = noSliders
          ? `<td colspan="4" style="font-size:10px;color:#555;padding:4px;font-style:italic;">${mode === 'direct' ? 'Not used in Direct mode' : 'Managed by GIFT'}</td>`
          : `<td style="padding:3px 4px;"><div style="display:flex;align-items:center;gap:3px;"><input type="range" data-field="minStr" min="0" max="100" value="${minStr}" style="width:58px;" class="lv-slider"/><span class="lv-val" style="font-size:10px;min-width:26px;">${minStr}%</span></div></td>
             <td style="padding:3px 4px;"><div style="display:flex;align-items:center;gap:3px;"><input type="range" data-field="maxStr" min="0" max="100" value="${maxStr}" style="width:58px;" class="lv-slider"/><span class="lv-val" style="font-size:10px;min-width:26px;">${maxStr}%</span></div></td>
             <td style="padding:3px 4px;"><div style="display:flex;align-items:center;gap:3px;"><input type="range" data-field="minDur" min="0" max="60" value="${minDur}" style="width:48px;" class="lv-slider"/><span class="lv-val" style="font-size:10px;min-width:22px;">${minDur}s</span></div></td>
             <td style="padding:3px 4px;"><div style="display:flex;align-items:center;gap:3px;"><input type="range" data-field="maxDur" min="0" max="60" value="${maxDur}" style="width:48px;" class="lv-slider"/><span class="lv-val" style="font-size:10px;min-width:22px;">${maxDur}s</span></div></td>`;
        return `<tr data-event="${key}" style="border-bottom:1px solid #ffffff07;">
          <td style="padding:4px;font-size:12px;white-space:nowrap;">${def.emoji} ${def.label}</td>
          <td style="text-align:center;padding:4px 6px;"><input type="checkbox" data-field="enabled" ${on ? "checked" : ""} style="width:15px;height:15px;cursor:pointer;"/></td>
          ${sliderCells}
          <td class="lv-toy-col" style="padding:3px 4px;">${roleSelect(evRole)}</td>
          <td style="padding:3px 4px;"><button class="lv-test" data-event="${key}" style="font-size:10px;padding:2px 6px;cursor:pointer;background:#2a1a0a;border:1px solid #c9a96e44;color:#c9a96e;border-radius:3px;">Test</button></td>
        </tr>`;
      }).join("");
    }).join("");

    const m2s = s => `${Math.round(s/60)}m`;
    const chRow = (label, minId, maxId, minV, maxV) =>
      `<tr style="border-bottom:1px solid #ffffff07;">
        <td style="padding:4px;font-size:11px;">${label}</td>
        <td style="padding:4px;"><div style="display:flex;align-items:center;gap:4px;"><input type="range" id="${minId}" min="0" max="7200" step="60" value="${minV}" style="width:80px;" class="ch-slider"/><span class="ch-val" style="font-size:10px;min-width:30px;">${m2s(minV)}</span></div></td>
        <td style="padding:4px;"><div style="display:flex;align-items:center;gap:4px;"><input type="range" id="${maxId}" min="0" max="7200" step="60" value="${maxV}" style="width:80px;" class="ch-slider"/><span class="ch-val" style="font-size:10px;min-width:30px;">${m2s(maxV)}</span></div></td>
      </tr>`;

    const modeLabelStyle = "font-size:11px;color:#aaa;cursor:pointer;";
    const modeOptStyle   = "display:flex;align-items:flex-start;gap:6px;padding:6px 8px;border-radius:4px;border:1px solid #c9a96e22;background:#1a1410;";
    const modeDesc       = {
      gift:   "Emits log lines that GameInterfaceForToys (GIFT) picks up. Requires GIFT installed and configured.",
      direct: "POSTs directly to the Lovense Remote app over LAN. No GIFT needed. Best with Foundry on HTTPS.",
      both:   "Emits log lines for GIFT <em>and</em> calls Lovense Remote directly. Use if you want GIFT for Chaster and direct for faster toy response.",
    };

    const content = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#ddd;max-width:720px;">

  <!-- Master enable + mode -->
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <input type="checkbox" id="lv-master" ${cur.enabled !== false ? "checked" : ""} style="width:16px;height:16px;cursor:pointer;"/>
      <label style="font-size:13px;font-weight:600;color:#c9a96e;">Enable Lovense Integration</label>
    </div>
    <button id="lv-open-wizard" style="font-size:10px;padding:2px 8px;cursor:pointer;background:#1a1410;border:1px solid #c9a96e33;color:#c9a96e;border-radius:3px;">↩ Re-run Setup Wizard</button>
  </div>

  <!-- Mode selector -->
  <div style="margin-bottom:12px;">
    <div style="font-size:10px;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Integration Mode</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;" id="lv-mode-grid">
      ${["gift","direct","both"].map(m => `
      <label style="${modeOptStyle}${mode === m ? "border-color:#c9a96e88;background:#2a1e10;" : ""}cursor:pointer;" data-mode="${m}">
        <input type="radio" name="lv-mode" value="${m}" ${mode === m ? "checked" : ""} style="margin-top:2px;flex-shrink:0;"/>
        <div>
          <div style="font-size:12px;font-weight:600;color:#c9a96e;margin-bottom:2px;">${{gift:"GIFT (Log-based)",direct:"Direct (Lovense Remote)",both:"Both"}[m]}</div>
          <div style="font-size:10px;color:#888;">${modeDesc[m]}</div>
        </div>
      </label>`).join("")}
    </div>
  </div>

  <!-- GIFT settings -->
  <div id="lv-gift-section" style="${mode === "direct" ? "display:none;" : ""}margin-bottom:10px;padding:8px;background:#1a1410;border:1px solid #c9a96e22;border-radius:4px;">
    <div style="font-size:10px;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">GIFT Settings</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <label style="font-size:12px;">Character name:</label>
      ${owned.length > 0
        ? `<select id="lv-charname" style="background:#1a1a1a;border:1px solid #c9a96e44;color:#ddd;padding:3px 6px;font-size:12px;">${actorOpts}</select>`
        : `<input id="lv-charname" type="text" value="${charName}" style="background:#1a1a1a;border:1px solid #c9a96e44;color:#ddd;padding:3px 6px;font-size:12px;width:160px;"/>`}
      <button id="lv-conntest-gift" style="font-size:10px;padding:2px 8px;cursor:pointer;background:#1a2a1a;border:1px solid #5a9a5a55;color:#8aca8e;border-radius:3px;">Test Connection</button>
    </div>
    <div style="font-size:10px;color:#666;margin-top:5px;">Must match <em>GIFT_ACTOR_NAME</em> in GameInterfaceForToys settings.yaml. The Toy column below controls which toy fires per event — requires two named toys in GIFT.</div>
  </div>

  <!-- Direct settings -->
  <div id="lv-direct-section" style="${mode === "gift" ? "display:none;" : ""}margin-bottom:10px;padding:8px;background:#1a1410;border:1px solid #c9a96e22;border-radius:4px;">
    <div style="font-size:10px;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Direct Connection Settings</div>
    <!-- App type selector -->
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <label style="display:flex;align-items:flex-start;gap:6px;padding:5px 8px;border-radius:4px;border:1px solid ${dAppType === 'pc' ? '#c9a96e88' : '#c9a96e22'};background:${dAppType === 'pc' ? '#2a1e10' : '#1a1410'};cursor:pointer;flex:1;" id="lv-apptype-pc-label" data-apptype="pc">
        <input type="radio" name="lv-apptype" value="pc" ${dAppType === 'pc' ? 'checked' : ''} style="margin-top:2px;flex-shrink:0;"/>
        <div>
          <div style="font-size:12px;font-weight:600;color:#c9a96e;">Lovense Remote (PC)</div>
          <div style="font-size:10px;color:#888;">Lovense Remote PC on the same machine. Requires Foundry on HTTPS — Chrome blocks local app connections from HTTP pages.</div>
        </div>
      </label>
      <label style="display:flex;align-items:flex-start;gap:6px;padding:5px 8px;border-radius:4px;border:1px solid ${dAppType === 'mobile' ? '#c9a96e88' : '#c9a96e22'};background:${dAppType === 'mobile' ? '#2a1e10' : '#1a1410'};cursor:pointer;flex:1;" id="lv-apptype-mobile-label" data-apptype="mobile">
        <input type="radio" name="lv-apptype" value="mobile" ${dAppType === 'mobile' ? 'checked' : ''} style="margin-top:2px;flex-shrink:0;"/>
        <div>
          <div style="font-size:12px;font-weight:600;color:#c9a96e;">Lovense Remote (iOS / Android)</div>
          <div style="font-size:10px;color:#888;">Phone app on your local network. Requires an IP address.</div>
        </div>
      </label>
    </div>
    <!-- Mobile IP/port fields (hidden for PC) -->
    <div id="lv-mobile-fields" style="${dAppType === 'pc' ? 'display:none' : 'display:flex'};align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
      <label style="font-size:12px;">IP Address:</label>
      <input id="lv-direct-host" type="text" value="${dAppType === 'mobile' ? dHost : ''}" placeholder="e.g. 192.168.1.42" style="background:#1a1a1a;border:1px solid #c9a96e44;color:#ddd;padding:3px 6px;font-size:12px;width:160px;"/>
      <label style="font-size:12px;">Port:</label>
      <input id="lv-direct-port" type="number" value="${dPort}" style="background:#1a1a1a;border:1px solid #c9a96e44;color:#ddd;padding:3px 6px;font-size:12px;width:70px;"/>
    </div>
    <div id="lv-mobile-instructions" style="${dAppType === 'pc' ? 'display:none' : 'display:block'};font-size:10px;color:#888;margin-bottom:6px;">
      In Lovense Remote: tap <strong style="color:#c9a96e;">Me → Settings → Game Mode</strong> and enable it. Your IP address and port will be shown there.
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button id="lv-conntest-direct" style="font-size:10px;padding:2px 8px;cursor:pointer;background:#1a2a1a;border:1px solid #5a9a5a55;color:#8aca8e;border-radius:3px;">Test Connection</button>
      <div id="lv-direct-status" style="font-size:10px;color:#666;">Requires Foundry served over HTTPS.</div>
    </div>
  </div>

  <!-- Event table -->
  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="color:#777;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">
      <th style="text-align:left;padding:3px 4px;">Event</th><th>On</th>
      <th style="text-align:left;padding:3px 4px;">Str Min</th><th style="text-align:left;padding:3px 4px;">Str Max</th>
      <th style="text-align:left;padding:3px 4px;">Dur Min</th><th style="text-align:left;padding:3px 4px;">Dur Max</th>
      <th style="text-align:left;padding:3px 4px;" class="lv-gift-col" style="${mode === "direct" ? "display:none" : ""}">Toy</th>
      <th></th>
    </tr></thead>
    <tbody>${eventRows}</tbody>
  </table>

  <!-- Chaster -->
  <details style="margin-top:10px;">
    <summary style="cursor:pointer;font-size:11px;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.8px;user-select:none;">Chaster Integration (digital chastity lock time)</summary>
    <div style="margin-top:6px;padding:8px;background:#1a1410;border:1px solid #c9a96e22;border-radius:4px;">
      <p style="font-size:10px;color:#888;margin:0 0 8px;">Adds time to your Chaster lock when these events fire. GIFT mode only — requires Chaster developer access in GIFT settings.yaml.</p>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <input type="checkbox" id="ch-enabled" ${chaster.enabled ? "checked" : ""} style="width:15px;height:15px;cursor:pointer;"/>
        <label style="font-size:12px;color:#c9a96e;">Enable Chaster penalties</label>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr style="color:#666;font-size:10px;text-transform:uppercase;">
          <th style="text-align:left;padding:3px 4px;">Event</th>
          <th style="text-align:left;padding:3px 4px;">Min time added</th>
          <th style="text-align:left;padding:3px 4px;">Max time added</th>
        </tr></thead>
        <tbody>
          ${chRow("Edged",      "ch-edge_min",       "ch-edge_max",       chaster.edge_min,       chaster.edge_max      )}
          ${chRow("Denied",     "ch-denied_min",     "ch-denied_max",     chaster.denied_min,     chaster.denied_max    )}
          ${chRow("Cum",        "ch-cum_min",        "ch-cum_max",        chaster.cum_min,        chaster.cum_max       )}
          ${chRow("Mind Break", "ch-mind_break_min", "ch-mind_break_max", chaster.mind_break_min, chaster.mind_break_max)}
        </tbody>
      </table>
    </div>
  </details>
  <p style="font-size:10px;color:#555;margin:8px 0 0;">In GIFT mode, Download Config generates <em>aflp.yaml</em> + <em>toy-event-map.yaml</em>.</p>
</div>`;

    await foundry.applications.api.DialogV2.wait({
      window: { title: "AFLP Lovense Integration", resizable: true },
      content,
      render(ev, dialog) {
        const html = dialog.element;
        // Make the dialog content scrollable — window-content is overflow:hidden by default
        // which clips the Chaster section when expanded. Set auto so it scrolls.
        const winContent = html.closest(".application.dialog")?.querySelector(".window-content")
          ?? html.parentElement;
        if (winContent) {
          winContent.style.overflowY = "auto";
          winContent.style.maxHeight = "80vh";
          winContent.scrollTop = 0;
        }

        // Mode radio toggles section visibility
        html.querySelectorAll("input[name='lv-mode']").forEach(radio => {
          radio.addEventListener("change", () => {
            const m = radio.value;
            html.querySelector("#lv-gift-section").style.display   = (m === "direct") ? "none" : "";
            html.querySelector("#lv-direct-section").style.display = (m === "gift")   ? "none" : "";
            // Hide GIFT-only UI when in direct-only mode
            const giftOnly = m !== "direct";
            html.querySelectorAll("th.lv-toy-col, td.lv-toy-col").forEach(el => el.style.display = giftOnly ? "" : "none");
            const dlBtn = html.querySelector("button[data-action='download']");
            if (dlBtn) dlBtn.style.display = giftOnly ? "" : "none";
            // Update mode card highlights
            html.querySelectorAll("#lv-mode-grid label").forEach(lbl => {
              const selected = lbl.dataset.mode === m;
              lbl.style.borderColor = selected ? "#c9a96e88" : "#c9a96e22";
              lbl.style.background  = selected ? "#2a1e10"   : "#1a1410";
            });

          });
        });
        // Mode card labels act as radio triggers
        html.querySelectorAll("#lv-mode-grid label").forEach(lbl => {
          lbl.addEventListener("click", () => {
            const radio = lbl.querySelector("input[type='radio']");
            if (radio) radio.dispatchEvent(new Event("change", { bubbles: true }));
          });
        });

        // Sliders
        html.querySelectorAll(".lv-slider").forEach(s =>
          s.addEventListener("input", () => {
            const l = s.nextElementSibling;
            if (l) l.textContent = s.dataset.field.includes("Dur") ? `${s.value}s` : `${s.value}%`;
          })
        );
        html.querySelectorAll(".ch-slider").forEach(s =>
          s.addEventListener("input", () => {
            const l = s.nextElementSibling;
            if (l) l.textContent = `${Math.round(s.value/60)}m`;
          })
        );

        // Test buttons
        html.querySelectorAll(".lv-test").forEach(b =>
          b.addEventListener("click", () => self.testEvent(b.dataset.event))
        );

        // GIFT connection test
        html.querySelector("#lv-conntest-gift")?.addEventListener("click", () => {
          const name = html.querySelector("#lv-charname")?.value?.trim() || self.getCharacterName();
          console.log(`${self._ts()} ${name}, AFLP Connected`);
          ui.notifications?.info(`AFLP Lovense | GIFT test line sent for "${name}" — check GIFT log`);
        });

        // Apply initial GIFT-only visibility based on saved mode
        {
          const initMode = html.querySelector("input[name='lv-mode']:checked")?.value ?? "gift";
          const giftOnly = initMode !== "direct";
          html.querySelectorAll("th.lv-toy-col, td.lv-toy-col").forEach(el => el.style.display = giftOnly ? "" : "none");
          const dlBtn = html.querySelector("button[data-action='download']");
          if (dlBtn) dlBtn.style.display = giftOnly ? "" : "none";
        }

        html.querySelector("#lv-open-wizard")?.addEventListener("click", () => {
          // Close the settings dialog and open the wizard
          const dlg = html.closest(".application.dialog");
          if (dlg) { const app = foundry.applications.instances?.get(parseInt(dlg.dataset.appid)); app?.close(); }
          setTimeout(() => self.openWizard(), 100);
        });

        // App type radio cards
        html.querySelectorAll("input[name='lv-apptype']").forEach(radio => {
          radio.addEventListener("change", () => {
            const isMobile = radio.value === "mobile";
            html.querySelector("#lv-mobile-fields").style.display       = isMobile ? "" : "none";
            html.querySelector("#lv-mobile-instructions").style.display = isMobile ? "" : "none";
            html.querySelectorAll("[id^='lv-apptype-']").forEach(lbl => {
              const sel = lbl.dataset.apptype === radio.value;
              lbl.style.borderColor = sel ? "#c9a96e88" : "#c9a96e22";
              lbl.style.background  = sel ? "#2a1e10"   : "#1a1410";
            });
          });
        });
        html.querySelectorAll("[id^='lv-apptype-']").forEach(lbl => {
          lbl.addEventListener("click", () => {
            const r = lbl.querySelector("input[type='radio']");
            if (r) r.dispatchEvent(new Event("change", { bubbles: true }));
          });
        });

        // Direct connection test
        html.querySelector("#lv-conntest-direct")?.addEventListener("click", async () => {
          const appType = html.querySelector("input[name='lv-apptype']:checked")?.value ?? "pc";
          const host = appType === "pc"
            ? "127-0-0-1.lovense.club"
            : html.querySelector("#lv-direct-host")?.value?.trim() || "";
          const port = parseInt(html.querySelector("#lv-direct-port")?.value) || 30010;
          const statusEl = html.querySelector("#lv-direct-status");
          if (appType === "mobile" && !host) {
            if (statusEl) { statusEl.textContent = "Enter your phone's IP address first."; statusEl.style.color = "#ca8a8e"; }
            return;
          }
          if (statusEl) statusEl.textContent = "Testing...";
          const result = await self.testDirectConnection(host, port);
          if (statusEl) {
            statusEl.textContent = result.msg;
            statusEl.style.color = result.ok ? "#8aca8e" : "#ca8a8e";
          }
        });
      },
      buttons: [
        {
          action: "save", label: "Save", default: true,
          callback: async (ev, btn, dialog) => {
            const html = dialog.element;
            const ns = {
              enabled:       html.querySelector("#lv-master")?.checked ?? true,
              mode:          html.querySelector("input[name='lv-mode']:checked")?.value ?? "gift",
              characterName: html.querySelector("#lv-charname")?.value?.trim() ?? charName,
              directAppType: html.querySelector("input[name='lv-apptype']:checked")?.value ?? "pc",
              directHost:    (() => {
                const t = html.querySelector("input[name='lv-apptype']:checked")?.value ?? "pc";
                return t === "pc" ? "127-0-0-1.lovense.club" : (html.querySelector("#lv-direct-host")?.value?.trim() ?? "127-0-0-1.lovense.club");
              })(),
              directPort:    parseInt(html.querySelector("#lv-direct-port")?.value) || 30010,
              events: {},
              chaster: {
                enabled:        html.querySelector("#ch-enabled")?.checked ?? false,
                edge_min:       parseInt(html.querySelector("#ch-edge_min")?.value       ?? 300),
                edge_max:       parseInt(html.querySelector("#ch-edge_max")?.value       ?? 600),
                denied_min:     parseInt(html.querySelector("#ch-denied_min")?.value     ?? 60),
                denied_max:     parseInt(html.querySelector("#ch-denied_max")?.value     ?? 180),
                cum_min:        parseInt(html.querySelector("#ch-cum_min")?.value        ?? 600),
                cum_max:        parseInt(html.querySelector("#ch-cum_max")?.value        ?? 1800),
                mind_break_min: parseInt(html.querySelector("#ch-mind_break_min")?.value ?? 1800),
                mind_break_max: parseInt(html.querySelector("#ch-mind_break_max")?.value ?? 3600),
              },
            };
            html.querySelectorAll("tr[data-event]").forEach(row => {
              const k = row.dataset.event;
              ns.events[k] = {
                enabled: row.querySelector("[data-field='enabled']")?.checked ?? true,
                role:    row.querySelector("[data-field='role']")?.value     ?? "both",
                minStr:  parseInt(row.querySelector("[data-field='minStr']")?.value ?? 20),
                maxStr:  parseInt(row.querySelector("[data-field='maxStr']")?.value ?? 60),
                minDur:  parseInt(row.querySelector("[data-field='minDur']")?.value ?? 1),
                maxDur:  parseInt(row.querySelector("[data-field='maxDur']")?.value ?? 5),
              };
            });
            await game.user.setFlag(self.MODULE, self.FLAG, ns);
            ui.notifications?.info("AFLP Lovense settings saved.");
          },
        },
        {
          action: "download", label: "Download GIFT Config", cssClass: "lv-gift-only-btn",
          callback: async (ev, btn, dialog) => {
            const html = dialog.element;
            const rows = {};
            html.querySelectorAll("tr[data-event]").forEach(row => {
              const k = row.dataset.event;
              rows[k] = {
                enabled: row.querySelector("[data-field='enabled']")?.checked ?? true,
                role:    row.querySelector("[data-field='role']")?.value     ?? "both",
                minStr:  parseInt(row.querySelector("[data-field='minStr']")?.value ?? 20),
                maxStr:  parseInt(row.querySelector("[data-field='maxStr']")?.value ?? 60),
                minDur:  parseInt(row.querySelector("[data-field='minDur']")?.value ?? 1),
                maxDur:  parseInt(row.querySelector("[data-field='maxDur']")?.value ?? 5),
              };
            });
            const nameVal = html.querySelector("#lv-charname")?.value?.trim() ?? self.getCharacterName();
            const ch = {
              enabled:        html.querySelector("#ch-enabled")?.checked ?? false,
              edge_min:       parseInt(html.querySelector("#ch-edge_min")?.value       ?? 300),
              edge_max:       parseInt(html.querySelector("#ch-edge_max")?.value       ?? 600),
              denied_min:     parseInt(html.querySelector("#ch-denied_min")?.value     ?? 60),
              denied_max:     parseInt(html.querySelector("#ch-denied_max")?.value     ?? 180),
              cum_min:        parseInt(html.querySelector("#ch-cum_min")?.value        ?? 600),
              cum_max:        parseInt(html.querySelector("#ch-cum_max")?.value        ?? 1800),
              mind_break_min: parseInt(html.querySelector("#ch-mind_break_min")?.value ?? 1800),
              mind_break_max: parseInt(html.querySelector("#ch-mind_break_max")?.value ?? 3600),
            };
            self._downloadAflpYaml(nameVal, rows, ch);
            self._downloadToyMapYaml(nameVal, rows);
          },
        },
        { action: "cancel", label: "Cancel", callback: async () => {} },
      ],
      close: async () => {},
    });
  },

  // ── YAML generation (GIFT mode) ───────────────────────────────────────────

  _downloadAflpYaml(charName, rows, ch) {
    const L = [
      "# AFLP 5.3 Lovense Integration — GIFT config",
      "# Generated by AFLP in-game settings",
      "# Place in: AFLP_Lovense_Integration/data/events/games/ardisfoxxslewdpf2e/",
      "",
    ];

    for (const [key, def] of Object.entries(this.EVENTS)) {
      const row = rows[key];
      if (row && !row.enabled) continue;
      const minStr = row?.minStr ?? def.defMinStr ?? 20;
      const maxStr = row?.maxStr ?? def.defMaxStr ?? 60;
      const minDur = row?.minDur ?? def.defMinDur ?? 1;
      const maxDur = row?.maxDur ?? def.defMaxDur ?? 5;

      if (def.special === "sex_start") {
        L.push(`- ${def.label}:`, `    regex: .+${charName}, ${def.logKey}*`, `    function: sex_start`, `    group: default`, `    case_sensitive: False`, `    toy_class: vibrator`, "");
      } else if (def.special === "sex_end") {
        L.push(`- ${def.label}:`, `    regex: .+${charName}, ${def.logKey}*`, `    function: sex_end`, `    group: default`, `    case_sensitive: False`, `    toy_class: vibrator`, "");
      } else {
        L.push(`- ${def.label}:`, `    regex: .+${charName}, ${def.logKey}+`);
        L.push(`    function: generic_random_vibrate`, `    toy_class: vibrator`, `    params:`,
               `        min_duration: ${minDur}`, `        max_duration: ${maxDur}`,
               `        min_strength: ${minStr}`, `        max_strength: ${maxStr}`, "");
      }
    }

    if (ch?.enabled) {
      L.push("# Chaster time penalties", "");
      for (const [key, label, logKey, minK, maxK] of [
        ["edge",       "Edged (Chaster)",      "AFLP Edged",  "edge_min",       "edge_max"      ],
        ["denied",     "Denied (Chaster)",     "Denied",      "denied_min",     "denied_max"    ],
        ["cum",        "Cum (Chaster)",        "AFLP Cummed", "cum_min",        "cum_max"       ],
        ["mind_break", "Mind Break (Chaster)", "Mind Break",  "mind_break_min", "mind_break_max"],
      ]) {
        if (rows[key] && !rows[key].enabled) continue;
        L.push(`- ${label}:`, `    regex: .+${charName}, ${logKey}+`, `    function: generic_chaster_add_time`,
               `    params:`, `        min_time: '${ch[minK]}'`, `        max_time: '${ch[maxK]}'`, "");
      }
    }

    this._dl("aflp.yaml", L.join("\n"));
    ui.notifications?.info("aflp.yaml downloaded — place in AFLP_Lovense_Integration/data/events/games/ardisfoxxslewdpf2e/");
  },

  _downloadToyMapYaml(charName, rows) {
    const L = [
      "# AFLP 5.3 toy-event-map.yaml",
      "# Rename primary_toy and secondary_toy to match exact toy names shown in GIFT.",
      "# Place in: AFLP_Lovense_Integration/",
      "",
    ];
    const P = "primary_toy", S = "secondary_toy";
    for (const [key, def] of Object.entries(this.EVENTS)) {
      const row = rows[key];
      if (row && !row.enabled) continue;
      const role = row?.role ?? "both";
      const toys = role === "both" ? [P, S] : role === "primary" ? [P] : role === "secondary" ? [S] : [];
      if (!toys.length) continue;
      const mapKey = `data_events_games_ardisfoxxslewdpf2e_aflp.yaml_${def.label}`;
      L.push(`${mapKey}:`);
      toys.forEach(t => L.push(`- ${t}`));
      L.push("");
    }
    this._dl("toy-event-map.yaml", L.join("\n"));
    ui.notifications?.info("toy-event-map.yaml downloaded — rename toy names to match GIFT");
  },

  _dl(name, content) {
    saveDataToFile(content, "text/plain", name);
  },

  // ── Setup Wizard ──────────────────────────────────────────────────────────
  // Shown on first use (no saved mode) or when user clicks "Re-run Setup"
  // Guides user through choosing and configuring their integration mode.

  async openWizard() {
    const isHttps = window.location.protocol === "https:";
    const self    = this;
    const owned   = game.actors?.filter(a => a.isOwner && a.type === "character") ?? [];
    const charName = this.getCharacterName();
    const actorOpts = owned.map(a =>
      `<option value="${a.name}" ${a.name === charName ? "selected" : ""}>${a.name}</option>`
    ).join("");
    const charSelect = owned.length > 0
      ? `<select id="wiz-charname" style="background:#1a1a1a;border:1px solid #c9a96e44;color:#ddd;padding:3px 8px;font-size:13px;border-radius:3px;">${actorOpts}</select>`
      : `<input id="wiz-charname" type="text" value="${charName}" placeholder="Your character name" style="background:#1a1a1a;border:1px solid #c9a96e44;color:#ddd;padding:3px 8px;font-size:13px;border-radius:3px;width:180px;"/>`;

    // ── Step renderers ──────────────────────────────────────────────────────

    const stepHint = (text) => `<p style="font-size:11px;color:#888;margin:0 0 16px;">${text}</p>`;

    const optCard = (id, title, badge, desc, recommended) => `
<label id="${id}" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:6px;
  border:2px solid ${recommended ? "#c9a96e88" : "#c9a96e22"};background:${recommended ? "#2a1e10" : "#1a1410"};
  cursor:pointer;margin-bottom:8px;user-select:none;" data-optcard="${id}">
  <input type="radio" name="wiz-mode" value="${id}" ${recommended ? "checked" : ""} style="margin-top:3px;flex-shrink:0;"/>
  <div style="flex:1;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
      <span style="font-size:13px;font-weight:600;color:#c9a96e;">${title}</span>
      <span style="font-size:10px;padding:1px 6px;border-radius:10px;background:${recommended ? "#c9a96e33" : "#ffffff11"};color:${recommended ? "#c9a96e" : "#888"};">${badge}</span>
    </div>
    <div style="font-size:11px;color:#aaa;line-height:1.5;">${desc}</div>
  </div>
</label>`;

    const step1Html = `
<div>
  <div style="text-align:center;margin-bottom:14px;">
    <div style="font-size:16px;font-weight:700;color:#c9a96e;margin-bottom:4px;">How do you want to connect?</div>
    ${isHttps
      ? stepHint("Your Foundry instance is on <strong style='color:#8aca8e;'>HTTPS</strong> — all three options are available. Lovense Remote Direct is the easiest.")
      : stepHint("Your Foundry instance is on <strong style='color:#f0a04a;'>HTTP</strong> — Lovense Remote Direct requires HTTPS, so GIFT is recommended.")}
  </div>
  ${optCard("direct", "Lovense Remote Direct", isHttps ? "✅ Recommended" : "⚠️ Requires HTTPS",
    "Connects directly to the Lovense Remote app on your PC or phone. No extra software. Fastest response.",
    isHttps)}
  ${optCard("gift", "GIFT (GameInterfaceForToys)", isHttps ? "Also available" : "✅ Recommended",
    "Free Windows app that reads Foundry's console log and fires your toy. Works on HTTP. Also supports Chaster digital chastity.",
    !isHttps)}
  ${optCard("both", "Both",  "Advanced",
    "Use Lovense Remote Direct for fast toy response <em>and</em> GIFT for Chaster lock penalties. Requires HTTPS.",
    false)}
</div>`;

    const step2DirectHtml = (appType = "pc", mobileIp = "") => `
<div>
  <div style="font-size:16px;font-weight:700;color:#c9a96e;margin-bottom:4px;text-align:center;">Connect Lovense Remote</div>
  ${stepHint("Choose how you're running the Lovense Remote app.")}
  <div style="display:flex;gap:8px;margin-bottom:12px;">
    <label id="wiz-apptype-pc" style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:5px;border:2px solid ${appType === "pc" ? "#c9a96e88" : "#c9a96e22"};background:${appType === "pc" ? "#2a1e10" : "#1a1410"};cursor:pointer;flex:1;" data-apptype="pc">
      <input type="radio" name="wiz-apptype" value="pc" ${appType === "pc" ? "checked" : ""} style="margin-top:2px;"/>
      <div><div style="font-size:12px;font-weight:600;color:#c9a96e;">PC App</div><div style="font-size:10px;color:#888;">Lovense Remote running on the same PC as Foundry</div></div>
    </label>
    <label id="wiz-apptype-mobile" style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:5px;border:2px solid ${appType === "mobile" ? "#c9a96e88" : "#c9a96e22"};background:${appType === "mobile" ? "#2a1e10" : "#1a1410"};cursor:pointer;flex:1;" data-apptype="mobile">
      <input type="radio" name="wiz-apptype" value="mobile" ${appType === "mobile" ? "checked" : ""} style="margin-top:2px;"/>
      <div><div style="font-size:12px;font-weight:600;color:#c9a96e;">Phone App</div><div style="font-size:10px;color:#888;">Lovense Remote on iOS or Android, same WiFi network</div></div>
    </label>
  </div>
  <div id="wiz-mobile-ip" style="display:${appType === "mobile" ? "block" : "none"};margin-bottom:10px;padding:8px 10px;background:#1a1410;border:1px solid #c9a96e22;border-radius:4px;">
    <div style="font-size:11px;color:#c9a96e;font-weight:600;margin-bottom:4px;">In Lovense Remote on your phone:</div>
    <div style="font-size:11px;color:#aaa;margin-bottom:8px;">Tap <strong>Me → Settings → Game Mode</strong> and enable it. Your IP address and port will appear.</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <label style="font-size:12px;color:#ddd;">IP Address:</label>
      <input id="wiz-mobile-host" type="text" value="${mobileIp}" placeholder="e.g. 192.168.1.42" style="background:#1a1a1a;border:1px solid #c9a96e44;color:#ddd;padding:3px 8px;font-size:12px;border-radius:3px;width:150px;"/>
      <label style="font-size:12px;color:#ddd;">Port:</label>
      <input id="wiz-mobile-port" type="number" value="30010" style="background:#1a1a1a;border:1px solid #c9a96e44;color:#ddd;padding:3px 8px;font-size:12px;border-radius:3px;width:70px;"/>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <button id="wiz-test-direct" style="padding:4px 14px;cursor:pointer;background:#1a2a1a;border:1px solid #5a9a5a55;color:#8aca8e;border-radius:4px;font-size:12px;">Test Connection</button>
    <span id="wiz-direct-status" style="font-size:11px;color:#666;">Make sure Lovense Remote is open and Game Mode is enabled.</span>
  </div>
</div>`;

    const step2GiftHtml = (isNew = true) => `
<div>
  <div style="font-size:16px;font-weight:700;color:#c9a96e;margin-bottom:4px;text-align:center;">Set up GIFT</div>
  <div style="display:flex;gap:8px;margin-bottom:12px;">
    <label id="wiz-gift-new" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:5px;border:2px solid ${isNew ? "#c9a96e88" : "#c9a96e22"};background:${isNew ? "#2a1e10" : "#1a1410"};cursor:pointer;flex:1;">
      <input type="radio" name="wiz-giftnew" value="new" ${isNew ? "checked" : ""}/>
      <span style="font-size:12px;color:#c9a96e;font-weight:600;">New to GIFT</span>
    </label>
    <label id="wiz-gift-existing" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:5px;border:2px solid ${!isNew ? "#c9a96e88" : "#c9a96e22"};background:${!isNew ? "#2a1e10" : "#1a1410"};cursor:pointer;flex:1;">
      <input type="radio" name="wiz-giftnew" value="existing" ${!isNew ? "checked" : ""}/>
      <span style="font-size:12px;color:#c9a96e;font-weight:600;">Already have GIFT</span>
    </label>
  </div>
  <div id="wiz-gift-new-content" style="display:${isNew ? "block" : "none"};">
    <div style="background:#1a1410;border:1px solid #c9a96e22;border-radius:4px;padding:10px 12px;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:600;color:#c9a96e;margin-bottom:6px;">Setup steps:</div>
      <ol style="margin:0;padding-left:18px;font-size:12px;color:#ccc;line-height:2;">
        <li>Download and extract <a href="https://github.com/MinLL/GameInterfaceForToys/releases/latest" target="_blank" style="color:#c9a96e;">GameInterfaceForToys</a> to a permanent folder</li>
        <li>Download your <strong style="color:#c9a96e;">AFLP Config Pack</strong> below and extract into that folder</li>
        <li>Launch GIFT, click Configuration, set your log file path</li>
        <li>Select Lovense as your toy type, enter your Lovense host IP</li>
        <li>Save and your toy should respond to in-game events</li>
      </ol>
    </div>
  </div>
  <div id="wiz-gift-existing-content" style="display:${!isNew ? "block" : "none"};">
    <div style="background:#1a1410;border:1px solid #c9a96e22;border-radius:4px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:#ccc;">
      Download the config files below and drop them into your GIFT installation folder, replacing the existing ones. Then restart GIFT.
    </div>
  </div>
  <div style="margin-bottom:10px;">
    <div style="font-size:11px;color:#888;margin-bottom:6px;">Your character name (must match GIFT_ACTOR_NAME in settings.yaml):</div>
    <div style="display:flex;align-items:center;gap:8px;">${charSelect}</div>
  </div>
  <button id="wiz-dl-gift-pack" style="padding:5px 16px;cursor:pointer;background:#2a1e10;border:1px solid #c9a96e55;color:#c9a96e;border-radius:4px;font-size:12px;font-weight:600;">⬇ Download AFLP Config Pack</button>
  <div style="font-size:10px;color:#666;margin-top:5px;" id="wiz-dl-status"></div>
</div>`;

    const stepDoneHtml = (mode) => `
<div style="text-align:center;">
  <div style="font-size:32px;margin-bottom:8px;">✅</div>
  <div style="font-size:16px;font-weight:700;color:#c9a96e;margin-bottom:8px;">You're all set!</div>
  <p style="font-size:12px;color:#aaa;margin-bottom:16px;">
    Mode saved: <strong style="color:#c9a96e;">${{gift:"GIFT",direct:"Lovense Remote Direct",both:"Both"}[mode] ?? mode}</strong>.<br/>
    Use the <strong>🖤 settings button</strong> any time to adjust event intensity and duration.
  </p>
</div>`;

    // ── Wizard state machine ────────────────────────────────────────────────
    let step = "choose";  // choose | direct | gift | both_direct | both_gift | done
    let chosenMode = isHttps ? "direct" : "gift";
    let directAppType = "pc";
    let mobileIp = "";
    let giftIsNew = true;
    let finalMode = chosenMode;

    const getContent = () => {
      if (step === "choose")      return step1Html;
      if (step === "direct")      return step2DirectHtml(directAppType, mobileIp);
      if (step === "gift")        return step2GiftHtml(giftIsNew);
      if (step === "both_direct") return `<div><div style="font-size:12px;color:#c9a96e;margin-bottom:12px;font-weight:600;">Step 1 of 2 — Connect Lovense Remote Direct</div>${step2DirectHtml(directAppType, mobileIp).replace(/<div>/, "").replace(/<\/div>\s*$/, "")}</div>`;
      if (step === "both_gift")   return `<div><div style="font-size:12px;color:#c9a96e;margin-bottom:12px;font-weight:600;">Step 2 of 2 — Set up GIFT</div>${step2GiftHtml(giftIsNew).replace(/<div>/, "").replace(/<\/div>\s*$/, "")}</div>`;
      if (step === "done")        return stepDoneHtml(finalMode);
      return step1Html;
    };

    const getButtons = () => {
      if (step === "done") return [{ action: "close", label: "Open Settings", default: true, callback: async () => { await self.openSettings(); } }, { action: "finish", label: "Done", callback: async () => {} }];
      if (step === "choose") return [{ action: "next", label: "Next →", default: true, callback: async () => {} }, { action: "cancel", label: "Skip — take me to settings", callback: async () => { await self.openSettings(); } }];
      return [{ action: "back", label: "← Back", callback: async () => {} }, { action: "next", label: step.includes("gift") ? "Save & Finish" : "Next →", default: true, callback: async () => {} }, { action: "cancel", label: "Skip", callback: async () => { await self.openSettings(); } }];
    };

    // Use a live-updating wrapper dialog
    const showStep = async () => {
      await foundry.applications.api.DialogV2.wait({
        window: { title: "AFLP Lovense — Setup Wizard", resizable: true },
        content: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#ddd;max-width:540px;" id="wiz-root">${getContent()}</div>`,
        render(ev, dialog) {
          const html = dialog.element;
          const root = html.querySelector("#wiz-root");
          // Scroll to top
          const wc = html.closest(".application.dialog")?.querySelector(".window-content") ?? html.parentElement;
          if (wc) { wc.style.overflowY = "auto"; wc.scrollTop = 0; }

          // Step 1 — mode option card clicks
          root?.querySelectorAll("[data-optcard]").forEach(card => {
            card.addEventListener("click", () => {
              const r = card.querySelector("input[type='radio']");
              if (r) { r.checked = true; chosenMode = r.value; }
              root.querySelectorAll("[data-optcard]").forEach(c => {
                const sel = c === card;
                c.style.borderColor = sel ? "#c9a96e88" : "#c9a96e22";
                c.style.background  = sel ? "#2a1e10"   : "#1a1410";
              });
            });
          });

          // Step 2 direct — app type toggle
          root?.querySelectorAll("[data-apptype]").forEach(card => {
            card.addEventListener("click", () => {
              const r = card.querySelector("input[type='radio']");
              if (r) { r.checked = true; directAppType = r.value; }
              root.querySelectorAll("[data-apptype]").forEach(c => {
                const sel = c === card;
                c.style.borderColor = sel ? "#c9a96e88" : "#c9a96e22";
                c.style.background  = sel ? "#2a1e10"   : "#1a1410";
              });
              const mobileDiv = root.querySelector("#wiz-mobile-ip");
              if (mobileDiv) mobileDiv.style.display = (directAppType === "mobile") ? "block" : "none";
            });
          });

          // Step 2 direct — test button
          root?.querySelector("#wiz-test-direct")?.addEventListener("click", async () => {
            const host = directAppType === "pc" ? "127-0-0-1.lovense.club" : (root.querySelector("#wiz-mobile-host")?.value?.trim() || "");
            const port = parseInt(root.querySelector("#wiz-mobile-port")?.value || "30010");
            const statusEl = root.querySelector("#wiz-direct-status");
            if (!host) { if (statusEl) { statusEl.textContent = "Enter your phone IP first."; statusEl.style.color = "#ca8a8e"; } return; }
            if (statusEl) statusEl.textContent = "Testing...";
            mobileIp = host;
            const result = await self.testDirectConnection(host, port);
            if (statusEl) { statusEl.textContent = result.msg; statusEl.style.color = result.ok ? "#8aca8e" : "#ca8a8e"; }
          });

          // Step 2 gift — new/existing toggle
          root?.querySelectorAll("input[name='wiz-giftnew']")?.forEach(r => {
            r.addEventListener("change", () => {
              giftIsNew = r.value === "new";
              root.querySelector("#wiz-gift-new-content").style.display     = giftIsNew ? "block" : "none";
              root.querySelector("#wiz-gift-existing-content").style.display = giftIsNew ? "none"  : "block";
              root.querySelectorAll("[id^='wiz-gift-']").forEach(lbl => {
                if (!lbl.id.includes("content") && !lbl.id.includes("status") && !lbl.id.includes("dl")) {
                  const sel = lbl.id === `wiz-gift-${r.value}`;
                  lbl.style.borderColor = sel ? "#c9a96e88" : "#c9a96e22";
                  lbl.style.background  = sel ? "#2a1e10"   : "#1a1410";
                }
              });
            });
          });

          // Step 2 gift — download pack
          root?.querySelector("#wiz-dl-gift-pack")?.addEventListener("click", () => {
            const name = root.querySelector("#wiz-charname")?.value?.trim() || self.getCharacterName();
            const statusEl = root.querySelector("#wiz-dl-status");
            self._downloadGiftConfigPack(name);
            if (statusEl) { statusEl.textContent = "3 files downloaded — aflp.yaml, toy-event-map.yaml, AFLP_GIFT_README.txt"; statusEl.style.color = "#8aca8e"; }
          });
        },
        buttons: getButtons(),
        close: async () => {},
      }).then(async (action) => {
        if (action === "cancel" || action === "close" || action === "finish") return;
        if (action === "back") {
          // Navigate back
          if (step === "direct" || step === "gift") step = "choose";
          else if (step === "both_direct") step = "choose";
          else if (step === "both_gift")   step = "both_direct";
          else if (step === "done")        step = "choose";
          await showStep();
          return;
        }
        if (action === "next") {
          if (step === "choose") {
            if      (chosenMode === "direct") step = "direct";
            else if (chosenMode === "gift")   step = "gift";
            else                              step = "both_direct";
          } else if (step === "direct") {
            finalMode = "direct";
            const dHost = directAppType === "pc" ? "127-0-0-1.lovense.club" : mobileIp;
            await game.user.setFlag(self.MODULE, self.FLAG, { ...(self.getSettings()), mode: "direct", directAppType, directHost: dHost, directPort: 30010 });
            step = "done";
          } else if (step === "gift") {
            finalMode = "gift";
            await game.user.setFlag(self.MODULE, self.FLAG, { ...(self.getSettings()), mode: "gift" });
            step = "done";
          } else if (step === "both_direct") {
            step = "both_gift";
          } else if (step === "both_gift") {
            finalMode = "both";
            const dHost = directAppType === "pc" ? "127-0-0-1.lovense.club" : mobileIp;
            await game.user.setFlag(self.MODULE, self.FLAG, { ...(self.getSettings()), mode: "both", directAppType, directHost: dHost, directPort: 30010 });
            step = "done";
          }
          await showStep();
        }
      });
    };

    await showStep();
  },

  // Generate the GIFT config pack — 3 sequential file downloads
  _downloadGiftConfigPack(charName) {
    // Generates with defaults — full customisation available in main settings
    const defaultRows = {};
    for (const [key, def] of Object.entries(this.EVENTS)) {
      defaultRows[key] = { enabled: true, role: "both", minStr: def.defMinStr ?? 20, maxStr: def.defMaxStr ?? 60, minDur: def.defMinDur ?? 1, maxDur: def.defMaxDur ?? 5 };
    }
    // Download aflp.yaml
    this._downloadAflpYaml(charName, defaultRows, { enabled: false });
    // Download toy-event-map.yaml
    this._downloadToyMapYaml(charName, defaultRows);
    // Download README
    const readme = this._buildGiftReadme(charName);
    this._dl("AFLP_GIFT_README.txt", readme);
  },

  _buildGiftReadme(charName) {
    return `AFLP — GameInterfaceForToys Setup Guide
========================================

This pack was generated for character: ${charName}

FILES IN THIS PACK
------------------
aflp.yaml         — Drop into: GIFT\\data\\events\\games\\ardisfoxxslewdpf2e\\
toy-event-map.yaml — Drop into: GIFT\\ (root folder, replace existing)
AFLP_GIFT_README.txt — This file

STEP 1 — DOWNLOAD GIFT
-----------------------
Download the latest GameInterfaceForToys release from:
https://github.com/MinLL/GameInterfaceForToys/releases/latest

Extract to a permanent folder, e.g. C:\\GIFT\\

STEP 2 — INSTALL YOUR CONFIG FILES
-----------------------------------
1. Copy aflp.yaml to:
   C:\\GIFT\\data\\events\\games\\ardisfoxxslewdpf2e\\aflp.yaml
   (Replace the existing file)

2. Open toy-event-map.yaml in a text editor.
   Replace "primary_toy" and "secondary_toy" with the exact toy names
   shown in GIFT's toy list. Example — if your toy is named "hush":
     data_events_games_ardisfoxxslewdpf2e_aflp.yaml_Cum:
     - hush

3. Copy toy-event-map.yaml to:
   C:\\GIFT\\toy-event-map.yaml
   (Replace the existing file)

STEP 3 — CONFIGURE GIFT
------------------------
1. Launch GameInterfaceForToys.exe
2. Click Configuration
3. Log File: click "Select Log File" and find your browser's debug log.
   You MUST use the browser shortcut in the GIFT folder that enables logging:
   "Browser - Chrome with Logging.lnk" or "Browser - Edge with Logging.lnk"
   Default log path (Chrome):
   C:\\Users\\YourName\\AppData\\Local\\Google\\Chrome\\User Data\\chrome_debug.log

4. Character Name: enter exactly: ${charName}
   (This must match what you entered in AFLP Lovense settings)

5. Toy Type: select Lovense
6. Lovense Host:
   - If Lovense Remote is on the same PC: 127.0.0.1:20010
   - If using the Lovense Remote phone app (same WiFi):
     Enter the IP shown in Lovense Remote > Me > Settings > Game Mode

7. Click Save. GIFT will restart with your settings.

STEP 4 — TEST IT
-----------------
1. Open Foundry in the GIFT logging browser (NOT your regular browser)
2. Open a character sheet, go to the AFLP tab, click the heart button
3. Click "Test Connection" — your toy should buzz

TROUBLESHOOTING
---------------
- Toy not responding: make sure you opened Foundry in the logging browser
- Wrong character firing: check character name matches exactly (case sensitive)
- GIFT not seeing events: check the log file path in GIFT is correct

For more help, visit the AFLP Discord at https://subscribestar.adult/ardisfoxxart
`;
  },

}; // end window.AFLP_Lovense

// Connection test on world load
Hooks.once("ready", () => {
  setTimeout(() => { if (window.AFLP_Lovense?.isEnabled?.()) AFLP_Lovense.emitConnectionTest(); }, 3000);
});

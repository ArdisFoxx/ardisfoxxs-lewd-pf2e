// ===============================
// AFLP H Scene Card System
// ===============================
// Manages on-screen visual novel style H Scene cards.
// Multiple concurrent scenes supported — active combat turn
// is foregrounded, others minimised to a pip in the corner.
//
// Public API:
//   AFLP.HScene.startScene(attackerToken, targetToken)
//   AFLP.HScene.addAttacker(targetActorId, newAttackerToken)
//   AFLP.HScene.removeParticipant(targetId, tokenId) — remove one actor; closes if last attacker or target leaves
//   AFLP.HScene.addProse(targetActorId, text, type)  — type: "action"|"flavor"|"gm"
//   AFLP.HScene.triggerShake(actorId)
//   AFLP.HScene.closeScene(targetActorId)
//   AFLP.HScene.closeAll()

if (!window.AFLP) window.AFLP = {};

// -----------------------------------------------
// Prose flavour line generator
// -----------------------------------------------
AFLP.HScene = (() => {

  // ── Cumflation status word (for HUD display and sheet) ─────────────────────
  // Based on total tier sum across all holes (max 32).
  // Labels are configurable via Module Settings → Edit Cumflation Labels.
  const CF_LABEL_DEFAULTS = [
    { min: 1,  max: 7,  word: "LEAKING",     color: "rgba(200,160,80,0.9)",  glow: "rgba(200,160,80,0.4)" },
    { min: 8,  max: 15, word: "STRETCHED",   color: "rgba(220,130,60,0.9)",  glow: "rgba(220,130,60,0.4)" },
    { min: 16, max: 23, word: "CUMBUCKET",   color: "rgba(220,90,120,0.95)", glow: "rgba(220,90,120,0.5)" },
    { min: 24, max: 31, word: "CUMPREGNANT", color: "rgba(230,60,80,1)",     glow: "rgba(230,60,80,0.6)" },
    { min: 32, max: 32, word: "CUMTOILET", color: "rgba(255,40,60,1)",     glow: "rgba(255,40,60,0.7)" },
  ];

  function _getCFLabels() {
    try {
      const raw = game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CF_LABELS) ?? "";
      if (!raw) return CF_LABEL_DEFAULTS;
      const custom = JSON.parse(raw);
      // Merge: custom labels replace defaults by index
      return CF_LABEL_DEFAULTS.map((def, i) => ({
        ...def,
        word: custom[i]?.word || def.word,
      }));
    } catch { return CF_LABEL_DEFAULTS; }
  }

  function _cumflationWord(totalSum) {
    if (totalSum <= 0) return null;
    const labels = _getCFLabels();
    const match = labels.find(l => totalSum >= l.min && totalSum <= l.max)
                ?? labels[labels.length - 1];
    return match;
  }

  AFLP.cumflationWord = function(actor) {
    const c = actor.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? {};
    const total = (c.anal ?? 0) + (c.oral ?? 0) + (c.vaginal ?? 0) + (c.facial ?? 0);
    return _cumflationWord(total);
  };

  // Active scenes keyed by target token ID
  const _scenes = new Map();
  const _pendingReveal = new Map();

  // ── Scene persistence (survives reloads, mirrors combat tracking behaviour) ──
  let _saveTimeout = null;
  function _saveSceneState() {
    if (!game.user.isGM) return;
    // Debounce: rapid successive calls (e.g. adding 3 monsters quickly, or a
    // position prompt resolving just after addAttacker) collapse into one write
    // with the final state, preventing race conditions with game.settings.set.
    clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => {
      const data = [];
      for (const scene of _scenes.values()) {
        data.push({
          targetId:      scene.targetId,
          targetActorId: scene.targetActorId,
          targetName:    scene.targetName,
          targetImg:     scene.targetImg,
          attackers:     (scene.attackers ?? []).map(a => ({
            id: a.id, actorId: a.actorId, name: a.name, img: a.img, position: a.position ?? null,
          })),
          orgasms:          scene.orgasms ?? {},
          manualHoles:      scene.manualHoles ?? {},
          damageTaken:      scene.damageTaken ?? 0,
          damageDealt:      scene.damageDealt ?? 0,
          bondageRounds:    scene.bondageRounds ?? 0,
          restrainedRounds: scene.restrainedRounds ?? 0,
          airlockRounds:    scene.airlockRounds ?? 0,
          loadsReceived:    scene.loadsReceived ?? 0,
          loadsByHole:      scene.loadsByHole ?? {},
          creaturesFucked:  [...(scene.creaturesFucked ?? [])],
        });
      }
      game.settings.set(AFLP.Settings.ID, "hsceneActiveScenes", JSON.stringify(data)).catch(() => {});
    }, 400);
  }

  async function _restoreSceneState() {
    if (!game.user.isGM) return;
    let raw;
    try { raw = game.settings.get(AFLP.Settings.ID, "hsceneActiveScenes"); } catch { return; }
    if (!raw) return;
    let saved;
    try { saved = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(saved) || saved.length === 0) return;

    _ensureContainer();
    for (const sc of saved) {
      if (!sc.targetId || !sc.attackers?.length) continue;
      // Skip if already open (e.g. restored by socket from another client first)
      if (_scenes.has(sc.targetId)) continue;
      const scene = {
        targetId:         sc.targetId,
        targetActorId:    sc.targetActorId,
        targetName:       sc.targetName,
        targetImg:        sc.targetImg,
        targetTokenDoc:   null,
        attackers:        sc.attackers.map(a => ({
          id: a.id, actorId: a.actorId, name: a.name, img: a.img,
          position: a.position ?? null, tokenDoc: null,
        })),
        log:              [],
        orgasms:          sc.orgasms ?? {},
        manualHoles:      sc.manualHoles ?? {},
        damageTaken:      sc.damageTaken ?? 0,
        damageDealt:      sc.damageDealt ?? 0,
        bondageRounds:    sc.bondageRounds ?? 0,
        restrainedRounds: sc.restrainedRounds ?? 0,
        airlockRounds:    sc.airlockRounds ?? 0,
        loadsReceived:    sc.loadsReceived ?? 0,
        loadsByHole:      sc.loadsByHole ?? {},
        creaturesFucked:  new Set(sc.creaturesFucked ?? []),
      };
      _scenes.set(sc.targetId, scene);
      const card = _buildCard(scene);
      _container.appendChild(card);
      _container.style.display = "flex";
      AFLP.HScene.revealCard(sc.targetId);
    }
    _updateContainerWidth();

    // Re-broadcast all restored scenes so any already-connected clients catch up
    for (const scene of _scenes.values()) {
      for (let i = 0; i < scene.attackers.length; i++) {
        const atk = scene.attackers[i];
        const type = i === 0 ? "hscene-start" : "hscene-add-attacker";
        if (i === 0) {
          game.socket.emit("module.ardisfoxxs-lewd-pf2e", {
            type,
            attacker: atk,
            target: { id: scene.targetId, actorId: scene.targetActorId, name: scene.targetName, img: scene.targetImg },
          });
        } else {
          game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type, targetId: scene.targetId, attacker: atk });
        }
      }
    }
  } // targetId -> reveal fn, for SA to call

  // Resolve the live actor for a scene participant.
  // Prefers tokenDoc (set on the launching client); falls back to canvas token
  // lookup by token ID, then world actor collection.
  function _resolveActor(participant) {
    if (participant.tokenDoc) return participant.tokenDoc.actor ?? null;
    const token = canvas?.tokens?.get(participant.id);
    if (token?.actor) return token.actor;
    return game.actors.get(participant.actorId ?? participant.id) ?? null;
  }

  // Build a participant descriptor from a live Foundry Token placeable.
  function _participantFromToken(token) {
    return {
      id:       token.id,
      actorId:  token.actor?.id ?? token.actorId,
      name:     token.actor?.name ?? token.name,
      img:      token.actor?.img  ?? token.document?.texture?.src ?? "",
      tokenDoc: token.document ?? null,   // client-local reference; not sent over socket
    };
  }

  // Root container injected once into #ui-top
  let _container = null;

  // -----------------------------------------------
  // Flavour prose generator
  // Returns a string or null if flavor disabled.
  // -----------------------------------------------
  function _generateProse(type, attackerActor, targetActor) {
    if (!AFLP.Settings.proseFlavor) return null;

    const attackerName = attackerActor?.name ?? "???";
    const targetName   = targetActor?.name   ?? "???";
    const hasCock      = !!attackerActor?.getFlag(AFLP.FLAG_SCOPE, "cock");
    const hasPussy     = !!attackerActor?.getFlag(AFLP.FLAG_SCOPE, "pussy");
    const targetHasPussy = !!targetActor?.getFlag(AFLP.FLAG_SCOPE, "pussy");
    const targetHasCock  = !!targetActor?.getFlag(AFLP.FLAG_SCOPE, "cock");

    if (type === "struggle-snuggle") {
      const lines = [
        `${attackerName} wraps powerful limbs around ${targetName}, dragging them into a tight, inescapable embrace.`,
        `${attackerName} forces ${targetName} down, pinning them with practiced ease.`,
        `${targetName} struggles, but ${attackerName}'s grip is iron  -  there's no getting away.`,
        `With a predatory grin, ${attackerName} pulls ${targetName} close, making their intentions unmistakably clear.`,
        `${attackerName} subdues ${targetName} effortlessly, leaving them breathless and helpless.`,
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }

    if (type === "masturbation" || type?.startsWith?.("masturbation:")) {
      // Activity-specific prose when a choice is provided (e.g. "masturbation:groping-cock")
      const activity = type.includes(":") ? type.split(":")[1] : null;
      const name = attackerName;
      const hasCk = hasCock, hasPu = hasPussy;

      const byActivity = {
        "groping-cock":    [`${name} wraps a hand around themselves, stroking slowly.`, `${name} runs their fingers down their length with a quiet, shuddering exhale.`, `${name} works themselves in a steady rhythm, jaw tight.`],
        "groping-pussy":   [`${name} slides a hand between their thighs, fingers pressing gently.`, `${name} traces lazy circles over themselves, breath catching.`, `${name} touches themselves with a soft, distracted focus.`],
        "groping-ass":     [`${name} reaches behind, fingers exploring with quiet intent.`, `${name}'s hand travels back, pressing and kneading.`],
        "groping-chest":   [`${name} runs their hands over their chest, fingers curling around curves.`, `${name} kneads and squeezes, eyes half-closed.`],
        "groping-nipples": [`${name} rolls a thumb over one nipple, teeth catching their lower lip.`, `${name} teases their nipples slowly, spine arching just slightly.`],
        "fingering-pussy": [`${name} pushes two fingers inside themselves, curling just right.`, `${name} fingers themselves in slow, deliberate strokes, breath uneven.`, `${name}'s fingers work deeper, drawing a shaky exhale.`],
        "fingering-ass":   [`${name} presses a finger in slowly, other hand gripping the edge of something nearby.`, `${name} works themselves open with patient, careful fingers.`],
        "fingering-mouth": [`${name} runs their fingers over their lips, tasting themselves.`, `${name}'s fingers slide into their mouth, eyes unfocused.`],
        "toy-pussy":       [`${name} presses their toy inside with a low, controlled breath.`, `${name} works the toy deeper, hips shifting to meet it.`, `${name} rolls the toy inside themselves, catching the right angle.`],
        "toy-ass":         [`${name} works the toy in slowly, exhaling through clenched teeth.`, `${name} seats the toy fully, thighs trembling.`],
      };

      if (activity && byActivity[activity]) {
        const opts = byActivity[activity];
        return opts[Math.floor(Math.random() * opts.length)];
      }

      // Generic masturbation prose (no specific activity)
      const generic = [
        `${name} takes their time, working themselves toward the edge with practiced patience.`,
        `${name} settles into a rhythm, breathing slow and controlled.`,
        `${name} touches themselves with quiet focus, ignoring everything else.`,
        `A soft sound escapes ${name} as they find exactly the right pressure.`,
        `${name} rocks into their own touch, expression unravelling by degrees.`,
      ];
      return generic[Math.floor(Math.random() * generic.length)];
    }

    if (type === "sexual-advance") {
      const lines = [];

      if (hasCock && targetHasPussy) {
        lines.push(
          `${attackerName} drives deep into ${targetName}, drawing a helpless moan from their lips.`,
          `${targetName} trembles as ${attackerName} fills them completely, hips snapping in a relentless rhythm.`,
          `${attackerName} rocks into ${targetName} with slow, deliberate strokes that make them whimper.`,
        );
      }
      if (hasCock && !targetHasPussy) {
        lines.push(
          `${attackerName} takes ${targetName}'s mouth, the creature gagging and drooling around them.`,
          `${attackerName} uses ${targetName}'s body roughly, leaving them flushed and gasping.`,
        );
      }
      if (hasPussy && targetHasCock) {
        lines.push(
          `${targetName} finds themselves buried inside ${attackerName}, who rolls their hips with agonizing slowness.`,
          `${attackerName} grinds down onto ${targetName}, watching their expression unravel.`,
        );
      }
      if (!hasCock && !hasPussy) {
        lines.push(
          `${attackerName} works ${targetName} over with deft hands, finding every sensitive spot.`,
          `${attackerName} teases ${targetName} mercilessly, coaxing desperate sounds from them.`,
        );
      }
      // Generic fallback
      lines.push(
        `${attackerName} presses against ${targetName}, drawing out a shuddering gasp.`,
        `${targetName} can't suppress a moan as ${attackerName} finds exactly the right spot.`,
        `${attackerName} moves against ${targetName} with practiced confidence, leaving them trembling.`,
      );
      return lines[Math.floor(Math.random() * lines.length)];
    }

    return null;
  }

  // -----------------------------------------------
  // Ensure container exists in the DOM
  // -----------------------------------------------
  // Module-level helper: apply current theme to the drag handle bar
  function _applyDragHandleTheme(handle, container) {
    const th = AFLP.Settings.hsceneTheme ?? "combat-hud";
    const themes = {
      "combat-hud":   { text: "⠿ H SCENE ACTIVE ⠿",        color: "rgba(200,160,80,0.75)", bg: "rgba(200,160,80,0.10)", border: "rgba(200,160,80,0.3)",  font: "inherit" },
      "status-strip": { text: "⠿ H SCENE ACTIVE ⠿",        color: "rgba(200,160,80,0.75)", bg: "rgba(200,160,80,0.08)", border: "rgba(200,160,80,0.25)", font: "inherit" },
      "porno":        { text: "★ SCENE IN PROGRESS ★",      color: "rgba(220,100,130,0.9)", bg: "rgba(200,50,80,0.15)",  border: "rgba(200,50,80,0.4)",  font: "inherit" },
      "dossier":      { text: "// ENCOUNTER FILE — ACTIVE", color: "rgba(80,180,80,0.85)",  bg: "rgba(5,15,8,0.9)",     border: "rgba(30,80,40,0.5)",   font: "'Courier New',monospace" },
    };
    const t = themes[th] ?? themes["combat-hud"];
    if (handle) {
      handle.textContent = t.text;
      handle.style.color = t.color;
      handle.style.background = t.bg;
      handle.style.borderBottomColor = t.border;
      handle.style.fontFamily = t.font;
    }
    if (container) container.dataset.theme = th;
  }

  function _ensureContainer() {
    if (_container && document.body.contains(_container)) return _container;
    _container = document.createElement("div");
    _container.id = "aflp-hscene-container";
    _container.style.cssText = `
      position: fixed;
      top: 50px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 0;
      pointer-events: none;
      min-width: 280px;
      max-width: calc(100vw - 80px);
      width: 280px;
      max-height: 580px;
      overflow-y: auto;
      overflow-x: hidden;
      background: rgba(6,5,4,0.88);
      border: 1px solid rgba(200,160,80,0.35);
      border-radius: 6px;
      box-shadow: 0 6px 32px rgba(0,0,0,0.8);
      transition: width 0.2s ease;
    `;

    // Drag handle bar at top of container
    const dragHandle = document.createElement("div");
    dragHandle.id = "aflp-hscene-drag-handle";
    dragHandle.style.cssText = `
      pointer-events: all;
      cursor: grab;
      background: rgba(200,160,80,0.12);
      border-bottom: 1px solid rgba(200,160,80,0.3);
      border-radius: 5px 5px 0 0;
      padding: 4px 10px;
      font-size: 9px;
      color: rgba(200,160,80,0.7);
      text-align: center;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      user-select: none;
      flex-shrink: 0;
    `;
    _applyDragHandleTheme(dragHandle, _container);
    _container.appendChild(dragHandle);

    _makeDraggable(_container, dragHandle);

    // Inject stylesheet into container (not inside individual cards so it persists when cards close)
    const STYLE_ID = "aflp-hscene-styles-v2";
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById("aflp-hscene-styles")?.remove();
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = _cardCSS() + _statusStripCSS() + _pornoSceneCSS() + _dossierCSS();
    document.head.appendChild(styleEl);

    document.body.appendChild(_container);
    return _container;
  }

  // -----------------------------------------------
  // Build a scene card DOM element
  // -----------------------------------------------
  function _buildCard(scene) {
    const theme = AFLP.Settings.hsceneTheme ?? "combat-hud";
    const card = document.createElement("div");
    card.className = "aflp-hscene-card aflp-theme-" + theme;
    card.dataset.targetId = scene.targetId;
    card.style.cssText = `
      pointer-events: all;
      background: transparent;
      border: none;
      border-top: 1px solid rgba(200,160,80,0.15);
      border-radius: 0;
      overflow: visible;
      font-family: var(--font-primary, serif);
      color: #f0e8d0;
      transition: all 0.3s ease;
      position: relative;
      width: 100%;
    `;

    card.innerHTML = `
      <div class="aflp-card-inner">
        <div class="aflp-card-header">
          <div class="aflp-card-header-top">
            <div class="aflp-card-controls">
              <button type="button" class="aflp-card-btn aflp-card-minimize" title="Minimise">−</button>
              <button type="button" class="aflp-card-btn aflp-card-log-toggle" title="Show/hide scene log">📋</button>
              <select class="aflp-card-theme-select" title="UI Theme">
                <option value="combat-hud"${(AFLP.Settings.hsceneTheme==="combat-hud")?" selected":""}>Combat HUD</option>
                <option value="status-strip"${(AFLP.Settings.hsceneTheme==="status-strip")?" selected":""}>Status Strip</option>
                <option value="porno"${(AFLP.Settings.hsceneTheme==="porno")?" selected":""}>Porno Scene</option>
                <option value="dossier"${(AFLP.Settings.hsceneTheme==="dossier")?" selected":""}>Dossier File</option>
              </select>
              <select class="aflp-card-arousal-select" title="Arousal display">
                <option value="auto"${(AFLP.Settings.hsceneArousalStyle==="auto")?" selected":""}>Auto</option>
                <option value="bars"${(AFLP.Settings.hsceneArousalStyle==="bars")?" selected":""}>Bars</option>
                <option value="pips"${(AFLP.Settings.hsceneArousalStyle==="pips")?" selected":""}>Pips</option>
              </select>
              <button type="button" class="aflp-card-btn aflp-card-close" title="Close scene">✕</button>
            </div>
          </div>
          <div class="aflp-card-portraits"></div>
        </div>
        <div class="aflp-card-arousal-bars"></div>
        <div class="aflp-card-prose-area">
          <div class="aflp-card-prose-text"></div>
        </div>
        <div class="aflp-card-gm-area" style="display:${game.user.isGM ? "flex" : "none"}">
          <input class="aflp-card-gm-input" type="text" placeholder="Type flavour text and press Enter…"/>
          <button type="button" class="aflp-card-gm-send aflp-card-btn">↵</button>
        </div>
      </div>
      <div class="aflp-card-log-panel" style="display:none;">
        <div class="aflp-log-header" style="display:flex;align-items:center;justify-content:space-between;">
          <span>Scene Log</span>
          <button type="button" class="aflp-card-btn aflp-log-close" title="Close log">✕</button>
        </div>
        <div class="aflp-log-entries"></div>
      </div>
    `;

    _refreshPortraits(card, scene);
    _refreshArousalBars(card, scene);
    _bindCardListeners(card, scene);

    return card;
  }

  // -----------------------------------------------
  // CSS injected once per card (idempotent via id check)
  // -----------------------------------------------
  function _cardCSS() {
    // Returns raw CSS text — injected once into document.head by _ensureContainer.
    return `
      /* Card shell */
      .aflp-hscene-card { display:flex; flex-direction:column; position:relative; }
      .aflp-card-inner  { display:flex; flex-direction:column; flex:1; width:100%; min-width:0; overflow:hidden; }

      /* Header: tight top bar + portrait row */
      .aflp-card-header {
        display:flex; flex-direction:column;
        background:rgba(200,160,80,0.06); border-bottom:1px solid rgba(200,160,80,0.2);
        padding:4px 8px 7px; gap:4px;
      }
      .aflp-card-header-top {
        display:flex; align-items:center; justify-content:flex-end; flex-shrink:0;
      }
      .aflp-card-controls { display:flex; flex-direction:row; align-items:center; gap:4px; flex-shrink:0; }
      .aflp-card-theme-select, .aflp-card-arousal-select {
        font-size:9px; padding:1px 2px; height:18px; border-radius:2px; cursor:pointer;
        background:rgba(30,25,15,0.85); color:rgba(220,200,150,0.9);
        border:1px solid rgba(200,160,80,0.3); max-width:90px;
      }
      .aflp-card-theme-select:focus, .aflp-card-arousal-select:focus { outline:none; border-color:rgba(200,160,80,0.7); }
      .aflp-card-btn {
        background:rgba(200,160,80,0.1); border:1px solid rgba(200,160,80,0.4);
        border-radius:3px; color:rgba(200,160,80,0.85); cursor:pointer;
        font-size:12px; padding:1px 7px; line-height:1.5; font-weight:bold;
      }
      .aflp-card-btn:hover { background:rgba(200,160,80,0.25); color:#f0e8d0; }
      .aflp-card-close { border-color:rgba(200,80,60,0.6); color:rgba(220,100,80,0.85); }
      .aflp-card-close:hover { background:rgba(200,80,60,0.3); color:#fff; }

      /* Portraits VS row */
      .aflp-card-portraits {
        display:flex; align-items:flex-end; justify-content:center;
        width:100%; gap:0; overflow:visible;
      }
      /* Column-direction themes: stretch alignment so children fill full width */
      .aflp-theme-porno .aflp-card-portraits,
      .aflp-theme-status-strip .aflp-card-portraits,
      .aflp-theme-dossier .aflp-card-portraits { align-items:stretch; justify-content:flex-start; }
      .aflp-combatant {
        display:flex; flex-direction:column; align-items:center;
        gap:2px; flex:1; min-width:0; cursor:default;
      }
      .aflp-combatant.is-target   { flex:0 0 auto; padding:0 4px; display:flex; flex-direction:column; align-items:center; justify-content:center; }
      .aflp-combatant.is-attacker { cursor:pointer; }
      .aflp-combatant-portrait {
        position:relative; border-radius:4px; overflow:hidden; flex-shrink:0;
      }
      .aflp-combatant-portrait img {
        width:100%; height:100%; object-fit:cover; object-position:top;
        display:block; pointer-events:none;
      }
      .aflp-role-overlay {
        position:absolute; bottom:0; left:0; right:0;
        text-align:center; font-size:7px; letter-spacing:0.08em; font-weight:bold; padding:1px 0;
      }
      .aflp-role-overlay.dom { background:rgba(201,169,110,0.92); color:#0a0800; }
      .aflp-role-overlay.sub { background:rgba(200,60,60,0.92); color:#fff; }
      .aflp-leave-btn { display:block; margin-top:3px; padding:1px 4px; font-size:9px; line-height:1.4;
        background:rgba(180,40,40,0.75); color:#fff; border:1px solid rgba(200,80,80,0.5);
        border-radius:2px; cursor:pointer; text-align:center; letter-spacing:0.05em;
        white-space:nowrap; transition:background 0.15s; }
      .aflp-leave-btn:hover { background:rgba(220,50,50,0.95); }
      .aflp-combatant-name {
        font-size:11px; color:#c9a96e; text-align:center;
        max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:bold;
      }
      .aflp-combatant-name.sub { color:#e08080; }
      .aflp-combatant-conditions { display:flex; flex-wrap:wrap; gap:2px; justify-content:center; margin-top:1px; }
      .aflp-cond-badge {
        display:inline-block; font-size:10px; padding:2px 5px; border-radius:3px;
        line-height:14px; font-weight:700; white-space:nowrap;
      }
      .aflp-cond-badge.horny   { background:rgba(192,80,128,0.2); border:1px solid rgba(192,80,128,0.5); color:#d07090; }
      .aflp-cond-badge.exposed { background:rgba(200,160,80,0.15); border:1px solid rgba(200,160,80,0.45); color:#c8a050; }
      .aflp-cond-badge.denied  { background:rgba(128,96,192,0.2); border:1px solid rgba(128,96,192,0.5); color:#a080d0; }
      .aflp-cond-badge.orgasm  { background:rgba(64,160,112,0.2); border:1px solid rgba(64,160,112,0.5); color:#50b882; }

      .aflp-pos-chip {
        display:inline-block; padding:1px 5px; border-radius:3px;
        background:rgba(201,169,110,0.12); border:1px solid rgba(201,169,110,0.35);
        font-size:10px; color:#c9a96e; white-space:normal; text-align:center;
        line-height:1.3; max-width:90px; word-break:break-word;
      }
      .aflp-pos-chip.unset { color:#555; border-color:rgba(255,255,255,0.1); background:none; }
      .aflp-vs-divider {
        display:flex; flex-direction:column; align-items:center;
        padding:0 3px; flex-shrink:0; align-self:stretch; justify-content:center;
      }
      .aflp-vs-text { font-size:10px; color:rgba(201,169,110,0.4); font-weight:bold; }

      /* Minimised */
      .aflp-hscene-card.minimized .aflp-card-arousal-bars,
      .aflp-hscene-card.minimized .aflp-card-prose-area,
      .aflp-hscene-card.minimized .aflp-card-gm-area,
      .aflp-hscene-card.minimized .aflp-card-log-panel,
      .aflp-hscene-card.minimized .aflp-card-portraits { display:none !important; }

      /* Arousal bars/pips */
      .aflp-card-arousal-bars {
        padding:6px 10px 4px; display:flex; flex-direction:column; gap:4px;
        border-bottom:1px solid rgba(200,160,80,0.12);
      }
      .aflp-arousal-row { display:flex; align-items:center; gap:6px; }
      .aflp-arousal-name {
        width:72px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        color:#c0b090; font-weight:600; font-size:12px; flex-shrink:0;
      }
      .aflp-arousal-bar-track {
        flex:1 1 0; min-width:0; height:9px;
        background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.07);
        border-radius:3px; overflow:hidden; cursor:pointer;
      }
      .aflp-arousal-bar-fill { height:100%; border-radius:3px; transition:width 0.3s ease; }
      .aflp-arousal-bar-fill.sub-fill { background:linear-gradient(90deg,#c02828,#ff5070); }
      .aflp-arousal-bar-fill.dom-fill { background:linear-gradient(90deg,#a07820,#d4a64a); }
      .aflp-arousal-bar-fill.near-max { box-shadow:0 0 5px currentColor; }
      .aflp-arousal-pips { display:flex; gap:2px; flex:1 1 0; min-width:0; flex-wrap:nowrap; }
      .aflp-arousal-pip {
        width:10px; height:8px; border-radius:2px; flex-shrink:0;
        border:1px solid rgba(200,160,80,0.35); background:rgba(255,255,255,0.05); cursor:pointer;
      }
      .aflp-arousal-pip:hover { background:rgba(200,160,80,0.2); }
      .aflp-arousal-pip.filled { background:linear-gradient(135deg,#e05050,#c02020); border-color:#e05050; }
      .aflp-arousal-val { font-size:11px; color:#555; flex-shrink:0; min-width:28px; text-align:right; }

      /* Cumflation (always pips) */
      .aflp-cumflation-row { display:flex; align-items:center; gap:6px; font-size:10px; margin-top:1px; }
      .aflp-cumflation-label { width:72px; color:#555; font-size:9px; flex-shrink:0; }
      .aflp-cumflation-bar { display:flex; gap:2px; flex:1; }
      .aflp-cumflation-pip {
        width:10px; height:6px; border-radius:2px; flex-shrink:0;
        background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
      }
      .aflp-cumflation-pip.filled { background:rgba(220,215,200,0.55); border-color:rgba(230,225,210,0.6); }
      .aflp-cumflation-val { font-size:9px; color:#555; min-width:28px; text-align:right; }

      /* Log panel */
      .aflp-card-log-panel {
        position:absolute; top:0; left:0; right:0; bottom:0; z-index:10;
        border:1px solid rgba(200,160,80,0.5); border-radius:6px;
        display:flex; flex-direction:column; background:rgba(10,8,6,0.97); overflow:hidden;
      }
      .aflp-log-header {
        padding:4px 8px; font-size:10px; font-weight:bold; letter-spacing:0.08em;
        text-transform:uppercase; color:rgba(200,160,80,0.8);
        border-bottom:1px solid rgba(200,160,80,0.2); flex-shrink:0;
      }
      .aflp-log-entries { flex:1; overflow-y:auto; padding:4px 6px; display:flex; flex-direction:column; gap:4px; }
      .aflp-log-entry { font-size:11px; line-height:1.5; color:#c8b890; }
      .aflp-log-entry.log-action { color:#e0c050; font-weight:600; }
      .aflp-log-entry.log-gm { color:#a0c8ff; font-style:italic; }
      .aflp-log-time { color:rgba(200,160,80,0.5); font-size:10px; margin-right:8px; flex-shrink:0; }

      /* Prose + GM input */
      .aflp-card-prose-area { padding:6px 10px 4px; position:relative; min-height:28px; }
      .aflp-card-prose-text {
        font-size:15px; line-height:1.6; color:#f0e8d0; font-style:italic;
        font-family:var(--font-primary,'Palatino Linotype',Palatino,Georgia,serif);
        text-shadow:0 1px 2px rgba(0,0,0,0.6);
      }
      .aflp-card-gm-area { display:flex; gap:4px; padding:4px 8px 5px; border-top:1px solid rgba(200,160,80,0.12); }
      .aflp-card-gm-input {
        flex:1; background:rgba(255,255,255,0.07); border:1px solid rgba(200,160,80,0.3);
        border-radius:3px; color:#f0e8d0; font-size:12px; padding:3px 6px;
        font-family:var(--font-primary,serif);
      }
      .aflp-card-gm-input::placeholder { color:rgba(240,232,208,0.35); }
      .aflp-card-gm-send { padding:2px 8px; }

      /* Dialog hovers */
      .aflp-pos-choice:hover { background:rgba(200,160,80,0.18)!important; border-color:rgba(200,160,80,0.6)!important; }
      .aflp-pos-header:hover { color:rgba(200,160,80,1)!important; }
      [data-choice]:hover    { background:rgba(200,160,80,0.15)!important; border-color:rgba(200,160,80,0.7)!important; }

      /* Prose animation */
      .aflp-prose-line { display:block; animation:aflp-fadein 0.4s ease forwards; opacity:0; }
      @keyframes aflp-fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
    `;
  }

  // ─── Status Strip theme CSS (injected once alongside combat-hud CSS) ────────
  function _statusStripCSS() {
    const blue      = "rgba(100,170,255,0.9)";
    const blueDim   = "rgba(80,140,220,0.4)";
    const blueFaint = "rgba(60,100,180,0.15)";
    const bgDeep    = "rgba(8,12,28,0.96)";
    const bgMid     = "rgba(12,18,38,0.92)";
    return `
      .aflp-theme-status-strip .aflp-card-theme-select,
      .aflp-theme-status-strip .aflp-card-arousal-select {
        background: rgba(10,15,30,0.9); color: ${blue};
        border-color: ${blueDim};
      }
      .aflp-theme-porno .aflp-card-theme-select,
      .aflp-theme-porno .aflp-card-arousal-select {
        background: rgba(40,10,20,0.9); color: rgba(240,160,180,0.95);
        border-color: rgba(200,60,100,0.4);
      }
      .aflp-theme-dossier .aflp-card-theme-select,
      .aflp-theme-dossier .aflp-card-arousal-select {
        background: rgba(5,20,5,0.95); color: rgba(80,200,80,0.9);
        border-color: rgba(60,180,60,0.4); font-family: 'Courier New', monospace;
      }
      .aflp-theme-status-strip .aflp-card-header {
        padding: 0; gap: 0; background: transparent; border-bottom: none;
      }
      .aflp-theme-status-strip .aflp-card-header-top {
        padding: 4px 8px;
        background: ${bgDeep};
        border-bottom: 1px solid ${blueDim};
      }
      .aflp-theme-status-strip .aflp-card-portraits {
        display: flex; flex-direction: row; gap: 0; width: 100%;
        background: ${bgMid};
        border-bottom: 1px solid ${blueDim};
      }
      .aflp-theme-status-strip .aflp-card-btn {
        border-color: ${blueDim}; color: ${blue}; background: ${blueFaint};
      }
      .aflp-theme-status-strip .aflp-card-arousal-bars {
        background: ${bgDeep}; border-bottom: 1px solid ${blueDim};
      }
      .aflp-theme-status-strip .aflp-arousal-label { color: ${blue}; }
      .aflp-theme-status-strip .aflp-arousal-bar-track { background: rgba(20,30,60,0.8); border-color: ${blueDim}; }
      .aflp-theme-status-strip .aflp-arousal-bar-fill.dom-fill { background: linear-gradient(90deg,rgba(60,100,200,0.7),rgba(100,160,255,0.9)); }
      .aflp-theme-status-strip .aflp-arousal-bar-fill.sub-fill { background: linear-gradient(90deg,rgba(140,40,80,0.7),rgba(200,80,120,0.9)); }
      .aflp-theme-status-strip .aflp-card-prose-area { background: ${bgDeep}; border-bottom: 1px solid ${blueDim}; }
      .aflp-theme-status-strip .aflp-card-gm-area { background: ${bgDeep}; border-top: 1px solid ${blueDim}; }
      .aflp-theme-status-strip .aflp-card-gm-input {
        background: rgba(15,25,55,0.9); color: ${blue}; border-color: ${blueDim};
      }
      .aflp-theme-status-strip .aflp-log-header { color: ${blue}; background: ${bgDeep}; border-bottom: 1px solid ${blueDim}; }
      .aflp-theme-status-strip .aflp-card-log-panel { background: ${bgDeep}; }
      /* Each participant is a compact chip column */
      .aflp-ss-actor {
        flex: 1; padding: 6px 8px; border-right: 1px solid ${blueDim};
        display: flex; flex-direction: column; gap: 3px;
      }
      .aflp-ss-actor:last-child { border-right: none; }
      .aflp-ss-role-label {
        font-size: 9px; letter-spacing: 0.1em; color: rgba(100,160,255,0.45);
        text-transform: uppercase; margin-bottom: 1px;
      }
      .aflp-ss-actor-row { display: flex; align-items: center; gap: 5px; }
      .aflp-ss-mini-port {
        width: 22px; height: 22px; border-radius: 3px; overflow: hidden; flex-shrink: 0;
      }
      .aflp-ss-mini-port img { width:100%;height:100%;object-fit:cover;object-position:top;pointer-events:none;display:block; }
      .aflp-ss-name {
        font-size: 13px; color: ${blue}; font-weight: 600;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .aflp-ss-trait {
        display: inline-block; padding: 2px 6px; border-radius: 3px;
        font-size: 10px; letter-spacing: 0.04em; font-weight: 600; white-space: nowrap;
        margin-top: 2px;
      }
      .aflp-ss-trait-sub  { background: rgba(160,30,60,0.25);  color: #e06080; border: 1px solid rgba(200,60,100,0.5); }
      .aflp-ss-trait-dom  { background: ${blueFaint};           color: ${blue}; border: 1px solid ${blueDim}; }
      .aflp-ss-trait-pos  { background: rgba(20,50,120,0.2);   color: rgba(120,180,255,0.8); border: 1px solid rgba(60,100,200,0.35); font-size: 9px; }
    `;
  }

  // ─── Porno Scene theme CSS ───────────────────────────────────────────────────
  function _pornoSceneCSS() {
    return `
      .aflp-theme-porno .aflp-card-header {
        background: linear-gradient(135deg,rgba(42,5,16,0.95),rgba(26,10,8,0.95));
        border-bottom: 1px solid rgba(200,50,80,0.4); padding: 0; gap: 0;
      }
      .aflp-theme-porno .aflp-card-header-top {
        padding: 5px 10px;
        background: rgba(200,50,80,0.1);
        border-bottom: 1px solid rgba(200,50,80,0.25);
              display: flex; align-items: center; justify-content: flex-end;
      }
      .aflp-theme-porno .aflp-scene-status-label {
        color: rgba(220,100,130,0.9); text-shadow: 0 0 8px rgba(200,50,80,0.4);
        letter-spacing: 0.2em;
      }
      .aflp-theme-porno .aflp-card-btn {
        border-color: rgba(200,50,80,0.4); color: rgba(220,100,130,0.85);
        background: rgba(200,50,80,0.1);
      }
      .aflp-theme-porno .aflp-card-portraits { padding: 8px 10px; flex-direction: column; gap: 6px; width: 100%; box-sizing: border-box; }
      .aflp-po-bottom-row { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; box-sizing: border-box; overflow: hidden; }
      .aflp-po-bottom-port {
        width: 44px; height: 44px; border-radius: 4px; overflow: hidden;
        border: 1px solid rgba(200,50,80,0.5); flex-shrink: 0;
      }
      .aflp-po-bottom-port img { width:100%;height:100%;object-fit:cover;object-position:top;pointer-events:none;display:block; }
      .aflp-po-bottom-label { font-size: 9px; letter-spacing: 0.18em; color: rgba(200,80,100,0.7); text-transform: uppercase; margin-bottom: 2px; text-align: center; }
      .aflp-po-bottom-name { font-size: 15px; color: #e8b0c0; font-style: italic; font-weight: bold; text-align: center; }
      .aflp-po-bottom-role { font-size: 10px; color: rgba(180,80,100,0.7); margin-top: 1px; text-align: center; }
      .aflp-po-holes { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; justify-content: center; }
      .aflp-po-bottom-info { display: flex; flex-direction: column; align-items: center; min-width: 0; }
      .aflp-po-hole {
        padding: 2px 7px; border-radius: 2px; font-size: 9px; font-weight: bold;
        letter-spacing: 0.06em; text-transform: uppercase;
      }
      .aflp-po-hole.filled { background: rgba(200,30,60,0.25); color: #e05070; border: 1px solid rgba(200,50,80,0.5); }
      .aflp-po-hole.empty  { background: rgba(40,40,40,0.5); color: #555; border: 1px solid rgba(80,80,80,0.3); }
      .aflp-po-airlock {
        padding: 3px 8px; border: 1px solid #ff5070; border-radius: 3px;
        background: rgba(200,30,60,0.15); font-size: 9px; color: #ff5070;
        letter-spacing: 0.1em; text-align: center; font-weight: bold;
        text-transform: uppercase; margin-top: 2px;
        animation: aflp-pulse 1.5s ease-in-out infinite;
      }
      .aflp-po-cumflation-status {
        padding: 3px 8px; border-radius: 3px; font-size: 9px;
        letter-spacing: 0.12em; text-align: center; font-weight: bold;
        text-transform: uppercase; margin-top: 2px;
        animation: aflp-pulse 2.5s ease-in-out infinite;
      }
      @keyframes aflp-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
      .aflp-po-divider {
        font-size: 9px; color: rgba(150,50,70,0.5); text-align: center;
        padding: 2px 0; letter-spacing: 0.2em;
      }
      .aflp-po-dom-row { display: flex; gap: 6px; flex-wrap: wrap; width: 100%; box-sizing: border-box; }
      .aflp-po-dom-col { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; overflow: hidden; }
      .aflp-po-dom-label { font-size: 9px; letter-spacing: 0.15em; color: rgba(180,120,30,0.7); text-transform: uppercase; margin-bottom: 2px; }
      .aflp-po-dom-port {
        width: 32px; height: 32px; border-radius: 4px; overflow: hidden;
        border: 1px solid rgba(180,140,40,0.4); flex-shrink: 0;
      }
      .aflp-po-dom-port img { width:100%;height:100%;object-fit:cover;object-position:top;pointer-events:none;display:block; }
      .aflp-po-dom-name { font-size: 12px; color: #d0a860; font-style: italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .aflp-po-dom-pos  { font-size: 10px; color: rgba(160,100,20,0.8); font-style: italic; }
      .aflp-theme-porno .aflp-arousal-bar-fill.sub-fill { background: linear-gradient(90deg,#c02840,#ff4068); }
      .aflp-theme-porno .aflp-card-arousal-bars { border-bottom-color: rgba(200,50,80,0.15); }
      .aflp-theme-porno .aflp-card-gm-area { border-top-color: rgba(200,50,80,0.12); }
    `;
  }

  // ─── Dossier File theme CSS ──────────────────────────────────────────────────
  function _dossierCSS() {
    const animated = AFLP.Settings.hsceneDossierFx ?? true;
    const scanAnim = animated ? `
      @keyframes aflp-scan { 0%{transform:translateY(-100%)} 100%{transform:translateY(200%)} }
    ` : "";
    return `
      .aflp-theme-dossier {
        font-family: 'Courier New',Courier,monospace !important;
        background: rgba(5,10,8,0.96) !important;
        border-color: rgba(30,80,40,0.6) !important;
        overflow: hidden !important;
      }
      /* Clip scanline overflow so it never triggers scrollbars */
      .aflp-theme-dossier .aflp-card-inner { overflow: hidden; }
      .aflp-theme-dossier .aflp-card-header {
        background: rgba(8,18,10,0.9); border-bottom: 1px solid rgba(30,80,40,0.5);
        padding: 0; gap: 0;
      }
      .aflp-theme-dossier .aflp-card-header-top {
        padding: 5px 8px; background: rgba(5,12,7,0.8);
        border-bottom: 1px solid rgba(30,80,40,0.35);
        display: flex; align-items: center; justify-content: flex-end;
      }
      .aflp-theme-dossier .aflp-scene-status-label {
        color: rgba(80,180,80,0.85); font-family:'Courier New',monospace;
        font-size: 11px; letter-spacing: 0.2em; text-shadow: 0 0 6px rgba(40,140,40,0.5);
      }
      .aflp-theme-dossier .aflp-card-btn {
        font-family: 'Courier New',monospace; font-size: 10px;
        border-color: rgba(40,140,40,0.4); color: rgba(80,180,80,0.8);
        background: rgba(20,60,20,0.3);
      }
      .aflp-theme-dossier .aflp-card-btn:hover { background: rgba(40,120,40,0.3); }
      .aflp-theme-dossier .aflp-card-portraits { padding: 5px 8px; flex-direction: column; gap: 3px; }
      /* Subject rows */
      .aflp-do-subject {
        display: flex; align-items: center; gap: 6px; padding: 4px 6px;
        border: 1px solid rgba(30,80,40,0.3); border-radius: 2px;
        background: rgba(5,12,6,0.6); position: relative;
        width: 100%; box-sizing: border-box; overflow: hidden;
      }
      .aflp-do-subject.tgt { border-color: rgba(120,40,40,0.4); }
      .aflp-do-port {
        width: 32px; height: 32px; border-radius: 2px; overflow: hidden;
        border: 1px solid rgba(40,120,40,0.4); flex-shrink: 0;
      }
      .aflp-do-port.tgt { border-color: rgba(150,40,40,0.5); }
      .aflp-do-port img { width:100%;height:100%;object-fit:cover;object-position:top;pointer-events:none;display:block; }
      .aflp-do-info { flex: 1; min-width: 0; overflow: hidden; }
      .aflp-do-id { font-size: 10px; color: rgba(40,120,40,0.6); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 1px; }
      .aflp-do-name { font-size: 14px; color: rgba(100,200,100,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
      .aflp-do-name.tgt { color: rgba(200,100,100,0.85); font-size: 14px; }
      .aflp-do-status { font-size: 11px; color: rgba(40,120,40,0.6); font-style: italic; }
      .aflp-do-stamp {
        padding: 2px 7px; border-radius: 1px; font-size: 10px; letter-spacing: 0.06em; flex-shrink: 0; white-space: nowrap;
      }
      .aflp-do-stamp.dom { border: 1px solid rgba(60,140,60,0.5); color: rgba(80,180,80,0.8); }
      .aflp-do-stamp.sub { border: 1px solid rgba(140,40,40,0.5); color: rgba(180,80,80,0.8); }
      .aflp-do-subjects-header {
        font-size: 10px; color: rgba(30,100,30,0.6); letter-spacing: 0.12em;
        text-transform: uppercase; margin-bottom: 3px;
      }
      .aflp-theme-dossier .aflp-arousal-name { color: rgba(60,160,60,0.7); font-family:'Courier New',monospace; font-size:12px; }
      .aflp-theme-dossier .aflp-arousal-bar-fill.sub-fill { background: rgba(140,40,40,0.8); }
      .aflp-theme-dossier .aflp-arousal-bar-fill.dom-fill  { background: rgba(40,140,40,0.8); }
      .aflp-theme-dossier .aflp-arousal-bar-track { background: rgba(10,30,10,0.8); border-color: rgba(20,60,20,0.4); }
      .aflp-theme-dossier .aflp-arousal-val { color: rgba(40,100,40,0.6); font-family:'Courier New',monospace; }
      .aflp-theme-dossier .aflp-card-arousal-bars { border-bottom-color: rgba(30,80,40,0.25); }
      .aflp-theme-dossier .aflp-card-prose-text { color: rgba(80,180,80,0.7); font-style: normal; font-family:'Courier New',monospace; font-size:13px; }
      .aflp-theme-dossier .aflp-card-gm-input { border-color: rgba(30,80,40,0.35); color: rgba(80,180,80,0.7); background: rgba(5,20,5,0.5); font-family:'Courier New',monospace; }
      .aflp-theme-dossier .aflp-card-gm-area { border-top-color: rgba(30,80,40,0.2); }
      .aflp-theme-dossier .aflp-log-header { color: rgba(80,180,80,0.8); font-family:'Courier New',monospace; }
      ${animated ? `
      /* Scanline sweep */
      .aflp-theme-dossier::after {
        content: '';
        position: absolute; top: 0; left: 0; right: 0; height: 40%;
        background: linear-gradient(to bottom, transparent 0%, rgba(40,200,40,0.02) 50%, transparent 100%);
        pointer-events: none; z-index: 5; animation: aflp-scan 4s linear infinite;
      }
      ${scanAnim}
      /* Glitch on prose update */
      .aflp-theme-dossier .aflp-prose-line {
        animation: aflp-fadein 0.2s ease forwards, aflp-glitch 0.4s ease forwards;
      }
      @keyframes aflp-glitch {
        0%  { filter:blur(1px) brightness(1.5); letter-spacing:0.05em; }
        30% { filter:none; letter-spacing:normal; }
        100%{ filter:none; }
      }` : ""}
    `;
  }


  // Build a condition-badges row for a combatant portrait column
  function makeCondBadges(actor, maxW, scene) {
    const wrap = document.createElement("div");
    wrap.className = "aflp-combatant-conditions";
    wrap.style.maxWidth = (maxW ?? 68) + "px";

    const hornyFlag  = actor.getFlag(AFLP.FLAG_SCOPE, "horny")  ?? AFLP.hornyDefaults;
    const hornyTotal = (hornyFlag.temp ?? 0) + (hornyFlag.permanent ?? 0);
    const deniedFlag = actor.getFlag(AFLP.FLAG_SCOPE, "denied") ?? { value: 0 };
    const deniedVal  = deniedFlag.value ?? 0;
    const exposedItm = actor.items?.find(i => i.slug === "exposed");
    const exposedVal = exposedItm?.system?.badge?.value ?? 0;
    const orgasms    = scene ? Object.values(scene.orgasms ?? {}).reduce((a,b)=>a+b,0) : 0;
    // Per-actor orgasms
    const actorOrg   = scene?.orgasms?.[actor.id] ?? 0;

    const mk = (symbol, val, cls, word) => {
      const el = document.createElement("span");
      el.className = "aflp-cond-badge " + cls;
      el.title = word + (val > 1 ? " " + val : "");
      el.textContent = val > 1 ? symbol + val : symbol;
      return el;
    };
    if (hornyTotal > 0) wrap.appendChild(mk("♥", hornyTotal, "horny",   "Horny"));
    if (exposedVal > 0) wrap.appendChild(mk("✦", exposedVal, "exposed", "Exposed"));
    if (deniedVal  > 0) wrap.appendChild(mk("⊘", deniedVal,  "denied",  "Denied"));
    if (actorOrg   > 0) wrap.appendChild(mk("★", actorOrg,   "orgasm",  "Orgasms this scene"));
    return wrap;
  }

  // -----------------------------------------------
  // Calculate the pixel width needed to display a scene's actor row
  // -----------------------------------------------
  function _calcSceneWidth(scene) {
    const N = Math.min(scene.attackers.length + 1, 10); // total actors, capped at 10
    const pSize = N <= 2 ? 68 : N <= 3 ? 60 : N <= 5 ? 52 : N <= 7 ? 44 : 38;
    const tSize = Math.round(pSize * 1.12);              // target portrait is slightly larger
    const vsW   = N <= 3 ? 30 : N <= 5 ? 24 : 20;
    // Width = (N-1 attackers * pSize) + (N-1 VS dividers) + tSize + 32px padding
    // Minimum 360px for usability (arousal bars, GM input, controls row)
    return Math.max(360, ((N - 1) * (pSize + vsW)) + tSize + 32);
  }

  // Update the container to be as wide as the widest active scene
  function _updateContainerWidth() {
    if (!_container) return;
    let w = 280;
    for (const scene of _scenes.values()) w = Math.max(w, _calcSceneWidth(scene));
    // Measure portrait rows at their natural (unconstrained) width by temporarily
    // clearing the container width so scrollWidth reflects content, not the old set value.
    _container.style.width = "";
    for (const card of (_container.querySelectorAll?.(".aflp-hscene-card") ?? [])) {
      const pRow = card.querySelector(".aflp-card-portraits");
      if (pRow) w = Math.max(w, pRow.scrollWidth + 20);
    }
    w = Math.min(w, window.innerWidth - 80);
    _container.style.width = w + "px";
  }

  // -----------------------------------------------
  // Render portraits into card header — Combat HUD VS layout
  // All attackers and target in a single flat horizontal row.
  // Target centred, left attackers on left, right attackers on right.
  // Container expands to fit; stops at 10 actors, then inner row scrolls.
  // -----------------------------------------------
  function _refreshPortraits(card, scene) {
    const theme = AFLP.Settings.hsceneTheme ?? "combat-hud";
    if (theme === "status-strip") { _refreshPortraits_StatusStrip(card, scene); return; }
    if (theme === "porno")        { _refreshPortraits_Porno(card, scene); return; }
    if (theme === "dossier")      { _refreshPortraits_Dossier(card, scene); return; }
    // Fall through to Combat HUD (default)
    const wrap = card.querySelector(".aflp-card-portraits");
    if (!wrap) return;
    wrap.innerHTML = "";

    // Always clear any leftover extra strip (should no longer exist, belt-and-braces)
    card.querySelector(".aflp-card-inner")?.querySelectorAll(".aflp-extra-strip").forEach(el => el.remove());

    const safePron = { subject:"they", object:"them", possessive:"their", reflexive:"themselves" };
    const N  = scene.attackers.length + 1; // total actors including target
    const nD = Math.min(N, 10);            // capped count for sizing

    // Portrait size and VS divider width, scaling down as actors increase
    const pSize = nD <= 2 ? 68 : nD <= 3 ? 60 : nD <= 5 ? 52 : nD <= 7 ? 44 : 38;
    const tSize = Math.round(pSize * 1.12); // target slightly larger
    const vsW   = nD <= 3 ? 30 : nD <= 5 ? 24 : 20;

    const SHORT_LABELS = {
      "vaginal":         "Pounding Pussy",
      "anal":            "Drilling Ass",
      "oral-receive":    "Fucking Face",
      "facial":          "Prepping Facial",
      "oral-give":       "Going Down",
      "groping":         "Groping",
      "other":           "Teasing",
      "licking":         "Licking",
      "fingering-pussy": "Fingering Pussy",
      "fingering-anal":  "Fingering Ass",
      "fingering-ass":   "Fingering Ass",
      "fingering-cock":  "Cock Play",
      "fingering":       "Fingering",
      "toy-pussy":       "Toy — Pussy",
      "toy-anal":        "Toy — Ass",
      "toy-ass":         "Toy — Ass",
    };
    const posLabel = (posId) => {
      if (!posId) return null;
      if (SHORT_LABELS[posId]) return SHORT_LABELS[posId];
      const entry = AFLP.getPosition(posId);
      return entry?.label?.(safePron) ?? posId;
    };

    const makeVS = () => {
      const d = document.createElement("div");
      d.className = "aflp-vs-divider";
      d.style.cssText = `flex-shrink:0;width:${vsW}px;`;
      d.innerHTML = `<div class="aflp-vs-text">VS</div>`;
      return d;
    };

    const makePosChip = (posId, maxW) => {
      const lbl = posLabel(posId);
      const d = document.createElement("div");
      d.className = "aflp-pos-chip" + (lbl ? "" : " unset");
      d.style.maxWidth = (maxW ?? pSize) + "px";
      d.textContent = lbl ?? "⊕ position";
      return d;
    };

    const makeAttackerCol = (atk) => {
      const col = document.createElement("div");
      col.className = "aflp-combatant is-attacker";
      col.style.cssText = `flex:0 0 ${pSize}px;`;

      col.innerHTML = `
        <div class="aflp-combatant-portrait" style="width:${pSize}px;height:${pSize}px;">
          <img src="${atk.img}" alt="${atk.name}" loading="lazy"/>
          <div class="aflp-role-overlay dom">DOM</div>
        </div>
        <div class="aflp-combatant-name" style="max-width:${pSize}px;">${atk.name.split(" ")[0]}</div>
      `;
      col.appendChild(makePosChip(atk.position, pSize));

      // Condition badges below position chip
      const atkActor2 = _resolveActor(atk);
      if (atkActor2) col.appendChild(makeCondBadges(atkActor2, pSize, scene));

      if (game.user.isGM && AFLP.Settings.positionTracking) {
        col.title = "Click to change position";
        col.addEventListener("click", async () => {
          const atkActor = _resolveActor(atk);
          if (!atkActor) return;
          await AFLP.HScene._promptAndSetPosition(scene, atk, atkActor);
          const freshCard = _container?.querySelector(`[data-target-id="${scene.targetId}"]`);
          if (freshCard) _refreshPortraits(freshCard, scene);
        });
      }
      // GM leave button for attackers
      if (game.user.isGM) {
        const leaveBtn = document.createElement("div");
        leaveBtn.className = "aflp-leave-btn";
        leaveBtn.textContent = "✕ Leave";
        leaveBtn.title = `Remove ${atk.name} from scene`;
        leaveBtn.addEventListener("click", e => {
          e.stopPropagation();
          AFLP.HScene.removeParticipant(scene.targetId, atk.id);
        });
        col.appendChild(leaveBtn);
      }
      return col;
    };

    const RECEIVING_LABELS = {
      "vaginal":         "Fucked in pussy",
      "anal":            "Fucked in ass",
      "oral-receive":    "Being face fucked",
      "facial":          "Prepping Facial",
      "oral-give":       "Riding face",
      "groping":         "Being groped",
      "licking":         "Being licked",
      "fingering-pussy": "Fingered in pussy",
      "fingering-anal":  "Fingered in ass",
      "fingering-cock":  "Cock being played",
      "toy-pussy":       "Toy in pussy",
      "toy-anal":        "Toy in ass",
    };
    const receivingLabel = posId => RECEIVING_LABELS[posId] ?? posLabel(posId);

    const makeTargetCol = () => {
      const col = document.createElement("div");
      col.className = "aflp-combatant is-target";
      col.style.cssText = `flex:0 0 ${tSize}px;`;

      col.innerHTML = `
        <div class="aflp-combatant-portrait" style="width:${tSize}px;height:${tSize}px;">
          <img src="${scene.targetImg}" alt="${scene.targetName}" loading="lazy"/>
          <div class="aflp-role-overlay sub">SUBMITTING</div>
        </div>
        <div class="aflp-combatant-name sub" style="max-width:${tSize}px;">${scene.targetName.split(" ")[0]}</div>
      `;
      // Condition badges for target
      const tgtActorForCond = _resolveActor({
        id: scene.targetId, actorId: scene.targetActorId
      });
      if (tgtActorForCond) col.appendChild(makeCondBadges(tgtActorForCond, tSize, scene));
      return col;
    };

    // Radial layout: left-col (even-indexed attackers) | VS | SUB | VS | right-col (odd-indexed)
    // This keeps submitting actor centred with dominators flanking on both sides,
    // VS correctly connecting each dom to the sub (not doms to each other).
    const leftAtks  = scene.attackers.filter((_, i) => i % 2 === 0); // 0, 2, 4...
    const rightAtks = scene.attackers.filter((_, i) => i % 2 === 1); // 1, 3, 5...

    // For grid-like vertical stacking on each side
    const makeVSStub = () => {
      const d = document.createElement("div");
      d.className = "aflp-vs-divider";
      d.style.cssText = `flex-shrink:0;width:${vsW}px;align-self:center;`;
      d.innerHTML = `<div class="aflp-vs-text">VS</div>`;
      return d;
    };

    // Left side: stacked attackers (right-aligned toward center)
    if (leftAtks.length > 0) {
      const leftCol = document.createElement("div");
      leftCol.style.cssText = "display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:1;";
      leftAtks.forEach((atk, i) => {
        if (i > 0) {
          const spacer = document.createElement("div");
          spacer.style.cssText = "height:2px;";
          leftCol.appendChild(spacer);
        }
        leftCol.appendChild(makeAttackerCol(atk));
      });
      wrap.appendChild(leftCol);
      wrap.appendChild(makeVSStub());
    }

    wrap.appendChild(makeTargetCol());

    // Right side: stacked attackers (left-aligned from center)
    if (rightAtks.length > 0) {
      wrap.appendChild(makeVSStub());
      const rightCol = document.createElement("div");
      rightCol.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;gap:4px;flex:1;";
      rightAtks.forEach((atk, i) => {
        if (i > 0) {
          const spacer = document.createElement("div");
          spacer.style.cssText = "height:2px;";
          rightCol.appendChild(spacer);
        }
        rightCol.appendChild(makeAttackerCol(atk));
      });
      wrap.appendChild(rightCol);
    } else if (leftAtks.length > 0) {
      // No right-side attackers — add a phantom flex:1 spacer to keep target centred
      const phantom = document.createElement("div");
      phantom.style.cssText = "flex:1;visibility:hidden;";
      wrap.appendChild(phantom);
    }

    // Update container width to fit the widest active scene
    _updateContainerWidth();
  }

  // -----------------------------------------------
  // Status Strip portrait renderer
  // -----------------------------------------------
  function _refreshPortraits_StatusStrip(card, scene) {
    const wrap = card.querySelector(".aflp-card-portraits");
    if (!wrap) return;
    wrap.innerHTML = "";

    const safePron = { subject:"they", object:"them", possessive:"their", reflexive:"themselves" };
    const SHORT_LABELS = {
      "vaginal":"Pounding Pussy","anal":"Drilling Ass","oral-receive":"Fucking Face",
      "facial":"Prepping Facial","oral-give":"Going Down","groping":"Groping","licking":"Licking",
      "fingering-pussy":"Fingering Pussy","fingering-anal":"Fingering Ass",
      "toy-pussy":"Toy — Pussy","toy-anal":"Toy — Ass","toy-ass":"Toy — Ass",
    };
    const posLabel = posId => {
      if (!posId) return null;
      if (SHORT_LABELS[posId]) return SHORT_LABELS[posId];
      return AFLP.getPosition(posId)?.label?.(safePron) ?? posId;
    };

    const makeChip = (actor, roleLabel, traitCls, posId, portrait) => {
      const col = document.createElement("div");
      col.className = "aflp-ss-actor";
      const safeName = actor.name.replace(/\s*[-–—].*$/, "").trim().split(" ").slice(0,2).join(" ");
      const pos = posLabel(posId);
      col.innerHTML = `
        <div class="aflp-ss-role-label">${roleLabel}</div>
        <div class="aflp-ss-actor-row">
          <div class="aflp-ss-mini-port" style="border:1px solid ${roleLabel==="Submitting"?"rgba(200,64,64,0.5)":"rgba(201,169,110,0.4)"};">
            <img src="${portrait}" alt="${safeName}"/>
          </div>
          <div class="aflp-ss-name">${safeName}</div>
        </div>
        <span class="aflp-ss-trait ${traitCls}">${roleLabel}</span>
        ${pos ? `<span class="aflp-ss-trait aflp-ss-trait-pos">${pos}</span>` : ""}
      `;
      return col;
    };

    // Target — tag shows dominator count
    const tgtActor = { name: scene.targetName, img: scene.targetImg };
    const domCount = scene.attackers.length;
    const tgtCol = makeChip(tgtActor, "Submitting", "aflp-ss-trait-sub", null, scene.targetImg);
    if (domCount > 0) {
      const rc = document.createElement("span");
      rc.className = "aflp-ss-trait aflp-ss-trait-pos";
      rc.textContent = `Being used by ${domCount} dominant${domCount === 1 ? "" : "s"}`;
      tgtCol.appendChild(rc);
    }
    wrap.appendChild(tgtCol);

    // Attackers
    for (const atk of scene.attackers) {
      const atkCol = makeChip({ name: atk.name, img: atk.img }, "Dominating", "aflp-ss-trait-dom", atk.position, atk.img);
      if (game.user.isGM && AFLP.Settings.positionTracking) {
        atkCol.style.cursor = "pointer";
        atkCol.title = "Click to change position";
        atkCol.addEventListener("click", async () => {
          const atkActor = _resolveActor(atk);
          if (!atkActor) return;
          await AFLP.HScene._promptAndSetPosition(scene, atk, atkActor);
        });
      }
      if (game.user.isGM) {
        const leaveBtn = document.createElement("div");
        leaveBtn.className = "aflp-leave-btn";
        leaveBtn.textContent = "✕ Leave";
        leaveBtn.title = `Remove ${atk.name} from scene`;
        leaveBtn.addEventListener("click", e => {
          e.stopPropagation();
          AFLP.HScene.removeParticipant(scene.targetId, atk.id);
        });
        atkCol.appendChild(leaveBtn);
      }
      wrap.appendChild(atkCol);
    }

    // Trigger layout so scrollWidth reflects actual rendered content
    _updateContainerWidth();
    requestAnimationFrame(() => {
      if (!_container) return;
      const portraits = _container.querySelector(".aflp-card-portraits");
      if (portraits && portraits.scrollWidth > _container.offsetWidth) {
        const capped = Math.min(portraits.scrollWidth + 20, window.innerWidth - 80);
        _container.style.width = capped + "px";
      }
    });
  }

  // -----------------------------------------------
  // Porno Scene portrait renderer
  // -----------------------------------------------
  function _refreshPortraits_Porno(card, scene) {
    const wrap = card.querySelector(".aflp-card-portraits");
    if (!wrap) return;
    wrap.innerHTML = "";

    const safePron = { subject:"they", object:"them", possessive:"their", reflexive:"themselves" };
    const SHORT_LABELS = {
      "vaginal":"Pounding Pussy","anal":"Drilling Ass","oral-receive":"Fucking Face",
      "facial":"Prepping Facial","oral-give":"Going Down","groping":"Groping","licking":"Licking",
      "fingering-pussy":"Fingering Pussy","fingering-anal":"Fingering Ass",
      "toy-pussy":"Toy — Pussy","toy-anal":"Toy — Ass","toy-ass":"Toy — Ass",
    };
    const posLabel = posId => {
      if (!posId) return null;
      if (SHORT_LABELS[posId]) return SHORT_LABELS[posId];
      return AFLP.getPosition(posId)?.label?.(safePron) ?? posId;
    };

    const tgtActor = _resolveActor({ id: scene.targetId, actorId: scene.targetActorId });
    const hasPussy = !!tgtActor?.getFlag(AFLP.FLAG_SCOPE, "pussy");
    const filledPositions = scene.attackers.map(a => a.position).filter(Boolean);
    const hasVaginal = filledPositions.some(p => p === "vaginal");
    const hasOral    = filledPositions.some(p => p === "oral-receive" || p === "facial");
    const hasAnal    = filledPositions.some(p => p === "anal");

    // Manual overrides: GM can click holes to toggle regardless of attacker positions
    if (!scene.manualHoles) scene.manualHoles = {};
    const mh = scene.manualHoles;
    const vagFilled  = hasPussy  ? (hasVaginal  || !!mh.pussy) : false;
    const oralFilled = hasOral   || !!mh.mouth;
    const analFilled = hasAnal   || !!mh.ass;
    const airlocked  = hasPussy ? (vagFilled && oralFilled && analFilled) : (oralFilled && analFilled);

    const safeTgtName = scene.targetName.replace(/\s*[-–—].*$/, "").trim();

    // Build hole chips — clickable by GM to manually toggle
    function makeHoleChip(label, key, filled) {
      const span = document.createElement("span");
      span.className = `aflp-po-hole ${filled ? "filled" : "empty"}`;
      span.textContent = `${label} ${filled ? "✓" : "○"}`;
      if (game.user.isGM) {
        span.style.cursor = "pointer";
        span.title = filled ? `Click to unmark ${label} as filled` : `Click to manually mark ${label} as filled`;
        span.addEventListener("click", e => {
          e.stopPropagation();
          scene.manualHoles[key] = !scene.manualHoles[key];
          const c = _container?.querySelector(`[data-target-id="${scene.targetId}"]`);
          if (c) _refreshPortraits(c, scene);
        });
      }
      return span;
    }

    // Target (bottom/talent)
    const tgtDiv = document.createElement("div");
    tgtDiv.innerHTML = `
      <div class="aflp-po-bottom-label">The Talent</div>
      <div class="aflp-po-bottom-row">
        <div class="aflp-po-bottom-port"><img src="${scene.targetImg}" alt="${safeTgtName}"/></div>
        <div class="aflp-po-bottom-info">
          <div class="aflp-po-bottom-name">${safeTgtName}</div>
          <div class="aflp-po-bottom-role">Taking everything they've got</div>
          <div class="aflp-po-holes" id="aflp-po-holes-${scene.targetId}"></div>
          ${airlocked ? `<div class="aflp-po-airlock">★ AIRLOCKED ★</div>` : ""}
        </div>
      </div>
    `;
    wrap.appendChild(tgtDiv);
    const holesDiv = tgtDiv.querySelector(`#aflp-po-holes-${scene.targetId}`);
    if (hasPussy) holesDiv.appendChild(makeHoleChip("PUSSY", "pussy", vagFilled));
    holesDiv.appendChild(makeHoleChip("MOUTH", "mouth", oralFilled));
    holesDiv.appendChild(makeHoleChip("ASS",   "ass",   analFilled));

    if (scene.attackers.length) {
      const dividerDiv = document.createElement("div");
      dividerDiv.className = "aflp-po-divider";
      dividerDiv.textContent = "— DOMINATED BY —";
      wrap.appendChild(dividerDiv);

      const domHeader = document.createElement("div");
      domHeader.className = "aflp-po-dom-label";
      domHeader.textContent = "Performers";
      wrap.appendChild(domHeader);

      const domRow = document.createElement("div");
      domRow.className = "aflp-po-dom-row";
      for (const atk of scene.attackers) {
        const safeAtkName = atk.name.replace(/\s*[-–—].*$/, "").trim().split(" ").slice(0,2).join(" ");
        const posStr = posLabel(atk.position) ?? "⊕ position";
        const col = document.createElement("div");
        col.className = "aflp-po-dom-col";
        col.innerHTML = `
          <div class="aflp-po-dom-port"><img src="${atk.img}" alt="${safeAtkName}"/></div>
          <div style="min-width:0;">
            <div class="aflp-po-dom-name">${safeAtkName}</div>
            <div class="aflp-po-dom-pos" style="cursor:${game.user.isGM && AFLP.Settings.positionTracking?'pointer':'default'}">${posStr}</div>
          </div>
        `;
        if (game.user.isGM && AFLP.Settings.positionTracking) {
          col.style.cursor = "pointer";
          col.title = "Click to change position";
          col.addEventListener("click", async () => {
            const atkActor = _resolveActor(atk);
            if (!atkActor) return;
            await AFLP.HScene._promptAndSetPosition(scene, atk, atkActor);
          });
        }
        if (game.user.isGM) {
          const leaveBtn = document.createElement("div");
          leaveBtn.className = "aflp-leave-btn";
          leaveBtn.textContent = "✕ Leave";
          leaveBtn.title = `Remove ${atk.name} from scene`;
          leaveBtn.addEventListener("click", e => {
            e.stopPropagation();
            AFLP.HScene.removeParticipant(scene.targetId, atk.id);
          });
          col.appendChild(leaveBtn);
        }
        domRow.appendChild(col);
      }
      wrap.appendChild(domRow);
    }

    // Trigger airlock scene log entry if newly airlocked
    if (airlocked && !card.dataset.airlocked) {
      card.dataset.airlocked = "1";
      AFLP.HScene.addProse(scene.targetId, `★ AIRLOCKED ★ — ${safeTgtName} is being used in all holes simultaneously.`, "gm");
    } else if (!airlocked) {
      delete card.dataset.airlocked;
    }

    // Cumflation status word — show below airlocked if target has any cumflation
    if (tgtActor) {
      const cf = tgtActor.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? {};
      const cfSum = (cf.anal ?? 0) + (cf.oral ?? 0) + (cf.vaginal ?? 0) + (cf.facial ?? 0);
      const cfWord = _cumflationWord(cfSum);
      const existingStatus = tgtDiv.querySelector(".aflp-po-cumflation-status");
      if (cfWord) {
        if (existingStatus) {
          existingStatus.textContent = `◈ ${cfWord.word} ◈`;
          existingStatus.style.color = cfWord.color;
          existingStatus.style.borderColor = cfWord.glow;
          existingStatus.style.background = cfWord.glow.replace(/[\d.]+\)$/, "0.12)");
          existingStatus.style.boxShadow = `0 0 8px ${cfWord.glow}`;
        } else {
          const statusEl = document.createElement("div");
          statusEl.className = "aflp-po-cumflation-status";
          statusEl.textContent = `◈ ${cfWord.word} ◈`;
          statusEl.style.color = cfWord.color;
          statusEl.style.border = `1px solid ${cfWord.glow}`;
          statusEl.style.background = cfWord.glow.replace(/[\d.]+\)$/, "0.12)");
          statusEl.style.boxShadow = `0 0 8px ${cfWord.glow}`;
          // Insert into the bottom-info div alongside airlocked
          const infoDiv = tgtDiv.querySelector(".aflp-po-bottom-info");
          if (infoDiv) infoDiv.appendChild(statusEl);
        }
      } else if (existingStatus) {
        existingStatus.remove();
      }
    }

    _updateContainerWidth();
  }

  // -----------------------------------------------
  // Dossier File portrait renderer
  // -----------------------------------------------
  function _refreshPortraits_Dossier(card, scene) {
    const wrap = card.querySelector(".aflp-card-portraits");
    if (!wrap) return;
    wrap.innerHTML = "";

    const safePron = { subject:"they", object:"them", possessive:"their", reflexive:"themselves" };
    const posLabel = posId => {
      if (!posId) return null;
      const DO_LABELS = {
        "vaginal":         "Pounding their pussy",
        "anal":            "Drilling their ass",
        "oral-receive":    "Fucking their face",
        "facial":          "Prepping a facial",
        "oral-give":       "Riding their face",
        "fingering-pussy": "Fingering pussy",
        "fingering-anal":  "Fingering ass",
        "toy-pussy":       "Toy in pussy",
        "toy-anal":        "Toy in ass",
      };
      if (DO_LABELS[posId]) return DO_LABELS[posId];
      return AFLP.getPosition(posId)?.label?.(safePron) ?? posId;
    };

    const headerDiv = document.createElement("div");
    headerDiv.className = "aflp-do-subjects-header";
    headerDiv.textContent = "// SUBJECTS IN ENCOUNTER:";
    wrap.appendChild(headerDiv);

    const ALPHA = ["ALPHA","BRAVO","CHARLIE","DELTA","ECHO","FOXTROT","GOLF","HOTEL","INDIA","JULIET"];

    // Target first
    const tgtSafeName = scene.targetName.replace(/\s*[-–—].*$/, "").trim();
    const receivingPositions = scene.attackers.filter(a=>a.position).map(a=>posLabel(a.position)).filter(Boolean).join(" + ");
    const tgtRow = document.createElement("div");
    tgtRow.className = "aflp-do-subject tgt";
    tgtRow.innerHTML = `
      <div class="aflp-do-port tgt"><img src="${scene.targetImg}" alt="${tgtSafeName}"/></div>
      <div class="aflp-do-info">
        <div class="aflp-do-id">SUBJECT ${ALPHA[0]} — TARGET</div>
        <div class="aflp-do-name tgt">${tgtSafeName.toUpperCase()}</div>
        <div class="aflp-do-status">// ${scene.attackers.length > 0 ? `Being used by ${scene.attackers.length} dominant${scene.attackers.length === 1 ? "" : "s"}` : "No dominants yet"} ▌</div>
      </div>
      <div class="aflp-do-stamp sub">COMPROMISED</div>
    `;
    wrap.appendChild(tgtRow);

    // Attackers
    scene.attackers.forEach((atk, i) => {
      const atkSafeName = atk.name.replace(/\s*[-–—].*$/, "").trim();
      const pos = posLabel(atk.position);
      const atkRow = document.createElement("div");
      atkRow.className = "aflp-do-subject";
      if (game.user.isGM && AFLP.Settings.positionTracking) {
        atkRow.style.cursor = "pointer";
        atkRow.title = "Click to change position";
        atkRow.addEventListener("click", async () => {
          const atkActor = _resolveActor(atk);
          if (!atkActor) return;
          await AFLP.HScene._promptAndSetPosition(scene, atk, atkActor);
        });
      }
      atkRow.innerHTML = `
        <div class="aflp-do-port"><img src="${atk.img}" alt="${atkSafeName}"/></div>
        <div class="aflp-do-info">
          <div class="aflp-do-id">SUBJECT ${ALPHA[i+1] ?? `GOLF-${i}`} — HOSTILE</div>
          <div class="aflp-do-name">${atkSafeName.toUpperCase()}</div>
          <div class="aflp-do-status">// ${pos ? pos : "Position: unassigned"} ▌</div>
        </div>
        <div class="aflp-do-stamp dom">DOMINANT</div>
      `;
      if (game.user.isGM) {
        const leaveBtn = document.createElement("div");
        leaveBtn.className = "aflp-leave-btn";
        leaveBtn.textContent = "✕ Leave";
        leaveBtn.title = `Remove ${atk.name} from scene`;
        leaveBtn.addEventListener("click", e => {
          e.stopPropagation();
          AFLP.HScene.removeParticipant(scene.targetId, atk.id);
        });
        atkRow.appendChild(leaveBtn);
      }
      wrap.appendChild(atkRow);
    });

    _updateContainerWidth();
  }

  // -----------------------------------------------
  // Render arousal bars
  // -----------------------------------------------
  function _refreshArousalBars(card, scene) {
    const area = card.querySelector(".aflp-card-arousal-bars");
    if (!area) return;
    area.innerHTML = "";

    const allParticipants = [
      { name: scene.targetName, id: scene.targetId, actorId: scene.targetActorId, tokenDoc: scene.targetTokenDoc },
      ...scene.attackers.map(a => ({ name: a.name, id: a.id, actorId: a.actorId, tokenDoc: a.tokenDoc }))
    ];

    for (const participant of allParticipants) {
      const { name, id } = participant;
      const actor = _resolveActor(participant);
      if (!actor) continue;
      const arousal = actor.getFlag(AFLP.FLAG_SCOPE, "arousal") ?? AFLP.arousalDefaults;
      const cur = arousal.current ?? 0;
      const max = AFLP.HScene.calcArousalMax(actor);

      const row = document.createElement("div");
      row.className = "aflp-arousal-row";
      row.dataset.arousalActorId = participant.id;

      // ─── Name ───────────────────────────────────────────────────────────────
      const nameEl = document.createElement("span");
      nameEl.className = "aflp-arousal-name";
      nameEl.title = name;
      nameEl.textContent = name.replace(/\s*[-\u2013\u2014–—].*$/, "").trim().split(" ").slice(0,2).join(" ");

      const valEl = document.createElement("span");
      valEl.className = "aflp-arousal-val";
      valEl.textContent = `${cur}/${max}`;

      // ─── Bar or Pips: respect explicit setting, fall back to theme default ──
      const _theme = AFLP.Settings.hsceneTheme ?? "porno";
      const _arousalPref = AFLP.Settings.hsceneArousalStyle ?? "auto";
      const useBars = _arousalPref === "bars"
        ? true
        : _arousalPref === "pips"
          ? false
          : (_theme === "combat-hud" || _theme === "porno"); // "auto" = theme default
      const isTarget = (participant.id === scene.targetId) ||
        ((participant.actorId ?? participant.id) === scene.targetActorId);

      let inputEl;
      if (useBars) {
        // Gradient fill bar
        const pct = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
        const track = document.createElement("div");
        track.className = "aflp-arousal-bar-track";

        const fill = document.createElement("div");
        fill.className = "aflp-arousal-bar-fill " + (isTarget ? "sub-fill" : "dom-fill");
        if (pct >= 80) fill.classList.add("near-max");
        fill.style.width = pct + "%";
        track.appendChild(fill);

        // Click to set arousal by bar position
        track.addEventListener("click", async (e) => {
          if (!actor.isOwner && !game.user.isGM) return;
          const rect = track.getBoundingClientRect();
          const newVal = Math.round(((e.clientX - rect.left) / rect.width) * max);
          await AFLP_Arousal.set(actor, Math.max(0, Math.min(max, newVal)), "HScene bar");
        });
        inputEl = track;
      } else {
        // Pip style for status-strip / dossier
        const pipBar = document.createElement("div");
        pipBar.className = "aflp-arousal-pips";
        for (let i = 0; i < max; i++) {
          const pip = document.createElement("span");
          pip.className = "aflp-arousal-pip" + (i < cur ? " filled" : "");
          pip.dataset.pipIndex = i;
          pip.addEventListener("click", async () => {
            if (!actor.isOwner && !game.user.isGM) return;
            await AFLP_Arousal.set(actor, i < cur ? i : i + 1, "HScene pip");
          });
          pipBar.appendChild(pip);
        }
        inputEl = pipBar;
      }

      row.appendChild(nameEl);
      row.appendChild(inputEl);
      row.appendChild(valEl);
      area.appendChild(row);

      // Cumflation bar — only shown if total tier > 0
      const cumFlags  = actor.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? {};
      const cfAnal    = cumFlags.anal    ?? 0;
      const cfOral    = cumFlags.oral    ?? 0;
      const cfVaginal = cumFlags.vaginal ?? 0;
      const cfTotal   = Math.min(8, Math.floor((cfAnal + cfOral + cfVaginal) / 3));
      if (cfTotal > 0) {
        const cfRow = document.createElement("div");
        cfRow.className = "aflp-cumflation-row";
        cfRow.dataset.cumflationActorId = participant.id;

        const cfLabel = document.createElement("span");
        cfLabel.className = "aflp-cumflation-label";
        cfLabel.textContent = "≈ Cumflation";

        const cfBar = document.createElement("div");
        cfBar.className = "aflp-cumflation-bar";
        for (let i = 0; i < 8; i++) {
          const pip = document.createElement("span");
          pip.className = "aflp-cumflation-pip" + (i < cfTotal ? " filled" : "");
          cfBar.appendChild(pip);
        }

        const cfVal = document.createElement("span");
        cfVal.className = "aflp-cumflation-val";
        cfVal.textContent = `${cfTotal}/8`;

        cfRow.appendChild(cfLabel);
        cfRow.appendChild(cfBar);
        cfRow.appendChild(cfVal);
        area.appendChild(cfRow);
      }
    }
  }

  // -----------------------------------------------
  // Bind card button listeners
  // -----------------------------------------------
  function _bindCardListeners(card, scene) {
    // Theme selector — per-user client setting
    card.querySelector(".aflp-card-theme-select")?.addEventListener("change", e => {
      e.stopPropagation();
      game.settings.set(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_THEME, e.target.value);
      // Sync all other open cards to the new selection
      document.querySelectorAll(".aflp-card-theme-select").forEach(sel => {
        if (sel !== e.target) sel.value = e.target.value;
      });
    });

    // Arousal display selector — per-user client setting
    card.querySelector(".aflp-card-arousal-select")?.addEventListener("change", e => {
      e.stopPropagation();
      game.settings.set(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_AROUSAL, e.target.value);
      // Refresh all active cards' arousal bars immediately
      const scenes = AFLP.HScene._scenes;
      if (!scenes) return;
      for (const [tid, sc] of scenes) {
        const c = _container?.querySelector(`[data-target-id="${tid}"]`);
        if (c) _refreshArousalBars(c, sc);
      }
      document.querySelectorAll(".aflp-card-arousal-select").forEach(sel => {
        if (sel !== e.target) sel.value = e.target.value;
      });
    });

    // Minimise
    card.querySelector(".aflp-card-minimize")?.addEventListener("click", e => {
      e.stopPropagation();
      card.classList.toggle("minimized");
    });

    // Log toggle + log panel close button
    const _toggleLog = (e) => {
      e?.stopPropagation();
      const logPanel = card.querySelector(".aflp-card-log-panel");
      if (!logPanel) return;
      const isVisible = logPanel.style.display !== "none";
      logPanel.style.display = isVisible ? "none" : "flex";
    };
    card.querySelector(".aflp-card-log-toggle")?.addEventListener("click", _toggleLog);
    card.querySelector(".aflp-log-close")?.addEventListener("click", _toggleLog);

    // Log toggle (old block — now delegated above, keep stub for safety)
    card.querySelector(".aflp-card-log-toggle-NOOP")?.addEventListener("click", e => {
      e.stopPropagation();
      const logPanel = card.querySelector(".aflp-card-log-panel");
      if (!logPanel) return;
      const isVisible = logPanel.style.display !== "none";
      logPanel.style.display = isVisible ? "none" : "flex";
    }); // end stub

    // Click minimised card to restore
    card.addEventListener("click", e => {
      if (card.classList.contains("minimized")) {
        card.classList.remove("minimized");
      }
    });

    // Close
    card.querySelector(".aflp-card-close")?.addEventListener("click", e => {
      e.stopPropagation();
      if (game.user.isGM) {
        // Broadcast close to all clients
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", {
          type: "hscene-close",
          targetId: scene.targetId
        });
      }
      AFLP.HScene.closeScene(scene.targetId);
    });

    // GM text input
    const input = card.querySelector(".aflp-card-gm-input");
    const sendBtn = card.querySelector(".aflp-card-gm-send");

    const sendGmText = () => {
      const text = input?.value?.trim();
      if (!text) return;
      input.value = "";
      // Broadcast to all clients
      game.socket.emit("module.ardisfoxxs-lewd-pf2e", {
        type: "hscene-prose",
        targetId: scene.targetId,
        text,
        proseType: "gm"
      });
      AFLP.HScene.addProse(scene.targetId, text, "gm");
    };

    sendBtn?.addEventListener("click", sendGmText);
    input?.addEventListener("keydown", e => { if (e.key === "Enter") sendGmText(); });
  }

  // -----------------------------------------------
  // Prose display — animate lines in, fade after delay, persist in log
  // -----------------------------------------------
  function _showProse(card, text, type, scene) {
    if (!card.classList.contains("minimized")) {
      const area = card.querySelector(".aflp-card-prose-text");
      if (area) {
        const line = document.createElement("span");
        line.className = "aflp-prose-line";

        if (type === "gm") {
          line.style.cssText = "color:#c8e0ff;font-style:normal;font-size:13px;";
          line.textContent = text;
        } else if (type === "action") {
          line.style.cssText = "color:#c8a050;font-style:normal;font-weight:bold;font-size:13px;";
          line.textContent = text;
        } else {
          line.textContent = text;
        }

        area.appendChild(line);

        const words = text.split(" ");
        line.textContent = "";
        let i = 0;
        const interval = setInterval(() => {
          if (i >= words.length) { clearInterval(interval); return; }
          line.textContent += (i > 0 ? " " : "") + words[i];
          i++;
        }, 60);

        setTimeout(() => {
          line.classList.add("fading");
          setTimeout(() => line.remove(), 700);
        }, 12000);
      }
    }

    // Persist to log panel regardless of minimized state
    if (scene) {
      const now = new Date();
      const timestamp = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;
      scene.log = scene.log ?? [];
      scene.log.push({ text, type, timestamp });

      const logEntries = card.querySelector(".aflp-log-entries");
      if (logEntries) {
        const entry = document.createElement("div");
        entry.className = `aflp-log-entry log-${type}`;
        entry.innerHTML = `<span class="aflp-log-time">${timestamp}</span>${text}`;
        logEntries.appendChild(entry);
        logEntries.scrollTop = logEntries.scrollHeight;
      }
    }
  }

  // -----------------------------------------------
  // Socket listener setup (called from index.js)
  // -----------------------------------------------
  function _setupSocket() {
    game.socket.on("module.ardisfoxxs-lewd-pf2e", data => {
      if (!data?.type?.startsWith("hscene")) return;

      if (data.type === "hscene-start") {
        AFLP.HScene.startScene(
          { id: data.attackerId, actorId: data.attackerActorId ?? data.attackerId, name: data.attackerName, img: data.attackerImg },
          { id: data.targetId,   actorId: data.targetActorId   ?? data.targetId,   name: data.targetName,   img: data.targetImg   },
          true // fromSocket  -  skip re-broadcasting
        );
      }
      if (data.type === "hscene-add-attacker") {
        AFLP.HScene.addAttacker(data.targetId, {
          id: data.attackerId, actorId: data.attackerActorId ?? data.attackerId, name: data.attackerName, img: data.attackerImg
        }, true);
      }
      if (data.type === "hscene-prose") {
        // Only show if not the GM (GM already showed it locally)
        if (!game.user.isGM) {
          AFLP.HScene.addProse(data.targetId, data.text, data.proseType);
        }
      }
      if (data.type === "hscene-close") {
        AFLP.HScene.closeScene(data.targetId);
      }
      if (data.type === "hscene-remove-participant") {
        AFLP.HScene.removeParticipant(data.targetId, data.tokenId, true);
      }
      if (data.type === "hscene-shake") {
        AFLP.HScene.triggerShake(data.actorId);
      }
      if (data.type === "hscene-arousal-refresh") {
        AFLP.HScene.refreshArousalBars(data.targetId);
      }

      // A player-run SS macro asks the GM to apply conditions and start the scene.
      // Only the GM processes this; other players ignore it.
      if (data.type === "hscene-player-ss" && game.user.isGM) {
        (async () => {
          const srcToken  = canvas.tokens.get(data.srcTokenId);
          const tgtToken  = canvas.tokens.get(data.tgtTokenId);
          const srcActor  = srcToken?.actor?.getWorldActor?.() ?? srcToken?.actor;
          const tgtActor  = tgtToken?.actor?.getWorldActor?.() ?? tgtToken?.actor;
          if (!srcActor || !tgtActor) return;

          const UUID_DOM  = AFLP.conditions?.["dominating"]?.uuid;
          const UUID_SUB  = AFLP.conditions?.["submitting"]?.uuid;
          const UUID_EXP  = AFLP.conditions?.["exposed"]?.uuid;
          if (!UUID_DOM || !UUID_SUB || !UUID_EXP) {
            console.error("AFLP | hscene-player-ss: conditions not loaded yet");
            return;
          }

          async function gmApply(actor, slug, sourceId, value) {
            const existing = actor.items?.find(i => i.slug === slug);
            if (existing) {
              if (slug === "exposed" && (existing.system?.badge?.value ?? 0) < 2) {
                await existing.update({ "system.badge.value": (existing.system.badge.value ?? 0) + 1 });
              }
              return;
            }
            try {
              const doc = await fromUuid(sourceId);
              const itemData = doc.toObject();
              if (value !== null && itemData.system?.badge !== undefined) itemData.system.badge.value = value;
              await actor.createEmbeddedDocuments("Item", [itemData]);
            } catch(e) {
              await actor.increaseCondition?.(slug).catch(() => {});
            }
          }

          // Apply conditions as GM
          await gmApply(srcActor, "dominating", UUID_DOM, null);
          await gmApply(tgtActor, "submitting",  UUID_SUB, null);
          const tgtHasMonstrous = AFLP.actorHasMonstrousProwess?.(tgtActor) ?? false;
          if (!tgtHasMonstrous) await gmApply(tgtActor, "exposed", UUID_EXP, null);

          // Apply any extra conditions requested (toy effects etc.)
          for (const cond of (data.extraConditions ?? [])) {
            const tgt = cond.onSource ? srcActor : tgtActor;
            if (cond.slug === "grabbed")    await tgt.increaseCondition?.("grabbed").catch(() => {});
            if (cond.slug === "restrained") await tgt.increaseCondition?.("restrained").catch(() => {});
            if (cond.slug === "horny")      await gmApply(tgt, "horny", AFLP.conditions?.["horny"]?.uuid ?? "", cond.value ?? 1);
            if (cond.slug === "exposed")    await gmApply(tgt, "exposed", UUID_EXP, null);
          }

          // Grant toy item to target if specified
          if (data.toyUuid) {
            try {
              const toyDoc = await fromUuid(data.toyUuid);
              if (toyDoc) {
                const toyData = toyDoc.toObject();
                toyData.system.equipped = { carryType: "worn", inSlot: true };
                await tgtActor.createEmbeddedDocuments("Item", [toyData]);
              }
            } catch(e) { console.warn("AFLP | Could not grant toy:", e); }
          }

          // Apply Arousal increment if requested
          if (data.arousalGain > 0) {
            await AFLP_Arousal?.increment?.(tgtActor, data.arousalGain, "Sex Toy Snuggle").catch(() => {});
          }

          // Start the H scene (GM-local, socket will sync to others)
          const atkData = { id: data.srcTokenId, actorId: srcActor.id, name: srcActor.name, img: srcActor.img, tokenDoc: srcToken.document };
          const tgtData = { id: data.tgtTokenId, actorId: tgtActor.id, name: tgtActor.name, img: tgtActor.img, tokenDoc: tgtToken.document };
          AFLP.HScene.startScene(atkData, tgtData);
        })().catch(e => console.error("AFLP | hscene-player-ss error:", e));
      }
    });
  }

  // -----------------------------------------------
  // Combat turn hook — foreground active scene
  // -----------------------------------------------
  function _setupCombatHooks() {
    Hooks.on("combatTurnChange", (combat, prior, current) => {
      const currentCombatant = combat.combatants.get(current.combatantId);
      const actorId = currentCombatant?.actorId;
      if (!actorId) return;

      for (const [targetId, scene] of _scenes) {
        const isInvolved = scene.targetActorId === actorId ||
          scene.attackers.some(a => a.actorId === actorId);
        const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
        if (!card) continue;

        if (isInvolved) {
          card.classList.remove("minimized");
          const _dh = document.getElementById('aflp-hscene-drag-handle');
          if (_dh?.nextSibling) _container.insertBefore(card, _dh.nextSibling);
          else _container.appendChild(card);
        }

        // Track bondage/restrained/airlock rounds for the target
        if (game.user.isGM && scene.targetActorId === actorId) {
          const tgtActor = _resolveActor({ id: scene.targetId, actorId: scene.targetActorId });
          if (tgtActor) {
            const hasGrabbed    = tgtActor.items?.some(i => i.slug === "grabbed");
            const hasRestrained = tgtActor.items?.some(i => i.slug === "restrained");
            const hasBondage    = tgtActor.items?.some(i => i.slug === "bonded" || i.name?.toLowerCase().includes("bondage"));
            if (hasGrabbed || hasBondage) scene.bondageRounds = (scene.bondageRounds ?? 0) + 1;
            if (hasRestrained)            scene.restrainedRounds = (scene.restrainedRounds ?? 0) + 1;
          }
          // Airlock: read from card dataset which is updated by porno portrait renderer
          const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
          if (card?.dataset.airlocked) scene.airlockRounds = (scene.airlockRounds ?? 0) + 1;
        }
      }
    });

    Hooks.on("deleteToken", (tokenDoc) => {
      if (!AFLP.Settings.hsceneEnabled || !game.user.isGM) return;
      const tokenId = tokenDoc.id;
      // Check every active scene for this token
      for (const [targetId, scene] of _scenes) {
        if (scene.targetId === tokenId || scene.attackers.some(a => a.id === tokenId)) {
          AFLP.HScene.removeParticipant(targetId, tokenId);
          break; // each token can only be in one scene role at a time
        }
      }
    });

    Hooks.on("deleteCombat", () => {
      if (AFLP.Settings.hsceneEnabled) AFLP.HScene.closeAll();
    });

    // Refresh H scene bars when cumflation flags change (e.g. purge macro success)
    Hooks.on("updateActor", (actor, diff) => {
      if (!AFLP.Settings.hsceneEnabled) return;

      // Refresh arousal bars when AFLP flags change
      const flags = diff?.flags?.[AFLP.FLAG_SCOPE];
      if (flags && ("cumflation" in flags || "horny" in flags || "denied" in flags || "arousal" in flags)) {
        AFLP.HScene.refreshArousalForActor(actor.id);
      }

      // Refresh all cards where this actor is a participant when HP changes.
      // If the actor reaches 0 HP, mark them dead in the card visually
      // and remove them from the scene if they're an attacker.
      const newHP = diff?.system?.attributes?.hp?.value;
      if (newHP == null) return;

      for (const [targetId, scene] of _scenes) {
        const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
        if (!card) continue;

        const isTarget   = (scene.targetActorId ?? scene.targetId) === actor.id;
        const atkIndex   = scene.attackers.findIndex(a => (a.actorId ?? a.id) === actor.id);
        const isAttacker = atkIndex !== -1;
        if (!isTarget && !isAttacker) continue;

        // Track damage taken/dealt during the scene
        if (game.user.isGM) {
          const oldHP = actor.system?.attributes?.hp?.value ?? newHP;
          const delta = oldHP - newHP; // positive = damage taken, negative = healing
          if (delta > 0) {
            if (isTarget) scene.damageTaken = (scene.damageTaken ?? 0) + delta;
            // If an attacker took damage, the target may have dealt it
            if (isAttacker) scene.damageDealt = (scene.damageDealt ?? 0) + delta;
          }
        }

        if (newHP <= 0) {
          if (isTarget) {
            // Target dropped to 0 — close the scene entirely
            if (game.user.isGM) {
              ChatMessage.create({
                content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> has been defeated. The H scene ends.</p></div>`,
                speaker: { alias: "AFLP" },
              });
              AFLP.HScene.closeScene(targetId);
            }
          } else if (isAttacker) {
            // Attacker dropped to 0 — remove them from the scene
            if (game.user.isGM) {
              scene.attackers.splice(atkIndex, 1);
              if (scene.attackers.length === 0) {
                // No attackers left — close scene
                AFLP.HScene.closeScene(targetId);
              } else {
                _refreshPortraits(card, scene);
                _refreshArousalBars(card, scene);
              }
            }
          }
        } else {
          // HP changed but not dead — just refresh bars
          _refreshArousalBars(card, scene);
        }
      }
    });

    // Also refresh when Exposed condition is created/updated/deleted
    Hooks.on("createItem", async (item) => {
      if (!AFLP.Settings.hsceneEnabled || !item.actor) return;
      if (item.slug === "exposed") AFLP.HScene.refreshArousalForActor(item.actor.id);

      // Non-SS scene initiator: when Submitting is applied to an actor outside of
      // Struggle Snuggle (e.g. Four-Armed Ravish, Serpent Coil, Engulf, Abduct),
      // find the actor who just received Dominating in the same combat and start
      // the H scene automatically.
      // Only runs on GM to avoid double-firing.
      if (!game.user.isGM) return;
      if (item.slug !== "submitting") return;
      // Skip if SS is currently running — it handles startScene itself after this hook fires
      if (window._aflpSSInProgress) return;
      const targetActor = item.actor.getWorldActor?.() ?? item.actor;

      // Skip if an H scene already exists for this target
      if (AFLP.HScene._getSceneWhereTarget?.(null, targetActor.id)) return;

      // Find the attacker: an actor in active combat who has Dominating
      // and does NOT already have a scene as an attacker
      const combat = game.combat;
      if (!combat?.started) return;

      let atkToken = null;
      let atkActor = null;
      for (const combatant of combat.combatants) {
        const a = combatant.actor;
        if (!a || a.id === targetActor.id) continue;
        const hasDom = a.items?.some(c =>
          c.slug === "dominating" ||
          (c.flags?.core?.sourceId ?? c.sourceId) === (AFLP.conditions?.["dominating"]?.uuid ?? "NOMATCH")
        );
        if (!hasDom) continue;
        // Make sure this actor isn't already in a scene as an attacker
        let alreadyInScene = false;
        for (const s of (_scenes?.values?.() ?? [])) {
          if (s.attackers?.some(atk => (atk.actorId ?? atk.id) === a.id)) { alreadyInScene = true; break; }
        }
        if (alreadyInScene) continue;
        atkToken = combatant.token;
        atkActor = a;
        break;
      }

      if (!atkToken || !atkActor) return;

      // Find target token in the scene
      const tgtToken = combat.combatants.find(c =>
        c.actor?.id === targetActor.id
      )?.token ?? canvas.tokens.placeables.find(t => t.actor?.id === targetActor.id)?.document;

      if (!tgtToken) return;

      const attackerData = {
        id: atkToken.id, actorId: atkActor.id, name: atkActor.name,
        img: atkActor.img ?? atkToken.texture?.src ?? "",
        tokenDoc: atkToken,
      };
      const targetData = {
        id: tgtToken.id, actorId: targetActor.id, name: targetActor.name,
        img: targetActor.img ?? tgtToken.texture?.src ?? "",
        tokenDoc: tgtToken,
      };

      // Small delay to let Dominating condition also finish applying
      await new Promise(r => setTimeout(r, 50));
      AFLP.HScene.startScene(attackerData, targetData);
    });
    Hooks.on("updateItem", (item, diff) => {
      if (!AFLP.Settings.hsceneEnabled || !item.actor) return;
      if (item.slug === "exposed" && diff?.system?.badge?.value != null) {
        AFLP.HScene.refreshArousalForActor(item.actor.id);
      }
    });
    Hooks.on("deleteItem", (item) => {
      if (!AFLP.Settings.hsceneEnabled || !item.actor) return;
      if (item.slug === "exposed") AFLP.HScene.refreshArousalForActor(item.actor.id);
    });
  }

  // -----------------------------------------------
  // Make the container draggable via a handle element
  // -----------------------------------------------
  function _makeDraggable(el, handle) {
    let dragging = false;
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;

    handle.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      dragging = true;
      handle.style.cursor = "grabbing";

      // Convert centered / right-anchored position to absolute left on first drag
      const rect = el.getBoundingClientRect();
      el.style.right     = "auto";
      el.style.transform = "none";
      el.style.left      = rect.left + "px";
      el.style.top       = rect.top  + "px";

      startX  = e.clientX;
      startY  = e.clientY;
      origLeft = rect.left;
      origTop  = rect.top;

      e.preventDefault();
    });

    document.addEventListener("mousemove", e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = Math.max(0, origLeft + dx) + "px";
      el.style.top  = Math.max(0, origTop  + dy) + "px";
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = "grab";
    });
  }

  // -----------------------------------------------
  // Public API
  // -----------------------------------------------
  return {

    register() {
      _setupSocket();
      _setupCombatHooks();
      // Restore scenes active before a page reload (like combat tracking).
      // 1500ms defer lets canvas, tokens, and world settings all settle first.
      if (game.user.isGM && AFLP.Settings.hsceneEnabled) {
        setTimeout(() => _restoreSceneState().catch(() => {}), 1500);
      }
    },

    // Calculate true arousal max for an actor
    // Base 6 + Denied level + any flag overrides
    calcArousalMax(actor) {
      const FLAG = AFLP.FLAG_SCOPE;
      const base = actor.getFlag(FLAG, "arousal")?.maxBase ?? 6;
      // Denied adds to arousal max — read from flag (migrated from condition item in ensureCoreFlags).
      const deniedVal = actor.getFlag(FLAG, "denied")?.value ?? 0;
      return base + deniedVal;
    },

    // Start a new H scene or add attacker to existing one.
    // target/attacker objects: { id, actorId, name, img }
    // id = token ID (unique per placed token), actorId = world actor ID.
    // Scenes are keyed by target TOKEN id so two tokens of the same actor
    // are treated as distinct participants.
    startScene(attacker, target, fromSocket = false) {
      if (!AFLP.Settings.hsceneEnabled) return;
      _ensureContainer();
      _applyDragHandleTheme(document.getElementById('aflp-hscene-drag-handle'), _container);

      // If the target is already the target in an existing scene, join it (gangbang support).
      const existingScene = this._getSceneWhereTarget(target.id, target.actorId);
      if (existingScene) {
        this.addAttacker(existingScene.targetId, attacker, fromSocket);
        return;
      }

      const scene = {
        targetId:       target.id,
        targetActorId:  target.actorId ?? target.id,
        targetName:     target.name,
        targetImg:      target.img,
        targetTokenDoc: target.tokenDoc ?? null,
        attackers:      [{ id: attacker.id, actorId: attacker.actorId ?? attacker.id, name: attacker.name, img: attacker.img, tokenDoc: attacker.tokenDoc ?? null }],
        log:            [],
        orgasms:        {},   // tokenId -> count for this scene
        // ── Scene stats ──────────────────────────────────────────────────
        damageTaken:    0,    // HP lost by target during scene
        damageDealt:    0,    // HP dealt by target to others during scene
        bondageRounds:  0,    // turns target spent with grabbed/bondage condition
        restrainedRounds: 0,  // turns target spent with restrained condition
        airlockRounds:  0,    // turns target spent airlocked (all holes filled)
        loadsReceived:  0,    // total cum events into target
        loadsByHole:    { anal: 0, oral: 0, vaginal: 0, facial: 0 },
        creaturesFucked: new Set(), // actorIds of unique attackers who cummed into target
        orgasmsByAttacker: {}, // actorId -> cumCount (attackers who cummed from scene)
      };
      _scenes.set(target.id, scene);
      _saveSceneState();

      const card = _buildCard(scene);
      // Card starts hidden — revealed by _revealCard() after any position dialog
      card.style.display = "none";
      _container.appendChild(card);
      _container.style.display = "flex";

      // Reveal helper — keyed by targetId so SA macro can call it too
      const _revealCard = () => { card.style.display = ""; };
      // Expose on module-level map so SA can call it after its own position dialog
      _pendingReveal.set(scene.targetId, _revealCard);

      const needsPositionPrompt = (
        !fromSocket && AFLP.Settings.positionTracking && game.user.isGM &&
        attacker.actorId !== target.actorId
      );

      // Role selection prompt - only fire if NEITHER actor has any role assigned.
      // SS always sets Dominating on the attacker before calling startScene, so
      // atkHasRole will be true and this prompt won't fire for SS-initiated scenes.
      // Also skip if the SS macro is in progress (cross-client safety).
      if (!fromSocket && game.user.isGM && !window._aflpMacroHandlingPosition && !window._aflpSSInProgress) {
        const isSelfScene = attacker.actorId === target.actorId;
        if (!isSelfScene) {
          const atkActor = canvas?.tokens?.get(attacker.id)?.actor
                        ?? game.actors.get(attacker.actorId ?? attacker.id);
          const tgtActor = canvas?.tokens?.get(target.id)?.actor
                        ?? game.actors.get(target.actorId ?? target.id);
          // Check token actor items directly (more reliable than hasCondition for synthetic actors)
          const atkHasRole = atkActor?.items?.some(c => c.slug === "dominating" || c.slug === "submitting")
                          || atkActor?.hasCondition?.("dominating") || atkActor?.hasCondition?.("submitting");
          const tgtHasRole = tgtActor?.items?.some(c => c.slug === "dominating" || c.slug === "submitting")
                          || tgtActor?.hasCondition?.("dominating") || tgtActor?.hasCondition?.("submitting");
          if (!atkHasRole && !tgtHasRole && atkActor && tgtActor) {
            AFLP.HScene._promptRoleSelection(atkActor, tgtActor).catch(() => {});
          }
        }
      }

      if (needsPositionPrompt && !window._aflpMacroHandlingPosition) {
        // startScene handles position itself — reveal card when dialog resolves
        const atkData  = scene.attackers[0];
        const atkActor = canvas?.tokens?.get(attacker.id)?.actor
                      ?? game.actors.get(attacker.actorId ?? attacker.id);
        if (atkData && atkActor) {
          AFLP.HScene._promptAndSetPosition(scene, atkData, atkActor)
            .catch(() => {})
            .finally(() => AFLP.HScene.revealCard(scene.targetId));
        } else {
          AFLP.HScene.revealCard(scene.targetId);
        }
      } else if (!needsPositionPrompt || fromSocket) {
        // No position dialog needed — show immediately
        AFLP.HScene.revealCard(scene.targetId);
      }
      // If _aflpMacroHandlingPosition: SA macro will call revealCard after its dialog

      // Broadcast to other clients
      if (!fromSocket && game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", {
          type:           "hscene-start",
          attackerId:     attacker.id,
          attackerActorId: attacker.actorId ?? attacker.id,
          attackerName:   attacker.name,
          attackerImg:    attacker.img,
          targetId:       target.id,
          targetActorId:  target.actorId ?? target.id,
          targetName:     target.name,
          targetImg:      target.img,
        });
      }
    },

    addAttacker(targetId, attacker, fromSocket = false) {
      const scene = _scenes.get(targetId);
      if (!scene) return;

      // Avoid duplicates
      if (scene.attackers.some(a => a.id === attacker.id)) return;
      scene.attackers.push({ id: attacker.id, actorId: attacker.actorId ?? attacker.id, name: attacker.name, img: attacker.img, tokenDoc: attacker.tokenDoc ?? null });
      _saveSceneState();

      const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
      if (card) {
        _refreshPortraits(card, scene); // also calls _updateContainerWidth internally
        _refreshArousalBars(card, scene);
      }

      // Prompt for position if tracking is on and this is the local user adding themselves
      // (not a socket relay from another client).
      // Skip if a macro (e.g. SA) is handling the position prompt itself to avoid double dialogs.
      if (!fromSocket && AFLP.Settings.positionTracking && game.user.isGM && !window._aflpMacroHandlingPosition) {
        const atkData  = scene.attackers.find(a => a.id === attacker.id);
        const atkActor = canvas?.tokens?.get(attacker.id)?.actor
                      ?? game.actors.get(attacker.actorId ?? attacker.id);
        if (atkData && atkActor) {
          // If new attacker has no role condition, apply Dominating (standard for scene joiners).
          // Fire role prompt only if they somehow have Submitting already.
          const hasRole = atkActor.hasCondition?.("dominating") || atkActor.hasCondition?.("submitting");
          if (!hasRole) {
            try {
              const { increaseCondition } = game.pf2e?.Condition ?? {};
              if (increaseCondition) increaseCondition(atkActor, "dominating").catch(() => {});
            } catch {}
          }
          // Fire async without blocking — attacker is already in scene
          AFLP.HScene._promptAndSetPosition(scene, atkData, atkActor).catch(() => {});
        }
      }

      if (!fromSocket && game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", {
          type:            "hscene-add-attacker",
          targetId,
          attackerId:      attacker.id,
          attackerActorId: attacker.actorId ?? attacker.id,
          attackerName:    attacker.name,
          attackerImg:     attacker.img,
        });
      }
    },

    // Remove a single participant (attacker) from an active scene by their token ID.
    // If it's a 2-person scene (1 attacker + target) and the attacker leaves,
    // or the target leaves, the scene closes entirely.
    // fromSocket: true when called via socket relay (skip re-broadcast).
    removeParticipant(targetId, tokenId, fromSocket = false) {
      const scene = _scenes.get(targetId);
      if (!scene) return;

      const isTarget = scene.targetId === tokenId;

      if (isTarget) {
        // Target leaving always closes the scene entirely
        if (game.user.isGM) AFLP.HScene.closeScene(targetId);
        if (!fromSocket && game.user.isGM) {
          game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type: "hscene-close", targetId });
        }
        return;
      }

      const atkIndex = scene.attackers.findIndex(a => a.id === tokenId);
      if (atkIndex === -1) return;

      // Clean up Dominating condition from the leaving attacker
      if (game.user.isGM) {
        const atk = scene.attackers[atkIndex];
        const atkActor = _resolveActor(atk);
        if (atkActor) {
          const domCond = atkActor.items?.find(c =>
            c.slug === "dominating" ||
            (c.flags?.core?.sourceId ?? c.sourceId) === (AFLP.conditions?.["dominating"]?.uuid ?? "")
          );
          if (domCond) domCond.delete().catch(() => {});
        }
      }

      scene.attackers.splice(atkIndex, 1);

      // Last attacker left — close the whole scene
      if (scene.attackers.length === 0) {
        if (game.user.isGM) AFLP.HScene.closeScene(targetId);
        if (!fromSocket && game.user.isGM) {
          game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type: "hscene-close", targetId });
        }
        return;
      }

      // More attackers remain — refresh the card and persist
      const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
      if (card) {
        _refreshPortraits(card, scene);
        _refreshArousalBars(card, scene);
      }
      _saveSceneState();

      if (!fromSocket && game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", {
          type: "hscene-remove-participant",
          targetId,
          tokenId,
        });
      }
    },

    // Add a prose line to the card for a given target actor
    addProse(targetId, text, type = "flavor") {
      const scene = _scenes.get(targetId);
      const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
      if (!card) return;
      _showProse(card, text, type, scene);
    },

    // Generate and show flavour prose for an action
    generateAndShowProse(targetId, actionType, attackerActor, targetActor) {
      const prose = _generateProse(actionType, attackerActor, targetActor);
      if (prose) this.addProse(targetId, prose, "flavor");
    },

    // Exposed for external callers (e.g. SA macro for masturbation prose)
    _generateProse(type, attackerActor, targetActor) {
      return _generateProse(type, attackerActor, targetActor);
    },

    // Shake the portrait of a specific actor across all cards
    triggerShake(actorId, fromSocket = false) {
      if (!_container) return;
      const portraits = _container.querySelectorAll(
        `[data-actor-name]`
      );
      // Match by actor name or find via scene map
      for (const [targetId, scene] of _scenes) {
        const card = _container.querySelector(`[data-target-id="${targetId}"]`);
        if (!card) continue;

        const isTarget   = (scene.targetActorId ?? scene.targetId) === actorId;
        const isAttacker = scene.attackers.some(a => (a.actorId ?? a.id) === actorId);
        if (!isTarget && !isAttacker) continue;

        // Find the right portrait wrap — target is first, attackers follow
        const allActorIds = [scene.targetId, ...scene.attackers.map(a => a.id)];
        const idx = allActorIds.indexOf(actorId);
        const wraps = card.querySelectorAll(".aflp-portrait-wrap");
        const wrap = wraps[idx];
        if (!wrap) continue;

        wrap.classList.remove("shaking");
        // Force reflow
        void wrap.offsetWidth;
        wrap.classList.add("shaking");
        setTimeout(() => wrap.classList.remove("shaking"), 600);
      }

      if (!fromSocket && game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", {
          type: "hscene-shake", actorId
        });
      }
    },

    // Refresh arousal bars on all cards showing this target
    refreshArousalBars(targetId, fromSocket = false) {
      const scene = _scenes.get(targetId);
      if (!scene) return;
      const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
      if (card) _refreshArousalBars(card, scene);

      if (!fromSocket && game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", {
          type: "hscene-arousal-refresh", targetId
        });
      }
    },

    // Refresh all arousal bars that include a given actor id.
    // Searches both targetId and the attackers list so source bars update too.
    // actorId is the world actor ID — match against stored actorId fields
    // Record a load received by the target actor from an attacker actor, into a given hole.
    // Called from the cum macro after cumflation is applied.
    incrementSceneLoads(targetActorId, attackerActorId, hole) {
      if (!game.user.isGM) return;
      const sceneEntry = [..._scenes.entries()].find(([, sc]) => sc.targetActorId === targetActorId);
      if (!sceneEntry) return;
      const [, scene] = sceneEntry;
      scene.loadsReceived = (scene.loadsReceived ?? 0) + 1;
      if (hole && scene.loadsByHole) scene.loadsByHole[hole] = (scene.loadsByHole[hole] ?? 0) + 1;
      if (attackerActorId) {
        if (!scene.creaturesFucked) scene.creaturesFucked = new Set();
        scene.creaturesFucked.add(attackerActorId);
      }
    },

    // Called from _onArousalMax to increment the per-scene orgasm counter
    incrementSceneOrgasm(actorId, tokenId) {
      for (const scene of _scenes.values()) {
        const allIds = [
          { id: scene.targetId, actorId: scene.targetActorId },
          ...scene.attackers.map(a => ({ id: a.id, actorId: a.actorId }))
        ];
        const match = allIds.find(p =>
          (tokenId && p.id === tokenId) || p.actorId === actorId
        );
        if (!match) continue;
        scene.orgasms[match.id] = (scene.orgasms[match.id] ?? 0) + 1;
        // Refresh the card so the counter updates immediately
        const card = _container?.querySelector(`[data-target-id="${scene.targetId}"]`);
        if (card) _refreshArousalBars(card, scene);
        break;
      }
    },

    refreshArousalForActor(actorId) {
      for (const [targetId, scene] of _scenes) {
        const involved = (scene.targetActorId ?? scene.targetId) === actorId ||
          scene.attackers.some(a => (a.actorId ?? a.id) === actorId);
        if (involved) {
          const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
          if (card) _refreshArousalBars(card, scene);
        }
      }
    },

    // Reveal a card that was created hidden (used by SA macro after position dialog)
    revealCard(targetId) {
      const fn = _pendingReveal.get(targetId);
      if (fn) { fn(); _pendingReveal.delete(targetId); }
      // If no pending fn (e.g. already revealed), just ensure card is visible
      const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
      if (card) card.style.display = "";
    },

    // Rebuild portraits + arousal for a specific scene (used by theme change onChange)
    refreshScene(targetId) {
      const scene = _scenes.get(targetId);
      if (!scene) return;
      const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
      if (!card) return;
      _refreshPortraits(card, scene);
      _refreshArousalBars(card, scene);
    },

    // Re-inject all theme CSS (called by onChange when theme changes)
    _rebuildStyle() {
      const styleEl = document.getElementById("aflp-hscene-styles-v2");
      if (styleEl) styleEl.textContent = _cardCSS() + _statusStripCSS() + _pornoSceneCSS() + _dossierCSS();
    },

    async closeScene(targetId) {
      const card = _container?.querySelector(`[data-target-id="${targetId}"]`);

      // Remove Dominating from all attackers and Submitting from target when scene ends.
      // Only runs on GM client to avoid duplicate writes.
      if (game.user.isGM) {
        const scene = _scenes.get(targetId);
        if (scene) {
          // Remove Submitting from target
          const tgtParticipant = { id: scene.targetId, actorId: scene.targetActorId, tokenDoc: scene.targetTokenDoc };
          const targetActor = _resolveActor(tgtParticipant);
          if (targetActor) {
            for (const slug of ["submitting", "grabbed", "restrained"]) {
              const cond = targetActor.items?.find(c =>
                c.slug === slug || c.sourceId === AFLP.conditions[slug]?.uuid
              );
              if (cond) cond.delete().catch(() => {});
            }
          }
          // Remove Dominating from each attacker
          for (const atk of scene.attackers ?? []) {
            const atkActor = _resolveActor(atk);
            if (!atkActor) continue;
            const dominating = atkActor.items?.find(c =>
              c.slug === "dominating" || c.sourceId === AFLP.conditions["dominating"]?.uuid
            );
            if (dominating) dominating.delete().catch(() => {});
          }

          // Mind Break → Creature Fetish: remove MB from all scene participants.
          // The deleteItem hook in aflp-kinks.js fires onMindBreakEndCreatureFetish,
          // which reads mbCumCounts and grants the appropriate CF level.
          const allParticipants = [
            { actor: targetActor },
            ...(scene.attackers ?? []).map(a => ({ actor: _resolveActor(a) })),
          ];
          for (const { actor: pActor } of allParticipants) {
            if (!pActor) continue;
            const mbItem = pActor.items?.find(c =>
              c.slug === "mind-break" || c.sourceId === AFLP.conditions?.["mind-break"]?.uuid
            );
            if (mbItem) mbItem.delete().catch(() => {});
          }
        }
      }

      // ── End-of-scene report ─────────────────────────────────────────────
      // Post a styled chat card summarising the scene stats for the target.
      if (game.user.isGM) {
        const scene = _scenes.get(targetId);
        if (scene) {
          const tgtName   = scene.targetName ?? "Unknown";
          const tgtImg    = scene.targetImg  ?? "";
          const orgTotal  = Object.values(scene.orgasms ?? {}).reduce((a,b)=>a+b,0);
          const tgtOrgasms = scene.orgasms?.[scene.targetId] ?? 0;
          const atkOrgasms = orgTotal - tgtOrgasms;
          const byHole    = scene.loadsByHole ?? {};

          // Resolve target actor first - needed for cumflation flags and title check
          const tgtActor = _resolveActor({ id: scene.targetId, actorId: scene.targetActorId });

          // Cumflation percentage: read actual tier values from the target actor's flags
          // Tiers 0-8 per hole (anal, oral, vaginal, facial) → max 32 total
          const cumFlags   = tgtActor?.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? {};
          const cumTierSum = (cumFlags.anal ?? 0) + (cumFlags.oral ?? 0) +
                             (cumFlags.vaginal ?? 0) + (cumFlags.facial ?? 0);
          const cumPct     = Math.round((cumTierSum / 32) * 100);
          const cumPctStr  = cumTierSum > 0 ? `${cumPct}% full` : null;

          const creatures = (scene.creaturesFucked instanceof Set)
            ? scene.creaturesFucked.size
            : (scene.creaturesFucked?.length ?? 0);
          const dmgTaken   = scene.damageTaken    ?? 0;
          const dmgDealt   = scene.damageDealt    ?? 0;
          const bRounds    = scene.bondageRounds  ?? 0;
          const rRounds    = scene.restrainedRounds ?? 0;
          const aRounds    = scene.airlockRounds  ?? 0;

          const row = (label, val, show = true) =>
            show ? `<tr>
              <td style="color:#aaa;padding:2px 8px 2px 0;font-size:11px;line-height:1.4;">${label}</td>
              <td style="font-weight:600;color:#e0c8a0;text-align:right;white-space:nowrap;font-size:11px;padding-left:8px;">${val}</td>
            </tr>` : "";

          const holeRows = [
            byHole.vaginal ? row("└ Vaginal loads",  byHole.vaginal) : "",
            byHole.anal    ? row("└ Anal loads",     byHole.anal)    : "",
            byHole.oral    ? row("└ Oral loads",     byHole.oral)    : "",
            byHole.facial  ? row("└ Facial loads",   byHole.facial)  : "",
          ].join("");

          // Collect newly awarded titles during this scene (check now)
          let newTitles = [];
          if (tgtActor && window.AFLP_Titles) {
            newTitles = await AFLP_Titles.checkAndAward(tgtActor).catch(() => []);
          }

          const titlesHtml = newTitles.length > 0
            ? `<div style="margin-top:8px;border-top:1px solid rgba(200,160,80,0.3);padding-top:6px;">
                <div style="font-size:10px;color:#c9a96e;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Titles Earned</div>
                ${newTitles.map(t => `<div style="color:#e0c880;font-style:italic;">🏆 ${AFLP_Titles._name(t.id, t.name)}</div>`).join("")}
              </div>`
            : "";

          const reportHtml = `
            <div style="font-family:sans-serif;background:rgba(10,8,4,0.92);border:1px solid rgba(200,160,80,0.35);border-radius:4px;overflow:hidden;">
              <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid rgba(200,160,80,0.2);background:rgba(200,160,80,0.06);">
                ${tgtImg ? `<img src="${tgtImg}" style="width:40px;height:40px;border-radius:3px;object-fit:cover;object-position:top;flex-shrink:0;"/>` : ""}
                <div>
                  <div style="font-size:9px;color:rgba(200,160,80,0.6);letter-spacing:0.1em;text-transform:uppercase;">Scene Report</div>
                  <div style="font-size:14px;font-weight:700;color:#e0c8a0;">${tgtName}</div>
                </div>
              </div>
              <div style="padding:6px 10px;">
                <table style="border-collapse:collapse;width:100%;">
                  <colgroup><col/><col style="width:auto;"/></colgroup>
                  ${row("Number of creatures had sex with", creatures,   creatures > 0)}
                  ${row("Times orgasmed",      tgtOrgasms,  tgtOrgasms > 0)}
                  ${row("Times made a creature orgasm",  atkOrgasms,  atkOrgasms > 0)}
                  ${row("Total bodily capacity filled with cum", cumPctStr, !!cumPctStr)}
                  ${byHole.vaginal ? row("└ Vaginal",  `${byHole.vaginal} load${byHole.vaginal>1?"s":""}`) : ""}
                  ${byHole.anal    ? row("└ Anal",     `${byHole.anal} load${byHole.anal>1?"s":""}`)    : ""}
                  ${byHole.oral    ? row("└ Oral",     `${byHole.oral} load${byHole.oral>1?"s":""}`)    : ""}
                  ${byHole.facial  ? row("└ Facial",   `${byHole.facial} load${byHole.facial>1?"s":""}`)  : ""}
                  ${row("Damage taken",        dmgTaken,    dmgTaken > 0)}
                  ${row("Damage dealt",        dmgDealt,    dmgDealt > 0)}
                  ${row("Rounds grabbed/bondage", bRounds,  bRounds > 0)}
                  ${row("Rounds restrained",   rRounds,     rRounds > 0)}
                  ${row("Rounds airlocked",    aRounds,     aRounds > 0)}
                </table>
                ${titlesHtml}
              </div>
            </div>`;

          // Determine whisper recipients based on setting
          const reportVis = AFLP.Settings.sceneReportVisibility ?? "public";
          let whisperList = undefined; // undefined = public
          if (reportVis === "gm") {
            whisperList = ChatMessage.getWhisperRecipients("GM");
          } else if (reportVis === "player") {
            // Find the player who owns the submitting actor
            const gmRecips = ChatMessage.getWhisperRecipients("GM");
            const tgtPlayerUser = tgtActor
              ? game.users.find(u => !u.isGM && tgtActor.testUserPermission(u, "OWNER"))
              : null;
            whisperList = tgtPlayerUser
              ? [...new Set([...gmRecips, tgtPlayerUser.id])]
              : gmRecips;
          }

          ChatMessage.create({
            content: reportHtml,
            speaker: { alias: "AFLP — Scene End" },
            ...(whisperList !== undefined ? { whisper: whisperList } : {}),
          }).catch(() => {});

          // Persist damage stats to actor flags for title detection
          if (tgtActor) {
            const sexual = structuredClone(tgtActor.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? {});
            if (!sexual.lifetime) sexual.lifetime = {};
            sexual.lifetime.damageTaken  = (sexual.lifetime.damageTaken  ?? 0) + dmgTaken;
            sexual.lifetime.damageDealt  = (sexual.lifetime.damageDealt  ?? 0) + dmgDealt;
            sexual.lifetime.airlockRounds = (sexual.lifetime.airlockRounds ?? 0) + aRounds;
            tgtActor.setFlag(AFLP.FLAG_SCOPE, "sexual", sexual).catch(() => {});
          }
        }
      }

      card?.remove();
      _scenes.delete(targetId);
      _saveSceneState();

      // Recalculate container width after scene closes
      _updateContainerWidth();

      // Hide the container entirely when no scenes remain.
      // Leaving an empty fixed-position container with a drag handle visible
      // caused the element to cover the sidebar after dragging (vadenveil bug).
      if (_container && _scenes.size === 0) {
        _container.style.display = "none";
      }
    },

    // Internal: get scene for a given world actor ID.
    // Checks targetActorId first, then attacker actorIds.
// Expose scene iterator for external role-aware lookups (e.g. cum macro).
    get _scenes() { return _scenes; },

    _getScene(actorId) {
      for (const scene of _scenes.values()) {
        if ((scene.targetActorId ?? scene.targetId) === actorId) return scene;
        if (scene.attackers.some(a => (a.actorId ?? a.id) === actorId)) return scene;
      }
      return null;
    },

    // Returns the scene where this token ID is the TARGET (not just any participant).
    // Used so a new attacker can join an existing scene rather than spawning a duplicate.
    _getSceneWhereTarget(tokenId, actorId) {
      // Prefer exact token-id match first, then fall back to actor-id match
      for (const scene of _scenes.values()) {
        if (scene.targetId === tokenId) return scene;
      }
      if (actorId) {
        for (const scene of _scenes.values()) {
          if ((scene.targetActorId ?? scene.targetId) === actorId) return scene;
        }
      }
      return null;
    },

    closeAll() {
      if (_container) {
        _container.remove();
        _container = null;
      }
      _scenes.clear();
      _saveSceneState();
    },

    // -----------------------------------------------
    // Position picker dialog — shared by scene start,
    // SA button, and Change Position button.
    // Resolves with the chosen position id or null if dismissed.
    // -----------------------------------------------

    // -----------------------------------------------
    // Role selection prompt — fires when a scene starts and neither
    // actor has Dominating/Submitting conditions. Shows a simple two-option
    // dialog: attacker dominates, or target dominates (reverse scene).
    // Applies the chosen conditions to both actors.
    // -----------------------------------------------
    async _promptRoleSelection(atkActor, targetActor) {
      if (!game.user.isGM) return null;

      const atkName = atkActor?.name ?? "Attacker";
      const tgtName = targetActor?.name ?? "Target";
      const atkImg  = atkActor?.img ?? "";
      const tgtImg  = targetActor?.img ?? "";

      const btnStyle = "display:flex;align-items:center;gap:10px;width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(200,160,80,0.3);border-radius:5px;color:#f0e8d0;cursor:pointer;padding:8px 12px;margin-bottom:8px;text-align:left;font-family:var(--font-primary,serif);font-size:12px;";
      const imgStyle = "width:36px;height:36px;border-radius:3px;object-fit:cover;object-position:top;pointer-events:none;flex-shrink:0;";
      const content = `
        <div style="padding:4px 0 2px;font-size:10px;color:#666;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Who is in control?</div>
        <button type="button" data-choice="attacker-dom" style="${btnStyle}">
          <img src="${atkImg}" alt="${atkName}" style="${imgStyle}"/>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <strong style="font-size:11px;color:#c9a96e;">${atkName} is Dominating</strong>
            <span style="font-size:10px;color:#888;">${tgtName} is Submitting</span>
          </div>
        </button>
        <button type="button" data-choice="target-dom" style="${btnStyle}">
          <img src="${tgtImg}" alt="${tgtName}" style="${imgStyle}"/>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <strong style="font-size:11px;color:#c9a96e;">${tgtName} is Dominating</strong>
            <span style="font-size:10px;color:#888;">${atkName} is Submitting</span>
          </div>
        </button>`;

      let resolveRole;
      const rolePromise = new Promise(r => { resolveRole = r; });

      foundry.applications.api.DialogV2.wait({
        window:   { title: "Choose Scene Roles" },
        position: { width: 300 },
        content,
        buttons: [{ action: "skip", label: "Skip", callback: async () => resolveRole(null) }],
        close:   async () => resolveRole(null),
        render(ev, dlg) {
          dlg.element.querySelectorAll("[data-choice]").forEach(btn => {
            btn.addEventListener("click", () => {
              resolveRole(btn.dataset.choice);
              dlg.close();
            });
          });
        },
      }, { classes: ["aflp-dialog"] });

      const choice = await rolePromise;
      if (!choice) return null;

      // Apply conditions using the same pattern as SS applyCondition
      const dominator = choice === "attacker-dom" ? atkActor  : targetActor;
      const submitter = choice === "attacker-dom" ? targetActor : atkActor;

      const _applyRole = async (actor, slug) => {
        const live = actor.token?.actor ?? actor;
        const already = live.items?.find(i => (i.slug ?? i.system?.slug ?? "") === slug);
        if (already) return;
        try {
          const uuid = AFLP.conditions?.[slug]?.uuid;
          const doc  = uuid ? await fromUuid(uuid) : null;
          if (doc) {
            await live.createEmbeddedDocuments("Item", [doc.toObject()]);
          } else if (typeof live.increaseCondition === "function") {
            await live.increaseCondition(slug);
          }
        } catch(e) {
          console.warn(`AFLP | Role prompt: could not apply ${slug} to ${actor.name}:`, e.message);
        }
      };

      await _applyRole(dominator, "dominating");
      await _applyRole(submitter, "submitting");

      return choice;
    },

    async _promptAndSetPosition(scene, atkData, atkActor) {
      const targetActor = _resolveActor({
        id: scene.targetId, actorId: scene.targetActorId, tokenDoc: scene.targetTokenDoc
      });
      const targetPronouns = AFLP.getPronouns(targetActor);
      const hasCock = !!atkActor?.getFlag(AFLP.FLAG_SCOPE, "cock");

      const positionId = await AFLP.HScene._showPositionDialog(atkActor, targetActor, hasCock, targetPronouns);
      if (!positionId) return; // dismissed — leave unset

      // Store on the scene's attacker object
      atkData.position = positionId;
      _saveSceneState();

      // Post to scene log
      const posEntry = AFLP.getPosition(positionId);
      if (posEntry) {
        const prevPosition = atkData._prevPosition;
        const isChange = !!prevPosition && prevPosition !== positionId;
        const phrase = posEntry.logPhrase(atkData.name, scene.targetName, targetPronouns);
        const logText = isChange
          ? `${atkData.name} changes position: ${phrase}`
          : phrase;
        AFLP.HScene.addProse(scene.targetId, logText, "action");
        atkData._prevPosition = positionId;
      }

      // Refresh the card so portraits + pills update
      const card = _container?.querySelector(`[data-target-id="${scene.targetId}"]`);
      if (card) {
        _refreshPortraits(card, scene);
        _refreshArousalBars(card, scene);
      }
    },

    // -----------------------------------------------
    // Masturbation position picker — branched menu for
    // single-actor self-play. No cock-in-self-hole options
    // unless actor has the Ouroboros feat.
    // -----------------------------------------------
    async _showMasturbationDialog(actor) {
      const hasCock   = !!actor?.getFlag(AFLP.FLAG_SCOPE, "cock");
      const hasPussy  = !!actor?.getFlag(AFLP.FLAG_SCOPE, "pussy");
      const actorName = actor?.name ?? "Actor";
      const actorImg  = actor?.img ?? "";

      // Detect weapon type for toy option
      const equippedWeapon = actor?.items?.find(i =>
        i.type === "weapon" && i.system?.equipped?.carryType === "held"
      );
      const weaponName = equippedWeapon?.name ?? null;
      const _wn2 = weaponName?.toLowerCase() ?? "";
      const weaponPart2 = !weaponName ? null
        : (_wn2.includes("sword") || _wn2.includes("blade") || _wn2.includes("dagger") || _wn2.includes("knife") || _wn2.includes("shiv") || _wn2.includes("saber") || _wn2.includes("rapier"))
          ? "hilt"
        : (_wn2.includes("axe") || _wn2.includes("ax") || _wn2.includes("maul") || _wn2.includes("hammer") || _wn2.includes("mace") || _wn2.includes("club"))
          ? "handle"
        : (_wn2.includes("spear") || _wn2.includes("staff") || _wn2.includes("pole") || _wn2.includes("halberd") || _wn2.includes("lance"))
          ? "shaft"
        : (_wn2.includes("bow") || _wn2.includes("crossbow"))
          ? "grip"
        : "handle";
      const toyLabel = weaponName ? `${weaponName} (${weaponPart2})` : null;

      const makeBtn = (id, label) =>
        `<button type="button" class="aflp-pos-choice" data-pos-id="${id}"
          style="display:block;width:100%;text-align:left;
                 background:rgba(255,255,255,0.07);
                 border:1px solid rgba(200,160,80,0.3);
                 border-radius:4px;color:#f0e8d0;
                 cursor:pointer;font-size:12px;
                 padding:5px 10px;margin-bottom:4px;
                 font-family:var(--font-primary,serif);">${label}</button>`;

      const makeSection = (title, buttons) =>
        `<div style="margin-bottom:10px;">
          <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;
                      color:rgba(200,160,80,0.7);margin-bottom:5px;border-bottom:
                      1px solid rgba(200,160,80,0.2);padding-bottom:3px;">${title}</div>
          ${buttons}
        </div>`;

      // Foreplay: merged touching + fingering
      const foreplayBtns2 = [
        ...(hasCock  ? [makeBtn("groping-cock",    "Stroking cock")] : []),
        ...(hasPussy ? [makeBtn("groping-pussy",   "Touching pussy")] : []),
        makeBtn("groping-ass",     "Groping ass"),
        makeBtn("groping-chest",   "Chest"),
        makeBtn("groping-nipples", "Nipples"),
        makeBtn("licking",         "Licking"),
        ...(hasPussy ? [makeBtn("fingering-pussy", "Fingering Pussy")] : []),
        makeBtn("fingering-ass",   "Fingering Ass"),
        makeBtn("fingering-mouth", "Mouth play"),
      ];
      const foreplaySection = makeSection(
        "Foreplay",
        foreplayBtns2.join("")
      );

      // Toy/weapon: only if holding one
      const toySection = toyLabel ? makeSection(
        "Toy / Implement",
        [
          ...(hasPussy ? [makeBtn("toy-pussy", `${toyLabel} — Pussy`)] : []),
          makeBtn("toy-ass", `${toyLabel} — Ass`),
        ].join("")
      ) : "";

      const content = `
        <div style="background:rgba(10,8,6,0.6);border-radius:4px;padding:10px;max-width:300px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;
                      padding-bottom:8px;border-bottom:1px solid rgba(200,160,80,0.2);">
            <div style="width:44px;height:44px;border-radius:4px;overflow:hidden;
                        border:1px solid rgba(200,160,80,0.4);flex-shrink:0;">
              <img src="${actorImg}" style="width:100%;height:100%;object-fit:cover;object-position:top;pointer-events:none;" alt="${actorName}"/>
            </div>
            <div>
              <div style="font-size:13px;font-weight:bold;color:#f0e8d0;">${actorName}</div>
              <div style="font-size:10px;color:#aaa;margin-top:1px;">Taking care of themselves</div>
            </div>
          </div>
          ${foreplaySection}
          ${toySection}
        </div>`;

      let resolvePos;
      const posPromise = new Promise(r => { resolvePos = r; });

      foundry.applications.api.DialogV2.wait({
        window:   { title: "Masturbation" },
        position: { width: 320 },
        content,
        buttons: [{ action: "skip", label: "Skip", callback: async () => resolvePos(null) }],
        close:    async () => resolvePos(null),
        render(ev, dlg) {
          dlg.element.querySelectorAll(".aflp-pos-choice").forEach(btn => {
            btn.addEventListener("click", () => {
              resolvePos(btn.dataset.posId);
              dlg.close();
            });
          });
        },
      }, { classes: ["aflp-dialog"] });

      return posPromise;
    },

    // -----------------------------------------------
    // The actual position picker dialog — styled like
    // the H scene card: dark, actor portraits, clear labeling.
    // -----------------------------------------------
    async _showPositionDialog(atkActor, targetActor, hasCock, targetPronouns) {
        const atkName    = atkActor?.name  ?? "Attacker";
        const tgtName    = targetActor?.name ?? "Target";
        const atkImg     = atkActor?.img   ?? "";
        const tgtImg     = targetActor?.img ?? "";

        // Self-scene (Ouroboros): show all positions regardless of anatomy
        const isSelfScene = atkActor?.id === targetActor?.id;

        const tgtPronouns = targetPronouns;
        const tgtHasPussy = !!targetActor?.getFlag(AFLP.FLAG_SCOPE, "pussy");
        const tgtHasCock  = !!targetActor?.getFlag(AFLP.FLAG_SCOPE, "cock");

        const makeBtn = (posId, label) =>
          `<button type="button" class="aflp-pos-choice" data-pos-id="${posId}"
            style="display:block;width:100%;text-align:left;
                   background:rgba(255,255,255,0.07);border:1px solid rgba(200,160,80,0.3);
                   border-radius:4px;color:#f0e8d0;cursor:pointer;font-size:12px;
                   padding:5px 10px;margin-bottom:4px;font-family:var(--font-primary,serif);"
          >${label}</button>`;

        const makeSection = (id, title, buttons) =>
          `<div class="aflp-pos-section" style="margin-bottom:6px;">
            <button type="button" class="aflp-pos-header" data-section="${id}"
              style="display:flex;align-items:center;justify-content:space-between;width:100%;
                     background:none;border:none;border-bottom:1px solid rgba(200,160,80,0.25);
                     padding:4px 0;cursor:pointer;font-size:10px;letter-spacing:0.08em;
                     text-transform:uppercase;color:rgba(200,160,80,0.85);font-family:var(--font-primary,serif);">
              <span>${title}</span><span class="aflp-pos-arrow-icon" style="font-size:9px;">\u25b6</span>
            </button>
            <div class="aflp-pos-submenu" data-for="${id}" style="display:none;padding:6px 0 2px;">
              ${buttons}
            </div>
          </div>`;

        const penetrationBtns = (hasCock || isSelfScene) ? [
          (tgtHasPussy || isSelfScene) ? makeBtn("vaginal",      `Pounding ${tgtPronouns.possessive} pussy`) : "",
          makeBtn("anal",         `Anal drilling`),
          makeBtn("oral-receive", `Face fuck`),
          makeBtn("facial",       `Facial tribute`),
          (!hasCock && isSelfScene && tgtHasCock) ? makeBtn("oral-give", "Going down") : "",
        ].filter(Boolean).join("") : null;

        const oralGiveExtra = (!hasCock && !isSelfScene && tgtHasCock) ?
          makeBtn("oral-give", "Going down") : "";

        // Foreplay: groping + licking + fingering merged
        const foreplayBtns = [
          makeBtn("groping",         "Groping"),
          makeBtn("licking",         "Licking"),
          tgtHasPussy ? makeBtn("fingering-pussy", "Fingering Pussy")
            : (tgtHasCock ? makeBtn("fingering-cock", "Cock Play") : ""),
          makeBtn("fingering-anal",  "Fingering Ass"),
          oralGiveExtra,
        ].filter(Boolean).join("");

        const heldWeapon = atkActor?.items?.find(i => i.type === "weapon" && i.system?.equipped?.carryType === "held");
        const weaponName = heldWeapon?.name ?? null;
        const _wn = weaponName?.toLowerCase() ?? "";
        const weaponPart = !weaponName ? null
          : (_wn.includes("sword") || _wn.includes("blade") || _wn.includes("dagger") || _wn.includes("knife") || _wn.includes("shiv") || _wn.includes("saber") || _wn.includes("rapier"))
            ? "hilt"
          : (_wn.includes("axe") || _wn.includes("ax") || _wn.includes("maul") || _wn.includes("hammer") || _wn.includes("mace") || _wn.includes("club"))
            ? "handle"
          : (_wn.includes("spear") || _wn.includes("staff") || _wn.includes("pole") || _wn.includes("halberd") || _wn.includes("lance"))
            ? "shaft"
          : (_wn.includes("bow") || _wn.includes("crossbow"))
            ? "grip"
          : "handle";
        const toyLabel = weaponName ? `${weaponName} (${weaponPart})` : "Toy";
        const toyBtns = [
          tgtHasPussy ? makeBtn("toy-pussy", `${toyLabel} — Pussy`) : "",
          makeBtn("toy-anal",  `${toyLabel} — Ass`),
        ].filter(Boolean).join("");

        const sections = [
          penetrationBtns ? makeSection("penetration", "Penetration",    penetrationBtns) : "",
          makeSection("foreplay",       "Foreplay",        foreplayBtns),
          makeSection("toy",            "Toy / Implement", toyBtns),
        ].join("");

        const content = `
          <div style="background:rgba(10,8,6,0.6);border-radius:4px;padding:0 0 4px;max-width:320px;overflow:hidden;">
            <div style="display:flex;align-items:center;gap:10px;padding:10px 10px 8px;border-bottom:1px solid rgba(200,160,80,0.2);margin-bottom:10px;">
              <div style="width:44px;height:44px;border-radius:4px;overflow:hidden;border:1px solid rgba(200,160,80,0.4);flex-shrink:0;">
                <img src="${atkImg}" alt="${atkName}" style="pointer-events:none;width:100%;height:100%;object-fit:cover;object-position:top;"/>
              </div>
              <div style="font-size:18px;color:rgba(200,160,80,0.6);flex-shrink:0;">\u2192</div>
              <div style="width:44px;height:44px;border-radius:4px;overflow:hidden;border:1px solid rgba(200,100,100,0.6);flex-shrink:0;">
                <img src="${tgtImg}" alt="${tgtName}" style="pointer-events:none;width:100%;height:100%;object-fit:cover;object-position:top;"/>
              </div>
              <div>
                <div style="font-size:13px;font-weight:bold;color:#f0e8d0;">${atkName}</div>
                <div style="font-size:10px;color:#aaa;margin-top:1px;">with ${tgtName}</div>
              </div>
            </div>
            <div style="padding:0 10px 6px;">${sections}</div>
          </div>`;

        let resolvePos;
        const posPromise = new Promise(r => { resolvePos = r; });

        foundry.applications.api.DialogV2.wait({
          window:   { title: "Select Position" },
          position: { width: 340 },
          content,
          buttons: [{ action: "skip", label: "Skip", callback: async () => resolvePos(null) }],
          close:    async () => resolvePos(null),
          render(ev, dlg) {
            const el = dlg.element;
            el.querySelectorAll(".aflp-pos-header").forEach(hdr => {
              hdr.addEventListener("click", () => {
                const sub = el.querySelector(`.aflp-pos-submenu[data-for="${hdr.dataset.section}"]`);
                const arrow = hdr.querySelector(".aflp-pos-arrow-icon");
                const open = sub.style.display !== "none";
                sub.style.display = open ? "none" : "block";
                if (arrow) arrow.textContent = open ? "\u25b6" : "\u25bc";
              });
            });
            // Auto-expand first section
            const first = el.querySelector(".aflp-pos-header");
            if (first) first.click();
            el.querySelectorAll(".aflp-pos-choice").forEach(btn => {
              btn.addEventListener("click", () => { resolvePos(btn.dataset.posId); dlg.close(); });
            });
          },
        }, { classes: ["aflp-dialog"] });

        return posPromise;
    },

    // -----------------------------------------------
    // Fire Sexual Advance from the H scene card SA button.
    // Uses stored position if set; prompts first if not.
    // -----------------------------------------------
    // -----------------------------------------------
    // Fire Sexual Advance from the H scene card SA button.
    // Uses stored position if set; prompts first if not.
    // -----------------------------------------------
    async _fireSexualAdvance(scene, atkData, atkActor, atkTokenId) {
      // Ensure position is set before firing SA
      if (!atkData.position && AFLP.Settings.positionTracking) {
        const targetActor = _resolveActor({
          id: scene.targetId, actorId: scene.targetActorId, tokenDoc: scene.targetTokenDoc
        });
        const hasCock = !!atkActor?.getFlag(AFLP.FLAG_SCOPE, "cock");
        const targetPronouns = AFLP.getPronouns(targetActor);
        const positionId = await AFLP.HScene._showPositionDialog(atkActor, targetActor, hasCock, targetPronouns);
        if (!positionId) return; // user cancelled — don't fire SA
        atkData.position = positionId;
        atkData._prevPosition = positionId;

        const posEntry = AFLP.getPosition(positionId);
        if (posEntry) {
          const phrase = posEntry.logPhrase(atkData.name, scene.targetName, targetPronouns);
          AFLP.HScene.addProse(scene.targetId, phrase, "action");
        }

        const card = _container?.querySelector(`[data-target-id="${scene.targetId}"]`);
        if (card) _refreshArousalBars(card, scene);
      }

      // Resolve live token for source and target
      const sourceToken = canvas?.tokens?.get(atkTokenId)
        ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === (atkData.actorId ?? atkData.id));
      const targetToken = canvas?.tokens?.get(scene.targetId)
        ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === scene.targetActorId);

      if (!sourceToken || !targetToken) {
        ui.notifications.warn("AFLP | Could not resolve tokens for Sexual Advance from H scene card.");
        return;
      }

      // Set up token selection to match what the SA macro expects
      canvas.tokens.releaseAll();
      sourceToken.control({ releaseOthers: true });
      game.user.targets.forEach(t => t.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: false }));
      targetToken.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: false });

      const saMacro = game.macros.find(m => m.name === "AFLP Sexual Advance" || m.slug === "aflp-sexual-advance");
      if (saMacro) {
        await saMacro.execute();
      } else {
        // Fallback: fire arousal increments directly without the full macro dialog
        const FLAG = AFLP.FLAG_SCOPE;
        await AFLP.ensureCoreFlags(atkActor);
        const targetActor = _resolveActor({ id: scene.targetId, actorId: scene.targetActorId, tokenDoc: scene.targetTokenDoc });
        await AFLP.ensureCoreFlags(targetActor);
        await AFLP_Arousal.increment(atkActor,    2, "Sexual Advance (H Scene)", atkTokenId);
        await AFLP_Arousal.increment(targetActor, 2, "Sexual Advance (H Scene)", scene.targetId);
        ui.notifications.info("AFLP | Sexual Advance fired (no SA macro found; arousal applied directly).");
      }
    },

    // Called from Token HUD or macro
    // attackerToken / targetToken: Foundry Token objects
    async launchFromTokens(attackerToken, targetToken) {
      if (!attackerToken || !targetToken) {
        ui.notifications.warn("AFLP | Select an attacker token and target a token to start an H scene.");
        return;
      }

      const attacker = _participantFromToken(attackerToken);
      const target   = _participantFromToken(targetToken);

      this.startScene(attacker, target);

      // Post scene start to scene log only
      if (game.user.isGM && AFLP.HScene._scenes) {
        const sceneEntry = [...AFLP.HScene._scenes.entries()]
          .find(([, sc]) => sc.targetActorId === (target.actorId ?? target.id));
        if (sceneEntry) {
          AFLP.HScene.addProse(sceneEntry[0], `${attacker.name} begins an H scene with ${target.name}.`, "action");
        }
      }
    },
  };
})();
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
//   AFLP.HScene.addProse(targetActorId, text, type)  — type: "action"|"flavor"|"gm"
//   AFLP.HScene.triggerShake(actorId)
//   AFLP.HScene.closeScene(targetActorId)
//   AFLP.HScene.closeAll()

if (!window.AFLP) window.AFLP = {};

// -----------------------------------------------
// Prose flavour line generator
// -----------------------------------------------
AFLP.HScene = (() => {

  // Active scenes keyed by target token ID
  const _scenes = new Map();

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
      gap: 8px;
      pointer-events: none;
    `;

    // Drag handle bar at top of container
    const dragHandle = document.createElement("div");
    dragHandle.id = "aflp-hscene-drag-handle";
    dragHandle.style.cssText = `
      pointer-events: all;
      cursor: grab;
      background: rgba(200,160,80,0.15);
      border: 1px solid rgba(200,160,80,0.3);
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 10px;
      color: rgba(200,160,80,0.7);
      text-align: center;
      letter-spacing: 0.1em;
      user-select: none;
    `;
    dragHandle.textContent = "⠿ H SCENES ⠿";
    _container.appendChild(dragHandle);

    _makeDraggable(_container, dragHandle);

    document.body.appendChild(_container);
    return _container;
  }

  // -----------------------------------------------
  // Build a scene card DOM element
  // -----------------------------------------------
  function _buildCard(scene) {
    const card = document.createElement("div");
    card.className = "aflp-hscene-card";
    card.dataset.targetId = scene.targetId;
    card.style.cssText = `
      pointer-events: all;
      background: rgba(10,8,6,0.92);
      border: 1px solid rgba(200,160,80,0.5);
      border-radius: 6px;
      overflow: visible;
      font-family: var(--font-primary, serif);
      color: #f0e8d0;
      box-shadow: 0 4px 20px rgba(0,0,0,0.7);
      transition: all 0.3s ease;
      position: relative;
    `;

    card.innerHTML = `
      ${_cardCSS()}
      <div class="aflp-card-inner">
        <div class="aflp-card-header">
          <div class="aflp-card-portraits"></div>
          <div class="aflp-card-controls">
            <button class="aflp-card-btn aflp-card-minimize" title="Minimise">−</button>
            <button class="aflp-card-btn aflp-card-log-toggle" title="Show/hide scene log">📋</button>
            <button class="aflp-card-btn aflp-card-close" title="Close scene">✕</button>
          </div>
        </div>
        <div class="aflp-card-arousal-bars"></div>
        <div class="aflp-card-prose-area">
          <div class="aflp-card-prose-text"></div>
        </div>
        <div class="aflp-card-gm-area" style="display:${game.user.isGM ? "flex" : "none"}">
          <input class="aflp-card-gm-input" type="text" placeholder="Type flavour text and press Enter…"/>
          <button class="aflp-card-gm-send aflp-card-btn">↵</button>
        </div>
      </div>
      <div class="aflp-card-log-panel" style="display:none;">
        <div class="aflp-log-header">Scene Log</div>
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
    if (document.getElementById("aflp-hscene-styles")) return "";
    return `<style id="aflp-hscene-styles">
      .aflp-hscene-card {
        display: flex;
        flex-direction: row;
      }
      .aflp-card-inner {
        display: flex;
        flex-direction: column;
        flex: 0 0 300px;
        min-width: 0;
        border-radius: 6px 0 0 6px;
        overflow: hidden;
      }
      .aflp-hscene-card.minimized {
        width: 80px !important;
        height: 80px !important;
        overflow: hidden;
        cursor: pointer;
      }
      .aflp-hscene-card.minimized .aflp-card-arousal-bars,
      .aflp-hscene-card.minimized .aflp-card-prose-area,
      .aflp-hscene-card.minimized .aflp-card-gm-area,
      .aflp-hscene-card.minimized .aflp-card-controls,
      .aflp-hscene-card.minimized .aflp-card-log-panel { display: none !important; }
      .aflp-hscene-card.minimized .aflp-card-portraits { gap: 2px; }
      .aflp-hscene-card.minimized .aflp-portrait-wrap { width: 36px; height: 36px; }

      .aflp-card-log-panel {
        width: 220px;
        flex-shrink: 0;
        border: 1px solid rgba(200,160,80,0.5);
        border-left: none;
        border-radius: 0 6px 6px 0;
        display: flex;
        flex-direction: column;
        background: rgba(10,8,6,0.92);
        overflow: hidden;
      }
      .aflp-log-header {
        padding: 4px 8px;
        font-size: 10px;
        font-weight: bold;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(200,160,80,0.8);
        border-bottom: 1px solid rgba(200,160,80,0.2);
        flex-shrink: 0;
      }
      .aflp-log-entries {
        flex: 1;
        overflow-y: auto;
        padding: 4px 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 300px;
      }
      .aflp-log-entry {
        font-size: 13px;
        font-family: var(--font-primary, 'Palatino Linotype', Palatino, Georgia, serif);
        line-height: 1.4;
        color: #d8ceb8;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        padding-bottom: 3px;
      }
      .aflp-log-entry.log-flavor { font-style: italic; color: #f0e8d0; line-height: 1.5; }
      .aflp-log-entry.log-gm { color: #c8e0ff; }
      .aflp-log-entry.log-action { color: #c8a050; font-weight: bold; font-style: normal; }
      .aflp-log-time {
        font-size: 9px;
        color: rgba(255,255,255,0.3);
        display: block;
        margin-bottom: 1px;
      }

      .aflp-card-header {
        display: flex; align-items: flex-start;
        padding: 6px 6px 4px;
        gap: 6px;
        border-bottom: 1px solid rgba(200,160,80,0.2);
      }
      .aflp-card-portraits {
        display: flex; flex-wrap: wrap; gap: 4px; flex: 1;
      }
      .aflp-portrait-wrap {
        width: 56px; height: 56px;
        border-radius: 4px; overflow: hidden;
        border: 1px solid rgba(200,160,80,0.4);
        position: relative; flex-shrink: 0;
      }
      .aflp-portrait-wrap img {
        width: 100%; height: 100%;
        object-fit: cover; object-position: top center;
        display: block;
      }
      .aflp-portrait-label {
        position: absolute; bottom: 0; left: 0; right: 0;
        background: rgba(0,0,0,0.65);
        font-size: 9px; text-align: center;
        padding: 1px 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        color: #f0e8d0;
      }
      .aflp-portrait-wrap.target-portrait {
        border-color: rgba(200,100,100,0.7);
      }
      @keyframes aflp-shake {
        0%,100% { transform: translateX(0); }
        15%      { transform: translateX(-5px) rotate(-1deg); }
        30%      { transform: translateX(5px) rotate(1deg); }
        45%      { transform: translateX(-4px); }
        60%      { transform: translateX(4px); }
        75%      { transform: translateX(-2px); }
      }
      .aflp-portrait-wrap.shaking {
        animation: aflp-shake 0.5s ease;
      }

      .aflp-card-controls {
        display: flex; flex-direction: column; gap: 3px; flex-shrink: 0;
      }
      .aflp-card-btn {
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(200,160,80,0.3);
        border-radius: 3px; color: #f0e8d0;
        cursor: pointer; font-size: 11px;
        padding: 2px 6px; line-height: 1.4;
      }
      .aflp-card-btn:hover { background: rgba(255,255,255,0.18); }
      .aflp-card-close { border-color: rgba(200,80,60,0.5); }
      .aflp-card-close:hover { background: rgba(200,80,60,0.25); }

      .aflp-card-arousal-bars {
        padding: 4px 8px;
        display: flex; flex-direction: column; gap: 3px;
        border-bottom: 1px solid rgba(200,160,80,0.15);
      }
      .aflp-arousal-row {
        display: flex; align-items: center; gap: 6px; font-size: 11px;
      }
      .aflp-arousal-name {
        width: 70px; overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; color: #c8a050; flex-shrink: 0;
      }
      .aflp-arousal-pips { display: flex; gap: 2px; }
      .aflp-arousal-pip {
        width: 14px; height: 8px; border-radius: 2px;
        border: 1px solid rgba(200,160,80,0.4);
        background: rgba(255,255,255,0.06);
        transition: background 0.2s;
        cursor: pointer;
      }
      .aflp-arousal-pip:hover {
        border-color: rgba(200,160,80,0.8);
        background: rgba(200,160,80,0.15);
      }
      .aflp-arousal-pip.filled {
        background: linear-gradient(135deg, #e05050, #c02020);
        border-color: #e05050;
      }
      .aflp-arousal-val { color: #aaa; font-size: 10px; margin-left: 2px; }
      .aflp-orgasm-count {
        color: #c8a050; font-size: 10px; margin-left: 4px;
        white-space: nowrap; flex-shrink: 0;
      }
      .aflp-cumflation-row {
        display: flex; align-items: center; gap: 6px;
        font-size: 10px; margin-top: 1px;
      }
      .aflp-cumflation-label {
        width: 70px; color: #aaa; flex-shrink: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        font-size: 10px;
      }
      .aflp-cumflation-bar {
        display: flex; gap: 2px;
      }
      .aflp-cumflation-pip {
        width: 10px; height: 6px; border-radius: 1px;
        border: 1px solid rgba(220,220,220,0.25);
        background: rgba(255,255,255,0.05);
      }
      .aflp-cumflation-pip.filled {
        background: linear-gradient(135deg, #f0f0e8, #d0cfc0);
        border-color: rgba(220,220,210,0.8);
      }
      .aflp-cumflation-val {
        color: #aaa; font-size: 10px;
      }

      .aflp-card-prose-area {
        min-height: 48px; padding: 6px 10px;
        position: relative;
      }
      .aflp-card-prose-text {
        font-size: 14px; line-height: 1.6;
        color: #f0e8d0; font-style: italic;
        font-family: var(--font-primary, 'Palatino Linotype', Palatino, Georgia, serif);
        min-height: 36px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
      }
      .aflp-prose-line {
        display: block;
        animation: aflp-fadein 0.4s ease forwards;
        opacity: 0;
      }
      @keyframes aflp-fadein {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes aflp-fadeout {
        from { opacity: 1; }
        to   { opacity: 0; }
      }
      .aflp-prose-line.fading {
        animation: aflp-fadeout 0.6s ease forwards;
      }

      .aflp-card-gm-area {
        display: flex; gap: 4px;
        padding: 4px 6px;
        border-top: 1px solid rgba(200,160,80,0.15);
      }
      .aflp-card-gm-input {
        flex: 1; background: rgba(255,255,255,0.07);
        border: 1px solid rgba(200,160,80,0.3);
        border-radius: 3px; color: #f0e8d0;
        font-size: 11px; padding: 3px 6px;
        font-family: var(--font-primary, serif);
      }
      .aflp-card-gm-input::placeholder { color: rgba(240,232,208,0.35); }
      .aflp-card-gm-input:focus { outline: 1px solid rgba(200,160,80,0.6); }
      .aflp-card-gm-send { padding: 2px 8px; }
    </style>`;
  }

  // -----------------------------------------------
  // Render portraits into card header
  // -----------------------------------------------
  function _refreshPortraits(card, scene) {
    const wrap = card.querySelector(".aflp-card-portraits");
    if (!wrap) return;
    wrap.innerHTML = "";

    // Target portrait first (red border)
    const targetPortrait = _makePortrait(scene.targetImg, scene.targetName, true);
    wrap.appendChild(targetPortrait);

    // Attacker portraits
    for (const atk of scene.attackers) {
      wrap.appendChild(_makePortrait(atk.img, atk.name, false));
    }
  }

  function _makePortrait(img, name, isTarget) {
    const div = document.createElement("div");
    div.className = "aflp-portrait-wrap" + (isTarget ? " target-portrait" : "");
    div.dataset.actorName = name;
    div.innerHTML = `
      <img src="${img}" alt="${name}" loading="lazy"/>
      <div class="aflp-portrait-label">${name}</div>
    `;
    return div;
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

      const nameEl = document.createElement("span");
      nameEl.className = "aflp-arousal-name";
      nameEl.title = name;
      nameEl.textContent = name.split(" ")[0];

      const pipBar = document.createElement("div");
      pipBar.className = "aflp-arousal-pips";

      for (let i = 0; i < max; i++) {
        const pip = document.createElement("span");
        pip.className = "aflp-arousal-pip" + (i < cur ? " filled" : "");
        pip.dataset.pipIndex = i;
        // Click: set arousal to i+1 if unfilled, or i if filled (toggle down)
        pip.addEventListener("click", async () => {
          if (!actor.isOwner && !game.user.isGM) return;
          const newVal = (i < cur) ? i : i + 1;
          await AFLP_Arousal.set(actor, newVal, "HScene pip");
        });
        pipBar.appendChild(pip);
      }

      const valEl = document.createElement("span");
      valEl.className = "aflp-arousal-val";
      valEl.textContent = `${cur}/${max}`;

      // Orgasm counter
      // Per-scene orgasm count (lives on the scene object, resets when scene closes)
      const sceneOrgasms = scene.orgasms?.[participant.id] ?? 0;
      const orgasmEl = document.createElement("span");
      orgasmEl.className = "aflp-orgasm-count";
      orgasmEl.title = "Orgasms this scene";
      orgasmEl.innerHTML = sceneOrgasms > 0
        ? `<img src="icons/svg/acid.svg" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;opacity:0.8;">${sceneOrgasms}`
        : "";

      row.appendChild(nameEl);
      row.appendChild(pipBar);
      row.appendChild(valEl);
      row.appendChild(orgasmEl);
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
    // Minimise
    card.querySelector(".aflp-card-minimize")?.addEventListener("click", e => {
      e.stopPropagation();
      card.classList.toggle("minimized");
    });

    // Log toggle
    card.querySelector(".aflp-card-log-toggle")?.addEventListener("click", e => {
      e.stopPropagation();
      const logPanel = card.querySelector(".aflp-card-log-panel");
      if (!logPanel) return;
      const isVisible = logPanel.style.display !== "none";
      logPanel.style.display = isVisible ? "none" : "flex";
    });

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
          line.textContent = `📝 ${text}`;
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
        }, 5000);
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
      if (data.type === "hscene-shake") {
        AFLP.HScene.triggerShake(data.actorId);
      }
      if (data.type === "hscene-arousal-refresh") {
        AFLP.HScene.refreshArousalBars(data.targetId);
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

      // Find scene where this actor is target or attacker
      for (const [targetId, scene] of _scenes) {
        const isInvolved = scene.targetId === actorId ||
          scene.attackers.some(a => a.id === actorId);
        const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
        if (!card) continue;

        if (isInvolved) {
          card.classList.remove("minimized");
          // Move to front of container
          _container.prepend(card);
        }
        // Don't auto-minimise others — let user do that
      }
    });

    Hooks.on("deleteCombat", () => {
      if (AFLP.Settings.hsceneEnabled) AFLP.HScene.closeAll();
    });

    // Refresh H scene bars when cumflation flags change (e.g. purge macro success)
    Hooks.on("updateActor", (actor, diff) => {
      if (!AFLP.Settings.hsceneEnabled) return;
      const flags = diff?.flags?.[AFLP.FLAG_SCOPE];
      if (!flags || !("cumflation" in flags)) return;
      AFLP.HScene.refreshArousalForActor(actor.id);
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
      };
      _scenes.set(target.id, scene);

      const card = _buildCard(scene);
      _container.prepend(card);

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

      const card = _container?.querySelector(`[data-target-id="${targetId}"]`);
      if (card) {
        _refreshPortraits(card, scene);
        _refreshArousalBars(card, scene);
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

    closeScene(targetId) {
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
            const submitting = targetActor.items?.find(c =>
              c.slug === "submitting" || c.sourceId === AFLP.conditions["submitting"]?.uuid
            );
            if (submitting) submitting.delete().catch(() => {});
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
        }
      }

      // Post scene log to chat as backup if setting is on
      if (game.user.isGM && AFLP.Settings.hsceneLogToChat) {
        const scene = _scenes.get(targetId);
        if (scene?.log?.length) {
          const entries = scene.log.map(e => {
            if (e.type === "action")  return `<p style="font-weight:bold;margin:2px 0">${e.text}</p>`;
            if (e.type === "gm")      return `<p style="margin:2px 0"><em>${e.text}</em></p>`;
            return `<p style="margin:2px 0">${e.text}</p>`;
          }).join("");
          ChatMessage.create({
            content: `<div><p style="font-weight:bold;margin:0 0 6px 0">H Scene Log</p>${entries}</div>`,
            speaker: { alias: "AFLP" },
          });
        }
      }

      card?.remove();
      _scenes.delete(targetId);
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
      if (_container) _container.innerHTML = "";
      _scenes.clear();
    },

    // -----------------------------------------------
    // Position picker dialog — shared by scene start,
    // SA button, and Change Position button.
    // Resolves with the chosen position id or null if dismissed.
    // -----------------------------------------------
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

      // Post to scene log
      const posEntry = AFLP.getPosition(positionId);
      if (posEntry) {
        const prevPosition = atkData._prevPosition;
        const isChange = !!prevPosition && prevPosition !== positionId;
        const phrase = posEntry.logPhrase(atkData.name, scene.targetName, targetPronouns);
        const logText = isChange
          ? `${atkData.name} changes position — ${phrase}`
          : phrase;
        AFLP.HScene.addProse(scene.targetId, logText, "action");
        atkData._prevPosition = positionId;
      }

      // Refresh the card so the pill updates
      const card = _container?.querySelector(`[data-target-id="${scene.targetId}"]`);
      if (card) _refreshArousalBars(card, scene);
    },

    // -----------------------------------------------
    // The actual position picker dialog — styled like
    // the H scene card: dark, actor portraits, clear labeling.
    // -----------------------------------------------
    _showPositionDialog(atkActor, targetActor, hasCock, targetPronouns) {
      return new Promise(resolve => {
        const atkName    = atkActor?.name  ?? "Attacker";
        const tgtName    = targetActor?.name ?? "Target";
        const atkImg     = atkActor?.img   ?? "";
        const tgtImg     = targetActor?.img ?? "";

        const penilePositions    = AFLP.positions.filter(p => p.penile);
        const nonPenilePositions = AFLP.positions.filter(p => !p.penile);

        const makeBtn = (pos) => {
          const lbl = pos.label(targetPronouns);
          return `<button class="aflp-pos-choice" data-pos-id="${pos.id}"
            style="display:block;width:100%;text-align:left;
                   background:rgba(255,255,255,0.07);
                   border:1px solid rgba(200,160,80,0.3);
                   border-radius:4px;color:#f0e8d0;
                   cursor:pointer;font-size:12px;
                   padding:5px 10px;margin-bottom:4px;
                   font-family:var(--font-primary,serif);"
          >${lbl}</button>`;
        };

        const penileHTML = hasCock ? `
          <div style="margin-bottom:10px;">
            <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;
                        color:rgba(200,160,80,0.7);margin-bottom:5px;border-bottom:
                        1px solid rgba(200,160,80,0.2);padding-bottom:3px;">
              Penetration
            </div>
            ${penilePositions.map(makeBtn).join("")}
          </div>` : "";

        const content = `
          <style>
            .aflp-pos-choice:hover {
              background: rgba(200,160,80,0.18) !important;
              border-color: rgba(200,160,80,0.6) !important;
            }
            .aflp-pos-dialog-header {
              display:flex; align-items:center; gap:10px;
              padding:10px 10px 8px;
              border-bottom:1px solid rgba(200,160,80,0.2);
              margin-bottom:10px;
            }
            .aflp-pos-portrait {
              width:44px; height:44px; border-radius:4px;
              overflow:hidden; border:1px solid rgba(200,160,80,0.4);
              flex-shrink:0;
            }
            .aflp-pos-portrait.target { border-color:rgba(200,100,100,0.6); }
            .aflp-pos-portrait img { width:100%; height:100%; object-fit:cover; object-position:top; }
            .aflp-pos-arrow {
              font-size:18px; color:rgba(200,160,80,0.6); flex-shrink:0;
            }
            .aflp-pos-names { flex:1; }
            .aflp-pos-attacker-name { font-size:13px; font-weight:bold; color:#f0e8d0; }
            .aflp-pos-subtext { font-size:10px; color:#aaa; margin-top:1px; }
          </style>
          <div style="background:rgba(10,8,6,0.6);border-radius:4px;padding:0 0 4px;">
            <div class="aflp-pos-dialog-header">
              <div class="aflp-pos-portrait">
                <img src="${atkImg}" alt="${atkName}"/>
              </div>
              <div class="aflp-pos-arrow">→</div>
              <div class="aflp-pos-portrait target">
                <img src="${tgtImg}" alt="${tgtName}"/>
              </div>
              <div class="aflp-pos-names">
                <div class="aflp-pos-attacker-name">${atkName}</div>
                <div class="aflp-pos-subtext">with ${tgtName}</div>
              </div>
            </div>
            <div style="padding:0 10px 6px;">
              ${penileHTML}
              <div>
                <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;
                            color:rgba(200,160,80,0.7);margin-bottom:5px;border-bottom:
                            1px solid rgba(200,160,80,0.2);padding-bottom:3px;">
                  Other
                </div>
                ${nonPenilePositions.map(makeBtn).join("")}
              </div>
            </div>
          </div>`;

        const d = new Dialog({
          title: "Select Position",
          content,
          buttons: {
            cancel: { label: "Skip", callback: () => resolve(null) }
          },
          render: (html) => {
            html[0].querySelectorAll(".aflp-pos-choice").forEach(btn => {
              btn.addEventListener("click", () => {
                resolve(btn.dataset.posId);
                d.close();
              });
            });
          },
          close: () => resolve(null),
        }, {
          width: 280,
          classes: ["aflp-dialog"],
        });
        d.render(true);
      });
    },

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
        ui.notifications.info("AFLP | Sexual Advance fired (no SA macro found — arousal applied directly).");
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

      // Post to chat
      const content = `<strong>${attacker.name}</strong> begins an H scene with <strong>${target.name}</strong>!`;
      ChatMessage.create({ content, speaker: { alias: "H Scene" } });
    },
  };
})();
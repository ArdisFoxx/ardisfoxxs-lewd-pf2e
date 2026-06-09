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
  // CF_LABEL_DEFAULTS thresholds are Overall cumflation tiers = floor((anal+oral+vaginal)/3), 1-8.
  // minTier 9 is virtual: Overall tier 8 AND facial at 8 (checked separately in _cumflationWord).
  const CF_LABEL_DEFAULTS = [
    { minTier: 1, word: "Freshly Filled",       color: "rgba(190,180,110,0.9)", glow: "rgba(190,180,110,0.35)" },
    { minTier: 2, word: "Oozing Out",           color: "rgba(200,160,80,0.9)",  glow: "rgba(200,160,80,0.4)" },
    { minTier: 3, word: "Sloshing Full",        color: "rgba(210,145,70,0.9)",  glow: "rgba(210,145,70,0.4)" },
    { minTier: 4, word: "Stretched Belly",      color: "rgba(220,130,60,0.9)",  glow: "rgba(220,130,60,0.4)" },
    { minTier: 5, word: "Cum Bloated",          color: "rgba(220,110,90,0.92)", glow: "rgba(220,110,90,0.45)" },
    { minTier: 6, word: "Full Cum Bucket",      color: "rgba(220,90,120,0.95)", glow: "rgba(220,90,120,0.5)" },
    { minTier: 7, word: "Bred to the Hilt",     color: "rgba(225,75,100,0.97)", glow: "rgba(225,75,100,0.55)" },
    { minTier: 8, word: "Public Cum Dump",      color: "rgba(230,60,80,1)",     glow: "rgba(230,60,80,0.6)" },
    { minTier: 9, word: "Splattered Cum Toilet", color: "rgba(255,40,60,1)",    glow: "rgba(255,40,60,0.7)" }, // tier 9 = all primary 8 + facial 8
  ];

  // Expose the canonical label set so the Cumflation Status Labels settings menu
  // reads its defaults from here - one source of truth, no drift.
  AFLP.CF_LABEL_DEFAULTS = CF_LABEL_DEFAULTS;

  function _getCFLabels() {
    try {
      const raw = game.settings.get(AFLP.Settings.ID, AFLP.Settings.KEYS.CF_LABELS) ?? "";
      if (!raw) return CF_LABEL_DEFAULTS;
      const custom = JSON.parse(raw);
      // Merge: custom labels replace word only (minTier and colors stay fixed)
      return CF_LABEL_DEFAULTS.map((def, i) => ({
        ...def,
        word: custom[i]?.w || custom[i]?.word || def.word,
      }));
    } catch { return CF_LABEL_DEFAULTS; }
  }

  // _cumflationWord: uses the Overall tier = floor average of the three primary
  // holes (anal/oral/vaginal), capped at 8, matching the mechanical Total Cumflation
  // tier. Virtual tier 9 = Overall tier 8 AND facial tier 8.
  function _cumflationWord(cf) {
    if (!cf) return null;
    const anal    = cf.anal    ?? 0;
    const oral    = cf.oral    ?? 0;
    const vaginal = cf.vaginal ?? 0;
    const facial  = cf.facial  ?? 0;
    const overallTier = Math.min(8, Math.floor((anal + oral + vaginal) / 3));
    if (overallTier <= 0) return null;
    // Virtual tier 9: overall at 8 AND facial at 8
    const effectiveTier = (overallTier >= 8 && facial >= 8) ? 9 : overallTier;
    const labels = _getCFLabels();
    const sorted = [...labels].sort((a, b) => b.minTier - a.minTier);
    return sorted.find(l => effectiveTier >= l.minTier) ?? null;
  }

  // Build, update, or remove the cumflation status pill within `host`.
  // Both the displayed percentage and the word derive from the highest single
  // primary hole, so they always agree. Used by every card theme that shows it.
  function _renderCumflationStatus(host, cf) {
    if (!host) return;
    const existing = host.querySelector(".aflp-po-cumflation-status");
    const word = _cumflationWord(cf);
    if (!word) { if (existing) existing.remove(); return; }
    const pct = Math.round(((cf?.anal ?? 0) + (cf?.oral ?? 0) + (cf?.vaginal ?? 0)) / (3 * 8) * 100);
    const el = existing ?? document.createElement("div");
    el.className = "aflp-po-cumflation-status";
    el.textContent = `Cumflation ${pct}%: ${word.word}`;
    el.style.color = word.color;
    el.style.border = `1px solid ${word.glow}`;
    el.style.background = word.glow.replace(/[\d.]+\)$/, "0.12)");
    el.style.boxShadow = `0 0 8px ${word.glow}`;
    if (!existing) host.appendChild(el);
  }

  AFLP.cumflationWord = function(actor) {
    const c = actor.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? {};
    return _cumflationWord(c);
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
          // Unified model: scene.id is the battlemap key; participants are the
          // source of truth. We DO NOT persist the legacy target*/attackers
          // fields — those are derived getters and would be stale/duplicative.
          id:            scene.id,
          participants:  (scene.participants ?? []).map(p => ({
            tokenId: p.tokenId, actorId: p.actorId, name: p.name, img: p.img,
            partnerId: p.partnerId ?? null, position: p.position ?? null, role: p.role ?? null,
            _facing: p._facing ?? false,
          })),
          orgasms:          scene.orgasms ?? {},
          manualHoles:      scene.manualHoles ?? {},
          readyToCum:       scene.readyToCum ?? {},
          damageTaken:      scene.damageTaken ?? 0,
          damageDealt:      scene.damageDealt ?? 0,
          bondageRounds:    scene.bondageRounds ?? 0,
          restrainedRounds: scene.restrainedRounds ?? 0,
          airlockRounds:    scene.airlockRounds ?? 0,
          loadsReceived:    scene.loadsReceived ?? 0,
          loadsByHole:      scene.loadsByHole ?? {},
          creaturesFucked:  [...(scene.creaturesFucked ?? [])],
          orgasmsByAttacker: scene.orgasmsByAttacker ?? {},
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
      // Accept both the new participant format and any legacy save (targetId +
      // attackers) so a state written by the pre-unified build still restores.
      let participants, sceneId;
      if (Array.isArray(sc.participants)) {
        participants = sc.participants.map(p => ({
          tokenId: p.tokenId, actorId: p.actorId, name: p.name, img: p.img, tokenDoc: null,
          partnerId: p.partnerId ?? null, position: p.position ?? null, role: p.role ?? null,
          ...(typeof p._facing === "boolean" ? { _facing: p._facing } : {}),
        }));
        sceneId = sc.id ?? _battlemapId(sc.participants[0]?.tokenId);
      } else if (sc.targetId && Array.isArray(sc.attackers)) {
        // Legacy migration: target first (projection invariant), attackers after,
        // each attacker paired to the target.
        participants = [
          { tokenId: sc.targetId, actorId: sc.targetActorId ?? sc.targetId, name: sc.targetName,
            img: sc.targetImg, tokenDoc: null, partnerId: sc.attackers[0]?.id ?? null, position: null, role: null },
          ...sc.attackers.map(a => ({
            tokenId: a.id, actorId: a.actorId ?? a.id, name: a.name, img: a.img, tokenDoc: null,
            partnerId: sc.targetId, position: a.position ?? null, role: null,
          })),
        ];
        sceneId = _battlemapId(sc.targetId);
      } else {
        continue;
      }
      if (!participants.length) continue;
      if (_scenes.has(sceneId)) continue; // already open (e.g. restored elsewhere first)
      _inferFacingFlags(participants); // fill _facing on legacy saves; no-op if present

      const scene = {
        id:               sceneId,
        participants,
        ..._freshSceneStats(),
        orgasms:          sc.orgasms ?? {},
        manualHoles:      sc.manualHoles ?? {},
        readyToCum:       sc.readyToCum ?? {},
        damageTaken:      sc.damageTaken ?? 0,
        damageDealt:      sc.damageDealt ?? 0,
        bondageRounds:    sc.bondageRounds ?? 0,
        restrainedRounds: sc.restrainedRounds ?? 0,
        airlockRounds:    sc.airlockRounds ?? 0,
        loadsReceived:    sc.loadsReceived ?? 0,
        loadsByHole:      sc.loadsByHole ?? { anal: 0, oral: 0, vaginal: 0, facial: 0 },
        creaturesFucked:  new Set(sc.creaturesFucked ?? []),
        orgasmsByAttacker: sc.orgasmsByAttacker ?? {},
      };
      _defineLegacyView(scene);
      _scenes.set(sceneId, scene);
      const card = _buildCard(scene);
      _container.appendChild(card);
      _container.style.display = "flex";
      AFLP.HScene.revealCard(sceneId);
    }
    _updateContainerWidth();

    // Re-broadcast restored scenes as full participant syncs so any
    // already-connected clients rebuild the same unified scene.
    for (const scene of _scenes.values()) {
      game.socket.emit("module.ardisfoxxs-lewd-pf2e", _sceneSyncPayload(scene));
    }
  } // (restore complete)

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

  // ===========================================================================
  // UNIFIED SCENE MODEL  (Phase 1 — model layer, WIRED IN)
  // ---------------------------------------------------------------------------
  // "ONE scene per Foundry battlemap" keyed by battlemap id (scene.id) with a
  // flat scene.participants[] list. Each participant records partnerId (the
  // tokenId it is directed at right now), position, and role. Pairings derive
  // from partnerId, set by each actor's most recent SA / SS.
  //
  // STRATEGY: keep ALL existing renderers (~55 read sites that read
  // scene.attackers / scene.targetActorId / scene.targetName ...) working
  // UNCHANGED by projecting the legacy view from participants via getters
  // (_defineLegacyView). Only the write/resolution sites are rewired.
  //
  // PHASE 1 STATUS: model + keying + participants + persistence + the GM-path
  // write sites (startScene / addAttacker / removeParticipant / position) +
  // full-scene socket sync are wired. SA/SS/cum RESOLUTION routing (Section C,
  // in the macros + arousal.js) is the remaining Phase 1 work. The card stays
  // visually identical (driven by the legacy getters).
  // ===========================================================================

  // The battlemap key for the unified scene map. A TokenDocument's .parent is
  // its Scene (Foundry's battlemap). Accept either a TokenDocument or a raw
  // token id; fall back to the active canvas scene, then a literal "default"
  // so the map key is NEVER null/undefined (which would collide silently).
  function _battlemapId(tokenDocOrId) {
    let tokenDoc = tokenDocOrId;
    if (typeof tokenDocOrId === "string") {
      tokenDoc = canvas?.tokens?.get(tokenDocOrId)?.document ?? null;
    }
    return tokenDoc?.parent?.id ?? canvas?.scene?.id ?? "default";
  }

  // Pick the projected legacy "target" from a participant list.
  // Rule: the participant the MOST others point their partnerId at wins
  // (incoming partner count). Tie-break 1: role === "sub". Tie-break 2:
  // earliest insertion order in participants[].
  //
  // IMPORTANT ORDERING DEPENDENCY: in a balanced 1v1 (mutual partnerId, no
  // roles) the incoming counts tie 1-1 and the result falls through to
  // insertion order. startScene MUST therefore insert the SA/SS *target*
  // participant FIRST so the 1v1 projection reproduces the legacy target.
  // Do not reorder participant insertion without revisiting this.
  function _projectTarget(participants) {
    const list = participants ?? [];
    if (!list.length) return null;

    // incoming[tokenId] = how many OTHER participants aim partnerId at it.
    const incoming = new Map();
    for (const p of list) incoming.set(p.tokenId, 0);
    for (const p of list) {
      if (p.partnerId && incoming.has(p.partnerId)) {
        incoming.set(p.partnerId, incoming.get(p.partnerId) + 1);
      }
    }

    let best = null, bestCount = -1, bestIndex = Infinity;
    list.forEach((p, idx) => {
      const count   = incoming.get(p.tokenId) ?? 0;
      const isSub   = p.role === "sub";
      const curSub  = best?.role === "sub";
      const wins =
        count > bestCount ||                                   // more incoming
        (count === bestCount && isSub && !curSub) ||           // tie -> prefer sub
        (count === bestCount && isSub === curSub && idx < bestIndex); // tie -> earliest
      if (wins) { best = p; bestCount = count; bestIndex = idx; }
    });
    return best;
  }

  // ── Balanced-layout topology grouping ──────────────────────────────────────
  // Generalizes _projectTarget (which picks ONE target) into the full set of
  // pairings present in a scene. Returns an ORDERED array of groups:
  //   { type:"mutual", id, members:[pA, pB] }
  //       A and B each aim partnerId at the other (reversal / "entangled").
  //   { type:"group",  id, receiver:p, perfs:[p,...] }
  //       one receiver with >=1 performers aiming partnerId at it (gangbang,
  //       or a 1:1 with a clear bottom). The traditional "many vs one" layout
  //       is simply the group case with a single receiver.
  // An actor may appear in more than one group (e.g. a chain X->Y->Z, where Y
  // both receives from X and performs on Z; or a mutual pair where one side is
  // ALSO gangbanged by a third party). That is intended: each pairing renders.
  // Participants with no partner who are nobody's partner are idle and omitted.
  function _buildSceneGroups(scene) {
    const list = (scene?.participants ?? []).filter(p => p && p.tokenId);
    if (!list.length) return [];
    const byId = new Map(list.map(p => [p.tokenId, p]));
    // An INTENTIONAL edge a->b is a aiming partnerId at b that is NOT just a's
    // cosmetic "facing" default (set when a was made someone's target; see
    // startScene). Facing-only back-edges are ignored so a gangbang receiver
    // who faces one of its attackers is not mistaken for a reversal. A true
    // mutual/reversal is a<->b where BOTH directions are intentional (each
    // actor ran their own SA/SS at the other).
    const edge = (p) => (p && p.partnerId && byId.has(p.partnerId) && !p._facing) ? p.partnerId : null;
    const edgeUsed = new Set();
    const groups = [];

    // 1) mutual pairs (both directions intentional)
    for (const p of list) {
      const a = p.tokenId, b = edge(p);
      if (!b) continue;
      if (edge(byId.get(b)) === a) {
        if (edgeUsed.has(a + "|" + b) || edgeUsed.has(b + "|" + a)) continue;
        edgeUsed.add(a + "|" + b); edgeUsed.add(b + "|" + a);
        groups.push({ type: "mutual", id: "m-" + [a, b].sort().join("-"),
                      members: [byId.get(a), byId.get(b)] });
      }
    }

    // 2) receiver-groups from remaining intentional edges
    const incoming = new Map();
    for (const p of list) {
      const b = edge(p);
      if (!b) continue;
      if (edgeUsed.has(p.tokenId + "|" + b)) continue;
      if (!incoming.has(b)) incoming.set(b, []);
      incoming.get(b).push(p);
    }
    for (const [recvId, perfs] of incoming) {
      if (!perfs.length || !byId.has(recvId)) continue;
      groups.push({ type: "group", id: "rg-" + recvId, receiver: byId.get(recvId), perfs });
    }
    return groups;
  }

  // ── Per-client focus (camera, NOT synced scene state) ──────────────────────
  // Which group sits in the "Talent" slot is a per-viewer preference, so it is
  // stored client-side only and never written to the scene or sent over the
  // socket. Default focus is the viewer's own PC's group (so a player's card
  // foregrounds their own character when it joins); the GM (no assigned PC)
  // falls back to the projected-target group, preserving current behavior. A
  // manual pin overrides until the scene closes or the viewer clears it.
  const _focusPins = new Map();      // scene.id -> pinned group id

  function _ownPcParticipant(scene) {
    const charId = game.user?.character?.id;
    if (!charId) return null;
    return (scene?.participants ?? []).find(p => p.actorId === charId) ?? null;
  }
  function _groupContaining(groups, tokenId) {
    if (!tokenId) return null;
    return groups.find(g => g.type === "mutual"
      ? g.members.some(m => m.tokenId === tokenId)
      : (g.receiver?.tokenId === tokenId || g.perfs.some(p => p.tokenId === tokenId))) ?? null;
  }
  function _resolveFocusGroup(scene, groups) {
    if (!groups || !groups.length) return null;
    const pin = _focusPins.get(scene.id);
    if (pin) { const g = groups.find(x => x.id === pin); if (g) return g; }
    const ownPc = _ownPcParticipant(scene);
    if (ownPc) { const g = _groupContaining(groups, ownPc.tokenId); if (g) return g; }
    const tgt = _projectTarget(scene.participants);
    if (tgt) { const g = _groupContaining(groups, tgt.tokenId); if (g) return g; }
    return groups[0];
  }
  function _setFocusPin(sceneId, groupId) { if (sceneId && groupId) _focusPins.set(sceneId, groupId); }
  function _clearFocusPin(sceneId) { _focusPins.delete(sceneId); }

  // Resolve the receiver a source attacker is acting on (their partner), and the
  // co-performers sharing that receiver. Makes position prompts partner-aware so
  // separate nearby pairings on one battlemap stay independent. `atk` may be a
  // raw participant or a legacy-attacker proxy (both expose .partnerId).
  function _receiverParticipant(scene, atk) {
    const pid = atk?.partnerId;
    if (!pid) return null;
    return (scene?.participants ?? []).find(p => p.tokenId === pid) ?? null;
  }
  function _coPerformerParticipants(scene, recvId) {
    if (!recvId) return [];
    return (scene?.participants ?? []).filter(p => p.partnerId === recvId && !p._facing);
  }

  // Manual hole overrides are stored per-receiver: scene.manualHoles is keyed by
  // the receiver's token id, each value a flat { pussy, mouth, ass } object. This
  // keeps a GM's manual marks on one receiver from bleeding onto another receiver
  // in a multi-pairing scene. Legacy flat saves (top-level pussy/mouth/ass) are
  // simply ignored — manual marks are a transient override, not persisted intent.
  function _manualHolesFor(scene, recvId) {
    if (!scene.manualHoles || typeof scene.manualHoles !== "object") scene.manualHoles = {};
    let mh = scene.manualHoles[recvId];
    if (!mh || typeof mh !== "object") { mh = {}; scene.manualHoles[recvId] = mh; }
    return mh;
  }

  // Migration: infer the _facing flag on a participant list that predates it
  // (legacy persisted scenes and syncs from an older client). Without _facing,
  // a receiver's cosmetic back-edge is indistinguishable from an intentional SA
  // edge, so a plain receiver+performer pair would wrongly group as a mutual.
  // Legacy reciprocal edges were NEVER genuine reversals (that concept is new),
  // so for any reciprocal pair we mark the receiver side as facing: the side with
  // more incoming edges, tie broken toward the submitting role, then toward the
  // earlier list position (the old "target first" save invariant). Directed-only
  // edges are always intentional. No-ops if the list is already migrated.
  function _inferFacingFlags(participants) {
    if (!Array.isArray(participants) || !participants.length) return;
    if (participants.some(p => typeof p._facing === "boolean")) {
      participants.forEach(p => { if (typeof p._facing !== "boolean") p._facing = false; });
      return;
    }
    const byId     = new Map(participants.map(p => [p.tokenId, p]));
    const idx      = new Map(participants.map((p, i) => [p.tokenId, i]));
    const incoming = new Map(participants.map(p => [p.tokenId, 0]));
    for (const p of participants) {
      if (p.partnerId && incoming.has(p.partnerId)) incoming.set(p.partnerId, incoming.get(p.partnerId) + 1);
    }
    const subLike = r => r === "sub" || r === "submitting";
    for (const p of participants) {
      p._facing = false;
      const q = p.partnerId ? byId.get(p.partnerId) : null;
      if (!q || q.partnerId !== p.tokenId) continue; // only reciprocal edges can be cosmetic
      const inP = incoming.get(p.tokenId) ?? 0, inQ = incoming.get(q.tokenId) ?? 0;
      if (inP > inQ) p._facing = true;
      else if (inP === inQ) {
        if (subLike(p.role) && !subLike(q.role)) p._facing = true;
        else if (subLike(p.role) === subLike(q.role) && (idx.get(p.tokenId) ?? 0) < (idx.get(q.tokenId) ?? 0)) p._facing = true;
      }
    }
  }

  // The single authoritative GM. In a multi-GM table, only this user should act
  // on player->GM requests (resolve cum/edge, SS apply, hole toggle, position
  // change); otherwise every connected GM processes the same request and it is
  // applied N times - a hole toggle flipped twice nets zero, a cum resolves
  // twice, two position dialogs open. Foundry designates one active GM as
  // game.users.activeGM (v11+); fall back to plain isGM if it is unavailable.
  function _isPrimaryGM() {
    const primary = game.users?.activeGM ?? null;
    return primary ? primary === game.user : !!game.user.isGM;
  }

  // Wrap a participant so legacy code that expects an "attacker" object keeps
  // working. Legacy reads .id (== token id); writes .position (and .id).
  // A Proxy reflects every read/write through to the underlying participant so
  // there is exactly ONE source of truth. NOTE: the attackers getter below
  // creates a fresh proxy per read, so DO NOT rely on identity (===) of proxy
  // objects across reads; rely on the participant they wrap (atk.__participant).
  function _legacyAttackerProxy(p) {
    return new Proxy(p, {
      get(target, prop) {
        if (prop === "id") return target.tokenId;     // legacy .id === token id
        if (prop === "__participant") return target;   // escape hatch to the real object
        return target[prop];
      },
      set(target, prop, value) {
        if (prop === "id") { target.tokenId = value; return true; }
        target[prop] = value;                          // .position et al. reflect through
        return true;
      },
    });
  }

  // Install the legacy projection getters over scene.participants. Idempotent
  // (guarded by a non-enumerable flag so re-calling on a restored/socketed
  // scene is safe). After this, legacy reads of scene.targetId / .targetActorId
  // / .targetName / .targetImg / .targetTokenDoc / .attackers all derive LIVE
  // from participants. _target is the internal projected-target participant.
  function _defineLegacyView(scene) {
    if (scene._legacyViewDefined) return scene;
    Object.defineProperties(scene, {
      _legacyViewDefined: { value: true, enumerable: false, writable: false },
      _target: {
        enumerable: false, configurable: true,
        get() { return _projectTarget(this.participants); },
      },
      targetId: {
        enumerable: true, configurable: true,
        get() { return this._target?.tokenId ?? null; },
      },
      targetActorId: {
        enumerable: true, configurable: true,
        get() { return this._target?.actorId ?? null; },
      },
      targetName: {
        enumerable: true, configurable: true,
        get() { return this._target?.name ?? ""; },
      },
      targetImg: {
        enumerable: true, configurable: true,
        get() { return this._target?.img ?? ""; },
      },
      targetTokenDoc: {
        enumerable: true, configurable: true,
        get() { return this._target?.tokenDoc ?? null; },
      },
      // Everyone who is NOT the projected target, each wrapped as a legacy atk.
      // Returns a NEW array of NEW proxies per read (see _legacyAttackerProxy).
      // Legacy push/splice on this array are no-ops by design; Phase 1 Section B
      // rewrites those write sites to mutate scene.participants directly.
      attackers: {
        enumerable: true, configurable: true,
        get() {
          const tgt = this._target;
          return (this.participants ?? [])
            .filter(p => p !== tgt)
            .map(p => _legacyAttackerProxy(p));
        },
      },
    });
    return scene;
  }

  // Find-or-create a participant on a scene by tokenId. New participants start
  // unpaired (partnerId null), positionless, roleless. Existing participants
  // get their display fields refreshed if the descriptor carries fresher data.
  function _ensureParticipant(scene, desc) {
    scene.participants ??= [];
    const tokenId = desc.tokenId ?? desc.id;
    let p = scene.participants.find(x => x.tokenId === tokenId);
    if (!p) {
      p = {
        tokenId,
        actorId:   desc.actorId ?? tokenId,
        name:      desc.name ?? "",
        img:       desc.img ?? "",
        tokenDoc:  desc.tokenDoc ?? null,
        partnerId: null,
        position:  null,
        role:      null,
      };
      scene.participants.push(p);
    } else {
      if (desc.name)     p.name     = desc.name;
      if (desc.img)      p.img      = desc.img;
      if (desc.tokenDoc) p.tokenDoc = desc.tokenDoc;
      if (desc.actorId)  p.actorId  = desc.actorId;
    }
    return p;
  }

  // ── Unified-scene runtime resolution (Phase 1 wiring) ────────────────────
  // _scenes is keyed by battlemap id (scene.id). External/legacy callers still
  // pass a TOKEN id (the projected target's, or any participant's). These
  // helpers bridge that: resolve the scene CONTAINING a token rather than
  // recomputing the battlemap from the token (which is unreliable when the
  // token is not on the viewing client's canvas). A token lives on exactly one
  // battlemap, so the containing scene is unique.

  // Find the active scene that contains a given participant token (or actor).
  function _sceneForToken(tokenId, actorId = null) {
    for (const scene of _scenes.values()) {
      const ps = scene.participants ?? [];
      if (ps.some(p => p.tokenId === tokenId || (actorId && p.actorId === actorId))) return scene;
    }
    return null;
  }

  // Resolve a scene by EITHER its battlemap key (scene.id) OR a contained token
  // id. Lets legacy call sites that pass a token id keep working unchanged.
  function _sceneByAnyId(id) {
    return _scenes.get(id) ?? _sceneForToken(id);
  }

  // The card DOM element for a scene. DOM is keyed by the stable scene.id
  // (battlemap id), NOT the projected target token id, so the card key never
  // shifts when partnerId re-pointing changes which participant projects as
  // the legacy target.
  function _cardFor(scene) {
    if (!scene?.id) return null;
    return _container?.querySelector(`[data-target-id="${scene.id}"]`) ?? null;
  }

  // Derive a participant's H-scene role from its live conditions.
  // "sub" if Submitting, "dom" if Dominating, else null (consensual).
  function _roleFromActor(actor) {
    if (!actor) return null;
    const has = (slug) => actor.items?.some(c => c.slug === slug) || actor.hasCondition?.(slug);
    if (has("submitting")) return "sub";
    if (has("dominating")) return "dom";
    return null;
  }

  // Build a scene-stats fields shared by startScene and _restoreSceneState.
  function _freshSceneStats() {
    return {
      log:               [],
      orgasms:           {},   // tokenId -> count for this scene
      damageTaken:       0,
      damageDealt:       0,
      bondageRounds:     0,
      restrainedRounds:  0,
      airlockRounds:     0,
      loadsReceived:     0,
      loadsByHole:       { anal: 0, oral: 0, vaginal: 0, facial: 0 },
      creaturesFucked:   new Set(),
      orgasmsByAttacker: {},
    };
  }

  // Full-scene socket payload for the unified model. One "hscene-sync" replaces
  // the old piecemeal start/add/remove events: it carries the whole participant
  // list + stable scene.id so a receiver rebuilds an identical scene regardless
  // of which battlemap it is currently viewing. tokenDoc is intentionally
  // omitted (not serializable / client-local); receivers resolve actors via
  // canvas token lookup by tokenId.
  function _sceneSyncPayload(scene) {
    return {
      type: "hscene-sync",
      sceneId: scene.id,
      participants: (scene.participants ?? []).map(p => ({
        tokenId: p.tokenId, actorId: p.actorId, name: p.name, img: p.img,
        partnerId: p.partnerId ?? null, position: p.position ?? null, role: p.role ?? null,
        _facing: p._facing ?? false,
      })),
      orgasms:      scene.orgasms ?? {},
      manualHoles:  scene.manualHoles ?? {},
      readyToCum:   scene.readyToCum ?? {},
      loadsByHole:  scene.loadsByHole ?? {},
    };
  }

  // Apply an incoming hscene-sync payload on a RECEIVER client: create or
  // reconcile the battlemap scene, then refresh its card. Foundry does not echo
  // emits to the sender, so this only runs on other clients (where scene stats
  // are display-only). tokenDoc is rebuilt as null; actors resolve via canvas
  // token lookup by tokenId.
  function _applySceneSync(data) {
    if (!AFLP.Settings.hsceneEnabled) return;
    const sceneId = data.sceneId;
    if (!sceneId) return;
    const participants = (data.participants ?? []).map(p => ({
      tokenId: p.tokenId, actorId: p.actorId, name: p.name, img: p.img, tokenDoc: null,
      partnerId: p.partnerId ?? null, position: p.position ?? null, role: p.role ?? null,
      ...(typeof p._facing === "boolean" ? { _facing: p._facing } : {}),
    }));
    _inferFacingFlags(participants); // older GM may not send _facing; infer if absent
    if (!participants.length) {
      // Empty sync = scene gone; close if we have it.
      const gone = _scenes.get(sceneId);
      if (gone) AFLP.HScene.closeScene(sceneId);
      return;
    }
    _ensureContainer();
    let scene = _scenes.get(sceneId);
    const isNew = !scene;
    if (isNew) {
      scene = { id: sceneId, participants, ..._freshSceneStats() };
      _defineLegacyView(scene);
      _scenes.set(sceneId, scene);
    } else {
      scene.participants = participants; // wholesale replace (source of truth is the GM)
    }
    // Display-only stats from the payload.
    scene.orgasms     = data.orgasms     ?? scene.orgasms ?? {};
    scene.manualHoles = data.manualHoles ?? scene.manualHoles ?? {};
    scene.readyToCum  = data.readyToCum  ?? scene.readyToCum ?? {};
    scene.loadsByHole = data.loadsByHole ?? scene.loadsByHole ?? {};

    let card = _cardFor(scene);
    if (!card) {
      card = _buildCard(scene);
      _container.appendChild(card);
    } else {
      _refreshPortraits(card, scene);
      _refreshArousalBars(card, scene);
    }
    card.style.display = "";
    _container.style.display = "flex";
    _updateContainerWidth();
  }

  // ── Scene mode detection ───────────────────────────────────────────────
  // "dominated"  — target has Submitting condition (result of Struggle Snuggle)
  // "consensual" — no Submitting condition; scene started via Sexual Advance
  function _sceneMode(scene) {
    const tgtActor = _resolveActor({ id: scene.targetId, actorId: scene.targetActorId });
    if (!tgtActor) return "consensual";
    const submittingUUID = AFLP.conditions?.["submitting"]?.uuid ?? "";
    return tgtActor.items?.some(c =>
      c.slug === "submitting" || (c.flags?.core?.sourceId ?? c.sourceId) === submittingUUID
    ) ? "dominated" : "consensual";
  }

  // Can this user change positions or hole chips for this scene?
  // Dominated: only owners of a Dominating attacker, or GM.
  // Consensual: any participant owner, or GM.
  function _userCanControl(scene, mode) {
    if (game.user.isGM) return true;
    const candidates = mode === "dominated"
      ? (scene.attackers ?? []).map(_resolveActor).filter(Boolean)
      : [
          _resolveActor({ id: scene.targetId, actorId: scene.targetActorId }),
          ...(scene.attackers ?? []).map(_resolveActor),
        ].filter(Boolean);
    return candidates.some(a => a.isOwner);
  }

  // Root container injected once into #ui-top
  let _container = null;

  // -----------------------------------------------
  // Flavour prose generator
  // Returns a string or null if flavor disabled.
  // -----------------------------------------------
  function _generateProse(type, attackerActor, targetActor, position = null) {
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
      // Position-accurate prose: use the chosen position's own log phrase from the
      // schema registry so the narration matches the actual act (vaginal vs anal vs
      // oral vs doggy vs facefuck, etc.) instead of guessing from genitalia.
      const posDef = position ? (window.AFLP?.getPosition?.(position)) : null;
      if (posDef?.logPhrase) {
        const sp = { subject: "they", object: "them", possessive: "their", reflexive: "themselves" };
        let phrase = null;
        try { phrase = posDef.logPhrase(attackerName, targetName, sp); } catch (_) {}
        if (phrase) {
          const flourishes = [
            ".",
            ", drawing a helpless moan from them.",
            ", slow and deliberate until they whimper.",
            ", setting a relentless pace.",
            ", coaxing a desperate sound free.",
          ];
          return phrase + flourishes[Math.floor(Math.random() * flourishes.length)];
        }
      }
      // Fallback when no position is set: genitalia-based, plus generic.
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
  // ─── Theme resolution helpers ────────────────────────────────────────────

  // Returns the effective theme for a scene, accounting for:
  // 1. Player-pick override (per-user HSCENE_THEME setting)
  // 2. GM default (HSCENE_THEME_PC or HSCENE_THEME_MON based on target type)
  function _effectiveTheme(scene) {
    const playerPickAllowed = AFLP.Settings.hscenePlayerPick ?? true;
    if (playerPickAllowed) {
      const userTheme = AFLP.Settings.hsceneTheme;
      if (userTheme) return userTheme;
    }
    // Fall back to GM default based on target type
    return _defaultThemeForScene(scene);
  }

  // GM default theme based on whether target is a monster
  function _defaultThemeForScene(scene) {
    const tgtActor = _resolveActor({ id: scene?.targetId, actorId: scene?.targetActorId });
    const isMon = tgtActor && tgtActor.type === "npc" && !tgtActor.hasPlayerOwner;
    return isMon
      ? (AFLP.Settings.hsceneThemeMon ?? "fuckamons")
      : (AFLP.Settings.hsceneThemePc  ?? "aflp-classic");
  }

  // Reset all players' per-user theme to whatever the GM default dictates for each scene.
  // Called when HSCENE_PLAYER_PICK is turned off or GM default changes.
  function _applyDefaultThemesToAll() {
    const scenes = AFLP.HScene._scenes;
    if (!scenes?.size) return;
    for (const [targetId, scene] of scenes) {
      const defTheme = _defaultThemeForScene(scene);
      const card = document.querySelector(`[data-target-id="${targetId}"]`);
      if (!card) continue;
      card.className = card.className.replace(/aflp-theme-\S+/, "aflp-theme-" + defTheme);
      AFLP.HScene.refreshScene?.(targetId);
    }
    // Sync all dropdowns if player pick is still allowed
    document.querySelectorAll(".aflp-card-theme-select").forEach(sel => {
      const card = sel.closest("[data-target-id]");
      if (!card) return;
      const scene = AFLP.HScene._scenes?.get(card.dataset.targetId);
      if (scene) sel.value = _effectiveTheme(scene);
    });
  };

  // Called when player-pick is disabled: reset user theme to empty so GM default applies
  function _resetPlayersToDefaultTheme() {
    if (game.user.isGM) return; // GM sets defaults, doesn't reset themselves
    // Clear the per-user theme override so _effectiveTheme falls back to GM default
    game.settings.set(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_THEME, "");
    // Rebuild all cards
    _applyDefaultThemesToAll();
  };

  // Module-level helper: apply current theme to the drag handle bar
  function _applyDragHandleTheme(handle, container, mode, scene = null) {
    const th = scene ? _effectiveTheme(scene) : (AFLP.Settings.hsceneTheme ?? "lewd-lite");
    // mode: "dominated" | "consensual" | undefined (no scene or unknown)
    const modeLabel = mode === "dominated" ? "🔒 Noncon" : mode === "consensual" ? "💗 Consensual" : null;
    const themes = {
      "lewd-lite":   { text: "⠿ LEWD LITE ⠿",        color: "rgba(200,160,80,0.75)", bg: "rgba(200,160,80,0.10)", border: "rgba(200,160,80,0.3)",  font: "inherit" },
      "status-strip": { text: "⠿ H SCENE ACTIVE ⠿",  color: "rgba(100,170,255,0.85)", bg: "rgba(8,12,28,0.96)",  border: "rgba(80,140,220,0.5)", font: "inherit" },
      "aflp-classic":        { text: "★ SCENE IN PROGRESS ★",      color: "rgba(220,100,130,0.9)", bg: "rgba(200,50,80,0.15)",  border: "rgba(200,50,80,0.4)",  font: "inherit" },
      "dossier":      { text: "// ENCOUNTER FILE — ACTIVE", color: "rgba(80,180,80,0.85)",  bg: "rgba(5,15,8,0.9)",     border: "rgba(30,80,40,0.5)",   font: "'Courier New',monospace" },
      "fuckamons":    { text: "! A WILD ENCOUNTER APPEARED !", color: "#f5e642", bg: "rgba(220,20,60,0.85)", border: "rgba(255,80,80,0.8)", font: "inherit" },
    };
    let t = themes[th] ?? themes["lewd-lite"];
    // For porno theme, embed mode label in the banner text
    if (th === "aflp-classic" && modeLabel) {
      t = { ...t, text: `★ ${modeLabel} H Scene in Progress ★` };
    }
    // For gangbang-hud and status-strip, show consensual banner when consensual
    // All themes except lewd-lite: show consensual vs noncon banner
    const nonLewdLite = th !== "lewd-lite";
    if (nonLewdLite && mode === "consensual") {
      // Keep theme colour - only swap the text to show consensual state
      t = { ...t, text: "♥ CONSENSUAL H SCENE IN PROGRESS ♥" };
    } else if (nonLewdLite && mode === "dominated") {
      t = { ...t, color: "rgba(200,60,60,0.8)", border: "rgba(200,60,60,0.3)" };
    }
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
      left: calc(50% - 95px);
      transform: translateX(-50%);
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 0;
      pointer-events: none;
      min-width: 280px;
      max-width: calc(100vw - 420px);
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
    styleEl.textContent = _cardCSS() + _statusStripCSS() + _aflpClassicCSS() + _dossierCSS() + _fuckamonCSS();
    document.head.appendChild(styleEl);

    document.body.appendChild(_container);
    return _container;
  }

  // -----------------------------------------------
  // Build a scene card DOM element
  // -----------------------------------------------
  function _buildCard(scene) {
    const theme = _effectiveTheme(scene);
    const card = document.createElement("div");
    card.className = "aflp-hscene-card aflp-theme-" + theme;
    // DOM key is the STABLE scene.id (battlemap id), not the projected target
    // token id. Attribute name kept as data-target-id to avoid churning ~30
    // selectors; its VALUE is now scene.id. Use _cardFor(scene) to look it up.
    card.dataset.targetId = scene.id;
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
              <select class="aflp-card-theme-select" title="UI Theme" ${(!game.user.isGM && !(AFLP.Settings.hscenePlayerPick??true)) ? 'disabled style="opacity:0.4;pointer-events:none;"' : ""}>
                <option value="lewd-lite"${(AFLP.Settings.hsceneTheme==="lewd-lite")?" selected":""}>Lewd Lite</option>
                <option value="status-strip"${(AFLP.Settings.hsceneTheme==="status-strip")?" selected":""}>Status Strip</option>
                <option value="aflp-classic"${(AFLP.Settings.hsceneTheme==="aflp-classic")?" selected":""}>AFLP Classic</option>
                <option value="dossier"${(AFLP.Settings.hsceneTheme==="dossier")?" selected":""}>Dossier File</option>
                <option value="fuckamons"${(AFLP.Settings.hsceneTheme==="fuckamons")?" selected":""}>Fuck a Mon'</option>
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
    // Porno theme has inline bars in each performer card - skip the shared bottom bar area
    const _skipBars = ["aflp-classic","lewd-lite","status-strip","dossier","fuckamons"].includes(_effectiveTheme(scene));
    if (!_skipBars) _refreshArousalBars(card, scene);
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
      .aflp-theme-aflp-classic .aflp-card-portraits,
      .aflp-theme-status-strip .aflp-card-portraits,
      .aflp-theme-dossier .aflp-card-portraits { align-items:stretch; justify-content:flex-start; }
      /* Lewd Lite: PF2e tracker-style rows */
      .aflp-theme-lewd-lite .aflp-card-portraits {
        flex-direction: column; align-items: stretch; gap: 0; padding: 0;
        border-bottom: 1px solid rgba(120,90,40,0.25);
      }
      /* Lewd Lite row */
      .aflp-ll-row {
        display: flex; align-items: center; gap: 6px;
        padding: 5px 8px; border-bottom: 1px solid rgba(120,90,40,0.15);
        min-height: 0;
      }
      .aflp-ll-row.is-target {
        background: rgba(200,50,80,0.06); border-bottom: 2px solid rgba(200,50,80,0.25);
      }
      .aflp-ll-row:last-child { border-bottom: none; }
      /* Portrait in row */
      .aflp-ll-port {
        width: 36px; height: 36px; border-radius: 3px; overflow: hidden;
        flex-shrink: 0; border: 1px solid rgba(180,140,40,0.35);
      }
      .aflp-ll-row.is-target .aflp-ll-port { border-color: rgba(200,50,80,0.45); }
      .aflp-ll-port img { width:36px;height:36px;max-width:36px;max-height:36px;object-fit:cover;object-position:top;display:block; }
      /* Name + info column */
      .aflp-ll-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .aflp-ll-name { font-size: 11px; font-weight: bold; color: #c9a96e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .aflp-ll-row.is-target .aflp-ll-name { color: #e08090; }
      .aflp-ll-pos  { font-size: 9px; color: rgba(180,140,60,0.7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      /* Arousal bar */
      .aflp-ll-aro-lbl { font-size:8px; color:rgba(180,140,60,0.55); flex-shrink:0; }
      .aflp-ll-aro-track {
        width: 100%; height: 6px; background: rgba(255,255,255,0.06);
        border: 1px solid rgba(180,140,40,0.2); border-radius: 3px; overflow: hidden; margin-top: 1px;
      }
      .aflp-ll-aro-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
      .aflp-ll-aro-fill.low  { background: linear-gradient(90deg, #4a9e58, #5ec46a); }
      .aflp-ll-aro-fill.mid  { background: linear-gradient(90deg, #b07830, #d4a040); }
      .aflp-ll-aro-fill.high { background: linear-gradient(90deg, #a02020, #d03040); }
      /* Conditions and right-side elements */
      .aflp-ll-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
      .aflp-ll-aro-val { font-size: 9px; color: rgba(180,140,60,0.6); white-space: nowrap; }
      /* Lewd Lite: vertical gauge bars beside attacker portraits */
      .aflp-ch-vbars { display:flex; flex-direction:column; gap:2px; margin-left:3px; flex-shrink:0; }
      .aflp-ch-vbar-wrap { width:5px; flex:1; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-end; }
      .aflp-ch-vbar-fill { width:100%; border-radius:2px; transition:height 0.3s ease; }
      .aflp-ch-vbar-cum { background:linear-gradient(180deg,#c090e0,#8060a0); }
      .aflp-ch-vbar-aro { background:linear-gradient(180deg,#ff5070,#c02828); }
      /* Lewd Lite: horizontal bars under target */
      .aflp-ch-tgt-bars { width:100%; margin-top:4px; display:flex; flex-direction:column; gap:2px; }
      .aflp-ch-hbar-row { display:flex; align-items:center; gap:3px; }
      .aflp-ch-hbar-lbl { font-size:8px; color:rgba(200,160,80,0.5); width:20px; flex-shrink:0; letter-spacing:0.04em; }
      .aflp-ch-hbar-track { flex:1; height:5px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden; }
      .aflp-ch-hbar-fill  { height:100%; border-radius:2px; transition:width 0.3s ease; }
      .aflp-combatant {
        display:flex; flex-direction:column; align-items:center;
        gap:2px; cursor:default;
      }
      .aflp-combatant.is-attacker { cursor:pointer; }
      .aflp-combatant-portrait {
        position:relative; overflow:hidden; flex-shrink:0;
      }
      .aflp-combatant-portrait img {
        display:block; pointer-events:none;
      }
      .aflp-role-overlay {
        position:absolute; bottom:0; left:0; right:0;
        text-align:center; font-size:7px; letter-spacing:0.08em; font-weight:bold; padding:1px 0;
      }
      .aflp-role-overlay.dom { background:rgba(201,169,110,0.92); color:#0a0800; }
      .aflp-role-overlay.sub { background:rgba(200,60,60,0.92); color:#fff; }
      .aflp-leave-btn { align-self: flex-start; display:block; margin-top:2px; padding:1px 4px; font-size:8px; line-height:1.4;
        background:rgba(180,40,40,0.75); color:#fff; border:1px solid rgba(200,80,80,0.5);
        border-radius:2px; cursor:pointer; text-align:center; letter-spacing:0.05em;
        white-space:nowrap; transition:background 0.15s; }
      .aflp-leave-btn:hover { background:rgba(220,50,50,0.95); }

      /* ── Cum / Edge buttons ─────────────────────────────────────────────
         Dim and disabled until the participant is ready to cum, then the row
         gains .ready and the buttons light up + pulse to draw the eye. */
      .aflp-cumedge-row { display:flex; gap:5px; box-sizing:border-box; }
      .aflp-cumedge-row.block  { width:100%; margin-top:4px; }
      .aflp-cumedge-row.inline { margin-top:0; }
      .aflp-ce-btn {
        flex:1 1 0; min-width:0; padding:3px 6px; font-size:10px; font-weight:700;
        letter-spacing:0.06em; text-transform:uppercase; border-radius:3px;
        cursor:pointer; transition:all 0.18s ease; line-height:1.3;
        font-family:var(--font-primary,serif); white-space:nowrap;
        background:rgba(255,255,255,0.05); color:rgba(240,232,208,0.4);
        border:1px solid rgba(200,160,80,0.25);
      }
      .aflp-cumedge-row.inline .aflp-ce-btn { padding:2px 8px; font-size:9px; flex:0 0 auto; }
      .aflp-ce-btn:disabled { cursor:default; opacity:0.55; }
      .aflp-cumedge-row.ready .aflp-ce-cum {
        background:linear-gradient(180deg,rgba(220,60,90,0.95),rgba(180,40,70,0.95));
        color:#fff; border-color:rgba(255,120,150,0.8);
        box-shadow:0 0 10px rgba(220,60,90,0.55); animation:aflp-ce-pulse 1.4s ease-in-out infinite;
      }
      .aflp-cumedge-row.ready .aflp-ce-cum:hover { background:linear-gradient(180deg,rgba(240,80,110,1),rgba(200,50,80,1)); }
      .aflp-cumedge-row.ready .aflp-ce-edge {
        background:linear-gradient(180deg,rgba(128,96,192,0.9),rgba(96,72,150,0.9));
        color:#fff; border-color:rgba(168,136,224,0.8);
        box-shadow:0 0 8px rgba(128,96,192,0.45);
      }
      .aflp-cumedge-row.ready .aflp-ce-edge:hover { background:linear-gradient(180deg,rgba(150,116,214,1),rgba(112,86,170,1)); }
      @keyframes aflp-ce-pulse {
        0%,100% { box-shadow:0 0 8px rgba(220,60,90,0.45); }
        50%     { box-shadow:0 0 16px rgba(220,60,90,0.85); }
      }

      .aflp-combatant-name {
        font-size:10px; color:#c9a96e; text-align:center;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:bold;
      }
      .aflp-combatant-name.sub { color:#e08080; }
      .aflp-combatant-conditions { display:flex; flex-wrap:wrap; gap:2px; justify-content:center; margin-top:1px; }
      .aflp-cond-badge {
        display:inline-block; font-size:9px; padding:1px 4px; border-radius:3px;
        line-height:14px; font-weight:700; white-space:nowrap;
      }
      .aflp-cond-badge.horny   { background:rgba(192,80,128,0.2); border:1px solid rgba(192,80,128,0.5); color:#d07090; }
      .aflp-cond-badge.exposed { background:rgba(200,160,80,0.15); border:1px solid rgba(200,160,80,0.45); color:#c8a050; }
      .aflp-cond-badge.denied  { background:rgba(128,96,192,0.2); border:1px solid rgba(128,96,192,0.5); color:#a080d0; }
      .aflp-cond-badge.orgasm  { background:rgba(64,160,112,0.2); border:1px solid rgba(64,160,112,0.5); color:#50b882; }

      .aflp-pos-chip {
        display:inline-block; padding:1px 5px; border-radius:3px;
        background:rgba(201,169,110,0.12); border:1px solid rgba(201,169,110,0.35);
        font-size:9px; color:#c9a96e; white-space:nowrap; text-align:center;
        line-height:1.3; max-width:80px; overflow:hidden; text-overflow:ellipsis;
      }
      .aflp-pos-chip.unset { color:#555; border-color:rgba(255,255,255,0.1); background:none; }
      /* VS divider kept for status-strip compatibility */
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
      .aflp-theme-aflp-classic .aflp-card-arousal-bars,
      .aflp-theme-lewd-lite .aflp-card-arousal-bars,
      .aflp-theme-status-strip .aflp-card-arousal-bars,
      .aflp-theme-dossier .aflp-card-arousal-bars,
      .aflp-theme-fuckamons .aflp-card-arousal-bars { display: none !important; }
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
      .aflp-card-prose-area { padding:6px 10px 4px; position:relative; min-height:28px; width:100%; box-sizing:border-box; }
      .aflp-card-prose-text {
        font-size:13px; line-height:1.55; color:#f0e8d0; font-style:italic;
        font-family:var(--font-primary,'Palatino Linotype',Palatino,Georgia,serif);
        text-shadow:0 1px 2px rgba(0,0,0,0.6);
        width:100%; max-width:100%; box-sizing:border-box;
        overflow:hidden; word-break:break-word; overflow-wrap:anywhere;
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

  // ─── Status Strip theme CSS (injected once alongside gangbang-hud CSS) ────────
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
      .aflp-theme-aflp-classic .aflp-card-theme-select,
      .aflp-theme-aflp-classic .aflp-card-arousal-select {
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
        overflow-x: auto; scroll-behavior: smooth;
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
      .aflp-ss-stats { display:flex; gap:6px; align-items:baseline; margin-top:3px; white-space:nowrap; }
      .aflp-ss-stat-aro { font-size:9px; font-weight:600; color:rgba(210,80,80,0.85); }
      .aflp-ss-stat-cum { font-size:9px; color:rgba(220,200,160,0.65); }
    `;
  }

  // ─── Porno Scene theme CSS ───────────────────────────────────────────────────
  function _aflpClassicCSS() {
    return `
      .aflp-theme-aflp-classic .aflp-card-header {
        background: linear-gradient(135deg,rgba(42,5,16,0.95),rgba(26,10,8,0.95));
        border-bottom: 1px solid rgba(200,50,80,0.4); padding: 0; gap: 0;
      }
      .aflp-theme-aflp-classic .aflp-card-header-top {
        padding: 5px 10px;
        background: rgba(200,50,80,0.1);
        border-bottom: 1px solid rgba(200,50,80,0.25);
              display: flex; align-items: center; justify-content: flex-end;
      }
      .aflp-theme-aflp-classic .aflp-card-btn {
        border-color: rgba(200,50,80,0.4); color: rgba(220,100,130,0.85);
        background: rgba(200,50,80,0.1);
      }
      .aflp-theme-aflp-classic .aflp-card-portraits { padding: 8px 10px; flex-direction: column; gap: 6px; width: 100%; box-sizing: border-box; }
      .aflp-po-bottom-row { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; box-sizing: border-box; overflow: hidden; }
      .aflp-po-bottom-port {
        width: 60px; height: 60px; border-radius: 4px; overflow: hidden;
        border: 1px solid rgba(200,50,80,0.5); flex-shrink: 0;
      }
      .aflp-po-bottom-port img { width:60px!important;height:60px!important;max-width:60px!important;max-height:60px!important;object-fit:cover;object-position:top;pointer-events:none;display:block; }
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
        padding: 2px 6px; border-radius: 3px; font-size: 9px;
        letter-spacing: 0.06em; text-align: center; font-weight: bold;
        margin-top: 3px; display: block; width: 100%; box-sizing: border-box;
        white-space: normal; overflow: hidden;
        animation: aflp-pulse 2.5s ease-in-out infinite;
      }
      @keyframes aflp-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
      .aflp-po-divider {
        font-size: 9px; color: rgba(150,50,70,0.5); text-align: center;
        padding: 2px 0; letter-spacing: 0.2em;
      }
      .aflp-po-dom-row { display: flex; gap: 4px; flex-direction: column; width: 100%; box-sizing: border-box; }
      .aflp-po-dom-col { display: flex; align-items: flex-start; gap: 4px; width: 100%; min-width: 0; overflow: hidden; box-sizing: border-box; }
      .aflp-po-dom-label { font-size: 9px; letter-spacing: 0.15em; color: rgba(180,120,30,0.7); text-transform: uppercase; margin-bottom: 2px; }
      .aflp-po-dom-port {
        width: 60px; height: 60px; border-radius: 4px; overflow: hidden;
        border: 1px solid rgba(180,140,40,0.4); flex-shrink: 0;
      }
      .aflp-po-dom-port img { width:60px!important;height:60px!important;max-width:60px!important;max-height:60px!important;object-fit:cover;object-position:top;pointer-events:none;display:block; }
      .aflp-po-dom-name { font-size: 11px; color: #d0a860; font-style: italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .aflp-po-dom-pos  { font-size: 9px; color: rgba(160,100,20,0.8); font-style: italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .aflp-po-cock-chip { display:inline-block; font-size:8px; letter-spacing:0.06em; border-radius:3px; padding:1px 3px; border:1px solid; cursor:default; }
      .aflp-po-cock-chip.active   { color:#f0e8d0; border-color:rgba(200,160,80,0.7); background:rgba(200,160,80,0.18); }
      .aflp-po-cock-chip.inactive { color:rgba(150,120,60,0.5); border-color:rgba(150,120,60,0.25); background:transparent; }
      .aflp-po-atk-chips { display:flex; gap:2px; flex-wrap:wrap; margin-top:2px; }
      .aflp-po-atk-chip  { font-size:8px; letter-spacing:0.04em; border-radius:3px; padding:1px 3px; border:1px solid; color:#f0e8d0; border-color:rgba(200,160,80,0.6); background:rgba(200,160,80,0.15); }
      /* Cumflation displayed as text line - no vertical bar */
      /* Cum bar in arousal area */
      .aflp-cum-row   { display:flex; align-items:center; gap:6px; margin-bottom:1px; }
      .aflp-cum-label { font-size:9px; color:rgba(200,160,80,0.6); flex-shrink:0; width:72px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .aflp-cum-track { flex:1 1 0; min-width:0; height:5px; background:rgba(255,255,255,0.06); border:1px solid rgba(200,160,80,0.2); border-radius:2px; overflow:hidden; }
      .aflp-cum-fill  { height:100%; border-radius:2px; background:linear-gradient(90deg,#8060a0,#c090e0); transition:width 0.3s ease; }
      .aflp-cum-val   { font-size:9px; color:rgba(200,160,80,0.5); flex-shrink:0; min-width:36px; text-align:right; }
      /* Pip-style themes: hide bar, show label+value only */
      .aflp-theme-status-strip .aflp-cum-track,
      .aflp-theme-dossier .aflp-cum-track { display:none; }
      .aflp-theme-status-strip .aflp-cum-label,
      .aflp-theme-dossier .aflp-cum-label { width:auto; }
      .aflp-theme-status-strip .aflp-arousal-name,
      .aflp-theme-dossier .aflp-arousal-name { width:auto; }
      .aflp-po-cock-chip.active { color:#f0e8d0; border-color:rgba(200,160,80,0.7); background:rgba(200,160,80,0.18); }
      .aflp-po-cock-chip.inactive { color:rgba(150,120,60,0.5); border-color:rgba(150,120,60,0.25); background:transparent; }
      .aflp-theme-aflp-classic .aflp-arousal-bar-fill.sub-fill { background: linear-gradient(90deg,#c02840,#ff4068); }
      .aflp-theme-aflp-classic .aflp-card-arousal-bars { border-bottom-color: rgba(200,50,80,0.15); }
      .aflp-theme-aflp-classic .aflp-card-gm-area { border-top-color: rgba(200,50,80,0.12); }
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
      .aflp-theme-dossier .aflp-card-btn {
        font-family: 'Courier New',monospace; font-size: 10px;
        border-color: rgba(40,140,40,0.4); color: rgba(80,180,80,0.8);
        background: rgba(20,60,20,0.3);
      }
      .aflp-theme-dossier .aflp-card-btn:hover { background: rgba(40,120,40,0.3); }
      .aflp-theme-dossier .aflp-card-portraits { padding: 5px 8px; flex-direction: column; gap: 3px; }
      /* Subject rows */
      .aflp-do-subject {
        display: flex; align-items: flex-start; gap: 6px; padding: 4px 6px;
        border: 1px solid rgba(30,80,40,0.3); border-radius: 2px;
        background: rgba(5,12,6,0.6); position: relative;
        width: 100%; box-sizing: border-box;
      }
      .aflp-do-subject.tgt { border-color: rgba(120,40,40,0.4); }
      .aflp-do-port {
        width: 32px; height: 32px; border-radius: 2px; overflow: hidden;
        border: 1px solid rgba(40,120,40,0.4); flex-shrink: 0; margin-top: 2px;
      }
      .aflp-do-port.tgt { border-color: rgba(150,40,40,0.5); }
      .aflp-do-port img { width:100%;height:100%;object-fit:cover;object-position:top;pointer-events:none;display:block; }
      .aflp-do-info { flex: 1; min-width: 0; }
      .aflp-do-id { font-size: 10px; color: rgba(40,120,40,0.6); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 1px; }
      .aflp-do-name { font-size: 14px; color: rgba(100,200,100,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
      .aflp-do-name.tgt { color: rgba(200,100,100,0.85); font-size: 14px; }
      .aflp-do-status { font-size: 11px; color: rgba(40,120,40,0.6); font-style: italic; }
      .aflp-do-stamp {
        padding: 2px 7px; border-radius: 1px; font-size: 10px; letter-spacing: 0.06em; flex-shrink: 0; white-space: nowrap; align-self: flex-start;
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
      /* Dossier inline bars */
      .aflp-do-bars { margin-top:4px; }
      .aflp-do-bar-row { display:flex; align-items:center; gap:4px; margin-bottom:2px; }
      .aflp-do-bar-lbl { font-size:9px; color:rgba(80,160,80,0.6); font-family:'Courier New',monospace; width:28px; flex-shrink:0; }
      .aflp-do-bar-lbl.cum { color:rgba(80,160,80,0.45); }
      .aflp-do-bar-track { flex:1; height:4px; background:rgba(5,20,5,0.8); border:1px solid rgba(20,60,20,0.5); border-radius:1px; overflow:hidden; }
      .aflp-do-bar-fill { height:100%; transition:width 0.3s; }
      .aflp-do-bar-fill.aro { background:linear-gradient(90deg,rgba(40,140,40,0.8),rgba(80,200,80,0.8)); }
      .aflp-do-bar-fill.cum { background:linear-gradient(90deg,rgba(20,100,20,0.6),rgba(40,140,40,0.6)); }
      .aflp-do-bar-val { font-size:8px; color:rgba(80,160,80,0.5); font-family:'Courier New',monospace; min-width:30px; text-align:right; flex-shrink:0; }
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
  // Build the in-card Cum / Edge button pair for a participant.
  //   scene     — the scene object
  //   key       — participant key (target token id, or attacker token id)
  //   actorId   — world actor id of the participant (for masturbation/edge ctx)
  //   variant   — "block" (stacked, default) or "inline" (compact, for strips)
  // Returns an HTMLElement, or null if buttons shouldn't show for this actor
  // (auto-cum configured) or the user can't control the scene.
  //
  // Buttons are dim by default and light up when the participant is pending a
  // cum decision (scene.readyToCum[key]). Edge only shows if Edge automation
  // would let this actor edge; otherwise just a Cum button is offered so a
  // pending state can still be cleared.
  // -----------------------------------------------
  function _buildCumEdgeButtons(scene, key, actorId, variant = "block") {
    // Token-first resolution so unlinked tokens resolve to their synthetic actor.
    const actor = _resolveActor({ id: key, actorId });
    if (!actor) return null;

    // Hide entirely when cum auto-resolves for this actor (no manual choice).
    if (!AFLP_Arousal?._shouldDeferCum?.(actor)) return null;

    const mode = _sceneMode(scene);
    if (!_userCanControl(scene, mode)) return null;

    const ready = !!(scene.readyToCum && scene.readyToCum[key]);

    const row = document.createElement("div");
    row.className = `aflp-cumedge-row ${variant === "inline" ? "inline" : "block"}${ready ? " ready" : ""}`;
    row.dataset.ceKey = key;

    const cumBtn = document.createElement("button");
    cumBtn.type = "button";
    cumBtn.className = "aflp-ce-btn aflp-ce-cum";
    cumBtn.textContent = "Cum";
    cumBtn.title = ready ? "Resolve the climax now" : "Not ready to cum yet";
    cumBtn.disabled = !ready;
    cumBtn.addEventListener("click", e => {
      e.stopPropagation();
      AFLP.HScene.resolveCum(scene.targetId, key);
    });
    row.appendChild(cumBtn);

    const edgeBtn = document.createElement("button");
    edgeBtn.type = "button";
    edgeBtn.className = "aflp-ce-btn aflp-ce-edge";
    edgeBtn.textContent = "Edge";
    edgeBtn.title = ready ? "Attempt to hold back (Edge reaction)" : "Not ready to edge yet";
    edgeBtn.disabled = !ready;
    edgeBtn.addEventListener("click", e => {
      e.stopPropagation();
      AFLP.HScene.resolveEdge(scene.targetId, key);
    });
    row.appendChild(edgeBtn);

    return row;
  }

  // -----------------------------------------------
  // Calculate the pixel width needed to display a scene's actor row
  // -----------------------------------------------
  function _calcSceneWidth(scene) {
    // Vertical-stacking themes (Classic, Fuck-a-Mon, Lewd Lite, Dossier) keep a
    // STABLE width regardless of actor count — performers stack downward, so the
    // card must not grow per actor (a vestige of an old horizontal VS layout).
    // Long inline content (e.g. cumflation labels) wraps within this width.
    const theme = _effectiveTheme(scene);
    if (theme !== "status-strip") return 360;

    // Status Strip is horizontal: it lays one chip per visible entity in a row,
    // so it DOES need width to show them. Size to the focused group's chips plus
    // one compact chip per nearby group (+ a divider). _updateContainerWidth
    // clamps this to the window, beyond which the strip scrolls.
    const groups = _buildSceneGroups(scene);
    if (!groups.length) return 360;
    const focus        = _resolveFocusGroup(scene, groups);
    const focusedChips = focus.type === "mutual" ? 2 : (1 + (focus.perfs?.length ?? 0));
    const nearbyChips  = groups.length - 1;
    const w = (focusedChips + nearbyChips) * 118 + (nearbyChips > 0 ? 24 : 0) + 16;
    return Math.max(360, w);
  }

  // Update the container to be as wide as the widest active scene.
  //
  // Width is driven SOLELY by _calcSceneWidth (a deterministic function of
  // attacker count and portrait sizes). We deliberately do NOT measure
  // scrollWidth of rendered content here: that created a feedback loop where
  // prose lines, lit-up buttons, or any momentarily-unwrapped content could
  // inflate the measured width, which then stuck (the container never shrank
  // back). All in-card content (prose, bars, Cum/Edge buttons, hole chips)
  // lives in min-width:0 columns that wrap/fit within the formula width, so
  // the formula alone is sufficient and stable.
  function _updateContainerWidth() {
    if (!_container) return;
    let w = 280;
    for (const scene of _scenes.values()) w = Math.max(w, _calcSceneWidth(scene));
    w = Math.min(w, window.innerWidth - 80);
    _container.style.width = w + "px";
  }

  // Coalesce bursts of refresh calls into a single rebuild. A single Sexual Advance
  // fires several hooks (arousal on both actors, plus the condition creates) spread over
  // ~140ms because the macro awaits between operations, so each one previously ran a full
  // innerHTML portrait rebuild and the portraits strobed on every theme. We debounce per
  // card (latest scene wins): a trailing wait longer than the observed max inter-rebuild
  // gap (~80ms) collapses the whole burst into one rebuild, bounded by a max wait so a
  // stream of updates cannot starve the render.
  const _REFRESH_DEBOUNCE_MS = 150;
  const _REFRESH_MAX_WAIT_MS = 400;
  const _refreshQueue = new Map(); // card -> { scene, portraits, bars, timer, firstAt }
  function _flushRefresh(card) {
    const job = _refreshQueue.get(card);
    if (!job) return;
    _refreshQueue.delete(card);
    if (job.timer) { clearTimeout(job.timer); job.timer = null; }
    try {
      if (job.portraits) _refreshPortraitsNow(card, job.scene);
      if (job.bars)      _refreshArousalBarsNow(card, job.scene);
    } catch (e) { console.error("AFLP | coalesced refresh failed", e); }
  }
  function _scheduleRefresh(card, scene, portraits, bars) {
    if (!card) return;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    let job = _refreshQueue.get(card);
    if (!job) {
      job = { scene, portraits, bars, timer: null, firstAt: now };
      _refreshQueue.set(card, job);
    } else {
      job.scene = scene;
      job.portraits = job.portraits || portraits;
      job.bars      = job.bars      || bars;
    }
    if (job.timer) clearTimeout(job.timer);
    const wait = Math.min(_REFRESH_DEBOUNCE_MS, Math.max(0, _REFRESH_MAX_WAIT_MS - (now - job.firstAt)));
    job.timer = setTimeout(() => _flushRefresh(card), wait);
  }
  function _refreshPortraits(card, scene)  { _scheduleRefresh(card, scene, true,  false); }
  function _refreshArousalBars(card, scene) { _scheduleRefresh(card, scene, false, true); }

  // -----------------------------------------------
  // ─── Lewd Lite renderer ─ PF2e-style combatant tracker rows ─────────
  // Font scaling for the H scene card: AFLP Classic gets a baseline +2pt bump, plus
  // the "Card Font Boost" setting (+N applied to every theme). Implemented by walking
  // the freshly-rendered card and nudging inline px font sizes only - layout/sizing is
  // untouched, and because each refresh rebuilds from base sizes the boost never
  // compounds. Small fonts get a larger relative lift than already-large ones.
  function _cardFontOffset(scene) {
    const base  = _effectiveTheme(scene) === "aflp-classic" ? 1 : 0;   // Classic baseline +1
    const boost = AFLP.Settings?.cardFontBoost ? 2 : 0;   // flat +2 toggle
    return base + boost;
  }
  // Boost every text element in the card by `offset` px. Reads the COMPUTED size so
  // both inline styles AND module.css class rules scale. The base size is stored on
  // each element, so all reads use the base (inherited sizes aren't double-counted)
  // and a re-boost after a partial refresh is safe. Each full refresh rebuilds from
  // base, so the boost never compounds; layout/card sizing is untouched.
  function _boostCardFonts(card, offset) {
    if (!offset || !card?.querySelectorAll) return;
    const els = [...card.querySelectorAll("*")];
    const base = els.map(el => {
      const stored = el.dataset ? el.dataset.aflpFsBase : null;
      if (stored != null) return parseFloat(stored);
      try { return parseFloat(getComputedStyle(el).fontSize); } catch (_) { return NaN; }
    });
    els.forEach((el, i) => {
      if (isNaN(base[i])) return;
      if (el.dataset) el.dataset.aflpFsBase = String(base[i]);
      el.style.fontSize = (base[i] + offset) + "px";
    });
  }
  function _refreshPortraitsNow(card, scene) {
    _refreshPortraitsRender(card, scene);
    try { _boostCardFonts(card, _cardFontOffset(scene)); } catch (_) {}
  }
  function _refreshPortraitsRender(card, scene) {
    const theme = _effectiveTheme(scene);
    if (theme === "status-strip")  { _refreshPortraits_StatusStrip(card, scene); return; }
    if (theme === "aflp-classic")  { _refreshPortraits_AflpClassic(card, scene); return; }
    if (theme === "dossier")       { _refreshPortraits_Dossier(card, scene); return; }
    if (theme === "fuckamons")     { _refreshPortraits_FuckaMon(card, scene); return; }
    // theme === "lewd-lite" — falls through to this renderer

    const wrap = card.querySelector(".aflp-card-portraits");
    if (!wrap) return;
    wrap.innerHTML = "";

    const FLAG = AFLP.FLAG_SCOPE;
    const mode = _sceneMode(scene);
    const safePron = { subject:"they", object:"them", possessive:"their", reflexive:"themselves" };

    const groups = _buildSceneGroups(scene);
    if (!groups.length) {
      _applyDragHandleTheme(_container?.querySelector("#aflp-hscene-drag-handle"), null, mode, scene);
      _updateContainerWidth();
      return;
    }
    const focus = _resolveFocusGroup(scene, groups);
    const rest  = groups.filter(g => g !== focus);
    const _llRing = (p) => _classicIsOwnPc(p) ? "box-shadow:0 0 0 2px #6fd3ff;" : "";

    // One compact row. ctx: { isReceiver, atk, recvId, perfsLen, participant, coEqual }.
    // Sourced from explicit participants (not scene.target/attackers) so any
    // focused group renders. atk (a legacy proxy) marks an interactive performer.
    const makeRow = (actor, tokenId, actorId, name, img, ctx = {}) => {
      const { isReceiver = false, atk = null, recvId = null, perfsLen = 1, participant = null, coEqual = false } = ctx;
      const arousal = actor?.getFlag?.(FLAG, "arousal") ?? {};
      const arCur   = arousal.current ?? 0;
      const arMax   = AFLP.HScene.calcArousalMax ? AFLP.HScene.calcArousalMax(actor) : (arousal.max ?? 10);
      const arPct   = arMax > 0 ? Math.min(100, Math.round(arCur / arMax * 100)) : 0;
      const arCls   = arPct > 75 ? "high" : arPct > 40 ? "mid" : "low";

      const posSrc   = atk ?? (coEqual ? participant : null);
      const posEntry = posSrc ? AFLP.getPosition(posSrc.position) : null;
      const posLabel = posEntry?.label?.(safePron) ?? (isReceiver ? "" : (atk ? "+ set position" : ""));

      const row = document.createElement("div");
      row.className = "aflp-ll-row" + (isReceiver ? " is-target" : "");
      if (atk) row.dataset.atkId = tokenId;
      const safeName = _safeName(name).split(" ").slice(0,2).join(" ");
      const tag = (isReceiver && mode === "dominated")
        ? ' <span style="font-size:8px;color:rgba(200,80,80,0.7);font-weight:normal;">[submitting]</span>'
        : (coEqual ? ' <span style="font-size:8px;color:rgba(200,140,90,0.85);font-weight:normal;">⇄</span>' : "");

      row.innerHTML = `
        <div class="aflp-ll-port" style="${_llRing(participant)}">
          <img src="${img}" alt="${safeName}" width="36" height="36"
               style="width:36px;height:36px;max-width:36px;max-height:36px;object-fit:cover;object-position:top;display:block;"/>
        </div>
        <div class="aflp-ll-info">
          <div class="aflp-ll-name">${safeName}${tag}</div>
          ${posLabel ? `<div class="aflp-ll-pos">${posLabel}${coEqual ? " →" : ""}</div>` : ""}
          <div style="display:flex;align-items:center;gap:4px;margin-top:1px;">
            <span class="aflp-ll-aro-lbl">Aro</span>
            <div class="aflp-ll-aro-track" style="flex:1;" title="Arousal ${arCur}/${arMax}">
              <div class="aflp-ll-aro-fill ${arCls}" style="width:${arPct}%;"></div>
            </div>
          </div>
        </div>
        <div class="aflp-ll-right">
          <span class="aflp-ll-aro-val">${arCur}/${arMax}</span>
        </div>
      `;

      if (actor) {
        const conds = makeCondBadges(actor, 36, scene);
        if (conds?.children?.length) row.querySelector(".aflp-ll-right").before(conds);
      }

      // Leave (GM) — performers and entangled members (not the receiver). For
      // entangled members there is no receiver anchor, so resolve by scene id.
      if ((atk || coEqual) && game.user.isGM) {
        const lb = document.createElement("button");
        lb.className = "aflp-leave-btn";
        lb.textContent = "✕ Leave";
        lb.style.cssText = "align-self:center;font-size:8px;padding:2px 5px;white-space:nowrap;";
        lb.addEventListener("click", e => { e.stopPropagation(); AFLP.HScene.removeParticipant(recvId ?? scene.id, tokenId); });
        row.querySelector(".aflp-ll-right").appendChild(lb);
      }

      // Position click (GM) — performers and entangled members. The prompt is
      // partner-aware: a performer points at the receiver, an entangled member at
      // the other side. Build a proxy for coEqual members (no atk passed in).
      if ((atk || coEqual) && game.user.isGM && AFLP.Settings.positionTracking) {
        const posTarget = atk ?? _legacyAttackerProxy(participant);
        row.style.cursor = "pointer";
        row.title = "Click to change position";
        row.addEventListener("click", async e => {
          if (e.target.closest(".aflp-leave-btn")) return;
          if (e.target.closest(".aflp-cumedge-row")) return;
          await AFLP.HScene._promptGroupPosition(scene, posTarget);
          const fc = _cardFor(scene);
          if (fc) _refreshPortraits(fc, scene);
        });
      }

      // Cum/Edge (every participant who can climax — receiver, performers, both
      // entangled sides).
      {
        const ce = _buildCumEdgeButtons(scene, tokenId, actorId ?? tokenId, "inline");
        if (ce) row.querySelector(".aflp-ll-info")?.appendChild(ce);
      }
      return row;
    };

    if (focus.type === "mutual") {
      const hdr = document.createElement("div");
      hdr.className = "aflp-ll-pos";
      hdr.style.cssText = "text-align:center;letter-spacing:0.1em;color:rgba(200,140,90,0.85);padding:2px 0;";
      hdr.textContent = "⇄ Entangled";
      wrap.appendChild(hdr);
      for (const m of focus.members) {
        const mActor = _resolveActor({ id: m.tokenId, actorId: m.actorId });
        wrap.appendChild(makeRow(mActor, m.tokenId, m.actorId, m.name, m.img, { coEqual: true, participant: m }));
      }
    } else {
      const recv = focus.receiver;
      const recvActor = _resolveActor({ id: recv.tokenId, actorId: recv.actorId });
      wrap.appendChild(makeRow(recvActor, recv.tokenId, recv.actorId, recv.name, recv.img, { isReceiver: true, participant: recv }));
      for (const p of focus.perfs) {
        const pProxy = _legacyAttackerProxy(p);
        const pActor = _resolveActor(pProxy);
        wrap.appendChild(makeRow(pActor, p.tokenId, p.actorId, p.name, p.img,
          { atk: pProxy, recvId: recv.tokenId, perfsLen: focus.perfs.length, participant: p }));
      }
    }

    if (rest.length) {
      const sep = document.createElement("div");
      sep.className = "aflp-ll-pos";
      sep.style.cssText = "text-align:center;letter-spacing:0.12em;opacity:0.6;padding:3px 0 1px;";
      sep.textContent = "— nearby —";
      wrap.appendChild(sep);
      for (const g of rest) _llNearbyBlock(wrap, scene, g);
    }

    _applyDragHandleTheme(_container?.querySelector("#aflp-hscene-drag-handle"), null, mode, scene);
    _updateContainerWidth();
  }

  // Compact view-only Nearby block for Lewd Lite, with a per-client ⤒ Focus.
  function _llNearbyBlock(wrap, scene, group) {
    const block = document.createElement("div");
    block.style.cssText = "border:1px solid rgba(200,90,110,0.15);border-radius:4px;padding:4px 6px;background:rgba(0,0,0,0.18);margin-top:2px;";

    const ready = _classicGroupHasReady(scene, group);
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;";
    const title = document.createElement("span");
    title.style.cssText = "font-size:8px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(180,140,60,0.7);";
    title.innerHTML = (group.type === "mutual" ? "⇄ Nearby" : "Nearby")
      + (ready ? ` <span style="color:#d03040;" title="Someone here is ready to cum">● ready</span>` : "");
    const fb = document.createElement("div");
    fb.style.cssText = "font-size:8px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(110,210,255,0.8);border:1px solid rgba(110,210,255,0.3);background:rgba(110,210,255,0.07);border-radius:3px;padding:1px 5px;cursor:pointer;";
    fb.textContent = "⤒ Focus";
    fb.title = "Focus this on your card";
    fb.addEventListener("click", e => {
      e.stopPropagation();
      _setFocusPin(scene.id, group.id);
      const c = _cardFor(scene);
      if (c) _refreshPortraits(c, scene);
    });
    head.appendChild(title);
    head.appendChild(fb);
    block.appendChild(head);

    const port = (p, sz, border) => `<img src="${p.img}" alt="${_safeName(p.name)}" style="width:${sz}px;height:${sz}px;border-radius:3px;object-fit:cover;object-position:top;border:1px solid ${border};flex-shrink:0;${_classicIsOwnPc(p) ? "box-shadow:0 0 0 2px #6fd3ff;" : ""}"/>`;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;";

    if (group.type === "mutual") {
      const [m1, m2] = group.members;
      row.innerHTML = `${port(m1, 26, "rgba(180,140,40,0.4)")}<span class="aflp-ll-name" style="font-size:10px;flex:1;min-width:0;">${_safeName(m1.name)}</span><span style="color:rgba(200,140,90,0.85);">⇄</span><span class="aflp-ll-name" style="font-size:10px;flex:1;min-width:0;text-align:right;">${_safeName(m2.name)}</span>${port(m2, 26, "rgba(180,140,40,0.4)")}`;
      block.appendChild(row);
    } else {
      const r = group.receiver;
      row.innerHTML = `${port(r, 30, "rgba(200,50,80,0.5)")}<span class="aflp-ll-name" style="font-size:10px;color:#e08090;flex-shrink:0;">${_safeName(r.name)}</span>${_llCascade(group.perfs)}`;
      block.appendChild(row);
      const names = group.perfs.map(p => _safeName(p.name)).join(", ");
      const take = document.createElement("div");
      take.className = "aflp-ll-pos";
      take.style.cssText = "margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      take.textContent = `with ${names}`;
      take.title = names;
      block.appendChild(take);
    }
    wrap.appendChild(block);
  }

  // Cascaded performer thumbnails for a Lewd Lite nearby block.
  function _llCascade(perfs) {
    const CAP = 5;
    const shown = perfs.slice(0, CAP), extra = perfs.length - shown.length;
    let h = `<div style="display:flex;align-items:center;">`;
    shown.forEach((p, i) => {
      h += `<div style="width:24px;height:24px;border-radius:3px;overflow:hidden;border:1px solid rgba(180,140,40,0.4);box-shadow:-2px 0 3px rgba(0,0,0,0.5)${_classicIsOwnPc(p) ? ",0 0 0 2px #6fd3ff" : ""};${i ? "margin-left:-8px;" : ""}z-index:${20 - i};"><img src="${p.img}" style="width:24px;height:24px;display:block;object-fit:cover;object-position:top;"/></div>`;
    });
    if (extra > 0) h += `<div style="margin-left:-7px;width:22px;height:22px;border-radius:3px;background:rgba(0,0,0,0.5);border:1px solid rgba(180,140,40,0.4);color:#c9a96e;font-size:9px;font-weight:bold;display:flex;align-items:center;justify-content:center;z-index:1;">+${extra}</div>`;
    return h + `</div>`;
  }

  // -----------------------------------------------
  // Status Strip portrait renderer
  // -----------------------------------------------
  function _refreshPortraits_StatusStrip(card, scene) {
    const wrap = card.querySelector(".aflp-card-portraits");
    if (!wrap) return;
    wrap.innerHTML = "";

    const groups = _buildSceneGroups(scene);
    if (!groups.length) {
      _updateContainerWidth();
      requestAnimationFrame(() => _updateContainerWidth());
      _applyDragHandleTheme(_container?.querySelector("#aflp-hscene-drag-handle"), null, _sceneMode(scene), scene);
      return;
    }
    const focus  = _resolveFocusGroup(scene, groups);
    const rest   = groups.filter(g => g !== focus);
    const ssMode = _sceneMode(scene);

    const _ssRing = (p) => _classicIsOwnPc(p) ? "box-shadow:0 0 0 2px #6fd3ff;" : "";

    // One interactive chip. opts: { roleLabel, traitCls, posId, isTarget,
    // recvId, perfsLen, coEqual, participant }. Sourced from an explicit
    // participant so cum/edge keys + own-PC ring resolve correctly.
    const makeChip = (participant, opts = {}) => {
      const { roleLabel = "", traitCls = "aflp-ss-trait-pos", posId = null,
              isTarget = false, recvId = null, perfsLen = 1, coEqual = false } = opts;
      const resolvedActor = _resolveActor({ id: participant.tokenId, actorId: participant.actorId });
      const col = document.createElement("div");
      col.className = "aflp-ss-actor";
      const safeName = _safeName(participant.name).split(" ").slice(0,2).join(" ");
      const pos = _posLabelShort(posId);

      const arousal = resolvedActor?.getFlag?.(AFLP.FLAG_SCOPE, "arousal") ?? {};
      const arCur = arousal.current ?? 0;
      const arMax = AFLP.HScene.calcArousalMax ? AFLP.HScene.calcArousalMax(resolvedActor) : (arousal.max ?? 10);
      const cumData = resolvedActor?.getFlag?.(AFLP.FLAG_SCOPE, "cum") ?? {};
      const cumCur = cumData.current ?? 0;
      const statsHtml = resolvedActor ? `<div class="aflp-ss-stats"><span class="aflp-ss-stat-aro">Aro ${arCur}/${arMax}</span><span class="aflp-ss-stat-cum">Cum ${cumCur}mL</span></div>` : "";
      const portBorder = (roleLabel === "Submitting" || roleLabel === "Bottom") ? "rgba(200,64,64,0.5)" : "rgba(201,169,110,0.4)";

      col.innerHTML = `
        <div class="aflp-ss-role-label">${coEqual ? "⇄ Entangled" : roleLabel}</div>
        <div class="aflp-ss-actor-row">
          <div class="aflp-ss-mini-port" style="border:1px solid ${portBorder};${_ssRing(participant)}">
            <img src="${participant.img}" alt="${safeName}"/>
          </div>
          <div class="aflp-ss-name">${safeName}</div>
        </div>
        <span class="aflp-ss-trait ${traitCls}">${roleLabel}</span>
        ${pos ? `<span class="aflp-ss-trait aflp-ss-trait-pos">${pos}${coEqual ? " →" : ""}</span>` : ""}
        ${isTarget ? `<div class="aflp-ss-partner-slot"></div>` : ""}
        ${statsHtml}
      `;

      if (resolvedActor) {
        const ce = _buildCumEdgeButtons(scene, participant.tokenId, participant.actorId ?? participant.tokenId, "inline");
        if (ce) col.appendChild(ce);
      }

      // Position picker (GM) on performers and entangled members (not receiver).
      // Partner-aware prompt: a performer points at the receiver, an entangled
      // member at the other side.
      if (!isTarget && game.user.isGM && AFLP.Settings.positionTracking) {
        const atkProxy = _legacyAttackerProxy(participant);
        col.style.cursor = "pointer";
        col.title = "Click to change position";
        col.addEventListener("click", async (e) => {
          if (e.target.closest(".aflp-leave-btn")) return;
          if (e.target.closest(".aflp-cumedge-row")) return;
          await AFLP.HScene._promptGroupPosition(scene, atkProxy);
        });
      }
      // Leave (GM) on performers and entangled members alike (not the receiver).
      if (!isTarget && game.user.isGM) {
        const leaveBtn = document.createElement("div");
        leaveBtn.className = "aflp-leave-btn";
        leaveBtn.textContent = "✕ Leave";
        leaveBtn.title = `Remove ${participant.name} from scene`;
        leaveBtn.addEventListener("click", e => { e.stopPropagation(); AFLP.HScene.removeParticipant(recvId ?? scene.id, participant.tokenId); });
        col.appendChild(leaveBtn);
      }
      return col;
    };

    if (focus.type === "mutual") {
      for (const m of focus.members) {
        wrap.appendChild(makeChip(m, { roleLabel: "Entangled", traitCls: "aflp-ss-trait-pos", posId: m.position, coEqual: true, participant: m }));
      }
    } else {
      const recv  = focus.receiver;
      const perfs = focus.perfs;
      const tgtRoleLabel = ssMode === "dominated" ? "Submitting" : ssMode === "consensual" ? "Participant" : "Bottom";
      const atkRoleLabel = ssMode === "dominated" ? "Dominating" : ssMode === "consensual" ? "Participant" : "Top";
      const recvChip = makeChip(recv, { roleLabel: tgtRoleLabel, traitCls: ssMode === "dominated" ? "aflp-ss-trait-sub" : "aflp-ss-trait-pos", isTarget: true });
      const domCount = perfs.length;
      if (domCount > 0) {
        const rc = document.createElement("span");
        rc.className = "aflp-ss-trait aflp-ss-trait-pos";
        rc.textContent = ssMode === "dominated"
          ? `Being used by ${domCount} dominant${domCount === 1 ? "" : "s"}`
          : `With ${domCount} partner${domCount === 1 ? "" : "s"}`;
        const slot = recvChip.querySelector(".aflp-ss-partner-slot");
        if (slot) slot.replaceWith(rc); else recvChip.appendChild(rc);
      } else {
        recvChip.querySelector(".aflp-ss-partner-slot")?.remove();
      }
      wrap.appendChild(recvChip);

      for (const p of perfs) {
        wrap.appendChild(makeChip(p, {
          roleLabel: atkRoleLabel,
          traitCls: ssMode === "dominated" ? "aflp-ss-trait-dom" : "aflp-ss-trait-pos",
          posId: p.position, recvId: recv.tokenId, perfsLen: perfs.length,
        }));
      }
    }

    if (rest.length) {
      const divider = document.createElement("div");
      divider.className = "aflp-ss-actor";
      divider.style.cssText = "flex:0 0 auto;align-self:center;writing-mode:vertical-rl;text-orientation:upright;font-size:8px;letter-spacing:0.2em;color:rgba(100,160,255,0.4);text-transform:uppercase;padding:6px 3px;";
      divider.textContent = "nearby";
      wrap.appendChild(divider);
      for (const g of rest) wrap.appendChild(_ssNearbyChip(scene, g));
    }

    wrap.scrollLeft = 0;
    _updateContainerWidth();
    requestAnimationFrame(() => _updateContainerWidth());
    _applyDragHandleTheme(_container?.querySelector("#aflp-hscene-drag-handle"), null, _sceneMode(scene), scene);
  }

  // View-only Nearby chip for Status Strip, with a per-client ⤒ Focus control.
  function _ssNearbyChip(scene, group) {
    const col = document.createElement("div");
    col.className = "aflp-ss-actor";
    col.style.background = "rgba(10,18,40,0.5)";
    const ready = _classicGroupHasReady(scene, group);
    const miniPort = (p, sz) => `<div class="aflp-ss-mini-port" style="width:${sz}px;height:${sz}px;border:1px solid rgba(60,100,200,0.4);${_classicIsOwnPc(p) ? "box-shadow:0 0 0 2px #6fd3ff;" : ""}"><img src="${p.img}" alt="${_safeName(p.name)}"/></div>`;

    let bodyHtml = "";
    if (group.type === "mutual") {
      const [m1, m2] = group.members;
      bodyHtml = `
        <div class="aflp-ss-role-label">≈ Battle${ready ? ` <span style="color:#ff5070;">●</span>` : ""}</div>
        <div class="aflp-ss-actor-row" style="gap:3px;">
          ${miniPort(m1, 20)}<span style="color:#90caf9;font-weight:900;font-size:10px;">⇄</span>${miniPort(m2, 20)}
        </div>
        <div class="aflp-ss-name" style="font-size:10px;">${_safeName(m1.name)} / ${_safeName(m2.name)}</div>`;
    } else {
      const r = group.receiver;
      bodyHtml = `
        <div class="aflp-ss-role-label">≈ Nearby${ready ? ` <span style="color:#ff5070;">●</span>` : ""}</div>
        <div class="aflp-ss-actor-row">${miniPort(r, 22)}<div class="aflp-ss-name" style="font-size:11px;">${_safeName(r.name)}</div></div>
        <span class="aflp-ss-trait aflp-ss-trait-pos">with ${group.perfs.length}</span>`;
    }
    col.innerHTML = bodyHtml;

    const fb = document.createElement("div");
    fb.className = "aflp-ss-trait aflp-ss-trait-pos";
    fb.style.cssText = "cursor:pointer;margin-top:3px;text-align:center;";
    fb.textContent = "⤒ Focus";
    fb.title = "Focus this on your card";
    fb.addEventListener("click", e => {
      e.stopPropagation();
      _setFocusPin(scene.id, group.id);
      const c = _cardFor(scene);
      if (c) _refreshPortraits(c, scene);
    });
    col.appendChild(fb);
    return col;
  }

  // -----------------------------------------------
  // Porno Scene portrait renderer
  // -----------------------------------------------
  // ── AFLP Classic shared bits (short position labels, own-PC ring) ──────────
  const _CLASSIC_SHORT_LABELS = {
    "vaginal":"Vaginal","anal":"Anal","oral-receive":"Oral","facial":"Facial",
    "oral-give":"Going Down","riding-vaginal":"Riding","riding-anal":"Riding (Anal)",
    "groping":"Groping","licking":"Licking","fingering-pussy":"Fingering","fingering-anal":"Fingering (Anal)",
    "fingering-cock":"Cock Play","fingering-mouth":"Oral Play",
    "toy-pussy":"Toy","toy-anal":"Toy (Anal)","toy-ass":"Toy (Anal)",
  };
  const _CLASSIC_SAFE_PRON = { subject:"they", object:"them", possessive:"their", reflexive:"themselves" };
  function _posLabelShort(posId) {
    if (!posId) return null;
    if (_CLASSIC_SHORT_LABELS[posId]) return _CLASSIC_SHORT_LABELS[posId];
    return AFLP.getPosition(posId)?.label?.(_CLASSIC_SAFE_PRON) ?? posId;
  }
  // The viewing user's own PC gets a cyan ring wherever it appears, so a player
  // can spot their character even when it's a performer in someone else's block.
  function _classicIsOwnPc(participant) {
    const c = game.user?.character?.id;
    return !!(c && participant?.actorId === c);
  }
  function _classicRing(participant) {
    return _classicIsOwnPc(participant)
      ? "box-shadow:0 0 0 2px #6fd3ff, 0 0 8px rgba(110,210,255,0.6);" : "";
  }
  const _safeName = n => (n ?? "").replace(/\s*[-–—].*$/, "").trim();

  // ── AFLP Classic renderer (topology-aware / balanced) ──────────────────────
  // Renders the per-client FOCUSED group as the interactive Talent block (a
  // receiver-group, or an entangled/mutual pair), and every other group as a
  // view-only Nearby block with a ⤒ Focus control. "Many vs one" is just the
  // receiver-group case with several performers, so the traditional layout is
  // preserved for the common case.
  function _refreshPortraits_AflpClassic(card, scene) {
    const wrap = card.querySelector(".aflp-card-portraits");
    if (!wrap) return;
    wrap.innerHTML = "";

    const groups = _buildSceneGroups(scene);
    if (!groups.length) { _updateContainerWidth(); return; }
    const focus = _resolveFocusGroup(scene, groups);
    const rest  = groups.filter(g => g !== focus);

    if (focus.type === "mutual") _classicMutualBlock(card, wrap, scene, focus);
    else                         _classicReceiverGroup(card, wrap, scene, focus.receiver, focus.perfs);

    if (rest.length) {
      const sep = document.createElement("div");
      sep.className = "aflp-po-divider";
      sep.style.color = "rgba(200,90,110,0.45)";
      sep.textContent = "— ALSO NEARBY —";
      wrap.appendChild(sep);
      for (const g of rest) _classicNearbyBlock(card, wrap, scene, g);
    }

    _applyDragHandleTheme(_container?.querySelector("#aflp-hscene-drag-handle"), null, _sceneMode(scene), scene);
    _updateContainerWidth();
  }

  // Focused receiver-group: the Talent + their performers, fully interactive.
  // Sourced from an explicit receiver participant + performer participants
  // (NOT scene.target/attackers), so it renders whichever group is focused.
  function _classicReceiverGroup(card, wrap, scene, recv, perfParticipants) {
    const tgtId      = recv.tokenId;
    const tgtActorId = recv.actorId;
    const tgtName    = recv.name ?? "";
    const tgtImg     = recv.img ?? "";
    const attackers  = (perfParticipants ?? []).map(p => _legacyAttackerProxy(p));
    const tgtActor   = _resolveActor({ id: recv.tokenId, actorId: recv.actorId });

    const hasPussy = !!tgtActor?.getFlag(AFLP.FLAG_SCOPE, "pussy");
    const filledPositions = attackers.map(a => a.position).filter(Boolean);
    const _posHole = id => AFLP.getPosition(id)?.hole ?? AFLP.getPosition(id)?.holeId ?? id;
    const hasVaginal = filledPositions.some(p => { const h=_posHole(p); return h==="vaginal"||p==="vaginal"; });
    const hasOral    = filledPositions.some(p => { const h=_posHole(p); return h==="oral"||h==="facial"||p==="oral-receive"||p==="facial"; });
    const hasAnal    = filledPositions.some(p => { const h=_posHole(p); return h==="anal"||p==="anal"; });

    const mode       = _sceneMode(scene);
    const canControl = _userCanControl(scene, mode);
    const safeTgtName = _safeName(tgtName);

    // Manual hole overrides are per-receiver (keyed by the focused receiver's
    // token id), so marks on one receiver don't bleed onto another.
    const mh         = _manualHolesFor(scene, tgtId);
    const vagFilled  = hasPussy ? (hasVaginal || !!mh.pussy) : false;
    const oralFilled = hasOral || !!mh.mouth;
    const analFilled = hasAnal || !!mh.ass;
    const airlocked  = hasPussy ? (vagFilled && oralFilled && analFilled) : (oralFilled && analFilled);

    function makeHoleChip(label, key, filled) {
      const span = document.createElement("span");
      span.className = `aflp-po-hole ${filled ? "filled" : "empty"}`;
      span.textContent = `${label} ${filled ? "✓" : "○"}`;
      if (canControl) {
        span.style.cursor = "pointer";
        span.title = filled ? `Click to unmark ${label}` : `Click to mark ${label} as filled`;
        span.addEventListener("click", e => {
          e.stopPropagation();
          if (!game.user.isGM) {
            game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type:"hscene-player-hole-toggle", targetId: tgtId, key });
          } else {
            const m = _manualHolesFor(scene, tgtId);
            m[key] = !m[key];
            const c = _cardFor(scene);
            if (c) _refreshPortraits(c, scene);
          }
        });
      }
      return span;
    }

    const tgtDiv = document.createElement("div");
    tgtDiv.innerHTML = `
      <div class="aflp-po-bottom-label">The Talent</div>
      <div class="aflp-po-bottom-row">
        <div class="aflp-po-bottom-port" style="${_classicRing(recv)}"><img src="${tgtImg}" alt="${safeTgtName}" width="60" height="60" style="width:60px;height:60px;max-width:60px;max-height:60px;display:block;object-fit:cover;object-position:top;pointer-events:none;"/></div>
        <div class="aflp-po-bottom-info">
          <div class="aflp-po-bottom-name">${safeTgtName}</div>
          <div class="aflp-po-bottom-role">Taking everything they've got</div>
          <div class="aflp-po-holes" id="aflp-po-holes-${tgtId}"></div>
          ${airlocked ? `<div class="aflp-po-airlock">★ AIRLOCKED ★</div>` : ""}
        </div>
      </div>
    `;
    wrap.appendChild(tgtDiv);
    const holesDiv = tgtDiv.querySelector(`#aflp-po-holes-${tgtId}`);
    if (hasPussy) holesDiv.appendChild(makeHoleChip("PUSSY", "pussy", vagFilled));
    holesDiv.appendChild(makeHoleChip("MOUTH", "mouth", oralFilled));
    holesDiv.appendChild(makeHoleChip("ASS",   "ass",   analFilled));
    {
      const tgtCe = _buildCumEdgeButtons(scene, tgtId, tgtActorId ?? tgtId, "block");
      if (tgtCe) tgtDiv.querySelector(".aflp-po-bottom-info")?.appendChild(tgtCe);
    }
    if (tgtActor?.getFlag(AFLP.FLAG_SCOPE, "cock")) {
      const targetCockActive = attackers.some(atk => {
        if (!atk.position) return false;
        const pe = AFLP.getPosition(atk.position);
        return pe && !pe.penile && (pe.hole === "vaginal" || pe.hole === "anal");
      });
      const cockSpan = document.createElement("span");
      cockSpan.className = `aflp-po-hole ${targetCockActive ? "filled" : "empty"}`;
      cockSpan.textContent = `COCK ${targetCockActive ? "✓" : "○"}`;
      holesDiv.appendChild(cockSpan);
    }

    if (attackers.length) {
      const dividerDiv = document.createElement("div");
      dividerDiv.className = "aflp-po-divider";
      dividerDiv.textContent = mode === "dominated" ? "— DOMINATED BY —" : "— WITH —";
      wrap.appendChild(dividerDiv);

      const domHeader = document.createElement("div");
      domHeader.className = "aflp-po-dom-label";
      domHeader.textContent = "Performers";
      wrap.appendChild(domHeader);

      const domRow = document.createElement("div");
      domRow.className = "aflp-po-dom-row";
      for (const atk of attackers) {
        const safeAtkName = _safeName(atk.name).split(" ").slice(0,2).join(" ");
        const posStr     = _posLabelShort(atk.position) ?? (attackers.length > 1 ? "+ set position" : "+ set position");
        const posTooltip = atk.position ? (AFLP.getPositionDesc?.(atk.position) ?? "") : (attackers.length > 1 ? "Set a position" : "Click to set a position");
        const col = document.createElement("div");
        col.className = "aflp-po-dom-col";
        col.dataset.atkId = atk.id;
        const atkActorForCock = _resolveActor(atk);
        const atkHasCock      = !!atkActorForCock?.getFlag?.(AFLP.FLAG_SCOPE, "cock");
        const posEntryForCock = atk.position ? AFLP.getPosition(atk.position) : null;
        const cockActive      = atkHasCock && !!(posEntryForCock?.penile);

        const atkCumData = atkActorForCock ? (atkActorForCock.getFlag(AFLP.FLAG_SCOPE, "cum") ?? {}) : {};
        const atkCumCur  = atkCumData.current ?? 0;
        const atkCumMax  = atkCumData.max ?? 80;
        const atkCumPct  = atkCumMax > 0 ? Math.min(100, Math.round((atkCumCur / atkCumMax) * 100)) : 0;
        const atkArousal = atkActorForCock ? (atkActorForCock.getFlag(AFLP.FLAG_SCOPE, "arousal") ?? {}) : {};
        const atkArCur   = atkArousal.current ?? 0;
        const atkArMax   = AFLP.HScene.calcArousalMax ? AFLP.HScene.calcArousalMax(atkActorForCock) : (atkArousal.max ?? 10);
        const atkArPct   = atkArMax > 0 ? Math.min(100, Math.round((atkArCur / atkArMax) * 100)) : 0;

        const atkChips = [];
        if (cockActive) atkChips.push(`<span class="aflp-po-atk-chip">COCK ✓</span>`);
        else if (atkHasCock) atkChips.push(`<span class="aflp-po-atk-chip" style="opacity:0.35;">COCK ○</span>`);

        col.innerHTML = `
          <div class="aflp-po-dom-port" style="${_classicRing(atk.__participant)}"><img src="${atk.img}" alt="${safeAtkName}" width="60" height="60" style="width:60px;height:60px;max-width:60px;max-height:60px;display:block;object-fit:cover;object-position:top;pointer-events:none;"/></div>
          <div class="aflp-po-dom-infocol" style="min-width:0;flex:1;overflow:hidden;">
            <div class="aflp-po-dom-name">${safeAtkName}</div>
            <div class="aflp-po-dom-pos" title="${posTooltip}" style="cursor:${canControl && AFLP.Settings.positionTracking?'pointer':'default'};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${posStr}</div>
            ${atkChips.length ? `<div class="aflp-po-atk-chips">${atkChips.join("")}</div>` : ""}
            <div style="margin-top:3px;">
              <div style="display:flex;align-items:center;gap:3px;margin-bottom:2px;">
                <span style="font-size:7px;color:rgba(200,160,80,0.5);letter-spacing:0.08em;flex-shrink:0;width:30px;">CUM</span>
                <div class="aflp-cum-track" style="flex:1;"><div class="aflp-cum-fill" style="width:${atkCumPct}%;"></div></div>
                <span style="font-size:8px;color:rgba(200,160,80,0.45);flex-shrink:0;min-width:28px;text-align:right;">${atkCumCur}mL</span>
              </div>
              <div style="display:flex;align-items:center;gap:3px;">
                <span style="font-size:7px;color:rgba(220,80,80,0.5);letter-spacing:0.08em;flex-shrink:0;width:30px;">ARO</span>
                <div class="aflp-cum-track" style="flex:1;"><div class="aflp-cum-fill" style="width:${atkArPct}%;background:linear-gradient(90deg,#c02828,#ff5070);"></div></div>
                <span style="font-size:8px;color:rgba(220,80,80,0.45);flex-shrink:0;min-width:28px;text-align:right;">${atkArCur}/${atkArMax}</span>
              </div>
            </div>
          </div>
        `;
        if (canControl && AFLP.Settings.positionTracking) {
          col.style.cursor = "pointer";
          col.title = posTooltip || "Click to change position";
          col.addEventListener("click", async () => {
            if (!game.user.isGM) {
              game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type:"hscene-player-position-change", targetId: tgtId, atkTokenId: atk.id });
              ui.notifications.info("Position change requested, waiting for GM.");
            } else if (attackers.length === 1) {
              const atkActor = _resolveActor(atk);
              if (atkActor) await AFLP.HScene._promptAndSetPosition(scene, atk, atkActor);
            } else {
              await AFLP.HScene._promptGroupPosition(scene, atk);
            }
          });
        }
        if (game.user.isGM) {
          const leaveBtn = document.createElement("div");
          leaveBtn.className = "aflp-leave-btn";
          leaveBtn.textContent = "✕ Leave";
          leaveBtn.title = `Remove ${atk.name} from scene`;
          leaveBtn.addEventListener("click", e => {
            e.stopPropagation();
            AFLP.HScene.removeParticipant(tgtId, atk.id);
          });
          col.appendChild(leaveBtn);
        }
        {
          const atkCe = _buildCumEdgeButtons(scene, atk.id, atk.actorId ?? atk.id, "block");
          if (atkCe) col.querySelector(".aflp-po-dom-infocol")?.appendChild(atkCe);
        }
        domRow.appendChild(col);
      }
      wrap.appendChild(domRow);
    }

    // Airlock scene-log entry (once per airlock transition)
    if (airlocked && !card.dataset.airlocked) {
      card.dataset.airlocked = "1";
      AFLP.HScene.addProse(tgtId, `★ AIRLOCKED ★ - ${safeTgtName} is being used in all holes simultaneously.`, "gm");
    } else if (!airlocked) {
      delete card.dataset.airlocked;
    }

    // Cumflation status word on the receiver
    if (tgtActor) {
      _renderCumflationStatus(
        tgtDiv.querySelector(".aflp-po-bottom-info"),
        tgtActor.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? {}
      );
    }
  }

  // Focused mutual/entangled pair: two co-equal sides with Cum/Edge each. Each
  // side's position is set relative to its partner (the other side) via the
  // partner-aware prompt — same as any performer, just pointing the other way.
  function _classicMutualBlock(card, wrap, scene, group) {
    const canControl = _userCanControl(scene, _sceneMode(scene));
    const label = document.createElement("div");
    label.className = "aflp-po-bottom-label";
    label.style.textAlign = "center";
    label.textContent = "⇄ Entangled";
    wrap.appendChild(label);

    const row = document.createElement("div");
    row.className = "aflp-po-bottom-row";
    row.style.gap = "14px";
    row.style.alignItems = "flex-start";

    group.members.forEach((p, i) => {
      const side = document.createElement("div");
      side.className = "aflp-po-bottom-info";
      const nm = _safeName(p.name);
      const posStr = _posLabelShort(p.position) ?? "+ set position";
      side.innerHTML = `
        <div class="aflp-po-bottom-port" style="${_classicRing(p)}"><img src="${p.img}" alt="${nm}" width="60" height="60" style="width:60px;height:60px;display:block;object-fit:cover;object-position:top;pointer-events:none;"/></div>
        <div class="aflp-po-bottom-name" style="font-size:13px;">${nm}</div>
        <div class="aflp-po-dom-pos" style="text-align:center;">${posStr} →</div>
      `;
      const ce = _buildCumEdgeButtons(scene, p.tokenId, p.actorId ?? p.tokenId, "block");
      if (ce) side.appendChild(ce);
      if (game.user.isGM) {
        const leaveBtn = document.createElement("div");
        leaveBtn.className = "aflp-leave-btn";
        leaveBtn.style.alignSelf = "center";
        leaveBtn.textContent = "✕ Leave";
        leaveBtn.title = `Remove ${p.name} from scene`;
        leaveBtn.addEventListener("click", e => { e.stopPropagation(); AFLP.HScene.removeParticipant(scene.id, p.tokenId); });
        side.appendChild(leaveBtn);
      }
      if (canControl && AFLP.Settings.positionTracking) {
        const posEl = side.querySelector(".aflp-po-dom-pos");
        if (posEl) {
          posEl.style.cursor = "pointer";
          posEl.title = p.position ? (AFLP.getPositionDesc?.(p.position) ?? "Click to change position") : "Click to set a position";
          posEl.addEventListener("click", async e => {
            e.stopPropagation();
            if (!game.user.isGM) {
              game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type:"hscene-player-position-change", targetId: p.partnerId ?? scene.id, atkTokenId: p.tokenId });
              ui.notifications.info("Position change requested, waiting for GM.");
            } else {
              await AFLP.HScene._promptGroupPosition(scene, _legacyAttackerProxy(p));
            }
          });
        }
      }
      const mActor = _resolveActor({ id: p.tokenId, actorId: p.actorId });
      if (mActor) _renderCumflationStatus(side, mActor.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? {});
      row.appendChild(side);

      if (i === 0) {
        const swap = document.createElement("div");
        swap.textContent = "⇄";
        swap.style.cssText = "font-size:20px;color:rgba(200,140,90,0.85);align-self:center;";
        row.appendChild(swap);
      }
    });
    wrap.appendChild(row);
  }

  // Cascaded (overlapping) performer portraits for a Nearby block, capped then +N.
  function _classicCascade(perfs) {
    const CAP = 5;
    const shown = perfs.slice(0, CAP), extra = perfs.length - shown.length;
    let h = `<div style="display:flex;align-items:center;">`;
    shown.forEach((p, i) => {
      h += `<div style="width:30px;height:30px;border-radius:50%;overflow:hidden;border:1px solid rgba(180,140,40,0.4);box-shadow:-2px 0 3px rgba(0,0,0,0.5)${_classicIsOwnPc(p) ? ",0 0 0 2px #6fd3ff" : ""};${i ? "margin-left:-10px;" : ""}z-index:${20 - i};"><img src="${p.img}" style="width:30px;height:30px;display:block;object-fit:cover;object-position:top;"/></div>`;
    });
    if (extra > 0) h += `<div style="margin-left:-8px;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,0.5);border:1px solid rgba(180,140,40,0.4);color:#d0a860;font-size:9px;font-weight:bold;display:flex;align-items:center;justify-content:center;z-index:1;">+${extra}</div>`;
    return h + `</div>`;
  }
  function _classicGroupHasReady(scene, group) {
    const ids = group.type === "mutual"
      ? group.members.map(m => m.tokenId)
      : [group.receiver.tokenId, ...group.perfs.map(p => p.tokenId)];
    return ids.some(id => scene.readyToCum && scene.readyToCum[id]);
  }

  // View-only Nearby block: a glance at another pairing, with a ⤒ Focus control
  // (per-client) that promotes it to the Talent slot. No inline interaction.
  function _classicNearbyBlock(card, wrap, scene, group) {
    const block = document.createElement("div");
    block.style.cssText = "border:1px solid rgba(200,90,110,0.18);border-radius:5px;padding:6px 8px;background:rgba(0,0,0,0.22);margin-top:2px;";

    const ready = _classicGroupHasReady(scene, group);
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;";
    const title = document.createElement("span");
    title.style.cssText = "font-size:9px;letter-spacing:0.18em;color:rgba(200,140,150,0.75);text-transform:uppercase;";
    title.innerHTML = (group.type === "mutual" ? "⇄ Nearby" : "Nearby")
      + (ready ? ` <span style="color:#ff5070;" title="Someone here is ready to cum">● ready</span>` : "");
    const focusBtn = document.createElement("div");
    focusBtn.style.cssText = "display:inline-flex;align-items:center;gap:3px;font-size:8px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(110,210,255,0.85);border:1px solid rgba(110,210,255,0.35);background:rgba(110,210,255,0.08);border-radius:3px;padding:1px 6px;cursor:pointer;";
    focusBtn.textContent = "⤒ Focus";
    focusBtn.title = "Focus this scene on your card";
    focusBtn.addEventListener("click", e => {
      e.stopPropagation();
      _setFocusPin(scene.id, group.id);
      const c = _cardFor(scene);
      if (c) _refreshPortraits(c, scene);
    });
    head.appendChild(title);
    head.appendChild(focusBtn);
    block.appendChild(head);

    if (group.type === "mutual") {
      const [m1, m2] = group.members;
      const port = (p) => `<div style="width:34px;height:34px;border-radius:4px;overflow:hidden;border:1px solid ${p.role === "sub" ? "rgba(200,50,80,0.5)" : "rgba(180,140,40,0.4)"};box-shadow:${_classicIsOwnPc(p) ? "0 0 0 2px #6fd3ff" : "none"};flex-shrink:0;"><img src="${p.img}" style="width:34px;height:34px;display:block;object-fit:cover;object-position:top;"/></div>`;
      const rowM = document.createElement("div");
      rowM.style.cssText = "display:flex;align-items:center;gap:8px;";
      rowM.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;">${port(m1)}<div style="min-width:0;"><div class="aflp-po-dom-name">${_safeName(m1.name)}</div><div class="aflp-po-dom-pos">${_posLabelShort(m1.position) ?? ""}</div></div></div>
        <div style="color:rgba(200,140,90,0.85);font-size:14px;">⇄</div>
        <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;justify-content:flex-end;text-align:right;"><div style="min-width:0;"><div class="aflp-po-dom-name">${_safeName(m2.name)}</div><div class="aflp-po-dom-pos">${_posLabelShort(m2.position) ?? ""}</div></div>${port(m2)}</div>`;
      block.appendChild(rowM);
    } else {
      const r = group.receiver;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;";
      row.innerHTML = `
        <div style="width:40px;height:40px;border-radius:4px;overflow:hidden;border:1px solid rgba(200,50,80,0.5);box-shadow:${_classicIsOwnPc(r) ? "0 0 0 2px #6fd3ff" : "none"};flex-shrink:0;"><img src="${r.img}" style="width:40px;height:40px;display:block;object-fit:cover;object-position:top;"/></div>
        <div class="aflp-po-bottom-name" style="font-size:11px;flex-shrink:0;">${_safeName(r.name)}</div>
        ${_classicCascade(group.perfs)}`;
      block.appendChild(row);
      const names = group.perfs.map(p => _safeName(p.name)).join(", ");
      const take = document.createElement("div");
      take.style.cssText = "font-size:9px;color:rgba(180,110,125,0.8);font-style:italic;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;";
      take.textContent = `taking it from ${names}`;
      take.title = names;
      block.appendChild(take);
    }
    wrap.appendChild(block);
  }

  // -----------------------------------------------
  // Dossier File portrait renderer
  // -----------------------------------------------
  function _refreshPortraits_Dossier(card, scene) {
    const wrap = card.querySelector(".aflp-card-portraits");
    if (!wrap) return;
    wrap.innerHTML = "";

    const FLAG = AFLP.FLAG_SCOPE;
    const safePron = { subject:"they", object:"them", possessive:"their", reflexive:"themselves" };
    const posLabel = posId => {
      if (!posId) return null;
      const DO_LABELS = {
        "vaginal":         "Pounding their pussy",
        "anal":            "Drilling their ass",
        "oral-receive":    "Fucking their face",
        "facial":          "Prepping a facial",
        "riding-vaginal":  "Riding them (pussy)",
        "riding-anal":     "Riding them (ass)",
        "oral-give":       "Riding their face",
        "fingering-pussy": "Fingering pussy",
        "fingering-anal":  "Fingering ass",
        "toy-pussy":       "Toy in pussy",
        "toy-anal":        "Toy in ass",
      };
      if (DO_LABELS[posId]) return DO_LABELS[posId];
      return AFLP.getPosition(posId)?.label?.(safePron) ?? posId;
    };

    const groups = _buildSceneGroups(scene);
    if (!groups.length) {
      _applyDragHandleTheme(_container?.querySelector("#aflp-hscene-drag-handle"), null, _sceneMode(scene), scene);
      _updateContainerWidth();
      return;
    }
    const focus = _resolveFocusGroup(scene, groups);
    const rest  = groups.filter(g => g !== focus);
    const dm    = _sceneMode(scene);
    const ALPHA = ["ALPHA","BRAVO","CHARLIE","DELTA","ECHO","FOXTROT","GOLF","HOTEL","INDIA","JULIET"];

    // Build one subject row. o: { idLabel, isTgt, stampText, stampCls, statusText,
    // recvId, coEqual }. Performers and entangled members (anything not the target)
    // get a position picker + Leave.
    const subjectRow = (participant, o) => {
      const actor = _resolveActor({ id: participant.tokenId, actorId: participant.actorId });
      const nm = _safeName(participant.name);
      const row = document.createElement("div");
      row.className = "aflp-do-subject" + (o.isTgt ? " tgt" : "");
      row.innerHTML = `
        <div class="aflp-do-port ${o.isTgt ? "tgt" : ""}" style="${_classicIsOwnPc(participant) ? "box-shadow:0 0 0 2px #6fd3ff;" : ""}"><img src="${participant.img}" alt="${nm}"/></div>
        <div class="aflp-do-info">
          <div class="aflp-do-id">${o.idLabel}</div>
          <div class="aflp-do-name ${o.isTgt ? "tgt" : ""}">${nm.toUpperCase()}</div>
          <div class="aflp-do-status">// ${o.statusText} ▌</div>
        </div>
        <div class="aflp-do-stamp ${o.stampCls}">${o.stampText}</div>
      `;
      // ARO / CUM bars
      const aro = actor?.getFlag?.(FLAG, "arousal") ?? {};
      const arCur = aro.current ?? 0, arMax = AFLP.HScene.calcArousalMax?.(actor) ?? aro.max ?? 10;
      const arPct = arMax > 0 ? Math.min(100, Math.round(arCur / arMax * 100)) : 0;
      const cum = actor?.getFlag?.(FLAG, "cum") ?? {};
      const cumCur = cum.current ?? 0, cumMax = cum.max ?? 80;
      const cumPct = cumMax > 0 ? Math.min(100, Math.round(cumCur / cumMax * 100)) : 0;
      const bd = document.createElement("div");
      bd.className = "aflp-do-bars"; bd.dataset.doBarsId = participant.tokenId;
      bd.innerHTML = `<div class="aflp-do-bar-row"><span class="aflp-do-bar-lbl">ARO</span><div class="aflp-do-bar-track"><div class="aflp-do-bar-fill aro" style="width:${arPct}%;"></div></div><span class="aflp-do-bar-val">${arCur}/${arMax}</span></div><div class="aflp-do-bar-row"><span class="aflp-do-bar-lbl cum">CUM</span><div class="aflp-do-bar-track"><div class="aflp-do-bar-fill cum" style="width:${cumPct}%;"></div></div><span class="aflp-do-bar-val">${cumCur}mL</span></div>`;
      row.querySelector(".aflp-do-info")?.appendChild(bd);
      const ce = _buildCumEdgeButtons(scene, participant.tokenId, participant.actorId ?? participant.tokenId, "block");
      if (ce) row.querySelector(".aflp-do-info")?.appendChild(ce);

      // Cumflation status pill on receivers (directed target + entangled members)
      if (o.isReceiver ?? o.isTgt) {
        _renderCumflationStatus(row.querySelector(".aflp-do-info"), actor?.getFlag?.(FLAG, "cumflation") ?? {});
      }

      if (!o.isTgt && game.user.isGM) {
        const leaveBtn = document.createElement("div");
        leaveBtn.className = "aflp-leave-btn";
        leaveBtn.textContent = "✕ Leave";
        leaveBtn.title = `Remove ${participant.name} from scene`;
        leaveBtn.addEventListener("click", e => { e.stopPropagation(); AFLP.HScene.removeParticipant(o.recvId ?? scene.id, participant.tokenId); });
        row.appendChild(leaveBtn);
      }
      if (!o.isTgt && game.user.isGM && AFLP.Settings.positionTracking) {
        row.style.cursor = "pointer";
        row.title = "Click to change position";
        row.addEventListener("click", async e => {
          if (e.target.closest(".aflp-leave-btn")) return;
          if (e.target.closest(".aflp-cumedge-row")) return;
          await AFLP.HScene._promptGroupPosition(scene, _legacyAttackerProxy(participant));
        });
      }
      return row;
    };

    const headerDiv = document.createElement("div");
    headerDiv.className = "aflp-do-subjects-header";
    headerDiv.textContent = "// SUBJECTS IN ENCOUNTER:";
    wrap.appendChild(headerDiv);

    if (focus.type === "mutual") {
      focus.members.forEach((m, i) => {
        wrap.appendChild(subjectRow(m, {
          idLabel: `SUBJECT ${ALPHA[i] ?? `UNIT-${i}`} — ENTANGLED`,
          isTgt: false, isReceiver: true, stampText: "ENTANGLED", stampCls: "dom",
          statusText: posLabel(m.position) ?? "Position: unassigned",
          recvId: null,
        }));
      });
    } else {
      const recv = focus.receiver, perfs = focus.perfs;
      wrap.appendChild(subjectRow(recv, {
        idLabel: `SUBJECT ${ALPHA[0]} — TARGET`, isTgt: true,
        stampText: dm === "dominated" ? "COMPROMISED" : "ACTIVE", stampCls: "sub",
        statusText: perfs.length === 0
          ? (dm === "dominated" ? "No dominants yet" : "No partners yet")
          : (dm === "dominated"
              ? `Being used by ${perfs.length} dominant${perfs.length === 1 ? "" : "s"}`
              : `With ${perfs.length} partner${perfs.length === 1 ? "" : "s"}`),
      }));
      perfs.forEach((p, i) => {
        wrap.appendChild(subjectRow(p, {
          idLabel: `SUBJECT ${ALPHA[i + 1] ?? `GOLF-${i}`} — ${dm === "dominated" ? "HOSTILE" : "PARTNER"}`,
          isTgt: false, stampText: dm === "dominated" ? "DOMINANT" : "PARTNER", stampCls: "dom",
          statusText: posLabel(p.position) ?? "Position: unassigned",
          recvId: recv.tokenId,
        }));
      });
    }

    if (rest.length) {
      const oh = document.createElement("div");
      oh.className = "aflp-do-subjects-header";
      oh.style.marginTop = "6px";
      oh.textContent = "// OTHER ACTIVITY ON SITE:";
      wrap.appendChild(oh);
      for (const g of rest) wrap.appendChild(_doNearbyEntry(scene, g));
    }

    _applyDragHandleTheme(_container?.querySelector("#aflp-hscene-drag-handle"), null, _sceneMode(scene), scene);
    _updateContainerWidth();

    // Live-update cum bars in the (hidden) arousal area for all participants.
    const allParts = (scene.participants ?? []).map(p => ({ id: p.tokenId, actorId: p.actorId }));
    for (const part of allParts) {
      const cumRowEl = _container?.querySelector(`.aflp-cum-row[data-cum-actor-id="${part.id}"]`);
      if (!cumRowEl) continue;
      const pActor = _resolveActor(part);
      if (!pActor) continue;
      const pCum = pActor.getFlag?.(FLAG, "cum") ?? {};
      const pCur = pCum.current ?? 0, pMax = pCum.max ?? 80;
      const pPct = pMax > 0 ? Math.min(100, Math.round((pCur / pMax) * 100)) : 0;
      const pFill = cumRowEl.querySelector(".aflp-cum-fill");
      const pVal  = cumRowEl.querySelectorAll(".aflp-arousal-val")[0];
      if (pFill) pFill.style.width = pPct + "%";
      if (pVal)  pVal.textContent = pCur + " mL";
    }
  }

  // Compact view-only "other activity" entry for Dossier, with a ⤒ Focus stamp.
  function _doNearbyEntry(scene, group) {
    const row = document.createElement("div");
    row.className = "aflp-do-subject";
    row.style.opacity = "0.92";
    const ready = _classicGroupHasReady(scene, group);

    let portImg, idLabel, nameText, statusText;
    if (group.type === "mutual") {
      const [m1, m2] = group.members;
      portImg = m1.img;
      idLabel = "SURVEILLANCE — ENTANGLED";
      nameText = `${_safeName(m1.name).toUpperCase()} ⇄ ${_safeName(m2.name).toUpperCase()}`;
      statusText = "Mutual engagement";
    } else {
      const r = group.receiver;
      portImg = r.img;
      idLabel = "SURVEILLANCE — TARGET";
      nameText = _safeName(r.name).toUpperCase();
      statusText = `With ${group.perfs.length} subject${group.perfs.length === 1 ? "" : "s"}`;
    }
    row.innerHTML = `
      <div class="aflp-do-port"><img src="${portImg}"/></div>
      <div class="aflp-do-info">
        <div class="aflp-do-id">${idLabel}${ready ? ` <span style="color:rgba(200,80,80,0.9);">● READY</span>` : ""}</div>
        <div class="aflp-do-name">${nameText}</div>
        <div class="aflp-do-status">// ${statusText} ▌</div>
      </div>
    `;
    const fb = document.createElement("div");
    fb.className = "aflp-do-stamp dom";
    fb.style.cursor = "pointer";
    fb.textContent = "⤒ FOCUS";
    fb.title = "Focus this on your card";
    fb.addEventListener("click", e => {
      e.stopPropagation();
      _setFocusPin(scene.id, group.id);
      const c = _cardFor(scene);
      if (c) _refreshPortraits(c, scene);
    });
    row.appendChild(fb);
    return row;
  }

  // ─── Fuck a Mon' theme CSS ──────────────────────────────────────────────
  function _fuckamonCSS() {
    return `
      .aflp-theme-fuckamons { font-family: inherit; }
      .aflp-theme-fuckamons .aflp-card-theme-select,
      .aflp-theme-fuckamons .aflp-card-arousal-select {
        background: rgba(220,20,60,0.7); color: #fff; border-color: #f5e642;
      }
      .aflp-theme-fuckamons .aflp-card-header {
        background: linear-gradient(180deg, rgba(220,20,60,0.95) 0%, rgba(180,10,50,0.98) 100%);
        border-bottom: 3px solid #f5e642;
        padding: 0;
      }
      .aflp-theme-fuckamons .aflp-card-header-top {
        background: transparent; border-bottom: 1px solid rgba(245,230,66,0.4);
      }
      .aflp-theme-fuckamons .aflp-card-btn {
        background: rgba(245,230,66,0.15); color: #f5e642; border-color: rgba(245,230,66,0.5);
      }
      .aflp-theme-fuckamons .aflp-card-btn:hover { background: rgba(245,230,66,0.3); }
      .aflp-theme-fuckamons .aflp-card-portraits {
        padding: 0; flex-direction: column; align-items: stretch; justify-content: flex-start;
      }
      /* battle screen layout */
      .aflp-fm-battlefield {
        background: linear-gradient(180deg, #4fc3f7 0%, #81d4fa 40%, #a5d6a7 40%, #66bb6a 60%, #388e3c 100%);
        height: 152px; position: relative; overflow: hidden;
        border-bottom: 3px solid #f5e642; flex-shrink: 0;
      }
      /* Target (wild mon) Cum/Edge strip — sits between battlefield and party */
      .aflp-fm-target-cumedge {
        background: rgba(20,20,80,0.92); padding: 6px 10px 4px;
        border-bottom: 1px solid #3f51b5;
      }
      .aflp-fm-tagline {
        position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
        font-size: 9px; font-weight: bold; color: #fff; text-shadow: 1px 1px 0 #c00;
        white-space: nowrap; letter-spacing: 0.12em; text-transform: uppercase;
        background: rgba(220,20,60,0.7); padding: 1px 8px; border-radius: 2px;
        border: 1px solid #f5e642;
      }
      .aflp-fm-mon-zone {
        position: absolute; top: 20px; right: 10px; width: 76px;
        display: flex; flex-direction: column; align-items: center;
      }
      .aflp-fm-mon-portrait {
        width: 72px; height: 72px; border-radius: 50%;
        border: 3px solid #f5e642; object-fit: cover; object-position: top;
        display: block; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.6));
        flex-shrink: 0;
      }
      .aflp-fm-mon-label {
        font-size: 9px; font-weight: bold; color: #fff; text-shadow: 1px 1px 0 #000;
        margin-top: 2px; text-transform: uppercase; text-align: center;
        max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .aflp-fm-wild-text {
        position: absolute; top: 28px; left: 10px; width: 100px;
        font-size: 11px; font-weight: bold; color: #fff;
        text-shadow: 1px 1px 0 #000; line-height: 1.5;
      }
      .aflp-fm-hp-box {
        position: absolute; bottom: 6px; left: 8px; right: 90px;
        background: rgba(0,0,0,0.6); border: 2px solid #f5e642;
        border-radius: 4px; padding: 3px 8px;
      }
      .aflp-fm-hp-label { font-size: 9px; color: #f5e642; font-weight: bold; }
      .aflp-fm-hp-track { background: #333; height: 8px; border-radius: 3px; margin: 2px 0; overflow: hidden; }
      .aflp-fm-hp-fill  { height: 100%; border-radius: 3px; transition: width 0.4s; }
      .aflp-fm-hp-fill.high   { background: linear-gradient(90deg, #4caf50, #66bb6a); }
      .aflp-fm-hp-fill.mid    { background: linear-gradient(90deg, #ffc107, #ffca28); }
      .aflp-fm-hp-fill.low    { background: linear-gradient(90deg, #f44336, #ef5350); }

      /* party panel */
      .aflp-fm-party {
        background: rgba(20,20,80,0.92); border-top: 2px solid #3f51b5;
        padding: 6px 10px; display: flex; flex-direction: column; gap: 4px;
        overflow-y: auto; max-height: 180px;
      }
      .aflp-fm-party-header {
        font-size: 9px; color: #90caf9; font-weight: bold;
        letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 2px;
      }
      .aflp-fm-trainer-row {
        display: flex; align-items: center; gap: 6px; cursor: pointer;
        background: rgba(63,81,181,0.2); border: 1px solid rgba(63,81,181,0.4);
        border-radius: 3px; padding: 3px 6px; flex-shrink: 0;
      }
      .aflp-fm-trainer-row:hover { background: rgba(63,81,181,0.4); }
      .aflp-fm-trainer-port {
        width: 28px; height: 28px; border-radius: 50%;
        border: 1px solid #90caf9; object-fit: cover; object-position: top;
        flex-shrink: 0; display: block;
      }
      .aflp-fm-trainer-name { font-size: 11px; color: #e3f2fd; font-weight: bold; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .aflp-fm-trainer-move {
        font-size: 9px; color: #f5e642; font-style: italic;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px; flex-shrink: 0;
      }
      .aflp-fm-cock-badge {
        font-size: 9px; color: #f5e642; border: 1px solid rgba(245,230,66,0.6);
        background: rgba(245,230,66,0.12); border-radius: 2px; padding: 0 3px; flex-shrink: 0;
      }
      }
      .aflp-fm-leave-btn {
        font-size: 9px; color: #ef9a9a; cursor: pointer; border: 1px solid rgba(239,154,154,0.4);
        background: transparent; border-radius: 2px; padding: 1px 4px; margin-left: 2px;
      }
      .aflp-fm-leave-btn:hover { background: rgba(239,154,154,0.2); }
      .aflp-fm-stat-bars { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; margin-left:2px; }
      .aflp-fm-stat-row { display:flex; align-items:center; gap:3px; }
      .aflp-fm-stat-lbl { font-size:7px; font-weight:bold; color:rgba(245,230,66,0.6); width:20px; flex-shrink:0; }
      .aflp-fm-stat-lbl.aro { color:rgba(239,83,80,0.7); }
      .aflp-fm-stat-track { flex:1; height:4px; background:rgba(0,0,0,0.4); border-radius:2px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); }
      .aflp-fm-stat-fill { height:100%; border-radius:2px; transition:width 0.3s; }
      .aflp-fm-stat-fill.cum { background:linear-gradient(90deg,#6a1b9a,#ab47bc); }
      .aflp-fm-stat-fill.aro { background:linear-gradient(90deg,#b71c1c,#ef5350); }
      /* balanced model: trainer battle (mutual) + elsewhere-on-the-field (nearby) */
      .aflp-fm-vs { position:absolute; top:64px; left:50%; transform:translate(-50%,-50%); font-size:22px; font-weight:900; color:#fff; text-shadow:2px 2px 0 #c00,-1px -1px 0 #c00; z-index:3; }
      .aflp-fm-near-combat { position:absolute; bottom:8px; left:14px; display:flex; flex-direction:column; align-items:center; width:80px; }
      .aflp-fm-nearby { background:rgba(20,20,80,0.92); border:1px solid #3f51b5; border-radius:4px; padding:5px 8px; }
      .aflp-fm-nearby + .aflp-fm-nearby { margin-top:3px; }
      .aflp-fm-nearby-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
      .aflp-fm-nearby-title { font-size:9px; color:#90caf9; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; }
      .aflp-fm-nearby-row { display:flex; align-items:center; gap:8px; }
      .aflp-fm-nearby-take { font-size:9px; color:#aab8e8; font-style:italic; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
      .aflp-fm-focus-btn { display:inline-flex; align-items:center; gap:3px; font-size:8px; letter-spacing:0.08em; text-transform:uppercase; color:#f5e642; border:1px solid rgba(245,230,66,0.5); background:rgba(245,230,66,0.12); border-radius:3px; padding:1px 6px; cursor:pointer; }
      /* hole chips in fuckamon theme */
      .aflp-theme-fuckamons .aflp-po-hole {
        font-size: 9px; border-radius: 2px; padding: 1px 4px; margin: 0 2px;
        border: 1px solid; cursor: default;
      }
      .aflp-theme-fuckamons .aflp-po-hole.filled {
        background: rgba(245,230,66,0.2); color: #f5e642; border-color: #f5e642;
      }
      .aflp-theme-fuckamons .aflp-po-hole.empty {
        background: transparent; color: rgba(245,230,66,0.4); border-color: rgba(245,230,66,0.25);
      }
    `;
  }

  // ─── Fuck a Mon' portrait renderer ───────────────────────────────────────
  function _refreshPortraits_FuckaMon(card, scene) {
    const wrap = card.querySelector(".aflp-card-portraits");
    if (!wrap) return;
    wrap.innerHTML = "";

    const groups = _buildSceneGroups(scene);
    if (!groups.length) { _updateContainerWidth(); return; }
    const focus = _resolveFocusGroup(scene, groups);
    const rest  = groups.filter(g => g !== focus);

    // Focused group is the active "battle": a wild encounter (receiver-group) or
    // a trainer battle (mutual). Everything else is "Elsewhere on the field".
    if (focus.type === "mutual") _fmTrainerBattle(card, wrap, scene, focus);
    else                         _fmWildEncounter(card, wrap, scene, focus.receiver, focus.perfs);

    if (rest.length) {
      const panel = document.createElement("div");
      panel.className = "aflp-fm-party";
      panel.style.borderTop = "2px solid #3f51b5";
      const ph = document.createElement("div");
      ph.className = "aflp-fm-party-header";
      ph.textContent = "≈ Elsewhere on the field";
      panel.appendChild(ph);
      for (const g of rest) _fmNearbyBlock(panel, scene, g);
      wrap.appendChild(panel);
    }

    _applyDragHandleTheme(_container?.querySelector("#aflp-hscene-drag-handle"), null, _sceneMode(scene), scene);
    _updateContainerWidth();
  }

  // Own-PC identity ring (cyan), consistent across themes. Box-shadow so it works
  // on circular FM portraits alongside their yellow border + drop-shadow.
  function _fmRing(participant) {
    return _classicIsOwnPc(participant)
      ? "box-shadow:0 0 0 2px #6fd3ff,0 0 8px rgba(110,210,255,0.6),2px 2px 4px rgba(0,0,0,0.6);"
      : "";
  }

  // Focused wild encounter: the receiver is the "wild mon"; the performers are the
  // "trainers in battle". Sourced from an explicit receiver + performer set (not
  // scene.target/attackers) so any focused group renders here.
  function _fmWildEncounter(card, wrap, scene, recv, perfParticipants) {
    const tgtId      = recv.tokenId;
    const tgtActorId = recv.actorId ?? recv.tokenId;
    const tgtImg     = recv.img ?? "";
    const tgtActor   = _resolveActor({ id: recv.tokenId, actorId: recv.actorId });
    const FLAG       = AFLP.FLAG_SCOPE;
    const hasPussy   = !!tgtActor?.getFlag?.(FLAG, "pussy");
    const hasCock    = !!tgtActor?.getFlag?.(FLAG, "cock");
    const tgtName    = _safeName(recv.name);
    const attackers  = (perfParticipants ?? []).map(p => _legacyAttackerProxy(p));

    // CUM gauge (HP bar)
    const cumData = tgtActor?.getFlag?.(FLAG, "cum") ?? {};
    const cumCur  = cumData.current ?? 0;
    const cumMax  = cumData.max ?? 80;
    const hpPct   = Math.max(0, Math.min(100, Math.round((cumCur / cumMax) * 100)));
    const hpClass = hpPct > 60 ? "high" : hpPct > 25 ? "mid" : "low";

    // Holes (from this receiver-group's performers only)
    const mode       = _sceneMode(scene);
    const canControl = _userCanControl(scene, mode);
    const mh         = _manualHolesFor(scene, tgtId);   // per-receiver overrides
    const allPos     = attackers.map(a => AFLP.getPosition(a.position)).filter(Boolean);
    const hasVaginal = allPos.some(p => p.hole === "vaginal");
    const hasAnal    = allPos.some(p => p.hole === "anal");
    const hasOral    = allPos.some(p => p.hole === "oral" || p.hole === "facial");
    const vagFilled  = hasPussy ? (hasVaginal || !!mh.pussy) : false;
    const analFilled = hasAnal || !!mh.ass;
    const oralFilled = hasOral || !!mh.mouth;

    const wildLines = attackers.length === 0
      ? [`A wild ${tgtName}`, `appeared!`]
      : attackers.length === 1
        ? [`${tgtName} is`, `being caught!`]
        : [`Gang bang!`, `${attackers.length} trainers!`];

    const battlefield = document.createElement("div");
    battlefield.className = "aflp-fm-battlefield";
    battlefield.innerHTML = `
      <div class="aflp-fm-tagline">Gotta Fuck 'Em All!</div>
      <div class="aflp-fm-wild-text">${wildLines[0]}<br/>${wildLines[1]}</div>
      <div class="aflp-fm-mon-zone">
        <img src="${tgtImg}" alt="${tgtName}" width="72" height="72"
             style="width:72px;height:72px;display:block;object-fit:cover;object-position:top;border-radius:50%;border:3px solid #f5e642;filter:drop-shadow(2px 2px 4px rgba(0,0,0,0.6));flex-shrink:0;${_fmRing(recv)}"/>
        <div class="aflp-fm-mon-label">${tgtName}</div>
      </div>
      <div class="aflp-fm-hp-box" id="aflp-fm-hp-${tgtId}">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span class="aflp-fm-hp-label">CUM</span>
          <span class="aflp-fm-hp-label aflp-fm-hp-val" style="color:#fff;font-weight:normal;font-size:10px;">${cumCur} / ${cumMax} mL</span>
        </div>
        <div class="aflp-fm-hp-track">
          <div class="aflp-fm-hp-fill ${hpClass}" style="width:${hpPct}%"></div>
        </div>
        <div id="aflp-fm-holes-${tgtId}" style="margin-top:3px;"></div>
      </div>
    `;
    wrap.appendChild(battlefield);

    // Wild-mon Cum/Edge: separate strip after the (overflow:hidden) battlefield.
    {
      const tce = _buildCumEdgeButtons(scene, tgtId, tgtActorId, "block");
      if (tce) {
        const tceStrip = document.createElement("div");
        tceStrip.className = "aflp-fm-target-cumedge";
        tceStrip.appendChild(tce);
        wrap.appendChild(tceStrip);
      }
    }

    // Hole chips
    const holesDiv = battlefield.querySelector(`#aflp-fm-holes-${tgtId}`);
    if (holesDiv) {
      const makeChip = (label, key, filled) => {
        const sp = document.createElement("span");
        sp.className = `aflp-po-hole ${filled ? "filled" : "empty"}`;
        sp.textContent = `${label} ${filled ? "✓" : "○"}`;
        if (canControl) {
          sp.style.cursor = "pointer";
          sp.addEventListener("click", e => {
            e.stopPropagation();
            if (!game.user.isGM) {
              game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type:"hscene-player-hole-toggle", targetId: tgtId, key });
            } else {
              const m = _manualHolesFor(scene, tgtId);
              m[key] = !m[key];
              _refreshPortraits(card, scene);
            }
          });
        }
        return sp;
      };
      if (hasPussy) holesDiv.appendChild(makeChip("PUSSY", "pussy", vagFilled));
      holesDiv.appendChild(makeChip("MOUTH", "mouth", oralFilled));
      holesDiv.appendChild(makeChip("ASS",   "ass",   analFilled));
      if (hasCock) {
        const tgtCockActive = attackers.some(a => {
          const pe = AFLP.getPosition(a.position);
          return pe && !pe.penile && (pe.hole === "vaginal" || pe.hole === "anal");
        });
        const ck = document.createElement("span");
        ck.className = `aflp-po-hole ${tgtCockActive ? "filled" : "empty"}`;
        ck.textContent = `COCK ${tgtCockActive ? "✓" : "○"}`;
        holesDiv.appendChild(ck);
      }
    }

    // Party panel (trainers = this group's performers)
    const party = document.createElement("div");
    party.className = "aflp-fm-party";
    const ph = document.createElement("div");
    ph.className = "aflp-fm-party-header";
    ph.textContent = attackers.length ? "▶ TRAINERS IN BATTLE" : "▶ NO TRAINERS YET";
    party.appendChild(ph);

    const safePron = { subject:"they", object:"them", possessive:"their", reflexive:"themselves" };
    for (const atk of attackers) {
      const atkActorFM = _resolveActor(atk);
      const atkHasCock = !!atkActorFM?.getFlag?.(FLAG, "cock");
      const posEntry   = atk.position ? AFLP.getPosition(atk.position) : null;
      const moveName   = posEntry ? (_posLabelShort(atk.position) ?? posEntry.label?.(safePron) ?? atk.position)
                                  : (attackers.length > 1 ? "+ set position" : null);
      const cockActive = atkHasCock && !!(posEntry?.penile);

      const row = document.createElement("div");
      row.className = "aflp-fm-trainer-row";
      row.dataset.trainerId = atk.id;

      const safeName = _safeName(atk.name).split(" ").slice(0,2).join(" ");
      const fmAArо   = atkActorFM?.getFlag?.(FLAG,"arousal") ?? {};
      const fmAArCur = fmAArо.current ?? 0;
      const fmAArMax = AFLP.HScene.calcArousalMax?.(atkActorFM) ?? fmAArо.max ?? 10;
      const fmAArPct = fmAArMax > 0 ? Math.min(100, Math.round(fmAArCur / fmAArMax * 100)) : 0;
      const fmACum   = atkActorFM?.getFlag?.(FLAG,"cum") ?? {};
      const fmACumCur= fmACum.current ?? 0;
      const fmACumMax= fmACum.max ?? 80;
      const fmACumPct= fmACumMax > 0 ? Math.min(100, Math.round(fmACumCur / fmACumMax * 100)) : 0;
      row.innerHTML = `
        <img src="${atk.img}" alt="${safeName}" width="28" height="28"
             style="width:28px;height:28px;display:block;object-fit:cover;object-position:top;border-radius:50%;border:1px solid #90caf9;flex-shrink:0;${_fmRing(atk)}"/>
        <span class="aflp-fm-trainer-name">${safeName}</span>
        <div class="aflp-fm-stat-bars">
          ${moveName ? `<div style="font-size:8px;color:#f5e642;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${moveName}</div>` : ""}
          <div class="aflp-fm-stat-row"><span class="aflp-fm-stat-lbl">CUM</span><div class="aflp-fm-stat-track"><div class="aflp-fm-stat-fill cum" style="width:${fmACumPct}%;"></div></div></div>
          <div class="aflp-fm-stat-row"><span class="aflp-fm-stat-lbl aro">ARO</span><div class="aflp-fm-stat-track"><div class="aflp-fm-stat-fill aro" style="width:${fmAArPct}%;"></div></div></div>
        </div>
        ${atkHasCock ? `<span class="aflp-fm-cock-badge" style="align-self:flex-start;flex-shrink:0;">COCK ${cockActive ? "✓" : "○"}</span>` : ""}
      `;

      if (canControl && AFLP.Settings.positionTracking) {
        row.title = posEntry ? (AFLP.getPositionDesc?.(atk.position) ?? "Click to change position") : "Click to set a position";
        row.addEventListener("click", async () => {
          if (!game.user.isGM) {
            game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type:"hscene-player-position-change", targetId: tgtId, atkTokenId: atk.id });
            ui.notifications.info("Position change requested, waiting for GM.");
          } else if (attackers.length === 1) {
            await AFLP.HScene._promptAndSetPosition(scene, atk, atkActorFM);
          } else {
            await AFLP.HScene._promptGroupPosition(scene, atk);
          }
        });
      }

      if (game.user.isGM) {
        const lb = document.createElement("button");
        lb.className = "aflp-fm-leave-btn";
        lb.textContent = "✕";
        lb.title = "Remove " + atk.name + " from scene";
        lb.addEventListener("click", e => { e.stopPropagation(); AFLP.HScene.removeParticipant(tgtId, atk.id); });
        row.appendChild(lb);
      }
      {
        const ace = _buildCumEdgeButtons(scene, atk.id, atk.actorId ?? atk.id, "inline");
        if (ace) row.appendChild(ace);
      }
      party.appendChild(row);
    }

    wrap.appendChild(party);
  }

  // Focused trainer battle (mutual/reversal): two co-equal combatants on the
  // field (VS), each with their own Cum/Edge. Positions for entangled sides are
  // set via SA/SS (no in-card picker for mutual sides yet, as in Classic).
  function _fmTrainerBattle(card, wrap, scene, group) {
    const [m1, m2] = group.members;
    const FLAG = AFLP.FLAG_SCOPE;
    const n1 = _safeName(m1.name), n2 = _safeName(m2.name);

    const battlefield = document.createElement("div");
    battlefield.className = "aflp-fm-battlefield";
    battlefield.innerHTML = `
      <div class="aflp-fm-tagline">Trainer Battle!</div>
      <div class="aflp-fm-mon-zone">
        <img src="${m2.img}" alt="${n2}" width="64" height="64"
             style="width:64px;height:64px;display:block;object-fit:cover;object-position:top;border-radius:50%;border:3px solid #f5e642;filter:drop-shadow(2px 2px 4px rgba(0,0,0,0.6));${_fmRing(m2)}"/>
        <div class="aflp-fm-mon-label">${n2}</div>
      </div>
      <div class="aflp-fm-vs">VS</div>
      <div class="aflp-fm-near-combat">
        <img src="${m1.img}" alt="${n1}" width="58" height="58"
             style="width:58px;height:58px;display:block;object-fit:cover;object-position:top;border-radius:50%;border:3px solid #f5e642;filter:drop-shadow(2px 2px 4px rgba(0,0,0,0.6));${_fmRing(m1)}"/>
        <div class="aflp-fm-mon-label">${n1}</div>
      </div>
    `;
    wrap.appendChild(battlefield);

    const party = document.createElement("div");
    party.className = "aflp-fm-party";
    const ph = document.createElement("div");
    ph.className = "aflp-fm-party-header";
    ph.textContent = "▶ LOCKED IN COMBAT";
    party.appendChild(ph);

    for (const m of group.members) {
      const nm = _safeName(m.name).split(" ").slice(0,2).join(" ");
      const mActor = _resolveActor({ id: m.tokenId, actorId: m.actorId });
      const hasCock = !!mActor?.getFlag?.(FLAG, "cock");
      const posStr = _posLabelShort(m.position);
      const row = document.createElement("div");
      row.className = "aflp-fm-trainer-row";
      row.innerHTML = `
        <img src="${m.img}" alt="${nm}" width="28" height="28"
             style="width:28px;height:28px;display:block;object-fit:cover;object-position:top;border-radius:50%;border:1px solid #90caf9;flex-shrink:0;${_fmRing(m)}"/>
        <span class="aflp-fm-trainer-name">${nm}</span>
        <span style="flex:1;font-size:9px;color:#f5e642;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${posStr ? posStr + " →" : ""}</span>
        ${hasCock ? `<span class="aflp-fm-cock-badge" style="flex-shrink:0;">♂</span>` : ""}
      `;
      const ce = _buildCumEdgeButtons(scene, m.tokenId, m.actorId ?? m.tokenId, "inline");
      if (ce) row.appendChild(ce);
      if (game.user.isGM) {
        const lb = document.createElement("button");
        lb.className = "aflp-fm-leave-btn";
        lb.textContent = "✕";
        lb.title = "Remove " + m.name + " from scene";
        lb.addEventListener("click", e => { e.stopPropagation(); AFLP.HScene.removeParticipant(scene.id, m.tokenId); });
        row.appendChild(lb);
      }
      if (_userCanControl(scene, _sceneMode(scene)) && AFLP.Settings.positionTracking) {
        row.style.cursor = "pointer";
        row.title = m.position ? (AFLP.getPositionDesc?.(m.position) ?? "Click to change position") : "Click to set a position";
        row.addEventListener("click", async e => {
          if (e.target.closest(".aflp-fm-leave-btn")) return;
          if (e.target.closest(".aflp-cumedge-row")) return;
          if (!game.user.isGM) {
            game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type:"hscene-player-position-change", targetId: m.partnerId ?? scene.id, atkTokenId: m.tokenId });
            ui.notifications.info("Position change requested, waiting for GM.");
          } else {
            await AFLP.HScene._promptGroupPosition(scene, _legacyAttackerProxy(m));
          }
        });
      }
      party.appendChild(row);
    }
    wrap.appendChild(party);
  }

  // Cascaded (overlapping) trainer portraits for an FM nearby block.
  function _fmCascade(perfs) {
    const CAP = 5;
    const shown = perfs.slice(0, CAP), extra = perfs.length - shown.length;
    let h = `<div style="display:flex;align-items:center;">`;
    shown.forEach((p, i) => {
      h += `<div style="width:26px;height:26px;border-radius:50%;overflow:hidden;border:1px solid #90caf9;box-shadow:-2px 0 3px rgba(0,0,0,0.5)${_classicIsOwnPc(p) ? ",0 0 0 2px #6fd3ff" : ""};${i ? "margin-left:-9px;" : ""}z-index:${20 - i};"><img src="${p.img}" style="width:26px;height:26px;display:block;object-fit:cover;object-position:top;"/></div>`;
    });
    if (extra > 0) h += `<div style="margin-left:-8px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.5);border:1px solid #90caf9;color:#90caf9;font-size:9px;font-weight:bold;display:flex;align-items:center;justify-content:center;z-index:1;">+${extra}</div>`;
    return h + `</div>`;
  }

  // View-only "elsewhere on the field" block: a glance at another encounter or
  // trainer battle, with a per-client ⤒ Focus control that promotes it.
  function _fmNearbyBlock(panel, scene, group) {
    const block = document.createElement("div");
    block.className = "aflp-fm-nearby";

    const ready = _classicGroupHasReady(scene, group);
    const head = document.createElement("div");
    head.className = "aflp-fm-nearby-head";
    const title = document.createElement("span");
    title.className = "aflp-fm-nearby-title";
    title.innerHTML = (group.type === "mutual" ? "≈ Trainer battle nearby" : "≈ Nearby encounter")
      + (ready ? ` <span style="color:#ff5070;" title="Someone here is ready to cum">● ready</span>` : "");
    const focusBtn = document.createElement("div");
    focusBtn.className = "aflp-fm-focus-btn";
    focusBtn.textContent = "⤒ Focus";
    focusBtn.title = "Focus this encounter on your card";
    focusBtn.addEventListener("click", e => {
      e.stopPropagation();
      _setFocusPin(scene.id, group.id);
      const c = _cardFor(scene);
      if (c) _refreshPortraits(c, scene);
    });
    head.appendChild(title);
    head.appendChild(focusBtn);
    block.appendChild(head);

    if (group.type === "mutual") {
      const [m1, m2] = group.members;
      const port = (p, sz) => `<img src="${p.img}" alt="${_safeName(p.name)}" style="width:${sz}px;height:${sz}px;border-radius:50%;border:1px solid #90caf9;object-fit:cover;object-position:top;flex-shrink:0;${_classicIsOwnPc(p) ? "box-shadow:0 0 0 2px #6fd3ff;" : ""}"/>`;
      const row = document.createElement("div");
      row.className = "aflp-fm-nearby-row";
      row.style.justifyContent = "center";
      row.innerHTML = `
        ${port(m1, 30)}<span class="aflp-fm-trainer-name">${_safeName(m1.name)}</span>
        <span style="color:#fff;font-weight:900;font-size:12px;">VS</span>
        <span class="aflp-fm-trainer-name">${_safeName(m2.name)}</span>${port(m2, 30)}`;
      block.appendChild(row);
    } else {
      const r = group.receiver;
      const row = document.createElement("div");
      row.className = "aflp-fm-nearby-row";
      row.innerHTML = `
        <img src="${r.img}" alt="${_safeName(r.name)}" style="width:32px;height:32px;border-radius:50%;border:2px solid #f5e642;object-fit:cover;object-position:top;flex-shrink:0;${_classicIsOwnPc(r) ? "box-shadow:0 0 0 2px #6fd3ff;" : ""}"/>
        <span class="aflp-fm-trainer-name" style="color:#fff;">Wild ${_safeName(r.name)}</span>
        ${_fmCascade(group.perfs)}`;
      block.appendChild(row);
      const names = group.perfs.map(p => _safeName(p.name)).join(", ");
      const take = document.createElement("div");
      take.className = "aflp-fm-nearby-take";
      take.textContent = `vs ${names}`;
      take.title = names;
      block.appendChild(take);
    }
    panel.appendChild(block);
  }

  // -----------------------------------------------
  // Render arousal bars
  // -----------------------------------------------
  function _refreshArousalBarsNow(card, scene) {
    const area = card.querySelector(".aflp-card-arousal-bars");
    if (!area) return;

    const isPorno = card.className.includes("aflp-theme-aflp-classic");

    // For porno theme: don't rebuild the bottom bar area (performer cards have inline bars).
    // But still run the live-update section at the bottom for cum/FM bars.
    if (!isPorno) {
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
      const _theme = AFLP.Settings.hsceneTheme ?? "aflp-classic";
      const _arousalPref = "auto"; // Each UI has its own fixed style - no user override
      const useBars = _arousalPref === "bars"
        ? true
        : _arousalPref === "pips"
          ? false
          : (_theme === "lewd-lite" || _theme === "aflp-classic"); // "auto" = theme default
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
    } // end for (participant)
    } // end if (!isPorno) - full rebuild only for non-porno themes

    // Live-update inline bars for porno and gangbang-hud themes
    if (isPorno) {
      // AFLP Classic: update cumflation status chip live
      const cfEl2 = card.querySelector(".aflp-po-cumflation-status");
      if (cfEl2 && card.querySelectorAll(".aflp-po-cumflation-status").length === 1) {
        const cfAct = _resolveActor({id:scene.targetId,actorId:scene.targetActorId});
        const cfF   = cfAct?.getFlag?.(AFLP.FLAG_SCOPE,"cumflation") ?? {};
        const cfw   = _cumflationWord(cfF);
        if (cfw) {
          const cfP = Math.round(((cfF.anal??0)+(cfF.oral??0)+(cfF.vaginal??0))/(3*8)*100);
          cfEl2.textContent = `Cumflation ${cfP}%: ${cfw.word}`;
          cfEl2.style.color = cfw.color;
          cfEl2.style.textShadow = `0 0 8px ${cfw.glow}`;
          cfEl2.style.display = "";
        } else {
          cfEl2.style.display = "none";
        }
      }
      // Gangbang HUD: update target horizontal bars
      if (card.className.includes("aflp-theme-lewd-lite")) {
        const tgtBars = card.querySelector(`#aflp-ch-tgt-${scene.targetId}`);
        if (tgtBars) {
          const chTgt = _resolveActor({id:scene.targetId,actorId:scene.targetActorId});
          const chCum = chTgt?.getFlag?.(AFLP.FLAG_SCOPE,"cum") ?? {};
          const chCumPct = (chCum.max??80) > 0 ? Math.min(100,Math.round((chCum.current??0)/(chCum.max??80)*100)) : 0;
          const chAro = chTgt?.getFlag?.(AFLP.FLAG_SCOPE,"arousal") ?? {};
          const chArCur = chAro.current ?? 0;
          const chArMax = AFLP.HScene.calcArousalMax ? AFLP.HScene.calcArousalMax(chTgt) : (chAro.max ?? 10);
          const chArPct = chArMax > 0 ? Math.min(100,Math.round(chArCur/chArMax*100)) : 0;
          const [cumFill, aroFill] = tgtBars.querySelectorAll(".aflp-ch-hbar-fill");
          if (cumFill) cumFill.style.width = chCumPct + "%";
          if (aroFill) aroFill.style.width = chArPct + "%";
        }
        // Attacker inline bars (below portrait)
        for (const atk of scene.attackers) {
          const atkCol = card.querySelector(`[data-atk-id="${atk.id}"]`);
          if (!atkCol) continue;
          const chAtk = _resolveActor(atk);
          if (!chAtk) continue;
          const chACum = chAtk.getFlag?.(AFLP.FLAG_SCOPE,"cum") ?? {};
          const chACumPct = (chACum.max??80) > 0 ? Math.min(100,Math.round((chACum.current??0)/(chACum.max??80)*100)) : 0;
          const chAAro = chAtk.getFlag?.(AFLP.FLAG_SCOPE,"arousal") ?? {};
          const chAArCur = chAAro.current ?? 0;
          const chAArMax = AFLP.HScene.calcArousalMax ? AFLP.HScene.calcArousalMax(chAtk) : (chAAro.max ?? 10);
          const chAArPct = chAArMax > 0 ? Math.min(100,Math.round(chAArCur/chAArMax*100)) : 0;
          const fills = atkCol.querySelectorAll(".aflp-ch-vbar-cum, .aflp-ch-vbar-aro");
          // bars are inline — find by gradient color
          const allFills = [...atkCol.querySelectorAll("div[style*='background:linear-gradient']")];
          const cumFill = allFills.find(d=>d.style.background?.includes("#8060a0"));
          const aroFill = allFills.find(d=>d.style.background?.includes("#c02828"));
          if (cumFill) cumFill.style.width = chACumPct + "%";
          if (aroFill) aroFill.style.width = chAArPct + "%";
        }
      }
    }
    if (isPorno) {
      for (const atk of scene.attackers) {
        const atkActor = _resolveActor(atk);
        if (!atkActor) continue;
        const col = card.querySelector(`[data-atk-id="${atk.id}"]`);
        if (!col) continue;
        const atkCumData  = atkActor.getFlag?.(AFLP.FLAG_SCOPE, "cum") ?? {};
        const atkCumCur   = atkCumData.current ?? 0;
        const atkCumMax   = atkCumData.max ?? 80;
        const atkCumPct   = atkCumMax > 0 ? Math.min(100, Math.round((atkCumCur / atkCumMax) * 100)) : 0;
        const atkArousal  = atkActor.getFlag?.(AFLP.FLAG_SCOPE, "arousal") ?? {};
        const atkArCur    = atkArousal.current ?? 0;
        const atkArMax    = AFLP.HScene.calcArousalMax ? AFLP.HScene.calcArousalMax(atkActor) : (atkArousal.max ?? 10);
        const atkArPct    = atkArMax > 0 ? Math.min(100, Math.round((atkArCur / atkArMax) * 100)) : 0;
        const fills = col.querySelectorAll(".aflp-cum-fill");
        const vals  = col.querySelectorAll(".aflp-cum-val, [style*='min-width:28px']");
        if (fills[0]) fills[0].style.width = atkCumPct + "%";
        if (fills[1]) fills[1].style.width = atkArPct + "%";
        if (vals[0])  vals[0].textContent = atkCumCur + "mL";
        if (vals[1])  vals[1].textContent = atkArCur + "/" + atkArMax;
      }
    }
    // Keep CSS-styled bar text boosted after a partial refresh. Whole-card re-boost is
    // safe here: each element's base size is stored, so this can't compound.
    try { _boostCardFonts(card, _cardFontOffset(scene)); } catch (_) {}
  }

  // -----------------------------------------------
  // Bind card button listeners
  // -----------------------------------------------
  function _bindCardListeners(card, scene) {
    // Theme selector — per-user client setting
    card.querySelector(".aflp-card-theme-select")?.addEventListener("change", e => {
      e.stopPropagation();
      const newTheme = e.target.value;
      // Always save as per-user choice
      game.settings.set(AFLP.Settings.ID, AFLP.Settings.KEYS.HSCENE_THEME, newTheme);
      // If GM changes theme, also update the appropriate GM default setting
      if (game.user.isGM) {
        const isMon = scene && (() => {
          const ta = _resolveActor({ id: scene.targetId, actorId: scene.targetActorId });
          return ta && ta.type === "npc" && !ta.hasPlayerOwner;
        })();
        const gmKey = isMon
          ? AFLP.Settings.KEYS.HSCENE_THEME_MON
          : AFLP.Settings.KEYS.HSCENE_THEME_PC;
        game.settings.set(AFLP.Settings.ID, gmKey, newTheme).catch(() => {});
      }
      // Sync all other open cards
      document.querySelectorAll(".aflp-card-theme-select").forEach(sel => {
        if (sel !== e.target) sel.value = newTheme;
      });
    });

    // Arousal style is now fixed per-theme — selector removed from UI

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

      // Unified full-scene sync (supersedes piecemeal start/add/remove relays).
      if (data.type === "hscene-sync") {
        _applySceneSync(data);
      }
      // Legacy relays kept for back-compat (our own emits now use hscene-sync).
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
        AFLP.HScene.closeScene(data.sceneId ?? data.targetId);
      }
      if (data.type === "hscene-remove-participant") {
        AFLP.HScene.removeParticipant(data.targetId, data.tokenId, true);
      }
      if (data.type === "hscene-shake") {
        AFLP.HScene.triggerShake(data.actorId);
      }
      if (data.type === "token-shake") {
        AFLP.HScene.shakeToken(data.actorId, data.level, true);
      }
      if (data.type === "hscene-arousal-refresh") {
        AFLP.HScene.refreshArousalBars(data.targetId);
      }

      // Player clicked the in-card Cum/Edge button — only the GM resolves.
      if (data.type === "hscene-resolve-cum" && _isPrimaryGM()) {
        AFLP.HScene.resolveCum(data.targetId, data.key, true);
      }
      if (data.type === "hscene-resolve-edge" && _isPrimaryGM()) {
        AFLP.HScene.resolveEdge(data.targetId, data.key, true);
      }

      // A player-run SS macro asks the GM to apply conditions and start the scene.
      // Only the GM processes this; other players ignore it.
      if (data.type === "hscene-player-ss" && _isPrimaryGM()) {
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

      // ── Player requests a hole toggle (non-GM allowed user) ─────────────
      if (data.type === "hscene-player-hole-toggle" && _isPrimaryGM()) {
        const scene = _sceneByAnyId(data.targetId);
        if (!scene) return;
        const mode = _sceneMode(scene);
        // Validate the requesting user is allowed
        // (We trust the client check for now; validation could be tightened with userId)
        const m = _manualHolesFor(scene, data.targetId);   // keyed by receiver token id
        m[data.key] = !m[data.key];
        _saveSceneState();
        const card = _cardFor(scene);
        if (card) _refreshPortraits(card, scene);
      }

      // ── Player requests a position change (non-GM allowed user) ─────────
      if (data.type === "hscene-player-position-change" && _isPrimaryGM()) {
        (async () => {
          const scene = _sceneByAnyId(data.targetId);
          if (!scene) return;
          // Resolve from participants (not just the legacy attackers view) so this
          // works for performers AND entangled members, including a lone battle
          // where one side is the projected target. The prompt is partner-aware.
          const part = scene.participants?.find(p => p.tokenId === data.atkTokenId);
          if (!part) return;
          await AFLP.HScene._promptGroupPosition(scene, _legacyAttackerProxy(part));
        })().catch(e => console.error("AFLP | hscene-player-position-change error:", e));
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

      for (const [, scene] of _scenes) {
        const isInvolved = scene.targetActorId === actorId ||
          scene.attackers.some(a => a.actorId === actorId);
        const card = _cardFor(scene);
        if (!card) continue;

        if (isInvolved) {
          card.classList.remove("minimized");
          const _dh = _container?.querySelector('#aflp-hscene-drag-handle');
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
          if (card?.dataset.airlocked) scene.airlockRounds = (scene.airlockRounds ?? 0) + 1;
        }
      }
    });

    Hooks.on("deleteToken", (tokenDoc) => {
      if (!AFLP.Settings.hsceneEnabled || !game.user.isGM) return;
      const tokenId = tokenDoc.id;
      // Check every active scene for this token (participant-aware).
      for (const scene of _scenes.values()) {
        if ((scene.participants ?? []).some(p => p.tokenId === tokenId)) {
          AFLP.HScene.removeParticipant(scene.id, tokenId);
          break; // each token can only be in one scene at a time
        }
      }
    });

    Hooks.on("deleteCombat", () => {
      if (AFLP.Settings.hsceneEnabled) AFLP.HScene.closeAll();
    });

    // Refresh H scene bars when cumflation flags change (e.g. purge macro success)
    Hooks.on("updateActor", (actor, diff) => {
      if (!AFLP.Settings.hsceneEnabled) return;

      // Refresh arousal bars when AFLP flags change. "cum" is included so the
      // cum-volume gauge updates immediately on a cum/edge resolution — without
      // it the bar stayed stale until the next unrelated flag change refreshed.
      const flags = diff?.flags?.[AFLP.FLAG_SCOPE];
      if (flags && ("cumflation" in flags || "horny" in flags || "denied" in flags || "arousal" in flags || "cum" in flags)) {
        AFLP.HScene.refreshArousalForActor(actor.id);
      }

      // Refresh all cards where this actor is a participant when HP changes.
      // If the actor reaches 0 HP, mark them dead in the card visually
      // and remove them from the scene if they're an attacker.
      const newHP = diff?.system?.attributes?.hp?.value;
      if (newHP == null) return;

      for (const [, scene] of _scenes) {
        const card = _cardFor(scene);
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
          if (game.user.isGM) {
            if (isTarget) {
              // Target dropped to 0 — close the scene entirely
              ChatMessage.create({
                content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> has been defeated. The H scene ends.</p></div>`,
                speaker: { alias: "AFLP" },
              });
              AFLP.HScene.closeScene(scene.id);
            } else if (isAttacker) {
              // Attacker dropped to 0 — remove them (participant-aware; handles
              // unpairing + close-if-no-pairing + sync inside removeParticipant).
              const p = (scene.participants ?? []).find(pp => (pp.actorId ?? pp.tokenId) === actor.id);
              if (p) AFLP.HScene.removeParticipant(scene.id, p.tokenId);
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

    // Expose theme helpers so module-settings onChange callbacks can call them
    _applyDefaultThemesToAll() { _applyDefaultThemesToAll(); },
    _resetPlayersToDefaultTheme() { _resetPlayersToDefaultTheme(); },

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
    //
    // ── PHASE 1 INVARIANT (read before the Section A rewrite) ───────────────
    // When this is rewired to build scene.participants instead of the flat
    // legacy fields, the SA/SS *target* participant MUST be pushed to
    // participants[] BEFORE the attacker. In a balanced 1v1 the projected
    // target ties on incoming-partner count (1-1) and _projectTarget falls
    // through to insertion order; target-first insertion is what makes the
    // projected legacy view reproduce the real target. See the comment block
    // on _projectTarget. Inserting attacker-first here silently flips the
    // projected target in every 1v1 and breaks the legacy renderers.
    // Current H-scene position slug for an actor (or null). Used by the voice
    // layer to pick an activity-appropriate ambient SFX. Returns the first
    // participant entry with a position across all live scenes.
    positionForActor(actorId) {
      if (!actorId) return null;
      for (const scene of _scenes.values()) {
        const p = (scene.participants ?? []).find(x => x && x.actorId === actorId && x.position);
        if (p) return p.position;
      }
      return null;
    },

    // The hole this actor is currently RECEIVING in (a partner is performing a
    // positioned act on them), or null. Used to route oral receiver VO. Looks for
    // a performer whose partner is this actor and returns that position's hole.
    receivedHoleForActor(actorId) {
      if (!actorId) return null;
      for (const scene of _scenes.values()) {
        const parts = scene.participants ?? [];
        for (const perf of parts) {
          if (!perf.position || !perf.partnerId) continue;
          const recv = parts.find(x => x.tokenId === perf.partnerId);
          if (recv && recv.actorId === actorId) {
            const hole = window.AFLP?.getPosition?.(perf.position)?.hole;
            if (hole) return hole;
          }
        }
      }
      return null;
    },

    startScene(attacker, target, fromSocket = false) {
      if (!AFLP.Settings.hsceneEnabled) return;
      _ensureContainer();
      _applyDragHandleTheme(_container?.querySelector('#aflp-hscene-drag-handle'), _container);

      // ── Resolve the ONE scene for this battlemap (create or join) ─────────
      // Unified model: there is at most one scene per battlemap. If one already
      // exists we JOIN it (ensure participants, re-point partnerId) rather than
      // spawning a second scene. This is what fixes "target SA'ing its own
      // attacker spawns a 3rd scene" and the gangbang-join path in one stroke.
      const sceneId = _battlemapId(target.tokenDoc ?? target.id);
      let scene = _scenes.get(sceneId);
      const isNew = !scene;
      if (isNew) {
        scene = { id: sceneId, participants: [], ..._freshSceneStats() };
        _defineLegacyView(scene);
        _scenes.set(sceneId, scene);
      }

      // Build participants TARGET FIRST (projection invariant — see
      // _projectTarget), then the attacker. _ensureParticipant is find-or-create
      // so re-advancing just refreshes/repoints rather than duplicating.
      const tgtActor = canvas?.tokens?.get(target.id)?.actor
                    ?? game.actors.get(target.actorId ?? target.id);
      const atkActor = canvas?.tokens?.get(attacker.id)?.actor
                    ?? game.actors.get(attacker.actorId ?? attacker.id);

      const tgtP = _ensureParticipant(scene, {
        tokenId: target.id, actorId: target.actorId ?? target.id,
        name: target.name, img: target.img, tokenDoc: target.tokenDoc ?? null,
      });
      tgtP.role = _roleFromActor(tgtActor) ?? tgtP.role;

      const isSelfScene = attacker.id === target.id;
      let atkP = null;
      if (!isSelfScene) {
        atkP = _ensureParticipant(scene, {
          tokenId: attacker.id, actorId: attacker.actorId ?? attacker.id,
          name: attacker.name, img: attacker.img, tokenDoc: attacker.tokenDoc ?? null,
        });
        atkP.role = _roleFromActor(atkActor) ?? atkP.role;
        // Pair: attacker points at this target now (an INTENTIONAL edge); the
        // target defaults to FACING the attacker if it has no current partner.
        // The facing flag distinguishes that cosmetic back-edge from a real
        // reversal (where the target later runs its own SA, clearing _facing).
        atkP.partnerId = target.id;
        atkP._facing = false;
        if (!tgtP.partnerId) { tgtP.partnerId = attacker.id; tgtP._facing = true; }
      }
      _saveSceneState();

      // ── Card: build once per battlemap; otherwise refresh in place ────────
      let card = _cardFor(scene);
      if (!card) {
        card = _buildCard(scene);
        card.style.display = "none"; // revealed after any position dialog
        _container.appendChild(card);
      } else {
        _refreshPortraits(card, scene);
        _refreshArousalBars(card, scene);
      }
      _container.style.display = "flex";

      // Reveal helper keyed by the stable scene.id (one card per battlemap).
      const _revealCard = () => { card.style.display = ""; };
      _pendingReveal.set(scene.id, _revealCard);

      const needsPositionPrompt = (
        !fromSocket && AFLP.Settings.positionTracking && game.user.isGM && !isSelfScene
      );

      // Role selection prompt - only when NEITHER actor has a role yet.
      // SS sets Dominating on the attacker before calling startScene, so this
      // won't fire for SS-initiated scenes. Skip while the SS macro is running.
      if (!fromSocket && game.user.isGM && !isSelfScene &&
          !window._aflpMacroHandlingPosition && !window._aflpSSInProgress) {
        const atkHasRole = atkActor?.items?.some(c => c.slug === "dominating" || c.slug === "submitting")
                        || atkActor?.hasCondition?.("dominating") || atkActor?.hasCondition?.("submitting");
        const tgtHasRole = tgtActor?.items?.some(c => c.slug === "dominating" || c.slug === "submitting")
                        || tgtActor?.hasCondition?.("dominating") || tgtActor?.hasCondition?.("submitting");
        if (!atkHasRole && !tgtHasRole && atkActor && tgtActor) {
          AFLP.HScene._promptRoleSelection(atkActor, tgtActor).catch(() => {});
        }
      }

      if (needsPositionPrompt && !window._aflpMacroHandlingPosition && atkP) {
        // Fetch the legacy attacker proxy so position writes reflect onto the
        // participant (atkData.position = ... -> atkP.position).
        const atkData = scene.attackers.find(a => a.id === attacker.id);
        if (atkData && atkActor) {
          AFLP.HScene._promptGroupPosition(scene, atkData)
            .catch(() => {})
            .finally(() => AFLP.HScene.revealCard(scene.id));
        } else {
          AFLP.HScene.revealCard(scene.id);
        }
      } else if (!needsPositionPrompt || fromSocket) {
        AFLP.HScene.revealCard(scene.id);
      }
      // If _aflpMacroHandlingPosition: SA macro will call revealCard after its dialog

      // Broadcast the full scene to other clients (single unified sync).
      if (!fromSocket && game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", _sceneSyncPayload(scene));
      }
    },

    // Add an attacker to the scene that contains `targetId` (the token the
    // attacker is joining against). targetId may be a battlemap scene.id or any
    // contained token id. The attacker is paired (partnerId) to that target.
    addAttacker(targetId, attacker, fromSocket = false) {
      const scene = _sceneByAnyId(targetId);
      if (!scene) return;

      // Avoid duplicate participants
      if ((scene.participants ?? []).some(p => p.tokenId === attacker.id)) return;

      // Ensure the attacker as a participant paired to the target token.
      const partnerTokenId = scene.participants?.some(p => p.tokenId === targetId)
        ? targetId
        : (scene.targetId ?? targetId); // fall back to projected target
      const atkP = _ensureParticipant(scene, {
        tokenId: attacker.id, actorId: attacker.actorId ?? attacker.id,
        name: attacker.name, img: attacker.img, tokenDoc: attacker.tokenDoc ?? null,
      });
      atkP.partnerId = partnerTokenId;
      atkP._facing = false;
      const atkActorEarly = canvas?.tokens?.get(attacker.id)?.actor
                          ?? game.actors.get(attacker.actorId ?? attacker.id);
      atkP.role = _roleFromActor(atkActorEarly) ?? atkP.role;
      _saveSceneState();

      const card = _cardFor(scene);
      if (card) {
        _refreshPortraits(card, scene); // also calls _updateContainerWidth internally
        _refreshArousalBars(card, scene);
      }

      // Prompt for position if tracking is on and this is the local GM adding
      // (not a socket relay). Skip if a macro is handling the prompt itself.
      if (!fromSocket && AFLP.Settings.positionTracking && game.user.isGM && !window._aflpMacroHandlingPosition) {
        const atkData  = scene.attackers.find(a => a.id === attacker.id); // legacy proxy -> writes reflect
        const atkActor = atkActorEarly;
        if (atkData && atkActor) {
          // New scene joiners default to Dominating unless they already have a role.
          const hasRole = atkActor.hasCondition?.("dominating") || atkActor.hasCondition?.("submitting");
          if (!hasRole) {
            try {
              const { increaseCondition } = game.pf2e?.Condition ?? {};
              if (increaseCondition) increaseCondition(atkActor, "dominating").catch(() => {});
            } catch {}
          }
          AFLP.HScene._promptGroupPosition(scene, atkData).catch(() => {});
        }
      }

      if (!fromSocket && game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", _sceneSyncPayload(scene));
      }
    },

    // Remove a single participant from the scene containing `tokenId`.
    // targetId may be a battlemap scene.id or any contained token id. Any other
    // participant whose partnerId pointed at the removed token is unpaired. The
    // scene closes when no active pairing remains (covers 1v1 either-side leave
    // and target-leaves-gangbang), matching the old close behaviour.
    // fromSocket: true when called via socket relay (skip re-broadcast).
    removeParticipant(targetId, tokenId, fromSocket = false) {
      const scene = _sceneByAnyId(targetId);
      if (!scene) return;

      const idx = (scene.participants ?? []).findIndex(p => p.tokenId === tokenId);
      if (idx === -1) return;

      // Clean up role conditions from the leaving participant (mid-scene leave;
      // closeScene handles full cleanup when the whole scene ends). Clear BOTH
      // Submitting and Dominating so a receiver who leaves does not keep
      // Submitting (which would make their next scene default to non-consensual).
      if (game.user.isGM) {
        const leaverActor = _resolveActor({ id: tokenId, actorId: scene.participants[idx].actorId });
        if (leaverActor) {
          const wasSub = !!leaverActor.items?.some(c =>
            c.slug === "submitting" ||
            (c.flags?.core?.sourceId ?? c.sourceId) === (AFLP.conditions?.["submitting"]?.uuid ?? "NOMATCH")
          );
          const slugs = wasSub
            ? ["submitting", "dominating", "grabbed", "restrained"]
            : ["submitting", "dominating"];
          for (const slug of slugs) {
            const cond = leaverActor.items?.find(c =>
              c.slug === slug ||
              (c.flags?.core?.sourceId ?? c.sourceId) === (AFLP.conditions?.[slug]?.uuid ?? "NOMATCH")
            );
            if (cond) cond.delete().catch(() => {});
          }
        }
      }

      scene.participants.splice(idx, 1);
      // Unpair anyone who pointed at the removed token.
      for (const p of scene.participants) if (p.partnerId === tokenId) p.partnerId = null;

      // Close if nothing is still paired (no active interaction remains).
      const hasActivePair = scene.participants.some(p =>
        p.partnerId && scene.participants.some(q => q.tokenId === p.partnerId));
      if (scene.participants.length === 0 || !hasActivePair) {
        if (game.user.isGM) AFLP.HScene.closeScene(scene.id);
        if (!fromSocket && game.user.isGM) {
          game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type: "hscene-close", sceneId: scene.id });
        }
        return;
      }

      // Otherwise refresh + persist + sync.
      const card = _cardFor(scene);
      if (card) {
        _refreshPortraits(card, scene);
        _refreshArousalBars(card, scene);
      }
      _saveSceneState();

      if (!fromSocket && game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", _sceneSyncPayload(scene));
      }
    },

    // Re-point a single pairing in place: make `performerTokenId` act on
    // `receiverTokenId` (intentional edge) and turn the receiver's back-edge into
    // a cosmetic facing edge, WITHOUT closing the battlemap scene. Used by the
    // Struggle/Snuggle reversal so flipping one pair in a multi-pair scene leaves
    // the others untouched. Stale positions from the old orientation are cleared
    // so the reversed pair re-prompts. Persists + syncs + refreshes.
    repointPairing(sceneId, performerTokenId, receiverTokenId) {
      const scene = _sceneByAnyId(sceneId);
      if (!scene) return;
      const perf = scene.participants?.find(p => p.tokenId === performerTokenId);
      const recv = scene.participants?.find(p => p.tokenId === receiverTokenId);
      if (!perf || !recv) return;
      perf.partnerId = receiverTokenId; perf._facing = false; // performer now acts on receiver
      recv.partnerId = performerTokenId; recv._facing = true;  // receiver merely faces performer
      perf.position = null; recv.position = null;              // orientation reversed; re-prompt
      _saveSceneState();
      const card = _cardFor(scene);
      if (card) {
        _refreshPortraits(card, scene);
        _refreshArousalBars(card, scene);
      }
      if (game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", _sceneSyncPayload(scene));
      }
    },

    // Add a prose line to the card for a given target actor
    addProse(targetId, text, type = "flavor") {
      const scene = _sceneByAnyId(targetId);
      const card = _cardFor(scene);
      if (!card) return;
      _showProse(card, text, type, scene);
    },

    // Generate and show flavour prose for an action
    generateAndShowProse(targetId, actionType, attackerActor, targetActor) {
      let position = null;
      if (actionType === "sexual-advance") {
        const scene = _sceneByAnyId(targetId);
        const parts = (scene?.participants ?? []).filter(p => p && p.actorId === attackerActor?.id && p.position);
        position = (parts.find(p => p.partnerId === targetId) ?? parts[0])?.position ?? null;
      }
      const prose = _generateProse(actionType, attackerActor, targetActor, position);
      if (prose) this.addProse(targetId, prose, "flavor");
    },

    // Exposed for external callers (e.g. SA macro for masturbation prose)
    _generateProse(type, attackerActor, targetActor, position = null) {
      return _generateProse(type, attackerActor, targetActor, position);
    },

    // Shake the portrait of a specific actor across all cards
    triggerShake(actorId, fromSocket = false) {
      if (!_container) return;
      const portraits = _container.querySelectorAll(
        `[data-actor-name]`
      );
      // Match by actor name or find via scene map
      for (const [, scene] of _scenes) {
        const card = _cardFor(scene);
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

    // Subtle cosmetic shake of the token SPRITE on the canvas (cumflation feedback).
    // Animates the visual mesh only - no document move, no DB write - and restores
    // the exact position, so a later refresh can't leave it off-center. Broadcast so
    // every client runs the wobble locally. level: base < tier < holemax < max8.
    shakeToken(actorId, level = "base", fromSocket = false) {
      const PRESET = {
        base:    { amp: 0.05, dur: 280, freq: 9  },
        tier:    { amp: 0.09, dur: 340, freq: 10 },
        holemax: { amp: 0.14, dur: 430, freq: 11 },
        max8:    { amp: 0.20, dur: 540, freq: 12 },
      };
      const p = PRESET[level] || PRESET.base;
      try {
        const ticker = canvas?.app?.ticker;
        const g = canvas?.grid?.size || 100;
        const amp = p.amp * g;
        if (ticker) for (const token of (canvas?.tokens?.placeables ?? [])) {
          if (token.actor?.id !== actorId || !token.mesh) continue;
          const mesh = token.mesh;
          // Cancel any in-flight shake on this token first so the base capture is clean.
          if (token._aflpShake) { ticker.remove(token._aflpShake.fn); mesh.position.set(token._aflpShake.bx, token._aflpShake.by); token._aflpShake = null; }
          const bx = mesh.position.x, by = mesh.position.y;
          const start = performance.now();
          const fn = () => {
            const t = (performance.now() - start) / p.dur;
            if (t >= 1) { mesh.position.set(bx, by); ticker.remove(fn); token._aflpShake = null; return; }
            const decay = 1 - t;
            const a = t * (p.dur / 1000) * p.freq * 2 * Math.PI;
            mesh.position.set(bx + Math.sin(a) * amp * decay, by + Math.sin(a * 1.7) * amp * 0.35 * decay);
          };
          token._aflpShake = { fn, bx, by };
          ticker.add(fn);
        }
      } catch (_) {}
      if (!fromSocket && game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type: "token-shake", actorId, level });
      }
    },

    // Refresh arousal bars on all cards showing this target
    refreshArousalBars(targetId, fromSocket = false) {
      const scene = _sceneByAnyId(targetId);
      if (!scene) return;
      const card = _cardFor(scene);
      if (card) {
        // All themes render arousal bars inline in the portrait rows, so a full
        // portrait refresh is what actually updates the visible bars. We also
        // call _refreshArousalBars for its live cum/FM-bar update section.
        _refreshPortraits(card, scene);
        _refreshArousalBars(card, scene);
      }

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
      // Find the scene that CONTAINS the receiving actor (one scene per
      // battlemap), not only one where they project as the legacy target.
      const scene = _sceneForToken(null, targetActorId);
      if (!scene) return;
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
        const card = _cardFor(scene);
        if (card) _refreshArousalBars(card, scene);
        break;
      }
    },

    refreshArousalForActor(actorId) {
      // All current themes render arousal bars INLINE in their portrait rows
      // (the separate .aflp-card-arousal-bars area is hidden for every theme —
      // see the display:none rule and the _skipBars list). So _refreshArousalBars
      // is effectively a no-op for them; we must do a full _refreshPortraits to
      // re-read arousal and update the visible inline bars. This is why arousal
      // (e.g. a reset on cum) wasn't visually updating in Lewd Lite et al.
      for (const [, scene] of _scenes) {
        const involved = (scene.targetActorId ?? scene.targetId) === actorId ||
          scene.attackers.some(a => (a.actorId ?? a.id) === actorId);
        if (involved) {
          const card = _cardFor(scene);
          if (card) _refreshPortraits(card, scene);
        }
      }
    },

    // ── Ready-to-Cum state ────────────────────────────────────────────────
    // When an actor reaches max arousal and the interactive flow applies,
    // _onArousalMax calls markReadyToCum instead of resolving. This records
    // the pending state on the scene, lights the in-card Cum/Edge buttons,
    // and logs an announcement. The state persists until a Cum or Edge click.
    //
    // State lives on scene.readyToCum keyed by participant key (token id, with
    // actor id fallback): { isMasturbation, tokenId, actorId }.
    markReadyToCum(actor, tokenId = null, context = {}) {
      if (!actor) return;
      // Find the scene + role for this actor (prefer the scene where they are
      // the target, since that's where they're being brought to climax).
      let found = null;
      for (const [tid, scene] of _scenes) {
        const isTarget = scene.targetId === tokenId ||
          (scene.targetActorId ?? scene.targetId) === actor.id;
        if (isTarget) { found = { scene, key: scene.targetId }; break; }
        const atk = scene.attackers.find(a =>
          a.id === tokenId || (a.actorId ?? a.id) === actor.id);
        if (atk && !found) found = { scene, key: atk.id };
      }
      if (!found) {
        // No scene (e.g. solo masturbation outside a scene): resolve normally
        // rather than stranding the actor with no UI to click.
        AFLP_Arousal._onArousalMax(actor, tokenId, { forceResolve: true });
        return;
      }
      const { scene, key } = found;
      scene.readyToCum = scene.readyToCum ?? {};
      if (scene.readyToCum[key]) return; // already pending — don't double-log
      scene.readyToCum[key] = {
        isMasturbation: !!context.isMasturbation,
        // `key` is the scene's token id for this participant (target or attacker).
        // Prefer it over the passed tokenId so resolution always has a valid
        // token to resolve the synthetic actor from (critical for unlinked mooks).
        tokenId: tokenId ?? key,
        actorId: actor.id,
      };

      const safeName = actor.name.replace(/\s*[-–—].*$/, "").trim();
      this.addProse(scene.targetId, `${safeName} is on the edge - about to cum. Click Cum to let go, or Edge to hold back.`, "action");

      const card = _cardFor(scene);
      if (card) _refreshPortraits(card, scene);
    },

    // Is a given participant key currently pending a cum decision?
    _isReadyToCum(scene, key) {
      return !!(scene?.readyToCum && scene.readyToCum[key]);
    },

    // Clear pending state for a participant key and refresh the card.
    _clearReadyToCum(scene, key) {
      if (scene?.readyToCum && scene.readyToCum[key]) {
        delete scene.readyToCum[key];
        const card = _cardFor(scene);
        if (card) _refreshPortraits(card, scene);
      }
    },

    // Resolve a pending cum via the in-card Cum button.
    // GM-only execution; non-GM clicks are routed here via socket.
    async resolveCum(targetId, key, fromSocket = false) {
      const scene = _sceneByAnyId(targetId);
      if (!scene) return;
      const pending = scene.readyToCum?.[key];
      if (!pending) return;

      if (!game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", {
          type: "hscene-resolve-cum", targetId, key,
        });
        return;
      }

      this._clearReadyToCum(scene, key);
      // Resolve token-first: for unlinked tokens the per-token synthetic actor
      // holds the real arousal/cum flags, NOT game.actors.get(actorId) (which is
      // the shared base template). _resolveActor tries the token before the
      // world actor, so linked PCs and unlinked monster mooks both resolve right.
      const actor = _resolveActor({ id: pending.tokenId, actorId: pending.actorId });
      if (!actor) return;
      await AFLP_Arousal._onArousalMax(actor, pending.tokenId, { forceResolve: true });
    },

    // Resolve a pending cum via the in-card Edge button: roll Edge directly.
    // On success the cum is cancelled; on failure the cum resolves.
    async resolveEdge(targetId, key, fromSocket = false) {
      const scene = _sceneByAnyId(targetId);
      if (!scene) return;
      const pending = scene.readyToCum?.[key];
      if (!pending) return;

      if (!game.user.isGM) {
        game.socket.emit("module.ardisfoxxs-lewd-pf2e", {
          type: "hscene-resolve-edge", targetId, key,
        });
        return;
      }

      this._clearReadyToCum(scene, key);
      // Token-first resolution (see resolveCum) so unlinked monster tokens edge
      // against their own synthetic actor, not the shared base template.
      const actor = _resolveActor({ id: pending.tokenId, actorId: pending.actorId });
      if (!actor) return;

      const edged = await AFLP.Kinks?.buttonEdge?.(actor, pending.tokenId, {
        isMasturbation: pending.isMasturbation,
      });
      if (edged) {
        // Climax held back — the denied/frustrated voice.
        window.AFLP?.Voice?.play?.("edge", actor);
      } else {
        // Edge failed — cum proceeds.
        await AFLP_Arousal._onArousalMax(actor, pending.tokenId, { forceResolve: true });
      }
    },


    // Reveal a card created hidden (used by startScene/SA after position dialog).
    // Accepts the scene.id (battlemap id) OR any contained token id.
    revealCard(targetId) {
      const scene = _sceneByAnyId(targetId);
      const revealKey = scene?.id ?? targetId;
      const fn = _pendingReveal.get(revealKey) ?? _pendingReveal.get(targetId);
      if (fn) { fn(); _pendingReveal.delete(revealKey); _pendingReveal.delete(targetId); }
      // If no pending fn (e.g. already revealed), just ensure the card is visible.
      const card = _cardFor(scene) ?? _container?.querySelector(`[data-target-id="${targetId}"]`);
      if (card) card.style.display = "";
    },

    // Rebuild portraits + arousal for a specific scene (used by theme change onChange)
    refreshScene(targetId) {
      const scene = _sceneByAnyId(targetId);
      if (!scene) return;
      const card = _cardFor(scene);
      if (!card) return;
      _refreshPortraits(card, scene);
      _refreshArousalBars(card, scene);
    },

    // Re-inject all theme CSS (called by onChange when theme changes)
    _rebuildStyle() {
      const styleEl = document.getElementById("aflp-hscene-styles-v2");
      if (styleEl) styleEl.textContent = _cardCSS() + _statusStripCSS() + _aflpClassicCSS() + _dossierCSS() + _fuckamonCSS();
    },

    async closeScene(targetId) {
      const scene = _sceneByAnyId(targetId);
      const card = _cardFor(scene);

      // Remove Dominating from all attackers and Submitting from target when scene ends.
      // Only runs on GM client to avoid duplicate writes.
      if (game.user.isGM) {
        if (scene) {
          // Unified model: one battlemap scene can hold several pairings (several
          // receivers), so role cleanup must cover EVERY participant — not just
          // the single projected target. Otherwise a non-projected receiver keeps
          // Submitting and the next scene with them wrongly defaults to noncon.
          // Remove Submitting/Dominating from everyone; only clear scene-applied
          // grabbed/restrained from the bottoms (those who had Submitting) so a
          // performer's unrelated combat conditions aren't stripped.
          const _rolesSeen = new Set();
          for (const p of scene.participants ?? []) {
            const actor = _resolveActor({ id: p.tokenId, actorId: p.actorId, tokenDoc: p.tokenDoc });
            if (!actor || _rolesSeen.has(actor.id)) continue;
            _rolesSeen.add(actor.id);
            const wasSub = !!actor.items?.some(c =>
              c.slug === "submitting" || c.sourceId === AFLP.conditions["submitting"]?.uuid
            );
            const slugs = wasSub
              ? ["submitting", "dominating", "grabbed", "restrained"]
              : ["submitting", "dominating"];
            for (const slug of slugs) {
              const cond = actor.items?.find(c =>
                c.slug === slug || c.sourceId === AFLP.conditions[slug]?.uuid
              );
              if (cond) cond.delete().catch(() => {});
            }
          }

          // Mind Break → Creature Fetish: the deleteItem hook in aflp-kinks.js fires
          // onMindBreakEndCreatureFetish when MB is eventually removed.
          // We do NOT forcibly remove MB here — it has its own duration (60 min) and
          // should persist after the scene ends until PF2e's condition system removes it.
          // The CF kink is granted when MB naturally expires via the deleteItem hook.
        }
      }

      // ── End-of-scene report ─────────────────────────────────────────────
      // Post a styled chat card summarising the scene stats for the target.
      if (game.user.isGM) {
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
            speaker: { alias: "AFLP Scene End" },
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
      _scenes.delete(scene?.id ?? targetId);
      _clearFocusPin(scene?.id ?? targetId);
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

    // Returns the scene where this actor is an ATTACKER (not where they are the target).
    // Use _getSceneWhereTarget to find scenes where an actor is the target.
    _getScene(actorId) {
      for (const scene of _scenes.values()) {
        if (scene.attackers.some(a => (a.actorId ?? a.id) === actorId)) return scene;
      }
      return null;
    },

    // Public: the unified battlemap scene CONTAINING a token (or actor), or null.
    // Battlemap-agnostic (scans participants). Preferred by the macros over the
    // legacy _getScene/_getSceneWhereTarget projection lookups.
    getSceneForToken(tokenId, actorId = null) {
      return _sceneForToken(tokenId, actorId);
    },

    // Balanced-layout helpers (also used for live verification). _buildSceneGroups
    // returns the topology groups for a scene; _resolveFocusGroup applies the
    // per-client focus rules; setFocusPin/clearFocusPin manage the client-side pin.
    _buildSceneGroups(sceneOrId) {
      const scene = (typeof sceneOrId === "string") ? _scenes.get(sceneOrId) : sceneOrId;
      return _buildSceneGroups(scene);
    },
    _resolveFocusGroup(sceneOrId) {
      const scene = (typeof sceneOrId === "string") ? _scenes.get(sceneOrId) : sceneOrId;
      return scene ? _resolveFocusGroup(scene, _buildSceneGroups(scene)) : null;
    },
    setFocusPin(sceneId, groupId) { _setFocusPin(sceneId, groupId); },
    clearFocusPin(sceneId) { _clearFocusPin(sceneId); },

    // Public: a legacy-attacker proxy for the participant with this token id, in
    // whatever scene contains it. Writes to .position reflect onto the
    // participant. Lets the SA macro set the advancing actor's position
    // regardless of whether that actor projects as target or attacker.
    participantHandle(tokenId) {
      const scene = _sceneForToken(tokenId);
      const p = scene?.participants?.find(pp => pp.tokenId === tokenId);
      return p ? _legacyAttackerProxy(p) : null;
    },

    // Public: establish a scene role ("dominating"/"submitting") on an actor
    // WITHOUT a prompt. Idempotent - no-op if the actor already has that role.
    // AFLP roles are custom items (NOT PF2e core conditions), so they are created
    // from AFLP.conditions[slug].uuid and detected by item slug; hasCondition()
    // never sees them. Used by the SA macro to default a newcomer to Dominating
    // when joining an already-controlled scene (legacy addAttacker behavior).
    async establishRole(actor, slug) {
      const live = actor?.token?.actor ?? actor;
      if (!live) return;
      if (live.items?.some(i => (i.slug ?? i.system?.slug ?? "") === slug)) return;
      try {
        const uuid = AFLP.conditions?.[slug]?.uuid;
        const doc  = uuid ? await fromUuid(uuid) : null;
        if (doc) await live.createEmbeddedDocuments("Item", [doc.toObject()]);
        else if (typeof live.increaseCondition === "function") await live.increaseCondition(slug);
      } catch (e) {
        console.warn(`AFLP | establishRole: could not apply ${slug} to ${actor?.name}:`, e.message);
      }
    },

    // Returns true if this actor is the TARGET of any active scene.
    _isSceneTarget(tokenId, actorId) {
      for (const scene of _scenes.values()) {
        if (scene.targetId === tokenId) return true;
        if (actorId && (scene.targetActorId ?? scene.targetId) === actorId) return true;
      }
      return false;
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
      _focusPins.clear();
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
        </button>
        <button type="button" data-choice="consensual" style="${btnStyle}">
          <div style="width:36px;height:36px;border-radius:3px;background:rgba(180,140,200,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">💗</div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <strong style="font-size:11px;color:rgba(180,140,200,0.9);">No one is Dominating (Consensual Sex)</strong>
            <span style="font-size:10px;color:#888;">Both participants have equal say</span>
          </div>
        </button>`;

      let resolveRole;
      const rolePromise = new Promise(r => { resolveRole = r; });

      foundry.applications.api.DialogV2.wait({
        window:   { title: "Choose Scene Roles" },
        position: { width: 320 },
        content,
        buttons: [{ action: "close", label: "✕", callback: async () => resolveRole(null) }],
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
      if (!choice || choice === "consensual") return null; // no conditions applied for consensual

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
      // Resolve the receiver from the attacker's OWN partner (not the scene's
      // projected target), so position + prose are correct in multi-pair scenes.
      const recv = _receiverParticipant(scene, atkData);
      const targetActor = recv
        ? _resolveActor({ id: recv.tokenId, actorId: recv.actorId })
        : _resolveActor({ id: scene.targetId, actorId: scene.targetActorId, tokenDoc: scene.targetTokenDoc });
      const targetName = recv?.name ?? scene.targetName;
      const targetPronouns = AFLP.getPronouns(targetActor);
      const hasCock = !!atkActor?.getFlag(AFLP.FLAG_SCOPE, "cock");

      const positionId = await AFLP.HScene._showPositionDialog(atkActor, targetActor, hasCock, targetPronouns, 1);
      if (!positionId) return; // dismissed — leave unset

      // Store on the scene's attacker object
      atkData.position = positionId;
      _saveSceneState();

      // Post to scene log (named against the attacker's actual partner)
      const posEntry = AFLP.getPosition(positionId);
      if (posEntry) {
        const prevPosition = atkData._prevPosition;
        const isChange = !!prevPosition && prevPosition !== positionId;
        const phrase = posEntry.logPhrase(atkData.name, targetName, targetPronouns);
        const logText = isChange
          ? `The actors reposition themselves... ${atkData.name} is now ${phrase}`
          : phrase;
        AFLP.HScene.addProse(scene.id, logText, "action");
        atkData._prevPosition = positionId;
        // Receiver vocalizes in response to a repositioning (new hole / new sensation).
        if (isChange && targetActor) window.AFLP?.Voice?.reactPosition?.(targetActor);
      }

      // Refresh the card so portraits + pills update
      const card = _cardFor(scene);
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
        buttons: [{ action: "skip", label: "Skip for now", callback: async () => resolvePos(null) }],
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
    // ── Unified group position picker ─────────────────────────────────────
    // Called whenever a position chip is clicked OR when an attacker joins.
    // For 1 top  → show 2p categorized position picker (Vaginal/Anal/Oral/Foreplay/Toy).
    // For 2+ tops → show group presets section at top + collapsed individual categories below.
    // newAtk: the attacker entry that just joined (null if triggered by chip click).
    async _promptGroupPosition(scene, newAtk = null) {
      // Partner-aware: operate on the receiver-GROUP of the source (newAtk) — the
      // performers sharing newAtk's partner — not every attacker in the scene.
      // This keeps separate nearby pairings on one battlemap independent.
      const recv     = _receiverParticipant(scene, newAtk);
      const recvId   = recv?.tokenId ?? scene.targetId;
      const recvName = recv?.name ?? scene.targetName;
      const tgtActor = recv
        ? _resolveActor({ id: recv.tokenId, actorId: recv.actorId })
        : _resolveActor({ id: scene.targetId, actorId: scene.targetActorId });
      const perfs    = _coPerformerParticipants(scene, recvId).map(p => _legacyAttackerProxy(p));
      const nTops    = perfs.length || 1;
      const FLAG     = AFLP.FLAG_SCOPE;

      // ── 1 top: standard 2p categorized picker ─────────────────────────
      if (nTops === 1) {
        const atk      = perfs[0] ?? newAtk;
        const atkActor = _resolveActor(atk);
        if (atkActor) await AFLP.HScene._promptAndSetPosition(scene, atk, atkActor);
        return;
      }

      // ── 2+ tops: group picker + individual categories ──────────────────
      const targetAtk   = newAtk; // may be null (chip click, no specific new attacker)
      const presets     = AFLP.getGangbangPresets?.(tgtActor, nTops) ?? [];
      const hasCock     = perfs.some(a => _resolveActor(a)?.getFlag?.(FLAG, "cock"));
      const tgtHasPussy = !!tgtActor?.getFlag?.(FLAG, "pussy");
      const tgtPronouns = AFLP.getPronouns?.(tgtActor) ?? AFLP._defaultPronouns;

      const sectionStyle = "margin-bottom:6px;";
      const headerStyle  = "display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;border-bottom:1px solid rgba(200,160,80,0.25);padding:4px 0;cursor:pointer;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(200,160,80,0.85);font-family:var(--font-primary,serif);";
      const presetBtnStyle = "display:block;width:100%;box-sizing:border-box;min-height:0;height:auto;background:rgba(200,160,80,0.08);border:1px solid rgba(200,160,80,0.4);border-radius:4px;color:#f0e8d0;cursor:pointer;font-size:12px;padding:6px 10px 8px;margin-bottom:6px;text-align:left;font-family:var(--font-primary,serif);";
      const indivBtnStyle  = "display:block;width:100%;box-sizing:border-box;min-height:0;height:auto;background:rgba(255,255,255,0.06);border:1px solid rgba(200,160,80,0.25);border-radius:4px;color:#f0e8d0;cursor:pointer;font-size:12px;padding:5px 10px 8px;margin-bottom:6px;text-align:left;font-family:var(--font-primary,serif);";

      // Group presets section (expanded by default)
      const presetBtns = presets.map(p => {
        const descHtml = p.desc ? `<span style="display:block;color:rgba(200,170,120,0.6);font-size:10px;margin-top:2px;line-height:1.35;">${p.desc}</span>` : "";
        return `<button type="button" class="aflp-gb-choice" data-preset-id="${p.id}" style="${presetBtnStyle}">
          <strong>${p.name}</strong>${descHtml}
        </button>`;
      }).join("");

      // Individual positions, grouped by hole type and collapsible
      const allowedIds = newAtk
        ? AFLP.getActorPositions?.(_resolveActor(newAtk)) ?? []
        : [...new Set(perfs.flatMap(a => AFLP.getActorPositions?.(_resolveActor(a)) ?? []))];

      const allPositions = AFLP.positions ?? [];
      const groups = { vaginal: [], anal: [], oral: [], foreplay: [] };
      for (const posId of allowedIds) {
        const entry = allPositions.find(p => p.id === posId);
        if (!entry) continue;
        const hole = entry.hole ?? entry.holeId ?? null;
        if (entry.penile && !hasCock) continue;
        if (hole === "vaginal" && !tgtHasPussy) continue;
        const label = entry.label?.(tgtPronouns) ?? posId;
        const posDesc = AFLP.getPositionDesc?.(posId);
        const descHtml = posDesc ? `<span style="display:block;color:rgba(200,170,120,0.55);font-size:10px;margin-top:2px;line-height:1.35;">${posDesc}</span>` : "";
        const btn = `<button type="button" class="aflp-pos-choice aflp-indiv-choice" data-pos-id="${posId}" style="${indivBtnStyle}">${label}${descHtml}</button>`;
        if (hole === "vaginal")      groups.vaginal.push(btn);
        else if (hole === "anal")    groups.anal.push(btn);
        else if (hole === "oral" || hole === "facial") groups.oral.push(btn);
        else                         groups.foreplay.push(btn);
      }

      const makeCollapsible = (id, title, buttons) => !buttons.length ? "" :
        `<div class="${sectionStyle}">
          <button type="button" class="aflp-pos-header" data-section="${id}"
            style="${headerStyle}">
            <span>${title}</span><span style="font-size:9px;">&#9658;</span>
          </button>
          <div class="aflp-pos-submenu" data-for="${id}" style="display:none;padding:4px 0;">
            ${buttons.join("")}
          </div>
        </div>`;

      // Wrap group positions in a collapsible section too
      const groupSection = `<div style="margin-bottom:6px;">
        <button type="button" class="aflp-pos-header" data-section="group-positions"
          style="${headerStyle}">
          <span>Group Positions</span><span class="aflp-pos-arrow-icon" style="font-size:9px;">&#9660;</span>
        </button>
        <div class="aflp-pos-submenu" data-for="group-positions" style="padding:4px 0;">
          ${presetBtns || '<p style="color:#666;font-size:11px;margin:4px 0;">No group positions available for this combination.</p>'}
        </div>
      </div>`;

      const indivHeader = `<div style="font-size:10px;color:#666;letter-spacing:0.08em;text-transform:uppercase;margin:8px 0 4px;">
        Individual Position${newAtk ? ` for ${newAtk.name}` : ""}
      </div>`;

      const content = `<div style="overflow-y:auto;max-height:calc(90vh - 130px);padding:2px 4px 2px 2px;">
        ${groupSection}
        ${indivHeader}
        ${makeCollapsible("vaginal", "Vaginal", groups.vaginal)}
        ${makeCollapsible("anal", "Anal", groups.anal)}
        ${makeCollapsible("oral", "Oral / Facial", groups.oral)}
        ${makeCollapsible("foreplay", "Foreplay", groups.foreplay)}
      </div>`;

      let resolved = false;
      const result = await new Promise(resolve => {
        foundry.applications.api.DialogV2.wait({
          window:   { title: nTops >= 2 ? "Group Position" : "Select Position" },
          position: { width: 360 },
          content,
          buttons: [{ action: "cancel", label: "✕ Cancel", callback: () => resolve(null) }],
          close:   () => { if (!resolved) resolve(null); },
          render(ev, dlg) {
            // Fix Foundry's window-content overflow:hidden
            const wc = dlg.element.querySelector(".window-content");
            if (wc) { wc.style.overflow = "visible"; wc.style.height = "auto"; wc.scrollTop = 0; }
            const scrollEl = dlg.element.querySelector("[style*='overflow-y:auto']");
            if (scrollEl) scrollEl.scrollTop = 0;
            // Section toggles — accordion: only one open at a time
            const toggleSection = (btn) => {
              const sectionId = btn.dataset.section;
              const thisSub   = dlg.element.querySelector(`.aflp-pos-submenu[data-for="${sectionId}"]`);
              const isOpen    = thisSub && thisSub.style.display !== "none";
              // Close all sections
              dlg.element.querySelectorAll(".aflp-pos-submenu").forEach(s => { s.style.display = "none"; });
              dlg.element.querySelectorAll(".aflp-pos-arrow-icon").forEach(a => { a.innerHTML = "&#9658;"; });
              // Open this one if it was closed
              if (!isOpen && thisSub) {
                thisSub.style.display = "";
                const arrow = btn.querySelector(".aflp-pos-arrow-icon");
                if (arrow) arrow.innerHTML = "&#9660;";
              }
            };
            dlg.element.querySelectorAll(".aflp-pos-header").forEach(btn => {
              btn.addEventListener("click", () => toggleSection(btn));
            });
            // Group preset buttons
            dlg.element.querySelectorAll(".aflp-gb-choice").forEach(btn => {
              btn.addEventListener("click", () => {
                resolved = true;
                resolve({ type: "preset", id: btn.dataset.presetId });
                dlg.close();
              });
            });
            // Individual position buttons
            dlg.element.querySelectorAll(".aflp-indiv-choice").forEach(btn => {
              btn.addEventListener("click", () => {
                resolved = true;
                resolve({ type: "individual", posId: btn.dataset.posId });
                dlg.close();
              });
            });
          },
        }, { classes: ["aflp-dialog"] });
      });

      if (!result) {
        // Cancelled: new attacker shows "+ set position" state (no position set)
        return;
      }

      if (result.type === "individual") {
        // Apply only to the new attacker (or the one whose chip was clicked)
        const targetSlot = newAtk ?? perfs.find(a => !a.position) ?? perfs[0];
        if (targetSlot) {
          const prevPos = targetSlot.position;
          targetSlot.position      = result.posId;
          targetSlot._prevPosition = result.posId;
          _saveSceneState();
          const card = _cardFor(scene);
          if (card) { _refreshPortraits(card, scene); _refreshArousalBars(card, scene); }
          const posEntry = AFLP.getPosition(result.posId);
          if (posEntry) {
            const phrase = posEntry.logPhrase?.(targetSlot.name, recvName, tgtPronouns);
            if (phrase) AFLP.HScene.addProse(recvId, phrase, "action");
          }
          // Receiver reacts to the reposition (group context -> higher intensity).
          if (prevPos && prevPos !== result.posId && tgtActor) {
            window.AFLP?.Voice?.reactPosition?.(tgtActor, { intense: true });
          }
        }
        return;
      }

      if (result.type === "preset") {
        const preset = (AFLP.gangbangPresets ?? []).find(p => p.id === result.id);
        if (!preset) return;

        // Determine slot assignment order - check if auto-assign is on
        const autoAssign = AFLP.Settings.gangbangAutoAssign ?? false;
        let slotOrder = [...perfs]; // default: in join order (this receiver-group only)

        if (!autoAssign && preset.slots.length >= 2) {
          // Show slot assignment confirmation dialog
          const confirmed = await AFLP.HScene._promptSlotAssignment(scene, preset, tgtPronouns, perfs);
          if (!confirmed) return;
          slotOrder = confirmed; // array of attacker entries in slot order
        }

        // Apply slot assignments
        let anyRepositioned = false;
        for (let i = 0; i < slotOrder.length; i++) {
          const atk  = slotOrder[i];
          // Train/Bukakke presets have only 1 slot - all attackers share it
          const slot = preset.slots.length === 1
            ? preset.slots[0]
            : (preset.slots[i] ?? preset.slots[preset.slots.length - 1]);
          if (!slot) continue;
          if (atk.position && atk.position !== slot.position) anyRepositioned = true;
          atk.position      = slot.position;
          atk._prevPosition = slot.position;
        }
        _saveSceneState();
        const card = _cardFor(scene);
        if (card) { _refreshPortraits(card, scene); _refreshArousalBars(card, scene); }
        // One coalesced higher-intensity moan for the shared receiver, regardless of
        // how many performers repositioned - prevents overlapping/piled-up moans.
        if (anyRepositioned && tgtActor) {
          window.AFLP?.Voice?.reactPosition?.(tgtActor, { intense: true });
        }

        // Chat card
        const slotDesc = slotOrder.map((atk, i) => {
          const slot = preset.slots.length === 1
            ? preset.slots[0]
            : (preset.slots[i] ?? preset.slots[preset.slots.length - 1]);
          return `<li><strong>${atk.name}</strong>: ${slot?.label ?? "free"}</li>`;
        }).join("");
        ChatMessage.create({
          content: `<div class="aflp-chat-card"><p>The actors reposition themselves... <strong>${preset.name}</strong></p><ul style="margin:4px 0 0 16px;">${slotDesc}</ul></div>`,
          speaker: { alias: "AFLP" },
        });
      }
    },

    // Show slot assignment confirmation dialog for a group preset
    // Returns array of attacker entries in slot order, or null if cancelled.
    async _promptSlotAssignment(scene, preset, tgtPronouns, perfs = null) {
      const atks = perfs ?? atks;
      if (!preset.slots.length) return [...atks];

      const nSlots = Math.min(preset.slots.length, atks.length);
      // Build a simple assignment UI: for each slot, a select of who fills it
      const atkOptions = atks.map((a, i) =>
        `<option value="${i}">${a.name}</option>`
      ).join("");

      const rows = preset.slots.slice(0, nSlots).map((slot, i) =>
        `<tr>
          <td style="padding:4px 8px;color:#c9a96e;font-size:11px;">${slot.label}</td>
          <td><select data-slot="${i}" style="width:100%;background:#1a1a2e;color:#f0e8d0;border:1px solid rgba(200,160,80,0.3);border-radius:3px;padding:4px;">
            ${atks.map((a, ai) => `<option value="${ai}" ${ai === i ? "selected" : ""}>${a.name}</option>`).join("")}
          </select></td>
        </tr>`
      ).join("");

      const content = `<div style="padding:4px 0;">
        <p style="font-size:11px;color:#aaa;margin-bottom:8px;">Assign performers to slots for <strong>${preset.name}</strong>. Any unassigned performers will share the last slot.</p>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>`;

      let resolved = false;
      return new Promise(resolve => {
        foundry.applications.api.DialogV2.wait({
          window:   { title: "Assign Slots - " + preset.name },
          position: { width: 360 },
          content,
          buttons: [
            { action: "confirm", label: "Confirm", default: true, callback: (ev, btn, dlg) => {
              const selects = dlg.element.querySelectorAll("select[data-slot]");
              const order = new Array(atks.length).fill(null);
              selects.forEach(sel => {
                const slotIdx = parseInt(sel.dataset.slot);
                const atkIdx  = parseInt(sel.value);
                order[slotIdx] = atks[atkIdx];
              });
              // Fill unassigned with remaining attackers in order
              const assigned = new Set(order.filter(Boolean).map(a => a.id));
              const remaining = atks.filter(a => !assigned.has(a.id));
              const result = [...order.filter(Boolean), ...remaining];
              resolved = true;
              resolve(result);
            }},
            { action: "cancel", label: "✕ Cancel", callback: () => resolve(null) },
          ],
          close: () => { if (!resolved) resolve(null); },
        }, { classes: ["aflp-dialog"] });
      });
    },

    async _showPositionDialog(atkActor, targetActor, hasCock, targetPronouns, topCount = 1) {
        const atkName    = atkActor?.name  ?? "Attacker";
        const tgtName    = targetActor?.name ?? "Target";
        const atkImg     = atkActor?.img   ?? "";
        const tgtImg     = targetActor?.img ?? "";

        const isSelfScene  = atkActor?.id === targetActor?.id;
        const tgtPronouns  = targetPronouns;
        const FLAG         = AFLP.FLAG_SCOPE;
        const tgtHasPussy  = !!targetActor?.getFlag(FLAG, "pussy");
        const tgtHasCock   = !!targetActor?.getFlag(FLAG, "cock");
        const atkHasPussy  = !!atkActor?.getFlag(FLAG, "pussy");
        // True if any cock is present between the two actors
        const anyCock      = hasCock || tgtHasCock || isSelfScene;

        // Auto-inject description from the position cache
        const makeBtn = (posId, label) => {
          const posDesc = AFLP.getPositionDesc?.(posId) ?? null;
          const descHtml = posDesc
            ? `<span style="display:block;color:rgba(200,170,120,0.6);font-size:10px;margin-top:2px;line-height:1.35;">${posDesc}</span>`
            : "";
          return `<button type="button" class="aflp-pos-choice" data-pos-id="${posId}"
            style="display:block;width:100%;box-sizing:border-box;min-height:0;height:auto;text-align:left;
                   background:rgba(255,255,255,0.07);border:1px solid rgba(200,160,80,0.3);
                   border-radius:4px;color:#f0e8d0;cursor:pointer;font-size:12px;
                   padding:5px 10px 8px;margin-bottom:6px;font-family:var(--font-primary,serif);"
          >${label}${descHtml}</button>`;
        };

        const makeSection = (id, title, buttons, startOpen = false) =>
          `<div class="aflp-pos-section" style="margin-bottom:6px;">
            <button type="button" class="aflp-pos-header" data-section="${id}"
              style="display:flex;align-items:center;justify-content:space-between;width:100%;
                     background:none;border:none;border-bottom:1px solid rgba(200,160,80,0.25);
                     padding:4px 0;cursor:pointer;font-size:10px;letter-spacing:0.08em;
                     text-transform:uppercase;color:rgba(200,160,80,0.85);font-family:var(--font-primary,serif);">
              <span>${title}</span><span class="aflp-pos-arrow-icon" style="font-size:9px;">${startOpen ? "&#9660;" : "&#9658;"}</span>
            </button>
            <div class="aflp-pos-submenu" data-for="${id}" style="display:${startOpen ? "" : "none"};padding:6px 0 2px;">
              ${buttons}
            </div>
          </div>`;

        // ── Build position list from registry ───────────────────────────
        // Get the positions allowed for this attacker based on their body type
        const allowedIds = AFLP.getActorPositions(atkActor);
        const allPositions = AFLP.positions ?? [];
        // topCount passed in from caller — how many tops are already in the scene

        // Groups: vaginal, anal, oral, foreplay
        const groups = { vaginal: [], anal: [], oral: [], foreplay: [] };

        for (const posId of allowedIds) {
          const entry = allPositions.find(p => p.id === posId);
          if (!entry) continue;
          // Skip positions that require multiple tops when there's only one top
          if ((entry.minTops ?? 1) > 1 && topCount < 2) continue;

          const hole = entry.hole ?? entry.holeId ?? null;
          const label = entry.label?.(tgtPronouns) ?? posId;

          // Anatomy filter: penile positions need a cock present somewhere
          if (entry.penile && !anyCock) continue;
          // Vaginal positions need a pussy target (or attacker for riding, or self-scene)
          if (hole === "vaginal" && !tgtHasPussy && !atkHasPussy && !isSelfScene) continue;

          if (hole === "vaginal")      groups.vaginal.push({ posId, label });
          else if (hole === "anal")    groups.anal.push({ posId, label });
          else if (hole === "oral" || hole === "facial") groups.oral.push({ posId, label });
          else                         groups.foreplay.push({ posId, label });
        }

        // Toy section: weapon-based, unchanged
        const heldWeapon = atkActor?.items?.find(i => i.type === "weapon" && i.system?.equipped?.carryType === "held");
        const weaponName = heldWeapon?.name ?? null;
        const _wn = weaponName?.toLowerCase() ?? "";
        const weaponPart = !weaponName ? null
          : (_wn.includes("sword") || _wn.includes("blade") || _wn.includes("dagger") || _wn.includes("knife") || _wn.includes("shiv") || _wn.includes("saber") || _wn.includes("rapier")) ? "hilt"
          : (_wn.includes("axe") || _wn.includes("ax") || _wn.includes("maul") || _wn.includes("hammer") || _wn.includes("mace") || _wn.includes("club")) ? "handle"
          : (_wn.includes("spear") || _wn.includes("staff") || _wn.includes("pole") || _wn.includes("halberd") || _wn.includes("lance")) ? "shaft"
          : (_wn.includes("bow") || _wn.includes("crossbow")) ? "grip"
          : "handle";
        const toyLabel = weaponName ? `${weaponName} (${weaponPart})` : "Toy";

        const vaginalBtns  = groups.vaginal.map(p => makeBtn(p.posId, p.label)).join("");
        const analBtns     = groups.anal.map(p => makeBtn(p.posId, p.label)).join("");
        const oralBtns     = groups.oral.map(p => makeBtn(p.posId, p.label)).join("");
        const foreplayBtns = groups.foreplay.map(p => makeBtn(p.posId, p.label)).join("");
        const toyBtns      = [
          tgtHasPussy || atkHasPussy ? makeBtn("toy-pussy", `${toyLabel} — Pussy`) : "",
          makeBtn("toy-anal", `${toyLabel} — Ass`),
        ].filter(Boolean).join("");

        const sections = [
          vaginalBtns  ? makeSection("vaginal",  "Vaginal",        vaginalBtns,  true) : "",
          analBtns     ? makeSection("anal",     "Anal",           analBtns,     false) : "",
          oralBtns     ? makeSection("oral",     "Oral / Facial",  oralBtns,     false) : "",
          foreplayBtns ? makeSection("foreplay", "Foreplay",       foreplayBtns, false) : "",
          makeSection("toy", "Toy / Implement", toyBtns, false),
        ].join("");

        const content = `
          <div style="background:rgba(10,8,6,0.6);border-radius:4px;padding:0 0 4px;max-width:320px;">
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
            <div class="aflp-pos-scroll" style="padding:0 10px 6px;overflow-y:auto;max-height:calc(80vh - 160px);">${sections}</div>
          </div>`;

        let resolvePos;
        const posPromise = new Promise(r => { resolvePos = r; });

        foundry.applications.api.DialogV2.wait({
          window:   { title: "Select Position" },
          position: { width: 340 },
          content,
          buttons: [{ action: "skip", label: "Skip for now", callback: async () => resolvePos(null) }],
          close:    async () => resolvePos(null),
          render(ev, dlg) {
            const el = dlg.element;
            // Fix Foundry's window-content overflow:hidden which blocks scrolling
            const wc = el.querySelector(".window-content");
            if (wc) {
              wc.style.overflow = "visible";
              wc.style.height   = "auto";
              wc.scrollTop = 0;
            }
            // Ensure inner scroll area starts at top
            const scrollEl = el.querySelector(".aflp-pos-scroll");
            if (scrollEl) scrollEl.scrollTop = 0;
            el.querySelectorAll(".aflp-pos-header").forEach(hdr => {
              hdr.addEventListener("click", () => {
                const id     = hdr.dataset.section;
                const sub    = el.querySelector(`.aflp-pos-submenu[data-for="${id}"]`);
                const isOpen = sub && sub.style.display !== "none";
                // Accordion: close all
                el.querySelectorAll(".aflp-pos-submenu").forEach(s => { s.style.display = "none"; });
                el.querySelectorAll(".aflp-pos-arrow-icon").forEach(a => { a.innerHTML = "&#9658;"; });
                // Open clicked if it was closed
                if (!isOpen && sub) {
                  sub.style.display = "";
                  const arrow = hdr.querySelector(".aflp-pos-arrow-icon");
                  if (arrow) arrow.innerHTML = "&#9660;";
                }
              });
            });
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
        const positionId = await AFLP.HScene._showPositionDialog(atkActor, targetActor, hasCock, targetPronouns, scene?.attackers?.length ?? 1);
        if (!positionId) return; // user cancelled — don't fire SA
        atkData.position = positionId;
        atkData._prevPosition = positionId;

        const posEntry = AFLP.getPosition(positionId);
        if (posEntry) {
          const phrase = posEntry.logPhrase(atkData.name, scene.targetName, targetPronouns);
          AFLP.HScene.addProse(scene.targetId, phrase, "action");
        }

        const card = _cardFor(scene);
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
        const atkGain    = await AFLP_Arousal.increment(atkActor,    2, "Sexual Advance (H Scene)", atkTokenId);
        const targetGain = await AFLP_Arousal.increment(targetActor, 2, "Sexual Advance (H Scene)", scene.targetId);
        await AFLP_Arousal.postSAChat(atkActor, targetActor, atkGain, targetGain);
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
      if (game.user.isGM) {
        const scene = _sceneForToken(target.id, target.actorId);
        if (scene) {
          AFLP.HScene.addProse(scene.id, `${attacker.name} begins an H scene with ${target.name}.`, "action");
        }
      }
    },
  };
})();
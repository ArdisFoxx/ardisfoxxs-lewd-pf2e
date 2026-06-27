// =============================================================================
// AFLR Carnal Dock - left-docked "Scene Actions" sidebar for the H-Scene UI.
// Adversaries (GM) expose a Use control + action selector; the targeted
// character's reaction prompt appears in-dock, owner-gated, with a GM Override.
// The prompt is a transient `carnalPrompt` flag on the target so it syncs to the
// owning player's client. Players do not write game state directly: their approach
// choice and Struggle Escape run on the GM via socketlib (executeAsGM), which also
// fixes scene-start not broadcasting from a player client. Daggerheart only.
// =============================================================================
(function () {
  window.AFLP = window.AFLP || {}; AFLP.UI = AFLP.UI || {};
  if (AFLP.UI.CarnalDock?._teardown) AFLP.UI.CarnalDock._teardown();

  const MID = "ardisfoxxs-lewd-pf2e";
  const DOCK_ID = "aflp-carnal-dock", STYLE_ID = "aflp-carnal-dock-style";
  const S = { selected: new Map(), overrideShown: new Set(), hidden: false, preScene: null };
  let dock=null, bodyObs=null, contObs=null, tbObs=null, hookA=null, hookT=null, onResize=null, rT=null, _socket=null;

  const isDH=()=>game.system?.id==="daggerheart";
  const isNPC=(a)=>window.AFLP?.system?.isNPC?.(a);
  const GM=()=>!!game.user?.isGM;
  const cont=()=>document.getElementById("aflp-hscene-container");
  const clean=(n)=>(n||"").replace(/\s*\((?:Mark a Stress|Spend a Fear|Action|Reaction|Passive)\)\s*$/i,"").trim();
  const resolveP=(p)=>p?.tokenDoc?.actor ?? canvas?.tokens?.get(p?.tokenId??p?.id)?.actor ?? game.actors.get(p?.actorId??p?.id) ?? null;
  const actorFromToken=(tokenId,actorId)=>canvas?.tokens?.get(tokenId)?.actor ?? game.actors.get(actorId) ?? null;
  const carnalActs=(a)=>(a?.items??[]).filter(i=>i.getFlag?.(MID,"carnal") && !/\(Passive\)\s*$/i.test(i.name||""));
  const esc=(s)=>(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  async function _resolveAsGM(tokenId, actorId, opts){ const a=actorFromToken(tokenId,actorId); if(!a) return false; try{ await a.unsetFlag(MID,"carnalPrompt"); }catch(e){} await window.AFLP.Carnal.resolve(a,opts); return true; }
  async function _struggleAsGM(tokenId, actorId, opts){ const a=actorFromToken(tokenId,actorId); if(!a) return false; await window.AFLP.Carnal.struggleEscape(a,opts); return true; }
  async function _rescueAsGM(rescuerTokenId, rescuerId, targetTokenId, targetId, opts){ const rescuer=actorFromToken(rescuerTokenId,rescuerId); const target=actorFromToken(targetTokenId,targetId); if(!rescuer||!target) return false; await window.AFLP.Carnal.allyIntervene(rescuer,target,opts); return true; }
  async function _pressAsGM(bullTokenId, bullId, targetTokenId, targetId, opts){ const bull=actorFromToken(bullTokenId,bullId); const target=actorFromToken(targetTokenId,targetId); if(!bull||!target) return false; await window.AFLP.Carnal.actorPress(bull,{...(opts||{}),targetActor:target,targetTokenId,sourceTokenId:bullTokenId}); return true; }
  function registerSocket(){ if(_socket||!window.socketlib) return; try{ _socket=socketlib.registerModule(MID); try{_socket.register("carnalResolve",_resolveAsGM);}catch(e){} try{_socket.register("carnalStruggle",_struggleAsGM);}catch(e){} try{_socket.register("carnalRescue",_rescueAsGM);}catch(e){} try{_socket.register("carnalActorPress",_pressAsGM);}catch(e){} }catch(e){ console.error("AFLR carnal dock socket",e); } }
  Hooks.once("socketlib.ready", registerSocket);

  function injectStyle(){ if(document.getElementById(STYLE_ID)) return; const st=document.createElement("style"); st.id=STYLE_ID; st.textContent=`
    #${DOCK_ID}{position:fixed;z-index:99;width:248px;display:none;overflow:hidden;background:var(--aflr-ground,#0f0b14);border:1px solid var(--aflr-border-gold,rgba(244,183,76,0.35));border-radius:var(--aflr-radius,6px);box-shadow:var(--aflr-shadow,0 6px 28px rgba(0,0,0,0.55));font-family:var(--aflr-serif,serif);}
    #${DOCK_ID} .cd-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;background:var(--aflr-header-bg,#1c1228);border-bottom:1px solid var(--aflr-border,rgba(160,139,216,0.25));}
    #${DOCK_ID} .cd-title{color:var(--aflr-gold,#f4b74c);font-size:12px;font-weight:500;letter-spacing:.4px;}
    #${DOCK_ID} .cd-list{overflow-y:auto;}
    #${DOCK_ID} .cd-group{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#9a86d0;padding:5px 10px 2px;position:sticky;top:0;background:var(--aflr-ground,#0f0b14);}
    #${DOCK_ID} .cd-row{display:flex;align-items:center;gap:7px;padding:5px 8px;border-bottom:1px solid rgba(160,139,216,0.1);flex-wrap:wrap;}
    #${DOCK_ID} .cd-portrait{width:30px;height:30px;flex:0 0 30px;border-radius:4px;object-fit:cover;border:1px solid rgba(244,183,76,0.3);background:#000;}
    #${DOCK_ID} .cd-mid{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;}
    #${DOCK_ID} .cd-name{color:#e8def8;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    #${DOCK_ID} .cd-sub{font-size:9px;color:#8a7da8;} #${DOCK_ID} .cd-pending-tag{font-size:9px;color:#cf9;opacity:.85;}
    #${DOCK_ID} .cd-sel{width:100%;max-width:130px;font-size:10px;background:#160f20;color:#cbb8ee;border:1px solid rgba(160,139,216,0.3);border-radius:3px;padding:1px 3px;}
    #${DOCK_ID} .cd-btn{flex:0 0 auto;font-size:10px;padding:4px 9px;cursor:pointer;border-radius:3px;white-space:nowrap;border:1px solid var(--aflr-border-gold,rgba(244,183,76,0.4));background:rgba(244,183,76,0.12);color:var(--aflr-gold,#f4b74c);}
    #${DOCK_ID} .cd-btn:hover{background:rgba(244,183,76,0.25);}
    #${DOCK_ID} .cd-esc{border-color:rgba(120,160,220,0.4);background:rgba(120,160,220,0.12);color:#9cce;} #${DOCK_ID} .cd-esc:hover{background:rgba(120,160,220,0.25);}
    #${DOCK_ID} .cd-rescue{border-color:rgba(200,110,90,0.45);background:rgba(200,110,90,0.14);color:#e8a890;} #${DOCK_ID} .cd-rescue:hover{background:rgba(200,110,90,0.28);}
    #${DOCK_ID} .cd-press{border-color:rgba(200,90,180,0.5);background:rgba(200,90,180,0.16);color:#f0b0e4;} #${DOCK_ID} .cd-press:hover{background:rgba(200,90,180,0.3);}
    #${DOCK_ID} .cd-prompt{flex:1 1 100%;margin-top:5px;padding:6px;border-radius:4px;background:rgba(120,40,120,0.14);border:1px solid rgba(160,80,160,0.3);}
    #${DOCK_ID} .cd-prompt-wait{opacity:.85;} #${DOCK_ID} .cd-prompt-hd{font-size:10px;color:#d8b8e8;margin-bottom:5px;}
    #${DOCK_ID} .cd-prompt-btns{display:flex;gap:4px;flex-wrap:wrap;}
    #${DOCK_ID} .cd-pbtn{font-size:10px;padding:3px 7px;cursor:pointer;border-radius:3px;border:1px solid rgba(200,140,220,0.45);background:rgba(160,80,160,0.18);color:#e8c8f0;} #${DOCK_ID} .cd-pbtn:hover{background:rgba(160,80,160,0.35);} #${DOCK_ID} .cd-pbtn:disabled{opacity:.45;cursor:default;}
    #${DOCK_ID} .cd-obtn{font-size:10px;padding:3px 8px;cursor:pointer;border-radius:3px;border:1px solid rgba(244,183,76,0.4);background:rgba(244,183,76,0.1);color:var(--aflr-gold,#f4b74c);} #${DOCK_ID} .cd-obtn:hover{background:rgba(244,183,76,0.22);}
    #${DOCK_ID} .cd-empty{padding:12px;font-size:11px;color:#8a7da8;text-align:center;}`;
    document.head.appendChild(st); }

  function targetsFor(scene,srcPart){ if(srcPart?.partnerId){ const pp=scene.participants.find(x=>x.tokenId===srcPart.partnerId); const a=pp?resolveP(pp):canvas.tokens.get(srcPart.partnerId)?.actor; if(a) return [a]; }
    const others=(scene.participants||[]).filter(x=>x!==srcPart).map(resolveP).filter(Boolean); if(others.length) return others; return [...game.user.targets].map(t=>t.actor).filter(Boolean); }

  function promptHtml(a, tokenId){ const pend=a.getFlag(MID,"carnalPrompt"); if(!pend) return ""; let st={arousal:0,arousalMax:0,defeat:0}; try{ st=window.AFLP.Carnal.state(a)??st; }catch(e){} const cost=1+(st.defeat||0);
    const rollBtn=`<button class="cd-pbtn" data-approach="roll" data-actor-id="${a.id}" data-token-id="${tokenId}">Resist</button>`;
    const btns=`<div class="cd-prompt-btns">${rollBtn}<button class="cd-pbtn" data-approach="stress" data-actor-id="${a.id}" data-token-id="${tokenId}">Mark ${cost} Stress</button><button class="cd-pbtn" data-approach="give-in" data-actor-id="${a.id}" data-token-id="${tokenId}">Give in</button></div>`;
    if(GM()){ const shown=S.overrideShown.has(a.id); return `<div class="cd-prompt"><div class="cd-prompt-hd">${esc(pend.sourceName)} presses (DC ${pend.dc}). ${esc(a.name)} is choosing...</div>${shown?btns:`<button class="cd-obtn" data-actor-id="${a.id}">Override - choose for ${esc(a.name)}</button>`}</div>`; }
    if(a.isOwner) return `<div class="cd-prompt"><div class="cd-prompt-hd">${esc(pend.sourceName)} presses (DC ${pend.dc}) - Arousal ${st.arousal}/${st.arousalMax}</div>${btns}</div>`;
    return `<div class="cd-prompt cd-prompt-wait"><div class="cd-prompt-hd">${esc(a.name)} is choosing their approach...</div></div>`; }

  function reposition(){ if(!dock) return; const c=cont();
    if(!c){ // pre-scene: no H-Scene window to anchor to - sit beside the toolbar.
      const tb=document.getElementById("aflp-toolbar"); const w=dock.offsetWidth||248,gap=10;
      if(tb){ const tr=tb.getBoundingClientRect(); let left=tr.left-gap-w; if(left<4) left=Math.min(window.innerWidth-w-4, tr.right+gap); dock.style.left=Math.round(Math.max(4,left))+"px"; dock.style.top=Math.round(Math.max(4,tr.top))+"px"; }
      else { dock.style.left=Math.round(window.innerWidth-w-12)+"px"; dock.style.top="80px"; }
      const list=dock.querySelector(".cd-list"); if(list) list.style.maxHeight=Math.max(120,Math.min(560,window.innerHeight-120))+"px"; return; }
    const r=c.getBoundingClientRect(),w=dock.offsetWidth||248,gap=10; let left=r.left-gap-w; if(left<4){ const rt=r.right+gap; left=(rt+w<=window.innerWidth-4)?rt:Math.max(4,window.innerWidth-w-4); } dock.style.left=Math.round(left)+"px"; dock.style.top=Math.round(Math.max(4,r.top))+"px"; const list=dock.querySelector(".cd-list"); if(list) list.style.maxHeight=Math.max(120,Math.min(560,window.innerHeight-r.top-48))+"px"; }
  function syncTb(){ const b=document.querySelector('#aflp-toolbar [data-tb="carnal"]'); if(b) b.classList.toggle("active",!S.hidden && (!!(window.AFLP?.HScene?._scenes?.size) || !!S.preScene)); }

  function render(){ if(!dock) return; const HS=window.AFLP?.HScene; const c=cont(); const sceneRunning=!!(HS?._scenes?.size);
    // Players (without the GM's pre-scene pairing) still need to see their PC's
    // approach prompt pre-scene: surface any owned token that has a pending prompt.
    let promptPCs=[];
    if(!sceneRunning && !S.preScene){ promptPCs=(canvas?.tokens?.placeables??[]).filter(t=>t.actor?.isOwner && t.actor?.getFlag?.(MID,"carnalPrompt")).map(t=>({scene:null,p:{tokenId:t.id},a:t.actor})); }
    if(S.hidden||(!sceneRunning&&!S.preScene&&!promptPCs.length)){ dock.style.display="none"; syncTb(); return; }
    if(sceneRunning) S.preScene=null;              // a real scene supersedes the pre-scene pairing
    if(sceneRunning&&!c){ dock.style.display="none"; syncTb(); return; }
    const adv=[],pc=[];
    if(sceneRunning){ for(const scene of HS._scenes.values()) for(const p of (scene.participants??[])){ const a=resolveP(p); if(!a) continue; (isNPC(a)?adv:pc).push({scene,p,a,acts:carnalActs(a)}); } }
    else if(S.preScene){ const at=canvas?.tokens?.get(S.preScene.advTokenId), aa=at?.actor; if(aa) adv.push({scene:null,p:{tokenId:at.id},a:aa,acts:carnalActs(aa)}); for(const tid of S.preScene.pcTokenIds){ const tk=canvas?.tokens?.get(tid), pa=tk?.actor; if(pa) pc.push({scene:null,p:{tokenId:tk.id},a:pa,acts:carnalActs(pa)}); } if(!adv.length&&!pc.length){ dock.style.display="none"; syncTb(); return; } }
    else { pc.push(...promptPCs); }                 // player-side: just their own prompt row(s)
    const rowAdv=(r)=>{ const acts=r.acts; const def=acts.find(f=>f.getFlag?.(MID,"hSceneAction"))??acts.find(f=>f.getFlag?.(MID,"penetrates"))??acts[0]; const selId=S.selected.get(r.a.id)??def?.id??""; const opts=acts.map(f=>`<option value="${f.id}" ${f.id===selId?"selected":""}>${esc(clean(f.name))}${f.getFlag?.(MID,"penetrates")?" *":""}</option>`).join("");
      const sel=acts.length?`<select class="cd-sel" data-actor-id="${r.a.id}">${opts}</select>`:`<span class="cd-sub">no carnal actions</span>`; const useBtn=(acts.length&&GM())?`<button class="cd-btn cd-use" data-token-id="${r.p.tokenId}">Use</button>`:"";
      return `<div class="cd-row"><img class="cd-portrait" src="${esc(r.a.img||"icons/svg/mystery-man.svg")}"/><div class="cd-mid"><div class="cd-name" title="${esc(r.a.name)}">${esc(r.a.name)}</div>${sel}</div>${useBtn}</div>`; };
    const rowPc=(r)=>{ const prompt=promptHtml(r.a, r.p.tokenId); const canEsc=(GM()||r.a.isOwner)&&!!r.scene; const escBtn=canEsc?`<button class="cd-btn cd-esc" data-token-id="${r.p.tokenId}" title="On your turn: a single action to break free (Carnal Escape)">Escape</button>`:""; const rescueBtn=r.scene?`<button class="cd-btn cd-rescue" data-token-id="${r.p.tokenId}" title="Select your rescuer's token first, then click to pull this ally free (Carnal Rescue)">Rescue</button>`:""; const pressBtn=(((window.AFLP.system?.conditionValue?.(r.a,"bullified"))??0)>0&&(GM()||r.a.isOwner))?`<button class="cd-btn cd-press" data-token-id="${r.p.tokenId}" title="Bullified: target a victim token (T), then click to press a Carnal Action on them">Press</button>`:""; const sub=r.a.getFlag(MID,"carnalPrompt")?`<span class="cd-pending-tag">choosing approach</span>`:`<span class="cd-sub">character</span>`;
      return `<div class="cd-row"><img class="cd-portrait" src="${esc(r.a.img||"icons/svg/mystery-man.svg")}"/><div class="cd-mid"><div class="cd-name" title="${esc(r.a.name)}">${esc(r.a.name)}</div>${sub}</div>${escBtn}${rescueBtn}${pressBtn}${prompt}</div>`; };
    dock.innerHTML=`<div class="cd-bar"><span class="cd-title">Scene Actions</span></div><div class="cd-list">${adv.length?`<div class="cd-group">Adversaries</div>${adv.map(rowAdv).join("")}`:""}${pc.length?`<div class="cd-group">Characters</div>${pc.map(rowPc).join("")}`:""}${(!adv.length&&!pc.length)?`<div class="cd-empty">No scene actors.</div>`:""}</div>`;
    dock.style.display="block"; syncTb(); reposition(); }

  async function onClick(e){ const ob=e.target.closest(".cd-obtn"); if(ob){ S.overrideShown.add(ob.dataset.actorId); render(); return; }
    const pb=e.target.closest(".cd-pbtn"); if(pb){ const tokenId=pb.dataset.tokenId, aid=pb.dataset.actorId, approach=pb.dataset.approach; const actor=actorFromToken(tokenId,aid); if(!actor) return; if(!(GM()||actor.isOwner)){ ui.notifications.warn(`AFLR | Only ${actor.name}'s player can choose.`); return; } const pend=actor.getFlag(MID,"carnalPrompt"); if(!pend) return; let chosenTrait=null; if(approach==="roll" && !(pend.traits&&pend.traits.length)){ chosenTrait=await window.AFLP.Carnal.promptCarnalTrait?.(actor,"resist"); if(!chosenTrait) return; } pb.closest(".cd-prompt-btns").querySelectorAll("button").forEach(b=>b.disabled=true); S.overrideShown.delete(aid); const opts={approach,dc:pend.dc,sourceTokenId:pend.sourceTokenId,hsa:pend.hsa,traits:pend.traits,arousal:pend.arousal,trait:chosenTrait,escapeOffered:true};
      if(GM()){ try{ await actor.unsetFlag(MID,"carnalPrompt"); }catch(err){} await window.AFLP.Carnal.resolve(actor,opts); render(); } else if(_socket){ await _socket.executeAsGM("carnalResolve",tokenId,aid,opts); } else { ui.notifications.error("AFLR | socketlib unavailable - ask the GM to resolve."); } return; }
    const btn=e.target.closest(".cd-use, .cd-esc, .cd-rescue, .cd-press"); if(!btn) return; const HS=window.AFLP.HScene; const tokenId=btn.dataset.tokenId; let scene=null,srcPart=null; for(const sc of HS._scenes.values()){ const p=(sc.participants||[]).find(x=>x.tokenId===tokenId); if(p){scene=sc;srcPart=p;break;} }
    const srcTok=canvas.tokens.get(tokenId); const srcActor=scene?resolveP(srcPart):srcTok?.actor;
    if(btn.classList.contains("cd-esc")){ if(!scene||!srcActor){ ui.notifications.warn("AFLR | Actor left the scene."); return; } if(!(GM()||srcActor.isOwner)){ ui.notifications.warn("AFLR | Not your character."); return; } const partner=targetsFor(scene,srcPart)[0]; const etrait=await window.AFLP.Carnal.promptCarnalTrait?.(srcActor,"escape"); if(!etrait) return; const opts={dc:window.AFLP.Carnal.holdDC?.(partner)??(partner?.system?.difficulty??15),trait:etrait}; if(GM()){ await window.AFLP.Carnal.struggleEscape(srcActor,opts); } else if(_socket){ await _socket.executeAsGM("carnalStruggle",tokenId,srcActor.id,opts); } else { ui.notifications.error("AFLR | socketlib unavailable."); } return; }
    if(btn.classList.contains("cd-rescue")){ const target=srcActor; if(!scene||!target){ ui.notifications.warn("AFLR | Actor left the scene."); return; } const rTok=canvas.tokens?.controlled?.[0]; const rescuer=rTok?.actor; if(!rescuer){ ui.notifications.warn("AFLR | Select your rescuer's token first, then click Rescue."); return; } if(rescuer.id===target.id){ ui.notifications.warn("AFLR | A character can't rescue themselves - use Escape."); return; } if(!(GM()||rescuer.isOwner)){ ui.notifications.warn("AFLR | You don't own the selected rescuer."); return; } const partner=targetsFor(scene,srcPart)[0]; const pend=target.getFlag(MID,"carnalPrompt"); const dc=pend?.dc??window.AFLP.Carnal.holdDC?.(partner)??15; const trait=await window.AFLP.Carnal.promptCarnalTrait?.(rescuer,"rescue"); if(!trait) return; const opts={dc,trait,sourceTokenId:srcPart.partnerId,sourceName:partner?.name}; if(GM()){ await window.AFLP.Carnal.allyIntervene(rescuer,target,opts); render(); } else if(_socket){ await _socket.executeAsGM("carnalRescue",rTok.id,rescuer.id,tokenId,target.id,opts); } else { ui.notifications.error("AFLR | socketlib unavailable."); } return; }
    if(btn.classList.contains("cd-press")){ const bull=srcActor||canvas.tokens.get(tokenId)?.actor; if(!bull){ ui.notifications.warn("AFLR | Presser token not found."); return; } if(!(GM()||bull.isOwner)){ ui.notifications.warn("AFLR | Not your character."); return; } const tgtTok=[...(game.user?.targets??[])][0]||canvas.tokens?.controlled?.find(t=>t.id!==tokenId); if(!tgtTok){ ui.notifications.warn("AFLR | Target a victim token (press T over them) first, then click Press."); return; } const target=tgtTok.actor; if(!target||target.id===bull.id){ ui.notifications.warn("AFLR | Pick a different victim to press."); return; } const ptrait=await window.AFLP.Carnal.promptCarnalTrait?.(bull,"press"); if(!ptrait) return; const opts={trait:ptrait,deposit:false}; if(GM()){ await window.AFLP.Carnal.actorPress(bull,{...opts,targetActor:target,targetTokenId:tgtTok.id,sourceTokenId:tokenId}); render(); } else if(_socket){ await _socket.executeAsGM("carnalActorPress",tokenId,bull.id,tgtTok.id,target.id,opts); } else { ui.notifications.error("AFLR | socketlib unavailable."); } return; }
    if(!GM()){ ui.notifications.warn("AFLR | The GM drives adversary actions."); return; } if(!srcActor){ ui.notifications.warn("AFLR | Adversary token not found."); return; } const sel=btn.closest(".cd-row").querySelector(".cd-sel"); const feat=sel?.value?srcActor.items.get(sel.value):null; const dc=srcActor.system?.difficulty??15; const label=feat?`${srcActor.name}'s ${clean(feat.name)}`:srcActor.name; const hsa=!!feat?.getFlag?.(MID,"penetrates");
    let targets=[]; if(scene){ targets=targetsFor(scene,srcPart); } else if(S.preScene){ targets=S.preScene.pcTokenIds.map(id=>canvas.tokens.get(id)?.actor).filter(Boolean); } if(!targets.length){ ui.notifications.warn("AFLR | No target in the pairing."); return; }
    const inScene=!!scene; const traits=(feat?(window.AFLP.Carnal.reactionTraits?.(feat)??[]):[]); const arousal=(feat?(window.AFLP.Carnal.reactionArousal?.(feat)??1):1);
    let autoLanded=0;
    for(const t of targets){
      const submitting = !!(window.AFLP.cond?.has?.(t,"submitting")) || ((window.AFLP.system?.conditionValue?.(t,"submitting")??0)>0);
      const caught = inScene && submitting;
      if(caught){
        // Already caught in a scene with this presser - the CA auto-lands (no Resist).
        try{ await window.AFLP.Carnal.autoLand?.(t,{dc,sourceName:label,sourceTokenId:srcTok?.id??tokenId,hsa,arousal}); autoLanded++; }catch(err){ console.error("AFLR carnal auto-land",err); }
      } else {
        // Not yet caught - the press calls for a Carnal Resist.
        try{ await t.setFlag(MID,"carnalPrompt",{dc,sourceName:label,sourceTokenId:srcTok?.id??tokenId,hsa,traits,arousal,inScene,ts:Date.now()}); }catch(err){ console.error("AFLR carnal flag",err); }
      }
    }
    ui.notifications.info(`AFLR | ${label} presses ${targets.map(t=>t.name).join(", ")}${autoLanded?` (${autoLanded} caught - Carnal Press, no Resist)`:""}.`); render(); }

  async function onToolbarClick(){
    const HS=window.AFLP.HScene;
    if(HS?._scenes?.size){ S.hidden=!S.hidden; render(); return; }
    if(!GM()){ ui.notifications.info("AFLR | The GM starts scenes."); return; }
    if(S.preScene && !S.hidden){ S.hidden=true; render(); return; }   // already open - toggle closed
    // Pre-scene: capture the selected adversary + targeted character(s) as a
    // pairing and open the dock. The scene only starts when a Carnal action lands
    // (no scene, and no position prompt, on the toolbar click itself).
    const ctrl=canvas.tokens.controlled, tgts=[...game.user.targets];
    let advTok=null, pcToks=[];
    if(ctrl.length>=1&&tgts.length>=1){ advTok=ctrl.find(t=>isNPC(t.actor))??ctrl[0]; pcToks=tgts.filter(t=>t.actor&&t.id!==advTok.id); }
    else if(ctrl.length>=2){ advTok=ctrl.find(t=>isNPC(t.actor))??ctrl[0]; pcToks=ctrl.filter(t=>t.id!==advTok.id); }
    if(!advTok||!pcToks.length){ ui.notifications.warn("AFLR | Select the adversary and target the character(s), then click Scene Actions."); return; }
    S.preScene={ advTokenId:advTok.id, pcTokenIds:pcToks.map(t=>t.id) };
    S.hidden=false; render();
  }

  function ensureToolbarButton(){ const tb=document.getElementById("aflp-toolbar"); if(!tb) return; if(tb.querySelector('[data-tb="carnal"]')){ syncTb(); return; } const b=document.createElement("button"); b.type="button"; b.className="aflp-tb-btn"; b.dataset.tb="carnal"; b.title="Scene Actions"; b.innerHTML='<i class="fa-solid fa-hand"></i>'; b.addEventListener("click",onToolbarClick); const heart=tb.querySelector('[data-tb="hscene"]'); if(heart) tb.insertBefore(b,heart); else tb.appendChild(b); syncTb(); }

  function buildDock(){ if(document.getElementById(DOCK_ID)){ dock=document.getElementById(DOCK_ID); return; } dock=document.createElement("div"); dock.id=DOCK_ID; dock.addEventListener("change",(e)=>{ const s=e.target.closest(".cd-sel"); if(s) S.selected.set(s.dataset.actorId,s.value); }); dock.addEventListener("click",onClick); document.body.appendChild(dock); }

  function teardown(){ bodyObs?.disconnect(); contObs?.disconnect(); tbObs?.disconnect(); if(hookA!=null) Hooks.off("updateActor",hookA); if(hookT!=null) Hooks.off("updateToken",hookT); if(onResize) window.removeEventListener("resize",onResize); document.getElementById(DOCK_ID)?.remove(); document.querySelector('#aflp-toolbar [data-tb="carnal"]')?.remove(); dock=null; }

  function init(){ if(!isDH()) return; if(!window.AFLP?.HScene||!window.AFLP?.Carnal) return; registerSocket(); injectStyle(); buildDock();
    onResize=()=>reposition(); window.addEventListener("resize",onResize);
    const schedule=()=>{ clearTimeout(rT); rT=setTimeout(()=>{ ensureToolbarButton(); render(); },150); };
    const attachCont=()=>{ contObs?.disconnect(); const c=cont(); if(c){ contObs=new MutationObserver(schedule); contObs.observe(c,{childList:true,subtree:true}); } };
    const attachTb=()=>{ tbObs?.disconnect(); const tb=document.getElementById("aflp-toolbar"); if(tb){ tbObs=new MutationObserver(()=>ensureToolbarButton()); tbObs.observe(tb,{childList:true}); } };
    bodyObs=new MutationObserver(()=>{ attachCont(); attachTb(); schedule(); }); bodyObs.observe(document.body,{childList:true});
    hookA=Hooks.on("updateActor",(a,chg)=>{ const f=foundry.utils.getProperty(chg,`flags.${MID}`); if(f&&("carnalPrompt" in f||"-=carnalPrompt" in f)) schedule(); });
    hookT=Hooks.on("updateToken",(td,chg)=>{ if(foundry.utils.getProperty(chg,`delta.flags.${MID}`)) schedule(); });
    attachCont(); attachTb(); ensureToolbarButton(); render(); }

  AFLP.UI.CarnalDock={ render:()=>render(), reposition:()=>reposition(), toggle:()=>{ S.hidden=!S.hidden; render(); }, _teardown:teardown, _socket:()=>_socket };
  if(game?.ready) init(); else Hooks.once("ready",init);
})();

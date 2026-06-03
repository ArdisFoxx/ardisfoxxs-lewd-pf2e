Change log: 

* 1.0.0 - Initial Release
* 1.1.0 - Added Actors. Updated icons and text for all items. Added new conditions, kinks and items. Added support for bondage, ovipositor and pregnancy options.
* 1.1.1 - Added monsters, fixed typos
* 2.0.0 - AFLP Lovense Integration Release
* 2.0.1 - 2.0.6 - Updated monster token and portrait arts
* 2.0.7 - Minor Improvements
* 2.0.8 - Added Aphrodisiac Junkie kink, added Retraining (Kink) player action
* 2.0.9 - Rebalanced kinks with one debuff and one buff each. Fixed Harpy icons. Added automation to Horny condition. Added Submissive Kink and Shibari Trap spell.
* 3.0.0 - Cum System, broad updates to all monsters, kinks and monster abilities
* 3.3.0 - Item Update
* 3.3.1 - Broad updates to all systems
* 4.9.x - PF2e v7 / Foundry v13 compatibility pass. Replaced all deprecated API calls. Migrated all sheets and dialogs to AppV2. Fixed pip bar CSS, condition detection, and combat hook type mismatches.
* 5.0.0 - Major feature release. Full changelog below.
* 5.4.24 - Bimbomancer archetype (17 feats), Skyclad Idol archetype (9 feats + Star of the Show spell), Voyeurism kink, Horny (Permanent) kink, Mind Break to Creature Fetish automation, Bimbomancer feat flag automation (Stupified conversion, Paizuri Aura, daily prep decay prevention), Skyclad Engine automation, Pacifying cock automation, Creature Fetish multi-type support and badge max reduced to 6, Paizuri cumflation hole, cum/coomer audit across all 69 cock-bearing monsters, 51 new monsters
* 5.5.0 - Alcumist Archetype (9 feats, 22 items); Bimbomancer Archetype (17 feats, Bimbofied minimum 1 on daily prep); Skyclad Idol Archetype (9 feats); Armor of Hands (3 variants, Disposition system); Gangslut/Bimbo/Voyeurism kinks; Sly Snuggle feat (Stride+Diplomacy vs Will); Ouroboros feat; Pineapple Diet feat; Fertile Ground spell (Rank 3); Temporal Intimacy (Rank 9); Somnophile's Sleep (Rank 2); Lovense Setup Wizard (Direct and GIFT modes); four H Scene UI themes (Combat HUD, Status Strip, Porno Scene default, Dossier File) with per-user selector in card header; H Scene persistence across reloads; per-attacker leave buttons; manual hole toggling in Porno; end-of-scene report card (portrait, loads per hole, orgasms, damage, bondage/restrained/airlock rounds, titles earned) with configurable visibility; damage taken/dealt tracking in scenes accumulates to lifetime totals; Masochist progression (Pain Curious, Painslut, Masochist, Bliss in Agony, Suffering is Joy) and Sadist progression (Rough Lover, Dominant Striker, Sadist, Cruel Master, Apex Predator) titles; custom H scene messages editor (Module Settings, world-scoped, survives updates); 32 cumflation tier messages (per hole, per tier 1-8) with in-scene or GM-whisper delivery; titles config editor (adjustable thresholds, rename, add custom); Mind Break gain now prompts GM to choose creature type from scene attackers; Monstrous Cumistry superseded by Perfect Sample on all 22 Alcumical items; all Alcumical folder items audited for correct traits (Alchemical, Alcumical, Sexual, Aphrodisiac where applicable); Thundercharger Stallion replaces Centaur Stallion; Glammerwarg Four-Armed Ravish success/failure corrected; Basilisk renamed Partially Petrifying Gaze; Troll Breeder Regeneration 20 restored; troop Gangbang reworked to Reflex-save arousal mechanic, Troop Sex removed; cock types, coomer, and cum volume added to all monsters in Scribe PDF guide; Neela example PC builds and Orien Silvanis added to Scribe; Foundry journal guide added; cum dialog ground/vial options; Infinite Cum Volume setting; facial cumflation vision effects (Dazzled/Blinded); cumflation pips clickable; Horny world-flag permanent/temp split; Denied in arousal bar
* 6.2.1 - Struggle Snuggle reversals now flip only the escapee's own pairing and hand them control, leaving the rest of the scene intact, and the escape roll is scoped to the escapee's own captors. Manual hole marks are tracked per receiver. Various H Scene fixes: pairing/grouping now persists across reloads and to player clients, multi-GM tables no longer double-apply player actions, and the Token Configuration Appearance tab is no longer affected by the AFLP sheet tab.
* 6.2.0 - Reworked the H Scene card to track every pairing on the battlemap independently instead of grouping all participants under one target, so multiple couples, full gangbangs, and reversals display correctly at once. Your card focuses the pairing relevant to you (your own PC auto-focuses and is highlighted) while every other pairing shows as a compact Nearby block you can click to focus. Positions and flavour text are partner-aware, naming the correct partner even with several pairs active, and mutual/entangled pairs render both sides as equals with their own position pickers and controls. All five card themes (AFLP Classic, Fuck-a-Mon, Lewd Lite, Status Strip, Dossier File) were rebuilt on this system.
* 6.1.1 - H Scene cum-flow refinements. The cum hole dialog now appears only for the actor whose Cum/Edge button was clicked (single column with that actor's Mouth/Ass/Facial/On-the-ground/Into-a-Vial choices); the confusing second "partner cums into source" column is gone, so same-name partners are no longer ambiguous. When the cumming actor has a known penile position, the hole is taken from it automatically with no dialog, including cock-on-cock pairings (previously the dialog always appeared when both partners had cocks). The auto-cum flow no longer changes the GM's on-screen token selection or targets: the cummer and partner are handed to the cum macro internally, so your selection stays where you left it (the macro still falls back to selected/targeted tokens for manual runs).
* 6.1.0 - H Scene engine rearchitecture (Phase 1). Unified to ONE scene per battlemap (keyed by scene id) holding a flat participant list, where each participant tracks its current partner, position, and role. Pairings derive from each actor's latest Sexual Advance / Struggle Snuggle, so multiple independent pairs on one map are tracked separately. Cum now routes from the cummer into THAT cummer's current partner, with the hole derived from the cummer's own position - fixing cross-pair cum/edge prompting in the wrong scene, one-directional cross-pair cumflation, and hole-from-position deferral in multi-pair scenes. Sexual Advance no longer spawns a duplicate scene when a target advances on its own attacker (it re-points the pairing instead), and no longer re-prompts for scene roles once control is established: role detection now reads the custom Dominating/Submitting items by slug rather than hasCondition (which never matched these custom items and caused a re-prompt on every advance), and a newcomer joining an already-controlled scene inherits the Dominating role with no prompt. Defeated-on-cum and the Gangslut submitting bonuses are now partner-aware. Scene start/join/leave flow through a single sync socket; persistence stores the participant model with backward-compatible migration from the old target/attacker save format. Card rendering is unchanged - the legacy projection is retained for all five themes (per-pair "Position x Partner" labels come in Phase 2).
* 6.0.0 - Foundry v14 / PF2e 8.x compatibility pass. Removed deprecated `Roll#evaluate({async:true})` calls (now bare `.evaluate()`). Namespaced all `TextEditor.enrichHTML` calls under `foundry.applications.ux.TextEditor.implementation`. Converted the last legacy AppV1 `Dialog`/`Dialog.confirm` usages to `DialogV2` (Mind Break fetish picker, Choose Approach and Sex Toy pickers in Struggle/Snuggle, plus all reset/confirm prompts). Replaced the dead `renderApplication` sheet-injection catch-all with `renderApplicationV2`. Removed remaining jQuery from the Sexual Stats dialog listeners (native `querySelector`/`addEventListener`). Hardened the Alcumical weapon-trait prototype patch against future PF2e internal-method changes. Manifest updated: compatibility verified 14 (minimum kept at 13 so the module still loads on v13 instances), pf2e system relationship added (minimum 7.10.1, verified 8.1.2).


---

## 5.0 Release Notes

### Arousal & Horny System
- Horny is now stored as a world flag with separate `temp` and `permanent` values, replacing the old condition item approach
- Pip bars on the AFLP character sheet tab allow direct click-to-set for Arousal and Horny
- Denied condition fully integrated into the arousal bar - yellow pip extensions show Denied levels, with +/− buttons for in-play adjustment

### Edge Automation
- When a character's Arousal maxes out they are prompted to attempt the Edge reaction via a DialogV2 popup
- Module settings control auto-roll, skip-dialog, and NPC inclusion
- Edge Master L3 auto-succeed on masturbation-triggered arousal max is fully automated
- Successful Edge writes Denied to flag and triggers all downstream kink effects

### H Scene & Sexual Advance
- Per-turn and SA chat output now shows full Arousal gain breakdowns including Horny and Submitting bonuses
- `postSAChat` module function keeps display logic in script rather than the macro, ensuring it's always current

### Sentient Items - Armor of Hands
- Three variants: Armor of Hands (Rare 8), Armor of Guarding Hands (Uncommon 6), Armor of Groping Hands (Cursed, Rare 10)
- Full Disposition system (1 Bonded → 5 In Control) stored per-actor as a world flag
- Disposition shifts automatically on: critical hits landed/received, successful Edges, Will save outcomes, Cum, and rest without armor
- RollOption toggles on the item are synced automatically when Disposition changes, activating the correct FlatModifier rules for AC, attack, and Perception bonuses/penalties
- GM can manually override Disposition by toggling the RollOption checkboxes on the item - the actor flag syncs to match

### Bitchsuit
- Three variants: Bitchsuit (mundane), Primal, and Animated
- Mundane and Primal: +2 Arousal per hour via world time hook
- Animated: +2 Arousal per combat turn; blocks Edge reaction
- Primal: grants and maintains Creature Fetish 3 on equip, tagged for clean removal on unequip
- All variants grant Gagged on equip; conditions tagged for removal on unequip

### New Kinks
- **Bimbo** - interacts with Bimbofied condition; L1 ally Recall Knowledge bonus automated via RollOption toggle that syncs when Bimbofied is added or removed
- **Gangslut** - requires Submissive; scales with Dominator count; L1 DC penalty removal and Submitting Arousal scaling automated; L2 grants Give 'Em An Opening for free; L5 Defeated immunity with 2+ Dominators automated; Dominator count toggles synced each combat turn

### Kink Automation (existing kinks)
- **Creature Fetish** - per-turn Arousal increment when a matching creature type is within 30ft, fires each combat turn
- **Aphrodisiac Junkie L2** - +1 Arousal per turn to all Dominating/Submitting scene participants while actor is under an aphrodisiac
- **Aphrodisiac Junkie L7** - Stunned 2 applied to Dominating/Submitting creatures on cum
- **Cum Slut** - Horny +2 automatically applied to target when cum is received
- **Purity L3** - CF level saved when Mind Break is gained; any CF gained during Mind Break is removed when it ends

### Exposed (Nude) Detection
- Exposed (Nude) condition correctly detected via `sourceId` and item name in Struggle Snuggle and all condition logic, compatible with PF2e v7 compendium origin format

### Sheet Tab Fixes
- Switching from the AFLP tab to Actions or Spells no longer blanks the sub-tab content
- Fix works by preserving PF2e's internal `.active` states and using `display:none` only, rather than stripping active classes from sub-tab panes

### Compendium
- Publication and Author fields set to "AFLP" / "ArdisFoxx" across all 283 items and 49 actors
- All three Armor of Hands variants and all three Bitchsuit variants added to the Lewd Items compendium with correct PF2e armor structure

### Welcome Toast
- On first load of each new version, a welcome dialog is shown to all users with a changelog summary, getting-started guide, and information about the AFLP PDF and SubscribeStar membership

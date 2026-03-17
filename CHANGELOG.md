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

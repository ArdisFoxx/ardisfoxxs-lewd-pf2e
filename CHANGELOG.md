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
* 4.9.x - PF2e v7 / Foundry v13 compatibility pass. Migrated sheets and dialogs to AppV2; fixed pip bars, condition detection, and combat hooks.
* 5.0.0 - Major feature release: Arousal/Horny/Denied system with click-to-set pip bars and Edge automation; H Scene and Sexual Advance with full gain breakdowns; Armor of Hands and Bitchsuit sentient items; Bimbo and Gangslut kinks plus automation for existing kinks; Exposed (Nude) detection; sheet tab fixes; compendium authoring pass; per-version welcome dialog.
* 5.4.24 - Bimbomancer and Skyclad Idol archetypes; Voyeurism and Horny (Permanent) kinks; Mind Break to Creature Fetish automation; multi-type Creature Fetish; 51 new monsters and a cum/coomer audit across all cock-bearing monsters.
* 5.5.0 - Alcumist, Bimbomancer, and Skyclad Idol archetypes; Armor of Hands with Disposition system; new kinks, feats, and spells; Lovense Setup Wizard; four H Scene UI themes with a per-user selector and reload persistence; end-of-scene report card; Masochist and Sadist title tracks; custom H scene message and titles editors; cumflation tier messages; broad monster and Scribe PDF updates.
* 6.0.0 - Foundry v14 / PF2e 8.x compatibility pass. Removed deprecated API calls, converted remaining AppV1 dialogs to DialogV2, dropped jQuery from the stats dialog, and updated the manifest (verified 14, pf2e 7.10.1+).
* 6.1.0 - H Scene engine rearchitecture: one scene per battlemap with a flat participant list tracking each actor's partner, position, and role, so multiple independent pairings are handled separately. Cum routes from each cummer into their own partner via their own position; reworked role detection and scene start/join/leave with persistence.
* 6.1.1 - H Scene cum-flow refinements: the cum hole dialog shows only for the actor who clicked, auto-uses a known penile position with no dialog (including cock-on-cock), and no longer disturbs the GM's token selection.
* 6.2.0 - Reworked the H Scene card to track every pairing on the battlemap independently, so multiple couples, gangbangs, and reversals display at once. Personal-focus card with clickable Nearby blocks, partner-aware positions and flavour, and equal mutual/entangled pairs. All five themes rebuilt on this system.
* 6.2.1 - Struggle Snuggle reversals flip only the escapee's own pairing and hand them control; manual hole marks tracked per receiver; H Scene pairing/grouping persistence and multi-GM fixes.
* 7.0.0 - Cumflation visuals and audio. A procedural, asset-free cum layer coats tokens and pools on the ground, escalating through the tiers with a per-load token shake and intensity/colour/quality settings. New voice and ambient-sound layer: per-actor voice profiles and position-aware SFX (plaps, gluk, slides, and a slosh when a hole fills), shipped in the free AFLP Soundpack companion module (audio from the OpenNSFW Sound Pack, CC BY 4.0). Cumflation status labels added to more card themes, plus assorted fixes.

---

# AFLR 1.0.28 / AFLP 8.0.28

Chastity gear that actually holds you, a coat of cum that makes you harder to hold, the
Living Exoskeleton's lubricant becoming a real mechanic, and a long list of cards that
promised things nothing did.

## Foundry 15

- The module no longer refuses to load on Foundry 15. It is verified on 14 and will run
  on 15; report anything that looks wrong there.

## Chastity (both systems)

- Every chastity piece now holds Denied while it is worn: Chastity Belt, Chastity Harness,
  both Living versions and the Throat Sleeve Slave harness hold 3, and a Cock Cage holds 1.
  Wearing two pieces gives you 3, not 6.
- That floor survives a rest or a day's preparations. It lifts when the piece comes off,
  and it gives back any Denied you had earned yourself before you put it on - taking a
  harness off used to leave you at zero.
- Chastity Belt, Cock Cage, Codpiece and their Daggerheart twins now actually seal the
  holes their cards describe. Only the living versions were registered before.
- The Daggerheart cards say so out loud: the tokens do not lift until the piece comes off,
  and a rest does not clear them.

## The Bull's grip (Pathfinder)

- Four cards granted a bonus to a "Sexual Advance check", which has never existed. Bull,
  Bullified, Slutty Display and Oral Training are all rewritten.
- Bull's Greater beat now gives **+2 to your Fortitude DC against Escape attempts by
  creatures you have grabbed** - a number the automation reads. It applies to a knot tied
  while you have it, and it is named on the escape line so the GM can see where it came
  from. A Bull in a group who is not already the strongest contributes nothing, on purpose.

## Slick with cum (both systems)

- A coat of cum on your chest or tits now helps you get free of anything. **+1 to Escape
  at coat 4, +2 at coat 8**, on every escape attempt - a grapple, a hold, a knot, a frame,
  and being swallowed. It used to lower one specific DC and nothing else.
- **New anatomy: Chest.** A bare chest that takes a coat, for bodies with no tits. Tits
  override it. Every character has one from creation, like an ass or a throat.
- The chest coat is called **Chest Coat** and the face coat **Facial Coat** everywhere -
  sheet, status panel, chat and dialogs.
- **Purge Cumflation can clear both coats.** It offered a pool nothing had written to
  since the chest pools merged, so there was no way to wipe a chest coat at all.

## The Living Exoskeleton (both systems)

- The suit runs on cum, and now it says so and means it. **Below a Chest Coat of 4 it is
  Exoskeleton Dry:** the mounting pistons withdraw, so you are no longer Plugged, Chaste
  or Caged, your holes are reachable, and getting the suit off you is easier.
- While it is dry, any load finished anywhere on you is smeared over the suit to grease it
  instead of filling the hole it was aimed at.
- A dry suit is clumsy - a Stealth penalty on Pathfinder, disadvantage on moving quietly in
  Daggerheart - and when combat starts it walks you toward the nearest creature that could
  use you and presents you to them. It will not walk you out of trouble until it is greased.
- **A rest or a day's preparations uses up the whole coat**, so it starts every day dry.
- The Daggerheart version of the suit gained the Chaste and Caged clause its Pathfinder
  twin has had, and the cleaner headings.

## Daggerheart

- **New anatomy: Tits (Itty Bitty)** - one size smaller, never smaller than 1, so it makes
  a small chest rather than removing it. Tits (Hyper) overrides it.
- All four **Bondage Bikini Armor** tiers promised +1 Evasion and delivered nothing. They
  deliver it now, as do the Spreader Bar's -2 Evasion and the Exoskeleton's +1 Strength.
- **Thirty-odd living bondage pieces now do what their cards say when you put them on** -
  Rope Bindings restrain, the Yoke and Spreader Bar leave you open, the Pillories do both,
  the Sensory Hood blindfolds and gags, the Milking Station puts you in Stuck Submitting,
  and the Tail Plug, Suction Clamps and Latex Catsuit hold you Horny.
- **Blindfolded lasts until you can see again** and holds you Vulnerable while it does -
  marking HP no longer clears it out from under you.
- **Being Exposed 2 makes you Vulnerable however you got there.** From an H-Scene effect it
  did nothing; only the sheet's status editor worked.
- **Stuck Submitting now carries its contents:** Submitting and Restrained, plus Exposed 2
  and Vulnerable. Getting free drops the Submitting and Restrained and leaves you exposed.
- The Living Cock Cage of the Cumdump Femboy refuses a body with no cock instead of failing
  quietly.

## Fixes

- A condition change on Daggerheart could hang forever - a rest, the status panel's clear
  button, or taking gear off would simply never finish. Fixed, and guarded.
- Two statuses set by two different AFLR conditions no longer fight over each other, and
  AFLR never clears a status it did not set.
- Tits (Hyper)'s promise to override everything is now structural rather than accidental.

---

# AFLR 1.0.26 / AFLP 8.0.26

The release that makes AFLR work for players rather than only for the GM, plus the build
fix behind "my compendiums are empty".

## Compendiums

- **Every pack shipped with its data in a recovery log and no table file.** Foundry rebuilt
  it silently on any machine that could write into the module folder, and showed an empty
  compendium on any machine that could not - a hosted server, a locked-down install. Both
  pack builders now finish the job properly, and refuse to build a pack that would ship
  that way.

## Players can play

- **The GM-relay had never once worked.** Every player action that touched a creature they
  do not own failed with "you must be the GM to affect others". Fixed, and confirmed from a
  real player's seat on both systems.
- **A player can click their own climax.** The Cum and Edge buttons lit for the GM and were
  dead for the player whose character was climaxing; and when a player's own client drove
  the arousal, the GM's click did nothing.
- **A player rolls their own Edge**, on their own screen, with their own dialog. It used to
  open on the GM's client and block there.
- **A player can start their own solo scene.**
- **In a dominated scene, the character being used gets the buttons.** They went to the
  dominating side, so the person actually climaxing had no row at all.
- A Fear rolled by a player is now actually banked. The card announced it and the pool did
  not move.
- Closing a scene tells the other clients. Players were left staring at "H-SCENE IN
  PROGRESS" over a scene that had ended.
- Carnal buttons resolve to the token you clicked, not the actor it was copied from, so two
  copies of the same monster no longer share one set of numbers.

## Daggerheart rolls

- **Carnal Escape, Carnal Resist, Carnal Rescue, the Bullified urge and the Edge all roll
  through Daggerheart's own roll dialog now** - Experiences, Hope spends, Rally, advantage,
  all of it, on the roller's own screen.
- **AFLR's only contribution to those rolls is Arousal.** It no longer hands out Hope, Fear
  or Stress of its own; the system's own automation does that if you have it switched on.
  Every card sentence promising a Hope or a Stress went with it.
- The Edge is a reaction, so it pays no duality - and Hooked is a real disadvantage die
  rather than a mangled roll that added dice together.
- **Carnal Rescue contagion is a base rule**, not a Lust Haze feature. A rescuer who
  succeeds with Fear or fails with Hope marks 2; failing with Fear pulls them in.

## Both systems

- **Five effects had been throwing an error since Foundry 13** and silently killing whatever
  they sat in: Stretch King, Hypnosis, Pain Slut, Creature Fetish, the Paizuri aura, the
  Skyclad Engine and the Sticky Bomb all measured distance with a function that no longer
  exists.
- **Horny and Denied are read and written in one place now.** Eight grants were dead on
  Daggerheart, the Denied row on the status panel had never once lit on Pathfinder, and the
  H-Scene badge and the sheet disagreed with the panel about your own numbers.
- **Dragging a condition card onto an actor now applies the condition.** It did nothing at
  all on Daggerheart and half-worked on Pathfinder.
- **Timed conditions keep their card and their clock.** Defeated's one-minute duration is
  real, and the flag clears when it expires.
- **Edging uses the system's standard DC.** It was reading a different, easier table; a
  level 3 Edge is DC 18 rather than 16.
- Unlinked tokens keep their own lifetime numbers, so mooks no longer share one tally.
- Pineapple Diet's floor is your level, with no cap - both guides say Loads has no cap.
- A Cum Shot is capped at 24.
- The Cum Cleaner clears the spill marker it is pointing at.
- Bondage titles count H-Scenes rather than combat rounds, so all four are reachable on
  Daggerheart, where they had never been earnable at all.
- A Stupefied value applied through AFLR is the value the card says, not 1.
- Drinking a Fertility potion no longer makes its temporary effect permanent and then
  deletes the potion.
- Both characters in a scene earn their titles, not just one of them.

---

# AFLR 1.0.25 / AFLP 8.0.25

A Daggerheart adversary pass, the position system finished, and one deposit engine instead
of three.

## Daggerheart adversaries

- **36 adversaries and 137 features rebuilt.** Features are sorted into passives, actions
  and reactions rather than all being passive, and Bad Ends are no longer offered as ordinary
  attacks.
- **24 of 31 adversaries were outside their statblock band** - one damage line had been
  pasted across thirteen of them. Rebalanced.
- Every carnal action was a generation behind its own card. All 23 rewritten to match.
- 24 adversaries had a prototype token named after a different creature - eleven of them
  said "Gushing Incubus".
- The rut-themed renames applied across eight actors and twelve features.

## Positions and cum

- **The position picker is the single source of truth for where cum goes.** 86 positions
  each carry where a load lands, and a bottom with no position of their own uses their
  partner's.
- **Beast rides invert** - the rider penetrates. **Sixty-nine added**, the only mutual
  position.
- **Reciprocal deposit**: both sides of a pairing deposit into each other correctly.
- **A load-per-round leak is gone.** A creature sitting at maximum Arousal deposited a fresh
  load on every carnal action afterwards. There is one deposit engine now, and it runs on
  every system.
- One load spent per climax per creature, on every route. Three double-spends fixed.
- The body coat is documented in the guide journals for the first time, and the ass anatomy
  and its 17 subtypes with it.

## The Doll-Maker set (Pathfinder)

- **New condition: Posed.** A posed creature takes no damage and cannot Resist - and now
  cannot be pressed or escaped from, on either press path.
- Two features that granted extra damage against a Posed creature were removed; a Posed
  creature takes none.

## Fixes

- Ass (Stretchy) no longer locks a character out of the size-training kink and its title
  forever.
- Fertility reads both mates, so Birth Control on either one reduces it.
- Struggle Snuggle's solo scene applied the Strike's Arousal before the scene opened.
- AFLR conditions no longer throw on Pathfinder for a condition Pathfinder does not have.
- Pathfinder's flag-backed conditions clamp; Breeding and Birth Control could reach 7.
- Every cock subtype's Loads and Cum Shot bonuses are stated once, in one place.
- Daggerheart says "Difficulty" where Pathfinder says "DC".
- The status panel shows 25 rows rather than 24, with 5 missing rather than 7.
- Two dead links, four world-scoped links, three broken art paths and 96 art paths that
  hotlinked an external CDN, all fixed in the Pathfinder packs.
- Five Daggerheart environments shared one token icon; a pregen PC pointed at another
  module's art files.

---

# AFLR 1.0.24 / AFLP 8.0.24

Condition ceilings that the cards and the automation finally agree on, living gear that
does what it says, a pass over the kink cards, and a size training system that finally
pays out where it always said it would.

## Condition ceilings (both systems)

- Horny, Denied, Bimbofied and Bullified cap at 3. Exposed caps at 2. Creature Fetish
  caps at 6. Mind Break is uncapped.
- Ten cards that promised a level above the ceiling were reworded to match. Nothing
  silently clamps a number the text still claims.
- When Mind Break ends you gain Creature Fetish equal to your Mind Break value, up to 6.

## Living gear (Pathfinder)

- The Living Cock Cage grants Ass (Cumfinity) and Bimbofied 1 while worn, and both end
  when it comes off. It previously claimed each climax refilled a spent Load, which
  nothing did.
- The Cock Cage of the Cumdump Femboy now applies its curse when it closes: Ass
  (Cumfinity), Cock (Micro), Bimbofied 1, the Submissive kink in place of Dominant, and
  Creature Fetish 3 for a creature type chosen at the time. All of it is kept when the
  cage comes off, exactly as the card says. It will not take on a body with no cock.
- New anatomy: Cock (Micro). Minus one Cock size, to a minimum of 1. It is still a cock
  and still fires a full Cum Shot.

## Traps

- **New hazard: the Feminizer Glyph Trap.** A level 9 sigil worked into the floor that
  flares when someone stands on it. Stealth DC 31 to spot, Reflex DC 30 to leap clear,
  and DC 30 Thievery or a 5th rank Dispel Magic to take it apart first. On a failure it fits a Cock Cage of the
  Cumdump Femboy to a creature with a cock, a Chastity Harness of the Throat Sleeve Slave
  to a creature with a pussy, both to a creature with both, and a set of Bondage Bikini Armor
  over the top either way. A creature with neither is left alone.
- **New cursed item: the Chastity Harness of the Throat Sleeve Slave.** Its curse gives
  Throat (Deepthroat), Tits (Heavy) and Bimbofied 1, kept even after the harness comes
  off, plus Denied 3 and three built-in pieces while it is worn. It seals your pussy and
  ass against purging Cumflation.
- **Four new built-in pieces**, all level 13 and all opened by the harness's own lock: the
  Oral Slave Collar, and the Buttplug, Piercings and Pussy Vibe Egg of Synchronous
  Vibrations. The collar narrows the throat, so an act using it marks the wearer 1
  additional Arousal and marks whoever is working that throat 1 additional Arousal. The
  wearer marks 1 more for each vibrating piece they wear, to 4 with the full set. The
  collar's card states the whole rule, so you count what you are wearing instead of opening
  every item. It stacks with Horny.
- The plain Chastity Harness now grants its Denied 3 and seals the same two holes. Both
  were stated on its card and neither happened.
- **New lock grade: Bondage Lock (Excellent).** Level 13, five successful DC 37 Thievery
  checks or Force Open at DC 35. It fills the gap between Good and Superior, which sat
  eight levels apart. Both cursed pieces now use it, and getting either off takes the lock
  AND a 6th rank Cleanse Affliction to break the curse. Opening the harness's lock also
  frees its built-in collar, buttplug and piercings.

## Anatomy

- Throat (Deepthroat) enforces its weakness. While a cock fills your throat you are Prone
  and your Speed is 0, and both end when it is pulled out. A Prone you already had is left
  alone. Pathfinder only; the Daggerheart card states no such rule.
- Tits (Heavy) gives +1 tits size. It previously did nothing at all outside a Wallbang,
  despite promising twice the size. Its knock-on reaches the onahole's hole size, milk
  capacity and the size difference rules.
- Tits (Heavy) and Tits (Gripping) no longer claim to add a paizuri slot. That rule was
  only ever a bonus inside Wallbang, and it is now written on Wallbang where it belongs,
  along with the prehensile tongue bonus that was never written down anywhere.

## Status panel

- Pregnancy is now two rows, and both count the brood. Impregnated shows the total
  young and Egg Host shows the total eggs, summed across every running pregnancy, so
  two pregnancies of two young each reads Impregnated IV. The single row it replaces
  showed no number at all, and relabelled itself to "Clutched" if any pregnancy was
  eggs, which hid the live young of anyone carrying both.
- Two new rows for the cursed gear: Bimbofied Bondage Anal Slave while the Cock Cage
  of the Cumdump Femboy is worn, and Bimbofied Bondage Throat Sleeve while the
  Chastity Harness of the Throat Sleeve Slave is. Both take the item's own art and
  link to its card, and both go out when the piece comes off or goes in a bag.

## Conditions on the gear, instead of in every card

- **Three new conditions carry rules the items used to repeat.** *Chaste* - the holes a lock
  covers cannot be penetrated, nothing seated in them can be removed, and you cannot purge
  Cumflation from them. *Plugged* - nothing else can get into your ass and you cannot purge
  Cumflation from it, and a plug under a Chaste lock cannot come out until the lock does.
  *Caged* - you cannot get hard and cannot climax through your cock. All three exist in both
  Pathfinder and Daggerheart.
- Around twenty items dropped the sentences those conditions now carry, including every
  plug, both chastity harnesses, the chastity belts, the Bitchsuit variants and the Living
  Exoskeleton.
- **Plugs now actually seal.** A worn plug was only ever a warning: the purge screen printed
  a note and still offered the plugged hole. It refuses it now.
- The Cock Cage was using Chaste to say the cock was locked away. That is what Caged is for,
  and Chaste is about sealed holes.

## Bondage

- The Bitchsuit seals both ends. While it is worn you cannot purge Cumflation from your
  ass or throat, in both systems. Its description now names the muzzle-plug and the tail
  anal plug that do it.
- The Animated Bitchsuit reshapes you at 1 hour, 8 hours and 24 hours worn. The old ladder
  had a fourth step at 48 hours that delivered nothing, because Bimbofied stops at 3.

## Kinks

- Every kink card in both systems now lists its tier features as bullets instead of a
  paragraph. Every tier has a short line of its own before the list.
- Purity's daily preparations no longer roll 1d10 for Denied. You gain Denied 3 and
  attempt a DC 3 flat check; on a failure someone hears you and joins in.
- Cum Slut at Mastery escapes without a roll while slick, and the escape clears the coat.
  This now works in both systems; on Pathfinder it had been stated on the card and gated
  off in the code, and its condition named the wrong numbers.
- Creature Fetish keeps you at a floor of Denied 2, topped up at every rest.

## Fixes

- Throat (Deepthroat)'s extra tier of throat capacity now holds the floor pool back
  as well. The tally that counts overflow honoured it and the spill that draws the
  pool did not, so a deepthroat filled to 8 still splashed on the floor and still
  reported the millilitres. Both now ask one shared cap.
- A Living Milking Station bottled far too much. It was handed the wearer's running
  lifetime overflow total instead of what the load in front of it actually spilled,
  so a captive sitting on 20 units of past overflow banked 20 bottles from a single
  extra spurt, and again on every load after that.
- Toasted names the Sexual trait. Pathfinder has no Carnal trait, so the old wording could
  not be checked against anything.
- Exposed changes now refresh the H-Scene bars on Daggerheart.
- The roll table compendiums sit in their system's folder on a fresh install.
- Worn gear is read correctly in every system, so a set carried in a pack no longer counts
  as worn.
- Actors carrying their own copies of the ten reworded items were brought up to date, in
  the world and in the compendium.
- Stray formatting from a text editor was cleaned out of three items and both guide
  journals.

---

# AFLR 1.0.21 / AFLP 8.0.21

## Milking (Daggerheart)

- Milkmaid Harness and Milking Station now produce milk at a rest. Only the living
  versions counted before. Harness 1, station 2, station 3 with Tits (Hyper).
- Tits (Lactating) grants the Nurse domain card.

## Squeezing (both systems)

- Purge Cumflation empties the Tits (Onahole) reservoir. It costs nothing.
- Squeezing cumflated tits fills one Bottle of Milky Cum, once per rest.

## Status panel (Daggerheart)

- Plugged, Chaste, Gagged, Blindfolded, Hobbled and Cuffed now display.

## Fixes

- Daggerheart milk capacity and production return 0. The numeric pool is Pathfinder
  and 5e only.
- A Daggerheart rest no longer prints "completes daily preparations".
- The rest handler recognises the AFLR Long Rest Upkeep macro.
- The once-per-rest Bottle of Milky Cum allowance clears at a rest.
- The welcome screen lists the ass anatomy, the roll tables and loot generator, and
  the tiered lewd armor.

---

# AFLR 1.0.20 / AFLP 8.0.20

A Daggerheart content pass, a new anatomy, and a run of fixes for things that had
been quietly doing nothing.

## Ass anatomy (both systems)

The ass is now a full anatomy with its own subtypes, rather than a hole with no
options.

- **A base Ass** everyone has, with its own size and size gap.
- **Seventeen subtypes.** The familiar ports - Gripping, Milking, Slick, Honeyed,
  Electric, Venomous, Pacifying - plus **Deep** (+1 size, stacks with Gape
  Glutton) and **Stretchy**, a goblin's gut that never takes a size gap at all,
  so nothing ruins it no matter how much punishment it takes.
- **Four breeding features** - Fertile, Breeder, Clutch and Litter. A womb forms
  in the gut to carry it; if you already have one, the two connect and you carry
  in the one womb rather than two.
- **Cumfinity**, built around prostate orgasms: climax from anything in your ass
  and your Arousal drops to one below its maximum instead of to zero, so you are
  one step from cumming again. If you have a cock, that climax still fires a full
  Cum Shot but costs you no Loads.
- **Straight Through**, **Carrying** and **Prehensile** for bodies built stranger
  than most.

## Daggerheart gear

Daggerheart had roughly a quarter of the gear Pathfinder did. This closes most of
that gap, written at Daggerheart's own register rather than ported wholesale.

- **Around sixty new items**: bondage gear, wondrous items, tonics and tattoos.
- **Living bondage now pairs properly.** Twenty-three living pieces gained the
  ordinary item they fall dormant into, and six mundane restraints gained a living
  version, so the rule that a removed piece "becomes the ordinary item of the same
  name" is finally true.
- **Living Exoskeleton**, a metal shell that walks for you, lifts for you, and
  hauls you toward the nearest creature that could plausibly fuck you when it
  needs greasing.
- **Bondage Bikini Armor** and **Carnal Knight Armor**, both proper tiered armor.
  The Carnal Knight cannot be made Vulnerable and cannot resist a Carnal Press at
  all - unkillable by violence, defenceless against sex.
- **Roll tables and a loot generator.** Lewd items, consumables and a living
  bondage trap table, plus a generator that draws weapons and armor by tier from
  whichever Daggerheart content you have installed.

## Exposed reworked (both systems)

Exposed is now two stages rather than one flat condition.

- **One token** - clothes open or pulled aside: you roll Carnal Resist with
  disadvantage.
- **Two tokens** - near enough naked that nothing is covered: you are also
  Vulnerable.

On Daggerheart this makes Exposed a carnal condition first, with nudity as the
escalation, instead of a general combat penalty wearing a lewd name.

## Status panel

- **Rows are grouped and ordered** most-permanent-first: identity, body, training,
  state, drives, roles, transient, kit.
- **A groups menu** in the panel header hides any band you do not want to see and
  lets you drag the rest into your own order. Per user, so hiding something does
  not hide it for the rest of the table.

## Fixes

- **The slick cum coat never granted Horny.** It was written against a condition
  API that does not reach the Horny flag, so it silently did nothing - to the
  coated creature or their partner. Tits (Honeyed) and Tits (Electric) had the
  same fault.
- **Bondage Princess never fired on Daggerheart.** It looked for a Pathfinder item
  trait that Daggerheart does not have, on item types Daggerheart does not use.
- **The AFLR sheet did not refresh when items changed.** Dropping a Bonus Loads
  effect onto a character updated the status panel but left the sheet's number
  stale until it was reopened.
- **Milking Station** promised tits a size larger and granted nothing.
- **Ass and pussy training** could be earned from the wrong hole.
- **Loads wording standardised.** Sixteen items granted Loads without once saying
  "Bonus Loads", so nobody could connect them to the field on their sheet. The
  Loads effect is renamed to match.
- Assorted Daggerheart text corrections: items that measured movement in feet or
  referenced spell components, neither of which Daggerheart has.

---

# AFLR 1.0.12 / AFLP 8.0.12

An anatomy, milk and crafting pass, plus a terminology cleanup that finishes a
rename which had only ever been half applied.

## Retiring Cum Volume and Coomer

The old Cum Volume mechanic - where a climax spent half your total, rounded up -
was replaced some time ago by **Cum Shot x Loads**, but the rename stopped at the
item names. This release finishes it.

* `Cum Shot` and `Loads` had kept their old slugs (`cum-volume`, `coomer`); both corrected.
* 13 items and 2 journal pages still described the retired mechanic; all rewritten.
* The guide now quotes the settings by their real names, `Cum Shot - Unit Size` and `Cum Shot - Infinite Loads (NPCs)`.
* `Cum Volume Enhancer` is now **Load Restorative**.
* `Cumshot Cannon` required "a Cum Volume of 800 or higher"; it now requires **Cum Shot 8 or higher**.
* Removed a dead code path in the climax that still held the retired half-your-Cum-Volume formula.

Legacy characters need no migration: Loads has always been stored in the same
place, so an old Coomer stack already reads as that character's Loads.

## The Alcumist, rebuilt

* **Versatile vials are now Distillates.** The old name belonged to a Pathfinder Alchemist feature with different rules, which is why it behaved unexpectedly.
* **Distillates persist through the day.** They used to exist only while the crafting window was open, so anything unspent was lost.
* **Craft several of the same item at once**, instead of one of each.
* **Your Cumcraft feats now gate what you can make.** Basic, Advanced and Greater Cumcraft grant access to a list that was previously unfiltered, so they had no effect at all.
* **Refined Formula works**, letting you spend 2 Distillates on an item up to 2 levels above your access, Intelligence-modifier times per day.
* **Primed Formula works**, granting its free Distillate on top of your allowance.
* Your daily allowance is half your Loads, minimum 1 and maximum 6.

## Anatomy and milk

* **Tits size runs 1 to 8**, from body facts rather than fluid levels, shown as cup bands. Hyper is the only route to 8.
* **Paizuri Slut** joins Size Queen, Throat Goat and Gape Glutton as a fourth training track, so nipple-fucking measures size difference like any other hole.
* **Bottled Milk** exists in Pathfinder for the first time, so milk can finally be saved as the Lactating item always promised.
* **Nursing scales with the producer's level**, and a **Nurse** action states its cost and traits properly.
* A **Bottle of Milky Cum** can be brewed from a Vial of Cum and a Bottled Milk.
* `Pussy (Bottomless)` grants +1 Pussy size and stacks with Size Queen, as `Cock (Girthy)` always has.

## Living bondage (Pathfinder)

* A folder of restraints grown from mimic-stuff. They fit themselves onto whoever handles them, some disguised as furniture.
* **You cannot get yourself out.** Another creature must Force Open them.
* **A critical failure makes it worse**, reshaping the piece into a harsher one, once per piece.
* A **Living Milking Station** captures what would otherwise be wasted, and a **Tattoo of Predicaments** turns the scenery against its wearer.

## Daggerheart

* Its own take on all of the above, built native rather than ported: gear takes hold when the GM spends a Fear, and escalates when a roll to remove it fails with Fear.
* **Stuck Submitting** arrives in Daggerheart, applying Restrained and removing your choice of how to answer a Carnal Press.
* **Lactation replaces Leaking.** Leaking was doing four jobs at once - precum, milk, an Arousal trigger, and the gate the whole milk economy read. Daggerheart now has its own `Tits (Lactating)`, the same anatomy Pathfinder uses, and that is the only thing the milk economy checks.
* Rest in a milkmaid harness and it fills one Bottled Milk; a milking station fills two, or three if your tits are Hyper.
* **Being covered in cum does something again.** A coated chest makes you Horny as it builds, and a slick body is harder to hold - both were silently skipped in Daggerheart.
* Getting cleaned up no longer takes the Horny back. It lasts until you rest, like any other Horny.
* **Size finally accounts for how big you are.** A creature's own tits now fit its own cock; previously a Large or Gargantuan pair read as the worst possible fit. Milk capacity scales the same way, so a bigger creature holds more at the same cup size.
* `Throat (Numbing)` works. It reads identically to `Tits (Numbing)` and only the tits half was ever implemented.
* `Cock (Slime)` is now `Cock (Multipenis)`, matching Pathfinder and the hordes it mostly turns up on.

## Fixes

* Fixed nipple-fucking and paizuri never firing their cumflation tier messages.
* Fixed one creature dying ending the H-Scene for others sharing its sheet.
* Fixed size training paying double when a scene ended.
* The Bimbomancer feat `Oral Training` no longer reads as the Throat Goat body feature.
* `Gagged` was missing its content key and could not be applied by name.
* The welcome screen is now system-aware: a Daggerheart world no longer reads Pathfinder terms, and vice versa.

---

# AFLR 1.0.8 / AFLP 8.0.8

A rules pass on climax, the sexual roles, and Loads. Pathfinder and Daggerheart now
share one climax rule; where they differed, the code has been brought in line with
what the Daggerheart guide always described.

## The climax rule (both systems)

- **Climax while Submitting and you are Defeated.** A Dominator is no longer
  required. Yielding to a willing partner costs what yielding to a monster costs.
- **Any other climax makes you Horny instead** (+1, maximum 3). The two are
  mutually exclusive.
- **Horny no longer clears when you cum.** It clears on daily preparations, so
  what you do between fights follows you into the next one.

## Sexual roles (both systems)

- **Submitting no longer grants Arousal.** The flat +1 on every Arousal increase
  is gone.
- **Dominating and Submitting no longer grant passive Arousal** at the start of a
  turn where your Arousal did not rise (previously +1 and +2).
- Both are now scene roles only. Every point of Arousal comes from an action.
- **Gangslut (Signature)** no longer scales the Submitting bonus. When a second
  Dominator joins the scene against you, you gain **1 Horny** - once per gangbang,
  and it stacks with Horny from any other source.

## Loads (both systems)

- **A climax spends no more loads than remain.** A creature with fewer loads left
  than its Cum Shot delivers only what it has.
- **A creature at 0 loads still climaxes but produces nothing:** no cumflation, no
  cum on the ground, no coating, no vial, no Brood Roll. Previously an empty
  creature still flooded its partner with a full shot.
- The character sheet now shows **loads remaining out of capacity**, and turns red
  when dry. It previously showed capacity only, so loads never appeared to spend.

## Interface

- **H-Scene card:** a per-performer button fires Sexual Advance (Carnal Press on
  Daggerheart) without digging the macro out of the hotbar.
- **Condition manager** is reachable again from the character sheet and by clicking
  the status HUD's header.
- **Status panel:** Creature Fetish names the creature types it is hungry for; a
  maxed Size Training track names the Body Feature it granted.
- **Fixed** a status tooltip that could stay on screen after the panel refreshed
  beneath the cursor. Tooltips now fade out and cannot outlive their row.

## Pathfinder 2e

- Defeated, Dominating, Submitting, and Horny condition text updated to match the
  rules above. The Horny item previously claimed it ended when you cum; nothing has
  ever done that.
- Guide journal updated, including the worked example's arithmetic.
- **Exposed** now has a glossary entry explaining why your armour never comes off:
  it is an abstraction over armour-break, so you keep the armour's magic and only
  your defences drop.

## Daggerheart

- **Exposed** glossary entry added, noting that Exposed makes you Vulnerable and
  carries no levels there.
- Fixed kink detection: kinks added as items were invisible to every automation,
  because they were matched by a slug and a source id that Daggerheart items do
  not carry.

## Size training (both systems)

- **Gangbangs, troop scenes and orgies awarded no training pips at all.** Any position
  where more than one creature works you at once reports its holes as a single
  gangbang entry rather than naming them, and the award at the end of the scene did
  not know what to do with that, so it silently paid nothing. It now pays every hole
  the receiver actually has. Reported by a player; it had been broken since gangbang
  positions shipped.
- **A rest relaxed every track by two pips instead of one.** The chat card reported the
  first pip and the sheet quietly lost the second, so a track drained twice as fast as
  the guide says while appearing to behave.
- The welcome screen and guide now state what fills a track: a hole trains when
  something bigger than it fills it and the receiver climaxes, and at the end of the
  scene it gains pips equal to the largest size gap that hole took - 1 Stuffed,
  2 Stretched, 3 Ruined. Six pips fills a track.

## Troops and hordes

- **A troop's cock is one of its creatures, not the whole group.** Pathfinder sizes a troop
  by the space the group occupies, so a Goblin Breeding Troop is Gargantuan - and AFLR read
  that straight, giving forty knee-high goblins a Gargantuan cock that hit Ruined against
  any Medium character on contact. Each troop now declares the size of one of its bodies.
  The Goblin Breeding Troop is Small; the Shambler Orgy and the Gangbang Crew are Medium.
- A goblin no longer stretches you, so a goblin troop trains no size tracks. Its threat is
  volume and numbers instead.
- **Volume did not follow the size down.** A troop's Cum Shot is one body's shot times how
  many bodies it currently is, counted from the squares it occupies, so it shrinks on its
  own as the troop loses strength stages.
- The spill radius follows the same one creature, so a stepped-down troop no longer sprays
  across the room like a Gargantuan.
- **Daggerheart hordes counted as a single creature.** A whole goblin horde delivered one
  medium creature's cum shot. A horde now counts as eight bodies, and halves to four once
  it has marked half or more of its Hit Points - the same threshold its own Horde feature
  uses. Daggerheart has no creature space to measure, so the count is a number on the stat
  block rather than a footprint.
- A horde also registers as the crowd it is, so a scene with one is treated as a gangbang.
- **A troop's strength now comes from its Hit Points, not from its token.** Pathfinder draws a
  troop as four segments and a troop loses a segment at two thirds and again at one third of
  its Hit Points, so a troop counts as sixteen bodies at full strength, twelve after one
  threshold and eight after the second. Reading the token instead gave a different answer
  depending on which modules a table had installed.
- **The three Pathfinder troops were rebuilt from scratch.** Gangbang Crew, Goblin Breeding
  Troop and Shambler Orgy are functionally identical - same stats, features, art and folder -
  but carry none of the leftover data from other modules that had accumulated on them.

## Sheet and interface

- **The ass toggle in the sheet's edit menu did nothing.** The ass arrived with eighteen
  subtypes and no handler, so ticking it never revealed them.
- **Saving the sheet turned the ass off.** The save never read the ass checkbox and wrote
  it off every time, whatever the toggle said. If a character has lost their ass anatomy
  since 1.0.20, this is why; turn it back on and it stays on.
- **The AFLR button now appears on the native character sheet in Pathfinder and 5e**, as
  it already did on Daggerheart. It was never drawing on Pathfinder at all.

## D&D 5e (in development)

- System adapter, conditions, kinks, spells, and bondage equipment. The Carnal
  layer runs natively: Carnal Press rolls against the target's AC, Exposed lowers
  it, and Carnal Escape is a single check against the Dominator's DC. Not yet
  playable as a shipped product - no guide journal.
- **Conditions now respect their ceilings on 5e.** Nothing clamped them, so a 5e
  character could hold Horny above 3 or Exposed above 2, which no card allows.

---

# AFLR 1.0.0 / AFLP 8.0.0

This release ships from one shared codebase as two modules: **ArdisFoxx's Lewd RPG (AFLR)**, which supports Pathfinder 2e and Daggerheart, and **ArdisFoxx's Lewd PF2e (AFLP)**, the Pathfinder-only edition. Each carries the same feature set for the systems it supports. The notes below are written for both; where a change only affects one system it says so.

## Daggerheart support (new)

Daggerheart is now fully supported. The complete Carnal toolkit runs natively on it:

- **Carnal actions.** Sexual Advance and Struggle Snuggle resolve on Daggerheart's duality dice (Hope and Fear), with a Reaction Roll to resist. Conditions apply and clear using Daggerheart's own token and Stress mechanics.
- **Conditions.** A full set of Daggerheart conditions: Horny, Exposed, Bound, Entranced, Hypnotized, Bimbofied, Bullified, Mind Break, Defeat, Toasted, and more, each with its own effects and recovery rules.
- **Subclasses and domain cards.** Eighteen Seducer/Caretaker subclasses (Airhead, Owner, Nudist, Faithful Pet, and the rest) and a domain-card library including the Skyclad and Bimbomancy archetypes.
- **Kinks.** The full kink roster on the three-beat Signature / Greater / Mastery ladder (see below).
- **Cum, Loads, cumflation, pregnancy, voices, and visuals** all work as they do on Pathfinder.

## Pathfinder 2e changes since 7.0.0

- **Kinks reworked to three beats.** Every kink now unlocks Signature / Greater / Mastery at levels 1 / 5 / 8, replacing the old per-level feature lists. Merged features keep each kink's identity and unique benefits. Kink text no longer repeats "improves with level" (the beat headers show it).
- **New kinks:** Bull (with the new Bullified condition), Pain Slut, and Ouroboros (converted from a feat to a full three-beat kink).
- **Hypnosis path added.** New Entranced and Hypnotized conditions. Entranced deepens to Hypnotized on a failed save against the entrancer or on climax at their hands; Hypnotized clears when an ally spends an action to shake you out or on a critical hit. Enough conditioning locks in the Hypno Slave kink (condensed to three stages). The **Hypnosis** ability (renamed from Induction) drives the arc across the Hypnotic Master and six other creatures. New rank-4 spell **Control Release** counteracts mental control (Breeder's Domination, charm, Controlled, Entranced, Hypnotized, and Hypno Slave).
- **Size Difference system.** Per-hole Size Training tracks on the character sheet earn permanent Body Features (Size Queen, Throat Goat, Gape Glutton) and, when all applicable holes are trained, the Size Difference kink. Features and the kink are viewable and can be toggled from the sheet's edit menu.
- **Brood Roll simplified.** Pregnancy brood size now uses one degree-based roll instead of the old exploding dice, with Brood Sow adding young by beat.
- **Cock (Flared)** now causes a submitting partner's Arousal to reset to 3 on climax instead of 0.
- **Sheet UI:** cumflation and size-training icons next to each track, Size Training tracks always visible (so a GM can set pips by hand), and a wider panel so the pips are not clipped.
- **Fixes:** removed an invalid rule on Monster Energy Pipeline Punch that logged a validation error; registered the "sexual" trait so it stops being stripped from creature attacks; reconciled the Hypnotized save penalties so they no longer stack into an oversized total.
- **Asset Improvements:** image assets converted to webp - reducing the module size from 430mb to 55mb.

## Both systems

- **Kink tiers unified** on the same 1 / 5 / 8 three-beat ladder, so a kink behaves the same on either system.
- **Soundpack.** Soundpack module converted to use .ogg files - reducing the full soundpack from 15gb to 930mb. Voice and ambient-SFX audio ships in one free companion module, the **AFLR Soundpack** (https://github.com/ArdisFoxx/aflr-soundpack). Install and enable it to expand the immersive audio massively; the module runs fine without it. (This replaces the earlier "Lite" and "full" soundpack split - there is now a single pack.)

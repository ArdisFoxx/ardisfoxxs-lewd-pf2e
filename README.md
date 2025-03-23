# Ardisfoxx's Lewd PF2e (AFLP)
NSFW rules, items, spells, conditions and monsters to support a lewd PF2e campaign! 

*Note: this is a paid module, and I depend on this for my income. It only costs $12, and you get all future updates for free. I think that's quite reasonable, so if you haven't purchased it, please support the author by paying for it here. https://www.patreon.com/ardisfoxxart/shop/ardisfoxxs-lewd-pf2e-1272244*

*If you're looking for other ways to support development, Patreon only costs $3 a month!*

## How to install:
1. In Foundry setup, navigate to the Modules tab.
2. Click Install Module.
3. Enter the below link in the Manifest URL at the bottom of the window, then click Install.
https://github.com/ArdisFoxx/ardisfoxxs-lewd-pf2e/releases/latest/download/module.json
4. Launch your Foundry world.
5. Activate the ArdisFoxx's Lewd PF2e module.
6. Import the compendiums. (If you don't want to import everything, at a minumum, the Cumflation macro only works if the Cumflation effects are imported)
7. View the content guide below, then scroll to the bottom for the Lovense Integration setup.

## Session 0 Content Guide:
When incorporating this module into your campaign, discuss its content openly with your group during Session 0. Let players vote for one of the four baseline "lewd game modes." Let the mode with the lowest numerical value that received at least one vote become the mode your group uses — this ensures everyone stays comfortable.

Throughout the campaign, introduce optional opportunities for players to explore content beyond their initial comfort level, clearly labeling it (e.g., "this spell is lewd level 4"), asking the players if they would be comfortable adding it to the game. Regularly check in "above the table" to confirm everyone remains comfortable with any added content. 
Be flexible and adjust the "lewdness dial" as needed. Players' preferences can change as the game evolves, so keep communication open and adjust the content freely at any stage of the campaign.
The point of the game is to relax and have fun! Not to weird out your friends by making them uncomfortable. 

### Game Mode Template for Session 0:
Copy paste this and send it to your group!

```
Now a question regarding sexy content in the game.. it's time to choose your "lewd game mode" to start with at the outset of the campaign!

Please make one vote only, and the least lewd option that has any votes will be selected as the final pick. This ensures that no player will be uncomfortable.

This is the baseline for the start of the game - making the game more or less lewd as we go will be a part of adjusting to the group dynamic, getting comfortable with each other, testing our boundaries and exploring the kind of game we want to run!

**1. Typical Anime**
*You're strictly about the adventure. Sometimes you'll see sexy people.*
- Humanoids may be sexy and alluring. You won't see anything explicit. 
- Humanoids will not have sex with you.
- Monsters are 100% horrifying and not sexy.
- Monsters will not have sex with you.
- Sexual spells and items exist in the game, but only NPCs have access to them. 
- Sexual spells and items will not be used against you by NPCs. They may use slightly explicit ones such as Cleavage Sheath and Yassify.

**2. The Witcher III**
*You might fuck if they're human.*
- Humanoids may be sexy and alluring. You may see something explicit. 
- Humanoids may have sex with you. 
- Monsters may be sexy and alluring, like big titty demi-humans or demons with huge cocks.
- Monsters will not have sex with you.
- Sexual spells and items exist, and you have access to some of the less explicit ones.
- Sexual spells and items might be used against you by NPCs. They may use moderately explicit ones such as Bondage Trap or Clothes to Oil.
- Sex is always consentual.

**3. Skyrim with Romance Mods**
*The full experience, but no creature sex.*
- Humanoids may be sexy and alluring. You may see something explicit. 
- Humanoids may have sex with you. 
- Monsters may be sexy and alluring, like big titty demi-humans or demons with huge cocks.
- Monsters will not have sex with you.
- Sexual spells and items exist, and you have access to all of them. 
- Sexual spells and items might be used against you by NPCs. They may use very explicit ones such as Pink Tentacles or Flesh to Fleshlight. 
- Sex is always consentual, unless its a spell effect.

**4. Skyrim with Defeat Mods**
*The full experience plus new rules and consensual non-consent.*
- Humanoids may be sexy and alluring. You may see something explicit. 
- Humanoids may have sex with you. 
- Monsters may be sexy and alluring, like big titty demi-humans or demons with huge cocks.
- Monsters may have sex with you.
- Sexual spells and items exist, and you have access to all of them. 
- Sexual spells and items might be used against you by NPCs. They may use very explicit ones such as Pink Tentacles or Flesh to Fleshlight. 
- Sex may involve consensual non-consent. X Cards and safewords are enabled. This means NPCs or creatures may have non-consensual sex with your character during combat encounters, but you as a player are cool with it as part of the game dynamic and are consenting to it in advance, with the option to change your mind on that at any point and halt the game or skip the scene at any time.
- New rules are added to the game, including new conditions such as Exposed, Horny, Mind Broken, Cumflated, and kinks such as Cumslut and Creature Fetish. Sexual actions such as Breed and Strip are added to some monsters. TPKs may be replaced with "Bad Ends" where, in the case where an encounter ends with the whole party being defeated, instead of death, the party is taken to the monster's lairs to become sex slaves. This usually involves a cut scene to narrate the passage of time, the PCs gaining a Creature Fetish, and then being released or having an opportunity to escape, re-equip and get revenge.
```

## Lovense Integration:
The Lovense integration is composed of 3 parts:
- This module makes events affecting actors to output to the browser console. They appear in a format of `[Date - Time] ActorName, Effect`. EG: `[03/20/2025 - 11:30:36PM] Neela, Mind Broken`. This also checks when actors take damage, EG: `[03/20/2025 - 11:38:19PM] Neela, damage`.
- The module manifest comes with a shortcut for Edge and Chrome browser. If you have either of these browsers installed, when you run them using one of these shortcuts, it will launch them in logging/debug mode. In this mode, console events are saved to a log file. This file is saved in "C:\Users\[USERNAME]\AppData\Local\Microsoft\Edge\User Data\chrome_debug.log" for Edge browser, or "C:\Users\[USERNAME]\AppData\Local\Google\Chrome\User Data\chrome_debug.log" for Chrome.
- The module manifest comes with a custom install of [Game Interface For Toys](https://github.com/MinLL/GameInterfaceForToys), pre-configured to detect AFLP events.

### Player Setup of Lovense Integration:
1. Players should download the [AFLP Lovense Integration](https://github.com/ArdisFoxx/ardisfoxxs-lewd-pf2e/blob/main/AFLP_Lovense_Integration.zip).
2. Extract it anywhere on your computer.
3. Run one of the Chrome or Edge shortcuts within the folder, to launch a web browser in logging mode. Login to your Foundry world with that browser. 
4. Run GameInterfaceForToys.exe. Note that Windows Smart Screen can produce a false positive detecting it as suspicious software, because the software hasn't seen any use so it has no repuation. This is a known issue with software packaged in Git. This software is perfectly safe and open source, and you can view the full code here https://github.com/MinLL/GameInterfaceForToys.
5. Tap Settings.
6. Click "Select another log file" and navigate to `%localappdata%\Google\Chrome\User Data` for Chrome, or `%localappdata%\Microsoft\Edge\User Data` for Edge. Double click the chrome_debug.log file.
7. Change the "In-game character name" to the name of your player character in Foundry.
8. Change the Lovense Host IP address to the Local IP of your Lovense Game Mode. (To locate this IP, open the Lovense app on your phone, select the Discover tab, then select Game Mode).
9. Click Save to exit the settings.
10. Make sure your Lovense App is on and your toy is connected. Then Click Reload Toys.
11. Click Configure Events.
12. Scroll to the bottom and click Select All.
13. Scroll down and click Save.
14. You're ready to go! To test it, try applying the Exposed or Horny conditions to your character. You can edit the strength or duration of each type of vibration by editing the values in AFLP_Lovense_Integration\data\events\games\ardisfoxxslewdpf2e\aflp.yaml.

### AFLP Release Roadmap
- 1.0.0 - Initial Release. Added new monsters, conditions, kinks and items. Added Cumflation macro.
- 2.0.0 - AFLP Lovense Integration Release
- 3.0.0 - Cum System, PDF version of the rules for non-Foundry users, a guide on using the rules
- 3.3.0 - Items Update; More items, womb tattoos, body writing, cock rings, cursed items
- 3.5.0 - Spells Update; More cantrips and levelled spells
- 3.7.0 - Monsters Update; More monsters and monster abilities
- 4.0.0 - Player Character Feats and build options

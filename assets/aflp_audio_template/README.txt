AFLP VOICE + AMBIENT SFX - ALPHA AUDIO GUIDE
============================================

This pack has two independent layers. Both are silent until you add audio, so
you can set up either one on its own.

  1) VOICE PROFILES  - per-actor character voice (moans, climax, reactions)
  2) AMBIENT SFX     - global act sounds (plaps, gluk) + event stings

Supported file types everywhere: .ogg .mp3 .wav .m4a .webm .flac .opus .aac
A random file is chosen from a folder each time it fires. README/text files and
any other non-audio files are ignored, so leave these notes in place if you like.


--------------------------------------------------------------------------------
1) VOICE PROFILES
--------------------------------------------------------------------------------
A "profile" is one folder of voice clips for a character. You can have as many as
you want (one per VA, per creature type, per mood, whatever).

SETUP
  - Pick a base voice folder somewhere in your Foundry data (e.g. an "aflp-voices"
    folder under uploads).
  - In module settings, set "Voice - Sound Folder" to that base folder.
  - Each subfolder of the base is one profile (the folder name is the profile name).
  - On an actor's AFLP sheet tab, pick the profile from the Voice dropdown.
    Test steps through the clips one per click; Rescan re-reads the folder.

PROFILE FOLDER LAYOUT  (see voice-profile-template/ExampleProfile)
  <base>/<ProfileName>/
    moan/1 .. moan/6   the actor's act vocalization. Fires on arousal climbs AND on
                       every sexual advance (a moan at the current tier). 1 = soft, 6 = peak.
                       This is the single source for "sounds during the act" - there is
                       no separate advance folder.
    climax/        orgasm
    oral/          being orally used (gag / blowjob VO) - plays instead of a moan when a
                   partner is in an oral position on this actor
    struggle/      entered a Dominating / Submitting role
    defeated/      gained Defeated
    mindbreak/     gained Mind Break
    cumflation/    optional - cumflation tier increase. If absent, a moan plays instead.
    edge/          optional - edged (climax denied). If absent, a moan plays instead.

  Required folders are really just moan/1..6, climax, and oral. Everything else is an
  optional distinct sound; empty optional folders are fine.


HARVESTING THE OpenNSFW VA PACKS
  The VA packs are not uniform, so this is a manual copy. Rough mapping:
    VA "orgasm"                  -> climax/
    VA "moans" / "moaning"       -> spread across moan/1..6 (soft -> intense)
    VA pitch packs (high/med/low)-> use as moan tiers (low = 1-2, high = 5-6)
    VA "breathing" / "breaths"   -> moan/1
    VA "oral" / "blowjob"        -> oral/
    VA "gasping"                 -> moan/2-3
    VA "dialogue" / "dirty talk" -> skip (or a future dialogue feature)
    VA "pain" / "strained"       -> struggle/ or defeated/


--------------------------------------------------------------------------------
2) AMBIENT SFX
--------------------------------------------------------------------------------
Global, profile-independent act sounds and event stings. Driven by the position's
HOLE, so every penetrative/oral position is covered automatically.

CATEGORIES  (see ambient-sfx-template/assets/sfx)
    plap/        any vaginal or anal position (penetration)
    gluk/        any oral position
    schlick/     fingering
    cum/         plays once on climax
    inflation/   plays once on a cumflation tier-up
    title/       plays once when any actor earns a new Title

SETUP - two ways, pick one:

  A) DROP THE OpenNSFW SFX PACK IN AS-IS  (easiest)
     - Put the whole "OpenNSFW SFX" folder wherever you want, or copy it into the
       module at modules/ardisfoxxs-lewd-pf2e/assets/sfx.
     - In module settings set "Ambient SFX - Sound Folder" to that folder.
     - The scan is recursive and recognizes the pack's own folder names, so these
       are picked up automatically:
         plap      <- Plaps, Skin Slides, Sliding In & Out, Wet Sounds, Squish & Knots
         gluk      <- Oral - Mouth
         schlick   <- Fingering & Grinding
         cum       <- Cum
         inflation <- Inflation & Vore
       (title has no pack equivalent - add your own.)

  B) CURATE INTO CLEAN CATEGORY FOLDERS
     - Drop the bundled assets/sfx folder into the module (or set the SFX folder
       to your own base) and put clips directly into plap/ gluk/ schlick/ cum/
       inflation/ title/. Subfolders inside each are scanned recursively too.

You can mix both: clean folders and pack folders are both scanned.


--------------------------------------------------------------------------------
SETTINGS RECAP
--------------------------------------------------------------------------------
  Voice - Enable                 (on)
  Voice - Sound Folder           your voice profiles base
  Voice - Volume / Mute (local)  per-client
  Ambient SFX - Enable           (on)
  Ambient SFX - Sound Folder     blank = module assets/sfx, or point at a pack
  Ambient SFX - Volume           per-client

After adding or moving files, hit Rescan on a sheet (voices) or just reload;
SFX rescans automatically when the folder setting changes.

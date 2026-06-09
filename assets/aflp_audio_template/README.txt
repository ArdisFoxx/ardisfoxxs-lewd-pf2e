AFLP VOICE PROFILES - CUSTOM AUDIO GUIDE
========================================

Voice and ambient SFX audio ships in the free AFLP Soundpack module and loads
automatically once that module is installed and enabled. You do NOT need to add
any files here for the built-in audio to work.

This folder is only for adding your OWN extra voice profiles, on top of the ones
the soundpack provides. Ambient SFX cannot be customised - it is supplied by the
soundpack only - so there is no SFX setup here.

Supported file types: .ogg .mp3 .wav .m4a .webm .flac .opus .aac
A random file is chosen from a folder each time it fires. README/text files and
any other non-audio files are ignored, so leave these notes in place if you like.


--------------------------------------------------------------------------------
ADDING YOUR OWN VOICE PROFILES
--------------------------------------------------------------------------------
A "profile" is one folder of voice clips for a character. You can have as many as
you want (one per VA, per creature type, per mood, whatever). A profile here with
the same name as a bundled soundpack profile overrides it.

SETUP
  - Pick a base voice folder somewhere in your Foundry data (e.g. an "aflp-voices"
    folder under your user data).
  - In Module Settings, set "Voice Profiles - Extra Custom Folder" to that base.
  - Each subfolder of the base is one profile (the folder name is the profile name).
  - On an actor's AFLP sheet tab, pick the profile from the Voice dropdown.
    Test steps through the clips one per click; Rescan re-reads the folder.

PROFILE FOLDER LAYOUT  (see voice-profile-template/ExampleProfile)
  <base>/<ProfileName>/
    moan/1 .. moan/6   the actor's act vocalisation. Fires on arousal climbs AND on
                       every sexual advance (a moan at the current tier). 1 = soft,
                       6 = peak. This is the single source for "sounds during the
                       act" - there is no separate advance folder.
    climax/        orgasm
    oral/          being orally used (gag / blowjob VO) - plays instead of a moan when
                   a partner is in an oral position on this actor
    struggle/      entered a Dominating / Submitting role
    defeated/      gained Defeated
    mindbreak/     gained Mind Break
    cumflation/    optional - cumflation tier increase. If absent, a moan plays instead.
    edge/          optional - edged (climax denied). If absent, a moan plays instead.

  Required folders are really just moan/1..6, climax, and oral. Everything else is an
  optional distinct sound; empty optional folders are fine.


HARVESTING THE OpenNSFW VA PACKS
  The VA packs are not uniform, so this is a manual copy. Rough mapping:
    VA "orgasm"                   -> climax/
    VA "moans" / "moaning"        -> spread across moan/1..6 (soft -> intense)
    VA pitch packs (high/med/low) -> use as moan tiers (low = 1-2, high = 5-6)
    VA "breathing" / "breaths"    -> moan/1
    VA "oral" / "blowjob"         -> oral/
    VA "gasping"                  -> moan/2-3
    VA "dialogue" / "dirty talk"  -> skip (or a future dialogue feature)
    VA "pain" / "strained"        -> struggle/ or defeated/


--------------------------------------------------------------------------------
SETTINGS RECAP (voice)
--------------------------------------------------------------------------------
  Voice Profiles - Enable                 (on)
  Voice Profiles - Extra Custom Folder    your extra profiles base (optional)
  Voice Profiles - Volume / Mute (local)  per-client

Ambient SFX (plaps, gluk, cum/cumflation stings, etc.) is provided by the AFLP
Soundpack and controlled by the separate "Ambient SFX - Enable" setting; it has no
custom folder. After adding or moving voice files, hit Rescan on a sheet or reload.

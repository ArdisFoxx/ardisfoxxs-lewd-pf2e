# AFLP Lovense Integration — GIFT Config Files

This folder contains the AFLP event configuration files for [GameInterfaceForToys (GIFT)](https://github.com/MinLL/GameInterfaceForToys).

> **You do not need to manually edit these files.**
> The AFLP Setup Wizard (AFLP sheet tab → 🖤 button) generates personalised versions pre-filled with your character name and intensity preferences, and walks you through installation step by step.

---

## What's in this folder

| File | Purpose |
|------|---------|
| `data/events/games/ardisfoxxslewdpf2e/aflp.yaml` | GIFT event triggers for AFLP 5.x |
| `data/events/events.yaml` | Tells GIFT to load the AFLP events |
| `toy-event-map.yaml` | Maps events to toy names |

These are **default templates** with `{GIFT_ACTOR_NAME}` placeholders. The wizard replaces these with your actual character name.

---

## Quick Setup

1. Download [GameInterfaceForToys 1.4.7+](https://github.com/MinLL/GameInterfaceForToys/releases/latest)
2. Extract GIFT to a permanent folder (e.g. `C:\GIFT\`)
3. In Foundry, open any character sheet → AFLP tab → 🖤 button
4. The **Setup Wizard** will guide you through the rest, including downloading your personalised config files

---

## Manual Installation (if not using the wizard)

1. Copy `data/events/games/ardisfoxxslewdpf2e/aflp.yaml` → `GIFT\data\events\games\ardisfoxxslewdpf2e\aflp.yaml`
2. Copy `data/events/events.yaml` → `GIFT\data\events\events.yaml` (merge with existing if GIFT already has one)
3. Edit `aflp.yaml` — replace `{GIFT_ACTOR_NAME}` with your character's name
4. Edit `toy-event-map.yaml` — replace `primary_toy` / `secondary_toy` with your toy names from GIFT
5. Copy `toy-event-map.yaml` → `GIFT\toy-event-map.yaml`
6. Configure GIFT (log path, character name, Lovense host) and save
7. Open Foundry using **Browser - Chrome with Logging.lnk** from the GIFT folder

> ⚠️ **You must use the logging browser shortcut** — not your regular Chrome/Edge. GIFT reads a log file that only exists when the browser is launched with logging enabled.

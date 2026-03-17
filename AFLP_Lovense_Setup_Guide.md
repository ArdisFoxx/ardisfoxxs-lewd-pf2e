# AFLP Lovense Integration — Setup Guide

AFLP supports two integration modes. The **Setup Wizard** (🖤 button on the AFLP character sheet tab) will detect which is right for you and guide you through setup automatically.

---

## Which mode should I use?

| | Lovense Remote Direct | GIFT |
|---|---|---|
| Foundry on HTTPS | ✅ Works | ✅ Works |
| Foundry on HTTP | ❌ Blocked by Chrome | ✅ Works |
| Extra software needed | No | Yes (GIFT) |
| Chaster support | ❌ | ✅ |
| Setup difficulty | Easy | Medium |

**Recommended:** Open the Setup Wizard — it detects your setup and recommends the right option.

---

## Option A — Lovense Remote Direct (easiest, HTTPS only)

Connects directly to the Lovense Remote app. No extra software needed.

### Requirements
- [Lovense Remote](https://www.lovense.com/downloads) installed (PC or phone)
- Foundry served over **HTTPS**
- Chrome may show a one-time "Allow access to local network?" prompt — click Allow

### Steps
1. Open Lovense Remote and pair your toy
2. **PC app:** Enable Game Mode in Settings
3. **Phone app:** Go to Me → Settings → Game Mode, note the IP and port shown
4. In Foundry: AFLP tab → 🖤 → Setup Wizard → Lovense Remote Direct
5. Click **Test Connection** to confirm

---

## Option B — GIFT (GameInterfaceForToys)

Works on both HTTP and HTTPS Foundry. Also supports Chaster digital chastity.

### Requirements
- [GameInterfaceForToys](https://github.com/MinLL/GameInterfaceForToys/releases/latest) installed
- Lovense Remote (PC or phone) or another supported toy interface

### ⚠️ Important — Special browser shortcut required

GIFT works by watching a browser console log file on disk. Chrome only writes to this file when launched with special flags. **You must open Foundry using the `Browser - Chrome with Logging.lnk` shortcut inside the GIFT folder** — not your regular Chrome. Using your normal browser means GIFT sees nothing and your toy won't respond.

### Steps

**1. Download and install GIFT**
Download [GIFT 1.4.7+](https://github.com/MinLL/GameInterfaceForToys/releases/latest) and extract to a permanent folder (e.g. `C:\GIFT\`).

**2. Run the Setup Wizard**
In Foundry: AFLP tab → 🖤 → Setup Wizard → GIFT

The wizard will:
- Ask if you're new to GIFT or already have it
- Let you set your character name
- Generate and download your personalised config pack (3 files)

**3. Install your config pack**
Drop the downloaded files into your GIFT folder as instructed in the wizard.

Edit `toy-event-map.yaml` to replace `primary_toy` / `secondary_toy` with your actual toy names as shown in GIFT.

**4. Configure GIFT**
Launch GIFT → Configuration:
- **Log File:** click Select Log File and find `chrome_debug.log`
  Default: `C:\Users\YourName\AppData\Local\Google\Chrome\User Data\chrome_debug.log`
- **Character Name:** must exactly match what you entered in the wizard (case-sensitive)
- **Toy Type:** Lovense
- **Lovense Host:**
  - PC app on same machine: `127.0.0.1:20010`
  - Phone app: IP shown in Lovense Remote → Me → Settings → Game Mode

Click Save.

**5. Open Foundry in the logging browser**
Use `Browser - Chrome with Logging.lnk` from the GIFT folder. Join your world through this browser.

**6. Test**
AFLP tab → 🖤 → Test Connection. Your toy should buzz.

---

## Option C — Both

Runs GIFT and Direct simultaneously. Useful if you want GIFT for Chaster lock penalties alongside faster Direct toy response. Requires HTTPS. The Setup Wizard walks through both in sequence.

---

## Chaster Integration

Chaster lets you set time-locked digital chastity sessions. When Chaster is enabled in AFLP Lovense Settings, GIFT can add time to your lock when you get Edged, Denied, cum, or suffer Mind Break.

**Requires:**
- GIFT mode (Chaster is not available in Direct mode)
- A [Chaster](https://chaster.app) developer token (easy to get — apply at the Chaster developer portal)
- Token entered in GIFT Configuration → Chaster Token
- Lock name set in GIFT matching one of your Chaster locks

Configure time ranges in AFLP Lovense Settings → Chaster section, then re-download your config pack.

---

## Troubleshooting

**Toy not responding at all (GIFT mode)**
- Are you using the GIFT logging browser shortcut, not regular Chrome?
- Is the log file path in GIFT pointing to the correct `chrome_debug.log`?
- Open the log file in a text editor — is it growing as you use the browser?

**Wrong character triggers the toy**
- Character name in GIFT and AFLP must match exactly (case-sensitive, no extra spaces)

**Direct mode — "Could not reach Lovense Remote"**
- Is Lovense Remote open with Game Mode enabled?
- Is Foundry on HTTPS? Chrome blocks local connections from HTTP pages (Private Network Access policy)
- Did you click Allow on the Chrome popup that asks about local network access?

**Events fire but toy doesn't respond**
- In GIFT, check the toy list shows your toy as connected and enabled
- In Lovense Remote, confirm the toy shows a green status

For more help, visit the AFLP community at [ArdisFoxXx on SubscribeStar](https://subscribestar.adult/ardisfoxxart)

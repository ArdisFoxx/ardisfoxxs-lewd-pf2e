# AFLP Lovense Integration — Setup Guide
**Version 5.4 | ArdisFoxXx's Lewd PF2e**

AFLP can connect to Lovense toys in two ways. The **Setup Wizard** inside Foundry handles both options and recommends the right one for your setup automatically. Open it from the AFLP character sheet tab by clicking the 🖤 button.

---

## Which mode should I use?

| | Lovense Remote Direct | GIFT |
|---|---|---|
| Foundry on HTTPS | ✅ Recommended | ✅ Works |
| Foundry on HTTP | ❌ Requires HTTPS | ✅ Works |
| Extra software needed | No | Yes (free) |
| Chaster support | No | Yes |
| Setup time | ~2 minutes | ~10 minutes |
| Vibration patterns | Rich per-event patterns | GIFT config |

If you're not sure which to use, open the Setup Wizard. It detects whether your Foundry instance is on HTTPS and recommends accordingly.

---

## Option A: Lovense Remote Direct

Connects directly to the Lovense Remote app over your local network. No extra software needed. AFLP sends rich per-event vibration patterns using the Lovense Pattern API.

### What you need
- [Lovense Remote](https://www.lovense.com/downloads) installed and open (PC or iOS/Android)
- Foundry served over HTTPS
- Chrome will show a one-time "Allow access to local network?" prompt on first use. Click Allow.

### PC app setup
1. Open Lovense Remote on your PC and connect your toy
2. In the app, go to **Settings → Game Mode** and enable it
3. In Foundry: open any character sheet, go to the AFLP tab, click 🖤
4. The Setup Wizard will open. Select **Lovense Remote Direct → PC App**
5. Click **Test Connection** to confirm

### Phone app setup (iOS or Android)
1. Open Lovense Remote on your phone and connect your toy
2. Tap **Me → Settings → Game Mode** and enable it. Note the IP address and port shown.
3. In Foundry: AFLP tab → 🖤 → Setup Wizard → Lovense Remote Direct → Phone App
4. Enter the IP and port from the app, then click **Test Connection**

The phone and PC running Foundry must be on the same WiFi network.

### How it works

AFLP fires vibration patterns directly using the Lovense Pattern API when in-game events occur. Each event has a distinct feel:

| Event | Pattern |
|---|---|
| Arousal (Low) | Slow sine wave build |
| Arousal (Medium) | Medium sine wave, faster |
| Arousal (High) | Rapid oscillation with peak burst |
| Edged | Ramp down, snap back high, cut |
| Cum | Staccato burst into sustained max |
| Mind Break | Sustained maximum |
| Conditions (Horny, Denied, Exposed, etc.) | Distinct steady patterns per condition |

Intensity scales to the min/max strength you configure in the AFLP Lovense settings panel.

---

## Option B: GIFT (GameInterfaceForToys)

GIFT is a free Windows app that watches your browser's console log and triggers your toy when AFLP events fire. It works on HTTP Foundry and also supports Chaster digital chastity penalties.

### What you need
- [GameInterfaceForToys 1.4.7+](https://github.com/MinLL/GameInterfaceForToys/releases/latest) downloaded and extracted
- Lovense Remote open with your toy connected

### ⚠️ The logging browser — read this first

GIFT works by watching a log file that Chrome writes to disk. Chrome only writes that file when launched with special command-line flags. **You must open Foundry using the `Browser - Chrome with Logging.lnk` shortcut inside the GIFT folder** every session. Your regular Chrome shortcut does not enable logging, so GIFT will see nothing and your toy will not respond.

### Setup steps

**Step 1: Download GIFT**
Download the latest release from [GitHub](https://github.com/MinLL/GameInterfaceForToys/releases/latest) and extract it to a permanent folder such as `C:\GIFT\`.

**Step 2: Run the Setup Wizard in Foundry**
Open any character sheet, go to the AFLP tab, click 🖤. Select **GIFT** in the wizard. It will:
- Ask whether you are new to GIFT or already have it installed
- Let you enter your character name
- Generate and download a personalised config pack (3 files)

**Step 3: Install the config files**
Drop the 3 downloaded files into your GIFT folder, replacing the existing ones if prompted. Then open `toy-event-map.yaml` in a text editor and replace `primary_toy` and `secondary_toy` with your toy names exactly as they appear in GIFT's connected toys list.

**Step 4: Configure GIFT**
Launch `GameInterfaceForToys.exe` and click **Configuration**:

- **Log File:** Click *Select Log File*. In the file picker's address bar at the top, paste:
  `%localappdata%\Google\Chrome\User Data\chrome_debug.log`
  Press Enter to navigate there, then select the file. Note: this file only exists after you have used the logging browser shortcut at least once. If it is not there, complete Step 5 first, then return here.
- **Character Name:** Enter your character name exactly as you entered it in the wizard (case-sensitive)
- **Toy Type:** Lovense
- **Lovense Host:**
  - PC app on the same machine: `127.0.0.1:20010`
  - Phone app: the IP and port shown in Lovense Remote under Me → Settings → Game Mode

Click Save.

**Step 5: Open Foundry using the logging browser**
From your GIFT folder, open `Browser - Chrome with Logging.lnk`. Use this browser to access Foundry every session. Do not use your regular Chrome shortcut.

**Step 6: Test**
In Foundry: AFLP tab → 🖤 → Lovense Settings. Click a Test button next to any event. Your toy should respond.

---

## Option C: Both

Runs Direct and GIFT at the same time. GIFT handles Chaster lock penalties while Direct drives the toy with AFLP's richer pattern sequences. Requires HTTPS. The Setup Wizard walks through both in two steps.

---

## Chaster Integration (GIFT only)

Chaster is a digital chastity platform. When enabled, GIFT can automatically add time to your Chaster lock when specific in-game events occur: Edged, Denied, Cum, and Mind Break.

**Requirements:**
- GIFT mode (Chaster does not work in Direct-only mode)
- A Chaster developer token — apply at [chaster.app](https://chaster.app) developer settings
- Token and lock name entered in GIFT's Configuration screen

**Setup:**
1. In the AFLP Lovense settings panel (🖤 after initial setup), expand the **Chaster** section
2. Enable Chaster and configure the time ranges for each event
3. Re-download your config pack from the settings panel — the updated `aflp.yaml` will include the Chaster entries
4. Enter your Chaster token and lock name in GIFT → Configuration

---

## Adjusting event intensity

Open the AFLP Lovense settings panel (🖤 button, after initial setup). Each event row has sliders for minimum and maximum strength (0–100%) and duration. AFLP picks a random value within the range each time an event fires, so the response feels organic rather than mechanical.

You can also disable individual events, or test any event without triggering it in-game using the Test button on each row.

---

## Troubleshooting

**"Could not reach Lovense Remote" (Direct mode)**
- Is Lovense Remote open and is your toy shown as connected?
- Is Game Mode enabled in Lovense Remote settings?
- Is Foundry on HTTPS? Chrome blocks local connections from HTTP pages due to its Private Network Access policy.
- Did you click Allow on the Chrome network access prompt? It only appears once per browser session.

**Toy not responding (GIFT mode)**
- Are you using `Browser - Chrome with Logging.lnk` from the GIFT folder, not regular Chrome?
- Does the log file exist? Open File Explorer and paste `%localappdata%\Google\Chrome\User Data\chrome_debug.log` into the address bar to check.
- Open the log file in Notepad — it should be updating as you use the browser. If it is empty or not changing, the logging browser is not being used.
- Does the character name in GIFT exactly match the one in AFLP? It is case-sensitive.

**Wrong character triggers the toy**
- Check that the character name in GIFT Configuration matches your AFLP character name exactly, including capitalisation and spaces.

**Events fire but toy does not respond**
- In GIFT, check the toy list shows your toy as connected with a green status
- In Lovense Remote, confirm the toy appears connected

For more help, visit the AFLP community at [ArdisFoxXx on SubscribeStar](https://subscribestar.adult/ardisfoxxart)

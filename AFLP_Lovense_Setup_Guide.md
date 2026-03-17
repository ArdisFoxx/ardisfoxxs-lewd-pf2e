# AFLP Lovense Integration — Setup Guide

This guide covers both integration modes: **GIFT (Log-based)** and **Direct (Lovense Connect)**.

---

## Which Mode Should I Use?

| | GIFT | Direct |
|---|---|---|
| Foundry over HTTP | ✅ Works | ❌ Blocked by browser |
| Foundry over HTTPS | ✅ Works | ✅ Works |
| Requires extra software | Yes (GIFT) | No |
| Chaster support | ✅ Yes | ❌ No |
| Setup difficulty | Medium | Easy |
| Response latency | ~100–300ms | ~30–80ms |
| Multiple toy types (estim etc.) | ✅ Yes (via GIFT) | ❌ Vibrators only |

If you self-host Foundry at home over plain HTTP, use **GIFT mode**. If you host over HTTPS (e.g. via a reverse proxy or The Forge), **Direct mode** is simpler and faster. You can also run **Both** if you want Chaster lock penalties from GIFT alongside faster toy response from Direct.

---

## Part 1 — Direct Mode (Lovense Connect)

Direct mode sends commands straight from Foundry to the Lovense Connect app on your PC. No extra software needed.

### Requirements
- Lovense Connect for PC installed ([download from lovense.com](https://www.lovense.com/cam-model/guide/pc))
- Foundry served over **HTTPS** (required — browsers block HTTP pages calling HTTPS local APIs)
- Your toy paired with Lovense Connect

### Setup Steps

**1. Install and open Lovense Connect for PC**

Download Lovense Connect from the Lovense website and install it. Open it and pair your toy via Bluetooth.

**2. Enable Game Mode in Lovense Connect**

In Lovense Connect, go to **Settings → Game Mode** and make sure it is enabled. This exposes the local HTTP API that AFLP uses.

**3. Open AFLP Lovense Settings**

In Foundry, open any character sheet, switch to the AFLP tab, and click the 🖤 button in the header.

**4. Select Direct mode**

In the Integration Mode section, select **Direct (Lovense Connect)**.

**5. Set the host and port**

For Lovense Connect PC, the defaults are correct:
- Host: `127-0-0-1.lovense.club`
- Port: `30010`

If you are using the **Lovense Connect mobile app** instead of the PC app, change the host to your phone's local IP address (shown in the Lovense Connect app under Settings → Game Mode) and the port to the one listed there (usually `30010`).

**6. Click Test Connection**

Click the **Test Connection** button. If everything is working, you'll see a green message listing your connected toys. If you see a red error, check:
- Lovense Connect PC is running
- Game Mode is enabled in Lovense Connect
- Foundry is being accessed over HTTPS, not HTTP

**7. Configure events and save**

Adjust strength and duration sliders for each event to your preference. Click **Save**.

---

## Part 2 — GIFT Mode (GameInterfaceForToys)

GIFT is a free desktop application that watches Foundry's browser console log and fires your toy in response to in-game events. It also supports Chaster digital chastity integration.

### Requirements
- GIFT installed ([download from GitHub](https://github.com/MinLL/GameInterfaceForToys/releases/latest))
- Chrome or Edge browser (needed for console log file support)
- Lovense Connect app (PC or mobile) OR Buttplug.io / XToys

### Step 1 — Download and Install GIFT

Go to the [GIFT releases page](https://github.com/MinLL/GameInterfaceForToys/releases/latest) and download the latest `.zip`. Extract it to a permanent location — somewhere like `C:\GIFT\` works well. Do not put it in a temp folder or Downloads.

### Step 2 — Launch Chrome or Edge with Logging Enabled

GIFT reads your browser's console log file. To generate that file, you need to launch Chrome or Edge with a special flag.

The GIFT folder includes two shortcuts:
- `Browser - Chrome with Logging.lnk`
- `Browser - Edge with Logging.lnk`

**Use one of these shortcuts instead of your normal browser shortcut.** This launches the browser with console logging enabled and tells it to write to a file GIFT can read.

If you prefer to create your own shortcut, the launch flags needed are:
```
--enable-logging --v=1 --log-file="C:\path\to\chrome_debug.log"
```

> ⚠️ You must use this special browser instance to access Foundry, not your normal browser. The log file will not be generated otherwise.

### Step 3 — Configure GIFT

Launch `GameInterfaceForToys.exe`. The main window will open. Click **Configuration**.

**Log File Path**
Click **Select Log File** and navigate to the Chrome/Edge debug log. The default location is:
- Chrome: `C:\Users\YourName\AppData\Local\Google\Chrome\User Data\chrome_debug.log`
- Edge: `C:\Users\YourName\AppData\Local\Microsoft\Edge\User Data\edge_debug.log`

If you used the included shortcuts, the path is already configured in `settings.yaml` — check there if unsure.

**Character Name**
Enter your character's name exactly as it appears in Foundry. This is used to match log lines to your character. It is case-sensitive. For example: `Synne` not `synne`.

**Toy Type**
Select **Lovense** from the toy type dropdown. If you are using a different protocol (Buttplug.io, XToys), select accordingly.

**Lovense Host**

- If running Lovense Connect on the same PC: `127.0.0.1:20010`
- If using the Lovense mobile app on your phone: enter your phone's LAN IP and port (shown in the app under Game Mode). Example: `192.168.1.42:20010`

Click **Save**.

### Step 4 — Generate and Install the AFLP Event Config

GIFT needs a config file telling it which log lines to react to. AFLP generates this for you.

1. In Foundry, open any character sheet and click the 🖤 button
2. Select **GIFT (Log-based)** mode
3. Set your character name in the GIFT Settings section
4. Adjust event settings if desired
5. Click **Download GIFT Config**

This downloads two files:
- **`aflp.yaml`** — the event triggers
- **`toy-event-map.yaml`** — which toys fire for which events

**Install the event config:**

Copy `aflp.yaml` to:
```
GIFT\data\events\games\ardisfoxxslewdpf2e\aflp.yaml
```
(Replace the existing file.)

**Install the toy map:**

Open `toy-event-map.yaml` in a text editor. You will see entries like:
```yaml
data_events_games_ardisfoxxslewdpf2e_aflp.yaml_Cum:
- primary_toy
- secondary_toy
```

Replace `primary_toy` and `secondary_toy` with the exact toy names shown in GIFT's toy list. For example, if your toys are named `diamo` and `hush`:
```yaml
data_events_games_ardisfoxxslewdpf2e_aflp.yaml_Cum:
- diamo
- hush
```

Save the file and copy it to:
```
GIFT\toy-event-map.yaml
```
(Replace the existing file.)

### Step 5 — Test the Connection

1. Make sure GIFT is running and has loaded (the GIFT window should show your character name and log file path)
2. In Foundry, open the 🖤 settings dialog and click **Test Connection** — this sends a test log line
3. Watch the GIFT log window — you should see the line appear and your toy should buzz briefly

If nothing happens:
- Make sure you opened Foundry in the logging-enabled browser, not your regular browser
- Check that the character name in GIFT matches exactly what AFLP shows
- Check that the log file path in GIFT is correct — open the file in a text editor to confirm it is growing as you use the browser

### Step 6 — Chaster (Optional)

Chaster is a digital chastity platform that lets you set time-locked sessions on chastity devices. GIFT can add lock time when certain events fire in AFLP (getting Edged, being Denied, cumming, or suffering Mind Break).

To use Chaster:
1. Create a Chaster account at [chaster.app](https://chaster.app)
2. Apply for developer access at the Chaster developer portal (it is approved quickly)
3. Generate a developer token and enter it in GIFT's Configuration under **Chaster Token**
4. Set a lock name in GIFT that matches one of your Chaster locks
5. In the AFLP 🖤 settings dialog, expand **Chaster Integration**, enable it, and set your preferred time penalty ranges for each event
6. Click **Download GIFT Config** again and reinstall `aflp.yaml` — the file will now include Chaster entries

---

## Troubleshooting

**Toy doesn't react at all**

- GIFT mode: confirm you are using the logging browser, not a regular browser
- Direct mode: confirm Foundry is on HTTPS and Lovense Connect is running with Game Mode enabled
- Check the Foundry browser console (F12) for any AFLP Lovense error messages

**Toy reacts to wrong character / everyone's events fire**

- GIFT mode: the character name in GIFT settings.yaml must exactly match the name in the AFLP 🖤 settings. Check capitalisation and spacing.

**Events fire but toy doesn't respond**

- In GIFT, check the toy list shows your toy as connected and enabled
- In Lovense Connect, confirm the toy shows a green status

**Direct mode: "Could not reach Lovense Connect" error**

- Lovense Connect PC may not be running — open it and make sure your toy is paired
- Game Mode must be enabled in Lovense Connect settings
- Most commonly: Foundry is being accessed over HTTP, not HTTPS. Direct mode cannot work without HTTPS because browsers block mixed-content requests.

**Events feel wrong (too weak, too short, etc.)**

Open the 🖤 settings and adjust the strength and duration sliders for each event. Click a Test button to feel the result immediately without waiting for the event to happen in game.

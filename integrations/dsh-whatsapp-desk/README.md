# dsh-whatsapp-desk

An optional **DSH right-Sidebar tab** for the local WhatsApp Desk app in this repo.

- Adds a **WhatsApp** tab to [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar).
- Frames the local dashboard at `http://127.0.0.1:3000`.
- Starts the dashboard automatically on DSH boot if it is not already running.
- Shows a clear starting/offline card with a Retry action when the local server is unavailable.

The dashboard, WhatsApp session, message cache, and media stay in the main app folder. This plugin only hosts and starts it.

## Install

Install it into a DSH profile with the bundled tarball:

```powershell
$dsh = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $dsh plugin --profile desktop add "<path-to-this-repo>\dist\dsh-whatsapp-desk-1.0.1.tgz"
```

Then **restart DeepSeek Harness** once. Host-side plugin changes load at boot.

## Use

1. Open the conversation's right Sidebar.
2. Click the **+** tab menu.
3. Choose **WhatsApp**.
4. Link WhatsApp by QR if this is the first run.

The tab is a normal side card, so it can be moved, closed, and reopened. The local app is a
single instance: if `start.bat` is already running, the plugin reuses it rather than starting a
second one.

## Configuration

The host half accepts an optional config object. By default it looks for the app at
`%USERPROFILE%\Desktop\DSH\Whatapps`; set `WHATSAPP_DESK_DIR` or add an override to the profile's
`cordis.patch.yml` if the app folder lives elsewhere:

```yaml
- id: whatsapp-desk
  name: "dsh-whatsapp-desk"
  config:
    appDir: "D:\\Tools\\WhatsApp-Desk"
    autoStart: true
```

The client iframe is intentionally fixed to port `3000`, matching `start.bat`. If you change the
app's port, update `BASE` in `lib/client.js` as well.

## Development

After editing `lib/`, copy the files into the installed profile package (or repack and reinstall),
then restart DSH. There is no build step; `lib/client.js` is the hand-written client module and
`lib/index.js` is the host half.

## Safety

- The tab is only a local iframe; no WhatsApp credentials are exposed to DSH or the plugin.
- The app continues to listen on `127.0.0.1` only.
- The app permits framing only from local pages, not from remote sites.

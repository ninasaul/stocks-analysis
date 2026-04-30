# TuringFin Desktop

Tauri v2 desktop shell for the web app.

## Development

Start the web app first:

```bash
npm run dev
```

Then start Tauri in another terminal:

```bash
npm run desktop:dev
```

The desktop app loads `http://localhost:4000/app/analyze` in development (middleware or pages will redirect to login when required).

## Production Build

Production builds set the window initial URL to your remote Web origin (default path `/app/analyze` when `DESKTOP_WEB_URL` has no path). Set `DESKTOP_WEB_URL` before building:

```bash
DESKTOP_WEB_URL=https://your-web-domain.com npm run desktop:build
```

Use `DESKTOP_WEB_PATH` to override the path:

```bash
DESKTOP_WEB_URL=https://your-web-domain.com DESKTOP_WEB_PATH=/app/analyze npm run desktop:build
```

On Windows, run the same command from PowerShell:

```powershell
$env:DESKTOP_WEB_URL = "https://your-web-domain.com"
npm run desktop:build
```

The generated installer lives under `apps/desktop/src-tauri/target/release/bundle`.

On macOS, the build creates:

- `apps/desktop/src-tauri/target/release/bundle/macos/TuringFin.app`
- `apps/desktop/src-tauri/target/release/bundle/dmg/TuringFin_0.1.0_aarch64.dmg`

## Updates

This setup loads the web UI from `DESKTOP_WEB_URL`, so UI changes can be shipped by deploying the web app. Native shell changes still require a new desktop release.

For native app self-updates, add Tauri's updater plugin and host a signed update manifest. Tauri requires signing keys and a release endpoint for updater-based application updates.

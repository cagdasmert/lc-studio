# Building the Windows executable

The app is Tauri v2. A Windows build has to be produced **on Windows** — cross-compiling
from macOS is not reliable (WebView2 linking + MSI/NSIS bundling break). Run the steps
below on a Windows 10/11 x64 machine.

## 1. One-time prerequisites (on the Windows machine)

| Tool | Install |
|------|---------|
| **Microsoft C++ Build Tools** | Install "Visual Studio 2022 Build Tools" and check **Desktop development with C++** — <https://visualstudio.microsoft.com/visual-cpp-build-tools/> |
| **Rust** (MSVC toolchain) | <https://rustup.rs> → run `rustup-init.exe`, accept defaults |
| **Node.js 20+** | <https://nodejs.org> (LTS). This repo is developed on Node 22. |
| **WebView2 runtime** | Preinstalled on Windows 11 and up-to-date Windows 10. If missing: <https://developer.microsoft.com/microsoft-edge/webview2/> (Evergreen Bootstrapper) |

Verify in a fresh terminal (PowerShell):

```
rustc --version
cargo --version
node --version
npm --version
```

## 2. Get the source

```
git clone https://github.com/cagdasmert/lc-studio.git
cd lc-studio
```

(Or copy the project folder over — but exclude `node_modules`, `dist`, and `src-tauri/target`.)

## 3. Build

```
npm install
npm run tauri build
```

First build compiles the Rust crate and can take 5–15 min. Later builds are incremental.

## 4. Where the output lands

```
src-tauri\target\release\
  Local Content Studio.exe                     <- standalone executable

src-tauri\target\release\bundle\nsis\
  Local Content Studio_0.1.0_x64-setup.exe     <- installer (recommended to share)

src-tauri\target\release\bundle\msi\
  Local Content Studio_0.1.0_x64_en-US.msi     <- MSI installer
```

Give the tester the **NSIS `-setup.exe`** — it installs the app and pulls in the WebView2
runtime automatically if it's missing. The bare `.exe` also runs on its own but needs the
WebView2 runtime already present and has no Start-menu entry.

## Notes

- The build is unsigned, so Windows SmartScreen will show a "Windows protected your PC"
  prompt on first run. The tester clicks **More info → Run anyway**. Code signing needs a
  certificate and is a separate step.
- To build just one installer type, e.g. NSIS only:
  `npm run tauri build -- --bundles nsis`
- If `npm install` fails building the `canvas` package, install its build deps or remove
  it from `devDependencies` (it's only used by the test suite, not the app).

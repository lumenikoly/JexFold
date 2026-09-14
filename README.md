# JexFold

**English** · [Русский](README.ru.md)

JexFold is a local application for reversible JPEG-to-JPEG XL recompression. It runs as a desktop app and as a static browser app; the current version is **0.0.2**.

The application uses the official `cjxl` and `djxl` tools, processes everything locally, and verifies every compression by reconstructing the original JPEG and comparing it byte for byte. Originals are never deleted, and existing output files are never overwritten.

## Features

- JPEG → JXL compression and standard conversion of arbitrary JXL files to JPEG;
- file and folder selection, drag-and-drop, and recursive `.jpg`/`.jpeg` discovery;
- preservation of the source folder structure in a separate destination directory;
- strict JPEG → JXL → JPEG verification and source SHA-256 calculation;
- pause, cancellation, configurable parallel load, and a paginated queue;
- optional rejection of JXL output that is not smaller than the source JPEG;
- English and Russian UI, system-language detection, and a saved language preference;
- local processing with no network requests while converting files.

The application does not change JPEG quality, dimensions, or embedded metadata. When the metadata option is enabled, the desktop build also preserves modification/access times, POSIX permissions on macOS/Linux and the original creation time on Windows.

## Installation

### Web

The static web app is published by the dedicated **Web / GitHub Pages** workflow.
It performs conversion in Web Workers with `libjxl.wasm`; photos are not uploaded.
Chrome and Edge can write a preserved folder tree to a chosen destination.
Other browsers offer converted files as downloads. After the first complete load,
the installed service worker keeps the app available offline.

Repository maintainers must select **GitHub Actions** as the Pages source once in
the repository settings.

### Desktop

Ready-to-use packages are published on the repository's Releases page:

- Windows 10/11 — NSIS installer (`.exe`);
- macOS 11 or later — disk image (`.dmg`);
- Debian/Ubuntu — `.deb` package; other Linux distributions — `.AppImage`.

Version 0.0.2 is unsigned. Windows SmartScreen and macOS Gatekeeper may warn about an unknown publisher. Verify downloads against the `SHA256SUMS` file attached to each release.

## Usage

1. Select JPEG/JXL files or a source folder.
2. Select a separate destination folder. It must not be nested inside the source folder, and the source must not be nested inside it.
3. Choose the conversion mode and processing settings.
4. Click **Start compression** or **Convert to JPEG**.
5. Review the result in the application.

Example output layout:

```text
Source:      /photos/2026/IMG_001.JPG
Destination: /archive
Result:      /archive/photos/2026/IMG_001.jxl
```

The JPEG extension is replaced with `.jxl`. If identically named `.jpg` and `.jpeg` files share a folder, they map to the same result; the first is created and the other receives `existing`. That status only means the destination file was already present and was not overwritten; its contents are not reverified on a later run.

### Language

The interface supports English and Russian. The default **System** setting follows the operating-system/browser language and falls back to English when it is unsupported. A manually selected language is saved locally.

Translations live in `src/i18n/locales/` and use stable semantic message IDs, so more languages can be added without changing the conversion core.

## Important limitations

- The destination filesystem must support hard links, such as NTFS, APFS, or ext4. FAT/exFAT is unsupported; SMB/NFS behavior depends on the implementation.
- Each active job temporarily needs enough free space for the JPEG, JXL, and reconstructed JPEG.
- Embedded EXIF, ICC, IPTC, and XMP are retained as part of the original JPEG and covered by byte-for-byte restoration checks. The desktop build also preserves modification/access times, POSIX permissions on macOS/Linux, and the original creation time on Windows. ACLs, Windows attributes, Finder tags, extended attributes, and separate XMP/AAE files are not copied.
- Symbolic links are not traversed. A queue may contain at most 250,000 files.
- Before deleting any originals yourself, verify your backup and restore several representative files.

## Running from source

You need Node.js 22.12 or later, Rust 1.88, Git, CMake, and a C/C++ toolchain. Install the [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/), then run:

```bash
pnpm install --frozen-lockfile
pnpm run codecs:build
pnpm run tauri -- dev
```

`codecs:build` downloads the official libjxl v0.12.0 source, verifies the expected commit, builds `cjxl` and `djxl` for the current OS and architecture, and places them in `src-tauri/resources/codecs/`. Codecs built for one platform cannot be bundled for another.

Ubuntu 22.04/24.04 additionally requires:

```bash
sudo apt-get update
sudo apt-get install -y build-essential git cmake pkg-config \
  libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

Windows builds use MSVC, Visual Studio Build Tools, and the Windows SDK. macOS builds require Xcode Command Line Tools; the configured minimum system version is 11.0.

## Checks and builds

The project keeps linting and formatting commands in the repository so local checks match CI:

```bash
pnpm run lint:web
pnpm run typecheck
pnpm run format:check
pnpm run lint:rust
pnpm run format:cpp:check
```

`pnpm run lint` additionally runs Clippy, clang-tidy, ShellCheck, and actionlint. The native commands need the corresponding tools installed; `lint:cpp` expects the pinned libjxl checkout from `pnpm run codecs:build`.

```bash
pnpm run check
pnpm run wasm:build
pnpm run web:build
cargo test -p jxl-core --locked
cargo clippy -p jxl-core --all-targets --locked -- -D warnings
pnpm run codecs:build
pnpm run test:integration
pnpm run desktop:build
pnpm run desktop:portable
```

Installers are created under `target/release/bundle/`. On Windows, `desktop:portable` creates a ZIP archive there that can be extracted anywhere and launched through `JexFold.exe` without installation. Keep the archive's `codecs` directory next to the executable. The integration test runs real `cjxl` and `djxl` binaries against baseline and progressive JPEG files and requires exact reconstruction. See [docs/TESTING.md](docs/TESTING.md) for the full checklist.

For a complete local release build, run the target matching the host operating system:

```bash
make release-windows  # NSIS installer and portable ZIP
make release-macos    # DMG
make release-linux    # DEB and AppImage
```

Each target installs the locked dependencies, runs the checks, builds the platform codecs, and creates the packages. Outputs are written under `target/release/bundle/`; `target/`, built codecs, and `release-assets/` are ignored by Git.

If the prerequisite check reports that Cargo is missing on Windows, install Rust and restart the terminal before running the build again:

```powershell
winget install --id Rustlang.Rustup -e
```

## Manual release

Releases are intentionally started by hand:

1. Update the version in `package.json`, both Cargo manifests, and `src-tauri/tauri.conf.json`, then add a section to `CHANGELOG.md`.
2. Make sure the changes are on `main` and CI passes.
3. Open **Actions → Release → Run workflow**.
4. Enter the version without the `v` prefix, for example `0.0.2`.
5. The workflow checks versions and tags, builds packages on Windows, macOS, and Linux, creates `SHA256SUMS`, tags the commit, and publishes the GitHub Release.

Publication stops if versions disagree, the workflow is not run from `main`, the tag already exists, release notes are empty, or an installer is missing. Windows and macOS packages are currently unsigned.

## Project structure

```text
crates/jxl-core/        standalone Rust scanning and conversion core
src-tauri/              Tauri desktop shell, commands, and bundle configuration
src/                    React and TypeScript interface, including shared i18n
scripts/                official codec build and verification scripts
tests/                  configuration, formatting, and localization checks
.github/workflows/      CI and manually triggered release workflow
docs/                   architecture, security, and testing documentation
```

Additional documents: [architecture](docs/ARCHITECTURE.md), [security boundaries](docs/SECURITY.md), [changelog](CHANGELOG.md), and [third-party licenses](THIRD_PARTY.md).

## License

The project's own code is available under the [MIT License](LICENSE). JPEG XL and its related components retain their respective licenses; their license texts are included in release packages.

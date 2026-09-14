# AGENTS.md

This file contains the repository-level instructions for coding agents working on JexFold.

## Project overview

JexFold is a local-first JPEG to JPEG XL conversion utility. Its core promise is reversible JPEG recompression: after a successful conversion, the original JPEG must be reconstructable byte-for-byte.

Supported application targets in this repository:

- Web / PWA: static Vite output, Web Workers, and WebAssembly.
- Desktop: Windows, macOS, and Linux through Tauri 2.

Technology stack:

- React and TypeScript for the shared UI;
- Vite for the Web build;
- Tauri 2 and Rust for the desktop shell;
- the `jxl-core` Cargo crate for platform-independent conversion logic;
- official `cjxl` and `djxl` binaries for the native desktop path;
- a small C++ wrapper over libjxl compiled to WebAssembly for the Web path;
- pnpm for JavaScript dependencies and Cargo for Rust dependencies.

The Web application must remain deployable as a fully static artifact. Image processing is local; do not add a server dependency or upload user media.

## Core invariants

### Reversibility

A JPEG-to-JXL conversion succeeds only after this complete pipeline succeeds:

```text
JPEG -> lossless JPEG XL encoding -> JPEG reconstruction -> byte comparison -> publish result
```

Verification must compare both the byte length and every byte of the original and reconstructed JPEG. A hash may be added for diagnostics, but it does not replace the byte comparison.

### Source preservation

Source files must remain intact throughout conversion. Never delete, overwrite, or mutate the original JPEG as part of a normal conversion.

Publish a result only after encoding, reconstruction, exact verification, and a successful safe write. Existing destination files are preserved and skipped by default.

### Local processing and offline behavior

The conversion path must stay on the user's device. The Web path runs through a browser worker and libjxl.wasm. The service worker may cache application assets, but user JPEG/JXL files must not be placed in the application asset cache.

### Cancellation and pause

Cancellation must leave source files intact and must not publish incomplete output. Pause normally prevents new work from starting; already-running codec processes may finish.

## Repository structure

Follow the actual repository structure when it differs from examples in other documentation:

```text
src/                         React UI, shared types, i18n, and platform abstraction
src/platform/web/            Browser filesystem, worker pool, and WebAssembly worker
src-tauri/                   Tauri commands, session state, capabilities, and packaging
crates/jxl-core/             Platform-independent scanning, conversion, and verification logic
wasm/src/                    Small C++ libjxl wrapper compiled for WebAssembly
scripts/                     Build, codec, integration, and release helpers
tests/                       Node smoke tests and project invariants
public/                      Static manifest, service worker, icons, and Web assets
docs/                        Architecture, security, and testing documentation
.github/workflows/           Build, Pages, and release workflows
Cargo.toml                   Rust workspace manifest
package.json                pnpm scripts and JavaScript dependencies
rust-toolchain.toml          Pinned Rust toolchain and required components
```

The codec build script downloads the pinned libjxl source into `.tools/`; upstream code is not application code and must not be edited or linted as project code.

## Architecture rules

### Shared UI and platform boundary

Shared React components should use common domain types and backend capabilities. Platform-specific filesystem access, Tauri IPC, browser APIs, and Worker details belong in platform or service modules rather than presentation components.

The current split is:

```text
React UI
  +-- desktop -> Tauri IPC -> src-tauri -> jxl-core -> cjxl/djxl
  `-- Web     -> WorkerPool -> Web Worker -> C++ wrapper -> libjxl.wasm
```

When changing a shared contract, inspect both the native and Web implementations.

### Rust core

`crates/jxl-core` owns platform-independent behavior:

- source scanning and extension/content checks;
- output path validation;
- conversion queue and concurrency policy;
- pause and cancellation state;
- codec process orchestration;
- exact verification and result reporting;
- structured domain errors.

Keep Tauri-specific behavior outside this crate where practical. Malformed paths, user input, and malformed image data must return errors rather than panic.

### Tauri layer

`src-tauri` owns IPC commands, application session state, resource resolution, and desktop capabilities. Do not expose generic shell or arbitrary file-write permissions to the WebView. Keep the server-owned scan plan and codec selection authoritative; do not trust the UI to provide arbitrary executable arguments or output paths.

### WebAssembly and C++

Keep `wasm/src/jexfold_codec.cc` small and limited to the libjxl bridge. Queueing, scheduling, filesystem behavior, and UI logic belong in TypeScript. Validate lengths and allocation results, release codec resources on every path, and avoid adding unrelated application logic to the wrapper.

Large buffers should be transferred between the worker and the UI where possible. Worker concurrency must remain bounded because memory usage matters more than maximum parallelism.

## Safe file handling

Treat media files as untrusted input. Validate:

- file contents, not only filename extensions;
- lengths and integer conversions;
- allocation sizes;
- codec return values and output sizes;
- source identity and unchanged-source checks where applicable.

Write through temporary files or temporary directories and publish only complete verified output. Temporary and incomplete files must remain distinguishable from final output and be cleaned up where practical. Never introduce rename-overwrite or copy fallbacks that can replace an existing result.

## TypeScript and React

Use strict TypeScript and preserve the existing compiler checks in `tsconfig.json`, including unused-value, no-fallthrough, and unchecked-index checks. Prefer explicit domain types, discriminated unions, readonly values where useful, and exhaustive handling of states.

Keep React components focused on presentation and interaction. Conversion scheduling, filesystem access, Worker management, persistence, and Tauri IPC belong in dedicated hooks or service/platform modules. Preserve the existing capability-based fallback behavior for directory access, file input, drag-and-drop, and downloads.

Do not weaken type checking or ESLint rules merely to silence a finding. If an existing architectural pattern requires a narrowly scoped exception, document the reason next to the exception.

## Rust

Prefer safe Rust and typed `Result<T, E>` error handling. Keep platform-specific code isolated. The repository pins Rust 1.88.0 in `rust-toolchain.toml`; keep `rustfmt` and Clippy behavior reproducible when warnings are treated as errors.

Do not enable broad, noisy lint groups without a concrete reason. Keep Clippy findings actionable and avoid changing behavior solely to satisfy a stylistic preference.

## C/C++ and libjxl

Only project-owned wrapper code under `wasm/src/` is in scope for clang-format and clang-tidy. Do not modify or lint `.tools/` or upstream libjxl sources.

Keep the libjxl version pinned and update it intentionally. Native and Web paths should use compatible libjxl behavior, especially for lossless JPEG recompression and reconstruction.

## Dependencies and generated assets

Add dependencies deliberately. Consider maintenance quality, maturity, bundle or binary impact, cross-platform support, and whether the dependency removes meaningful complexity. Keep `pnpm-lock.yaml` and `Cargo.lock` synchronized with dependency changes.

Do not commit generated build outputs, downloaded codecs, `target/`, `dist/`, `.tools/`, or other ignored artifacts. Do not edit generated icons or bundled upstream assets unless the task explicitly requires it.

## Security and privacy

Treat JPEG/JXL data, paths, metadata, and codec output as untrusted. Keep native boundaries narrow and avoid logging complete paths, EXIF/GPS data, image contents, or unnecessary raw metadata. Any remote telemetry or network access requires explicit design and privacy review.

Preserve the local-only behavior of conversion and the restrictive Tauri capability model. Changes affecting IPC, resource loading, process execution, or file publication need corresponding security/test review.

## Formatting and linting

Linters and formatters remain part of the project and must be run locally by the agent. They are intentionally not run by GitHub Actions workflows.

Configured tools:

- TypeScript/React: ESLint, `typescript-eslint`, React Hooks, React Refresh, and Prettier;
- TypeScript correctness: `tsc --noEmit`;
- Rust: rustfmt and Clippy;
- C/C++: clang-format and clang-tidy;
- shell scripts: ShellCheck;
- GitHub Actions: actionlint.

Useful commands:

```bash
pnpm run lint
pnpm run lint:web
pnpm run typecheck
pnpm run format
pnpm run format:check
pnpm run format:cpp:check
```

`pnpm run lint:cpp` expects the pinned libjxl checkout created by `pnpm run codecs:build`. Install missing native tools before claiming that the corresponding checks passed.

## Tests and builds

Changes affecting conversion correctness require round-trip verification. The essential invariant is:

```text
JPEG -> JXL -> reconstructed JPEG -> byte-for-byte identical
```

Representative fixtures include baseline and progressive JPEGs; preserve coverage for metadata, unusual markers, invalid input, nested output paths, existing destinations, cancellation, and source changes where the affected code supports them.

For normal source changes, run the relevant subset of:

```bash
pnpm test
pnpm run build
cargo test --workspace --locked
pnpm run test:integration
pnpm run wasm:build
```

`pnpm run codecs:build` is required before integration tests when the local codec binaries are absent. Do not silently skip a requested integration or round-trip check.

## Before making changes

Before editing code:

1. inspect the relevant package, crate, platform module, or workflow;
2. identify affected Web, desktop, native, and build paths;
3. inspect related tests and security assumptions;
4. understand the current conversion and publication pipeline;
5. keep unrelated changes separate.

Avoid destructive Git or filesystem operations. Preserve existing user changes and generated-but-untracked files unless the task explicitly covers them.

## Before finishing a task

Before the final response, for any task that changes source code or configuration, run the project lint and formatting gates locally:

```bash
pnpm run lint
pnpm run format:check
```

Also run relevant tests and builds, especially `pnpm test`, `pnpm run build`, and `cargo test --workspace --locked` for shared or conversion changes. Report the exact commands run and their result.

If a check cannot run in the current environment, state exactly which command was blocked and why. Do not describe that check as passed. Warnings should be reported even when the command exits successfully.

## Definition of done

A conversion-related change is complete only when the affected pipeline still encodes, reconstructs, verifies byte-for-byte, and safely publishes output without harming source files. A UI change is complete only when empty, progress, success, error, Web fallback, and desktop behavior remain coherent for the affected path.

Preservation of user data takes priority over convenience. Prefer simple, explicit, testable, and maintainable implementations over unnecessary abstraction.

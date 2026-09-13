PNPM ?= pnpm

.PHONY: help release-check release-prepare release-windows release-macos release-linux
.NOTPARALLEL:

help:
	@echo "Local release targets (run each target on its native platform):"
	@echo "  make release-windows  NSIS installer and portable ZIP"
	@echo "  make release-macos    DMG image"
	@echo "  make release-linux    DEB package and AppImage"

release-check:
	node scripts/check-release-tools.mjs

release-prepare: release-check
	$(PNPM) install --frozen-lockfile
	$(PNPM) run check
	cargo test -p jxl-core --locked
	$(PNPM) run codecs:build
	$(PNPM) run test:integration

release-windows:
	node scripts/assert-platform.mjs win32
	$(MAKE) release-prepare
	$(PNPM) run codecs:check
	$(PNPM) exec tauri build --bundles nsis
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-portable.ps1

release-macos:
	node scripts/assert-platform.mjs darwin
	$(MAKE) release-prepare
	$(PNPM) run codecs:check
	$(PNPM) exec tauri build --bundles dmg

release-linux:
	node scripts/assert-platform.mjs linux
	$(MAKE) release-prepare
	$(PNPM) run codecs:check
	$(PNPM) exec tauri build --bundles deb,appimage

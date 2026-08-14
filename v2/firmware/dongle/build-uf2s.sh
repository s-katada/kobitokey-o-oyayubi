#!/usr/bin/env bash
# Build all six dongle-topology UF2s: normal + -clearstorage for the dongle
# and both halves. Mirrors the classic crate's ritual: throwaway build →
# 3-crate clean (in-place registry patches) → real builds → kobu-uf2conv
# (the devshell's ELF→UF2 converter; family 0xADA52840, base from PT_LOAD).
# Run inside the firmware devshell: `nix develop ..#firmware` from the repo
# root (or let direnv activate it), then `./build-uf2s.sh`.
set -euo pipefail
cd "$(dirname "$0")"

command -v kobu-uf2conv >/dev/null 2>&1 || {
    echo "kobu-uf2conv not found — run inside the firmware devshell (nix develop .#firmware)" >&2
    exit 1
}

ELF_DIR=target/thumbv7em-none-eabihf/release

build_set() {
    local suffix="$1"
    cargo build --release --bin dongle --bin left --bin right
    kobu-uf2conv "$ELF_DIR/dongle" "kobu2-dongle${suffix}.uf2"
    kobu-uf2conv "$ELF_DIR/left"   "kobu2-dongle-left${suffix}.uf2"
    kobu-uf2conv "$ELF_DIR/right"  "kobu2-dongle-right${suffix}.uf2"
}

echo "=== throwaway build (applies the idempotent registry patches) ==="
cargo build --release --bin dongle || true
echo "=== recompile the three patched crates from patched sources ==="
cargo clean --release -p rmk -p trouble-host -p rmk-macro

echo "=== normal UF2s ==="
build_set ""

echo "=== -clearstorage UF2s (wipe bonds + stored peer addresses + keymap) ==="
# -i.bak instead of -i '' — an empty argument can get eaten when this script
# is invoked through `nix develop --command bash -c`.
sed -i.bak 's/^clear_storage = false$/clear_storage = true/' keyboard.toml && rm -f keyboard.toml.bak
grep -q '^clear_storage = true$' keyboard.toml
touch src/dongle.rs src/left.rs src/right.rs   # force proc-macro re-expansion
build_set "-clearstorage"
sed -i.bak 's/^clear_storage = true$/clear_storage = false/' keyboard.toml && rm -f keyboard.toml.bak
grep -q '^clear_storage = false$' keyboard.toml
touch src/dongle.rs src/left.rs src/right.rs

echo "=== done ==="
ls -la kobu2-dongle*.uf2

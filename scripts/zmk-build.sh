#!/usr/bin/env bash
# Build a ZMK shield using the official zmkfirmware/zmk-build-arm:stable
# Docker image. Mirrors what GitHub Actions does, so a green local build
# is a reliable predictor of CI passing.
#
# Usage:
#   scripts/zmk-build.sh                           # builds both halves
#   scripts/zmk-build.sh kobitokey_o_oyayubi_left  # one shield
#   scripts/zmk-build.sh kobitokey_o_oyayubi_right
#
# First run takes a few minutes (clones zmk + zephyr + modules).
# Subsequent runs reuse the cache in .zmk-build/ and finish in ~30s.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="${ZMK_WORK_DIR:-$REPO_ROOT/.zmk-build}"
OUTPUT_DIR="$REPO_ROOT/build-output"
IMAGE="zmkfirmware/zmk-build-arm:stable"
BOARD="seeeduino_xiao_ble"

SHIELDS=("$@")
if [ ${#SHIELDS[@]} -eq 0 ]; then
    SHIELDS=(kobitokey_o_oyayubi_left kobitokey_o_oyayubi_right)
fi

mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

build_one() {
    local shield="$1"
    echo "=== Building $shield ==="
    docker run --rm \
        -v "$REPO_ROOT":/repo:ro \
        -v "$WORK_DIR":/work \
        -v "$OUTPUT_DIR":/output \
        -w /work \
        "$IMAGE" \
        bash -ec "
            rm -rf /work/config
            cp -R /repo/config /work/config
            if [ ! -d /work/.west ]; then
                west init -l /work/config
                west update --fetch-opt=--filter=tree:0
            else
                west update --fetch-opt=--filter=tree:0
            fi
            west zephyr-export
            rm -rf /work/build
            west build -p auto -s zmk/app -d /work/build \
                -b $BOARD \
                -- -DZMK_CONFIG=/work/config -DSHIELD='$shield rgbled_adapter'
            cp /work/build/zephyr/zmk.uf2 \
                /output/${shield}-${BOARD}-zmk.uf2
        "
    echo "  -> $OUTPUT_DIR/${shield}-${BOARD}-zmk.uf2"
}

for s in "${SHIELDS[@]}"; do
    build_one "$s"
done

echo
echo "Done. UF2 files in: $OUTPUT_DIR"

.PHONY: build build-left build-right clean docker-pull

# Build both halves locally inside the official ZMK Docker image.
# Output UF2 files land in ./build-output/.
build:
	./scripts/zmk-build.sh

build-left:
	./scripts/zmk-build.sh kobitokey_o_oyayubi_left

build-right:
	./scripts/zmk-build.sh kobitokey_o_oyayubi_right

# Pre-pull the build image so the first build doesn't include a download.
docker-pull:
	docker pull zmkfirmware/zmk-build-arm:stable

# Wipe the cached west workspace and previous output. Forces the next build
# to re-clone zmk and the modules.
clean:
	rm -rf .zmk-build build-output

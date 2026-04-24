# ZMK firmware for kobitokey-o-oyayubi

既存の RMK ファームウェア (`../firmware/`) と並列に管理する、ZMK ベースの代替ファームウェアです。

- ボード: `xiao_ble/nrf52840/zmk` (Seeed XIAO nRF52840)
- シールド: `kobitokey_o_oyayubi_left` (central / USB) / `kobitokey_o_oyayubi_right` (peripheral)
- 外部モジュール: [`badjeff/zmk-pmw3610-driver`](https://github.com/badjeff/zmk-pmw3610-driver) で PMW3610 トラックボールを駆動

## ビルド

GitHub Actions の `Firmware (ZMK)` ワークフローが `firmware-zmk/**` の変更で発火し、左右 2 つの UF2 をアーティファクト `kobitokey-o-oyayubi-zmk-firmware` にまとめて生成します。

手元でビルドするときは (ZMK の dev 環境があれば):

```sh
west init -l firmware-zmk/config
west update
west build -s zmk/app -b xiao_ble/nrf52840/zmk -- -DZMK_CONFIG=$(pwd)/firmware-zmk/config -DSHIELD=kobitokey_o_oyayubi_left
```

## 書き込み

XIAO を UF2 モード (リセットボタン 2 回押し) にして、`XIAO-SENSE` ドライブへ対応する `*_left-xiao_ble_nrf52840_zmk-zmk.uf2` / `*_right-xiao_ble_nrf52840_zmk-zmk.uf2` をコピーします。

## キーマップ / 設定の編集

- `config/kobitokey_o_oyayubi.keymap` — 3 レイヤ (base / lower / mouse) の初期値
- `config/kobitokey_o_oyayubi.conf` — BLE / ポインティング / スリープ関連の Kconfig
- `config/boards/shields/kobitokey_o_oyayubi/*.overlay` — マトリクスとトラックボールのピン配線

ピン配線は `firmware/keyboard.toml` (RMK 側) の commit `4a4ee09` 時点の定義をそのまま引き写しています。実機マウントが左右逆になっている疑いが出た場合は overlay のピンを差し替えて再ビルドしてください。

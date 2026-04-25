# kobitokey-o-oyayubi

自作分割キーボード「kobitokey」の親指キーを拡張したバージョンの KiCad プロジェクトとファームウェアです。

## 主要部品

- スイッチ: Kailh Choc V2 ホットスワップ（1.00u）
- ダイオード: SOD-123
- コネクタ: Hirose FH12-10S-0.5SH（FFC/FPC 10 ピン, 0.5mm ピッチ）
- MCU: Seeed XIAO nRF52840 BLE（左右親指ユニットに 1 個ずつ）
- トラックボール: PMW3610 光学センサー（左右親指ユニットに 1 個ずつ、3 線 SPI）

## キーマップ

![keymap](firmware/keymap/kobitokey-o-oyayubi.svg)

## ZMK ファームウェア (ローカルビルド)

GitHub Actions の `Firmware (ZMK)` ワークフローと同じ Docker イメージ
(`zmkfirmware/zmk-build-arm:stable`) を使ってローカルでビルドできます。

```sh
# 初回だけ: イメージを pull (約 1 GB)
make docker-pull

# 両半ビルド (初回 ~5 分, 2 回目以降 ~30 秒)
make build

# 片側だけビルド
make build-left
make build-right

# キャッシュ全削除 (zmk/zephyr の再 clone が走る)
make clean
```

UF2 は `build-output/` に出力されます:

- `build-output/kobitokey_o_oyayubi_left-seeeduino_xiao_ble-zmk.uf2`
- `build-output/kobitokey_o_oyayubi_right-seeeduino_xiao_ble-zmk.uf2`

XIAO のリセットボタンを 2 回押して UF2 モードに入り、対応する UF2 を
`XIAO-SENSE` ドライブにコピーすればフラッシュ完了です。

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

4 層構成（Layer0 / Layer1 / Layer2 / Layer3）。`firmware/keyboard.toml` の `[layout] keymap` を編集して再ビルドすると実機に反映されます。ドキュメント側の SVG を更新したい場合は、`firmware/keymap/kobitokey-o-oyayubi.yaml` を編集して devshell 内で以下を実行してください。

```fish
keymap draw firmware/keymap/kobitokey-o-oyayubi.yaml > firmware/keymap/kobitokey-o-oyayubi.svg
```

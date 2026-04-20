# kobitokey-o-oyayubi

自作分割キーボード「kobitokey」の親指ユニット付きバージョンの KiCad プロジェクトです。

## 概要

左右分割型のキーボードで、メインユニットと親指ユニットで構成されています。Kailh Choc V2 ホットスワップソケットを使用し、PCB は JLCPCB で製造しています。

## 構成

- `main-unit-left/` / `main-unit-right/` — メインユニット（左右）の KiCad プロジェクト
- `thumb-unit-left/` / `thumb-unit-right/` — 親指ユニット（左右）の KiCad プロジェクト
- `main-unit.csv` — メインユニットの部品表（BOM）

各ユニットディレクトリには以下が含まれます。

- `*.kicad_pro` / `*.kicad_sch` / `*.kicad_pcb` — KiCad プロジェクト・回路図・基板データ
- `production/` — JLCPCB 発注用の製造データ（ガーバー等）
- `fabrication-toolkit-options.json` — Fabrication Toolkit の設定

## 主要部品

- スイッチ: Kailh Choc V2 ホットスワップ（1.00u）
- ダイオード: SOD-123
- コネクタ: Hirose FH12-10S-0.5SH（FFC/FPC 10 ピン, 0.5mm ピッチ）

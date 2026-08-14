# kobu2 Prospector ドングルトポロジ

[Prospector](https://github.com/carrefinho/prospector)(beekeeb DIYキット)を
kobu v2 の**表示付きUSBドングル**として使うためのファームウェア一式。

```
        ┌──────────────┐  USB   ┌──────┐
        │  Prospector  │───────▶│ Mac  │
        │  (dongle bin)│        └──────┘
        │  ST7789 画面 │
        └──┬────────┬──┘
     BLE   │        │   BLE
  ┌────────▼──┐  ┌──▼────────┐
  │ 左手       │  │ 右手      │
  │ (left bin) │  │ (right bin)│
  │ id=1 scroll│  │ id=0 pointer│
  └───────────┘  └───────────┘
```

- **dongle** = split central。キー無し(0x0マトリクス)、USB HID+Via、
  ST7789V2 ステータス画面(レイヤー/左右リンク/左右電池/WPM)
- **left** = `#[rmk_peripheral(id = 1)]`。旧centralの左手をペリフェラル化。
  スクロールボールはそのまま(registryパッチがid1のJoystickをX→H/Y→Vに
  リラベルするのでドングル側のScrollProcessorが今まで通り拾う)
- **right** = `#[rmk_peripheral(id = 0)]`。従来のperipheralと同義
- Webエディタ(v2/keymap-editor)は**無改修で動く**: VID/PID同一、
  Via 0xC0のid 0x10=左電池 / 0x11=右電池のセマンティクスも保存

クラシック(左手=central)構成は `../rmk/` にそのまま残っている。
どちらの構成に切り替えるときも下の「⚠切り替え時の注意」を読むこと。

## ビルド

```sh
cd v2/firmware/dongle   # nix develop ..#firmware のシェルで
./build-uf2s.sh         # 儀式込みで6つのUF2を生成
```

手動でやる場合(初回 or ../rmk/build.rs 変更後は3クレートcleanが必須):

```sh
cargo build --release --bin dongle || true
cargo clean --release -p rmk -p trouble-host -p rmk-macro
cargo build --release --bin dongle --bin left --bin right
```

## フラッシュ手順(初回)

**順番が大事。** 旧トポロジのボンド/アドレスがフラッシュに残っているため、
両手とも一度 `-clearstorage` を経由する。

1. **Prospector** — XIAOをブートモード(RST2連打)→ `XIAO-SENSE`(または
   `XIAO-BOOT`)ボリュームに `kobu2-dongle.uf2` をコピー
2. **左手** — ブートモード → `kobu2-dongle-left-clearstorage.uf2`
   → 再起動を待つ(LED点灯) → もう一度ブートモード →
   `kobu2-dongle-left.uf2`
3. **右手** — 同様に `kobu2-dongle-right-clearstorage.uf2` →
   `kobu2-dongle-right.uf2`
4. ドングルをUSBでMacに接続。画面に kobu2 ステータスが出て、
   両手のLEDが「電池色→青フラッシュ」になれば完了

macOSコピーの作法(リソースフォーク対策):
```sh
COPYFILE_DISABLE=1 cp kobu2-dongle.uf2 /Volumes/XIAO-SENSE/ && diskutil eject XIAO-SENSE
```

## LED仕様(両手・2026-08-13ユーザー指定)

| タイミング | LED |
|---|---|
| 起動〜5秒 | バッテリー残量色(緑/黄/赤) |
| ドングル接続中 | 青 点きっぱなし |
| 未接続 | 赤 点きっぱなし |

実装は `src/peri_led.rs`(クラシック構成の省電力版 `../rmk/src/peripheral_led.rs` とは別物)。

## 複数セットの独立性

- **ボンド済みセットは元々独立**: rmkはペアリング後、ペリフェラル側が指向性広告
  (directed advertising)・セントラル側が保存アドレス接続になるため他セットから不可視
- **初回ペアリング時の誤結合**は広告の**セット識別トークン**で防止
  (`../rmk/build.rs::patch_rmk_split_adv_set_token`)。トークン付き広告は
  マニュファクチャラデータ長が変わるため、**旧ファーム(v1/クラシックv2)とは相互に不可視**
- 2セット目を作るときは `src/set_token.rs` の `SPLIT_SET_TOKEN`(現在 0x4B)を
  別の非ゼロ値に変えてビルドすれば、初回ペアリングから完全independent
- 同一トークンのセット同士は、初回ペアリングだけ「1セットずつ電源を入れる」運用で回避

## ⚠ 切り替え時の注意

- **旧central(左手=セントラル)のUF2とドングルを同時に通電しない。**
  rmkのsplit探索は「サービスUUID+ペリフェラルidバイト」しか見ないため、
  近くで両方が動くと右手がどちらに掴まれるか不定(v1左手がv2右手を
  奪った事故と同型)。クラシック構成に戻すときは、両手に
  `../rmk/` の `-clearstorage` → 通常UF2を焼き直す
- キーマップのVial編集は**ドングルのフラッシュ**に保存される。
  クラシック構成に戻ると左手に残っていた古い保存キーマップが再浮上する
- kobu-config の「ペリフェラルをブートローダへ」(0xC0/0x12)は
  **両手に同報**される(id指定なし)。片手だけ書き換えたいときは
  物理RST2連打を使う

## 画面が映らないとき

キーボード機能とディスプレイは独立(SPI失敗は握りつぶす設計)なので、
打鍵できるのに画面が真っ黒な場合は表示系だけの問題:
FPCの向き/挿し込み、`VCC=3V3`(5V厳禁、レベルシフタB側=ロジック電圧)、
バックライト(P1.11)の配線を確認。

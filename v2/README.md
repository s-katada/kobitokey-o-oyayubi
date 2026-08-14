# kobu v2

自作分割キーボード kobu の第 2 世代。v1 との**ハード面の違いは小指列最下段のキーを左右 1 個ずつ追加**したことだけです（19 → 20 キー/半分、計 40 キー）。

初代の PCB / ケース / ファームウェア / Web エディタは [`../v1/`](../v1/) にあります。

## ディレクトリ構成

| ディレクトリ | 中身 |
|---|---|
| [`case/`](case/) | ケースの STL |
| [`pcb/`](pcb/) | KiCad プロジェクト (`left-main` / `right-main` / `thumb-left` / `thumb-right`) |
| [`firmware/rmk/`](firmware/rmk/) | RMK ベースのファームウェア (Rust, thumbv7em-none-eabihf)。v1 の `firmware/rmk` からのフォーク。**クラシック構成（左手=セントラル）** |
| [`firmware/dongle/`](firmware/dongle/) | **Prospector ドングル構成**（ドングル=セントラル+ST7789 画面、左右両手=ペリフェラル）。keymap/behavior は `firmware/rmk/keyboard.toml` と要同期 |
| [`keymap-editor/`](keymap-editor/) | kobu2 専用の Web キーマップエディタ（実機の盤面をクリックして編集 + トラックボール調整）。どちらの構成でも無改修で動く（VID/PID・Via 0xC0 セマンティクス共通）|

## v1 とのファームウェア差分

- 追加キーは各半分の空いていたマトリクス交点 **ROW3×COL4**（小指列ネット × 親指行ネット）に配線。GPIO 追加なし・マトリクス寸法 (4×10) 変更なしで、keymap 座標では v1 で phantom だった **(3,0) / (3,9)** に載ります。レイヤー 0 の割り当ては左=LShift / 右=RShift（他レイヤーは透過）。
  - 実基板で確認済み: 4 基板とも J1 は `1..4=/ROW0../ROW3`, `5..9=/COL0../COL4`, `10=NC` の**同一ピン配置**で、追加キーは各メイン基板の `SW16 = /ROW3 × /COL4`（小指列の最下段、既存最下行の 16mm 下）。/ROW3 が FFC pin4 でメインユニットへ届いています。
  - ⚠️ FFC ケーブルは v1 と逆で**ストレート結線（pin N ↔ pin N）**が必要です。v2 の FFC には電源線が無く（pin10 = NC、メイン基板はスイッチとダイオードのみの完全パッシブ）、誤ったケーブルでも MCU ピンが電源に張り付くことはありませんが、マトリクスは全く読めません。導通チェック手順は `firmware/rmk/keyboard.toml` 冒頭コメント参照。
- 識別子: name/product_name = **kobu2**、product_id = **0x425A**（VID `0x4b4f` と Vial keyboard UID は v1 と共通）。[web editor](../v1/web/rmk-editor/) は v1/v2 両方の PID を受け付けます。
- それ以外（build.rs の 84 レジストリパッチ、`src/`、メモリレイアウト、依存クレートのバージョン）は v1 と同一です。
  - うち 3 つは [`firmware/dongle/`](firmware/dongle/) のための 2026-08 追加: `patch_rmk_peripheral_manager_source_disambiguation`（**id≠0 のときだけ発火** → ペリフェラルが id0 の右手のみのクラシック構成では実行時に不活性）、`patch_rmk_split_connect_timeout_widen`（split 接続タイムアウト 5s→12s。クラシック構成では SCANNING_MUTEX が無競合でタイムアウト自体ほぼ発火しないため実質不可視）、`patch_rmk_split_adv_set_token`（広告のセット識別トークン。デフォルト 0 = 素の rmk 挙動なのでクラシック構成は電波レベルで不変、複数セットの誤ペアリング防止はドングル構成のみ有効化）。

## ⚠️ build.rs は v1 と同一内容に保つ

v1/v2 の build.rs はどちらも**共有 cargo registry のソースを in-place パッチ**します。両者が同一内容ならパッチは冪等で、どちらのツリーを先にビルドしても安全です。**片方だけにパッチを足して乖離させた場合**は、もう片方をビルドする前に

```sh
cargo clean --release -p rmk -p trouble-host -p rmk-macro
```

で 3 crate をパッチ済みソースから作り直してください（CI はジョブごとに pristine な registry なので無関係）。

## ビルド

v1 と同じで、リポジトリルートの devshell を使います:

```sh
cd v2/firmware/rmk        # direnv が firmware devshell を自動起動
cargo build --release --bin central
cargo build --release --bin peripheral
```

UF2 は CI が [firmware-latest リリース](../../releases/tag/firmware-latest)に `kobu2-rmk-central.uf2` / `kobu2-rmk-peripheral.uf2`（+ `-reset` 版）として公開します。ローカルで作る場合は devshell の `kobu-uf2conv`:

```sh
kobu-uf2conv target/thumbv7em-none-eabihf/release/central    kobu2-rmk-central.uf2
kobu-uf2conv target/thumbv7em-none-eabihf/release/peripheral kobu2-rmk-peripheral.uf2
```

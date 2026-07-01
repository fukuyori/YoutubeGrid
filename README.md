# YouTube Grid Customizer

YouTube の一覧表示をカスタマイズする Firefox / Chrome 拡張機能です。

## 機能

1. **表示件数を増やす** — トップページや登録チャンネル一覧のグリッド列数を増やして、1 画面あたりの動画数を増やします。
2. **特定の文字を含む動画を非表示** — タイトルまたはチャンネル名に指定キーワードを含む動画を一覧から隠します。
3. **検索結果の表示件数を増やす** — 検索結果を複数列のグリッド表示にして、1 画面に多く表示します。

おまけ: ショート動画セクションの非表示、大文字・小文字の区別。

## ファイル構成

```
manifest.json   … 拡張機能の定義（Manifest V3）
content.js      … YouTube ページ上で動作する本体
options.html    … 設定ページ（ツールバーアイコンからも開けます）
options.js      … 設定ページのロジック
icons/icon.svg  … アイコン
```

## インストール（開発中の一時読み込み）

### Firefox

1. Firefox のアドレスバーに `about:debugging#/runtime/this-firefox` を入力。
2. 「一時的なアドオンを読み込む」をクリック。
3. このフォルダ内の `manifest.json` を選択。
4. YouTube を開くと有効になります。

一時読み込みは Firefox を再起動すると消えます。恒久的に使う場合は
[web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)
で署名するか、`about:config` の `xpinstall.signatures.required` を無効化した
Developer Edition / Nightly を使用してください。

### Chrome

1. Chrome のアドレスバーに `chrome://extensions` を入力。
2. 右上の「デベロッパー モード」を有効にする。
3. 「パッケージ化されていない拡張機能を読み込む」をクリック。
4. このフォルダを選択。

Chrome Web Store に提出する ZIP は次のコマンドで作成します。

```sh
node scripts/build-chrome-package.mjs
```

提出用 ZIP は `dist/youtube-grid-customizer-chrome.zip` に作成されます。
登録時に必要な説明文や権限理由の下書きは `STORE_SUBMISSION.md` を参照してください。

### Firefox 提出用パッケージ

Firefox Add-ons に提出する ZIP / XPI は次のコマンドで作成します。

```sh
node scripts/build-firefox-package.mjs
```

提出用ファイルは `dist/youtube-grid-customizer-firefox.zip` と
`dist/youtube-grid-customizer-firefox.xpi` に作成されます。

## 設定

ツールバーの拡張機能アイコンをクリック、または
`about:addons` → 本拡張の「設定」から設定ページを開けます。

| 項目 | 説明 | 既定値 |
| --- | --- | --- |
| 拡張機能を有効にする | 全機能の ON/OFF | ON |
| グリッドの列数 | トップ等の 1 行あたりの動画数 | 6 |
| 検索結果の列数 | 検索結果の列数（1 で通常表示） | 2 |
| 非表示にするキーワード | 1 行 1 キーワード。部分一致 | （空） |
| 大文字・小文字を区別する | キーワード照合時の区別 | OFF |
| ショート動画を非表示 | Shorts セクションを隠す | OFF |

設定は保存すると開いている YouTube タブに即時反映されます。

## 動作の仕組み

- グリッド列数は YouTube の CSS 変数 `--ytd-rich-grid-items-per-row` を上書きします。
- キーワードフィルタは `MutationObserver` で動的に読み込まれる動画カードを監視し、
  タイトル / チャンネル名を照合して該当カードを `display:none` にします。
- 検索結果は `ytd-item-section-renderer` の内容を CSS Grid 化して多列表示にします。

YouTube の DOM 構造が変わると調整が必要になる場合があります。

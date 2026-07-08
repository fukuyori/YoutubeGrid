# Firefox Add-ons Submission Checklist

Firefox Add-ons (AMO) 登録用の確認メモです。

## 提出ファイル

- [ ] バージョンが `manifest.json` で `0.2.0` になっている。
- [ ] Firefox 用パッケージを作成済み。

```sh
node scripts/build-firefox-package.mjs
```

- [ ] AMO にアップロードするファイルを確認する。
  - `dist/youtube-grid-customizer-firefox.zip`
  - `dist/youtube-grid-customizer-firefox.xpi`
- [ ] Firefox 用 `dist/firefox/manifest.json` に `browser_specific_settings.gecko.id` が含まれている。
- [ ] Firefox 用 `dist/firefox/manifest.json` から `version_name` が除外されている。
- [ ] ZIP/XPI のルート直下に `manifest.json` がある。

## 動作確認

- [ ] Firefox の `about:debugging#/runtime/this-firefox` で一時読み込みできる。
- [ ] 設定ページに `v0.2.0` が表示される。
- [ ] 「拡張機能を有効にする」の ON/OFF が効く。
- [ ] グリッド列数が YouTube のホーム/登録チャンネル等に反映される。
- [ ] 検索結果の列数が反映される。
- [ ] タイトルのキーワード非表示が効く。
- [ ] チャンネル名のキーワード非表示が効く。
- [ ] 「大文字・小文字を区別する」がキーワード判定に反映される。
- [ ] 「ショート動画を一覧に表示しない」で Shorts セクションと Shorts 動画カードが消える。
- [ ] 「ゲームルームを表示しない」でゲームルームのセクションが消える。
- [ ] 設定保存後、開いている YouTube タブへ反映される。

## AMO 入力内容

- [ ] Name: `YouTube Grid Customizer`
- [ ] Summary: YouTube の一覧表示をカスタマイズし、列数変更・キーワード非表示・Shorts/ゲームルーム非表示を行う拡張機能。
- [ ] Description:
  - YouTube ホーム/登録チャンネル等のグリッド列数を変更できる。
  - 検索結果を複数列表示にできる。
  - タイトル/チャンネル名のキーワードで動画を非表示にできる。
  - Shorts セクション/Shorts 動画カードを非表示にできる。
  - ゲームルームのセクションを非表示にできる。
- [ ] Category: Productivity など、用途に合うカテゴリを選択する。
- [ ] Support email / Support website を入力する。
- [ ] License を選択する。
- [ ] Privacy policy を指定する場合は `PRIVACY_POLICY.md` の内容と一致させる。
- [ ] Reviewer notes に、YouTube ページでの確認手順を短く書く。
- [ ] Detailed version notes に今回の変更内容を具体的に書く。

```text
Version 0.2.0:
- Added an option to hide Shorts sections and Shorts video cards in YouTube lists.
- Added an option to hide Game Room sections.
- Added the extension version display to the options page.
- Updated the options page labels and submission/privacy documentation.
```

- [ ] 審査担当者へのメモに、テスト用アカウントの要否を書く。

```text
No test account is required. The main features can be tested on public YouTube pages and search results.

Suggested test steps:
1. Open the options page and confirm that v0.2.0 is shown.
2. Change the grid column count and search result column count.
3. Add title/channel keywords and confirm matching videos are hidden.
4. Enable "ショート動画を一覧に表示しない" and confirm Shorts sections/cards are hidden.
5. Enable "ゲームルームを表示しない" and confirm Game Room sections are hidden when YouTube shows them.
```

## 権限説明

- [ ] `storage`: 設定値を保存するため。
- [ ] `*://*.youtube.com/*`: YouTube ページ上で一覧レイアウト変更と非表示処理を行うため。
- [ ] リモートコードを読み込んでいないことを説明できる。
- [ ] ユーザーデータを外部送信していないことを説明できる。

## レビュー前チェック

- [ ] `node --check content.js`
- [ ] `node --check options.js`
- [ ] `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`
- [ ] `git diff --check`
- [ ] `dist/firefox` に `.git`、スクリーンショット、提出不要ファイルが混ざっていない。
- [ ] AMO validator のエラーを解消する。警告、特に security/privacy 系は可能な限り解消する。
- [ ] ソース提出が必要か確認する。この拡張は現状 minify/transpile/obfuscate していないため、通常は不要。

## 公式ドキュメント

- Submitting an add-on: https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- Package your extension: https://extensionworkshop.com/documentation/publish/package-your-extension/
- Add-on Policies: https://extensionworkshop.com/documentation/publish/add-on-policies/

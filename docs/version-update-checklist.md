# Version Update Checklist

この拡張機能のバージョンを変更するときに確認するファイルと手順です。

## 更新対象

- [ ] `manifest.json`: `version` と `version_name` を同じバージョンにする。
- [ ] `README.md`: 機能一覧と設定表を実装に合わせる。
- [ ] `STORE_SUBMISSION.md`: ストア説明、権限説明、確認項目を実装に合わせる。
- [ ] `FIREFOX_SUBMISSION.md`: バージョン、動作確認項目、バージョンノート案を更新する。
- [ ] `PRIVACY_POLICY.md`: 保存する設定やデータの説明に変更がある場合に更新する。
- [ ] `options.js`: バージョンを直書きせず、manifest から表示していることを確認する。

## 確認とパッケージ

- [ ] `node --check content.js`
- [ ] `node --check options.js`
- [ ] manifest の JSON を検証する。
- [ ] `git diff --check`
- [ ] Firefox の提出チェック項目を確認する。
- [ ] Chrome パッケージを作成する: `node scripts/build-chrome-package.mjs`
- [ ] Firefox パッケージを作成する: `node scripts/build-firefox-package.mjs`
- [ ] Chrome の manifest に Firefox 専用設定がないことを確認する。
- [ ] Firefox の manifest に Gecko ID があり、`version_name` がないことを確認する。
- [ ] ZIP/XPI に今回の `content.js`、設定画面、アイコンが含まれることを確認する。

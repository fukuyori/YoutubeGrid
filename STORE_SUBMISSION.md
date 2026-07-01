# Chrome Web Store Submission Notes

## Upload package

Build the Chrome-specific package:

```sh
node scripts/build-chrome-package.mjs
```

Upload:

```text
dist/youtube-grid-customizer-chrome.zip
```

The Chrome package removes the Firefox-only `browser_specific_settings` field from `manifest.json`.

## Developer account

Open the Chrome Web Store Developer Dashboard:

https://chrome.google.com/webstore/devconsole

Google's official docs say a Chrome Web Store developer account must be registered before publishing, and it requires a one-time registration fee.

## Store listing draft

Name:

```text
YouTube Grid Customizer
```

Short description:

```text
Customize YouTube lists by changing grid columns, hiding matched videos, and making search results easier to scan.
```

Detailed description:

```text
YouTube Grid Customizer helps you adjust YouTube list pages so more videos fit on screen and unwanted videos are easier to hide.

Features:
- Change the number of columns on YouTube home, subscription, and grid-style pages.
- Show YouTube search results in multiple columns.
- Hide videos when the title or channel name contains keywords you choose.
- Optionally hide Shorts sections.
- Keep settings in Chrome extension storage.

The extension only runs on youtube.com pages. It does not load remote code, show ads, or send your settings to the developer.
```

Category:

```text
Productivity
```

Language:

```text
English or Japanese, depending on the first target audience.
```

## Single purpose

```text
Customize YouTube list and search result layouts, including column counts and keyword-based hiding of videos.
```

## Permission justification

`storage`:

```text
Used to save the user's layout and keyword filter settings, such as grid column count, search result column count, hidden keywords, and Shorts visibility preference.
```

Host access:

```text
Required for youtube.com so the extension can apply layout customization and keyword filtering to YouTube pages.
```

## Remote code declaration

```text
No. The extension does not load or execute remotely hosted code.
```

## Data use declaration

Suggested answer:

```text
The extension stores user settings locally/in Chrome extension storage. The developer does not collect, transmit, sell, or share user data.
```

If the dashboard asks which data is collected by the developer, choose no collection unless you add analytics, telemetry, accounts, ads, or external servers later.

## Required images

Already included in the ZIP:

- `icons/icon-128.png`

Still needed for the store listing:

- At least 1 screenshot: `1280x800` or `640x400`
- Small promotional image: `440x280`

Use screenshots that show the actual YouTube grid/search result customization and the options page.

## Final review checklist

- Test by loading `dist/chrome` with `chrome://extensions` developer mode.
- Confirm the options page saves settings.
- Confirm YouTube grid columns and search result columns change.
- Confirm title/channel keyword hiding works.
- Confirm the ZIP contains no private files, source control folders, or unrelated assets.
- Upload the ZIP, complete Store Listing, Privacy, Distribution, and Test Instructions, then submit for review.

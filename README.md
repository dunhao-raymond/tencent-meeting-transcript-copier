# Tencent Meeting Transcript Copier

A Tampermonkey userscript for Tencent Meeting recording pages.

The script can collect a full transcript from Tencent Meeting recording and transcript pages, including pages that render transcript rows through virtual scrolling.

## Files

- `plugin.js`: the userscript.
- `capture-mhtml.js`: a small helper used during debugging to save a dynamic page snapshot as MHTML.

## Install

Install the userscript from:

https://raw.githubusercontent.com/dunhao-raymond/tencent-meeting-transcript-copier/main/plugin.js

## Updates

The userscript metadata includes `@updateURL` and `@downloadURL`, both pointing to the GitHub raw file above.

After the script is installed from that URL, Tampermonkey can update it automatically when `@version` is increased on `main`.

You can also update manually in Tampermonkey:

1. Open the Tampermonkey dashboard.
2. Open the installed script.
3. Use `Check for userscript updates`.

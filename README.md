# Udenhood

Pop the hood on any coin.

Udenhood is a launchpad in build on Robinhood Chain. A coin launches from the GitHub repo that signed it, and carries a proof card with four lights: Owner, History, Running, Shipping.

This repo is the site at https://udenhood.fun.

## What works today

- **Check a repo.** Paste `owner/repo`. Your browser asks the public GitHub API and four lights answer. Each light opens its proof.
- **Sign your repo.** Build the `udenhood.json` proof file and open GitHub with it ready to commit.

Launch is in build.

## How it is made

Plain HTML, CSS and JavaScript. No framework, no dependencies. Nothing is stored: the checks run in your browser.

| Path | What it is |
|---|---|
| `index.html` | Check a repo |
| `launch.html` | Sign your repo |
| `coins.html` | Coins launched here |
| `docs/` | How each light works, and what it does not prove |
| `assets/js/check.js` | The four checks |
| `assets/js/signer.js` | The proof file |

## Run it

Serve this folder with any static server:

```
python -m http.server 8000
```

## Fonts and logos

The fonts are under the SIL Open Font License, see `assets/fonts`. The GitHub and X logos belong to their owners. Udenhood is not affiliated with Robinhood or GitHub.

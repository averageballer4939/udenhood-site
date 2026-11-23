# Udenhood

Pop the hood on any coin.

Udenhood is a launchpad on Robinhood Chain for projects that ship code. A coin launches from the GitHub repo that signed it, and carries a proof card with four lights: Owner, History, Running, Shipping.

This repo is the site at https://udenhood.fun.

## What it does

- **Check a repo.** Paste `owner/repo`. Your browser asks the public GitHub API and four lights answer. Each light opens its proof.
- **Log in with a wallet.** No email, no password, no signature. The page reads your public address and nothing else.
- **Launch a coin.** Your repo carries one file, `udenhood.json`, that names your wallet. That wallet launches the coin through the Pons v2 contracts. Every cost is read from the chain and shown before your wallet opens, and the launch is replayed against live chain state first.
- **See a coin.** `coin.html?t=0x...` shows what the chain says about a coin, then the proof card of the repo it names.
- **Coins.** The list is read live: public repos with the topic `udenhood` whose file names a coin, checked on chain. Nobody picks the coins.

## What to know before you launch

- Udenhood adds no contract and takes no fee. The coin is created by Pons v2 contracts, which are unaudited.
- A coin cannot be edited after launch, and it can go to zero.
- The proof card shows that a project exists, runs and ships. It does not say the project is good.

## How it is made

Plain HTML, CSS and JavaScript. No framework, no account system, no database. The checks and the chain reads run in your browser. One small function, `api/image.js`, stores a coin image uploaded from the launch page: that image is the only thing the site keeps.

| Path | What it is |
|---|---|
| `index.html` | Check a repo |
| `connect.html`, `account.html` | Log in, and the wallet you are logged in with |
| `launch.html` | Sign your repo and launch its coin |
| `coin.html`, `coins.html` | A coin with its proof card, and the list |
| `docs/` | How each light works, what a launch costs, and what none of it proves |
| `assets/js/preuve.js` | The four checks |
| `assets/js/chaine.js` | Robinhood Chain and the Pons contracts: addresses, encoding, reads, simulation |
| `assets/js/wallet.js` | Wallet discovery (EIP-6963) and requests (EIP-1193) |
| `assets/js/lancer.js` | The launch flow |
| `api/image.js` | Stores an uploaded coin image (PNG, WebP or JPEG, 600 KB at most) |

## Run it

Serve this folder with any static server:

```
python -m http.server 8000
```

## Fonts and logos

The fonts are under the SIL Open Font License, see `assets/fonts`. The GitHub, X, Pons and Ethereum logos belong to their owners. Udenhood is not affiliated with Robinhood, GitHub or Pons.

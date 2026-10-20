# Vite Oxc Bridge

Configure Oxfmt and Oxlint from one typed `oxc.config.*` file in a Vite project.

Instead of maintaining separate `.oxfmtrc.json` and `.oxlintrc.json` files, put their options
under `fmt` and `lint` in a single configuration:

| Unified config | Replaces         | Used by |
| -------------- | ---------------- | ------- |
| `fmt`          | `.oxfmtrc.json`  | Oxfmt   |
| `lint`         | `.oxlintrc.json` | Oxlint  |

## Install

```sh
npm install --save-dev vite vite-oxc-bridge
```

## Configure

Keep your project's existing `vite.config.*`. It is the discovery anchor for the nearest `oxc.config.*`.
Move the contents of `.oxfmtrc.json` into `fmt` and `.oxlintrc.json` into `lint`:

```ts
// oxc.config.ts
import { defineConfig } from 'vite-oxc-bridge'

export default defineConfig({
  lint: {
    rules: {
      'no-debugger': 'deny',
    },
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
})
```

`defineConfig` preserves the native Oxfmt and Oxlint option types. After migrating, remove the
separate `.oxfmtrc.json` and `.oxlintrc.json` files so that `oxc.config.*` remains the single source
of truth. Either `fmt` or `lint` may be omitted when the corresponding tool is not used.

## Commands

```json
{
  "scripts": {
    "format": "oxc fmt .",
    "format:check": "oxc fmt --check .",
    "lint": "oxc lint .",
    "lint:fix": "oxc lint --fix ."
  }
}
```

## VS Code

Install the [Oxc extension](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode), then run:

```sh
npx --no-install oxc init
```

This creates or merges the required settings in `.vscode/settings.json` without replacing existing values or JSONC comments. The extension discovers the package wrappers automatically; do not set `oxc.path.oxfmt` or `oxc.path.oxlint`.

## How It Works

Vite Oxc Bridge discovers the nearest `oxc.config.*` and passes it unchanged to the original Oxfmt
and Oxlint binaries, which read the `fmt` and `lint` sections respectively. Internally, the bridge
implements the unified configuration protocol used by Vite+; Vite and its plugins are not started.

The root `oxc.config.*` file is reloaded when Oxc requests it. Node.js caches modules imported by that file for the lifetime of the process, so restart the Oxc language servers after changing imported configuration helpers.

## Requirements

- Node.js 24.22.0 or later
- Vite 8 or later
- An `oxc.config.ts`, `.mts`, `.cts`, `.js`, `.mjs`, or `.cjs` file that default-exports an object

## License

[MIT](./LICENSE)

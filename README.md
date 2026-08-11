# Vite & React — host template

Starter template for the [MFE Orchestrator](https://github.com/mfe-orchestrator), listed in the
marketplace as `vite-host-react`. Vite + React 19 + Module Federation, wired as a **host**.

## Requirements

- Node.js 20 or newer
- [pnpm](https://pnpm.io) 10 or newer

> [!NOTE]
> The client SDK is required at `^0.1.0`. A caret on a `0.x` version is deliberately narrow: it
> accepts `0.1.x` only, **not** `0.2.0`. The SDK is new and parts of its API are still settling, so
> that is the intended level of caution — the cost is that you have to widen this range yourself
> when the SDK moves to `0.2.0`, otherwise `pnpm install` fails to resolve it.

## Getting started

```bash
cp .env.example .env
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # production build into dist/
```

## Project structure

```
.
├── Dockerfile          # standalone nginx deploy
├── nginx/no-cache.conf
├── index.html
├── src/
│   ├── App.jsx         # shell, exposed to the orchestrator as ./App
│   ├── App.css
│   ├── index.css
│   └── main.jsx        # configure() lives here
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── vite.config.js      # federation config
```

## How the orchestrator is wired in

**The host never decides which version it gets.** It hands over the identities it holds and uses
the URL it receives, verbatim. Which version that URL points at — stable, canary, whatever — is
decided by the backend. Nothing in this repo parses a version, builds a URL by hand, or knows that
canaries exist.

Two pieces make that work.

**1. `configure()`, at the very top of the entry point (`src/main.jsx`), synchronously, before
anything imports a remote:**

```js
import { configure } from '@mfe-orchestrator-hub/client'

const environment = import.meta.env.VITE_MFE_ENVIRONMENT?.trim()

configure({
  backendUrl: import.meta.env.VITE_MFE_BACKEND_URL,
  projectId: import.meta.env.VITE_MFE_PROJECT_ID,
  ...(environment ? { environment } : {})
})
```

`backendUrl` and `projectId` are required, `environment` is not. The host does not have to know
which environment it runs in: when the key is absent the backend resolves the environment from the
domain the request comes from, out of the domains declared for each environment in the console. An
unset Vite variable arrives as `undefined` and one declared empty in `.env` arrives as an empty
string, so the entry point normalises both and drops the key instead of forwarding a fake slug. The
spread is there for exactly that: it is the difference between "no environment" and "an environment
whose name is the empty string". Set `VITE_MFE_ENVIRONMENT` only when you want to pin the
environment explicitly — for instance when several environments are served from the same domain.

**2. The remotes, declared in `vite.config.js` as promises that resolve to a URL:**

```js
federation({
  name: 'app',
  filename: 'remoteEntry.js',
  exposes: { './App': './src/App.jsx' },
  remotes: {
    exampleremote: {
      external: `import('@mfe-orchestrator-hub/client').then(m => m.remoteUrl('example-remote'))`,
      externalType: 'promise'
    }
  },
  shared: ['react', 'react-dom']
})
```

`remotes` ships empty: a freshly scaffolded host consumes nothing yet. Add one entry per
microfrontend you consume. The key is the federation-safe name you import from
(`exampleremote/Button`), and the string passed to `remoteUrl()` is the **slug** of the
microfrontend in the orchestrator. `remoteUrl(slug)` returns the URL the backend resolved for it,
already pinned to a version. Never write a URL there by hand.

The SDK also exposes `manifest()`, `globalVariables()` and `identities()` if you need to see what
the environment actually returned.

## Environment variables

Copy `.env.example` to `.env` and fill it in. Vite injects them at build time.

| variable | required | what it is |
| --- | --- | --- |
| `VITE_MFE_BACKEND_URL` | yes | orchestrator backend, including the `/api` suffix |
| `VITE_MFE_PROJECT_ID` | yes | id of your project in the orchestrator |
| `VITE_MFE_ENVIRONMENT` | no | environment slug, ex. `DEV`. Omit it, or leave it empty, and the backend resolves the environment from the domain the request comes from |

`.env` is gitignored. Never commit real values.

## Build output

`pnpm build` writes to `dist/`. The federation entry lands at **`dist/assets/remoteEntry.js`**,
which is the `entryPoint` the marketplace entry declares.

Check it after any change to `vite.config.js`: the orchestrator serves exactly that path, so a
build that puts the entry somewhere else is broken.

## Deploying

### Upload to the orchestrator

Build the app and upload `dist/` with
[`mfe-orchestrator/github-action`](https://github.com/mfe-orchestrator/github-action), passing your
orchestrator API key as a repository **secret** — never a variable and never a literal in a
workflow file — plus the slug of this host and your console URL.

### Standalone deploy

A host is consumable as a remote, but it is also an application in its own right, so it ships with
an nginx image. `nginx/no-cache.conf` serves `index.html` for any route and marks the entry files
as never cacheable, so a redeploy is picked up immediately.

```bash
docker build -t my-host .
docker run -p 8080:80 my-host
```

## License

MIT

# Vite & React — host template

Starter template for the [MFE Orchestrator](https://github.com/mfe-orchestrator), listed in the
marketplace as `vite-host-react`. Vite + React 19 + Module Federation, wired as a **host**.

## Requirements

- Node.js 20 or newer
- [pnpm](https://pnpm.io) 12 (pinned in `packageManager`; `corepack enable` picks it up)

> [!NOTE]
> The client SDK is required at `^0.1.1`, the first version where the environment is optional. A
> caret on a `0.x` version is deliberately narrow: it
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
│   ├── App.tsx         # shell, exposed to the orchestrator as ./App
│   ├── App.css
│   ├── index.css
│   ├── main.tsx        # configure() lives here
│   └── telemetry.ts    # Application Insights, when the environment asks for it
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── vite.config.ts      # federation config
```

## How the orchestrator is wired in

**The host never decides which version it gets.** It hands over the identities it holds and uses
the URL it receives, verbatim. Which version that URL points at — stable, canary, whatever — is
decided by the backend. Nothing in this repo parses a version, builds a URL by hand, or knows that
canaries exist.

Two pieces make that work.

**1. `configure()`, at the very top of the entry point (`src/main.tsx`), synchronously, before
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

**2. The remotes, declared in `vite.config.ts` as promises that resolve to a URL:**

```js
federation({
  name: 'app',
  filename: 'remoteEntry.js',
  exposes: { './App': './src/App.tsx' },
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

## Application Insights

The host starts [Application Insights](https://learn.microsoft.com/azure/azure-monitor/app/javascript-sdk)
when its environment has a **global variable** named `APPLICATIONINSIGHTS_CONNECTION_STRING`. Set it
in the console, on each environment you want monitored, to the connection string of that
environment's Application Insights resource. The connection string only allows ingestion, so it is
fine in a browser.

Without the variable nothing happens: `src/telemetry.ts` loads `@microsoft/applicationinsights-web`
with a dynamic `import()`, so the SDK is a chunk of its own that is never downloaded, and the page
behaves exactly as before.

With it, the host initialises the SDK once and tracks:

- page views, the first one and every route change (`enableAutoRouteTracking`);
- unhandled exceptions, of the host and of every remote;
- `fetch` and XHR calls as dependencies, with W3C (`traceparent`, `tracestate`) and classic
  (`Request-Id`, `Request-Context`) correlation headers, so a backend that reports to Application
  Insights joins the same end-to-end transaction;
- browser timings (page load, network, DOM processing).

Everything is reported under the cloud role name `ROLE_NAME` (`vite-host-react`): rename it in
`src/telemetry.ts` after your host, so it is told apart from the backends in the application map.

**Correlation with backends.** Correlation headers go to same-origin calls only, by default. To
correlate the calls to a backend on another host, add that host to `CORRELATED_HOSTS` in
`src/telemetry.ts` (`'api.example.com'`, or `'*.example.com'`), and make sure the backend's CORS
allows the request headers `traceparent`, `tracestate`, `Request-Id` and `Request-Context`:
otherwise the browser preflight fails and the call with it.

**Remotes.** The instance is published on `window.appInsights` once loaded, and remotes use that one
instead of bundling their own SDK. Exceptions, calls and page views of a remote are already
tracked; for custom telemetry:

```ts
window.appInsights?.trackEvent({ name: 'checkout-completed' }, { items: 3 })
window.appInsights?.trackException({ exception: error })
```

The optional chaining matters: `window.appInsights` is not there when the environment has no
connection string, nor before the SDK has finished loading, and a call made then is simply skipped.
In a TypeScript remote, declare the slice it uses, so it needs no dependency on the SDK:

```ts
declare global {
  interface Window {
    appInsights?: {
      trackEvent(event: { name: string }, properties?: Record<string, unknown>): void
      trackException(exception: { exception: Error }, properties?: Record<string, unknown>): void
    }
  }
}
```

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

Check it after any change to `vite.config.ts`: the orchestrator serves exactly that path, so a
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

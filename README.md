Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
npm install
npm run dev
```

# Building For Production

To build this application for production:

```bash
npm run build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Remove `@tailwindcss/vite` and `tailwindcss` from `package.json`



## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).


# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.


# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).

---

# Data Collection Pipeline

Pulls JIRA + GitHub data for the epic configured in `config.yaml`, derives a
deterministic status snapshot, applies a judgment layer, and writes
publication-safe JSON to `data/snapshots/`. Data layer only — no UI yet.
Everything project-specific (epic, milestones, features, owners, repos)
lives in `config.yaml`, never in source.

## Setup

1. `pnpm install` (also installs a gitleaks pre-commit hook — see below).
2. Copy `.env.example` to `.env.local` and fill in the four variables:

   ```bash
   cp .env.example .env.local
   ```

   - `JIRA_BASE_URL` — your Atlassian site, e.g. `https://your-company.atlassian.net/`
   - `JIRA_EMAIL` — the email address tied to your JIRA API token
   - `JIRA_API_TOKEN` — create one at
     [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) →
     "Create API token". Basic-auth'd as `email:token`, base64-encoded — this
     script never logs it.
   - `GITHUB_TOKEN` — a **classic** personal access token
     ([github.com/settings/tokens](https://github.com/settings/tokens)) with
     the `repo` scope. If your org enforces SSO, authorize the token for
     that org after creating it (the token page will prompt you). A
     fine-grained token can work too, but must be explicitly granted access
     to every repo referenced in `config.yaml` — classic + SSO is simpler.

3. Copy `config.example.yaml` to `config.yaml` (or edit the real one already
   checked in) — see the comments in that file for the shape. Nothing in
   `config.yaml` is secret; it's fine to commit (ticket keys, repo names,
   GitHub logins).

## Daily routine

```bash
pnpm collect
```

Fetches JIRA + GitHub, writes `data/raw/<date>.json` (full fidelity,
gitignored) and `data/pending/<date>.json` (trimmed judge input, gitignored),
and prints a per-feature summary (score, stage, shipped/staged/total,
release gate) to stdout. **Halt here if this exits non-zero** — a non-zero
exit means every feature failed to collect, not just one; check the printed
collection errors.

Then, in Claude Code, run the **judge** skill (`.claude/skills/judge/SKILL.md`)
against today's `data/pending/<date>.json`. It writes
`data/judgment/<date>.json`. This step is a Claude Code routine, not a
script — there is no `ANTHROPIC_API_KEY` and no programmatic model call
anywhere in this codebase.

```bash
pnpm merge
```

Validates `data/judgment/<date>.json` as **untrusted input** against that
day's `data/pending/<date>.json` — rejects (non-zero exit, no file written)
anything unparseable, any invented ticket/PR/AC reference, or an
unreasoned/>20-point `scoreOverride`. On success, merges in any non-expired
`overrides.yaml` entries and writes `data/snapshots/<date>.json`.

**Halt the whole routine on any non-zero exit, and never commit when merge
fails** — `data/snapshots/` is the only directory in this pipeline that gets
committed:

```bash
git add data/snapshots && git commit -m "snapshot: <date>" && git push
```

Reruns for the same logical date overwrite in place (atomic write via a
`.tmp` file + rename) — never append or duplicate. All dates are computed in
`config.timezone` (see `logicalDate()` in `src/lib/config.ts`), not UTC, so a
run just after local midnight writes the correct calendar day.

## Testing

```bash
pnpm test
```

Runs the vitest suite (`tests/`) against fixtures only — no network calls,
safe to run without `.env.local` configured.

## Secret scanning

`pnpm install` runs `scripts/install-hooks.mjs`, which installs a
`.git/hooks/pre-commit` hook that runs
[gitleaks](https://github.com/gitleaks/gitleaks) (`.gitleaks.toml`) against
staged changes, if gitleaks is on your `PATH`. If it isn't, the hook warns
and lets the commit through — install gitleaks locally to actually enforce
the check: `brew install gitleaks` (macOS) or see the gitleaks README for
other platforms.

## Known limitations

- GitHub's GraphQL API doesn't expose a review-request timestamp directly;
  `reviewQueue[].requestedAt` uses the PR's `updatedAt` as the closest
  available proxy, not the exact moment a reviewer was requested.
- `config.yaml`'s M1/M4 feature `repos` and M3's repo are flagged
  provisional in that file's comments — a feature spanning more than the
  one listed repo will simply miss PRs in the unlisted repo, not error.
  Expand the `repos` list for a feature as you notice this.

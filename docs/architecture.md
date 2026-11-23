# Architecture

- `src/app/`: Next.js App Router pages, global styles, and route handlers.
- `src/app/api/health/route.ts`: uncached, dependency-free liveness response.
- `src/components/ui/`: editable shadcn/ui components (Button included).
- `src/lib/utils.ts`: `cn` merges conditional Tailwind classes.
- `components.json`: shadcn CLI aliases and Tailwind v4 configuration.
- `supabase/config.toml`: local Supabase ports, PostgreSQL version, and services.
- `supabase/migrations/`: ordered, versioned SQL migrations.
- `supabase/tests/database/`: transactional pgTAP assertions.
- `tests/e2e/`: Playwright tests against a production Next.js build.

The database schema uses Supabase Auth user IDs for profiles and organisation
memberships. Server Actions handle sign-in, MFA, recovery and onboarding. Workspace
routes verify the session and look up the user's role for the requested organisation.
See [authentication and onboarding](authentication.md) and the [role matrix](database.md#tenant-access).

Tailwind v4 is configured through `src/app/globals.css` and the PostCSS plugin.
Theme tokens support light and `.dark` modes; a theme switcher is not included.
System fonts keep builds independent of remote font downloads.

Add more shadcn components with:

```sh
npx shadcn@latest add input
```

Component source is checked into the repository. See the official
[shadcn manual setup](https://ui.shadcn.com/docs/installation/manual) and
[Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation).

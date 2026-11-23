# Public site

The landing page, pricing and free licence health check are public. Set `NEXT_PUBLIC_SITE_URL` to the production origin before building so canonical URLs, Open Graph metadata, `robots.txt` and the sitemap use the correct host. Legal placeholders are linked from the footer and marked `noindex` until approved.

The health check has five browser-only checkboxes. It does not request personal details, write browser storage or send selections to the server. It explains the scope of the checklist and has no result, score or recommendation. The public pricing page uses the same price definitions as Stripe Checkout. Paid plans are selected in Billing after account setup.

## Accessibility checks

`npm run test:e2e` includes Playwright axe checks on all six public pages and keyboard and data-handling tests for the checklist. Run `npm run build` followed by `npm run test:lighthouse` to check the production accessibility budget of 95 for all six routes. Use Node.js 22.19 or later for Lighthouse. Install Chromium with `npx playwright install chromium` or set `CHROME_PATH` to an installed Chrome executable. Optionally set `LIGHTHOUSE_URL` to a running test deployment. GitHub Actions runs both checks. [Lighthouse accessibility scoring](https://developer.chrome.com/docs/lighthouse/accessibility/scoring/)

## Hero asset

The built-in ImageGen tool produced `public/marketing/records-desk.webp` from this prompt:

> Use case: photorealistic-natural. Asset type: editorial hero photograph for a UK small-employer records website. Primary request: a sunlit oak desk in a modest British brick office looking across traditional London terraced rooftops, organised paper index files and a dark forest-green clothbound binder, an open silver laptop angled away with blank/unreadable screen, a pencil and off-white ceramic mug. Composition: wide horizontal close-to-medium shot, around 4:3 crop safe, binder and desk in centre and foreground, sash window and sunny brick buildings softly blurred above. Style: sophisticated independent magazine photography, tactile paper, realistic film grain, quiet daylight. Colours: cream, warm oak, moss green and reddish brick. Avoid flags, people, hands, readable text, logos, watermarks, official credentials, passports, fake UI and illustration.

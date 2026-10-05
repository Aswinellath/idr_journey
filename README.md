# IDR critical journey monitor

Playwright checks for the P0 and P1 journeys in the *IDR Online – Critical User Journeys* doc. GitHub Actions runs them every hour and posts to Slack when one fails.

## What is tested

| Journey | Priority | File | Checks |
| --- | --- | --- | --- |
| J3 Homepage + navigation | P0 | p0-critical.spec.ts | Homepage sections, menu links, logo, mobile burger menu |
| J1 Read an article | P0 | p0-critical.spec.ts | Title, byline, body, author bio, tags, Read Next, images, SEO tags |
| J2 Donate | P0 | p0-critical.spec.ts | Form loads, validation works, Donate buttons, gateway opens (daily only) |
| J4 Newsletter | P1 | p1-high.spec.ts | SIGN UP opens the form (submit is opt-in) |
| J5 Search | P1 | p1-high.spec.ts | Search returns results, not stuck on "Loading..." |
| J6 Listings | P1 | p1-high.spec.ts | One Sector, Theme and Expertise page show articles |
| J7 IDR Answers | P1 | p1-high.spec.ts | Subdomain up, login page loads, chat widget present |
| J8 Languages | P1 | p1-high.spec.ts | Hindi, Bengali, Gujarati, Kannada, Marathi load in their script |

Tests tagged `@mobile` also run on a Pixel 7 screen size.

## Run it on your computer

Needs Node.js 18 or newer.

```bash
npm install
npx playwright install chromium
npm test            # everything
npm run test:p0     # P0 only
npm run test:headed # watch it run in a browser window
npm run report      # open the HTML report with screenshots
```

## Set it up on GitHub (free)

1. Create a new GitHub repository and push this folder to it.
2. The workflow in `.github/workflows/cuj-monitor.yml` starts running on its own: hourly at :17, plus a daily run at 09:17 IST that also tests the payment gateway.
3. Optional secrets (repo Settings → Secrets and variables → Actions):
   - `SLACK_WEBHOOK_URL` — Slack incoming webhook for failure alerts. Without it, GitHub emails the repo owner when a run fails.
   - `NEWSLETTER_TEST_EMAIL` — a team inbox; enables a real newsletter submit test.
   - `TEST_DONOR_EMAIL` — inbox used in the donate form during the gateway test.
4. To run it by hand: Actions tab → IDR critical journeys → Run workflow.

When a run fails, open it in the Actions tab and download the `playwright-report` artifact. It has screenshots, a video and a trace of the failing step.

## Things to know

- **The gateway test never pays.** It fills the donate form with test data, clicks Contribute, confirms the gateway opens, then stops. It may still leave a pending order on the gateway or a lead in the donor database, so it runs once a day, not hourly. Ask the web team to filter out `CUJ Monitor Test` / `cuj-monitor@example.com`.
- **Bot traffic is labelled.** The browser identifies itself with `IDR-CUJ-Monitor/1.0` in its user agent, so it can be excluded from analytics.
- **Selectors may need tuning.** The tests were written against the live page text and structure on 4 October 2026 but were not run against the site from here. After a redesign, update the selectors in the failing test. Run `npm run test:headed` once first to confirm everything passes.
- **Stable article.** `STABLE_ARTICLE` in p0-critical.spec.ts points at one known article. Change it if that article is ever unpublished.
- **GitHub schedules can run a few minutes late** at busy times, and scheduled workflows pause after 60 days without repo activity. Pair this with an uptime monitor (UptimeRobot / HetrixTools) for fast down alerts.

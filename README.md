# IDR critical journey monitor

Automated Playwright checks for the most important user journeys on [idronline.org](https://idronline.org). They follow the P0/P1 priorities in the *IDR Online – Critical User Journeys* doc.

The tests run on GitHub Actions. A free [cron-job.org](https://cron-job.org) job triggers them on a schedule, and failures send an email (and optionally a Slack message) with screenshots.

---

## Contents

1. [What is tested](#1-what-is-tested)
2. [Folder structure](#2-folder-structure)
3. [Run the tests on your computer](#3-run-the-tests-on-your-computer)
4. [Put the project on GitHub](#4-put-the-project-on-github)
5. [Schedule runs with cron-job.org](#5-schedule-runs-with-cron-joborg)
6. [How often to run](#6-how-often-to-run)
7. [Alerts](#7-alerts)
8. [Making changes](#8-making-changes)
9. [Troubleshooting](#9-troubleshooting)
10. [Security and maintenance](#10-security-and-maintenance)

---

## 1. What is tested

| Journey | Priority | File | What is checked |
| --- | --- | --- | --- |
| J3 Homepage + navigation | P0 | `p0-critical.spec.ts` | Homepage sections, menu links, logo, mobile burger menu |
| J1 Read an article | P0 | `p0-critical.spec.ts` | Title, byline, body, author bio, tags, Read Next, images, SEO tags |
| J2 Donate | P0 | `p0-critical.spec.ts` | Form fields, amount/frequency buttons, validation, Donate links, gateway opens (daily, opt-in) |
| J4 Newsletter | P1 | `p1-high.spec.ts` | Footer email box and SIGN UP button, invalid email rejected |
| J5 Search | P1 | `p1-high.spec.ts` | Search returns results, not stuck on "Loading..." |
| J6 Listings | P1 | `p1-high.spec.ts` | One Sector, Theme and Expertise page show articles |
| J7 IDR Answers | P1 | `p1-high.spec.ts` | Subdomain up, login page loads, chat widget present |
| J8 Languages | P1 | `p1-high.spec.ts` | Hindi, Bengali, Gujarati, Kannada, Marathi load in their own script |

Tests tagged `@mobile` also run on a Pixel 7 screen size.

> **The donation test never pays.** It fills the form with test data, clicks Contribute, confirms the payment gateway opens, then stops. It may still leave a pending order or test record, so it only runs when `RUN_GATEWAY=1` (see [section 5](#5-schedule-runs-with-cron-joborg)). Ask the web team to filter out `CUJ Monitor Test` / `cuj-monitor@example.com`.

---

## 2. Folder structure

```
idr_journey/
├── package.json                 ← project info + shortcut commands
├── playwright.config.ts         ← global settings (site URL, timeouts, devices)
├── README.md                    ← this file
├── .gitignore                   ← files Git should ignore
├── tests/
│   ├── helpers.ts               ← shared building blocks used by all tests
│   ├── p0-critical.spec.ts      ← J1, J2, J3 (P0 journeys)
│   └── p1-high.spec.ts          ← J4 to J8 (P1 journeys)
└── .github/
    └── workflows/
        └── cuj-monitor.yml      ← GitHub Actions workflow (what runs, alerts)
```

Created automatically when tests run (don't edit or upload these):

| Folder | What it is |
| --- | --- |
| `node_modules/` | Installed Playwright code (from `npm install`) |
| `test-results/` | Screenshots, videos and traces of failures |
| `playwright-report/` | HTML report opened by `npm run report` |

### What each file does

**`package.json`** defines the short commands:

| Command | What it does |
| --- | --- |
| `npm test` | Run everything |
| `npm run test:p0` | Run P0 journeys only |
| `npm run test:p1` | Run P1 journeys only |
| `npm run test:headed` | Run in a visible browser window |
| `npm run report` | Open the HTML report with screenshots |

**`playwright.config.ts`** is the control panel:

- `baseURL`: the site under test. Change it to test a staging site.
- `timeout`: 60 s per test. `actionTimeout`: 15 s per click or check.
- `retries: 1`: a failed test is retried once before it counts as a failure.
- `projects`: `desktop` runs everything; `mobile` (Pixel 7) runs only tests tagged `@mobile`.

**`tests/helpers.ts`** holds reusable pieces:

- `gotoOk()` opens a page and fails on an error status or a WordPress error screen.
- `acceptCookies()` closes the cookie banner.
- `visible()` picks the visible copy of an element (the site renders many hidden duplicates).
- `expectImagesLoaded()` checks that images aren't broken.

**Test files** are organised like this:

```ts
test.describe('J2 — Make a donation @P0', () => {        // a journey (group)
  test('donate form loads and validates @mobile', async ({ page }) => {   // one check
    await gotoOk(page, '/donate/');                       // step: open page
    await expect(...).toBeVisible();                      // step: verify something
  });
});
```

Tags in the names control what runs: `@P0` / `@P1` set the priority, and `@mobile` also runs the test on a phone-size screen.

**`.github/workflows/cuj-monitor.yml`** installs Playwright, runs P0 then P1, uploads the report, posts to Slack on failure, and marks the run red if anything failed.

---

## 3. Run the tests on your computer

Requires **Node.js 18 or newer** ([nodejs.org](https://nodejs.org), LTS version). Check it with `node -v`.

```bash
cd idr_journey                  # the folder that contains package.json
npm install                     # once
npx playwright install chromium # once
npm run test:headed             # watch it run
npm run report                  # view results and screenshots
```

> **Windows tip:** extracting the zip often creates a folder inside a folder (`idr-journeys\idr-journeys\`). If npm says it can't find `package.json`, `cd` one level deeper.

When a test fails, click it in the report. The error is shown at the top, with a screenshot and a trace you can step through.

---

## 4. Put the project on GitHub

1. Create a repository on GitHub. This project lives at **`Aswinellath/idr_journey`**.
2. Upload every file **except** `node_modules`, `test-results` and `playwright-report`.
   - The `.github` folder is hidden by default. Show hidden files (Linux: `Ctrl + H`, Mac: `Cmd + Shift + .`, Windows: View → Hidden items) and make sure it's uploaded.
3. Open the **Actions** tab. If GitHub asks, click to enable workflows.
4. Test it manually: **Actions → IDR critical journeys → Run workflow**. A green tick means pass; a red cross means a failure (open the run and download **playwright-report** for screenshots).

---

## 5. Schedule runs with cron-job.org

GitHub's built-in schedule (`schedule:` / `cron:` in the workflow) is often late or skipped on free accounts. We use **cron-job.org** instead: it calls GitHub's API on time to press "Run workflow" for us.

### Step 1: Create a GitHub token

A **classic** token is the simplest:

1. GitHub → profile picture → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**.
2. **Note:** `cron-job`. **Expiration:** 90 days (put a reminder in your calendar).
3. Tick **`repo`** and **`workflow`**.
4. Click **Generate token** and copy it (it starts with `ghp_`). GitHub shows it only once.

<details>
<summary>Using a fine-grained token instead</summary>

Settings → Developer settings → **Fine-grained tokens → Generate new token**:

- **Repository access:** Only select repositories → `idr_journey`
- **Repository permissions → Actions:** **Read and write** (defaults to "No access", so it's easy to miss)
</details>

### Step 2: Check the token works (optional, Linux/Mac terminal)

Store the token without it showing on screen:

```bash
read -s GH_TOKEN      # paste the token, press Enter
```

List the repositories the token can see. `Aswinellath/idr_journey` must be in the list:

```bash
curl -s -H "Authorization: Bearer $GH_TOKEN" "https://api.github.com/user/repos?per_page=100" | grep full_name
```

Confirm the workflow file name:

```bash
curl -s -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/repos/Aswinellath/idr_journey/actions/workflows | grep '"path"'
# expected: ".github/workflows/cuj-monitor.yml"
```

Trigger a run. The first line of the output should be `HTTP/2 204`:

```bash
curl -i -X POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/Aswinellath/idr_journey/actions/workflows/cuj-monitor.yml/dispatches \
  -d '{"ref":"main"}'
```

### Step 3: Create the cron-job.org job

1. Sign up at [cron-job.org](https://cron-job.org) → **Cronjobs → Create cronjob**.
2. Title: `IDR journeys – hourly`.
3. Click **IMPORT FROM CURL** (bottom left) and paste this, with your token in place of `YOUR_TOKEN`:

   ```
   curl -X POST "https://api.github.com/repos/Aswinellath/idr_journey/actions/workflows/cuj-monitor.yml/dispatches" -H "Authorization: Bearer YOUR_TOKEN" -H "Accept: application/vnd.github+json" -H "Content-Type: application/json" -d '{"ref":"main"}'
   ```

4. After importing, check the **Advanced** tab:
   - **Request method:** `POST`
   - **Headers:** `Authorization`, `Accept`, `Content-Type` are all present
   - **Request body:** exactly `{"ref":"main"}`. Watch out for the browser's password manager filling this field.
   - **Time zone:** `Asia/Colombo` (or your own)
5. Set the **schedule** (see [section 6](#6-how-often-to-run)).
6. Tick **Notify me when execution fails**.
7. **Save**, then **Test run**. The result must be **204 No Content**. Within a minute a new run labelled **workflow_dispatch** appears in GitHub's Actions tab.

### Step 4 (optional): Daily payment gateway check

Create a second cronjob, `IDR journeys – daily gateway`, set to run once a day (e.g. 09:15). Use the same import, but with this body:

```
-d '{"ref":"main","inputs":{"run_gateway":"true"}}'
```

### Step 5 (optional): Turn off GitHub's own schedule

To avoid occasional duplicate runs, delete these lines from `.github/workflows/cuj-monitor.yml`:

```yaml
  schedule:
    - cron: '17 * * * *'
    - cron: '47 3 * * *'
```

Keep the `workflow_dispatch:` section. cron-job.org needs it.

---

## 6. How often to run

| Check | Tool | Recommended frequency |
| --- | --- | --- |
| Is the site up? | Uptime monitor ([UptimeRobot](https://uptimerobot.com) / [HetrixTools](https://hetrixtools.com), free) | Every 1–5 min |
| Do the journeys work? | Playwright via cron-job.org | **Every 30–60 min** |
| Does the payment gateway open? | Playwright, `run_gateway: true` | Once a day |

**Don't run Playwright every 5 minutes.**

- A full run takes about 4–5 minutes, so runs overlap and queue up.
- **Private repositories** get 2,000 free Actions minutes a month. Every 5 minutes uses roughly 1,400 minutes a day, so the free allowance runs out in about a day and a half and *all* runs stop until the next month. Public repositories have no minute limit.
- It adds 300+ page loads an hour to idronline.org and its analytics.

Fast outage alerts are the uptime monitor's job. Playwright catches subtler breakages, like a donate button that does nothing, and those don't need checking every few minutes.

Suggested uptime monitors: homepage, `/donate/` (keyword `Contribute`), one recent article, `hindi.idronline.org`, `idranswers.idronline.org`, `accounts.idronline.org`.

---

## 7. Alerts

| Alert | How to set it up |
| --- | --- |
| **GitHub email** (default) | GitHub emails you when a run fails. Check GitHub → Settings → Notifications → Actions. |
| **Slack** | Create a Slack *Incoming Webhook* for your channel. In the repo: **Settings → Secrets and variables → Actions → New repository secret**, name `SLACK_WEBHOOK_URL`, paste the URL. |
| **cron-job.org** | Tick *Notify me when execution fails* on the cronjob. This catches token or API problems, not test failures. |

Other optional secrets (same place as Slack):

| Secret | Purpose |
| --- | --- |
| `NEWSLETTER_TEST_EMAIL` | A team inbox; enables a real newsletter signup test |
| `TEST_DONOR_EMAIL` | Inbox used in the donate form during the gateway test |

**When a run fails:** Actions tab → open the red run → scroll down → download **playwright-report** → open `index.html`. Each failure has a screenshot, a video and a step-by-step trace.

---

## 8. Making changes

| I want to… | File | What to change |
| --- | --- | --- |
| Change the stable test article | `tests/p0-critical.spec.ts` | `STABLE_ARTICLE` near the top |
| Test different Sector/Theme pages | `tests/p1-high.spec.ts` | the `listings` list in J6 |
| Add or remove a language | `tests/p1-high.spec.ts` | the `languages` list in J8 |
| Change the search word | `tests/p1-high.spec.ts` | `'education'` in J5 |
| Change how often it runs | cron-job.org | the cronjob's schedule |
| Test a staging site | `playwright.config.ts` | `baseURL` |
| Allow more time on a slow site | `playwright.config.ts` | `timeout` / `actionTimeout` |
| Also test on iPhone | `playwright.config.ts` | add `{ name: 'iphone', use: { ...devices['iPhone 14'] }, grep: /@mobile/ }` to `projects` |
| Run a test on mobile too | either spec file | add ` @mobile` to the test's name |
| Change a journey's priority | either spec file | change `@P1` ↔ `@P0` in the `test.describe` name |

### Adding a new journey

Add a block to a spec file, or create a new file such as `tests/p2-medium.spec.ts`. Playwright picks up any `*.spec.ts` file in `tests/` automatically.

```ts
import { test, expect } from '@playwright/test';
import { gotoOk } from './helpers';

test.describe('J12 — Contact page @P2', () => {
  test('contact page loads with an email address', async ({ page }) => {
    await gotoOk(page, '/contact/');
    await expect(page.getByText(/@idronline\.org/).first()).toBeVisible();
  });
});
```

If you add a new priority tag (like `@P2`), also add a run step for it in `cuj-monitor.yml`: copy the "Run P1 journeys" step and change `@P1` to `@P2`.

### Tips

- **Find the right locator:** `npx playwright codegen https://idronline.org` opens a browser; click around and Playwright writes the code for you.
- **Run one test:** `npx playwright test -g "contact page" --headed`
- **When a test breaks after a site redesign:** open the failure in the report. The page snapshot shows the real button and field names, so update the locator to match. Prefer `getByRole('button', { name: ... })` and `getByRole('textbox', { name: ... })` over CSS selectors.

---

## 9. Troubleshooting

| Problem | Cause | Fix |
| --- | --- | --- |
| `npm error ENOENT ... package.json` | Running from the wrong folder | `cd` into the folder that contains `package.json` (often one level deeper after unzipping) |
| Tests take ~2 min each then fail | Waiting on a hidden element | Use `visible(...)` or `getByRole(...)`; check the snapshot in the report |
| Scheduled runs don't happen, manual runs work | GitHub's schedule is unreliable on free accounts | Use cron-job.org ([section 5](#5-schedule-runs-with-cron-joborg)) |
| cron-job.org: **404 Not Found** | Wrong repo name in the URL (it's `idr_journey`, with an underscore), token can't see the repo, or missing `Authorization` header | Run the checks in [section 5, step 2](#step-2-check-the-token-works-optional-linuxmac-terminal) |
| cron-job.org: **401 Unauthorized** | Token expired or mistyped | Generate a new token and update the cronjob |
| cron-job.org: **403 Forbidden** | Token lacks Actions/workflow permission | Classic: tick `repo` + `workflow`. Fine-grained: Actions → Read and write |
| cron-job.org: **422 Unprocessable** | Branch in the body doesn't exist | Use your default branch name in `{"ref":"..."}` (`main` or `master`) |
| cron-job.org: **204 No Content** | ✅ Success | A run should appear in the Actions tab |
| Workflows stopped running | Private repo used its 2,000 free minutes, or 60 days without repo activity | Reduce frequency; re-enable the workflow from the Actions tab |

---

## 10. Security and maintenance

- **Never paste a token into chats, tickets, screenshots or code.** If one is exposed, delete it immediately (GitHub → Settings → Developer settings → Personal access tokens) and create a new one.
- In a terminal, use `read -s GH_TOKEN` and `$GH_TOKEN` so the token never appears on screen.
- Give the token the **minimum access** needed: only this repository.
- **Token expiry:** when the token expires, cron-job.org starts returning 401 and tests silently stop. Set a calendar reminder a week before expiry, then generate a new token and update the cronjob's `Authorization` header.
- The test browser identifies itself as `IDR-CUJ-Monitor/1.0` in its user agent, so the web team can exclude it from analytics.
- Review the tests after any site redesign, and run `npm run test:headed` once locally to confirm everything still passes.

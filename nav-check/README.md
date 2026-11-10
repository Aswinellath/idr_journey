# IDR menu & links check

A dedicated, separate test suite that checks **idronline.org's menus, dropdowns and menu links** on every major browser and screen size, twice a day (**07:00 and 17:00**, Sri Lanka / India time).

It is independent of the critical-journey monitor (`tests/`, `cuj-monitor.yml`). It has its own tests, its own workflow and its own schedule.

---

## What it checks

Every check runs on **9 combinations**:

| | Chrome | Firefox | Safari (WebKit) |
| --- | --- | --- | --- |
| **Desktop** (1440 × 900) | chromium-desktop | firefox-desktop | webkit-desktop |
| **Tablet** (iPad, 810 wide) | chromium-tablet | firefox-tablet | webkit-tablet |
| **Mobile** (Pixel 7 / iPhone 14, ~390 wide) | chromium-mobile | firefox-mobile | webkit-mobile |

| Test | What it does |
| --- | --- |
| **Menu items and dropdowns work** (on `/` and `/about/`) | Desktop: all expected top-level items are visible; every dropdown opens on hover, shows links and fits on screen. Tablet/mobile: tapping ☰ opens the menu; every submenu expands when its arrow is tapped. Also flags pages that scroll sideways on that screen size. |
| **Menu links open the right pages** | Clicks each visible top-level menu link (up to 12) in that browser and confirms a real page opens: no 404 and no "page not found". |
| **Dropdown items open the right pages** | Opens each dropdown the way a user would (hover on desktop, tap on touch screens), then clicks the items inside it one by one (the first 4 per dropdown) and confirms each opens a real page. |
| **Every menu and dropdown link responds** | Collects *every* link in the header, dropdowns and mobile menu, and checks each returns a working status. Runs once (chromium-desktop), because a link's status is the same in every browser. |

**Clicks behave like a person's.** Before clicking, the test scrolls the item into view and aims at a part that isn't covered by anything (a badge, a chat panel). It moves the mouse there naturally (into a dropdown it goes down first, then across). If nothing happens, it waits a little longer and clicks again, up to 3 times, before reporting a failure and moving on. Hovers come in from outside the item and move slowly, because many WordPress menus only open after real mouse movement. Items that needed a second or third try are listed under **Worked only after re-clicking** in the run summary.

Dropdowns are **found automatically**, so if IDR adds a new dropdown it's tested without changing any code. On tablet and mobile, only items with an arrow/toggle or a `#` parent link count as dropdowns. Items like About and Sectors are plain links there (their mega-menu is desktop-only), and the test run's notes list them as "plain links on this screen".

---

## Folder structure

```
idr_journey/                       ← your existing repository
├── .github/workflows/
│   ├── cuj-monitor.yml            ← existing journey monitor (unchanged)
│   └── nav-check.yml              ← NEW: menu & links workflow
├── tests/ …                       ← existing journey tests (unchanged)
└── nav-check/                     ← NEW: this project
    ├── site.config.ts             ← site settings (URL, menu items, ☰ button) — edit here
    ├── playwright.config.ts       ← the 9 browser × screen combinations
    ├── package.json
    ├── scripts/summary.mjs        ← builds the pass/fail table on GitHub
    └── tests/
        ├── helpers.ts             ← finding/opening dropdowns, collecting links
        └── menu.spec.ts           ← the three tests
```

---

## 1. Run it on your computer

```bash
cd nav-check
npm install
npx playwright install chromium firefox webkit   # once
npm run test:headed                              # watch Chrome desktop
npm test                                         # all 9 combinations
npm run report                                   # screenshots of any failures
```

Handy shortcuts: `npm run test:desktop`, `npm run test:mobile`, `npm run test:chrome`.

---

## 2. Add it to GitHub

1. Open your `idr_journey` repository → **Add file → Upload files**.
2. Upload the **`nav-check`** folder, and **`nav-check.yml`** into `.github/workflows/`. (Show hidden files to see `.github`.)
3. Commit. In the **Actions** tab you'll now see **IDR menu & links check** next to the existing workflow.
4. Test it once: **Actions → IDR menu & links check → Run workflow**. Chrome, Firefox and Safari run as **three parallel jobs** inside Playwright's ready-made Docker image (browsers pre-installed), so a run takes about 5 minutes.

When it finishes, the run page shows a **summary table** (✅/❌ per browser and screen, with the failing dropdown or link named). Download **nav-check-report** for screenshots, videos and traces.

---

## 3. Schedule it for 07:00 and 17:00 (cron-job.org)

This uses the same approach as the journey monitor, with a **new, separate cron job**.

1. **Token:** your existing token works if it's a **classic** token with `repo` + `workflow`, or a fine-grained token with access to `idr_journey` and **Actions: Read and write**.
2. In cron-job.org: **Create cronjob**, title `IDR menu & links check`.
3. Click **IMPORT FROM CURL** and paste (with your token):

   ```
   curl -X POST "https://api.github.com/repos/Aswinellath/idr_journey/actions/workflows/nav-check.yml/dispatches" -H "Authorization: Bearer YOUR_TOKEN" -H "Accept: application/vnd.github+json" -H "Content-Type: application/json" -d '{"ref":"main"}'
   ```

4. **Schedule** → choose **Custom**:
   - **Days of month:** every day. **Months:** every month. **Days of week:** every day.
   - **Hours:** tick **7** and **17**.
   - **Minutes:** tick **0**.
5. **Advanced → Time zone:** `Asia/Colombo` (same clock as India).
6. Tick **Notify me when execution fails**, then **Save** → **Test run**. The result should be **204 No Content**.

> **Prefer GitHub's own scheduler?** In `nav-check.yml`, uncomment the `schedule:` block (it's already set to 07:00 and 17:00 IST, written in UTC as `30 1` and `30 11`). Don't use both, or it runs twice.

---

## 4. Alerts

- **Email:** GitHub emails you when a run fails (Settings → Notifications → Actions).
- **Slack:** uses the same `SLACK_WEBHOOK_URL` secret as the journey monitor, if you set one.

---

## 5. Changing what's checked

All settings are in **`nav-check/site.config.ts`**:

| I want to… | Change |
| --- | --- |
| Add or rename an expected menu item | `expectedDesktopItems` / `expectedMobileItems` |
| Require a dropdown to exist and open | `expectedDesktopDropdowns` / `expectedMobileDropdowns` |
| Check menus on more pages | `pages` (e.g. add `'/donate/'`) |
| Click more links per browser | `maxClickLinks` |
| Click more items inside each dropdown | `maxItemsPerDropdown` (default 4) |
| Change how many times a click is retried | `clickTries` (default 3) |
| Ignore a link (e.g. an external site that blocks bots) | add a pattern to `skipLinks` |
| The ☰ icon changed after a redesign | `burgerSelectors` |
| Use it for **vallath.in** or **samuhikpahal.org** | copy the `nav-check` folder (e.g. `nav-check-vallath`), change `baseURL`, the menu items and `burgerSelectors`, then copy the workflow with the new folder name |

To add or remove a browser or screen size, edit `projects` in `playwright.config.ts`.

---

## 6. Reading a failure

| Message | Meaning |
| --- | --- |
| `Menu item missing or hidden: "Fellowship"` | That item isn't visible on this screen size, or was renamed. |
| `Dropdown "Sectors" did not open (hovering did not open it)` | Desktop dropdown broken in that browser. |
| `Dropdown "Sectors" did not open (no tappable arrow/toggle opened it)` | Mobile submenu can't be expanded by tapping. |
| `Expected dropdown not found in the mobile menu: "Languages"` | That dropdown has gone, or lost its arrow/toggle. |
| `Dropdown "More" runs off the screen` | The submenu is cut off at the screen edge on that size. |
| `Page scrolls sideways by 40px` | Something (often the header) is wider than the screen. |
| `"Health" → …/health/: HTTP 404` | A menu link is broken. |
| `3 clicks, no page opened (nothing happened after clicking)` | The link didn't respond, even after re-clicking. |
| `3 clicks, no page opened (something on the page is covering it: <div class="…">)` | Another element sits fully on top of the link. The class name shows what it is. |
| `Sectors › "Health" → …: HTTP 404` | An item inside the Sectors dropdown is broken. |

If a failure appears in **one browser only**, it's a browser-specific bug (common with Safari). If it appears **everywhere**, the link or menu itself has changed.

---

## 7. Cost and load

- Each run is three parallel jobs of about 5 minutes. Your repository is public, so GitHub Actions minutes are free.
- **Upgrading Playwright:** the version in `nav-check/package.json` (`1.65.0`) must match the Docker image tag in `nav-check.yml` (`v1.65.0-noble`). Change both together, or the browsers won't be found.
- About 250 page loads per run on idronline.org.

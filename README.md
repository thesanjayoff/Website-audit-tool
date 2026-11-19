# Website Audit Tool

A local, single-user website audit tool for an agency's own use. Point it at
a site you own or have permission to audit, and it crawls the key pages,
runs real Lighthouse/axe-core/Pa11y audits (mobile + desktop), grades
security headers and TLS, checks SEO and basic content/UX, scores everything
with a transparent formula, and produces a client-ready report.

No accounts, no billing, nothing leaves your machine except the outbound
requests to the site being audited (and, optionally, the Chrome UX Report
API and Anthropic's API if you turn those on).

## Quick start

```bash
npm install                 # also downloads a Playwright Chromium build
cp .env.example .env.local  # everything in it is optional
npm run db:migrate
npm run db:seed             # two demo projects, so the dashboard isn't empty
npm run dev
```

Open http://127.0.0.1:3000. The two seeded demo projects ("Riverside
Dental", "Northwind Outfitters") point at fake `*.demo.invalid` domains and
exist only to populate the dashboard, trend chart, and "what changed since
last audit" diff on first run — delete them once you've run a real audit.

To audit a real site: **New Audit** → enter the URL → confirm you own it or
have permission (this is logged) → the tool crawls and discovers pages →
pick which pages/devices to audit → run. Progress streams live; when it's
done you get scores, findings, and export options (HTML, PDF, CSV,
Markdown, or a standalone shareable HTML report).

### Running the test suite

```bash
npm test          # vitest: scoring, dedup, SSRF blocking, report escaping, missing-field-data handling
npm run typecheck
npm run build
```

There are also two local fixture sites under `test/fixtures/` — a
deliberately clean "good" site and a deliberately broken "bad" site
covering every engine's checks — served by:

```bash
npm run fixtures:serve   # http://127.0.0.1:4173/good/ and /bad/
```

Auditing `127.0.0.1` is normally blocked by this tool's own SSRF
protection (see below); to audit the fixtures locally, set
`SSRF_ALLOWLIST_HOSTS=127.0.0.1` in your environment first. **Never set
that variable for a real deployment** — it exists purely so the fixtures
are testable.

A sample client-facing HTML report (generated from the seeded Riverside
Dental demo audit) is checked in at
[`docs/sample-report.html`](docs/sample-report.html) — open it directly in
a browser to see what a finished report looks like without running an
audit first.

## Environment variables

See `.env.example` for the full list and inline documentation. Everything
is optional:

- `CRUX_API_KEY` — enables real-user field data (Core Web Vitals history)
  from the Chrome UX Report API. Without it, the tool honestly reports "no
  field data available" rather than fabricating or substituting lab data.
- `WEBPAGETEST_API_KEY` / `WEBPAGETEST_ENABLED` — optional secondary
  performance data point.
- `AI_PROVIDER` / `ANTHROPIC_API_KEY` — optional layer that rewrites
  already-computed finding text and executive summaries into more
  client-friendly prose. It is never given raw page content and can never
  change a score or invent a finding; every AI-touched section is labelled
  as such in the report. Defaults to off (`local`, a no-op template path).
- `HOST` / `PORT` — defaults to `127.0.0.1:3000` (localhost-only).

## What this tool checks

**Performance** — Lighthouse (performance, SEO, best-practices
categories), run 3× per page/device and **reported as the median**, since
individual Lighthouse runs vary run-to-run. Core Web Vitals (LCP, CLS) use
Google's published thresholds (`src/server/config/thresholds.ts`). INP has
no reliable lab equivalent, so Total Blocking Time is shown as a labelled
lab *proxy* for INP, never as INP itself. Real-user field data (CrUX) is
shown separately and only when `CRUX_API_KEY` is set — the UI says "no
field data" rather than hiding the gap or using lab data as a stand-in.

**SEO** — titles, meta descriptions, headings, canonical tags, robots
directives, sitemap presence, broken links, redirect chains, alt text,
Open Graph/Twitter cards, structured data, viewport, internal linking
depth, thin/duplicate content, and local-business NAP consistency checks.
Findings cite general Google Search Central guidance and are explicit that
following them is best practice, not a ranking guarantee.

**Accessibility** — axe-core and Pa11y (HTML_CodeSniffer, WCAG2AA ruleset),
mapped to WCAG 2.2 A/AA with impact, selector, and a code snippet per
violation, plus manual heuristic checks (keyboard focus visibility, skip
links, form labelling, link text, `lang` attribute, heading order, basic
contrast). **Automated tools only catch roughly 30–50% of real
accessibility issues** — this is stated directly in every report, along
with a manual-review checklist. The tool never claims "compliance" with
any standard.

**Security** — HTTP security header grading (a from-scratch
reimplementation of MDN HTTP Observatory-style rules: CSP, HSTS,
X-Content-Type-Options, clickjacking protection, Referrer-Policy,
Permissions-Policy, cookie flags), TLS certificate validity/expiry/
protocol/cipher, HTTP→HTTPS redirect, mixed content, exposed `Server`
version strings, directory-listing detection, and a single polite,
permission-gated request each for an exposed `.git`/`.env`. Third-party
scripts are inventoried with a privacy note, and a cookie-consent banner's
presence is checked. **This is explicitly not a penetration test** — no
login attempts, fuzzing, or vulnerability exploitation, ever.

**Content/UX** — readability, broken images, missing favicon, missing
contact info, mobile tap-target size, and font size. Design choices
themselves are never judged.

## Scoring

Overall score = weighted average of four category scores (performance 30%,
SEO 25%, accessibility 25%, security 20% — see
`src/server/config/scoring.ts`). Each category score comes from concrete,
visible sub-metrics; severity-weighted issue counts are converted to a
0–100 score through a square-root dampening curve, so the first critical
issue costs far more than the twentieth occurrence of the same issue
repeated across pages. **The raw metrics are always shown alongside the
derived score** — nothing is a black box, and every weight is adjustable
in one file. Findings with the same root cause across pages/devices are
deduplicated into a single finding listing every affected page.

"Top fixes" and "quick wins" are ranked by an impact-vs-effort priority
score, not just severity — a high-impact, low-effort fix always ranks
above a low-impact, high-effort one.

### Limitations, honestly

- Lighthouse lab scores vary between runs even with the median-of-3
  approach; treat scores as directionally meaningful, not to the decimal.
- Without a `CRUX_API_KEY`, there is no real-user field data — only lab
  data, which is shown as such.
- Accessibility automation catches roughly a third to half of real issues.
  A manual review is still necessary for any compliance-sensitive site.
- Security checks are passive and header/TLS/exposure-based only — they
  say nothing about application-level vulnerabilities (SQLi, auth bypass,
  etc.), which require active testing out of scope for this tool.
- SEO findings describe documented best practice; no tool can guarantee
  search ranking outcomes.
- **`npm run lint` is currently a no-op.** `typescript-eslint` hard-refuses
  to load against this project's TypeScript 7.x (the native/Go-rewrite
  compiler) — see [microsoft/TypeScript#... / typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940).
  Downgrading to TypeScript 6.x would fix this but was deliberately avoided
  to keep the project on current tooling; `npm run typecheck` (`tsc
  --noEmit`) is the real static-analysis gate in the meantime, and `npm
  run lint` just prints a pointer to this note. Revisit once
  typescript-eslint ships TS 7+ support.

## Safety

Every audit requires the user to type a permission confirmation ("I own
this site or have explicit permission to audit it") before it runs, which
is recorded in the database as an audit-log entry. The crawler/fetcher:

- Blocks requests to private/loopback/link-local IP ranges and re-validates
  on every redirect hop (SSRF protection, `src/server/security/ssrf.ts`),
  resolving and pinning the IP before connecting rather than trusting DNS
  at request time.
- Respects `robots.txt`, uses a descriptive User-Agent identifying itself
  as an audit bot, rate-limits requests to the target host, and caps page
  count and concurrency.
- Sandboxes the headless browser and treats all fetched page content as
  untrusted: every value from an audited page is HTML-escaped before it
  reaches a report, so a malicious page can't inject script into your own
  report output.
- Limits response sizes and timeouts, and never attempts logins, fuzzing,
  or any other active probing — only passive, read-only checks.

## Project structure

```
src/server/engines/     # performance, seo, accessibility, security, content checks
src/server/audit/       # per-page/per-device orchestration (runAudit.ts)
src/server/scoring/     # score aggregation, dedup, prioritization
src/server/reports/     # HTML/PDF/CSV/Markdown/GitHub-issue export + escaping
src/server/security/    # SSRF protection
src/server/db/          # Drizzle schema, migrations, seed script
src/app/                # Next.js App Router pages + API routes
src/components/ui/      # shadcn/ui primitives (Base UI + Tailwind), generated via `npx shadcn add`
test/fixtures/          # local good/bad test sites + static server
test/unit/              # vitest suite
```

### UI stack

The frontend is Tailwind CSS 4 plus [shadcn/ui](https://ui.shadcn.com) components
(built on [Base UI](https://base-ui.com), not Radix — shadcn's newer default).
Brand colors live as CSS variables in `src/app/globals.css`; shadcn's own
`--primary`/`--ring` tokens are aliased to the same brand `--accent` variable
so generated components stay on-brand automatically in both themes. Dark mode
toggles the standard `.dark` class on `<html>` via `next-themes`. To add another
component: `npx shadcn@latest add <name>`.

## References and prior art

Built from scratch with original code, following the public documentation
and methodology of: [Lighthouse](https://developer.chrome.com/docs/lighthouse)
and [Unlighthouse](https://unlighthouse.dev/), the
[Chrome UX Report API](https://developer.chrome.com/docs/crux/api) and
[Web Vitals](https://web.dev/articles/vitals), [axe-core](https://github.com/dequelabs/axe-core)
and [Pa11y](https://pa11y.org/), [MDN HTTP Observatory](https://developer.mozilla.org/en-US/observatory)
and [testssl.sh](https://testssl.sh/)/[SSL Labs](https://www.ssllabs.com/ssltest/),
[WebPageTest](https://webpagetest.org/), and
[Google Search Central](https://developers.google.com/search). UI/UX ideas
drew inspiration from Screaming Frog, Sitebulb, and Ahrefs Site Audit, with
entirely original code. Respect each service's terms and rate limits if you
wire up the optional integrations (CrUX, WebPageTest).

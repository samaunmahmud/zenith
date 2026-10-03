# Security

Zenith is a public research demo: no accounts, no personal data, no trading. The things worth protecting are the
operator's API keys and AI budget, the integrity of the committee's rulings, and visitors' browsers.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** (Security tab → "Report a vulnerability") rather than a public
issue. Reports are acknowledged within a few days.

## How the app is protected

| Risk | Control | Where |
|---|---|---|
| API keys leak | Keys live only in `.env` (gitignored, excluded from the Docker build context) or in Nebius SecretStash on the endpoint, never in the image or logs | `.gitignore`, `.dockerignore`, `scripts/deploy-nebius.sh` |
| Budget drained by traffic | Hard total spend cap (`MAX_SPEND_USD`, defaults to 0 = AI off), checked before every model call with a file-locked ledger that fails closed; recent decisions reused; global hourly and concurrency caps | `SpendGuard`, `CommitteeGate` |
| One visitor uses everyone's quota | Per-visitor sliding-window rate limit on every endpoint that can call Nemotron, and on live search | `ApiSecurityFilter` |
| Prompt injection via the thesis or a question | User text is length-limited, quoted in tags the prompt says to treat as data, and every reply must validate against a strict schema; figures are checked against the fact sheets | `ThesisService`, `AskService`, prompts, `NumberCheck` |
| Invented numbers | Every figure is computed in Java; evidence values must match a fact sheet or the reply is retried; figures in prose that aren't in the input are flagged in the UI and memo | `AnalystAgent`, `NumberCheck` |
| A saved ruling altered later | Each decision gets a SHA-256 receipt of its fact sheets, prompts, models and ruling; `/api/receipt` re-hashes it | `Receipt` |
| XSS | Strict Content Security Policy (scripts from this origin only, plus one inline script by hash); React escapes text; the memo renderer escapes markup (tested) | `ApiSecurityFilter`, `Markdown.tsx` |
| Clickjacking, MIME sniffing, referrer leaks | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` | `ApiSecurityFilter` |
| Oversized requests | API bodies capped at 16 KB; text inputs capped at 400 / 1,200 characters; ticker validated by a strict pattern | `ApiSecurityFilter`, `CommitteeController` |
| Internal details in errors | Unexpected errors return a reference code (details stay in the server log); upstream response bodies are never shown | `CommitteeController`, `TokenFactoryClient` |
| Log injection | Only validated tickers are logged | `CommitteeController` |
| Cache path traversal | Ticker-derived file names are sanitised (tested) | `DiskCache` |
| Vulnerable dependencies | Dependabot (npm, Maven, Actions, Docker), CodeQL static analysis, and `npm audit` failing CI on high/critical issues in shipped packages | `.github/` |
| Container compromise | Small JRE runtime image running as a non-root user, with a health check | `Dockerfile` |

## Known limits

- The spend ledger lives on the container's disk. If the endpoint restarts on fresh storage it resets to the value
  baked into the image, so the cap limits spend per container lifetime.
- Rate limits are per instance and in memory. That fits a single-instance demo; several replicas would need a shared store.
- Per-visitor limits key on the last `X-Forwarded-For` entry, which a reverse proxy appends. Without a proxy in front, a
  client could set that header itself and spread its requests across made-up addresses. The global caps (spend,
  hourly runs, concurrency) still hold in that case, so the budget stays protected either way.

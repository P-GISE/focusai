# FocusAI Design Contract

FocusAI uses a quiet operational dashboard style: dense enough for repeated study workflows, but calm enough for long sessions.

## Token Rules

- Shared color, radius, shadow, spacing, focus, and runtime-status values live in `src/index.css` under `:root`.
- New UI should prefer existing `--focus-*` tokens before introducing raw CSS literals.
- Raw color literals are allowed only for intentionally local chart gradients, decorative media treatments, or one-off data visualization stops. Repeated UI state colors must become tokens first.
- Keyboard focus must use `--focus-ring` and `--focus-ring-offset`.
- Korean body and heading text keeps `letter-spacing: 0` and uses `word-break: keep-all` where mobile copy could otherwise split syllables awkwardly.

## Visual Baselines

Canonical login-screen references are stored in `docs/visual-baselines/`:

- `focusai-login-desktop-1440x900.png`
- `focusai-login-mobile-500x844.png`

Update these images only after a deliberate design change and a passing `npm run test:e2e`.

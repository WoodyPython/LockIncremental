# AGENTS.md

## 1. Purpose

This file defines the working rules for coding agents contributing to the project. Follow `PROJECT.md` for product intent and `DESIGN.md` for UI and interaction requirements. Do not silently contradict those documents.

## 2. Core Workflow

For each task:

1. Read the relevant documentation and existing implementation before editing.
2. Identify the smallest coherent change that satisfies the request.
3. Write or update tests for nontrivial behavior.
4. Run formatting, type checking, tests, and production build.
5. Inspect the affected UI at desktop and mobile sizes when visual behavior changes.
6. Summarize what changed and disclose any checks that could not be run.

Do not perform unrelated refactors while implementing a focused feature.

## 3. Technical Direction

Use:

- Vite
- Vanilla TypeScript with strict type checking
- Semantic HTML
- Plain CSS with custom properties
- Canvas 2D for lock rendering
- `break_infinity.js` for scalable resource values
- `localStorage` for local persistence
- Vitest for unit tests
- GitHub Actions for validation and GitHub Pages deployment

Do not add a UI framework or state-management library without a demonstrated need and explicit approval.

## 4. Architecture

Keep these concerns separate:

- **Simulation:** deterministic game rules and progression
- **Runtime:** animation loop, timers, visibility handling, and input orchestration
- **Rendering:** canvas drawing and DOM updates
- **Persistence:** serialization, validation, migrations, import, and export
- **UI state:** selected tab, dialogs, transient messages, and notifications
- **Game data:** upgrades, goals, balance constants, and formatting thresholds

Recommended source structure:

```text
src/
  main.ts
  app/
    App.ts
    tabs.ts
  game/
    GameState.ts
    LockRun.ts
    progression.ts
    rewards.ts
    goals.ts
    constants.ts
  runtime/
    GameLoop.ts
    InputController.ts
    visibility.ts
  rendering/
    LockRenderer.ts
    effects.ts
    resizeCanvas.ts
  storage/
    save.ts
    schema.ts
    migrations.ts
    importExport.ts
  ui/
    mainView.ts
    settingsView.ts
    statusBar.ts
    dialog.ts
    notifications.ts
  utils/
    decimal.ts
    format.ts
    math.ts
  styles/
    tokens.css
    base.css
    components.css
    responsive.css
  tests/
public/
```

This is a guide rather than a mandate. Preserve a coherent existing structure when one is already established.

## 5. TypeScript Rules

- Enable `strict` mode.
- Avoid `any`. Use `unknown` at external boundaries and narrow it safely.
- Prefer explicit domain types for state, settings, save data, and run results.
- Use discriminated unions for state machines such as idle, active, failed, and completed.
- Keep functions small and give them one clear responsibility.
- Prefer pure functions for calculations.
- Avoid hidden global mutable state.
- Use `readonly` where mutation is not intended.
- Validate all data read from storage or imported by a player.

## 6. Game Loop and Determinism

- Use `requestAnimationFrame` for visual updates.
- Express movement in units per second and multiply by delta time.
- Clamp large frame deltas.
- Keep reward and success resolution outside rendering code.
- Award completion rewards exactly once.
- Prevent duplicate pointer and keyboard inputs from registering as multiple hits.
- Represent run lifecycle as an explicit state machine.
- Make angular hit testing a pure, unit-tested function.
- Use seeded or injectable randomness where deterministic tests benefit from it.

## 7. Big-Number Rules

Use `break_infinity.js` `Decimal` values for:

- Player currencies
- Lifetime totals
- Costs
- Production or reward values
- Goal requirements
- Multipliers that may grow significantly

Ordinary JavaScript numbers are acceptable for:

- Angles
- Frame delta time
- Pixel positions
- Array indices
- Settings intervals
- Run hit counts such as `7 / 20`

Additional requirements:

- Do not convert a `Decimal` to `number` for game calculations unless the value is known and enforced to remain small.
- Serialize big numbers using a stable string representation.
- Centralize number formatting.
- Test formatting at zero, negatives where supported, notation boundaries, and extremely large values.

## 8. Persistence Rules

- Use one namespaced `localStorage` key for the primary save.
- Include a numeric save schema version.
- Keep migrations sequential and testable.
- Never trust parsed JSON solely because parsing succeeded.
- Validate required fields, types, bounds, and enumerated settings.
- Save on the configured autosave interval and on appropriate lifecycle events such as `visibilitychange`.
- Do not implement offline rewards.
- Imports must be transactional: validate fully before replacing active state.
- Exports must be portable text and downloadable JSON or encoded text files.
- Handle unavailable or quota-limited storage gracefully.

Suggested save envelope:

```ts
interface SaveEnvelope {
  version: number;
  savedAt: string;
  game: SerializedGameState;
  settings: GameSettings;
}
```

## 9. UI Engineering Rules

- Follow `DESIGN.md` exactly for palette, navigation, settings, notifications, and footer behavior.
- Use CSS custom properties for design tokens.
- Do not add arbitrary colors inside component styles.
- Use semantic buttons instead of clickable `div` elements.
- Keep surrounding menus in HTML; use Canvas only for the lock gameplay and its immediate effects.
- All visual interaction must have keyboard and focus behavior.
- Avoid layout shifts when tabs receive notification outlines.
- Honor reduced-motion settings in CSS and TypeScript animations.
- Keep DOM updates targeted; do not rebuild the entire page every animation frame.

## 10. Testing Requirements

At minimum, unit-test:

- Angular distance and wraparound hit detection
- Run state transitions
- Success, miss, and completion resolution
- Reward awarded exactly once
- Goal progress calculations
- Big-number serialization and formatting
- Save validation
- Save migrations
- Import rejection for malformed data
- Settings defaults and normalization

Use browser-level tests for critical flows when practical:

- Start a run
- Register a hit and direction reversal
- Lose a run
- Complete a run
- Save and reload
- Export and import
- Wipe confirmation
- Toggle tab notifications

Tests must not depend on real wall-clock delays when fake timers or injected time can be used.

## 11. Quality Gates

Before considering a task complete, run the project equivalents of:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

If a script does not exist and the project is early enough to establish it, add the appropriate script and tooling. Keep configuration minimal.

## 12. Performance

- Avoid allocations inside the per-frame render loop when simple object reuse is reasonable.
- Do not write to `localStorage` every frame or after every hit.
- Resize the canvas only when its displayed dimensions or device pixel ratio changes.
- Pause or reduce rendering when the document is hidden.
- Keep initial bundle size modest and avoid unnecessary dependencies.

## 13. Error Handling

- Never silently discard a player's existing save.
- Surface import, export, save, and storage errors in the UI.
- Log useful technical context in development without exposing raw stack traces to players.
- Recover to a safe idle state after unexpected run errors.
- Preserve the previous valid state when a load or import fails.

## 14. Security and Privacy

- Treat all imported save text as untrusted input.
- Do not use `innerHTML` with player-controlled data.
- Do not add analytics, remote scripts, accounts, or network calls without explicit approval.
- The initial game should work entirely client-side after static assets are loaded.
- Do not claim client-side saves are tamper-proof.

## 15. Documentation

Update documentation when changing:

- Save schema
- Controls
- Project commands
- Deployment
- Gameplay constants that affect player-facing rules
- Architecture or dependencies

Comments should explain intent or non-obvious constraints, not restate code.

## 16. Git Practices

- Keep commits focused and descriptive.
- Do not commit generated `dist/` output unless the deployment strategy explicitly requires it.
- Do not commit secrets, local environment files, editor caches, or dependency directories.
- Preserve backward compatibility for existing saves whenever feasible.

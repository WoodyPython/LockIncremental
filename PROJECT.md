# PROJECT.md

## 1. Project Summary

**Working title:** Lock Incremental

Lock Incremental is a static browser incremental game built around an active circular timing challenge inspired by the arcade game Pop the Lock. The player starts a run, taps when a rotating marker reaches a target on the lock, and continues through a sequence of targets. Each successful hit reverses rotation and places the next target. A mistimed input ends the run. The initial run length is 50 successful hits.

Successful targets and completed runs award the primary resource, **Points**, which supports incremental progression, upgrades, higher goals, and longer-term systems. The first release should focus on a polished core loop and a reliable save system rather than a large amount of content.

## 2. Product Principles

- **Active-first:** Progress comes from playing the timing game, not passive offline generation.
- **Immediate clarity:** The player should understand the next input and current objective without a tutorial wall.
- **Incremental readability:** Resources, goals, upgrades, and settings should use familiar incremental-game patterns.
- **Simple presentation:** Flat UI, vibrant colors, concise labels, and minimal ornamentation.
- **Expandable architecture:** The initial implementation is small, but progression systems and tabs should be easy to extend.
- **Local ownership:** Players can export, import, and download their saves.

## 3. Core Gameplay Loop

### Idle

The lock marker spins continuously as a visual attract state. The player clicks or taps the lock to begin. The starting interaction begins the run but does not count as a scoring input.

### Run

1. The run begins with a target on the lock ring.
2. The marker rotates toward and past the target.
3. The player clicks, taps, or presses Space when marker and target overlap.
4. On success, progress increases by one.
5. The target relocates and rotation reverses.
6. On an early input or when the rotating bar passes the target, the run ends without completion rewards.
7. At 50 successful hits, the run completes and awards a bonus worth 25% of that run's pre-critical target values.

Each successful target increases the marker speed and reduces the placement distance for later targets, so longer runs demand faster reactions and more precise perception.

The exact movement speed, hit-window size, target placement constraints, and reward formula are balance data and should not be embedded in rendering code.

### Failure

Failure should feel immediate but not punitive. Preserve the missed target during a five-second red cooldown so the player can see the timing error. When the cooldown ends, automatically restore the normal ring, resume the idle marker spin, and show `Click to Play`.

### Completion

Completion awards the calculated reward and one Medal exactly once, updates lifetime progress, shows a distinct three-second gold `Jackpot!` celebration with the Point bonus and Medal separated from the final target's normal `+1`, and advances any completed goals. Completion has no replay cooldown.

## 4. Initial Scope

### Required for the first playable release

- Main and Settings tabs
- Canvas-rendered circular lock game
- Idle, active, failed, and completed run states
- Initial run requirement of 50 hits
- Mouse and touch controls, plus Space and Enter while the lock is focused or hovered
- Current Points and lifetime Points total
- Current Medals and lifetime Medals total after the first Jackpot
- At least one basic upgrade or progression hook, even if early balancing is provisional
- Goal progress bar and version label at the bottom
- Manual save
- Autosave with selectable interval
- Export to clipboard
- Export as file
- Import from text
- Import from file
- Wipe save with two-step confirmation
- Optional tab-notification setting and reusable red tab highlight
- A single cohesive Ocean-blue palette
- Responsive desktop and mobile layout
- Save schema versioning and migration infrastructure

### Explicitly excluded from the first release

- Offline progression or offline rewards
- Accounts
- Cloud synchronization
- Online leaderboards
- Multiplayer
- Backend services
- Discord and support buttons
- Mobile native application packaging

## 5. Suggested Technology Stack

### Application

- **Vite** as the development server and production build tool
- **Vanilla TypeScript** for game logic and UI behavior
- **HTML** for semantic application structure
- **CSS** for layout, responsive styling, animation, and token-driven colors
- **Canvas 2D API** for the lock and gameplay effects

A component framework is intentionally omitted. The project has a small number of screens, and its central interaction is a custom animation loop rather than a large data-driven application UI.

### Big numbers

Use **`break_infinity.js`** for Points, costs, rewards, lifetime totals, goal thresholds, and future incremental values. It is designed for incremental games that need values beyond JavaScript's ordinary numeric range and favors speed over high-precision arithmetic.

Use native numbers for frame timing, geometry, angles, and bounded integer counters.

### Persistence

Use browser **`localStorage`**, not cookies.

Reasons:

- Saves remain available across browser sessions.
- No backend is required.
- JSON data can be loaded and written directly.
- Cookies would be smaller, would be sent with HTTP requests where applicable, and are not intended as a game-save store.

The save must include a schema version and serialize `Decimal` values as strings. Portable exports use an `LI1:`-prefixed gzip/Base64URL string for both clipboard and text-file transfer because local storage is tied to the current browser profile and origin.

Offline time may be recorded as metadata, but it must not produce rewards in the initial game.

### Testing and quality

- **Vitest** for unit tests
- Optional browser automation such as **Playwright** once end-to-end coverage is warranted
- ESLint and a formatter such as Prettier
- Strict TypeScript checks

### Hosting

Host the compiled static site on **GitHub Pages**.

Recommended deployment:

- Store source in a GitHub repository.
- Run validation and `vite build` in GitHub Actions.
- Upload the generated `dist/` directory as the Pages artifact.
- Configure Vite's `base` path correctly for either a repository subpath or a root `username.github.io` site.

GitHub Pages is sufficient because the initial game requires only static files and client-side storage. Any later cloud saves, secure accounts, or trusted leaderboards would require an external backend.

## 6. Save Model

The save should contain:

- Schema version
- Save timestamp
- Current Points
- Lifetime Points or equivalent lifetime progression
- Upgrade levels
- Goal progression or data needed to derive it
- Statistics such as attempts, successes, best partial run, and completed runs
- User settings

Save compatibility is additive by default. Serialized game fields, upgrade IDs,
statistics, and settings have centralized typed defaults; when an older save is
missing a known field, loading fills that field and then validates the resulting
canonical save. Present but malformed values still reject the save, and unknown
legacy fields are discarded. Do not increment the schema version for ordinary
additive fields. Increment it and add an explicit sequential migration only when
persisted data is renamed, restructured, changes units, or otherwise changes
meaning. Saves produced by a newer schema version remain unsupported.

Do not serialize transient state such as:

- Current animation frame
- Active pointer state
- Temporary particles
- Open confirmation dialogs
- A partially active run

Failure cooldown presentation is the only run-state exception. Save it immediately on failure and subtract elapsed wall-clock time on load so reloading cannot bypass the penalty. If the page closes or reloads during an active run, convert the active marker and target into a full failure cooldown; earned resources remain saved, but the player cannot immediately restart the run.

On load, default to idle. This avoids ambiguous scoring after a refresh.

## 7. Progression Direction

The initial economy is based on one Point per successful target and a completion bonus equal to 25% of the run's accumulated pre-critical target value. Base upgrades are:

- Repeatable Target Value levels cost `3 × 1.4^level`, rounded to the nearest integer, and add 25% target value per level.
- On completion of the first progression goal (100 lifetime Points), reveal all one-time upgrades together: 1.05× consecutive-target scaling (100), Critical Hits (100), a three-second failure cooldown (250), 2× all Point gains (500), 20% lower per-hit speed scaling (1,000), and one forgiven miss per run (2,500). Feature unlocks reference goal IDs rather than duplicating numeric thresholds.
- Critical Hits begin at 3% chance and award 10× target Points. Critical status is rolled when each target spawns; critical targets stay gold with a sparkling effect until resolved, making the bonus visible before the hit. Repeatable critical-chance levels cost `20 × 1.5^level`, rounded to the nearest integer, add 0.5 percentage points, and cap at 100%.
- A forgiven miss awards no Points, does not advance successful-hit progress, resets the consecutive multiplier, relocates the target, reverses direction, and pauses play behind a one-second millisecond countdown before resuming.
- The first Jackpot reveals a gold Medal shop and awards one Medal. Its fixed one-per-row order is Golden Gains (1), Larger Targets (1), Shorter Jackpot (2), Golden Safety Net (3), Jackpot Mastery (5), and Research (10). These upgrades respectively add a stacking 2× Point multiplier, up to 100% additive target size, up to ten fewer required targets, one additive forgiven miss, and a recorded WIP Research unlock.
- Shorter Jackpot reveals Rapid Recovery (10,000 Points), which halves the effective failure cooldown, and Efficient Scaling (25,000), which reduces the growth portion of repeatable cost bases by 25%.
- Goals track 100, 10,000, and 1,000,000 lifetime Points in order.
- Reaching 10,000 lifetime Points reveals the ordered lock-tier carousel. Tier 2 can be previewed immediately, but it requires at least one completed Tier 1 Jackpot before play.
- Show the selected tier's compact run, hit, best-run, and Jackpot records from the beginning; the carousel controls and tier information remain tied to the 10,000-Point reveal.
- Tier 2 requires 75 targets, has 50% faster per-hit speed growth, a target zone half as large, 2.5× Point gains, a 50% completion Point bonus, and five Medals per Jackpot. After each non-final hit it has a 50% chance to retain direction instead of reversing. Existing upgrades compose with these tier modifiers.

All economy values must be data-driven and use `Decimal` where growth can become large.

Potential future systems, not required initially:

- Prestige or reset layer
- Challenge modifiers
- Combo or streak rewards
- Unlockable gameplay variations
- Additional tabs triggered by progression

## 8. UI Summary

### Top

Centered persistent tab navigation with Main and Settings appears at the top without a surrounding navigation bar, and the active tab is visually distinct. Eligible inactive tabs can receive a red notification outline when the setting is enabled.

### Center

The Main tab focuses on the circular lock. Run score and the completion requirement appear in its center. The resource row uses amount-first labels (`X Points`), and reveals gold Medals beside Points after the first Jackpot. The Medal shop smoothly appears to the right of the normal upgrades behind a vertical divider; on mobile it stacks below a horizontal divider. Upgrades fade in only once when their progression goal is first reached. Purchased cards remain visible with their completed state. Cards are initially placed in increasing base-cost order and never reorder during play.

The Settings tab contains save/import/export controls, autosave controls, and tab-notification controls. It does not contain offline-progress, Discord, or support controls.

### Bottom

A persistent version label and progress bar show progress toward the next configured goal.

See `DESIGN.md` for complete visual and behavioral requirements.

## 9. Proposed Commands

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

Exact commands may change with the chosen TypeScript configuration, but equivalent checks must remain available.

## 10. Suggested Milestones

### Milestone 1: Core prototype

- Vite and TypeScript setup
- Canvas resize and render loop
- Idle spinning marker
- Run state machine
- Target placement, hit detection, reversal, miss, and 50-hit completion

### Milestone 2: Application shell

- Main and Settings tabs
- Fixed Ocean palette and responsive layout
- Resource readouts
- Footer version and first goal progress bar
- Success, failure, and notification effects

### Milestone 3: Persistence

- Versioned save model
- Manual save and autosave
- Import/export flows
- Wipe confirmation
- Validation and migration tests

### Milestone 4: Incremental progression

- Completion rewards
- Lifetime statistics
- Initial upgrades
- Goal sequence
- Big-number formatting through `break_infinity.js`

### Milestone 5: Release hardening

- Accessibility pass
- Mobile input and layout testing
- Reduced-motion behavior
- Performance checks
- GitHub Actions validation
- GitHub Pages deployment

## 11. Definition of Initial Success

The initial release is successful when a new player can open the static site, understand how to start, complete or fail a responsive 50-hit timing run, earn visible progress, safely save or transfer that progress, and return later in the same browser without data loss. The game should feel coherent and expandable even before deep progression systems are added.

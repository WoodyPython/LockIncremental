# DESIGN.md

## 1. Design Goal

Create a browser-based incremental game whose active play is based on the core timing loop of the arcade game **Pop the Lock**. The presentation should resemble established incremental games: a persistent top tab bar, a central gameplay area, a compact settings screen, and a fixed footer containing version and goal progress.

The visual direction is deliberately simple rather than decorative. Use flat shapes, strong contrast, large readable numbers, and one cohesive Ocean-blue palette.

## 2. Visual Theme

Use the high-contrast **Ocean** palette: teal surfaces with gold and aqua highlights. Theme selection is intentionally deferred until more visual options are needed.

### Required palette system

Define all colors as shared CSS custom properties in `src/styles/tokens.css`; use no untracked color literals in components.

### General styling constraints

- Flat, rectangular panels with slightly rounded corners.
- Thick dark borders, approximately `2px` to `4px` depending on scale.
- Minimal shadows; use them only to separate active or focused elements.
- No gradients unless used briefly as part of a win/loss animation.
- No glassmorphism, realistic textures, or complex backgrounds.
- Apply the Ocean palette consistently across every screen.
- Use one sans-serif display font from the system stack; do not require externally hosted fonts.
- All interactive controls need visible hover, active, focus-visible, and disabled states.
- The layout must work at desktop and mobile widths.

## 3. Application Shell

The page is divided into three persistent regions:

1. Top navigation
2. Main content area
3. Bottom status area

The application should fill the viewport without causing routine page scrolling on common desktop sizes. On small screens, vertical scrolling is acceptable when necessary.

## 4. Top Navigation

Persistent tabs appear centered at the top of every screen without a full-width containing bar.

Reserve a small amount of space above the header and place wide, compact-height tabs beneath it. Do not repeat the game title in this top area.

### Initial tabs

- **Main**
- **Settings**

Additional progression tabs may be introduced later, but they must use the same tab component and styling.

### Tab behavior

- The active tab has a strong dark filled state with readable text.
- Inactive tabs use `--color-surface` and light text.
- Changing tabs must not reload the page.
- Tab panel width changes must be immediate, without an expand or contract transition.
- Tab state does not need to be encoded in the URL for the initial version.
- The game simulation may continue while Settings is open, but active runs should pause by default when the page is not visible.

### Tab notification

A tab notification is represented by a visible red highlight around the affected tab button.

- Use `--color-danger` as an outer border, glow, or pulse.
- It must not shift the layout when enabled.
- It should be noticeable without flashing rapidly.
- Respect `prefers-reduced-motion` by disabling pulsing and retaining a static red outline.
- The notification system must be generic so future tabs can request or clear attention.

## 5. Main Screen

The Main screen contains the active lock game and incremental-game readouts.

### Main layout

Desktop:

- A centered lock game occupies the primary visual area.
- Current run score appears in the center of the lock.
- Points appear below the lock and above the upgrades divider using amount-first order (`X Points`). After the first Jackpot, gold Medals appear beside Points behind a vertical divider.
- Upgrade sections remain hidden until progression unlocks them.

Mobile:

- Points and unlocked Medals remain directly above the upgrades divider.
- The lock scales to fit the width while remaining circular.
- Controls remain large enough for touch input.

### Required readouts

At minimum, show:

- Current Points below the lock and above a horizontal upgrades divider, with unlocked Medals beside them
- Current run score and requirement centered inside the lock, such as `7 / 50`
- A large `Click to Play` idle/restart prompt

Use the shared big-number formatting utilities for resource values. Keep comma-separated ordinary notation below one billion, then use compact exponent notation without a plus sign, such as `1.00e9`. Run hit counts may remain ordinary integers.

### Lock tiers

Before 10,000 lifetime Points, retain the original single-lock layout without tier labels, controls, or reserved carousel spacing, while showing the compact Tier 1 record strip from the start. At the 10,000-Point goal, reveal a two-card tier carousel around the lock.

- Display a compact emblem and name for the selected tier, with only the arrow leading to an existing adjacent tier. Tier navigation never wraps.
- Permit tier changes only while the run is idle. Support the visible buttons and Left/Right Arrow keys while focus is within the carousel.
- Slide the incoming and outgoing locks by roughly one full card width over about 560ms, as though the tiers sit side by side beyond the viewport. Use GPU-friendly transforms and replace the transition with an immediate swap when reduced motion is requested.
- Allow Tier 2 to be inspected at reveal time, but dim its canvas and show a prominent `Complete a Tier I Jackpot` lock marker until Tier 1 has been completed once.
- Keep the carousel minimal: tier emblem, name, info control, canvas, directional arrow, and a compact per-tier record strip. Put each tier's unmodified base Jackpot, explicit per-hit speed growth, target half-width, Point and Jackpot reward modifiers, and tier mechanic in a modal information panel. Do not adjust those panel values for purchased upgrades or add secondary explanatory lines.
- Show runs, hits, best run, and Jackpots beneath the canvas. Once a tier has a Jackpot, omit its best-run value because the completed requirement is already the maximum.
- In the idle canvas, place `0 / requirement` directly beneath `Click to Play` so the selected tier's Jackpot goal is visible without opening its information panel.
- Keep tier arrows at least 44px square beside the circle, with the chevron optically centered within its button. Overlay the buttons on the card edges at narrow widths so the circular canvas still fits a 320px viewport.

## 6. Lock Gameplay Presentation

Use an HTML `<canvas>` for the lock, rotating marker, target, hit effects, and loss effects. Surrounding UI should use semantic HTML.

### Lock elements

- Circular lock ring
- Radial rotating bar inside the lock ring
- Clearly visible target marker positioned on the ring
- Central text showing idle instructions, run progress, or result feedback
- Optional small particles or rings for successful hits

### Idle state

When no run is active:

- The rotating marker continuously spins around the lock.
- Its motion is purely decorative and does not consume progress.
- Display a prompt such as `Click the lock to start`.
- The first valid pointer, mouse, or keyboard activation on the lock starts a run.
- Starting a run must create a target before the player is expected to make a scoring input.
- The start input itself must not accidentally count as the first hit.

### Active run

The mechanic should follow the recognizable Pop the Lock timing loop:

1. A target appears somewhere on the circular path.
2. The marker rotates around the path.
3. The player activates the lock when the marker overlaps the target.
4. A successful activation increments run progress.
5. After a success, a new target is selected and the marker reverses direction.
6. An activation outside the accepted hit window ends the run.
7. Allowing the entire bar to pass the target also ends the run automatically.
8. Each hit increases marker speed and decreases the possible distance to the next target.
9. The run succeeds after the required number of targets has been hit.

Initial required hit count: **50**.

### Input methods

Support all of the following:

- Primary mouse button
- Touch or pointer tap
- Spacebar when the lock control is focused or hovered
- Enter when the lock control is focused or hovered

Prevent duplicate scoring from the same physical interaction. Hover shortcuts must not intercept Space or Enter from another focused interactive control. Pointer input should be handled through Pointer Events where possible.

### Hit detection

- Perform hit detection using angular distance rather than pixel collision.
- Count a hit whenever any angular portion of the bar overlaps any angular portion of the target.
- Define target arc half-width, rounded target-cap width, and outlined bar half-width as named gameplay constants; their sum is the accepted center-distance window so visible outline contact always counts.
- Visual target width and logical hit width should correspond closely.
- Give the bar and target black outlines, and use a target color that is clearly distinct from the ring and surrounding theme colors.
- Avoid frame-rate-dependent hit detection.
- Normalize angular calculations so crossing `0` radians behaves correctly.
- Detect crossing the target's trailing edge between frames so a passed target cannot be skipped at high speed.

### Successful hit feedback

A successful hit should produce brief, restrained feedback:

- Target flashes with `--color-success` or `--color-accent`.
- A small expanding ring or particle burst may appear.
- Display a fading `+Points` gain label near the target that was hit, prefixed with `CRIT` for critical gains.
- On the final target, keep this label at the normal per-target `+1`; present the separate completion bonus only on the win screen.
- The progress number updates immediately.
- The direction reversal should be visually obvious but not jarring.
- Sound may be added later but is not required for the initial implementation.

### Loss feedback

On a miss:

- Immediately stop accepting scoring input.
- Flash the ring and/or background using `--color-danger`.
- Briefly shake, squash, or pulse the lock.
- Freeze the marker for a short result beat.
- Keep the missed target visible throughout the cooldown so the player can compare the final bar position with the target.
- Display the cooldown countdown as large red text in the center of the lock without a separate failure label, and keep the failed run's score visible beneath it.
- After the cooldown, return the ring to its normal color, resume the bar at default idle speed, and replace the countdown with a large `Click to Play` prompt.
- Reloading during the cooldown must restore the missed-target presentation and only the time still remaining; a reload must not reset directly to idle.
- Reloading or closing during an active run counts as an interruption: preserve the current marker and target as a failure presentation and apply the normal full cooldown before another run can start.

The loss animation must not be a rapid screen flash. Respect reduced-motion preferences by replacing movement with a static color change.

### Run completion feedback

On completing all currently required hits (initially 50):

- Stop active input.
- Show a clear gold `Jackpot!` state for three seconds that cannot be confused with failure, with the tier's completion bonus and Medal reward displayed beneath the heading.
- Award the run reward exactly once.
- Use gold particles, an outward ring, or a comparable celebratory animation.
- Do not apply the failure cooldown; allow immediate replay input and otherwise return to idle after the brief celebration.

### Points and upgrades

- Each target begins at a base value of 1 Point. Repeatable Target Value levels add 25% and cost `3 × 1.4^level` Points, rounded to the nearest integer.
- On completion of the first progression goal (100 lifetime Points), fade in all initial one-time upgrades together: consecutive value (100), Critical Hits (100), a three-second failure cooldown (250), 2× all Point gains (500), 20% lower speed scaling (1,000), and one forgiven miss (2,500). Feature visibility should reference goal IDs rather than duplicate numeric thresholds.
- Consecutive value begins at 1× on the first target and scales subsequent uninterrupted targets by 1.05×. A forgiven miss normally skips the target without Points or hit progress, resets the streak, reverses direction, and consumes the run's allowance. Shielded Momentum raises consecutive scaling to 1.07× and preserves the streak through a forgiven Shield miss.
- Critical Hits begin at 5% chance, grant 10× target Points, and reveal the related repeatable Critical Chance Point upgrade. Roll critical status when each target spawns and keep it fixed until that target is resolved. Render critical targets gold with sparkling accents so the bonus is visible before the hit; when the system requests reduced motion, keep the gold styling and render the sparkles without animation. Critical-chance levels add 0.5 percentage points, cost `20 × 1.5^level` rounded to the nearest integer, and cap at 100%.
- Tier 1's completion bonus is 25% of the run's accumulated pre-critical target values; Tier 2's is 50%. Critical hits do not multiply either completion bonus.
- Award one Medal exactly once per Jackpot. The first Medal earned permanently reveals the gold Medal readout and Medal shop for the session, even after the Medal is spent.
- Place the Medal shop to the right of the normal upgrades behind a continuous vertical divider that crosses the horizontal separator without gaps. Expand the desktop main layout outward when both shops are present so the added columns do not compress existing cards. Match the `Point Upgrades` and `Medal Upgrades` heading typography, use gold for purchased Medal-card outlines, and leave enough edge space that outlines are never clipped. Smoothly resize the normal upgrades while the shop fades and slides in; on mobile, stack it below a horizontal divider. Disable this transition when reduced motion is requested.
- Keep Medal cards in a fixed two-column grid ordered as Golden Gains (1), Larger Targets (1), Point Expansion (1), Shorter Jackpot (2), Golden Safety Net (2), Golden Control (3), Jackpot Mastery (5), and Research (10); use three columns for Point upgrades. Larger Targets and Jackpot Mastery each multiply target size by 1.5×, so owning both produces 2.25× base size. Golden Control multiplies speed scaling by 0.75 after Steady Hands, producing 0.6× when both are owned. The remaining effects provide a stacking 2× Point multiplier, five-target requirement reductions, an additive forgiven miss, and a recorded WIP Research unlock. Snapshot target size, required hits, Medal miss allowance, and Shield streak preservation when a run starts.
- Point Expansion reveals Rapid Recovery for 10,000 Points, Efficient Scaling for 25,000 Points, and Shielded Momentum for 100,000 Points. Rapid Recovery halves the effective failure cooldown, including Quick Recovery; Efficient Scaling changes each repeatable base to `1 + (base − 1) × 0.75` without reordering cards; Shielded Momentum preserves consecutive streaks through Shield misses and raises their multiplier from 1.05× to 1.07×.
- Place upgrade cards directly below the lock without a surrounding section panel. Label the repeatable section `Point Upgrades` in the Point accent color, omit a visible one-time heading, and retain the horizontal divider between the Point sections. Align each unlocked currency readout above the center of the shop that spends it.
- Preserve purchased one-time cards with a Point-accent outline and show every one-time upgrade once the section unlocks. Place cards in increasing base-cost order when the view is created, then keep that order fixed even as repeatable costs change. Repeatable cards remain visible, show their cumulative result, and auto-fit across their row rather than reserving empty three-column slots. The fade-in occurs only once when the required goal is reached and must not restart after purchases, hits, or tab changes.
- Progression sections that have not unlocked must be removed from layout sizing as well as hidden visually, so their cards cannot create blank scrollable space.
- When Second Chance is consumed, use a light ocean-blue activation effect, freeze play, and show a one-second millisecond countdown in the center of the lock. Ignore inputs during that window, then resume with the safely relocated target.

### Animation timing

Use `requestAnimationFrame` and delta time for rendering and movement. Cap unusually large delta values so switching tabs or debugging does not cause the marker to jump unpredictably.

## 7. Settings Screen

The Settings screen should mirror the compact, button-driven style common to incremental games while using the Ocean palette.

### Save controls

Include:

- **Save Now**
- **Export to Clipboard**
- **Export as File**
- **Import from Text**
- **Import from File**
- **Wipe Save**

Do not include Discord, creator-support, or external community buttons.

Clipboard and file exports contain the same compressed text format: `LI1:` followed by gzip-compressed, unpadded Base64URL data. File exports use a `.txt` extension. Text and file imports validate and decompress this format before applying a save.

### Autosave controls

Include:

- Autosave: Enabled / Disabled
- Autosave interval options: 15s / 30s / 60s / 120s

Default settings:

- Autosave enabled
- Autosave interval 30 seconds

Manual save, import, export, wipe, and storage results appear in a compact, fixed toast at the top
center of the viewport rather than as inline Settings text. The complete toast fades and drops a
short distance into view without exposing a detached border or shadow, lingers, then rises smoothly
out of view; it also includes a dismiss button. Success messages
dismiss after about three seconds and errors after about six seconds. Successful setting changes
and routine autosaves do not show a toast, while manual actions and storage failures remain visible.

When autosave is disabled, the interval selector may remain visible but should appear disabled.

### Offline progress

Do not implement or display offline progress in the initial version. The game is designed around active play. Save timestamps may still exist for auditing and migrations, but elapsed offline time must not grant resources.

### Tab notification setting

Include:

- Tab Notification: Enabled / Disabled

When enabled, eligible inactive tabs may receive the red attention outline described above. The initial implementation should provide the reusable behavior even if only a limited number of events trigger it.

### Wipe behavior

- The wipe button uses danger styling.
- Clicking it opens an in-app confirmation dialog.
- Require a second explicit confirmation.
- Do not use a browser `confirm()` dialog for the final UI.
- Wiping resets game state and settings to defaults, except settings that are intentionally retained must be documented in code.

### Import behavior

- Validate imported data before replacing the current save.
- Reject malformed or unsupported saves with a clear error message.
- Create an automatic backup of the current save in memory before applying an import.
- Report success without requiring a page reload.

## 8. Bottom Status Area

A compact status area is fixed or anchored to the bottom of the application.

Center the enlarged version label immediately above a nearly full-width, 42px-tall progress track, with a modest offset above the bottom edge. Render the version label in white with a complete black outline. Place substantially larger, regular-weight goal text over the track itself with enough inset that it does not touch the border, following the compact incremental-game reference layout rather than a multi-column footer. Keep the sticky footer background transparent so content remains visible around the version and progress track.

### Version label

Display the game name and semantic version, for example:

`Lock Incremental v0.1.2 by WoodyPython`

Keep the version in one source of truth and inject or import it where displayed.

### Goal progress bar

Show progress toward 100, then 10,000, then 1,000,000 lifetime Points. Keep the million-Point goal complete until a later goal is configured.

Required content:

- A horizontal progress bar
- Text describing the goal
- Current progress and requirement
- Percentage completion

For goals completed by buying an unlock, display only the requirement label; omit numeric progress and percentage text.

Example:

`Reach 1,000 total Locks — 425 / 1,000 (42.5%)`

Constraints:

- Clamp visual progress between 0% and 100%.
- Calculate values with `break_infinity.js` where they can exceed normal numeric limits.
- The bar must remain legible on narrow screens.
- Use a very dark gray progress track, a saturated green fill, and a solid black border without an outer glow. Give overlaid goal text a complete black outline for readability.
- Once a goal is completed, transition to the next configured goal without losing previously earned progress.
- Goal definitions belong in game data, not hard-coded DOM logic.

## 9. Responsive Behavior

- Target a minimum supported viewport width of approximately 320 CSS pixels.
- Canvas resolution must account for `devicePixelRatio` to remain sharp.
- Do not stretch the canvas bitmap using CSS without updating its internal dimensions.
- Navigation tabs may wrap or become horizontally scrollable on very small screens.
- Settings controls should stack vertically on mobile.
- Touch targets should generally be at least 44 by 44 CSS pixels.

## 10. Accessibility

- Maintain sufficient text/background contrast.
- All controls must be keyboard reachable.
- The canvas must have an accessible name and keyboard equivalent.
- Pointer activation must not leave a selection/tap highlight or focus outline on the canvas; keyboard focus must remain visibly indicated when reached through keyboard navigation.
- Do not rely on color alone for success, failure, selection, or notification.
- Use an `aria-live="polite"` region for save results, imports, run completion, and failure summaries.
- Honor `prefers-reduced-motion`.
- Avoid continuous animations outside the lock gameplay and subtle notification pulse.

## 11. Out of Scope for Initial Version

- Offline resource generation
- Accounts or cloud saves
- Server-authoritative leaderboards
- Multiplayer
- Discord or support links
- React, Vue, or another UI framework
- Elaborate story, character art, or 3D rendering

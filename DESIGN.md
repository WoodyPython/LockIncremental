# DESIGN.md

## 1. Design Goal

Create a browser-based incremental game whose active play is based on the core timing loop of the arcade game **Pop the Lock**. The presentation should resemble established incremental games: a persistent top tab bar, a central gameplay area, a compact settings screen, and a fixed footer containing version and goal progress.

The visual direction is deliberately simple rather than decorative. Use flat shapes, strong contrast, large readable numbers, and a small set of cohesive selectable themes.

## 2. Visual Theme

Provide four high-contrast themes selectable from Settings:

- **Ocean:** teal surfaces with gold and aqua highlights; the default.
- **Ember:** charcoal and warm brown surfaces with orange highlights.
- **Forest:** deep green surfaces with cream and amber highlights.
- **Monochrome:** slate surfaces with white and pale blue highlights.

### Required palette system

Define all theme colors as the shared CSS custom properties in `src/styles/tokens.css`; use no untracked color literals in components. Switching themes must update the entire interface consistently without reloading the page.

### General styling constraints

- Flat, rectangular panels with slightly rounded corners.
- Thick dark borders, approximately `2px` to `4px` depending on scale.
- Minimal shadows; use them only to separate active or focused elements.
- No gradients unless used briefly as part of a win/loss animation.
- No glassmorphism, realistic textures, or complex backgrounds.
- Apply the selected theme consistently across every screen.
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

Reserve a small amount of space above the header, show primary currency first, then draw a separator matching the bottom progress bar's horizontal bounds. Place wide, compact-height tabs below the separator. Do not repeat the game title in this top area.

### Initial tabs

- **Main**
- **Settings**

Additional progression tabs may be introduced later, but they must use the same tab component and styling.

### Tab behavior

- The active tab has a strong dark filled state with readable text.
- Inactive tabs use `--color-surface` and light text.
- Changing tabs must not reload the page.
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
- Primary currency appears in the top status area above the navigation separator.
- Upgrade sections remain hidden until progression unlocks them.

Mobile:

- Primary currency remains in the top status area.
- The lock scales to fit the width while remaining circular.
- Controls remain large enough for touch input.

### Required readouts

At minimum, show:

- Current primary currency above the navigation separator
- Current run score and requirement centered inside the lock, such as `7 / 20`
- A large `Click to Play` idle/restart prompt

Use the shared big-number formatting utilities for resource values. Run hit counts may remain ordinary integers.

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

Initial required hit count: **20**.

### Input methods

Support all of the following:

- Primary mouse button
- Touch or pointer tap
- Spacebar
- Enter when the lock control is focused

Prevent duplicate scoring from the same physical interaction. Pointer input should be handled through Pointer Events where possible.

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
- Display a fading `+currency` gain label near the target that was hit.
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
- Display the cooldown countdown as large red text in the center of the lock without a separate failure label.
- After the cooldown, return the ring to its normal color, resume the bar at default idle speed, and replace the countdown with a large `Click to Play` prompt.

The loss animation must not be a rapid screen flash. Respect reduced-motion preferences by replacing movement with a static color change.

### Run completion feedback

On completing all 20 hits:

- Stop active input.
- Show a clear gold `Jackpot!` state that cannot be confused with failure, with the completion bonus displayed beneath the heading.
- Award the run reward exactly once.
- Use gold particles, an outward ring, or a comparable celebratory animation.
- Do not apply the failure cooldown; allow immediate replay input and otherwise return to idle after the brief celebration.

### Animation timing

Use `requestAnimationFrame` and delta time for rendering and movement. Cap unusually large delta values so switching tabs or debugging does not cause the marker to jump unpredictably.

## 7. Settings Screen

The Settings screen should mirror the compact, button-driven style common to incremental games while using the project theme.

### Theme controls

Show buttons for Ocean, Ember, Forest, and Monochrome. Apply the selected theme immediately. Theme persistence will follow the same save/settings lifecycle when persistence is implemented.

### Save controls

Include:

- **Save Now**
- **Export to Clipboard**
- **Export as File**
- **Import from Text**
- **Import from File**
- **Wipe Save**

Do not include Discord, creator-support, or external community buttons.

### Autosave controls

Include:

- Autosave: Enabled / Disabled
- Autosave interval options: 15s / 30s / 60s / 120s

Default settings:

- Autosave enabled
- Autosave interval 30 seconds

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

Center the version label immediately above a nearly full-width dark progress track. Place the goal text over the track itself, following the compact incremental-game reference layout rather than a multi-column footer.

### Version label

Display the game name and semantic version, for example:

`Lock Incremental v0.1.0 by WoodyPython`

Keep the version in one source of truth and inject or import it where displayed.

### Goal progress bar

Show progress toward the next meaningful game goal.

Required content:

- A horizontal progress bar
- Text describing the goal
- Current progress and requirement
- Percentage completion

Example:

`Reach 1,000 total Locks — 425 / 1,000 (42.5%)`

Constraints:

- Clamp visual progress between 0% and 100%.
- Calculate values with `break_infinity.js` where they can exceed normal numeric limits.
- The bar must remain legible on narrow screens.
- Use a dark green progress track/fill and give overlaid goal text a complete black outline for readability.
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

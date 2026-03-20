# Bug Fixes Log

## Mobile iOS/Android Layout Fixes
**Date:** 2026-03-19
**Files changed:** `capacitor.config.ts`, `src/components/BottomNav.tsx`, `src/app/dashboard/DashboardShellClient.tsx`, `src/app/heritage/[region]/[slug]/gallery/GalleryClient.tsx`, `src/components/AppChrome.tsx`, `src/components/TabShell.tsx`, `src/app/HomeClient.tsx`

---

### Issue 1: Content going behind status bar on Dashboard and Gallery

**Symptom:** On Dashboard and Gallery pages, text and content appeared behind the iOS status bar.

**Root cause:** `overlaysWebView: true` in `capacitor.config.ts` makes the status bar float over the webview. All pages must explicitly push content down using `env(safe-area-inset-top)`. Home page did this correctly; Dashboard and Gallery did not.

**Fix:**
- `GalleryClient.tsx` — added a safe-area top spacer as first child of the page root:
  ```jsx
  <div className="lg:hidden" style={{ height: "env(safe-area-inset-top, 44px)" }} />
  ```
- `DashboardShellClient.tsx` — changed the safe-area spacer fallback from `0px` to `44px`:
  ```jsx
  style={{ height: "env(safe-area-inset-top, 44px)" }}
  ```
  Previously `0px` meant the spacer had zero height before CSS env() resolved, allowing content to slip behind the status bar.

---

### Issue 2: Bottom nav inconsistent height across pages

**Symptom:** Bottom nav had correct height on home screen but collapsed/lost height when navigating to heritage site pages.

**Root cause:** `BottomNav.tsx` was measuring `safe-area-inset-bottom` synchronously via `getBoundingClientRect()` inside a `useEffect`. This ran before the browser had finished layout, so it almost always returned `0`. The nav sat at `bottom: 0px` with inconsistent spacing across pages.

**Fix:** Replaced the JS measurement with a double `requestAnimationFrame` approach that waits two paint cycles before measuring, and starts with a CSS fallback so the first render is always correct:

```js
const [safeBottom, setSafeBottom] = useState<string>("env(safe-area-inset-bottom, 0px)");

useEffect(() => {
  requestAnimationFrame(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;";
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      const h = el.offsetHeight;
      document.body.removeChild(el);
      if (h > 0) setSafeBottom(`${h}px`);
    });
  });
}, []);
```

Key points:
- Initial state is the CSS `env()` string — correct from frame 1
- Measures `offsetHeight` (not `getBoundingClientRect`) — more reliable
- Double rAF ensures CSS env() values are fully resolved before reading
- Value is locked as a pixel string (e.g. `"34px"`) — prevents fluctuation across pages

---

### Issue 3: Home page layout shifted / header moved up after navigating back from heritage page

**Symptom:** After navigating home → heritage site → back to home, the title/header area appeared shifted upward (stale scrolled state from a previous visit was briefly visible).

**Root cause (multi-layered):**

1. `AppChrome.tsx` was conditionally mounting `TabShell` with `{onTabRoute && <TabShell />}`. This caused `HomeClient` to fully unmount when navigating to heritage pages and remount on return. Each remount triggered iOS WebKit scroll position restoration, briefly showing a non-zero scroll before React effects could reset it.

2. Even after making `TabShell` always mounted, `TabPane` toggled `display: none → block` and set `opacity: 1` in the React render. The browser painted one frame of stale scroll state before the `useEffect` could reset it.

**Fix:**

**`AppChrome.tsx`** — removed the `onTabRoute &&` guard so `TabShell` is always mounted. `TabPane`'s `display: none` already hides fixed children in WebKit when inactive:
```jsx
// Before
{onTabRoute && (
  <div className="lg:hidden">
    <TabShell />
  </div>
)}

// After — always mounted, TabPane handles hide/show internally
<div className="lg:hidden">
  <TabShell />
</div>
```

**`TabShell.tsx`** — rewrote `TabPane` to render with `opacity: 0` on the very first paint when re-activating (no flash of stale state), then reset all descendant scroll positions and fade in:
```jsx
// Computed during render — before effects run
const justActivated = active && !prevActive.current;
prevActive.current = active;

// useEffect on active change:
// 1. Reset all scrollable descendants
el.querySelectorAll("*").forEach(child => {
  if (child.scrollTop > 0) child.scrollTop = 0;
});
// 2. Signal HomeClient to reset titleRow transform
window.dispatchEvent(new CustomEvent("tab-shown"));
// 3. Fade in via double rAF

// Render — opacity:0 on first paint when re-activating prevents flash
style={{ display: active ? "block" : "none", opacity: justActivated ? 0 : 1 }}
```

**`HomeClient.tsx`** — listens for `window`'s `tab-shown` event to reset the `titleRow` inline transform (the logo/title slide-up animation driven by scroll):
```js
window.addEventListener("tab-shown", resetScroll);
// resetScroll: container.scrollTop = 0, titleRow opacity/transform reset
```

---

## Mobile Header Sliding Behind Status Bar After Navigation
**Date:** 2026-03-20
**Files changed:** `src/components/MobilePageHeader.tsx`, `src/components/BottomNav.tsx`, `src/app/dashboard/DashboardShellClient.tsx`, `src/app/explore/ExploreClient.tsx`, `src/app/HomeClient.tsx`

---

### Issue: Teal mobile page headers pushed up behind the status bar after a few navigations

**Symptom:** The teal `MobilePageHeader` (and the ProfilePanel teal header) started fine on first load, but after navigating between pages the header visually shifted upward and content disappeared behind the status bar.

**Root cause:** `env(safe-area-inset-top)` is a **live CSS value** that iOS/Android mutates dynamically — it can collapse to `0` when the browser chrome shifts, the URL bar retracts, or after certain navigation events. Any `padding-top` set directly with `env()` would shrink to 0 at those moments, collapsing the header and pushing the title text behind the status bar.

A secondary cause: multiple components (`ExploreClient`, the old `MobilePageHeader`) were measuring the value with a JS probe element using `getBoundingClientRect()` inside `useEffect`. This ran at unpredictable times, often reading `0`, and froze `safeTop` state at the wrong value for the rest of the session.

**Fix:** Lock the inset as a CSS variable once on first paint, then use that variable everywhere.

In `BottomNav.tsx` (always mounted), measure and lock `--sat` alongside the existing `--safe-bottom`:
```js
const elT = document.createElement("div");
elT.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);pointer-events:none;visibility:hidden;";
document.body.appendChild(elT);
requestAnimationFrame(() => {
  const hT = elT.offsetHeight;
  document.body.removeChild(elT);
  const satPx = hT > 0 ? hT : 44;
  document.documentElement.style.setProperty("--sat", `${satPx}px`);
});
```

Then replace all `env(safe-area-inset-top, 44px)` references with `var(--sat, 44px)`:
- `MobilePageHeader.tsx` — `paddingTop: "var(--sat, 44px)"`
- `BottomNav.tsx` ProfilePanel header — `paddingTop: "calc(0.85rem + var(--sat, 44px))"`
- `DashboardShellClient.tsx` — top spacer `height: "calc(var(--sat, 44px) + 52px)"`
- `ExploreClient.tsx` — removed broken JS probe, use `const safeTop = "var(--sat, 44px)"`
- `HomeClient.tsx` — replaced inline `env()` references

**Key lesson:** `env(safe-area-inset-top)` must never be used directly in inline styles for elements that need to stay stable across navigations. Measure it once on app boot via a probe element, lock it as `--sat` on `documentElement`, and reference `var(--sat)` everywhere. The CSS globals.css `--sat` definition (`env(safe-area-inset-top, 44px)`) only serves as the initial fallback before JS runs — it will still fluctuate if used directly.

---

### Key concepts for future reference

- **`overlaysWebView: true` (Capacitor)** — status bar floats over webview. Every page must add `env(safe-area-inset-top, 44px)` padding/spacing to its first visible content. Always use `44px` as the fallback (not `0px`) so it works before CSS resolves.
- **`env(safe-area-inset-bottom)` measurement** — measure after two `requestAnimationFrame` calls for reliability, then lock as a pixel value. Don't re-read it per-page.
- **`display: none` on a parent hides `position: fixed` children in WebKit/Capacitor** — safe to use for tab visibility toggling without removing from DOM.
- **React `useEffect` fires after paint** — any DOM resets in `useEffect` are visible for 1 frame. Set `opacity: 0` in the render itself to prevent flash, then animate in from the effect.
- **Mutating a ref during render** (`prevActive.current = active`) is a valid React pattern for tracking the previous value without triggering re-renders.

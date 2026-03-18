# Heritage of Pakistan — Hard-Won Fixes

A record of difficult bugs and their solutions for future reference.

---

## Technique: "Card over colored header" rounded corners

**Goal:** White scrollable content card with rounded top corners sitting over a colored header, with the header color visibly peeking around the curves — like a native iOS app.

**Why it's tricky:**
- `overflow-hidden` on the card div clips the border-radius itself, making corners appear cut off
- `overflow-y-auto` alone doesn't clip border-radius in modern browsers — safe to use directly on the card
- The page background color shows in the corner "gaps" — if it doesn't match the header color, you see a white/grey halo around the curves instead of the header color
- High z-index on the header (e.g. `z-[100]`) will draw over the card corners if the card has a lower z-index

**Solution:** Use a dedicated teal "gap strip" div between the header and the card:

```
┌─────────────────────────────┐  ← fixed header (z-[100])
│   Heritage of Pakistan  🔔  │
│   [ Search... ]             │
│   Pills...                  │
├─────────────────────────────┤  ← teal strip starts (z-[98], ~48px tall)
│                      ╭──────┤
│                      │      │  ← white card (z-[99]), rounded-t-[28px]
│   Featured           │      │    starts ~20px into the teal strip
```

```tsx
{/* Teal strip — fills the gap around the rounded corners */}
<div
  className="fixed inset-x-0 bg-[#00c9a7] z-[98]"
  style={{ top: `calc(${safeTop} + 124px)`, height: "48px" }}
/>

{/* White card — rounded corners overlap the teal strip */}
<div
  className="fixed inset-x-0 bg-[#f2f2f2] rounded-t-[28px] overflow-y-auto z-[99]"
  style={{ top: `calc(${safeTop} + 152px)`, bottom: "..." }}
>
```

**Key rules:**
1. Do NOT use `overflow-hidden` on the card div — it clips the border-radius
2. Use `overflow-y-auto` directly on the card — this scrolls without clipping corners
3. The teal strip must be tall enough to fully wrap the corner radius (strip height > card offset from strip top + corner radius)
4. Card z-index must be higher than strip, but both below the header
5. The strip color must match the header background exactly

---

## Issue: Bottom nav height differs across mobile pages (iOS PWA / TestFlight)

**Symptom:** The bottom navigation bar appeared taller on the Home page than on Explore, Heritage, and Map pages. The safe-area padding below the icons was visibly different.

**Root cause:** `env(safe-area-inset-bottom)` is a **live CSS value** that iOS recalculates dynamically depending on whether the browser's bottom toolbar is visible. On the Home page the layout is fully fixed (body never scrolls), so iOS keeps a consistent safe-area value. On other pages the body had some scrollable height, causing iOS to show/hide its toolbar and change `env(safe-area-inset-bottom)` between ~34px and 0px. Since the nav's `bottom` position and fill div both used this live value, the nav visually jumped per page.

**Solution:** Read `safe-area-inset-bottom` once at component mount using a DOM measurement and store it as a fixed pixel value in React state. Use that hardcoded number for the nav's `bottom` offset and the white fill div height — never reference `env(safe-area-inset-bottom)` again in BottomNav.

```tsx
// In BottomNav.tsx
const [safeBottom, setSafeBottom] = useState(0);

useEffect(() => {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;bottom:env(safe-area-inset-bottom,0px);left:0;width:1px;height:1px;pointer-events:none;";
  document.body.appendChild(el);
  const bottom = window.innerHeight - el.getBoundingClientRect().bottom;
  document.body.removeChild(el);
  if (bottom > 0) setSafeBottom(bottom);
}, []);

// Then in JSX:
<div className="fixed inset-x-0 bottom-0 z-[2999] bg-white" style={{ height: safeBottom }} />
<div id="bottom-nav" className="fixed inset-x-0 z-[3000] bg-white" style={{ bottom: safeBottom }}>
```

**Key insight:** Never use `env(safe-area-inset-bottom)` directly in a fixed nav if pages have varying scroll behaviour. Snapshot it once instead.

---

## Issue: Hydration mismatch — `data-rm-theme` attribute on `<body>`

**Symptom:** React hydration warning about `data-rm-theme="light"` attribute mismatch on `<body>`.

**Root cause:** The **Dark Reader** browser extension injects `data-rm-theme` into the DOM before React hydrates. This is a browser extension side-effect, not a code bug.

**Solution:** Not a code issue. Only appears in non-incognito browsers with Dark Reader installed. Test in incognito / PWA / TestFlight to confirm production behaviour.

---

## Technique: Jank-free touch carousels — bypass React state during drag

**Problem:** Using `useState` to track drag delta in a swipe carousel causes React to re-render on every `touchmove` event (~60/s). Each re-render triggers reconciliation and style recalculation, producing visible jank/jerks during drag.

**Solution:** Use direct DOM manipulation via refs for all drag-frame updates. Only call `setState` once on `touchend` to commit the new index (which updates the text overlay). The drag itself never touches React state.

```tsx
const trackRef = useRef<HTMLDivElement>(null);
const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
const indexRef = useRef(0); // mirrors index state, readable in closures without stale values

const applyDrag = useCallback((delta: number) => {
  const track = trackRef.current;
  if (!track) return;
  const idx = indexRef.current;
  track.style.transition = "none";
  track.style.transform = `translateX(calc(50vw - ${CARD_W / 2}vw - ${idx} * (${CARD_W}vw + ${GAP}px) + ${delta}px))`;

  // Scale adjacent cards live during drag
  const progress = Math.min(Math.abs(delta) / 120, 1);
  cardRefs.current.forEach((el, i) => {
    if (!el) return;
    const offset = i - idx;
    let scale = offset === 0 ? 1 - 0.12 * progress
               : offset === -1 && delta > 0 ? 0.88 + 0.12 * progress
               : offset === 1 && delta < 0 ? 0.88 + 0.12 * progress
               : 0.88;
    el.style.transform = `scale(${scale})`;
  });
}, []);

const snapToIndex = useCallback((newIndex: number) => {
  const track = trackRef.current;
  if (!track) return;
  indexRef.current = newIndex;
  track.style.transition = "transform 0.38s cubic-bezier(0.25,0.1,0.25,1)";
  track.style.transform = `translateX(calc(50vw - ${CARD_W / 2}vw - ${newIndex} * (${CARD_W}vw + ${GAP}px)))`;
  cardRefs.current.forEach((el, i) => {
    if (!el) return;
    el.style.transition = "transform 0.38s cubic-bezier(0.25,0.1,0.25,1)";
    el.style.transform = `scale(${i === newIndex ? 1 : 0.88})`;
  });
  setIndex(newIndex); // React re-render only here, to update text overlay
}, []);
```

**Also fix scroll conflict:** Register `touchmove` as `{ passive: false }` via `useEffect` (not React's `onTouchMove` which is always passive in React 17+). Detect axis after 4px of movement, call `e.preventDefault()` only on confirmed horizontal swipes.

```tsx
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const handleTouchMove = (e: TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current!;
    const dy = e.touches[0].clientY - touchStartY.current!;
    if (axisLocked.current === null) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      axisLocked.current = Math.abs(dx) >= Math.abs(dy);
    }
    if (!axisLocked.current) return; // let page scroll vertically
    e.preventDefault();             // block page scroll horizontally
    applyDrag(dx * resistance);
  };
  el.addEventListener("touchmove", handleTouchMove, { passive: false });
  return () => el.removeEventListener("touchmove", handleTouchMove);
}, [index, applyDrag]);
```

**Key insight:** Keep React state for *committed* index only. Use `indexRef` alongside `useState` so event handlers (which close over refs, not state) always see the current value without stale closures.

---

## Issue: Body `padding-top: env(safe-area-inset-top)` causing scroll on all pages

**Symptom:** A gap appeared below the bottom nav on the Home screen. Pages were slightly taller than the viewport causing unwanted scroll.

**Root cause:** `globals.css` had `body { padding-top: env(safe-area-inset-top) }` which added ~44px to the body height on iOS. Combined with `min-h-screen` on the body, this made the body taller than `100vh`, creating a scrollable gap. Fixed-layout pages (Home, Explore) showed this as a visible gap below the nav.

**Solution:** Remove `padding-top` from body in globals.css. Each page's fixed header already handles the top safe area individually via a `safeTop` state variable measured at mount (same DOM measurement trick as `safeBottom`). Left/right safe-area padding on body is fine to keep.

---

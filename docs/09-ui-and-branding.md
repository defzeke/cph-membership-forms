# 09 — UI and branding

The visual layer is plain Tailwind utilities plus one substantial `app/globals.css`. No
component library, no CSS-in-JS, no `next/image` usage, no icon package.

## Styling pipeline

```text
app/globals.css  ──@import "tailwindcss"──▶  Tailwind v4 (CSS-first)
        ▲                                          │
        │                                          ▼
postcss.config.mjs  ── plugin: @tailwindcss/postcss ──▶ compiled CSS in the client bundle
```

- Tailwind **v4** has no `tailwind.config.ts` here. Configuration is done in CSS with
  `@theme inline`.
- `postcss.config.mjs` registers only `@tailwindcss/postcss`.
- Class names are detected by scanning the source; dynamically built class strings (there are
  none today) would not be generated.
- `app/layout.tsx` imports `./globals.css` once.

## Theme tokens

```css
:root {
  --background: #242424;
  --foreground: #0f172a;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* CyberPH: 50-200 = weave cream/gold, 500-700 = logo blue */
  --color-brand-50:  #fbf4e2;
  --color-brand-100: #f2e0b8;
  --color-brand-200: #dfb765;
  --color-brand-500: #4a6cbd;
  --color-brand-600: #3b5ba9;
  --color-brand-700: #2e4785;
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}
```

| Token | Value | Where it is used |
| ----- | ----- | ---------------- |
| `brand-50` | `#fbf4e2` cream | Card fieldset backgrounds (`bg-brand-50/70`) |
| `brand-100` | `#f2e0b8` | Card border (`border-brand-100`) |
| `brand-200` | `#dfb765` gold | Fieldset borders (`border-brand-200`) |
| `brand-500` | `#4a6cbd` blue | Input focus border |
| `brand-600` | `#3b5ba9` | Primary button background |
| `brand-700` | `#2e4785` | Button hover, links |
| `background` | `#242424` charcoal | Page background |
| `foreground` | `#0f172a` slate | Body text colour |

Because these are declared with `@theme inline`, Tailwind generates real utilities:
`bg-brand-600`, `text-brand-700`, `border-brand-200`, etc. Add a brand shade by adding one
line; no config file to touch.

Fonts come from `next/font/google` in `app/layout.tsx`:

```ts
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
```

`--font-sans` maps to Geist, so any element with the `font-sans` utility renders in Geist. The
`body` rule itself sets `font-family: Arial, Helvetica, sans-serif`, which only applies where no
`font-sans` utility exists. Every page shell includes `font-sans`, so in practice the app is set
in Geist.

## Page shell

Every screen repeats the same two wrappers:

```html
<div class="flex min-h-screen items-center justify-center
            bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100
            px-4 py-6 font-sans text-zinc-900">
  <main class="mx-auto w-full max-w-3xl rounded-2xl border border-brand-100
               bg-white/95 p-6 shadow-lg shadow-black/30 sm:p-8">
    …
  </main>
</div>
```

This appears in `app/page.tsx`, `app/register/register-form.tsx`,
`app/register/[department]/department-form.tsx`, and
`app/register/[department]/submit/page.tsx`. The sky/blue gradient is **neutralised by CSS**
(see below), so it survives only as a hook for the banner rules. It is duplicated on purpose
today, but extracting a `<PageShell>` component would be the obvious refactor.

### Recurring utility patterns

| Element | Classes |
| ------- | ------- |
| Heading | `text-2xl font-semibold text-slate-900 sm:text-3xl` |
| Body copy | `text-sm leading-6 text-slate-700` |
| Primary button | `inline-flex h-11 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700` |
| Secondary button | `inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50` |
| Disabled submit | `disabled:cursor-not-allowed disabled:bg-slate-400` |
| Text input | `w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500` |
| Field error | `text-xs text-red-600` |
| Error panel | `rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700` |
| Notice panel | `rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800` |
| Fieldset | `space-y-3 rounded-xl border border-brand-200 bg-brand-50/70 p-4` |

## Global background

```css
body {
  background-color: var(--background);              /* #242424 */
  background-image: radial-gradient(rgba(251, 244, 226, 0.07) 1px, transparent 1.5px);
  background-size: 24px 24px;
  background-attachment: fixed;
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
  min-height: 100vh;
  overflow-x: hidden;
}
```

- Charcoal rather than pure black, so the black banner art has something to sit against.
- A faint cream dot grid at 24 px pitch mimics the banner texture.

### Decorative pseudo-elements

| Selector | Effect |
| -------- | ------ |
| `body::before` | 4 px tri-colour rule pinned to the top edge: blue `#3b5ba9` 0–60%, gold `#d6a33c` 60–80%, red `#b22234` 80–100%; `z-index: 10` |
| `body::after` | Logo chevron watermark, bottom-left, `70vh` square, `fill-opacity 0.04`, inline SVG traced from `logo.png`; `z-index: -1` |

Both are `pointer-events: none` and `position: fixed`, so they never intercept clicks.

## Banners

Each form card gets a CyberPH banner above and below it, implemented entirely in CSS on the
`<main>` element — no extra markup:

```css
main.mx-auto.w-full.max-w-3xl.rounded-2xl {
  position: relative;
  overflow: visible;
  /* card width = viewport minus px-4 gutters, capped at max-w-3xl */
  --card-w: min(100vw - 2rem, 48rem);
  margin-top:    calc(var(--card-w) * 336 / 1632 + 1rem);
  margin-bottom: calc(var(--card-w) * 120 / 1632 + 1rem);
}

main…::before {
  aspect-ratio: 1632 / 336;
  bottom: calc(100% + 0.55rem);
  background-image: image-set(url("/cyberph/header-straight@1x.png") 1x,
                              url("/cyberph/header-straight@2x.png") 2x);
}

main…::after {
  aspect-ratio: 1632 / 120;
  top: calc(100% + 0.55rem);
  background-image: image-set(url("/cyberph/footer-straight@1x.png") 1x,
                              url("/cyberph/footer-straight@2x.png") 2x);
}
```

How it works:

- `--card-w` mirrors the card's real width (`100vw - 2rem` from `px-4`, capped at `48rem`), so
  the banners scale with the card.
- The margins reserve exactly the banner height derived from the image aspect ratios
  (`336/1632` and `120/1632`) plus a `1rem` gap — no layout shift and no overlap with the
  viewport edges.
- `image-set` provides 1x/2x resolution switching without `next/image`.
- The `0.55rem` offset and `box-shadow: 0 0 0 1px rgba(251, 244, 226, 0.18)` draw a cream
  hairline so the black banners read as separate from the charcoal page.

### Assets

| File | Role |
| ---- | ---- |
| `public/cyberph/header-straight@1x.png` / `@2x.png` | Header banner, `1632 × 336` |
| `public/cyberph/footer-straight@1x.png` / `@2x.png` | Footer banner, `1632 × 120` |
| `public/cyberph/logo.png` | Source/reference for the watermark shape; **not referenced at runtime** |
| `app/icon.png` | Favicon via the App Router icon convention |

## CSS overrides that depend on class strings

Two rules reach into component markup:

```css
[class*="bg-gradient-to-br"][class*="from-sky-50"][class*="via-blue-50"][class*="to-indigo-100"] {
  background: transparent !important;
}

div.flex.min-h-screen.items-center.justify-center {
  background-color: transparent !important;
  background-image: none !important;
}
```

These exist so the global charcoal/dot-grid theme shows through the original light gradient
shells. **Caveat:** they are coupled to exact utility names on the wrappers. If you change
`flex min-h-screen items-center justify-center` or the gradient utilities, the overrides stop
matching and the page will show the old sky/blue gradient again. The banner rules are coupled
the same way to `main.mx-auto.w-full.max-w-3xl.rounded-2xl`.

If you refactor the page shell, replace these selectors with a stable class (for example
`.page-shell` and `.form-card`) at the same time.

## Motion

`app/lenis-provider.tsx` wraps the whole app:

```ts
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (prefersReducedMotion) return;

const lenis = new Lenis({ smoothWheel: true, lerp: 0.1 });
let rafId = 0;
const raf = (time: number) => {
  lenis.raf(time);
  rafId = window.requestAnimationFrame(raf);
};
rafId = window.requestAnimationFrame(raf);
return () => {
  window.cancelAnimationFrame(rafId);
  lenis.destroy();
};
```

- Client component, runs once on mount, cleans up on unmount.
- Skips entirely under `prefers-reduced-motion: reduce` — the correct accessibility default.
- `scroll-behavior: auto` is set on `html` in `globals.css` so it does not fight Lenis.
- No other animation library, and transitions are plain Tailwind (`transition`,
  `hover:bg-…`).

## Accessibility notes

Good:

- Inputs are wrapped in `<label>` elements, so every control has a label.
- Radio groups use `<fieldset>` + `<legend>`.
- Required fields are marked with a visual `*` and a `required` attribute.
- Errors are rendered as text near the field, in `text-red-600` on white (adequate contrast).
- Decorative layers are `pointer-events: none` and fixed, so they do not block focus or clicks.
- Reduced-motion is respected before Lenis is created.

Gaps worth fixing:

- Error `<p>` elements are not connected to inputs via `aria-describedby`, and there is no
  `aria-invalid`, so screen readers do not announce validation failures.
- The "?" help control is a `<details><summary>` containing only `?`; it has no accessible
  name beyond the glyph.
- Error/notice panels are not `role="alert"` or `aria-live`, so submit failures are not
  announced.
- No skip link; headings jump from the page `<h1>` to `<legend>`/paragraph text, which is fine
  but there is only one heading level in use.
- `outline-none` on inputs removes the focus ring and replaces it with a 1 px border colour
  change, which is a weak focus indicator.
- Body text colour (`#0f172a`) on the charcoal page would be low contrast, but all content sits
  on white cards, so it is not currently an issue.

## Where to change things

| Change | File |
| ------ | ---- |
| Brand colours, fonts, background tokens | `app/globals.css` (`@theme inline`, `:root`) |
| Dot grid, watermark, top rule | `app/globals.css` (`body`, `body::before`, `body::after`) |
| Banner art or proportions | `public/cyberph/*` + the `main…::before/::after` rules |
| Card/wrapper styling | the four page files (duplicated shells) |
| Smooth scrolling | `app/lenis-provider.tsx` |
| Page title/description | `app/layout.tsx` (`metadata`) |
| Favicon | `app/icon.png` |

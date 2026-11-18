---
name: Peach Journal
colors:
  surface: '#fff8f8'
  surface-dim: '#e5d6db'
  surface-bright: '#fff8f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0f5'
  surface-container: '#f9eaef'
  surface-container-high: '#f4e4e9'
  surface-container-highest: '#eedfe4'
  on-surface: '#21191d'
  on-surface-variant: '#544245'
  inverse-surface: '#372e32'
  inverse-on-surface: '#fcedf2'
  outline: '#877275'
  outline-variant: '#dac0c4'
  surface-tint: '#9b3f5a'
  primary: '#9b3f5a'
  on-primary: '#ffffff'
  primary-container: '#ff8fab'
  on-primary-container: '#79243f'
  inverse-primary: '#ffb1c2'
  secondary: '#186b4d'
  on-secondary: '#ffffff'
  secondary-container: '#a4f3cd'
  on-secondary-container: '#207153'
  tertiary: '#8a5010'
  on-tertiary: '#ffffff'
  tertiary-container: '#eba15c'
  on-tertiary-container: '#673800'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd9e0'
  primary-fixed-dim: '#ffb1c2'
  on-primary-fixed: '#3f0018'
  on-primary-fixed-variant: '#7d2742'
  secondary-fixed: '#a4f3cd'
  secondary-fixed-dim: '#89d6b1'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005138'
  tertiary-fixed: '#ffdcc1'
  tertiary-fixed-dim: '#ffb877'
  on-tertiary-fixed: '#2e1600'
  on-tertiary-fixed-variant: '#6c3a00'
  background: '#fff8f8'
  on-background: '#21191d'
  surface-variant: '#eedfe4'
typography:
  display-lg:
    fontFamily: Quicksand
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Quicksand
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-lg:
    fontFamily: Quicksand
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: Quicksand
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  headline-sm:
    fontFamily: Quicksand
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Quicksand
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Quicksand
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  numeric-hero:
    fontFamily: Quicksand
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
  numeric-table:
    fontFamily: Quicksand
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system brings the delicate, warm tactility of a physical pastel paper planner into a modern web ledger. It is engineered for everyday journal keepers and aesthetic-focused trackers who find standard fintech apps intimidating, cold, and transactional. 

The aesthetic marries **Playful Minimalism** with **Tactile Pastel Softness**:
- **Personality:** Soothing, encouraging, organized, and intimately warm.
- **Visual Tenets:** Airy spacing, pillowy volumetric cards, rounded geometry, and a deliberate absence of rigid sharp lines.
- **Sensory Feedback:** Micro-interactions mimic subtle paper stickers and soft-touch buttons, turning daily expense logging into a comforting self-care ritual rather than a chore.

## Colors

The palette establishes an emotional sanctuary dominated by creamy strawberry milk tones, grounded by deep warm-gray slate for effortless legibility.

- **Primary (`#FF8FAB` - Peach Pink):** The hero identity. Used for primary CTAs, active states, key interactive indicators, and progress tracks.
  - *Hover/Pressed:* `#F4759B`
  - *Tint/Subtle Wash:* `#FFE5EC`
- **Secondary (`#7BC8A4` - Mint Green Milk):** Assigned exclusively to positive cash flows, income streams, and completed savings targets. Always paired with a `+` symbol for clarity.
- **Tertiary (`#FFB26B` - Milk Orange):** Serves as an encouraging warning indicator (e.g., budget pacing alerts, approaching thresholds) without triggering immediate panic.
- **Danger / Over-Budget (`#F9616C` - Coral Red):** Crisp alert tone reserved strictly for exceeded category caps and hard error validations.
- **Expense Tone (`#FF6B8A` - Warm Punch Pink):** Differentiated warm hue for outflows, always displayed with a `-` symbol.
- **Surfaces & Layout:**
  - *Page Canvas:* `#FFFAFB` (Milky off-white blush)
  - *Card & Modal Panels:* `#FFFFFF`
  - *Divider / Inset Borders:* `#F5E6EA`
- **Neutrals & Legibility:**
  - *Primary Text:* `#3D3438` (Warm charcoal, ensures strict WCAG AA/AAA compliance against light cards)
  - *Secondary Text:* `#A08E96` (Warm muted mauve)
  - *Disabled / Placeholder:* `#D8CCD1`

## Typography

The type system blends organic, soft display curves with high-clarity sans-serif bodies:

- **Primary Font Stacks:**
  - Latin Headlines & Numerical Ledger: `Quicksand`, followed by standard system rounded sans.
  - Body & Microcopy: `Plus Jakarta Sans`, falling back to native system sans-serif (`-apple-system`, `BlinkMacSystemFont`, `PingFang SC`, `Microsoft YaHei`, sans-serif) for Chinese glyphs.
- **Monospaced Number Alignment:** Financial ledgers, currency amounts, and data tables must enable tabular numerals (`font-variant-numeric: tabular-nums;`) on Quicksand to ensure flawless vertical digit alignment while maintaining a friendly, rounded aesthetic.
- **Hierarchy Rules:** 
  - Headlines leverage generous line heights to preserve breathing room.
  - Chinese text defaults to `body-md` (14px) and `body-lg` (16px) with slightly relaxed leading (1.5x - 1.6x) for effortless scanning.

## Layout & Spacing

The web product employs a fixed left navigation structure combined with an organized, card-driven content region.

- **Desktop Framework:**
  - **Left Rail (Fixed):** Width `260px`, anchored to the left viewport edge with full-height border separation `#F5E6EA` and soft milky backdrop `#FFFAFB`.
  - **Main Canvas:** Fills the remaining viewport, hosting a centered content container capped at `max-width: 1200px` with dynamic horizontal margin `margin: 0 auto`.
  - **Grid System:** Internal dashboards follow a 12-column responsive layout with `24px` (`1.5rem`) gutters.
- **Responsive Adaptations:**
  - *Desktop (>1024px):* Static sidebar (`260px`) + 12-column grid content area.
  - *Tablet (768px - 1023px):* Sidebar contracts into an `80px` icon rail; content margins shift to `1.5rem`; grid transitions to an 8-column layout.
  - *Mobile (<768px):* Sidebar collapses into a sticky floating bottom tab bar (`64px`); margins tighten to `1rem`; elements span full-width cards in a single-column flow.

## Elevation & Depth

This design system avoids dark or heavy drop shadows in favor of luminous, peach-tinted atmospheric glows that give surfaces the feel of floating sticker sheets:

- **Base Ambient Shadow (Primary Resting Layer):**
  - `box-shadow: 0 4px 16px rgba(255, 143, 171, 0.15);`
  - Applied to cards, balance summaries, and standalone container panels resting on the `#FFFAFB` canvas.
- **Floating / Elevated State (Modals, Popovers, Active Dropdowns):**
  - `box-shadow: 0 12px 32px rgba(255, 143, 171, 0.22);`
- **Interactive Hover Drift:**
  - Cards and clickable summary blocks translate vertically (`transform: translateY(-2px)`) while expanding their shadow to `0 8px 24px rgba(255, 143, 171, 0.20)`.
- **Structural Separation:**
  - Flat secondary containers (such as breakdown lists within an expense card) use a solid `#FFE5EC` tinted fill or a crisp `1px solid #F5E6EA` boundary without elevation shadows.

## Shapes

The shape hierarchy establishes distinct roundedness tiers based on functional ergonomics:

- **Cards & Primary Modules:** Fixed at `16px` border-radius (`1rem`). Softened corners eliminate visual tension across wide data surfaces.
- **Inputs & Interactive Fields:** Fixed at `12px` border-radius (`0.75rem`) to feel welcoming and approachable.
- **Buttons, Tags & Badges:** Full capsule roundedness (`border-radius: 9999px`), giving them a pill-shaped, tactile "sticker" profile.
- **Nested Inner Surfaces:** Elements nested inside `16px` cards maintain an `8px` to `10px` inner corner radius to sustain harmonious concentric geometry.

## Components

### 1. Buttons
- **Primary Button:** Capsule shape (`border-radius: 9999px`), background `#FF8FAB`, text `#FFFFFF`, font weight `600`. Hover state triggers `#F4759B` and a subtle lift (`translateY(-1px)`). Focus ring uses a `3px` offset stroke `#FFE5EC`.
- **Secondary / Soft Button:** Capsule shape, background `#FFE5EC`, text `#FF6B8A`. Hover shifts background to a 15% opacity overlay of `#FF8FAB`.
- **Ghost / Icon Button:** Transparent background, text `#3D3438`, hover fills `#FFE5EC` with a rounded `12px` shape.

### 2. Cards & Modules
- White `#FFFFFF` surface with `16px` border radius, bounded by the ambient peach glow (`0 4px 16px rgba(255,143,171,0.15)`).
- Padding is generous: `24px` internal padding for summary modules; `16px` for dense data lists.

### 3. Form Inputs & Selectors
- Background `#FFFFFF` bordered with `1.5px solid #F5E6EA`, `12px` border radius, padding `10px 16px`.
- Text styled in `#3D3438`; placeholder set in `#A08E96`.
- Active focus state: border shifts to `#FF8FAB` accompanied by a soft glow: `box-shadow: 0 0 0 4px rgba(255, 143, 171, 0.18)`.

### 4. Chips & Tags
- Height `28px` or `32px`, pill-shaped (`9999px`), horizontal padding `12px`.
- **Active Category Tag:** Background `#FF8FAB`, text `#FFFFFF`.
- **Default Category Tag:** Background `#FFE5EC`, text `#A08E96`. Hover turns text to `#3D3438`.

### 5. Checkboxes & Radio Controls
- Circular checks and radios with `20px` diameter.
- Inactive state: `2px solid #F5E6EA` on white background.
- Active state: background `#FF8FAB`, displaying a white `#FFFFFF` inner dot or soft rounded check icon.

### 6. Transaction Ledger Lists
- Row items separated by hairline rules `1px solid #F5E6EA` or floated as micro-cards with `8px` spacing.
- Left-aligned round category avatar (`40px`, `#FFE5EC` background with peach/mint icon).
- Middle category and timestamp block in `#3D3438` and `#A08E96`.
- Right-aligned monetary values using `Quicksand` tabular figures:
  - Inflows: `#7BC8A4` with a mandatory prefix `+¥`
  - Outflows: `#FF6B8A` with a mandatory prefix `-¥`

### 7. Ledger-Specific Components
- **Budget Thermometer / Progress Bar:** Height `10px`, track background `#F5E6EA`, filled with a gradient transitioning from `#FF8FAB` to `#FF6B8A` (or shifting to warning `#FFB26B` / danger `#F9616C` when exceeding 85% / 100%).
- **Handwritten Note Inset:** A pale cream-blush box (`#FFFAFB`) with a dashed `1.5px` border `#F5E6EA` and `12px` radius for diary entries and merchant remarks.
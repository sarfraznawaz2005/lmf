# LMF — LLM Markup Format Specification v1

## Philosophy

Every existing image format encodes **pixels** — opaque binary data that text-only LLMs
cannot interpret. LMF encodes **semantic visual structure** as compact, human-and-LLM-readable
text. Any LLM can read, understand, create, and modify `.lmf` files without vision capabilities.

A companion renderer converts `.lmf` → PNG/SVG for human viewing.

## Design Principles

1. **Semantic over pixel** — describe what things ARE, not individual dots
2. **Minimal tokens** — every character carries maximum information
3. **Indentation-based** — Python-style nesting, no closing tags or braces
4. **Short keywords** — single/double letter property names
5. **UI-native** — charts, tables, buttons, avatars are first-class primitives

## File Structure

```
#LMF1 [WIDTHxHEIGHT] [bg:COLOR]
[@def ALIAS EXPANSION]
[// comments]
NODE_TREE
```

### Header

The first line MUST start with `#LMF1` (version identifier).

Optional parameters:
- `WIDTHxHEIGHT` — canvas size in pixels (default: `1920x1080`)
- `bg:COLOR` — canvas background color (default: `#ffffff`)

### Definitions (macros)

Lines starting with `@def` create reusable aliases:
```
@def Card C bg:#1e293b r:12 p:16 sh:sm
```
Usage: `Card w:f` expands to `C bg:#1e293b r:12 p:16 sh:sm w:f`

### Comments

Lines starting with `//` are ignored.

## Node Types

| Type | Name      | Description                              |
|------|-----------|------------------------------------------|
| `R`  | Row       | Horizontal flex container                |
| `C`  | Column    | Vertical flex container                  |
| `T`  | Text      | Text element                             |
| `B`  | Box       | Generic container (no direction)         |
| `G`  | Grid      | CSS-grid-like container                  |
| `St` | Stack     | Absolute/overlapping positioning         |
| `Dv` | Divider   | Horizontal or vertical line              |
| `Tb` | Table     | Table container                          |
| `Tr` | TableRow  | Table row                                |
| `Td` | TableCell | Table cell                               |
| `Ch` | Chart     | Data visualization                       |
| `Bt` | Button    | Button element                           |
| `In` | Input     | Input field                              |
| `Av` | Avatar    | Circular avatar                          |
| `Ic` | Icon      | Named icon                               |
| `Bd` | Badge     | Small badge/tag                          |
| `Im` | Image     | Placeholder image                        |
| `Pg` | Progress  | Progress bar                             |

## Node Syntax

```
TYPE [PROPERTIES...] ["text content"]
  CHILD_NODE
  CHILD_NODE
```

- Indentation: **2 spaces** per nesting level
- Properties: space-separated `key:value` pairs
- Flags: standalone words (e.g., `b` for bold)
- Text: quoted string at end of line

## Property Reference

### Dimensions
| Prop | Description | Values |
|------|-------------|--------|
| `w`  | Width       | `f` (flex), number (px), `50%` |
| `h`  | Height      | `f` (flex), number (px), `50%` |
| `minw`| Min width  | number (px) |
| `minh`| Min height | number (px) |

### Spacing
| Prop | Description | Values |
|------|-------------|--------|
| `p`  | Padding     | `16` or `16,8` (v,h) or `16,8,16,8` (t,r,b,l) |
| `m`  | Margin      | Same as padding |
| `g`  | Gap         | number (px) — space between children |

### Colors & Style
| Prop | Description | Values |
|------|-------------|--------|
| `bg` | Background  | hex color (`#1a1a2e`, `#fff`) |
| `c`  | Text color  | hex color |
| `r`  | Border radius | number (px) |
| `bd` | Border      | `1,#333` (width,color) |
| `sh` | Shadow      | `sm`, `md`, `lg` |
| `o`  | Opacity     | `0.0` to `1.0` |

### Typography
| Prop | Description | Values |
|------|-------------|--------|
| `s`  | Font size   | number (px, default: 14) |
| `b`  | Bold        | flag (no value needed) |
| `i`  | Italic      | flag |
| `u`  | Underline   | flag |
| `lh` | Line height | number (multiplier) |
| `al` | Text align  | `left`, `center`, `right` |

### Layout
| Prop | Description | Values |
|------|-------------|--------|
| `al`  | Align items   | `start`, `center`, `end` |
| `jc`  | Justify       | `start`, `center`, `end`, `between`, `around` |
| `wrap`| Flex wrap     | flag |

### Chart-specific
| Prop | Description | Values |
|------|-------------|--------|
| `type`| Chart type  | `line`, `bar`, `pie`, `donut`, `area`, `spark` |
| `d`   | Data values | comma-separated numbers: `40,65,50,80` |
| `l`   | Labels      | comma-separated: `Jan,Feb,Mar,Apr` |
| `colors`| Colors    | comma-separated hex: `#e94560,#4ade80` |

### Table-specific
| Prop  | Description | Values |
|-------|-------------|--------|
| `head`| Header row  | flag |
| `cols`| Column count| number |

### Special
| Prop   | Description | Values |
|--------|-------------|--------|
| `name` | Icon name   | `home`, `chart`, `users`, `settings`, `bell`, `search`, `mail`, `star`, `heart`, `check`, `x`, `plus`, `minus`, `arrow-left`, `arrow-right`, `arrow-up`, `arrow-down` |
| `src`  | Image source| placeholder descriptor |
| `pct`  | Percentage  | number 0-100 (for Progress) |

## Layout Model

LMF uses a simplified **flexbox** model:

- `R` (Row): children flow **horizontally** (left to right)
- `C` (Column): children flow **vertically** (top to bottom)
- `w:f` / `h:f`: child takes all remaining space (flex-grow)
- Fixed sizes in pixels or percentages
- Gap between children via `g` property
- Padding via `p` property

### Size Resolution Order
1. Explicit `w`/`h` values
2. Flex (`f`) — distribute remaining space
3. Content-based (text measurement, children)

## Color Format

- 6-digit hex: `#1a1a2e`
- 3-digit hex: `#fff` (expanded to `#ffffff`)
- Named: `transparent`

## Examples

### Minimal
```
#LMF1 400x300 bg:#1e293b
C w:f h:f p:24 al:center jc:center
  T s:24 b c:#fff "Hello, World!"
```

### Dashboard Card
```
#LMF1 300x150 bg:#0f172a
C w:f h:f bg:#1e293b r:12 p:16
  T s:12 c:#94a3b8 "Revenue"
  T s:28 b c:#fff "$45,231"
  R g:4 al:center
    T s:12 c:#4ade80 "+20.1%"
    T s:12 c:#64748b "vs last month"
```

## Conversion

LMF files are converted to raster/vector images via the `lmf` renderer:

```bash
python lmf.py render dashboard.lmf -o dashboard.png
python lmf.py render dashboard.lmf -o dashboard.svg
```

## Why Not SVG/HTML?

| Metric | HTML+CSS | SVG | LMF |
|--------|----------|-----|-----|
| Tokens for a dashboard | ~5000 | ~3000 | ~400 |
| Semantic clarity | Medium | Low | High |
| LLM can author from scratch | Hard | Medium | Easy |
| Layout model | Complex | Manual | Simple flex |
| UI primitives built-in | No | No | Yes |

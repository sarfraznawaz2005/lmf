# LMF Syntax Reference

## File Header

```
#LMF1 <width>x<height> bg:<color>
```

Example: `#LMF1 1200x800 bg:#0f172a`

## Indentation

Children are indented under their parent (2 spaces). Nesting depth = DOM depth.

```
C w:f h:f p:24 g:16
  T s:28 b c:#fff "Title"
  R g:12
    Bt bg:#6366f1 r:8 "Save"
    Bt bg:#334155 r:8 "Cancel"
```

## Node Types

| Type | Name     | Description                        |
|------|----------|------------------------------------|
| `R`  | Row      | Horizontal flex container          |
| `C`  | Column   | Vertical flex container            |
| `T`  | Text     | Text element                       |
| `Bt` | Button   | Styled button                      |
| `In` | Input    | Input field                        |
| `Av` | Avatar   | Circle with initials               |
| `Bd` | Badge    | Small colored tag                  |
| `Ic` | Icon     | Named SVG icon                     |
| `Dv` | Divider  | 1px horizontal line                |
| `Ch` | Chart    | Data visualization                 |
| `Pg` | Progress | Progress bar                       |
| `Im` | Image    | Placeholder image                  |
| `B`  | Box      | Generic container                  |

## Properties

### Dimensions
| Prop | Meaning | Examples |
|------|---------|---------|
| `w`  | Width   | `w:320` `w:f` (flex/fill) `w:50%` |
| `h`  | Height  | `h:48` `h:f` (flex/fill) |

### Spacing
| Prop | Meaning | Examples |
|------|---------|---------|
| `p`  | Padding | `p:16` `p:16,8` (vertical,horizontal) `p:8,12,8,12` (t,r,b,l) |
| `g`  | Gap between children | `g:12` |
| `m`  | Margin  | `m:8` |

### Color
| Prop | Meaning | Examples |
|------|---------|---------|
| `bg` | Background | `bg:#1e293b` `bg:transparent` |
| `c`  | Text/icon color | `c:#ffffff` `c:#64748b` |

### Typography
| Prop | Meaning | Examples |
|------|---------|---------|
| `s`  | Font size (px) | `s:14` `s:24` |
| `b`  | Bold (flag) | `b` |
| `i`  | Italic (flag) | `i` |
| `u`  | Underline (flag) | `u` |

### Layout
| Prop | Meaning | Values |
|------|---------|--------|
| `al` | Align items (cross-axis) | `start` `center` `end` |
| `jc` | Justify content (main-axis) | `start` `center` `end` `between` `around` |

### Decoration
| Prop | Meaning | Examples |
|------|---------|---------|
| `r`  | Border radius | `r:8` `r:12,12,0,0` (t-l,t-r,b-r,b-l) |
| `bd` | Border | `bd:1,#334155` (width,color) |
| `sh` | Shadow | `sh:sm` `sh` (md) `sh:lg` |

## Charts (Ch)

```
Ch type:line   d:30,45,35,60,48,75  c:#6366f1 h:f w:f
Ch type:area   d:30,45,35,60,48,75  c:#6366f1 h:200 w:f
Ch type:spark  d:20,35,28,45,38,52  c:#4ade80 h:40 w:f
Ch type:bar    d:40,60,35,80        colors:#6366f1,#ec4899 l:Mon,Tue,Wed,Thu h:200 w:f
Ch type:pie    d:40,25,20,15        colors:#6366f1,#ec4899,#14b8a6,#f59e0b l:A,B,C,D
Ch type:donut  d:40,25,20,15        colors:#6366f1,#ec4899,#14b8a6,#f59e0b l:Direct,Social,Organic,Referral
```

Properties: `d` = comma-separated values, `colors` = comma-separated hex colors, `l` = comma-separated labels

## Icons (Ic)

```
Ic name:home s:20 c:#6366f1
```

Available names: `home` `chart` `users` `settings` `bell` `search` `mail` `star` `heart` `check` `x` `plus` `arrow-left` `arrow-right` `menu` `folder` `file` `clock` `eye` `edit` `trash` `download` `lock` `globe` `calendar` `phone`

## Macros

Define reusable shorthand with `@def`:

```
@def Card C bg:#1e293b r:12 p:16

Card w:f g:8
  T s:12 c:#888 "Label"
  T s:24 b c:#fff "Value"
```

## Common Color Palette (dark theme)

| Token | Hex | Use |
|-------|-----|-----|
| Canvas bg | `#0f172a` | Page background |
| Surface | `#1e293b` | Cards, panels |
| Border | `#334155` | Dividers, outlines |
| Muted text | `#64748b` | Labels, captions |
| Subtle text | `#94a3b8` | Secondary text |
| Primary text | `#f1f5f9` | Headings, values |
| Accent | `#6366f1` | Buttons, active states |
| Success | `#4ade80` | Positive values |
| Danger | `#f87171` | Negative values |
| Pink | `#ec4899` | Highlights |
| Teal | `#14b8a6` | Alternate accent |
| Amber | `#f59e0b` | Warnings |

## Full Example — Login Page

```
#LMF1 500x650 bg:#0f172a

C w:f h:f al:center jc:center p:40
  C w:f bg:#1e293b r:16 p:32 g:20 al:center
    C g:8 al:center
      Av s:56 bg:#6366f1 "A"
      T s:22 b c:#f1f5f9 "Welcome Back"
      T s:14 c:#64748b "Sign in to your account"
    C g:14 w:f
      C g:6 w:f
        T s:12 b c:#94a3b8 "Email"
        In w:f s:14 bg:#0f172a bd:1,#334155 r:8 "you@example.com"
      C g:6 w:f
        T s:12 b c:#94a3b8 "Password"
        In w:f s:14 bg:#0f172a bd:1,#334155 r:8 "Enter password"
    Bt w:f s:14 b bg:#6366f1 r:8 "Sign In"
    R g:4 al:center jc:center w:f
      T s:13 c:#64748b "Don't have an account?"
      T s:13 b c:#6366f1 "Sign up"
```

---
name: lmf
description: >
  LMF (LLM Markup Format) — a compact text-based format for expressing visual UI layouts that any LLM can read and write without vision capabilities. Use this skill when: designing UI screens, dashboards, mobile apps, login pages, or any visual layout; reading or editing .lmf files; converting LMF to PNG/SVG/HTML for human viewing; or when the user asks to create, modify, or render an LMF design. The LMF text itself IS the image — no vision needed to understand it.
---

# LMF Skill

LMF encodes semantic visual structure as ultra-compact text (~10x more token-efficient than HTML). A `.lmf` file IS the image — read it, write it, edit it as plain text. Use `lmf.py` to render for human viewing.

Read `references/syntax.md` before writing or editing LMF files — it contains the complete syntax, all node types, properties, and examples.

## Converting LMF to Other Formats

The renderer (`lmf.py`) lives in the project directory alongside the `.lmf` files.

```bash
# SVG — no dependencies
python lmf.py render file.lmf -o file.svg

# HTML — no dependencies (open in browser)
python lmf.py render file.lmf -o file.html

# PNG — requires cairosvg
pip install cairosvg
python lmf.py render file.lmf -o file.png
python lmf.py render file.lmf -o file.png --scale 2   # 2x resolution

# Validate syntax
python lmf.py validate file.lmf
```

Output format is determined by file extension (`.svg`, `.html`, `.png`).

## Writing LMF

Use the dark theme palette by default:

| Token | Hex | Use |
|-------|-----|-----|
| Canvas bg | `#0f172a` | Page background |
| Surface | `#1e293b` | Cards, panels |
| Border | `#334155` | Dividers, outlines |
| Muted text | `#64748b` | Labels, captions |
| Primary text | `#f1f5f9` | Headings, values |
| Accent | `#6366f1` | Buttons, active states |
| Success | `#4ade80` | Positive values |
| Danger | `#f87171` | Negative values |

Key layout rules:
- `R` = horizontal flex container, `C` = vertical flex container
- `w:f` / `h:f` = flex-grow (fills remaining space)
- `g` = gap between children, `p` = padding, `al` = align-items, `jc` = justify-content
- Indentation (2 spaces per level) defines parent-child relationships

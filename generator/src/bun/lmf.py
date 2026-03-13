#!/usr/bin/env python3
"""
LMF — LLM Markup Format
A text-based image format designed for LLMs to read, write, and understand.

Rendering pipeline:  .lmf → parse → flex layout engine → SVG → PNG (via cairosvg)
Dependencies: cairosvg (for PNG output only).  SVG output needs no dependencies.
"""
from __future__ import annotations

import html as html_lib
import math
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# ════════════════════════════════════════════════════════════════════
#  AST
# ════════════════════════════════════════════════════════════════════

@dataclass
class Node:
    type: str
    props: dict = field(default_factory=dict)
    text: str = ""
    children: list["Node"] = field(default_factory=list)

    def get(self, key, default=None):
        v = self.props.get(key)
        return default if v is None else v

    def get_f(self, key, default=0.0):
        v = self.props.get(key)
        if v is None:
            return default
        if isinstance(v, (int, float)):
            return float(v)
        try:
            return float(v)
        except (ValueError, TypeError):
            return default


# ════════════════════════════════════════════════════════════════════
#  PARSER
# ════════════════════════════════════════════════════════════════════

KNOWN_FLAGS = {
    "b", "i", "u", "bold", "italic", "underline",
    "head", "wrap", "active", "disabled", "outline",
    "vertical", "horizontal",
}


def parse(source: str):
    lines = source.split("\n")
    meta = {"w": 1920, "h": 1080, "bg": "#ffffff"}
    defs = {}
    colors = {}
    content_lines = []

    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("//"):
            continue
        if stripped.startswith("#LMF"):
            for part in stripped.split()[1:]:
                if re.match(r"^\d+x\d+$", part):
                    w, h = part.split("x")
                    meta["w"], meta["h"] = int(w), int(h)
                elif part.startswith("bg:"):
                    meta["bg"] = part[3:]
            continue
        if stripped.startswith("@def "):
            tokens = stripped[5:].split(None, 1)
            if len(tokens) == 2:
                defs[tokens[0]] = tokens[1]
            continue
        if stripped.startswith("@color "):
            tokens = stripped[7:].split(None, 1)
            if len(tokens) == 2:
                colors[tokens[0]] = tokens[1].strip()
            continue
        if stripped.startswith("#"):  # inline comment (e.g. # Sidebar)
            continue
        content_lines.append(raw_line)

    if not content_lines:
        return Node("C"), meta

    roots = _parse_indent(content_lines, defs, colors)
    if len(roots) == 1:
        return roots[0], meta
    return Node("C", children=roots), meta


def _indent_of(line: str) -> int:
    return len(line) - len(line.lstrip())


def _parse_indent(lines: list[str], defs: dict, colors: dict = None) -> list[Node]:
    if colors is None:
        colors = {}
    nodes = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("#"):
            i += 1
            continue
        indent = _indent_of(lines[i])
        node = _parse_line(stripped, defs, colors)

        child_lines = []
        j = i + 1
        while j < len(lines):
            s = lines[j].strip()
            if not s or s.startswith("//") or s.startswith("#"):
                child_lines.append(lines[j])
                j += 1
                continue
            if _indent_of(lines[j]) > indent:
                child_lines.append(lines[j])
                j += 1
            else:
                break

        if child_lines:
            real = [l for l in child_lines if l.strip() and not l.strip().startswith("//") and not l.strip().startswith("#")]
            if real:
                min_ind = min(_indent_of(l) for l in real)
                dedented = []
                for l in child_lines:
                    dedented.append(l[min_ind:] if len(l) >= min_ind else l)
                node.children = _parse_indent(dedented, defs, colors)

        nodes.append(node)
        i = j
    return nodes


def _parse_line(line: str, defs: dict, colors: dict = None) -> Node:
    if colors:
        for name, val in colors.items():
            line = line.replace(f"${name}", val)

    m = re.match(r"^([A-Z][a-z]*)", line)
    if not m:
        return Node("T", text=line)

    node_type = m.group(1)
    rest = line[m.end():].strip()

    if node_type in defs:
        return _parse_line(defs[node_type] + " " + rest, defs, colors)

    props = {}
    text = ""

    qm = re.search(r'"((?:[^"\\]|\\.)*)"', rest)
    if qm:
        text = qm.group(1)
        rest = rest[:qm.start()] + rest[qm.end():]
    else:
        qm = re.search(r"'((?:[^'\\]|\\.)*)'", rest)
        if qm:
            text = qm.group(1)
            rest = rest[:qm.start()] + rest[qm.end():]

    prop_spans = []
    for pm in re.finditer(r"(\w+):([\S]+)", rest):
        key, val = pm.group(1), pm.group(2)
        props[key] = _parse_value(val)
        prop_spans.append((pm.start(), pm.end()))

    for fm in re.finditer(r"\b([a-z]+)\b", rest):
        if any(s <= fm.start() < e for s, e in prop_spans):
            continue
        flag = fm.group(1)
        if flag in KNOWN_FLAGS or flag in ("sm", "md", "lg"):
            props[flag] = True

    return Node(node_type, props, text)


def _parse_value(v: str):
    if v == "f":
        return "flex"
    if v == "transparent":
        return v
    try:
        if "." in v and v.replace(".", "", 1).replace("-", "", 1).isdigit():
            return float(v)
        if v.lstrip("-").isdigit():
            return int(v)
    except ValueError:
        pass
    return v


def _esc(text: str) -> str:
    return html_lib.escape(str(text))


# ════════════════════════════════════════════════════════════════════
#  ICON SVG PATHS
# ════════════════════════════════════════════════════════════════════

ICON_SVG = {
    "home":     '<path d="M3 12l9-8 9 8M5 11v8a1 1 0 001 1h3v-5h6v5h3a1 1 0 001-1v-8" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    "chart":    '<path d="M4 20h16M4 20V10l4 3 4-8 4 5 4-4v14" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    "users":    '<circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="17" cy="8" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M21 21v-2a3 3 0 00-2-2.8" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    "settings": '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 9a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9z" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    "bell":     '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    "search":   '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    "mail":     '<rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M22 6l-10 7L2 6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    "star":     '<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
    "heart":    '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    "check":    '<polyline points="20,6 9,17 4,12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    "x":        '<line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    "plus":     '<line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    "arrow-left":  '<line x1="19" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="12,19 5,12 12,5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    "arrow-right": '<line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="12,5 19,12 12,19" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    "menu":     '<line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    "folder":   '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    "file":     '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.8" fill="none"/><polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    "clock":    '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8" fill="none"/><polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    "eye":      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    "edit":     '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    "trash":    '<polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    "download": '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="1.8" fill="none"/><polyline points="7,10 12,15 17,10" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    "lock":     '<rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    "globe":    '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8" fill="none"/><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.8"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    "calendar": '<rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="1.8"/>',
    "phone":    '<rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><line x1="12" y1="18" x2="12.01" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
}


# ════════════════════════════════════════════════════════════════════
#  LAYOUT ENGINE — Flexbox-inspired Python layout
# ════════════════════════════════════════════════════════════════════

@dataclass
class Pad:
    top: float = 0
    right: float = 0
    bottom: float = 0
    left: float = 0


@dataclass
class LayoutBox:
    node: Node
    x: float = 0       # relative to parent box's top-left corner
    y: float = 0
    w: float = 0
    h: float = 0
    pad: Pad = field(default_factory=Pad)
    children: list = field(default_factory=list)


def _parse_pad(val) -> Pad:
    if val is None or val == 0:
        return Pad()
    if isinstance(val, (int, float)):
        v = float(val)
        return Pad(v, v, v, v)
    if isinstance(val, str) and "," in val:
        parts = [float(p) for p in val.split(",")]
        if len(parts) == 2:
            return Pad(parts[0], parts[1], parts[0], parts[1])
        if len(parts) == 4:
            return Pad(*parts)
    try:
        v = float(val)
        return Pad(v, v, v, v)
    except (ValueError, TypeError):
        return Pad()


# Approximate character width ratio for a proportional sans-serif font
_CW = 0.58


def _text_w(text: str, fs: float) -> float:
    return len(text) * fs * _CW


def _text_h(fs: float) -> float:
    return fs * 1.4


def _natural_w(node: Node) -> float:
    """Estimate the natural (content) width of any node."""
    t = node.type
    fs = node.get_f("s", 14)
    text = node.text or ""

    # Leaf elements with explicit or computable widths
    if t == "T":
        return _text_w(text, fs)
    if t in ("Av", "Ic"):
        return node.get_f("s", 40 if t == "Av" else 20)
    if t == "Bt":
        return _text_w(text, fs) + 32
    if t == "Bd":
        return _text_w(text, node.get_f("s", 12)) + 20
    if t == "In":
        w = node.get("w")
        return float(w) if isinstance(w, (int, float)) else 200
    if t == "Ch":
        w = node.get("w")
        return float(w) if isinstance(w, (int, float)) else 200
    if t == "Im":
        w = node.get("w")
        return float(w) if isinstance(w, (int, float)) else 200
    if t == "Dv":
        return 0

    # Container nodes — compute recursively from children
    if t in ("R", "Tr", "C", "Tb", "B", "St", "Td") and node.children:
        pad = _parse_pad(node.get("p", 0))
        g = node.get_f("g", 0)
        child_nw = [_natural_w(c) for c in node.children if c.get("w") != "flex"]
        if not child_nw:
            return pad.left + pad.right
        if t in ("R", "Tr"):
            total = sum(child_nw) + g * max(0, len(child_nw) - 1)
        else:
            total = max(child_nw)
        return total + pad.left + pad.right

    return 0


def _natural_h(node: Node, given_w: float = 0) -> float:
    """Compute the natural (content) height of a leaf node."""
    t = node.type
    fs = node.get_f("s", 14)
    if t == "T":
        return _text_h(fs)
    if t == "Av":
        return node.get_f("s", 40)
    if t == "Ic":
        return node.get_f("s", 20)
    if t == "Bt":
        return max(_text_h(node.get_f("s", 14)) + 14, 36.0)
    if t == "In":
        return max(_text_h(node.get_f("s", 14)) + 14, 40.0)
    if t == "Bd":
        return max(_text_h(node.get_f("s", 12)) + 6, 22.0)
    if t == "Dv":
        return 1.0
    if t == "Pg":
        return node.get_f("h", 8)
    if t == "Im":
        h = node.get("h")
        return float(h) if isinstance(h, (int, float)) else 150.0
    if t == "Ch":
        h = node.get("h")
        return float(h) if isinstance(h, (int, float)) else 200.0
    return 0.0


def _child_w_in_col(child: Node, inner_w: float) -> float:
    """Allocated width for a child inside a column (cross-axis = width)."""
    w = child.get("w")
    if isinstance(w, (int, float)):
        return float(w)
    if isinstance(w, str) and w.endswith("%"):
        return inner_w * float(w[:-1]) / 100
    # Av and Ic have an implicit square size from their 's' prop
    if child.type in ("Av", "Ic"):
        return child.get_f("s", 40 if child.type == "Av" else 20)
    return inner_w  # w:f or no w → stretch to column width


def _compute_flex_w(children: list[Node], inner_w: float, total_gap: float) -> float:
    """Width per flex child in a row."""
    n_flex = sum(1 for c in children if c.get("w") == "flex")
    if n_flex == 0:
        return 0.0
    fixed = 0.0
    for c in children:
        w = c.get("w")
        if isinstance(w, (int, float)):
            fixed += float(w)
        elif isinstance(w, str) and w.endswith("%"):
            pass  # skip % in first pass estimation
        elif w != "flex":
            fixed += _natural_w(c)
    return max(0.0, (inner_w - fixed - total_gap) / n_flex)


def layout_node(node: Node, avail_w: float,
                avail_h: Optional[float] = None,
                parent_dir: str = "col") -> LayoutBox:
    """
    Lay out a node given the space allocated by its parent.

    avail_w     — allocated width (already the final width for this node)
    avail_h     — allocated height (None = compute from content)
    parent_dir  — "row" | "col"  (parent's main axis direction)
    """
    box = LayoutBox(node=node)
    box.pad = _parse_pad(node.get("p", 0))

    w_prop = node.get("w")
    h_prop = node.get("h")

    # ── Width ──────────────────────────────────────────────────────
    if isinstance(w_prop, (int, float)):
        box.w = float(w_prop)
    elif isinstance(w_prop, str) and w_prop.endswith("%"):
        box.w = avail_w * float(w_prop[:-1]) / 100
    else:
        box.w = avail_w  # flex or default stretch — parent pre-computed this

    inner_w = max(0.0, box.w - box.pad.left - box.pad.right)

    # ── Layout children (determines content height) ────────────────
    is_row = node.type in ("R", "Tr")
    is_col = node.type in ("C", "Tb", "B", "St", "Td")

    if is_row and node.children:
        content_h = _layout_row(box, inner_w, avail_h)
    elif is_col and node.children:
        content_h = _layout_col(box, inner_w, avail_h)
    else:
        content_h = _natural_h(node, inner_w)

    # ── Height ─────────────────────────────────────────────────────
    if isinstance(h_prop, (int, float)):
        box.h = float(h_prop)
    elif h_prop == "flex":
        box.h = avail_h if avail_h is not None else content_h + box.pad.top + box.pad.bottom
    elif avail_h is not None and parent_dir == "row":
        # Default cross-axis stretch: fill the row's height
        box.h = avail_h
    else:
        box.h = content_h + box.pad.top + box.pad.bottom

    return box


def _layout_row(box: LayoutBox, inner_w: float,
                avail_h: Optional[float]) -> float:
    """Layout row children. Returns content height (max child height)."""
    children = box.node.children
    g = box.node.get_f("g", 0)
    total_gap = g * max(0, len(children) - 1)
    flex_w = _compute_flex_w(children, inner_w, total_gap)

    def cw(child):
        w = child.get("w")
        if isinstance(w, (int, float)):
            return float(w)
        if isinstance(w, str) and w.endswith("%"):
            return inner_w * float(w[:-1]) / 100
        if w == "flex":
            return flex_w
        return _natural_w(child)

    # Pass 1: layout without cross-axis constraint → get natural heights
    pass1 = [layout_node(c, cw(c), None, "row") for c in children]
    content_h = max((b.h for b in pass1), default=0.0)

    # Determine the row's inner height (for cross-axis stretch)
    if avail_h is not None:
        row_inner_h = avail_h - box.pad.top - box.pad.bottom
    else:
        row_inner_h = content_h

    # Pass 2: re-layout all children with the row's inner height so they
    # stretch to fill it. Exceptions: explicit numeric height, and
    # fixed-size elements (Av, Ic) that should stay at their natural size.
    final = []
    for i, child in enumerate(children):
        h_prop = child.get("h")
        if isinstance(h_prop, (int, float)):
            final.append(layout_node(child, cw(child), float(h_prop), "row"))
        elif child.type in ("Av", "Ic"):
            nat = child.get_f("s", 40 if child.type == "Av" else 20)
            final.append(layout_node(child, cw(child), nat, "row"))
        else:
            final.append(layout_node(child, cw(child), row_inner_h, "row"))

    _position_row(box, final, g, inner_w, row_inner_h)
    box.children = final
    return content_h


def _layout_col(box: LayoutBox, inner_w: float,
                avail_h: Optional[float]) -> float:
    """Layout column children. Returns content height (sum of child heights + gaps)."""
    children = box.node.children
    g = box.node.get_f("g", 0)
    total_gap = g * max(0, len(children) - 1)

    inner_h = (avail_h - box.pad.top - box.pad.bottom) if avail_h is not None else None

    # Pass 1: layout non-flex-height children to measure their heights
    pass1: dict[int, LayoutBox] = {}
    n_flex_h = 0
    fixed_h_total = 0.0
    for i, child in enumerate(children):
        if child.get("h") == "flex":
            n_flex_h += 1
        else:
            cb = layout_node(child, _child_w_in_col(child, inner_w), None, "col")
            pass1[i] = cb
            fixed_h_total += cb.h

    # Compute per-flex-child height
    if inner_h is not None and n_flex_h > 0:
        flex_h = max(0.0, (inner_h - fixed_h_total - total_gap) / n_flex_h)
    else:
        flex_h = None

    # Pass 2: finalize all children
    final = []
    for i, child in enumerate(children):
        cw = _child_w_in_col(child, inner_w)
        if child.get("h") == "flex":
            final.append(layout_node(child, cw, flex_h, "col"))
        else:
            final.append(pass1.get(i) or layout_node(child, cw, None, "col"))

    content_h = sum(b.h for b in final) + total_gap
    _position_col(box, final, g, inner_w, inner_h if inner_h is not None else content_h)
    box.children = final
    return content_h


def _position_row(box: LayoutBox, children: list[LayoutBox],
                  gap: float, inner_w: float, inner_h: float):
    jc = box.node.get("jc", "start")
    al = box.node.get("al", "stretch")
    n = len(children)

    total_cw = sum(b.w for b in children)
    extra = inner_w - total_cw - gap * max(0, n - 1)

    if jc == "center":
        cx = extra / 2
        step_extra = 0.0
    elif jc in ("end", "flex-end"):
        cx = extra
        step_extra = 0.0
    elif jc == "between":
        cx = 0.0
        step_extra = extra / max(1, n - 1) if n > 1 else 0.0
    elif jc == "around":
        step_extra = extra / max(1, n)
        cx = step_extra / 2
    else:  # start
        cx = 0.0
        step_extra = 0.0

    for b in children:
        if al == "center":
            cy = (inner_h - b.h) / 2
        elif al in ("end", "flex-end"):
            cy = inner_h - b.h
        else:
            cy = 0.0
        b.x = box.pad.left + cx
        b.y = box.pad.top + cy
        cx += b.w + gap + step_extra


def _position_col(box: LayoutBox, children: list[LayoutBox],
                  gap: float, inner_w: float, inner_h: float):
    jc = box.node.get("jc", "start")
    al = box.node.get("al", "stretch")
    n = len(children)

    total_ch = sum(b.h for b in children)
    extra = inner_h - total_ch - gap * max(0, n - 1)

    if jc == "center":
        cy = extra / 2
        step_extra = 0.0
    elif jc in ("end", "flex-end"):
        cy = extra
        step_extra = 0.0
    elif jc == "between":
        cy = 0.0
        step_extra = extra / max(1, n - 1) if n > 1 else 0.0
    elif jc == "around":
        step_extra = extra / max(1, n)
        cy = step_extra / 2
    else:
        cy = 0.0
        step_extra = 0.0

    for b in children:
        if al == "center":
            cx = (inner_w - b.w) / 2
        elif al in ("end", "flex-end"):
            cx = inner_w - b.w
        else:
            cx = 0.0
        b.x = box.pad.left + cx
        b.y = box.pad.top + cy
        cy += b.h + gap + step_extra


def layout_tree(source: str):
    """Parse and compute full layout. Returns (root LayoutBox, meta dict)."""
    root, meta = parse(source)
    cw, ch = float(meta["w"]), float(meta["h"])
    box = layout_node(root, cw, ch, parent_dir="col")
    box.x, box.y = 0.0, 0.0
    return box, meta


# ════════════════════════════════════════════════════════════════════
#  CHART SVG HELPERS
# ════════════════════════════════════════════════════════════════════

DEFAULT_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b",
                  "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"]


def _parse_data(node: Node) -> list[float]:
    d = node.get("d", "")
    if isinstance(d, (int, float)):
        return [float(d)]
    if isinstance(d, str) and d:
        return [float(x) for x in d.split(",") if x.strip()]
    return []


def _parse_colors(node: Node) -> list[str]:
    c = node.get("colors", "")
    return [x.strip() for x in c.split(",")] if isinstance(c, str) and c else []


def _parse_labels(node: Node) -> list[str]:
    l = node.get("l", "")
    return [x.strip().replace("_", " ") for x in l.split(",")] if isinstance(l, str) and l else []


def _chart_inner(node: Node, w: float, h: float) -> str:
    """Return SVG content (no outer <svg> tag) for a chart."""
    data = _parse_data(node)
    if not data:
        return ""
    chart_type = node.get("type", "line")
    color = node.get("c", "#6366f1")
    colors = _parse_colors(node) or DEFAULT_COLORS
    labels = _parse_labels(node)

    parts: list[str] = []

    if chart_type in ("line", "area", "spark"):
        _svg_line(parts, data, w, h, color,
                  fill_area=(chart_type in ("area", "spark")),
                  show_dots=(chart_type != "spark"),
                  show_grid=(chart_type != "spark"))
    elif chart_type == "bar":
        _svg_bar(parts, data, w, h * 0.88, colors, labels, h)
    elif chart_type in ("pie", "donut"):
        if labels:
            sz = min(w - 100, h) - 10
        else:
            sz = min(w, h) - 10
        sz = max(sz, 40.0)
        _svg_pie(parts, data, sz, colors, labels, donut=(chart_type == "donut"))

    return "".join(parts)


def _svg_line(parts, data, w, h, color, fill_area, show_dots, show_grid):
    mn, mx = min(data), max(data)
    rng = mx - mn if mx != mn else 1.0
    pad = max(8.0, h * 0.06)

    if show_grid:
        for i in range(5):
            gy = pad + (h - 2 * pad) * (1 - i / 4)
            parts.append(f'<line x1="{pad:.1f}" y1="{gy:.1f}" x2="{w - pad:.1f}" y2="{gy:.1f}" '
                         f'stroke="white" stroke-opacity="0.07" stroke-width="1"/>')

    pts = []
    for i, v in enumerate(data):
        px = pad + (i / max(1, len(data) - 1)) * (w - 2 * pad)
        py = pad + (1 - (v - mn) / rng) * (h - 2 * pad)
        pts.append((px, py))

    if fill_area and pts:
        poly = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in pts)
        poly += f" {pts[-1][0]:.1f},{h - pad:.1f} {pts[0][0]:.1f},{h - pad:.1f}"
        parts.append(f'<polygon points="{poly}" fill="{color}" fill-opacity="0.18"/>')

    line = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in pts)
    parts.append(f'<polyline points="{line}" fill="none" stroke="{color}" '
                 f'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>')

    if show_dots:
        for px, py in pts:
            parts.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="3.5" fill="{color}" '
                         f'stroke="white" stroke-opacity="0.3" stroke-width="1.5"/>')


def _svg_bar(parts, data, w, h, colors, labels, total_h):
    mx = max(data) if max(data) > 0 else 1.0
    n = len(data)
    pad_x = 10.0
    bar_area = w - 2 * pad_x
    bar_w = bar_area / n * 0.65
    gap_w = bar_area / n * 0.35

    for i in range(5):
        gy = 10 + (h - 20) * (1 - i / 4)
        parts.append(f'<line x1="{pad_x}" y1="{gy:.1f}" x2="{w - pad_x:.1f}" y2="{gy:.1f}" '
                     f'stroke="white" stroke-opacity="0.07" stroke-width="1"/>')

    for i, v in enumerate(data):
        bx = pad_x + (bar_area / n) * i + gap_w / 2
        bar_h = (v / mx) * (h - 20)
        by = h - 10 - bar_h
        ci = colors[i % len(colors)]
        parts.append(f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bar_w:.1f}" height="{bar_h:.1f}" '
                     f'rx="3" fill="{ci}"/>')
        if labels and i < len(labels):
            lx = bx + bar_w / 2
            parts.append(f'<text x="{lx:.1f}" y="{total_h - 4:.1f}" text-anchor="middle" '
                         f'font-size="11" fill="#94a3b8" font-family="system-ui,sans-serif">'
                         f'{_esc(labels[i])}</text>')


def _svg_pie(parts, data, sz, colors, labels, donut):
    total = sum(data)
    if total == 0:
        return
    cx, cy, r = sz / 2, sz / 2, sz / 2 - 3
    start = -90.0
    slices = []

    for i, v in enumerate(data):
        angle = (v / total) * 360
        end = start + angle
        ci = colors[i % len(colors)]
        sr, er = math.radians(start), math.radians(end)
        x1, y1 = cx + r * math.cos(sr), cy + r * math.sin(sr)
        x2, y2 = cx + r * math.cos(er), cy + r * math.sin(er)
        large = 1 if angle > 180 else 0
        slices.append(f'<path d="M {cx:.1f} {cy:.1f} L {x1:.2f} {y1:.2f} '
                      f'A {r:.1f} {r:.1f} 0 {large} 1 {x2:.2f} {y2:.2f} Z" fill="{ci}"/>')
        start = end

    if donut:
        ir = r * 0.55
        # SVG mask: white=visible, black=transparent — punches a true hole
        mask_id = "dmask"
        parts.append(
            f'<defs><mask id="{mask_id}">'
            f'<rect width="{sz:.1f}" height="{sz:.1f}" fill="white"/>'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{ir:.1f}" fill="black"/>'
            f'</mask></defs>'
            f'<g mask="url(#{mask_id})">'
        )
        parts.extend(slices)
        parts.append('</g>')
    else:
        parts.extend(slices)

    if labels:
        lx = sz + 12
        for i, label in enumerate(labels):
            if i >= len(data):
                break
            ci = colors[i % len(colors)]
            ly = 14 + i * 22
            parts.append(f'<rect x="{lx:.1f}" y="{ly:.1f}" width="10" height="10" rx="2" fill="{ci}"/>')
            parts.append(f'<text x="{lx + 15:.1f}" y="{ly + 9:.1f}" font-size="11" '
                         f'fill="#cbd5e1" font-family="system-ui,sans-serif">{_esc(label)}</text>')


# ════════════════════════════════════════════════════════════════════
#  SVG RENDERER
# ════════════════════════════════════════════════════════════════════

def render_svg(source: str) -> str:
    """Render LMF source to a self-contained SVG string."""
    box, meta = layout_tree(source)
    cw, ch = int(meta["w"]), int(meta["h"])
    bg = meta["bg"]

    defs: list[str] = []
    parts: list[str] = []
    counter = [0]

    _box_to_svg(box, parts, defs, 0.0, 0.0, counter)

    defs_str = "\n  ".join(defs)
    content = "\n".join(parts)

    return (f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'width="{cw}" height="{ch}">\n'
            f'<defs>\n  {defs_str}\n</defs>\n'
            f'<rect width="{cw}" height="{ch}" fill="{bg}"/>\n'
            f'{content}\n'
            f'</svg>')


def _next_id(counter: list[int], prefix: str = "n") -> str:
    counter[0] += 1
    return f"{prefix}{counter[0]}"


def _box_to_svg(box: LayoutBox, parts: list[str], defs: list[str],
                ox: float, oy: float, counter: list[int]):
    """Recursively emit SVG for a layout box.
    ox, oy — absolute position of the parent's top-left corner.
    """
    node = box.node
    ax = ox + box.x   # this box's absolute x
    ay = oy + box.y   # this box's absolute y
    w, h = box.w, box.h

    if w <= 0 or h <= 0:
        return

    # ── Border radius ─────────────────────────────────────────────
    r_raw = node.get("r")
    if r_raw is not None:
        if isinstance(r_raw, str) and "," in r_raw:
            rx = float(r_raw.split(",")[0].strip())  # SVG rx = simplified
        else:
            rx = float(r_raw)
    else:
        rx = 0.0

    # ── Shadow ────────────────────────────────────────────────────
    sh = node.get("sh")
    filter_ref = ""
    if sh:
        fid = _next_id(counter, "f")
        if sh == "sm":
            blur, dx, dy, op = 3, 0, 1, 0.25
        elif sh == "lg":
            blur, dx, dy, op = 15, 0, 5, 0.3
        else:
            blur, dx, dy, op = 6, 0, 2, 0.25
        defs.append(
            f'<filter id="{fid}" x="-30%" y="-30%" width="160%" height="160%">'
            f'<feDropShadow dx="{dx}" dy="{dy}" stdDeviation="{blur}" '
            f'flood-color="black" flood-opacity="{op}"/></filter>')
        filter_ref = f' filter="url(#{fid})"'

    # ── Background rect ───────────────────────────────────────────
    # Av draws its own circle background in _render_content; skip rect for it.
    bg = node.get("bg")
    if bg and bg != "transparent" and node.type != "Av":
        parts.append(f'<rect x="{ax:.2f}" y="{ay:.2f}" width="{w:.2f}" height="{h:.2f}" '
                     f'rx="{rx:.1f}"{filter_ref} fill="{bg}"/>')

    # ── Border ────────────────────────────────────────────────────
    bd = node.get("bd")
    if bd:
        bd_parts = str(bd).split(",")
        try:
            bw = float(bd_parts[0].strip())
            bc = bd_parts[1].strip() if len(bd_parts) > 1 else "#555555"
            if bw > 0 and bc.startswith("#"):
                inset = bw / 2
                parts.append(
                    f'<rect x="{ax + inset:.2f}" y="{ay + inset:.2f}" '
                    f'width="{w - bw:.2f}" height="{h - bw:.2f}" '
                    f'rx="{max(0.0, rx - inset):.1f}" '
                    f'fill="none" stroke="{bc}" stroke-width="{bw}"/>')
        except (ValueError, IndexError):
            pass

    # ── Clip group for border-radius (clips children) ─────────────
    clip_open = ""
    clip_close = ""
    if rx > 0 and (box.children or node.type in ("Bt", "In", "Bd", "Pg", "Av")):
        cid = _next_id(counter, "c")
        defs.append(f'<clipPath id="{cid}">'
                    f'<rect x="{ax:.2f}" y="{ay:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{rx:.1f}"/>'
                    f'</clipPath>')
        clip_open = f'<g clip-path="url(#{cid})">'
        clip_close = '</g>'

    if clip_open:
        parts.append(clip_open)

    # ── Node-type specific content ────────────────────────────────
    _render_content(node, box, parts, defs, ax, ay, w, h, counter)

    # ── Children ──────────────────────────────────────────────────
    for child in box.children:
        _box_to_svg(child, parts, defs, ax, ay, counter)

    if clip_close:
        parts.append(clip_close)


def _txt(x, y, text, fs, color, bold=False, italic=False,
         anchor="start", baseline="central", font_family="system-ui,Segoe UI,Arial,sans-serif"):
    fw = "bold" if bold else "normal"
    fi = "italic" if italic else "normal"
    return (f'<text x="{x:.2f}" y="{y:.2f}" font-size="{fs}" font-weight="{fw}" '
            f'font-style="{fi}" fill="{color}" text-anchor="{anchor}" '
            f'dominant-baseline="{baseline}" font-family="{font_family}">'
            f'{_esc(text)}</text>')


def _render_content(node: Node, box: LayoutBox, parts: list[str], defs: list[str],
                    ax: float, ay: float, w: float, h: float, counter: list[int]):
    t = node.type

    if t == "T":
        fs = node.get_f("s", 14)
        c = node.get("c", "#e2e8f0")
        bold = bool(node.get("b"))
        italic = bool(node.get("i"))
        al = node.get("al", "start")
        anchor = {"center": "middle", "right": "end"}.get(al, "start")
        tx = {"center": ax + w / 2, "right": ax + w}.get(al, ax)
        ty = ay + h / 2
        parts.append(_txt(tx, ty, node.text, fs, c, bold, italic, anchor))

    elif t == "Dv":
        dc = node.get("c", "#334155")
        my = ay + h / 2
        parts.append(f'<line x1="{ax:.2f}" y1="{my:.2f}" x2="{ax + w:.2f}" y2="{my:.2f}" '
                     f'stroke="{dc}" stroke-width="1"/>')

    elif t == "Av":
        sz = node.get_f("s", 40)
        abg = node.get("bg", "#6366f1")
        ac = node.get("c", "#ffffff")
        cx, cy, r = ax + w / 2, ay + h / 2, sz / 2
        parts.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="{abg}"/>')
        parts.append(_txt(cx, cy, (node.text or "?")[:2].upper(),
                          sz * 0.4, ac, bold=True, anchor="middle"))

    elif t == "Bt":
        btn_c = node.get("c", "#ffffff")
        btn_s = node.get_f("s", 14)
        btn_bg = node.get("bg", "#6366f1")
        btn_r = node.get_f("r", 8)
        is_outline = node.get("outline", False)
        if is_outline:
            parts.append(f'<rect x="{ax:.2f}" y="{ay:.2f}" width="{w:.2f}" height="{h:.2f}" '
                         f'rx="{btn_r}" fill="none" stroke="{btn_bg}" stroke-width="1.5"/>')
            btn_c = btn_bg
        parts.append(_txt(ax + w / 2, ay + h / 2, node.text,
                          btn_s, btn_c, bold=bool(node.get("b")), anchor="middle"))

    elif t == "In":
        in_c = node.get("c", "#64748b")
        in_s = node.get_f("s", 14)
        parts.append(_txt(ax + 12, ay + h / 2, node.text, in_s, in_c))

    elif t == "Bd":
        bd_c = node.get("c", "#94a3b8")
        bd_s = node.get_f("s", 12)
        parts.append(_txt(ax + w / 2, ay + h / 2, node.text,
                          bd_s, bd_c, bold=True, anchor="middle"))

    elif t == "Ic":
        name = node.get("name", "star")
        ic_s = node.get_f("s", 20)
        ic_c = node.get("c", "#94a3b8")
        inner = ICON_SVG.get(name, ICON_SVG["star"])
        scale = ic_s / 24.0
        ix = ax + (w - ic_s) / 2
        iy = ay + (h - ic_s) / 2
        parts.append(f'<g transform="translate({ix:.2f},{iy:.2f}) scale({scale:.4f})" '
                     f'color="{ic_c}" style="color:{ic_c}">{inner}</g>')

    elif t == "Pg":
        pg_bg = node.get("bg", "#1e293b")
        pg_c = node.get("c", "#6366f1")
        pg_r = node.get_f("r", 4)
        pct = node.get_f("pct", 50)
        # Background rect is drawn above; draw fill on top
        fill_w = max(0.0, w * pct / 100)
        parts.append(f'<rect x="{ax:.2f}" y="{ay:.2f}" width="{fill_w:.2f}" height="{h:.2f}" '
                     f'rx="{pg_r}" fill="{pg_c}"/>')

    elif t == "Im":
        # Placeholder image icon
        ic_x = ax + w / 2 - 24
        ic_y = ay + h / 2 - 24
        parts.append(
            f'<rect x="{ic_x:.1f}" y="{ic_y:.1f}" width="48" height="48" rx="2" '
            f'fill="none" stroke="#475569" stroke-width="1.5"/>'
            f'<circle cx="{ic_x + 14:.1f}" cy="{ic_y + 14:.1f}" r="4" fill="#475569"/>'
            f'<path d="M {ic_x:.1f} {ic_y + 36:.1f} L {ic_x + 14:.1f} {ic_y + 22:.1f} '
            f'L {ic_x + 28:.1f} {ic_y + 32:.1f} L {ic_x + 36:.1f} {ic_y + 20:.1f} '
            f'L {ic_x + 48:.1f} {ic_y + 36:.1f} Z" fill="#475569" fill-opacity="0.5"/>')

    elif t == "Ch":
        inner = _chart_inner(node, w, h)
        if inner:
            parts.append(f'<svg x="{ax:.2f}" y="{ay:.2f}" width="{w:.2f}" height="{h:.2f}" '
                         f'overflow="hidden">{inner}</svg>')


# ════════════════════════════════════════════════════════════════════
#  HTML OUTPUT
# ════════════════════════════════════════════════════════════════════

def render_html(source: str) -> str:
    """Render LMF source to a self-contained HTML file (open in any browser)."""
    root, meta = parse(source)
    cw, ch, bg = meta["w"], meta["h"], meta["bg"]
    body_html = _node_html(root, parent_dir="col")
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
html{{background:{bg}}}
body{{font-family:'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;
color:#e2e8f0;-webkit-font-smoothing:antialiased;overflow-x:hidden}}
#lmf-canvas{{width:{cw}px;min-height:{ch}px;display:flex;flex-direction:column;
transform-origin:top left;background:{bg}}}
</style></head>
<body>
<div id="lmf-canvas">{body_html}</div>
<script>
(function(){{
  var el=document.getElementById('lmf-canvas');
  function fit(){{
    var s=window.innerWidth/{cw};
    el.style.transform='scale('+s+')';
    document.body.style.height=Math.ceil(s*el.scrollHeight)+'px';
  }}
  fit();
  window.addEventListener('resize',fit);
}})();
</script>
</body></html>"""


def _node_html(node: Node, parent_dir: str = "col") -> str:
    s = {}

    if node.type in ("R", "Tr"):
        s["display"] = "flex"
        s["flex-direction"] = "row"
    elif node.type in ("C", "Tb", "Td", "St", "B"):
        s["display"] = "flex"
        s["flex-direction"] = "column"

    w = node.get("w")
    h = node.get("h")

    if w == "flex":
        if parent_dir == "row":
            s["flex"] = "1"; s["min-width"] = "0"
        else:
            s["width"] = "100%"
    elif isinstance(w, (int, float)):
        s["width"] = f"{w}px"
    elif isinstance(w, str) and w.endswith("%"):
        s["width"] = w

    if h == "flex":
        if parent_dir == "col":
            s["flex"] = "1"; s["min-height"] = "0"
        else:
            s["align-self"] = "stretch"
    elif isinstance(h, (int, float)):
        s["height"] = f"{h}px"

    p = node.get("p")
    if p is not None and p != 0:
        pad = _parse_pad(p)
        s["padding"] = f"{pad.top}px {pad.right}px {pad.bottom}px {pad.left}px"

    m = node.get("m")
    if m is not None and m != 0:
        mpad = _parse_pad(m)
        s["margin"] = f"{mpad.top}px {mpad.right}px {mpad.bottom}px {mpad.left}px"

    g = node.get("g")
    if g is not None:
        s["gap"] = f"{g}px"

    bg = node.get("bg")
    if bg and bg != "transparent":
        s["background"] = bg

    c = node.get("c")
    if c:
        s["color"] = c

    fs = node.get("s")
    if fs is not None:
        s["font-size"] = f"{fs}px"
    if node.get("b"):
        s["font-weight"] = "700"
    if node.get("i"):
        s["font-style"] = "italic"

    r = node.get("r")
    if r is not None:
        if isinstance(r, str) and "," in r:
            s["border-radius"] = " ".join(f"{v.strip()}px" for v in r.split(","))
        else:
            s["border-radius"] = f"{r}px"

    bd = node.get("bd")
    if bd:
        parts = str(bd).split(",")
        try:
            bw = float(parts[0].strip())
            bc = parts[1].strip() if len(parts) > 1 else "#555"
            if bw > 0 and bc.startswith("#"):
                s["border"] = f"{bw}px solid {bc}"
        except (ValueError, IndexError):
            pass

    sh = node.get("sh")
    if sh:
        shadows = {"sm": "0 1px 3px rgba(0,0,0,0.3)", True: "0 4px 6px rgba(0,0,0,0.3)",
                   "lg": "0 10px 15px rgba(0,0,0,0.3)"}
        s["box-shadow"] = shadows.get(sh, shadows[True])

    al = node.get("al")
    if al:
        s["align-items"] = {"start": "flex-start", "end": "flex-end"}.get(al, al)

    jc = node.get("jc")
    if jc:
        s["justify-content"] = {"start": "flex-start", "end": "flex-end",
                                  "between": "space-between", "around": "space-around"}.get(jc, jc)

    inner = ""
    t = node.type
    child_dir = "row" if t in ("R", "Tr") else "col"

    if t == "T":
        al_text = node.get("al")
        if al_text in ("center", "right"):
            s["text-align"] = al_text
        if node.get("wrap"):
            s["white-space"] = "normal"
            s["word-break"] = "break-word"
        else:
            s["white-space"] = "nowrap"
        inner = _esc(node.text)

    elif t == "Dv":
        s.update({"width": "100%", "height": "1px",
                  "background": node.get("c", "#334155"), "flex-shrink": "0"})

    elif t == "Av":
        sz = int(node.get_f("s", 40))
        s.update({"width": f"{sz}px", "height": f"{sz}px", "min-width": f"{sz}px",
                  "border-radius": "50%", "background": node.get("bg", "#6366f1"),
                  "color": node.get("c", "#ffffff"), "display": "flex",
                  "align-items": "center", "justify-content": "center",
                  "font-size": f"{int(sz * 0.4)}px", "font-weight": "700",
                  "flex-shrink": "0", "line-height": "1"})
        inner = _esc((node.text or "?")[:2].upper())

    elif t == "Bt":
        btn_bg = node.get("bg", "#6366f1")
        btn_r = node.get_f("r", 8)
        btn_s = node.get_f("s", 14)
        is_outline = node.get("outline", False)
        s.update({"display": "flex", "align-items": "center", "justify-content": "center",
                  "padding": s.get("padding", "8px 16px"), "border-radius": f"{btn_r}px",
                  "font-size": f"{btn_s}px", "font-weight": "600",
                  "cursor": "pointer", "white-space": "nowrap", "flex-shrink": "0"})
        if is_outline:
            s["border"] = f"1.5px solid {btn_bg}"; s["color"] = btn_bg; s["background"] = "transparent"
        else:
            s["background"] = btn_bg; s["color"] = node.get("c", "#ffffff"); s["border"] = "none"
        inner = _esc(node.text)

    elif t == "Bd":
        s.update({"display": "inline-flex", "align-items": "center", "justify-content": "center",
                  "padding": "2px 10px", "border-radius": f"{node.get_f('r', 9999)}px",
                  "background": node.get("bg", "#1e293b"), "color": node.get("c", "#94a3b8"),
                  "font-size": f"{node.get_f('s', 12)}px", "font-weight": "600",
                  "white-space": "nowrap", "flex-shrink": "0"})
        inner = _esc(node.text)

    elif t == "In":
        in_bg = node.get("bg", "#0f172a")
        in_bd = str(node.get("bd", "1,#334155")).split(",")
        bw = in_bd[0].strip(); bc = in_bd[1].strip() if len(in_bd) > 1 else "#334155"
        s.update({"display": "flex", "align-items": "center", "padding": "8px 12px",
                  "border-radius": f"{node.get_f('r', 8)}px", "background": in_bg,
                  "color": node.get("c", "#64748b"), "font-size": f"{node.get_f('s', 14)}px",
                  "border": f"{bw}px solid {bc}"})
        if w == "flex":
            s["flex"] = "1"; s["min-width"] = "0"
        elif not isinstance(w, (int, float)):
            s["width"] = "100%"
        inner = _esc(node.text)

    elif t == "Ic":
        ic_s = int(node.get_f("s", 20))
        ic_c = node.get("c", "#94a3b8")
        s.update({"display": "flex", "align-items": "center", "justify-content": "center",
                  "flex-shrink": "0", "width": f"{ic_s}px", "height": f"{ic_s}px"})
        inner_path = ICON_SVG.get(node.get("name", "star"), ICON_SVG["star"])
        inner = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{ic_s}" height="{ic_s}" '
                 f'viewBox="0 0 24 24" style="color:{ic_c}">{inner_path}</svg>')

    elif t == "Ch":
        s["overflow"] = "hidden"
        if w == "flex": s["flex"] = "1"; s["min-width"] = "0"
        if h == "flex": s["flex"] = "1"; s["min-height"] = "0"
        ch_w = "100%" if (w == "flex" or w is None) else (f"{w}px" if isinstance(w, (int, float)) else "100%")
        ch_h = "100%" if h == "flex" else (f"{h}px" if isinstance(h, (int, float)) else "200px")
        inner = _chart_html_svg(node, ch_w, ch_h)

    elif t == "Pg":
        pct = node.get_f("pct", 50)
        pg_c = node.get("c", "#6366f1")
        pg_r = node.get_f("r", 4)
        pg_h = node.get_f("h", 8)
        s.update({"width": "100%", "height": f"{pg_h}px",
                  "background": node.get("bg", "#1e293b"),
                  "border-radius": f"{pg_r}px", "overflow": "hidden", "flex-shrink": "0"})
        inner = f'<div style="width:{pct}%;height:100%;background:{pg_c};border-radius:{pg_r}px"></div>'

    elif t == "Im":
        s.update({"display": "flex", "align-items": "center", "justify-content": "center",
                  "overflow": "hidden", "flex-shrink": "0",
                  "background": node.get("bg", "#1e293b"),
                  "border-radius": f"{node.get_f('r', 8)}px"})
        if not isinstance(w, (int, float)) and w != "flex": s["width"] = "200px"
        if not isinstance(h, (int, float)) and h != "flex": s["height"] = "150px"
        inner = ('<svg width="48" height="48" viewBox="0 0 24 24" style="color:#475569">'
                 '<rect x="2" y="2" width="20" height="20" rx="2" stroke="currentColor" '
                 'stroke-width="1.5" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>'
                 '<path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>')

    css = ";".join(f"{k}:{v}" for k, v in s.items() if v is not None)
    children_html = "".join(_node_html(child, child_dir) for child in node.children)
    return f'<div style="{css}">{inner}{children_html}</div>'


def _chart_html_svg(node: Node, w_css: str, h_css: str) -> str:
    data = _parse_data(node)
    if not data:
        return ""
    chart_type = node.get("type", "line")
    color = node.get("c", "#6366f1")
    colors = _parse_colors(node) or DEFAULT_COLORS
    labels = _parse_labels(node)
    vw, vh = 400, 200
    parts = [f'<svg viewBox="0 0 {vw} {vh}" preserveAspectRatio="none" '
             f'style="width:{w_css};height:{h_css};display:block">']
    if chart_type in ("line", "area", "spark"):
        _svg_line(parts, data, vw, vh, color,
                  fill_area=(chart_type in ("area", "spark")),
                  show_dots=(chart_type != "spark"),
                  show_grid=(chart_type != "spark"))
    elif chart_type == "bar":
        parts[0] = (f'<svg viewBox="0 0 {vw} {vh + 30}" preserveAspectRatio="xMidYMid meet" '
                    f'style="width:{w_css};height:{h_css};display:block">')
        _svg_bar(parts, data, vw, vh, colors, labels, vh + 30)
    elif chart_type in ("pie", "donut"):
        sz = 200
        parts[0] = (f'<svg viewBox="0 0 {sz + 120} {sz}" preserveAspectRatio="xMidYMid meet" '
                    f'style="width:{w_css};height:{h_css};display:block">')
        _svg_pie(parts, data, sz, colors, labels, donut=(chart_type == "donut"))
    parts.append("</svg>")
    return "".join(parts)


# ════════════════════════════════════════════════════════════════════
#  PNG OUTPUT
# ════════════════════════════════════════════════════════════════════

def render_png(source: str, output: str, scale: int = 1):
    """Render LMF to PNG via cairosvg (pip install cairosvg)."""
    svg = render_svg(source)

    try:
        import cairosvg
    except ImportError as e:
        # Check if it's actually cairosvg missing or a dependency issue
        error_msg = str(e).lower()
        if "cairosvg" in error_msg:
            raise RuntimeError("cairosvg not installed. Install with: pip install cairosvg")
        else:
            # Likely a DLL loading issue (e.g., pyexpat)
            raise RuntimeError(f"cairosvg dependency error: {e}. Try reinstalling Python or installing Visual C++ Redistributables")
    except Exception as e:
        # Catch other import errors like DLL load failures
        raise RuntimeError(f"Failed to load cairosvg: {e}. This may be a Python installation issue. Try: pip install --force-reinstall cairosvg")

    cairosvg.svg2png(
        bytestring=svg.encode("utf-8"),
        write_to=output,
        scale=scale,
    )


# ════════════════════════════════════════════════════════════════════
#  CLI
# ════════════════════════════════════════════════════════════════════

def main():
    import argparse
    ap = argparse.ArgumentParser(description="LMF — LLM Markup Format renderer")
    sub = ap.add_subparsers(dest="cmd")

    rp = sub.add_parser("render", help="Render .lmf file")
    rp.add_argument("input", help="Input .lmf file")
    rp.add_argument("-o", "--output", help="Output file (.png, .svg, or .html)")
    rp.add_argument("--scale", type=int, default=2, help="Scale for PNG (default: 2)")

    vp = sub.add_parser("validate", help="Validate .lmf syntax")
    vp.add_argument("input")

    sub.add_parser("version")

    args = ap.parse_args()

    if args.cmd == "version":
        print("LMF renderer v3.1.0 (SVG engine + HTML output)")
        return

    if args.cmd == "validate":
        src = Path(args.input).read_text(encoding="utf-8")
        try:
            root, meta = parse(src)
            print(f"Valid: {meta['w']}x{meta['h']}, {_count_nodes(root)} nodes")
        except Exception as e:
            print(f"Invalid: {e}", file=sys.stderr)
            sys.exit(1)
        return

    if args.cmd == "render":
        src = Path(args.input).read_text(encoding="utf-8")

        # Special case: output to stdout
        if args.output == "-" or not args.output:
            svg = render_svg(src)
            print(svg, end="")
        elif args.output.endswith(".png"):
            render_png(src, args.output, scale=args.scale)
            print(f"Rendered PNG: {args.output}", file=sys.stderr)
        elif args.output.endswith(".html"):
            html = render_html(src)
            Path(args.output).write_text(html, encoding="utf-8")
            print(f"Rendered HTML: {args.output}", file=sys.stderr)
        else:
            svg = render_svg(src)
            Path(args.output).write_text(svg, encoding="utf-8")
            print(f"Rendered SVG: {args.output}", file=sys.stderr)
        return

    ap.print_help()


def _count_nodes(node: Node) -> int:
    return 1 + sum(_count_nodes(c) for c in node.children)


if __name__ == "__main__":
    main()

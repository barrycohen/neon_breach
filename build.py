#!/usr/bin/env python3
"""Bundle the game into a deployable folder.

  dist/index.html    the whole game in one page: scripts (Three.js included),
                     styles and levels
  dist/assets/       the optional glTF models it loads beside it

dist/ is what gets published (GitHub Pages deploys it). index.html also runs
opened straight from disk, falling back to its built-in models.

The JS is a set of ES modules. They are flattened here by a small bundler:
dependency-ordered concatenation with import/export lines stripped. That is only
safe because no two modules declare the same top-level name - verified below.
"""
import pathlib, re, shutil, sys

root = pathlib.Path(__file__).resolve().parent
jsdir = root / "js"
ENTRY = "main"

IMPORT_RE = re.compile(r"^import\s[\s\S]*?from\s*'\./([\w.]+)\.js';[ \t]*\n?", re.M)
EXPORT_LIST_RE = re.compile(r"^export\s*\{[^}]*\};\s*$", re.M)
EXPORT_KW_RE = re.compile(r"^export\s+(const|let|var|function|class)\b", re.M)
DECL_RE = re.compile(r"^(?:(?:function|class)\s+([A-Za-z_$][\w$]*)|(const|let|var)\s+)", re.M)
IDENT_RE = re.compile(r"[A-Za-z_$][\w$]*")

def top_names(body):
    """Every top-level name a module declares - all of a `const a=1, b=2;` list,
    not just the first."""
    for m in DECL_RE.finditer(body):
        if m.group(1):
            yield m.group(1); continue
        i, depth, want = m.end(), 0, True
        while i < len(body):
            ch = body[i]
            if want:
                n = IDENT_RE.match(body, i)
                if n: yield n.group(0); i = n.end(); want = False; continue
                if ch in ' \t\n': i += 1; continue
                want = False          # destructuring: not used at top level here
            if ch in '\'"`':
                q, i = ch, i + 1
                while i < len(body) and body[i] != q: i += 2 if body[i] == '\\' else 1
            elif ch in '([{': depth += 1
            elif ch in ')]}': depth -= 1
            elif depth == 0 and ch == ',': want = True
            elif depth == 0 and ch == ';': break
            elif depth == 0 and ch == '\n' and not body[:i].rstrip().endswith((',', '=')): break
            i += 1

def read(mod):
    f = jsdir / (mod + ".js")
    if not f.exists():
        sys.exit("build failed: missing module %s" % f)
    return f.read_text()

# ---- emission order ----
# Explicit rather than topological: several modules reference each other at call
# time (weapons <-> enemies, hud <-> player), which ES modules resolve fine but a
# flat concatenation cannot sort. This order satisfies every *load-time* need.
order = ["util", "state", "audio", "render", "textures", "kit", "models", "assets",
         "world", "fx", "hud", "player", "weapons", "enemies", "pickups", "gaze", "authority", "ending", "level", "endless",
         "ui", "campaign", "main"]
# ---- development-only modules ----
# These exist for working on the game and must never reach a player. They are
# not emitted, and the call sites that use them are stripped below. Keeping the
# list explicit means a new dev module fails the build until it is declared,
# rather than being shipped by accident.
DEV_ONLY = {"devtools"}

present = {f.stem for f in jsdir.glob("*.js")} - DEV_ONLY
missing = present - set(order)
if missing:
    sys.exit("build failed: module(s) not in emission order: %s" % ", ".join(sorted(missing)))
for mod in order:
    if mod not in present:
        sys.exit("build failed: %s.js listed in order but not on disk" % mod)

# ---- collision check: flattening is only valid with unique top-level names ----
owner = {}
for mod in order:
    body = EXPORT_KW_RE.sub(r"\1", IMPORT_RE.sub("", read(mod)))
    for name in top_names(body):
        if name in owner:
            sys.exit("build failed: '%s' declared in both %s and %s"
                     % (name, owner[name], mod))
        owner[name] = mod

ALIAS_RE = re.compile(r"\bas\b")
for mod in order:
    for line in read(mod).split("\n"):
        if line.startswith("import ") and ALIAS_RE.search(line):
            sys.exit("build failed: %s.js uses an aliased import, which flattening "
                     "cannot resolve:\n  %s" % (mod, line.strip()))

chunks = []
for mod in order:
    body = read(mod)
    body = IMPORT_RE.sub("", body)
    body = EXPORT_LIST_RE.sub("", body)
    body = EXPORT_KW_RE.sub(r"\1", body)
    chunks.append("/* ---- %s.js ---- */\n%s" % (mod, body.strip()))

# ---- embed the campaign levels ----
# The source page fetches levels/<id>.json. The bundle carries them inside it
# instead, and campaign.js prefers the embedded copy.
import json as _json
_levels = {}
for _p in sorted((root / "levels").glob("*.json")):
    _levels[_p.stem] = _json.loads(_p.read_text())
levels_js = "const EMBEDDED_LEVELS = " + _json.dumps(_levels, separators=(",", ":")) + ";\n"

js = "(function(){\n'use strict';\n" + levels_js + "\n\n".join(chunks) + "\n})();\n"

# ---- development mode off: no URL flags, no dev tools ----
if js.count("const DEV=true;") != 1:
    sys.exit("build failed: util.js's `const DEV=true;` not found exactly once")
js = js.replace("const DEV=true;", "const DEV=false;")
import re as _re
js = _re.sub(r"^\s*initDevTools\(\);.*$", "", js, flags=_re.M)
for _name in ("initDevTools", "devtools", "GOD: ON", "1-SHOT", "devpanel"):
    if _name in js:
        sys.exit("build failed: %r reached the bundle - dev code must not ship" % _name)

html = (root / "index.html").read_text()
css = (root / "css" / "game.css").read_text()
link = '<link rel="stylesheet" href="css/game.css">'
script = '<script type="module" src="js/main.js"></script>'
for needle in (link, script):
    if needle not in html:
        sys.exit("build failed: %s not found in index.html" % needle)

bundled = html.replace(link, "<style>\n" + css + "</style>")
bundled = bundled.replace(script, "<script>\n" + js + "</script>")

# ---- Three.js inlined too: the published game loads nothing from a CDN ----
VENDOR_RE = re.compile(r'<script src="(vendor/[\w/.-]+\.js)"></script>')
def inline_vendor(m):
    code = (root / m.group(1)).read_text()
    # inside a <script> element, "</script" would end it early
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"
bundled, n = VENDOR_RE.subn(inline_vendor, bundled)
if n == 0:
    sys.exit("build failed: no vendor/ scripts found in index.html")
if re.search(r'<script[^>]+src=', bundled):
    sys.exit("build failed: a <script src> survived bundling - the build must be self-contained")

dist = root / "dist"
if dist.exists():
    shutil.rmtree(dist)
dist.mkdir()
(dist / "index.html").write_text(bundled)
shutil.copytree(root / "assets", dist / "assets")

print("module order: " + " -> ".join(order))
print("dist/index.html  %7.1f KB" % ((dist / "index.html").stat().st_size / 1024))
print("dist/assets/     %d models" % len(list((dist / "assets").glob("*.glb"))))

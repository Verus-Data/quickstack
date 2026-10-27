#!/usr/bin/env bash
# Screenshot the booted iOS simulator, and print the colour at three points down
# the middle of the screen.
#
# The colour is the point: a screen that looks blank is usually not blank, it is
# a screen whose content drew nothing visible. Reading back React Navigation's
# default theme background (DefaultTheme.colors.background in the installed
# package) means a navigator is mounted and the
# screen inside it rendered nothing, a very different bug from a crash.
# Compare against the app's own page background token in src/global.css.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-.logs/sim.png}"
mkdir -p "$(dirname "$OUT")"

xcrun simctl io booted screenshot "$OUT" >/dev/null
echo "$OUT"

# Not silenced: a machine without Pillow has to say so rather than print nothing
# and look like a screen with no answer.
python3 - "$OUT" <<'EOF'
import sys
try:
    from PIL import Image
except ImportError:
    print("no colour readout: pip3 install Pillow", file=sys.stderr)
    sys.exit(0)
im = Image.open(sys.argv[1]).convert("RGB")
w, h = im.size
for label, y in (("upper", 0.25), ("middle", 0.5), ("lower", 0.8)):
    r, g, b = im.getpixel((w // 2, int(h * y)))
    print(f"{label:>6}: #{r:02x}{g:02x}{b:02x}")
EOF

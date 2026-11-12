#!/usr/bin/env sh
# Offline basemap setup (architecture §16, decision O-11, approved 2026-11-12).
#
# Cuts a western-India region out of a pinned Protomaps OpenStreetMap build and writes it to
# apps/api/static/basemap/western-india.pmtiles (outside Git). The API serves it at /tiles with HTTP
# Range support; after this one-time download the map needs no network.
#
# Data: © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright), built by
# Protomaps (https://protomaps.com). Natural Earth (public domain) at low zoom.
#
# Requires the PMTiles CLI (`pmtiles`), e.g. `brew install pmtiles`, or a release binary from
# https://github.com/protomaps/go-pmtiles/releases. Overrides (optional):
#   BASEMAP_BUILD    Protomaps build date YYYYMMDD (pinned below; daily builds are kept 1 week,
#                    Monday builds 1 month, then the last build of each basemap version)
#   BASEMAP_MAXZOOM  highest zoom level in the extract (each level roughly doubles the size)
#   BASEMAP_DIR      output folder (absolute path; the API reads the same variable)
#
# Also fetches one glyph range (Latin, 0-255) of Noto Sans Regular — SIL Open Font License, see
# glyphs/OFL.txt — from Protomaps' basemaps-assets at a pinned commit, for the city-name labels.
# `npm run basemap:fetch -- --glyphs-only` fetches only the glyphs (keeps the existing tiles).
set -eu

BUILD="${BASEMAP_BUILD:-20261109}"
# West, south, east, north — keep in sync with BASEMAP_BOUNDS in apps/web/src/map/basemap.ts.
BBOX="71.0,16.5,80.5,24.5"
MAXZOOM="${BASEMAP_MAXZOOM:-12}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${BASEMAP_DIR:-$ROOT/apps/api/static/basemap}"
OUT="$OUT_DIR/western-india.pmtiles"
SOURCE="https://build.protomaps.com/${BUILD}.pmtiles"
ASSETS_COMMIT="75683e9ca4b77b4b6b294628aac611f3c0dc509b"
ASSETS="https://raw.githubusercontent.com/protomaps/basemaps-assets/${ASSETS_COMMIT}"
GLYPH_DIR="$OUT_DIR/glyphs/Noto Sans Regular"

fetch_glyphs() {
  mkdir -p "$GLYPH_DIR"
  curl -fsSL -o "$GLYPH_DIR/0-255.pbf" "$ASSETS/fonts/Noto%20Sans%20Regular/0-255.pbf"
  curl -fsSL -o "$OUT_DIR/glyphs/OFL.txt" "$ASSETS/fonts/OFL.txt"
  printf '%s\n' "glyphs=Noto Sans Regular 0-255 commit=$ASSETS_COMMIT licence=OFL-1.1" > "$OUT_DIR/glyphs/SOURCE.txt"
  shasum -a 256 "$GLYPH_DIR/0-255.pbf"
}

if [ "${1:-}" = "--glyphs-only" ]; then
  fetch_glyphs
  echo "Glyphs done."
  exit 0
fi

if ! command -v pmtiles >/dev/null 2>&1; then
  echo "The PMTiles CLI is not installed. Install it (e.g. 'brew install pmtiles') and run again." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
echo "Extracting bbox $BBOX, zoom 0-$MAXZOOM from Protomaps build $BUILD ..."
pmtiles extract "$SOURCE" "$OUT.tmp" --bbox="$BBOX" --maxzoom="$MAXZOOM"
mv "$OUT.tmp" "$OUT"
printf '%s\n' "build=$BUILD bbox=$BBOX maxzoom=$MAXZOOM source=$SOURCE" > "$OUT_DIR/SOURCE.txt"
pmtiles show "$OUT"
ls -lh "$OUT"
shasum -a 256 "$OUT"
fetch_glyphs
echo "Done. Restart the API if it is running; the map uses the basemap on the next page load."

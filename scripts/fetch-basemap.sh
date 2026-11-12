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
set -eu

BUILD="${BASEMAP_BUILD:-20261109}"
# West, south, east, north — keep in sync with BASEMAP_BOUNDS in apps/web/src/map/basemap.ts.
BBOX="71.0,16.5,80.5,24.5"
MAXZOOM="${BASEMAP_MAXZOOM:-11}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${BASEMAP_DIR:-$ROOT/apps/api/static/basemap}"
OUT="$OUT_DIR/western-india.pmtiles"
SOURCE="https://build.protomaps.com/${BUILD}.pmtiles"

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
echo "Done. Restart the API if it is running; the map uses the basemap on the next page load."

#!/usr/bin/env bash
# Updates every yt-dlp install found on this machine to the latest version.
#
# Why this exists: multiple Python environments (pyenv, miniforge, homebrew,
# pip --user, ...) can each have their own yt-dlp, and the native messaging
# host may pick whichever one it happens to find first. If only one gets
# updated, the stale one can still be used, causing "HTTP Error 403: Forbidden"
# or other extractor errors that look "fixed" but come back later.
#
# Run this whenever downloads start failing with 403/format errors.

set -uo pipefail

echo "Looking for yt-dlp installs..."

CANDIDATES=(
    "/opt/homebrew/bin/pip3"
    "/usr/local/bin/pip3"
    "$HOME/.local/bin/pip3"
    "$HOME/miniforge3/bin/pip"
    "$HOME/miniforge/bin/pip"
    "$HOME/miniconda3/bin/pip"
    "$HOME/miniconda/bin/pip"
    "$HOME/anaconda3/bin/pip"
    "$HOME/anaconda/bin/pip"
)

# Add every pyenv Python version's pip, since yt-dlp there is often installed
# per-version rather than via the shim.
if [ -d "$HOME/.pyenv/versions" ]; then
    for v in "$HOME/.pyenv/versions"/*/bin/pip3; do
        [ -x "$v" ] && CANDIDATES+=("$v")
    done
fi

updated=0
for pip_bin in "${CANDIDATES[@]}"; do
    [ -x "$pip_bin" ] || continue
    ytdlp_bin="$(dirname "$pip_bin")/yt-dlp"
    [ -x "$ytdlp_bin" ] || continue

    before="$("$ytdlp_bin" --version 2>/dev/null)"
    echo "Updating $ytdlp_bin (currently $before)..."
    "$pip_bin" install --upgrade yt-dlp --quiet
    after="$("$ytdlp_bin" --version 2>/dev/null)"
    echo "  -> $after"
    updated=$((updated + 1))
done

if [ "$updated" -eq 0 ]; then
    echo "No yt-dlp installs found via pip. If yt-dlp was installed another way"
    echo "(e.g. brew install yt-dlp), run: brew upgrade yt-dlp"
    exit 1
fi

echo "Done. Updated $updated yt-dlp install(s)."

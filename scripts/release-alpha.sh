#!/usr/bin/env bash
# Cut an alpha/beta pre-release of the Tauri app: bump app-tauri's version,
# run the same checks CI runs, commit, push the current branch, then tag and
# push — which triggers .github/workflows/release-tauri.yml's tag-push path
# to build the Tauri bundles and publish them as a GitHub pre-release.
#
# Unlike scripts/release.sh (stable releases, main-only), this is meant to
# run from whatever branch the Tauri work currently lives on (e.g. `tauri`)
# and does not touch RELEASENOTES.md or the main bookmark.
#
# Usage: scripts/release-alpha.sh <version> [--yes] [--dry-run] [--bookmark <name>]
#   <version>        New version, e.g. 2.0.0-alpha.1 or 2.0.0-beta.3 (no leading "v")
#   --yes, -y        Skip the confirmation prompt before pushing/tagging
#   --dry-run        Do everything except the final push/tag — leaves a
#                     described commit and a locally-moved bookmark you can
#                     inspect (or undo) before pushing anything
#   --bookmark <name> jj bookmark to move and push (default: autodetected —
#                     the one bookmark currently pointing at @-, i.e. the
#                     branch you're working on)
#
# Must be run with a clean jj working copy (no pending uncommitted changes).
set -euo pipefail

usage() {
    cat <<'EOF'
Usage: scripts/release-alpha.sh <version> [--yes] [--dry-run] [--bookmark <name>]

  <version>         e.g. 2.0.0-alpha.1 or 2.0.0-beta.3 (no leading "v")
  --yes, -y         Skip the confirmation prompt before pushing/tagging
  --dry-run         Do everything except the final push/tag
  --bookmark <name> jj bookmark to move and push (default: autodetected)

Must be run with a clean jj working copy (no pending uncommitted changes).
EOF
    exit 1
}

version=""
assume_yes=0
dry_run=0
bookmark=""
while [ $# -gt 0 ]; do
    case "$1" in
        -y | --yes) assume_yes=1 ;;
        --dry-run) dry_run=1 ;;
        --bookmark)
            shift
            [ $# -gt 0 ] || usage
            bookmark="$1"
            ;;
        -h | --help) usage ;;
        -*)
            echo "error: unknown option: $1" >&2
            usage
            ;;
        *)
            if [ -n "$version" ]; then
                echo "error: unexpected argument: $1" >&2
                usage
            fi
            version="$1"
            ;;
    esac
    shift
done
[ -n "$version" ] || usage

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-(alpha|beta)\.[0-9]+$ ]]; then
    echo "error: version must look like X.Y.Z-alpha.N or X.Y.Z-beta.N (got: $version)" >&2
    exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."
repo_root="$PWD"

if [ ! -f app-tauri/Cargo.toml ]; then
    echo "error: expected to find app-tauri/Cargo.toml at $repo_root" >&2
    exit 1
fi

for tool in jj git cargo jq; do
    command -v "$tool" >/dev/null 2>&1 || {
        echo "error: $tool is required" >&2
        exit 1
    }
done

# Same rationale as scripts/release.sh: refuse to fold unrelated in-progress
# work into the release commit.
if [ "$(jj log -r @ --no-graph -T 'if(empty, "empty", "not-empty")' 2>/dev/null)" != "empty" ]; then
    echo "error: the current commit has changes — describe it, then run 'jj new' for a fresh one, before releasing:" >&2
    jj diff --stat >&2
    exit 1
fi

if [ -z "$bookmark" ]; then
    # Autodetect: the bookmark(s) pointing at @- (the branch this empty
    # working-copy commit sits on top of) is almost certainly the one meant
    # to be released — unlike scripts/release.sh, there's no single fixed
    # branch name (main) to fall back on here.
    candidates="$(jj log -r 'bookmarks() & @-' --no-graph -T 'bookmarks ++ "\n"' 2>/dev/null | sort -u)"
    candidate_count="$(printf '%s\n' "$candidates" | grep -c . || true)"
    if [ "$candidate_count" -eq 1 ]; then
        bookmark="$candidates"
    else
        echo "error: couldn't autodetect which bookmark to release — pass --bookmark <name> explicitly." >&2
        if [ -n "$candidates" ]; then
            echo "Bookmarks at @-:" >&2
            echo "$candidates" >&2
        fi
        exit 1
    fi
fi
echo "Releasing bookmark: $bookmark"

current_version="$(sed -n 's/^version = "\(.*\)"/\1/p' app-tauri/Cargo.toml | head -1)"
if [ "$current_version" = "$version" ]; then
    echo "error: app-tauri/Cargo.toml is already at version $version" >&2
    exit 1
fi

tag="v$version"
if git rev-parse "$tag" >/dev/null 2>&1; then
    echo "error: tag $tag already exists locally" >&2
    exit 1
fi
echo "Checking origin doesn't already have tag $tag..."
if ! remote_tag="$(git ls-remote --tags origin "refs/tags/$tag" 2>&1)"; then
    echo "error: couldn't reach origin to check for an existing tag $tag:" >&2
    echo "$remote_tag" >&2
    exit 1
fi
if [ -n "$remote_tag" ]; then
    echo "error: tag $tag already exists on origin:" >&2
    echo "$remote_tag" >&2
    exit 1
fi

echo "Bumping app-tauri $current_version -> $version"

# From here on, files get edited on disk before anything is described — in
# jj that lands directly in the current (still-anonymous) working-copy
# commit. If a check below fails partway through, make sure that's
# explained rather than just dying on `set -e`.
files_touched=0
on_error() {
    local exit_code=$?
    if [ "$files_touched" -eq 1 ]; then
        echo >&2
        echo "Release failed with the version bump still on disk, undescribed." >&2
        echo "Run 'jj diff' to see it, 'jj describe -m ...' to commit it as-is once fixed, or 'jj abandon' to discard it and start over." >&2
    fi
    exit "$exit_code"
}
trap on_error ERR

sed -i "s/^version = \"$current_version\"/version = \"$version\"/" app-tauri/Cargo.toml
tmp="$(mktemp)"
jq --arg v "$version" '.version = $v' app-tauri/tauri.conf.json >"$tmp"
mv "$tmp" app-tauri/tauri.conf.json
files_touched=1

echo "Refreshing Cargo.lock..."
cargo check --quiet

echo "Running checks (fmt, clippy, test — same as CI)..."
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-targets --all-features

echo
echo "app-tauri/Cargo.toml, app-tauri/tauri.conf.json, and Cargo.lock updated:"
jj diff --stat

if [ "$assume_yes" -ne 1 ]; then
    read -r -p "Commit, push $bookmark, and push tag $tag? [y/N] " reply
    case "$reply" in
        [yY] | [yY][eE][sS]) ;;
        *)
            echo "Aborted — changes are still on disk, uncommitted." >&2
            exit 1
            ;;
    esac
fi

jj describe -m "Bump app-tauri version to $version

Pre-release cut for $tag."
trap - ERR
jj bookmark set "$bookmark" -r @

if [ "$dry_run" -eq 1 ]; then
    echo "Dry run: stopping before push. $bookmark bookmark moved locally; nothing pushed or tagged."
    exit 0
fi

jj git push --bookmark "$bookmark"
git tag -a "$tag" -m "$tag" "$bookmark"
git push origin "$tag"

echo
echo "Released $tag."
echo "Watch the build: gh run watch --repo smaragd-editor/smaragd"

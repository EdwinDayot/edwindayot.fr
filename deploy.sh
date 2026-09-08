#!/bin/sh
set -eu
# Run locally from a clean Git checkout. No credentials are stored here.
cd "$(dirname "$0")"
if [ -n "$(git status --porcelain)" ]; then
  echo 'Commit all changes before deployment.' >&2
  exit 1
fi
revision=$(git rev-parse --short=12 HEAD)
archive=$(mktemp -t edwindayot-release.XXXXXX)
trap 'rm -f "$archive"' EXIT HUP INT TERM
git archive --format=tar HEAD > "$archive"
scp "$archive" "ovh:/home/debian/edwindayot-release-$revision.tar"
ssh ovh sh -s -- "$revision" <<'REMOTE'
set -eu
revision=$1
site=/home/debian/edwindayot-landing
release="/home/debian/edwindayot-releases/$revision"
backup="/home/debian/edwindayot-backups/$(date -u +%Y%m%dT%H%M%SZ)-$revision"
mkdir -p "$release" "$backup"
tar -xf "/home/debian/edwindayot-release-$revision.tar" -C "$release"
cd "$release"
docker compose config -q
docker build -t "edwindayot-portfolio:$revision" .
docker run --rm "edwindayot-portfolio:$revision" nginx -t
# Check the built image without exposing ports or changing production.
docker run --rm --entrypoint sh "edwindayot-portfolio:$revision" -c 'nginx; wget -q -O /dev/null http://127.0.0.1/health; wget -q -O /dev/null http://127.0.0.1/; nginx -s quit'
tar -czf "$backup/source.tar.gz" -C "$site" .
old_image=$(docker inspect edwindayot-landing --format '{{.Image}}')
docker tag "$old_image" "edwindayot-portfolio:rollback-$revision"
printf '%s\n' "$old_image" > "$backup/image-id"
# The rollback override avoids rebuilding the previous deployment.
printf 'services:\n  landing:\n    image: edwindayot-portfolio:rollback-%s\n' "$revision" > "$backup/rollback.yml"
docker tag "edwindayot-portfolio:$revision" edwindayot-portfolio:latest
cp -R "$release/." "$site/"
cd "$site"
if ! docker compose up -d --no-build --wait --wait-timeout 60; then
  tar -xzf "$backup/source.tar.gz" -C "$site"
  docker compose -f docker-compose.yml -f "$backup/rollback.yml" up -d --no-build
  echo "Deployment failed. Previous image restored. Backup: $backup" >&2
  exit 1
fi
printf 'Deployed %s. Backup: %s\n' "$revision" "$backup"
REMOTE

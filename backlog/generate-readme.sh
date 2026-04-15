#!/bin/bash
# Auto-generates backlog/README.md from frontmatter in .md files
# Run after creating, editing, or deleting backlog items

BACKLOG_DIR="$(cd "$(dirname "$0")" && pwd)"
README="$BACKLOG_DIR/README.md"

cat > "$README" << 'HEADER'
# Backlog

Auto-generated. Do not edit directly. Run `bash backlog/generate-readme.sh` after changes.

HEADER

# Collect items by priority
for priority in P0 P1 P2 P3 P4 P5; do
  items=""
  for file in "$BACKLOG_DIR"/*.md; do
    [ "$(basename "$file")" = "README.md" ] && continue
    [ "$(basename "$file")" = "BACKLOG-SYSTEM.md" ] && continue
    [ ! -f "$file" ] && continue

    file_priority=$(grep -m1 "^priority:" "$file" | sed 's/priority:[[:space:]]*//')
    if [ "$file_priority" = "$priority" ]; then
      title=$(grep -m1 "^title:" "$file" | sed 's/title:[[:space:]]*//')
      status=$(grep -m1 "^status:" "$file" | sed 's/status:[[:space:]]*//')
      fname=$(basename "$file")
      items="$items- [$title]($fname) ($status)\n"
    fi
  done

  if [ -n "$items" ]; then
    echo "## $priority" >> "$README"
    echo "" >> "$README"
    printf '%b' "$items" >> "$README"
    echo "" >> "$README"
  fi
done

# If no items found
if [ ! -s "$README" ] || [ "$(wc -l < "$README")" -le 4 ]; then
  echo "_No backlog items._" >> "$README"
fi

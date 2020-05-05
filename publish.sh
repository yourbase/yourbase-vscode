#!/bin/bash
set -eo pipefail
npx vsce publish --pat "$VSCE_PAT"

#!/bin/bash
set -eo pipefail
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
DISPLAY=:99.0 npm test

#!/bin/bash
tmux kill-session -t nexa-dev 2>/dev/null && echo "Stopped dev tmux session 'nexa-dev'." || echo "No running 'nexa-dev' tmux session found."

# Nexa Unified CLI Reference

The `nexa` CLI is a custom shell script that provides unified commands for managing the NexaGen development and production environments, no matter where you are on the server.

## Installation

The script is located at the root of the repository (`/opt/nexa-chess/NexaGen-dev/nexa`). 
It has been symlinked to your global `$PATH`, allowing you to run `nexa` from anywhere without having to navigate to the repository directory first.

---

## Commands

### `nexa status`
Displays the running state of all environments at a glance.
- Checks Docker Compose for production/staging containers (`docker compose ps`).
- Checks local Node processes for active `turbo dev` background processes.

### `nexa start <environment>`
Starts the requested environment.
- **`nexa start dev`**: Launches the local development server by executing `npm run dev` via Turbo.
- **`nexa start prod`**: Builds and starts the production containers in detached mode (`docker compose up -d --build`).
- **`nexa start stage`**: Builds the Next/Nest apps in production mode locally and runs them via Tmux (useful for testing production builds locally without Docker).

### `nexa stop <environment>`
Stops the requested environment.
- **`nexa stop dev`**: Safely locates and kills any running `turbo dev` background processes.
- **`nexa stop prod`**: Shuts down and removes the production containers (`docker compose down`).
- **`nexa stop stage`**: Safely kills the Tmux session for the staging environment (shares `stop-dev.sh`).

### `nexa restart <environment>`
Stops and immediately restarts the requested environment.
- **`nexa restart dev`**: Kills active `turbo dev` processes, then restarts `npm run dev`.
- **`nexa restart prod`**: Takes down the Docker containers and brings them back up with a fresh build.
- **`nexa restart stage`**: Stops the staging Tmux session, rebuilds, and restarts the staging environment locally.

---

## Technical Details

The `nexa` CLI automatically changes the working directory to `/opt/nexa-chess/NexaGen-dev/` internally before executing any `docker compose` or `npm` commands, meaning it will always target the correct workspace regardless of your current terminal directory.

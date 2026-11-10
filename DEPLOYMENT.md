# KSL Broadcast Studio setup

## Local Windows setup

1. Install Node.js 20+ from https://nodejs.org/
2. Download the repository ZIP from GitHub and extract it.
3. Double-click `START-KSL-WINDOWS.bat`.
4. Open `http://localhost:4000` if the browser does not open automatically.
5. Find the PC's local IPv4 address with `ipconfig` in Command Prompt.
6. On Android connected to the same Wi-Fi, open `http://PC-IP:4000`.
7. OBS Browser Source on the PC: `http://localhost:4000/overlay`.

## Public hosting

The included `render.yaml` is a starting Render Blueprint. Connect this repository to Render and deploy the Blueprint. After deployment, use:

- Scoring page: `https://YOUR-SERVICE.onrender.com/`
- OBS overlay: `https://YOUR-SERVICE.onrender.com/overlay`

The current JSON match file and uploaded PNGs are stored on the server filesystem. Configure a persistent disk before using a cloud deployment for real match data. A free ephemeral instance may lose files on restart/redeploy and may sleep when idle.

## Before a real tournament

Test all scoring cases, wicket types, strike rotation, over completion, bowler changes, innings transitions, undo, phone reconnection, PNG alignment, and OBS transparency. This is an MVP foundation, not yet a verified official scoring engine.

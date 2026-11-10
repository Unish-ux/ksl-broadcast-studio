# KSL Broadcast Studio

A browser-based cricket scoring remote and OBS graphics overlay.

## Run locally on Windows

1. Install Node.js 20 or newer: https://nodejs.org/
2. Download this repository as a ZIP and extract it.
3. Open the extracted folder in a terminal.
4. Run `npm install`
5. Run `npm start`
6. Open `http://localhost:4000` on the PC.
7. On a phone connected to the same Wi-Fi, open `http://PC-LAN-IP:4000`.
8. In OBS add a **Browser** source with URL `http://localhost:4000/overlay`, width 1920 and height 220.

## Current MVP

- Shared scoring state using Socket.IO
- Mobile-friendly scoring dashboard
- Editable match, team, toss and player details
- Editable batter and bowler statistics
- PNG background upload
- Transparent OBS overlay at `/overlay`
- Basic ball scoring, extras, wicket and undo

## Important

This is an initial MVP and must be tested and extended before tournament use. It does not yet provide full cricket law edge cases, innings/over automation, user accounts, multi-match management, or production-grade persistent storage. Local JSON storage is used. On cloud hosts, configure persistent storage before relying on saved match data.

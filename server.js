const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 4000;
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const STATE_FILE = path.join(DATA_DIR, "match.json");

const initialState = {
  match: { tournament: "KOSHI SUPER LEAGUE", matchTitle: "MATCH 1", ground: "Cricket Ground", location: "NEPAL", tossWinner: "", tossDecision: "BAT", innings: 1 },
  teams: { batting: "KG", bowling: "RHINOS", battingFull: "KTM GORKHAS", bowlingFull: "CHITWAN RHINOS" },
  score: { runs: 0, wickets: 0, balls: 0, extras: 0, history: [] },
  batters: [
    { name: "Batter 1", runs: 0, balls: 0, fours: 0, sixes: 0, out: false },
    { name: "Batter 2", runs: 0, balls: 0, fours: 0, sixes: 0, out: false }
  ],
  striker: 0,
  bowler: { name: "Bowler 1", runs: 0, wickets: 0, balls: 0 },
  lastWicket: null,
  graphic: { background: "", show: true }
};

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { ...structuredClone(initialState), ...saved,
      score: { ...initialState.score, ...(saved.score || {}), history: saved.score?.history || [] },
      lastWicket: saved.lastWicket || null };
  } catch { return structuredClone(initialState); }
}
let state = loadState();
function save() { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }
function broadcast() { save(); io.emit("state", state); }
function snapshot() {
  return structuredClone({ score: { ...state.score, history: [] }, batters: state.batters,
    bowler: state.bowler, striker: state.striker, lastWicket: state.lastWicket });
}
function record(before, event) {
  state.score.history.push({ ...event, before });
}
function validRuns(n, allowFive = true) {
  return Number.isInteger(n) && n >= 0 && n <= (allowFive ? 6 : 6);
}
function swapStrike() { state.striker = state.striker === 0 ? 1 : 0; }
function currentBatter() { return state.batters[state.striker] || state.batters[0]; }

app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/state", (_req, res) => res.json(state));
app.post("/api/settings", (req, res) => {
  const allowed = ["match", "teams", "batters", "bowler", "striker", "graphic"];
  for (const key of allowed) if (req.body[key] !== undefined) state[key] = req.body[key];
  broadcast(); res.json(state);
});
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, "scoreboard-" + Date.now() + path.extname(file.originalname).toLowerCase())
});
const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (file.mimetype === "image/png") cb(null, true); else cb(new Error("Please upload a PNG image."));
}});
app.post("/api/graphic", upload.single("graphic"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "PNG file required" });
  state.graphic.background = "/uploads/" + req.file.filename;
  broadcast(); res.json(state.graphic);
});

// RUN: batter runs on a legal delivery. NB: bat runs on a no-ball (no legal ball).
// WD: additional completed wide runs, on top of the mandatory one-run wide penalty.
// B/LB: completed byes or leg-byes on a legal delivery.
app.post("/api/ball", (req, res) => {
  const { type, runs = 0, dismissalType = "", dismissedBatter = "striker" } = req.body;
  const n = Number(runs);
  if (!["RUN", "WD", "NB", "B", "LB", "W"].includes(type) || !validRuns(n)) {
    return res.status(400).json({ error: "Invalid scoring event or run value." });
  }
  if (type === "W" && !dismissalType) return res.status(400).json({ error: "Choose a dismissal type." });

  const before = snapshot();
  const batterIndex = dismissedBatter === "non-striker" ? 1 - state.striker : state.striker;
  const batter = state.batters[batterIndex] || state.batters[0];
  let total = 0, extras = 0, legal = true, bowlerRuns = 0, batterRuns = 0;
  let wicket = false;

  if (type === "RUN") {
    batterRuns = n; total = n; bowlerRuns = n;
    batter.runs += n; batter.balls++;
    if (n === 4) batter.fours++;
    if (n === 6) batter.sixes++;
  } else if (type === "NB") {
    legal = false; batterRuns = n; total = 1 + n; extras = 1;
    bowlerRuns = total; batter.runs += n;
    if (n === 4) batter.fours++;
    if (n === 6) batter.sixes++;
  } else if (type === "WD") {
    legal = false; total = 1 + n; extras = total; bowlerRuns = total;
  } else if (type === "B" || type === "LB") {
    total = n; extras = n; batter.balls++; // legal delivery
  } else if (type === "W") {
    wicket = true;
    if (dismissalType === "Run out" || dismissalType === "Retired out" || dismissalType === "Obstructing the field" || dismissalType === "Hit the ball twice") {
      // Run-outs and other non-bowler-credit dismissals may occur on a no-ball/wide; UI supplies legal status.
      legal = req.body.legal !== false;
    }
    if (req.body.extraType === "NB") { legal = false; total = 1; extras = 1; bowlerRuns = 1; }
    else if (req.body.extraType === "WD") { legal = false; total = 1; extras = 1; bowlerRuns = 1; }
    else { batter.balls++; }
    batter.out = true;
    state.score.wickets++;
    const bowlerCredit = ["Bowled", "Caught", "LBW", "Stumped", "Hit wicket"].includes(dismissalType);
    if (bowlerCredit) state.bowler.wickets++;
    state.lastWicket = { batter: batter.name, dismissalType, over: Math.floor(state.score.balls / 6) + "." + (state.score.balls % 6), bowler: state.bowler.name };
  }

  state.score.runs += total;
  state.score.extras += extras;
  if (legal) { state.score.balls++; state.bowler.balls++; }
  state.bowler.runs += bowlerRuns;

  // Strike changes for odd runs completed / scored. A no-ball's bat runs count;
  // wide/byes/leg-byes use the entered completed-run value.
  const strikeRuns = type === "WD" || type === "B" || type === "LB" ? n : batterRuns;
  if (strikeRuns % 2 === 1) swapStrike();
  if (legal && state.score.balls > 0 && state.score.balls % 6 === 0) swapStrike();

  record(before, { type, runs: n, total, extras, legal, wicket, dismissalType, batterIndex, bowlerName: state.bowler.name });
  broadcast(); res.json(state);
});

app.post("/api/penalty", (req, res) => {
  const runs = Number(req.body.runs);
  const reason = String(req.body.reason || "").trim();
  if (!Number.isInteger(runs) || runs < 1 || runs > 5 || !reason) {
    return res.status(400).json({ error: "Enter penalty runs (1–5) and a reason." });
  }
  const before = snapshot();
  state.score.runs += runs;
  state.score.extras += runs;
  record(before, { type: "PENALTY", runs, total: runs, extras: runs, legal: false, reason });
  broadcast(); res.json(state);
});

app.post("/api/undo", (_req, res) => {
  const last = state.score.history.pop();
  if (!last) return res.status(400).json({ error: "Nothing to undo." });
  const before = last.before;
  state.score = { ...before.score, history: state.score.history };
  state.batters = before.batters;
  state.bowler = before.bowler;
  state.striker = before.striker;
  state.lastWicket = before.lastWicket;
  broadcast(); res.json(state);
});
app.post("/api/reset", (_req, res) => { state = structuredClone(initialState); broadcast(); res.json(state); });
io.on("connection", socket => socket.emit("state", state));
app.get("/overlay", (_req, res) => res.sendFile(path.join(__dirname, "public", "overlay.html")));
server.listen(PORT, "0.0.0.0", () => console.log("KSL Broadcast Studio running on port " + PORT));

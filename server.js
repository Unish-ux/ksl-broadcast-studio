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
  match: { tournament: "KOSHI SUPER LEAGUE", matchTitle: "MATCH 1", ground: "Cricket Ground", location: "NEPAL", tossWinner: "", tossDecision: "BAT", innings: 1, overs: 20, date: "" },
  teams: { batting: "KG", bowling: "RHINOS", battingFull: "KTM GORKHAS", bowlingFull: "CHITWAN RHINOS" },
  score: { runs: 0, wickets: 0, balls: 0, extras: 0, history: [] },
  batters: [
    { name: "Batter 1", runs: 0, balls: 0, fours: 0, sixes: 0, out: false },
    { name: "Batter 2", runs: 0, balls: 0, fours: 0, sixes: 0, out: false }
  ],
  striker: 0,
  bowler: { name: "Bowler 1", runs: 0, wickets: 0, balls: 0 },\n  playingXI: { batting: [], bowling: [] },
  graphic: { background: "", show: true }
};

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch { return structuredClone(initialState); }
}
let state = loadState();
function save() { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }
function broadcast() { save(); io.emit("state", state); }
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/state", (_req, res) => res.json(state));
app.post("/api/settings", (req, res) => {
  const allowed = ["match", "teams", "batters", "bowler", "striker", "graphic", "playingXI"];
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
function currentOver() { return Math.floor(state.score.balls / 6) + "." + (state.score.balls % 6); }
app.post("/api/ball", (req, res) => {
  const { type, runs = 0 } = req.body;
  const legal = !["WD", "NB"].includes(type);
  const batRuns = type === "RUN" ? Number(runs) : 0;
  const extraRuns = type === "WD" || type === "NB" ? 1 + Number(runs || 0) : ["B", "LB"].includes(type) ? Number(runs || 1) : 0;
  if (!["RUN", "WD", "NB", "B", "LB", "W"].includes(type)) return res.status(400).json({ error: "Invalid ball type" });
  const batter = state.batters[state.striker] || state.batters[0];
  const entry = { type, runs: batRuns, extraRuns, legal, wicket: type === "W", batterIndex: state.striker, bowlerName: state.bowler.name };
  state.score.history.push(entry);
  state.score.runs += batRuns + extraRuns;
  state.score.extras += extraRuns;
  if (legal) { state.score.balls++; state.bowler.balls++; }
  state.bowler.runs += batRuns + extraRuns;
  if (type === "W") { state.score.wickets++; state.bowler.wickets++; batter.out = true; }
  else if (type === "RUN") {
    batter.runs += batRuns; batter.balls++;
    if (batRuns === 4) batter.fours++;
    if (batRuns === 6) batter.sixes++;
    if (batRuns % 2 === 1) state.striker = 1 - state.striker;
  } else if (legal) batter.balls++;
  if (legal && state.score.balls % 6 === 0) state.striker = 1 - state.striker;
  broadcast(); res.json(state);
});
app.post("/api/undo", (_req, res) => {
  const last = state.score.history.pop();
  if (!last) return res.status(400).json({ error: "Nothing to undo" });
  // Rebuild from the initial match configuration for consistent basic undo.
  const keep = { ...state, score: { runs: 0, wickets: 0, balls: 0, extras: 0, history: [] }, batters: state.batters.map(b => ({ ...b, runs: 0, balls: 0, fours: 0, sixes: 0, out: false })), bowler: { ...state.bowler, runs: 0, wickets: 0, balls: 0 }, striker: 0 };
  const history = state.score.history.slice();
  state = { ...keep, score: { ...keep.score, history: [] } };
  for (const e of history) {
    const b = state.batters[e.batterIndex] || state.batters[0];
    state.score.history.push(e); state.score.runs += e.runs + e.extraRuns; state.score.extras += e.extraRuns;
    if (e.legal) { state.score.balls++; state.bowler.balls++; }
    state.bowler.runs += e.runs + e.extraRuns;
    if (e.wicket) { state.score.wickets++; state.bowler.wickets++; b.out = true; }
    else if (e.type === "RUN") { b.runs += e.runs; b.balls++; if (e.runs === 4) b.fours++; if (e.runs === 6) b.sixes++; }
    else if (e.legal) b.balls++;
  }
  broadcast(); res.json(state);
});
app.post("/api/reset", (_req, res) => { state = structuredClone(initialState); broadcast(); res.json(state); });
io.on("connection", socket => socket.emit("state", state));
app.get("/overlay", (_req, res) => res.sendFile(path.join(__dirname, "public", "overlay.html")));
server.listen(PORT, "0.0.0.0", () => console.log("KSL Broadcast Studio running on port " + PORT));

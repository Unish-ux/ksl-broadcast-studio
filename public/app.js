const socket = io();
let state;
const $ = id => document.getElementById(id);
$("overlayUrl").textContent = location.origin + "/overlay";

function render(s) {
  state = s;
  $("connection").textContent = "● LIVE CONNECTED";
  $("batTeam").textContent = s.teams.batting;
  $("total").textContent = s.score.runs + "/" + s.score.wickets;
  $("overs").textContent = Math.floor(s.score.balls / 6) + "." + (s.score.balls % 6) + " OVERS";
  s.batters.forEach((b, i) => {
    $("batter" + i).value = b.name;
    $("bat" + i + "stats").textContent = b.runs + " (" + b.balls + ") · 4s " + b.fours + " · 6s " + b.sixes;
  });
  $("bowler").value = s.bowler.name;
  $("bowlstats").textContent = s.bowler.runs + "/" + s.bowler.wickets + " · " + Math.floor(s.bowler.balls / 6) + "." + (s.bowler.balls % 6);
  $("tournament").value = s.match.tournament;
  $("matchTitle").value = s.match.matchTitle;
  $("ground").value = s.match.ground;
  $("location").value = s.match.location;
  $("batShort").value = s.teams.batting;
  $("bowlShort").value = s.teams.bowling;
  $("tossWinner").value = s.match.tossWinner;
  $("tossDecision").value = s.match.tossDecision;
}
socket.on("connect", () => {
  $("connection").textContent = "● CONNECTED";
  fetch("/api/state").then(r => r.json()).then(render);
});
socket.on("state", render);

async function post(url, data = {}) {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!r.ok) throw Error(j.error || "Request failed");
    $("message").textContent = "Updated successfully";
  } catch (e) { $("message").textContent = e.message; }
}
document.querySelectorAll("[data-run]").forEach(b => b.onclick = () => post("/api/ball", { type: "RUN", runs: Number(b.dataset.run) }));
$("noBall").onclick = () => post("/api/ball", { type: "NB", runs: Number($("nbRuns").value) });
$("wide").onclick = () => post("/api/ball", { type: "WD", runs: Number($("wideRuns").value) });
$("bye").onclick = () => post("/api/ball", { type: "B", runs: Number($("byeRuns").value) });
$("legbye").onclick = () => post("/api/ball", { type: "LB", runs: Number($("byeRuns").value) });
$("wicket").onclick = () => {
  const dismissalType = $("dismissalType").value;
  if (!dismissalType) { $("message").textContent = "Please select how the batter was dismissed."; return; }
  post("/api/ball", { type: "W", runs: 0, dismissalType, dismissedBatter: $("dismissedBatter").value, extraType: $("wicketExtra").value, legal: !$("wicketExtra").value });
};
$("penalty").onclick = () => {
  const reason = $("penaltyReason").value.trim();
  if (!reason) { $("message").textContent = "Enter a reason for penalty runs."; return; }
  post("/api/penalty", { runs: Number($("penaltyRuns").value), reason });
};
$("undo").onclick = () => post("/api/undo");
$("saveNames").onclick = () => {
  const next = structuredClone(state);
  next.batters[0].name = $("batter0").value;
  next.batters[1].name = $("batter1").value;
  next.bowler.name = $("bowler").value;
  post("/api/settings", next);
};
["tournament", "matchTitle", "ground", "location", "batShort", "bowlShort", "tossWinner", "tossDecision"].forEach(id =>
  $(id).addEventListener("change", () => {
    const next = structuredClone(state);
    next.match.tournament = $("tournament").value;
    next.match.matchTitle = $("matchTitle").value;
    next.match.ground = $("ground").value;
    next.match.location = $("location").value;
    next.match.tossWinner = $("tossWinner").value;
    next.match.tossDecision = $("tossDecision").value;
    next.teams.batting = $("batShort").value;
    next.teams.bowling = $("bowlShort").value;
    post("/api/settings", next);
  })
);
$("graphic").onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  const fd = new FormData(); fd.append("graphic", f);
  const r = await fetch("/api/graphic", { method: "POST", body: fd });
  $("message").textContent = r.ok ? "PNG background uploaded" : "PNG upload failed";
};

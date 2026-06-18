"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LANDMARK_LABELS = {
  C2: "Low C",
  C3: "Bass C",
  C4: "Middle C",
  C5: "Treble C",
  C6: "High C",
};
const BLACK_AFTER = new Set(["C", "D", "F", "G", "A"]);
const TOP = 54;
const BOTTOM = 676;
const STEP = (BOTTOM - TOP) / 29;
const NOTE_X = 400;
const KEY_X = 684;
const KEY_WIDTH = 198;
const SLIDER_X = 946;

// Treble clef: its lower swirl is aligned with the G4 line (the second line
// from the bottom of the treble staff). It may extend slightly past the staff.
const TREBLE_CLEF_X = 64; // slight left nudge
const TREBLE_CLEF_SCALE = 1;
const TREBLE_CLEF_FONT_SIZE = 160;
// The center of Noto Music's lower treble-clef loop is 0.336 em above its
// baseline. Positioning the baseline this far below G4 centers the curl on G.
const TREBLE_CLEF_G_ANCHOR_EM = 0.336;
const TREBLE_CLEF_Y = BOTTOM - (18 + 0.5) * STEP
  + TREBLE_CLEF_FONT_SIZE * TREBLE_CLEF_SCALE * TREBLE_CLEF_G_ANCHOR_EM
  - STEP * 0.43; // total 0.215 staff space upward adjustment

// Bass clef: the glyph is centered so its two dots straddle the F3 line (the
// second line from the top of the bass staff).
const BASS_CLEF_X = 56; // additional doubled left nudge
const BASS_CLEF_F_LINE_Y = BOTTOM - (10 + 0.5) * STEP; // F3 line
const BASS_CLEF_SCALE = 1;
const BASS_DOT_RADIUS = 8;
const BASS_CLEF_FONT_SIZE = 180; // slightly smaller while retaining F-line anchoring
// In Noto Music U+1D122, the dot centers are at y=754.5 and y=534.5
// within a 1000-unit em. Their midpoint (644.5) is the exact F-line anchor.
const BASS_CLEF_F_ANCHOR_EM = 0.6445;
const BASS_CLEF_Y = BASS_CLEF_F_LINE_Y
  + BASS_CLEF_FONT_SIZE * BASS_CLEF_SCALE * BASS_CLEF_F_ANCHOR_EM
  + STEP * 0.13; // 0.065 staff space down from the metric anchor

function generatePitchList() {
  const pitches = [];
  for (let octave = 2; octave <= 6; octave += 1) {
    for (const letter of LETTERS) {
      if (octave === 6 && letter !== "C") break;
      const name = `${letter}${octave}`;
      pitches.push({ index: pitches.length, name, letter, octave, label: LANDMARK_LABELS[name] || letter });
    }
  }
  return pitches;
}

const pitches = generatePitchList();
const byName = Object.fromEntries(pitches.map((pitch) => [pitch.name, pitch]));

function readSessionNumber(key) {
  try {
    return Number(window.sessionStorage.getItem(key) || 0);
  } catch {
    return 0;
  }
}

const state = {
  selectedIndex: 14,
  mode: "study",
  difficulty: "easy",
  quizTargetIndex: 14,
  quizAnswered: false,
  quizLocked: false,
  score: readSessionNumber("pianoScore"),
  attempts: readSessionNumber("pianoAttempts"),
  dragSource: null,
};

const svg = document.getElementById("musicBoard");
const selectedLabel = document.getElementById("selectedLabel");
const rangeLabel = document.getElementById("rangeLabel");
const feedback = document.getElementById("feedback");
const score = document.getElementById("score");

function pitchY(pitchOrIndex) {
  const index = typeof pitchOrIndex === "number" ? pitchOrIndex : pitchOrIndex.index;
  return BOTTOM - (index + 0.5) * STEP;
}

function el(name, attributes = {}, text = "") {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

function line(x1, y1, x2, y2, width = 3, color = "#121212") {
  return el("line", { x1, y1, x2, y2, stroke: color, "stroke-width": width });
}

function addText(parent, x, y, text, size, options = {}) {
  const node = el("text", {
    x, y,
    "font-size": size,
    "font-weight": options.weight || 900,
    "text-anchor": options.anchor || "start",
    "font-family": options.family || "Arial Rounded MT Bold, system-ui, sans-serif",
    "dominant-baseline": options.baseline || "auto",
    transform: options.transform || "",
    fill: options.fill || "#121212",
  }, text);
  parent.append(node);
  return node;
}

function renderBassClef(parent) {
  // U+1D122 rendered exclusively by the bundled Noto Music notation font.
  // The font supplies the standard curved body and its correctly shaped dots.
  addText(parent, BASS_CLEF_X, BASS_CLEF_Y, "𝄢", BASS_CLEF_FONT_SIZE * BASS_CLEF_SCALE, {
    family: "NotoMusicLocal",
    weight: 400,
    // Use the true font baseline; the Y constant already aligns the glyph's
    // measured dot midpoint and round body with the F3 staff line.
    baseline: "auto",
  });
}

function renderTrebleClef(parent) {
  // U+1D11E rendered by the same bundled Noto Music font as the bass clef.
  // Its native proportions provide a smooth, rounded teaching-size G clef.
  addText(parent, TREBLE_CLEF_X, TREBLE_CLEF_Y, "𝄞", TREBLE_CLEF_FONT_SIZE * TREBLE_CLEF_SCALE, {
    family: "NotoMusicLocal",
    weight: 400,
    baseline: "auto",
  });
}

function drawGrandStaff(parent) {
  const trebleLines = ["E4", "G4", "B4", "D5", "F5"];
  const bassLines = ["G2", "B2", "D3", "F3", "A3"];

  // Draw two genuinely separate five-line staves. The side bars stop at each
  // staff boundary, preserving the blank grand-staff gap around Middle C.
  for (const name of trebleLines) parent.append(line(52, pitchY(byName[name]), 510, pitchY(byName[name]), 3));
  parent.append(line(52, pitchY(byName.F5), 52, pitchY(byName.E4), 5));
  parent.append(line(510, pitchY(byName.F5), 510, pitchY(byName.E4), 3));

  for (const name of bassLines) parent.append(line(52, pitchY(byName[name]), 510, pitchY(byName[name]), 3));
  parent.append(line(52, pitchY(byName.A3), 52, pitchY(byName.G2), 5));
  parent.append(line(510, pitchY(byName.A3), 510, pitchY(byName.G2), 3));

  renderTrebleClef(parent);
  renderBassClef(parent);
}

function ledgerSteps(pitch) {
  const step = pitch.index - 14;
  if (step > 10) return Array.from({ length: Math.floor((step - 10) / 2) }, (_, i) => 12 + i * 2);
  if (step < -10) return Array.from({ length: Math.floor((-10 - step) / 2) }, (_, i) => -12 - i * 2);
  return step === 0 ? [0] : [];
}

function drawSelectedNote(parent, pitch, draggable = false, dragging = false) {
  const y = pitchY(pitch);
  for (const step of ledgerSteps(pitch)) parent.append(line(NOTE_X - 61, pitchY(14) - step * STEP, NOTE_X + 61, pitchY(14) - step * STEP, 4));
  parent.append(el("ellipse", {
    cx: NOTE_X, cy: y, rx: 38, ry: 26, fill: "#121212",
    transform: `rotate(-12 ${NOTE_X} ${y})`,
    class: `staff-note${dragging ? " dragging" : ""}`,
    "pointer-events": "none",
  }));
  if (draggable) {
    // A large invisible target makes the note comfortable to drag on tablets.
    parent.append(el("circle", {
      cx: NOTE_X, cy: y, r: 58, fill: "transparent",
      class: "staff-note-hit", role: "slider", tabindex: 0,
      "aria-label": "Drag selected staff note",
      "aria-valuemin": 0, "aria-valuemax": 28,
      "aria-valuenow": pitch.index, "aria-valuetext": pitch.label,
    }));
  }
}

function drawKeyboard(parent, selectedIndex) {
  for (let index = pitches.length - 1; index >= 0; index -= 1) {
    const pitch = pitches[index];
    const y = BOTTOM - (index + 1) * STEP;
    const key = el("rect", {
      x: KEY_X, y, width: KEY_WIDTH, height: STEP,
      fill: index === selectedIndex ? "#ffd84d" : "#ffffff",
      stroke: index === selectedIndex ? "#c88f00" : "#121212",
      "stroke-width": index === selectedIndex ? 4 : 2, rx: 1,
      class: "white-key", tabindex: 0, role: "button",
      "aria-label": `Select ${pitch.label}`, "data-index": index,
    });
    parent.append(key);
    if (index === selectedIndex) addText(parent, KEY_X + KEY_WIDTH - 8, y + STEP * 0.72, pitch.label, 16, { anchor: "end" });
  }

  for (const lower of pitches.slice(0, -1)) {
    if (!BLACK_AFTER.has(lower.letter)) continue;
    const boundaryY = BOTTOM - (lower.index + 1) * STEP;
    parent.append(el("rect", {
      x: KEY_X, y: boundaryY - STEP * 0.31, width: 120, height: STEP * 0.62,
      fill: "#121212", stroke: "#000", "stroke-width": 2, rx: 2,
      "pointer-events": "none",
    }));
  }
  parent.append(el("rect", { x: KEY_X, y: TOP, width: KEY_WIDTH, height: BOTTOM - TOP, fill: "none", stroke: "#121212", "stroke-width": 5, "pointer-events": "none" }));
  addText(parent, KEY_X + KEY_WIDTH / 2, 34, "HIGH", 20, { anchor: "middle" });
  addText(parent, KEY_X + KEY_WIDTH / 2, 705, "LOW", 20, { anchor: "middle" });
}

function drawArrow(parent, staffPitch, keyPitch) {
  if (!keyPitch) return;
  const defs = el("defs");
  const marker = el("marker", { id: "arrowhead", markerWidth: 10, markerHeight: 8, refX: 8, refY: 4, orient: "auto" });
  marker.append(el("polygon", { points: "10 4, 0 0, 0 8", fill: "#121212" }));
  defs.append(marker);
  parent.append(defs);
  parent.append(el("line", {
    // Ledger lines end at x=461 and the notehead ends at x=438. Stopping at
    // x=492 leaves a visible gap around both pieces of notation.
    x1: KEY_X - 8, y1: pitchY(keyPitch), x2: 492, y2: pitchY(staffPitch),
    stroke: "#121212", "stroke-width": 5, "stroke-linecap": "round", "marker-end": "url(#arrowhead)",
  }));
}

function drawSlider(parent, selectedIndex) {
  parent.append(line(SLIDER_X, TOP + STEP / 2, SLIDER_X, BOTTOM - STEP / 2, 10, "#333"));
  addText(parent, SLIDER_X, 20, "SLIDE", 17, { anchor: "middle" });
  addText(parent, SLIDER_X, 45, "High C", 16, { anchor: "middle" });
  addText(parent, SLIDER_X, 704, "Low C", 16, { anchor: "middle" });
  for (const pitch of pitches) {
    const y = pitchY(pitch);
    if (pitch.letter === "C") parent.append(line(SLIDER_X - 16, y, SLIDER_X + 16, y, 3, "#777"));
  }
  parent.append(el("rect", {
    x: SLIDER_X - 44, y: TOP, width: 88, height: BOTTOM - TOP,
    fill: "transparent", class: "slider-hit", role: "slider", tabindex: 0,
    "aria-label": "Natural note slider", "aria-valuemin": 0, "aria-valuemax": 28,
    "aria-valuenow": selectedIndex, "aria-valuetext": pitches[selectedIndex].label,
  }));
  parent.append(el("circle", {
    cx: SLIDER_X, cy: pitchY(selectedIndex), r: 19,
    fill: "#ffd84d", stroke: "#121212", "stroke-width": 5,
    class: "slider-thumb", "pointer-events": "none",
  }));
}

function drawSliderToKeyArrow(parent, keyPitch) {
  if (!keyPitch) return;
  const y = pitchY(keyPitch);
  const defs = el("defs");
  const marker = el("marker", {
    id: "slider-arrowhead", markerWidth: 8, markerHeight: 7,
    refX: 7, refY: 3.5, orient: "auto",
  });
  marker.append(el("polygon", { points: "8 3.5, 0 0, 0 7", fill: "#121212" }));
  defs.append(marker);
  parent.append(defs);
  parent.append(el("line", {
    x1: SLIDER_X - 21, y1: y,
    x2: KEY_X + KEY_WIDTH + 9, y2: y,
    stroke: "#121212", "stroke-width": 3, "stroke-linecap": "round",
    "marker-end": "url(#slider-arrowhead)",
  }));
}

function displayedStaffPitch() {
  return state.mode === "quiz" ? pitches[state.quizTargetIndex] : pitches[state.selectedIndex];
}

function render() {
  svg.replaceChildren();
  svg.append(el("rect", { width: 1000, height: 720, fill: "#fffdf5" }));
  const staffPitch = displayedStaffPitch();
  const keyPitch = state.mode === "study" || state.quizAnswered ? pitches[state.selectedIndex] : null;
  drawGrandStaff(svg);
  drawArrow(svg, staffPitch, keyPitch);
  drawSelectedNote(svg, staffPitch, state.mode === "study", state.dragSource === "staff");
  drawKeyboard(svg, keyPitch ? keyPitch.index : -1);
  drawSliderToKeyArrow(svg, keyPitch);
  drawSlider(svg, state.selectedIndex);

  selectedLabel.textContent = state.mode === "quiz"
    ? (state.quizLocked ? pitches[state.quizTargetIndex].label : "Find this note!")
    : pitches[state.selectedIndex].label;
  rangeLabel.textContent = state.mode === "quiz"
    ? (state.difficulty === "easy" ? "Easy · F3 to G5 · 16 natural notes" : "Hard · Low C to High C · 29 natural notes")
    : "29 natural notes · Low C to High C";
  score.textContent = `Score: ${state.score} / ${state.attempts}`;
}

function updateSelection(noteIndex, options = {}) {
  const { submitQuizAnswer = false } = options;
  const nextIndex = Math.max(0, Math.min(28, noteIndex));
  const changed = nextIndex !== state.selectedIndex;
  const revealChanged = state.mode === "quiz" && !state.quizAnswered;
  state.selectedIndex = nextIndex;
  state.quizAnswered = state.mode === "quiz";
  if (changed || revealChanged) render();
  if (submitQuizAnswer && state.mode === "quiz") submitPitchAnswer(state.selectedIndex);
}

function setFeedback(message, className) {
  feedback.textContent = message;
  feedback.className = `feedback ${className || ""}`;
}

function saveScore() {
  try {
    window.sessionStorage.setItem("pianoScore", state.score);
    window.sessionStorage.setItem("pianoAttempts", state.attempts);
  } catch {
    // Direct file pages may disable storage; the in-memory session still works.
  }
}

function recordAnswer(correct) {
  if (state.quizLocked) return;
  state.attempts += 1;
  if (correct) {
    // Synchronize every visual element with the quiz target immediately:
    // note, key highlight, slider knob, both arrows, and the large label.
    updateSelection(state.quizTargetIndex);
    state.score += 1;
    state.quizLocked = true;
    setFeedback("Correct! ⭐", "correct");
  } else {
    setFeedback("Try again", "try-again");
  }
  saveScore();
  render();
}

function submitPitchAnswer(index) {
  recordAnswer(index === state.quizTargetIndex);
}

function submitLetterAnswer(letter) {
  state.quizAnswered = true;
  recordAnswer(letter === pitches[state.quizTargetIndex].letter);
}

function newQuestion() {
  const low = state.difficulty === "easy" ? 10 : 0;  // F3
  const high = state.difficulty === "easy" ? 25 : 28; // G5
  let next;
  do next = low + Math.floor(Math.random() * (high - low + 1));
  while (next === state.quizTargetIndex && high > low);
  state.quizTargetIndex = next;
  state.quizAnswered = false;
  state.quizLocked = false;
  setFeedback("", "");
  render();
}

function pointerToNaturalIndex(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(svg.getScreenCTM().inverse());
  return Math.max(0, Math.min(28, Math.round((BOTTOM - local.y) / STEP - 0.5)));
}

svg.addEventListener("pointerdown", (event) => {
  if (event.target.classList.contains("slider-hit")) {
    state.dragSource = "slider";
    svg.setPointerCapture(event.pointerId);
    updateSelection(pointerToNaturalIndex(event));
    event.preventDefault();
    return;
  }
  if (event.target.classList.contains("staff-note-hit") && state.mode === "study") {
    state.dragSource = "staff";
    svg.setPointerCapture(event.pointerId);
    updateSelection(pointerToNaturalIndex(event));
    render();
    event.preventDefault();
    return;
  }
  if (event.target.classList.contains("white-key")) {
    state.dragSource = "keyboard";
    svg.setPointerCapture(event.pointerId);
    updateSelection(Number(event.target.dataset.index));
    event.preventDefault();
  }
});

svg.addEventListener("pointermove", (event) => {
  if (!state.dragSource) return;
  const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
  updateSelection(pointerToNaturalIndex(events[events.length - 1]));
  event.preventDefault();
});

function finishDrag(event) {
  if (!state.dragSource) return;
  const completedSource = state.dragSource;
  state.dragSource = null;
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  if (state.mode === "quiz" && (completedSource === "slider" || completedSource === "keyboard")) {
    submitPitchAnswer(state.selectedIndex);
  } else {
    render();
  }
}

svg.addEventListener("pointerup", finishDrag);
svg.addEventListener("pointercancel", finishDrag);

svg.addEventListener("keydown", (event) => {
  if (event.target.classList.contains("white-key") && (event.key === "Enter" || event.key === " ")) {
    updateSelection(Number(event.target.dataset.index), { submitQuizAnswer: state.mode === "quiz" });
    event.preventDefault();
  }
  if (event.target.classList.contains("slider-hit") && ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) {
    const delta = ["ArrowUp", "ArrowRight"].includes(event.key) ? 1 : -1;
    updateSelection(state.selectedIndex + delta, { submitQuizAnswer: state.mode === "quiz" });
    event.preventDefault();
  }
  if (event.target.classList.contains("staff-note-hit") && ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) {
    const delta = ["ArrowUp", "ArrowRight"].includes(event.key) ? 1 : -1;
    updateSelection(state.selectedIndex + delta);
    event.preventDefault();
  }
});

function setMode(mode) {
  state.mode = mode;
  state.quizAnswered = false;
  state.quizLocked = false;
  document.getElementById("studyMode").classList.toggle("active", mode === "study");
  document.getElementById("quizMode").classList.toggle("active", mode === "quiz");
  document.getElementById("studyMode").setAttribute("aria-pressed", mode === "study");
  document.getElementById("quizMode").setAttribute("aria-pressed", mode === "quiz");
  document.getElementById("difficultyGroup").classList.toggle("hidden", mode !== "quiz");
  document.getElementById("quizPanel").classList.toggle("hidden", mode !== "quiz");
  setFeedback("", "");
  if (mode === "quiz") newQuestion(); else render();
}

function setDifficulty(difficulty) {
  state.difficulty = difficulty;
  for (const name of ["easy", "hard"]) {
    const button = document.getElementById(`${name}Mode`);
    button.classList.toggle("active", difficulty === name);
    button.setAttribute("aria-pressed", difficulty === name);
  }
  newQuestion();
}

document.getElementById("studyMode").addEventListener("click", () => setMode("study"));
document.getElementById("quizMode").addEventListener("click", () => setMode("quiz"));
document.getElementById("easyMode").addEventListener("click", () => setDifficulty("easy"));
document.getElementById("hardMode").addEventListener("click", () => setDifficulty("hard"));
document.getElementById("nextQuestion").addEventListener("click", newQuestion);
document.getElementById("resetScore").addEventListener("click", () => {
  state.score = 0;
  state.attempts = 0;
  saveScore();
  setFeedback("", "");
  render();
});

for (const letter of LETTERS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "note-answer";
  button.textContent = letter;
  button.setAttribute("aria-label", `Answer ${letter}`);
  button.addEventListener("click", () => submitLetterAnswer(letter));
  document.getElementById("noteAnswers").append(button);
}

render();

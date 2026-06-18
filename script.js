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
const LEDGER_HALF_WIDTH = 54.9; // 10% shorter than the previous 61px half-width.
const STAFF_CLICK_X_MIN = 355;
const STAFF_CLICK_X_MAX = 505;
const STAFF_CLICK_Y_MIN = TOP;
const STAFF_CLICK_Y_MAX = BOTTOM;
const KEY_X = 684;
const KEY_WIDTH = 198;
const SLIDER_X = 946;
const GUIDE_NOTE_X = 25;
const GUIDE_NOTE_FONT_SIZE = 18;
const GUIDE_DOUBLE_PRESS_MS = 400;

// Audio files use simple note names such as C4.wav. Change this one constant
// to "mp3" when the audio folder contains C4.mp3-style files instead.
const AUDIO_DIRECTORY = "audio";
const AUDIO_EXTENSION = "wav";
const AUDIO_THROTTLE_MS = 65;
const AUDIO_UNLOCK_TIMEOUT_MS = 1500;
const AUDIO_ENVELOPE_MS = 8;

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

const GUIDE_NOTES = [
  ...["E4", "G4", "B4", "D5", "F5"].map((pitch, index) => ({
    id: `treble-line-${index}`,
    clef: "treble",
    type: "line",
    label: pitch[0],
    pitch,
  })),
  ...["F4", "A4", "C5", "E5"].map((pitch, index) => ({
    id: `treble-space-${index}`,
    clef: "treble",
    type: "space",
    label: pitch[0],
    pitch,
  })),
  ...["G2", "B2", "D3", "F3", "A3"].map((pitch, index) => ({
    id: `bass-line-${index}`,
    clef: "bass",
    type: "line",
    label: pitch[0],
    pitch,
  })),
  ...["A2", "C3", "E3", "G3"].map((pitch, index) => ({
    id: `bass-space-${index}`,
    clef: "bass",
    type: "space",
    label: pitch[0],
    pitch,
  })),
];

const state = {
  selectedIndex: 14,
  dragSource: null,
  soundEnabled: false,
  guideNotesVisible: false,
};

const svg = document.getElementById("musicBoard");
const selectedLabel = document.getElementById("selectedLabel");
const soundToggle = document.getElementById("soundToggle");
const soundStatus = document.getElementById("soundStatus");
const guideNotesToggle = document.getElementById("guideNotesToggle");
const resetGuideNotes = document.getElementById("resetGuideNotes");
const hiddenGuideNoteIds = new Set();
const audioBuffers = new Map();
let audioContext = null;
let audioPreloadPromise = null;
let activeAudioSource = null;
let lastAudioStart = 0;
let audioSelectionVersion = 0;
let pendingAudioTimer = null;
let soundStatusHideTimer = null;
let lastGuidePressId = null;
let lastGuidePressAt = 0;

function audioPathForPitch(pitch) {
  return `${AUDIO_DIRECTORY}/${pitch.name}.${AUDIO_EXTENSION}`;
}

function setSoundStatus(message, isError = false, autoHideMs = 0) {
  if (soundStatusHideTimer !== null) {
    window.clearTimeout(soundStatusHideTimer);
    soundStatusHideTimer = null;
  }
  soundStatus.textContent = message;
  soundStatus.classList.toggle("error", isError);
  if (message && autoHideMs > 0) {
    soundStatusHideTimer = window.setTimeout(() => {
      soundStatus.textContent = "";
      soundStatusHideTimer = null;
    }, autoHideMs);
  }
}

function ensureAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio is not supported");
  audioContext = new AudioContextClass();
  return audioContext;
}

function cancelPendingAudio() {
  if (pendingAudioTimer !== null) {
    window.clearTimeout(pendingAudioTimer);
    pendingAudioTimer = null;
  }
}

function stopCurrentAudio() {
  cancelPendingAudio();
  if (activeAudioSource) {
    const { source, gain } = activeAudioSource;
    try {
      const now = audioContext.currentTime;
      const fadeEnd = now + AUDIO_ENVELOPE_MS / 1000;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, fadeEnd);
      source.stop(fadeEnd + 0.002);
    } catch {
      // The source may already have finished.
    }
    activeAudioSource = null;
  }
}

function preloadAudioBuffers() {
  if (audioPreloadPromise) return audioPreloadPromise;
  ensureAudioContext();
  audioPreloadPromise = Promise.all(pitches.map(async (pitch) => {
    const path = audioPathForPitch(pitch);
    try {
      // Revalidate same-name WAV files so a newly repaired sample cannot be
      // hidden behind an older browser cache entry.
      const response = await fetch(path, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const encodedAudio = await response.arrayBuffer();
      const decodedAudio = await audioContext.decodeAudioData(encodedAudio);
      audioBuffers.set(pitch.index, decodedAudio);
      return null;
    } catch (error) {
      const message = `Audio file missing or failed to load: ${path}`;
      console.warn(message, error);
      return message;
    }
  })).then((results) => results.filter(Boolean));
  return audioPreloadPromise;
}

function playPitch(index, options = {}) {
  const {
    forceReplay = false,
    bypassThrottle = false,
    selectionToken = audioSelectionVersion,
  } = options;
  if (!state.soundEnabled || !audioContext) return;
  const buffer = audioBuffers.get(index);
  if (!buffer) return; // Preloading is still underway, or this file failed.
  if (selectionToken !== audioSelectionVersion) return;

  const now = performance.now();
  const playLatest = () => {
    pendingAudioTimer = null;
    if (!state.soundEnabled || selectionToken !== audioSelectionVersion) return;

    try {
      stopCurrentAudio();
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      const startTime = audioContext.currentTime;
      source.buffer = buffer;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1, startTime + AUDIO_ENVELOPE_MS / 1000);
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.addEventListener("ended", () => {
        if (activeAudioSource?.source === source) activeAudioSource = null;
      }, { once: true });
      source.start(startTime);
      activeAudioSource = { source, gain };
      lastAudioStart = performance.now();
      if (pitches[index].name === "G5") {
        console.log(`[Audio debug] Playing G5 from ${audioPathForPitch(pitches[index])}; cached duration ${buffer.duration.toFixed(3)}s`);
      }
    } catch (error) {
      const path = audioPathForPitch(pitches[index]);
      console.warn(`Audio file missing or failed to load: ${path}`, error);
      setSoundStatus("Some sounds failed to load", true);
    }
  };

  cancelPendingAudio();
  const elapsed = now - lastAudioStart;
  if (forceReplay || bypassThrottle || elapsed >= AUDIO_THROTTLE_MS) {
    playLatest();
    return;
  }

  // Keep one trailing request only. A newer selection cancels this timer and
  // invalidates its token, so stale notes can never fire after the visual moves.
  pendingAudioTimer = window.setTimeout(playLatest, AUDIO_THROTTLE_MS - elapsed);
}

function playRawDebugNote(noteName) {
  const pitch = byName[noteName];
  const path = pitch ? audioPathForPitch(pitch) : "unknown";
  if (!pitch || !audioBuffers.has(pitch.index)) {
    console.warn(`Audio file missing or failed to load: ${path}`);
    return null;
  }
  if (!state.soundEnabled || !audioContext || audioContext.state !== "running") {
    console.warn(`[Audio debug] Turn Sound On before testing ${noteName}`);
    return null;
  }

  stopCurrentAudio();
  const buffer = audioBuffers.get(pitch.index);
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  gain.gain.value = 1;
  source.connect(gain);
  gain.connect(audioContext.destination);
  source.addEventListener("ended", () => {
    if (activeAudioSource?.source === source) activeAudioSource = null;
    console.log(`[Audio debug] ${noteName} raw cached playback ended`);
  }, { once: true });
  source.start();
  activeAudioSource = { source, gain };
  console.log(`[Audio debug] Raw ${noteName}: ${path}, ${buffer.duration.toFixed(3)}s`);
  return { note: noteName, path, duration: buffer.duration };
}

window.audioDebug = {
  playF5: () => playRawDebugNote("F5"),
  playG5: () => playRawDebugNote("G5"),
  playA5: () => playRawDebugNote("A5"),
  durations: () => Object.fromEntries(["F5", "G5", "A5"].map((name) => {
    const pitch = byName[name];
    return [name, audioBuffers.get(pitch.index)?.duration ?? null];
  })),
};

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
  return el("line", {
    x1, y1, x2, y2,
    stroke: color,
    "stroke-width": width,
    "pointer-events": "none",
  });
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

function drawGuideNotes(parent) {
  if (!state.guideNotesVisible) return;

  const group = el("g", { class: "guide-notes", "aria-label": "Staff guide notes" });
  for (const guide of GUIDE_NOTES) {
    if (hiddenGuideNoteIds.has(guide.id)) continue;
    const y = pitchY(byName[guide.pitch]);
    group.append(el("rect", {
      x: 3,
      y: y - STEP * 0.48,
      width: 44,
      height: STEP * 0.96,
      rx: 7,
      fill: "transparent",
      class: "guide-note-hit",
      tabindex: 0,
      role: "button",
      "data-guide-id": guide.id,
      "aria-label": `${guide.clef} ${guide.type} guide note ${guide.label}; press twice quickly to hide`,
    }));
    addText(group, GUIDE_NOTE_X, y, guide.label, GUIDE_NOTE_FONT_SIZE, {
      anchor: "middle",
      baseline: "central",
      weight: 700,
      fill: "#777777",
    }).setAttribute("pointer-events", "none");
  }
  parent.append(group);
}

function drawStaffClickZone(parent) {
  parent.append(el("rect", {
    x: STAFF_CLICK_X_MIN,
    y: STAFF_CLICK_Y_MIN,
    width: STAFF_CLICK_X_MAX - STAFF_CLICK_X_MIN,
    height: STAFF_CLICK_Y_MAX - STAFF_CLICK_Y_MIN,
    fill: "transparent",
    class: "staff-click-zone",
    role: "button",
    "aria-label": "Select the nearest natural note on the staff",
  }));
}

function ledgerSteps(pitch) {
  const step = pitch.index - 14;
  if (step > 10) return Array.from({ length: Math.floor((step - 10) / 2) }, (_, i) => 12 + i * 2);
  if (step < -10) return Array.from({ length: Math.floor((-10 - step) / 2) }, (_, i) => -12 - i * 2);
  return step === 0 ? [0] : [];
}

function drawSelectedNote(parent, pitch, draggable = false, dragging = false) {
  const y = pitchY(pitch);
  for (const step of ledgerSteps(pitch)) {
    parent.append(line(
      NOTE_X - LEDGER_HALF_WIDTH,
      pitchY(14) - step * STEP,
      NOTE_X + LEDGER_HALF_WIDTH,
      pitchY(14) - step * STEP,
      4,
    ));
  }
  parent.append(el("ellipse", {
    cx: NOTE_X, cy: y, rx: 30.76, ry: 21.09, fill: "#121212",
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
    "pointer-events": "none",
  }));
}

function drawSlider(parent, selectedIndex) {
  parent.append(line(SLIDER_X, TOP + STEP / 2, SLIDER_X, BOTTOM - STEP / 2, 10, "#333"));
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

function render() {
  svg.replaceChildren();
  svg.append(el("rect", { width: 1000, height: 720, fill: "#fffdf5" }));
  const selectedPitch = pitches[state.selectedIndex];
  drawGrandStaff(svg);
  drawGuideNotes(svg);
  drawStaffClickZone(svg);
  drawArrow(svg, selectedPitch, selectedPitch);
  drawSelectedNote(svg, selectedPitch, true, state.dragSource === "staff");
  drawKeyboard(svg, state.selectedIndex);
  drawSliderToKeyArrow(svg, selectedPitch);
  drawSlider(svg, state.selectedIndex);

  selectedLabel.textContent = selectedPitch.label;
}

function syncGuideControls() {
  guideNotesToggle.setAttribute("aria-pressed", String(state.guideNotesVisible));
  guideNotesToggle.textContent = `Guide Notes: ${state.guideNotesVisible ? "On" : "Off"}`;
  resetGuideNotes.disabled = hiddenGuideNoteIds.size === 0;
}

function handleGuideNotePress(guideId) {
  const now = performance.now();
  if (guideId === lastGuidePressId && now - lastGuidePressAt <= GUIDE_DOUBLE_PRESS_MS) {
    hiddenGuideNoteIds.add(guideId);
    lastGuidePressId = null;
    lastGuidePressAt = 0;
    syncGuideControls();
    render();
    return;
  }
  lastGuidePressId = guideId;
  lastGuidePressAt = now;
}

function updateSelection(noteIndex, options = {}) {
  const { playSound = true } = options;
  const nextIndex = Math.max(0, Math.min(28, noteIndex));
  const changed = nextIndex !== state.selectedIndex;
  audioSelectionVersion += 1;
  cancelPendingAudio();
  state.selectedIndex = nextIndex;
  if (changed) {
    render();
    if (playSound) playPitch(nextIndex, { selectionToken: audioSelectionVersion });
  }
}

function shouldPlayDragNote(noteIndex) {
  return noteIndex !== state.selectedIndex;
}

function beginDrag(source) {
  state.dragSource = source;
}

function pointerToNaturalIndex(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(svg.getScreenCTM().inverse());
  return Math.max(0, Math.min(28, Math.round((BOTTOM - local.y) / STEP - 0.5)));
}

svg.addEventListener("pointerdown", (event) => {
  if (event.target.classList.contains("guide-note-hit")) {
    handleGuideNotePress(event.target.dataset.guideId);
    event.preventDefault();
    return;
  }
  if (event.target.classList.contains("slider-hit")) {
    beginDrag("slider");
    svg.setPointerCapture(event.pointerId);
    updateSelection(pointerToNaturalIndex(event));
    event.preventDefault();
    return;
  }
  if (event.target.classList.contains("staff-note-hit")) {
    beginDrag("staff");
    svg.setPointerCapture(event.pointerId);
    // Replay an intentional staff-note press immediately. Pointerup only ends
    // the drag and never produces audio.
    updateSelection(state.selectedIndex, { playSound: false });
    playPitch(state.selectedIndex, {
      forceReplay: true,
      bypassThrottle: true,
      selectionToken: audioSelectionVersion,
    });
    render();
    event.preventDefault();
    return;
  }
  if (event.target.classList.contains("staff-click-zone")) {
    beginDrag("staff-zone");
    svg.setPointerCapture(event.pointerId);
    const noteIndex = pointerToNaturalIndex(event);
    updateSelection(noteIndex, { playSound: false });
    playPitch(noteIndex, {
      forceReplay: true,
      bypassThrottle: true,
      selectionToken: audioSelectionVersion,
    });
    event.preventDefault();
    return;
  }
  if (event.target.classList.contains("white-key")) {
    beginDrag("keyboard");
    svg.setPointerCapture(event.pointerId);
    const noteIndex = Number(event.target.dataset.index);
    updateSelection(noteIndex, { playSound: false });
    playPitch(noteIndex, {
      forceReplay: true,
      bypassThrottle: true,
      selectionToken: audioSelectionVersion,
    });
    event.preventDefault();
  }
});

svg.addEventListener("pointermove", (event) => {
  if (!state.dragSource) return;
  const coalescedEvents = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
  const latestEvent = coalescedEvents.length
    ? coalescedEvents[coalescedEvents.length - 1]
    : event;
  const nextIndex = pointerToNaturalIndex(latestEvent);
  if (shouldPlayDragNote(nextIndex)) {
    updateSelection(nextIndex);
  }
  event.preventDefault();
});

function finishDrag(event) {
  if (!state.dragSource) return;
  cancelPendingAudio();
  state.dragSource = null;
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  render();
}

svg.addEventListener("pointerup", finishDrag);
svg.addEventListener("pointercancel", finishDrag);

svg.addEventListener("keydown", (event) => {
  if (event.target.classList.contains("guide-note-hit") && (event.key === "Enter" || event.key === " ")) {
    handleGuideNotePress(event.target.dataset.guideId);
    event.preventDefault();
    return;
  }
  if (event.target.classList.contains("white-key") && (event.key === "Enter" || event.key === " ")) {
    const noteIndex = Number(event.target.dataset.index);
    updateSelection(noteIndex, { playSound: false });
    playPitch(noteIndex, {
      forceReplay: true,
      bypassThrottle: true,
      selectionToken: audioSelectionVersion,
    });
    event.preventDefault();
  }
  if (event.target.classList.contains("slider-hit") && ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) {
    const delta = ["ArrowUp", "ArrowRight"].includes(event.key) ? 1 : -1;
    updateSelection(state.selectedIndex + delta);
    event.preventDefault();
  }
  if (event.target.classList.contains("staff-note-hit") && ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) {
    const delta = ["ArrowUp", "ArrowRight"].includes(event.key) ? 1 : -1;
    updateSelection(state.selectedIndex + delta);
    event.preventDefault();
  }
});

guideNotesToggle.addEventListener("click", () => {
  state.guideNotesVisible = !state.guideNotesVisible;
  lastGuidePressId = null;
  lastGuidePressAt = 0;
  syncGuideControls();
  render();
});

resetGuideNotes.addEventListener("click", () => {
  hiddenGuideNoteIds.clear();
  lastGuidePressId = null;
  lastGuidePressAt = 0;
  syncGuideControls();
  render();
});

soundToggle.addEventListener("click", async () => {
  if (state.soundEnabled) {
    state.soundEnabled = false;
    soundToggle.setAttribute("aria-pressed", "false");
    soundToggle.textContent = "🔇 Sound Off";
    stopCurrentAudio();
    setSoundStatus("");
    console.log("[Audio] Sound disabled");
    return;
  }

  state.soundEnabled = true;
  soundToggle.setAttribute("aria-pressed", "true");
  soundToggle.textContent = "🔊 Sound On";
  setSoundStatus("Loading sound…");

  try {
    ensureAudioContext();
    const preloadPromise = preloadAudioBuffers();
    await Promise.race([
      audioContext.resume(),
      new Promise((_, reject) => window.setTimeout(
        () => reject(new Error("Audio unlock timed out")),
        AUDIO_UNLOCK_TIMEOUT_MS,
      )),
    ]);
    if (audioContext.state !== "running") throw new Error("Audio context is not running");
    console.log("[Audio] Sound enabled and audio context unlocked");

    const failures = await preloadPromise;
    if (!state.soundEnabled) return;
    console.log(`[Audio] Preloaded ${audioBuffers.size} note files`);
    if (failures.length) setSoundStatus("Some sounds failed to load", true);
    else setSoundStatus("");

    // Confirm sound using the note already shown by the staff, key, and slider.
    // Middle C is only a defensive fallback if selection state is unavailable.
    const currentNoteIndex = Number.isInteger(state.selectedIndex)
      ? state.selectedIndex
      : byName.C4.index;
    playPitch(currentNoteIndex, {
      forceReplay: true,
      bypassThrottle: true,
      selectionToken: audioSelectionVersion,
    });
  } catch (error) {
    state.soundEnabled = false;
    soundToggle.setAttribute("aria-pressed", "false");
    soundToggle.textContent = "🔇 Sound Off";
    setSoundStatus("Browser blocked audio — tap Sound On again", true);
    console.warn("[Audio] Initial Sound On unlock failed", error);
  }
});

syncGuideControls();
render();

// Fetch and decode every note immediately. The context remains suspended and
// nothing can play until the student explicitly taps Sound On.
setSoundStatus("Loading sounds...");
preloadAudioBuffers().then((failures) => {
  if (state.soundEnabled) return;
  if (failures.length) setSoundStatus("Some sounds failed to load", true);
  else setSoundStatus("Sounds ready", false, 1800);
}).catch((error) => {
  console.warn("[Audio] Sound preload failed", error);
  setSoundStatus("Sounds failed to load", true);
});

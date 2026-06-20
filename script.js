"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const CANVAS_HEIGHT = 825;
const MUSIC_Y_OFFSET = 80;
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
const STAFF_GROUP_X_OFFSET = 70;
const NOTE_X = 400;
const LEDGER_HALF_WIDTH = 54.9; // 10% shorter than the previous 61px half-width.
const STAFF_CLICK_X_MIN = 355;
const STAFF_CLICK_X_MAX = 505;
const STAFF_CLICK_Y_MIN = TOP;
const STAFF_CLICK_Y_MAX = BOTTOM;
// Keep the complete keyboard/slider teaching group clear of the right frame.
const RIGHT_GROUP_X_OFFSET = -30;
const KEY_X = 684 + RIGHT_GROUP_X_OFFSET;
const KEY_WIDTH = 198;
const SLIDER_X = 946 + RIGHT_GROUP_X_OFFSET;
const SLIDER_HIGH_LABEL_Y = 30;
const GUIDE_LINE_NOTE_X = 17;
const GUIDE_SPACE_NOTE_X = 38;
const GUIDE_NOTE_FONT_SIZE = 18;
const GUIDE_DOUBLE_PRESS_MS = 400;

// Experimental, removable visual-memory overlays. Every item's Y position is
// derived from pitchY(), so the poster geography follows the notation exactly.
const VISUAL_NOTE_ASSET_BASE = "src/assets/guide-note-visuals";
const VISUAL_NOTE_OVERLAYS = [
  { note: "C6", type: "clouds", asset: "clouds-c6.png", x: 305, width: 285, height: 100, anchorY: 0.78, opacity: 0.48, label: "clouds", descriptor: ["In the", "Clouds"] },
  { note: "C5", type: "seagull", asset: "seagull-c5.png", x: 420, yOffset: -13.8, descriptorYOffset: 13.8, width: 118, height: 92, anchorY: 0.55, opacity: 0.5, label: "C gull", descriptor: ["\"C\"gull"] },
  { note: "G4", type: "boat-guitar", asset: "guitarist-boat-g4.png", x: 263.75, width: 125, height: 150, anchorY: 0.55, opacity: 0.5, label: "guitar boat", descriptor: ["Guitar"] },
  { note: "C4", type: "middle-sea", x: 0, yOffset: 0, scale: 1, opacity: 0.62, label: "middle sea", descriptor: ["Middle", "\"Sea\""] },
  { note: "F3", type: "fish", asset: "fish-f4.png", x: 445, width: 108, height: 88, anchorY: 0.5, opacity: 0.5, label: "fish", descriptor: ["Fish"] },
  { note: "C3", type: "seaweed", asset: "seaweed-c3.png", x: 270, width: 120, height: 100, anchorY: 0.48, opacity: 0.46, label: "C weed", descriptor: ["\"C\"weed"] },
  { note: "C2", type: "treasure", asset: "treasure-chest-c2.png", x: 350, width: 130, height: 135, anchorY: 0.63, opacity: 0.54, label: "deep sea treasure chest", descriptor: ["Deep \"C\"", "Treasure", "Chest"] },
];

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
  lineNotesVisible: false,
  spaceNotesVisible: false,
  visualNotesEnabled: false,
  testModeEnabled: false,
};

const svg = document.getElementById("musicBoard");
const selectedLabel = document.getElementById("selectedLabel");
const soundToggle = document.getElementById("soundToggle");
const soundStatus = document.getElementById("soundStatus");
const lineNotesToggle = document.getElementById("lineNotesToggle");
const spaceNotesToggle = document.getElementById("spaceNotesToggle");
const visualNotesToggle = document.getElementById("visualNotesToggle");
const appShell = document.querySelector(".app-shell");
const resetGuideNotes = document.getElementById("resetGuideNotes");
const testModeToggle = document.getElementById("testModeToggle");
const hiddenGuideNoteIds = new Set();
const audioBuffers = new Map();
let audioContext = null;
let audioPreloadPromise = null;
let activeAudioSource = null;
let lastAudioStart = 0;
let audioSelectionVersion = 0;
let pendingAudioTimer = null;
let lastDragSoundPlayedNoteIndex = null;
let currentDragHasPlayedCurrentNote = false;
let lastDragPointer = null;
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
      if (state.dragSource && index === state.selectedIndex) {
        lastDragSoundPlayedNoteIndex = index;
        currentDragHasPlayedCurrentNote = true;
      }
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
  if (!state.lineNotesVisible && !state.spaceNotesVisible) return;

  const group = el("g", { class: "guide-notes", "aria-label": "Staff guide notes" });
  for (const guide of GUIDE_NOTES) {
    if (guide.type === "line" && !state.lineNotesVisible) continue;
    if (guide.type === "space" && !state.spaceNotesVisible) continue;
    if (hiddenGuideNoteIds.has(guide.id)) continue;
    const y = pitchY(byName[guide.pitch]);
    const isLine = guide.type === "line";
    const x = isLine ? GUIDE_LINE_NOTE_X : GUIDE_SPACE_NOTE_X;
    group.append(el("rect", {
      x: isLine ? 2 : 28,
      y: y - STEP * 0.48,
      width: isLine ? 28 : 21,
      height: STEP * 0.96,
      rx: 7,
      fill: "transparent",
      class: "guide-note-hit",
      tabindex: 0,
      role: "button",
      "data-guide-id": guide.id,
      "aria-label": `${guide.clef} ${guide.type} guide note ${guide.label}; press twice quickly to hide`,
    }));
    addText(group, x, y, guide.label, GUIDE_NOTE_FONT_SIZE, {
      anchor: "middle",
      baseline: "central",
      weight: 700,
      fill: "#777777",
    }).setAttribute("pointer-events", "none");
  }
  parent.append(group);
}

function appendVisualShape(parent, name, attributes) {
  const shape = el(name, {
    ...attributes,
    "pointer-events": "none",
    "vector-effect": "non-scaling-stroke",
  });
  parent.append(shape);
  return shape;
}

function drawCloudCluster(parent) {
  const cloud = (x, y, scale) => {
    const group = el("g", { transform: `translate(${x} ${y}) scale(${scale})` });
    appendVisualShape(group, "rect", {
      x: -48, y: -3, width: 96, height: 26, rx: 13,
      fill: "#e8f7ff", stroke: "#65a9d2", "stroke-width": 2.5,
    });
    for (const circle of [
      { cx: -27, cy: -4, r: 21 },
      { cx: 0, cy: -15, r: 30 },
      { cx: 29, cy: -5, r: 20 },
    ]) {
      appendVisualShape(group, "circle", {
        ...circle, fill: "#f6fcff", stroke: "#65a9d2", "stroke-width": 2.5,
      });
    }
    appendVisualShape(group, "path", {
      d: "M-43 16 Q-18 29 0 18 Q20 31 43 15",
      fill: "none", stroke: "#99d4ef", "stroke-width": 7, "stroke-linecap": "round",
    });
    parent.append(group);
  };
  cloud(-78, 3, 0.82);
  cloud(75, 8, 0.65);
}

function drawSeagull(parent) {
  appendVisualShape(parent, "path", {
    d: "M-45 3 Q-25 -25 -4 -4 Q17 -29 42 -5 Q18 -12 -2 8 Q-21 -10 -45 3 Z",
    fill: "#f8fbff", stroke: "#506b78", "stroke-width": 3,
    "stroke-linejoin": "round",
  });
  appendVisualShape(parent, "ellipse", {
    cx: 4, cy: 7, rx: 27, ry: 11,
    fill: "#f8fbff", stroke: "#506b78", "stroke-width": 2.5,
  });
  appendVisualShape(parent, "circle", {
    cx: 27, cy: 0, r: 8, fill: "#ffffff", stroke: "#506b78", "stroke-width": 2,
  });
  appendVisualShape(parent, "circle", { cx: 30, cy: -2, r: 1.8, fill: "#24323a" });
  appendVisualShape(parent, "path", {
    d: "M35 1 L48 5 L35 8 Z", fill: "#f5a623", stroke: "#b46d00", "stroke-width": 1.5,
  });
  appendVisualShape(parent, "path", {
    d: "M-20 14 L-38 25 L-9 18", fill: "#d8e4ea", stroke: "#506b78", "stroke-width": 2,
  });
}

function drawBoatGuitar(parent) {
  appendVisualShape(parent, "path", {
    d: "M-62 20 Q0 56 64 19 L49 43 Q0 68 -49 43 Z",
    fill: "#e79b74", stroke: "#704b3b", "stroke-width": 3, "stroke-linejoin": "round",
  });
  appendVisualShape(parent, "path", {
    d: "M-45 30 Q0 47 48 29", fill: "none", stroke: "#fff5de", "stroke-width": 5,
    "stroke-linecap": "round",
  });
  appendVisualShape(parent, "line", {
    x1: -28, y1: 22, x2: -28, y2: -43, stroke: "#704b3b", "stroke-width": 3,
  });
  appendVisualShape(parent, "path", {
    d: "M-24 -38 L-24 7 L27 7 Z",
    fill: "#fff4ce", stroke: "#c6864c", "stroke-width": 2.5, "stroke-linejoin": "round",
  });
  appendVisualShape(parent, "circle", {
    cx: 8, cy: -13, r: 9, fill: "#f4c49a", stroke: "#75503d", "stroke-width": 2,
  });
  appendVisualShape(parent, "path", {
    d: "M1 -21 Q9 -31 18 -20", fill: "none", stroke: "#6c4735", "stroke-width": 5,
    "stroke-linecap": "round",
  });
  appendVisualShape(parent, "line", {
    x1: 8, y1: -3, x2: 5, y2: 20, stroke: "#75503d", "stroke-width": 4,
    "stroke-linecap": "round",
  });
  appendVisualShape(parent, "circle", {
    cx: 24, cy: 9, r: 13, fill: "#d2773f", stroke: "#6f4027", "stroke-width": 2.5,
  });
  appendVisualShape(parent, "circle", {
    cx: 18, cy: 5, r: 8, fill: "#e5904f", stroke: "#6f4027", "stroke-width": 2,
  });
  appendVisualShape(parent, "line", {
    x1: 30, y1: 1, x2: 58, y2: -20, stroke: "#6f4027", "stroke-width": 5,
    "stroke-linecap": "round",
  });
  appendVisualShape(parent, "line", {
    x1: 32, y1: 1, x2: 59, y2: -19, stroke: "#f6d7a9", "stroke-width": 1.3,
  });
}

function middleSeaPath(y, startX = 52, endX = 510, waveCount = 14, amplitude = 8) {
  const halfWave = (endX - startX) / (waveCount * 2);
  let path = `M${startX} ${y}`;
  for (let index = 0; index < waveCount; index += 1) {
    path += ` q${halfWave / 2} ${-amplitude} ${halfWave} 0 q${halfWave / 2} ${amplitude} ${halfWave} 0`;
  }
  return path;
}

function drawMiddleSea(parent, y) {
  appendVisualShape(parent, "rect", {
    x: 52, y: y + 5, width: 458, height: BOTTOM - y - 2,
    fill: "#bfe9f7", opacity: 0.18,
  });
  appendVisualShape(parent, "path", {
    d: middleSeaPath(y), fill: "none", stroke: "#1684c1", "stroke-width": 7,
    "stroke-linecap": "round", "stroke-linejoin": "round",
    class: "visual-middle-sea-wave",
  });
  appendVisualShape(parent, "path", {
    d: middleSeaPath(y + 11, 52, 510, 14, 7), fill: "none", stroke: "#72c7e8", "stroke-width": 2.5,
    "stroke-linecap": "round", opacity: 0.7,
  });
  for (const bubble of [
    { cx: 478, cy: y + 42, r: 5 },
    { cx: 492, cy: y + 65, r: 3 },
    { cx: 462, cy: y + 78, r: 4 },
  ]) {
    appendVisualShape(parent, "circle", {
      ...bubble, fill: "#eafaff", stroke: "#3ba6d3", "stroke-width": 2,
    });
  }
}

function drawVisualDescriptor(parent, visual, y) {
  if (!visual.descriptor) return;
  y += visual.descriptorYOffset || 0;
  const lineHeight = 13;
  const firstLineY = y - ((visual.descriptor.length - 1) * lineHeight) / 2;
  visual.descriptor.forEach((text, index) => {
    const descriptor = addText(parent, 520, firstLineY + index * lineHeight, text, 12, {
      anchor: "start",
      baseline: "central",
      weight: 500,
      fill: "#969696",
    });
    descriptor.setAttribute("class", "visual-note-descriptor");
    descriptor.setAttribute("opacity", "0.58");
    descriptor.setAttribute("pointer-events", "none");
  });
}

function drawSeaweed(parent) {
  const seaweed = (x, lean, color) => {
    appendVisualShape(parent, "path", {
      d: `M${x} 30 C${x - lean} 13 ${x + lean} 0 ${x - 2} -18 C${x - 10} -31 ${x + 9} -38 ${x + 2} -49`,
      fill: "none", stroke: color, "stroke-width": 5, "stroke-linecap": "round",
    });
  };
  seaweed(-31, 11, "#4c9c70");
  seaweed(-10, -10, "#75aa62");
  seaweed(12, 9, "#3f8f79");
  appendVisualShape(parent, "path", {
    d: "M-50 32 Q-5 22 47 32", fill: "none", stroke: "#c9aa76", "stroke-width": 7,
    "stroke-linecap": "round",
  });
  for (const bubble of [
    { cx: 34, cy: -26, r: 4 },
    { cx: 43, cy: -42, r: 2.8 },
  ]) {
    appendVisualShape(parent, "circle", {
      ...bubble, fill: "#ecfbff", stroke: "#3ba6d3", "stroke-width": 2,
    });
  }
}

function drawFish(parent) {
  // The body is centered at y=0 so its visual center exactly follows F3.
  appendVisualShape(parent, "ellipse", {
    cx: 0, cy: 0, rx: 44, ry: 25,
    fill: "#ffd99b", stroke: "#9a6a2f", "stroke-width": 3,
    class: "visual-fish-body",
  });
  appendVisualShape(parent, "path", {
    d: "M-42 0 L-69 -23 L-65 0 L-69 23 Z",
    fill: "#ffc875", stroke: "#9a6a2f", "stroke-width": 3, "stroke-linejoin": "round",
  });
  appendVisualShape(parent, "path", {
    d: "M-10 -23 Q1 -38 14 -23 M-9 23 Q2 35 15 22",
    fill: "none", stroke: "#c98539", "stroke-width": 3, "stroke-linecap": "round",
  });
  appendVisualShape(parent, "circle", { cx: 26, cy: -6, r: 3.4, fill: "#56452f" });
  appendVisualShape(parent, "path", {
    d: "M34 7 Q26 13 18 8", fill: "none", stroke: "#9a6a2f", "stroke-width": 2.5,
    "stroke-linecap": "round",
  });
  appendVisualShape(parent, "path", {
    d: "M-20 -18 Q-8 0 -20 18 M-6 -22 Q7 0 -6 22",
    fill: "none", stroke: "#e6a454", "stroke-width": 2.3, "stroke-linecap": "round",
  });
  for (const bubble of [
    { cx: 52, cy: -23, r: 4.5 },
    { cx: 62, cy: -38, r: 3 },
  ]) {
    appendVisualShape(parent, "circle", {
      ...bubble, fill: "#effcff", stroke: "#54a8ca", "stroke-width": 2,
    });
  }
}

function drawTreasureChest(parent) {
  appendVisualShape(parent, "ellipse", {
    cx: 0, cy: 29, rx: 64, ry: 12, fill: "#b89b6a", opacity: 0.45,
  });
  appendVisualShape(parent, "path", {
    d: "M-49 -2 Q-47 -39 0 -43 Q47 -39 49 -2 Z",
    fill: "#a95f31", stroke: "#62391f", "stroke-width": 4,
  });
  appendVisualShape(parent, "rect", {
    x: -52, y: -3, width: 104, height: 47, rx: 7,
    fill: "#bd6f35", stroke: "#62391f", "stroke-width": 4,
  });
  appendVisualShape(parent, "path", {
    d: "M-50 9 H50 M-33 -32 V42 M32 -32 V42",
    fill: "none", stroke: "#f1c34f", "stroke-width": 7,
  });
  appendVisualShape(parent, "rect", {
    x: -10, y: 5, width: 20, height: 22, rx: 4,
    fill: "#ffd75e", stroke: "#75541b", "stroke-width": 2.5,
  });
  appendVisualShape(parent, "circle", { cx: 0, cy: 14, r: 3, fill: "#75541b" });
  for (const coin of [
    { cx: -35, cy: -35, r: 7 },
    { cx: -18, cy: -47, r: 6 },
    { cx: 7, cy: -49, r: 8 },
    { cx: 31, cy: -38, r: 6 },
  ]) {
    appendVisualShape(parent, "circle", {
      ...coin, fill: "#ffd75e", stroke: "#a46f13", "stroke-width": 2,
    });
  }
}

function drawVisualNoteArt(parent, visual) {
  const y = pitchY(byName[visual.note]) + (visual.yOffset || 0);
  if (visual.type === "middle-sea") {
    const seaGroup = el("g", {
      class: "visual-note-art visual-note-middle-sea",
      opacity: visual.opacity,
      "pointer-events": "none",
      "aria-label": `${visual.note}: ${visual.label}`,
    });
    drawMiddleSea(seaGroup, y);
    parent.append(seaGroup);
    drawVisualDescriptor(parent, visual, y);
    return;
  }

  if (visual.asset) {
    parent.append(el("image", {
      class: `visual-note-art visual-note-image visual-note-${visual.type}`,
      href: `${VISUAL_NOTE_ASSET_BASE}/${visual.asset}`,
      x: visual.x - visual.width / 2,
      y: y - visual.height * visual.anchorY,
      width: visual.width,
      height: visual.height,
      opacity: visual.opacity,
      preserveAspectRatio: "xMidYMid meet",
      "pointer-events": "none",
      "aria-label": `${visual.note}: ${visual.label}`,
    }));
    drawVisualDescriptor(parent, visual, y);
    return;
  }

  const art = el("g", {
    class: `visual-note-art visual-note-${visual.type}`,
    transform: `translate(${visual.x} ${y}) scale(${visual.scale})`,
    opacity: visual.opacity,
    "pointer-events": "none",
    "aria-label": `${visual.note}: ${visual.label}`,
  });
  if (visual.type === "clouds") drawCloudCluster(art);
  if (visual.type === "seagull") drawSeagull(art);
  if (visual.type === "boat-guitar") drawBoatGuitar(art);
  if (visual.type === "fish") drawFish(art);
  if (visual.type === "seaweed") drawSeaweed(art);
  if (visual.type === "treasure") drawTreasureChest(art);
  parent.append(art);
}

function renderVisualNotesOverlay(parent) {
  if (!state.visualNotesEnabled) return;

  const group = el("g", {
    class: "visual-notes-overlay",
    "aria-label": "Visual note memory aids",
    "pointer-events": "none",
  });
  for (const visual of VISUAL_NOTE_OVERLAYS) drawVisualNoteArt(group, visual);
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
    // Follow the translated staff group while retaining the same clear gap
    // between the arrowhead, notehead, and any ledger line.
    x1: KEY_X - 8, y1: pitchY(keyPitch), x2: 492 + STAFF_GROUP_X_OFFSET, y2: pitchY(staffPitch),
    stroke: "#121212", "stroke-width": 5, "stroke-linecap": "round", "marker-end": "url(#arrowhead)",
    "pointer-events": "none",
  }));
}

function drawSlider(parent, selectedIndex) {
  parent.append(line(SLIDER_X, TOP + STEP / 2, SLIDER_X, BOTTOM - STEP / 2, 10, "#333"));
  addText(parent, SLIDER_X, SLIDER_HIGH_LABEL_Y, "High C", 16, { anchor: "middle" });
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
  svg.append(el("rect", { width: 1000, height: CANVAS_HEIGHT, fill: "#fffdf5" }));
  const selectedPitch = pitches[state.selectedIndex];
  const musicLayer = el("g", { transform: `translate(0 ${MUSIC_Y_OFFSET})` });
  const staffGroup = el("g", { transform: `translate(${STAFF_GROUP_X_OFFSET} 0)` });
  renderVisualNotesOverlay(staffGroup);
  drawGrandStaff(staffGroup);
  drawGuideNotes(staffGroup);
  drawStaffClickZone(staffGroup);
  musicLayer.append(staffGroup);
  if (!state.testModeEnabled) drawArrow(musicLayer, selectedPitch, selectedPitch);
  const noteGroup = el("g", { transform: `translate(${STAFF_GROUP_X_OFFSET} 0)` });
  drawSelectedNote(noteGroup, selectedPitch, true, state.dragSource === "staff");
  musicLayer.append(noteGroup);
  if (!state.testModeEnabled) {
    drawKeyboard(musicLayer, state.selectedIndex);
    drawSliderToKeyArrow(musicLayer, selectedPitch);
    drawSlider(musicLayer, state.selectedIndex);
  }
  svg.append(musicLayer);

  selectedLabel.textContent = selectedPitch.label;
  selectedLabel.classList.toggle("is-hidden", state.testModeEnabled);
}

function syncGuideControls() {
  lineNotesToggle.setAttribute("aria-pressed", String(state.lineNotesVisible));
  lineNotesToggle.textContent = `Line Notes: ${state.lineNotesVisible ? "On" : "Off"}`;
  spaceNotesToggle.setAttribute("aria-pressed", String(state.spaceNotesVisible));
  spaceNotesToggle.textContent = `Space Notes: ${state.spaceNotesVisible ? "On" : "Off"}`;
  visualNotesToggle.setAttribute("aria-pressed", String(state.visualNotesEnabled));
  resetGuideNotes.disabled = hiddenGuideNoteIds.size === 0;
}

function syncTestControls() {
  testModeToggle.setAttribute("aria-pressed", String(state.testModeEnabled));
  testModeToggle.textContent = `Test Mode: ${state.testModeEnabled ? "On" : "Off"}`;
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
    if (state.dragSource) currentDragHasPlayedCurrentNote = false;
    render();
    if (playSound) playPitch(nextIndex, { selectionToken: audioSelectionVersion });
  }
}

function shouldPlayDragNote(noteIndex) {
  return noteIndex !== state.selectedIndex;
}

function beginDrag(source, event) {
  state.dragSource = source;
  lastDragSoundPlayedNoteIndex = null;
  currentDragHasPlayedCurrentNote = false;
  const pointerEvent = latestPointerEvent(event);
  lastDragPointer = { clientX: pointerEvent.clientX, clientY: pointerEvent.clientY };
}

function latestPointerEvent(event) {
  const coalescedEvents = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
  const latestEvent = coalescedEvents.length
    ? coalescedEvents[coalescedEvents.length - 1]
    : event;
  return latestEvent && Number.isFinite(latestEvent.clientX) && Number.isFinite(latestEvent.clientY)
    ? latestEvent
    : event;
}

function pointerToNaturalIndex(event, source = state.dragSource) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(svg.getScreenCTM().inverse());
  const musicY = local.y - MUSIC_Y_OFFSET;

  // The slider, staff positions, and white-key centers deliberately share the
  // same vertical pitch grid. Keeping the source explicit makes release-time
  // reconciliation use the correct interaction's final pointer coordinate.
  if (!["slider", "staff", "staff-zone", "keyboard"].includes(source)) {
    return state.selectedIndex;
  }
  return Math.max(0, Math.min(28, Math.round((BOTTOM - musicY) / STEP - 0.5)));
}

svg.addEventListener("pointerdown", (event) => {
  if (event.target.classList.contains("guide-note-hit")) {
    handleGuideNotePress(event.target.dataset.guideId);
    event.preventDefault();
    return;
  }
  if (event.target.classList.contains("slider-hit")) {
    beginDrag("slider", event);
    svg.setPointerCapture(event.pointerId);
    updateSelection(pointerToNaturalIndex(event));
    event.preventDefault();
    return;
  }
  if (event.target.classList.contains("staff-note-hit")) {
    beginDrag("staff", event);
    svg.setPointerCapture(event.pointerId);
    // Replay an intentional staff-note press immediately. Release only adds a
    // correction if a fast final landing did not already sound during the drag.
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
    beginDrag("staff-zone", event);
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
    beginDrag("keyboard", event);
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
  const latestEvent = latestPointerEvent(event);
  lastDragPointer = { clientX: latestEvent.clientX, clientY: latestEvent.clientY };
  const nextIndex = pointerToNaturalIndex(latestEvent);
  if (shouldPlayDragNote(nextIndex)) {
    updateSelection(nextIndex);
  }
  event.preventDefault();
});

function finishDrag(event) {
  if (!state.dragSource) return;

  const dragSource = state.dragSource;
  const finalPointerEvent = event.type === "pointercancel" && lastDragPointer
    ? lastDragPointer
    : latestPointerEvent(event);
  const finalNoteIndex = pointerToNaturalIndex(finalPointerEvent, dragSource);

  // Invalidate the trailing throttled request before reconciling the final
  // pointer position. A fast fling can otherwise let an older note fire after
  // the visual has already landed on its final pitch.
  cancelPendingAudio();
  updateSelection(finalNoteIndex, { playSound: false });

  const finalLandingAlreadyPlayed = currentDragHasPlayedCurrentNote
    && lastDragSoundPlayedNoteIndex === finalNoteIndex;
  if (state.soundEnabled && !finalLandingAlreadyPlayed) {
    playPitch(finalNoteIndex, {
      forceReplay: true,
      bypassThrottle: true,
      selectionToken: audioSelectionVersion,
    });
  }

  state.dragSource = null;
  lastDragPointer = null;
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

lineNotesToggle.addEventListener("click", () => {
  state.lineNotesVisible = !state.lineNotesVisible;
  lastGuidePressId = null;
  lastGuidePressAt = 0;
  syncGuideControls();
  render();
});

spaceNotesToggle.addEventListener("click", () => {
  state.spaceNotesVisible = !state.spaceNotesVisible;
  lastGuidePressId = null;
  lastGuidePressAt = 0;
  syncGuideControls();
  render();
});

visualNotesToggle.addEventListener("click", () => {
  state.visualNotesEnabled = !state.visualNotesEnabled;
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

testModeToggle.addEventListener("click", () => {
  state.testModeEnabled = !state.testModeEnabled;
  syncTestControls();
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
syncTestControls();
render();

let viewportFitFrame = 0;

function fitAppToViewport() {
  if (!appShell) return;

  // Measure the design at its natural size; transforms do not affect these
  // layout dimensions, so this does not create a resize feedback loop.
  appShell.style.setProperty("--app-fit-scale", "1");
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const availableWidth = Math.max(1, window.innerWidth - 4);
  const availableHeight = Math.max(1, viewportHeight - 4);
  const naturalWidth = appShell.offsetWidth;
  const naturalHeight = appShell.offsetHeight;
  const scale = Math.min(
    1,
    availableWidth / naturalWidth,
    availableHeight / naturalHeight,
  );

  appShell.style.setProperty("--app-fit-scale", scale.toFixed(4));
}

function requestViewportFit() {
  window.cancelAnimationFrame(viewportFitFrame);
  viewportFitFrame = window.requestAnimationFrame(fitAppToViewport);
}

window.addEventListener("resize", requestViewportFit, { passive: true });
window.addEventListener("orientationchange", requestViewportFit, { passive: true });
window.visualViewport?.addEventListener("resize", requestViewportFit, { passive: true });
new ResizeObserver(requestViewportFit).observe(appShell);
document.fonts?.ready.then(requestViewportFit);
requestViewportFit();

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

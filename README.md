# Piano Note Slider

Piano Note Slider is an interactive piano/staff visualizer that shows the relationship between a vertical keyboard and the grand staff. It is a standalone static website built with HTML, CSS, JavaScript, and SVG.

## Features

- Draggable vertical note slider
- Clickable and vertically draggable piano keyboard
- Draggable staff note
- Natural notes only, from C2 through C6
- Optional local piano-note audio with a Sound On/Off control
- One-button Test Mode that hides the note name, keyboard, slider, arrows, and answer labels together
- Large, kid-friendly staff, keyboard, note label, and controls
- Mouse, touch, stylus, and keyboard support

## Run locally

No installation or build step is required.

### Open directly

Open `index.html` in a modern browser.

### Use a local server

From this project directory, run:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>.

Python is only used here as an optional local static-file server. The app itself has no Python or Streamlit dependency.

## Note audio files

Put one audio file for every natural note from C2 through C6 in the `audio/` folder. The bundled browser-ready files are named `C2.wav`, `D2.wav`, `E2.wav`, and so on through `C6.wav`; sharps and flats are not used.

The extension is configured near the top of `script.js` using `AUDIO_EXTENSION`. To use MP3 files named `C2.mp3` through `C6.mp3`, change that constant from `"wav"` to `"mp3"`.

Sound is off by default and begins only after the Sound On button is selected. Missing or unsupported files are skipped without interrupting the visualizer.

### Audio cleanup

Put the natural-note WAV files in `audio/`, then run:

```sh
python scripts/trim_audio_silence.py
```

The script uses only Python's standard library. On its first run, it copies the original WAV files to `audio_original/`, trims leading and trailing silence, adds small fades to prevent clicks, and overwrites the files in `audio/` with the same filenames. Later runs always rebuild from `audio_original/` rather than trimming an already-cleaned file. Existing backups are never overwritten.

To rebuild only one note from its backup, pass its filename, for example: `python scripts/trim_audio_silence.py G5.wav`.

## Deployment

This project can be hosted as a static site on Netlify, Vercel, or GitHub Pages. Publish the repository root; no build command is needed.

## Font license

The included Noto Music font is distributed under the SIL Open Font License. See `NotoMusic-OFL.txt`.

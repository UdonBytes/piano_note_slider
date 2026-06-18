# Piano Note Slider

Piano Note Slider is an interactive piano-learning tool that shows the relationship between a vertical keyboard and the grand staff. It is a standalone static website built with HTML, CSS, JavaScript, and SVG.

## Features

- Draggable vertical note slider
- Clickable and vertically draggable piano keyboard
- Draggable staff note
- Natural notes only, from C2 through C6
- Easy and Hard quiz modes with session scoring
- Large, kid-friendly staff, keyboard, labels, and feedback
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

## Deployment

This project can be hosted as a static site on Netlify, Vercel, or GitHub Pages. Publish the repository root; no build command is needed.

## Font license

The included Noto Music font is distributed under the SIL Open Font License. See `NotoMusic-OFL.txt`.

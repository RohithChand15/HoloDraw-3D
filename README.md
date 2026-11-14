# HOLODraw 3D — Holographic 2D/3D Gesture Studio

HOLODraw 3D is a next-generation web application that enables users to draw in 2D, create 3D volumetric geometric artwork, and manipulate holographic objects in real time using both hands through a standard laptop webcam.

Built with **MediaPipe Hand Landmarker**, **Three.js**, **Canvas API**, and **WebGL**, styled in a transparent sci-fi glassmorphism design with a dark navy background, neon cyan highlights, glowing borders, and procedural sound synthesis.

---

## 🌟 Key Features

### Phase 1 — Foundation, Hand Tracking & 2D Drawing
- **Dual-Hand Tracking**: Simultaneous real-time tracking of both hands with all 21 3D landmarks per hand.
- **Left / Right Identification**: Smart mapping between visual mirror and physical handedness.
- **GPU Acceleration**: Hardware-accelerated inference with automatic CPU fallback.
- **Adaptive Landmark Smoothing**: Adaptive One Euro velocity-sensitive low-pass filtering eliminating jitter and hand tremors without latency.
- **Geometric Gesture Recognition**:
  - ☝️ **Index Finger Raised**: Freehand 2D drawing / 3D spatial tube generation.
  - 🤏 **Thumb + Index Pinch**: Select and grab objects, move in 3D, push/pull depth.
  - ✋ **Open Palm**: Pause interaction, hover safely, navigate without drawing.
  - ✊ **Closed Fist**: Instantly cancel active drawing stroke or deselect active object.
- **Camera Preprocessing**: Real-time brightness and contrast sliders to optimize tracking in low-light environments.
- **Tracking Confidence & Loss Recovery**: Real-time confidence meters and graceful loss detection.
- **2D Vector Drawing**:
  - Freehand drawing with smooth quadratic Bézier curve interpolation.
  - Shape tools: Straight Line, Rectangle, Circle, Triangle.
  - Eraser with adjustable radius.
  - High-DPI canvas backing with Undo / Redo history stack.
  - Clear workspace with confirmation.
  - Screen-edge boundaries with visual dashed holographic bounding safezone.
  - **Full Mouse & Trackpad Fallback**: Full operation even without a webcam.

### Phase 2 — 3D Engine & Gesture Manipulation
- **3D Shape Library**:
  - 🟦 Cube
  - ⚪ Sphere
  - 🥫 Cylinder
  - 🔺 Cone
  - 🏛️ Pyramid (4-sided square-base pyramid)
  - 🍩 Torus
  - 🔲 Plane (Flat holographic quad with double-sided rendering)
  - ➰ Freehand 3D volumetric tubes (`CatmullRomCurve3` & `TubeGeometry`)
- **Spatial Holographic Materials**:
  - 🔮 Holographic Glass (`MeshPhysicalMaterial` with transmission, roughness, and rim glow)
  - 🌐 Neon Wireframe (Self-illuminating wireframe matrix)
  - 🪞 Metallic Chrome (High-specularity reflective metallic finish)
  - ⚡ Plasma Emissive (High-intensity pulsing emissive glow)
- **Raycasting Object Selection**: Point or pinch near an object to highlight with an animated neon bounding box. Closest-hit filtering prevents accidental occluded selection.
- **3D Movement & Depth**: Move objects across X and Y, and push/pull depth (Z axis) via secondary hand movement or hand distance.
- **Two-Hand Dual Manipulation**:
  - **Scaling**: Pinch with both hands and expand/contract distance between hands to resize with safety limits (0.25x - 4.5x).
  - **Rotation**: Tilt and orient hands relative to each other with angle unwrapping for continuous smooth rotation.
- **Object Duplication**: Quick cloning with holographic spawn offset (`D` key or button).
- **Vaporization Trash Zone**: 3D holographic disposal portal in the lower corner. Dragging any object into the zone highlights it and vaporizes it upon pinch release with full Undo support.
- **Virtual Workspace Cage**: Bounding volume keeping 3D objects securely within holographic studio limits.
- **Seamless 2D/3D Workspace Switching**: Switch between 2D Canvas, 3D Studio, and Split Dual view without losing state.

### Phase 3 — Holographic Experience & Advanced Studio Tools
- **Glassmorphism UI**: High-fidelity dark navy palette (`#030712`), neon cyan (`#00f5ff`), electric purple (`#a855f7`), and neon crimson (`#ff0055`) accents with `backdrop-filter: blur(14px)`.
- **Full 3D Object Inspector**: Real-time two-way synchronized inspector panel displaying object Name, Position (X, Y, Z), Rotation (X, Y, Z), Scale (X, Y, Z), Material type, Wireframe toggle, Visibility toggle, and Reset Transform button.
- **2D Artistic Brushes**:
  - 🌟 Neon Glow (Sci-fi luminous stroke with multi-tier glow pass)
  - 🖊️ Solid Pen (Crisp, clean vector-style stroke)
  - 💠 Cyber Dotted (Segmented digital pattern brush)
  - ✒️ Calligraphy (Dynamic angle-sensitive stroke)
- **Holographic Grid, Axes & Cyber Particles**: Animated ambient floor grid, RGB holographic coordinate axes helper, and subtle floating cyber particles.
- **Procedural Futuristic Sound Effects**: Built-in Web Audio API synthesizer for pinch, select, spawn, action, and trash vaporization (zero external audio files).
- **First-Time Interactive Tutorial & Shortcuts Modal**: Onboarding guide explaining gestures and fallbacks, plus dedicated keyboard shortcuts reference modal (`?` key).
- **Calibration Settings Modal**: Fine-tune MediaPipe confidence thresholds (Detection, Tracking, Presence), One Euro adaptive smoothing parameters (Min Cutoff, Beta), Camera device selection, resolution presets (720p, 1080p, 480p), target framerates (60, 30, 15 FPS), Graphics quality (High, Medium, Low), Camera exposure, toggle skeleton overlays, grid, axes, scanline, and audio with `localStorage` persistence.
- **Project Persistence**:
  - **Save Project**: Exports `.holodraw` JSON bundle preserving 2D raster artwork, 3D scene objects, transforms, materials, visibility, and camera state.
  - **Load Project**: Instant restoration of past sessions with schema validation.
- **Exports**:
  - **2D PNG Export**: High-resolution image export with custom holographic dark navy grid or transparent background.
  - **3D GLB Export**: Binary GLTF export compatible with Blender, Unreal Engine, Unity, and Windows 3D Viewer.
- **Fullscreen & Keyboard Shortcuts**: Comprehensive shortcut suite (1-7 creation, G/R/S/X/Y/Z/0 manipulation, Ctrl+A/Shift+A selection, H/C/W toggles).

---

## 💻 Target System Specifications

- **OS**: Windows 11
- **CPU**: Intel Core i5-210H / Modern multi-core CPU
- **GPU**: NVIDIA GeForce RTX 3050 6GB (or modern WebGL 2.0 GPU)
- **RAM**: 16 GB
- **Display**: 1920x1080 / 1280x720
- **Webcam**: Standard integrated laptop webcam or USB camera

---

## 📂 Project Architecture

```
d:\halogram 3d\
├── public/
│   ├── favicon.svg             # Holographic isometric cube icon
│   ├── models/
│   │   └── hand_landmarker.task # Local MediaPipe Float16 task model
│   └── wasm/                   # Local MediaPipe vision WASM binaries
│       ├── vision_wasm_internal.js
│       ├── vision_wasm_internal.wasm
│       ├── vision_wasm_module_internal.js
│       └── vision_wasm_module_internal.wasm
├── src/
│   ├── camera/
│   │   └── cameraManager.js    # Camera stream, mirroring, brightness, contrast & device/res switcher
│   ├── tracking/
│   │   ├── handLandmarker.js   # Dual-hand 21-landmark detector & skeleton cursor renderer
│   │   ├── gestureRecognizer.js# Precise geometric gesture analyzer
│   │   ├── landmarkFilter.js   # One Euro adaptive velocity-based low-pass landmark smoothing
│   │   └── confidenceMonitor.js# Tracking confidence, FPS, latency & loss recovery
│   ├── drawing2d/
│   │   └── drawingCanvas.js    # 2D freehand Bézier strokes, shape tools, brushes, undo/redo
│   ├── engine3d/
│   │   ├── threeScene.js       # Three.js scene, camera, lights, grid, axes, particles, trash
│   │   ├── shapeLibrary.js     # 8 Holographic primitives, material system & 3D curve generator
│   │   └── manipulator3d.js    # 3D selection, raycasting, two-hand scale/rot, bounds, undo
│   ├── export/
│   │   ├── exporter.js         # 2D PNG & 3D binary GLB exporters
│   │   └── projectManager.js   # Complete .holodraw JSON session save & load
│   ├── ui/
│   │   ├── soundFx.js          # Procedural Web Audio sci-fi sound synthesizer
│   │   ├── hudOverlay.js       # Real-time HUD meters, gesture badges, latency, toasts
│   │   ├── tutorialModal.js    # Interactive gesture instruction modal
│   │   ├── shortcutsModal.js   # Keyboard shortcuts reference modal
│   │   └── settingsModal.js    # Live calibration & sensitivity settings
│   ├── styles/
│   │   ├── main.css            # Layout, canvas stacking, scanline styling
│   │   ├── glassmorphism.css   # Glass panels, neon buttons, sliders, swatches, inspector
│   │   └── hud.css             # HUD meters, gesture chips, modal dialogs
│   └── app.js                  # Master application coordinator & animation loop
├── index.html                  # Holographic UI markup
├── vite.config.js              # Vite server & bundler configuration
└── package.json                # Project dependencies and scripts
```

---

## 🚀 Installation & Running

### 1. Prerequisites
Ensure **Node.js** (v18+ or v20+) and **npm** are installed.

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

### 4. Build for Production
```bash
npm run build
```
Production assets are generated in `dist/`. Preview with:
```bash
npm run preview
```

---

## ✋ Hand Gesture Guide

| Gesture | Pose | Action in 2D | Action in 3D |
| :--- | :--- | :--- | :--- |
| **DRAW** | ☝️ Index Finger Raised (others curled) | Freehand stroke / shapes | Draw 3D spatial tube |
| **SELECT / DRAG** | 🤏 Thumb & Index Pinch | Select / Move | Grab & drag 3D mesh (X, Y, Depth) |
| **DUAL PINCH** | 👐 Both hands pinching simultaneously | — | Two-hand Scaling & Rotation |
| **OPEN PALM** | ✋ All 5 fingers extended | Pause / Hover safely | Pause / Orbit inspection |
| **CLOSED FIST** | ✊ All fingers clenched into fist | Cancel active stroke | Deselect active object |

### Mouse & Trackpad Fallback
- **2D Drawing**: Left-click and drag to paint with active tool.
- **3D Selection**: Left-click any object to select.
- **3D Move**: Left-click and drag selected object across viewport.
- **3D Depth (Z-axis)**: Hold `Shift` + drag up/down.
- **3D Rotation**: Hold `Alt` + drag left/right/up/down.
- **3D Scaling**: Hold `Ctrl` + mouse wheel.
- **Camera Orbit**: Left-click on empty background or right-click to orbit camera.

---

## ⌨️ Keyboard Shortcuts Reference

### General
- `M`: Toggle Mode (2D -> 3D -> Split)
- `1`: Switch to 2D Mode
- `2`: Switch to 3D Mode
- `3`: Switch to Split Mode
- `Ctrl + Z`: Undo (2D stroke / 3D transform)
- `Ctrl + Y`: Redo (2D stroke / 3D transform)
- `Delete` / `Backspace`: Delete selected object
- `D`: Duplicate selected object
- `F`: Toggle Fullscreen
- `?`: Toggle Keyboard Shortcuts Guide
- `Esc`: Deselect / Close Modals

### Object Creation (3D Mode)
- `Shift + 1`: Create Cube
- `Shift + 2`: Create Sphere
- `Shift + 3`: Create Cylinder
- `Shift + 4`: Create Cone
- `Shift + 5`: Create Pyramid
- `Shift + 6`: Create Torus
- `Shift + 7`: Create Plane

### Transformations & Modes
- `G`: Grab / Move mode
- `R`: Rotate mode
- `S`: Scale mode
- `X`: Constrain to X-axis
- `Y`: Constrain to Y-axis
- `Z`: Constrain to Z-axis
- `0`: Reset transform (Position, Rotation, Scale)

### Selection & Display
- `Ctrl + A`: Select All objects
- `Ctrl + Shift + A`: Deselect All
- `H`: Hide / Show selected object
- `C`: Center camera on selected object
- `W`: Toggle Wireframe on selected object

---

## 🛠️ Troubleshooting

1. **Webcam permission denied**:
   - The application automatically switches to Mouse & Trackpad Fallback mode. Click the lock icon in your browser address bar to allow camera access, then click the camera button in the top bar.
2. **Low framerate in low-light environments**:
   - Open the **Settings** panel (gear icon) and increase the **Camera Brightness** and **Contrast** preprocessing sliders.
3. **Hand tracking jitter**:
   - In **Settings**, adjust the **One Euro Filter** smoothing parameters (Min Cutoff and Beta). Ensure hands are well-lit and within camera view.
4. **GLB Export**:
   - GLB files are saved as self-contained binary models compatible with Blender, Windows 3D Viewer, and three.js viewers.
   - ## 🛠️ Troubleshooting — npm is not recognized (Windows)

If you encounter this error:

```text
'npm' is not recognized as an internal or external command,
operable program or batch file.
```

It usually means Node.js is not installed or its installation directory is missing from the Windows PATH.

### Step 1: Download Node.js

Visit the official website:

https://nodejs.org/

Download and install the latest **LTS version**.

During installation:
- Keep the default installation settings.
- Ensure the option to add Node.js to PATH is enabled, if available.
- Complete the installation.

### Step 2: Restart the terminal

Close PowerShell, Command Prompt and VS Code terminals.

Reopen VS Code or PowerShell.

### Step 3: Verify Node.js and npm

Run:

```powershell
node -v
npm -v
```

Both commands should display version numbers.

### Step 4: If npm is still not recognized

Check whether Windows can locate Node.js:

```powershell
where.exe node
where.exe npm
```

If the commands cannot locate the files:

1. Open Windows Search.
2. Search for **Environment Variables**.
3. Select **Edit the system environment variables**.
4. Click **Environment Variables**.
5. Find the `Path` variable under User variables or System variables.
6. Check that the Node.js installation directory is included, commonly:

```text
C:\Program Files\nodejs\
```

7. If missing, add the correct installation directory.
8. Save the changes and restart your terminal.

If Node.js is not installed correctly, reinstall the LTS version from the official website.

### Step 5: Start HoloDraw 3D

After npm is working, navigate to the cloned project folder and run:

```bash
npm install
npm run dev
```

Open the local URL displayed in your terminal, usually:

```text
http://localhost:5173
```

Allow webcam access when requested.

**Note:** Never download Node.js or npm installers from unofficial websites.

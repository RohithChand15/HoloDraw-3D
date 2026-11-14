import * as THREE from 'three';
import { CameraManager } from './camera/cameraManager.js';
import { HandTrackingManager } from './tracking/handLandmarker.js';
import { DrawingCanvas2D } from './drawing2d/drawingCanvas.js';
import { ThreeScene } from './engine3d/threeScene.js';
import { ShapeLibrary } from './engine3d/shapeLibrary.js';
import { Manipulator3D } from './engine3d/manipulator3d.js';
import { Exporter } from './export/exporter.js';
import { ProjectManager } from './export/projectManager.js';
import { SoundFx } from './ui/soundFx.js';
import { HUDOverlay } from './ui/hudOverlay.js';
import { TutorialModal } from './ui/tutorialModal.js';
import { SettingsModal } from './ui/settingsModal.js';
import { ShortcutsModal } from './ui/shortcutsModal.js';

class HoloDrawApp {
  constructor() {
    this.mode = '2d'; // '2d' | '3d' | 'split'
    this.activeTool = 'freehand'; // 'freehand' | 'line' | 'rect' | 'circle' | 'triangle' | 'eraser' | 'select' | 'draw_3d'
    this.currentColor = '#00f5ff';

    // Core managers
    this.camera = null;
    this.tracking = null;
    this.canvas2d = null;
    this.scene3d = null;
    this.shapeLib = null;
    this.manipulator3d = null;
    this.projectManager = null;
    this.soundFx = null;
    this.hud = null;
    this.tutorialModal = null;
    this.settingsModal = null;
    this.shortcutsModal = null;

    // Overlay canvas
    this.overlayCanvas = null;
    this.overlayCtx = null;

    // Shared gesture state machine
    this.lastDrawState = false;
    this.isPaused = false;
  }

  async start() {
    console.log('%c[HOLODraw 3D] Launching Professional Holographic Studio (Phase 3)...', 'color: #00f5ff; font-weight: bold;');

    // 1. Audio and HUD
    this.soundFx = new SoundFx();
    this.hud = new HUDOverlay();

    // 2. Canvases & Overlay
    const videoEl = document.getElementById('camera-video');
    const drawCanvasEl = document.getElementById('drawing-canvas');
    const threeContainerEl = document.getElementById('three-canvas-container');
    this.overlayCanvas = document.getElementById('tracking-overlay-canvas');
    this.overlayCtx = this.overlayCanvas.getContext('2d');

    this.setupOverlayResize();

    // 3. 2D Drawing Engine
    this.canvas2d = new DrawingCanvas2D(drawCanvasEl);

    // 4. 3D WebGL Engine & Shape Library
    this.scene3d = new ThreeScene(threeContainerEl);
    this.shapeLib = new ShapeLibrary();
    this.manipulator3d = new Manipulator3D(this.scene3d, this.shapeLib);

    // Initial welcoming holographic cube
    const welcomeCube = this.shapeLib.createCube(1.4, '#00f5ff');
    welcomeCube.position.set(0, 0.2, 0);
    this.scene3d.addObject(welcomeCube);

    // 5. Project Management
    this.projectManager = new ProjectManager(this.canvas2d, this.scene3d, this.shapeLib);

    // 6. Camera & Tracking
    this.camera = new CameraManager(videoEl);
    this.tracking = new HandTrackingManager();

    // 7. Modals
    this.tutorialModal = new TutorialModal(document.getElementById('tutorial-modal'));
    this.shortcutsModal = new ShortcutsModal(document.getElementById('shortcuts-modal'));
    this.settingsModal = new SettingsModal({
      trackingManager: this.tracking,
      cameraManager: this.camera,
      soundFx: this.soundFx,
      threeScene: this.scene3d,
      shortcutsModal: this.shortcutsModal
    });

    // 8. Bind UI Events, Inspector & Keyboard Shortcuts
    this.setupUIEvents();
    this.setupInspectorEvents();
    this.setupKeyboardShortcuts();
    this.setupManipulatorEvents();

    // 9. Initialize Hardware & Tracking
    await this.initHardwareAndTracking();

    // 10. Start Animation & Gesture Inference Loop
    this.startMainLoop();

    this.hud.showToast('HOLODraw 3D Studio Ready — Hand Cursor & Gestures Active', 'success', 4000);
  }

  setupOverlayResize() {
    const resizeOverlay = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.overlayCanvas.width = w * dpr;
      this.overlayCanvas.height = h * dpr;
      this.overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.overlayCtx.scale(dpr, dpr);
    };
    window.addEventListener('resize', resizeOverlay);
    resizeOverlay();
  }

  async initHardwareAndTracking() {
    // 1. Webcam
    try {
      this.hud.showToast('Connecting Laptop Webcam...', 'info', 2000);
      await this.camera.start();
      await this.settingsModal.populateCameraDevices();
      this.hud.showToast('Webcam Online (1280x720)', 'success', 2500);
    } catch (camErr) {
      console.warn('Webcam initialization failed:', camErr);
      const msg = camErr.friendlyMessage || 'Camera Unavailable — Mouse Fallback Active';
      this.hud.showToast(msg, 'warning', 6000);
    }

    // 2. MediaPipe Hand Landmarker
    try {
      this.hud.showToast('Initializing MediaPipe Hand Landmarker...', 'info', 2000);
      const res = await this.tracking.initialize();
      this.hud.showToast(`Hand Tracker Active (${res.delegate} Acceleration)`, 'success', 3000);
    } catch (trackErr) {
      console.error('Tracking initialization failed:', trackErr);
      this.hud.showToast('Hand Tracking Offline — Using Mouse Fallback', 'warning', 5000);
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;

    // Clean up active interactions before switching
    if (this.mode === '2d' && this.lastDrawState) {
      this.canvas2d.endStroke(0, 0);
      this.lastDrawState = false;
    }
    if ((this.mode === '3d' || this.mode === 'split') && this.manipulator3d.isDragging) {
      this.manipulator3d.endDrag();
    }

    this.mode = mode;
    document.body.className = `mode-${mode}`;

    document.getElementById('btn-mode-2d')?.classList.toggle('active', mode === '2d');
    document.getElementById('btn-mode-3d')?.classList.toggle('active', mode === '3d');
    document.getElementById('btn-mode-split')?.classList.toggle('active', mode === 'split');

    const insp2d = document.getElementById('inspector-2d-section');
    const insp3d = document.getElementById('inspector-3d-section');

    if (mode === '2d') {
      if (insp2d) insp2d.style.display = 'flex';
      if (insp3d) insp3d.style.display = 'none';
      this.setTool('freehand');
    } else if (mode === '3d') {
      if (insp2d) insp2d.style.display = 'none';
      if (insp3d) insp3d.style.display = 'flex';
      this.setTool('select');
      this.updateInspectorUI(this.manipulator3d.selectedObject);
    } else {
      if (insp2d) insp2d.style.display = 'flex';
      if (insp3d) insp3d.style.display = 'flex';
      this.updateInspectorUI(this.manipulator3d.selectedObject);
    }

    this.soundFx.playAction();
    this.hud.showToast(`Switched to ${mode.toUpperCase()} Mode`, 'info', 1800);
  }

  setTool(tool) {
    this.activeTool = tool;

    const toolBtns = document.querySelectorAll('.tool-btn');
    toolBtns.forEach(btn => btn.classList.remove('active'));

    const activeEl = document.getElementById(`tool-${tool}`) || document.getElementById(`tool-${tool.replace('_', '-')}`);
    if (activeEl) activeEl.classList.add('active');

    if (['freehand', 'line', 'rect', 'circle', 'triangle', 'eraser'].includes(tool)) {
      this.canvas2d.setTool(tool);
    }

    this.soundFx.playAction();
  }

  setBrushStyle(style) {
    this.canvas2d.setBrushStyle(style);
    ['neon', 'solid', 'dotted', 'calligraphy'].forEach(s => {
      document.getElementById(`brush-style-${s}`)?.classList.toggle('active', s === style);
    });
    this.soundFx.playAction();
  }

  spawnPrimitive(type) {
    const color = this.currentColor;
    let mesh = null;

    switch (type) {
      case 'cube': mesh = this.shapeLib.createCube(1.2, color); break;
      case 'sphere': mesh = this.shapeLib.createSphere(0.8, color); break;
      case 'cylinder': mesh = this.shapeLib.createCylinder(0.6, 1.4, color); break;
      case 'cone': mesh = this.shapeLib.createCone(0.7, 1.4, color); break;
      case 'pyramid': mesh = this.shapeLib.createPyramid(0.8, 1.4, color); break;
      case 'torus': mesh = this.shapeLib.createTorus(0.8, 0.25, color); break;
      case 'plane': mesh = this.shapeLib.createPlane(1.6, 1.6, color); break;
    }

    if (mesh) {
      mesh.position.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.0, 0);
      this.scene3d.addObject(mesh);
      this.manipulator3d.selectObject(mesh);
      this.soundFx.playSpawn();
      this.hud.showToast(`Created Holographic ${type.toUpperCase()}`, 'success', 2000);

      if (this.mode === '2d') {
        this.setMode('3d');
      }
    }
  }

  setColor(color) {
    this.currentColor = color;
    this.canvas2d.setColor(color);
    this.shapeLib.defaultColor = color;

    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.color === color);
    });

    const hexLabel = document.getElementById('current-hex-label');
    if (hexLabel) {
      hexLabel.textContent = color.toUpperCase();
      hexLabel.style.color = color;
    }

    if (this.manipulator3d.selectedObject) {
      this.shapeLib.updateShapeColor(this.manipulator3d.selectedObject, color);
    }
  }

  cycleColor() {
    const swatches = Array.from(document.querySelectorAll('.color-swatch'));
    const colors = swatches.map(s => s.dataset.color);
    const currIdx = colors.indexOf(this.currentColor);
    const nextIdx = (currIdx + 1) % colors.length;
    this.setColor(colors[nextIdx]);
  }

  handleUndo() {
    if (this.mode === '3d') {
      if (this.manipulator3d.undo()) {
        return;
      }
    }
    if (this.mode === '2d') {
      if (this.canvas2d.undo()) {
        this.soundFx.playAction();
        this.hud.showToast('Undo 2D Stroke', 'info', 1200);
        return;
      }
    }
    if (this.manipulator3d.undo()) {
      return;
    } else if (this.canvas2d.undo()) {
      this.soundFx.playAction();
      this.hud.showToast('Undo 2D Stroke', 'info', 1200);
    }
  }

  handleRedo() {
    if (this.canvas2d.redo()) {
      this.soundFx.playAction();
      this.hud.showToast('Redo 2D Stroke', 'info', 1200);
    }
  }

  updateInspectorUI(mesh) {
    const typeLabel = document.getElementById('selected-object-type');
    const nameInput = document.getElementById('prop-obj-name');
    const matSelect = document.getElementById('prop-material-select');
    const posX = document.getElementById('prop-pos-x');
    const posY = document.getElementById('prop-pos-y');
    const posZ = document.getElementById('prop-pos-z');
    const rotX = document.getElementById('prop-rot-x');
    const rotY = document.getElementById('prop-rot-y');
    const rotZ = document.getElementById('prop-rot-z');
    const scaleX = document.getElementById('prop-scale-x');
    const scaleY = document.getElementById('prop-scale-y');
    const scaleZ = document.getElementById('prop-scale-z');
    const wireframeCheck = document.getElementById('toggle-wireframe');
    const visBtn = document.getElementById('btn-toggle-visibility');

    if (!mesh) {
      if (typeLabel) typeLabel.textContent = 'NONE';
      if (nameInput) { nameInput.value = ''; nameInput.disabled = true; }
      if (matSelect) matSelect.disabled = true;
      if (posX) { posX.value = ''; posX.disabled = true; }
      if (posY) { posY.value = ''; posY.disabled = true; }
      if (posZ) { posZ.value = ''; posZ.disabled = true; }
      if (rotX) { rotX.value = ''; rotX.disabled = true; }
      if (rotY) { rotY.value = ''; rotY.disabled = true; }
      if (rotZ) { rotZ.value = ''; rotZ.disabled = true; }
      if (scaleX) { scaleX.value = ''; scaleX.disabled = true; }
      if (scaleY) { scaleY.value = ''; scaleY.disabled = true; }
      if (scaleZ) { scaleZ.value = ''; scaleZ.disabled = true; }
      if (wireframeCheck) wireframeCheck.disabled = true;
      if (visBtn) visBtn.disabled = true;
      return;
    }

    if (typeLabel) typeLabel.textContent = (mesh.userData?.shapeType || 'OBJECT').toUpperCase();
    if (nameInput) { nameInput.value = mesh.name || ''; nameInput.disabled = false; }
    if (matSelect) { matSelect.value = mesh.userData?.materialType || 'glass'; matSelect.disabled = false; }

    if (posX) { posX.value = mesh.position.x.toFixed(2); posX.disabled = false; }
    if (posY) { posY.value = mesh.position.y.toFixed(2); posY.disabled = false; }
    if (posZ) { posZ.value = mesh.position.z.toFixed(2); posZ.disabled = false; }

    if (rotX) { rotX.value = THREE.MathUtils.radToDeg(mesh.rotation.x).toFixed(0); rotX.disabled = false; }
    if (rotY) { rotY.value = THREE.MathUtils.radToDeg(mesh.rotation.y).toFixed(0); rotY.disabled = false; }
    if (rotZ) { rotZ.value = THREE.MathUtils.radToDeg(mesh.rotation.z).toFixed(0); rotZ.disabled = false; }

    if (scaleX) { scaleX.value = mesh.scale.x.toFixed(2); scaleX.disabled = false; }
    if (scaleY) { scaleY.value = mesh.scale.y.toFixed(2); scaleY.disabled = false; }
    if (scaleZ) { scaleZ.value = mesh.scale.z.toFixed(2); scaleZ.disabled = false; }

    if (wireframeCheck) { wireframeCheck.checked = Boolean(mesh.userData?.wireframe); wireframeCheck.disabled = false; }
    if (visBtn) { visBtn.textContent = mesh.visible ? 'Hide [H]' : 'Show [H]'; visBtn.disabled = false; }
  }

  setupInspectorEvents() {
    const nameInput = document.getElementById('prop-obj-name');
    nameInput?.addEventListener('input', (e) => {
      if (this.manipulator3d.selectedObject) {
        this.manipulator3d.selectedObject.name = e.target.value;
      }
    });

    const matSelect = document.getElementById('prop-material-select');
    matSelect?.addEventListener('change', (e) => {
      if (this.manipulator3d.selectedObject) {
        this.shapeLib.applyMaterialType(this.manipulator3d.selectedObject, e.target.value);
        this.soundFx.playAction();
      }
    });

    // Position two-way binding
    ['x', 'y', 'z'].forEach(axis => {
      document.getElementById(`prop-pos-${axis}`)?.addEventListener('input', (e) => {
        const obj = this.manipulator3d.selectedObject;
        if (!obj) return;
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          obj.position[axis] = val;
          this.scene3d.clampObjectToBounds(obj);
          this.manipulator3d.selectionBox?.setFromObject(obj);
        }
      });
    });

    // Rotation two-way binding
    ['x', 'y', 'z'].forEach(axis => {
      document.getElementById(`prop-rot-${axis}`)?.addEventListener('input', (e) => {
        const obj = this.manipulator3d.selectedObject;
        if (!obj) return;
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          obj.rotation[axis] = THREE.MathUtils.degToRad(val);
          this.manipulator3d.selectionBox?.setFromObject(obj);
        }
      });
    });

    // Scale two-way binding
    ['x', 'y', 'z'].forEach(axis => {
      document.getElementById(`prop-scale-${axis}`)?.addEventListener('input', (e) => {
        const obj = this.manipulator3d.selectedObject;
        if (!obj) return;
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= 0.2 && val <= 5.0) {
          obj.scale[axis] = val;
          this.scene3d.clampObjectToBounds(obj);
          this.manipulator3d.selectionBox?.setFromObject(obj);
        }
      });
    });

    // Visibility toggle
    document.getElementById('btn-toggle-visibility')?.addEventListener('click', () => {
      const vis = this.manipulator3d.toggleVisibilitySelected();
      const btn = document.getElementById('btn-toggle-visibility');
      if (btn) btn.textContent = vis ? 'Hide [H]' : 'Show [H]';
      this.soundFx.playAction();
    });

    // Reset transform
    document.getElementById('btn-reset-transform')?.addEventListener('click', () => {
      this.manipulator3d.resetTransformSelected();
      this.updateInspectorUI(this.manipulator3d.selectedObject);
      this.soundFx.playAction();
      this.hud.showToast('Reset Object Transform', 'info', 1500);
    });

    // Wireframe toggle
    document.getElementById('toggle-wireframe')?.addEventListener('change', (e) => {
      if (this.manipulator3d.selectedObject) {
        this.shapeLib.toggleWireframe(this.manipulator3d.selectedObject, e.target.checked);
        this.soundFx.playAction();
      }
    });

    // Duplicate button
    document.getElementById('btn-duplicate-3d')?.addEventListener('click', () => {
      const cloned = this.manipulator3d.duplicateSelected();
      if (cloned) {
        this.soundFx.playSpawn();
        this.hud.showToast('Object Duplicated', 'info', 1500);
      }
    });

    // Delete button
    document.getElementById('btn-delete-3d')?.addEventListener('click', () => {
      if (confirm('Delete selected 3D holographic object?')) {
        this.manipulator3d.deleteSelected(true);
        this.soundFx.playDelete();
        this.hud.showToast('Object Deleted (Press Ctrl+Z to Restore)', 'info', 2500);
      }
    });
  }

  setupUIEvents() {
    // Mode Buttons
    document.getElementById('btn-mode-2d')?.addEventListener('click', () => this.setMode('2d'));
    document.getElementById('btn-mode-3d')?.addEventListener('click', () => this.setMode('3d'));
    document.getElementById('btn-mode-split')?.addEventListener('click', () => this.setMode('split'));

    // 2D Tools
    ['freehand', 'line', 'rect', 'circle', 'triangle', 'eraser'].forEach(tool => {
      document.getElementById(`tool-${tool}`)?.addEventListener('click', () => {
        if (this.mode === '3d') this.setMode('2d');
        this.setTool(tool);
      });
    });

    // 2D Brush Styles
    ['neon', 'solid', 'dotted', 'calligraphy'].forEach(style => {
      document.getElementById(`brush-style-${style}`)?.addEventListener('click', () => {
        this.setBrushStyle(style);
      });
    });

    // 3D Tools
    document.getElementById('tool-select-3d')?.addEventListener('click', () => {
      if (this.mode === '2d') this.setMode('3d');
      this.setTool('select');
    });

    document.getElementById('tool-draw-3d')?.addEventListener('click', () => {
      if (this.mode === '2d') this.setMode('3d');
      this.setTool('draw_3d');
    });

    // 3D Primitives (including Plane)
    ['cube', 'sphere', 'cylinder', 'cone', 'pyramid', 'torus', 'plane'].forEach(prim => {
      document.getElementById(`tool-${prim}`)?.addEventListener('click', () => {
        this.spawnPrimitive(prim);
      });
    });

    // Color Swatches
    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => this.setColor(sw.dataset.color));
    });

    // Custom Color Input
    const customPicker = document.getElementById('custom-color-picker');
    customPicker?.addEventListener('input', (e) => this.setColor(e.target.value));

    // Sliders
    const brushSlider = document.getElementById('brush-size-slider');
    const brushVal = document.getElementById('brush-size-val');
    brushSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (brushVal) brushVal.textContent = `${val}px`;
      this.canvas2d.setBrushSize(val);
    });

    const eraserSlider = document.getElementById('eraser-size-slider');
    const eraserVal = document.getElementById('eraser-size-val');
    eraserSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (eraserVal) eraserVal.textContent = `${val}px`;
      this.canvas2d.setEraserSize(val);
    });

    // Bottom Action Bar
    document.getElementById('btn-undo')?.addEventListener('click', () => this.handleUndo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.handleRedo());
    document.getElementById('btn-clear')?.addEventListener('click', () => {
      if (confirm('Clear entire workspace canvas and 3D studio?')) {
        this.canvas2d.clear();
        this.scene3d.clearObjects();
        this.manipulator3d.deselect();
        this.soundFx.playDelete();
        this.hud.showToast('Workspace Cleared', 'info', 2000);
      }
    });

    // Export & Save
    document.getElementById('btn-export-png')?.addEventListener('click', () => {
      Exporter.export2DPNG(this.canvas2d.canvas);
      this.soundFx.playAction();
      this.hud.showToast('2D Drawing Exported as PNG', 'success', 2500);
    });

    document.getElementById('btn-export-glb')?.addEventListener('click', async () => {
      try {
        await Exporter.export3DGLB(this.scene3d);
        this.soundFx.playAction();
        this.hud.showToast('3D Scene Exported as GLB', 'success', 2500);
      } catch (err) {
        this.hud.showToast(err.message || 'GLB Export Failed', 'danger', 3000);
      }
    });

    document.getElementById('btn-save-project')?.addEventListener('click', () => {
      this.projectManager.saveProject({ mode: this.mode, color: this.currentColor });
      this.soundFx.playAction();
      this.hud.showToast('Project Saved (.holodraw)', 'success', 2500);
    });

    document.getElementById('input-load-project')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          await this.projectManager.loadProjectFromFile(file);
          this.soundFx.playSpawn();
          this.hud.showToast('Project Loaded Successfully', 'success', 3000);
        } catch (err) {
          console.error(err);
          this.hud.showToast(err.message || 'Failed to load project file', 'danger', 3500);
        }
      }
    });

    // Top Controls
    document.getElementById('btn-toggle-camera')?.addEventListener('click', () => {
      const video = document.getElementById('camera-video');
      if (video) {
        video.style.opacity = video.style.opacity === '0' ? '0.18' : '0';
        this.soundFx.playAction();
      }
    });

    document.getElementById('btn-shortcuts')?.addEventListener('click', () => {
      this.shortcutsModal.toggle();
      this.soundFx.playAction();
    });

    document.getElementById('btn-tutorial')?.addEventListener('click', () => {
      this.tutorialModal.toggle();
      this.soundFx.playAction();
    });

    document.getElementById('tutorial-got-it-btn')?.addEventListener('click', () => {
      this.tutorialModal.hide();
      this.soundFx.playAction();
    });

    document.getElementById('btn-settings')?.addEventListener('click', () => {
      this.settingsModal.toggle();
      this.soundFx.playAction();
    });

    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  }

  setupManipulatorEvents() {
    this.manipulator3d.on('select', (mesh) => {
      this.updateInspectorUI(mesh);
      this.soundFx.playSelect();
    });

    this.manipulator3d.on('deselect', () => {
      this.updateInspectorUI(null);
    });

    this.manipulator3d.on('transform', (mesh) => {
      this.updateInspectorUI(mesh);
    });

    this.manipulator3d.on('hover', (mesh) => {
      this.soundFx.playPinch();
    });

    this.manipulator3d.on('drag', ({ isNearTrash }) => {
      const trashZoneEl = document.getElementById('hud-trash-zone');
      if (trashZoneEl) {
        trashZoneEl.classList.toggle('hovering', isNearTrash);
      }
    });

    this.manipulator3d.on('trashDrop', (mesh) => {
      const trashZoneEl = document.getElementById('hud-trash-zone');
      if (trashZoneEl) trashZoneEl.classList.remove('hovering');

      this.soundFx.playDelete();
      this.hud.showToast('Vaporized in Trash Zone (Press Ctrl+Z to Restore)', 'warning', 3500);
      this.updateInspectorUI(null);
    });

    this.manipulator3d.on('restore', (mesh) => {
      this.soundFx.playSpawn();
      this.hud.showToast('Restored Deleted 3D Object', 'success', 2000);
      this.updateInspectorUI(mesh);
    });

    this.manipulator3d.on('draw3DStart', () => {
      this.soundFx.playAction();
    });
  }

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Guard: do not trigger shortcuts if user is typing in text inputs or textareas
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      const key = e.key.toLowerCase();

      // --- GENERAL SHORTCUTS ---
      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.handleUndo();
        return;
      }
      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) {
        e.preventDefault();
        this.handleRedo();
        return;
      }
      // Save Project: Ctrl+S
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        this.projectManager.saveProject({ mode: this.mode, color: this.currentColor });
        this.soundFx.playAction();
        this.hud.showToast('Project Saved (.holodraw)', 'success', 2500);
        return;
      }
      // Open Project: Ctrl+O
      if ((e.ctrlKey || e.metaKey) && key === 'o') {
        e.preventDefault();
        document.getElementById('input-load-project')?.click();
        return;
      }
      // Duplicate: Ctrl+D
      if ((e.ctrlKey || e.metaKey) && key === 'd') {
        e.preventDefault();
        if (this.manipulator3d.selectedObject) {
          this.manipulator3d.duplicateSelected();
          this.soundFx.playSpawn();
          this.hud.showToast('Object Duplicated', 'info', 1500);
        }
        return;
      }
      // Select All: Ctrl+A
      if ((e.ctrlKey || e.metaKey) && key === 'a' && !e.shiftKey) {
        e.preventDefault();
        this.manipulator3d.selectAll();
        this.soundFx.playSelect();
        this.hud.showToast('Selected Object', 'info', 1500);
        return;
      }
      // Deselect All: Ctrl+Shift+A
      if ((e.ctrlKey || e.metaKey) && key === 'a' && e.shiftKey) {
        e.preventDefault();
        this.manipulator3d.deselectAll();
        return;
      }

      // Delete: Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.manipulator3d.selectedObject) {
          e.preventDefault();
          this.manipulator3d.deleteSelected(true);
          this.soundFx.playDelete();
          this.hud.showToast('Object Deleted (Press Ctrl+Z to Restore)', 'info', 2500);
        }
        return;
      }

      // Escape: Deselect / close modals
      if (e.key === 'Escape') {
        if (this.shortcutsModal.isVisible()) {
          this.shortcutsModal.hide();
        } else if (this.tutorialModal.isVisible()) {
          this.tutorialModal.hide();
        } else if (this.settingsModal.modal?.classList.contains('modal-visible')) {
          this.settingsModal.hide();
        } else {
          this.manipulator3d.deselect();
        }
        return;
      }

      // Fullscreen: F
      if (key === 'f' && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        this.toggleFullscreen();
        return;
      }

      // Mode Switch: Tab
      if (e.key === 'Tab') {
        e.preventDefault();
        const nextMode = this.mode === '2d' ? '3d' : this.mode === '3d' ? 'split' : '2d';
        this.setMode(nextMode);
        return;
      }

      // Pause/Resume: Space
      if (e.key === ' ') {
        e.preventDefault();
        this.isPaused = !this.isPaused;
        this.soundFx.playAction();
        this.hud.showToast(this.isPaused ? 'Studio Interaction Paused' : 'Studio Resumed', 'info', 1500);
        return;
      }

      // Open Shortcuts Guide: ?
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        this.shortcutsModal.toggle();
        return;
      }

      // --- OBJECT CREATION SHORTCUTS [1 - 7] ---
      if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (key === '1') { this.spawnPrimitive('cube'); return; }
        if (key === '2') { this.spawnPrimitive('sphere'); return; }
        if (key === '3') { this.spawnPrimitive('cylinder'); return; }
        if (key === '4') { this.spawnPrimitive('cone'); return; }
        if (key === '5') { this.spawnPrimitive('pyramid'); return; }
        if (key === '6') { this.spawnPrimitive('torus'); return; }
        if (key === '7') { this.spawnPrimitive('plane'); return; }
      }

      // --- TRANSFORMATION SHORTCUTS ---
      // G: Move mode
      if (key === 'g' && !e.ctrlKey) {
        this.manipulator3d.setTransformMode('translate', null);
        this.hud.setTransformMode('Move', null);
        this.soundFx.playAction();
        return;
      }
      // R: Rotate mode
      if (key === 'r' && !e.ctrlKey) {
        this.manipulator3d.setTransformMode('rotate', null);
        this.hud.setTransformMode('Rotate', null);
        this.soundFx.playAction();
        return;
      }
      // S: Scale mode
      if (key === 's' && !e.ctrlKey) {
        this.manipulator3d.setTransformMode('scale', null);
        this.hud.setTransformMode('Scale', null);
        this.soundFx.playAction();
        return;
      }
      // X, Y, Z: Axis constraints
      if (['x', 'y', 'z'].includes(key) && !e.ctrlKey) {
        const newAxis = this.manipulator3d.axisConstraint === key ? null : key;
        this.manipulator3d.axisConstraint = newAxis;
        this.hud.setTransformMode(this.manipulator3d.transformMode, newAxis);
        this.soundFx.playAction();
        this.hud.showToast(newAxis ? `Constrained to ${newAxis.toUpperCase()}-Axis` : 'Axis Constraint Cleared', 'info', 1200);
        return;
      }
      // 0: Reset Transform
      if (key === '0' && !e.ctrlKey) {
        this.manipulator3d.resetTransformSelected();
        this.updateInspectorUI(this.manipulator3d.selectedObject);
        this.soundFx.playAction();
        this.hud.showToast('Reset Object Transform', 'info', 1500);
        return;
      }

      // --- ADDITIONAL SHORTCUTS ---
      // H: Hide/show selected object
      if (key === 'h' && !e.ctrlKey) {
        if (this.manipulator3d.selectedObject) {
          const vis = this.manipulator3d.toggleVisibilitySelected();
          const btn = document.getElementById('btn-toggle-visibility');
          if (btn) btn.textContent = vis ? 'Hide [H]' : 'Show [H]';
          this.soundFx.playAction();
          this.hud.showToast(vis ? 'Object Visible' : 'Object Hidden', 'info', 1200);
        }
        return;
      }
      // C: Cycle Color
      if (key === 'c' && !e.ctrlKey) {
        this.cycleColor();
        this.soundFx.playAction();
        return;
      }
      // W: Toggle Wireframe
      if (key === 'w' && !e.ctrlKey) {
        if (this.manipulator3d.selectedObject) {
          const check = document.getElementById('toggle-wireframe');
          const newState = !this.manipulator3d.selectedObject.userData?.wireframe;
          this.shapeLib.toggleWireframe(this.manipulator3d.selectedObject, newState);
          if (check) check.checked = newState;
          this.soundFx.playAction();
          this.hud.showToast(newState ? 'Wireframe Mode ON' : 'Wireframe Mode OFF', 'info', 1200);
        }
        return;
      }
    });
  }

  /**
   * Main High-Frequency Animation & Gesture Inference Loop
   */
  startMainLoop() {
    const loop = (timestamp) => {
      // 1. Process Video Frame via MediaPipe
      const videoEl = this.camera?.getVideoElement();
      let handResults = null;

      if (this.tracking?.isReady && videoEl && !this.isPaused) {
        handResults = this.tracking.processVideoFrame(videoEl, timestamp);
      }

      // 2. Clear Overlay Canvas
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.overlayCtx.clearRect(0, 0, w, h);

      // 3. Render Screen Boundaries Guide
      this.canvas2d.renderBoundaries(this.overlayCtx, w, h);

      // 4. Update HUD tracking status, FPS, Latency & Quality
      if (handResults) {
        this.hud.updateMetrics(handResults.fps || 60, handResults.latency || 0, handResults.quality || 'None');
        this.hud.updateHandStatus(handResults);
      }

      // 5. Shared Gesture State & Mode Dispatch (Prevents Conflicting Interactions)
      if (!this.isPaused) {
        if (this.mode === '2d') {
          this.handle2DGestures(handResults, w, h);
        } else if (this.mode === '3d') {
          this.manipulator3d.processHandTracking(handResults, this.activeTool);
        } else if (this.mode === 'split') {
          if (['freehand', 'line', 'rect', 'circle', 'triangle', 'eraser'].includes(this.activeTool)) {
            this.handle2DGestures(handResults, w, h);
          } else {
            this.manipulator3d.processHandTracking(handResults, this.activeTool);
          }
        }
      }

      // 6. Render 3D Scene
      this.scene3d.render(timestamp);

      // 7. Render Holographic Hand Skeletons, Index Fingertip Cursors, Hover & Selected Reticles
      if (this.tracking?.isReady) {
        this.tracking.renderHolographicSkeleton(
          this.overlayCtx,
          w,
          h,
          this.manipulator3d.hoveredObject,
          this.manipulator3d.selectedObject
        );
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  handle2DGestures(handResults, screenWidth, screenHeight) {
    if (!handResults) return;

    const domHand = handResults.rightHand || handResults.leftHand;
    if (!domHand || !domHand.cursor) {
      if (this.lastDrawState) {
        this.canvas2d.endStroke(0, 0);
        this.lastDrawState = false;
      }
      return;
    }

    const cursor = domHand.cursor;
    const gesture = domHand.gesture;
    const pixelX = cursor.x * screenWidth;
    const pixelY = cursor.y * screenHeight;

    if (gesture === 'DRAW') {
      if (!this.lastDrawState) {
        this.canvas2d.startStroke(pixelX, pixelY);
        this.lastDrawState = true;
        this.soundFx.playPinch();
      } else {
        this.canvas2d.continueStroke(pixelX, pixelY);
      }
    } else if (gesture === 'CLOSED_FIST') {
      if (this.lastDrawState) {
        this.canvas2d.cancelStroke();
        this.lastDrawState = false;
        this.soundFx.playAction();
        this.hud.showToast('Stroke Cancelled (Closed Fist)', 'warning', 1500);
      }
    } else {
      if (this.lastDrawState) {
        this.canvas2d.endStroke(pixelX, pixelY);
        this.lastDrawState = false;
      }
    }
  }
}

// Bootstrap Application on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new HoloDrawApp();
  app.start().catch(err => {
    console.error('Fatal initialization error:', err);
  });
});

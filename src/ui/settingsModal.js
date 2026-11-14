/**
 * SettingsModal provides complete interactive calibration and settings:
 * - Camera device selection & resolution presets
 * - MediaPipe confidence thresholds (Detection, Tracking, Presence)
 * - Gesture & Pinch sensitivity
 * - Landmark smoothing parameters (One Euro Filter cutoff & beta)
 * - Graphics quality (High, Medium, Low)
 * - Holographic grid, coordinate axes, scanlines, particles & audio toggles
 * - Automatic LocalStorage persistence and restoration
 */
export class SettingsModal {
  constructor(options = {}) {
    this.modal = document.getElementById('settings-modal');
    this.closeBtn = document.getElementById('settings-close-btn');

    this.trackingManager = options.trackingManager;
    this.cameraManager = options.cameraManager;
    this.soundFx = options.soundFx;
    this.threeScene = options.threeScene;
    this.shortcutsModal = options.shortcutsModal;

    this.storageKey = 'holodraw_3d_preferences_v1';
    this.setupEvents();
    this.loadSavedPreferences();
  }

  setupEvents() {
    this.closeBtn?.addEventListener('click', () => this.hide());
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    // 1. Camera Device Selection
    const cameraSelect = document.getElementById('setting-camera-select');
    cameraSelect?.addEventListener('change', async (e) => {
      const deviceId = e.target.value;
      if (this.cameraManager) {
        try {
          await this.cameraManager.switchDevice(deviceId);
          this.savePreferences();
        } catch (err) {
          console.error('Failed to switch camera:', err);
        }
      }
    });

    // 2. Camera Resolution
    const resSelect = document.getElementById('setting-camera-resolution');
    resSelect?.addEventListener('change', async (e) => {
      const [w, h] = e.target.value.split('x').map(Number);
      if (this.cameraManager && w && h) {
        try {
          await this.cameraManager.setResolution(w, h);
          this.savePreferences();
        } catch (err) {
          console.error('Failed to change resolution:', err);
        }
      }
    });

    // 3. Pinch Sensitivity Slider
    const pinchSlider = document.getElementById('setting-pinch-threshold');
    const pinchVal = document.getElementById('setting-pinch-val');
    pinchSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (pinchVal) pinchVal.textContent = val.toFixed(2);
      this.trackingManager?.recognizer.setPinchThreshold(val);
      this.savePreferences();
    });

    // 4. Tracking Confidence Slider
    const confSlider = document.getElementById('setting-tracking-confidence');
    const confVal = document.getElementById('setting-conf-val');
    confSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (confVal) confVal.textContent = `${Math.round(val * 100)}%`;
      this.trackingManager?.setConfidenceThresholds(val, val, val);
      this.savePreferences();
    });

    // 5. Landmark Smoothing Cutoff Slider
    const smoothSlider = document.getElementById('setting-landmark-smoothing');
    const smoothVal = document.getElementById('setting-smooth-val');
    smoothSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (smoothVal) smoothVal.textContent = val.toFixed(1);
      this.trackingManager?.filter.setSmoothing(val, undefined);
      this.savePreferences();
    });

    // 6. Camera Brightness Slider
    const brightSlider = document.getElementById('setting-camera-brightness');
    const brightVal = document.getElementById('setting-bright-val');
    brightSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (brightVal) brightVal.textContent = `${Math.round(val * 100)}%`;
      this.cameraManager?.setBrightness(val);
      this.savePreferences();
    });

    // 7. Camera Contrast Slider
    const contrastSlider = document.getElementById('setting-camera-contrast');
    const contrastVal = document.getElementById('setting-contrast-val');
    contrastSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (contrastVal) contrastVal.textContent = `${Math.round(val * 100)}%`;
      this.cameraManager?.setContrast(val);
      this.savePreferences();
    });

    // 8. Graphics Quality Select
    const qualitySelect = document.getElementById('setting-graphics-quality');
    qualitySelect?.addEventListener('change', (e) => {
      const level = e.target.value;
      this.threeScene?.setGraphicsQuality(level);
      this.savePreferences();
    });

    // 9. Skeleton Toggle
    const skeletonToggle = document.getElementById('setting-show-skeleton');
    skeletonToggle?.addEventListener('change', (e) => {
      this.trackingManager?.setDrawSkeleton(e.target.checked);
      this.savePreferences();
    });

    // 10. Sound SFX Toggle
    const soundToggle = document.getElementById('setting-sound-sfx');
    soundToggle?.addEventListener('change', (e) => {
      if (this.soundFx) this.soundFx.enabled = e.target.checked;
      this.savePreferences();
    });

    // 11. 3D Grid Toggle
    const gridToggle = document.getElementById('setting-show-grid');
    gridToggle?.addEventListener('change', (e) => {
      this.threeScene?.toggleGrid(e.target.checked);
      this.savePreferences();
    });

    // 12. Coordinate Axes Toggle
    const axesToggle = document.getElementById('setting-show-axes');
    axesToggle?.addEventListener('change', (e) => {
      this.threeScene?.toggleAxes(e.target.checked);
      this.savePreferences();
    });

    // 13. Scanlines Effect Toggle
    const scanlinesToggle = document.getElementById('setting-show-scanlines');
    scanlinesToggle?.addEventListener('change', (e) => {
      const scanlines = document.querySelector('.hologram-scanlines');
      if (scanlines) scanlines.style.display = e.target.checked ? 'block' : 'none';
      this.savePreferences();
    });

    // 14. Shortcuts Reference Button
    const shortcutsBtn = document.getElementById('btn-open-shortcuts-ref');
    shortcutsBtn?.addEventListener('click', () => {
      this.hide();
      this.shortcutsModal?.show();
    });
  }

  async populateCameraDevices() {
    const cameraSelect = document.getElementById('setting-camera-select');
    if (!cameraSelect || !this.cameraManager) return;

    try {
      const devices = await this.cameraManager.getDevices();
      cameraSelect.innerHTML = '';

      if (devices.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Default Camera';
        cameraSelect.appendChild(opt);
        return;
      }

      devices.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Webcam ${idx + 1}`;
        if (d.deviceId === this.cameraManager.currentDeviceId) {
          opt.selected = true;
        }
        cameraSelect.appendChild(opt);
      });
    } catch (err) {
      console.warn('Could not populate cameras:', err);
    }
  }

  savePreferences() {
    try {
      const prefs = {
        pinchThreshold: parseFloat(document.getElementById('setting-pinch-threshold')?.value || '0.28'),
        trackingConfidence: parseFloat(document.getElementById('setting-tracking-confidence')?.value || '0.5'),
        smoothingCutoff: parseFloat(document.getElementById('setting-landmark-smoothing')?.value || '1.2'),
        cameraBrightness: parseFloat(document.getElementById('setting-camera-brightness')?.value || '1.0'),
        cameraContrast: parseFloat(document.getElementById('setting-camera-contrast')?.value || '1.0'),
        cameraResolution: document.getElementById('setting-camera-resolution')?.value || '1280x720',
        graphicsQuality: document.getElementById('setting-graphics-quality')?.value || 'high',
        showSkeleton: Boolean(document.getElementById('setting-show-skeleton')?.checked),
        soundSfx: Boolean(document.getElementById('setting-sound-sfx')?.checked),
        showGrid: Boolean(document.getElementById('setting-show-grid')?.checked),
        showAxes: Boolean(document.getElementById('setting-show-axes')?.checked),
        showScanlines: Boolean(document.getElementById('setting-show-scanlines')?.checked)
      };
      localStorage.setItem(this.storageKey, JSON.stringify(prefs));
    } catch (e) {
      // Ignore storage errors in restricted contexts
    }
  }

  loadSavedPreferences() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const prefs = JSON.parse(raw);

      if (prefs.pinchThreshold !== undefined) {
        const el = document.getElementById('setting-pinch-threshold');
        if (el) el.value = prefs.pinchThreshold;
        const lbl = document.getElementById('setting-pinch-val');
        if (lbl) lbl.textContent = prefs.pinchThreshold.toFixed(2);
        this.trackingManager?.recognizer.setPinchThreshold(prefs.pinchThreshold);
      }

      if (prefs.trackingConfidence !== undefined) {
        const el = document.getElementById('setting-tracking-confidence');
        if (el) el.value = prefs.trackingConfidence;
        const lbl = document.getElementById('setting-conf-val');
        if (lbl) lbl.textContent = `${Math.round(prefs.trackingConfidence * 100)}%`;
        this.trackingManager?.setConfidenceThresholds(prefs.trackingConfidence, prefs.trackingConfidence, prefs.trackingConfidence);
      }

      if (prefs.smoothingCutoff !== undefined) {
        const el = document.getElementById('setting-landmark-smoothing');
        if (el) el.value = prefs.smoothingCutoff;
        const lbl = document.getElementById('setting-smooth-val');
        if (lbl) lbl.textContent = prefs.smoothingCutoff.toFixed(1);
        this.trackingManager?.filter.setSmoothing(prefs.smoothingCutoff, undefined);
      }

      if (prefs.cameraBrightness !== undefined) {
        const el = document.getElementById('setting-camera-brightness');
        if (el) el.value = prefs.cameraBrightness;
        const lbl = document.getElementById('setting-bright-val');
        if (lbl) lbl.textContent = `${Math.round(prefs.cameraBrightness * 100)}%`;
        this.cameraManager?.setBrightness(prefs.cameraBrightness);
      }

      if (prefs.cameraContrast !== undefined) {
        const el = document.getElementById('setting-camera-contrast');
        if (el) el.value = prefs.cameraContrast;
        const lbl = document.getElementById('setting-contrast-val');
        if (lbl) lbl.textContent = `${Math.round(prefs.cameraContrast * 100)}%`;
        this.cameraManager?.setContrast(prefs.cameraContrast);
      }

      if (prefs.graphicsQuality) {
        const el = document.getElementById('setting-graphics-quality');
        if (el) el.value = prefs.graphicsQuality;
        this.threeScene?.setGraphicsQuality(prefs.graphicsQuality);
      }

      if (prefs.showSkeleton !== undefined) {
        const el = document.getElementById('setting-show-skeleton');
        if (el) el.checked = prefs.showSkeleton;
        this.trackingManager?.setDrawSkeleton(prefs.showSkeleton);
      }

      if (prefs.soundSfx !== undefined) {
        const el = document.getElementById('setting-sound-sfx');
        if (el) el.checked = prefs.soundSfx;
        if (this.soundFx) this.soundFx.enabled = prefs.soundSfx;
      }

      if (prefs.showGrid !== undefined) {
        const el = document.getElementById('setting-show-grid');
        if (el) el.checked = prefs.showGrid;
        this.threeScene?.toggleGrid(prefs.showGrid);
      }

      if (prefs.showAxes !== undefined) {
        const el = document.getElementById('setting-show-axes');
        if (el) el.checked = prefs.showAxes;
        this.threeScene?.toggleAxes(prefs.showAxes);
      }

      if (prefs.showScanlines !== undefined) {
        const el = document.getElementById('setting-show-scanlines');
        if (el) el.checked = prefs.showScanlines;
        const scanlines = document.querySelector('.hologram-scanlines');
        if (scanlines) scanlines.style.display = prefs.showScanlines ? 'block' : 'none';
      }
    } catch (e) {
      console.warn('Could not restore preferences:', e);
    }
  }

  show() {
    this.populateCameraDevices();
    if (this.modal) this.modal.classList.add('modal-visible');
  }

  hide() {
    if (this.modal) this.modal.classList.remove('modal-visible');
  }

  toggle() {
    if (this.modal?.classList.contains('modal-visible')) this.hide();
    else this.show();
  }
}

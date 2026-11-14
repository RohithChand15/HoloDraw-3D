/**
 * HUDOverlay manages holographic HUD indicators:
 * - FPS and processing latency (inference ms) display
 * - Tracking Quality indicator (Poor, Fair, Good, Excellent)
 * - Left/Right hand tracking meters & active gesture chips
 * - Dual hand connection badge
 * - Active Transform Mode badge (G Move, R Rotate, S Scale, X/Y/Z)
 * - Holographic toast alerts
 */
export class HUDOverlay {
  constructor() {
    this.fpsEl = null;
    this.qualityEl = null;
    this.latencyEl = null;
    this.leftHandEl = null;
    this.rightHandEl = null;
    this.gestureLeftEl = null;
    this.gestureRightEl = null;
    this.dualBadgeEl = null;
    this.modeBadgeEl = null;
    this.toastContainer = null;

    this.init();
  }

  init() {
    this.fpsEl = document.getElementById('hud-fps');
    this.qualityEl = document.getElementById('hud-quality');
    this.latencyEl = document.getElementById('hud-latency');
    this.leftHandEl = document.getElementById('hud-hand-left');
    this.rightHandEl = document.getElementById('hud-hand-right');
    this.gestureLeftEl = document.getElementById('hud-gesture-left');
    this.gestureRightEl = document.getElementById('hud-gesture-right');
    this.dualBadgeEl = document.getElementById('hud-dual-badge');
    this.modeBadgeEl = document.getElementById('hud-transform-mode');
    this.toastContainer = document.getElementById('hud-toasts');
  }

  updateMetrics(fps, latency, quality) {
    if (this.fpsEl) {
      this.fpsEl.textContent = `${fps} FPS`;
    }
    if (this.latencyEl) {
      this.latencyEl.textContent = `${latency || 0}ms`;
    }
    if (this.qualityEl) {
      this.qualityEl.textContent = quality.toUpperCase();
      this.qualityEl.className = `holo-badge quality-${quality.toLowerCase()}`;
    }
  }

  updateHandStatus(handResults) {
    if (!handResults) return;

    const left = handResults.leftHand;
    const right = handResults.rightHand;
    const dual = handResults.dual;

    // Left hand status
    if (this.leftHandEl && this.gestureLeftEl) {
      if (left) {
        this.leftHandEl.classList.remove('lost');
        this.leftHandEl.classList.add('tracked');
        const bar = this.leftHandEl.querySelector('.meter-bar');
        if (bar) bar.style.width = `${Math.round(left.confidence * 100)}%`;
        this.gestureLeftEl.textContent = left.gesture;
        this.gestureLeftEl.className = `gesture-chip active-${left.gesture.toLowerCase()}`;
      } else {
        this.leftHandEl.classList.remove('tracked');
        this.leftHandEl.classList.add('lost');
        const bar = this.leftHandEl.querySelector('.meter-bar');
        if (bar) bar.style.width = '0%';
        this.gestureLeftEl.textContent = 'NO HAND';
        this.gestureLeftEl.className = 'gesture-chip lost';
      }
    }

    // Right hand status
    if (this.rightHandEl && this.gestureRightEl) {
      if (right) {
        this.rightHandEl.classList.remove('lost');
        this.rightHandEl.classList.add('tracked');
        const bar = this.rightHandEl.querySelector('.meter-bar');
        if (bar) bar.style.width = `${Math.round(right.confidence * 100)}%`;
        this.gestureRightEl.textContent = right.gesture;
        this.gestureRightEl.className = `gesture-chip active-${right.gesture.toLowerCase()}`;
      } else {
        this.rightHandEl.classList.remove('tracked');
        this.rightHandEl.classList.add('lost');
        const bar = this.rightHandEl.querySelector('.meter-bar');
        if (bar) bar.style.width = '0%';
        this.gestureRightEl.textContent = 'NO HAND';
        this.gestureRightEl.className = 'gesture-chip lost';
      }
    }

    // Dual gesture indicator
    if (this.dualBadgeEl) {
      if (dual && left && right) {
        this.dualBadgeEl.style.display = 'inline-flex';
        if (dual.bothPinching) {
          this.dualBadgeEl.textContent = 'DUAL PINCH: SCALE / ROTATE';
          this.dualBadgeEl.classList.add('active');
        } else {
          this.dualBadgeEl.textContent = 'DUAL HANDS DETECTED';
          this.dualBadgeEl.classList.remove('active');
        }
      } else {
        this.dualBadgeEl.style.display = 'none';
      }
    }
  }

  setTransformMode(mode, axis = null) {
    if (!this.modeBadgeEl) return;
    const axisStr = axis ? ` (${axis.toUpperCase()})` : '';
    this.modeBadgeEl.textContent = `MODE: ${mode.toUpperCase()}${axisStr}`;
    this.modeBadgeEl.style.display = mode ? 'inline-flex' : 'none';
  }

  showToast(message, type = 'info', duration = 3000) {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `holo-toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-glow"></div>
      <span class="toast-icon">${type === 'warning' ? '⚠️' : type === 'success' ? '⚡' : type === 'danger' ? '⛔' : '✨'}</span>
      <span class="toast-message">${message}</span>
    `;

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }
}

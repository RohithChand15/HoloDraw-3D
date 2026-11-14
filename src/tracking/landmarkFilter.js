/**
 * Adaptive One-Euro-inspired Filter and Exponential Moving Average
 * for smoothing 21 3D hand landmarks and reducing jitter without lag.
 */

class LowPassFilter {
  constructor(alpha = 0.5) {
    this.alpha = alpha;
    this.hasValue = false;
    this.value = 0;
  }

  filter(val, alpha = this.alpha) {
    if (!this.hasValue) {
      this.value = val;
      this.hasValue = true;
      return val;
    }
    this.value = alpha * val + (1 - alpha) * this.value;
    return this.value;
  }

  reset() {
    this.hasValue = false;
  }
}

export class LandmarkFilter {
  constructor(options = {}) {
    this.minCutoff = options.minCutoff ?? 1.2; // Lower = smoother stationary, Higher = more responsive
    this.beta = options.beta ?? 0.05;          // Higher = less lag during rapid movement
    this.dCutoff = options.dCutoff ?? 1.0;
    this.handsData = new Map(); // 'Left' / 'Right' -> array of 21 point filters
  }

  setSmoothing(minCutoff, beta) {
    if (minCutoff !== undefined && minCutoff > 0) {
      this.minCutoff = minCutoff;
    }
    if (beta !== undefined && beta >= 0) {
      this.beta = beta;
    }
  }

  getHandFilters(handedness) {
    if (!this.handsData.has(handedness)) {
      const filters = [];
      for (let i = 0; i < 21; i++) {
        filters.push({
          x: new LowPassFilter(0.6),
          y: new LowPassFilter(0.6),
          z: new LowPassFilter(0.6),
          dx: new LowPassFilter(0.6),
          dy: new LowPassFilter(0.6),
          dz: new LowPassFilter(0.6),
          prevX: null,
          prevY: null,
          prevZ: null,
          lastTime: performance.now()
        });
      }
      this.handsData.set(handedness, filters);
    }
    return this.handsData.get(handedness);
  }

  smooth(landmarks, handedness = 'Right') {
    if (!landmarks || landmarks.length !== 21) return landmarks;

    const filters = this.getHandFilters(handedness);
    const now = performance.now();
    const smoothed = [];

    for (let i = 0; i < 21; i++) {
      const p = landmarks[i];
      const f = filters[i];

      const dt = Math.max((now - f.lastTime) / 1000, 0.001);
      f.lastTime = now;

      // Compute velocities
      const vx = f.prevX !== null ? (p.x - f.prevX) / dt : 0;
      const vy = f.prevY !== null ? (p.y - f.prevY) / dt : 0;
      const vz = f.prevZ !== null ? (p.z - f.prevZ) / dt : 0;

      f.prevX = p.x;
      f.prevY = p.y;
      f.prevZ = p.z;

      // Filtered derivative
      const edx = f.dx.filter(vx);
      const edy = f.dy.filter(vy);
      const edz = f.dz.filter(vz);

      // Adaptive cutoff frequencies based on speed
      const speedX = Math.abs(edx);
      const speedY = Math.abs(edy);
      const speedZ = Math.abs(edz);

      const cutoffX = this.minCutoff + this.beta * speedX;
      const cutoffY = this.minCutoff + this.beta * speedY;
      const cutoffZ = this.minCutoff + this.beta * speedZ;

      const alphaX = this.calculateAlpha(cutoffX, dt);
      const alphaY = this.calculateAlpha(cutoffY, dt);
      const alphaZ = this.calculateAlpha(cutoffZ, dt);

      smoothed.push({
        x: f.x.filter(p.x, alphaX),
        y: f.y.filter(p.y, alphaY),
        z: f.z.filter(p.z, alphaZ),
        visibility: p.visibility ?? 1.0
      });
    }

    return smoothed;
  }

  calculateAlpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  reset() {
    this.handsData.clear();
  }
}

/**
 * ConfidenceMonitor tracks tracking confidence, FPS, inference latency,
 * detection quality (Poor, Fair, Good, Excellent), and manages recovery timers.
 */
export class ConfidenceMonitor {
  constructor(options = {}) {
    this.lossThresholdMs = options.lossThresholdMs ?? 600;
    this.lastDetectedTime = {
      Left: 0,
      Right: 0
    };
    this.isLost = {
      Left: true,
      Right: true
    };
    this.confidences = {
      Left: 0,
      Right: 0
    };
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();

    // Latency tracking (moving average)
    this.latency = 0;
    this.latencySamples = [];
    this.maxLatencySamples = 15;

    // Quality indicator: 'None', 'Poor', 'Fair', 'Good', 'Excellent'
    this.quality = 'None';

    this.listeners = new Map();
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(cb);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => cb(data));
    }
  }

  updateFrame() {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFpsUpdate;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      this.updateQuality();
      this.emit('fps', this.fps);
      this.emit('quality', this.quality);
    }
  }

  recordLatency(ms) {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > this.maxLatencySamples) {
      this.latencySamples.shift();
    }
    const sum = this.latencySamples.reduce((a, b) => a + b, 0);
    this.latency = Math.round(sum / this.latencySamples.length);
  }

  recordHand(handedness, confidence = 1.0) {
    const now = performance.now();
    this.lastDetectedTime[handedness] = now;
    this.confidences[handedness] = confidence;

    if (this.isLost[handedness]) {
      this.isLost[handedness] = false;
      this.emit('handRecovered', { handedness, confidence });
    }
    this.updateQuality();
  }

  checkLoss() {
    const now = performance.now();
    ['Left', 'Right'].forEach(handedness => {
      const timeSinceDetection = now - this.lastDetectedTime[handedness];
      if (!this.isLost[handedness] && timeSinceDetection > this.lossThresholdMs) {
        this.isLost[handedness] = true;
        this.confidences[handedness] = 0;
        this.emit('handLost', { handedness, timeSinceDetection });
      }
    });

    this.updateQuality();
    return this.getStatus();
  }

  updateQuality() {
    const activeHands = (!this.isLost.Left ? 1 : 0) + (!this.isLost.Right ? 1 : 0);
    if (activeHands === 0) {
      this.quality = 'None';
      return;
    }

    const maxConf = Math.max(this.confidences.Left, this.confidences.Right);

    // Rate quality based on tracking confidence score, frame rate, and latency
    if (maxConf >= 0.85 && this.fps >= 24 && this.latency <= 45) {
      this.quality = 'Excellent';
    } else if (maxConf >= 0.70 && this.fps >= 18) {
      this.quality = 'Good';
    } else if (maxConf >= 0.45 && this.fps >= 12) {
      this.quality = 'Fair';
    } else {
      this.quality = 'Poor';
    }
  }

  getStatus() {
    return {
      leftLost: this.isLost.Left,
      rightLost: this.isLost.Right,
      leftConfidence: this.confidences.Left,
      rightConfidence: this.confidences.Right,
      fps: this.fps,
      latency: this.latency,
      quality: this.quality
    };
  }
}

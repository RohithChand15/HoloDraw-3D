import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { LandmarkFilter } from './landmarkFilter.js';
import { GestureRecognizer } from './gestureRecognizer.js';
import { ConfidenceMonitor } from './confidenceMonitor.js';

export class HandTrackingManager {
  constructor(options = {}) {
    this.handLandmarker = null;
    this.vision = null;
    this.isReady = false;
    this.activeDelegate = 'GPU';

    // Confidence thresholds
    this.minHandDetectionConfidence = options.minHandDetectionConfidence ?? 0.5;
    this.minHandPresenceConfidence = options.minHandPresenceConfidence ?? 0.5;
    this.minTrackingConfidence = options.minTrackingConfidence ?? 0.5;

    this.filter = new LandmarkFilter(options.filterOptions || {});
    this.recognizer = new GestureRecognizer(options.gestureOptions || {});
    this.confidenceMonitor = new ConfidenceMonitor(options.confidenceOptions || {});

    this.lastVideoTime = -1;
    this.listeners = new Map();
    this.drawSkeleton = true;

    // Last detection result cache
    this.lastResult = {
      hands: [],
      leftHand: null,
      rightHand: null,
      dual: null,
      timestamp: 0,
      fps: 0,
      latency: 0,
      quality: 'None'
    };
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

  async initialize() {
    this.emit('status', { message: 'Initializing Hand Tracking Engine...' });

    // 1. Resolve WASM assets (local first, CDN fallback)
    try {
      this.vision = await FilesetResolver.forVisionTasks('/wasm');
    } catch (localErr) {
      console.warn('Local WASM fileset failed, trying CDN fallback...', localErr);
      this.vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
    }

    // 2. Initialize HandLandmarker with GPU delegate and local/CDN model
    const modelAssetPath = '/models/hand_landmarker.task';
    const cdnModelPath = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

    try {
      this.handLandmarker = await this.createLandmarker(this.vision, modelAssetPath, 'GPU');
      this.activeDelegate = 'GPU';
    } catch (gpuErr) {
      console.warn('GPU delegate failed or local model failed, attempting fallback...', gpuErr);
      try {
        this.handLandmarker = await this.createLandmarker(this.vision, modelAssetPath, 'CPU');
        this.activeDelegate = 'CPU';
      } catch (cpuErr) {
        console.warn('Local model failed on CPU, trying CDN model on GPU...', cpuErr);
        try {
          this.handLandmarker = await this.createLandmarker(this.vision, cdnModelPath, 'GPU');
          this.activeDelegate = 'GPU';
        } catch (cdnGpuErr) {
          console.warn('CDN model on GPU failed, falling back to CPU...', cdnGpuErr);
          this.handLandmarker = await this.createLandmarker(this.vision, cdnModelPath, 'CPU');
          this.activeDelegate = 'CPU';
        }
      }
    }

    this.isReady = true;
    this.emit('ready', { delegate: this.activeDelegate });
    return { delegate: this.activeDelegate };
  }

  async createLandmarker(vision, modelPath, delegate = 'GPU') {
    return await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: delegate
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: this.minHandDetectionConfidence,
      minHandPresenceConfidence: this.minHandPresenceConfidence,
      minTrackingConfidence: this.minTrackingConfidence
    });
  }

  async setConfidenceThresholds(detection = 0.5, tracking = 0.5, presence = 0.5) {
    this.minHandDetectionConfidence = detection;
    this.minTrackingConfidence = tracking;
    this.minHandPresenceConfidence = presence;

    if (this.vision && this.handLandmarker) {
      try {
        const modelAssetPath = '/models/hand_landmarker.task';
        this.handLandmarker = await this.createLandmarker(this.vision, modelAssetPath, this.activeDelegate);
        console.log(`[HandTrackingManager] Updated confidence: detect=${detection}, track=${tracking}, presence=${presence}`);
      } catch (err) {
        console.warn('Could not recreate landmarker with updated thresholds:', err);
      }
    }
  }

  processVideoFrame(videoElement, timestamp = performance.now()) {
    if (!this.isReady || !videoElement || videoElement.readyState < 2) {
      return null;
    }

    this.confidenceMonitor.updateFrame();

    // Prevent re-processing identical video frame
    if (videoElement.currentTime === this.lastVideoTime) {
      this.confidenceMonitor.checkLoss();
      return this.lastResult;
    }
    this.lastVideoTime = videoElement.currentTime;

    let detections = null;
    const startInference = performance.now();
    try {
      detections = this.handLandmarker.detectForVideo(videoElement, timestamp);
    } catch (err) {
      console.error('HandLandmarker inference error:', err);
      return null;
    }
    const inferenceDuration = performance.now() - startInference;
    this.confidenceMonitor.recordLatency(inferenceDuration);

    const processedHands = [];
    let leftHand = null;
    let rightHand = null;

    if (detections && detections.landmarks && detections.landmarks.length > 0) {
      for (let i = 0; i < detections.landmarks.length; i++) {
        const rawLandmarks = detections.landmarks[i];
        const handednessInfo = detections.handedness?.[i]?.[0];
        const rawHandedness = handednessInfo?.categoryName || (i === 0 ? 'Right' : 'Left');
        const score = handednessInfo?.score ?? 0.85;

        // In mirrored video mode, MediaPipe's "Left" is the user's physical "Right" hand
        const physicalHandedness = rawHandedness === 'Left' ? 'Right' : 'Left';

        // Mirror X coordinates for direct intuitive mapping with mirrored video
        const mirroredLandmarks = rawLandmarks.map(p => ({
          x: 1.0 - p.x, // Flip X coordinate
          y: p.y,
          z: p.z || 0,
          visibility: p.visibility ?? 1.0
        }));

        // Apply smoothing filter to 21 landmarks
        const smoothedLandmarks = this.filter.smooth(mirroredLandmarks, physicalHandedness);

        // Recognize gestures
        const recognized = this.recognizer.recognizeHand(smoothedLandmarks, physicalHandedness);
        recognized.handedness = physicalHandedness;
        recognized.rawHandedness = rawHandedness;
        recognized.confidence = score;

        this.confidenceMonitor.recordHand(physicalHandedness, score);

        processedHands.push(recognized);

        if (physicalHandedness === 'Left') {
          leftHand = recognized;
        } else {
          rightHand = recognized;
        }
      }
    }

    // Check for hands that were not detected this frame
    this.confidenceMonitor.checkLoss();

    // Recognize dual-hand interactions (scaling, rotation, distance)
    const dual = this.recognizer.recognizeDual(leftHand, rightHand);

    this.lastResult = {
      hands: processedHands,
      leftHand,
      rightHand,
      dual,
      timestamp,
      fps: this.confidenceMonitor.fps,
      latency: this.confidenceMonitor.latency,
      quality: this.confidenceMonitor.quality
    };

    this.emit('hands', this.lastResult);
    return this.lastResult;
  }

  /**
   * Render holographic hand skeletons, index fingertip cursors,
   * hover/selection reticles, and dual connection tether.
   */
  renderHolographicSkeleton(ctx, width, height, hoverObject = null, selectedObject = null) {
    if (!this.drawSkeleton || !this.lastResult.hands.length) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const connections = [
      // Thumb
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Index
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Middle
      [0, 9], [9, 10], [10, 11], [11, 12],
      // Ring
      [0, 13], [13, 14], [14, 15], [15, 16],
      // Pinky
      [0, 17], [17, 18], [18, 19], [19, 20],
      // Palm base
      [5, 9], [9, 13], [13, 17]
    ];

    for (const hand of this.lastResult.hands) {
      const landmarks = hand.landmarks;
      if (!landmarks || landmarks.length < 21) continue;

      const isRight = hand.handedness === 'Right';
      const baseColor = isRight ? '#00f5ff' : '#a855f7';
      const glowColor = isRight ? 'rgba(0, 245, 255, 0.4)' : 'rgba(168, 85, 247, 0.4)';

      // 1. Draw glowing bones
      ctx.shadowBlur = 8;
      ctx.shadowColor = baseColor;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 3;

      for (const [startIdx, endIdx] of connections) {
        const p1 = landmarks[startIdx];
        const p2 = landmarks[endIdx];

        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        ctx.stroke();
      }

      // 2. Draw landmark joints
      for (let i = 0; i < landmarks.length; i++) {
        const p = landmarks[i];
        const px = p.x * width;
        const py = p.y * height;
        const isTip = [4, 8, 12, 16, 20].includes(i);
        const isIndexTip = i === 8;
        const isWrist = i === 0;

        ctx.beginPath();
        ctx.arc(px, py, isIndexTip ? 6 : isTip ? 4.5 : isWrist ? 5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = isIndexTip ? '#ffffff' : (isTip ? '#ffffff' : baseColor);
        ctx.fill();
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = isIndexTip ? 2 : 1.5;
        ctx.stroke();
      }

      // 3. Draw active Index Fingertip Cursor Indicator
      if (hand.cursor) {
        const cx = hand.cursor.x * width;
        const cy = hand.cursor.y * height;
        const isPinching = hand.isPinching;
        const isDrawing = hand.gesture === 'DRAW';
        const isHovering = Boolean(hoverObject);
        const isHoldingSelected = Boolean(selectedObject && isPinching);

        // Reticle color styling based on interaction state
        let reticleColor = baseColor;
        let ringRadius = 10;

        if (isDrawing) {
          reticleColor = '#00ff88'; // Neon Green for Drawing
          ringRadius = 12;
        } else if (isHoldingSelected) {
          reticleColor = '#00f5ff'; // Neon Cyan active manipulation
          ringRadius = 16;
        } else if (isPinching) {
          reticleColor = '#ff0077'; // Magenta pinch
          ringRadius = 14;
        } else if (isHovering) {
          reticleColor = '#facc15'; // Amber/Gold hover over 3D object
          ringRadius = 14;
        }

        ctx.shadowBlur = 10;
        ctx.shadowColor = reticleColor;

        // Outer reticle ring
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = reticleColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Crosshairs when hovering or selecting
        if (isHovering || isHoldingSelected) {
          const crossSize = 6;
          ctx.beginPath();
          ctx.moveTo(cx - ringRadius - crossSize, cy);
          ctx.lineTo(cx - ringRadius + 2, cy);
          ctx.moveTo(cx + ringRadius - 2, cy);
          ctx.lineTo(cx + ringRadius + crossSize, cy);
          ctx.moveTo(cx, cy - ringRadius - crossSize);
          ctx.lineTo(cx, cy - ringRadius + 2);
          ctx.moveTo(cx, cy + ringRadius - 2);
          ctx.lineTo(cx, cy + ringRadius + crossSize);
          ctx.stroke();
        }

        // Inner center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Gesture label floating badge
        ctx.shadowBlur = 0;
        ctx.font = '600 11px system-ui, -apple-system, sans-serif';
        let badgeText = `${hand.handedness.toUpperCase()}: ${hand.gesture}`;
        if (isHoldingSelected) {
          badgeText = `HOLDING: ${selectedObject.userData?.shapeType?.toUpperCase() || 'OBJECT'}`;
        } else if (isHovering) {
          badgeText = `HOVER: ${hoverObject.userData?.shapeType?.toUpperCase() || 'OBJECT'} (Pinch to Grab)`;
        }

        const badgeWidth = ctx.measureText(badgeText).width + 14;

        ctx.fillStyle = 'rgba(3, 7, 18, 0.85)';
        ctx.strokeStyle = reticleColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(cx - badgeWidth / 2, cy - 30, badgeWidth, 20, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, cx, cy - 20);
      }
    }

    // 4. Dual interaction tether line between hands
    if (this.lastResult.dual && this.lastResult.leftHand && this.lastResult.rightHand) {
      const p1 = this.lastResult.leftHand.cursor;
      const p2 = this.lastResult.rightHand.cursor;
      const mid = this.lastResult.dual.center;

      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Midpoint indicator
      ctx.beginPath();
      ctx.arc(mid.x * width, mid.y * height, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#00f5ff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00f5ff';
      ctx.fill();
    }

    ctx.restore();
  }

  setDrawSkeleton(enabled) {
    this.drawSkeleton = Boolean(enabled);
  }
}

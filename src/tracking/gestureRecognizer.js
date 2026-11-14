/**
 * Geometric Gesture Recognition Engine
 * Detects:
 * - DRAW (Index finger raised, other fingers curled)
 * - PINCH_SELECT (Thumb & Index tip touching or near)
 * - OPEN_PALM (All fingers extended)
 * - CLOSED_FIST (All fingers curled into palm)
 * - DUAL gestures (Two-hand distance, rotation angle, center)
 */

function distance2D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distance3D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class GestureRecognizer {
  constructor(options = {}) {
    this.pinchThreshold = options.pinchThreshold ?? 0.28;
    this.pinchReleaseThreshold = options.pinchReleaseThreshold ?? 0.36;

    // Hysteresis states for left and right hands
    this.handStates = {
      Left: {
        isPinching: false,
        activeGesture: 'IDLE',
        gestureStreak: 0,
        lastRecognized: 'IDLE'
      },
      Right: {
        isPinching: false,
        activeGesture: 'IDLE',
        gestureStreak: 0,
        lastRecognized: 'IDLE'
      }
    };
  }

  setPinchThreshold(val) {
    this.pinchThreshold = Math.max(0.15, Math.min(0.5, val));
    this.pinchReleaseThreshold = this.pinchThreshold * 1.3;
  }

  /**
   * Analyzes 21 landmarks of a single hand
   */
  recognizeHand(landmarks, handedness = 'Right') {
    if (!landmarks || landmarks.length < 21) {
      return {
        gesture: 'NONE',
        cursor: null,
        pinchRatio: 1.0,
        isPinching: false,
        handSize: 1.0,
        confidence: 0
      };
    }

    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexMcp = landmarks[5];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];
    const middleMcp = landmarks[9];
    const middlePip = landmarks[10];
    const middleTip = landmarks[12];
    const ringMcp = landmarks[13];
    const ringPip = landmarks[14];
    const ringTip = landmarks[16];
    const pinkyMcp = landmarks[17];
    const pinkyPip = landmarks[18];
    const pinkyTip = landmarks[20];

    // Reference hand scale: wrist to middle MCP
    const handScale = Math.max(distance3D(wrist, middleMcp), 0.05);

    // Finger extension tests (comparing distance from wrist to tip vs wrist to pip)
    const isIndexExtended = distance3D(wrist, indexTip) > distance3D(wrist, indexPip) * 1.15 &&
                            distance3D(wrist, indexTip) > distance3D(wrist, indexMcp) * 1.35;
    const isMiddleExtended = distance3D(wrist, middleTip) > distance3D(wrist, middlePip) * 1.15 &&
                             distance3D(wrist, middleTip) > distance3D(wrist, middleMcp) * 1.35;
    const isRingExtended = distance3D(wrist, ringTip) > distance3D(wrist, ringPip) * 1.15 &&
                           distance3D(wrist, ringTip) > distance3D(wrist, ringMcp) * 1.35;
    const isPinkyExtended = distance3D(wrist, pinkyTip) > distance3D(wrist, pinkyPip) * 1.15 &&
                            distance3D(wrist, pinkyTip) > distance3D(wrist, pinkyMcp) * 1.35;

    // Thumb extension relative to pinky MCP
    const thumbDistance = distance3D(thumbTip, pinkyMcp);
    const isThumbExtended = thumbDistance > handScale * 0.9;

    // Pinch distance
    const thumbIndexDist = distance3D(thumbTip, indexTip);
    const pinchRatio = thumbIndexDist / handScale;

    const state = this.handStates[handedness] || this.handStates.Right;

    // Hysteresis for pinch
    if (state.isPinching) {
      if (pinchRatio > this.pinchReleaseThreshold) {
        state.isPinching = false;
      }
    } else {
      if (pinchRatio < this.pinchThreshold) {
        state.isPinching = true;
      }
    }

    // Determine raw gesture
    let rawGesture = 'IDLE';

    if (state.isPinching) {
      rawGesture = 'PINCH_SELECT';
    } else if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
      rawGesture = 'CLOSED_FIST';
    } else if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended) {
      rawGesture = 'OPEN_PALM';
    } else if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
      rawGesture = 'DRAW';
    } else {
      rawGesture = 'POINT';
    }

    // Debounce gesture to prevent rapid jittering
    if (rawGesture === state.lastRecognized) {
      state.gestureStreak++;
      if (state.gestureStreak >= 2) {
        state.activeGesture = rawGesture;
      }
    } else {
      state.lastRecognized = rawGesture;
      state.gestureStreak = 1;
    }

    // Active cursor point:
    // If drawing, use indexTip
    // If pinching, use midpoint between thumbTip and indexTip
    // Otherwise indexTip
    let cursor = {
      x: indexTip.x,
      y: indexTip.y,
      z: indexTip.z || 0
    };

    if (state.isPinching) {
      cursor = {
        x: (thumbTip.x + indexTip.x) * 0.5,
        y: (thumbTip.y + indexTip.y) * 0.5,
        z: ((thumbTip.z || 0) + (indexTip.z || 0)) * 0.5
      };
    }

    return {
      gesture: state.activeGesture,
      rawGesture,
      cursor,
      pinchRatio,
      isPinching: state.isPinching,
      isIndexExtended,
      isMiddleExtended,
      isRingExtended,
      isPinkyExtended,
      isThumbExtended,
      handScale,
      landmarks
    };
  }

  /**
   * Analyzes two hands together for dual-hand manipulation:
   * scale (distance ratio), rotation angle, midpoint
   */
  recognizeDual(leftResult, rightResult) {
    if (!leftResult?.cursor || !rightResult?.cursor) {
      return null;
    }

    const p1 = leftResult.cursor;
    const p2 = rightResult.cursor;

    const distance = distance2D(p1, p2);
    const distance3d = distance3D(p1, p2);
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x); // Radians
    const center = {
      x: (p1.x + p2.x) * 0.5,
      y: (p1.y + p2.y) * 0.5,
      z: (p1.z + p2.z) * 0.5
    };

    const bothPinching = leftResult.isPinching && rightResult.isPinching;
    const bothOpen = leftResult.gesture === 'OPEN_PALM' && rightResult.gesture === 'OPEN_PALM';

    return {
      distance,
      distance3d,
      angle,
      center,
      leftPinch: p1,
      rightPinch: p2,
      bothPinching,
      bothOpen
    };
  }
}


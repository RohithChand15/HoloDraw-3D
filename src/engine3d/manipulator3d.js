import * as THREE from 'three';

/**
 * Manipulator3D manages 3D object interaction:
 * - Natural Hand Selection with Index Fingertip cursor & raycasting
 * - Hover preview with distinct visual styling (Amber/Gold)
 * - Selection outline with distinct visual styling (Neon Cyan / Emissive)
 * - Thumb-index pinch confirmation and smooth drag
 * - Two-hand dual scaling and rotation
 * - Depth manipulation via second hand or hand distance
 * - Trash zone drop deletion with full 3D Undo
 * - Transform modes (Translate, Rotate, Scale) and Axis Constraints (X, Y, Z)
 * - Screen boundaries (dimension and scale aware)
 */
export class Manipulator3D {
  constructor(threeScene, shapeLibrary) {
    this.scene = threeScene;
    this.shapeLib = shapeLibrary;

    // Selection & Hover state
    this.selectedObject = null;
    this.hoveredObject = null;
    this.selectionBox = null;
    this.hoverBox = null;
    this.setupVisualHelpers();

    // Manipulation state
    this.isDragging = false;
    this.dragOffset = new THREE.Vector3();
    this.initialObjectPos = new THREE.Vector3();
    this.initialHandPos = new THREE.Vector3();

    // Transform Modes & Constraints (from G, R, S, X, Y, Z shortcuts)
    this.transformMode = 'translate'; // 'translate' | 'rotate' | 'scale'
    this.rotationMode = 'free';       // 'free' | 'x' | 'y' | 'z'
    this.axisConstraint = null;        // null | 'x' | 'y' | 'z'

    // Dedicated rotation state
    this.isRotating = false;
    this.lastRotHandPos = { x: 0, y: 0 };
    this.smoothedRotX = 0;
    this.smoothedRotY = 0;
    this.smoothedRotZ = 0;

    // Two-hand manipulation state
    this.isDualManipulating = false;
    this.initialDualDistance = null;
    this.lastDualAngle = null;
    this.lastDualMidX = null;
    this.lastDualMidY = null;
    this.initialObjectScale = new THREE.Vector3();
    this.initialObjectRotation = new THREE.Euler();
    this.smoothedRotationDelta = 0;
    this.smoothedScaleFactor = 1.0;

    // Depth manipulation state
    this.initialHandScale = null;
    this.initialSecondHandY = null;
    this.initialSecondHandZ = null;
    this.initialObjectDepthZ = 0;
    this.smoothedDepthZ = 0;

    // Trash detection & deletion state
    this.isHoveringTrash = false;
    this.preTrashEmissive = null;

    // 3D Undo history stack
    this.undoStack = [];

    // 3D Drawing state
    this.is3DDrawing = false;
    this.activeCurvePoints = [];
    this.activeCurveMesh = null;
    this.drawingZDepth = 0;

    // Events
    this.listeners = new Map();

    this.setupMouseEvents();
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

  setupVisualHelpers() {
    // 1. Selection Bounding Box (Neon Cyan)
    this.selectionBox = new THREE.BoxHelper(new THREE.Mesh(), 0x00f5ff);
    this.selectionBox.material.transparent = true;
    this.selectionBox.material.opacity = 0.95;
    this.selectionBox.material.linewidth = 2;
    this.selectionBox.visible = false;
    this.scene.scene.add(this.selectionBox);

    // 2. Hover Bounding Box (Amber / Gold)
    this.hoverBox = new THREE.BoxHelper(new THREE.Mesh(), 0xfacc15);
    this.hoverBox.material.transparent = true;
    this.hoverBox.material.opacity = 0.8;
    this.hoverBox.material.linewidth = 1.5;
    this.hoverBox.visible = false;
    this.scene.scene.add(this.hoverBox);
  }

  setHoveredObject(mesh) {
    if (this.hoveredObject === mesh) return;

    // Clear previous hover
    if (this.hoveredObject && this.hoveredObject !== this.selectedObject) {
      if (this.hoveredObject.material?.emissive) {
        this.hoveredObject.material.emissiveIntensity = 0.25;
      }
    }

    this.hoveredObject = mesh;

    if (mesh && mesh !== this.selectedObject) {
      this.hoverBox.setFromObject(mesh);
      this.hoverBox.visible = true;
      if (mesh.material?.emissive) {
        mesh.material.emissiveIntensity = 0.5; // subtle glow on hover
      }
      this.emit('hover', mesh);
    } else {
      this.hoverBox.visible = false;
      this.emit('unhover');
    }
  }

  clearHover() {
    this.setHoveredObject(null);
  }

  selectObject(mesh) {
    if (this.selectedObject === mesh) {
      if (mesh && this.selectionBox) {
        this.selectionBox.setFromObject(mesh);
      }
      return;
    }

    // Reset pre-trash styling if previous object was unselected
    if (this.selectedObject && this.preTrashEmissive !== null) {
      if (this.selectedObject.material?.emissive) {
        this.selectedObject.material.emissive.setHex(this.preTrashEmissive);
        this.selectedObject.material.emissiveIntensity = 0.25;
      }
      this.preTrashEmissive = null;
    }

    // Clear hover visual when selecting
    if (this.hoverBox) {
      this.hoverBox.visible = false;
    }

    this.selectedObject = mesh;
    if (mesh) {
      this.selectionBox.setFromObject(mesh);
      this.selectionBox.material.color.setHex(0x00f5ff);
      this.selectionBox.visible = true;
      this.emit('select', mesh);
    } else {
      this.selectionBox.visible = false;
      this.emit('deselect');
    }
  }

  deselect() {
    this.selectObject(null);
    this.clearHover();
  }

  selectAll() {
    if (this.scene.holoObjects.length > 0) {
      this.selectObject(this.scene.holoObjects[0]);
      this.emit('selectAll', this.scene.holoObjects);
    }
  }

  deselectAll() {
    this.deselect();
  }

  /**
   * Precise Raycasting: Returns closest visible holographic object
   * to avoid accidental selection of objects behind the target.
   */
  raycast(normalizedX, normalizedY) {
    const ndcX = normalizedX * 2 - 1;
    const ndcY = -normalizedY * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.scene.camera);

    // Only raycast visible holographic objects
    const visibleObjects = this.scene.holoObjects.filter(obj => obj.visible);
    const intersects = raycaster.intersectObjects(visibleObjects, true);

    if (intersects.length > 0) {
      // Find top-level holo object for the closest intersection
      for (const hit of intersects) {
        let target = hit.object;
        while (target.parent && target.parent !== this.scene.scene) {
          if (target.userData?.isHoloObject) break;
          target = target.parent;
        }
        if (target.userData?.isHoloObject && target.visible) {
          return { object: target, point: hit.point };
        }
      }
    }
    return null;
  }

  /**
   * Process Hand Tracking Results for 3D Studio:
   * Handles:
   * - Natural Hover: Tracks index fingertip and highlights hovered object (Gold/Amber)
   * - Pinch Confirmation: Pinch confirms selection and triggers active transform mode
   * - Two-Hand Dual Pinch: Dedicated Rotation (around X, Y, Z, or Free) and Scaling
   * - Single-Hand Rotate: In Rotate mode, hand motion turns the cube visibly on designated axes
   * - Single-Hand Translate & Depth: In Translate mode, moves X/Y, and secondary hand OPEN_PALM controls depth
   * - Deselect: Closed fist deselects
   */
  processHandTracking(handResults, active3DTool = 'select') {
    if (!handResults) return;

    const rightHand = handResults.rightHand;
    const leftHand = handResults.leftHand;
    const dual = handResults.dual;

    // 1. TWO-HAND DUAL MANIPULATION: If both hands are pinching and an object is selected
    if (dual && dual.bothPinching && this.selectedObject) {
      if (this.isDragging) {
        this.endDrag();
      }
      if (this.isRotating) {
        this.endRotate();
      }
      this.handleDualHandManipulation(dual);
      return;
    } else {
      if (this.isDualManipulating) {
        this.isDualManipulating = false;
        this.initialDualDistance = null;
        this.lastDualAngle = null;
        this.lastDualMidX = null;
        this.lastDualMidY = null;
        this.smoothedRotX = 0;
        this.smoothedRotY = 0;
        this.smoothedRotZ = 0;
        if (this.selectionBox && this.selectedObject) {
          this.selectionBox.material.color.setHex(0x00f5ff);
          this.selectionBox.setFromObject(this.selectedObject);
        }
      }
    }

    // Dominant interaction hand (defaults to Right hand, or Left hand if only Left is present)
    const domHand = rightHand || leftHand;
    const secondHand = rightHand ? leftHand : null;

    if (!domHand || !domHand.cursor) {
      if (this.isDragging) this.endDrag();
      if (this.isRotating) this.endRotate();
      if (this.is3DDrawing) this.end3DDrawing();
      this.clearHover();
      return;
    }

    const cursor = domHand.cursor;
    const gesture = domHand.gesture;
    const isPinching = domHand.isPinching;

    const targetZ = this.selectedObject ? this.selectedObject.position.z : 0;
    const worldPoint = this.scene.screenToWorld(cursor.x, cursor.y, targetZ);

    // Keep bounding box updated with object transforms
    if (this.selectedObject && this.selectionBox.visible) {
      this.selectionBox.setFromObject(this.selectedObject);
    }
    if (this.hoveredObject && this.hoverBox.visible && this.hoveredObject !== this.selectedObject) {
      this.hoverBox.setFromObject(this.hoveredObject);
    }

    // 2. 3D FREEHAND TUBE DRAWING MODE
    if (active3DTool === 'draw_3d') {
      if (gesture === 'DRAW') {
        this.continue3DDrawing(worldPoint);
      } else if (this.is3DDrawing) {
        this.end3DDrawing();
      }
      return;
    }

    // 3. HOVER & NATURAL PINCH SELECTION / MANIPULATION
    if (!isPinching) {
      // Natural Hover Raycasting when fingers are pointing/hovering
      if (this.isDragging) {
        this.endDrag();
      }
      if (this.isRotating) {
        this.endRotate();
      }

      if (gesture === 'CLOSED_FIST') {
        // Deselect gesture
        if (this.selectedObject) {
          this.deselect();
        }
      } else {
        // Raycast object under index fingertip
        const hit = this.raycast(cursor.x, cursor.y);
        if (hit) {
          this.setHoveredObject(hit.object);
        } else {
          this.clearHover();
        }
      }
    } else {
      // User is PINCHING
      // If not selected yet, select hovered object or raycast hit
      if (!this.selectedObject) {
        if (this.hoveredObject) {
          this.selectObject(this.hoveredObject);
        } else {
          const hit = this.raycast(cursor.x, cursor.y);
          if (hit) {
            this.selectObject(hit.object);
          }
        }
      }

      if (!this.selectedObject) return;

      // Handle based on current Transform Mode
      if (this.transformMode === 'rotate') {
        // In Rotate Mode: pinching rotates the object
        if (this.isDragging) this.endDrag();
        if (!this.isRotating) {
          this.startRotate(cursor);
        } else {
          this.continueRotate(cursor);
        }
      } else {
        // In Translate (Move) Mode: pinching moves the object
        if (this.isRotating) this.endRotate();
        if (!this.isDragging) {
          this.startDrag(worldPoint, domHand, secondHand);
        } else {
          this.continueDrag(worldPoint, domHand, secondHand);
        }
      }
    }
  }

  /**
   * Two-hand rotation and scaling:
   * - Calculates angle between left & right pinch points and unwraps across ±PI.
   * - Rotates around appropriate 3D axes:
   *   - X-axis: pitch / up-down tilt
   *   - Y-axis: yaw / left-right turn
   *   - Z-axis: roll / viewing axis steering wheel
   *   - Free mode: all 3 axes rotate smoothly simultaneously
   * - Scales smoothly with deadzone protection and min/max limits
   * - Position Z (depth) is strictly isolated and never touched here
   */
  handleDualHandManipulation(dual) {
    if (!this.selectedObject) return;

    const pLeft = dual.leftPinch || dual.center;
    const pRight = dual.rightPinch || dual.center;

    const currentDist = Math.max(Math.hypot(pRight.x - pLeft.x, pRight.y - pLeft.y), 0.02);
    const currentAngle = Math.atan2(pRight.y - pLeft.y, pRight.x - pLeft.x);
    const currentMidX = (pRight.x + pLeft.x) * 0.5;
    const currentMidY = (pRight.y + pLeft.y) * 0.5;

    // Baseline initialization on dual pinch start
    if (this.initialDualDistance === null) {
      this.isDualManipulating = true;
      this.initialDualDistance = currentDist;
      this.lastDualAngle = currentAngle;
      this.lastDualMidX = currentMidX;
      this.lastDualMidY = currentMidY;
      this.initialObjectScale.copy(this.selectedObject.scale);
      this.initialObjectRotation.copy(this.selectedObject.rotation);
      this.smoothedScaleFactor = 1.0;
      this.smoothedRotX = 0;
      this.smoothedRotY = 0;
      this.smoothedRotZ = 0;
      if (this.selectionBox) {
        this.selectionBox.material.color.setHex(0xa855f7); // Electric purple during dual rotation
      }
      return;
    }

    // --- 1. Two-Hand Angle Calculation & Unwrapping ---
    let deltaAngle = currentAngle - this.lastDualAngle;
    while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
    while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
    this.lastDualAngle = currentAngle;

    const deltaMidX = currentMidX - (this.lastDualMidX ?? currentMidX);
    const deltaMidY = currentMidY - (this.lastDualMidY ?? currentMidY);
    this.lastDualMidX = currentMidX;
    this.lastDualMidY = currentMidY;

    // Determine active axis mode
    const activeAxis = this.axisConstraint || (this.rotationMode !== 'free' ? this.rotationMode : null);

    if (activeAxis === 'x') {
      // Rotate around X-Axis (Pitch: Up / Down)
      const rotXDelta = -deltaMidY * 5.0;
      this.smoothedRotX = this.smoothedRotX * 0.65 + rotXDelta * 0.35;
      this.selectedObject.rotation.x += this.smoothedRotX;
    } else if (activeAxis === 'y') {
      // Rotate around Y-Axis (Yaw: Left / Right)
      const rotYDelta = deltaMidX * 5.0;
      this.smoothedRotY = this.smoothedRotY * 0.65 + rotYDelta * 0.35;
      this.selectedObject.rotation.y += this.smoothedRotY;
    } else if (activeAxis === 'z') {
      // Rotate around Z-Axis (Roll: Viewing Axis)
      if (Math.abs(deltaAngle) > 0.002) {
        this.smoothedRotZ = this.smoothedRotZ * 0.65 + deltaAngle * 0.35;
        this.selectedObject.rotation.z += this.smoothedRotZ;
      } else {
        this.smoothedRotZ *= 0.5;
      }
    } else {
      // Free Rotation Mode: all 3 axes rotate smoothly
      // - Tilting hands like steering wheel rotates Z (viewing axis)
      if (Math.abs(deltaAngle) > 0.002) {
        this.smoothedRotZ = this.smoothedRotZ * 0.65 + deltaAngle * 0.35;
        this.selectedObject.rotation.z += this.smoothedRotZ;
      } else {
        this.smoothedRotZ *= 0.5;
      }
      // - Moving hands horizontally rotates Y (left / right)
      if (Math.abs(deltaMidX) > 0.001) {
        this.smoothedRotY = this.smoothedRotY * 0.65 + (deltaMidX * 4.5) * 0.35;
        this.selectedObject.rotation.y += this.smoothedRotY;
      } else {
        this.smoothedRotY *= 0.5;
      }
      // - Moving hands vertically rotates X (up / down)
      if (Math.abs(deltaMidY) > 0.001) {
        this.smoothedRotX = this.smoothedRotX * 0.65 + (-deltaMidY * 4.5) * 0.35;
        this.selectedObject.rotation.x += this.smoothedRotX;
      } else {
        this.smoothedRotX *= 0.5;
      }
    }

    // --- 2. Two-Hand Scaling (Clamped & Deadzone-protected) ---
    const MIN_SCALE = 0.25;
    const MAX_SCALE = 4.5;
    const rawRatio = currentDist / this.initialDualDistance;

    // Deadzone: only scale if pinch distance change exceeds 4% or if explicitly in scale mode
    if (Math.abs(rawRatio - 1.0) > 0.04 || this.transformMode === 'scale') {
      this.smoothedScaleFactor = this.smoothedScaleFactor * 0.75 + rawRatio * 0.25;
      const targetScale = this.initialObjectScale.clone().multiplyScalar(this.smoothedScaleFactor);
      targetScale.clampScalar(MIN_SCALE, MAX_SCALE);
      this.selectedObject.scale.copy(targetScale);
    }

    // --- 3. Screen Boundaries Enforcement ---
    this.scene.clampObjectToBounds(this.selectedObject);

    if (this.selectionBox) {
      this.selectionBox.setFromObject(this.selectedObject);
    }

    this.emit('transform', this.selectedObject);
  }

  // --- SINGLE-HAND ROTATION (Rotate Mode) ---
  startRotate(cursor) {
    if (!this.selectedObject) return;
    this.isRotating = true;
    this.lastRotHandPos = { x: cursor.x, y: cursor.y };
    this.smoothedRotX = 0;
    this.smoothedRotY = 0;
    this.smoothedRotZ = 0;

    if (this.selectionBox) {
      this.selectionBox.material.color.setHex(0xa855f7); // Electric purple while rotating
    }
    this.emit('rotateStart', this.selectedObject);
  }

  continueRotate(cursor) {
    if (!this.isRotating || !this.selectedObject) return;

    const dx = cursor.x - this.lastRotHandPos.x;
    const dy = cursor.y - this.lastRotHandPos.y;
    this.lastRotHandPos = { x: cursor.x, y: cursor.y };

    const ROT_SPEED = 4.5;
    const activeAxis = this.axisConstraint || (this.rotationMode !== 'free' ? this.rotationMode : null);

    if (activeAxis === 'x') {
      // Rotate around X-axis (Pitch: up/down)
      const targetDeltaX = -dy * ROT_SPEED;
      this.smoothedRotX = this.smoothedRotX * 0.6 + targetDeltaX * 0.4;
      this.selectedObject.rotation.x += this.smoothedRotX;
    } else if (activeAxis === 'y') {
      // Rotate around Y-axis (Yaw: left/right)
      const targetDeltaY = dx * ROT_SPEED;
      this.smoothedRotY = this.smoothedRotY * 0.6 + targetDeltaY * 0.4;
      this.selectedObject.rotation.y += this.smoothedRotY;
    } else if (activeAxis === 'z') {
      // Rotate around Z-axis (Roll: viewing axis)
      const normObjPos = this.scene.worldToScreen(this.selectedObject.position);
      const width = this.scene.container.clientWidth || window.innerWidth;
      const height = this.scene.container.clientHeight || window.innerHeight;
      const objNormX = normObjPos.x / width;
      const objNormY = normObjPos.y / height;

      const prevAngle = Math.atan2((cursor.y - dy) - objNormY, (cursor.x - dx) - objNormX);
      const currAngle = Math.atan2(cursor.y - objNormY, cursor.x - objNormX);
      let dAngle = currAngle - prevAngle;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;

      this.smoothedRotZ = this.smoothedRotZ * 0.6 + dAngle * 0.4;
      this.selectedObject.rotation.z += this.smoothedRotZ;
    } else {
      // Free Rotation: both X and Y simultaneously
      const targetDeltaX = -dy * ROT_SPEED;
      const targetDeltaY = dx * ROT_SPEED;
      this.smoothedRotX = this.smoothedRotX * 0.6 + targetDeltaX * 0.4;
      this.smoothedRotY = this.smoothedRotY * 0.6 + targetDeltaY * 0.4;
      this.selectedObject.rotation.x += this.smoothedRotX;
      this.selectedObject.rotation.y += this.smoothedRotY;
    }

    if (this.selectionBox) {
      this.selectionBox.setFromObject(this.selectedObject);
    }

    this.emit('transform', this.selectedObject);
  }

  endRotate() {
    if (!this.isRotating) return;
    this.isRotating = false;
    this.smoothedRotX = 0;
    this.smoothedRotY = 0;
    this.smoothedRotZ = 0;

    if (this.selectionBox && this.selectedObject) {
      this.selectionBox.material.color.setHex(0x00f5ff);
      this.selectionBox.setFromObject(this.selectedObject);
    }

    if (this.selectedObject) {
      this.emit('rotateEnd', this.selectedObject);
      this.emit('transform', this.selectedObject);
    }
  }

  startDrag(worldPoint, domHand = null, secondHand = null) {
    if (!this.selectedObject) return;
    this.isDragging = true;
    this.initialObjectPos.copy(this.selectedObject.position);
    this.initialHandPos.copy(worldPoint);
    this.dragOffset.subVectors(this.selectedObject.position, worldPoint);
    this.dragOffset.z = 0;

    this.initialHandScale = domHand ? (domHand.handScale || 0.15) : 0.15;
    this.initialObjectDepthZ = this.selectedObject.position.z;
    this.smoothedDepthZ = this.selectedObject.position.z;

    if (secondHand && secondHand.cursor) {
      this.initialSecondHandY = secondHand.cursor.y;
      this.initialSecondHandZ = secondHand.cursor.z || 0;
    } else {
      this.initialSecondHandY = null;
      this.initialSecondHandZ = null;
    }

    this.emit('dragStart', this.selectedObject);
  }

  /**
   * Continue dragging:
   * Maps cursor to X/Y on camera plane.
   * Maps second-hand movement (only when OPEN_PALM) or single-hand scale to controlled Z-axis depth.
   * Depth is strictly isolated from rotation.
   */
  continueDrag(worldPoint, domHand = null, secondHand = null) {
    if (!this.isDragging || !this.selectedObject) return;

    // 1. Base X and Y movement
    const targetPos = worldPoint.clone().add(this.dragOffset);

    // 2. Controlled Depth Manipulation (strictly isolated from rotation)
    let depthOffset = 0;

    // Only apply second-hand depth when second hand is explicitly OPEN_PALM
    // (prevents accidental depth shifts when approaching to pinch/rotate)
    if (secondHand && secondHand.cursor && secondHand.gesture === 'OPEN_PALM') {
      if (this.initialSecondHandY === null) {
        this.initialSecondHandY = secondHand.cursor.y;
        this.initialSecondHandZ = secondHand.cursor.z || 0;
      }
      const dy = (this.initialSecondHandY - secondHand.cursor.y) * 5.0;
      const dz = -((secondHand.cursor.z || 0) - this.initialSecondHandZ) * 6.0;
      depthOffset = dy + dz * 0.5;
    } else if (this.axisConstraint === 'z' && domHand?.cursor) {
      // Dedicated Z-axis constraint: vertical drag moves along depth
      const dy = -(domHand.cursor.y - 0.5) * 6.0;
      depthOffset = dy;
    }

    const targetZ = this.initialObjectDepthZ + depthOffset;
    this.smoothedDepthZ = THREE.MathUtils.lerp(this.smoothedDepthZ, targetZ, 0.25);
    targetPos.z = this.smoothedDepthZ;

    // Apply Transformation Axis Constraints (X, Y, Z shortcuts)
    if (this.axisConstraint === 'x') {
      targetPos.y = this.initialObjectPos.y;
      targetPos.z = this.initialObjectPos.z;
    } else if (this.axisConstraint === 'y') {
      targetPos.x = this.initialObjectPos.x;
      targetPos.z = this.initialObjectPos.z;
    } else if (this.axisConstraint === 'z') {
      targetPos.x = this.initialObjectPos.x;
      targetPos.y = this.initialObjectPos.y;
    }

    this.selectedObject.position.copy(targetPos);

    // 3. Screen Boundaries: Prevent object from leaving workspace (size & scale aware)
    this.scene.clampObjectToBounds(this.selectedObject);

    if (this.selectionBox) {
      this.selectionBox.setFromObject(this.selectedObject);
    }

    // 4. Trash Zone Detection & Highlighting
    const isInside = this.scene.isInsideTrashZone(this.selectedObject.position);
    this.setTrashHighlight(isInside);

    this.emit('drag', { object: this.selectedObject, isNearTrash: isInside });
    this.emit('transform', this.selectedObject);
  }

  setTrashHighlight(isHovering) {
    this.isHoveringTrash = isHovering;
    this.scene.highlightTrashZone(isHovering);

    if (this.selectionBox) {
      this.selectionBox.material.color.setHex(isHovering ? 0xff0055 : 0x00f5ff);
    }

    if (this.selectedObject && this.selectedObject.material) {
      if (isHovering) {
        if (this.preTrashEmissive === null && this.selectedObject.material.emissive) {
          this.preTrashEmissive = this.selectedObject.material.emissive.getHex();
        }
        this.selectedObject.material.emissive?.setHex(0xff0055);
        this.selectedObject.material.emissiveIntensity = 0.8;
      } else if (this.preTrashEmissive !== null) {
        this.selectedObject.material.emissive?.setHex(this.preTrashEmissive);
        this.selectedObject.material.emissiveIntensity = 0.25;
        this.preTrashEmissive = null;
      }
    }
  }

  endDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;

    const wasHovering = this.isHoveringTrash;
    this.setTrashHighlight(false);

    if (this.selectedObject) {
      if (wasHovering) {
        // Delete only after pinch release with full undo support
        const objToDelete = this.selectedObject;
        this.recordDeleteUndo(objToDelete);
        this.deleteSelected(false);
        this.emit('trashDrop', objToDelete);
      } else {
        this.emit('dragEnd', this.selectedObject);
      }
    }
  }

  // 3D Freehand Tube Drawing
  continue3DDrawing(worldPoint) {
    if (!this.is3DDrawing) {
      this.is3DDrawing = true;
      this.activeCurvePoints = [worldPoint.clone()];
      this.emit('draw3DStart');
      return;
    }

    const lastPoint = this.activeCurvePoints[this.activeCurvePoints.length - 1];
    if (lastPoint && lastPoint.distanceTo(worldPoint) > 0.08) {
      this.activeCurvePoints.push(worldPoint.clone());

      if (this.activeCurvePoints.length >= 2) {
        if (this.activeCurveMesh) {
          this.scene.removeObject(this.activeCurveMesh);
        }

        this.activeCurveMesh = this.shapeLib.create3DCurveFromPoints(
          this.activeCurvePoints,
          this.shapeLib.defaultColor
        );
        if (this.activeCurveMesh) {
          this.scene.addObject(this.activeCurveMesh);
        }
      }
    }
  }

  end3DDrawing() {
    if (!this.is3DDrawing) return;
    this.is3DDrawing = false;

    if (this.activeCurveMesh) {
      this.selectObject(this.activeCurveMesh);
      this.emit('draw3DEnd', this.activeCurveMesh);
    }

    this.activeCurvePoints = [];
    this.activeCurveMesh = null;
  }

  duplicateSelected() {
    if (!this.selectedObject) return null;
    const cloned = this.shapeLib.cloneShape(this.selectedObject);
    if (cloned) {
      this.scene.addObject(cloned);
      this.selectObject(cloned);
      this.emit('duplicate', cloned);
      return cloned;
    }
    return null;
  }

  recordDeleteUndo(object) {
    if (!object) return;
    this.undoStack.push({
      action: 'delete',
      object: object,
      name: object.name,
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
      color: object.userData?.color || '#00f5ff',
      materialType: object.userData?.materialType || 'glass',
      wireframe: Boolean(object.userData?.wireframe),
      visible: object.visible
    });
  }

  deleteSelected(recordUndo = true) {
    if (!this.selectedObject) return false;
    const obj = this.selectedObject;
    if (recordUndo) {
      this.recordDeleteUndo(obj);
    }
    this.deselect();
    this.scene.removeObject(obj);
    this.emit('delete', obj);
    return true;
  }

  undo() {
    if (!this.undoStack.length) return false;
    const entry = this.undoStack.pop();

    if (entry.action === 'delete') {
      const obj = entry.object;
      obj.position.copy(entry.position);
      obj.rotation.copy(entry.rotation);
      obj.scale.copy(entry.scale);
      obj.visible = entry.visible !== false;

      if (entry.name) obj.name = entry.name;
      if (entry.materialType) {
        this.shapeLib.applyMaterialType(obj, entry.materialType);
      }
      if (entry.color) {
        this.shapeLib.updateShapeColor(obj, entry.color);
      }
      if (entry.wireframe !== undefined) {
        this.shapeLib.toggleWireframe(obj, entry.wireframe);
      }

      this.scene.addObject(obj);
      this.selectObject(obj);
      this.emit('restore', obj);
      return true;
    }

    return false;
  }

  rotateSelected(dx, dy, dz) {
    if (!this.selectedObject) return;
    this.selectedObject.rotation.x += dx;
    this.selectedObject.rotation.y += dy;
    this.selectedObject.rotation.z += dz;
    if (this.selectionBox) {
      this.selectionBox.setFromObject(this.selectedObject);
    }
    this.emit('transform', this.selectedObject);
  }

  scaleSelected(factor) {
    if (!this.selectedObject) return;
    const newScale = this.selectedObject.scale.clone().multiplyScalar(factor);
    newScale.clampScalar(0.25, 4.5);
    this.selectedObject.scale.copy(newScale);
    this.scene.clampObjectToBounds(this.selectedObject);
    if (this.selectionBox) {
      this.selectionBox.setFromObject(this.selectedObject);
    }
    this.emit('transform', this.selectedObject);
  }

  resetTransformSelected() {
    if (!this.selectedObject) return;
    this.shapeLib.resetTransform(this.selectedObject);
    if (this.selectionBox) {
      this.selectionBox.setFromObject(this.selectedObject);
    }
    this.emit('transform', this.selectedObject);
  }

  toggleVisibilitySelected() {
    if (!this.selectedObject) return;
    const visible = this.shapeLib.toggleVisibility(this.selectedObject);
    if (!visible) {
      this.selectionBox.visible = false;
    } else {
      this.selectionBox.setFromObject(this.selectedObject);
      this.selectionBox.visible = true;
    }
    this.emit('transform', this.selectedObject);
    return visible;
  }

  setTransformMode(mode = 'translate', axis = null) {
    this.transformMode = mode;
    this.axisConstraint = axis;
    this.emit('modeChange', { mode, axis });
  }

  // Mouse & Keyboard Fallback for 3D interactions
  setupMouseEvents() {
    if (typeof window === 'undefined' || !this.scene?.renderer?.domElement) return;
    const dom = this.scene.renderer.domElement;
    let isMouseDown = false;
    let startMousePos = { x: 0, y: 0 };
    let startObjPos = new THREE.Vector3();
    let isTransforming = false;

    dom.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const rect = dom.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;

      const hit = this.raycast(normX, normY);
      if (hit) {
        this.selectObject(hit.object);
        isMouseDown = true;
        isTransforming = true;
        startMousePos = { x: e.clientX, y: e.clientY };
        startObjPos.copy(this.selectedObject.position);

        this.scene.controls.enabled = false;
      } else {
        if (!e.shiftKey && !e.altKey && !e.ctrlKey) {
          this.deselect();
        }
        this.scene.controls.enabled = true;
      }
    });

    window.addEventListener('mousemove', (e) => {
      const rect = dom.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;

      // Hover update when mouse is moving and not dragging
      if (!isMouseDown) {
        if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
          const hit = this.raycast(normX, normY);
          if (hit) {
            this.setHoveredObject(hit.object);
          } else {
            this.clearHover();
          }
        }
        return;
      }

      if (!this.selectedObject || !isTransforming) return;

      const dx = (e.clientX - startMousePos.x) * 0.01;
      const dy = -(e.clientY - startMousePos.y) * 0.01;

      if (e.altKey || this.transformMode === 'rotate') {
        // Rotate
        this.selectedObject.rotation.y += dx * 0.5;
        this.selectedObject.rotation.x -= dy * 0.5;
      } else if (e.shiftKey) {
        // Depth Z
        this.selectedObject.position.z = startObjPos.z + dy * 2.5;
      } else if (this.transformMode === 'scale') {
        const factor = 1 + dx * 0.5;
        this.scaleSelected(factor);
      } else {
        // Regular translate
        if (this.axisConstraint === 'x') {
          this.selectedObject.position.x = startObjPos.x + dx;
        } else if (this.axisConstraint === 'y') {
          this.selectedObject.position.y = startObjPos.y + dy;
        } else if (this.axisConstraint === 'z') {
          this.selectedObject.position.z = startObjPos.z + dy * 2.5;
        } else {
          this.selectedObject.position.x = startObjPos.x + dx;
          this.selectedObject.position.y = startObjPos.y + dy;
        }
      }

      this.scene.clampObjectToBounds(this.selectedObject);

      if (this.selectionBox) {
        this.selectionBox.setFromObject(this.selectedObject);
      }

      const isNearTrash = this.scene.isInsideTrashZone(this.selectedObject.position);
      this.setTrashHighlight(isNearTrash);
      this.emit('drag', { object: this.selectedObject, isNearTrash });
      this.emit('transform', this.selectedObject);
    });

    window.addEventListener('mouseup', () => {
      if (isMouseDown) {
        isMouseDown = false;
        isTransforming = false;
        this.scene.controls.enabled = true;

        const wasHovering = this.isHoveringTrash;
        this.setTrashHighlight(false);

        if (this.selectedObject && wasHovering) {
          const objToDelete = this.selectedObject;
          this.recordDeleteUndo(objToDelete);
          this.deleteSelected(false);
          this.emit('trashDrop', objToDelete);
        }
      }
    });

    dom.addEventListener('wheel', (e) => {
      if (this.selectedObject && e.ctrlKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.05 : 0.95;
        this.scaleSelected(factor);
      }
    }, { passive: false });
  }
}

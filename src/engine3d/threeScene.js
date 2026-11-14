import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * ThreeScene manages the 3D WebGL rendering pipeline, camera, lighting,
 * holographic grid, floating particles, and virtual workspace boundaries.
 */
export class ThreeScene {
  constructor(containerElement) {
    this.container = containerElement;

    // Core components
    this.scene = new THREE.Scene();
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Holographic elements
    this.grid = null;
    this.particles = null;
    this.boundaryBox = null;
    this.trashZone = null;

    // Objects collection in the workspace
    this.holoObjects = [];

    // Virtual boundary limits (X, Y, Z in world units)
    this.workspaceBounds = {
      minX: -4.5,
      maxX: 4.5,
      minY: -2.8,
      maxY: 3.2,
      minZ: -4.0,
      maxZ: 4.0
    };

    this.init();
    this.setupResize();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Perspective Camera
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 7.5);

    // 2. WebGL Renderer with transparency & high-precision
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // 3. Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 25;
    this.controls.minDistance = 2;
    this.controls.target.set(0, 0, 0);

    // 4. Lighting Rig
    this.setupLighting();

    // 5. Holographic Environment
    this.setupHolographicEnvironment();

    // 6. Virtual Workspace Bounding Box & Trash Zone
    this.setupBoundaries();
    this.setupTrashZone();
  }

  setupLighting() {
    // Ambient light with deep navy tint
    const ambientLight = new THREE.AmbientLight(0x0a192f, 2.0);
    this.scene.add(ambientLight);

    // Primary Neon Cyan directional light
    const dirCyan = new THREE.DirectionalLight(0x00f5ff, 2.5);
    dirCyan.position.set(5, 8, 6);
    this.scene.add(dirCyan);

    // Secondary Neon Purple / Magenta rim light
    const dirPurple = new THREE.DirectionalLight(0xa855f7, 2.0);
    dirPurple.position.set(-6, -4, -4);
    this.scene.add(dirPurple);

    // Top soft fill
    const topLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    topLight.position.set(0, 6, 0);
    this.scene.add(topLight);
  }

  setupHolographicEnvironment() {
    // 1. Animated Holographic Floor Grid
    const gridHelper = new THREE.GridHelper(16, 24, 0x00f5ff, 0x0f2b48);
    gridHelper.position.y = this.workspaceBounds.minY - 0.2;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.45;
    this.scene.add(gridHelper);
    this.grid = gridHelper;

    // 2. Subtle Floating Cyber Particles
    const particleCount = 180;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const cyan = new THREE.Color(0x00f5ff);
    const purple = new THREE.Color(0xa855f7);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12;

      const mixed = cyan.clone().lerp(purple, Math.random());
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, particleMaterial);
    this.scene.add(this.particles);

    // 3. Coordinate Axes Helper (Toggleable in Settings)
    const axes = new THREE.AxesHelper(3.5);
    axes.material.transparent = true;
    axes.material.opacity = 0.65;
    axes.visible = false;
    this.scene.add(axes);
    this.axes = axes;
  }

  toggleGrid(visible) {
    if (this.grid) this.grid.visible = Boolean(visible);
  }

  toggleAxes(visible) {
    if (this.axes) this.axes.visible = Boolean(visible);
  }

  setGraphicsQuality(level = 'high') {
    this.graphicsQuality = level;
    if (!this.renderer) return;

    if (level === 'high') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      if (this.particles) this.particles.visible = true;
    } else if (level === 'medium') {
      this.renderer.setPixelRatio(1.0);
      if (this.particles) this.particles.visible = true;
    } else {
      // low
      this.renderer.setPixelRatio(0.75);
      if (this.particles) this.particles.visible = false;
    }
  }

  setupBoundaries() {
    const b = this.workspaceBounds;
    const sizeX = b.maxX - b.minX;
    const sizeY = b.maxY - b.minY;
    const sizeZ = b.maxZ - b.minZ;

    const boxGeo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f5ff,
      transparent: true,
      opacity: 0.2,
      linewidth: 1
    });

    this.boundaryBox = new THREE.LineSegments(edges, lineMat);
    this.boundaryBox.position.set(
      (b.minX + b.maxX) / 2,
      (b.minY + b.maxY) / 2,
      (b.minZ + b.maxZ) / 2
    );
    this.scene.add(this.boundaryBox);
  }

  setupTrashZone() {
    // 3D holographic trash portal in bottom right
    const group = new THREE.Group();
    group.position.set(3.4, this.workspaceBounds.minY + 0.4, 0.5);

    // Outer rotating glowing ring
    const ringGeo = new THREE.TorusGeometry(0.7, 0.03, 16, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff0055,
      transparent: true,
      opacity: 0.7
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // Inner pulsing warning circle
    const innerGeo = new THREE.CircleGeometry(0.65, 32);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xff0055,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = Math.PI / 2;
    group.add(inner);

    // Trash zone bounding sphere for collision detection
    group.userData = {
      isTrashZone: true,
      radius: 0.95
    };

    this.trashZone = group;
    this.scene.add(this.trashZone);
  }

  isInsideTrashZone(position) {
    if (!this.trashZone) return false;
    const dist = this.trashZone.position.distanceTo(position);
    return dist < this.trashZone.userData.radius;
  }

  highlightTrashZone(active = true) {
    if (!this.trashZone) return;
    const ring = this.trashZone.children[0];
    const inner = this.trashZone.children[1];
    if (ring && ring.material) {
      ring.material.color.setHex(active ? 0xff0033 : 0xff0055);
      ring.material.opacity = active ? 0.95 : 0.7;
    }
    if (inner && inner.material) {
      inner.material.opacity = active ? 0.45 : 0.18;
    }
  }

  clampObjectToBounds(object) {
    if (!object) return;

    // Compute bounding box excluding helper/outline if any
    const box = new THREE.Box3();
    object.updateMatrixWorld(true);
    box.setFromObject(object);

    const size = new THREE.Vector3();
    box.getSize(size);

    const halfX = size.x / 2;
    const halfY = size.y / 2;
    const halfZ = size.z / 2;

    const b = this.workspaceBounds;

    // Safety margin to prevent negative clamping for very large objects
    const maxHalfX = (b.maxX - b.minX) * 0.45;
    const maxHalfY = (b.maxY - b.minY) * 0.45;
    const maxHalfZ = (b.maxZ - b.minZ) * 0.45;

    const effHalfX = Math.min(halfX, maxHalfX);
    const effHalfY = Math.min(halfY, maxHalfY);
    const effHalfZ = Math.min(halfZ, maxHalfZ);

    const minX = b.minX + effHalfX;
    const maxX = b.maxX - effHalfX;
    const minY = b.minY + effHalfY;
    const maxY = b.maxY - effHalfY;
    const minZ = b.minZ + effHalfZ;
    const maxZ = b.maxZ - effHalfZ;

    object.position.x = THREE.MathUtils.clamp(object.position.x, minX, maxX);
    object.position.y = THREE.MathUtils.clamp(object.position.y, minY, maxY);
    object.position.z = THREE.MathUtils.clamp(object.position.z, minZ, maxZ);

    return object.position;
  }

  clampToBoundaries(position) {
    const b = this.workspaceBounds;
    return new THREE.Vector3(
      Math.max(b.minX, Math.min(b.maxX, position.x)),
      Math.max(b.minY, Math.min(b.maxY, position.y)),
      Math.max(b.minZ, Math.min(b.maxZ, position.z))
    );
  }

  addObject(mesh) {
    if (!mesh) return;
    this.scene.add(mesh);
    if (!this.holoObjects.includes(mesh)) {
      this.holoObjects.push(mesh);
    }
  }

  removeObject(mesh) {
    if (!mesh) return;
    this.scene.remove(mesh);
    const idx = this.holoObjects.indexOf(mesh);
    if (idx !== -1) {
      this.holoObjects.splice(idx, 1);
    }
  }

  clearObjects() {
    [...this.holoObjects].forEach(obj => {
      this.removeObject(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    this.holoObjects = [];
  }

  setupResize() {
    this.resize = () => {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;

      if (this.camera && this.renderer) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
      }
    };

    window.addEventListener('resize', this.resize);
  }

  render(time = 0) {
    // Subtle particle drift
    if (this.particles) {
      this.particles.rotation.y = time * 0.0001;
    }

    // Animate trash zone ring pulse
    if (this.trashZone) {
      const ring = this.trashZone.children[0];
      if (ring) {
        ring.rotation.z = time * 0.002;
        const scale = 1.0 + Math.sin(time * 0.004) * 0.06;
        ring.scale.set(scale, scale, scale);
      }
    }

    if (this.controls) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }

  screenToWorld(screenX, screenY, targetZ = 0) {
    // Converts normalized screen coordinates [0, 1] into 3D world coordinates on a plane at targetZ
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    const ndcX = (screenX * width / width) * 2 - 1;
    const ndcY = -(screenY * height / height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -targetZ);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, target);
    return target;
  }

  worldToScreen(worldPos) {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    const cloned = worldPos.clone().project(this.camera);
    return {
      x: ((cloned.x + 1) * width) / 2,
      y: ((-cloned.y + 1) * height) / 2
    };
  }
}


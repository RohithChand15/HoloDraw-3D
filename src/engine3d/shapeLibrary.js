import * as THREE from 'three';

/**
 * ShapeLibrary creates holographic 3D primitives and materials.
 * Supports: Cube, Sphere, Cylinder, Cone, Pyramid, Torus, Plane, 3D Curves.
 * Materials: Holographic Glass, Neon Wireframe, Metallic Chrome, Plasma Emissive.
 */
export class ShapeLibrary {
  constructor() {
    this.defaultColor = '#00f5ff';
  }

  createHolographicMaterial(color = this.defaultColor, wireframe = false) {
    const threeColor = new THREE.Color(color);

    return new THREE.MeshPhysicalMaterial({
      color: threeColor,
      emissive: threeColor,
      emissiveIntensity: 0.25,
      metalness: 0.1,
      roughness: 0.15,
      transmission: 0.65,
      thickness: 1.2,
      ior: 1.5,
      transparent: true,
      opacity: 0.85,
      wireframe: wireframe,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  createOutlineMesh(geometry, color = '#00f5ff') {
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.65,
      linewidth: 1
    });
    return new THREE.LineSegments(edges, lineMat);
  }

  assembleShape(geometry, type, color = this.defaultColor, options = {}) {
    const materialType = options.materialType || 'glass';
    const wireframe = options.wireframe || false;
    const mesh = new THREE.Mesh(geometry, this.createHolographicMaterial(color, wireframe));
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Attach holographic edge wireframe outline
    const outline = this.createOutlineMesh(geometry, color);
    outline.name = '__holo_outline__';
    mesh.add(outline);

    // Metadata for serialization and manipulation
    const namePrefix = type.charAt(0).toUpperCase() + type.slice(1);
    mesh.name = `${namePrefix}_${Math.floor(Math.random() * 900 + 100)}`;

    mesh.userData = {
      isHoloObject: true,
      shapeType: type,
      color: color,
      materialType: materialType,
      wireframe: wireframe,
      visible: true,
      createdTime: Date.now(),
      id: 'holo_' + Math.random().toString(36).substring(2, 9)
    };

    if (materialType !== 'glass') {
      this.applyMaterialType(mesh, materialType);
    }

    return mesh;
  }

  createCube(size = 1.2, color = this.defaultColor) {
    const geo = new THREE.BoxGeometry(size, size, size);
    return this.assembleShape(geo, 'cube', color);
  }

  createSphere(radius = 0.8, color = this.defaultColor) {
    const geo = new THREE.SphereGeometry(radius, 32, 24);
    return this.assembleShape(geo, 'sphere', color);
  }

  createCylinder(radius = 0.6, height = 1.4, color = this.defaultColor) {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 32);
    return this.assembleShape(geo, 'cylinder', color);
  }

  createCone(radius = 0.7, height = 1.4, color = this.defaultColor) {
    const geo = new THREE.ConeGeometry(radius, height, 32);
    return this.assembleShape(geo, 'cone', color);
  }

  createPyramid(radius = 0.8, height = 1.4, color = this.defaultColor) {
    const geo = new THREE.ConeGeometry(radius, height, 4);
    return this.assembleShape(geo, 'pyramid', color);
  }

  createTorus(radius = 0.8, tube = 0.25, color = this.defaultColor) {
    const geo = new THREE.TorusGeometry(radius, tube, 24, 48);
    return this.assembleShape(geo, 'torus', color);
  }

  createPlane(width = 1.6, height = 1.6, color = this.defaultColor) {
    const geo = new THREE.PlaneGeometry(width, height);
    return this.assembleShape(geo, 'plane', color);
  }

  create3DLine(points = [], color = this.defaultColor) {
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 64, 0.05, 8, false);
    return this.assembleShape(geo, '3d_line', color);
  }

  create3DCurveFromPoints(points = [], color = this.defaultColor, radius = 0.04) {
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, Math.max(points.length * 4, 32), radius, 8, false);
    return this.assembleShape(geo, '3d_curve', color);
  }

  applyMaterialType(mesh, materialType = 'glass') {
    if (!mesh || !mesh.userData?.isHoloObject) return;
    const colorHex = mesh.userData.color || this.defaultColor;
    const color = new THREE.Color(colorHex);
    mesh.userData.materialType = materialType;
    const wireframe = Boolean(mesh.userData.wireframe);

    let mat;
    switch (materialType) {
      case 'wireframe':
        mat = new THREE.MeshBasicMaterial({
          color: color,
          wireframe: true,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide
        });
        break;
      case 'chrome':
        mat = new THREE.MeshStandardMaterial({
          color: color,
          metalness: 0.95,
          roughness: 0.1,
          transparent: true,
          opacity: 0.95,
          wireframe: wireframe,
          side: THREE.DoubleSide
        });
        break;
      case 'plasma':
        mat = new THREE.MeshStandardMaterial({
          color: color,
          emissive: color,
          emissiveIntensity: 0.85,
          roughness: 0.3,
          metalness: 0.2,
          transparent: true,
          opacity: 0.9,
          wireframe: wireframe,
          side: THREE.DoubleSide
        });
        break;
      case 'glass':
      default:
        mat = this.createHolographicMaterial(colorHex, wireframe);
        break;
    }

    mesh.material = mat;
  }

  updateShapeColor(mesh, newColor) {
    if (!mesh || !mesh.userData?.isHoloObject) return;
    mesh.userData.color = newColor;

    const threeColor = new THREE.Color(newColor);
    if (mesh.material) {
      mesh.material.color = threeColor;
      if (mesh.material.emissive) {
        mesh.material.emissive = threeColor;
      }
    }

    const outline = mesh.getObjectByName('__holo_outline__');
    if (outline && outline.material) {
      outline.material.color = threeColor;
    }
  }

  toggleWireframe(mesh, forceState = null) {
    if (!mesh || !mesh.userData?.isHoloObject) return;
    const state = forceState !== null ? forceState : !mesh.userData.wireframe;
    mesh.userData.wireframe = state;
    if (mesh.material) {
      mesh.material.wireframe = state;
    }
  }

  toggleVisibility(mesh, forceState = null) {
    if (!mesh || !mesh.userData?.isHoloObject) return;
    const state = forceState !== null ? forceState : !mesh.visible;
    mesh.visible = state;
    mesh.userData.visible = state;
    return state;
  }

  resetTransform(mesh) {
    if (!mesh) return;
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
  }

  cloneShape(mesh) {
    if (!mesh || !mesh.userData?.isHoloObject) return null;
    const type = mesh.userData.shapeType;
    const color = mesh.userData.color || this.defaultColor;
    const materialType = mesh.userData.materialType || 'glass';
    const wireframe = Boolean(mesh.userData.wireframe);

    let cloned = null;
    if (type === '3d_curve' || type === '3d_line') {
      const geo = mesh.geometry.clone();
      cloned = this.assembleShape(geo, type, color, { wireframe, materialType });
    } else {
      switch (type) {
        case 'cube': cloned = this.createCube(1.2, color); break;
        case 'sphere': cloned = this.createSphere(0.8, color); break;
        case 'cylinder': cloned = this.createCylinder(0.6, 1.4, color); break;
        case 'cone': cloned = this.createCone(0.7, 1.4, color); break;
        case 'pyramid': cloned = this.createPyramid(0.8, 1.4, color); break;
        case 'torus': cloned = this.createTorus(0.8, 0.25, color); break;
        case 'plane': cloned = this.createPlane(1.6, 1.6, color); break;
        default: cloned = this.createCube(1.2, color); break;
      }
    }

    if (materialType !== 'glass') {
      this.applyMaterialType(cloned, materialType);
    }

    cloned.position.copy(mesh.position).add(new THREE.Vector3(0.35, 0.35, 0));
    cloned.rotation.copy(mesh.rotation);
    cloned.scale.copy(mesh.scale);
    return cloned;
  }
}

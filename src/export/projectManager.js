import * as THREE from 'three';

/**
 * ProjectManager handles saving and loading full HOLODraw 3D project state
 * including 2D raster art, 3D objects, geometries, transforms, materials,
 * visibility, and workspace settings.
 */
export class ProjectManager {
  constructor(drawingCanvas2D, threeScene, shapeLibrary) {
    this.canvas2D = drawingCanvas2D;
    this.scene3D = threeScene;
    this.shapeLib = shapeLibrary;
  }

  saveProject(extraSettings = {}) {
    const projectData = {
      version: '1.2.0',
      timestamp: Date.now(),
      name: 'HOLODraw Project',
      settings: extraSettings,
      canvas2D: {
        dataUrl: this.canvas2D.getDataURL()
      },
      scene3D: {
        cameraPosition: {
          x: this.scene3D.camera.position.x,
          y: this.scene3D.camera.position.y,
          z: this.scene3D.camera.position.z
        },
        objects: this.scene3D.holoObjects.map(obj => {
          const type = obj.userData?.shapeType || 'cube';
          const data = {
            id: obj.userData?.id,
            name: obj.name || `${type}_object`,
            shapeType: type,
            color: obj.userData?.color || '#00f5ff',
            materialType: obj.userData?.materialType || 'glass',
            wireframe: Boolean(obj.userData?.wireframe),
            visible: obj.visible !== false,
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
          };

          if (type === '3d_curve' || type === '3d_line') {
            const posAttr = obj.geometry.getAttribute('position');
            const pts = [];
            if (posAttr) {
              const stride = Math.max(1, Math.floor(posAttr.count / 30));
              for (let i = 0; i < posAttr.count; i += stride) {
                pts.push({
                  x: posAttr.getX(i),
                  y: posAttr.getY(i),
                  z: posAttr.getZ(i)
                });
              }
            }
            data.curvePoints = pts;
          }

          return data;
        })
      }
    };

    const json = JSON.stringify(projectData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `holodraw-project-${new Date().toISOString().slice(0, 10)}.holodraw`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return projectData;
  }

  async loadProjectFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          // Schema validation
          if (!data || (!data.scene3D && !data.canvas2D)) {
            throw new Error('Invalid or corrupted HOLODraw project file.');
          }
          await this.restoreProject(data);
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read project file.'));
      reader.readAsText(file);
    });
  }

  async restoreProject(data) {
    if (!data) return;

    // 1. Restore 2D canvas
    if (data.canvas2D?.dataUrl) {
      await this.canvas2D.loadFromDataURL(data.canvas2D.dataUrl);
    }

    // 2. Clear existing 3D objects
    this.scene3D.clearObjects();

    // 3. Restore 3D objects
    if (data.scene3D?.objects && Array.isArray(data.scene3D.objects)) {
      for (const item of data.scene3D.objects) {
        let mesh = null;
        const color = item.color || '#00f5ff';

        switch (item.shapeType) {
          case 'cube': mesh = this.shapeLib.createCube(1.2, color); break;
          case 'sphere': mesh = this.shapeLib.createSphere(0.8, color); break;
          case 'cylinder': mesh = this.shapeLib.createCylinder(0.6, 1.4, color); break;
          case 'cone': mesh = this.shapeLib.createCone(0.7, 1.4, color); break;
          case 'pyramid': mesh = this.shapeLib.createPyramid(0.8, 1.4, color); break;
          case 'torus': mesh = this.shapeLib.createTorus(0.8, 0.25, color); break;
          case 'plane': mesh = this.shapeLib.createPlane(1.6, 1.6, color); break;
          case '3d_curve':
          case '3d_line':
            if (item.curvePoints && item.curvePoints.length >= 2) {
              const pts = item.curvePoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
              mesh = this.shapeLib.create3DCurveFromPoints(pts, color);
            }
            break;
          default:
            mesh = this.shapeLib.createCube(1.2, color);
        }

        if (mesh) {
          if (item.name) mesh.name = item.name;
          if (item.position) mesh.position.set(item.position.x, item.position.y, item.position.z);
          if (item.rotation) mesh.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
          if (item.scale) mesh.scale.set(item.scale.x, item.scale.y, item.scale.z);
          if (item.wireframe) this.shapeLib.toggleWireframe(mesh, true);
          if (item.materialType) this.shapeLib.applyMaterialType(mesh, item.materialType);
          if (item.visible !== undefined) mesh.visible = Boolean(item.visible);

          this.scene3D.addObject(mesh);
        }
      }
    }
  }
}

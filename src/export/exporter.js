import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Exporter handles:
 * - 2D Drawing PNG export
 * - 3D Scene GLB binary export via Three.js GLTFExporter
 */
export class Exporter {
  /**
   * Export 2D Canvas as PNG
   */
  static export2DPNG(canvas, filename = 'holodraw-2d.png', withBackground = true) {
    if (!canvas) return;

    if (!withBackground) {
      const dataUrl = canvas.toDataURL('image/png');
      this.triggerDownload(dataUrl, filename);
      return;
    }

    // Export with holographic dark navy background
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');

    // Dark navy gradient background
    const grad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 50,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.7
    );
    grad.addColorStop(0, '#06101e');
    grad.addColorStop(1, '#02050b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.08)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw user artwork
    ctx.drawImage(canvas, 0, 0);

    const dataUrl = exportCanvas.toDataURL('image/png');
    this.triggerDownload(dataUrl, filename);
  }

  /**
   * Export 3D Scene as binary GLB
   */
  static export3DGLB(threeScene, filename = 'holodraw-scene.glb') {
    return new Promise((resolve, reject) => {
      if (!threeScene || !threeScene.holoObjects.length) {
        reject(new Error('No 3D objects in the scene to export.'));
        return;
      }

      const exporter = new GLTFExporter();
      const exportGroup = [];

      threeScene.holoObjects.forEach(obj => {
        const clone = obj.clone(true);
        // Remove outline line segments helper from export
        const outline = clone.getObjectByName('__holo_outline__');
        if (outline) clone.remove(outline);

        // Standard material conversion for universal GLB compatibility
        if (clone.material) {
          const col = clone.material.color ? clone.material.color.clone() : new THREE.Color(0x00f5ff);
          clone.material = new THREE.MeshStandardMaterial({
            color: col,
            emissive: col,
            emissiveIntensity: 0.2,
            roughness: 0.2,
            metalness: 0.1,
            transparent: true,
            opacity: 0.85
          });
        }

        exportGroup.push(clone);
      });

      const options = {
        binary: true,
        onlyVisible: true,
        embedImages: true
      };

      try {
        exporter.parse(
          exportGroup,
          (result) => {
            if (result instanceof ArrayBuffer) {
              const blob = new Blob([result], { type: 'model/gltf-binary' });
              const url = URL.createObjectURL(blob);
              this.triggerDownload(url, filename);
              URL.revokeObjectURL(url);
              resolve();
            } else {
              const output = JSON.stringify(result, null, 2);
              const blob = new Blob([output], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              this.triggerDownload(url, filename.replace('.glb', '.gltf'));
              URL.revokeObjectURL(url);
              resolve();
            }
          },
          (error) => {
            console.error('An error occurred exporting GLB:', error);
            reject(error);
          },
          options
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  static triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

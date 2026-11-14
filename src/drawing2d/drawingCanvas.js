/**
 * DrawingCanvas2D handles all 2D vector & raster drawing operations:
 * - Freehand smooth strokes (Catmull-Rom / Bézier smoothing)
 * - Geometric tools: Line, Rectangle, Circle, Triangle
 * - Eraser
 * - High-DPI canvas backing
 * - Undo / Redo history stack
 * - Color & brush width controls
 * - Screen boundary clamping
 * - Mouse and trackpad fallback
 */
export class DrawingCanvas2D {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { willReadFrequently: true });

    // Drawing settings
    this.tool = 'freehand'; // 'freehand' | 'line' | 'rect' | 'circle' | 'triangle' | 'eraser'
    this.brushStyle = 'neon'; // 'neon' | 'solid' | 'dotted' | 'calligraphy'
    this.color = '#00f5ff';
    this.brushSize = 6;
    this.eraserSize = 24;

    // Boundary margins (percentage of screen from edge)
    this.boundaryMargin = {
      top: 0.04,
      bottom: 0.06,
      left: 0.04,
      right: 0.04
    };

    // Stroke state
    this.isDrawing = false;
    this.points = [];
    this.startPoint = null;

    // History stack for Undo/Redo
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 30;

    // Scratch canvas for interactive shape preview
    this.previewCanvas = document.createElement('canvas');
    this.previewCtx = this.previewCanvas.getContext('2d');

    this.setupResize();
    this.setupMouseEvents();
    this.saveState();
  }

  setupResize() {
    this.resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);

      if (this.canvas.width !== w || this.canvas.height !== h) {
        // Preserve existing drawing across resize
        const temp = document.createElement('canvas');
        temp.width = this.canvas.width;
        temp.height = this.canvas.height;
        if (temp.width > 0 && temp.height > 0) {
          temp.getContext('2d').drawImage(this.canvas, 0, 0);
        }

        this.canvas.width = w;
        this.canvas.height = h;
        this.previewCanvas.width = w;
        this.previewCanvas.height = h;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.previewCtx.setTransform(1, 0, 0, 1, 0, 0);

        if (temp.width > 0 && temp.height > 0) {
          this.ctx.drawImage(temp, 0, 0);
        }

        this.ctx.scale(dpr, dpr);
        this.previewCtx.scale(dpr, dpr);
      }
    };

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  getSafeBounds() {
    const rect = this.canvas.getBoundingClientRect();
    return {
      minX: rect.width * this.boundaryMargin.left,
      maxX: rect.width * (1 - this.boundaryMargin.right),
      minY: rect.height * this.boundaryMargin.top,
      maxY: rect.height * (1 - this.boundaryMargin.bottom),
      width: rect.width,
      height: rect.height
    };
  }

  clampToBounds(x, y) {
    const b = this.getSafeBounds();
    return {
      x: Math.max(b.minX, Math.min(b.maxX, x)),
      y: Math.max(b.minY, Math.min(b.maxY, y))
    };
  }

  isInBounds(x, y) {
    const b = this.getSafeBounds();
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
  }

  setTool(tool) {
    this.tool = tool;
  }

  setBrushStyle(style = 'neon') {
    this.brushStyle = style;
  }

  setColor(color) {
    this.color = color;
  }

  setBrushSize(size) {
    this.brushSize = Math.max(1, Math.min(60, size));
  }

  setEraserSize(size) {
    this.eraserSize = Math.max(5, Math.min(100, size));
  }

  startStroke(x, y) {
    const clamped = this.clampToBounds(x, y);
    this.isDrawing = true;
    this.points = [{ x: clamped.x, y: clamped.y }];
    this.startPoint = { x: clamped.x, y: clamped.y };

    if (this.tool === 'freehand' || this.tool === 'eraser') {
      this.drawPoint(clamped.x, clamped.y);
    }
  }

  continueStroke(x, y) {
    if (!this.isDrawing) return;
    const clamped = this.clampToBounds(x, y);

    if (this.tool === 'freehand') {
      this.points.push(clamped);
      this.drawSmoothSegment();
    } else if (this.tool === 'eraser') {
      this.points.push(clamped);
      this.eraseSegment(clamped.x, clamped.y);
    } else {
      // Shape tools: update live preview
      this.renderShapePreview(this.startPoint, clamped);
    }
  }

  endStroke(x, y) {
    if (!this.isDrawing) return;
    const clamped = this.clampToBounds(x, y);

    if (['line', 'rect', 'circle', 'triangle'].includes(this.tool)) {
      this.commitShape(this.startPoint, clamped);
      this.clearPreview();
    }

    this.isDrawing = false;
    this.points = [];
    this.startPoint = null;
    this.saveState();
  }

  cancelStroke() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.points = [];
    this.startPoint = null;
    this.clearPreview();
    this.restoreState(); // Revert back to pre-stroke state
  }

  drawPoint(x, y) {
    const ctx = this.ctx;
    ctx.save();
    if (this.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, this.eraserSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = this.brushSize * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, this.brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSmoothSegment() {
    if (this.points.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineWidth = this.brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (this.brushStyle === 'neon') {
      ctx.shadowColor = this.color;
      ctx.shadowBlur = this.brushSize * 0.85;
    } else if (this.brushStyle === 'solid') {
      ctx.shadowBlur = 0;
    } else if (this.brushStyle === 'dotted') {
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 4;
      ctx.setLineDash([Math.max(2, this.brushSize * 0.8), Math.max(6, this.brushSize * 1.5)]);
    } else if (this.brushStyle === 'calligraphy') {
      ctx.shadowBlur = 0;
      ctx.lineCap = 'butt';
      // Angle-dependent stroke width
      const p1 = this.points[this.points.length - 2];
      const p2 = this.points[this.points.length - 1];
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      ctx.lineWidth = Math.max(2, this.brushSize * (0.35 + Math.abs(Math.sin(angle - Math.PI / 4)) * 0.9));
    }

    const p1 = this.points[this.points.length - 2];
    const p2 = this.points[this.points.length - 1];

    if (this.points.length === 2) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else {
      const p0 = this.points[this.points.length - 3];
      const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      ctx.beginPath();
      ctx.moveTo(mid1.x, mid1.y);
      ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  eraseSegment(x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.eraserSize;

    if (this.points.length >= 2) {
      const p1 = this.points[this.points.length - 2];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, this.eraserSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderShapePreview(start, end) {
    const rect = this.canvas.getBoundingClientRect();
    this.previewCtx.clearRect(0, 0, rect.width, rect.height);
    this.drawShape(this.previewCtx, start, end, true);
  }

  clearPreview() {
    const rect = this.canvas.getBoundingClientRect();
    this.previewCtx.clearRect(0, 0, rect.width, rect.height);
  }

  commitShape(start, end) {
    this.drawShape(this.ctx, start, end, false);
  }

  drawShape(ctx, start, end, isPreview = false) {
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineWidth = this.brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isPreview) {
      ctx.shadowBlur = this.brushSize;
      ctx.shadowColor = this.color;
      ctx.setLineDash([6, 6]);
    } else {
      ctx.shadowBlur = this.brushSize * 0.8;
      ctx.shadowColor = this.color;
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;

    switch (this.tool) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        break;

      case 'rect':
        ctx.beginPath();
        ctx.strokeRect(start.x, start.y, dx, dy);
        ctx.fillStyle = this.hexToRgba(this.color, 0.15);
        ctx.fillRect(start.x, start.y, dx, dy);
        break;

      case 'circle': {
        const radius = Math.sqrt(dx * dx + dy * dy);
        ctx.beginPath();
        ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = this.hexToRgba(this.color, 0.15);
        ctx.fill();
        break;
      }

      case 'triangle': {
        const topX = start.x + dx / 2;
        const topY = start.y;
        const bLeftX = start.x;
        const bLeftY = end.y;
        const bRightX = end.x;
        const bRightY = end.y;

        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.lineTo(bRightX, bRightY);
        ctx.lineTo(bLeftX, bLeftY);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = this.hexToRgba(this.color, 0.15);
        ctx.fill();
        break;
      }
    }

    ctx.restore();
  }

  hexToRgba(hex, alpha = 0.2) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  saveState() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Prune forward redo history
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Capture snapshot as ImageData or ImageBitmap
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.history.push(imageData);

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.restoreState();
      return true;
    }
    return false;
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.restoreState();
      return true;
    }
    return false;
  }

  restoreState() {
    if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
      const state = this.history[this.historyIndex];
      this.ctx.putImageData(state, 0, 0);
    }
  }

  clear() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.clearPreview();
    this.saveState();
  }

  /**
   * Screen boundaries visual rendering
   */
  renderBoundaries(overlayCtx, width, height) {
    const b = this.getSafeBounds();
    overlayCtx.save();
    overlayCtx.strokeStyle = 'rgba(0, 245, 255, 0.25)';
    overlayCtx.lineWidth = 1;
    overlayCtx.setLineDash([8, 8]);
    overlayCtx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);

    // Subtle corner markers
    const cornerSize = 16;
    overlayCtx.setLineDash([]);
    overlayCtx.strokeStyle = '#00f5ff';
    overlayCtx.lineWidth = 2;

    // Top-left
    overlayCtx.beginPath();
    overlayCtx.moveTo(b.minX, b.minY + cornerSize);
    overlayCtx.lineTo(b.minX, b.minY);
    overlayCtx.lineTo(b.minX + cornerSize, b.minY);
    overlayCtx.stroke();

    // Top-right
    overlayCtx.beginPath();
    overlayCtx.moveTo(b.maxX - cornerSize, b.minY);
    overlayCtx.lineTo(b.maxX, b.minY);
    overlayCtx.lineTo(b.maxX, b.minY + cornerSize);
    overlayCtx.stroke();

    // Bottom-left
    overlayCtx.beginPath();
    overlayCtx.moveTo(b.minX, b.maxY - cornerSize);
    overlayCtx.lineTo(b.minX, b.maxY);
    overlayCtx.lineTo(b.minX + cornerSize, b.maxY);
    overlayCtx.stroke();

    // Bottom-right
    overlayCtx.beginPath();
    overlayCtx.moveTo(b.maxX - cornerSize, b.maxY);
    overlayCtx.lineTo(b.maxX, b.maxY);
    overlayCtx.lineTo(b.maxX, b.maxY - cornerSize);
    overlayCtx.stroke();

    overlayCtx.restore();
  }

  setupMouseEvents() {
    let isMouseDown = false;

    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only primary click
      isMouseDown = true;
      const { x, y } = getPos(e);
      this.startStroke(x, y);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      const { x, y } = getPos(e);
      this.continueStroke(x, y);
    });

    window.addEventListener('mouseup', (e) => {
      if (!isMouseDown) return;
      isMouseDown = false;
      const { x, y } = getPos(e);
      this.endStroke(x, y);
    });

    // Touch support for touchscreens / tablets
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const { x, y } = getPos(touch);
      this.startStroke(x, y);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDrawing || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const { x, y } = getPos(touch);
      this.continueStroke(x, y);
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      if (!this.isDrawing) return;
      const touch = e.changedTouches[0];
      const { x, y } = getPos(touch);
      this.endStroke(x, y);
    });
  }

  // Composite preview canvas onto main context or export
  drawCompositeTo(targetCtx) {
    const rect = this.canvas.getBoundingClientRect();
    targetCtx.drawImage(this.canvas, 0, 0, rect.width, rect.height);
    if (this.isDrawing && ['line', 'rect', 'circle', 'triangle'].includes(this.tool)) {
      targetCtx.drawImage(this.previewCanvas, 0, 0, rect.width, rect.height);
    }
  }

  getDataURL(type = 'image/png') {
    return this.canvas.toDataURL(type);
  }

  loadFromDataURL(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
        this.ctx.drawImage(img, 0, 0, rect.width, rect.height);
        this.saveState();
        resolve();
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
}


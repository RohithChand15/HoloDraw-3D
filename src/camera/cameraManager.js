/**
 * CameraManager handles webcam initialization, video streams,
 * hardware capabilities, camera selection, resolution/framerate settings,
 * brightness/contrast preprocessing, and fallback handling.
 */
export class CameraManager {
  constructor(videoElement) {
    this.video = videoElement || document.createElement('video');
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('muted', '');
    this.video.muted = true;
    this.stream = null;
    this.isStreaming = false;

    // Camera settings
    this.brightness = 1.0;
    this.contrast = 1.0;
    this.isFlipped = true;
    this.targetWidth = 1280;
    this.targetHeight = 720;
    this.targetFps = 30;

    this.currentDeviceId = null;
    this.devices = [];
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in camera event '${event}':`, err);
        }
      });
    }
  }

  async getDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      this.devices = allDevices.filter(d => d.kind === 'videoinput');
      return this.devices;
    } catch (err) {
      console.warn('Could not enumerate camera devices:', err);
      return [];
    }
  }

  async start(preferredDeviceId = null, width = this.targetWidth, height = this.targetHeight, fps = this.targetFps) {
    if (!navigator.mediaDevices?.getUserMedia) {
      const errorMsg = 'Camera API (navigator.mediaDevices.getUserMedia) is not supported in this browser.';
      const err = new Error(errorMsg);
      err.code = 'UNSUPPORTED';
      this.emit('error', err);
      throw err;
    }

    this.targetWidth = width;
    this.targetHeight = height;
    this.targetFps = fps;

    // Stop existing stream if active
    this.stop();

    const constraints = {
      audio: false,
      video: {
        width: { ideal: width, min: 640 },
        height: { ideal: height, min: 480 },
        frameRate: { ideal: fps, max: 60 }
      }
    };

    if (preferredDeviceId) {
      constraints.video.deviceId = { exact: preferredDeviceId };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      await this.video.play();

      const track = this.stream.getVideoTracks()[0];
      const settings = track?.getSettings() || {};
      this.currentDeviceId = preferredDeviceId || settings.deviceId || null;
      this.isStreaming = true;

      this.updateFilter();
      await this.getDevices();

      const dimensions = {
        width: this.video.videoWidth || settings.width || width,
        height: this.video.videoHeight || settings.height || height,
        deviceId: this.currentDeviceId,
        frameRate: settings.frameRate || fps
      };

      this.emit('started', dimensions);
      return dimensions;
    } catch (err) {
      let friendlyMessage = 'Failed to acquire webcam stream.';
      let code = 'UNKNOWN';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        friendlyMessage = 'Camera permission was denied. Please allow camera access in browser address bar.';
        code = 'PERMISSION_DENIED';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        friendlyMessage = 'No camera device found on this system.';
        code = 'DEVICE_NOT_FOUND';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        friendlyMessage = 'Camera is already in use by another application.';
        code = 'DEVICE_BUSY';
      } else if (err.name === 'OverconstrainedError') {
        friendlyMessage = 'Requested resolution or device is not supported.';
        code = 'OVERCONSTRAINED';
      }

      err.friendlyMessage = friendlyMessage;
      err.code = code;
      this.isStreaming = false;
      this.emit('error', err);
      throw err;
    }
  }

  async switchDevice(deviceId) {
    return await this.start(deviceId, this.targetWidth, this.targetHeight, this.targetFps);
  }

  async setResolution(width, height) {
    return await this.start(this.currentDeviceId, width, height, this.targetFps);
  }

  async setFrameRate(fps) {
    return await this.start(this.currentDeviceId, this.targetWidth, this.targetHeight, fps);
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.isStreaming = false;
    this.emit('stopped');
  }

  setBrightness(val) {
    this.brightness = Math.max(0.2, Math.min(2.5, val));
    this.updateFilter();
  }

  setContrast(val) {
    this.contrast = Math.max(0.2, Math.min(2.5, val));
    this.updateFilter();
  }

  setFlipped(flipped) {
    this.isFlipped = Boolean(flipped);
    this.updateFilter();
  }

  updateFilter() {
    const scaleX = this.isFlipped ? -1 : 1;
    this.video.style.transform = `scaleX(${scaleX})`;
    this.video.style.filter = `brightness(${this.brightness}) contrast(${this.contrast})`;
  }

  getVideoElement() {
    return this.video;
  }

  getDimensions() {
    return {
      width: this.video.videoWidth || this.targetWidth,
      height: this.video.videoHeight || this.targetHeight
    };
  }
}

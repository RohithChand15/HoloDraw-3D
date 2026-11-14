/**
 * TutorialModal provides an interactive holographic onboarding guide
 * detailing the 4 core gestures, dual-hand controls, and mouse fallback.
 */
export class TutorialModal {
  constructor(overlayElement) {
    this.modal = overlayElement;
    this.closeBtn = this.modal?.querySelector('#tutorial-close-btn');
    this.setupEvents();
  }

  setupEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.hide());
    }

    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) {
        this.hide();
      }
    });
  }

  show() {
    if (this.modal) {
      this.modal.classList.add('modal-visible');
    }
  }

  hide() {
    if (this.modal) {
      this.modal.classList.remove('modal-visible');
    }
  }

  isVisible() {
    return this.modal && this.modal.classList.contains('modal-visible');
  }

  toggle() {
    if (this.isVisible()) this.hide();
    else this.show();
  }
}


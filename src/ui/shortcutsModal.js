/**
 * ShortcutsModal displays an organized reference guide of all keyboard shortcuts.
 */
export class ShortcutsModal {
  constructor(overlayElement) {
    this.modal = overlayElement || document.getElementById('shortcuts-modal');
    this.closeBtn = this.modal?.querySelector('#shortcuts-close-btn');
    this.setupEvents();
  }

  setupEvents() {
    this.closeBtn?.addEventListener('click', () => this.hide());

    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
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
    return Boolean(this.modal && this.modal.classList.contains('modal-visible'));
  }

  toggle() {
    if (this.isVisible()) this.hide();
    else this.show();
  }
}


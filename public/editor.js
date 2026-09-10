// editor.js
// Handles the Canvas Presentation Editor UI

const Editor = {
  canvas: null,
  currentSlideId: null,
  selectedElement: null,

  init() {
    this.canvas = document.getElementById('presentation-canvas');
    if (!this.canvas) return; // Not on admin page
    
    console.log("Editor initialized");
  },

  loadSlide(slideId) {
    this.currentSlideId = slideId;
    if (!slideId) {
      this.canvas.innerHTML = '<span style="color:var(--text-secondary)">Select a slide to edit</span>';
      return;
    }
    
    // Fetch elements for this slide from globalState
    const elements = globalState.slideElements.filter(e => e.slide_id === slideId);
    
    // Use slideRenderer to draw them
    window.SlideRenderer.render(this.canvas, elements);
    
    // Make them draggable/selectable
    this.attachCanvasEvents();
  },

  attachCanvasEvents() {
    // Basic click to select
    Array.from(this.canvas.children).forEach(el => {
      el.style.cursor = 'move';
      el.onclick = (e) => {
        e.stopPropagation();
        this.selectElement(el);
      };
      
      // Basic dragging placeholder
      el.onmousedown = (e) => {
        // Drag logic to be implemented fully in Phase 4
        console.log("Dragging started", el);
      };
    });
    
    this.canvas.onclick = () => {
      this.clearSelection();
    };
  },

  selectElement(el) {
    this.clearSelection();
    el.style.outline = '2px solid var(--primary)';
    this.selectedElement = el;
    
    // Update properties panel
    document.getElementById('prop-x').value = parseFloat(el.style.left) || 0;
    document.getElementById('prop-y').value = parseFloat(el.style.top) || 0;
  },

  clearSelection() {
    if (this.selectedElement) {
      this.selectedElement.style.outline = 'none';
      this.selectedElement = null;
    }
  }
};

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
  // It might be rendered later by app.js, so we'll init when the canvas appears
  const observer = new MutationObserver(() => {
    if (document.getElementById('presentation-canvas') && !Editor.canvas) {
      Editor.init();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

window.Editor = Editor;

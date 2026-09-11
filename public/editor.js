// editor.js
// Handles the Canvas Presentation Editor UI and interactions

const Editor = {
  canvas: null,
  currentQuestionId: null,
  currentSlideId: null,
  selectedElement: null,
  elements: [],
  isDragging: false,
  dragOffset: { x: 0, y: 0 },

  init() {
    this.canvas = document.getElementById('presentation-canvas');
    if (!this.canvas) return; // Not on admin page
    
    // Setup question list in sidebar
    this.renderQuestionThumbnails();
    
    // Canvas click to deselect
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.target === this.canvas) {
        this.clearSelection();
      }
    });

    // Global mouse moves for dragging
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
  },

  renderQuestionThumbnails() {
    const list = document.getElementById('slide-thumbnails');
    if (!list) return;
    
    list.innerHTML = '';
    if (globalState.questions.length === 0) {
      list.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:20px">No questions yet.</div>';
      return;
    }

    globalState.questions.forEach(q => {
      const qDiv = document.createElement('div');
      qDiv.style.padding = '10px';
      qDiv.style.background = this.currentQuestionId === q.id ? 'var(--primary)' : 'rgba(255,255,255,0.05)';
      qDiv.style.borderRadius = '6px';
      qDiv.style.cursor = 'pointer';
      qDiv.innerHTML = `<strong>${q.title}</strong>`;
      qDiv.onclick = () => this.selectQuestion(q.id);
      
      list.appendChild(qDiv);
      
      // If this question is selected, show its slides
      if (this.currentQuestionId === q.id) {
        const slides = globalState.slides.filter(s => s.question_id === q.id).sort((a,b) => a.slide_order - b.slide_order);
        slides.forEach((s, idx) => {
          const sDiv = document.createElement('div');
          sDiv.style.padding = '5px 10px 5px 20px';
          sDiv.style.background = this.currentSlideId === s.id ? 'rgba(255,255,255,0.2)' : 'transparent';
          sDiv.style.borderLeft = '2px solid rgba(255,255,255,0.2)';
          sDiv.style.cursor = 'pointer';
          sDiv.style.fontSize = '0.9rem';
          sDiv.innerText = `Slide ${idx + 1}`;
          sDiv.onclick = (e) => {
            e.stopPropagation();
            this.loadSlide(s.id);
          };
          list.appendChild(sDiv);
        });
      }
    });
  },

  async createQuestion() {
    const title = document.getElementById('newCanvasQTitle').value.trim();
    if (!title) return alert("Enter a title");
    
    const res = await window.SlideManager.createQuestion(title);
    if (res.ok) {
      globalState.questions.push(res.question);
      document.getElementById('newCanvasQTitle').value = '';
      this.selectQuestion(res.question.id);
      if (window.renderApp) window.renderApp(); 
    } else {
      alert("Failed to create question: " + (res.message || "Unknown error"));
    }
  },

  selectQuestion(qId) {
    this.currentQuestionId = qId;
    document.getElementById('btnNewSlide').disabled = false;
    this.renderQuestionThumbnails();
  },

  async createNewSlide() {
    if (!this.currentQuestionId) return;
    const slides = globalState.slides.filter(s => s.question_id === this.currentQuestionId);
    const order = slides.length;
    const res = await window.SlideManager.createSlide(this.currentQuestionId, order);
    if (res.ok) {
      globalState.slides.push(res.slide);
      this.loadSlide(res.slide.id);
      this.renderQuestionThumbnails();
    } else {
      alert("Failed to create slide: " + (res.message || "Unknown error"));
    }
  },

  loadSlide(slideId) {
    this.currentSlideId = slideId;
    this.elements = JSON.parse(JSON.stringify(globalState.slideElements.filter(e => e.slide_id === slideId))); // Clone for editing
    this.renderQuestionThumbnails(); // Update active state
    this.clearSelection();
    this.drawCanvas();
  },

  drawCanvas() {
    if (!this.canvas) return;
    if (!this.currentSlideId) {
      this.canvas.innerHTML = '<span style="color:var(--text-secondary)">Canvas Editor (Select a slide to edit)</span>';
      return;
    }
    
    // Render elements using Renderer
    window.SlideRenderer.render(this.canvas, this.elements);
    
    // Attach editor interactions
    Array.from(this.canvas.children).forEach(node => {
      const elId = node.dataset.id;
      const el = this.elements.find(e => e.id === elId || e._tempId === elId);
      if (!el) return;

      node.style.cursor = 'move';
      node.style.userSelect = 'none';

      node.onmousedown = (e) => {
        e.stopPropagation();
        this.selectElement(el, node);
        this.isDragging = true;
        const rect = this.canvas.getBoundingClientRect();
        // Calculate offset relative to percentage
        const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
        
        this.dragOffset.x = xPercent - (el.properties.x || 0);
        this.dragOffset.y = yPercent - (el.properties.y || 0);
      };
    });
    
    // Re-highlight if something was selected
    if (this.selectedElement) {
      const id = this.selectedElement.id || this.selectedElement._tempId;
      const node = Array.from(this.canvas.children).find(n => n.dataset.id === id);
      if (node) this.selectElement(this.selectedElement, node);
    }
  },

  onMouseMove(e) {
    if (!this.isDragging || !this.selectedElement || !this.canvas) return;
    
    const rect = this.canvas.getBoundingClientRect();
    let newX = ((e.clientX - rect.left) / rect.width) * 100 - this.dragOffset.x;
    let newY = ((e.clientY - rect.top) / rect.height) * 100 - this.dragOffset.y;
    
    // Basic bounds
    newX = Math.max(0, Math.min(newX, 100));
    newY = Math.max(0, Math.min(newY, 100));

    this.selectedElement.properties.x = newX;
    this.selectedElement.properties.y = newY;
    
    this.drawCanvas(); // Fast enough for modern browsers
    this.updatePropertiesPanel();
  },

  onMouseUp() {
    this.isDragging = false;
  },

  selectElement(el, node) {
    this.clearSelection();
    this.selectedElement = el;
    if (node) node.style.outline = '2px solid var(--primary)';
    
    document.getElementById('element-properties').style.display = 'block';
    this.updatePropertiesPanel();
  },

  clearSelection() {
    this.selectedElement = null;
    document.getElementById('element-properties').style.display = 'none';
    this.drawCanvas();
  },

  updatePropertiesPanel() {
    if (!this.selectedElement) return;
    document.getElementById('prop-content').value = this.selectedElement.content || '';
    document.getElementById('prop-x').value = Math.round(this.selectedElement.properties.x || 0);
    document.getElementById('prop-y').value = Math.round(this.selectedElement.properties.y || 0);
    document.getElementById('prop-w').value = Math.round(this.selectedElement.properties.width || 0);
    document.getElementById('prop-color').value = this.selectedElement.properties.color || '#ffffff';
    document.getElementById('prop-animation').value = this.selectedElement.properties.animation || 'None';
  },

  updateSelected() {
    if (!this.selectedElement) return;
    this.selectedElement.content = document.getElementById('prop-content').value;
    this.selectedElement.properties.x = parseFloat(document.getElementById('prop-x').value) || 0;
    this.selectedElement.properties.y = parseFloat(document.getElementById('prop-y').value) || 0;
    const w = parseFloat(document.getElementById('prop-w').value);
    if (w) this.selectedElement.properties.width = w;
    this.selectedElement.properties.color = document.getElementById('prop-color').value;
    this.selectedElement.properties.animation = document.getElementById('prop-animation').value;
    this.drawCanvas();
  },
  
  deleteSelected() {
    if (!this.selectedElement) return;
    this.elements = this.elements.filter(e => e !== this.selectedElement);
    this.clearSelection();
    this.drawCanvas();
  },

  addElement(type) {
    if (!this.currentSlideId) return alert("Select a slide first!");
    
    const newEl = {
      _tempId: 'temp-' + Math.random(),
      slide_id: this.currentSlideId,
      element_type: type,
      content: type === 'text' ? 'New Text' : (type === 'image' ? 'https://via.placeholder.com/150' : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'),
      element_order: this.elements.length,
      properties: {
        x: 10, y: 10, width: type === 'text' ? null : 30, color: '#ffffff', animation: 'None'
      }
    };
    this.elements.push(newEl);
    this.drawCanvas();
  },

  async saveSlide() {
    if (!this.currentSlideId) return;
    
    // Clear old elements from DB for this slide
    await window.SlideManager.deleteSlideElements(this.currentSlideId);
    
    // Save new elements
    const newDbElements = [];
    for (let i=0; i<this.elements.length; i++) {
      const el = this.elements[i];
      const res = await window.SlideManager.saveSlideElement(this.currentSlideId, {
        elementType: el.element_type,
        content: el.content,
        properties: el.properties,
        order: i
      });
      if (res.ok) newDbElements.push(res.element);
    }
    
    // Update global state
    globalState.slideElements = globalState.slideElements.filter(e => e.slide_id !== this.currentSlideId).concat(newDbElements);
    alert("Slide Saved!");
  }
};

// Hook into app.js re-renders
const originalRenderApp = window.renderApp;
if (originalRenderApp) {
  window.renderApp = function() {
    originalRenderApp();
    Editor.init();
  };
}

// Initial init if already rendered
setTimeout(() => Editor.init(), 500);

window.Editor = Editor;

// slideManager.js
// Handles CRUD operations for Questions, Slides, and Slide Elements

const SlideManager = {
  async createQuestion(title) {
    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    return await res.json();
  },

  async createSlide(questionId, slideOrder, background = '#000000', transition = 'none') {
    const res = await fetch('/api/slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, slideOrder, background, transition })
    });
    return await res.json();
  },

  async saveSlideElement(slideId, element) {
    // element should be { elementType, content, properties: { x, y, width, height, color, animation }, order }
    const res = await fetch('/api/slide-elements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slideId,
        elementType: element.elementType,
        content: element.content,
        properties: element.properties,
        order: element.order
      })
    });
    return await res.json();
  },
  
  async deleteSlideElements(slideId) {
    const res = await fetch('/api/slide-elements/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slideId })
    });
    return await res.json();
  }
};

window.SlideManager = SlideManager;

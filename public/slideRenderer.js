// slideRenderer.js
// Responsible for rendering slide elements onto a given container container

const SlideRenderer = {
  render(container, elements) {
    container.innerHTML = '';
    
    // elements should be sorted by element_order (z-index)
    const sorted = [...elements].sort((a, b) => a.element_order - b.element_order);

    sorted.forEach(el => {
      const domEl = document.createElement('div');
      domEl.style.position = 'absolute';
      domEl.style.left = (el.properties.x || 0) + '%';
      domEl.style.top = (el.properties.y || 0) + '%';
      if (el.properties.width) domEl.style.width = el.properties.width + '%';
      if (el.properties.height) domEl.style.height = el.properties.height + '%';
      if (el.properties.color) domEl.style.color = el.properties.color;
      if (el.properties.fontSize) domEl.style.fontSize = el.properties.fontSize + 'vw';
      
      domEl.style.zIndex = el.element_order;
      
      // Animations can be implemented via CSS classes later
      if (el.properties.animation && el.properties.animation !== 'None') {
        domEl.classList.add('animate-' + el.properties.animation.toLowerCase().replace(' ', '-'));
      }

      if (el.element_type === 'text') {
        domEl.innerText = el.content;
      } else if (el.element_type === 'image') {
        const img = document.createElement('img');
        img.src = el.content;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        domEl.appendChild(img);
      } else if (el.element_type === 'audio') {
        const audio = document.createElement('audio');
        audio.src = el.content;
        audio.controls = true;
        audio.style.width = '100%';
        domEl.appendChild(audio);
      }

      // In editor mode, we might want to attach extra data
      domEl.dataset.id = el.id || 'temp-' + Math.random();
      domEl.dataset.type = el.element_type;
      
      container.appendChild(domEl);
    });
  }
};

window.SlideRenderer = SlideRenderer;

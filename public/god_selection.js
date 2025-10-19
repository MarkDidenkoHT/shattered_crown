export async function loadModule(main, { getCurrentProfile, updateCurrentProfile }) {
  let gods = [];
  
  try {
    const response = await fetch('/api/gods');

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to load gods');
    }

    gods = await response.json();

    if (gods.length === 0) {
      console.warn('No gods found in the database');
    }
  } catch (error) {
    console.error('Error loading gods:', error);
    // Silently fail and proceed with empty gods array
    gods = [];
  }

  main.innerHTML = `
    <div class="main-app-container">
      <div class="particles"></div>
      
      <div class="art-header">
        <h1>Choose Your Deity</h1>
        <p class="selection-subtitle">Select a god to continue</p>
      </div>
      
      <div class="god-selection-section">
        <div class="gods-slider">
          <div class="slider-container">
            <div class="slider-track" style="transform: translateX(0%)">
              ${gods.map((god, index) => `
                <div class="god-slide" data-god-id="${god.id}">
                  <div class="god-art-block">
                    <img src="assets/art/gods/${god.image}.png" 
                         alt="${god.name}" 
                         class="god-art"
                         onerror="this.src='assets/art/placeholder.jpg'">
                  </div>
                  <div class="god-info-block">
                    <h3 class="god-name">${god.name}</h3>
                    <p class="god-description">${god.description}</p>
                    <button class="fantasy-button select-god-btn" data-god-id="${god.id}">
                      Choose ${god.name}
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          
          <div class="slider-dots">
            ${gods.map((_, index) => `
              <button class="slider-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Add compact mobile-first styles
  const style = document.createElement('style');
  style.textContent = `
    .god-selection-section {
      height: 90vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 0.5rem;
      position: relative;
      z-index: 2;
      background: rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(10px);
    }

    .gods-slider {
      width: 100%;
      max-width: 100vw;
    }

    .slider-container {
      overflow: hidden;
      border-radius: 8px;
      margin-bottom: 0.75rem;
      touch-action: pan-y;
    }

    .god-slide {
      min-width: 100%;
      background: linear-gradient(145deg, rgba(29, 20, 12, 0.95), rgba(42, 31, 22, 0.9));
      border: 1px solid #3d2914;
      border-radius: 8px;
      overflow: hidden;
      backdrop-filter: blur(5px);
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.1),
        0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .god-art-block {
      width: 100%;
      height: 74vh;
      overflow: hidden;
      position: relative;
    }

    .god-art {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    .god-info-block {
      padding: 0.75rem;
      text-align: center;
      height: 16vh;
    }

    .god-name {
      font-family: 'Cinzel', serif;
      font-size: 1.1rem;
      font-weight: 600;
      color: #c4975a;
      margin-bottom: 0.5rem;
      text-shadow: 1px 1px 0px #3d2914;
      letter-spacing: 1px;
    }

    .god-description {
      display: none;
      color: #b8b3a8;
      font-size: 0.85rem;
      line-height: 1.3;
      margin-bottom: 0.75rem;
      font-style: italic;
      min-height: 2.5rem;
    }

    .select-god-btn {
      padding: 0.6rem 1.2rem;
      font-size: 0.85rem;
      font-family: 'Cinzel', serif;
      font-weight: 600;
      border: 2px solid #c4975a;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
      text-transform: uppercase;
      letter-spacing: 1px;
      background: linear-gradient(145deg, #2a1f16, #1d140c);
      color: #c4975a;
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.2),
        0 2px 4px rgba(0, 0, 0, 0.3);
      width: 100%;
      -webkit-tap-highlight-color: transparent;
    }

    .select-god-btn:active {
      transform: scale(0.95);
      box-shadow: 
        inset 0 2px 4px rgba(0, 0, 0, 0.3),
        0 1px 2px rgba(0, 0, 0, 0.2);
    }

    .select-god-btn.loading {
      opacity: 0.7;
      pointer-events: none;
    }

    .art-header {
      background-image: unset;
      padding: 0.5rem 0;
    }

    .art-header h1 {
      font-size: 1.5rem;
      margin: 0;
      text-align: center;
      color: #c4975a;
      font-family: 'Cinzel', serif;
      text-shadow: 2px 2px 0px #3d2914;
    }

    .selection-subtitle {
      text-align: center;
      color: #b8b3a8;
      font-size: 0.9rem;
      margin: 0.25rem 0 0 0;
      font-style: italic;
    }

    /* Particle styles */
    .particles {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      z-index: 1;
      pointer-events: none;
    }

    .particle {
      position: absolute;
      width: 2px;
      height: 2px;
      background: #c4975a;
      border-radius: 50%;
      opacity: 0.6;
      animation: float 6s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { 
        transform: translateY(0px) rotate(0deg); 
        opacity: 0.6; 
      }
      50% { 
        transform: translateY(-10px) rotate(180deg); 
        opacity: 0.3; 
      }
    }
  `;
  document.head.appendChild(style);

  createParticles();
  initializeSlider();

  // Add event listeners to god selection buttons
  const selectButtons = main.querySelectorAll('.select-god-btn');

  selectButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      const godId = e.target.dataset.godId;
      await selectGod(godId, getCurrentProfile);
    });
  });
}

function initializeSlider() {
  const sliderTrack = document.querySelector('.slider-track');
  const dots = document.querySelectorAll('.slider-dot');
  
  if (!sliderTrack || !dots.length) {
    return;
  }
  
  let currentSlide = 0;
  const totalSlides = dots.length;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let currentTranslate = 0;
  let prevTranslate = 0;
  
  function updateSlider() {
    const translateX = -currentSlide * 100;
    sliderTrack.style.transform = `translateX(${translateX}%)`;
    currentTranslate = translateX;
    prevTranslate = translateX;
    
    // Update dots
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === currentSlide);
    });
  }
  
  function snapToSlide() {
    const slideWidth = sliderTrack.offsetWidth / totalSlides;
    const draggedDistance = Math.abs(currentTranslate - prevTranslate);
    
    if (draggedDistance > slideWidth * 0.2) {
      if (currentTranslate > prevTranslate && currentSlide > 0) {
        currentSlide--;
      } else if (currentTranslate < prevTranslate && currentSlide < totalSlides - 1) {
        currentSlide++;
      }
    }
    
    updateSlider();
  }
  
  // Dot navigation
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      currentSlide = index;
      updateSlider();
    });
  });
  
  // Touch events for swiping
  sliderTrack.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = true;
    sliderTrack.style.transition = 'none';
  }, { passive: true });
  
  sliderTrack.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startX;
    const diffY = currentY - startY;
    
    // Only handle horizontal swipes
    if (Math.abs(diffX) > Math.abs(diffY)) {
      e.preventDefault();
      currentTranslate = prevTranslate + diffX;
      
      // Add resistance at boundaries
      if (currentSlide === 0 && diffX > 0) {
        currentTranslate = prevTranslate + diffX * 0.3;
      } else if (currentSlide === totalSlides - 1 && diffX < 0) {
        currentTranslate = prevTranslate + diffX * 0.3;
      }
      
      sliderTrack.style.transform = `translateX(${currentTranslate}px)`;
    }
  }, { passive: false });
  
  sliderTrack.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    
    sliderTrack.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
    snapToSlide();
  }, { passive: true });
  
  // Prevent context menu on long press
  sliderTrack.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}

async function selectGod(godId, getCurrentProfile) {
  const button = document.querySelector(`[data-god-id="${godId}"]`);
  const originalText = button.textContent;
  
  try {
    // Show loading state
    button.classList.add('loading');
    button.textContent = 'Choosing...';

    const profile = getCurrentProfile();
    if (!profile) {
      throw new Error('No profile found');
    }

    const response = await fetch('/api/profile/select-god', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ profileId: profile.id, godId })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update profile');
    }

    if (!data || data.length === 0) {
      throw new Error('Failed to update profile - no data returned');
    }

    const updatedProfile = data[0];
    localStorage.setItem('profile', JSON.stringify(updatedProfile));
    
    // Update the cached profile in main.js
    if (window.gameAuth && window.gameAuth.updateCurrentProfile) {
      window.gameAuth.updateCurrentProfile(updatedProfile);
    }

    // Immediately proceed to character creation without confirmation
    window.gameAuth.loadModule('character_creation');

  } catch (error) {
    console.error('Error selecting god:', error);
    // Reset button state on error
    button.classList.remove('loading');
    button.textContent = originalText;
  }
}

function createParticles() {
  const particles = document.querySelector('.particles');
  if (!particles) return;
  
  particles.innerHTML = '';
  const particleCount = 15;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 6 + 's';
    particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
    particles.appendChild(particle);
  }
}
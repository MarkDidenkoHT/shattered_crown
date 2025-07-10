export async function loadModule(main, { currentSession, supabaseConfig, getCurrentProfile, getCurrentSession, apiCall }) {
  // Load gods from database
  let gods = [];
  try {
    const response = await apiCall('/api/supabase/rest/v1/gods?select=id,name,description');
    gods = await response.json();
  } catch (error) {
    console.error('Error loading gods:', error);
    alert('Failed to load gods. Please try again.');
    return;
  }

  main.innerHTML = `
    <div class="main-app-container">
      <div class="particles"></div>
      
      <div class="art-header">
        <h1>Choose Your Deity</h1>
        <p class="subtitle">Select the divine power that will guide your destiny</p>
      </div>
      
      <div class="god-selection-section">
        <!-- Desktop view -->
        <div class="gods-container desktop-view">
          ${gods.map(god => `
            <div class="god-card" data-god-id="${god.id}">
              <div class="god-art-block">
                <img src="assets/art/gods/${god.name.toLowerCase().replace(/\s+/g, '_')}.jpg" 
                     alt="${god.name}" 
                     class="god-art"
                     onerror="this.src='assets/art/gods/placeholder.jpg'">
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

        <!-- Mobile view -->
        <div class="gods-slider mobile-view">
          <div class="slider-container">
            <div class="slider-track" style="transform: translateX(0%)">
              ${gods.map((god, index) => `
                <div class="god-slide" data-god-id="${god.id}">
                  <div class="god-art-block">
                    <img src="assets/art/gods/${god.name.toLowerCase().replace(/\s+/g, '_')}.jpg" 
                         alt="${god.name}" 
                         class="god-art"
                         onerror="this.src='assets/art/gods/placeholder.jpg'">
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
          
          <div class="slider-controls">
            <button class="slider-btn prev-btn" aria-label="Previous god">&lt;</button>
            <div class="slider-dots">
              ${gods.map((_, index) => `
                <button class="slider-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>
              `).join('')}
            </div>
            <button class="slider-btn next-btn" aria-label="Next god">&gt;</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add god selection styles
  const style = document.createElement('style');
  style.textContent = `
    .god-selection-section {
      height: 60%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 2rem;
      position: relative;
      z-index: 2;
      background: rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(10px);
    }

    /* Desktop View */
    .desktop-view {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
      width: 100%;
      max-width: 1200px;
    }

    .mobile-view {
      display: none;
    }

    .god-card {
      background: linear-gradient(145deg, rgba(29, 20, 12, 0.9), rgba(42, 31, 22, 0.8));
      border: 2px solid #3d2914;
      border-radius: 8px;
      overflow: hidden;
      transition: all 0.3s ease;
      backdrop-filter: blur(5px);
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.1),
        0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .god-card:hover {
      border-color: #c4975a;
      transform: translateY(-2px);
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.2),
        0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .god-art-block {
      width: 100%;
      height: 200px;
      overflow: hidden;
      position: relative;
    }

    .god-art {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    .god-card:hover .god-art {
      transform: scale(1.05);
    }

    .god-info-block {
      padding: 1.5rem;
      text-align: center;
    }

    .god-name {
      font-family: 'Cinzel', serif;
      font-size: 1.2rem;
      font-weight: 600;
      color: #c4975a;
      margin-bottom: 0.75rem;
      text-shadow: 1px 1px 0px #3d2914;
      letter-spacing: 1px;
    }

    .god-description {
      color: #b8b3a8;
      font-size: 0.9rem;
      line-height: 1.4;
      margin-bottom: 1.25rem;
      font-style: italic;
      min-height: 3rem;
    }

    .select-god-btn {
      padding: 0.75rem 1.5rem;
      font-size: 0.9rem;
      font-family: 'Cinzel', serif;
      font-weight: 600;
      border: 2px solid #c4975a;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s ease;
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
    }

    .select-god-btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(196, 151, 90, 0.1), transparent);
      transition: left 0.6s ease;
    }

    .select-god-btn:hover::before {
      left: 100%;
    }

    .select-god-btn:hover {
      background: linear-gradient(145deg, #3d2914, #2a1f16);
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.3),
        0 4px 8px rgba(0, 0, 0, 0.4);
      transform: translateY(-1px);
    }

    .select-god-btn:active {
      transform: translateY(0);
      box-shadow: 
        inset 0 2px 4px rgba(0, 0, 0, 0.3),
        0 1px 2px rgba(0, 0, 0, 0.2);
    }

    /* Mobile View */
    .gods-slider {
      width: 100%;
      max-width: 400px;
    }

    .slider-container {
      overflow: hidden;
      border-radius: 8px;
      margin-bottom: 1.5rem;
    }

    .slider-track {
      display: flex;
      transition: transform 0.4s ease;
    }

    .god-slide {
      min-width: 100%;
      background: linear-gradient(145deg, rgba(29, 20, 12, 0.9), rgba(42, 31, 22, 0.8));
      border: 2px solid #3d2914;
      border-radius: 8px;
      overflow: hidden;
      backdrop-filter: blur(5px);
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.1),
        0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .god-slide .god-art-block {
      height: 250px;
    }

    .god-slide .god-info-block {
      padding: 1.5rem;
    }

    .slider-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 1rem;
    }

    .slider-btn {
      background: linear-gradient(145deg, #2a1f16, #1d140c);
      border: 2px solid #c4975a;
      color: #c4975a;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 1.2rem;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Cinzel', serif;
      font-weight: 600;
    }

    .slider-btn:hover {
      background: linear-gradient(145deg, #3d2914, #2a1f16);
      transform: translateY(-1px);
    }

    .slider-dots {
      display: flex;
      gap: 0.5rem;
    }

    .slider-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid #3d2914;
      background: transparent;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .slider-dot.active {
      background: #c4975a;
      border-color: #c4975a;
    }

    .slider-dot:hover {
      border-color: #c4975a;
    }

    /* Responsive Design */
    @media (max-width: 1024px) {
      .desktop-view {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 768px) {
      .desktop-view {
        display: none;
      }
      
      .mobile-view {
        display: block;
      }
      
      .god-selection-section {
        padding: 1.5rem;
      }
      
      .art-header h1 {
        font-size: 2rem;
      }
    }

    @media (max-width: 480px) {
      .god-slide .god-art-block {
        height: 200px;
      }
      
      .god-slide .god-info-block {
        padding: 1.25rem;
      }
      
      .god-name {
        font-size: 1.1rem;
      }
      
      .god-description {
        font-size: 0.85rem;
      }
    }
  `;
  document.head.appendChild(style);

  // Create floating particles
  createParticles();

  // Initialize slider functionality
  initializeSlider();

  // Add event listeners to god selection buttons
  const selectButtons = main.querySelectorAll('.select-god-btn');
  selectButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      const godId = e.target.dataset.godId;
      const godName = gods.find(g => g.id == godId)?.name;
      
      if (confirm(`Are you sure you want to choose ${godName} as your deity? This choice cannot be changed later.`)) {
        await selectGod(godId, godName, apiCall, getCurrentProfile);
      }
    });
  });

  // Add button click effects
  selectButtons.forEach(button => {
    button.addEventListener('click', function() {
      this.style.transform = 'scale(0.95)';
      setTimeout(() => {
        this.style.transform = '';
      }, 150);
    });
  });
}

function initializeSlider() {
  const sliderTrack = document.querySelector('.slider-track');
  const prevBtn = document.querySelector('.prev-btn');
  const nextBtn = document.querySelector('.next-btn');
  const dots = document.querySelectorAll('.slider-dot');
  
  if (!sliderTrack || !prevBtn || !nextBtn) return;
  
  let currentSlide = 0;
  const totalSlides = dots.length;
  
  function updateSlider() {
    const translateX = -currentSlide * 100;
    sliderTrack.style.transform = `translateX(${translateX}%)`;
    
    // Update dots
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === currentSlide);
    });
  }
  
  function nextSlide() {
    currentSlide = (currentSlide + 1) % totalSlides;
    updateSlider();
  }
  
  function prevSlide() {
    currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
    updateSlider();
  }
  
  // Event listeners
  nextBtn.addEventListener('click', nextSlide);
  prevBtn.addEventListener('click', prevSlide);
  
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      currentSlide = index;
      updateSlider();
    });
  });
  
  // Touch/swipe support
  let startX = 0;
  let isDragging = false;
  
  sliderTrack.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
  });
  
  sliderTrack.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
  });
  
  sliderTrack.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    
    const endX = e.changedTouches[0].clientX;
    const diff = startX - endX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
  });
}

async function selectGod(godId, godName, apiCall, getCurrentProfile) {
  try {
    // Get current profile
    const profile = getCurrentProfile();
    if (!profile) {
      throw new Error('No profile found');
    }
    
    // Update profile with selected god using PATCH method
    const response = await apiCall(`/api/supabase/rest/v1/profiles?id=eq.${profile.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        god: godId
      })
    });

    const updatedProfiles = await response.json();
    
    if (!updatedProfiles || updatedProfiles.length === 0) {
      throw new Error('Failed to update profile');
    }
    
    // Update local storage with new profile data
    const updatedProfile = updatedProfiles[0];
    localStorage.setItem('profile', JSON.stringify(updatedProfile));

    alert(`${godName} has chosen you as their champion! Proceeding to character creation...`);
    
    // Load character creation module using the global loadModule function
    window.gameAuth.loadModule('character_creation');
    
  } catch (error) {
    console.error('Error selecting god:', error);
    alert('Failed to select god. Please try again.');
  }
}

function createParticles() {
  const particles = document.querySelector('.particles');
  if (!particles) return;
  
  // Clear existing particles
  particles.innerHTML = '';
  
  const particleCount = 20;
  
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

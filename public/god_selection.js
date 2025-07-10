export async function loadModule(main, { currentSession, supabaseConfig, getCurrentProfile, getCurrentSession, apiCall }) {
  // Console log to indicate the start of the module loading process
  console.log('--- Starting loadModule function ---');
  console.log('Parameters received by loadModule:', { main, currentSession, supabaseConfig, getCurrentProfile, getCurrentSession, apiCall: typeof apiCall });

  // Load gods from database
  let gods = [];
  console.log('Attempting to load gods from the database...');
  try {
    // Console log before the API call for gods
    console.log('Making API call to:', '/api/supabase/rest/v1/gods?select=id,name,description');
    const response = await apiCall('/api/supabase/rest/v1/gods?select=id,name,description');
    // Console log after successful API response
    console.log('API call for gods successful. Response status:', response.status);
    gods = await response.json();
    // Console log the loaded gods data
    console.log('Gods data loaded:', gods);
    if (gods.length === 0) {
      console.warn('No gods found in the database. The display might be empty.');
    }
  } catch (error) {
    console.error('Error loading gods:', error);
    alert('Failed to load gods. Please try again.');
    // Console log that the module loading is aborted due to error
    console.log('--- loadModule function aborted due to error ---');
    return;
  }

  // Console log before rendering the HTML content
  console.log('Constructing HTML content with loaded gods data...');
  main.innerHTML = `
    <div class="main-app-container">
      <div class="particles"></div>
      
      <div class="art-header">
        <h1>Choose Your Deity</h1>
        <p class="subtitle">Select the divine power that will guide your destiny</p>
      </div>
      
      <div class="god-selection-section">
        <div class="gods-container desktop-view">
          ${gods.map(god => `
            <div class="god-card" data-god-id="${god.id}">
              <div class="god-art-block">
                <img src="assets/art/${god.name.toLowerCase().replace(/\s+/g, '_')}.jpg" 
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

        <div class="gods-slider mobile-view">
          <div class="slider-container">
            <div class="slider-track" style="transform: translateX(0%)">
              ${gods.map((god, index) => `
                <div class="god-slide" data-god-id="${god.id}">
                  <div class="god-art-block">
                    <img src="assets/art/${god.name.toLowerCase().replace(/\s+/g, '_')}.jpg" 
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
  // Console log after HTML content has been set
  console.log('HTML content rendered to main element.');

  // Add god selection styles
  console.log('Adding god selection styles to document head...');
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
  console.log('God selection styles appended to document head.');

  // Create floating particles
  console.log('Calling createParticles function...');
  createParticles();

  // Initialize slider functionality
  console.log('Calling initializeSlider function...');
  initializeSlider();

  // Add event listeners to god selection buttons
  const selectButtons = main.querySelectorAll('.select-god-btn');
  console.log(`Found ${selectButtons.length} god selection buttons. Adding event listeners...`);
  selectButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      const godId = e.target.dataset.godId;
      const godName = gods.find(g => g.id == godId)?.name;
      // Console log when a god selection button is clicked
      console.log(`God selection button clicked for God ID: ${godId}, Name: ${godName}`);
      
      if (confirm(`Are you sure you want to choose ${godName} as your deity? This choice cannot be changed later.`)) {
        console.log(`User confirmed selection of ${godName}. Calling selectGod function...`);
        await selectGod(godId, godName, apiCall, getCurrentProfile);
      } else {
        console.log(`User cancelled selection of ${godName}.`);
      }
    });
  });

  // Add button click effects
  selectButtons.forEach(button => {
    button.addEventListener('click', function() {
      // Console log for visual click effect
      console.log(`Applying visual click effect to button with God ID: ${this.dataset.godId}`);
      this.style.transform = 'scale(0.95)';
      setTimeout(() => {
        this.style.transform = '';
      }, 150);
    });
  });
  console.log('--- loadModule function finished ---');
}

function initializeSlider() {
  console.log('--- Starting initializeSlider function ---');
  const sliderTrack = document.querySelector('.slider-track');
  const prevBtn = document.querySelector('.prev-btn');
  const nextBtn = document.querySelector('.next-btn');
  const dots = document.querySelectorAll('.slider-dot');
  
  if (!sliderTrack || !prevBtn || !nextBtn) {
    console.warn('Slider elements not found. Skipping slider initialization.');
    console.log('--- initializeSlider function aborted ---');
    return;
  }
  
  let currentSlide = 0;
  const totalSlides = dots.length;
  console.log(`Slider initialized with ${totalSlides} slides.`);
  
  function updateSlider() {
    const translateX = -currentSlide * 100;
    sliderTrack.style.transform = `translateX(${translateX}%)`;
    console.log(`Slider updated. Current slide: ${currentSlide}, translateX: ${translateX}%`);
    
    // Update dots
    dots.forEach((dot, index) => {
      const isActive = index === currentSlide;
      dot.classList.toggle('active', isActive);
      // console.log(`Dot ${index} active state: ${isActive}`); // Can be too verbose, uncomment if needed
    });
  }
  
  function nextSlide() {
    const previousSlide = currentSlide;
    currentSlide = (currentSlide + 1) % totalSlides;
    console.log(`Next slide triggered. Changing from ${previousSlide} to ${currentSlide}`);
    updateSlider();
  }
  
  function prevSlide() {
    const previousSlide = currentSlide;
    currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
    console.log(`Previous slide triggered. Changing from ${previousSlide} to ${currentSlide}`);
    updateSlider();
  }
  
  // Event listeners
  console.log('Adding event listeners for slider buttons and dots.');
  nextBtn.addEventListener('click', nextSlide);
  prevBtn.addEventListener('click', prevSlide);
  
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      console.log(`Slider dot clicked for slide: ${index}`);
      currentSlide = index;
      updateSlider();
    });
  });
  
  // Touch/swipe support
  let startX = 0;
  let isDragging = false;
  console.log('Adding touch/swipe event listeners for slider.');
  
  sliderTrack.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
    console.log(`Touch start detected. startX: ${startX}`);
  });
  
  sliderTrack.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault(); // Prevent scrolling while swiping
    // console.log('Touch move detected (dragging).'); // Can be too verbose
  });
  
  sliderTrack.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    
    const endX = e.changedTouches[0].clientX;
    const diff = startX - endX;
    console.log(`Touch end detected. endX: ${endX}, difference: ${diff}`);
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        console.log('Swipe detected: Swiping left (next slide).');
        nextSlide();
      } else {
        console.log('Swipe detected: Swiping right (previous slide).');
        prevSlide();
      }
    } else {
      console.log('Swipe difference too small, no slide change.');
    }
  });
  console.log('--- initializeSlider function finished ---');
}

async function selectGod(godId, godName, apiCall, getCurrentProfile) {
  console.log(`--- Starting selectGod function for God ID: ${godId}, Name: ${godName} ---`);
  try {
    // Get current profile
    console.log('Attempting to get current user profile...');
    const profile = getCurrentProfile();
    if (!profile) {
      throw new Error('No profile found');
    }
    console.log('Current profile retrieved:', profile);
    
    // Update profile with selected god using PATCH method
    const apiUrl = `/api/supabase/rest/v1/profiles?id=eq.${profile.id}`;
    const requestBody = { god: godId };
    console.log(`Preparing to update profile. API URL: ${apiUrl}, Request Body:`, requestBody);

    const response = await apiCall(apiUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('API call to update profile made. Response status:', response.status);
    const updatedProfiles = await response.json();
    console.log('API response for profile update:', updatedProfiles);
    
    if (!updatedProfiles || updatedProfiles.length === 0) {
      throw new Error('Failed to update profile');
    }
    
    // Update local storage with new profile data
    const updatedProfile = updatedProfiles[0];
    console.log('Profile successfully updated in database. New profile data:', updatedProfile);
    localStorage.setItem('profile', JSON.stringify(updatedProfile));
    console.log('Updated profile saved to local storage.');

    alert(`${godName} has chosen you as their champion! Proceeding to character creation...`);
    
    // Load character creation module using the global loadModule function
    console.log('Attempting to load character_creation module...');
    window.gameAuth.loadModule('character_creation');
    console.log('Character creation module load initiated.');
    
  } catch (error) {
    console.error('Error selecting god:', error);
    alert('Failed to select god. Please try again.');
  } finally {
    console.log('--- selectGod function finished ---');
  }
}

function createParticles() {
  console.log('--- Starting createParticles function ---');
  const particles = document.querySelector('.particles');
  if (!particles) {
    console.warn('Particles container not found. Skipping particle creation.');
    console.log('--- createParticles function aborted ---');
    return;
  }
  
  // Clear existing particles
  particles.innerHTML = '';
  console.log('Cleared existing particles.');
  
  const particleCount = 20;
  console.log(`Creating ${particleCount} particles...`);
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 6 + 's';
    particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
    particles.appendChild(particle);
  }
  console.log('Particles created and appended to the DOM.');
  console.log('--- createParticles function finished ---');
}

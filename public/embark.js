let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;

export async function loadModule(main, { apiCall, getCurrentProfile }) {
  console.log('[EMBARK] --- Starting loadModule for Embark ---');
  _main = main;
  _apiCall = apiCall;
  _getCurrentProfile = getCurrentProfile;

  _profile = _getCurrentProfile();
  if (!_profile) {
    console.error('[EMBARK] No profile found. Redirecting to login.');
    displayMessage('User profile not found. Please log in again.');
    window.gameAuth.loadModule('login');
    return;
  }

  // Clear main container and prepare structure
  _main.innerHTML = `
    <div class="main-app-container">
      <div class="particles"></div>
      
      <!-- Fixed Return Button -->
      <div class="fixed-return-button">
        <button class="fantasy-button return-btn">
          <span class="return-icon">←</span>
          Return to Castle
        </button>
      </div>
      
      <!-- Loading Overlay -->
      <div class="loading-overlay" style="display: none;">
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <div class="loading-text">Preparing your adventure...</div>
          <div class="loading-subtext">Gathering champions and scouting the area</div>
        </div>
      </div>
      
      <div class="character-creation-section"></div>
    </div>
  `;

  createParticles();
  renderEmbarkScreen();

  // Add return button handler
  _main.querySelector('.return-btn').addEventListener('click', () => {
    window.gameAuth.loadModule('castle');
  });

  console.log('[EMBARK] --- loadModule for Embark finished ---');
}

function renderEmbarkScreen() {
  const section = _main.querySelector('.character-creation-section');

  section.innerHTML = `
    <div class="art-header">
      <h1>Choose Your Adventure</h1>
      <p class="subtitle">Select where you'd like to embark with your champions</p>
    </div>
    
    <div class="embark-locations-container">
      <div class="locations-grid">
        ${createLocationCard('Forest', 'Forest', 'assets/art/embark/forest.png', 'Dense woodlands filled with ancient magic and mysterious creatures')}
        ${createLocationCard('Mountain', 'Mountain', 'assets/art/embark/mountain.png', 'Treacherous peaks hiding valuable treasures and fierce guardians')}
        ${createLocationCard('Dungeon', 'Dungeon', 'assets/art/embark/dungeon.png', 'Dark underground chambers echoing with danger and opportunity')}
        ${createLocationCard('PvP Arena', 'PvP', 'assets/art/embark/pvp.png', 'Face other champions in glorious combat for honor and rewards')}
      </div>
    </div>
  `;

  // Add click handlers to location cards
  section.querySelectorAll('.location-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const mode = e.currentTarget.dataset.mode;
      handleLocationSelection(mode, e.currentTarget);
    });
  });
}

function createLocationCard(title, mode, imgSrc, description) {
  return `
    <div class="location-card" data-mode="${mode}">
      <div class="location-card-inner">
        <div class="location-image-container">
          <img src="${imgSrc}" alt="${title}" class="location-image" onerror="this.src='assets/art/placeholder.png'">
          <div class="location-overlay">
            <div class="location-title">${title}</div>
          </div>
        </div>
        <div class="location-info">
          <h3 class="location-name">${title}</h3>
          <p class="location-description">${description}</p>
          <div class="embark-indicator">
            <span class="embark-text">Click to Embark</span>
            <div class="embark-arrow">→</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function handleLocationSelection(mode, cardElement) {
  console.log(`[EMBARK] Selected mode: ${mode}`);
  
  // Add selection feedback
  cardElement.classList.add('location-selected');
  
  // Show loading overlay with animation
  showLoadingAnimation(mode);
  
  // Small delay for visual feedback, then proceed
  setTimeout(() => {
    window.gameAuth.loadModule('battle_manager', { selectedMode: mode });
  }, 1500);
}

function showLoadingAnimation(mode) {
  const loadingOverlay = _main.querySelector('.loading-overlay');
  const loadingText = loadingOverlay.querySelector('.loading-text');
  const loadingSubtext = loadingOverlay.querySelector('.loading-subtext');
  
  // Customize loading text based on mode
  const loadingMessages = {
    'Forest': {
      main: 'Entering the Ancient Forest...',
      sub: 'Your champions ready their weapons as birds scatter from the canopy'
    },
    'Mountain': {
      main: 'Ascending the Treacherous Peaks...',
      sub: 'The mountain winds howl as your party begins the climb'
    },
    'Dungeon': {
      main: 'Descending into the Dark Depths...',
      sub: 'Torches flicker as ancient stones echo with your footsteps'
    },
    'PvP': {
      main: 'Entering the Arena...',
      sub: 'The crowd roars as champions prepare for glorious combat'
    }
  };
  
  const messages = loadingMessages[mode] || {
    main: 'Preparing your adventure...',
    sub: 'Gathering champions and scouting the area'
  };
  
  loadingText.textContent = messages.main;
  loadingSubtext.textContent = messages.sub;
  
  // Show loading overlay with fade in
  loadingOverlay.style.display = 'flex';
  loadingOverlay.style.opacity = '0';
  
  // Animate in
  requestAnimationFrame(() => {
    loadingOverlay.style.transition = 'opacity 0.3s ease-in-out';
    loadingOverlay.style.opacity = '1';
  });
}

function createParticles() {
  console.log('[PARTICLES] Creating particles in Embark...');
  const particlesContainer = _main.querySelector('.particles');
  if (!particlesContainer) return;

  particlesContainer.innerHTML = '';
  const particleCount = 25;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 6 + 's';
    particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
    particlesContainer.appendChild(particle);
  }
}

function displayMessage(message) {
  console.log(`[MESSAGE] Displaying: ${message}`);
  const messageBox = document.createElement('div');
  messageBox.className = 'custom-message-box';
  messageBox.innerHTML = `
    <div class="message-content">
      <p>${message}</p>
      <button class="fantasy-button message-ok-btn">OK</button>
    </div>
  `;
  document.body.appendChild(messageBox);

  messageBox.querySelector('.message-ok-btn').addEventListener('click', () => {
    messageBox.remove();
    console.log('[MESSAGE] Message box closed.');
  });
}
let _main;
let _getCurrentProfile;
let _profile;

export async function loadModule(main, { getCurrentProfile }) {
  console.log('[EMBARK] --- Starting loadModule for Embark ---');
  _main = main;
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
      <div class="character-creation-section"></div>
      <div class="modal-overlay" style="display: none;"></div>
    </div>
  `;

  createParticles();
  renderEmbarkScreen();
  setBankHeaderBackground();

  console.log('[EMBARK] --- loadModule for Embark finished ---');
}

function renderEmbarkScreen() {
  const section = _main.querySelector('.character-creation-section');

  section.innerHTML = `
    <div class="bank-header">
          <div class="top-right-buttons">
            <button class="fantasy-button return-btn">Return</button>
          </div>
    </div>
    <div class="selection-section">
      <div class="selection-grid">
        ${createEmbarkCard('Forest', 'Forest', 'assets/art/embark/forest.png')}
        ${createEmbarkCard('Mountain', 'Mountain', 'assets/art/embark/mountain.png')}
        ${createEmbarkCard('Dungeon', 'Dungeon', 'assets/art/embark/dungeon.png')}
        ${createEmbarkCard('PvP Arena', 'PvP', 'assets/art/embark/pvp.png')}
      </div>
    </div>
  `;

  section.querySelector('.return-btn').addEventListener('click', () => {
    window.gameAuth.loadModule('castle');
  });

  // Make entire cards clickable
  section.querySelectorAll('.selection-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const mode = e.currentTarget.dataset.mode;
      console.log(`[EMBARK] Selected mode: ${mode}`);
      
      if (mode === 'PvP') {
        showPvPModal();
      } else {
        // Pass selectedMode to battle_manager when loading
        window.gameAuth.loadModule('battle_manager', { selectedMode: mode });
      }
    });
  });

  section.querySelectorAll('.card-art').forEach(img => {
    img.addEventListener('error', () => {
      console.warn(`[EMBARK] Failed to load image: ${img.src}, using placeholder.`);
      img.src = 'assets/art/placeholder.png';
    });
  });
}

function createEmbarkCard(title, mode, imgSrc) {
  return `
    <div class="selection-card clickable-card" data-mode="${mode}">
      <div class="card-art-block">
        <img src="${imgSrc}" alt="${title}" class="card-art">
      </div>
      <div class="card-info-block">
        <h3 class="card-name">${title}</h3>
        ${mode === 'PvP' ? '<p class="coming-soon-text">Coming Soon</p>' : ''}
      </div>
    </div>
  `;
}

function showPvPModal() {
  const modalOverlay = _main.querySelector('.modal-overlay');
  
  modalOverlay.innerHTML = `
    <div class="pvp-modal">
      <div class="modal-header">
        <h2>PvP Arena</h2>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-content">
        <div class="coming-soon-icon">⚔️</div>
        <h3>Coming Soon!</h3>
        <p>Player vs Player battles are currently in development.</p>
        <p>Prepare your heroes for epic battles against other players!</p>
        <div class="modal-features">
          <ul>
            <li>Real-time PvP battles</li>
            <li>Ranked matchmaking</li>
            <li>Seasonal rewards</li>
            <li>Tournament modes</li>
          </ul>
        </div>
      </div>
      <div class="modal-footer">
        <button class="fantasy-button modal-ok-btn">Got it!</button>
      </div>
    </div>
  `;
  
  modalOverlay.style.display = 'flex';
  
  // Close modal handlers
  modalOverlay.querySelector('.modal-close-btn').addEventListener('click', closePvPModal);
  modalOverlay.querySelector('.modal-ok-btn').addEventListener('click', closePvPModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closePvPModal();
    }
  });
}

function closePvPModal() {
  const modalOverlay = _main.querySelector('.modal-overlay');
  modalOverlay.style.display = 'none';
  modalOverlay.innerHTML = '';
}

function createParticles() {
  console.log('[PARTICLES] Creating particles in Embark...');
  const particlesContainer = _main.querySelector('.particles');
  if (!particlesContainer) return;

  particlesContainer.innerHTML = '';
  const particleCount = 20;
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

function setBankHeaderBackground() {
  const header = document.querySelector('.bank-header');
  if (header) {
    header.style.backgroundImage = "url('assets/art/castle/main_embark.png')";
  }
}
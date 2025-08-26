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
      <div class="character-creation-section"></div>
    </div>
  `;

  createParticles();
  renderEmbarkScreen();

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

  // Return button handler
  section.querySelector('.return-btn').addEventListener('click', () => {
    window.gameAuth.loadModule('castle');
  });

  // Embark buttons handler
  section.querySelectorAll('.embark-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.currentTarget.dataset.mode;
      console.log(`[EMBARK] Selected mode: ${mode}`);
      // Pass selectedMode to battle_manager when loading
      window.gameAuth.loadModule('battle_manager', { selectedMode: mode });
    });
  });

  // Safe image error handling (no inline onerror)
  section.querySelectorAll('.card-art').forEach(img => {
    img.addEventListener('error', () => {
      console.warn(`[EMBARK] Failed to load image: ${img.src}, using placeholder.`);
      img.src = 'assets/art/placeholder.png';
    });
  });

  // Apply custom styles
  addBankStyles();
}

function createEmbarkCard(title, mode, imgSrc) {
  return `
    <div class="selection-card">
      <div class="card-art-block">
        <img src="${imgSrc}" alt="${title}" class="card-art">
      </div>
      <div class="card-info-block">
        <h3 class="card-name">${title}</h3>
        <button class="fantasy-button embark-btn" data-mode="${mode}">Embark</button>
      </div>
    </div>
  `;
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

function addBankStyles() {
  const styleId = 'bank-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .bank-header {
      background-image: url('assets/art/castle/main_embark.png');
    }
  `;
  document.head.appendChild(style);
}

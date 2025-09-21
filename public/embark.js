let _main;
let _getCurrentProfile;
let _profile;
let _apiCall; // Add this
let _supabaseConfig; // Add this

export async function loadModule(main, { getCurrentProfile, apiCall, supabaseConfig }) {
  console.log('[EMBARK] --- Starting loadModule for Embark ---');
  _main = main;
  _getCurrentProfile = getCurrentProfile;
  _apiCall = apiCall; // Add this line
  _supabaseConfig = supabaseConfig; // Add this line

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
      <div class="modal-overlay" style="display: none; z-index: 99;"></div>
    </div>
  `;

  createParticles();
  renderEmbarkScreen();
  setBankHeaderBackground();

  await checkForActiveBattles();
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
        ${createEmbarkCard('Trials', 'Trials', 'assets/art/embark/trials.png')}
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
  // Extra info per mode
  const modeExtras = {
    PvP: '<p class="coming-soon-text">Coming soon!</p>',
    Trials: '<p class="coming-soon-text">Coming not so soon</p>'
  };

  return `
    <div class="selection-card clickable-card" data-mode="${mode}">
      <div class="card-art-block">
        <img src="${imgSrc}" alt="${title}" class="card-art">
      </div>
      <div class="card-info-block">
        <h3 class="card-name">${title}</h3>
        ${modeExtras[mode] || ''}
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

async function checkForActiveBattles() {
  try {
    console.log('[EMBARK] Checking for active battles...');
    
    const response = await _apiCall('/functions/v1/check-active-battle', 'POST', {
      profileId: _profile.id
    });
    
    const result = await response.json();
    
    if (result.success && result.hasActiveBattle) {
      console.log('[EMBARK] Found active battle:', result.battleData.id);
      
      // Show reconnection modal
      showReconnectModal(result.battleData);
      return true;
    }
    
    console.log('[EMBARK] No active battles found.');
    return false;
    
  } catch (error) {
    console.error('[EMBARK] Error checking for active battles:', error);
    // Don't block embark screen if check fails
    return false;
  }
}

function showReconnectModal(battleData) {
  const modalOverlay = _main.querySelector('.modal-overlay');
  
  modalOverlay.innerHTML = `
    <div class="reconnect-modal">
      <div class="modal-header">
        <h2>Active Battle Found</h2>
      </div>
      <div class="modal-content">
        <h3>You have an ongoing battle!</h3>
        <p><strong>Mode:</strong> ${battleData.mode?.toUpperCase() || 'Unknown'}</p>
        <p><strong>Round:</strong> ${battleData.round_number || 1}</p>
        <p><strong>Current Turn:</strong> ${battleData.current_turn === 'AI' ? 'AI Turn' : 'Your Turn'}</p>
        <div class="reconnect-options">
          <p>Would you like to resume your battle or start a new one?</p>
          <div class="warning-text">
            <small>Starting a new battle will abandon your current progress.</small>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="fantasy-button reconnect-btn">Resume</button>
        <button class="fantasy-button abandon-btn secondary">Abandon</button>
      </div>
    </div>
  `;
  
  modalOverlay.style.display = 'flex';
  
  // Handle reconnection
  modalOverlay.querySelector('.reconnect-btn').addEventListener('click', () => {
    console.log('[EMBARK] Reconnecting to active battle:', battleData.id);
    closeBattleModal();
    
    // Determine the selected mode from battle data
    const selectedMode = battleData.mode || 'forest';
    
    // Load battle manager with existing battle data
    window.gameAuth.loadModule('battle_manager', { 
      selectedMode: selectedMode,
      existingBattleId: battleData.id,
      reconnecting: true
    });
  });
  
  // Handle abandoning current battle
  modalOverlay.querySelector('.abandon-btn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to abandon your current battle? This cannot be undone.')) {
      await abandonCurrentBattle(battleData.id);
      closeBattleModal();
    }
  });
}

function closeBattleModal() {
  const modalOverlay = _main.querySelector('.modal-overlay');
  modalOverlay.style.display = 'none';
  modalOverlay.innerHTML = '';
}

async function abandonCurrentBattle(battleId) {
  try {
    console.log('[EMBARK] Abandoning battle:', battleId);
    
    const response = await _apiCall('/functions/v1/abandon-battle', 'POST', {
      battleId: battleId,
      profileId: _profile.id
    });
    
    const result = await response.json();
    
    if (result.success) {
      displayMessage('Previous battle abandoned successfully.');
    } else {
      displayMessage('Failed to abandon previous battle: ' + result.message);
    }
    
  } catch (error) {
    console.error('[EMBARK] Error abandoning battle:', error);
    displayMessage('Error abandoning previous battle.');
  }
}

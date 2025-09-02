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

  // Check for active battle sessions before rendering embark screen
  try {
    await checkForActiveBattleSessions();
  } catch (error) {
    console.error('[EMBARK] Error checking for active battles:', error);
    // Continue to embark screen even if check fails
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

// ---------------- Patch 2: Active Battle Check ----------------
async function checkForActiveBattleSessions() {
  console.log('[EMBARK] Checking for active battle sessions...');
  
  try {
    // Use the game's API call method to check for active battles
    const response = await window.gameAuth.apiCall(
      `/api/supabase/rest/v1/battle_state?select=id,mode,round_number,status&players=cs.{${_profile.id}}&status=eq.active&limit=1`,
      'GET'
    );
    
    const activeBattles = await response.json();
    
    if (activeBattles && activeBattles.length > 0) {
      const activeBattle = activeBattles[0];
      console.log('[EMBARK] Found active battle session:', activeBattle);
      
      showReconnectModal(activeBattle);
    } else {
      console.log('[EMBARK] No active battle sessions found.');
    }
  } catch (error) {
    console.error('[EMBARK] Failed to check for active battles:', error);
    throw error;
  }
}

function showReconnectModal(battleData) {
  const modalOverlay = _main.querySelector('.modal-overlay');
  
  modalOverlay.innerHTML = `
    <div class="reconnect-modal">
      <div class="modal-header">
        <h2>Battle in Progress</h2>
      </div>
      <div class="modal-content">
        <div class="battle-info-icon">⚔️</div>
        <h3>Active Battle Found!</h3>
        <p>You have an ongoing battle session:</p>
        <div class="battle-details">
          <p><strong>Mode:</strong> ${battleData.mode?.toUpperCase() || 'Unknown'}</p>
          <p><strong>Round:</strong> ${battleData.round_number || 1}</p>
          <p><strong>Status:</strong> ${battleData.status || 'Active'}</p>
        </div>
        <p>Would you like to reconnect to this battle?</p>
      </div>
      <div class="modal-footer">
        <button class="fantasy-button reconnect-btn">Reconnect</button>
        <button class="fantasy-button abandon-btn">Start New Battle</button>
      </div>
    </div>
  `;
  
  modalOverlay.style.display = 'flex';
  
  // Reconnect handler
  modalOverlay.querySelector('.reconnect-btn').addEventListener('click', () => {
    console.log(`[EMBARK] Reconnecting to battle ${battleData.id}`);
    closeReconnectModal();
    
    // Load battle manager with the existing battle ID
    window.gameAuth.loadModule('battle_manager', { 
      selectedMode: battleData.mode,
      reconnectBattleId: battleData.id 
    });
  });
  
  // Abandon handler  
  modalOverlay.querySelector('.abandon-btn').addEventListener('click', async () => {
    console.log(`[EMBARK] Abandoning battle ${battleData.id}`);
    
    try {
      // Mark the battle as abandoned
      await window.gameAuth.apiCall(
        `/api/supabase/rest/v1/battle_state?id=eq.${battleData.id}`,
        'PATCH',
        { status: 'abandoned' }
      );
      
      closeReconnectModal();
      displayMessage('Previous battle abandoned. You can now start a new battle.');
    } catch (error) {
      console.error('[EMBARK] Failed to abandon battle:', error);
      displayMessage('Failed to abandon previous battle. Please try again.');
    }
  });
  
  // Close modal on overlay click
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeReconnectModal();
    }
  });
}

function closeReconnectModal() {
  const modalOverlay = _main.querySelector('.modal-overlay');
  modalOverlay.style.display = 'none';
  modalOverlay.innerHTML = '';
}

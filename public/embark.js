let _main;
let _getCurrentProfile;
let _profile;
let _apiCall;
let _supabaseConfig;

export async function loadModule(main, { getCurrentProfile, apiCall, supabaseConfig }) {
  console.log('[EMBARK] --- Starting loadModule for Embark ---');
  _main = main;
  _getCurrentProfile = getCurrentProfile;
  _apiCall = apiCall;
  _supabaseConfig = supabaseConfig;

  _profile = _getCurrentProfile();
  if (!_profile) {
    console.error('[EMBARK] No profile found. Redirecting to login.');
    displayMessage('User profile not found. Please log in again.');
    window.gameAuth.loadModule('login');
    return;
  }

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

  section.querySelectorAll('.selection-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const mode = e.currentTarget.dataset.mode;
      console.log(`[EMBARK] Selected mode: ${mode}`);
      
       if (mode === 'PvP' || mode === 'Dungeon' || mode === 'Trials') {
        showPvPModal(mode);
      } else {
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

function showPvPModal(mode = 'PvP') {
  const modalOverlay = _main.querySelector('.modal-overlay');
  const modalContent = getModalContent(mode);
  
  modalOverlay.innerHTML = `
    <div class="pvp-modal">
      <div class="modal-header">
        <h2>${modalContent.title}</h2>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-content">
        <div class="modal-status ${modalContent.statusClass}">
          <span class="status-icon">${modalContent.statusIcon}</span>
          <h3>${modalContent.statusText}</h3>
        </div>
        <div class="modal-description">
          <p>${modalContent.description}</p>
        </div>
        <div class="modal-features">
          <h4>Planned Features:</h4>
          <ul>
            ${modalContent.features.map(feature => `<li>${feature}</li>`).join('')}
          </ul>
        </div>
        ${modalContent.timeline ? `
          <div class="modal-timeline">
            <p class="timeline-text"><strong>Estimated Release:</strong> ${modalContent.timeline}</p>
          </div>
        ` : ''}
        ${modalContent.note ? `
          <div class="modal-note">
            <p>${modalContent.note}</p>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="fantasy-button modal-ok-btn">Got it!</button>
      </div>
    </div>
  `;
  
  modalOverlay.style.display = 'flex';
  
  modalOverlay.querySelector('.modal-close-btn').addEventListener('click', closePvPModal);
  modalOverlay.querySelector('.modal-ok-btn').addEventListener('click', closePvPModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closePvPModal();
  });
}

function getModalContent(mode) {
  const content = {
    'PvP': {
      title: 'PvP Arena',
      statusClass: 'status-coming-soon',
      statusIcon: '⚔️',
      statusText: 'Coming Soon!',
      description: 'Prepare to test your strategies against real players! The PvP Arena will pit your carefully assembled party against other players in tactical turn-based combat.',
      features: [
        'Real-time matchmaking with players of similar skill levels',
        'Ranked ladder system with seasonal resets',
        'Exclusive PvP rewards and cosmetics',
        'Tournament modes with special prizes',
        'Draft mode - build a party from random hero pools',
        'Spectator mode to watch high-level matches',
        'Replay system to review and learn from battles'
      ],
      timeline: 'Q1 2026',
      note: 'Balance adjustments and new hero abilities are being fine-tuned specifically for competitive play.'
    },
    'Dungeon': {
      title: 'Dungeon Expeditions',
      statusClass: 'status-in-development',
      statusIcon: '🗝️',
      statusText: 'In Active Development',
      description: 'Venture into procedurally generated dungeons filled with traps, treasures, and increasingly difficult challenges. Each run is unique, testing your adaptability and resource management.',
      features: [
        'Procedurally generated multi-floor dungeons',
        'Progressive difficulty with elite monsters and bosses',
        'Treasure rooms with rare loot and equipment',
        'Trap rooms requiring careful decision-making',
        'Persistent upgrades and meta-progression',
        'Special themed dungeons with unique mechanics',
        'Leaderboards for deepest dungeon cleared',
        'Party permadeath mode for hardcore players'
      ],
      timeline: 'Q2 2026',
      note: 'Currently implementing the dungeon generation algorithm and testing boss encounter mechanics.'
    },
    'Trials': {
      title: 'Trials of Champions',
      statusClass: 'status-planned',
      statusIcon: '🏆',
      statusText: 'Planned for Future Release',
      description: 'Ultimate endgame challenges designed for seasoned adventurers. Each trial presents unique restrictions and modifiers that will push your tactical prowess to the limit.',
      features: [
        'Weekly rotating challenges with special modifiers',
        'Class-restricted trials (warriors only, mages only, etc.)',
        'Boss rush mode - face multiple bosses in succession',
        'Time attack challenges for speedrunners',
        'Ironman mode - single hero, no party backup',
        'Unique cosmetic rewards for trial completion',
        'Hall of Fame showcasing top performers',
        'Custom trial builder for community challenges'
      ],
      timeline: 'TBD - Post-Launch Content',
      note: 'Trials will be introduced after core game modes are polished and the player base is established.'
    }
  };
  
  return content[mode] || content['PvP'];
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
      showReconnectModal(result.battleData);
      return true;
    }
    
    console.log('[EMBARK] No active battles found.');
    return false;
    
  } catch (error) {
    console.error('[EMBARK] Error checking for active battles:', error);
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
            <small>Abandoning will forfeit your current progress.</small>
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
  
  modalOverlay.querySelector('.reconnect-btn').addEventListener('click', () => {
    console.log('[EMBARK] Reconnecting to active battle:', battleData.id);
    closeBattleModal();
    
    window.gameAuth.loadModule('battle_manager', { 
      selectedMode: battleData.mode || 'forest',
      existingBattleId: battleData.id,
      reconnecting: true
    });
  });
  
  modalOverlay.querySelector('.abandon-btn').addEventListener('click', async () => {
    await abandonCurrentBattle(battleData.id);
    closeBattleModal();
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
    
    await _apiCall('/functions/v1/abandon-battle', 'POST', {
      battleId: battleId,
      profileId: _profile.id
    });
    
  } catch (error) {
    console.error('[EMBARK] Error abandoning battle:', error);
  }
}
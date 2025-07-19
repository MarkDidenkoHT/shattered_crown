let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _tileMap = {}; // name → tile metadata

export async function loadModule(main, { apiCall, getCurrentProfile, selectedMode }) {
  console.log('[BATTLE_MANAGER] --- Starting loadModule ---');
  _main = main;
  _apiCall = apiCall;
  _getCurrentProfile = getCurrentProfile;

  _profile = _getCurrentProfile();
  if (!_profile) {
    console.error('[BATTLE_MANAGER] No profile found. Redirecting to login.');
    displayMessage('User profile not found. Please log in again.');
    window.gameAuth.loadModule('login');
    return;
  }

  if (!selectedMode) {
    console.error('[BATTLE_MANAGER] No selectedMode provided. Returning to embark.');
    displayMessage('No mode selected. Returning to embark.');
    window.gameAuth.loadModule('embark');
    return;
  }

  console.log(`[BATTLE_MANAGER] Selected mode: ${selectedMode}`);

  let areaLevel = 1;
  if (selectedMode !== 'pvp') {
    areaLevel = (_profile.progress && _profile.progress[selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)]) || 1;
  } else {
    areaLevel = Math.floor(Math.random() * 10) + 1;
  }

  console.log(`[BATTLE_MANAGER] Area level determined: ${areaLevel}`);

  // Fetch tile definitions
  try {
    const tileResponse = await _apiCall(`/api/supabase/rest/v1/tiles?select=name,walkable,vision_block,art`);
    const tileRows = await tileResponse.json();
    tileRows.forEach(tile => {
      _tileMap[tile.name.toLowerCase()] = tile;
    });
    console.log('[BATTLE_MANAGER] Tile data loaded:', _tileMap);
  } catch (err) {
    console.warn('[BATTLE_MANAGER] Could not fetch tile data.', err);
  }

  // Fetch layout data
  let layoutData;
  try {
    const layoutName = selectedMode === 'pvp' ? 'pvp' : selectedMode;
    const response = await _apiCall(`/api/supabase/rest/v1/layouts?name=eq.${layoutName}&level=eq.${areaLevel}&select=*`);
    const layouts = await response.json();
    layoutData = layouts[0];

    if (!layoutData) {
      throw new Error('No layout data found.');
    }

    console.log('[BATTLE_MANAGER] Layout data fetched:', layoutData);
  } catch (error) {
    console.error('[BATTLE_MANAGER] Error fetching layout data:', error);
    displayMessage('Failed to load battlefield layout. Returning...');
    window.gameAuth.loadModule('embark');
    return;
  }

  renderBattleScreen(selectedMode, areaLevel, layoutData);
}

function renderBattleScreen(mode, level, layoutData) {
  _main.innerHTML = `
    <div class="main-app-container">
      <div class="battle-top-bar">
        <button class="fantasy-button return-btn">Retreat</button>
        <p class="battle-status">Mode: ${mode.toUpperCase()} | Level: ${level}</p>
        <button class="fantasy-button settings-btn">Settings</button>
      </div>
      <div class="battle-grid-container"></div>
      <div class="battle-bottom-ui"></div>
    </div>
  `;

  _main.querySelector('.return-btn').addEventListener('click', () => {
    displayMessage('Retreating to embark...');
    window.gameAuth.loadModule('embark');
  });

  _main.querySelector('.settings-btn').addEventListener('click', () => {
    displayMessage('Settings coming soon!');
  });

  renderBattleGrid(layoutData.layout);
  renderBottomUI();
  createParticles();
}

function renderBattleGrid(layoutJson) {
  const container = _main.querySelector('.battle-grid-container');
  if (!layoutJson || !layoutJson.tiles) {
    console.error('[BATTLE_MANAGER] Invalid layout JSON.');
    container.innerHTML = '<p>Invalid battlefield layout.</p>';
    return;
  }

  const tiles = layoutJson.tiles;
  container.innerHTML = '';
  container.style.display = 'grid';
  container.style.gridTemplateRows = `repeat(${tiles.length}, 1fr)`;
  container.style.gridTemplateColumns = `repeat(${tiles[0].length}, 1fr)`;
  container.style.gap = '2px';
  container.style.width = '100%';
  container.style.height = '100%';

  tiles.forEach((row, y) => {
    row.forEach((tileName, x) => {
      const normalizedName = tileName.toLowerCase().replace(/\s+/g, '_'); // e.g., "Dark Grass" → "dark_grass"
      const tileData = _tileMap[normalizedName];
      const artName = tileData?.art || 'placeholder';

      const tile = document.createElement('div');
      tile.className = `battle-tile tile-${normalizedName}`;
      tile.dataset.x = x;
      tile.dataset.y = y;
      tile.title = tileName;

      tile.style.backgroundImage = `url(assets/art/tiles/${artName}.png)`;
      tile.style.backgroundSize = 'cover';
      tile.style.backgroundPosition = 'center';

      container.appendChild(tile);
    });
  });
}


function renderBottomUI() {
  const ui = _main.querySelector('.battle-bottom-ui');
  ui.innerHTML = '';

  for (let row = 0; row < 2; row++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'battle-ui-row';
    for (let i = 0; i < 5; i++) {
      const btn = document.createElement('button');
      btn.className = 'fantasy-button ui-btn';
      btn.textContent = `Btn ${row * 5 + i + 1}`;
      rowDiv.appendChild(btn);
    }
    ui.appendChild(rowDiv);
  }
}

function createParticles() {
  console.log('[PARTICLES] Creating particles for Battle Manager...');
  const particlesContainer = document.createElement('div');
  particlesContainer.className = 'particles';
  _main.appendChild(particlesContainer);

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

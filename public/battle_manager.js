let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _tileMap = {}; // name → tile metadata
let _characters = [];

import {
  loadPlayerCharacters,
  loadEnemiesByNames,
  initCharacterData
} from './character_data.js';

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
    areaLevel = (_profile.progress?.[selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)]) || 1;
  } else {
    areaLevel = Math.floor(Math.random() * 10) + 1;
  }

  console.log(`[BATTLE_MANAGER] Area level determined: ${areaLevel}`);

  // Init character module
  initCharacterData(_apiCall);

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

  // Fetch layout
  let layoutData;
  try {
    const layoutName = selectedMode === 'pvp' ? 'pvp' : selectedMode;
    const response = await _apiCall(`/api/supabase/rest/v1/layouts?name=eq.${layoutName}&level=eq.${areaLevel}&select=*`);
    const layouts = await response.json();
    layoutData = layouts[0];
    if (!layoutData) throw new Error('No layout data found.');
    console.log('[BATTLE_MANAGER] Layout data fetched:', layoutData);
  } catch (err) {
    console.error('[BATTLE_MANAGER] Error fetching layout data:', err);
    displayMessage('Failed to load battlefield layout. Returning...');
    window.gameAuth.loadModule('embark');
    return;
  }

  // Load characters
  const playerPos = layoutData.player_pos?.playerSpawnPositions || [];
  const enemyNames = layoutData.enemy_pos?.enemyNamesToSpawn || [];
  const enemyPos = layoutData.enemy_pos?.enemySpawnPositions || [];

  const players = await loadPlayerCharacters(_profile.id, playerPos);
  const enemies = await loadEnemiesByNames(enemyNames, enemyPos);
  _characters = [...players, ...enemies];

  // Render
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
  renderCharacters();
  renderBottomUI();
  createParticles();
}

function renderBattleGrid(layoutJson) {
  const container = _main.querySelector('.battle-grid-container');
  if (!layoutJson?.tiles) {
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
      const normalized = tileName.toLowerCase().replace(/\s+/g, '_');
      const tileData = _tileMap[normalized];
      const art = tileData?.art || 'placeholder';

      const tile = document.createElement('div');
      tile.className = `battle-tile tile-${normalized}`;
      tile.dataset.x = x;
      tile.dataset.y = y;
      tile.title = tileName;
      tile.style.backgroundImage = `url(assets/art/tiles/${art}.png)`;
      tile.style.backgroundSize = 'cover';
      tile.style.backgroundPosition = 'center';

      container.appendChild(tile);
    });
  });
}

function renderCharacters() {
  const container = _main.querySelector('.battle-grid-container');
  if (!container) return;

  _characters.forEach(char => {
    if (!char.position) return;

    const charEl = document.createElement('div');
    charEl.className = `character-token ${char.type}`;
    charEl.dataset.id = char.id;
    charEl.style.gridColumnStart = char.position.x + 1;
    charEl.style.gridRowStart = char.position.y + 1;
    charEl.style.zIndex = 5;
    charEl.title = char.name;

    const img = document.createElement('img');
    img.src = `assets/art/sprites/${char.spriteName}.png`;
    img.alt = char.name;
    img.onerror = () => { img.src = 'assets/art/sprites/placeholder.png'; };
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';

    charEl.appendChild(img);
    container.appendChild(charEl);
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
  const container = document.createElement('div');
  container.className = 'particles';
  _main.appendChild(container);

  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = Math.random() * 100 + '%';
    p.style.animationDelay = Math.random() * 6 + 's';
    p.style.animationDuration = (Math.random() * 3 + 4) + 's';
    container.appendChild(p);
  }
}

function displayMessage(msg) {
  const box = document.createElement('div');
  box.className = 'custom-message-box';
  box.innerHTML = `
    <div class="message-content">
      <p>${msg}</p>
      <button class="fantasy-button message-ok-btn">OK</button>
    </div>
  `;
  document.body.appendChild(box);
  box.querySelector('.message-ok-btn').addEventListener('click', () => box.remove());
}

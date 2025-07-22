let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _tileMap = {};
let _characters = [];
let _selectedCharacterEl = null;

import {
  loadPlayerCharacters,
  loadEnemiesByNames,
  initCharacterData
} from './character_data.js';

export async function loadModule(main, { apiCall, getCurrentProfile, selectedMode }) {
  _main = main;
  _apiCall = apiCall;
  _getCurrentProfile = getCurrentProfile;

  _profile = _getCurrentProfile();
  if (!_profile) {
    displayMessage('User profile not found. Please log in again.');
    window.gameAuth.loadModule('login');
    return;
  }

  initCharacterData(_apiCall, _profile);

  if (!selectedMode) {
    displayMessage('No mode selected. Returning to embark.');
    window.gameAuth.loadModule('embark');
    return;
  }

  const areaLevel = selectedMode !== 'pvp'
    ? (_profile.progress?.[selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)] || 1)
    : Math.floor(Math.random() * 10) + 1;

  try {
    const tileRes = await _apiCall(`/api/supabase/rest/v1/tiles?select=name,walkable,vision_block,art`);
    const tileRows = await tileRes.json();
    tileRows.forEach(tile => {
      _tileMap[tile.name.toLowerCase()] = tile;
    });
  } catch (err) {
    console.warn('[TILES] Could not load tile data:', err);
  }

  let layoutData;
  try {
    const layoutName = selectedMode === 'pvp' ? 'pvp' : selectedMode;
    const res = await _apiCall(`/api/supabase/rest/v1/layouts?name=eq.${layoutName}&level=eq.${areaLevel}&select=*`);
    const layouts = await res.json();
    layoutData = layouts[0];
    if (!layoutData) throw new Error('No layout found');
  } catch (err) {
    displayMessage('Failed to load battlefield layout. Returning...');
    window.gameAuth.loadModule('embark');
    return;
  }

  const playerPos = layoutData.player_pos?.playerSpawnPositions || [];
  const enemyNames = layoutData.enemy_pos?.enemyNamesToSpawn || [];
  const enemyPos = layoutData.enemy_pos?.enemySpawnPositions || [];

  const players = await loadPlayerCharacters(_profile.id, playerPos);
  const enemies = await loadEnemiesByNames(enemyNames, enemyPos);
  _characters = [...players, ...enemies];

  renderBattleScreen(selectedMode, areaLevel, layoutData);
}

function renderBattleScreen(mode, level, layoutData) {
  _main.innerHTML = `
    <div class="main-app-container">
      <div class="battle-top-bar">
        <p class="battle-status">${mode.toUpperCase()} — Level ${level}</p>
      </div>
      <div class="battle-grid-container"></div>
      <div class="battle-top-buttons" id="entityInfoPanel">
        <img id="infoPortrait" src="assets/art/sprites/placeholder.png" />
        <div class="info-text">
          <h3 id="infoName">—</h3>
          <div id="infoHP"></div>
          <div id="infoStats"></div>
          <ul id="infoAbilities"></ul>
        </div>
      </div>
      <div class="battle-bottom-ui"></div>
    </div>
  `;

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
  const rowCount = 7;
  const colCount = 7;

  container.innerHTML = '';

  const table = document.createElement('table');
  table.className = 'battle-grid-table';

  for (let y = 0; y < rowCount; y++) {
    const tr = document.createElement('tr');
    for (let x = 0; x < colCount; x++) {
      const tileName = tiles[y]?.[x] || 'Plain';
      const normalized = tileName.toLowerCase().replace(/\s+/g, '_');
      const tileData = _tileMap[normalized];
      const art = tileData?.art || 'placeholder';

      const td = document.createElement('td');
      td.className = `battle-tile tile-${normalized}`;
      td.dataset.x = x;
      td.dataset.y = y;
      td.title = tileName;

      td.style.backgroundImage = `url(assets/art/tiles/${art}.png)`;
      td.style.backgroundSize = 'cover';
      td.style.backgroundPosition = 'center';

      td.addEventListener('click', () => {
        if (_selectedCharacterEl) {
          _selectedCharacterEl.classList.remove('character-selected');
          _selectedCharacterEl = null;
        }
        showEntityInfo({ tile: _tileMap[normalized] });
      });

      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  container.appendChild(table);
}

function renderCharacters() {
  const container = _main.querySelector('.battle-grid-container');
  if (!container) return;

  _characters.forEach(char => {
    if (!char.position || !Array.isArray(char.position)) return;

    const [x, y] = char.position;
    const selector = `td[data-x="${x}"][data-y="${y}"]`;
    const cell = container.querySelector(selector);
    if (!cell) return;

    const charEl = document.createElement('div');
    charEl.className = `character-token ${char.type}`;
    charEl.dataset.id = char.id;
    charEl.title = char.name;

    const sprite = char.spriteName || 'placeholder';
    const img = document.createElement('img');
    img.src = `assets/art/sprites/${sprite}.png`;
    img.alt = char.name;
    img.onerror = () => {
      img.src = 'assets/art/sprites/placeholder.png';
    };

    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';

    charEl.appendChild(img);

    charEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_selectedCharacterEl) {
        _selectedCharacterEl.classList.remove('character-selected');
      }
      charEl.classList.add('character-selected');
      _selectedCharacterEl = charEl;
      showEntityInfo(char);
    });

    cell.appendChild(charEl);
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

function showEntityInfo(entity) {
  const portrait = document.getElementById('infoPortrait');
  const nameEl = document.getElementById('infoName');
  const hpEl = document.getElementById('infoHP');
  const statsEl = document.getElementById('infoStats');
  const abilitiesEl = document.getElementById('infoAbilities');

  if (!entity) {
    nameEl.textContent = '—';
    hpEl.textContent = '';
    statsEl.innerHTML = '';
    abilitiesEl.innerHTML = '';
    portrait.src = 'assets/art/sprites/placeholder.png';
    return;
  }

  nameEl.textContent = entity.name || 'Unnamed';

  if (entity.type === 'player' || entity.type === 'enemy') {
    const hp = entity.stats?.hp || 0;
    const maxHp = entity.stats?.maxHp || hp;
    hpEl.textContent = `HP: ${hp} / ${maxHp}`;

    statsEl.innerHTML = Object.entries(entity.stats || {})
      .filter(([k]) => !['hp', 'maxHp'].includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join('<br>');

    abilitiesEl.innerHTML = '';
    (entity.abilities || []).forEach(a => {
      const li = document.createElement('li');
      li.textContent = a;
      abilitiesEl.appendChild(li);
    });

    portrait.src = `assets/art/sprites/${entity.spriteName || 'placeholder'}.png`;
  } else if (entity.tile) {
    hpEl.textContent = '';
    statsEl.innerHTML = `Tile: ${entity.tile.name}<br>Walkable: ${entity.tile.walkable}<br>Blocks Vision: ${entity.tile.vision_block}`;
    abilitiesEl.innerHTML = '';
    portrait.src = `assets/art/tiles/${entity.tile.art || 'placeholder'}.png`;
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

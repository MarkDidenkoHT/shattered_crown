// battle_manager.js

let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _tileMap = {};
let _characters = [];
let _selectedCharacterEl = null; // This is the HTML element of the selected character
let _selectedPlayerCharacter = null; // Stores the character object itself (player-controlled)
let highlightedTiles = []; // To keep track of highlighted tiles for easy unhighlighting

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
    
    // Ensure characters have an 'isPlayerControlled' property for our logic
    _characters = [
        ...players.map(p => ({ ...p, isPlayerControlled: true })),
        ...enemies.map(e => ({ ...e, isPlayerControlled: false }))
    ];

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
    container.style.width = '100%';
    container.style.maxWidth = '380px';
    container.style.height = '55%';
    container.style.maxHeight = '380px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.margin = '5px';

    const table = document.createElement('table');
    table.className = 'battle-grid-table';
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.height = '100%';
    table.style.tableLayout = 'fixed';

    for (let y = 0; y < rowCount; y++) {
        const tr = document.createElement('tr');
        tr.style.height = `${100 / rowCount}%`;
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
            // Store walkable status in data attribute for easy access
            td.dataset.walkable = tileData?.walkable ? 'true' : 'false';

            td.style.backgroundImage = `url(assets/art/tiles/${art}.png)`;
            td.style.backgroundSize = 'cover';
            td.style.backgroundPosition = 'center';
            td.style.width = `${100 / colCount}%`;
            td.style.padding = '0';
            td.style.margin = '0';
            td.style.position = 'relative';

            // Add unified click handler for tiles
            td.addEventListener('click', handleTileClick);

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
        charEl.dataset.id = char.id; // Ensure data-id is set
        charEl.title = char.name;

        const sprite = char.spriteName || 'placeholder';
        const img = document.createElement('img');
        img.src = `assets/art/sprites/${sprite}.png`;
        img.alt = char.name;
        img.addEventListener('error', () => {
            img.src = 'assets/art/sprites/placeholder.png';
        });
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.zIndex = '10';
        img.style.position = 'absolute';
        img.style.top = '0';
        img.style.left = '0';

        charEl.appendChild(img);
        cell.appendChild(charEl);
    });
}

// NEW: Unified tile click handler
function handleTileClick(event) {
    const clickedTileEl = event.currentTarget;
    const targetX = parseInt(clickedTileEl.dataset.x);
    const targetY = parseInt(clickedTileEl.dataset.y);

    const charInCell = _characters.find(c => Array.isArray(c.position) && c.position[0] === targetX && c.position[1] === targetY);

    if (charInCell) {
        // A character was clicked
        unhighlightAllTiles(); // Clear any existing highlights
        if (_selectedCharacterEl) {
            _selectedCharacterEl.classList.remove('character-selected');
        }

        // If the clicked character is player-controlled, select it
        if (charInCell.isPlayerControlled) {
            const el = clickedTileEl.querySelector('.character-token');
            if (el) {
                el.classList.add('character-selected');
                _selectedCharacterEl = el;
                _selectedPlayerCharacter = charInCell; // Store the character object
                highlightWalkableTiles(_selectedPlayerCharacter); // Highlight tiles for this character
            }
        } else {
            // Clicked on an enemy or non-player character, deselect player character
            _selectedPlayerCharacter = null;
            _selectedCharacterEl = null;
            unhighlightAllTiles(); // Ensure no highlights remain
        }
        showEntityInfo(charInCell);
    } else {
        // An empty tile was clicked
        if (_selectedPlayerCharacter && clickedTileEl.classList.contains('highlight-walkable')) {
            // If a player character is selected AND the clicked tile is highlighted (walkable)
            attemptMoveCharacter(_selectedPlayerCharacter, targetX, targetY);
            // Highlights will be cleared *after* the move is attempted,
            // or if a new character is selected.
        } else {
            // Clicked on an empty, non-highlighted tile or no character was selected
            unhighlightAllTiles();
            if (_selectedCharacterEl) {
                _selectedCharacterEl.classList.remove('character-selected');
                _selectedCharacterEl = null;
            }
            _selectedPlayerCharacter = null; // Deselect character
            // Show info for the tile itself if no character was selected for movement
            showEntityInfo({ tile: _tileMap[clickedTileEl.className.split(' ').find(cls => cls.startsWith('tile-')).replace('tile-', '')] });
        }
    }
}

// Function to highlight walkable tiles around a character
function highlightWalkableTiles(character) {
    unhighlightAllTiles(); // Clear previous highlights

    if (!character || !Array.isArray(character.position)) return;

    const [charX, charY] = character.position;
    const container = _main.querySelector('.battle-grid-container');

    // Define 8-directional offsets for Chebyshev distance (1 tile away)
    const offsets = [
        { dx: 0, dy: -1 }, // Up
        { dx: 0, dy: 1 },  // Down
        { dx: -1, dy: 0 }, // Left
        { dx: 1, dy: 0 },  // Right
        { dx: -1, dy: -1 },// Up-Left
        { dx: 1, dy: -1 }, // Up-Right
        { dx: -1, dy: 1 }, // Down-Left
        { dx: 1, dy: 1 }   // Down-Right
    ];

    offsets.forEach(offset => {
        const newX = charX + offset.dx;
        const newY = charY + offset.dy;

        // Ensure new coordinates are within grid bounds (assuming 7x7 grid for now)
        if (newX >= 0 && newX < 7 && newY >= 0 && newY < 7) {
            const tileEl = container.querySelector(`td[data-x="${newX}"][data-y="${newY}"]`);
            if (tileEl && tileEl.dataset.walkable === 'true') {
                // Check if another character already occupies this tile
                const isOccupied = _characters.some(c => Array.isArray(c.position) && c.position[0] === newX && c.position[1] === newY);
                if (!isOccupied) {
                    tileEl.classList.add('highlight-walkable');
                    highlightedTiles.push(tileEl); // Add to our tracking array
                }
            }
        }
    });
}

// Function to unhighlight all tiles
function unhighlightAllTiles() {
    highlightedTiles.forEach(tileEl => {
        tileEl.classList.remove('highlight-walkable');
    });
    highlightedTiles = []; // Clear the tracking array
}

// Function to move character sprite visually
function moveCharacterSprite(characterId, targetX, targetY) {
    const characterEl = _main.querySelector(`.character-token[data-id="${characterId}"]`);
    if (!characterEl) return; // Character element not found

    const oldCell = characterEl.closest('td');

    if (oldCell && characterEl) {
        // Remove from old cell
        oldCell.removeChild(characterEl);

        // Find new cell
        const newCell = _main.querySelector(`td[data-x="${targetX}"][data-y="${targetY}"]`);
        if (newCell) {
            newCell.appendChild(characterEl);

            // Update character's position in our local _characters array
            const charIndex = _characters.findIndex(c => c.id === characterId);
            if (charIndex !== -1) {
                _characters[charIndex].position = [targetX, targetY];
            }
        }
    }
}

// Function to attempt character movement via server API
async function attemptMoveCharacter(character, targetX, targetY) {
    const characterId = character.id;
    const startX = character.position[0];
    const startY = character.position[1];

    // Client-side validation for immediate neighbors (already done in highlightWalkableTiles, but good to double check)
    const distanceX = Math.abs(targetX - startX);
    const distanceY = Math.abs(targetY - startY);

    if (!((distanceX === 1 && distanceY === 0) || (distanceX === 0 && distanceY === 1))) {
        displayMessage('Characters can only move 1 tile at a time to an adjacent square.');
        unhighlightAllTiles(); // Clear highlights if the move is invalid
        return;
    }

    // Check if the target tile is walkable (based on _tileMap data)
    const targetTileData = _tileMap[
        _main.querySelector(`td[data-x="${targetX}"][data-y="${targetY}"]`)
            .className.split(' ')
            .find(cls => cls.startsWith('tile-'))
            .replace('tile-', '')
    ];

    if (!targetTileData || !targetTileData.walkable) {
        displayMessage('Cannot move to an unwalkable tile.');
        unhighlightAllTiles(); // Clear highlights
        return;
    }

    // Check if the target tile is already occupied by another character
    const isOccupied = _characters.some(c => Array.isArray(c.position) && c.position[0] === targetX && c.position[1] === targetY);
    if (isOccupied) {
        displayMessage('That tile is already occupied by another character.');
        unhighlightAllTiles(); // Clear highlights
        return;
    }


    try {
        const response = await _apiCall('/functions/v1/move-character', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                characterId,
                currentPosition: [startX, startY],
                targetPosition: [targetX, targetY],
                // You might need to send the current battle_state ID here later
                // battleId: 'YOUR_CURRENT_BATTLE_ID'
            })
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                console.log('Move successful:', result.message);
                moveCharacterSprite(characterId, targetX, targetY); // Move the sprite visually
                // Optionally, update the selected character's position and clear selection/highlights
                if (_selectedCharacterEl) {
                    _selectedCharacterEl.classList.remove('character-selected');
                }
                _selectedPlayerCharacter = null; // Deselect character after successful move
                _selectedCharacterEl = null; // Clear character element reference
                unhighlightAllTiles(); // Clear highlights after successful move
            } else {
                displayMessage(`Move failed: ${result.message}`);
                unhighlightAllTiles(); // Clear highlights on server-side failure
            }
        } else {
            // Handle HTTP errors (e.g., 400, 500 from server)
            const errorText = await response.text(); // Get raw error response
            console.error('Server response error:', response.status, errorText);
            displayMessage(`Server error during move: ${response.status} - ${errorText || 'Unknown Error'}. Please try again.`);
            unhighlightAllTiles(); // Clear highlights on server error
        }
    } catch (error) {
        console.error('Error attempting to move character:', error);
        displayMessage('Network error during move. Please check your connection.');
        unhighlightAllTiles(); // Clear highlights on network error
    }
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

    // NEW: Add the "End Turn" button (10th button, which is row 1, index 4)
    const endTurnButton = ui.querySelectorAll('.battle-ui-row')[1].children[4];
    if (endTurnButton) {
        endTurnButton.textContent = 'End Turn';
        endTurnButton.id = 'endTurnButton'; // Give it an ID for easy targeting
        endTurnButton.addEventListener('click', handleEndTurn);
    }
}

// NEW: Placeholder for end turn logic
function handleEndTurn() {
    displayMessage('End Turn button clicked! (Logic to be implemented)');
    // In a real scenario, this would send a request to the server to advance the turn.
    unhighlightAllTiles();
    if (_selectedCharacterEl) {
        _selectedCharacterEl.classList.remove('character-selected');
        _selectedCharacterEl = null;
    }
    _selectedPlayerCharacter = null;
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

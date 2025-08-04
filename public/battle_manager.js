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

// NEW: Battle state management variables
let _battleState = null; // New variable to hold the battle state from the server
let _battleId = null; // New variable to store the current battle ID
let _unsubscribeFromBattle = null; // New variable for our Realtime subscription handle

import {
    loadPlayerCharacters,
    loadEnemiesByNames,
    initCharacterData
} from './character_data.js';

export async function loadModule(main, { apiCall, getCurrentProfile, selectedMode }) {
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;

    // We no longer need to manually load characters here, the server will do it.
    // However, we still need to load tile data for client-side rendering and validation.
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

    // --- NEW LOGIC: START THE BATTLE AND LISTEN FOR REALTIME UPDATES ---
    try {
        // 1. Call a new server function to create the battle state.
        // This function will handle loading characters, creating the turn order, and saving to the DB.
        const startBattleResponse = await _apiCall('/functions/v1/start-battle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                profileId: _profile.id,
                selectedMode: selectedMode,
                areaLevel: areaLevel
            })
        });

        if (!startBattleResponse.ok) {
            throw new Error(`Failed to start battle: ${await startBattleResponse.text()}`);
        }
        
        const battleData = await startBattleResponse.json();
        _battleId = battleData.battleId;
        _battleState = battleData.initialState; // The server sends us the initial state

        // 2. Set up the Realtime subscription
        const { supabase } = await import('./supabase_client.js'); // Assuming you have a Supabase client module
        
        // This is a placeholder for a future PVP Realtime listener.
        // For now, we'll only listen to our own battle state.
        _unsubscribeFromBattle = supabase
            .channel(`battle_state:${_battleId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'battle_state', filter: `id=eq.${_battleId}` },
                (payload) => {
                    console.log('Realtime update received:', payload.new);
                    _battleState = payload.new;
                    // Call a new function to update the game state and UI
                    updateGameStateFromRealtime();
                }
            )
            .subscribe();

    } catch (err) {
        console.error('Error during battle initialization:', err);
        displayMessage('Failed to start battle. Returning to embark.');
        window.gameAuth.loadModule('embark');
        return;
    }

    // Now, render the game based on the server's initial state
    renderBattleScreen(selectedMode, areaLevel, _battleState.layout_data);
    // Call the function to set up the initial game state
    updateGameStateFromRealtime();

    // --- END OF NEW LOGIC ---
}

// NEW: A function to process Realtime updates and redraw the UI
function updateGameStateFromRealtime() {
    if (!_battleState) return;

    // Update the local _characters array based on the server's state
    _characters = Object.values(_battleState.characters_state).map(charState => {
        // Find the original character data (e.g., from character_data.js) to get stats, sprite, etc.
        // For now, we can just use the state directly.
        return {
            id: charState.id,
            name: charState.name,
            type: charState.type, // 'player' or 'enemy'
            isPlayerControlled: charState.isPlayerControlled,
            position: charState.current_position,
            // ... (other character data like stats, sprite name, etc.)
            stats: charState.stats,
            spriteName: charState.sprite_name,
            has_moved: charState.has_moved,
            has_acted: charState.has_acted
        };
    });

    // Re-render characters to their new positions
    renderCharacters();

    // TODO: Add logic to update UI based on whose turn it is
    // For example, enable/disable the "End Turn" button, highlight the active character, etc.
    const currentCharacterId = _battleState.turn_order[_battleState.current_turn_index];
    const activeCharacter = _characters.find(c => c.id === currentCharacterId);

    // Call a function to handle the turn
    handleActiveCharacterTurn(activeCharacter);
}

// NEW: This function will be called on every turn change
function handleActiveCharacterTurn(character) {
    if (!character) return;

    // Display whose turn it is
    const turnStatusEl = document.getElementById('turnStatus');
    if (turnStatusEl) {
        turnStatusEl.textContent = `Turn: ${character.name}`;
    }

    if (character.isPlayerControlled) {
        // Enable player input
        // TODO: Enable player to select a character
        // We might need to select the active character automatically or add a visual cue.
    } else {
        // Disable player input
        // Handle AI turn logic here (for now, a simple skip)
        // Send a request to the server to handle the AI turn
        // await _apiCall('/functions/v1/process-ai-turn', { ... });
        // After the server processes it, Realtime will push the update back to us.
    }
}

function renderBattleScreen(mode, level, layoutData) {
    _main.innerHTML = `
        <div class="main-app-container">
            <div class="battle-top-bar">
                <p class="battle-status">${mode.toUpperCase()} — Level ${level}</p>
                <p id="turnStatus">Turn: —</p>
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

    // First, clear all existing character tokens
    container.querySelectorAll('.character-token').forEach(token => token.remove());

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

    // Client-side validation for immediate neighbors (Chebyshev distance)
    const distanceX = Math.abs(targetX - startX);
    const distanceY = Math.abs(targetY - startY);
    const chebyshevDistance = Math.max(distanceX, distanceY);

    // Ensure it's exactly 1 tile away (8-directional) AND not the same tile
    if (chebyshevDistance !== 1 || (distanceX === 0 && distanceY === 0)) { // <-- THIS IS THE CRUCIAL CHANGE
        displayMessage('Characters can only move 1 tile at a time to an adjacent square (including diagonals).');
        unhighlightAllTiles(); // Clear highlights if the move is invalid
        return;
    }

    // Check if the target tile is walkable (based on _tileMap data)
    const targetTileEl = _main.querySelector(`td[data-x="${targetX}"][data-y="${targetY}"]`);
    if (!targetTileEl) {
        displayMessage('Invalid target tile.');
        unhighlightAllTiles();
        return;
    }

    const tileClassName = targetTileEl.className.split(' ').find(cls => cls.startsWith('tile-'));
    const tileName = tileClassName ? tileClassName.replace('tile-', '') : 'plain'; // Default to 'plain' if not found
    const targetTileData = _tileMap[tileName];

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
                battleId: _battleId // Now we send the battle ID
            })
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                console.log('Move successful:', result.message);
                // Don't move the sprite manually - let the realtime update handle it
                // moveCharacterSprite(characterId, targetX, targetY); // Commented out
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

// NEW: End turn handler - now communicates with server
async function handleEndTurn() {
    if (!_battleId) {
        displayMessage('No active battle found.');
        return;
    }

    try {
        const response = await _apiCall('/functions/v1/end-turn', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                battleId: _battleId
            })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Turn ended:', result.message);
            // The realtime update will handle UI changes
        } else {
            const errorText = await response.text();
            displayMessage(`Failed to end turn: ${errorText}`);
        }
    } catch (error) {
        console.error('Error ending turn:', error);
        displayMessage('Network error ending turn. Please try again.');
    }

    // Clear any current selections
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

// NEW: Cleanup function to unsubscribe from realtime when leaving the battle
export function cleanup() {
    if (_unsubscribeFromBattle) {
        _unsubscribeFromBattle();
        _unsubscribeFromBattle = null;
    }
    _battleState = null;
    _battleId = null;
    _characters = [];
    _selectedCharacterEl = null;
    _selectedPlayerCharacter = null;
    unhighlightAllTiles();
}
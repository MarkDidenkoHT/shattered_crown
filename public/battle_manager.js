import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.0';

let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _tileMap = {};
let _characters = [];
let _selectedCharacterEl = null;
let _selectedPlayerCharacter = null;
let highlightedTiles = [];

let _supabaseClient = null;
let _battleState = null;
let _battleId = null;
let _unsubscribeFromBattle = null;

import { initCharacterData } from './character_data.js';

function getSupabaseClient(config) {
    if (_supabaseClient) {
        return _supabaseClient;
    }

    if (!config || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        console.error('[SUPABASE] Supabase configuration missing from main.js');
        throw new Error('Supabase configuration not found.');
    }

    _supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: { flowType: 'pkce' }
    });

    return _supabaseClient;
}

export async function loadModule(main, { apiCall, getCurrentProfile, selectedMode, supabaseConfig }) {
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

    try {
        const supabase = getSupabaseClient(supabaseConfig);
        
        if (_unsubscribeFromBattle) {
            await supabase.removeChannel(_unsubscribeFromBattle);
        }
        
        console.log('[BATTLE] Attempting to start battle via Edge Function...');
        const startBattleRes = await _apiCall('/functions/v1/start-battle', 'POST', {
            profileId: _profile.id,
            selectedMode: selectedMode,
            areaLevel: areaLevel,
        });

        const startBattleResponse = await startBattleRes.json();

        if (!startBattleResponse.success) {
            throw new Error(startBattleResponse.error || 'Failed to start battle.');
        }

        const { battleId, initialState } = startBattleResponse;
        _battleId = battleId;
        _battleState = initialState;

        console.log(`[BATTLE] Battle started with ID: ${_battleId}`);

        _unsubscribeFromBattle = supabase
            .channel(`battle_state:${_battleId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'battle_state',
                    filter: `id=eq.${_battleId}`
                },
                (payload) => {
                    console.log('Realtime update received:', payload.new);
                    _battleState = payload.new;
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

    renderBattleScreen(selectedMode, areaLevel, _battleState.layout_data);
    updateGameStateFromRealtime();
}

/**
 * Updates the game state from the latest data received from Supabase.
 * This is the main function that processes server-side changes.
 */
function updateGameStateFromRealtime() {
    if (!_battleState) return;

    // ✅ UPDATED: Map the characters_state object to an array and include
    // the new current_hp and max_hp fields.
    _characters = Object.values(_battleState.characters_state).map(charState => {
        return {
            id: charState.id,
            name: charState.name,
            type: charState.type,
            isPlayerControlled: charState.isPlayerControlled,
            position: charState.current_position,
            stats: charState.stats,
            spriteName: charState.sprite_name,
            has_moved: charState.has_moved,
            has_acted: charState.has_acted,
            current_hp: charState.current_hp,
            max_hp: charState.max_hp,
        };
    });

    renderCharacters();
    const currentCharacterId = _battleState.turn_order[_battleState.current_turn_index];
    const activeCharacter = _characters.find(c => c.id === currentCharacterId);
    handleActiveCharacterTurn(activeCharacter);
}

function handleActiveCharacterTurn(character) {
    if (!character) return;
    const turnStatusEl = document.getElementById('turnStatus');
    if (turnStatusEl) {
        turnStatusEl.textContent = `Turn: ${character.name}`;
    }

    if (character.isPlayerControlled) {
        // Player turn logic
    } else {
        // AI turn logic
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
            td.dataset.walkable = tileData?.walkable ? 'true' : 'false';

            td.style.backgroundImage = `url(assets/art/tiles/${art}.png)`;
            td.style.backgroundSize = 'cover';
            td.style.backgroundPosition = 'center';
            td.style.width = `${100 / colCount}%`;
            td.style.padding = '0';
            td.style.margin = '0';
            td.style.position = 'relative';

            td.addEventListener('click', handleTileClick);

            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    container.appendChild(table);
}

/**
 * Renders the character tokens on the grid, now including an HP bar.
 */
function renderCharacters() {
    const container = _main.querySelector('.battle-grid-container');
    if (!container) return;
    container.querySelectorAll('.character-token').forEach(token => token.remove());

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

        // ✅ ADDED: Render a simple HP bar
        if (char.current_hp !== undefined && char.max_hp !== undefined) {
            const hpBar = document.createElement('div');
            hpBar.className = 'character-hp-bar';
            const hpPercentage = Math.round((char.current_hp / char.max_hp) * 100);
            hpBar.style.width = '90%';
            hpBar.style.height = '5px';
            hpBar.style.backgroundColor = '#ccc';
            hpBar.style.border = '1px solid black';
            hpBar.style.position = 'absolute';
            hpBar.style.bottom = '2px';
            hpBar.style.left = '5%';
            hpBar.style.zIndex = '20';
            hpBar.innerHTML = `<div style="width: ${hpPercentage}%; height: 100%; background-color: #4CAF50;"></div>`;
            charEl.appendChild(hpBar);
        }

        cell.appendChild(charEl);
    });
}

function handleTileClick(event) {
    const clickedTileEl = event.currentTarget;
    const targetX = parseInt(clickedTileEl.dataset.x);
    const targetY = parseInt(clickedTileEl.dataset.y);
    const charInCell = _characters.find(c => Array.isArray(c.position) && c.position[0] === targetX && c.position[1] === targetY);

    if (charInCell) {
        unhighlightAllTiles();
        if (_selectedCharacterEl) {
            _selectedCharacterEl.classList.remove('character-selected');
        }
        if (charInCell.isPlayerControlled) {
            const el = clickedTileEl.querySelector('.character-token');
            if (el) {
                el.classList.add('character-selected');
                _selectedCharacterEl = el;
                _selectedPlayerCharacter = charInCell;
                highlightWalkableTiles(_selectedPlayerCharacter);
            }
        } else {
            _selectedPlayerCharacter = null;
            _selectedCharacterEl = null;
            unhighlightAllTiles();
        }
        showEntityInfo(charInCell);
    } else {
        if (_selectedPlayerCharacter && clickedTileEl.classList.contains('highlight-walkable')) {
            attemptMoveCharacter(_selectedPlayerCharacter, targetX, targetY);
        } else {
            unhighlightAllTiles();
            if (_selectedCharacterEl) {
                _selectedCharacterEl.classList.remove('character-selected');
                _selectedCharacterEl = null;
            }
            _selectedPlayerCharacter = null;
            showEntityInfo({ tile: _tileMap[clickedTileEl.className.split(' ').find(cls => cls.startsWith('tile-')).replace('tile-', '')] });
        }
    }
}

function highlightWalkableTiles(character) {
    unhighlightAllTiles();
    if (!character || !Array.isArray(character.position) || character.has_moved) return;

    const [charX, charY] = character.position;
    const container = _main.querySelector('.battle-grid-container');
    const offsets = [
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
    ];

    offsets.forEach(offset => {
        const newX = charX + offset.dx;
        const newY = charY + offset.dy;
        if (newX >= 0 && newX < 7 && newY >= 0 && newY < 7) {
            const tileEl = container.querySelector(`td[data-x="${newX}"][data-y="${newY}"]`);
            if (tileEl && tileEl.dataset.walkable === 'true') {
                const isOccupied = _characters.some(c => Array.isArray(c.position) && c.position[0] === newX && c.position[1] === newY);
                if (!isOccupied) {
                    tileEl.classList.add('highlight-walkable');
                    highlightedTiles.push(tileEl);
                }
            }
        }
    });
}

function unhighlightAllTiles() {
    highlightedTiles.forEach(tileEl => {
        tileEl.classList.remove('highlight-walkable');
    });
    highlightedTiles = [];
}

async function attemptMoveCharacter(character, targetX, targetY) {
    const characterId = character.id;
    const startX = character.position[0];
    const startY = character.position[1];

    const distanceX = Math.abs(targetX - startX);
    const distanceY = Math.abs(targetY - startY);
    const chebyshevDistance = Math.max(distanceX, distanceY);
    if (chebyshevDistance !== 1 || (distanceX === 0 && distanceY === 0)) {
        displayMessage('Characters can only move 1 tile at a time to an adjacent square.');
        unhighlightAllTiles();
        return;
    }

    const targetTileEl = _main.querySelector(`td[data-x="${targetX}"][data-y="${targetY}"]`);
    if (!targetTileEl || targetTileEl.dataset.walkable !== 'true') {
        displayMessage('Cannot move to an unwalkable tile.');
        unhighlightAllTiles();
        return;
    }

    const isOccupied = _characters.some(c => Array.isArray(c.position) && c.position[0] === targetX && c.position[1] === targetY);
    if (isOccupied) {
        displayMessage('That tile is already occupied by another character.');
        unhighlightAllTiles();
        return;
    }

    try {
        const resultRes = await _apiCall('/functions/v1/move-character', 'POST', {
            battleId: _battleId,
            characterId,
            targetPosition: [targetX, targetY],
        });
        const result = await resultRes.json();

        if (result.success) {
            console.log('Move successful:', result.message);
            if (_selectedCharacterEl) {
                _selectedCharacterEl.classList.remove('character-selected');
            }
            _selectedPlayerCharacter = null;
            _selectedCharacterEl = null;
            unhighlightAllTiles();
        } else {
            displayMessage(`Move failed: ${result.message}`);
            unhighlightAllTiles();
        }
    } catch (error) {
        console.error('Error attempting to move character:', error);
        displayMessage('Network error during move. Please check your connection.');
        unhighlightAllTiles();
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

    const endTurnButton = ui.querySelectorAll('.battle-ui-row')[1].children[4];
    if (endTurnButton) {
        endTurnButton.textContent = 'End Turn';
        endTurnButton.id = 'endTurnButton';
        endTurnButton.addEventListener('click', handleEndTurn);
    }
}

async function handleEndTurn() {
    if (!_battleId) {
        displayMessage('No active battle found.');
        return;
    }

    try {
        const resultRes = await _apiCall('/functions/v1/end-turn', 'POST', {
            battleId: _battleId
        });
        const result = await resultRes.json();

        if (result.success) {
            console.log('Turn ended:', result.message);
        } else {
            displayMessage(`Failed to end turn: ${result.message}`);
        }
    } catch (error) {
        console.error('Error ending turn:', error);
        displayMessage('Network error ending turn. Please try again.');
    }
    unhighlightAllTiles();
    if (_selectedCharacterEl) {
        _selectedCharacterEl.classList.remove('character-selected');
        _selectedCharacterEl = null;
    }
    _selectedPlayerCharacter = null;
}

/**
 * Displays an entity's info in the panel.
 * ✅ UPDATED: Now uses `current_hp` and `max_hp` properties.
 */
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
        // ✅ UPDATED: Read HP directly from the new `current_hp` and `max_hp` properties.
        hpEl.innerHTML = `<strong>HP:</strong> ${entity.current_hp} / ${entity.max_hp}`;

        statsEl.innerHTML = `
            <strong>Vitality:</strong> ${entity.stats.vitality}<br>
            <strong>Attack:</strong> ${entity.stats.attack}<br>
            <strong>Defense:</strong> ${entity.stats.defense}
        `;

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

export function cleanup() {
    if (_unsubscribeFromBattle) {
        _supabaseClient.removeChannel(_unsubscribeFromBattle);
        _unsubscribeFromBattle = null;
    }
    _battleState = null;
    _battleId = null;
    _characters = [];
    _selectedCharacterEl = null;
    _selectedPlayerCharacter = null;
    unhighlightAllTiles();
}

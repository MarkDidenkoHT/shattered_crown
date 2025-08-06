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
let _isProcessingAITurn = false;

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

        // Subscribe to real-time updates
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
                    console.log('[REALTIME] Battle state update received:', payload.new);
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

    console.log('[BATTLE] Processing realtime update:', _battleState);

    // Map the characters_state object to an array with proper HP and stats handling
    _characters = Object.values(_battleState.characters_state).map(charState => {
        // Normalize stats object to handle case variations
        const stats = charState.stats || {};
        const normalizedStats = {};
        for (const [key, value] of Object.entries(stats)) {
            normalizedStats[key.toLowerCase()] = value;
        }

        // Get vitality for HP calculation
        const vitality = normalizedStats.vitality || 0;
        
        return {
            id: charState.id,
            name: charState.name,
            type: charState.type,
            isPlayerControlled: charState.isPlayerControlled,
            position: charState.current_position,
            stats: {
                strength: normalizedStats.strength || 0,
                vitality: vitality,
                spirit: normalizedStats.spirit || 0,
                dexterity: normalizedStats.dexterity || 0,
                intellect: normalizedStats.intellect || 0,
                armor: normalizedStats.armor || 0,
                resistance: normalizedStats.resistance || 0
            },
            spriteName: charState.sprite_name,
            has_moved: charState.has_moved,
            has_acted: charState.has_acted,
            current_hp: charState.current_hp || (vitality * 10),
            max_hp: charState.max_hp || (vitality * 10),
            priority: charState.priority || 999
        };
    });

    console.log('[BATTLE] Updated characters:', _characters);
    renderCharacters();
    
    // Handle turn management
    const currentTurn = _battleState.current_turn;
    const currentTurnIndex = _battleState.current_turn_index || 0;
    const turnOrder = _battleState.turn_order || [];
    
    console.log(`[BATTLE] Current turn: ${currentTurn}, Turn index: ${currentTurnIndex}, Round: ${_battleState.round_number}`);
    
    // Update UI to show current turn
    updateTurnDisplay(currentTurn, _battleState.round_number);
    
    // Handle AI turn automatically if it's AI's turn
    if (currentTurn === 'AI' && !_isProcessingAITurn) {
        handleAITurn();
    }
    
    // Update character selection based on current turn
    updateCharacterAvailability(currentTurn);
}

/**
 * Updates the turn display in the UI
 */
function updateTurnDisplay(currentTurn, roundNumber) {
    const turnStatusEl = document.getElementById('turnStatus');
    if (turnStatusEl) {
        if (currentTurn === 'AI') {
            turnStatusEl.textContent = `AI Turn - Round ${roundNumber}`;
            turnStatusEl.style.color = '#8B4513';
        } else {
            // It's a player turn
            const playerCharacters = _characters.filter(c => c.isPlayerControlled);
            if (playerCharacters.length > 0) {
                const activePlayerChar = playerCharacters.find(c => !c.has_moved || !c.has_acted);
                const displayName = activePlayerChar ? activePlayerChar.name : 'Player';
                turnStatusEl.textContent = `${displayName}'s Turn - Round ${roundNumber}`;
                turnStatusEl.style.color = '#B8860B';
            } else {
                turnStatusEl.textContent = `Player Turn - Round ${roundNumber}`;
                turnStatusEl.style.color = '#B8860B';
            }
        }
    }
}

/**
 * Updates which characters can be selected based on current turn
 */
function updateCharacterAvailability(currentTurn) {
    const container = _main.querySelector('.battle-grid-container');
    if (!container) return;

    // Remove previous turn indicators
    container.querySelectorAll('.character-token').forEach(token => {
        token.classList.remove('current-turn', 'cannot-act');
    });

    _characters.forEach(char => {
        const charEl = container.querySelector(`.character-token[data-id="${char.id}"]`);
        if (!charEl) return;

        if (currentTurn === 'AI') {
            // During AI turn, highlight AI characters that can still act
            if (!char.isPlayerControlled && (!char.has_moved || !char.has_acted)) {
                charEl.classList.add('current-turn');
            } else {
                charEl.classList.add('cannot-act');
            }
        } else {
            // During player turn, highlight player characters that can still act
            if (char.isPlayerControlled && (!char.has_moved || !char.has_acted)) {
                charEl.classList.add('current-turn');
            } else {
                charEl.classList.add('cannot-act');
            }
        }
    });
}

/**
 * Handles automatic AI turn processing
 */
async function handleAITurn() {
    if (_isProcessingAITurn) return;
    
    _isProcessingAITurn = true;
    console.log('[AI] Processing AI turn...');
    
    try {
        // Add a small delay to make AI actions visible
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const aiTurnRes = await _apiCall('/functions/v1/ai-turn', 'POST', {
            battleId: _battleId
        });
        
        const result = await aiTurnRes.json();
        
        if (result.success) {
            console.log('[AI] AI turn completed:', result.message);
            
            if (result.skipTurn) {
                console.log('[AI] All AI characters completed, ending AI turn');
                // Automatically end turn if all AI characters are done
                setTimeout(() => handleEndTurn(), 500);
            }
        } else {
            console.error('[AI] AI turn failed:', result.message);
            displayMessage(`AI turn failed: ${result.message}`);
        }
    } catch (error) {
        console.error('[AI] Error during AI turn:', error);
        displayMessage('Error during AI turn. Please try ending the turn manually.');
    } finally {
        _isProcessingAITurn = false;
    }
}

function renderBattleScreen(mode, level, layoutData) {
    _main.innerHTML = `
        <div class="main-app-container">
            <div class="battle-top-bar">
                <p class="battle-status">${mode.toUpperCase()} — Level ${level}</p>
                <p id="turnStatus">Turn: —</p>
                <div class="battle-controls">
                    <button id="endTurnButton" class="fantasy-button small-btn">End Turn</button>
                    <button id="refreshButton" class="fantasy-button small-btn">Refresh</button>
                </div>
            </div>
            <div class="battle-grid-container"></div>
            <div class="battle-info-panel" id="entityInfoPanel">
                <img id="infoPortrait" src="assets/art/sprites/placeholder.png" />
                <div class="info-text">
                    <h3 id="infoName">—</h3>
                    <div id="infoHP"></div>
                    <div id="infoStats"></div>
                </div>
            </div>
            <div class="battle-bottom-ui"></div>
        </div>
    `;

    renderBattleGrid(layoutData.layout);
    renderCharacters();
    renderBottomUI();
    createParticles();
    
    // Add event listeners for new buttons
    const endTurnBtn = document.getElementById('endTurnButton');
    const refreshBtn = document.getElementById('refreshButton');
    
    if (endTurnBtn) {
        endTurnBtn.addEventListener('click', handleEndTurn);
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefresh);
    }
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
            td.style.boxSizing = 'border-box';

            td.addEventListener('click', handleTileClick);

            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    container.appendChild(table);
}

/**
 * Renders the character tokens on the grid, including HP bars and turn indicators.
 */
function renderCharacters() {
    const container = _main.querySelector('.battle-grid-container');
    if (!container) return;
    
    // Remove existing character tokens
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
        charEl.title = `${char.name} (${char.current_hp}/${char.max_hp} HP)`;
        charEl.style.position = 'absolute';
        charEl.style.top = '0';
        charEl.style.left = '0';
        charEl.style.width = '100%';
        charEl.style.height = '100%';
        charEl.style.zIndex = '5';
        charEl.style.boxSizing = 'border-box';

        // Character sprite
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

        // HP bar
        if (char.current_hp !== undefined && char.max_hp !== undefined && char.max_hp > 0) {
            const hpBar = document.createElement('div');
            hpBar.className = 'character-hp-bar';
            const hpPercentage = Math.max(0, Math.min(100, Math.round((char.current_hp / char.max_hp) * 100)));
            
            // Color based on HP percentage
            let hpColor = '#4CAF50'; // Green
            if (hpPercentage <= 25) hpColor = '#F44336'; // Red
            else if (hpPercentage <= 50) hpColor = '#FF9800'; // Orange
            else if (hpPercentage <= 75) hpColor = '#FFC107'; // Yellow
            
            hpBar.style.width = '90%';
            hpBar.style.height = '6px';
            hpBar.style.backgroundColor = '#333';
            hpBar.style.border = '1px solid #666';
            hpBar.style.borderRadius = '2px';
            hpBar.style.position = 'absolute';
            hpBar.style.bottom = '2px';
            hpBar.style.left = '5%';
            hpBar.style.zIndex = '20';
            hpBar.innerHTML = `<div style="width: ${hpPercentage}%; height: 100%; background-color: ${hpColor}; border-radius: 1px; transition: width 0.3s ease, background-color 0.3s ease;"></div>`;
            charEl.appendChild(hpBar);
        }

        // Turn status indicator
        if (char.has_moved && char.has_acted) {
            const doneIndicator = document.createElement('div');
            doneIndicator.className = 'turn-done-indicator';
            doneIndicator.style.position = 'absolute';
            doneIndicator.style.top = '2px';
            doneIndicator.style.right = '2px';
            doneIndicator.style.width = '8px';
            doneIndicator.style.height = '8px';
            doneIndicator.style.backgroundColor = '#666';
            doneIndicator.style.borderRadius = '50%';
            doneIndicator.style.zIndex = '25';
            doneIndicator.title = 'Turn completed';
            charEl.appendChild(doneIndicator);
        }

        cell.appendChild(charEl);
    });
}

function handleTileClick(event) {
    const clickedTileEl = event.currentTarget;
    const targetX = parseInt(clickedTileEl.dataset.x);
    const targetY = parseInt(clickedTileEl.dataset.y);
    const charInCell = _characters.find(c => Array.isArray(c.position) && c.position[0] === targetX && c.position[1] === targetY);

    // Don't allow interactions during AI turn
    if (_battleState?.current_turn === 'AI') {
        displayMessage('Please wait for AI turn to complete.');
        return;
    }

    if (charInCell) {
        unhighlightAllTiles();
        if (_selectedCharacterEl) {
            _selectedCharacterEl.classList.remove('character-selected');
        }
        
        // Only allow selection of player characters that can still act
        if (charInCell.isPlayerControlled && (!charInCell.has_moved || !charInCell.has_acted)) {
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
        // Handle movement attempt
        if (_selectedPlayerCharacter && clickedTileEl.classList.contains('highlight-walkable')) {
            attemptMoveCharacter(_selectedPlayerCharacter, targetX, targetY);
        } else {
            // Deselect and show tile info
            unhighlightAllTiles();
            if (_selectedCharacterEl) {
                _selectedCharacterEl.classList.remove('character-selected');
                _selectedCharacterEl = null;
            }
            _selectedPlayerCharacter = null;
            
            // Show tile information
            const tileName = clickedTileEl.className.split(' ').find(cls => cls.startsWith('tile-'));
            const tileKey = tileName ? tileName.replace('tile-', '') : 'plain';
            const tileData = _tileMap[tileKey];
            showEntityInfo({ tile: tileData || { name: 'Unknown', walkable: false, vision_block: false, art: 'placeholder' } });
        }
    }
}

function highlightWalkableTiles(character) {
    unhighlightAllTiles();
    if (!character || !Array.isArray(character.position) || character.has_moved) return;

    const [charX, charY] = character.position;
    const container = _main.querySelector('.battle-grid-container');
    
    // 8-directional movement offsets (Chebyshev distance = 1)
    const offsets = [
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
    ];

    offsets.forEach(offset => {
        const newX = charX + offset.dx;
        const newY = charY + offset.dy;
        
        // Check bounds
        if (newX >= 0 && newX < 7 && newY >= 0 && newY < 7) {
            const tileEl = container.querySelector(`td[data-x="${newX}"][data-y="${newY}"]`);
            if (tileEl && tileEl.dataset.walkable === 'true') {
                // Check if tile is occupied
                const isOccupied = _characters.some(c => 
                    Array.isArray(c.position) && c.position[0] === newX && c.position[1] === newY
                );
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

    // Validate movement distance (Chebyshev distance = 1)
    const distanceX = Math.abs(targetX - startX);
    const distanceY = Math.abs(targetY - startY);
    const chebyshevDistance = Math.max(distanceX, distanceY);
    
    if (chebyshevDistance !== 1 || (distanceX === 0 && distanceY === 0)) {
        displayMessage('Characters can only move 1 tile at a time to an adjacent square.');
        unhighlightAllTiles();
        return;
    }

    // Validate target tile
    const targetTileEl = _main.querySelector(`td[data-x="${targetX}"][data-y="${targetY}"]`);
    if (!targetTileEl || targetTileEl.dataset.walkable !== 'true') {
        displayMessage('Cannot move to an unwalkable tile.');
        unhighlightAllTiles();
        return;
    }

    // Check for occupancy
    const isOccupied = _characters.some(c => 
        Array.isArray(c.position) && c.position[0] === targetX && c.position[1] === targetY
    );
    if (isOccupied) {
        displayMessage('That tile is already occupied by another character.');
        unhighlightAllTiles();
        return;
    }

    try {
        console.log(`[MOVE] Attempting to move character ${characterId} from [${startX},${startY}] to [${targetX},${targetY}]`);
        
        const resultRes = await _apiCall('/functions/v1/move-character', 'POST', {
            battleId: _battleId,
            characterId,
            currentPosition: [startX, startY],
            targetPosition: [targetX, targetY],
        });
        
        const result = await resultRes.json();

        if (result.success) {
            console.log('[MOVE] Move successful:', result.message);
            
            // Clear selection
            if (_selectedCharacterEl) {
                _selectedCharacterEl.classList.remove('character-selected');
            }
            _selectedPlayerCharacter = null;
            _selectedCharacterEl = null;
            unhighlightAllTiles();
            
            displayMessage(`${character.name} moved successfully!`);
        } else {
            console.error('[MOVE] Move failed:', result.message);
            displayMessage(`Move failed: ${result.message}`);
            unhighlightAllTiles();
        }
    } catch (error) {
        console.error('[MOVE] Error attempting to move character:', error);
        displayMessage('Network error during move. Please check your connection.');
        unhighlightAllTiles();
    }
}

function renderBottomUI() {
    const ui = _main.querySelector('.battle-bottom-ui');
    ui.innerHTML = '';

    // Create 10 buttons total: 9 placeholders + 1 End Turn
    for (let row = 0; row < 2; row++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'battle-ui-row';
        
        for (let i = 0; i < 5; i++) {
            const btnIndex = row * 5 + i;
            const btn = document.createElement('button');
            btn.className = 'fantasy-button ui-btn';
            
            if (btnIndex === 9) {
                // Last button is End Turn
                btn.textContent = 'End Turn';
                btn.id = 'endTurnButtonBottom';
                btn.disabled = false;
                btn.addEventListener('click', handleEndTurn);
            } else {
                // Placeholder buttons
                btn.textContent = `Btn ${btnIndex + 1}`;
                btn.disabled = true;
                // Placeholder for future button functionality
                // TODO: Implement button actions
            }
            
            rowDiv.appendChild(btn);
        }
        ui.appendChild(rowDiv);
    }
}

async function handleEndTurn() {
    if (!_battleId) {
        displayMessage('No active battle found.');
        return;
    }

    // Don't allow ending turn during AI processing
    if (_isProcessingAITurn) {
        displayMessage('Please wait for AI turn to complete.');
        return;
    }

    try {
        console.log('[TURN] Attempting to end turn...');
        
        const resultRes = await _apiCall('/functions/v1/end-turn', 'POST', {
            battleId: _battleId
        });
        
        const result = await resultRes.json();

        if (result.success) {
            console.log('[TURN] Turn ended successfully:', result.message);
            
            // Clear any selections
            unhighlightAllTiles();
            if (_selectedCharacterEl) {
                _selectedCharacterEl.classList.remove('character-selected');
                _selectedCharacterEl = null;
            }
            _selectedPlayerCharacter = null;
            
        } else {
            console.error('[TURN] Failed to end turn:', result.message);
            displayMessage(`Failed to end turn: ${result.message}`);
        }
    } catch (error) {
        console.error('[TURN] Error ending turn:', error);
        displayMessage('Network error ending turn. Please try again.');
    }
}

async function handleRefresh() {
    try {
        console.log('[REFRESH] Refreshing battle state...');
        
        const supabase = getSupabaseClient(_main.supabaseConfig);
        const { data: battleState, error } = await supabase
            .from('battle_state')
            .select('*')
            .eq('id', _battleId)
            .single();
            
        if (error) {
            throw error;
        }
        
        _battleState = battleState;
        updateGameStateFromRealtime();
        
        displayMessage('Battle state refreshed successfully.');
    } catch (error) {
        console.error('[REFRESH] Error refreshing battle state:', error);
        displayMessage('Failed to refresh battle state.');
    }
}

function showEntityInfo(entity) {
    const portrait = document.getElementById('infoPortrait');
    const nameEl = document.getElementById('infoName');
    const hpEl = document.getElementById('infoHP');
    const statsEl = document.getElementById('infoStats');

    if (!entity) {
        nameEl.textContent = '—';
        hpEl.textContent = '';
        statsEl.innerHTML = '';
        portrait.src = 'assets/art/sprites/placeholder.png';
        return;
    }

    nameEl.textContent = entity.name || 'Unnamed';

    if (entity.type === 'player' || entity.type === 'enemy') {
        // Display current HP status with visual indicators
        const currentHp = entity.current_hp || 0;
        const maxHp = entity.max_hp || 0;
        const hpPercentage = maxHp > 0 ? Math.round((currentHp / maxHp) * 100) : 0;
        
        let hpColor = '#4CAF50'; // Green
        if (hpPercentage <= 25) hpColor = '#F44336'; // Red
        else if (hpPercentage <= 50) hpColor = '#FF9800'; // Orange
        else if (hpPercentage <= 75) hpColor = '#FFC107'; // Yellow
        
        // Add turn status to HP display
        let turnStatus = '';
        if (entity.has_moved && entity.has_acted) {
            turnStatus = ' <span style="color: #888; font-size: 11px;">(Turn Complete)</span>';
        } else if (entity.has_moved) {
            turnStatus = ' <span style="color: #FFB74D; font-size: 11px;">(Moved)</span>';
        } else if (entity.has_acted) {
            turnStatus = ' <span style="color: #81C784; font-size: 11px;">(Acted)</span>';
        }
        
        hpEl.innerHTML = `<strong>HP:</strong> <span style="color: ${hpColor}">${currentHp} / ${maxHp}</span> (${hpPercentage}%)${turnStatus}`;

        // Extract and display stats in a clean layout
        const stats = entity.stats || {};
        const strength = stats.strength || 0;
        const dexterity = stats.dexterity || 0;
        const vitality = stats.vitality || 0;
        const spirit = stats.spirit || 0;
        const intellect = stats.intellect || 0;
        const armor = stats.armor || 0;
        const resistance = stats.resistance || 0;

        // Create two-column stats display
        const statsCol1 = [
            { label: 'STR', value: strength, color: '#D4AF37' },
            { label: 'DEX', value: dexterity, color: '#B8860B' },
            { label: 'VIT', value: vitality, color: '#CD853F' },
            { label: 'SPR', value: spirit, color: '#DAA520' }
        ];
        const statsCol2 = [
            { label: 'INT', value: intellect, color: '#F4A460' },
            { label: 'ARM', value: armor, color: '#8B7355' },
            { label: 'RES', value: resistance, color: '#A0522D' },
            { label: 'PRI', value: entity.priority || 999, color: '#8B4513' }
        ];

        statsEl.innerHTML = `
            <div style="display: flex; gap: 15px; font-size: 11px; margin-top: 8px;">
                <div style="flex: 1;">
                    ${statsCol1.map(stat => `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: ${stat.color}; font-weight: bold;">${stat.label}:</span>
                            <span>${stat.value}</span>
                        </div>
                    `).join('')}
                </div>
                <div style="flex: 1;">
                    ${statsCol2.map(stat => `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: ${stat.color}; font-weight: bold;">${stat.label}:</span>
                            <span>${stat.value}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Placeholder for abilities from characters table
        // TODO: Load abilities from database

        // Set character portrait
        const spritePath = `assets/art/sprites/${entity.spriteName || 'placeholder'}.png`;
        portrait.src = spritePath;
        portrait.onerror = () => {
            portrait.src = 'assets/art/sprites/placeholder.png';
        };

    } else if (entity.tile) {
        // Display tile information
        hpEl.textContent = '';
        
        const tile = entity.tile;
        const walkableText = tile.walkable ? 'Yes' : 'No';
        const visionBlockText = tile.vision_block ? 'Yes' : 'No';
        
        statsEl.innerHTML = `
            <div style="font-size: 12px; margin-top: 8px;">
                <div style="margin-bottom: 4px;">
                    <strong style="color: #B8860B;">Type:</strong> ${tile.name || 'Unknown'}
                </div>
                <div style="margin-bottom: 4px;">
                    <strong style="color: #CD853F;">Walkable:</strong> 
                    <span style="color: ${tile.walkable ? '#4CAF50' : '#F44336'}">${walkableText}</span>
                </div>
                <div style="margin-bottom: 4px;">
                    <strong style="color: #D4AF37;">Blocks Vision:</strong> 
                    <span style="color: ${tile.vision_block ? '#F44336' : '#4CAF50'}">${visionBlockText}</span>
                </div>
            </div>
        `;
        
        // Set tile art
        const tilePath = `assets/art/tiles/${tile.art || 'placeholder'}.png`;
        portrait.src = tilePath;
        portrait.onerror = () => {
            portrait.src = 'assets/art/tiles/placeholder.png';
        };
    }
}

function createParticles() {
    const container = document.createElement('div');
    container.className = 'particles';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '1';
    
    _main.style.position = 'relative';
    _main.appendChild(container);

    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.position = 'absolute';
        particle.style.width = '2px';
        particle.style.height = '2px';
        particle.style.backgroundColor = '#B8860B';
        particle.style.borderRadius = '50%';
        particle.style.opacity = '0.6';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animation = `float ${(Math.random() * 3 + 4)}s ease-in-out infinite`;
        particle.style.animationDelay = Math.random() * 6 + 's';
        container.appendChild(particle);
    }
}

function displayMessage(msg, type = 'info') {
    // Remove any existing message
    const existingMessage = document.querySelector('.custom-message-box');
    if (existingMessage) {
        existingMessage.remove();
    }

    const box = document.createElement('div');
    box.className = 'custom-message-box';
    
    let bgColor = '#8B4513';
    let borderColor = '#D4AF37';
    
    if (type === 'error') {
        bgColor = '#8B2635';
        borderColor = '#CD5C5C';
    } else if (type === 'success') {
        bgColor = '#556B2F';
        borderColor = '#9ACD32';
    } else if (type === 'warning') {
        bgColor = '#B8860B';
        borderColor = '#FFD700';
    }
    
    box.style.position = 'fixed';
    box.style.top = '0';
    box.style.left = '0';
    box.style.width = '100%';
    box.style.height = '100%';
    box.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    box.style.display = 'flex';
    box.style.alignItems = 'center';
    box.style.justifyContent = 'center';
    box.style.zIndex = '1000';
    
    box.innerHTML = `
        <div class="message-content" style="
            background: ${bgColor};
            border: 2px solid ${borderColor};
            border-radius: 8px;
            padding: 20px;
            max-width: 400px;
            text-align: center;
            color: white;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        ">
            <p style="margin: 0 0 15px 0; font-size: 14px; line-height: 1.4;">${msg}</p>
            <button class="fantasy-button message-ok-btn" style="
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: white;
                padding: 8px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.3s ease;
            ">OK</button>
        </div>
    `;
    
    document.body.appendChild(box);
    
    const okBtn = box.querySelector('.message-ok-btn');
    okBtn.addEventListener('click', () => box.remove());
    okBtn.addEventListener('mouseover', () => {
        okBtn.style.background = 'rgba(255, 255, 255, 0.3)';
    });
    okBtn.addEventListener('mouseout', () => {
        okBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    
    // Auto-remove after 5 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            if (box.parentNode) {
                box.remove();
            }
        }, 5000);
    }
}

/**
 * Checks if the battle has ended (victory/defeat conditions)
 */
function checkBattleEnd() {
    if (!_characters || _characters.length === 0) return false;
    
    const playerCharacters = _characters.filter(c => c.isPlayerControlled && c.current_hp > 0);
    const enemyCharacters = _characters.filter(c => !c.isPlayerControlled && c.current_hp > 0);
    
    if (playerCharacters.length === 0) {
        // Player defeat
        displayMessage('Defeat! All your characters have fallen.', 'error');
        setTimeout(() => {
            window.gameAuth.loadModule('embark');
        }, 3000);
        return true;
    } else if (enemyCharacters.length === 0) {
        // Player victory
        displayMessage('Victory! All enemies have been defeated!', 'success');
        setTimeout(() => {
            window.gameAuth.loadModule('embark');
        }, 3000);
        return true;
    }
    
    return false;
}

/**
 * Clean up function called when module is unloaded
 */
export function cleanup() {
    console.log('[BATTLE] Cleaning up battle manager...');
    
    // Unsubscribe from real-time updates
    if (_unsubscribeFromBattle && _supabaseClient) {
        _supabaseClient.removeChannel(_unsubscribeFromBattle);
        _unsubscribeFromBattle = null;
    }
    
    // Reset all state variables
    _battleState = null;
    _battleId = null;
    _characters = [];
    _selectedCharacterEl = null;
    _selectedPlayerCharacter = null;
    _isProcessingAITurn = false;
    
    // Clear highlights
    unhighlightAllTiles();
    
    // Remove any existing messages
    const existingMessage = document.querySelector('.custom-message-box');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    console.log('[BATTLE] Cleanup completed.');
}

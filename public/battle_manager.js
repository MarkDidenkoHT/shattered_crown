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

function updateGameStateFromRealtime() {
    if (!_battleState) return;

    console.log('[BATTLE] Processing realtime update:', _battleState);

    // Map the characters_state object to an array with proper HP and stats handling
    _characters = Object.values(_battleState.characters_state).map(charState => {
        const stats = charState.stats || {};
        const normalizedStats = {};
        for (const [key, value] of Object.entries(stats)) {
            normalizedStats[key.toLowerCase()] = value;
        }

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
    
    const currentTurn = _battleState.current_turn;
    const currentTurnIndex = _battleState.current_turn_index || 0;
    
    console.log(`[BATTLE] Current turn: ${currentTurn}, Turn index: ${currentTurnIndex}, Round: ${_battleState.round_number}`);
    
    updateTurnDisplay(currentTurn, _battleState.round_number);
    
    if (currentTurn === 'AI' && !_isProcessingAITurn) {
        handleAITurn();
    }
    
    updateCharacterAvailability(currentTurn);
}

function updateTurnDisplay(currentTurn, roundNumber) {
    const turnStatusEl = document.getElementById('turnStatus');
    if (turnStatusEl) {
        if (currentTurn === 'AI') {
            turnStatusEl.textContent = `AI Turn - Round ${roundNumber}`;
            turnStatusEl.style.color = '#D2691E';
        } else {
            const playerCharacters = _characters.filter(c => c.isPlayerControlled);
            if (playerCharacters.length > 0) {
                const activePlayerChar = playerCharacters.find(c => !c.has_moved || !c.has_acted);
                const displayName = activePlayerChar ? activePlayerChar.name : 'Player';
                turnStatusEl.textContent = `${displayName}'s Turn - Round ${roundNumber}`;
                turnStatusEl.style.color = '#DAA520';
            } else {
                turnStatusEl.textContent = `Player Turn - Round ${roundNumber}`;
                turnStatusEl.style.color = '#DAA520';
            }
        }
    }
}

function updateCharacterAvailability(currentTurn) {
    const container = _main.querySelector('.battle-grid-container');
    if (!container) return;

    container.querySelectorAll('.character-token').forEach(token => {
        token.classList.remove('current-turn', 'cannot-act');
    });

    _characters.forEach(char => {
        const charEl = container.querySelector(`.character-token[data-id="${char.id}"]`);
        if (!charEl) return;

        if (currentTurn === 'AI') {
            if (!char.isPlayerControlled && (!char.has_moved || !char.has_acted)) {
                charEl.classList.add('current-turn');
            } else {
                charEl.classList.add('cannot-act');
            }
        } else {
            if (char.isPlayerControlled && (!char.has_moved || !char.has_acted)) {
                charEl.classList.add('current-turn');
            } else {
                charEl.classList.add('cannot-act');
            }
        }
    });
}

async function handleAITurn() {
    if (_isProcessingAITurn) return;
    
    _isProcessingAITurn = true;
    console.log('[AI] Processing AI turn...');
    
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const aiTurnRes = await _apiCall('/functions/v1/ai-turn', 'POST', {
            battleId: _battleId
        });
        
        const result = await aiTurnRes.json();
        
        if (result.success) {
            console.log('[AI] AI turn completed:', result.message);
            
            if (result.skipTurn) {
                console.log('[AI] All AI characters completed, ending AI turn');
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
            <div class="battle-bottom-ui">
                <div class="battle-ui-row">
                    <button id="waitButton" class="fantasy-button ui-btn">Wait</button>
                    <button id="endTurnButtonBottom" class="fantasy-button ui-btn">End Turn</button>
                </div>
            </div>
        </div>
    `;

    renderBattleGrid(layoutData.layout);
    renderCharacters();
    createParticles();
    
    const endTurnBtn = document.getElementById('endTurnButton');
    const refreshBtn = document.getElementById('refreshButton');
    const waitBtn = document.getElementById('waitButton');
    const endTurnBottomBtn = document.getElementById('endTurnButtonBottom');
    
    if (endTurnBtn) endTurnBtn.addEventListener('click', handleEndTurn);
    if (refreshBtn) refreshBtn.addEventListener('click', handleRefresh);
    if (waitBtn) waitBtn.addEventListener('click', handleWait);
    if (endTurnBottomBtn) endTurnBottomBtn.addEventListener('click', handleEndTurn);
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
    container.style.cssText = `
        width: 100%; max-width: 380px; height: 55%; max-height: 380px;
        display: flex; flex-direction: column; margin: 5px;
    `;

    const table = document.createElement('table');
    table.className = 'battle-grid-table';
    table.style.cssText = `
        border-collapse: collapse; width: 100%; height: 100%; table-layout: fixed;
    `;

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

            td.style.cssText = `
                background-image: url(assets/art/tiles/${art}.png);
                background-size: cover; background-position: center;
                width: ${100 / colCount}%; padding: 0; margin: 0;
                position: relative; box-sizing: border-box;
            `;

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
        charEl.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            box-sizing: border-box;
        `;

        // Character sprite
        const sprite = char.spriteName || 'placeholder';
        const img = document.createElement('img');
        img.src = `assets/art/sprites/${sprite}.png`;
        img.alt = char.name;
        img.addEventListener('error', () => {
            img.src = 'assets/art/sprites/placeholder.png';
        });
        img.style.cssText = `
            width: 100%; height: 100%; object-fit: contain;
            z-index: 10; position: absolute; top: 0; left: 0;
        `;

        charEl.appendChild(img);

        // HP bar
        if (char.current_hp !== undefined && char.max_hp !== undefined && char.max_hp > 0) {
            const hpBar = document.createElement('div');
            hpBar.className = 'character-hp-bar';
            const hpPercentage = Math.max(0, Math.min(100, Math.round((char.current_hp / char.max_hp) * 100)));
            
            let hpColor = '#4CAF50';
            if (hpPercentage <= 25) hpColor = '#F44336';
            else if (hpPercentage <= 50) hpColor = '#FF9800';
            else if (hpPercentage <= 75) hpColor = '#FFC107';
            
            hpBar.style.cssText = `
                width: 90%; height: 6px; background-color: #333; border: 1px solid #666;
                border-radius: 2px; position: absolute; bottom: 2px; left: 5%; z-index: 20;
            `;
            hpBar.innerHTML = `<div style="width: ${hpPercentage}%; height: 100%; background-color: ${hpColor}; border-radius: 1px; transition: width 0.3s ease, background-color 0.3s ease;"></div>`;
            charEl.appendChild(hpBar);
        }

        // Turn status indicator
        if (char.has_moved && char.has_acted) {
            const doneIndicator = document.createElement('div');
            doneIndicator.className = 'turn-done-indicator';
            doneIndicator.style.cssText = `
                position: absolute; top: 2px; right: 2px; width: 8px; height: 8px;
                background-color: #666; border-radius: 50%; z-index: 25;
            `;
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

    if (_battleState?.current_turn === 'AI') {
        displayMessage('Please wait for AI turn to complete.');
        return;
    }

    if (charInCell) {
        unhighlightAllTiles();
        if (_selectedCharacterEl) {
            _selectedCharacterEl.classList.remove('character-selected');
        }
        
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
        if (_selectedPlayerCharacter && clickedTileEl.classList.contains('highlight-walkable')) {
            attemptMoveCharacter(_selectedPlayerCharacter, targetX, targetY);
        } else {
            unhighlightAllTiles();
            if (_selectedCharacterEl) {
                _selectedCharacterEl.classList.remove('character-selected');
                _selectedCharacterEl = null;
            }
            _selectedPlayerCharacter = null;
            
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

async function handleEndTurn() {
    if (!_battleId || _isProcessingAITurn) {
        displayMessage(_isProcessingAITurn ? 'Please wait for AI turn to complete.' : 'No active battle found.');
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

async function handleWait() {
    if (_selectedPlayerCharacter) {
        displayMessage(`${_selectedPlayerCharacter.name} is waiting.`);
    } else {
        displayMessage('Select a character first.');
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
            
        if (error) throw error;
        
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
        const currentHp = entity.current_hp || 0;
        const maxHp = entity.max_hp || 0;
        const hpPercentage = maxHp > 0 ? Math.round((currentHp / maxHp) * 100) : 0;
        
        let hpColor = '#4CAF50';
        if (hpPercentage <= 25) hpColor = '#F44336';
        else if (hpPercentage <= 50) hpColor = '#FF9800';
        else if (hpPercentage <= 75) hpColor = '#FFC107';
        
        let turnStatus = '';
        if (entity.has_moved && entity.has_acted) {
            turnStatus = ' <span style="color: #888; font-size: 11px;">(Turn Complete)</span>';
        } else if (entity.has_moved) {
            turnStatus = ' <span style="color: #FFB74D; font-size: 11px;">(Moved)</span>';
        } else if (entity.has_acted) {
            turnStatus = ' <span style="color: #81C784; font-size: 11px;">(Acted)</span>';
        }
        
        hpEl.innerHTML = `<strong>HP:</strong> <span style="color: ${hpColor}">${currentHp} / ${maxHp}</span> (${hpPercentage}%)${turnStatus}`;

        const stats = entity.stats || {};
        
        const statsDisplay = [
            { label: 'STR', value: stats.strength || 0, color: '#D2691E' },
            { label: 'DEX', value: stats.dexterity || 0, color: '#DAA520' },
            { label: 'VIT', value: stats.vitality || 0, color: '#B8860B' },
            { label: 'SPR', value: stats.spirit || 0, color: '#CD853F' },
            { label: 'INT', value: stats.intellect || 0, color: '#DEB887' },
            { label: 'ARM', value: stats.armor || 0, color: '#D2B48C' },
            { label: 'RES', value: stats.resistance || 0, color: '#F4A460' },
            { label: 'PRI', value: entity.priority || 999, color: '#BC8F8F' }
        ];

        const col1 = statsDisplay.slice(0, 4);
        const col2 = statsDisplay.slice(4);

        statsEl.innerHTML = `
            <div style="display: flex; gap: 15px; font-size: 11px; margin-top: 8px;">
                <div style="flex: 1;">
                    ${col1.map(stat => `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: ${stat.color}; font-weight: bold;">${stat.label}:</span>
                            <span>${stat.value}</span>
                        </div>
                    `).join('')}
                </div>
                <div style="flex: 1;">
                    ${col2.map(stat => `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: ${stat.color}; font-weight: bold;">${stat.label}:</span>
                            <span>${stat.value}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Set character portrait
        const spritePath = `assets/art/sprites/${entity.spriteName || 'placeholder'}.png`;
        portrait.src = spritePath;
        portrait.onerror = () => {
            portrait.src = 'assets/art/sprites/placeholder.png';
        };

    } else if (entity.tile) {
        hpEl.textContent = '';
        
        const tile = entity.tile;
        const walkableText = tile.walkable ? 'Yes' : 'No';
        const visionBlockText = tile.vision_block ? 'Yes' : 'No';
        
        statsEl.innerHTML = `
            <div style="font-size: 12px; margin-top: 8px;">
                <div style="margin-bottom: 4px;">
                    <strong style="color: #DAA520;">Type:</strong> ${tile.name || 'Unknown'}
                </div>
                <div style="margin-bottom: 4px;">
                    <strong style="color: #B8860B;">Walkable:</strong> 
                    <span style="color: ${tile.walkable ? '#4CAF50' : '#F44336'}">${walkableText}</span>
                </div>
                <div style="margin-bottom: 4px;">
                    <strong style="color: #D2691E;">Blocks Vision:</strong> 
                    <span style="color: ${tile.vision_block ? '#F44336' : '#4CAF50'}">${visionBlockText}</span>
                </div>
            </div>
        `;
        
        const tilePath = `assets/art/tiles/${tile.art || 'placeholder'}.png`;
        portrait.src = tilePath;
        portrait.onerror = () => {
            portrait.src = 'assets/art/tiles/placeholder.png';
        };
    }
}

// Placeholder function to get abilities from characters table
async function getCharacterAbilities(characterId) {
    try {
        const abilitiesRes = await _apiCall(`/api/supabase/rest/v1/characters?select=abilities&id=eq.${characterId}`);
        const data = await abilitiesRes.json();
        return data?.[0]?.abilities || [];
    } catch (error) {
        console.warn('[ABILITIES] Could not fetch character abilities:', error);
        return [];
    }
}

function createParticles() {
    const container = document.createElement('div');
    container.className = 'particles';
    container.style.cssText = `
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 1;
    `;
    
    _main.style.position = 'relative';
    _main.appendChild(container);

    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: absolute; width: 2px; height: 2px; background-color: #DAA520;
            border-radius: 50%; opacity: 0.6; left: ${Math.random() * 100}%; top: ${Math.random() * 100}%;
            animation: float ${(Math.random() * 3 + 4)}s ease-in-out infinite;
            animation-delay: ${Math.random() * 6}s;
        `;
        container.appendChild(particle);
    }
}

function displayMessage(msg, type = 'info') {
    const existingMessage = document.querySelector('.custom-message-box');
    if (existingMessage) existingMessage.remove();

    const box = document.createElement('div');
    box.className = 'custom-message-box';
    
    let bgColor = '#8B4513';
    let borderColor = '#DAA520';
    
    if (type === 'error') {
        bgColor = '#A0522D';
        borderColor = '#D2691E';
    } else if (type === 'success') {
        bgColor = '#6B8E23';
        borderColor = '#9ACD32';
    } else if (type === 'warning') {
        bgColor = '#B8860B';
        borderColor = '#FFD700';
    }
    
    box.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.7); display: flex;
        align-items: center; justify-content: center; z-index: 1000;
    `;
    
    box.innerHTML = `
        <div class="message-content" style="
            background: ${bgColor}; border: 2px solid ${borderColor};
            border-radius: 8px; padding: 20px; max-width: 400px;
            text-align: center; color: white; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        ">
            <p style="margin: 0 0 15px 0; font-size: 14px; line-height: 1.4;">${msg}</p>
            <button class="fantasy-button message-ok-btn" style="
                background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3);
                color: white; padding: 8px 20px; border-radius: 4px; cursor: pointer;
                font-size: 12px; transition: background 0.3s ease;
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
    
    if (type !== 'error') {
        setTimeout(() => {
            if (box.parentNode) box.remove();
        }, 5000);
    }
}

export function cleanup() {
    console.log('[BATTLE] Cleaning up battle manager...');
    
    if (_unsubscribeFromBattle && _supabaseClient) {
        _supabaseClient.removeChannel(_unsubscribeFromBattle);
        _unsubscribeFromBattle = null;
    }
    
    _battleState = null;
    _battleId = null;
    _characters = [];
    _selectedCharacterEl = null;
    _selectedPlayerCharacter = null;
    _isProcessingAITurn = false;
    
    unhighlightAllTiles();
    
    const existingMessage = document.querySelector('.custom-message-box');
    if (existingMessage) existingMessage.remove();
    
    console.log('[BATTLE] Cleanup completed.');
}

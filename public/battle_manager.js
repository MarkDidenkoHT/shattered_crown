import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.0';

let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _tileMap = {};
let _characters = [];
let _selectedCharacterEl = null;
let _selectedPlayerCharacter = null;
let _currentTurnCharacter = null; // Track the active character for this turn
let highlightedTiles = [];

let _supabaseClient = null;
let _battleState = null;
let _battleId = null;
let _realtimeChannel = null;
let _isProcessingTurn = false; // Generic turn processing flag

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
        auth: { flowType: 'pkce' },
        realtime: {
            params: {
                eventsPerSecond: 10
            }
        }
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
        
        // Clean up any existing realtime subscription
        if (_realtimeChannel) {
            await supabase.removeChannel(_realtimeChannel);
            _realtimeChannel = null;
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

        // Set up enhanced realtime subscription
        await setupRealtimeSubscription(supabase);

    } catch (err) {
        console.error('Error during battle initialization:', err);
        displayMessage('Failed to start battle. Returning to embark.');
        window.gameAuth.loadModule('embark');
        return;
    }

    renderBattleScreen(selectedMode, areaLevel, _battleState.layout_data);
    updateGameStateFromRealtime();
}

async function setupRealtimeSubscription(supabase) {
    const channelName = `battle_state:${_battleId}`;
    console.log(`[REALTIME] Setting up subscription for channel: ${channelName}`);
    
    _realtimeChannel = supabase
        .channel(channelName)
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
        .on('system', {}, (status, err) => {
            console.log(`[REALTIME] System status: ${status}`);
            updateConnectionStatus(status);
            if (err) {
                console.error('[REALTIME] System error:', err);
            }
        })
        .subscribe(async (status, err) => {
            updateConnectionStatus(status);
            if (status === 'SUBSCRIBED') {
                console.log('[REALTIME] Successfully subscribed to battle updates');
            } else if (status === 'CHANNEL_ERROR') {
                console.error('[REALTIME] Channel error:', err);
                displayMessage('Lost connection to battle. Attempting to reconnect...', 'warning');
                // Attempt to resubscribe after a short delay
                setTimeout(async () => {
                    if (_battleId && _realtimeChannel) {
                        console.log('[REALTIME] Attempting to resubscribe...');
                        await supabase.removeChannel(_realtimeChannel);
                        await setupRealtimeSubscription(supabase);
                    }
                }, 2000);
            } else if (status === 'TIMED_OUT') {
                console.warn('[REALTIME] Subscription timed out');
                displayMessage('Connection timeout. Battle state may be out of sync.', 'warning');
            } else if (status === 'CLOSED') {
                console.log('[REALTIME] Channel closed');
            }
        });
}

function updateGameStateFromRealtime() {
    if (!_battleState) return;

    console.log('[BATTLE] Processing realtime update:', _battleState);

    // Check if battle has ended
    if (_battleState.battle_ended) {
        handleBattleEnd(_battleState.battle_result);
        return;
    }

    // Map the characters_state object to an array with proper HP and stats handling
    _characters = Object.values(_battleState.characters_state).map(charState => {
        // Normalize stats object to handle case variations
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
            originalPosition: charState.current_position,
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
            priority: charState.priority || 999,
            pendingAction: null
        };
    });

    console.log('[BATTLE] Updated characters:', _characters);
    renderCharacters();
    
    // Handle turn management
    const currentTurn = _battleState.current_turn;
    const currentTurnIndex = _battleState.current_turn_index || 0;
    const roundNumber = _battleState.round_number || 1;
    
    console.log(`[BATTLE] Current turn: ${currentTurn}, Turn index: ${currentTurnIndex}, Round: ${roundNumber}`);
    
    // Update UI to show current turn
    updateTurnDisplay(currentTurn, roundNumber);
    
    // Set the current turn character for player turns
    if (currentTurn !== 'AI') {
        const availablePlayerChars = _characters.filter(c => 
            c.isPlayerControlled && (!c.has_moved || !c.has_acted) && c.current_hp > 0
        );
        _currentTurnCharacter = availablePlayerChars[0] || null;
        
        // Auto-select the first available character
        if (_currentTurnCharacter && !_selectedPlayerCharacter) {
            selectCharacter(_currentTurnCharacter);
        }
    } else {
        _currentTurnCharacter = null;
        // Clear any player selections during AI turn
        clearCharacterSelection();
        
        // Trigger AI turn processing if not already processing
        if (!_isProcessingTurn) {
            triggerAITurn();
        }
    }
    
    // Update character availability based on current turn
    updateCharacterAvailability(currentTurn);
    
    // Check for battle end conditions
    if (!_battleState.battle_ended) {
        checkBattleEnd();
    }

    // Reset processing flag when it's no longer AI turn
    if (currentTurn !== 'AI') {
        _isProcessingTurn = false;
    }
}

function selectCharacter(character) {
    clearCharacterSelection();
    
    if (character && character.isPlayerControlled && (!character.has_moved || !character.has_acted) && character.current_hp > 0) {
        _selectedPlayerCharacter = character;
        _currentTurnCharacter = character;
        
        // Find and highlight the character element
        const container = _main.querySelector('.battle-grid-container');
        if (container && character.position) {
            const [x, y] = character.position;
            const cell = container.querySelector(`td[data-x="${x}"][data-y="${y}"]`);
            if (cell) {
                const charEl = cell.querySelector('.character-token');
                if (charEl) {
                    charEl.classList.add('character-selected');
                    _selectedCharacterEl = charEl;
                }
            }
        }
        
        highlightWalkableTiles(character);
        showEntityInfo(character);
    }
}

function clearCharacterSelection() {
    if (_selectedCharacterEl) {
        _selectedCharacterEl.classList.remove('character-selected');
        _selectedCharacterEl = null;
    }
    _selectedPlayerCharacter = null;
    unhighlightAllTiles();
}

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

async function triggerAITurn() {
    if (_isProcessingTurn) return;
    
    _isProcessingTurn = true;
    console.log('[AI] Triggering AI turn processing...');
    
    try {
        // Add a small delay to make the turn transition visible
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get the first AI character that hasn't completed their turn
        const aiCharacters = _characters.filter(c => 
            !c.isPlayerControlled && (!c.has_moved || !c.has_acted) && c.current_hp > 0
        );
        
        if (aiCharacters.length === 0) {
            console.log('[AI] No AI characters available to act');
            return;
        }
        
        // Sort by priority and take the first one
        aiCharacters.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        const aiCharacter = aiCharacters[0];
        
        console.log(`[AI] Processing turn for AI character: ${aiCharacter.name} (${aiCharacter.id})`);
        
        // For now, AI characters just stay in place and complete their turn
        // You can enhance this with actual AI logic later
        const aiTurnRes = await _apiCall('/functions/v1/combined-action-end', 'POST', {
            battleId: _battleId,
            characterId: aiCharacter.id,
            currentPosition: aiCharacter.position,
            targetPosition: aiCharacter.position, // Stay in place for now
            action: null // No action for now
        });
        
        const result = await aiTurnRes.json();
        
        if (result.success) {
            console.log('[AI] AI character turn completed:', result.message);
        } else {
            console.error('[AI] AI turn failed:', result.message);
            displayMessage(`AI turn failed: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('[AI] Error during AI turn:', error);
        displayMessage('Error during AI turn. The game will continue.', 'warning');
    } finally {
        // Reset processing flag after a delay to prevent rapid retries
        setTimeout(() => {
            _isProcessingTurn = false;
        }, 1000);
    }
}

function renderBattleScreen(mode, level, layoutData) {
    _main.innerHTML = `
        <div class="main-app-container">
            <div class="battle-top-bar">
                <p class="battle-status">${mode.toUpperCase()} — Level ${level}</p>
                <p id="turnStatus">Turn: —</p>
                <div class="battle-controls">
                    <div id="connectionStatus" class="connection-indicator">
                        <span class="status-dot connected"></span>
                        <span class="status-text">Connected</span>
                    </div>
                </div>
            </div>
            <div class="battle-grid-container"></div>
            <div class="battle-info-panel" id="entityInfoPanel">
                <div style="display: flex; width: 100%; height: 100%; min-height: 120px;">
                    <div style="width: 50%; min-width: 100px; min-height: 100px; display: flex; align-items: center; justify-content: center;">
                        <img id="infoPortrait" src="assets/art/sprites/placeholder.png" style="width: 100px; height: 100px; object-fit: contain; display: block;" />
                    </div>
                    <div class="info-text" style="width: 50%; padding-left: 10px; display: flex; flex-direction: column; justify-content: center;">
                        <h3 id="infoName">—</h3>
                        <div id="infoHP"></div>
                        <div id="infoStats"></div>
                    </div>
                </div>
            </div>
            <div class="battle-bottom-ui"></div>
        </div>
        
        <style>
            .connection-indicator {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: #B8860B;
            }
            
            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                transition: background-color 0.3s ease;
            }
            
            .status-dot.connected {
                background-color: #4CAF50;
            }
            
            .status-dot.disconnected {
                background-color: #F44336;
            }
            
            .status-dot.reconnecting {
                background-color: #FF9800;
                animation: pulse 1.5s infinite;
            }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.4; }
                100% { opacity: 1; }
            }
            
            .status-text {
                font-weight: 500;
            }
        </style>
    `;

    renderBattleGrid(layoutData.layout);
    renderCharacters();
    renderBottomUI();
    createParticles();
}

function updateConnectionStatus(status) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    if (!statusDot || !statusText) return;
    
    statusDot.className = 'status-dot';
    
    switch (status) {
        case 'SUBSCRIBED':
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
            break;
        case 'CHANNEL_ERROR':
        case 'TIMED_OUT':
            statusDot.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
            break;
        case 'CLOSED':
            statusDot.classList.add('disconnected');
            statusText.textContent = 'Connection Closed';
            break;
        default:
            statusDot.classList.add('reconnecting');
            statusText.textContent = 'Connecting...';
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

            // CRITICAL: Set minimum size to prevent shrinking and add placeholder
            td.style.minWidth = '50px';
            td.style.minHeight = '50px';
            td.style.width = `${100 / colCount}%`;
            td.style.height = `${100 / rowCount}%`;
            td.style.padding = '0';
            td.style.margin = '0';
            td.style.position = 'relative';
            td.style.boxSizing = 'border-box';
            td.style.border = '1px solid #666';
            
            // Add placeholder background before image loads
            td.style.backgroundColor = 'rgba(139, 69, 19, 0.1)';
            td.style.backgroundImage = `url(assets/art/tiles/${art}.png)`;
            td.style.backgroundSize = 'cover';
            td.style.backgroundPosition = 'center';
            
            // Preload the tile image to reduce CLS
            const preloadImg = new Image();
            preloadImg.onload = () => {
                td.style.backgroundColor = 'transparent';
            };
            preloadImg.onerror = () => {
                td.style.backgroundImage = `url(assets/art/tiles/placeholder.png)`;
            };
            preloadImg.src = `assets/art/tiles/${art}.png`;

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

        // Character sprite container with FIXED dimensions to prevent CLS
        const spriteContainer = document.createElement('div');
        spriteContainer.style.position = 'absolute';
        spriteContainer.style.top = '50%';
        spriteContainer.style.left = '50%';
        spriteContainer.style.transform = 'translate(-50%, -50%)';
        spriteContainer.style.width = '100%';
        spriteContainer.style.height = '100%';
        spriteContainer.style.maxWidth = '50px'; // Fixed max size
        spriteContainer.style.maxHeight = '50px'; // Fixed max size
        spriteContainer.style.minWidth = '50px'; // Prevent shrinking
        spriteContainer.style.minHeight = '50px'; // Prevent shrinking
        spriteContainer.style.display = 'flex';
        spriteContainer.style.alignItems = 'center';
        spriteContainer.style.justifyContent = 'center';
        spriteContainer.style.backgroundColor = 'rgba(139, 69, 19, 0.3)'; // Placeholder background
        spriteContainer.style.border = '1px solid #8B4513';
        spriteContainer.style.borderRadius = '4px';
        spriteContainer.style.zIndex = '10';

        const sprite = char.spriteName || 'placeholder';
        const img = document.createElement('img');
        img.src = `assets/art/sprites/${sprite}.png`;
        img.alt = char.name;
        
        // CRITICAL: Set explicit dimensions BEFORE adding to DOM
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.maxWidth = '48px'; // Slightly smaller than container
        img.style.maxHeight = '48px'; // Slightly smaller than container  
        img.style.objectFit = 'contain';
        img.style.display = 'block'; // Prevent inline spacing issues
        
        // Handle load/error without layout shift
        img.addEventListener('load', () => {
            // Image loaded successfully - remove placeholder background
            spriteContainer.style.backgroundColor = 'transparent';
            spriteContainer.style.border = 'none';
        });
        
        img.addEventListener('error', () => {
            // Keep placeholder styling and set fallback
            img.src = 'assets/art/sprites/placeholder.png';
        });

        spriteContainer.appendChild(img);
        charEl.appendChild(spriteContainer);

        // HP bar with fixed positioning
        if (char.current_hp !== undefined && char.max_hp !== undefined && char.max_hp > 0) {
            const hpBar = document.createElement('div');
            hpBar.className = 'character-hp-bar';
            const hpPercentage = Math.max(0, Math.min(100, Math.round((char.current_hp / char.max_hp) * 100)));
            
            let hpColor = '#4CAF50';
            if (hpPercentage <= 25) hpColor = '#F44336';
            else if (hpPercentage <= 50) hpColor = '#FF9800';
            else if (hpPercentage <= 75) hpColor = '#FFC107';
            
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

        // Turn status indicator with fixed positioning
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

    // Don't allow interactions during AI turn or when processing turns
    if (_battleState?.current_turn === 'AI' || _isProcessingTurn) {
        displayMessage('Please wait for AI turn to complete.');
        return;
    }

    if (charInCell) {
        // Only allow selection of player characters that can still act
        if (charInCell.isPlayerControlled && (!charInCell.has_moved || !charInCell.has_acted)) {
            selectCharacter(charInCell);
        } else {
            clearCharacterSelection();
            showEntityInfo(charInCell);
        }
    } else {
        // Handle movement attempt
        if (_selectedPlayerCharacter && clickedTileEl.classList.contains('highlight-walkable')) {
            attemptMoveCharacter(_selectedPlayerCharacter, targetX, targetY);
        } else {
            // Deselect and show tile info
            clearCharacterSelection();
            
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
                    // Change border color to green instead of adding new border
                    tileEl.style.borderColor = '#4CAF50';
                    highlightedTiles.push(tileEl);
                }
            }
        }
    });
}

function unhighlightAllTiles() {
    highlightedTiles.forEach(tileEl => {
        tileEl.classList.remove('highlight-walkable');
        // Reset border color back to grey
        tileEl.style.borderColor = '#666';
    });
    highlightedTiles = [];
}

async function attemptMoveCharacter(character, targetX, targetY) {
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

    // Update character position locally (visual update only)
    character.position = [targetX, targetY];
    renderCharacters();
    unhighlightAllTiles();
    clearCharacterSelection();

    displayMessage('Move queued. Press "End Turn" to confirm.', 'info');
}

function renderBottomUI() {
    const ui = _main.querySelector('.battle-bottom-ui');
    ui.innerHTML = '';

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
            } else {
                // Placeholder buttons
                btn.textContent = `Btn ${btnIndex + 1}`;
                btn.disabled = true;
            }

            rowDiv.appendChild(btn);
        }

        ui.appendChild(rowDiv);
    }

    // Add handler after all buttons are rendered
    const endTurnBtnBottom = document.getElementById('endTurnButtonBottom');
    if (endTurnBtnBottom) {
        endTurnBtnBottom.addEventListener('click', handleEndTurn);
    }
}

async function handleEndTurn() {
    const activeCharacter = _currentTurnCharacter;
    if (!activeCharacter) {
        console.warn('[TURN] No active character for this turn.');
        displayMessage('No character is currently active for this turn.');
        return;
    }

    // Prevent multiple simultaneous turn endings
    const endTurnBtn = document.getElementById('endTurnButtonBottom');
    if (endTurnBtn) {
        endTurnBtn.disabled = true;
        endTurnBtn.textContent = 'Processing...';
    }

    if (!_battleId || !activeCharacter.id || !Array.isArray(activeCharacter.position)) {
        console.error('[TURN] Missing required battle or character data.');
        displayMessage('Missing battle or character data.');
        resetEndTurnButton();
        return;
    }

    const characterId = activeCharacter.id;
    const currentPosition = activeCharacter.originalPosition || activeCharacter.position;
    const targetPosition = activeCharacter.position;
    const action = activeCharacter.pendingAction || null;

    console.log('[TURN] Ending turn for:', characterId, {
        from: currentPosition,
        to: targetPosition,
        action
    });

    try {
        const res = await _apiCall('/functions/v1/combined-action-end', 'POST', {
            battleId: _battleId,
            characterId,
            currentPosition,
            targetPosition,
            action
        });

        const result = await res.json();

        if (!result.success) {
            console.error('[TURN] Failed to complete action:', result.message);
            displayMessage(`Error: ${result.message}`, 'error');
            resetEndTurnButton();
            return;
        }

        console.log('[TURN] Action completed:', result.message);
        
        // Check if battle ended
        if (result.battleEnded) {
            handleBattleEnd(result.battleResult);
            return;
        }

        // Clear the current turn character and selection
        _currentTurnCharacter = null;
        clearCharacterSelection();
        
        // Show success message
        displayMessage('Turn completed successfully!', 'success');

    } catch (err) {
        console.error('[TURN] Error ending turn:', err);
        displayMessage('Error completing turn. Please try again.', 'error');
        resetEndTurnButton();
    }
}

function resetEndTurnButton() {
    const endTurnBtn = document.getElementById('endTurnButtonBottom');
    if (endTurnBtn) {
        endTurnBtn.disabled = false;
        endTurnBtn.textContent = 'End Turn';
    }
}

function handleBattleEnd(result) {
    console.log(`[BATTLE] Battle ended with result: ${result}`);
    
    // Clear any existing subscriptions
    if (_realtimeChannel && _supabaseClient) {
        _supabaseClient.removeChannel(_realtimeChannel);
        _realtimeChannel = null;
    }
    
    if (result === 'victory') {
        displayMessage('Victory! All enemies have been defeated!', 'success');
    } else if (result === 'defeat') {
        displayMessage('Defeat! All your characters have fallen.', 'error');
    } else {
        displayMessage('Battle ended.', 'info');
    }
    
    // Return to embark after a delay
    setTimeout(() => {
        window.gameAuth.loadModule('embark');
    }, 3000);
}

function showEntityInfo(entity) {
    const portrait = document.getElementById('infoPortrait');
    const nameEl = document.getElementById('infoName');
    const hpEl = document.getElementById('infoHP');
    const statsEl = document.getElementById('infoStats');

    // Set fixed dimensions for portrait container to prevent CLS
    const portraitContainer = portrait.parentElement;
    if (portraitContainer) {
        portraitContainer.style.minWidth = '100px';
        portraitContainer.style.minHeight = '100px';
    }

    if (!entity) {
        nameEl.textContent = '—';
        hpEl.textContent = '';
        statsEl.innerHTML = '';
        // Set placeholder with fixed dimensions
        portrait.style.width = '100px';
        portrait.style.height = '100px';
        portrait.style.objectFit = 'contain';
        portrait.style.display = 'block';
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

        // Set character portrait with FIXED dimensions to prevent CLS
        const spritePath = `assets/art/sprites/${entity.spriteName || 'placeholder'}.png`;
        
        // CRITICAL: Set dimensions before changing src
        portrait.style.width = '100px';
        portrait.style.height = '100px';
        portrait.style.objectFit = 'contain';
        portrait.style.display = 'block';
        portrait.style.backgroundColor = 'rgba(139, 69, 19, 0.1)'; // Subtle placeholder
        
        portrait.src = spritePath;
        portrait.onload = () => {
            portrait.style.backgroundColor = 'transparent';
        };
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
        
        // Set tile art with FIXED dimensions to prevent CLS
        const tilePath = `assets/art/tiles/${tile.art || 'placeholder'}.png`;
        
        // CRITICAL: Set dimensions before changing src
        portrait.style.width = '100px';
        portrait.style.height = '100px';
        portrait.style.objectFit = 'contain';
        portrait.style.display = 'block';
        portrait.style.backgroundColor = 'rgba(184, 134, 11, 0.1)'; // Subtle tile placeholder
        
        portrait.src = tilePath;
        portrait.onload = () => {
            portrait.style.backgroundColor = 'transparent';
        };
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

function checkBattleEnd() {
    if (!_characters || _characters.length === 0) return false;
    
    const playerCharacters = _characters.filter(c => c.isPlayerControlled && c.current_hp > 0);
    const enemyCharacters = _characters.filter(c => !c.isPlayerControlled && c.current_hp > 0);
    
    if (playerCharacters.length === 0) {
        // Player defeat
        handleBattleEnd('defeat');
        return true;
    } else if (enemyCharacters.length === 0) {
        // Player victory
        handleBattleEnd('victory');
        return true;
    }
    
    return false;
}

export function cleanup() {
    console.log('[BATTLE] Cleaning up battle manager...');
    
    // Unsubscribe from real-time updates
    if (_realtimeChannel && _supabaseClient) {
        _supabaseClient.removeChannel(_realtimeChannel);
        _realtimeChannel = null;
    }
    
    // Reset all state variables
    _battleState = null;
    _battleId = null;
    _characters = [];
    _selectedCharacterEl = null;
    _selectedPlayerCharacter = null;
    _currentTurnCharacter = null;
    _isProcessingTurn = false;
    
    // Clear highlights
    unhighlightAllTiles();
    
    // Remove any existing messages
    const existingMessage = document.querySelector('.custom-message-box');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    console.log('[BATTLE] Cleanup completed.');
}
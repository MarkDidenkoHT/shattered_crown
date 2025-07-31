let _main;
let _apiCall;
let _profile;
let _characters = [];
let _battleStateId = null;
let _currentTurnIndex = 0;
let _turnOrder = [];
let _selectedCharacter = null;
let _isPlayerTurn = false;
let _moveHighlights = [];

export async function initTurnManager(main, apiCall, profile, characters) {
    _main = main;
    _apiCall = apiCall;
    _profile = profile;
    _characters = characters;
    
    console.log('[TURN_MGR] Initializing turn manager');
    
    // Initialize battle state on server
    await initializeBattleState();
    
    // Set up UI event listeners
    setupTurnUI();
    
    // Start the first turn
    await startNextTurn();
}

async function initializeBattleState() {
    try {
        // Create turn order - players first, then enemies by priority
        const players = _characters.filter(c => c.type === 'player');
        const enemies = _characters.filter(c => c.type === 'enemy')
            .sort((a, b) => (b.priority || 0) - (a.priority || 0));
            
        _turnOrder = [...players, ...enemies];
        
        // Prepare character states for server storage
        const charactersState = {};
        _characters.forEach(char => {
            charactersState[char.id] = {
                id: char.id,
                name: char.name,
                type: char.type,
                position: char.position,
                stats: char.stats,
                spriteName: char.spriteName,
                abilities: char.abilities || [],
                priority: char.priority || 0,
                has_moved: false,
                has_acted: false,
                buffs: [],
                debuffs: [],
                cooldowns: {}
            };
        });
        
        // Create battle state on server
        const response = await _apiCall('/api/supabase/rest/v1/battle_state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                turn_order: _turnOrder.map(c => c.id),
                characters_state: charactersState,
                current_turn_index: 0
            })
        });
        
        const battleState = await response.json();
        _battleStateId = battleState[0].id;
        
        console.log('[TURN_MGR] Battle state initialized with ID:', _battleStateId);
        
    } catch (error) {
        console.error('[TURN_MGR] Failed to initialize battle state:', error);
        throw error;
    }
}

async function startNextTurn() {
    try {
        // Get current battle state from server
        const response = await _apiCall(`/api/supabase/rest/v1/battle_state?id=eq.${_battleStateId}&select=*`);
        const battleState = await response.json();
        
        if (!battleState[0]) {
            console.error('[TURN_MGR] Battle state not found');
            return;
        }
        
        const state = battleState[0];
        _currentTurnIndex = state.current_turn_index;
        const currentCharacterId = state.turn_order[_currentTurnIndex];
        const currentCharacter = _characters.find(c => c.id === currentCharacterId);
        
        if (!currentCharacter) {
            console.error('[TURN_MGR] Current character not found');
            return;
        }
        
        console.log(`[TURN_MGR] Starting turn for: ${currentCharacter.name} (${currentCharacter.type})`);
        
        // Reset movement and action flags
        await updateCharacterState(currentCharacterId, {
            has_moved: false,
            has_acted: false
        });
        
        _isPlayerTurn = currentCharacter.type === 'player';
        
        // Update UI
        updateTurnUI(currentCharacter);
        
        if (_isPlayerTurn) {
            enablePlayerTurn(currentCharacter);
        } else {
            // AI turn - for now just skip
            setTimeout(() => {
                handleAITurn(currentCharacter);
            }, 1000);
        }
        
    } catch (error) {
        console.error('[TURN_MGR] Error starting next turn:', error);
    }
}

function enablePlayerTurn(character) {
    console.log(`[TURN_MGR] Player turn: ${character.name}`);
    
    // Enable character selection
    const characterEl = document.querySelector(`[data-id="${character.id}"]`);
    if (characterEl) {
        characterEl.classList.add('turn-active');
    }
    
    // Show turn indicator
    showMessage(`${character.name}'s turn - Select character to move`);
}

async function handleAITurn(character) {
    console.log(`[TURN_MGR] AI turn: ${character.name} (skipping)`);
    
    // For now, AI just skips turn
    await updateCharacterState(character.id, {
        has_moved: true,
        has_acted: true
    });
    
    showMessage(`${character.name} skips turn`);
    
    setTimeout(() => {
        endCurrentTurn();
    }, 1500);
}

export function selectCharacter(character) {
    if (!_isPlayerTurn || character.type !== 'player') {
        return;
    }
    
    // Clear previous selection
    clearMovementHighlights();
    document.querySelectorAll('.character-token').forEach(el => {
        el.classList.remove('character-selected', 'turn-active');
    });
    
    _selectedCharacter = character;
    
    // Highlight selected character
    const characterEl = document.querySelector(`[data-id="${character.id}"]`);
    if (characterEl) {
        characterEl.classList.add('character-selected', 'turn-active');
    }
    
    // Show movement options if character hasn't moved
    if (!character.has_moved) {
        highlightMovementOptions(character);
    }
}

function highlightMovementOptions(character) {
    const [x, y] = character.position;
    const adjacentPositions = [
        [x - 1, y], [x + 1, y], // left, right
        [x, y - 1], [x, y + 1]  // up, down
    ];
    
    adjacentPositions.forEach(([newX, newY]) => {
        // Check bounds
        if (newX < 0 || newX >= 7 || newY < 0 || newY >= 7) return;
        
        // Check if position is occupied
        const occupied = _characters.some(c => 
            c.position[0] === newX && c.position[1] === newY
        );
        if (occupied) return;
        
        // Check if tile is walkable
        const cell = document.querySelector(`td[data-x="${newX}"][data-y="${newY}"]`);
        if (!cell) return;
        
        // For now, assume all tiles are walkable - we'll add tile checking later
        cell.classList.add('movement-highlight');
        _moveHighlights.push(cell);
        
        // Add click handler
        cell.addEventListener('click', () => handleMovement(newX, newY), { once: true });
    });
}

async function handleMovement(targetX, targetY) {
    if (!_selectedCharacter || !_isPlayerTurn) return;
    
    try {
        // Validate movement on server
        const response = await _apiCall('/api/battle/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                battle_state_id: _battleStateId,
                character_id: _selectedCharacter.id,
                from_position: _selectedCharacter.position,
                to_position: [targetX, targetY]
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            showMessage(`Movement failed: ${error.message}`);
            return;
        }
        
        const result = await response.json();
        
        // Update character position locally
        _selectedCharacter.position = [targetX, targetY];
        _selectedCharacter.has_moved = true;
        
        // Move character sprite
        moveCharacterSprite(_selectedCharacter.id, targetX, targetY);
        
        // Clear highlights
        clearMovementHighlights();
        
        showMessage(`${_selectedCharacter.name} moved to (${targetX}, ${targetY})`);
        
        // Check if turn should end automatically
        if (_selectedCharacter.has_moved && _selectedCharacter.has_acted) {
            setTimeout(() => endCurrentTurn(), 1000);
        }
        
    } catch (error) {
        console.error('[TURN_MGR] Movement error:', error);
        showMessage('Movement failed - please try again');
    }
}

function moveCharacterSprite(characterId, newX, newY) {
    // Remove character from old position
    const oldCharacterEl = document.querySelector(`[data-id="${characterId}"]`);
    if (oldCharacterEl) {
        oldCharacterEl.remove();
    }
    
    // Add character to new position
    const newCell = document.querySelector(`td[data-x="${newX}"][data-y="${newY}"]`);
    if (newCell) {
        const character = _characters.find(c => c.id === characterId);
        if (character) {
            const charEl = document.createElement('div');
            charEl.className = `character-token ${character.type}`;
            charEl.dataset.id = character.id;
            charEl.title = character.name;
            
            const img = document.createElement('img');
            img.src = `assets/art/sprites/${character.spriteName || 'placeholder'}.png`;
            img.alt = character.name;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            img.style.zIndex = '10';
            img.style.position = 'absolute';
            img.style.top = '0';
            img.style.left = '0';
            
            charEl.appendChild(img);
            newCell.appendChild(charEl);
        }
    }
}

function clearMovementHighlights() {
    _moveHighlights.forEach(cell => {
        cell.classList.remove('movement-highlight');
    });
    _moveHighlights = [];
}

export async function endTurn() {
    if (!_isPlayerTurn || !_selectedCharacter) return;
    
    // Mark character as having acted
    await updateCharacterState(_selectedCharacter.id, {
        has_acted: true,
        has_moved: true // Force end turn
    });
    
    endCurrentTurn();
}

async function endCurrentTurn() {
    try {
        // Clear UI state
        clearMovementHighlights();
        document.querySelectorAll('.character-token').forEach(el => {
            el.classList.remove('character-selected', 'turn-active');
        });
        
        _selectedCharacter = null;
        _isPlayerTurn = false;
        
        // Calculate next turn index
        let nextTurnIndex = (_currentTurnIndex + 1) % _turnOrder.length;
        
        // Check if round is complete (all characters have had a turn)
        if (nextTurnIndex === 0) {
            console.log('[TURN_MGR] Round complete');
            showMessage('Round complete - starting new round');
        }
        
        // Update battle state on server
        await _apiCall(`/api/supabase/rest/v1/battle_state?id=eq.${_battleStateId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_turn_index: nextTurnIndex
            })
        });
        
        // Start next turn after a brief delay
        setTimeout(() => {
            startNextTurn();
        }, 1000);
        
    } catch (error) {
        console.error('[TURN_MGR] Error ending turn:', error);
    }
}

async function updateCharacterState(characterId, updates) {
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/battle_state?id=eq.${_battleStateId}&select=characters_state`);
        const battleState = await response.json();
        
        if (battleState[0]) {
            const charactersState = battleState[0].characters_state;
            charactersState[characterId] = { ...charactersState[characterId], ...updates };
            
            await _apiCall(`/api/supabase/rest/v1/battle_state?id=eq.${_battleStateId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characters_state: charactersState
                })
            });
        }
    } catch (error) {
        console.error('[TURN_MGR] Error updating character state:', error);
    }
}

function setupTurnUI() {
    // Modify the 10th button (index 9) to be "End Turn"
    const buttons = document.querySelectorAll('.ui-btn');
    if (buttons[9]) {
        buttons[9].textContent = 'End Turn';
        buttons[9].addEventListener('click', endTurn);
    }
}

function updateTurnUI(currentCharacter) {
    // Update battle status
    const statusEl = document.querySelector('.battle-status');
    if (statusEl) {
        const turnType = currentCharacter.type === 'player' ? 'YOUR TURN' : 'ENEMY TURN';
        statusEl.textContent = `${statusEl.textContent.split(' — ')[0]} — ${turnType} - ${currentCharacter.name}`;
    }
}

function showMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'turn-message';
    messageEl.textContent = message;
    messageEl.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 15px 25px;
        border-radius: 5px;
        z-index: 1000;
        font-size: 16px;
        pointer-events: none;
    `;
    
    document.body.appendChild(messageEl);
    
    setTimeout(() => {
        if (messageEl.parentNode) {
            messageEl.parentNode.removeChild(messageEl);
        }
    }, 2000);
}

// Export functions for use by battle.js
export { selectCharacter, endTurn };

// Global access
window.turnManager = {
    initTurnManager,
    selectCharacter,
    endTurn
};

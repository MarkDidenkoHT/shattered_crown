import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.0';

const BattleState = {
    main: null, apiCall: null, getCurrentProfile: null, profile: null,
    tileMap: new Map(), characters: [], selectedCharacterEl: null,
    selectedPlayerCharacter: null, currentTurnCharacter: null,
    highlightedTiles: [], supabaseClient: null, battleState: null,
    battleId: null, unsubscribeFromBattle: null, isProcessingAITurn: false,
    characterElements: new Map(), // Track character DOM elements for animations
    isMoveQueued: false // Add a flag to track if a move is queued and awaiting confirmation
};

const GRID_SIZE = { rows: 7, cols: 7 };
const MOVEMENT_OFFSETS = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
];

const ANIMATION_CONFIG = {
    moveDuration: 500, // ms
    fadeInDuration: 300,
    fadeOutDuration: 200,
    easingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' // easeOutQuad
};

const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

const throttle = (func, limit) => {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

const getSupabaseClient = (config) => {
    if (BattleState.supabaseClient) return BattleState.supabaseClient;
    
    if (!config?.SUPABASE_URL || !config?.SUPABASE_ANON_KEY) {
        throw new Error('Supabase configuration not found.');
    }

    BattleState.supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: { flowType: 'pkce' }
    });

    return BattleState.supabaseClient;
};

const processCharacterState = (charState) => {
    const stats = charState.stats || {};
    const normalizedStats = Object.entries(stats).reduce((acc, [key, value]) => {
        acc[key.toLowerCase()] = value;
        return acc;
    }, {});

    const vitality = normalizedStats.vitality || 0;
    
    return {
        id: charState.id,
        name: charState.name,
        type: charState.type,
        isPlayerControlled: charState.isPlayerControlled,
        equipped_items: charState.equipped_items || {},
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
        buffs: charState.buffs || [],
        debuffs: charState.debuffs || [],
        pendingAction: null
    };
};

// Animation utilities
const animateCharacterMovement = (characterEl, fromCell, toCell) => {
    return new Promise((resolve) => {
        if (!characterEl || !fromCell || !toCell) {
            resolve();
            return;
        }

        const fromRect = fromCell.getBoundingClientRect();
        const toRect = toCell.getBoundingClientRect();
        
        const deltaX = toRect.left - fromRect.left;
        const deltaY = toRect.top - fromRect.top;

        // Create a clone for animation
        const animationClone = characterEl.cloneNode(true);
        animationClone.style.position = 'fixed';
        animationClone.style.zIndex = '1000';
        animationClone.style.pointerEvents = 'none';
        animationClone.style.left = fromRect.left + 'px';
        animationClone.style.top = fromRect.top + 'px';
        animationClone.style.width = fromRect.width + 'px';
        animationClone.style.height = fromRect.height + 'px';
        
        // Hide original during animation
        characterEl.style.opacity = '0';
        
        document.body.appendChild(animationClone);

        // Animate the clone
        animationClone.style.transition = `transform ${ANIMATION_CONFIG.moveDuration}ms ${ANIMATION_CONFIG.easingFunction}`;
        
        requestAnimationFrame(() => {
            animationClone.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });

        setTimeout(() => {
            // Remove clone and show original in new position
            document.body.removeChild(animationClone);
            toCell.appendChild(characterEl);
            characterEl.style.opacity = '1';
            characterEl.style.transition = 'opacity 150ms ease-in';
            resolve();
        }, ANIMATION_CONFIG.moveDuration);
    });
};

const animateHPChange = (hpBarEl, oldHP, newHP, maxHP) => {
    if (!hpBarEl || oldHP === newHP) return;

    const hpFill = hpBarEl.querySelector('div');
    if (!hpFill) return;

    const oldPercentage = Math.max(0, Math.min(100, Math.round((oldHP / maxHP) * 100)));
    const newPercentage = Math.max(0, Math.min(100, Math.round((newHP / maxHP) * 100)));

    // Color transition
    let newColor = '#4CAF50';
    if (newPercentage <= 25) newColor = '#F44336';
    else if (newPercentage <= 50) newColor = '#FF9800';
    else if (newPercentage <= 75) newColor = '#FFC107';

    hpFill.style.transition = `width ${ANIMATION_CONFIG.moveDuration * 0.6}ms ease-out, background-color 300ms ease`;
    hpFill.style.width = `${newPercentage}%`;
    hpFill.style.backgroundColor = newColor;

    // Add damage/heal indicator
    if (newHP !== oldHP) {
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            position: absolute;
            top: -20px;
            right: 0;
            color: ${newHP > oldHP ? '#4CAF50' : '#F44336'};
            font-size: 10px;
            font-weight: bold;
            pointer-events: none;
            z-index: 30;
            animation: floatUp 1s ease-out forwards;
        `;
        indicator.textContent = `${newHP > oldHP ? '+' : ''}${newHP - oldHP}`;
        
        hpBarEl.style.position = 'relative';
        hpBarEl.appendChild(indicator);
        
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 1000);
    }
};

// --- Loading Modal Utilities (copied from crafting_manager.js for consistency) ---
function injectBattleLoadingStyles() {
    if (document.getElementById('battle-loading-styles')) return;
    const style = document.createElement('style');
    style.id = 'battle-loading-styles';
    style.textContent = `
    .loading-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(5px);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease;
    }
    .loading-content {
      background: linear-gradient(145deg, rgba(29, 20, 12, 0.95), rgba(42, 31, 22, 0.9));
      border: 2px solid #c4975a;
      border-radius: 12px;
      padding: 2.5rem;
      text-align: center;
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.2),
        0 8px 32px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(10px);
      min-width: 320px;
      max-width: 90vw;
    }
    .loading-header h2 {
      font-family: 'Cinzel', serif;
      color: #c4975a;
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      text-shadow: 1px 1px 0 #3d2914;
      letter-spacing: 1px;
    }
    .loading-message {
      color: #b8b3a8;
      font-size: 1rem;
      margin-bottom: 2rem;
      font-style: italic;
      opacity: 0.9;
    }
    .loading-animation {
      position: relative;
      width: 120px;
      height: 120px;
      margin: 0 auto 2rem;
    }
    .crafting-wheel {
      width: 100%;
      height: 100%;
      border: 3px solid #3d2914;
      border-radius: 50%;
      position: relative;
      background: radial-gradient(circle, rgba(196, 151, 90, 0.1), transparent);
      animation: rotateWheel 3s linear infinite;
      box-shadow: 
        inset 0 0 10px rgba(196, 151, 90, 0.3),
        0 0 20px rgba(196, 151, 90, 0.2);
    }
    .wheel-spoke {
      position: absolute;
      width: 2px;
      height: 50px;
      background: linear-gradient(to bottom, #c4975a, transparent);
      left: 50%;
      top: 50%;
      transform-origin: 0 0;
      border-radius: 1px;
    }
    .wheel-spoke:nth-child(1) { transform: translate(-50%, -100%) rotate(0deg); }
    .wheel-spoke:nth-child(2) { transform: translate(-50%, -100%) rotate(60deg); }
    .wheel-spoke:nth-child(3) { transform: translate(-50%, -100%) rotate(120deg); }
    .wheel-spoke:nth-child(4) { transform: translate(-50%, -100%) rotate(180deg); }
    .wheel-spoke:nth-child(5) { transform: translate(-50%, -100%) rotate(240deg); }
    .wheel-spoke:nth-child(6) { transform: translate(-50%, -100%) rotate(300deg); }
    .loading-particles {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .loading-particles .particle {
      position: absolute;
      width: 4px;
      height: 4px;
      background: #c4975a;
      border-radius: 50%;
      opacity: 0;
      animation: floatParticle 2s ease-in-out infinite;
      box-shadow: 0 0 6px rgba(196, 151, 90, 0.5);
    }
    .loading-particles .particle:nth-child(1) { top: 20%; left: 30%; animation-delay: 0s; }
    .loading-particles .particle:nth-child(2) { top: 60%; right: 25%; animation-delay: 0.4s; }
    .loading-particles .particle:nth-child(3) { bottom: 30%; left: 20%; animation-delay: 0.8s; }
    .loading-particles .particle:nth-child(4) { top: 40%; right: 40%; animation-delay: 1.2s; }
    .loading-particles .particle:nth-child(5) { bottom: 20%; right: 30%; animation-delay: 1.6s; }
    .loading-progress {
      width: 100%;
      margin-bottom: 1.5rem;
    }
    .progress-bar {
      width: 100%;
      height: 8px;
      background: rgba(61, 41, 20, 0.8);
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid #3d2914;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #c4975a, #e6b573, #c4975a);
      background-size: 200% 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
      animation: progressShimmer 2s ease-in-out infinite;
      box-shadow: 0 0 10px rgba(196, 151, 90, 0.4);
    }
    .progress-text {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 0.5rem;
      font-size: 0.9rem;
    }
    .progress-step {
      color: #b8b3a8;
      font-style: italic;
    }
    .progress-percent {
      color: #c4975a;
      font-weight: bold;
      font-family: 'Cinzel', serif;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes rotateWheel {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes floatParticle {
      0%, 100% { 
        opacity: 0; 
        transform: translateY(0px) scale(1); 
      }
      50% { 
        opacity: 1; 
        transform: translateY(-20px) scale(1.2); 
      }
    }
    @keyframes progressShimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    `;
    document.head.appendChild(style);
}

function createBattleLoadingModal(title = "Loading Battle", message = "Preparing your battlefield...") {
    injectBattleLoadingStyles();
    const modal = document.createElement('div');
    modal.className = 'loading-modal';
    modal.innerHTML = `
      <div class="loading-content">
        <div class="loading-header">
          <h2>${title}</h2>
          <p class="loading-message">${message}</p>
        </div>
        <div class="loading-animation">
          <div class="crafting-wheel">
            ${Array(6).fill().map(() => '<div class="wheel-spoke"></div>').join('')}
          </div>
          <div class="loading-particles">
            ${Array(5).fill().map(() => '<div class="particle"></div>').join('')}
          </div>
        </div>
        <div class="loading-progress">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <div class="progress-text">
            <span class="progress-step">Connecting to server...</span>
            <span class="progress-percent">0%</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function updateBattleLoadingProgress(modal, step, message, percent) {
    if (!modal?.parentNode) return;
    const progressStep = modal.querySelector('.progress-step');
    const loadingMessage = modal.querySelector('.loading-message');
    const progressFill = modal.querySelector('.progress-fill');
    const progressPercent = modal.querySelector('.progress-percent');
    if (progressStep) progressStep.textContent = step;
    if (loadingMessage) loadingMessage.textContent = message;
    if (progressFill && typeof percent === 'number') progressFill.style.width = `${percent}%`;
    if (progressPercent && typeof percent === 'number') progressPercent.textContent = `${Math.round(percent)}%`;
}

function removeBattleLoadingModal(modal) {
    if (modal?.parentNode) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => modal.parentNode && modal.remove(), 300);
    }
}

export async function loadModule(main, { apiCall, getCurrentProfile, selectedMode, supabaseConfig, existingBattleId = null, reconnecting = false }) {
    Object.assign(BattleState, { main, apiCall, getCurrentProfile });

    // Show loading modal
    const loadingModal = createBattleLoadingModal("Loading Battle", "Preparing your battlefield...");
    const loadingStartTime = Date.now();

    // Simulate progress steps for consistency
    updateBattleLoadingProgress(loadingModal, "Connecting to server...", "Authenticating player...", 10);

    BattleState.profile = BattleState.getCurrentProfile();
    if (!BattleState.profile) {
        removeBattleLoadingModal(loadingModal);
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login');
        return;
    }

    updateBattleLoadingProgress(loadingModal, "Loading map data...", "Fetching tile information...", 30);

    if (!selectedMode && !reconnecting) {
        removeBattleLoadingModal(loadingModal);
        displayMessage('No mode selected. Returning to embark.');
        window.gameAuth.loadModule('embark');
        return;
    }

    try {
        await loadTileData();
        updateBattleLoadingProgress(loadingModal, "Connecting to battle...", "Setting up battle state...", 50);

        const supabase = getSupabaseClient(supabaseConfig);
        if (BattleState.unsubscribeFromBattle) {
            await supabase.removeChannel(BattleState.unsubscribeFromBattle);
        }

        if (reconnecting && existingBattleId) {
            updateBattleLoadingProgress(loadingModal, "Reconnecting...", "Restoring previous battle...", 70);
            await reconnectToBattle(existingBattleId);
        } else {
            const areaLevel = selectedMode !== 'pvp'
                ? (BattleState.profile.progress?.[selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)] || 1)
                : Math.floor(Math.random() * 10) + 1;
            updateBattleLoadingProgress(loadingModal, "Initializing battle...", "Generating battlefield...", 80);
            await initializeBattle(selectedMode, areaLevel);
        }

        setupRealtimeSubscription();
        updateBattleLoadingProgress(loadingModal, "Finalizing...", "Rendering battlefield...", 95);

    } catch (err) {
        removeBattleLoadingModal(loadingModal);
        displayMessage('Failed to start battle. Returning to embark.');
        window.gameAuth.loadModule('embark');
        return;
    }

    // Ensure minimum loading time for smooth animation
    const minTime = 2000;
    const elapsed = Date.now() - loadingStartTime;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, minTime - elapsed)));

    removeBattleLoadingModal(loadingModal);

    const areaLevel = selectedMode !== 'pvp' 
        ? (BattleState.profile.progress?.[selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)] || 1)
        : BattleState.battleState?.round_number || 1;

    renderBattleScreen(selectedMode || BattleState.battleState?.mode || 'unknown', areaLevel, BattleState.battleState.layout_data);
    await updateGameStateFromRealtime();
    renderBottomUI();
}

const loadTileData = async () => {
    try {
        const tileRes = await BattleState.apiCall(`/api/supabase/rest/v1/tiles?select=name,walkable,vision_block,art`);
        const tileRows = await tileRes.json();
        
        BattleState.tileMap.clear();
        tileRows.forEach(tile => {
            BattleState.tileMap.set(tile.name.toLowerCase(), tile);
        });
    } catch (err) {
        console.warn('Could not load tile data');
    }
};

const reconnectToBattle = async (battleId) => {
    const supabase = getSupabaseClient({ 
        SUPABASE_URL: BattleState.main.supabaseConfig?.SUPABASE_URL, 
        SUPABASE_ANON_KEY: BattleState.main.supabaseConfig?.SUPABASE_ANON_KEY 
    });
    
    const { data: battleState, error } = await supabase
        .from('battle_state')
        .select('*')
        .eq('id', battleId)
        .single();
        
    if (error || !battleState) {
        throw new Error('Failed to reconnect to existing battle.');
    }
    
    // Verify player is in this battle
    if (!battleState.players?.includes(BattleState.profile.id)) {
        throw new Error('You are not a participant in this battle.');
    }
    
    BattleState.battleId = battleId;
    BattleState.battleState = battleState;
    
    displayMessage('Reconnected to ongoing battle!', 'success');
};

const initializeBattle = async (selectedMode, areaLevel) => {
    const startBattleRes = await BattleState.apiCall('/functions/v1/start-battle', 'POST', {
        profileId: BattleState.profile.id,
        selectedMode: selectedMode,
        areaLevel: areaLevel,
    });

    const startBattleResponse = await startBattleRes.json();
    if (!startBattleResponse.success) {
        throw new Error(startBattleResponse.error || 'Failed to start battle.');
    }

    const { battleId, initialState } = startBattleResponse;
    BattleState.battleId = battleId;
    BattleState.battleState = initialState;
};

const setupRealtimeSubscription = () => {
    const supabase = getSupabaseClient({ 
        SUPABASE_URL: BattleState.main.supabaseConfig?.SUPABASE_URL, 
        SUPABASE_ANON_KEY: BattleState.main.supabaseConfig?.SUPABASE_ANON_KEY 
    });
    
    BattleState.unsubscribeFromBattle = supabase
        .channel(`battle_state:${BattleState.battleId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'battle_state',
                filter: `id=eq.${BattleState.battleId}`
            },
            throttle(async (payload) => {
                BattleState.battleState = payload.new;
                await updateGameStateFromRealtime();
            }, 100)
        )
        .subscribe();
};

async function updateGameStateFromRealtime() {
    if (!BattleState.battleState) return;

    // Add comprehensive guard for characters_state
    if (!BattleState.battleState.characters_state) {
        console.warn('Battle state missing characters_state, attempting to fetch complete battle state...');
        
        try {
            // Attempt to fetch the complete battle state from the database
            const supabase = getSupabaseClient({ 
                SUPABASE_URL: BattleState.main.supabaseConfig?.SUPABASE_URL, 
                SUPABASE_ANON_KEY: BattleState.main.supabaseConfig?.SUPABASE_ANON_KEY 
            });
            
            const { data: completeBattleState, error } = await supabase
                .from('battle_state')
                .select('*')
                .eq('id', BattleState.battleId)
                .single();
                
            if (error) {
                console.error('Failed to fetch complete battle state:', error);
                displayMessage('Battle state sync error. Please refresh.', 'warning');
                return;
            }
            
            if (!completeBattleState.characters_state) {
                console.error('Complete battle state also missing characters_state:', completeBattleState);
                displayMessage('Critical battle state error. Please restart battle.', 'error');
                return;
            }
            
            // Update with complete battle state
            BattleState.battleState = completeBattleState;
            console.log('Successfully restored complete battle state');
            
        } catch (fetchError) {
            console.error('Error fetching complete battle state:', fetchError);
            displayMessage('Unable to sync battle state. Please refresh.', 'error');
            return;
        }
    }

    // Validate characters_state structure
    if (typeof BattleState.battleState.characters_state !== 'object') {
        console.error('characters_state is not an object:', BattleState.battleState.characters_state);
        displayMessage('Invalid battle state format. Please refresh.', 'error');
        return;
    }

    const charactersStateValues = Object.values(BattleState.battleState.characters_state);
    if (charactersStateValues.length === 0) {
        console.warn('characters_state is empty, this might be expected at battle end');
        return;
    }

    const newCharacters = charactersStateValues.map(processCharacterState);
    
    // Handle character updates with animations
    await updateCharactersWithAnimations(newCharacters);
    
    requestAnimationFrame(() => {
        updateTurnDisplay();
        updateCharacterAvailability();
    });
    
    handleTurnLogic();
}

async function updateCharactersWithAnimations(newCharacters) {
    const container = BattleState.main.querySelector('.battle-grid-container');
    if (!container) return;

    const animations = [];
    
    // Process each character for potential animation
    for (const newChar of newCharacters) {
        const oldChar = BattleState.characters.find(c => c.id === newChar.id);
        const charEl = BattleState.characterElements.get(newChar.id);
        
        if (!oldChar) {
            // New character - create and fade in
            const newCharEl = createCharacterElement(newChar);
            const targetCell = container.querySelector(`td[data-x="${newChar.position[0]}"][data-y="${newChar.position[1]}"]`);
            
            if (targetCell) {
                newCharEl.style.opacity = '0';
                targetCell.appendChild(newCharEl);
                BattleState.characterElements.set(newChar.id, newCharEl);
                
                animations.push(new Promise(resolve => {
                    newCharEl.style.transition = `opacity ${ANIMATION_CONFIG.fadeInDuration}ms ease-in`;
                    newCharEl.style.opacity = '1';
                    setTimeout(resolve, ANIMATION_CONFIG.fadeInDuration);
                }));
            }
        } else if (charEl) {
            // Existing character - check for movement or stat changes
            const [oldX, oldY] = oldChar.position;
            const [newX, newY] = newChar.position;
            
            if (oldX !== newX || oldY !== newY) {
                // Character moved - animate movement
                const fromCell = container.querySelector(`td[data-x="${oldX}"][data-y="${oldY}"]`);
                const toCell = container.querySelector(`td[data-x="${newX}"][data-y="${newY}"]`);
                
                if (fromCell && toCell) {
                    animations.push(animateCharacterMovement(charEl, fromCell, toCell));
                }
            }
            
            // Update HP bar if HP changed
            if (oldChar.current_hp !== newChar.current_hp) {
                const hpBar = charEl.querySelector('.character-hp-bar');
                if (hpBar) {
                    animateHPChange(hpBar, oldChar.current_hp, newChar.current_hp, newChar.max_hp);
                }
            }
            
            // Update other visual states (turn indicators, etc.)
            updateCharacterVisualState(charEl, newChar);
        }
    }
    
    // Remove characters that no longer exist
    for (const oldChar of BattleState.characters) {
        if (!newCharacters.find(c => c.id === oldChar.id)) {
            const charEl = BattleState.characterElements.get(oldChar.id);
            if (charEl) {
                animations.push(new Promise(resolve => {
                    charEl.style.transition = `opacity ${ANIMATION_CONFIG.fadeOutDuration}ms ease-out`;
                    charEl.style.opacity = '0';
                    setTimeout(() => {
                        if (charEl.parentNode) {
                            charEl.parentNode.removeChild(charEl);
                        }
                        BattleState.characterElements.delete(oldChar.id);
                        resolve();
                    }, ANIMATION_CONFIG.fadeOutDuration);
                }));
            }
        }
    }
    
    // Wait for all animations to complete
    await Promise.all(animations);
    
    // Update stored character state
    BattleState.characters = newCharacters;
}

const updateCharacterVisualState = (charEl, character) => {
    // Update tooltip
    charEl.title = `${character.name} (${character.current_hp}/${character.max_hp} HP)`;
    
    // Update turn completion indicator
    const existingIndicator = charEl.querySelector('.turn-done-indicator');
    if (character.has_moved && character.has_acted) {
        if (!existingIndicator) {
            const indicator = createTurnIndicator();
            charEl.appendChild(indicator);
        }
    } else if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Update HP bar content (not animated here, done in animateHPChange)
    const hpBar = charEl.querySelector('.character-hp-bar');
    if (hpBar) {
        const hpFill = hpBar.querySelector('div');
        if (hpFill) {
            const hpPercentage = Math.max(0, Math.min(100, Math.round((character.current_hp / character.max_hp) * 100)));
            // Only update if not already transitioning
            if (!hpFill.style.transition) {
                hpFill.style.width = `${hpPercentage}%`;
            }
        }
    }
};

const updateTurnDisplay = () => {
    const turnStatusEl = document.getElementById('turnStatus');
    if (!turnStatusEl) return;

    const currentTurn = BattleState.battleState.current_turn;
    const roundNumber = BattleState.battleState.round_number;

    if (currentTurn === 'AI') {
        turnStatusEl.textContent = `AI Turn - Round ${roundNumber}`;
        turnStatusEl.style.color = '#8B4513';
    } else {
        const playerCharacters = BattleState.characters.filter(c => c.isPlayerControlled);
        const activePlayerChar = playerCharacters.find(c => !c.has_moved || !c.has_acted);
        const displayName = activePlayerChar?.name || 'Player';
        turnStatusEl.textContent = `${displayName}'s Turn - Round ${roundNumber}`;
        turnStatusEl.style.color = '#B8860B';
    }
};

const updateCharacterAvailability = () => {
    const container = BattleState.main.querySelector('.battle-grid-container');
    if (!container) return;

    const currentTurn = BattleState.battleState.current_turn;
    
    // Remove existing classes with smooth transitions
    BattleState.characterElements.forEach((charEl, charId) => {
        charEl.style.transition = 'filter 300ms ease, opacity 200ms ease';
        charEl.classList.remove('current-turn', 'cannot-act');
    });

    BattleState.characters.forEach(char => {
        const charEl = BattleState.characterElements.get(char.id);
        if (!charEl) return;

        const canAct = !char.has_moved || !char.has_acted;
        const isCorrectTurn = (currentTurn === 'AI') ? !char.isPlayerControlled : char.isPlayerControlled;

        if (canAct && isCorrectTurn) {
            charEl.classList.add('current-turn');
        } else {
            charEl.classList.add('cannot-act');
        }
    });
};

const handleTurnLogic = () => {
    const currentTurn = BattleState.battleState.current_turn;
    
    if (currentTurn !== 'AI') {
        const availablePlayerChars = BattleState.characters.filter(c => 
            c.isPlayerControlled && (!c.has_moved || !c.has_acted)
        );
        BattleState.currentTurnCharacter = availablePlayerChars[0] || null;
    } else {
        BattleState.currentTurnCharacter = null;
        if (!BattleState.isProcessingAITurn) {
            handleAITurn();
        }
    }

    renderBottomUI();
};

const handleAITurn = async () => {
    if (BattleState.isProcessingAITurn) return;
    
    BattleState.isProcessingAITurn = true;
    
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const aiTurnRes = await BattleState.apiCall('/functions/v1/ai-turn', 'POST', {
            battleId: BattleState.battleId
        });
        
        const result = await aiTurnRes.json();
        
        if (!result.success) {
            displayMessage(`AI turn failed: ${result.message}`);
        }
    } catch (error) {
        displayMessage('Error during AI turn. Please try ending the turn manually.');
    } finally {
        BattleState.isProcessingAITurn = false;
    }
};

function renderBattleScreen(mode, level, layoutData) {
    BattleState.main.innerHTML = `
        <style>
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
        }
        @keyframes floatUp {
            0% { transform: translateY(0); opacity: 1; }
            100% { transform: translateY(-30px); opacity: 0; }
        }
        .character-token {
            transition: filter 300ms ease, opacity 200ms ease;
        }
        .character-token.current-turn {
            filter: brightness(1.2) saturate(1.1);
        }
        .character-token.cannot-act {
            filter: grayscale(0.3) opacity(0.7);
        }
        .character-selected {
            filter: brightness(1.3) drop-shadow(0 0 8px #FFD700) !important;
        }
        .highlight-walkable {
            box-shadow: inset 0 0 0 2px #4CAF50;
            background-color: rgba(76, 175, 80, 0.2) !important;
        }
        </style>
        <div class="main-app-container">
            <div class="battle-top-bar">
                <p class="battle-status">${mode.toUpperCase()} — Level ${level}</p>
                <p id="turnStatus">Turn: —</p>
                <div class="battle-controls">
                    <button id="refreshButton" class="fantasy-button small-btn">Refresh</button>
                </div>
            </div>
            <div class="battle-grid-container"></div>
            <div class="battle-info-panel" id="entityInfoPanel">
                <div style="display: flex; width: 100%; height: 100%; max-height: 20vh; min-height: 20vh;">
                    <div style="width: 25%; display: flex; align-items: center; justify-content: center;">
                        <img id="infoPortrait" src="assets/art/sprites/placeholder.png" style="max-width: 80px; max-height: 80px; object-fit: contain;" />
                    </div>
                    <div class="info-text" style="width: 35%; padding-left: 8px; display: flex; flex-direction: column; justify-content: center;">
                        <h3 id="infoName" style="margin: 0 0 4px 0; font-size: 14px;">—</h3>
                        <div id="infoHP" style="font-size: 12px; margin-bottom: 4px;"></div>
                        <div id="infoStats" style="font-size: 10px;"></div>
                    </div>
                    <div id="statusEffects" style="width: 40%; padding-left: 8px; display: flex; flex-direction: column; justify-content: flex-start; overflow-y: auto;">
                        <div style="font-size: 11px; font-weight: bold; color: #B8860B; margin-bottom: 4px;">Status Effects</div>
                        <div id="buffsContainer" style="margin-bottom: 6px;">
                            <div style="font-size: 10px; color: #4CAF50; margin-bottom: 2px;">Buffs:</div>
                            <div id="buffsList" style="font-size: 9px; color: #90EE90;"></div>
                        </div>
                        <div id="debuffsContainer">
                            <div style="font-size: 10px; color: #F44336; margin-bottom: 2px;">Debuffs:</div>
                            <div id="debuffsList" style="font-size: 9px; color: #FFB6C1;"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="battle-bottom-ui" style="display: contents; width: 97vw;"></div>
        </div>
    `;

    renderBattleGrid(layoutData.layout);
    renderCharacters();
    createParticles();
    
    const refreshBtn = document.getElementById('refreshButton');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', debounce(handleRefresh, 300));
    }
}

function renderBattleGrid(layoutJson) {
    const container = BattleState.main.querySelector('.battle-grid-container');
    if (!layoutJson?.tiles) {
        container.innerHTML = '<p>Invalid battlefield layout.</p>';
        return;
    }

    const tiles = layoutJson.tiles;
    const fragment = document.createDocumentFragment();

    container.innerHTML = '';
    Object.assign(container.style, {
        width: '100%', maxWidth: '380px', height: '55%', maxHeight: '380px',
        display: 'flex', flexDirection: 'column', margin: '5px'
    });

    const table = document.createElement('table');
    table.className = 'battle-grid-table';
    Object.assign(table.style, {
        borderCollapse: 'collapse', width: '100%', height: '100%', tableLayout: 'fixed'
    });

    for (let y = 0; y < GRID_SIZE.rows; y++) {
        const tr = document.createElement('tr');
        tr.style.height = `${100 / GRID_SIZE.rows}%`;
        
        for (let x = 0; x < GRID_SIZE.cols; x++) {
            const tileName = tiles[y]?.[x] || 'Plain';
            const normalized = tileName.toLowerCase().replace(/\s+/g, '_');
            const tileData = BattleState.tileMap.get(normalized);
            const art = tileData?.art || 'placeholder';

            const td = document.createElement('td');
            td.className = `battle-tile tile-${normalized}`;
            Object.assign(td.dataset, {
                x: x.toString(), y: y.toString(),
                walkable: tileData?.walkable ? 'true' : 'false'
            });
            td.title = tileName;

            Object.assign(td.style, {
                backgroundImage: `url(assets/art/tiles/${art}.png)`,
                backgroundSize: 'cover', backgroundPosition: 'center',
                width: `${100 / GRID_SIZE.cols}%`, padding: '0', margin: '0',
                position: 'relative', boxSizing: 'border-box',
                border: '1px solid #666',
                transition: 'box-shadow 200ms ease, background-color 200ms ease'
            });

            td.addEventListener('click', handleTileClick);
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    fragment.appendChild(table);
    container.appendChild(fragment);
}

function renderCharacters() {
    const container = BattleState.main.querySelector('.battle-grid-container');
    if (!container) return;
    
    // Clear existing character elements map and DOM elements
    BattleState.characterElements.clear();
    container.querySelectorAll('.character-token').forEach(token => token.remove());

    BattleState.characters.forEach(char => {
        if (!Array.isArray(char.position)) return;

        const [x, y] = char.position;
        const cell = container.querySelector(`td[data-x="${x}"][data-y="${y}"]`);
        if (!cell) return;

        const charEl = createCharacterElement(char);
        cell.appendChild(charEl);
        
        // Store reference for animations
        BattleState.characterElements.set(char.id, charEl);
    });
}

const createCharacterElement = (char) => {
    const charEl = document.createElement('div');
    charEl.className = `character-token ${char.type}`;
    charEl.dataset.id = char.id;
    charEl.title = `${char.name} (${char.current_hp}/${char.max_hp} HP)`;
    
    Object.assign(charEl.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        zIndex: '5', boxSizing: 'border-box'
    });

    const img = document.createElement('img');
    img.src = `assets/art/sprites/${char.spriteName || 'placeholder'}.png`;
    img.alt = char.name;
    img.addEventListener('error', () => {
        img.src = 'assets/art/sprites/placeholder.png';
    });
    
    Object.assign(img.style, {
        width: '100px', height: '100px', maxWidth: '100%', maxHeight: '100%',
        objectFit: 'contain', zIndex: '10', position: 'absolute',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)'
    });

    charEl.appendChild(img);

    if (char.current_hp !== undefined && char.max_hp !== undefined && char.max_hp > 0) {
        const hpBar = createHPBar(char);
        charEl.appendChild(hpBar);
    }

    if (char.has_moved && char.has_acted) {
        const doneIndicator = createTurnIndicator();
        charEl.appendChild(doneIndicator);
    }

    return charEl;
};

const createHPBar = (char) => {
    const hpBar = document.createElement('div');
    hpBar.className = 'character-hp-bar';
    const hpPercentage = Math.max(0, Math.min(100, Math.round((char.current_hp / char.max_hp) * 100)));
    
    let hpColor = '#4CAF50';
    if (hpPercentage <= 25) hpColor = '#F44336';
    else if (hpPercentage <= 50) hpColor = '#FF9800';
    else if (hpPercentage <= 75) hpColor = '#FFC107';
    
    Object.assign(hpBar.style, {
        width: '90%', height: '6px', backgroundColor: '#333', border: '1px solid #666',
        borderRadius: '2px', position: 'absolute', bottom: '2px', left: '5%', zIndex: '20'
    });
    
    hpBar.innerHTML = `<div style="width: ${hpPercentage}%; height: 100%; background-color: ${hpColor}; border-radius: 1px; transition: width 0.3s ease, background-color 0.3s ease;"></div>`;
    
    return hpBar;
};

const createTurnIndicator = () => {
    const indicator = document.createElement('div');
    indicator.className = 'turn-done-indicator';
    
    Object.assign(indicator.style, {
        position: 'absolute', top: '2px', right: '2px', width: '8px', height: '8px',
        backgroundColor: '#666', borderRadius: '50%', zIndex: '25'
    });
    
    indicator.title = 'Turn completed';
    return indicator;
};

const handleTileClick = throttle((event) => {
    const clickedTileEl = event.currentTarget;
    const targetX = parseInt(clickedTileEl.dataset.x);
    const targetY = parseInt(clickedTileEl.dataset.y);
    const charInCell = BattleState.characters.find(c => 
        Array.isArray(c.position) && c.position[0] === targetX && c.position[1] === targetY
    );

    if (BattleState.battleState?.current_turn === 'AI') {
        displayMessage('Please wait for AI turn to complete.');
        return;
    }

    if (charInCell) {
        handleCharacterSelection(charInCell, clickedTileEl);
    } else {
        handleMovementOrDeselect(clickedTileEl, targetX, targetY);
    }
}, 150);

const handleCharacterSelection = (character, tileEl) => {
    // Prevent selecting another character if a move is queued
    if (BattleState.isMoveQueued) {
        displayMessage('Finish your move by pressing "End Turn" before selecting another character.', 'warning');
        return;
    }

    unhighlightAllTiles();
    
    if (BattleState.selectedCharacterEl) {
        BattleState.selectedCharacterEl.classList.remove('character-selected');
    }
    
    if (character.isPlayerControlled && (!character.has_moved || !character.has_acted)) {
        const el = BattleState.characterElements.get(character.id);
        if (el) {
            el.classList.add('character-selected');
            BattleState.selectedCharacterEl = el;
            BattleState.selectedPlayerCharacter = character;
            BattleState.currentTurnCharacter = character;
            highlightWalkableTiles(character);
        }
    } else {
        BattleState.selectedPlayerCharacter = null;
        BattleState.selectedCharacterEl = null;
        unhighlightAllTiles();
    }
    
    showEntityInfo(character);
    renderBottomUI();
};

const handleMovementOrDeselect = async (tileEl, targetX, targetY) => {
    // Prevent moving another character if a move is queued
    if (BattleState.isMoveQueued) {
        displayMessage('Finish your move by pressing "End Turn" before moving another character.', 'warning');
        return;
    }

    if (BattleState.selectedPlayerCharacter && tileEl.classList.contains('highlight-walkable')) {
        await attemptMoveCharacter(BattleState.selectedPlayerCharacter, targetX, targetY);
    } else {
        unhighlightAllTiles();
        
        if (BattleState.selectedCharacterEl) {
            BattleState.selectedCharacterEl.classList.remove('character-selected');
            BattleState.selectedCharacterEl = null;
        }
        
        BattleState.selectedPlayerCharacter = null;
        
        const tileName = tileEl.className.split(' ').find(cls => cls.startsWith('tile-'));
        const tileKey = tileName ? tileName.replace('tile-', '') : 'plain';
        const tileData = BattleState.tileMap.get(tileKey);
        showEntityInfo({ 
            tile: tileData || { 
                name: 'Unknown', walkable: false, vision_block: false, art: 'placeholder' 
            } 
        });
    }
};

function highlightWalkableTiles(character) {
    unhighlightAllTiles();
    if (!character || !Array.isArray(character.position) || character.has_moved) return;

    const [charX, charY] = character.position;
    const container = BattleState.main.querySelector('.battle-grid-container');
    
    MOVEMENT_OFFSETS.forEach(offset => {
        const newX = charX + offset.dx;
        const newY = charY + offset.dy;
        
        if (newX >= 0 && newX < GRID_SIZE.cols && newY >= 0 && newY < GRID_SIZE.rows) {
            const tileEl = container.querySelector(`td[data-x="${newX}"][data-y="${newY}"]`);
            if (tileEl && tileEl.dataset.walkable === 'true') {
                const isOccupied = BattleState.characters.some(c => 
                    Array.isArray(c.position) && c.position[0] === newX && c.position[1] === newY
                );
                if (!isOccupied) {
                    tileEl.classList.add('highlight-walkable');
                    BattleState.highlightedTiles.push(tileEl);
                }
            }
        }
    });
}

function unhighlightAllTiles() {
    BattleState.highlightedTiles.forEach(tileEl => {
        tileEl.classList.remove('highlight-walkable');
    });
    BattleState.highlightedTiles = [];
}

function debugConsumableLoading() {
    console.log('=== CONSUMABLE DEBUG ===');
    console.log('Current turn character:', BattleState.currentTurnCharacter);
    console.log('All characters:', BattleState.characters);
    
    BattleState.characters.forEach(char => {
        console.log(`Character ${char.name}:`, {
            id: char.id,
            isPlayerControlled: char.isPlayerControlled,
            equipped_items: char.equipped_items,
            equipped_consumable: char.equipped_items?.equipped_consumable
        });
    });
    console.log('========================');
}

const attemptMoveCharacter = async (character, targetX, targetY) => {
    const [startX, startY] = character.position;
    const distanceX = Math.abs(targetX - startX);
    const distanceY = Math.abs(targetY - startY);
    const chebyshevDistance = Math.max(distanceX, distanceY);

    if (chebyshevDistance !== 1 || (distanceX === 0 && distanceY === 0)) {
        displayMessage('Characters can only move 1 tile at a time to an adjacent square.');
        unhighlightAllTiles();
        return;
    }

    const container = BattleState.main.querySelector('.battle-grid-container');
    const targetTileEl = container.querySelector(`td[data-x="${targetX}"][data-y="${targetY}"]`);
    if (!targetTileEl || targetTileEl.dataset.walkable !== 'true') {
        displayMessage('Cannot move to an unwalkable tile.');
        unhighlightAllTiles();
        return;
    }

    const isOccupied = BattleState.characters.some(c => 
        Array.isArray(c.position) && c.position[0] === targetX && c.position[1] === targetY
    );
    
    if (isOccupied) {
        displayMessage('That tile is already occupied by another character.');
        unhighlightAllTiles();
        return;
    }

    // Perform smooth movement animation for player moves
    const charEl = BattleState.characterElements.get(character.id);
    const fromCell = container.querySelector(`td[data-x="${startX}"][data-y="${startY}"]`);
    const toCell = targetTileEl;
    
    if (charEl && fromCell && toCell) {
        await animateCharacterMovement(charEl, fromCell, toCell);
    }

    // Update character position
    character.position = [targetX, targetY];

    // Set move queued flag
    BattleState.isMoveQueued = true;

    unhighlightAllTiles();

    if (BattleState.selectedCharacterEl) {
        BattleState.selectedCharacterEl.classList.remove('character-selected');
        BattleState.selectedCharacterEl = null;
    }
    BattleState.selectedPlayerCharacter = null;
};

function renderBottomUI() {
    const ui = BattleState.main.querySelector('.battle-bottom-ui');
    ui.innerHTML = '';

    // Add debug logging
    debugConsumableLoading();

    const fragment = document.createDocumentFragment();

    for (let row = 0; row < 2; row++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'battle-ui-row';

        for (let i = 0; i < 5; i++) {
            const btnIndex = row * 5 + i;
            const btn = document.createElement('button');
            btn.className = 'fantasy-button ui-btn';

            if (btnIndex === 5) {
                // Consumable button - only show for current turn character
                const currentChar = BattleState.currentTurnCharacter;
                const consumable = currentChar?.equipped_items?.equipped_consumable;
                
                if (consumable && consumable !== 'none') {
                    const itemSprite = consumable.replace(/\s+/g, '');
                    btn.innerHTML = `<img src="assets/art/recipes/${itemSprite}.png" alt="${consumable}" style="width: 36px; height: 36px; object-fit: contain;">`;
                    btn.id = 'consumableButton';
                    btn.disabled = false;
                    btn.title = consumable;
                    btn.addEventListener('click', debounce(handleUseConsumable, 500));
                } else {
                    btn.textContent = 'No Item';
                    btn.disabled = true;
                }
            }
            else if (btnIndex === 9) {
                btn.textContent = 'End Turn';
                btn.id = 'endTurnButtonBottom';
                btn.disabled = false;
            } else {
                btn.textContent = `Btn ${btnIndex + 1}`;
                btn.disabled = true;
            }

            rowDiv.appendChild(btn);
        }

        fragment.appendChild(rowDiv);
    }

    ui.appendChild(fragment);

    const endTurnBtn = document.getElementById('endTurnButtonBottom');
    if (endTurnBtn) {
        endTurnBtn.addEventListener('click', debounce(handleEndTurn, 500));
    }
}

const handleEndTurn = async () => {
    const activeCharacter = BattleState.currentTurnCharacter;
    if (!activeCharacter) {
        displayMessage('No character is currently active for this turn.');
        return;
    }

    if (!BattleState.battleId || !activeCharacter.id || !Array.isArray(activeCharacter.position)) {
        displayMessage('Missing battle or character data.');
        return;
    }

    const characterId = activeCharacter.id;
    const currentPosition = activeCharacter.originalPosition || activeCharacter.position;
    const targetPosition = activeCharacter.position;
    const action = activeCharacter.pendingAction || null;

    try {
        const res = await BattleState.apiCall('/functions/v1/combined-action-end', 'POST', {
            battleId: BattleState.battleId,
            characterId,
            currentPosition,
            targetPosition,
            action
        });

        let result;
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            result = await res.json();
        } else {
            result = await res.text();
            console.error('Non-JSON response:', result);
            displayMessage('Server returned invalid response.', 'error');
            return;
        }

        if (!result.success) {
            displayMessage(`Error: ${result.message}`, 'error');
            return;
        }

        // Use the returned battleState if present
        if (result.battleState && result.battleState.characters_state) {
            BattleState.battleState = result.battleState;
            await updateGameStateFromRealtime();
        }

        BattleState.currentTurnCharacter = null;
        BattleState.isMoveQueued = false;

    } catch (err) {
        displayMessage('Error completing turn. Please try again.', 'error');
    }
};

const handleUseConsumable = async () => {
    const activeCharacter = BattleState.currentTurnCharacter;
    
    if (!activeCharacter) {
        displayMessage('No character is currently active for this turn.');
        return;
    }

    if (!activeCharacter.isPlayerControlled) {
        displayMessage('Cannot use consumables for AI characters.');
        return;
    }

    const consumable = activeCharacter.equipped_items?.equipped_consumable;
    if (!consumable || consumable === 'none') {
        displayMessage('No consumable equipped.');
        return;
    }

    const requestData = {
        battleId: BattleState.battleId,
        characterId: activeCharacter.id,
        playerId: BattleState.profile.id,
        consumableItem: consumable
    };

    console.log('=== USE CONSUMABLE DEBUG ===');
    console.log('Request data:', requestData);
    console.log('Active character:', activeCharacter);
    console.log('Profile:', BattleState.profile);
    console.log('============================');

    try {
        const res = await BattleState.apiCall('/functions/v1/use-consumable', 'POST', requestData);

        const result = await res.json();
        console.log('Server response:', result);

        if (!result.success) {
            displayMessage(`Error using ${consumable}: ${result.message}`, 'error');
            return;
        }

        displayMessage(`Used ${consumable}!`, 'success');
        
        // Using a consumable always ends the turn
        setTimeout(() => {
            handleEndTurn();
        }, 1000);

    } catch (err) {
        console.error('Use consumable error:', err);
        displayMessage('Error using consumable. Please try again.', 'error');
    }
};

const handleRefresh = async () => {
    try {
        const supabase = getSupabaseClient({ 
            SUPABASE_URL: BattleState.main.supabaseConfig?.SUPABASE_URL, 
            SUPABASE_ANON_KEY: BattleState.main.supabaseConfig?.SUPABASE_ANON_KEY 
        });
        
        const { data: battleState, error } = await supabase
            .from('battle_state')
            .select('*')
            .eq('id', BattleState.battleId)
            .single();
            
        if (error) throw error;
        
        BattleState.battleState = battleState;
        await updateGameStateFromRealtime();
        
        displayMessage('Battle state refreshed successfully.', 'success');
        // Reset move queued flag on refresh
        BattleState.isMoveQueued = false;
    } catch (error) {
        displayMessage('Failed to refresh battle state.', 'error');
    }
};

function showEntityInfo(entity) {
    const portrait = document.getElementById('infoPortrait');
    const nameEl = document.getElementById('infoName');
    const hpEl = document.getElementById('infoHP');
    const statsEl = document.getElementById('infoStats');
    const buffsList = document.getElementById('buffsList');
    const debuffsList = document.getElementById('debuffsList');

    if (!entity) {
        clearEntityInfo();
        return;
    }

    nameEl.textContent = entity.name || 'Unnamed';

    if (entity.type === 'player' || entity.type === 'enemy') {
        displayCharacterInfo(entity, portrait, hpEl, statsEl, buffsList, debuffsList);
    } else if (entity.tile) {
        displayTileInfo(entity.tile, portrait, hpEl, statsEl, buffsList, debuffsList);
    }
}

const clearEntityInfo = () => {
    document.getElementById('infoName').textContent = '—';
    document.getElementById('infoHP').textContent = '';
    document.getElementById('infoStats').innerHTML = '';
    document.getElementById('buffsList').innerHTML = '';
    document.getElementById('debuffsList').innerHTML = '';
    document.getElementById('infoPortrait').src = 'assets/art/sprites/placeholder.png';
};

const displayCharacterInfo = (entity, portrait, hpEl, statsEl, buffsList, debuffsList) => {
    const currentHp = entity.current_hp || 0;
    const maxHp = entity.max_hp || 0;
    const hpPercentage = maxHp > 0 ? Math.round((currentHp / maxHp) * 100) : 0;
    
    let hpColor = '#4CAF50';
    if (hpPercentage <= 25) hpColor = '#F44336';
    else if (hpPercentage <= 50) hpColor = '#FF9800';
    else if (hpPercentage <= 75) hpColor = '#FFC107';
    
    let turnStatus = '';
    if (entity.has_moved && entity.has_acted) {
        turnStatus = ' <span style="color: #888; font-size: 10px;">(Complete)</span>';
    } else if (entity.has_moved) {
        turnStatus = ' <span style="color: #FFB74D; font-size: 10px;">(Moved)</span>';
    } else if (entity.has_acted) {
        turnStatus = ' <span style="color: #81C784; font-size: 10px;">(Acted)</span>';
    }
    
    hpEl.innerHTML = `<strong>HP:</strong> <span style="color: ${hpColor}">${currentHp}/${maxHp}</span>${turnStatus}`;

    const stats = entity.stats || {};
    const statsData = [
        { label: 'STR', value: stats.strength || 0, color: '#D4AF37' },
        { label: 'DEX', value: stats.dexterity || 0, color: '#B8860B' },
        { label: 'VIT', value: stats.vitality || 0, color: '#CD853F' },
        { label: 'SPR', value: stats.spirit || 0, color: '#DAA520' },
        { label: 'INT', value: stats.intellect || 0, color: '#F4A460' },
        { label: 'ARM', value: stats.armor || 0, color: '#8B7355' },
        { label: 'RES', value: stats.resistance || 0, color: '#4682B4' }
    ];

    statsEl.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; font-size: 10px;">
            ${statsData.map(stat => `
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: ${stat.color}; font-weight: bold;">${stat.label}:</span>
                    <span>${stat.value}</span>
                </div>
            `).join('')}
        </div>
    `;

    const buffs = entity.buffs || [];
    if (buffs.length > 0) {
        buffsList.innerHTML = buffs.map(buff => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 1px; padding: 1px 3px; background: rgba(76, 175, 80, 0.1); border-radius: 2px;">
                <span>${buff.name || 'Unknown Buff'}</span>
                <span style="color: #90EE90;">${buff.duration || '∞'}</span>
            </div>
        `).join('');
    } else {
        buffsList.innerHTML = '<div style="color: #666; font-style: italic;">None</div>';
    }

    const debuffs = entity.debuffs || [];
    if (debuffs.length > 0) {
        debuffsList.innerHTML = debuffs.map(debuff => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 1px; padding: 1px 3px; background: rgba(244, 67, 54, 0.1); border-radius: 2px;">
                <span>${debuff.name || 'Unknown Debuff'}</span>
                <span style="color: #FFB6C1;">${debuff.duration || '∞'}</span>
            </div>
        `).join('');
    } else {
        debuffsList.innerHTML = '<div style="color: #666; font-style: italic;">None</div>';
    }

    const spritePath = `assets/art/sprites/${entity.spriteName || 'placeholder'}.png`;
    portrait.src = spritePath;
    portrait.onerror = () => {
        portrait.src = 'assets/art/sprites/placeholder.png';
    };
};

const displayTileInfo = (tile, portrait, hpEl, statsEl, buffsList, debuffsList) => {
    hpEl.textContent = '';
    
    const walkableText = tile.walkable ? 'Yes' : 'No';
    const visionBlockText = tile.vision_block ? 'Yes' : 'No';
    
    statsEl.innerHTML = `
        <div style="font-size: 11px;">
            <div style="margin-bottom: 3px;">
                <strong style="color: #B8860B;">Type:</strong> ${tile.name || 'Unknown'}
            </div>
            <div style="margin-bottom: 3px;">
                <strong style="color: #CD853F;">Walkable:</strong> 
                <span style="color: ${tile.walkable ? '#4CAF50' : '#F44336'}">${walkableText}</span>
            </div>
            <div>
                <strong style="color: #D4AF37;">Blocks Vision:</strong> 
                <span style="color: ${tile.vision_block ? '#F44336' : '#4CAF50'}">${visionBlockText}</span>
            </div>
        </div>
    `;
    
    buffsList.innerHTML = '<div style="color: #666; font-style: italic;">N/A</div>';
    debuffsList.innerHTML = '<div style="color: #666; font-style: italic;">N/A</div>';
    
    const tilePath = `assets/art/tiles/${tile.art || 'placeholder'}.png`;
    portrait.src = tilePath;
    portrait.onerror = () => {
        portrait.src = 'assets/art/tiles/placeholder.png';
    };
};

function createParticles() {
    const container = document.createElement('div');
    container.className = 'particles';
    
    Object.assign(container.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: '1'
    });
    
    BattleState.main.style.position = 'relative';
    
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        Object.assign(particle.style, {
            position: 'absolute', width: '2px', height: '2px',
            backgroundColor: '#B8860B', borderRadius: '50%', opacity: '0.6',
            left: Math.random() * 100 + '%', top: Math.random() * 100 + '%',
            animation: `float ${(Math.random() * 3 + 4)}s ease-in-out infinite`,
            animationDelay: Math.random() * 6 + 's'
        });
        
        fragment.appendChild(particle);
    }
    
    container.appendChild(fragment);
    BattleState.main.appendChild(container);
}

function displayMessage(msg, type = 'info') {
    const existingMessage = document.querySelector('.custom-message-box');
    if (existingMessage) existingMessage.remove();

    const box = document.createElement('div');
    box.className = 'custom-message-box';
    
    const messageConfig = {
        info: { bg: '#8B4513', border: '#D4AF37' },
        error: { bg: '#8B2635', border: '#CD5C5C' },
        success: { bg: '#556B2F', border: '#9ACD32' },
        warning: { bg: '#B8860B', border: '#FFD700' }
    };
    
    const config = messageConfig[type] || messageConfig.info;
    
    Object.assign(box.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: '1000'
    });
    
    box.innerHTML = `
        <div class="message-content" style="
            background: ${config.bg}; border: 2px solid ${config.border};
            border-radius: 8px; padding: 20px; max-width: 400px; text-align: center;
            color: white; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
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
    if (BattleState.unsubscribeFromBattle && BattleState.supabaseClient) {
        BattleState.supabaseClient.removeChannel(BattleState.unsubscribeFromBattle);
    }
    
    Object.assign(BattleState, {
        main: null, apiCall: null, getCurrentProfile: null, profile: null,
        characters: [], selectedCharacterEl: null, selectedPlayerCharacter: null,
        currentTurnCharacter: null, highlightedTiles: [], supabaseClient: null,
        battleState: null, battleId: null, unsubscribeFromBattle: null,
        isProcessingAITurn: false, isMoveQueued: false // Reset move queued flag
    });
    
    BattleState.tileMap.clear();
    BattleState.characterElements.clear();
    
    const existingMessage = document.querySelector('.custom-message-box');
    if (existingMessage) existingMessage.remove();
}

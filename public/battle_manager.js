import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.0';

const BattleState = {
    main: null, apiCall: null, getCurrentProfile: null, profile: null,
    tileMap: new Map(), characters: [], selectedCharacterEl: null,
    selectedPlayerCharacter: null, currentTurnCharacter: null,
    highlightedTiles: [], supabaseClient: null, battleState: null,
    battleId: null, unsubscribeFromBattle: null, isProcessingAITurn: false,
    characterElements: new Map(),
    isMoveQueued: false,
    characterAbilities: {},
    environmentItems: {},
    abilityCache: new Map()
};

const GRID_SIZE = { rows: 7, cols: 7 };
const MOVEMENT_OFFSETS = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
];

const ANIMATION_CONFIG = {
    moveDuration: 500, 
    fadeInDuration: 300,
    fadeOutDuration: 200,
    easingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
};

const PRELOAD_CONFIG = {
    abilities: true,
    backgrounds: true,
    portraits: true,
    environment: true,
    tiles: true
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
            vitality: normalizedStats.vitality || 0,
            spirit: normalizedStats.spirit || 0,
            dexterity: normalizedStats.dexterity || 0,
            intellect: normalizedStats.intellect || 0,
            armor: normalizedStats.armor || 0,
            resistance: normalizedStats.resistance || 0
        },
        spriteName: charState.sprite_name,
        portrait: charState.portrait,
        has_moved: charState.has_moved,
        has_acted: charState.has_acted,
        current_hp: charState.current_hp,
        max_hp: charState.max_hp,
        priority: charState.priority || 999,
        buffs: charState.buffs || [],
        debuffs: charState.debuffs || [],
        pendingAction: null
    };
};

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
        const animationClone = characterEl.cloneNode(true);
        animationClone.style.position = 'fixed';
        animationClone.style.zIndex = '1000';
        animationClone.style.pointerEvents = 'none';
        animationClone.style.left = fromRect.left + 'px';
        animationClone.style.top = fromRect.top + 'px';
        animationClone.style.width = fromRect.width + 'px';
        animationClone.style.height = fromRect.height + 'px';
        
        characterEl.style.opacity = '0';
        document.body.appendChild(animationClone);

        animationClone.style.transition = `transform ${ANIMATION_CONFIG.moveDuration}ms ${ANIMATION_CONFIG.easingFunction}`;
        
        requestAnimationFrame(() => {
            animationClone.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });

        setTimeout(() => {
            document.body.removeChild(animationClone);
            toCell.appendChild(characterEl);
            characterEl.style.opacity = '1';
            characterEl.style.transition = 'opacity 150ms ease-in';
            resolve();
        }, ANIMATION_CONFIG.moveDuration);
    });
};

const animateHPChange = (hpBarEl, oldHP, newHP, maxHP) => {
    if (!hpBarEl) return;
    if (oldHP === newHP) return;

    const hpFill = hpBarEl.querySelector('div');
    if (!hpFill) return;

    const oldPercentage = Math.max(0, Math.min(100, Math.round((oldHP / maxHP) * 100)));
    const newPercentage = Math.max(0, Math.min(100, Math.round((newHP / maxHP) * 100)));

    let newColor = '#4CAF50';
    if (newPercentage <= 25) newColor = '#F44336';
    else if (newPercentage <= 50) newColor = '#FF9800';
    else if (newPercentage <= 75) newColor = '#FFC107';

    hpFill.style.transition = `width ${ANIMATION_CONFIG.moveDuration * 0.6}ms ease-out, background-color 300ms ease`;
    hpFill.style.width = `${newPercentage}%`;
    hpFill.style.backgroundColor = newColor;

    const delta = newHP - oldHP;
    if (delta !== 0) {
        const charEl = hpBarEl.closest('.character-token');
        if (charEl) {
            const floatText = document.createElement('div');
            floatText.textContent = (delta > 0 ? `+${delta}` : `${delta}`);
            floatText.style.position = 'absolute';
            floatText.style.left = '50%';
            floatText.style.bottom = '110%';
            floatText.style.transform = 'translateX(-50%)';
            floatText.style.fontFamily = 'Cinzel, serif';
            floatText.style.fontSize = '14px';
            floatText.style.fontWeight = 'bold';
            floatText.style.color = delta > 0 ? '#66ff66' : '#ff4444';
            floatText.style.textShadow = '0 0 4px rgba(0,0,0,0.8)';
            floatText.style.opacity = '1';
            floatText.style.zIndex = '50';
            floatText.style.pointerEvents = 'none';
            charEl.appendChild(floatText);

            floatText.animate([
                { transform: 'translate(-50%, 0)', opacity: 1 },
                { transform: 'translate(-50%, -40px)', opacity: 0 }
            ], {
                duration: 1000,
                easing: 'ease-out',
                fill: 'forwards'
            });

            setTimeout(() => floatText.remove(), 1000);
        }
    }
};

function injectBattleLoadingStyles() {
    if (document.getElementById('battle-loading-styles')) return;
    const style = document.createElement('style');
    style.id = 'battle-loading-styles';
    style.textContent = `
    .battle-result-modal {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7); display: flex;
      align-items: center; justify-content: center; z-index: 9999;
    }
    .battle-result-content {
      background: #222; padding: 20px; border-radius: 8px;
      text-align: center; color: #fff;
    }
    
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

const preloadAssets = async (battleState, selectedMode) => {
    const loadingPromises = [];
    
    if (PRELOAD_CONFIG.backgrounds) {
        const bgName = battleState?.layout_data?.background || battleState?.background || 'default';
        const bgUrl = `assets/art/backgrounds/${bgName}.png`;
        loadingPromises.push(preloadImage(bgUrl));
    }
    
    if (PRELOAD_CONFIG.portraits && battleState?.characters_state) {
        Object.values(battleState.characters_state).forEach(char => {
            if (char.portrait && char.portrait !== 'none') {
                const portraitUrl = `assets/art/portraits/${char.portrait}.png`;
                loadingPromises.push(preloadImage(portraitUrl));
            }
        });
    }
    
    if (PRELOAD_CONFIG.abilities && battleState?.player_abilities) {
        Object.values(battleState.player_abilities).forEach(charAbilities => {
            Object.keys(charAbilities.basic || {}).forEach(abilityName => {
                loadingPromises.push(preloadAbility(abilityName));
            });
            
            Object.keys(charAbilities.ultimate || {}).forEach(abilityName => {
                loadingPromises.push(preloadAbility(abilityName));
            });
            
            Object.keys(charAbilities.passive || {}).slice(0, 2).forEach(abilityName => {
                loadingPromises.push(preloadAbility(abilityName));
            });
        });
    }
    
    if (PRELOAD_CONFIG.environment && battleState?.layout_data?.environment_items_pos) {
        Object.values(battleState.layout_data.environment_items_pos).forEach(item => {
            if (item.sprite) {
                const envUrl = `assets/art/environment/${item.sprite.toLowerCase()}.png`;
                loadingPromises.push(preloadImage(envUrl));
            }
        });
    }
    
    if (PRELOAD_CONFIG.tiles && battleState?.layout_data?.layout?.tiles) {
        const uniqueTiles = new Set();
        battleState.layout_data.layout.tiles.forEach(row => {
            row.forEach(tile => {
                const tileName = typeof tile === 'object' ? tile.name : tile;
                const normalized = tileName.toLowerCase().replace(/\s+/g, '_');
                uniqueTiles.add(normalized);
            });
        });
        
        uniqueTiles.forEach(tileName => {
            const tileData = BattleState.tileMap.get(tileName);
            if (tileData?.art) {
                const tileUrl = `assets/art/tiles/${tileData.art}.png`;
                loadingPromises.push(preloadImage(tileUrl));
            }
        });
    }
    
    return Promise.allSettled(loadingPromises);
};

const preloadImage = (url) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = () => {
            console.warn(`Failed to preload image: ${url}`);
            resolve();
        };
        img.src = url;
    });
};

const preloadAbility = async (abilityName) => {
    try {
        const ability = await getAbility(abilityName);
        if (ability?.sprite) {
            const abilityUrl = `assets/art/abilities/${ability.sprite}.png`;
            await preloadImage(abilityUrl);
        }
    } catch (error) {
        console.warn(`Failed to preload ability: ${abilityName}`, error);
    }
};

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

    const loadingModal = createBattleLoadingModal("Loading Battle", "Preparing your battlefield...");
    const loadingStartTime = Date.now();

    try {
        updateBattleLoadingProgress(loadingModal, "Connecting to server...", "Authenticating player...", 10);

        BattleState.profile = BattleState.getCurrentProfile();
        if (!BattleState.profile) {
            removeBattleLoadingModal(loadingModal);
            displayMessage('User profile not found. Please log in again.');
            window.gameAuth.loadModule('login');
            return;
        }

        if (BattleState.profile.battle_tutorial === false) {
            await showTutorialModal(BattleState.profile.chat_id);
        }

        updateBattleLoadingProgress(loadingModal, "Loading map data...", "Fetching tile information...", 30);

        if (!selectedMode && !reconnecting) {
            removeBattleLoadingModal(loadingModal);
            displayMessage('No mode selected. Returning to embark.');
            window.gameAuth.loadModule('embark');
            return;
        }

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

        updateBattleLoadingProgress(loadingModal, "Loading assets...", "Preloading images and abilities...", 85);
        await preloadAssets(BattleState.battleState, selectedMode);

        setupRealtimeSubscription();
        updateBattleLoadingProgress(loadingModal, "Finalizing...", "Rendering battlefield...", 95);

        const areaLevel = selectedMode !== 'pvp' 
            ? (BattleState.profile.progress?.[selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)] || 1)
            : BattleState.battleState?.round_number || 1;

        renderBattleScreen(selectedMode || BattleState.battleState?.mode || 'unknown', areaLevel, BattleState.battleState?.layout_data);
        await updateGameStateFromRealtime();

    } catch (err) {
        console.error('Battle loading error:', err);
        removeBattleLoadingModal(loadingModal);
        displayMessage('Failed to start battle. Returning to embark.');
        window.gameAuth.loadModule('embark');
        return;
    }

    const minTime = 2000;
    const elapsed = Date.now() - loadingStartTime;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, minTime - elapsed)));

    removeBattleLoadingModal(loadingModal);
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
    
    if (!battleState.players?.includes(BattleState.profile.id)) {
        throw new Error('You are not a participant in this battle.');
    }
    
    BattleState.battleId = battleId;
    BattleState.battleState = battleState;
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
                
                const layoutItems = BattleState.battleState?.layout_data?.environment_items_pos;
                if (layoutItems && Object.keys(layoutItems).length)
                 renderEnvironmentItems(layoutItems);
            }, 100)
        )
        .subscribe();
};

async function showTutorialModal(chatId) {
    const modal = document.createElement('div');
    modal.className = 'tutorial-modal';
    Object.assign(modal.style, {
        position: 'fixed',
        top: '0', left: '0',
        width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: '99999',
        color: '#fff',
        flexDirection: 'column',
        textAlign: 'center',
        fontFamily: 'Cinzel, serif'
    });

    modal.innerHTML = `
        <h2 style="margin-bottom:1rem;">Battle Tutorial</h2>
        <p style="max-width:480px;margin-bottom:2rem;opacity:0.9;">
            Welcome to the battle module! Here you'll learn basic controls.
            <br><br>
            (Later this will be replaced by a short video.)
        </p>
        <button id="closeTutorialBtn" 
            style="padding:0.75rem 1.5rem;
                   background:#c4975a;
                   border:none;
                   border-radius:8px;
                   color:#222;
                   font-weight:bold;
                   cursor:pointer;">
            Got it, let's play!
        </button>
    `;

    document.body.appendChild(modal);

    document.getElementById('closeTutorialBtn').addEventListener('click', async () => {
        modal.remove();

        await fetch(`/api/profile/mark-tutorial-seen/${chatId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
        });
    });
}

async function updateGameStateFromRealtime() {
    if (!BattleState.battleState) return;
    
    const status = BattleState.battleState.status;
      if (status === 'victory' || status === 'defeat') {
        await assignLoot(BattleState.battleState);
        showBattleResultModal(status);
        return; 
      }
        
    if (!BattleState.battleState.characters_state) {
        console.warn('Battle state missing characters_state:', BattleState.battleState);
        return;
    }

    const newCharacters = Object.values(BattleState.battleState.characters_state)
        .map(processCharacterState);
    
    await updateCharactersWithAnimations(newCharacters);
    
    requestAnimationFrame(() => {
        updateTurnDisplay();
        updateCharacterAvailability();
    });
    
    handleTurnLogic();
    const layoutItems = BattleState.battleState?.layout_data?.environment_items_pos;
    if (layoutItems && Object.keys(layoutItems).length)
      renderEnvironmentItems(layoutItems);
}

BattleState.selectingAbility = BattleState.selectingAbility || null;
BattleState._abilityEscHandler = null;

function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

function getCellAt(x, y) {
  return BattleState.main?.querySelector(`td[data-x="${x}"][data-y="${y}"]`) || null;
}

function getCharacterAt(x, y) {
  return BattleState.characters.find(c => c.position?.[0] === x && c.position?.[1] === y) || null;
}

function isAlly(caster, other) {
  return caster?.type === other?.type;
}

function normalizeAbility(ability) {
  return {
    ...ability,
    range: Number(ability.range) || 0,
    area: Number(ability.area) || 0,
    targeting: ability.targeting || 'single',
    target_type: ability.target_type || 'any',
    effects: ability.effects || 'damage'
  };
}

function clearAbilitySelection() {
  (BattleState.highlightedTiles || []).forEach(tileEl => {
    tileEl.classList.remove('highlight-target-ally', 'highlight-target-enemy', 'highlight-area-center');
    if (tileEl._abilityTargetHandler) {
      tileEl.removeEventListener('click', tileEl._abilityTargetHandler);
      delete tileEl._abilityTargetHandler;
    }
  });
  BattleState.highlightedTiles = [];

  if (BattleState._abilityEscHandler) {
    document.removeEventListener('keydown', BattleState._abilityEscHandler);
    BattleState._abilityEscHandler = null;
  }
  BattleState.selectingAbility = null;

  resetAbilityButtonsUI();
  hideAbilityTooltip();
}

function toggleAbilitySelection(caster, ability) {
  if (BattleState.selectingAbility?.ability?.name === ability.name) {
    clearAbilitySelection();
    resetAbilityButtonsUI();
    return;
  }

  startAbilitySelection(caster, ability);
  highlightSelectedAbilityButton(ability.name);
  showAbilityTooltip(ability);
}

function highlightSelectedAbilityButton(abilityName) {
  const allBtns = document.querySelectorAll('.battle-bottom-ui .fantasy-button.ui-btn');
  allBtns.forEach(btn => {
    if (btn.dataset.abilityName) {
      if (btn.dataset.abilityName === abilityName) {
        btn.classList.add('ability-selected');
        btn.disabled = false;
      } else {
        btn.classList.remove('ability-selected');
        btn.disabled = true;
      }
    }
  });
}

function resetAbilityButtonsUI() {
  const allBtns = document.querySelectorAll('.battle-bottom-ui .fantasy-button.ui-btn');
  allBtns.forEach(btn => {
    btn.classList.remove('ability-selected');
    if (btn.dataset.abilityName) {
      btn.disabled = false;
    }
  });
}

function startAbilitySelection(caster, abilityRaw) {
  unhighlightAllTiles();
  clearAbilitySelection();
  const ability = normalizeAbility(abilityRaw);
  BattleState.selectingAbility = {
    casterId: caster.id,
    casterPos: caster.position.slice(),
    ability
  };
  BattleState.highlightedTiles = [];

  function registerTile(tile, handler) {
    const wrapped = function (ev) {
      ev.stopPropagation();

      if (BattleState.selectingAbility) {
        try {
          handler(ev);
        } catch (err) {
          console.error('Ability handler error', err);
        }
        return;
      }

      const charEl = tile.querySelector('.character-token');
      if (charEl && charEl.dataset?.id) {
        const charId = charEl.dataset.id;
        const char = BattleState.characters.find(c => c.id === charId);
        if (char) {
          try {
            handleCharacterSelection(char, tile);
          } catch (err) {
            console.warn('Character selection error', err);
          }
        }
      }
    };

    tile._abilityTargetHandler = wrapped;
    tile.addEventListener('click', wrapped);
    BattleState.highlightedTiles.push(tile);
  }

  if (ability.targeting === 'single') {
    for (const ch of BattleState.characters) {
      const dist = chebyshevDistance(caster.position, ch.position);
      if (dist > ability.range) continue;

      if (ch.current_hp <= 0 || ch.status === 'dead') continue;

      let allowed = false;
      if (ability.target_type === 'any') allowed = true;
      else if (ability.target_type === 'ally') allowed = isAlly(caster, ch);
      else if (ability.target_type === 'enemy') allowed = !isAlly(caster, ch);

      if (ch.id === caster.id && ability.effects === 'damage') allowed = false;
      if (!allowed) continue;

      const cell = getCellAt(ch.position[0], ch.position[1]);
      if (!cell) continue;

      cell.classList.add(isAlly(caster, ch) ? 'highlight-target-ally' : 'highlight-target-enemy');

      registerTile(cell, () => {
        const eff = computeEffect(caster, ability, ch);
        const payload = {
          abilityName: ability.name,
          casterId: caster.id,
          casterPos: caster.position,
          targetCenter: ch.position,
          affectedTargets: [
            {
              id: ch.id,
              pos: ch.position,
              faction: isAlly(caster, ch) ? 'ally' : 'enemy',
              intendedEffect: eff
            }
          ]
        };
        handleAbilityUse(payload);
        clearAbilitySelection();
      });
    }
  }

  if (ability.targeting === 'area') {
      const area = Number(ability.area) || 0;
      const range = Number(ability.range) || 0;
    
      let potentialCenters = [];
    
      if (range === 0) {
        potentialCenters = [caster.position.slice()];
      } else {
        const cells = Array.from(BattleState.main.querySelectorAll('td.battle-tile'));
        for (const cell of cells) {
          const x = +cell.dataset.x, y = +cell.dataset.y;
          if (chebyshevDistance(caster.position, [x, y]) <= range) {
            potentialCenters.push([x, y]);
          }
        }
      }
    
      for (const [cx, cy] of potentialCenters) {
        const affected = [];
        const affectedTiles = [];
    
        for (let ax = cx - area; ax <= cx + area; ax++) {
          for (let ay = cy - area; ay <= cy + area; ay++) {
            if (chebyshevDistance([cx, cy], [ax, ay]) > area) continue;
    
            const cell = getCellAt(ax, ay);
            if (!cell) continue;
    
            affectedTiles.push(cell);
    
            const targetChar = getCharacterAt(ax, ay);
    
            if (targetChar) {
              const ally = isAlly(caster, targetChar);
              cell.classList.add(ally ? 'highlight-target-ally' : 'highlight-target-enemy');
            } else {
              cell.classList.add('highlight-area-center');
            }
    
            const eff = computeEffect(caster, ability, targetChar);
            if (targetChar && eff) affected.push({ char: targetChar, eff });
          }
        }
    
        for (const tile of affectedTiles) {
          registerTile(tile, () => {
            const payload = {
              abilityName: ability.name,
              casterId: caster.id,
              casterPos: caster.position,
              targetCenter: [cx, cy],
              affectedTargets: affected.map(a => ({
                id: a.char.id,
                pos: a.char.position,
                faction: isAlly(caster, a.char) ? 'ally' : 'enemy',
                intendedEffect: a.eff
              }))
            };
            handleAbilityUse(payload);
            clearAbilitySelection();
          });
        }
      }
    }

  if (ability.targeting === 'tile') {
    const range = ability.range || 1;

    for (let x = 0; x < GRID_SIZE.cols; x++) {
      for (let y = 0; y < GRID_SIZE.rows; y++) {
        const dist = chebyshevDistance(caster.position, [x, y]);
        if (dist > range) continue;

        const cell = getCellAt(x, y);
        if (!cell) continue;

        const envItem = Object.values(BattleState.environmentItems || {}).find(item =>
          item.position?.[0] === x && item.position?.[1] === y
        );

        if (envItem) {
          cell.classList.add('highlight-target-enemy');

          registerTile(cell, () => {
            const payload = {
              abilityName: ability.name,
              casterId: caster.id,
              casterPos: caster.position,
              targetCenter: [x, y],
              affectedTargets: [],
              environmentTarget: envItem.id
            };
            handleAbilityUse(payload);
            clearAbilitySelection();
          });
        }
      }
    }
  }
}

function computeEffect(caster, ability, target) {
  const ally = isAlly(caster, target);
  const eff = ability.effects.toLowerCase();
  if (eff === 'damage') return ally ? null : 'damage';
  if (eff === 'heal') return ally ? 'heal' : null;
  if (eff.includes('damage') && eff.includes('heal')) return ally ? 'heal' : 'damage';
  return ally ? 'heal' : 'damage';
}

async function updateCharactersWithAnimations(newCharacters) {
    const container = BattleState.main.querySelector('.battle-grid-container');
    if (!container) return;

    const animations = [];

    for (const newChar of newCharacters) {
        const oldChar = BattleState.characters.find(c => c.id === newChar.id);
        const charEl = BattleState.characterElements.get(newChar.id);

        if (newChar.current_hp <= 0 || newChar.status === 'dead') {
            if (charEl) {
                animations.push(new Promise(resolve => {
                    charEl.style.transition = `opacity ${ANIMATION_CONFIG.fadeOutDuration}ms ease-out`;
                    charEl.style.opacity = '0';
                    setTimeout(() => {
                        if (charEl.parentNode) {
                            charEl.parentNode.removeChild(charEl);
                        }
                        BattleState.characterElements.delete(newChar.id);
                        resolve();
                    }, ANIMATION_CONFIG.fadeOutDuration);
                }));
            }
            continue;
        }

        if (!oldChar) {
            const newCharEl = createCharacterElement(newChar);
            const targetCell = container.querySelector(
                `td[data-x="${newChar.position[0]}"][data-y="${newChar.position[1]}"]`
            );

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
            const [oldX, oldY] = oldChar.position;
            const [newX, newY] = newChar.position;

            if (oldX !== newX || oldY !== newY) {
                const fromCell = container.querySelector(`td[data-x="${oldX}"][data-y="${oldY}"]`);
                const toCell = container.querySelector(`td[data-x="${newX}"][data-y="${newY}"]`);

                if (fromCell && toCell) {
                    animations.push(animateCharacterMovement(charEl, fromCell, toCell));
                }
            }

            if (oldChar.current_hp !== newChar.current_hp) {
                const hpBar = charEl.querySelector('.character-hp-bar');
                if (hpBar) {
                    animateHPChange(hpBar, oldChar.current_hp, newChar.current_hp, newChar.max_hp);
                }
            }

            updateCharacterVisualState(charEl, newChar);
        }
    }

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

    await Promise.all(animations);
    BattleState.characters = newCharacters;
}

const updateCharacterVisualState = (charEl, character) => {
    charEl.title = `${character.name} (${character.current_hp}/${character.max_hp} HP)`;
    
    const existingIndicator = charEl.querySelector('.turn-done-indicator');
    if (character.has_moved && character.has_acted) {
        if (!existingIndicator) {
            const indicator = createTurnIndicator();
            charEl.appendChild(indicator);
        }
    } else if (existingIndicator) {
        existingIndicator.remove();
    }
    
    const hpBar = charEl.querySelector('.character-hp-bar');
    if (hpBar) {
        const hpFill = hpBar.querySelector('div');
        if (hpFill) {
            const hpPercentage = Math.max(0, Math.min(100, Math.round((character.current_hp / character.max_hp) * 100)));
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

    if (currentTurn === 'AI') {
        turnStatusEl.textContent = 'Enemy Turn';
        turnStatusEl.style.color = '#F44336';
        turnStatusEl.style.background = 'rgba(244, 67, 54, 0.2)';
    } else {
        turnStatusEl.textContent = 'Your Turn';
        turnStatusEl.style.color = '#4CAF50';
        turnStatusEl.style.background = 'rgba(76, 175, 80, 0.2)';
    }
};

const updateCharacterAvailability = () => {
    const container = BattleState.main.querySelector('.battle-grid-container');
    if (!container) return;

    const currentTurn = BattleState.battleState.current_turn;
    
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

    if (BattleState.currentTurnCharacter && BattleState.selectedPlayerCharacter?.id === BattleState.currentTurnCharacter.id) {
        renderBottomUI();
    }
};

const handleAITurn = async () => {
  if (BattleState.isProcessingAITurn) return;
  BattleState.isProcessingAITurn = true;

  const timeout = setTimeout(() => {
    if (BattleState.isProcessingAITurn) {
      console.warn("AI turn timeout, forcing refresh...");
      handleRefresh();
      BattleState.isProcessingAITurn = false;
    }
  }, 8000);

  try {
    await new Promise(res => setTimeout(res, 1000));
    const aiTurnRes = await BattleState.apiCall('/functions/v1/ai-turn', 'POST', {
      battleId: BattleState.battleId
    });
    const result = await aiTurnRes.json();
    if (!result.success) displayMessage(`AI turn failed: ${result.message}`);
  } catch (err) {
    displayMessage('Error during AI turn. Try manual refresh.');
  } finally {
    clearTimeout(timeout);
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
            filter: grayscale(0.25) opacity(0.8);
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
            <div class="battle-grid-container"></div>
            <div class="battle-top-bar" style="display: flex; justify-content: space-between; align-items: center;">
                <p class="battle-status">${mode.toUpperCase()} — Level ${level}</p>
                <div id="turnStatus" style="width: 25%; text-align: center; font-size: 16px; background: rgba(0,0,0,0.3); border-radius: 4px;">—</div>
            </div>
            <div class="battle-info-panel" id="entityInfoPanel">
                <div style="display: flex; width: 100%; height: 100%; max-height: 15vh; min-height: 15vh;">
                    <div style="width: 25%; display: flex; align-items: center; justify-content: center;">
                        <img id="infoPortrait" src="assets/art/sprites/placeholder.png" style="max-width: 80px; max-height: 80px; object-fit: contain;" />
                    </div>
                    <div class="info-text" style="width: 25%; padding-left: 8px; display: flex; flex-direction: column; justify-content: center;">
                        <h3 id="infoName" style="font-size: 14px;">—</h3>
                        <div id="infoHP" style="font-size: 12px;"></div>
                        <div id="infoStats" style="font-size: 12px;"></div>
                    </div>
                    <div id="statusEffects" style="width: 25%; padding-left: 8px; display: flex; flex-direction: column; justify-content: center; overflow-y: auto;">
                        <div id="buffsContainer" style="margin-bottom: 6px;">
                            <div style="font-size: 12px; color: #4CAF50; margin-bottom: 2px;">Buffs:</div>
                            <div id="buffsList" style="font-size: 9px; color: #90EE90;"></div>
                        </div>
                        <div id="debuffsContainer">
                            <div style="font-size: 12px; color: #F44336; margin-bottom: 2px;">Debuffs:</div>
                            <div id="debuffsList" style="font-size: 9px; color: #FFB6C1;"></div>
                        </div>
                    </div>
                        <div id="envContainer" style="width: 25%; padding-left: 8px; display: flex; flex-direction: column; justify-content: center;">
                            <div style="font-size: 12px; color: #87CEEB; margin-bottom: 2px;">Environment:</div>
                            <div id="envList" style="font-size: 9px; color: #ADD8E6;"></div>
                        </div>
                </div>
            </div>
            <div class="tooltip-container"></div>
            <div class="battle-bottom-ui" style="display: block; width: 100%; margin: auto; position: fixed; bottom: 4px;"></div>
        </div>
    `;

    renderBattleGrid(layoutData.layout);
    renderCharacters();
    createParticles();
    renderEnvironmentItems(BattleState.battleState?.layout_data?.environment_items_pos);

    const turnStatusEl = document.getElementById('turnStatus');
    if (turnStatusEl) {
        turnStatusEl.style.cursor = "pointer";
        turnStatusEl.title = "Click to refresh if frozen";
        turnStatusEl.addEventListener("click", handleRefresh);
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
        width: '100%', maxWidth: '380px', maxHeight: '380px',
        display: 'flex', flexDirection: 'column', margin: '2px', border: '2px solid #c4975a', borderRadius: '4px', aspectRatio: '1 / 1'
    });

    const bgName = layoutJson.background || BattleState.battleState?.background || 'default';
    container.style.backgroundImage = `url(assets/art/backgrounds/${bgName}.png)`;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    const table = document.createElement('table');
    table.className = 'battle-grid-table';
    Object.assign(table.style, {
        borderCollapse: 'collapse', width: '100%', height: '100%', tableLayout: 'fixed'
    });

    for (let y = 0; y < GRID_SIZE.rows; y++) {
        const tr = document.createElement('tr');
        tr.style.height = `${100 / GRID_SIZE.rows}%`;
        
        for (let x = 0; x < GRID_SIZE.cols; x++) {
            const tileDataRaw = tiles[y]?.[x] || 'Plain';
            let tileName, art;

            if (typeof tileDataRaw === 'object' && tileDataRaw !== null) {
                tileName = tileDataRaw.name || 'Plain';
                art = tileDataRaw.art || 'placeholder';
            } else {
                tileName = tileDataRaw;
                const normalized = tileName.toLowerCase().replace(/\s+/g, '_');
                const tileData = BattleState.tileMap.get(normalized);
                art = tileData?.art || 'placeholder';
            }

            const normalized = tileName.toLowerCase().replace(/\s+/g, '_');
            const tileMeta = BattleState.tileMap.get(normalized);

            const td = document.createElement('td');
            td.className = `battle-tile tile-${normalized}`;
            Object.assign(td.dataset, {
                x: x.toString(), y: y.toString(),
                walkable: tileMeta?.walkable ? 'true' : 'false'
            });
            td.title = tileName;

            Object.assign(td.style, {
                width: `${100 / GRID_SIZE.cols}%`,
                padding: '0', margin: '0',
                position: 'relative',
                boxSizing: 'border-box',
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
    
    BattleState.characterElements.clear();
    container.querySelectorAll('.character-token').forEach(token => token.remove());

    BattleState.characters.forEach(char => {
        if (!Array.isArray(char.position) || char.current_hp <= 0) return;

        const [x, y] = char.position;
        const cell = container.querySelector(`td[data-x="${x}"][data-y="${y}"]`);
        if (!cell) return;

        const charEl = createCharacterElement(char);
        cell.appendChild(charEl);
        
        BattleState.characterElements.set(char.id, charEl);
    });
}

function renderEnvironmentItems(layoutEnvItems) {
  const container = BattleState.main.querySelector('.battle-grid-container');
  if (!container) return;

  if (!layoutEnvItems) layoutEnvItems = {};

  const oldItems = BattleState.environmentItems || {};

  Object.keys(oldItems).forEach(id => {
    if (!layoutEnvItems[id]) {
      const el = container.querySelector(`.environment-item[data-item-id="${id}"]`);
      if (el) el.remove();
    }
  });

  Object.values(layoutEnvItems).forEach(item => {
    const existing = container.querySelector(`.environment-item[data-item-id="${item.id}"]`);
    if (!existing && Array.isArray(item.position)) {
      const [x, y] = item.position;
      const cell = container.querySelector(`td[data-x="${x}"][data-y="${y}"]`);
      if (cell) cell.appendChild(createEnvironmentItemElement(item));
    }
  });

  BattleState.environmentItems = { ...layoutEnvItems };
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
    
    if (char.portrait && char.portrait !== 'none') {
        img.src = `assets/art/portraits/${char.portrait}.png`;
        img.onerror = () => {
            img.src = 'assets/art/portraits/placeholder.png';
        };
    } else {
        img.src = 'assets/art/portraits/placeholder.png';
    }
    
    img.alt = char.name;
    
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

function createEnvironmentItemElement(item) {
    const el = document.createElement('div');
    el.className = `environment-item item-${(item.sprite || 'unknown').toLowerCase()}`;
    el.dataset.itemId = item.id;
    el.dataset.walkable = item.walkable ? 'true' : 'false';
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.zIndex = '5';
    el.title = item.name + (item.character_name ? ` — ${item.character_name}` : '');

    const img = document.createElement('img');
    const sprite = item.sprite ? item.sprite.toLowerCase() : 'placeholder';
    img.src = `assets/art/environment/${sprite}.png`;
    img.alt = item.name || 'Item';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.opacity = item.walkable ? '0.95' : '1';
    el.appendChild(img);

    return el;
}

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
    if (BattleState.selectingAbility) return; 

    const clickedTileEl = event.currentTarget;
    const targetX = parseInt(clickedTileEl.dataset.x);
    const targetY = parseInt(clickedTileEl.dataset.y);

    const charInCell = BattleState.characters.find(c => 
        Array.isArray(c.position) && 
        c.position[0] === targetX && 
        c.position[1] === targetY &&
        c.current_hp > 0 && 
        c.status !== 'dead'
    );

    const itemsInCell = Object.values(BattleState.environmentItems).filter(it =>
        Array.isArray(it.position) &&
        it.position[0] === targetX &&
        it.position[1] === targetY
    );

    if (BattleState.battleState?.current_turn === 'AI') {
        displayMessage('Please wait for AI turn to complete.');
        return;
    }

    if (charInCell) {
        handleCharacterSelection(charInCell, clickedTileEl);
    } else {
        if (BattleState.selectedPlayerCharacter && clickedTileEl.classList.contains('highlight-walkable')) {
            attemptMoveCharacter(BattleState.selectedPlayerCharacter, targetX, targetY);
        } else {
            unhighlightAllTiles();
            
            if (BattleState.selectedCharacterEl) {
                BattleState.selectedCharacterEl.classList.remove('character-selected');
                BattleState.selectedCharacterEl = null;
            }
            
            BattleState.selectedPlayerCharacter = null;
            
            const tileName = clickedTileEl.className.split(' ').find(cls => cls.startsWith('tile-'));
            const tileKey = tileName ? tileName.replace('tile-', '') : 'plain';
            const tileData = BattleState.tileMap.get(tileKey);
            
            showEntityInfo({ 
                tile: tileData || { 
                    name: 'Unknown', walkable: false, vision_block: false, art: 'placeholder' 
                } 
            });
        }
    }

    const envList = document.getElementById('envList');
    if (envList) envList.innerHTML = '';
    
    itemsInCell.forEach(item => {
        showEntityInfo({ item });
    });
}, 150);

const handleCharacterSelection = (character, tileEl) => {
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
        renderBottomUI();
    } else {
        BattleState.selectedPlayerCharacter = null;
        BattleState.selectedCharacterEl = null;
        unhighlightAllTiles();
        const ui = BattleState.main.querySelector('.battle-bottom-ui');
        if (ui) ui.innerHTML = '';
    }
    
    showEntityInfo(character);
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
                const envItemEl = tileEl.querySelector('.environment-item');
                if (envItemEl && envItemEl.dataset.walkable !== 'true') {
                    return;
                }
                
                const isOccupied = BattleState.characters.some(c => 
                    Array.isArray(c.position) && 
                    c.position[0] === newX && 
                    c.position[1] === newY &&
                    c.current_hp > 0 && 
                    c.status !== 'dead'
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

    document.querySelectorAll('.character-selected').forEach(el => {
        el.classList.remove('character-selected');
    });
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
        Array.isArray(c.position) && 
        c.position[0] === targetX && 
        c.position[1] === targetY &&
        c.current_hp > 0 && 
        c.status !== 'dead'
    );
    
    if (isOccupied) {
        displayMessage('That tile is already occupied by another character.');
        unhighlightAllTiles();
        return;
    }

    const charEl = BattleState.characterElements.get(character.id);
    const fromCell = container.querySelector(`td[data-x="${startX}"][data-y="${startY}"]`);
    const toCell = targetTileEl;
    
    if (charEl && fromCell && toCell) {
        await animateCharacterMovement(charEl, fromCell, toCell);
    }

    character.position = [targetX, targetY];
    BattleState.isMoveQueued = true;
    unhighlightAllTiles();

    // if (BattleState.selectedCharacterEl) {
    //     BattleState.selectedCharacterEl.classList.remove('character-selected');
    //     BattleState.selectedCharacterEl = null;
    // }
    // BattleState.selectedPlayerCharacter = null;
};

async function getAbility(abilityName) {
    if (BattleState.abilityCache.has(abilityName)) {
        return BattleState.abilityCache.get(abilityName);
    }
    
    try {
        const res = await fetch(`/api/abilities/${encodeURIComponent(abilityName)}`);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        
        const abilityData = await res.json();
        const ability = Array.isArray(abilityData) ? abilityData[0] : abilityData;
        
        if (ability) {
            BattleState.abilityCache.set(abilityName, ability);
            return ability;
        }
    } catch (err) {
        console.error('Failed fetching ability', abilityName, err);
        return {
            name: abilityName,
            range: 1,
            area: 0,
            targeting: 'single',
            target_type: 'enemy',
            effects: 'damage',
            description: 'Ability data not available'
        };
    }
    
    return null;
}

async function renderBottomUI() {
    const ui = BattleState.main.querySelector('.battle-bottom-ui');
    ui.innerHTML = '';
    
    if (!BattleState.selectedPlayerCharacter) return;
    
    const currentChar = BattleState.selectedPlayerCharacter;
    const fragment = document.createDocumentFragment();

    BattleState.characterAbilities = BattleState.characterAbilities || {};
    let abilityObjs = {};

    if (BattleState.characterAbilities[currentChar.id]) {
        abilityObjs = BattleState.characterAbilities[currentChar.id];
    } else {
        abilityObjs = { basic: [], passives: [], ultimate: null };

        const charAbilities = BattleState.battleState?.player_abilities?.[currentChar.id] || {};

        for (const abilityName of Object.keys(charAbilities.basic || {})) {
            const ability = await getAbility(abilityName);
            if (ability) abilityObjs.basic.push(ability);
        }

        const passiveNames = Object.keys(charAbilities.passive || {});
        for (let i = 0; i < Math.min(passiveNames.length, 2); i++) {
            const ability = await getAbility(passiveNames[i]);
            if (ability) abilityObjs.passives.push(ability);
        }

        const ultimateNames = Object.keys(charAbilities.ultimate || {});
        if (ultimateNames[0]) {
            abilityObjs.ultimate = await getAbility(ultimateNames[0]);
        }

        BattleState.characterAbilities[currentChar.id] = abilityObjs;
    }

    for (let row = 0; row < 2; row++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'battle-ui-row';

        for (let i = 0; i < 5; i++) {
            const btnIndex = row * 5 + i;
            const btn = document.createElement('button');
            btn.className = 'fantasy-button ui-btn';

            let ability = null;

            if (btnIndex >= 0 && btnIndex <= 3) {
                ability = abilityObjs.basic[btnIndex] || null;
            } else if (btnIndex === 4) {
                ability = abilityObjs.ultimate;
            }

            if (ability) {
                if (ability.sprite) {
                    btn.innerHTML = `<img src="assets/art/abilities/${ability.sprite}.png" alt="${ability.name}" style="width:100%;height:100%;">`;
                } else {
                    btn.textContent = ability.name || 'Unknown';
                }
                btn.title = ability.name;
                btn.dataset.abilityName = ability.name;
                btn.disabled = false;
                btn.addEventListener('click', debounce(() => {
                    const caster = BattleState.selectedPlayerCharacter;
                    if (caster) toggleAbilitySelection(caster, ability);
                }, 150));
            } else if (btnIndex === 5) {
                const consumableName = currentChar?.equipped_items?.equipped_consumable;
                if (consumableName && consumableName !== 'none') {
                    const consumableAbility = await getAbility(consumableName);
                    if (consumableAbility) {
                        const itemSprite = consumableName.replace(/\s+/g, '');
                        btn.innerHTML = `<img src="assets/art/recipes/${itemSprite}.png" alt="${consumableName}" style="width:36px;height:36px;object-fit:contain;">`;
                        btn.id = 'consumableButton';
                        btn.title = consumableName;
                        btn.dataset.abilityName = consumableAbility.name;
                        btn.disabled = false;
                        btn.addEventListener('click', debounce(() => {
                            const caster = BattleState.selectedPlayerCharacter;
                            if (caster) toggleAbilitySelection(caster, consumableAbility);
                        }, 150));
                    } else {
                        btn.textContent = 'No Item';
                        btn.disabled = true;
                    }
                } else {
                    btn.textContent = 'No Item';
                    btn.disabled = true;
                }
            } else if (btnIndex === 6 || btnIndex === 7) {
                const passive = abilityObjs.passives[btnIndex - 6] || null;
                if (passive) {
                    if (passive.sprite) {
                        btn.innerHTML = `<img src="assets/art/abilities/${passive.sprite}.png" alt="${passive.name}" style="width:100%;height:100%;">`;
                    } else {
                        btn.textContent = passive.name || 'Passive';
                    }
                    btn.title = passive.name;
                } else {
                    btn.textContent = 'Passive';
                    btn.disabled = true;
                }
            } else if (btnIndex === 8) {
                btn.textContent = 'Interact';
                btn.disabled = true;
                btn.style.opacity = '0.5';
            } else if (btnIndex === 9) {
                btn.textContent = 'End Turn';
                btn.id = 'endTurnButtonBottom';
                btn.disabled = false;
            } else {
                btn.textContent = `Btn ${btnIndex}`;
                btn.disabled = true;
            }

            rowDiv.appendChild(btn);
        }
        fragment.appendChild(rowDiv);
    }

    ui.appendChild(fragment);

    const endTurnBtn = document.getElementById('endTurnButtonBottom');
    if (endTurnBtn) endTurnBtn.addEventListener('click', debounce(handleEndTurn, 500));
}

const handleAbilityUse = async (abilityPayload) => {
    const activeCharacter = BattleState.selectedPlayerCharacter;
    if (!activeCharacter) {
        displayMessage('No character selected to cast ability.');
        return;
    }

    if (!BattleState.battleId || !activeCharacter.id || !Array.isArray(activeCharacter.position)) {
        displayMessage('Missing battle or character data.');
        return;
    }

    activeCharacter.pendingAction = {
        type: 'ability',
        data: abilityPayload
    };

    hideAbilityTooltip();

    try {
        const res = await BattleState.apiCall('/functions/v1/combined-action-end', 'POST', {
            battleId: BattleState.battleId,
            characterId: activeCharacter.id,
            currentPosition: activeCharacter.originalPosition || activeCharacter.position,
            targetPosition: activeCharacter.position,
            action: activeCharacter.pendingAction
        });

        const result = await res.json();
        if (!result.success) {
            displayMessage(`Error: ${result.message}`, 'error');
            return;
        }

        BattleState.currentTurnCharacter = null;
        BattleState.selectedPlayerCharacter = null;
        BattleState.selectedCharacterEl = null;
        BattleState.isMoveQueued = false;
        unhighlightAllTiles();

    } catch (err) {
        console.error('Ability use error:', err);
        displayMessage('Error completing ability. Please try again.', 'error');
    }
};

const handleEndTurn = async () => {
    const activeCharacter = BattleState.selectedPlayerCharacter;
    if (!activeCharacter) {
        displayMessage('No character selected to end turn.');
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

    hideAbilityTooltip();

    try {
        const res = await BattleState.apiCall('/functions/v1/combined-action-end', 'POST', {
            battleId: BattleState.battleId,
            characterId,
            currentPosition,
            targetPosition,
            action
        });

        const result = await res.json();

        if (!result.success) {
            displayMessage(`Error: ${result.message}`, 'error');
            return;
        }

        BattleState.currentTurnCharacter = null;
        BattleState.selectedPlayerCharacter = null;
        BattleState.selectedCharacterEl = null;
        BattleState.isMoveQueued = false;
        unhighlightAllTiles();

    } catch (err) {
        console.error('End turn error:', err);
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

    try {
        const res = await BattleState.apiCall('/functions/v1/use-consumable', 'POST', requestData);

        const result = await res.json();

        if (!result.success) {
            displayMessage(`Error using ${consumable}: ${result.message}`, 'error');
            return;
        }

        displayMessage(`Used ${consumable}!`, 'success');
        
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
    const envList = document.getElementById('envList');

    if (!entity) {
        clearEntityInfo();
        return;
    }

    if (entity.type === 'player' || entity.type === 'enemy') {
        nameEl.textContent = entity.name || 'Unnamed';
        displayCharacterInfo(entity, portrait, hpEl, statsEl, buffsList, debuffsList);
        if (envList) envList.innerHTML = '';
        return;
    }

    if (entity.tile) {
        nameEl.textContent = entity.tile.name || 'Unknown Tile';
        displayTileInfo(entity.tile, portrait, hpEl, statsEl, buffsList, debuffsList);
        if (envList) envList.innerHTML = '';
        return;
    }

    if (entity.item && envList) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.marginBottom = '2px';

        const icon = document.createElement('img');
        const sprite = entity.item.sprite ? entity.item.sprite.toLowerCase() : 'placeholder';
        icon.src = `assets/art/environment/${sprite}.png`;
        icon.alt = entity.item.name || 'Item';
        Object.assign(icon.style, {
            width: '14px',
            height: '14px',
            marginRight: '4px',
            objectFit: 'contain'
        });

        const label = document.createElement('span');
        label.textContent = entity.item.name + (entity.item.character_name ? ` — ${entity.item.character_name}` : '');

        wrapper.appendChild(icon);
        wrapper.appendChild(label);
        envList.appendChild(wrapper);
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
    
    const stats = entity.stats || {};
    
    hpEl.innerHTML = `
        <div style="font-size: 12px; line-height: 1.2;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <div style="display: flex; flex: 1;">
                    <span style="font-weight: bold;">HP:</span>
                    <span id="hp-value" style="margin-left: 4px; color: ${hpColor}">${currentHp}/${maxHp}</span>
                </div>
                <div style="display: flex; flex: 1; justify-content: flex-end;">
                    <span style="color: #CD853F; font-weight: bold;">VIT:</span>
                    <span style="margin-left: 4px;">${stats.vitality || 0}</span>
                </div>
            </div>
        </div>
    `;

    statsEl.innerHTML = `
        <div style="font-size: 12px; line-height: 1.2;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <div style="display: flex; flex: 1;">
                    <span style="color: #D4AF37; font-weight: bold;">STR:</span>
                    <span style="margin-left: 4px;">${stats.strength || 0}</span>
                </div>
                <div style="display: flex; flex: 1; justify-content: flex-end;">
                    <span style="color: #B8860B; font-weight: bold;">DEX:</span>
                    <span style="margin-left: 4px;">${stats.dexterity || 0}</span>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <div style="display: flex; flex: 1;">
                    <span style="color: #F4A460; font-weight: bold;">INT:</span>
                    <span style="margin-left: 4px;">${stats.intellect || 0}</span>
                </div>
                <div style="display: flex; flex: 1; justify-content: flex-end;">
                    <span style="color: #DAA520; font-weight: bold;">SPR:</span>
                    <span style="margin-left: 4px;">${stats.spirit || 0}</span>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between;">
                <div style="display: flex; flex: 1;">
                    <span style="color: #8B7355; font-weight: bold;">ARM:</span>
                    <span style="margin-left: 4px;">${stats.armor || 0}</span>
                </div>
                <div style="display: flex; flex: 1; justify-content: flex-end;">
                    <span style="color: #4682B4; font-weight: bold;">RES:</span>
                    <span style="margin-left: 4px;">${stats.resistance || 0}</span>
                </div>
            </div>
        </div>
    `;

    buffsList.innerHTML = "";
    if (entity.buffs && Object.keys(entity.buffs).length > 0) {
        for (const [buffName, buffData] of Object.entries(entity.buffs)) {
            const stacks = buffData.stacks ?? 1;
            const duration = buffData.duration ?? "∞";
            const buffEl = document.createElement("div");
            buffEl.style.cssText = "display:flex;justify-content:space-between;margin-bottom:1px;padding:1px 3px;background:rgba(76,175,80,0.1);border-radius:2px;font-size:11px;";
            buffEl.innerHTML = `
                <span>${buffName} (x${stacks})</span>
                <span style="color:#90EE90;">${duration}t</span>
            `;
            buffsList.appendChild(buffEl);
        }
    } else {
        buffsList.innerHTML = '<div style="color:#666;font-style:italic;">None</div>';
    }

    debuffsList.innerHTML = "";
    if (entity.debuffs && Object.keys(entity.debuffs).length > 0) {
        for (const [debuffName, debuffData] of Object.entries(entity.debuffs)) {
            const stacks = debuffData.stacks ?? 1;
            const duration = debuffData.duration ?? "∞";
            const debuffEl = document.createElement("div");
            debuffEl.style.cssText = "display:flex;justify-content:space-between;margin-bottom:1px;padding:1px 3px;background:rgba(244,67,54,0.1);border-radius:2px;font-size:11px;";
            debuffEl.innerHTML = `
                <span>${debuffName} (x${stacks})</span>
                <span style="color:#FFB6C1;">${duration}t</span>
            `;
            debuffsList.appendChild(debuffEl);
        }
    } else {
        debuffsList.innerHTML = '<div style="color:#666;font-style:italic;">None</div>';
    }

    if (entity.portrait && entity.portrait !== 'none') {
        portrait.src = `assets/art/portraits/${entity.portrait}.png`;
        portrait.onerror = () => {
            portrait.src = 'assets/art/portraits/placeholder.png';
        };
    } else {
        portrait.src = 'assets/art/portraits/placeholder.png';
    }
};

function showAbilityTooltip(ability) {
    hideAbilityTooltip();
    
    const tooltipContainer = BattleState.main.querySelector('.tooltip-container');
    if (!tooltipContainer) return;
    
    const tooltip = document.createElement('div');
    tooltip.className = 'ability-tooltip';
    tooltip.id = 'abilityTooltip';
    
    const normalizedAbility = normalizeAbility(ability);
    
    tooltip.innerHTML = `
        <div class="ability-tooltip-header">
            <div class="ability-tooltip-name">${normalizedAbility.name}</div>
        </div>
        <div class="ability-tooltip-body">
            <div class="ability-tooltip-stat">
                <span class="ability-tooltip-stat-label">Range:</span>
                <span class="ability-tooltip-stat-value ability-tooltip-range">${normalizedAbility.range}</span>
            </div>
            <div class="ability-tooltip-stat">
                <span class="ability-tooltip-stat-label">Area:</span>
                <span class="ability-tooltip-stat-value ability-tooltip-area">${normalizedAbility.area}</span>
            </div>
            <div class="ability-tooltip-stat">
                <span class="ability-tooltip-stat-label">Targeting:</span>
                <span class="ability-tooltip-stat-value ability-tooltip-targeting">${capitalizeFirst(normalizedAbility.targeting)}</span>
            </div>
            <div class="ability-tooltip-stat">
                <span class="ability-tooltip-stat-label">Target Type:</span>
                <span class="ability-tooltip-stat-value">${capitalizeFirst(normalizedAbility.target_type)}</span>
            </div>
            <div class="ability-tooltip-stat">
                <span class="ability-tooltip-stat-label">Effects:</span>
                <span class="ability-tooltip-stat-value ability-tooltip-effects">${capitalizeFirst(normalizedAbility.effects)}</span>
            </div>
        </div>
          ${normalizedAbility.description ? 
                `<div class="ability-tooltip-description">${normalizedAbility.description}</div>` : 
                ''
            }
    `;
    
    tooltipContainer.appendChild(tooltip);
    
    requestAnimationFrame(() => {
        tooltip.classList.add('visible');
    });
}

function hideAbilityTooltip() {
    const existingTooltip = document.getElementById('abilityTooltip');
    if (existingTooltip) {
        existingTooltip.classList.remove('visible');
        setTimeout(() => {
            if (existingTooltip.parentNode) {
                existingTooltip.remove();
            }
        }, 300);
    }
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

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
        isProcessingAITurn: false, isMoveQueued: false
    });
    
    BattleState.tileMap.clear();
    BattleState.characterElements.clear();
    
    const existingMessage = document.querySelector('.custom-message-box');
    if (existingMessage) existingMessage.remove();

    hideAbilityTooltip();
}

function navigateToCastle() {
  window.gameAuth.loadModule('castle');
}

async function assignLoot(battleState) {
  const battle_id = battleState.id;
  
  try {
    const response = await fetch('/api/battle/assign-loot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ battle_id })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Loot assigned successfully');
      return data;
    } else {
      if (data.error === 'Loot already assigned for this battle') {
        console.log('ℹ️ Loot was already assigned previously');
        return { success: true, alreadyAssigned: true };
      }
      console.error('Failed to assign loot:', data.error);
      return null;
    }
  } catch (error) {
    console.error('Error assigning loot:', error);
    return null;
  }
}

function showBattleResultModal(status) {
  const modal = document.createElement('div');
  modal.className = 'battle-result-modal';
  modal.innerHTML = `
    <div class="battle-result-content">
      <h2>${status === 'victory' ? 'Victory!' : 'Defeat'}</h2>
      <p>${status === 'victory'
        ? 'You have defeated the enemies!'
        : 'Your party was defeated...'}</p>
      <button id="resultConfirmBtn">Return to Castle</button>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('resultConfirmBtn').addEventListener('click', () => {
    modal.remove();
    navigateToCastle();
  });
}

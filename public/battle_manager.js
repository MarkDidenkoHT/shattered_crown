let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _areaType;
let _layoutData;

export async function loadModule(main, { apiCall, getCurrentProfile }) {
    console.log('[BATTLE] --- Starting loadModule for Battle Manager ---');
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;

    _profile = _getCurrentProfile();
    if (!_profile) {
        console.error('[BATTLE] No profile found.');
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login');
        return;
    }

    // We expect window.battleContext.areaType set by embark.js
    _areaType = window.battleContext?.areaType;
    if (!_areaType) {
        console.error('[BATTLE] No area type set.');
        displayMessage('Invalid battle entry. Returning to castle.');
        window.gameAuth.loadModule('castle');
        return;
    }

    // Determine level
    let level = 1;
    if (_areaType !== 'PvP') {
        level = _profile.progress?.[_areaType] || 1;
        console.log(`[BATTLE] Loading ${_areaType} level ${level}`);
    } else {
        level = Math.floor(Math.random() * 10) + 1;
        console.log(`[BATTLE] Loading PvP layout level ${level}`);
    }

    await loadLayout(_areaType, level);
    renderBattleScene();

    // Load character and enemy data (placeholders for now)
    await window.characterData.loadCharacters();
    await window.characterData.loadEnemies();

    // Setup turn manager (placeholder)
    window.turnManager.startTurnManager();

    console.log('[BATTLE] --- Battle Manager fully initialized ---');
}

async function loadLayout(name, level) {
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/layouts?name=eq.${name}&level=eq.${level}&select=*`);
        const layouts = await response.json();

        if (!layouts || layouts.length === 0) {
            console.error('[BATTLE] No layout found.');
            displayMessage('No layout found for this area. Returning to castle.');
            window.gameAuth.loadModule('castle');
            return;
        }

        _layoutData = layouts[0];
        console.log('[BATTLE] Layout data:', _layoutData);
    } catch (error) {
        console.error('[BATTLE] Error loading layout:', error);
        displayMessage('Error loading layout. Returning to castle.');
        window.gameAuth.loadModule('castle');
    }
}

function renderBattleScene() {
    _main.innerHTML = `
        <div class="main-app-container">
            <div class="battle-top-bar">
                <button class="fantasy-button battle-settings-btn">Settings</button>
                <button class="fantasy-button battle-exit-btn">Exit</button>
            </div>
            <div class="battle-grid"></div>
            <div class="battle-bottom-ui">
                <div class="button-row"></div>
                <div class="button-row"></div>
            </div>
        </div>
    `;

    renderGrid();
    setupUI();
}

function renderGrid() {
    const gridContainer = _main.querySelector('.battle-grid');
    const tiles = _layoutData.layout.tiles;

    gridContainer.style.display = 'grid';
    gridContainer.style.gridTemplateRows = `repeat(${tiles.length}, 1fr)`;
    gridContainer.style.gridTemplateColumns = `repeat(${tiles[0].length}, 1fr)`;
    gridContainer.style.width = '100%';
    gridContainer.style.height = '100%';

    tiles.forEach((row, rowIndex) => {
        row.forEach((tileName, colIndex) => {
            const tile = document.createElement('div');
            tile.className = 'battle-tile';
            tile.dataset.row = rowIndex;
            tile.dataset.col = colIndex;
            tile.style.backgroundImage = `url('assets/art/tiles/${tileName.toLowerCase()}.png')`;
            tile.style.backgroundSize = 'cover';
            tile.style.border = '1px solid rgba(0,0,0,0.2)';
            gridContainer.appendChild(tile);
        });
    });

    console.log('[BATTLE] Grid rendered.');
}

function setupUI() {
    const buttonRows = _main.querySelectorAll('.button-row');

    // Top row
    for (let i = 0; i < 5; i++) {
        const btn = document.createElement('button');
        btn.className = 'fantasy-button';
        btn.innerText = `Skill ${i + 1}`;
        buttonRows[0].appendChild(btn);
    }

    // Bottom row
    for (let i = 0; i < 5; i++) {
        const btn = document.createElement('button');
        btn.className = 'fantasy-button';
        btn.innerText = `Action ${i + 1}`;
        buttonRows[1].appendChild(btn);
    }

    _main.querySelector('.battle-settings-btn').addEventListener('click', () => {
        displayMessage('Settings placeholder.');
    });

    _main.querySelector('.battle-exit-btn').addEventListener('click', () => {
        displayMessage('Exiting battle...');
        window.gameAuth.loadModule('castle');
    });
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

let _main;
let _getCurrentProfile;
let _profile;
let _playerCharacters = [];
let _currentErrand = null;
let _bankItems = [];

export async function loadModule(main, {refreshTranslations, getCurrentProfile }) {
    _main = main;
    _getCurrentProfile = getCurrentProfile;
    
    _profile = _getCurrentProfile();
    if (!_profile) {
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login');
        return;
    }

    _main.innerHTML = `
        <div class="main-app-container castle-container">
            <div class="particles"></div>
            
            <div class="top-right-buttons">
                <button class="fantasy-button settings-btn" data-action="roadmap">Roadmap</button>
                <button class="fantasy-button settings-btn" data-action="support">Support</button>
                <button class="fantasy-button settings-btn" data-action="settings">Settings</button>
            </div>

            <div id="errand-display"></div>

            <div class="castle-scene">
                <img src="assets/art/castle/main_castle.png" alt="Main Castle" class="castle-image">
                
                <div class="building-overlay">
                    <div class="building-hotspot inn-hotspot" data-building="inn"></div>
                    <div class="building-hotspot altar-hotspot" data-building="altar"></div>
                    </div>
            </div>
            <div class="bottom-navigation">
                <button class="fantasy-button nav-btn" data-action="embark">Embark</button>
                <button class="fantasy-button nav-btn" data-action="trade">Trade</button>
                <button class="fantasy-button nav-btn" data-action="bank">Bank</button>
                <button class="fantasy-button nav-btn" data-action="characters">Characters</button>
                <button class="fantasy-button nav-btn" data-action="crafting">Crafting</button>
                <button class="fantasy-button nav-btn" data-action="altar-nav">Altar</button>
            </div>
        </div>
    `;

    addCastleStyles();
    createParticles();

    await fetchPlayerCharacters();
    await fetchErrand();
    renderCastleScene();
    renderErrand();
    setupInteractions();

    if (typeof refreshTranslations === 'function') {
        refreshTranslations();
    }
}

async function fetchErrand() {
    try {
        const response = await fetch(`/api/errand/${_profile.id}`);
        if (!response.ok) throw new Error("Failed to fetch errand");

        const data = await response.json();
        _currentErrand = data.hasErrand ? data.errand : null;

        if (_currentErrand) {
            const bankResponse = await fetch(`/api/bank/items/${_profile.id}`);
            if (!bankResponse.ok) throw new Error("Failed to fetch bank items");
            const allBankItems = await bankResponse.json();
            _bankItems = allBankItems.filter(item => item.source === 'bank');
        }
    } catch (error) {
        console.error("fetchErrand error:", error);
    }
}

function renderErrand() {
    const errandDisplay = _main.querySelector('#errand-display');
    if (!errandDisplay) return;

    if (!_currentErrand) {
        errandDisplay.innerHTML = '';
        return;
    }

    const itemRequirement = _currentErrand.item_requirement || {};
    const itemProvided = _currentErrand.item_provided || {};

    const bankMap = {};
    _bankItems.forEach(item => {
        bankMap[item.item] = item.amount || 0;
    });

    const requiredItems = Object.entries(itemRequirement).map(([itemName, requiredAmount]) => {
        const playerAmount = bankMap[itemName] || 0;
        const hasEnough = playerAmount >= requiredAmount;
        return { itemName, requiredAmount, playerAmount, hasEnough };
    });

    const providedItems = Object.entries(itemProvided).map(([itemName, amount]) => {
        return { itemName, amount };
    });

    const canComplete = requiredItems.every(item => item.hasEnough);

    errandDisplay.innerHTML = `
    <div class="errand-container">
        <div class="errand-title">Exchange Available</div>
        <div class="errand-content">
            <div class="errand-column">
                <div class="errand-subtitle">Give</div>
                <div class="errand-items">
                    ${requiredItems.map(item => `
                        <div class="errand-item ${item.hasEnough ? '' : 'insufficient'}">
                            <img src="assets/art/recipes/${item.itemName.replace(/\s+/g, '')}.png" alt="${item.itemName}" class="errand-item-sprite">
                            <div class="errand-item-amount ${item.hasEnough ? 'enough' : 'not-enough'}">${item.playerAmount}/${item.requiredAmount}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="errand-arrow">→</div>
            
            <div class="errand-column">
                <div class="errand-subtitle">Receive</div>
                <div class="errand-items">
                    ${providedItems.map(item => `
                        <div class="errand-item reward">
                            <img src="assets/art/recipes/${item.itemName.replace(/\s+/g, '')}.png" alt="${item.itemName}" class="errand-item-sprite">
                            <div class="errand-item-amount reward-amount">+${item.amount}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <button class="fantasy-button errand-complete-btn" ${canComplete ? '' : 'disabled'} data-action="complete-errand">
            ${canComplete ? 'Complete Exchange' : 'Insufficient Items'}
        </button>
    </div>
`;

    setTimeout(() => {
        const container = errandDisplay.querySelector('.errand-container');
        if (container) {
            container.classList.add('errand-visible');
        }
    }, 50);

    const completeBtn = errandDisplay.querySelector('.errand-complete-btn');
    if (completeBtn && canComplete) {
        completeBtn.addEventListener('click', handleCompleteErrand);
    }
}

async function handleCompleteErrand() {
    const completeBtn = _main.querySelector('.errand-complete-btn');
    if (completeBtn) {
        completeBtn.disabled = true;
        completeBtn.textContent = 'Completing...';
    }

    try {
        const response = await fetch(`/api/errand/complete/${_profile.id}`, {
            method: 'POST'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to complete errand');
        }

        const result = await response.json();
        displayMessage(`Errand completed! You received: ${Object.entries(result.itemsReceived).map(([item, amount]) => `${amount}x ${item}`).join(', ')}`);

        await fetchErrand();
        renderErrand();

    } catch (error) {
        console.error("handleCompleteErrand error:", error);
        displayMessage(`Failed to complete errand: ${error.message}`);
        
        if (completeBtn) {
            completeBtn.disabled = false;
            completeBtn.textContent = 'Complete';
        }
    }
}

async function fetchPlayerCharacters() {
    try {
        const response = await fetch(`/api/characters/${_profile.id}`);
        if (!response.ok) throw new Error("Failed to fetch characters");

        _playerCharacters = await response.json();
    } catch (error) {
        console.error("fetchPlayerCharacters error:", error);
        displayMessage('Failed to load your champions. Please try again.');
    }
}

function renderCastleScene() {
    const buildingOverlay = _main.querySelector('.building-overlay');

    buildingOverlay.querySelectorAll('.profession-hotspot').forEach(el => el.remove());
    const professionPositions = {
        'blacksmith': { x: '50%', y: '60%', width: '10%', height: '15%' },
        'alchemist': { x: '30%', y: '55%', width: '12%', height: '18%' },
    };

    _playerCharacters.forEach(character => {
        if (character.professions && character.professions.name) {
            const professionName = character.professions.name.toLowerCase();
            if (professionPositions[professionName]) {
                const pos = professionPositions[professionName];
                const professionHotspot = document.createElement('div');
                professionHotspot.className = `building-hotspot profession-hotspot ${professionName}-hotspot`;
                professionHotspot.dataset.building = professionName;
                professionHotspot.dataset.characterId = character.id;
                professionHotspot.style.left = pos.x;
                professionHotspot.style.top = pos.y;
                professionHotspot.style.width = pos.width;
                professionHotspot.style.height = pos.height;
                buildingOverlay.appendChild(professionHotspot);
            }
        }
    });
}

function setupInteractions() {
    _main.querySelectorAll('.top-right-buttons .settings-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            
            if (action === 'settings') {
                window.gameAuth.loadModule('settings');
            } else if (action === 'support') {
                window.gameAuth.loadModule('ticketing_system');
            } else if (action === 'roadmap') {
                 showRoadmapModal();
            }    
        });
    });

    _main.querySelectorAll('.bottom-navigation .nav-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            
            if (action === 'characters') {
                window.gameAuth.loadModule('character_manager'); 
            } else if (action === 'trade') {
                window.gameAuth.loadModule('auction');
            } else if (action === 'bank') {
                window.gameAuth.loadModule('bank');
            } else if (action === 'embark') {
                window.gameAuth.loadModule('embark');
            } else if (action === 'crafting') {
                window.gameAuth.loadModule('crafting_manager');
            } else if (action === 'altar-nav') {
                window.gameAuth.loadModule('altar');
            } else {
                displayMessage(`${action.charAt(0).toUpperCase() + action.slice(1)} functionality coming soon!`);
            }
        });
    });
}

function createParticles() {
    const particlesContainer = _main.querySelector('.particles');
    if (!particlesContainer) {
        return;
    }

    particlesContainer.innerHTML = '';

    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 6 + 's';
        particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
        particlesContainer.appendChild(particle);
    }
}

function displayMessage(message) {
    const messageBox = document.createElement('div');
    messageBox.className = 'custom-message-box';
    messageBox.innerHTML = `
        <div class="message-content">
            <p>${message}</p>
            <button class="fantasy-button message-ok-btn">OK</button>
        </div>
    `;
    document.body.appendChild(messageBox);

    messageBox.querySelector('.message-ok-btn').addEventListener('click', () => {
        messageBox.remove();
    });
}

function showRoadmapModal() {
    const modal = document.createElement('div');
    modal.className = 'roadmap-modal';
    modal.innerHTML = `
        <div class="roadmap-modal-content">
            <div class="roadmap-header">
                <h2>Development Roadmap</h2>
                <button class="roadmap-close-btn">&times;</button>
            </div>
            <div class="roadmap-body">

                <div class="roadmap-item">
                    <div class="roadmap-date">15 November 2025</div>
                    <div class="roadmap-feature">Exp, leveling and progressive score systems! Environmental tools and interactions!</div>
                </div>

                <div class="roadmap-item">
                    <div class="roadmap-date">30 November 2025</div>
                    <div class="roadmap-feature">More levels for existing PVE content and more monsters!</div>
                </div>

                <div class="roadmap-item">
                    <div class="roadmap-date">15 December 2025</div>
                    <div class="roadmap-feature">PvE - 1 new region, new loot, crafting - 2 new professions!</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">30 December 2025</div>
                    <div class="roadmap-feature">New Gods!</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">January 2026</div>
                    <div class="roadmap-feature">Trials - multiplayer PvE system!</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">February 2026</div>
                    <div class="roadmap-feature">PvP!</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">March 2026</div>
                    <div class="roadmap-feature">Implementing store, lore, PvE/PvP story progress</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);

    modal.querySelector('.roadmap-close-btn').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function addCastleStyles() {
    const styleId = 'castle-styles';
    if (document.getElementById(styleId)) {
        return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .castle-container {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            overflow: hidden;
        }

        .castle-scene {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }

        .castle-image {
            width: 100%;
            height: 100%;
            object-position: center bottom;
            display: block;
            position: absolute;
            bottom: 0;
            left: 0;
        }

        .bottom-navigation {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
            gap: 0.5rem;
            padding: 1rem 1rem 0.5rem 1rem;
            z-index: 10;
        }

        .bottom-navigation .nav-btn {
            padding: 0.8rem 0.5rem;
            font-size: 0.9rem;
            white-space: nowrap;
            text-overflow: ellipsis;
            overflow: hidden;
        }

        .building-overlay {
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
        }

        .building-hotspot {
            position: absolute;
            cursor: pointer;
            transition: background-color 0.3s ease;
            border: 2px solid transparent;
            box-sizing: border-box;
        }

        .building-hotspot.highlight {
            background-color: rgba(255, 215, 0, 0.2);
            border-color: #c4975a;
            box-shadow: 0 0 15px rgba(255, 215, 0, 0.5);
        }

        .inn-hotspot {
            left: 10%;
            bottom: 15%;
            width: 15%;
            height: 20%;
        }
        
        .altar-hotspot {
            left: 70%;
            bottom: 40%;
            width: 10%;
            height: 25%;
        }

        .blacksmith-hotspot {
            left: 30%;
            bottom: 10%;
            width: 12%;
            height: 15%;
        }

        .alchemist-hotspot {
            left: 55%;
            bottom: 20%;
            width: 10%;
            height: 13%;
        }

        #errand-display {
            position: absolute;
            top: 60px;
            left: 1rem;
            right: 1rem;
            z-index: 100;
            pointer-events: none;
        }

        .errand-container {
            background: rgba(29, 20, 12, 0.95);
            border: 2px solid #c4975a;
            border-radius: 12px;
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 1rem;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
            pointer-events: auto;
            opacity: 0;
            transform: translateY(-20px);
            transition: opacity 0.4s ease-out, transform 0.4s ease-out;
        }

        .errand-container.errand-visible {
            opacity: 1;
            transform: translateY(0);
        }

        .errand-title {
            color: #ffd700;
            font-size: 1.1rem;
            font-weight: bold;
            text-align: center;
            font-family: 'Cinzel', serif;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
            margin-bottom: 0.5rem;
        }

        .errand-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
        }

        .errand-column {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
            flex: 1;
        }

        .errand-subtitle {
            color: #e0d8c9;
            font-size: 0.8rem;
            font-weight: bold;
            text-align: center;
            font-family: 'Cinzel', serif;
            background: rgba(196, 151, 90, 0.3);
            padding: 0.3rem 0.8rem;
            border-radius: 12px;
            border: 1px solid rgba(196, 151, 90, 0.5);
            width: 100%;
        }

        .errand-items {
            display: flex;
            gap: 0.5rem;
            justify-content: center;
            flex-wrap: wrap;
        }

        .errand-item {
            position: relative;
            width: 50px;
            height: 50px;
            background: rgba(42, 31, 22, 0.8);
            border: 2px solid #c4975a;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }

        .errand-item.insufficient {
            box-shadow: 0 0 12px rgba(255, 0, 0, 0.6);
            border-color: #8b4513;
        }

        .errand-item.reward {
            border-color: #ffd700;
            background: rgba(255, 215, 0, 0.15);
        }

        .errand-item-sprite {
            width: 40px;
            height: 40px;
            object-fit: contain;
        }

        .errand-item-amount {
            position: absolute;
            bottom: 1px;
            right: 1px;
            background: rgba(0, 150, 0, 0.95);
            color: white;
            font-size: 0.7rem;
            font-weight: bold;
            padding: 1px 4px;
            border-radius: 4px;
            font-family: 'Cinzel', serif;
            border: 1px solid rgba(255, 255, 255, 0.3);
            min-width: 20px;
            text-align: center;
        }

        .errand-item-amount.not-enough {
            background: rgba(150, 0, 0, 0.95);
        }

        .errand-item-amount.reward-amount {
            background: rgba(255, 215, 0, 0.95);
            color: #1d140c;
        }

        .errand-arrow {
            font-size: 1.8rem;
            color: #c4975a;
            font-weight: bold;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            margin: 0 0.5rem;
        }

        .errand-complete-btn {
            padding: 0.8rem 1rem;
            font-size: 0.9rem;
            white-space: nowrap;
            margin-top: 0.5rem;
            width: 100%;
        }

        .errand-complete-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        @keyframes floatAndFade {
            0% {
                transform: translateY(0) translateX(0);
                opacity: 0;
            }
            25% {
                opacity: 1;
            }
            75% {
                opacity: 1;
            }
            100% {
                transform: translateY(-100px) translateX(50px);
                opacity: 0;
            }
        }

        .custom-message-box {
            position: fixed;
            top: 10px;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            z-index: 1000;
        }

        .custom-message-box .message-content {
            background: linear-gradient(145deg, #1d140c, #2a1f16);
            border: 2px solid #c4975a;
            border-radius: 10px;
            padding: 0.5rem;
            text-align: center;
            color: #e0d8c9;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
            max-width: 80%;
            max-height: 95%;
            font-family: 'Cinzel', serif;
        }

        .custom-message-box .message-content p {
            margin-bottom: 1.5rem;
            font-size: 1.1rem;
        }

        .custom-message-box .message-ok-btn {
            padding: 1rem;
            font-size: 1rem;
            cursor: pointer;
        }

        .roadmap-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            animation: fadeIn 0.3s ease-out;
        }

        .roadmap-modal-content {
            background: linear-gradient(145deg, #1d140c, #2a1f16);
            border: 2px solid #c4975a;
            border-radius: 15px;
            padding: 2rem;
            max-width: 600px;
            max-height: 70vh;
            width: 90%;
            color: #e0d8c9;
            font-family: 'Cinzel', serif;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
            position: relative;
            overflow: hidden;
        }

        .roadmap-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
            border-bottom: 1px solid #c4975a;
            padding-bottom: 1rem;
        }

        .roadmap-header h2 {
            margin: 0;
            color: #c4975a;
            font-size: 1.8rem;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        }

        .roadmap-close-btn {
            background: none;
            border: none;
            color: #c4975a;
            font-size: 2rem;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background-color 0.3s ease, transform 0.2s ease;
        }

        .roadmap-body {
            max-height: 50vh;
            overflow-y: auto;
            padding-right: 10px;
        }

        .roadmap-body::-webkit-scrollbar {
            width: 8px;
        }

        .roadmap-body::-webkit-scrollbar-track {
            background: rgba(29, 20, 12, 0.3);
            border-radius: 4px;
        }

        .roadmap-body::-webkit-scrollbar-thumb {
            background: #c4975a;
            border-radius: 4px;
        }

        .roadmap-item {
            display: flex;
            align-items: center;
            padding: 1rem;
            margin-bottom: 0.5rem;
            background: rgba(42, 31, 22, 0.5);
            border-radius: 8px;
            border-left: 4px solid #c4975a;
            transition: background-color 0.3s ease, transform 0.2s ease;
        }

        .roadmap-date {
            font-weight: bold;
            color: #c4975a;
            min-width: 100px;
            font-size: 0.9rem;
            text-align: center;
            padding: 0.3rem 0.8rem;
            background: rgba(196, 151, 90, 0.1);
            border-radius: 15px;
            margin-right: 1rem;
            border: 1px solid rgba(196, 151, 90, 0.3);
        }

        .roadmap-feature {
            flex: 1;
            font-size: 1rem;
            line-height: 1.4;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: scale(0.9);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }
    `;
    document.head.appendChild(style);
}

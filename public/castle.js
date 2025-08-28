let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _playerCharacters = []; // Для хранения персонажей игрока

export async function loadModule(main, {refreshTranslations, apiCall, getCurrentProfile }) {
    console.log('[CASTLE] loadModule called');
    console.log('[CASTLE] refreshTranslations function:', typeof refreshTranslations);
    
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;
    
    _profile = _getCurrentProfile(); // ← Fix this syntax error
    if (!_profile) {
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login');
        return;
    }

    // Ensure the main container is ready for content
    _main.innerHTML = `
        <div class="main-app-container castle-container">
            <div class="particles"></div>
            
            <div class="top-right-buttons">
                <button class="fantasy-button settings-btn" data-action="roadmap">Roadmap</button>
                <button class="fantasy-button settings-btn" data-action="support">Support</button>
                <button class="fantasy-button settings-btn" data-action="settings">Settings</button>
            </div>

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
    createParticles(); // Reusing the particle function

    await fetchPlayerCharacters(); // Fetch characters to display profession buildings
    renderCastleScene();
    setupInteractions();

    console.log('[CASTLE] About to call refreshTranslations');
    if (typeof refreshTranslations === 'function') {
        refreshTranslations();
    } else {
        console.error('[CASTLE] refreshTranslations is not a function:', refreshTranslations);
    }
}

async function fetchPlayerCharacters() {
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=id,race_id,class_id,sex,profession_id,professions(name)`);
        _playerCharacters = await response.json();
    } catch (error) {
        displayMessage('Failed to load your champions. Please try again.');
    }
}

function renderCastleScene() {
    const buildingOverlay = _main.querySelector('.building-overlay');

    buildingOverlay.querySelectorAll('.profession-hotspot').forEach(el => el.remove());
    const professionPositions = {
        'blacksmith': { x: '50%', y: '60%', width: '10%', height: '15%' }, // Example
        'alchemist': { x: '30%', y: '55%', width: '12%', height: '18%' }, // Example
        // Add more professions and their positions
    };

    _playerCharacters.forEach(character => {
        if (character.professions && character.professions.name) {
            const professionName = character.professions.name.toLowerCase();
            if (professionPositions[professionName]) {
                const pos = professionPositions[professionName];
                const professionHotspot = document.createElement('div');
                professionHotspot.className = `building-hotspot profession-hotspot ${professionName}-hotspot`;
                professionHotspot.dataset.building = professionName;
                professionHotspot.dataset.characterId = character.id; // Link to specific character
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
    // Top Right Buttons
    _main.querySelectorAll('.top-right-buttons .settings-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            console.log(`[CASTLE_INTERACTION] Top button clicked: ${action}`);
            
            if (action === 'settings') {
                window.gameAuth.loadModule('settings');
            } else if (action === 'support') {
                window.gameAuth.loadModule('ticketing_system');
            } else if (action === 'roadmap') {
                 showRoadmapModal();
            }    
        });
    });

    // Bottom Navigation Buttons
    _main.querySelectorAll('.bottom-navigation .nav-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            console.log(`[CASTLE_INTERACTION] Navigation button clicked: ${action}`);
            
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

    // Building Hotspots Interactions
    _main.querySelectorAll('.building-hotspot').forEach(hotspot => {
        hotspot.addEventListener('mouseenter', (e) => {
            const building = e.target.dataset.building;
            // Add a class to light up the building visually
            e.target.classList.add('highlight');
            // Maybe show a tooltip with building name
            // displayTooltip(building, e.clientX, e.clientY);
        });

        hotspot.addEventListener('mouseleave', (e) => {
            const building = e.target.dataset.building;
            console.log(`[CASTLE_INTERACTION] Leaving: ${building}`);
            e.target.classList.remove('highlight');
            // hideTooltip();
        });

        hotspot.addEventListener('click', (e) => {
            const building = e.target.dataset.building;
            console.log(`[CASTLE_INTERACTION] Clicked building: ${building}`);
            let message = `You clicked the ${building} building.`;
            if (e.target.dataset.characterId) {
                const charId = e.target.dataset.characterId;
                const character = _playerCharacters.find(c => c.id == charId);
                if (character) {
                    message = `You clicked ${character.professions.name}'s workshop (${character.sex === 'male' ? 'Male' : 'Female'} ${character.professions.name}).`;
                }
            }
            displayMessage(message);
        });
    });
}

function createParticles() {
    const particlesContainer = _main.querySelector('.particles');
    if (!particlesContainer) {
        return;
    }

    // Clear existing particles if any
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
        console.log('[MESSAGE] Message box closed.');
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
                    <div class="roadmap-date">30 August 2025</div>
                    <div class="roadmap-feature">PvE - 2 regions, loot, crafting - 4 working professions!</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">10 September 2025</div>
                    <div class="roadmap-feature">Exp, leveling and progressive score systems! Environmental tools and interactions!</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">15 September 2025</div>
                    <div class="roadmap-feature">New professions - enchanting and jewelcrafting!</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">30 September 2025</div>
                    <div class="roadmap-feature">Talent trees!</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">10 October 2025</div>
                    <div class="roadmap-feature">New Gods!</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">30 October 2025</div>
                    <div class="roadmap-feature">PvP</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">November 2025</div>
                    <div class="roadmap-feature">Implementing store, lore, PvE/PvP story progress</div>
                </div>
                <div class="roadmap-item">
                    <div class="roadmap-date">December 2025</div>
                    <div class="roadmap-feature">Second test phase!</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);

    // Close modal functionality
    modal.querySelector('.roadmap-close-btn').addEventListener('click', () => {
        modal.remove();
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // Close modal with Escape key
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
            height: 83%;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }

        .castle-image {
            width: 100%;
            height: 100%;
            /* object-fit: contain; */
            object-position: center bottom;
            display: block;
            position: absolute;
            bottom: 0;
            left: 0;
        }

        .bottom-navigation {
            position: absolute;
            bottom: 0; /* Aligns to the very bottom */
            left: 0;
            width: 100%;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); /* Responsive grid for buttons */
            gap: 0.5rem;
            padding: 1rem;
            background: linear-gradient(to top, rgba(29, 20, 12, 0.9), rgba(29, 20, 12, 0.5)); /* Gradient background */
            box-shadow: 0 -4px 10px rgba(0, 0, 0, 0.5);
            z-index: 10; /* Ensure buttons are above castle scene */
        }

        .bottom-navigation .nav-btn {
            padding: 0.8rem 0.5rem;
            font-size: 0.9rem;
            white-space: nowrap; /* Prevent text wrapping */
            text-overflow: ellipsis; /* Add ellipsis if text is too long */
            overflow: hidden;
        }

        /* Interactive Building Overlays */
        .building-overlay {
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            /* background-color: rgba(0,0,255,0.1); /* For debugging hotspots */
        }

        .building-hotspot {
            position: absolute;
            /* background-color: rgba(255,0,0,0.2); /* For debugging hotspot areas */
            cursor: pointer;
            transition: background-color 0.3s ease;
            border: 2px solid transparent; /* Border for highlight */
            box-sizing: border-box; /* Include padding and border in the element's total width and height */
        }

        .building-hotspot.highlight {
            background-color: rgba(255, 215, 0, 0.2);
            border-color: #c4975a; /* Gold border */
            box-shadow: 0 0 15px rgba(255, 215, 0, 0.5); /* Glowing effect */
        }

        /* Specific Hotspot Positions (Adjust these precisely based on 132.jpg) */
        /* Inn */
        .inn-hotspot {
            left: 10%; /* Example percentage, adjust as needed */
            bottom: 15%; /* Example percentage, adjust as needed */
            width: 15%; /* Example width */
            height: 20%; /* Example height */
        }
        
        /* Altar (Top right small tower building) */
        .altar-hotspot {
            left: 70%; /* Example */
            bottom: 40%; /* Example */
            width: 10%; /* Example */
            height: 25%; /* Example */
        }

        /* Example for Profession-specific buildings (these coordinates are rough guesses from the image) */
        .blacksmith-hotspot {
            left: 30%; /* Lower left building */
            bottom: 10%;
            width: 12%;
            height: 15%;
        }

        .alchemist-hotspot {
            left: 55%; /* Another building */
            bottom: 20%;
            width: 10%;
            height: 13%;
        }

        .particles {
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            pointer-events: none;
            overflow: hidden;
            z-index: 1; /* Below other content */
        }

        .particle {
            position: absolute;
            background-color: rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            animation: floatAndFade 5s infinite ease-in-out;
            width: 5px;
            height: 5px;
            opacity: 0;
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

        /* Custom message box styles (reused) */
        .custom-message-box {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
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

        /* roadmpap styles */

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

        /* Responsive adjustments */
        @media (max-width: 768px) {
            .roadmap-modal-content {
                padding: 1.5rem;
                margin: 1rem;
            }

            .roadmap-header h2 {
                font-size: 1.5rem;
            }

            .roadmap-item {
                flex-direction: column;
                align-items: flex-start;
            }

            .roadmap-date {
                margin-bottom: 0.5rem;
                margin-right: 0;
            }
        }

    `;
    document.head.appendChild(style);
}

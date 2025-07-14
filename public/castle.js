let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _playerCharacters = []; // Для хранения персонажей игрока

export async function loadModule(main, { apiCall, getCurrentProfile }) {
    console.log('[CASTLE] --- Starting loadModule for Castle Scene ---');
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;

    _profile = _getCurrentProfile();
    if (!_profile) {
        console.error('[CASTLE] No profile found. Cannot proceed to castle.');
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login'); // Redirect to login if no profile
        return;
    }
    console.log('[CASTLE] Profile loaded:', _profile);

    // Ensure the main container is ready for content
    _main.innerHTML = `
        <div class="main-app-container castle-container">
            <div class="particles"></div>
            <div class="top-right-buttons">
                <button class="fantasy-button settings-btn">Settings</button>
                <button class="fantasy-button logout-btn">Logout</button>
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
    
    console.log('[CASTLE] --- loadModule for Castle Scene finished ---');
}

async function fetchPlayerCharacters() {
    console.log(`[CASTLE] Fetching characters for player ID: ${_profile.id}...`);
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=id,race_id,class_id,sex,profession_id,professions(name)`);
        _playerCharacters = await response.json();
        console.log('[CASTLE] Player characters fetched:', _playerCharacters);
    } catch (error) {
        console.error('[CASTLE] Error fetching player characters:', error);
        displayMessage('Failed to load your champions. Please try again.');
    }
}

function renderCastleScene() {
    console.log('[CASTLE] Rendering castle scene with dynamic elements.');
    const buildingOverlay = _main.querySelector('.building-overlay');

    // Clear existing dynamic profession buildings
    buildingOverlay.querySelectorAll('.profession-hotspot').forEach(el => el.remove());

    // Add profession-specific building hotspots based on player characters
    // The positions here are illustrative and should be adjusted based on your '132.jpg'
    // You'll need to map profession names to specific coordinates on the image.
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
                
                // Set approximate position and size for the hotspot
                // These values need to be fine-tuned based on your specific '132.jpg'
                // and where you want each profession building to be interactable.
                professionHotspot.style.left = pos.x;
                professionHotspot.style.top = pos.y;
                professionHotspot.style.width = pos.width;
                professionHotspot.style.height = pos.height;
                
                buildingOverlay.appendChild(professionHotspot);
                console.log(`[CASTLE] Added hotspot for profession: ${professionName}`);
            }
        }
    });

    // We can also dynamically load an image for the profession building if needed
    // For now, the image is static background of the .castle-image
}

function setupInteractions() {
    console.log('[CASTLE] Setting up interactions...');

    // Top Right Buttons
    _main.querySelector('.settings-btn').addEventListener('click', () => {
        console.log('[CASTLE_INTERACTION] Settings button clicked.');
        displayMessage('Settings functionality coming soon!');
        // window.gameAuth.loadModule('settings'); // Example of loading another module
    });

    _main.querySelector('.logout-btn').addEventListener('click', () => {
        console.log('[CASTLE_INTERACTION] Logout button clicked.');
        displayMessage('Logging out...');
        // Implement actual logout logic here
        // window.gameAuth.logout(); // Assuming a logout function exists
        // window.gameAuth.loadModule('login'); 
    });

    // Bottom Navigation Buttons
    _main.querySelectorAll('.bottom-navigation .nav-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            console.log(`[CASTLE_INTERACTION] Navigation button clicked: ${action}`);
            
            // Updated logic for navigation buttons
            if (action === 'characters') {
                window.gameAuth.loadModule('character_manager'); 
            } else if (action === 'trade') {
                displayMessage('Trade functionality coming soon!');
                // window.gameAuth.loadModule('marketplace');
            } else if (action === 'bank') {
                displayMessage('Bank functionality coming soon!');
                // window.gameAuth.loadModule('bank');
            } else if (action === 'embark') {
                window.gameAuth.loadModule('embark');
            } else if (action === 'crafting') {
                displayMessage('Crafting functionality coming soon!');
                // window.gameAuth.loadModule('crafting_station');
            } else if (action === 'altar-nav') { // Note: using 'altar-nav' to distinguish from building hotspot
                displayMessage('Altar functionality coming soon!');
                // window.gameAuth.loadModule('altar_scene');
            } else {
                displayMessage(`${action.charAt(0).toUpperCase() + action.slice(1)} functionality coming soon!`);
            }
        });
    });

    // Building Hotspots Interactions
    _main.querySelectorAll('.building-hotspot').forEach(hotspot => {
        hotspot.addEventListener('mouseenter', (e) => {
            const building = e.target.dataset.building;
            console.log(`[CASTLE_INTERACTION] Hovering over: ${building}`);
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
            // Implement specific logic for each building click
            // if (building === 'inn') {
            //     window.gameAuth.loadModule('inn');
            // } else if (building === 'altar') {
            //     window.gameAuth.loadModule('altar_building_scene');
            // } else if (building === 'blacksmith') {
            //     window.gameAuth.loadModule('blacksmith_workshop');
            // }
        });
    });
}

function createParticles() {
    console.log('[PARTICLES] Creating particles for castle...');
    const particlesContainer = _main.querySelector('.particles');
    if (!particlesContainer) {
        console.warn('[PARTICLES] Particles container not found.');
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
    console.log('[PARTICLES] Particles created and appended.');
}

function displayMessage(message) {
    console.log(`[MESSAGE] Displaying message: "${message}"`);
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

function addCastleStyles() {
    console.log('[STYLES] Adding castle scene styles...');
    const styleId = 'castle-styles';
    if (document.getElementById(styleId)) {
        console.log('[STYLES] Styles already present, skipping re-addition.');
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
            background-color: #1a150e; /* Dark background */
        }

        .castle-scene {
            position: relative;
            width: 100%;
            height: 75%; /* Main content area, roughly 75% of screen */
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden; /* Ensure image doesn't overflow */
        }

        .castle-image {
            width: 100%;
            height: 100%;
            object-fit: contain; /* Ensures the image fits without cropping, maintains aspect ratio */
            object-position: center bottom; /* Align image to bottom center */
            display: block;
            position: absolute;
            bottom: 0;
            left: 0;
        }

        .top-right-buttons {
            position: absolute;
            top: 1rem;
            right: 1rem;
            display: flex;
            gap: 0.5rem;
            z-index: 10; /* Ensure buttons are above other content */
        }
        .top-right-buttons .fantasy-button {
            padding: 0.6rem 1rem;
            font-size: 0.8rem;
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
            background-color: rgba(255, 215, 0, 0.2); /* Gold highlight on hover */
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
        
        /* Add more specific hotspots as needed for other buildings on the image */


        /* General particle styles (reused) */
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
            padding: 2rem;
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
            padding: 0.8rem 1.5rem;
            font-size: 1rem;
            cursor: pointer;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
            .bottom-navigation {
                grid-template-columns: repeat(3, 1fr); /* 3 buttons per row on smaller screens */
                gap: 0.4rem;
                padding: 0.8rem;
            }

            .bottom-navigation .nav-btn {
                font-size: 0.8rem;
                padding: 0.6rem 0.3rem;
            }

            .top-right-buttons {
                top: 0.5rem;
                right: 0.5rem;
                gap: 0.3rem;
            }
            .top-right-buttons .fantasy-button {
                padding: 0.4rem 0.7rem;
                font-size: 0.7rem;
            }
            
            /* Adjust castle image to be more prominent on mobile */
            .castle-image {
                object-fit: cover; /* Cover might be better for mobile to fill screen */
            }

            /* Adjust hotspot sizes and positions for mobile if needed */
            .inn-hotspot {
                left: 10%; 
                bottom: 15%; 
                width: 18%; 
                height: 25%; 
            }
            .altar-hotspot {
                left: 65%; 
                bottom: 40%; 
                width: 12%; 
                height: 30%; 
            }
            .blacksmith-hotspot {
                left: 28%; 
                bottom: 10%;
                width: 15%;
                height: 20%;
            }
        }
    `;
    document.head.appendChild(style);
    console.log('[STYLES] Castle scene styles appended to document head.');
}
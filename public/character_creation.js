// character_creation.js

let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _godId;
let _races = [];
let _classes = [];
let _currentCharacterIndex = 0; // 0-indexed for character 1, 2, 3
let _selectedRace = null;
let _selectedClass = null;

export async function loadModule(main, { apiCall, getCurrentProfile }) {
    console.log('[CHAR_CREATE] --- Starting loadModule for Character Creation ---');
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;

    _profile = _getCurrentProfile();
    if (!_profile) {
        console.error('[CHAR_CREATE] No profile found. Cannot proceed with character creation.');
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login'); // Redirect to login if no profile
        return;
    }
    _godId = _profile.god; // The god selected in the previous step
    console.log('[CHAR_CREATE] Profile loaded:', _profile);
    console.log('[CHAR_CREATE] Selected God ID:', _godId);

    // Ensure the main container is ready for content
    _main.innerHTML = '';

    // Add character creation specific styles
    addCharacterCreationStyles();

    // Create floating particles background
    createParticles();

    // Start the character creation process
    await startCharacterCreationFlow();
    console.log('[CHAR_CREATE] --- loadModule for Character Creation finished ---');
}

async function startCharacterCreationFlow() {
    console.log(`[CHAR_CREATE_FLOW] Starting flow for Character ${_currentCharacterIndex + 1} of 3.`);
    _selectedRace = null; // Reset selections for new character
    _selectedClass = null;

    if (_currentCharacterIndex >= 3) {
        console.log('[CHAR_CREATE_FLOW] All 3 characters created. Loading castle module.');
        displayMessage('All your champions are ready! Entering the Castle...');
        window.gameAuth.loadModule('castle'); // Proceed to castle module
        return;
    }

    await fetchRacesAndRenderSelection();
}

async function fetchRacesAndRenderSelection() {
    console.log(`[RACE_FETCH] Fetching races for God ID: ${_godId}...`);
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/races?faction_id=eq.${_godId}&select=id,name,description,base_stats`);
        _races = await response.json();
        console.log('[RACE_FETCH] Races fetched:', _races);

        if (_races.length === 0) {
            console.warn(`[RACE_FETCH] No races found for God ID: ${_godId}.`);
            displayMessage('No races available for your chosen deity. Please contact support.');
            return;
        }
        renderRaceSelection();
    } catch (error) {
        console.error('[RACE_FETCH] Error fetching races:', error);
        displayMessage('Failed to load races. Please try again.');
    }
}

function renderRaceSelection() {
    console.log(`[UI_RENDER] Rendering Race Selection for Character ${_currentCharacterIndex + 1}.`);
    _main.innerHTML = `
        <div class="character-creation-section">
            <div class="art-header">
                <h1>Character ${_currentCharacterIndex + 1} of 3: Choose Your Race</h1>
                <p class="subtitle">Select the lineage that defines your champion's innate strengths.</p>
            </div>
            <div class="selection-grid">
                ${_races.map(race => `
                    <div class="selection-card" data-id="${race.id}" data-type="race">
                        <h3 class="card-name">${race.name}</h3>
                        <p class="card-description">${race.description}</p>
                        <div class="stats-block">
                            <h4>Base Stats:</h4>
                            ${Object.entries(race.base_stats).map(([stat, value]) => `
                                <p>${stat}: <span>${value}</span></p>
                            `).join('')}
                        </div>
                        <button class="fantasy-button select-btn" data-id="${race.id}" data-type="race">Select ${race.name}</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    _main.querySelectorAll('.select-btn[data-type="race"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const raceId = parseInt(e.target.dataset.id);
            console.log(`[UI_EVENT] Race selected: ID ${raceId}`);
            handleRaceSelection(raceId);
        });
    });
}

async function handleRaceSelection(raceId) {
    _selectedRace = _races.find(r => r.id === raceId);
    if (!_selectedRace) {
        console.error(`[RACE_SELECT] Selected race with ID ${raceId} not found.`);
        displayMessage('Selected race not found. Please try again.');
        return;
    }
    console.log('[RACE_SELECT] Selected Race:', _selectedRace);

    console.log(`[CLASS_FETCH] Fetching classes for Race ID: ${_selectedRace.id}...`);
    try {
        // Note: 'faction_id' in classes table refers to 'race.id' as per design.
        const response = await _apiCall(`/api/supabase/rest/v1/classes?faction_id=eq.${_selectedRace.id}&select=id,name,description,stat_bonuses,starting_abilities`);
        _classes = await response.json();
        console.log('[CLASS_FETCH] Classes fetched:', _classes);

        if (_classes.length === 0) {
            console.warn(`[CLASS_FETCH] No classes found for Race ID: ${_selectedRace.id}.`);
            displayMessage('No classes available for this race. Please select another race.');
            _selectedRace = null; // Allow re-selection of race
            renderRaceSelection();
            return;
        }
        renderClassSelection();
    } catch (error) {
        console.error('[CLASS_FETCH] Error fetching classes:', error);
        displayMessage('Failed to load classes. Please try again.');
        _selectedRace = null; // Allow re-selection of race
        renderRaceSelection();
    }
}

function renderClassSelection() {
    console.log(`[UI_RENDER] Rendering Class Selection for Character ${_currentCharacterIndex + 1}.`);
    _main.innerHTML = `
        <div class="character-creation-section">
            <div class="art-header">
                <h1>Character ${_currentCharacterIndex + 1} of 3: Choose Your Class</h1>
                <p class="subtitle">Embrace a discipline that complements your race's heritage.</p>
            </div>
            <div class="selected-race-summary">
                <h3>Selected Race: ${_selectedRace.name}</h3>
                <p>${_selectedRace.description}</p>
            </div>
            <div class="selection-grid">
                ${_classes.map(cls => `
                    <div class="selection-card" data-id="${cls.id}" data-type="class">
                        <h3 class="card-name">${cls.name}</h3>
                        <p class="card-description">${cls.description}</p>
                        <div class="stats-block">
                            <h4>Stat Bonuses:</h4>
                            ${Object.entries(cls.stat_bonuses).map(([stat, value]) => `
                                <p>${stat}: <span>+${value}</span></p>
                            `).join('')}
                        </div>
                        <div class="abilities-block">
                            <h4>Starting Abilities:</h4>
                            <ul>
                                ${cls.starting_abilities.map(ability => `<li>${ability}</li>`).join('')}
                            </ul>
                        </div>
                        <button class="fantasy-button select-btn" data-id="${cls.id}" data-type="class">Select ${cls.name}</button>
                    </div>
                `).join('')}
            </div>
            <div class="confirm-return-buttons">
                <button class="fantasy-button return-btn">Return to Race Selection</button>
            </div>
        </div>
    `;

    _main.querySelectorAll('.select-btn[data-type="class"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const classId = parseInt(e.target.dataset.id);
            console.log(`[UI_EVENT] Class selected: ID ${classId}`);
            handleClassSelection(classId);
        });
    });

    _main.querySelector('.return-btn').addEventListener('click', () => {
        console.log('[UI_EVENT] Return to Race Selection clicked.');
        _selectedClass = null; // Clear class selection
        renderRaceSelection();
    });
}

function handleClassSelection(classId) {
    _selectedClass = _classes.find(c => c.id === classId);
    if (!_selectedClass) {
        console.error(`[CLASS_SELECT] Selected class with ID ${classId} not found.`);
        displayMessage('Selected class not found. Please try again.');
        return;
    }
    console.log('[CLASS_SELECT] Selected Class:', _selectedClass);
    renderCharacterSummary();
}

function renderCharacterSummary() {
    console.log(`[UI_RENDER] Rendering Character Summary for Character ${_currentCharacterIndex + 1}.`);

    const finalStats = calculateFinalStats(_selectedRace.base_stats, _selectedClass.stat_bonuses);

    _main.innerHTML = `
        <div class="character-creation-section">
            <div class="art-header">
                <h1>Character ${_currentCharacterIndex + 1} of 3: Summary</h1>
                <p class="subtitle">Review your champion's destiny before it is sealed.</p>
            </div>
            <div class="summary-card">
                <h2>${_selectedRace.name} ${_selectedClass.name}</h2>
                <p><strong>Race Description:</strong> ${_selectedRace.description}</p>
                <p><strong>Class Description:</strong> ${_selectedClass.description}</p>
                <div class="stats-block">
                    <h4>Final Stats:</h4>
                    ${Object.entries(finalStats).map(([stat, value]) => `
                        <p>${stat}: <span>${value}</span></p>
                    `).join('')}
                </div>
                <div class="abilities-block">
                    <h4>Starting Abilities:</h4>
                    <ul>
                        ${_selectedClass.starting_abilities.map(ability => `<li>${ability}</li>`).join('')}
                    </ul>
                </div>
            </div>
            <div class="confirm-return-buttons">
                <button class="fantasy-button confirm-btn">Confirm Champion</button>
                <button class="fantasy-button return-btn">Return to Class Selection</button>
            </div>
        </div>
    `;

    _main.querySelector('.confirm-btn').addEventListener('click', () => {
        console.log('[UI_EVENT] Confirm Champion clicked.');
        confirmCharacter();
    });

    _main.querySelector('.return-btn').addEventListener('click', () => {
        console.log('[UI_EVENT] Return to Class Selection clicked from summary.');
        renderClassSelection();
    });
}

function calculateFinalStats(baseStats, statBonuses) {
    console.log('[STAT_CALC] Calculating final stats...');
    const finalStats = { ...baseStats }; // Start with race base stats
    for (const stat in statBonuses) {
        if (finalStats.hasOwnProperty(stat)) {
            finalStats[stat] += statBonuses[stat];
        } else {
            finalStats[stat] = statBonuses[stat]; // Add new stats if class provides them
        }
    }
    console.log('[STAT_CALC] Final Stats:', finalStats);
    return finalStats;
}

/**
 * Saves the created character to the database and proceeds to the next step.
 */
async function confirmCharacter() {
    console.log(`[CHAR_SAVE] Attempting to save Character ${_currentCharacterIndex + 1}...`);
    const finalStats = calculateFinalStats(_selectedRace.base_stats, _selectedClass.stat_bonuses);

    const characterData = {
        player_id: _profile.id,
        race_id: _selectedRace.id,
        class_id: _selectedClass.id,
        final_stats: finalStats,
        abilities: _selectedClass.starting_abilities
    };
    console.log('[CHAR_SAVE] Character data to save:', characterData);

    try {
        const response = await _apiCall('/api/supabase/rest/v1/characters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(characterData)
        });

        const savedCharacter = await response.json();
        console.log('[CHAR_SAVE] Character saved successfully:', savedCharacter);
        displayMessage(`Character ${_currentCharacterIndex + 1} (${_selectedRace.name} ${_selectedClass.name}) created!`);

        _currentCharacterIndex++; // Increment for the next character
        await startCharacterCreationFlow(); // Continue to next character or castle
    } catch (error) {
        console.error('[CHAR_SAVE] Error saving character:', error);
        displayMessage('Failed to save character. Please try again.');
    }
}

function createParticles() {
    console.log('[PARTICLES] Creating particles...');
    const particlesContainer = _main.querySelector('.particles');
    if (!particlesContainer) {.
        const mainAppContainer = _main.querySelector('.main-app-container');
        if (mainAppContainer) {
            const newParticlesDiv = document.createElement('div');
            newParticlesDiv.className = 'particles';
            mainAppContainer.prepend(newParticlesDiv); // Add as first child
            console.log('[PARTICLES] .particles container created and added.');
        } else {
            console.warn('[PARTICLES] Could not find .main-app-container to add particles.');
            return;
        }
    }

    // Clear existing particles if any
    particlesContainer.innerHTML = '';

    const particleCount = 20; // Same count as god_selection
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

/**
 * Adds the CSS styles specific to the character creation module.
 */
function addCharacterCreationStyles() {
    console.log('[STYLES] Adding character creation styles...');
    const styleId = 'character-creation-styles';
    if (document.getElementById(styleId)) {
        console.log('[STYLES] Styles already present, skipping re-addition.');
        return; // Prevent re-adding styles if already present
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        /* General Layout for Character Creation */
        .character-creation-section {
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: flex-start; /* Align content to top */
            align-items: center;
            padding: 2rem;
            position: relative;
            z-index: 2;
            background: rgba(0, 0, 0, 0.2);
            backdrop-filter: blur(10px);
            overflow-y: auto; /* Enable scrolling for content overflow */
        }

        .character-creation-section .art-header {
            height: auto; /* Adjust height based on content */
            padding-bottom: 1.5rem;
            background: none; /* Remove header background from god_selection */
            border-bottom: 1px solid rgba(196, 151, 90, 0.2);
            margin-bottom: 2rem;
        }

        .character-creation-section .art-header h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }

        .character-creation-section .subtitle {
            font-size: 0.9rem;
        }

        /* Selection Grid for Races and Classes */
        .selection-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1.5rem;
            width: 100%;
            max-width: 1200px;
            margin-bottom: 2rem;
        }

        .selection-card {
            background: linear-gradient(145deg, rgba(29, 20, 12, 0.9), rgba(42, 31, 22, 0.8));
            border: 2px solid #3d2914;
            border-radius: 8px;
            overflow: hidden;
            transition: all 0.3s ease;
            backdrop-filter: blur(5px);
            box-shadow: 
                inset 0 1px 0 rgba(196, 151, 90, 0.1),
                0 2px 8px rgba(0, 0, 0, 0.3);
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }

        .selection-card:hover {
            border-color: #c4975a;
            transform: translateY(-2px);
            box-shadow: 
                inset 0 1px 0 rgba(196, 151, 90, 0.2),
                0 4px 12px rgba(0, 0, 0, 0.4);
        }

        .card-name {
            font-family: 'Cinzel', serif;
            font-size: 1.3rem;
            font-weight: 600;
            color: #c4975a;
            margin-bottom: 0.75rem;
            text-shadow: 1px 1px 0px #3d2914;
            letter-spacing: 1px;
        }

        .card-description {
            color: #b8b3a8;
            font-size: 0.95rem;
            line-height: 1.4;
            margin-bottom: 1rem;
            font-style: italic;
            flex-grow: 1; /* Allows description to take available space */
        }

        .stats-block, .abilities-block {
            width: 100%;
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid rgba(196, 151, 90, 0.1);
            text-align: left;
        }

        .stats-block h4, .abilities-block h4 {
            font-family: 'Cinzel', serif;
            color: #c4975a;
            font-size: 1rem;
            margin-bottom: 0.5rem;
            text-align: center;
        }

        .stats-block p {
            color: #b8b3a8;
            font-size: 0.9rem;
            display: flex;
            justify-content: space-between;
            padding: 0.2rem 0;
        }

        .stats-block p span {
            color: #c4975a;
            font-weight: bold;
        }

        .abilities-block ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .abilities-block li {
            background: rgba(196, 151, 90, 0.05);
            border-left: 3px solid #c4975a;
            padding: 0.5rem 1rem;
            margin-bottom: 0.4rem;
            color: #b8b3a8;
            font-size: 0.9rem;
            border-radius: 4px;
        }

        .select-btn {
            margin-top: auto; /* Pushes button to the bottom */
            width: 100%;
            padding: 0.75rem 1.5rem;
            font-size: 0.9rem;
            font-family: 'Cinzel', serif;
            font-weight: 600;
            border: 2px solid #c4975a;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            text-transform: uppercase;
            letter-spacing: 1px;
            background: linear-gradient(145deg, #2a1f16, #1d140c);
            color: #c4975a;
            box-shadow: 
                inset 0 1px 0 rgba(196, 151, 90, 0.2),
                0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .select-btn:hover {
            background: linear-gradient(145deg, #3d2914, #2a1f16);
            box-shadow: 
                inset 0 1px 0 rgba(196, 151, 90, 0.3),
                0 4px 8px rgba(0, 0, 0, 0.4);
            transform: translateY(-1px);
        }

        .select-btn:active {
            transform: translateY(0);
            box-shadow: 
                inset 0 2px 4px rgba(0, 0, 0, 0.3),
                0 1px 2px rgba(0, 0, 0, 0.2);
        }

        /* Selected Race Summary (for Class Selection screen) */
        .selected-race-summary {
            background: rgba(29, 20, 12, 0.7);
            border: 2px solid #3d2914;
            border-radius: 8px;
            padding: 1rem 2rem;
            margin-bottom: 2rem;
            width: 100%;
            max-width: 800px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .selected-race-summary h3 {
            font-family: 'Cinzel', serif;
            color: #c4975a;
            margin-bottom: 0.5rem;
            font-size: 1.2rem;
        }
        .selected-race-summary p {
            color: #b8b3a8;
            font-size: 0.9rem;
            font-style: italic;
        }

        /* Character Summary Card */
        .summary-card {
            background: linear-gradient(145deg, rgba(29, 20, 12, 0.9), rgba(42, 31, 22, 0.8));
            border: 2px solid #c4975a;
            border-radius: 8px;
            padding: 2rem;
            width: 100%;
            max-width: 600px;
            box-shadow: 
                inset 0 1px 0 rgba(196, 151, 90, 0.2),
                0 4px 12px rgba(0, 0, 0, 0.4);
            text-align: center;
            margin-bottom: 2rem;
        }
        .summary-card h2 {
            font-family: 'Cinzel', serif;
            font-size: 1.8rem;
            color: #c4975a;
            margin-bottom: 1rem;
            text-shadow: 1px 1px 0px #3d2914;
        }
        .summary-card p {
            color: #b8b3a8;
            margin-bottom: 0.5rem;
            font-size: 1rem;
        }
        .summary-card .stats-block, .summary-card .abilities-block {
            text-align: left;
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid rgba(196, 151, 90, 0.2);
        }
        .summary-card .stats-block h4, .summary-card .abilities-block h4 {
            text-align: center;
            font-size: 1.1rem;
        }

        /* Confirm/Return Buttons */
        .confirm-return-buttons {
            display: flex;
            gap: 1.5rem;
            margin-top: 1.5rem;
            width: 100%;
            max-width: 600px;
            justify-content: center;
        }

        .confirm-return-buttons .fantasy-button {
            flex: 1;
            max-width: 250px;
        }

        /* Custom Message Box (replacement for alert) */
        .custom-message-box {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            backdrop-filter: blur(5px);
        }

        .custom-message-box .message-content {
            background: linear-gradient(145deg, rgba(29, 20, 12, 0.95), rgba(42, 31, 22, 0.9));
            border: 2px solid #c4975a;
            border-radius: 8px;
            padding: 2rem;
            text-align: center;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
            max-width: 400px;
            width: 90%;
        }

        .custom-message-box .message-content p {
            color: #b8b3a8;
            font-size: 1.1rem;
            margin-bottom: 1.5rem;
        }

        .custom-message-box .message-ok-btn {
            padding: 0.75rem 2rem;
            font-size: 1rem;
            border-color: #c4975a;
            color: #c4975a;
        }

        /* Responsive Adjustments */
        @media (max-width: 768px) {
            .character-creation-section {
                padding: 1rem;
            }
            .character-creation-section .art-header h1 {
                font-size: 1.8rem;
            }
            .selection-grid {
                grid-template-columns: 1fr; /* Single column on smaller screens */
            }
            .selection-card {
                padding: 1rem;
            }
            .card-name {
                font-size: 1.2rem;
            }
            .card-description {
                font-size: 0.85rem;
            }
            .stats-block p, .abilities-block li {
                font-size: 0.85rem;
            }
            .summary-card {
                padding: 1.5rem;
            }
            .summary-card h2 {
                font-size: 1.5rem;
            }
            .confirm-return-buttons {
                flex-direction: column;
                gap: 1rem;
            }
            .confirm-return-buttons .fantasy-button {
                max-width: 100%;
            }
        }

        @media (max-width: 480px) {
            .character-creation-section .art-header h1 {
                font-size: 1.5rem;
            }
            .character-creation-section .subtitle {
                font-size: 0.8rem;
            }
            .custom-message-box .message-content {
                padding: 1.5rem;
            }
            .custom-message-box .message-content p {
                font-size: 1rem;
            }
        }
    `;
    document.head.appendChild(style);
    console.log('[STYLES] Character creation styles appended to document head.');
}

let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _playerCharacters = [];
let _selectedCharacter = null;

export async function loadModule(main, { apiCall, getCurrentProfile }) {
    console.log('[CHARACTER_MANAGER] --- Starting loadModule for Character Manager ---');
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;

    _profile = _getCurrentProfile();
    if (!_profile) {
        console.error('[CHARACTER_MANAGER] No profile found. Cannot proceed to character manager.');
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login'); // Redirect to login if no profile
        return;
    }
    console.log('[CHARACTER_MANAGER] Profile loaded:', _profile);

    _main.innerHTML = `
        <div class="main-app-container character-manager-container">
            <div class="top-bar">
                <button class="fantasy-button back-to-castle-btn">Back to Castle</button>
                <div class="title-text">Champion Details</div>
            </div>
            <div class="character-list-panel">
                </div>
            <div class="character-details-panel">
                <p class="placeholder-text">Select a champion to view their details.</p>
                </div>
        </div>
    `;

    addCharacterManagerStyles();
    await fetchPlayerCharacters();
    renderCharacterList();
    setupInteractions();

    console.log('[CHARACTER_MANAGER] --- loadModule for Character Manager finished ---');
}

async function fetchPlayerCharacters() {
    console.log(`[CHARACTER_MANAGER] Fetching characters for player ID: ${_profile.id}...`);
    try {
        // Fetch all relevant character data including joins for race, class, profession
        // and also equipped items, consumables, abilities, talents
        const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=*,races(name),classes(name),professions(name),abilities(id,name),talents(id,name)`);
        _playerCharacters = await response.json();
        console.log('[CHARACTER_MANAGER] Player characters fetched:', _playerCharacters);
        
        // Convert equipped items from IDs to actual item data if needed
        // For now, we'll assume equipped_* are directly item names/types or IDs.
        // If they are IDs, you'd need another API call to fetch item details.
    } catch (error) {
        console.error('[CHARACTER_MANAGER] Error fetching player characters:', error);
        displayMessage('Failed to load your champions. Please try again.');
    }
}

function renderCharacterList() {
    console.log('[CHARACTER_MANAGER] Rendering character list...');
    const characterListPanel = _main.querySelector('.character-list-panel');
    characterListPanel.innerHTML = ''; // Clear previous list

    if (_playerCharacters.length === 0) {
        characterListPanel.innerHTML = '<p class="no-characters">No champions found for this profile.</p>';
        return;
    }

    _playerCharacters.forEach(character => {
        const charButton = document.createElement('button');
        charButton.className = 'fantasy-button character-select-btn';
        charButton.dataset.charId = character.id;
        charButton.textContent = `${character.name || 'Unknown Champion'} (${character.races.name} ${character.classes.name})`;
        characterListPanel.appendChild(charButton);
    });

    // Automatically select the first character if available
    if (_playerCharacters.length > 0) {
        selectCharacter(_playerCharacters[0].id);
    }
}

function selectCharacter(charId) {
    _selectedCharacter = _playerCharacters.find(char => char.id == charId);
    if (_selectedCharacter) {
        console.log('[CHARACTER_MANAGER] Selected character:', _selectedCharacter);
        renderCharacterDetails(_selectedCharacter);

        // Highlight selected button
        _main.querySelectorAll('.character-select-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        _main.querySelector(`.character-select-btn[data-char-id="${charId}"]`).classList.add('selected');
    } else {
        console.error('[CHARACTER_MANAGER] Character not found for ID:', charId);
        displayMessage('Champion not found. Please try again.');
    }
}

function renderCharacterDetails(character) {
    console.log('[CHARACTER_MANAGER] Rendering details for character:', character.name);
    const detailsPanel = _main.querySelector('.character-details-panel');
    detailsPanel.innerHTML = ''; // Clear previous details

    // Helper to render sections
    const createSection = (title, contentHtml) => `
        <div class="detail-section">
            <h3>${title}</h3>
            <div class="section-content">${contentHtml}</div>
        </div>
    `;

    // Basic Info
    const basicInfoHtml = `
        <p><strong>Name:</strong> ${character.name || 'N/A'}</p>
        <p><strong>Race:</strong> ${character.races ? character.races.name : 'N/A'}</p>
        <p><strong>Class:</strong> ${character.classes ? character.classes.name : 'N/A'}</p>
        <p><strong>Profession:</strong> ${character.professions ? character.professions.name : 'N/A'}</p>
        <p><strong>Sex:</strong> ${character.sex || 'N/A'}</p>
        <p><strong>Level:</strong> ${character.level || 1}</p>
        <p><strong>Experience:</strong> ${character.exp || 0}</p>
    `;
    detailsPanel.innerHTML += createSection('Basic Information', basicInfoHtml);

    // Stats (assuming these are columns in your character table or derived)
    // You'll need to define what stats your characters have (e.g., strength, agility, intelligence)
    // For now, I'll put placeholders.
    const statsHtml = `
        <p><strong>Strength:</strong> ${character.strength || 'N/A'}</p>
        <p><strong>Agility:</strong> ${character.agility || 'N/A'}</p>
        <p><strong>Intelligence:</strong> ${character.intelligence || 'N/A'}</p>
        <p><strong>Stamina:</strong> ${character.stamina || 'N/A'}</p>
        <p><strong>Spirit:</strong> ${character.spirit || 'N/A'}</p>
        <p><strong>HP:</strong> ${character.current_hp || 'N/A'} / ${character.max_hp || 'N/A'}</p>
        <p><strong>Mana:</strong> ${character.current_mana || 'N/A'} / ${character.max_mana || 'N/A'}</p>
        `;
    detailsPanel.innerHTML += createSection('Stats', statsHtml);

    // Equipped Items
    const equippedItems = [
        { label: 'Weapon', value: character.equipped_weapon },
        { label: 'Armor', value: character.equipped_armor },
        { label: 'Helmet', value: character.equipped_helmet },
        { label: 'Trinket', value: character.equipped_trinket },
        { label: 'Boots', value: character.equipped_boots },
        { label: 'Gloves', value: character.equipped_gloves }
    ];
    let equippedItemsHtml = '<ul>';
    equippedItems.forEach(item => {
        equippedItemsHtml += `<li><strong>${item.label}:</strong> ${item.value || 'None'}</li>`;
    });
    equippedItemsHtml += '</ul>';
    detailsPanel.innerHTML += createSection('Equipped Items', equippedItemsHtml);

    // Consumables (assuming jsonb array)
    const consumables = character.consumables && Array.isArray(character.consumables) 
        ? character.consumables.join(', ') 
        : 'None';
    const consumablesHtml = `<p>${consumables}</p>`;
    detailsPanel.innerHTML += createSection('Consumables', consumablesHtml);

    // Abilities (starting_abilities, learned_abilities - assuming these are arrays of IDs/names)
    // You might need to fetch full ability details if only IDs are stored.
    // For now, I'll just list the names from the joined `abilities` table.
    const startingAbilitiesHtml = character.abilities && Array.isArray(character.abilities) && character.abilities.length > 0
        ? `<ul>${character.abilities.map(a => `<li>${a.name}</li>`).join('')}</ul>`
        : '<p>None</p>';
    detailsPanel.innerHTML += createSection('Starting Abilities', startingAbilitiesHtml);

    // For 'learned_abilities', you'd need a separate join or a separate column storing learned abilities,
    // as the initial 'abilities' join typically covers what they start with.
    // Assuming 'learned_abilities_json' is a JSONB column with names/IDs
    const learnedAbilitiesList = character.learned_abilities_json && Array.isArray(character.learned_abilities_json)
        ? character.learned_abilities_json.map(a => `<li>${a}</li>`).join('')
        : '<p>None</p>';
    const learnedAbilitiesHtml = `<ul>${learnedAbilitiesList}</ul>`;
    detailsPanel.innerHTML += createSection('Learned Abilities', learnedAbilitiesHtml);


    // Talents (assuming this is an array of IDs/names)
    const talentsHtml = character.talents && Array.isArray(character.talents) && character.talents.length > 0
        ? `<ul>${character.talents.map(t => `<li>${t.name}</li>`).join('')}</ul>`
        : '<p>None</p>';
    detailsPanel.innerHTML += createSection('Talents', talentsHtml);
}

function setupInteractions() {
    console.log('[CHARACTER_MANAGER] Setting up interactions...');

    _main.querySelector('.back-to-castle-btn').addEventListener('click', () => {
        console.log('[CHARACTER_MANAGER_INTERACTION] Back to Castle button clicked.');
        window.gameAuth.loadModule('castle'); // Go back to castle scene
    });

    _main.querySelector('.character-list-panel').addEventListener('click', (e) => {
        if (e.target.classList.contains('character-select-btn')) {
            const charId = e.target.dataset.charId;
            selectCharacter(charId);
        }
    });
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

function addCharacterManagerStyles() {
    console.log('[STYLES] Adding character manager styles...');
    const styleId = 'character-manager-styles';
    if (document.getElementById(styleId)) {
        console.log('[STYLES] Styles already present, skipping re-addition.');
        return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .character-manager-container {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            background: linear-gradient(to bottom right, #1d140c, #2a1f16);
            color: #e0d8c9;
            font-family: 'Cinzel', serif;
            overflow: hidden;
        }

        .top-bar {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 2rem;
            background-color: rgba(0, 0, 0, 0.3);
            border-bottom: 2px solid #c4975a;
            box-sizing: border-box;
            z-index: 10;
        }

        .top-bar .title-text {
            font-size: 1.8rem;
            color: #c4975a;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
        }

        .character-list-panel {
            width: 25%; /* Left panel for character selection */
            min-width: 180px;
            max-width: 250px;
            padding: 1rem;
            background-color: rgba(29, 20, 12, 0.7);
            border-right: 2px solid #c4975a;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 0.8rem;
            position: absolute; /* Positioned relative to container */
            left: 0;
            top: 70px; /* Below the top-bar height */
            bottom: 0;
        }

        .character-details-panel {
            flex-grow: 1; /* Right panel for details */
            padding: 1.5rem;
            overflow-y: auto;
            position: absolute;
            left: 25%; /* To the right of the character list panel */
            top: 70px;
            bottom: 0;
            width: 75%; /* Remaining width */
            box-sizing: border-box;
        }
        
        @media (max-width: 768px) {
            .character-list-panel {
                width: 100%;
                max-width: unset;
                height: 150px; /* Fixed height for character list on mobile */
                flex-direction: row;
                flex-wrap: wrap;
                justify-content: center;
                border-right: none;
                border-bottom: 2px solid #c4975a;
                position: relative;
                top: 0;
                left: 0;
                bottom: unset;
            }
            .character-details-panel {
                width: 100%;
                left: 0;
                top: calc(70px + 150px); /* Below top-bar and char list */
                bottom: 0;
                position: relative; /* Change to relative for flow */
            }
            .top-bar {
                flex-direction: column;
                padding: 0.5rem;
                height: 70px;
                justify-content: center;
            }
            .top-bar .title-text {
                font-size: 1.4rem;
                margin-top: 0.5rem;
            }
        }


        .character-select-btn {
            width: 100%;
            padding: 0.7rem 0.5rem;
            font-size: 0.9rem;
            text-align: left;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .character-select-btn.selected {
            background-color: #c4975a;
            color: #1d140c;
            border-color: #c4975a;
            box-shadow: 0 0 10px rgba(196, 151, 90, 0.5);
        }

        .character-details-panel .placeholder-text {
            text-align: center;
            font-size: 1.2rem;
            color: rgba(224, 216, 201, 0.7);
            margin-top: 2rem;
        }

        .detail-section {
            background-color: rgba(29, 20, 12, 0.5);
            border: 1px solid #c4975a;
            border-radius: 8px;
            padding: 1rem 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .detail-section h3 {
            color: #c4975a;
            font-size: 1.5rem;
            margin-top: 0;
            margin-bottom: 1rem;
            border-bottom: 1px dashed rgba(196, 151, 90, 0.5);
            padding-bottom: 0.5rem;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
        }

        .detail-section .section-content p,
        .detail-section .section-content ul {
            margin: 0.5rem 0;
            font-size: 1rem;
            line-height: 1.5;
        }

        .detail-section .section-content ul {
            list-style: none; /* Remove default bullet points */
            padding-left: 0;
        }

        .detail-section .section-content ul li {
            position: relative;
            padding-left: 1.5rem;
            margin-bottom: 0.3rem;
        }

        .detail-section .section-content ul li::before {
            content: '♦'; /* Custom bullet point */
            color: #c4975a;
            position: absolute;
            left: 0;
            top: 0;
        }
        
        /* Reusing custom message box styles from common/global CSS or other modules */
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
    `;
    document.head.appendChild(style);
    console.log('[STYLES] Character manager styles appended to document head.');
}
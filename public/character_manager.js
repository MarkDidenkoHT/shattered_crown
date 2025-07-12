let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _playerCharacters = []; // Array to hold fetched characters

export async function loadModule(main, { apiCall, getCurrentProfile }) {
    console.log('[CHARACTER_MANAGER] --- Starting loadModule for Character Manager ---');
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;

    _profile = _getCurrentProfile();
    if (!_profile) {
        console.error('[CHARACTER_MANAGER] No profile found. Cannot proceed.');
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login'); // Redirect to login if no profile
        return;
    }
    console.log('[CHARACTER_MANAGER] Profile loaded:', _profile);

    _main.innerHTML = `
        <div class="main-app-container">
            <div class="character-manager-section">
                <div class="character-list-panel">
                    <h2>Your Champions</h2>
                    <div class="character-list-container">
                        </div>
                    <button class="fantasy-button create-new-char-btn">Create New Champion</button>
                    <button class="fantasy-button back-to-castle-btn">Back to Castle</button>
                </div>
                <div class="character-details-panel">
                    <h2>Champion Details</h2>
                    <p>Select a champion from the list to view their details.</p>
                </div>
            </div>
        </div>
    `;

    addCharacterManagerStyles(); // Assuming you have this CSS import/function
    await fetchPlayerCharacters();
    renderCharacterList();
    setupEventListeners();

    console.log('[CHARACTER_MANAGER] --- loadModule for Character Manager finished ---');
}

async function fetchPlayerCharacters() {
    console.log(`[CHARACTER_MANAGER] Fetching characters for player ID: ${_profile.id}...`);
    try {
        // Запрос к таблице 'characters', джойним 'races', 'classes', 'professions'
        // и экипированные предметы по их ID.
        // `stats_json`, `starting_abilities` и `learned_abilities` будут получены как JSONB.
        const { data: characters, error } = await _apiCall(
            `/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=id,name,sex,level,exp,current_hp,max_hp,stats_json,starting_abilities,learned_abilities,race_id,class_id,profession_id,races(name),classes(name),professions(name),equipped_weapon_id:items!equipped_weapon_id(name),equipped_armor_id:items!equipped_armor_id(name),equipped_helmet_id:items!equipped_helmet_id(name),equipped_trinket_id:items!equipped_trinket_id(name),equipped_boots_id:items!equipped_boots_id(name),equipped_gloves_id:items!equipped_gloves_id(name)`
        );

        if (error) {
            console.error('[CHARACTER_MANAGER] Supabase error fetching player characters:', error);
            displayMessage('Failed to load your champions: ' + error.message);
            return;
        }

        _playerCharacters = characters;
        console.log('[CHARACTER_MANAGER] Player characters fetched:', _playerCharacters);

    } catch (error) {
        console.error('[CHARACTER_MANAGER] Unexpected error fetching player characters:', error);
        displayMessage('Failed to load your champions. Please try again.');
    }
}

function renderCharacterList() {
    console.log('[CHARACTER_MANAGER] Rendering character list.');
    const characterListContainer = _main.querySelector('.character-list-container');
    characterListContainer.innerHTML = ''; // Clear previous list

    if (_playerCharacters.length === 0) {
        characterListContainer.innerHTML = '<p>You have no champions yet. Create one!</p>';
        return;
    }

    _playerCharacters.forEach(character => {
        const charCard = document.createElement('div');
        charCard.classList.add('character-card');
        charCard.dataset.characterId = character.id;

        const raceName = character.races ? character.races.name : 'Unknown Race';
        const className = character.classes ? character.classes.name : 'Unknown Class';
        const professionName = character.professions ? character.professions.name : 'Unknown Profession';

        charCard.innerHTML = `
            <img src="assets/art/characters/placeholder_char.png" alt="${character.name}" class="char-avatar" onerror="this.src='assets/art/placeholder.jpg'">
            <div class="char-info">
                <h3>${character.name || 'Unnamed Champion'}</h3>
                <p>Level ${character.level} ${raceName} ${className}</p>
                <p>Profession: ${professionName}</p>
                <p>HP: ${character.current_hp}/${character.max_hp}</p>
            </div>
        `;
        characterListContainer.appendChild(charCard);
    });
}

function setupEventListeners() {
    console.log('[CHARACTER_MANAGER] Setting up event listeners.');

    _main.querySelector('.character-list-container').addEventListener('click', (e) => {
        const card = e.target.closest('.character-card');
        if (card) {
            const charId = card.dataset.characterId;
            const selectedCharacter = _playerCharacters.find(char => char.id === charId);
            if (selectedCharacter) {
                console.log(`[CHARACTER_MANAGER_EVENT] Character card clicked: ${selectedCharacter.name}`);
                renderCharacterDetails(selectedCharacter);

                // Highlight selected card
                _main.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            }
        }
    });

    _main.querySelector('.create-new-char-btn').addEventListener('click', () => {
        console.log('[CHARACTER_MANAGER_EVENT] Create New Champion button clicked.');
        displayMessage('Redirecting to character creation...');
        window.gameAuth.loadModule('char_creation'); // Assuming this is your char creation module
    });

    _main.querySelector('.back-to-castle-btn').addEventListener('click', () => {
        console.log('[CHARACTER_MANAGER_EVENT] Back to Castle button clicked.');
        displayMessage('Returning to the Castle...');
        window.gameAuth.loadModule('castle'); // Assuming this is your castle module
    });
}

function renderCharacterDetails(character) {
    console.log('[CHARACTER_MANAGER] Rendering details for character:', character.name);
    const detailsPanel = _main.querySelector('.character-details-panel');
    detailsPanel.innerHTML = ''; // Clear previous details

    const createSection = (title, contentHtml) => `
        <div class="detail-section">
            <h3>${title}</h3>
            <div class="section-content">${contentHtml}</div>
        </div>
    `;

    // Basic Info
    // Парсим stats_json
    const stats = character.stats_json || {};
    const statsHtml = Object.entries(stats).map(([stat, value]) => `<p><strong>${stat}:</strong> <span>${value}</span></p>`).join('');

    const basicInfoHtml = `
        <p><strong>Name:</strong> ${character.name || 'N/A'}</p>
        <p><strong>Race:</strong> ${character.races ? character.races.name : 'N/A'}</p>
        <p><strong>Class:</strong> ${character.classes ? character.classes.name : 'N/A'}</p>
        <p><strong>Profession:</strong> ${character.professions ? character.professions.name : 'N/A'}</p>
        <p><strong>Sex:</strong> ${character.sex || 'N/A'}</p>
        <p><strong>Level:</strong> ${character.level || 1}</p>
        <p><strong>Experience:</strong> ${character.exp || 0}</p>
        <p><strong>HP:</strong> ${character.current_hp || 'N/A'} / ${character.max_hp || 'N/A'}</p>
        <h4>Stats:</h4>
        ${statsHtml}
    `;
    detailsPanel.innerHTML += createSection('Basic Information & Stats', basicInfoHtml);

    // Equipped Items
    const equippedItems = [
        { label: 'Weapon', value: character.equipped_weapon_id ? character.equipped_weapon_id.name : null },
        { label: 'Armor', value: character.equipped_armor_id ? character.equipped_armor_id.name : null },
        { label: 'Helmet', value: character.equipped_helmet_id ? character.equipped_helmet_id.name : null },
        { label: 'Trinket', value: character.equipped_trinket_id ? character.equipped_trinket_id.name : null },
        { label: 'Boots', value: character.equipped_boots_id ? character.equipped_boots_id.name : null },
        { label: 'Gloves', value: character.equipped_gloves_id ? character.equipped_gloves_id.name : null }
    ];
    let equippedItemsHtml = '<ul>';
    equippedItems.forEach(item => {
        equippedItemsHtml += `<li><strong>${item.label}:</strong> ${item.value || 'None'}</li>`;
    });
    equippedItemsHtml += '</ul>';
    detailsPanel.innerHTML += createSection('Equipped Items', equippedItemsHtml);

    // Consumables (assuming jsonb array of strings)
    const consumables = character.consumables && Array.isArray(character.consumables) && character.consumables.length > 0
        ? character.consumables.join(', ')
        : 'None';
    const consumablesHtml = `<p>${consumables}</p>`;
    detailsPanel.innerHTML += createSection('Consumables', consumablesHtml);

    // Starting Abilities (assuming jsonb array of strings)
    const startingAbilities = character.starting_abilities && Array.isArray(character.starting_abilities) && character.starting_abilities.length > 0
        ? `<ul>${character.starting_abilities.map(a => `<li>${a}</li>`).join('')}</ul>`
        : '<p>None</p>';
    detailsPanel.innerHTML += createSection('Starting Abilities', startingAbilities);

    // Learned Abilities (assuming jsonb array of strings)
    const learnedAbilities = character.learned_abilities && Array.isArray(character.learned_abilities) && character.learned_abilities.length > 0
        ? `<ul>${character.learned_abilities.map(a => `<li>${a}</li>`).join('')}</ul>`
        : '<p>None</p>';
    detailsPanel.innerHTML += createSection('Learned Abilities', learnedAbilities);

    // Talents (placeholder)
    const talentsHtml = '<p>Talents functionality coming soon!</p>';
    detailsPanel.innerHTML += createSection('Talents', talentsHtml);

    // Add action buttons
    const actionButtonsHtml = `
        <div class="action-buttons">
            <button class="fantasy-button edit-char-btn" data-char-id="${character.id}">Edit Champion</button>
            <button class="fantasy-button delete-char-btn danger-button" data-char-id="${character.id}">Delete Champion</button>
        </div>
    `;
    detailsPanel.innerHTML += actionButtonsHtml;

    // Add event listeners for new buttons
    detailsPanel.querySelector('.edit-char-btn').addEventListener('click', (e) => {
        const charId = e.target.dataset.charId;
        console.log(`[CHARACTER_MANAGER_EVENT] Edit Champion button clicked for ID: ${charId}`);
        displayMessage('Edit functionality coming soon!');
        // Implement edit logic here, maybe load a new module or render an edit form
    });

    detailsPanel.querySelector('.delete-char-btn').addEventListener('click', async (e) => {
        const charId = e.target.dataset.charId;
        console.log(`[CHARACTER_MANAGER_EVENT] Delete Champion button clicked for ID: ${charId}`);
        if (confirm('Are you sure you want to delete this champion? This action cannot be undone.')) {
            await deleteCharacter(charId);
        }
    });
}

// Placeholder for delete character function
async function deleteCharacter(charId) {
    console.log(`[CHARACTER_MANAGER] Attempting to delete character with ID: ${charId}`);
    try {
        // Assuming your _apiCall supports DELETE method
        // You might need to adjust this depending on how _apiCall is implemented
        const { error } = await _apiCall(`/api/supabase/rest/v1/characters?id=eq.${charId}`, {
            method: 'DELETE'
        });

        if (error) {
            console.error('[CHARACTER_MANAGER] Error deleting character:', error);
            displayMessage('Failed to delete champion: ' + error.message);
        } else {
            console.log(`[CHARACTER_MANAGER] Character ${charId} deleted successfully.`);
            displayMessage('Champion successfully deleted!');
            // Re-fetch and re-render the list
            await fetchPlayerCharacters();
            renderCharacterList();
            // Clear details panel after deletion
            _main.querySelector('.character-details-panel').innerHTML = '<h2>Champion Details</h2><p>Select a champion from the list to view their details.</p>';
        }
    } catch (error) {
        console.error('[CHARACTER_MANAGER] Unexpected error during character deletion:', error);
        displayMessage('An error occurred during deletion. Please try again.');
    }
}


// Placeholder for general display message (if not already defined globally)
function displayMessage(message) {
    const messageContainer = document.getElementById('game-message-container'); // Assuming a global message container
    if (messageContainer) {
        messageContainer.textContent = message;
        messageContainer.style.opacity = 1;
        setTimeout(() => {
            messageContainer.style.opacity = 0;
            messageContainer.textContent = '';
        }, 3000);
    } else {
        console.warn('Message container not found. Message:', message);
        alert(message); // Fallback
    }
}

// Placeholder for addCharacterManagerStyles (if not already defined)
function addCharacterManagerStyles() {
    if (!document.getElementById('character-manager-styles')) {
        const style = document.createElement('style');
        style.id = 'character-manager-styles';
        style.innerHTML = `
            .character-manager-section {
                display: flex;
                gap: 20px;
                padding: 20px;
                justify-content: center;
                align-items: flex-start;
                flex-wrap: wrap; /* Allow wrapping on smaller screens */
            }

            .character-list-panel, .character-details-panel {
                background-color: rgba(0, 0, 0, 0.7);
                border: 1px solid #4a3b2b;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
                color: #e0d8c9;
            }

            .character-list-panel {
                flex: 1;
                min-width: 300px;
                max-width: 400px;
            }

            .character-details-panel {
                flex: 2;
                min-width: 400px;
                max-width: 700px;
            }

            .character-list-container {
                max-height: 500px;
                overflow-y: auto;
                margin-bottom: 20px;
                padding-right: 10px; /* For scrollbar */
            }

            .character-card {
                display: flex;
                align-items: center;
                background-color: rgba(30, 20, 10, 0.8);
                border: 1px solid #6b5c4a;
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 10px;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            }

            .character-card:hover {
                transform: translateY(-3px);
                box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
            }

            .character-card.selected {
                border-color: #ffd700; /* Gold highlight */
                box-shadow: 0 0 15px rgba(255, 215, 0, 0.5);
            }

            .char-avatar {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                object-fit: cover;
                margin-right: 15px;
                border: 2px solid #8b7d6b;
            }

            .char-info h3 {
                margin: 0 0 5px 0;
                color: #f0e6d2;
                font-size: 1.2em;
            }

            .char-info p {
                margin: 0;
                font-size: 0.9em;
                color: #c2b5a1;
            }

            .detail-section {
                background-color: rgba(40, 30, 20, 0.8);
                border: 1px solid #5a4b3a;
                border-radius: 5px;
                padding: 15px;
                margin-bottom: 15px;
            }

            .detail-section h3 {
                color: #f0e6d2;
                margin-top: 0;
                border-bottom: 1px solid #6b5c4a;
                padding-bottom: 8px;
                margin-bottom: 10px;
            }

            .detail-section p {
                margin: 5px 0;
                color: #d4c7b8;
            }

            .detail-section p strong {
                color: #f0e6d2;
            }

            .detail-section ul {
                list-style: none;
                padding: 0;
                margin: 5px 0;
            }

            .detail-section ul li {
                background-color: rgba(50, 40, 30, 0.7);
                padding: 5px 10px;
                border-radius: 3px;
                margin-bottom: 3px;
            }

            .fantasy-button {
                background-color: #8b4513; /* SaddleBrown */
                color: #fff;
                border: 2px solid #a0522d; /* Sienna */
                padding: 10px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-family: 'MedievalSharp', cursive; /* Example fantasy font */
                font-size: 1em;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
                box-shadow: 2px 2px 5px rgba(0,0,0,0.3);
                transition: background-color 0.2s, border-color 0.2s, transform 0.2s;
                margin-top: 10px;
            }

            .fantasy-button:hover {
                background-color: #a0522d; /* Sienna */
                border-color: #cd853f; /* Peru */
                transform: translateY(-2px);
            }
            .fantasy-button:active {
                transform: translateY(0);
                box-shadow: 1px 1px 2px rgba(0,0,0,0.3);
            }

            .create-new-char-btn, .back-to-castle-btn {
                width: 100%;
                margin-bottom: 10px;
            }

            .action-buttons {
                display: flex;
                gap: 10px;
                margin-top: 20px;
                justify-content: flex-end;
            }

            .danger-button {
                background-color: #8B0000; /* DarkRed */
                border-color: #DC143C; /* Crimson */
            }

            .danger-button:hover {
                background-color: #DC143C; /* Crimson */
                border-color: #FF6347; /* Tomato */
            }

            @media (max-width: 768px) {
                .character-manager-section {
                    flex-direction: column;
                    align-items: center;
                }
                .character-list-panel, .character-details-panel {
                    min-width: unset;
                    width: 100%;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Assuming displayMessage function is globally available or imported.
// If not, you might need to provide it.
// Example:
// function displayMessage(msg) {
//     const msgElement = document.getElementById('message-area'); // Or similar element
//     if (msgElement) {
//         msgElement.textContent = msg;
//         msgElement.style.display = 'block';
//         setTimeout(() => msgElement.style.display = 'none', 3000);
//     } else {
//         console.log(msg);
//     }
// }
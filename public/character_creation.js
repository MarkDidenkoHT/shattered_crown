// character_creation.js

const MAX_CHARACTERS = 3; // Maximum number of characters a player can have

let currentProfile = null;
let selectedGod = null; // Stores the selected god object after selection or if already in profile
let currentCharacters = []; // Array to hold characters loaded from Supabase
let characterBeingCreated = {}; // Object to store data for the character currently in creation process

// UI Element References
// Panels
const godSelectionPanel = document.getElementById('godSelection');
const characterSlotSelectionPanel = document.getElementById('characterSlotSelection');
const raceSelectionPanel = document.getElementById('raceSelection');
const classSelectionPanel = document.getElementById('classSelection');
const characterSummaryPanel = document.getElementById('characterSummary');

// God Selection Elements
const godListContainer = document.getElementById('godList');
const selectGodBtn = document.getElementById('selectGodBtn');

// Character Slot Elements
const characterSlotsContainer = document.getElementById('characterSlots');
const createCharacterBtn = document.getElementById('createCharacterBtn');

// Race Selection Elements
const raceListContainer = document.getElementById('raceList');
const selectedRaceNameSpan = document.getElementById('selectedRaceName');
const selectedRaceDescriptionSpan = document.getElementById('selectedRaceDescription');
const selectedRaceStatsSpan = document.getElementById('selectedRaceStats');
const selectRaceBtn = document.getElementById('selectRaceBtn');
const backToCharacterSlotsBtn = document.getElementById('backToCharacterSlotsBtn');

// Class Selection Elements
const classListContainer = document.getElementById('classList');
const selectedClassNameSpan = document.getElementById('selectedClassName');
const selectedClassDescriptionSpan = document.getElementById('selectedClassDescription');
const selectedClassBonusesSpan = document.getElementById('selectedClassBonuses');
const selectedClassAbilitiesSpan = document.getElementById('selectedClassAbilities');
const selectClassBtn = document.getElementById('selectClassBtn');
const backToRaceSelectionBtn = document.getElementById('backToRaceSelectionBtn');

// Character Summary Elements
const characterNameInput = document.getElementById('characterNameInput');
const summaryRaceNameSpan = document.getElementById('summaryRaceName');
const summaryClassNameSpan = document.getElementById('summaryClassName');
const summaryFinalStatsSpan = document.getElementById('summaryFinalStats');
const summaryAbilitiesSpan = document.getElementById('summaryAbilities');
const editCharacterBtn = document.getElementById('editCharacterBtn');
const confirmCharacterBtn = document.getElementById('confirmCharacterBtn');

// --- Helper Functions ---

/**
 * Hides all main content panels and displays the specified one.
 * @param {HTMLElement} panelToDisplay - The panel to make visible.
 */
function showPanel(panelToDisplay) {
    godSelectionPanel.style.display = 'none';
    characterSlotSelectionPanel.style.display = 'none';
    raceSelectionPanel.style.display = 'none';
    classSelectionPanel.style.display = 'none';
    characterSummaryPanel.style.display = 'none';
    panelToDisplay.style.display = 'block';
}

/**
 * Formats a stats object into a readable string.
 * @param {Object} stats - An object with stat names as keys and values as numbers.
 * @returns {string} Formatted string, e.g., "Spirit: 5, Strength: 8".
 */
function formatStats(stats) {
    if (!stats) return 'N/A';
    return Object.entries(stats).map(([key, value]) => `${key}: ${value}`).join(', ');
}

/**
 * Calculates the final stats by combining base stats and class bonuses.
 * @param {Object} baseStats - Base stats from the selected race.
 * @param {Object} statBonuses - Stat bonuses from the selected class.
 * @returns {Object} An object with the combined final stats.
 */
function calculateFinalStats(baseStats, statBonuses) {
    const finalStats = { ...baseStats }; // Create a copy of base stats
    for (const stat in statBonuses) {
        finalStats[stat] = (finalStats[stat] || 0) + statBonuses[stat];
    }
    return finalStats;
}

// --- Main Flow Control ---

/**
 * Initiates the character creation flow by checking user profile and god selection.
 */
async function startCharacterCreationFlow() {
    currentProfile = window.gameAuth.getCurrentProfile();
    if (!currentProfile) {
        alert('You must be logged in to create a character.');
        window.gameAuth.logout(); // Redirect to login page if no profile
        return;
    }

    if (!currentProfile.gid) {
        // If no god is selected in profile, go to god selection
        await loadGodSelection();
    } else {
        // If a god is already selected, store it and proceed to character slot selection
        // We need to fetch the god details to get its name/description if needed later,
        // but for now, just storing the ID from the profile is enough to proceed.
        // For displaying the god's name, we would ideally fetch the god object using currentProfile.gid
        // For simplicity, we assume if gid is present, god selection is complete.
        selectedGod = { id: currentProfile.gid }; // Set a minimal god object for flow control
        await loadCharacterSlots();
    }
}

// --- God Selection Step ---

/**
 * Loads and displays the list of gods for the player to choose from.
 */
async function loadGodSelection() {
    showPanel(godSelectionPanel);
    godListContainer.innerHTML = '<p>Loading deities...</p>';
    selectGodBtn.disabled = true; // Disable button until a selection is made

    const gods = await window.supabaseData.getGods();

    if (gods.length === 0) {
        godListContainer.innerHTML = '<p>No deities found. Please configure the "gods" table in your Supabase DB.</p>';
        return;
    }

    godListContainer.innerHTML = '';
    gods.forEach(god => {
        const godElement = document.createElement('div');
        godElement.classList.add('list-item');
        godElement.dataset.id = god.id;
        godElement.innerHTML = `
            <h3>${god.name}</h3>
            <p>${god.description}</p>
        `;
        godElement.addEventListener('click', () => {
            document.querySelectorAll('#godList .list-item').forEach(item => item.classList.remove('selected'));
            godElement.classList.add('selected');
            selectedGod = god; // Store the full god object
            selectGodBtn.disabled = false;
        });
        godListContainer.appendChild(godElement);
    });
}

// Event listener for selecting a god
selectGodBtn.addEventListener('click', async () => {
    if (!selectedGod) {
        alert('Please select a deity!');
        return;
    }
    selectGodBtn.disabled = true;
    selectGodBtn.textContent = 'Saving...';

    // Update the player's profile with the selected god's ID
    const updatedProfile = await window.supabaseData.updateProfile(currentProfile.id, { gid: selectedGod.id });

    if (updatedProfile) {
        localStorage.setItem('profile', JSON.stringify(updatedProfile)); // Update local storage
        currentProfile = updatedProfile; // Update current profile object
        alert(`You have chosen ${selectedGod.name} as your patron deity!`);
        await loadCharacterSlots(); // Move to the next step
    } else {
        alert('Failed to save deity selection. Please try again.');
    }
    selectGodBtn.disabled = false;
    selectGodBtn.textContent = 'Select Deity';
});

// --- Character Slot Management Step ---

/**
 * Loads and displays the player's existing characters and controls the "Create New Champion" button.
 */
async function loadCharacterSlots() {
    showPanel(characterSlotSelectionPanel);
    characterSlotsContainer.innerHTML = '<p>Loading champions...</p>';
    createCharacterBtn.style.display = 'none'; // Hide button initially

    currentCharacters = await window.supabaseData.getCharactersForPlayer(currentProfile.id);

    characterSlotsContainer.innerHTML = '';
    if (currentCharacters.length > 0) {
        currentCharacters.forEach((char, index) => {
            const charElement = document.createElement('div');
            charElement.classList.add('list-item');
            charElement.innerHTML = `
                <h3>Champion ${index + 1}: ${char.name}</h3>
                <p>Race: ${char.race_name}</p>
                <p>Class: ${char.class_name}</p>
                <p>Stats: ${formatStats(char.final_stats)}</p>
            `;
            characterSlotsContainer.appendChild(charElement);
        });
    } else {
        characterSlotsContainer.innerHTML = '<p>No champions created yet!</p>';
    }

    if (currentCharacters.length < MAX_CHARACTERS) {
        createCharacterBtn.style.display = 'block';
        createCharacterBtn.textContent = `Create New Champion (${currentCharacters.length}/${MAX_CHARACTERS})`;
    } else {
        createCharacterBtn.style.display = 'none';
        characterSlotsContainer.innerHTML += '<p>You have reached the maximum number of champions (3).</p>';
        // TODO: At this point, if all slots are full, you might want to redirect to the main game lobby.
        // For now, it just shows the message.
    }
}

// Event listener for creating a new character
createCharacterBtn.addEventListener('click', () => {
    characterBeingCreated = {
        player_id: currentProfile.id,
        god_id: selectedGod.id // Crucial for filtering races by chosen god
    };
    loadRaceSelection(); // Move to race selection for the new character
});

// --- Race Selection Step ---

/**
 * Loads and displays races available for the player's selected god.
 */
async function loadRaceSelection() {
    showPanel(raceSelectionPanel);
    raceListContainer.innerHTML = '<p>Loading races...</p>';
    // Clear previous details
    selectedRaceNameSpan.textContent = '';
    selectedRaceDescriptionSpan.textContent = '';
    selectedRaceStatsSpan.textContent = '';
    selectRaceBtn.disabled = true;

    // Fetch races filtered by the player's chosen god's ID (faction_id in races table)
    const races = await window.supabaseData.getRacesByFaction(characterBeingCreated.god_id);

    if (races.length === 0) {
        raceListContainer.innerHTML = '<p>No races found for your chosen deity. Please configure the "races" table in Supabase.</p>';
        return;
    }

    raceListContainer.innerHTML = '';
    races.forEach(race => {
        const raceElement = document.createElement('div');
        raceElement.classList.add('list-item');
        raceElement.dataset.id = race.id;
        raceElement.innerHTML = `
            <h3>${race.name}</h3>
            <p>${race.description}</p>
        `;
        raceElement.addEventListener('click', () => {
            document.querySelectorAll('#raceList .list-item').forEach(item => item.classList.remove('selected'));
            raceElement.classList.add('selected');
            characterBeingCreated.race = race; // Store the selected race object
            displayRaceDetails(race);
            selectRaceBtn.disabled = false;
        });
        raceListContainer.appendChild(raceElement);
    });
}

/**
 * Displays the details of the selected race in the UI.
 * @param {Object} race - The selected race object.
 */
function displayRaceDetails(race) {
    selectedRaceNameSpan.textContent = race.name;
    selectedRaceDescriptionSpan.textContent = race.description;
    selectedRaceStatsSpan.textContent = formatStats(race.base_stats);
}

// Event listener for selecting a race
selectRaceBtn.addEventListener('click', () => {
    if (!characterBeingCreated.race) {
        alert('Please select a race!');
        return;
    }
    loadClassSelection(); // Move to class selection
});

// Event listener to go back to character slots from race selection
backToCharacterSlotsBtn.addEventListener('click', async () => {
    characterBeingCreated = {}; // Clear partial character data
    await loadCharacterSlots();
});

// --- Class Selection Step ---

/**
 * Loads and displays classes available for the currently selected race.
 */
async function loadClassSelection() {
    showPanel(classSelectionPanel);
    classListContainer.innerHTML = '<p>Loading classes...</p>';
    // Clear previous details
    selectedClassNameSpan.textContent = '';
    selectedClassDescriptionSpan.textContent = '';
    selectedClassBonusesSpan.textContent = '';
    selectedClassAbilitiesSpan.textContent = '';
    selectClassBtn.disabled = true;

    if (!characterBeingCreated.race) {
        alert('No race selected. Returning to race selection.');
        loadRaceSelection(); // Go back if race isn't set
        return;
    }

    // Fetch classes filtered by the selected race's ID (faction_id in classes table)
    const classes = await window.supabaseData.getClassesByRace(characterBeingCreated.race.id);

    if (classes.length === 0) {
        classListContainer.innerHTML = '<p>No classes found for this race. Please configure the "classes" table in Supabase.</p>';
        return;
    }

    classListContainer.innerHTML = '';
    classes.forEach(_class => {
        const classElement = document.createElement('div');
        classElement.classList.add('list-item');
        classElement.dataset.id = _class.id;
        classElement.innerHTML = `
            <h3>${_class.name}</h3>
            <p>${_class.description}</p>
        `;
        classElement.addEventListener('click', () => {
            document.querySelectorAll('#classList .list-item').forEach(item => item.classList.remove('selected'));
            classElement.classList.add('selected');
            characterBeingCreated.class = _class; // Store the selected class object
            displayClassDetails(_class);
            selectClassBtn.disabled = false;
        });
        classListContainer.appendChild(classElement);
    });
}

/**
 * Displays the details of the selected class in the UI.
 * @param {Object} _class - The selected class object.
 */
function displayClassDetails(_class) {
    selectedClassNameSpan.textContent = _class.name;
    selectedClassDescriptionSpan.textContent = _class.description;
    selectedClassBonusesSpan.textContent = formatStats(_class.stat_bonuses);
    selectedClassAbilitiesSpan.textContent = _class.starting_abilities ? _class.starting_abilities.join(', ') : 'None';
}

// Event listener for selecting a class
selectClassBtn.addEventListener('click', () => {
    if (!characterBeingCreated.class) {
        alert('Please select a class!');
        return;
    }
    displayCharacterSummary(); // Move to character summary
});

// Event listener to go back to race selection from class selection
backToRaceSelectionBtn.addEventListener('click', () => {
    characterBeingCreated.class = null; // Clear class selection
    loadRaceSelection();
});

// --- Character Summary Step ---

/**
 * Displays the final summary of the character before creation, including calculated stats.
 */
function displayCharacterSummary() {
    showPanel(characterSummaryPanel);
    const race = characterBeingCreated.race;
    const _class = characterBeingCreated.class;

    if (!race || !_class) {
        alert('Character data is incomplete. Please go back and select race/class.');
        loadRaceSelection(); // Go back if data is missing
        return;
    }

    // Populate summary details
    summaryRaceNameSpan.textContent = race.name;
    summaryClassNameSpan.textContent = _class.name;
    summaryFinalStatsSpan.textContent = formatStats(calculateFinalStats(race.base_stats, _class.stat_bonuses));
    summaryAbilitiesSpan.textContent = _class.starting_abilities ? _class.starting_abilities.join(', ') : 'None';
}

// Event listener for confirming character creation
confirmCharacterBtn.addEventListener('click', async () => {
    const characterName = characterNameInput.value.trim();
    if (!characterName) {
        alert('Please enter a name for your champion!');
        return;
    }

    confirmCharacterBtn.disabled = true;
    confirmCharacterBtn.textContent = 'Creating...';

    const newCharacterData = {
        player_id: currentProfile.id,
        name: characterName,
        race_id: characterBeingCreated.race.id,
        race_name: characterBeingCreated.race.name,
        class_id: characterBeingCreated.class.id,
        class_name: characterBeingCreated.class.name,
        final_stats: calculateFinalStats(characterBeingCreated.race.base_stats, characterBeingCreated.class.stat_bonuses),
        abilities: characterBeingCreated.class.starting_abilities
    };

    const createdCharacter = await window.supabaseData.createCharacter(newCharacterData);

    if (createdCharacter) {
        alert(`Champion "${characterName}" created successfully!`);
        characterBeingCreated = {}; // Reset for the next character
        characterNameInput.value = ''; // Clear name input
        await loadCharacterSlots(); // Go back to character slots view
    } else {
        alert('Failed to create champion. Please try again.');
    }
    confirmCharacterBtn.disabled = false;
    confirmCharacterBtn.textContent = 'Confirm Champion';
});

// Event listener to go back and edit character choices from summary
editCharacterBtn.addEventListener('click', () => {
    // For editing, we go back to class selection, allowing changes to class or then race.
    loadClassSelection();
});

// --- Initial Setup ---

// Attach the main flow function to the DOMContentLoaded event
document.addEventListener('DOMContentLoaded', startCharacterCreationFlow);
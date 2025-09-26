let _main, _apiCall, _getCurrentProfile, _profile, _godId;
let _races = [], _classes = [], _professions = [];
let _existingCharacterCount = 0, _maxCharacters = 3;
let _selectedRace = null, _selectedClass = null, _selectedPortrait = null, _selectedProfession = null;
let _usedProfessionIds = [];
let _characterName = '';

export async function loadModule(main, { apiCall, getCurrentProfile }) {
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;
    _profile = _getCurrentProfile();
    
    if (!_profile) {
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login');
        return;
    }
    
    _godId = _profile.god;
    if (!_godId || _godId === null || _godId === 'null') {
        displayMessage('Please select a deity first.');
        window.gameAuth.loadModule('god_selection');
        return;
    }

    await initializeCharacterData();
    _main.innerHTML = `<div class="main-app-container"><div class="particles"></div><div class="character-creation-section"></div></div>`;
    addStyles();
    createParticles();
    await startCharacterCreationFlow();
}

async function initializeCharacterData() {
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=profession_id`);
        const existingCharacters = await response.json();
        _existingCharacterCount = existingCharacters.length;
        _usedProfessionIds = existingCharacters.map(char => char.profession_id).filter(id => id !== null);
    } catch (error) {
        _existingCharacterCount = 0;
        _usedProfessionIds = [];
    }
}

async function startCharacterCreationFlow() {
    _selectedRace = _selectedClass = _selectedPortrait = _selectedProfession = null;
    _characterName = '';
    if (_existingCharacterCount >= _maxCharacters) {
        displayMessage('All your champions are ready! Entering the Castle...');
        window.gameAuth.loadModule('castle');
        return;
    }
    renderNameSelection();
}

function renderNameSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    section.innerHTML = `
        <div class="header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Name Your Champion</h1>
        </div>
        <div class="content">
            <label>Enter a name for your champion:</label>
            <input type="text" id="character-name-input" maxlength="24" placeholder="Champion Name" value="${_characterName}">
            <div class="error-message" style="display: none;"></div>
            <button class="btn confirm-btn">Confirm Name</button>
        </div>
    `;
    
    const input = section.querySelector('#character-name-input');
    const errorMsg = section.querySelector('.error-message');
    section.querySelector('.confirm-btn').addEventListener('click', () => {
        const name = input.value.trim();
        if (!name || name.length < 2) {
            errorMsg.textContent = name ? 'Name must be at least 2 characters.' : 'Please enter a name.';
            errorMsg.style.display = 'block';
            return;
        }
        errorMsg.style.display = 'none';
        _characterName = name;
        fetchRacesAndRenderSelection();
    });
}

async function fetchRacesAndRenderSelection() {
    try {
        const response = await fetch(`/api/races/${_godId}`);
        if (!response.ok) throw new Error('Failed to fetch races');
        
        _races = await response.json();
        if (_races.length === 0) {
            displayMessage('No races available for your chosen deity. Please contact support.');
            return;
        }
        
        await fetchAllClassesForRaces();
        renderRaceSelection();
    } catch (error) {
        displayMessage('Failed to load races. Please try again.');
    }
}

async function fetchAllClassesForRaces() {
    try {
        const raceIds = _races.map(race => race.id);
        const response = await _apiCall(`/api/supabase/rest/v1/classes?race_id=in.(${raceIds.join(',')})&select=id,name,description,race_id,stat_bonuses,starting_abilities`);
        const allClasses = await response.json();
        
        _races.forEach(race => {
            race.available_classes = allClasses.filter(cls => cls.race_id === race.id);
        });
    } catch (error) {
        _races.forEach(race => { race.available_classes = []; });
    }
}

function renderRaceSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    
    section.innerHTML = `
        <div class="header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Race</h1>
        </div>
        <div class="slider">
            <div class="slider-track">
                ${_races.map(race => `
                    <div class="slide">
                        <img src="assets/art/races/${race.name.toLowerCase().replace(/\s+/g, '_')}.png" alt="${race.name}">
                        <h3>${race.name}</h3>
                        <p>${race.description}</p>
                        <div class="stats">
                            <h4>Base Stats:</h4>
                            ${Object.entries(race.base_stats).map(([stat, value]) => `<p>${stat}: <span>${value}</span></p>`).join('')}
                        </div>
                        <button class="btn" onclick="handleRaceSelection(${race.id})">Select ${race.name}</button>
                    </div>
                `).join('')}
            </div>
            <div class="dots">
                ${_races.map((_, i) => `<button class="dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></button>`).join('')}
            </div>
        </div>
    `;
    initializeSlider();
}

function renderClassSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    
    section.innerHTML = `
        <div class="header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Class</h1>
            <div class="summary">Selected Race: ${_selectedRace.name}</div>
        </div>
        <div class="slider">
            <div class="slider-track">
                ${_classes.map(cls => `
                    <div class="slide">
                        <h3>${cls.name}</h3>
                        <p>${cls.description}</p>
                        <div class="stats">
                            <h4>Stat Bonuses:</h4>
                            ${Object.entries(cls.stat_bonuses).map(([stat, value]) => `<p>${stat}: <span>+${value}</span></p>`).join('')}
                        </div>
                        <button class="btn" onclick="handleClassSelection(${cls.id})">Select ${cls.name}</button>
                    </div>
                `).join('')}
            </div>
            <div class="dots">
                ${_classes.map((_, i) => `<button class="dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></button>`).join('')}
            </div>
        </div>
        <button class="btn return-btn" onclick="renderRaceSelection()">Return</button>
    `;
    initializeSlider();
}

function renderPortraitSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    const className = _selectedClass.name.toLowerCase().replace(/\s+/g, '_');
    const portraits = [`${className}_portrait_1`, `${className}_portrait_2`, `${className}_portrait_3`, `${className}_portrait_4`];
    
    section.innerHTML = `
        <div class="header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Portrait</h1>
            <div class="summary">Race: ${_selectedRace.name} | Class: ${_selectedClass.name}</div>
        </div>
        <div class="grid">
            ${portraits.map(portrait => `
                <div class="grid-item" onclick="handlePortraitSelection('${portrait}')">
                    <img src="assets/art/classes/portraits/${className}/${portrait}.png" alt="${portrait}">
                    <div>Portrait ${portrait.slice(-1)}</div>
                </div>
            `).join('')}
        </div>
        <button class="btn return-btn" onclick="renderClassSelection()">Return</button>
    `;
}

function renderProfessionSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    const availableProfessions = _professions.filter(profession => !_usedProfessionIds.includes(profession.id));
    
    if (availableProfessions.length === 0) {
        section.innerHTML = `
            <div class="header">
                <h1>No Available Professions</h1>
                <p>All professions have been selected by other characters.</p>
            </div>
            <button class="btn" onclick="renderPortraitSelection()">Return</button>
        `;
        return;
    }

    section.innerHTML = `
        <div class="header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Profession</h1>
            <div class="summary">Race: ${_selectedRace.name} | Class: ${_selectedClass.name}</div>
        </div>
        <div class="grid">
            ${availableProfessions.map(profession => `
                <div class="grid-item" onclick="handleProfessionSelection(${profession.id})">
                    <img src="assets/art/professions/${profession.name.toLowerCase().replace(/\s+/g, '_')}.png" alt="${profession.name}">
                    <h4>${profession.name}</h4>
                    <p>${profession.description}</p>
                </div>
            `).join('')}
        </div>
        <button class="btn return-btn" onclick="renderPortraitSelection()">Return</button>
    `;
}

function renderCharacterSummary() {
    const section = _main.querySelector('.character-creation-section');
    const finalStats = calculateFinalStats(_selectedRace.base_stats, _selectedClass.stat_bonuses);
    const currentCharacterNumber = _existingCharacterCount + 1;

    section.innerHTML = `
        <div class="header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Summary</h1>
        </div>
        <div class="summary-card">
            <img src="assets/art/classes/portraits/${_selectedClass.name.toLowerCase().replace(/\s+/g, '_')}/${_selectedPortrait}.png" alt="Character">
            <h2>${_characterName}</h2>
            <p><strong>Race:</strong> ${_selectedRace.name}</p>
            <p><strong>Class:</strong> ${_selectedClass.name}</p>
            <p><strong>Profession:</strong> ${_selectedProfession.name}</p>
            <div class="stats">
                <h4>Final Stats:</h4>
                ${Object.entries(finalStats).map(([stat, value]) => `<p>${stat}: <span>${value}</span></p>`).join('')}
            </div>
        </div>
        <div class="buttons">
            <button class="btn confirm-btn" onclick="confirmCharacter()">Confirm Champion</button>
            <button class="btn" onclick="renderProfessionSelection()">Return</button>
        </div>
    `;
}

// Event Handlers
window.handleRaceSelection = async (raceId) => {
    _selectedRace = _races.find(r => r.id === raceId);
    if (!_selectedRace) return;
    
    const response = await _apiCall(`/api/supabase/rest/v1/classes?race_id=eq.${_selectedRace.id}&select=id,name,description,stat_bonuses,starting_abilities`);
    _classes = await response.json();
    renderClassSelection();
};

window.handleClassSelection = (classId) => {
    _selectedClass = _classes.find(c => c.id === classId);
    if (_selectedClass) renderPortraitSelection();
};

window.handlePortraitSelection = async (portrait) => {
    _selectedPortrait = portrait;
    const response = await _apiCall(`/api/supabase/rest/v1/professions?select=id,name,description`);
    _professions = await response.json();
    renderProfessionSelection();
};

window.handleProfessionSelection = (professionId) => {
    _selectedProfession = _professions.find(p => p.id === professionId);
    if (_selectedProfession) renderCharacterSummary();
};

window.confirmCharacter = async () => {
    try {
        const response = await _apiCall(`${window.gameAuth.supabaseConfig?.SUPABASE_URL}/functions/v1/create-character`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.gameAuth.supabaseConfig?.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                player_id: _profile.id,
                race_id: _selectedRace.id,
                class_id: _selectedClass.id,
                portrait: _selectedPortrait,
                profession_id: _selectedProfession.id,
                name: _characterName
            })
        });

        if (!response.ok) throw new Error('Failed to create character');
        
        const result = await response.json();
        if (result.success) {
            _usedProfessionIds.push(_selectedProfession.id);
            _existingCharacterCount++;
            displayMessage(`${_characterName} created! (${_existingCharacterCount}/${_maxCharacters})`);
            setTimeout(() => startCharacterCreationFlow(), 1500);
        }
    } catch (error) {
        displayMessage(`Failed to save character: ${error.message}`);
    }
};

// Utility Functions
let currentSlide = 0;
window.goToSlide = (index) => {
    currentSlide = index;
    document.querySelector('.slider-track').style.transform = `translateX(-${currentSlide * 100}%)`;
    document.querySelectorAll('.dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
    });
};

function initializeSlider() {
    const track = document.querySelector('.slider-track');
    let startX = 0;
    
    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
    });
    
    track.addEventListener('touchend', (e) => {
        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;
        if (Math.abs(diff) > 50) {
            const totalSlides = document.querySelectorAll('.dot').length;
            if (diff > 0 && currentSlide < totalSlides - 1) goToSlide(currentSlide + 1);
            else if (diff < 0 && currentSlide > 0) goToSlide(currentSlide - 1);
        }
    });
}

function calculateFinalStats(baseStats, statBonuses) {
    const finalStats = { ...baseStats };
    for (const stat in statBonuses) {
        finalStats[stat] = (finalStats[stat] || 0) + statBonuses[stat];
    }
    finalStats.Armor = 0;
    finalStats.Resistance = 0;
    return finalStats;
}

function displayMessage(message) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content"><p>${message}</p><button class="btn" onclick="this.parentElement.parentElement.remove()">OK</button></div>`;
    document.body.appendChild(modal);
}

function createParticles() {
    const particlesContainer = _main.querySelector('.particles');
    if (!particlesContainer) return;

    particlesContainer.innerHTML = '';
    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 6 + 's';
        particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
        particlesContainer.appendChild(particle);
    }
}

function addStyles() {
    if (document.getElementById('char-creation-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'char-creation-styles';
    style.textContent = `
        .main-app-container { background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%); min-height: 100vh; padding: 20px; }
        .header { text-align: center; margin-bottom: 20px; background: rgba(0,0,0,0.4); padding: 20px; border-radius: 15px; border: 2px solid rgba(196,151,90,0.3); }
        .header h1 { color: #c4975a; margin: 0; font-size: 22px; }
        .summary { color: #fff; margin-top: 10px; font-size: 14px; }
        .content { background: rgba(0,0,0,0.4); padding: 30px 20px; border-radius: 15px; border: 2px solid rgba(196,151,90,0.3); }
        .content label { color: #fff; font-size: 16px; display: block; margin-bottom: 15px; }
        .content input { width: 100%; padding: 15px; font-size: 16px; border: 2px solid rgba(196,151,90,0.5); border-radius: 10px; background: rgba(0,0,0,0.3); color: #fff; box-sizing: border-box; }
        .content input:focus { outline: none; border-color: #c4975a; }
        .error-message { color: #ff6b6b; font-size: 14px; margin: 10px 0; }
        .btn { background: linear-gradient(135deg, #c4975a 0%, #8b6914 100%); color: #fff; border: none; padding: 15px 30px; font-size: 16px; border-radius: 10px; cursor: pointer; width: 100%; margin-top: 15px; font-weight: bold; }
        .btn:active { transform: scale(0.95); }
        .return-btn { background: rgba(196,151,90,0.8); position: fixed; top: 20px; right: 20px; width: auto; margin: 0; padding: 10px 15px; font-size: 14px; }
        .slider { margin-bottom: 20px; }
        .slider-track { display: flex; transition: transform 0.3s ease; }
        .slide { min-width: 100%; padding: 20px; background: rgba(0,0,0,0.4); border-radius: 12px; margin: 0 10px; text-align: center; }
        .slide img { width: 100px; height: 100px; border-radius: 8px; margin-bottom: 15px; }
        .slide h3 { color: #c4975a; margin: 15px 0; }
        .slide p { color: #fff; margin-bottom: 15px; }
        .stats { background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin: 15px 0; }
        .stats h4 { color: #c4975a; margin: 0 0 10px 0; }
        .stats p { color: #fff; margin: 5px 0; display: flex; justify-content: space-between; }
        .stats span { color: #c4975a; font-weight: bold; }
        .dots { display: flex; justify-content: center; gap: 10px; margin: 20px 0; }
        .dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid rgba(196,151,90,0.5); background: transparent; cursor: pointer; }
        .dot.active { background: #c4975a; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
        .grid-item { background: rgba(0,0,0,0.4); border: 2px solid rgba(196,151,90,0.5); border-radius: 12px; padding: 15px; text-align: center; cursor: pointer; }
        .grid-item:active { transform: scale(0.95); }
        .grid-item.selected { border-color: #c4975a; background: rgba(196,151,90,0.2); }
        .grid-item img { width: 80px; height: 80px; border-radius: 8px; margin-bottom: 10px; }
        .grid-item h4 { color: #c4975a; margin: 10px 0 5px 0; font-size: 16px; }
        .grid-item p { color: #fff; font-size: 12px; margin: 0; }
        .grid-item div { color: #c4975a; font-weight: bold; }
        .summary-card { background: rgba(0,0,0,0.4); padding: 20px; border-radius: 15px; border: 2px solid rgba(196,151,90,0.3); text-align: center; margin-bottom: 20px; }
        .summary-card img { width: 120px; height: 120px; border-radius: 10px; margin-bottom: 15px; }
        .summary-card h2 { color: #c4975a; margin: 15px 0; }
        .summary-card p { color: #fff; margin: 10px 0; }
        .buttons { display: flex; gap: 15px; }
        .buttons .btn { flex: 1; margin: 0; }
        .confirm-btn { background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); }
        .modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
        .modal-content { background: #1a1a2e; border: 2px solid #c4975a; border-radius: 15px; padding: 30px 20px; text-align: center; }
        .modal-content p { color: #fff; margin: 0 0 20px 0; }
        .modal-content .btn { width: auto; margin: 0; padding: 10px 30px; }
    `;
    document.head.appendChild(style);
}

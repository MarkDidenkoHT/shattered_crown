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
        <div class="art-header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Name Your Champion</h1>
        </div>
        <div class="name-selection-block">
            <label for="character-name-input">Enter a name for your champion:</label>
            <input type="text" id="character-name-input" maxlength="24" placeholder="Champion Name" class="fantasy-input" value="${_characterName}">
            <div class="name-error-message" style="color: red; display: none;"></div>
            <button class="fantasy-button name-confirm-btn">Confirm Name</button>
        </div>
    `;
    const input = section.querySelector('#character-name-input');
    const errorMsg = section.querySelector('.name-error-message');
    section.querySelector('.name-confirm-btn').addEventListener('click', () => {
        const name = input.value.trim();
        if (!name) {
            errorMsg.textContent = 'Please enter a name.';
            errorMsg.style.display = 'block';
            return;
        }
        if (name.length < 2) {
            errorMsg.textContent = 'Name must be at least 2 characters.';
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
        if (!_godId || _godId === null || _godId === 'null') {
            window.gameAuth.loadModule('god_selection');
            return;
        }

        const response = await fetch(`/api/races/${_godId}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch races');
        }

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
        _races.forEach(race => {
            race.available_classes = [];
        });
    }
}

function renderRaceSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    
    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Race</h1>
        </div>
        <div class="selection-section">
            <div class="selection-slider">
                <div class="slider-container">
                    <div class="slider-track">
                        ${_races.map(race => `
                            <div class="selection-slide" data-id="${race.id}" data-type="race">
                                <div class="card-art-block">
                                    <img src="assets/art/races/${race.name.toLowerCase().replace(/\s+/g, '_')}.png" alt="${race.name}" class="card-art">
                                </div>
                                <div class="card-info-block">
                                    <h3 class="card-name">${race.name}</h3>
                                    <p class="card-description">${race.description}</p>
                                    
                                    ${race.available_classes && race.available_classes.length > 0 ? `
                                        <div class="available-classes-block">
                                            <h4>Available Classes:</h4>
                                            <div class="class-list">
                                                ${race.available_classes.map(cls => `
                                                    <span class="class-tag" data-class-id="${cls.id}" title="${cls.description}">${cls.name}</span>
                                                `).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                    
                                    <div class="stats-block">
                                        <h4>Base Stats:</h4>
                                        ${Object.entries(race.base_stats).map(([stat, value]) => `<p>${stat}: <span>${value}</span></p>`).join('')}
                                    </div>
                                    <button class="fantasy-button select-btn" data-id="${race.id}" data-type="race">Select ${race.name}</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="slider-dots">
                    ${_races.map((_, index) => `<button class="slider-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>`).join('')}
                </div>
            </div>
        </div>
    `;

    initializeSelectionSlider();
    section.querySelectorAll('.select-btn[data-type="race"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const raceId = parseInt(e.target.dataset.id);
            handleRaceSelection(raceId);
        });
    });

    section.querySelectorAll('.class-tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
            const classId = parseInt(e.target.dataset.classId);
            const race = _races.find(r => r.available_classes.some(c => c.id === classId));
            const classInfo = race?.available_classes.find(c => c.id === classId);
            
            if (classInfo) showClassDescription(classInfo);
        });
    });
}

function showClassDescription(classInfo) {
    const modal = document.createElement('div');
    modal.className = 'class-description-modal';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>${classInfo.name}</h3>
                <button class="modal-close-btn">&times;</button>
            </div>
            <div class="modal-body">
                <p class="class-description">${classInfo.description}</p>
                
                ${classInfo.stat_bonuses ? `
                    <div class="stats-block">
                        <h4>Stat Bonuses:</h4>
                        ${Object.entries(classInfo.stat_bonuses).map(([stat, value]) => `<p>${stat}: <span>+${value}</span></p>`).join('')}
                    </div>
                ` : ''}
                
                ${classInfo.starting_abilities && classInfo.starting_abilities.length > 0 ? `
                    <div class="abilities-block">
                        <h4>Starting Abilities:</h4>
                        <ul>${classInfo.starting_abilities.map(ability => `<li>${ability}</li>`).join('')}</ul>
                    </div>
                ` : ''}
            </div>
            <div class="modal-footer">
                <button class="fantasy-button modal-ok-btn">OK</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const closeModal = () => modal.remove();
    modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    modal.querySelector('.modal-ok-btn').addEventListener('click', closeModal);
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
}

function initializeSelectionSlider() {
    const sliderTrack = _main.querySelector('.slider-track');
    const dots = _main.querySelectorAll('.slider-dot');
    
    if (!sliderTrack || !dots.length) return;
    
    let currentSlide = 0;
    const totalSlides = dots.length;
    
    function updateSlider() {
        const translateX = -currentSlide * 100;
        sliderTrack.style.transform = `translateX(${translateX}%)`;
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentSlide);
        });
    }
    
    function nextSlide() {
        currentSlide = (currentSlide + 1) % totalSlides;
        updateSlider();
    }
    
    function prevSlide() {
        currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
        updateSlider();
    }
    
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentSlide = index;
            updateSlider();
        });
    });
    
    let startX = 0, currentX = 0, isDragging = false, startTime = 0;
    
    sliderTrack.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        currentX = startX;
        isDragging = true;
        startTime = Date.now();
        sliderTrack.style.transition = 'none';
    }, { passive: true });
    
    sliderTrack.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        const diffX = currentX - startX;
        const currentTranslate = -currentSlide * 100;
        const newTranslate = currentTranslate + (diffX / sliderTrack.offsetWidth) * 100;
        sliderTrack.style.transform = `translateX(${newTranslate}%)`;
        e.preventDefault();
    }, { passive: false });
    
    sliderTrack.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        const endX = e.changedTouches[0].clientX;
        const diffX = startX - endX;
        const diffTime = Date.now() - startTime;
        const velocity = Math.abs(diffX) / diffTime;
        
        sliderTrack.style.transition = 'transform 0.3s ease-out';
        const threshold = 50;
        const velocityThreshold = 0.3;
        
        if (Math.abs(diffX) > threshold || velocity > velocityThreshold) {
            if (diffX > 0) nextSlide();
            else prevSlide();
        } else {
            updateSlider();
        }
    });

    let isMouseDown = false;
    
    sliderTrack.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        currentX = startX;
        isMouseDown = true;
        startTime = Date.now();
        sliderTrack.style.transition = 'none';
        e.preventDefault();
    });
    
    sliderTrack.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        currentX = e.clientX;
        const diffX = currentX - startX;
        const currentTranslate = -currentSlide * 100;
        const newTranslate = currentTranslate + (diffX / sliderTrack.offsetWidth) * 100;
        sliderTrack.style.transform = `translateX(${newTranslate}%)`;
        e.preventDefault();
    });
    
    sliderTrack.addEventListener('mouseup', (e) => {
        if (!isMouseDown) return;
        isMouseDown = false;
        const endX = e.clientX;
        const diffX = startX - endX;
        const diffTime = Date.now() - startTime;
        const velocity = Math.abs(diffX) / diffTime;
        
        sliderTrack.style.transition = 'transform 0.3s ease-out';
        const threshold = 50;
        const velocityThreshold = 0.3;
        
        if (Math.abs(diffX) > threshold || velocity > velocityThreshold) {
            if (diffX > 0) nextSlide();
            else prevSlide();
        } else {
            updateSlider();
        }
    });
    
    sliderTrack.addEventListener('mouseleave', () => {
        if (isMouseDown) {
            isMouseDown = false;
            sliderTrack.style.transition = 'transform 0.3s ease-out';
            updateSlider();
        }
    });
}

async function handleRaceSelection(raceId) {
    _selectedRace = _races.find(r => r.id === raceId);
    if (!_selectedRace) {
        displayMessage('Selected race not found. Please try again.');
        return;
    }

    fetchClassesAndRenderSelection();
}

async function fetchClassesAndRenderSelection() {
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/classes?race_id=eq.${_selectedRace.id}&select=id,name,description,stat_bonuses,starting_abilities`);
        _classes = await response.json();

        if (_classes.length === 0) {
            displayMessage('No classes available for this race. Please select another race.');
            _selectedRace = null;
            renderRaceSelection();
            return;
        }
        renderClassSelection();
    } catch (error) {
        displayMessage('Failed to load classes. Please try again.');
        _selectedRace = null;
        renderRaceSelection();
    }
}

function renderClassSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    
    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Your Class</h1>
        </div>
        <div class="selected-race-summary">
            <h3>Selected Race: ${_selectedRace.name}</h3>
            <p>${_selectedRace.description}</p>
        </div>
        <div class="selection-section">
            <div class="selection-slider">
                <div class="slider-container">
                    <div class="slider-track">
                        ${_classes.map(cls => `
                            <div class="selection-slide" data-id="${cls.id}" data-type="class">
                                <div class="card-art-block">
                                    <img src="assets/art/classes/${cls.name.toLowerCase().replace(/\s+/g, '_')}.png" alt="${cls.name}" class="card-art">
                                </div>
                                <div class="card-info-block">
                                    <h3 class="card-name">${cls.name}</h3>
                                    <p class="card-description">${cls.description}</p>
                                    <div class="stats-block">
                                        <h4>Stat Bonuses:</h4>
                                        ${Object.entries(cls.stat_bonuses).map(([stat, value]) => `<p>${stat}: <span>+${value}</span></p>`).join('')}
                                    </div>
                                    <div class="abilities-block">
                                        <h4>Starting Abilities:</h4>
                                        <ul>${cls.starting_abilities.map(ability => `<li>${ability}</li>`).join('')}</ul>
                                    </div>
                                    <button class="fantasy-button select-btn" data-id="${cls.id}" data-type="class">Select ${cls.name}</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="slider-dots">
                    ${_classes.map((_, index) => `<button class="slider-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>`).join('')}
                </div>
            </div>
        </div>
        <div class="top-right-buttons">
            <button class="fantasy-button return-btn">Return</button>
        </div>
    `;

    initializeSelectionSlider();

    section.querySelectorAll('.select-btn[data-type="class"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const classId = parseInt(e.target.dataset.id);
            handleClassSelection(classId);
        });
    });

    section.querySelector('.return-btn').addEventListener('click', () => {
        _selectedClass = null;
        renderRaceSelection();
    });
}

function handleClassSelection(classId) {
    _selectedClass = _classes.find(c => c.id === classId);
    if (!_selectedClass) {
        displayMessage('Selected class not found. Please try again.');
        return;
    }
    renderPortraitSelection();
}

async function renderPortraitSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    const className = _selectedClass.name.toLowerCase().replace(/\s+/g, '_');
    
    const portraits = [
        `${className}_portrait_1`,
        `${className}_portrait_2`,
        `${className}_portrait_3`,
        `${className}_portrait_4`
    ];
    
    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Portrait</h1>
        </div>
        <div class="selected-race-summary">
            <h3>Selected Race: ${_selectedRace.name}</h3>
            <p><strong>Class:</strong> ${_selectedClass.name}</p>
            <p>${_selectedClass.description}</p>
        </div>
        <div class="selection-section">
            <div class="selection-slider">
                <div class="slider-container">
                    <div class="slider-track">
                        ${portraits.map(portrait => `
                            <div class="selection-slide" data-portrait="${portrait}">
                                <div class="card-art-block">
                                    <img src="assets/art/classes/portraits/${_selectedClass.name.toLowerCase().replace(/\s+/g, '_')}/${portrait}.png" 
                                         alt="${portrait}" 
                                         class="card-art portrait-art">
                                </div>
                                <div class="card-info-block">
                                    <h3 class="card-name">Portrait ${portrait.slice(-1)}</h3>
                                    <button class="fantasy-button select-btn" data-portrait="${portrait}" data-type="portrait">Select This Portrait</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="slider-dots">
                    ${portraits.map((_, index) => `<button class="slider-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>`).join('')}
                </div>
            </div>
        </div>
        <div class="top-right-buttons">
            <button class="fantasy-button return-btn">Return</button>
        </div>
    `;

    initializeSelectionSlider();

    section.querySelectorAll('.select-btn[data-type="portrait"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const portrait = e.target.dataset.portrait;
            handlePortraitSelection(portrait);
        });
    });

    section.querySelector('.return-btn').addEventListener('click', () => {
        _selectedPortrait = null;
        renderClassSelection();
    });
}

function handlePortraitSelection(portrait) {
    _selectedPortrait = portrait;
    fetchProfessionsAndRenderSelection();
}

async function fetchProfessionsAndRenderSelection() {
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/professions?select=id,name,description`);
        _professions = await response.json();

        if (_professions.length === 0) {
            displayMessage('No professions available. Please contact support.');
            renderPortraitSelection();
            return;
        }
        renderProfessionSelection();
    } catch (error) {
        displayMessage('Failed to load professions. Please try again.');
        renderPortraitSelection();
    }
}

function renderProfessionSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    const availableProfessions = _professions.filter(profession => !_usedProfessionIds.includes(profession.id));
    
    if (availableProfessions.length === 0) {
        section.innerHTML = `
            <div class="art-header">
                <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Profession</h1>
            </div>
            <div class="selected-race-summary">
                <h3>Selected Race: ${_selectedRace.name}</h3>
                <p><strong>Class:</strong> ${_selectedClass.name}</p>
                <p>${_selectedClass.description}</p>
            </div>
            <div class="no-professions-message">
                <h3>No Available Professions</h3>
                <p>All professions have already been selected by your other characters. Each character must have a unique profession.</p>
            </div>
            <div class="top-right-buttons">
                <button class="fantasy-button return-btn">Return</button>
            </div>
        `;
        
        section.querySelector('.return-btn').addEventListener('click', () => {
            _selectedProfession = null;
            renderPortraitSelection();
        });
        return;
    }

    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Profession</h1>
            ${_usedProfessionIds.length > 0 ? `
                <div class="profession-note">
                    <p><em>Note: ${_usedProfessionIds.length} profession(s) already selected by other characters</em></p>
                </div>
            ` : ''}
        </div>
        <div class="selected-race-summary">
            <h3>Selected Race: ${_selectedRace.name}</h3>
            <p><strong>Class:</strong> ${_selectedClass.name}</p>
            <p>${_selectedClass.description}</p>
        </div>
        <div class="selection-section">
            <div class="selection-slider">
                <div class="slider-container">
                    <div class="slider-track">
                        ${availableProfessions.map(profession => `
                            <div class="selection-slide" data-id="${profession.id}" data-type="profession">
                                <div class="card-art-block">
                                    <img src="assets/art/professions/${profession.name.toLowerCase().replace(/\s+/g, '_')}.png" alt="${profession.name}" class="card-art">
                                </div>
                                <div class="card-info-block">
                                    <h3 class="card-name">${profession.name}</h3>
                                    <p class="card-description">${profession.description}</p>
                                    <button class="fantasy-button select-btn" data-id="${profession.id}" data-type="profession">Select ${profession.name}</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="slider-dots">
                    ${availableProfessions.map((_, index) => `<button class="slider-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>`).join('')}
                </div>
            </div>
        </div>
        <div class="top-right-buttons">
            <button class="fantasy-button return-btn">Return</button>
        </div>
    `;

    initializeSelectionSlider();

    section.querySelectorAll('.select-btn[data-type="profession"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const professionId = parseInt(e.target.dataset.id);
            handleProfessionSelection(professionId);
        });
    });

    section.querySelector('.return-btn').addEventListener('click', () => {
        _selectedProfession = null;
        renderPortraitSelection();
    });
}

function handleProfessionSelection(professionId) {
    _selectedProfession = _professions.find(p => p.id === professionId);
    if (!_selectedProfession) {
        displayMessage('Selected profession not found. Please try again.');
        return;
    }
    renderCharacterSummary();
}

function renderCharacterSummary() {
    const section = _main.querySelector('.character-creation-section');
    const finalStats = calculateFinalStats(_selectedRace.base_stats, _selectedClass.stat_bonuses);
    const currentCharacterNumber = _existingCharacterCount + 1;

    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Summary</h1>
        </div>
        <div class="summary-card">
            <div class="summary-art-block">
                <img src="assets/art/classes/portraits/${_selectedClass.name.toLowerCase().replace(/\s+/g, '_')}/${_selectedPortrait}.png" 
                    alt="${_selectedRace.name} ${_selectedClass.name}" 
                    class="summary-art">
            </div>
            <div class="summary-info-block">
                <h2>${_selectedRace.name} ${_selectedClass.name}</h2>
                <p><strong>Race Description:</strong> ${_selectedRace.description}</p>
                <p><strong>Class Description:</strong> ${_selectedClass.description}</p>
                <p><strong>Profession:</strong> ${_selectedProfession.name} - ${_selectedProfession.description}</p>
                <div class="stats-block">
                    <h4>Final Stats:</h4>
                    ${Object.entries(finalStats).map(([stat, value]) => `<p>${stat}: <span>${value}</span></p>`).join('')}
                </div>
                <div class="abilities-block">
                    <h4>Starting Abilities:</h4>
                    <ul>${_selectedClass.starting_abilities.map(ability => `<li>${ability}</li>`).join('')}</ul>
                </div>
            </div>
        </div>
        <div class="confirm-return-buttons">
            <button type="button" class="fantasy-button confirm-btn">Confirm Champion</button>
            <button type="button" class="fantasy-button return-btn">Return</button>
        </div>
    `;

    section.querySelector('.confirm-btn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        confirmCharacter();
    });

    section.querySelector('.return-btn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        renderProfessionSelection();
    });
}

function calculateFinalStats(baseStats, statBonuses) {
    const finalStats = { ...baseStats };
    for (const stat in statBonuses) {
        if (finalStats.hasOwnProperty(stat)) {
            finalStats[stat] += statBonuses[stat];
        } else {
            finalStats[stat] = statBonuses[stat];
        }
    }
    finalStats.Armor = 0;
    finalStats.Resistance = 0;
    return finalStats;
}

async function confirmCharacter() {
    try {
        const characterCreationData = {
            player_id: _profile.id,
            race_id: _selectedRace.id,
            class_id: _selectedClass.id,
            portrait: _selectedPortrait,
            profession_id: _selectedProfession.id,
            name: _characterName
        };

        const response = await _apiCall(`${window.gameAuth.supabaseConfig?.SUPABASE_URL}/functions/v1/create-character`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.gameAuth.supabaseConfig?.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(characterCreationData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorData = JSON.parse(errorText);
                throw new Error(errorData.error || `Edge function call failed with status ${response.status}`);
            } catch {
                throw new Error(`Edge function call failed with status ${response.status}: ${errorText}`);
            }
        }

        const result = await response.json();
        
        if (result.success) {
            _usedProfessionIds.push(_selectedProfession.id);
            _existingCharacterCount++;
            displayMessage(`Character ${_existingCharacterCount} (${result.character.race} ${result.character.class}) created! (${_existingCharacterCount}/${_maxCharacters})`);
            
            setTimeout(() => {
                startCharacterCreationFlow();
            }, 1000);
        } else {
            throw new Error(result.error || 'Unknown error occurred during character creation');
        }

    } catch (error) {
        displayMessage(`Failed to save character: ${error.message}`);
    }
}

function createParticles() {
    const particlesContainer = _main.querySelector('.particles');
    if (!particlesContainer) return;

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
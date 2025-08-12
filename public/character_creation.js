let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _godId;
let _races = [];
let _classes = [];
let _professions = []; // Новая переменная для хранения списка профессий
let _currentCharacterIndex = 0; // 0-indexed for character 1, 2, 3
let _selectedRace = null;
let _selectedClass = null;
let _selectedSex = null; // Новая переменная для хранения выбранного пола
let _selectedProfession = null; // Новая переменная для хранения выбранной профессии

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
    _main.innerHTML = `
        <div class="main-app-container">
            <div class="particles"></div>
            <div class="character-creation-section"></div>
        </div>
    `;

    addCharacterCreationStyles();
    createParticles();

    await startCharacterCreationFlow();
    console.log('[CHAR_CREATE] --- loadModule for Character Creation finished ---');
}

async function startCharacterCreationFlow() {
    console.log(`[CHAR_CREATE_FLOW] Starting flow for Character ${_currentCharacterIndex + 1} of 3.`);
    _selectedRace = null; // Reset selections for new character
    _selectedClass = null;
    _selectedSex = null; // Сброс выбранного пола
    _selectedProfession = null; // Сброс выбранной профессии

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
        const response = await _apiCall(`/api/supabase/rest/v1/races?god_id=eq.${_godId}&select=id,name,description,base_stats`);
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
    const section = _main.querySelector('.character-creation-section');
    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${_currentCharacterIndex + 1} of 3: Choose Race</h1>
            <p class="subtitle">Select the lineage that defines your champion's innate strengths.</p>
        </div>
        <div class="selection-section">
            <div class="selection-container desktop-view">
                <div class="selection-grid">
                    ${_races.map(race => `
                        <div class="selection-card" data-id="${race.id}" data-type="race">
                            <div class="card-art-block">
                                <img src="assets/art/races/${race.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                                    alt="${race.name}" 
                                    class="card-art">
                            </div>
                            <div class="card-info-block">
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
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="selection-slider mobile-view">
                <div class="slider-container">
                    <div class="slider-track" style="transform: translateX(0%)">
                        ${_races.map((race, index) => `
                            <div class="selection-slide" data-id="${race.id}" data-type="race">
                                <div class="card-art-block">
                                    <img src="assets/art/races/${race.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                                            alt="${race.name}" 
                                            class="card-art">
                                </div>
                                <div class="card-info-block">
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
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="slider-controls">
                    <button class="slider-btn prev-btn" aria-label="Previous">&lt;</button>
                    <div class="slider-dots">
                        ${_races.map((_, index) => `
                            <button class="slider-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>
                        `).join('')}
                    </div>
                    <button class="slider-btn next-btn" aria-label="Next">&gt;</button>
                </div>
            </div>
        </div>
    `;

    // Initialize slider if on mobile
    if (window.innerWidth <= 768) {
        initializeSelectionSlider();
    }

    // Add event listeners to selection buttons
    section.querySelectorAll('.select-btn[data-type="race"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const raceId = parseInt(e.target.dataset.id);
            console.log(`[UI_EVENT] Race selected: ID ${raceId}`);
            handleRaceSelection(raceId);
        });
    });
}

function initializeSelectionSlider() {
    const sliderTrack = _main.querySelector('.slider-track');
    const prevBtn = _main.querySelector('.prev-btn');
    const nextBtn = _main.querySelector('.next-btn');
    const dots = _main.querySelectorAll('.slider-dot');
    
    if (!sliderTrack || !prevBtn || !nextBtn) return;
    
    let currentSlide = 0;
    const totalSlides = dots.length;
    
    function updateSlider() {
        const translateX = -currentSlide * 100;
        sliderTrack.style.transform = `translateX(${translateX}%)`;
        
        // Update dots
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
    
    // Event listeners
    nextBtn.addEventListener('click', nextSlide);
    prevBtn.addEventListener('click', prevSlide);
    
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentSlide = index;
            updateSlider();
        });
    });
    
    // Touch/swipe support
    let startX = 0;
    let isDragging = false;
    
    sliderTrack.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
    });
    
    sliderTrack.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
    });
    
    sliderTrack.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        
        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;
        
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                nextSlide();
            } else {
                prevSlide();
            }
        }
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

    // After race selection, render sex selection
    renderSexSelection();
}

// --- Новые функции для выбора пола и профессий ---

function renderSexSelection() {
    console.log(`[UI_RENDER] Rendering Sex Selection for Character ${_currentCharacterIndex + 1}.`);
    const section = _main.querySelector('.character-creation-section');
    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${_currentCharacterIndex + 1} of 3: Choose Sex</h1>
            <p class="subtitle">Decide the gender of your champion.</p>
        </div>
        <div class="selected-race-summary">
            <h3>Selected Race: ${_selectedRace.name}</h3>
            <p>${_selectedRace.description}</p>
        </div>
        <div class="selection-section">
            <div class="selection-container desktop-view">
                <div class="selection-grid">
                    <div class="selection-card" data-sex="male">
                        <div class="card-art-block">
                            <img src="assets/art/sex/male.png" 
                                alt="Male" 
                                class="card-art">
                        </div>
                        <div class="card-info-block">
                            <h3 class="card-name">Male</h3>
                            <p class="card-description">Strength and fortitude define this path.</p>
                            <button class="fantasy-button select-btn" data-sex="male" data-type="sex">Select Male</button>
                        </div>
                    </div>
                    <div class="selection-card" data-sex="female">
                        <div class="card-art-block">
                            <img src="assets/art/sex/female.png" 
                                alt="Female" 
                                class="card-art">
                        </div>
                        <div class="card-info-block">
                            <h3 class="card-name">Female</h3>
                            <p class="card-description">Grace and wisdom guide this journey.</p>
                            <button class="fantasy-button select-btn" data-sex="female" data-type="sex">Select Female</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="selection-slider mobile-view">
                <div class="slider-container">
                    <div class="slider-track" style="transform: translateX(0%)">
                        <div class="selection-slide" data-sex="male">
                            <div class="card-art-block">
                                <img src="assets/art/sex/male.png" 
                                    alt="Male" 
                                    class="card-art">
                            </div>
                            <div class="card-info-block">
                                <h3 class="card-name">Male</h3>
                                <p class="card-description">Strength and fortitude define this path.</p>
                                <button class="fantasy-button select-btn" data-sex="male" data-type="sex">Select Male</button>
                            </div>
                        </div>
                        <div class="selection-slide" data-sex="female">
                            <div class="card-art-block">
                                <img src="assets/art/sex/female.png" 
                                    alt="Female" 
                                    class="card-art">
                            </div>
                            <div class="card-info-block">
                                <h3 class="card-name">Female</h3>
                                <p class="card-description">Grace and wisdom guide this journey.</p>
                                <button class="fantasy-button select-btn" data-sex="female" data-type="sex">Select Female</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="slider-controls">
                    <button class="slider-btn prev-btn" aria-label="Previous">&lt;</button>
                    <div class="slider-dots">
                        <button class="slider-dot active" data-slide="0"></button>
                        <button class="slider-dot" data-slide="1"></button>
                    </div>
                    <button class="slider-btn next-btn" aria-label="Next">&gt;</button>
                </div>
            </div>
        </div>
        <div class="confirm-return-buttons">
            <button class="fantasy-button return-btn">Return</button>
        </div>
    `;

    if (window.innerWidth <= 768) {
        initializeSelectionSlider();
    }

    section.querySelectorAll('.select-btn[data-type="sex"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const sex = e.target.dataset.sex;
            console.log(`[UI_EVENT] Sex selected: ${sex}`);
            handleSexSelection(sex);
        });
    });

    section.querySelector('.return-btn').addEventListener('click', () => {
        console.log('[UI_EVENT] Return to Race Selection clicked from sex selection.');
        _selectedSex = null; // Clear sex selection
        renderRaceSelection();
    });
}

function handleSexSelection(sex) {
    _selectedSex = sex;
    console.log('[SEX_SELECT] Selected Sex:', _selectedSex);
    // After sex selection, fetch classes
    fetchClassesAndRenderSelection();
}

async function fetchClassesAndRenderSelection() {
    console.log(`[CLASS_FETCH] Fetching classes for Race ID: ${_selectedRace.id}...`);
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/classes?race_id=eq.${_selectedRace.id}&select=id,name,description,stat_bonuses,starting_abilities`);
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
    const section = _main.querySelector('.character-creation-section');
    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${_currentCharacterIndex + 1} of 3: Choose Your Class</h1>
            <p class="subtitle">Embrace a discipline that complements your race's heritage.</p>
        </div>
        <div class="selected-race-summary">
            <h3>Selected Race: ${_selectedRace.name} (${_selectedSex})</h3>
            <p>${_selectedRace.description}</p>
        </div>
        <div class="selection-section">
            <div class="selection-container desktop-view">
                <div class="selection-grid">
                    ${_classes.map(cls => `
                        <div class="selection-card" data-id="${cls.id}" data-type="class">
                            <div class="card-art-block">
                                <img src="assets/art/classes/${cls.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                                    alt="${cls.name}" 
                                    class="card-art">
                            </div>
                            <div class="card-info-block">
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
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="selection-slider mobile-view">
                <div class="slider-container">
                    <div class="slider-track" style="transform: translateX(0%)">
                        ${_classes.map((cls, index) => `
                            <div class="selection-slide" data-id="${cls.id}" data-type="class">
                                <div class="card-art-block">
                                    <img src="assets/art/classes/${cls.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                                            alt="${cls.name}" 
                                            class="card-art">
                                </div>
                                <div class="card-info-block">
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
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="slider-controls">
                    <button class="slider-btn prev-btn" aria-label="Previous">&lt;</button>
                    <div class="slider-dots">
                        ${_classes.map((_, index) => `
                            <button class="slider-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>
                        `).join('')}
                    </div>
                    <button class="slider-btn next-btn" aria-label="Next">&gt;</button>
                </div>
            </div>
        </div>
        <div class="confirm-return-buttons">
            <button class="fantasy-button return-btn">Return</button>
        </div>
    `;

    if (window.innerWidth <= 768) {
        initializeSelectionSlider();
    }

    section.querySelectorAll('.select-btn[data-type="class"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const classId = parseInt(e.target.dataset.id);
            console.log(`[UI_EVENT] Class selected: ID ${classId}`);
            handleClassSelection(classId);
        });
    });

    section.querySelector('.return-btn').addEventListener('click', () => {
        console.log('[UI_EVENT] Return to Sex Selection clicked from class selection.');
        _selectedClass = null; // Clear class selection
        renderSexSelection();
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
    // After class selection, fetch professions
    fetchProfessionsAndRenderSelection();
}


async function fetchProfessionsAndRenderSelection() {
    console.log('[PROFESSION_FETCH] Fetching professions...');
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/professions?select=id,name,description`);
        _professions = await response.json();
        console.log('[PROFESSION_FETCH] Professions fetched:', _professions);

        if (_professions.length === 0) {
            console.warn('[PROFESSION_FETCH] No professions found.');
            displayMessage('No professions available. Please contact support.');
            renderClassSelection(); // Allow re-selection of class
            return;
        }
        renderProfessionSelection();
    } catch (error) {
        console.error('[PROFESSION_FETCH] Error fetching professions:', error);
        displayMessage('Failed to load professions. Please try again.');
        renderClassSelection(); // Allow re-selection of class
    }
}

function renderProfessionSelection() {
    console.log(`[UI_RENDER] Rendering Profession Selection for Character ${_currentCharacterIndex + 1}.`);
    const section = _main.querySelector('.character-creation-section');
    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${_currentCharacterIndex + 1} of 3: Choose Profession</h1>
            <p class="subtitle">Select a profession that defines your champion's skills and trade.</p>
        </div>
        <div class="selected-race-summary">
            <h3>Selected Race: ${_selectedRace.name} (${_selectedSex})</h3>
            <p><strong>Class:</strong> ${_selectedClass.name}</p>
            <p>${_selectedClass.description}</p>
        </div>
        <div class="selection-section">
            <div class="selection-container desktop-view">
                <div class="selection-grid">
                    ${_professions.map(profession => `
                        <div class="selection-card" data-id="${profession.id}" data-type="profession">
                            <div class="card-art-block">
                                <img src="assets/art/professions/${profession.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                                    alt="${profession.name}" 
                                    class="card-art">
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

            <div class="selection-slider mobile-view">
                <div class="slider-container">
                    <div class="slider-track" style="transform: translateX(0%)">
                        ${_professions.map((profession, index) => `
                            <div class="selection-slide" data-id="${profession.id}" data-type="profession">
                                <div class="card-art-block">
                                    <img src="assets/art/professions/${profession.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                                            alt="${profession.name}" 
                                            class="card-art">
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
                
                <div class="slider-controls">
                    <button class="slider-btn prev-btn" aria-label="Previous">&lt;</button>
                    <div class="slider-dots">
                        ${_professions.map((_, index) => `
                            <button class="slider-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>
                        `).join('')}
                    </div>
                    <button class="slider-btn next-btn" aria-label="Next">&gt;</button>
                </div>
            </div>
        </div>
        <div class="confirm-return-buttons">
            <button class="fantasy-button return-btn">Return</button>
        </div>
    `;

    if (window.innerWidth <= 768) {
        initializeSelectionSlider();
    }

    section.querySelectorAll('.select-btn[data-type="profession"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const professionId = parseInt(e.target.dataset.id);
            console.log(`[UI_EVENT] Profession selected: ID ${professionId}`);
            handleProfessionSelection(professionId);
        });
    });

    section.querySelector('.return-btn').addEventListener('click', () => {
        console.log('[UI_EVENT] Return to Class Selection clicked from profession selection.');
        _selectedProfession = null; // Clear profession selection
        renderClassSelection();
    });
}

function handleProfessionSelection(professionId) {
    _selectedProfession = _professions.find(p => p.id === professionId);
    if (!_selectedProfession) {
        console.error(`[PROFESSION_SELECT] Selected profession with ID ${professionId} not found.`);
        displayMessage('Selected profession not found. Please try again.');
        return;
    }
    console.log('[PROFESSION_SELECT] Selected Profession:', _selectedProfession);
    renderCharacterSummary();
}

function renderCharacterSummary() {
    console.log(`[UI_RENDER] Rendering Character Summary for Character ${_currentCharacterIndex + 1}.`);
    const section = _main.querySelector('.character-creation-section');
    const finalStats = calculateFinalStats(_selectedRace.base_stats, _selectedClass.stat_bonuses);

    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${_currentCharacterIndex + 1} of 3: Summary</h1>
            <p class="subtitle">Review your champion's destiny before it is sealed.</p>
        </div>
        <div class="summary-card">
            <div class="summary-art-block">
                <img src="assets/art/characters/${_selectedRace.name.toLowerCase().replace(/\s+/g, '_')}_${_selectedClass.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                    alt="${_selectedRace.name} ${_selectedClass.name}" 
                    class="summary-art"
            </div>
            <div class="summary-info-block">
                <h2>${_selectedSex === 'male' ? 'Male' : 'Female'} ${_selectedRace.name} ${_selectedClass.name}</h2>
                <p><strong>Race Description:</strong> ${_selectedRace.description}</p>
                <p><strong>Class Description:</strong> ${_selectedClass.description}</p>
                <p><strong>Profession:</strong> ${_selectedProfession.name} - ${_selectedProfession.description}</p>
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
        </div>
        <div class="confirm-return-buttons">
            <button class="fantasy-button confirm-btn">Confirm Champion</button>
            <button class="fantasy-button return-btn">Return</button>
        </div>
    `;

    section.querySelector('.confirm-btn').addEventListener('click', () => {
        console.log('[UI_EVENT] Confirm Champion clicked.');
        confirmCharacter();
    });

    section.querySelector('.return-btn').addEventListener('click', () => {
        console.log('[UI_EVENT] Return to Profession Selection clicked from summary.');
        renderProfessionSelection();
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

async function confirmCharacter() {
    console.log(`[CHAR_SAVE] Attempting to save Character ${_currentCharacterIndex + 1}...`);
    const finalStats = calculateFinalStats(_selectedRace.base_stats, _selectedClass.stat_bonuses);

    const characterData = {
        player_id: _profile.id,
        race_id: _selectedRace.id,
        class_id: _selectedClass.id,
        sex: _selectedSex, // Добавлено поле пола
        profession_id: _selectedProfession.id, // Добавлено поле профессии
        stats: finalStats,
        starting_abilities: _selectedClass.starting_abilities
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

        alert(`Stopping here — about to start next character (${_currentCharacterIndex + 1}). Check console before continuing.`);
        await startCharacterCreationFlow(); // Continue to next character or castle
    } catch (error) {
        console.error('[CHAR_SAVE] Error saving character:', error);

        // Extra logging for restart tracking
        console.warn(`[CHAR_SAVE] Character creation for slot ${_currentCharacterIndex + 1} failed. Restarting creation flow...`, {
            race: _selectedRace,
            class: _selectedClass,
            sex: _selectedSex,
            profession: _selectedProfession
        });

        displayMessage('Failed to save character. Please try again.');
    }
}

function createParticles() {
    console.log('[PARTICLES] Creating particles...');
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

function addCharacterCreationStyles() {
    console.log('[STYLES] Adding character creation styles...');
    const styleId = 'character-creation-styles';
    if (document.getElementById(styleId)) {
        console.log('[STYLES] Styles already present, skipping re-addition.');
        return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `

    `;
    document.head.appendChild(style);
    console.log('[STYLES] Character creation styles appended to document head.');
}

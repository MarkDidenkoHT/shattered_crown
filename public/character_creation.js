let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;
let _godId;
let _races = [];
let _classes = [];
let _professions = []; 
let _currentCharacterIndex = 0;
let _selectedRace = null;
let _selectedClass = null;
let _selectedSex = null;
let _selectedProfession = null;
let _usedProfessions = []; // Track used professions

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

    _main.innerHTML = `
        <div class="main-app-container">
            <div class="particles"></div>
            <div class="character-creation-section"></div>
        </div>
    `;

    addCharacterCreationStyles();
    createParticles();
    await startCharacterCreationFlow();
}

async function startCharacterCreationFlow() {
    _selectedRace = null;
    _selectedClass = null;
    _selectedSex = null;
    _selectedProfession = null;

    if (_currentCharacterIndex >= 3) {
        displayMessage('All your champions are ready! Entering the Castle...');
        window.gameAuth.loadModule('castle');
        return;
    }

    await fetchRacesAndRenderSelection();
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

        renderRaceSelection();
    } catch (error) {
        displayMessage('Failed to load races. Please try again.');
    }
}

function renderRaceSelection() {
    const section = _main.querySelector('.character-creation-section');
    section.innerHTML = `
        <div class="mobile-header">
            <h1>Champion ${_currentCharacterIndex + 1} of 3</h1>
            <h2>Choose Race</h2>
            <p>Select your champion's lineage</p>
        </div>
        
        <div class="mobile-slider">
            <div class="slider-container">
                <div class="slider-track" style="transform: translateX(0%)">
                    ${_races.map((race, index) => `
                        <div class="mobile-card" data-id="${race.id}" data-type="race">
                            <div class="card-image">
                                <img src="assets/art/races/${race.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                                    alt="${race.name}" 
                                    class="race-art">
                            </div>
                            <div class="card-content">
                                <h3>${race.name}</h3>
                                <p class="description">${race.description}</p>
                                <div class="stats">
                                    <h4>Base Stats</h4>
                                    <div class="stats-grid">
                                        ${Object.entries(race.base_stats).map(([stat, value]) => `
                                            <div class="stat-item">
                                                <span class="stat-name">${stat}</span>
                                                <span class="stat-value">${value}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                <button class="select-button" data-id="${race.id}" data-type="race">
                                    Select ${race.name}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="slider-nav">
                <button class="nav-btn prev-btn">‹</button>
                <div class="dots">
                    ${_races.map((_, index) => `
                        <button class="dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>
                    `).join('')}
                </div>
                <button class="nav-btn next-btn">›</button>
            </div>
        </div>
    `;

    initializeMobileSlider();
    addRaceSelectionListeners();
}

function initializeMobileSlider() {
    const sliderTrack = _main.querySelector('.slider-track');
    const prevBtn = _main.querySelector('.prev-btn');
    const nextBtn = _main.querySelector('.next-btn');
    const dots = _main.querySelectorAll('.dot');
    
    if (!sliderTrack || !prevBtn || !nextBtn) return;
    
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
    
    nextBtn.addEventListener('click', nextSlide);
    prevBtn.addEventListener('click', prevSlide);
    
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentSlide = index;
            updateSlider();
        });
    });
    
    // Touch support
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

function addRaceSelectionListeners() {
    const section = _main.querySelector('.character-creation-section');
    section.querySelectorAll('.select-button[data-type="race"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const raceId = parseInt(e.target.dataset.id);
            handleRaceSelection(raceId);
        });
    });
}

async function handleRaceSelection(raceId) {
    _selectedRace = _races.find(r => r.id === raceId);
    if (!_selectedRace) {
        displayMessage('Selected race not found. Please try again.');
        return;
    }
    renderSexSelection();
}

function renderSexSelection() {
    const section = _main.querySelector('.character-creation-section');
    section.innerHTML = `
        <div class="mobile-header">
            <h1>Champion ${_currentCharacterIndex + 1} of 3</h1>
            <h2>Choose Gender</h2>
            <p>Selected: ${_selectedRace.name}</p>
        </div>
        
        <div class="gender-selection">
            <div class="gender-options">
                <div class="gender-card" data-sex="male">
                    <div class="gender-image">
                        <img src="assets/art/sex/male.png" alt="Male">
                    </div>
                    <h3>Male</h3>
                    <p>Strength and fortitude</p>
                    <button class="select-button" data-sex="male" data-type="sex">Select Male</button>
                </div>
                
                <div class="gender-card" data-sex="female">
                    <div class="gender-image">
                        <img src="assets/art/sex/female.png" alt="Female">
                    </div>
                    <h3>Female</h3>
                    <p>Grace and wisdom</p>
                    <button class="select-button" data-sex="female" data-type="sex">Select Female</button>
                </div>
            </div>
        </div>
        
        <div class="navigation-buttons">
            <button class="back-button">← Back</button>
        </div>
    `;

    section.querySelectorAll('.select-button[data-type="sex"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const sex = e.target.dataset.sex;
            handleSexSelection(sex);
        });
    });

    section.querySelector('.back-button').addEventListener('click', () => {
        _selectedSex = null;
        renderRaceSelection();
    });
}

function handleSexSelection(sex) {
    _selectedSex = sex;
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
    section.innerHTML = `
        <div class="mobile-header">
            <h1>Champion ${_currentCharacterIndex + 1} of 3</h1>
            <h2>Choose Class</h2>
            <p>${_selectedSex} ${_selectedRace.name}</p>
        </div>
        
        <div class="mobile-slider">
            <div class="slider-container">
                <div class="slider-track" style="transform: translateX(0%)">
                    ${_classes.map((cls, index) => `
                        <div class="mobile-card" data-id="${cls.id}" data-type="class">
                            <div class="card-image">
                                <img src="assets/art/classes/${cls.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                                    alt="${cls.name}" 
                                    class="class-art">
                            </div>
                            <div class="card-content">
                                <h3>${cls.name}</h3>
                                <p class="description">${cls.description}</p>
                                <div class="stats">
                                    <h4>Stat Bonuses</h4>
                                    <div class="stats-grid">
                                        ${Object.entries(cls.stat_bonuses).map(([stat, value]) => `
                                            <div class="stat-item">
                                                <span class="stat-name">${stat}</span>
                                                <span class="stat-value">+${value}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="abilities">
                                    <h4>Starting Abilities</h4>
                                    <div class="ability-list">
                                        ${cls.starting_abilities.map(ability => `
                                            <span class="ability-tag">${ability}</span>
                                        `).join('')}
                                    </div>
                                </div>
                                <button class="select-button" data-id="${cls.id}" data-type="class">
                                    Select ${cls.name}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="slider-nav">
                <button class="nav-btn prev-btn">‹</button>
                <div class="dots">
                    ${_classes.map((_, index) => `
                        <button class="dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>
                    `).join('')}
                </div>
                <button class="nav-btn next-btn">›</button>
            </div>
        </div>
        
        <div class="navigation-buttons">
            <button class="back-button">← Back</button>
        </div>
    `;

    initializeMobileSlider();
    
    section.querySelectorAll('.select-button[data-type="class"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const classId = parseInt(e.target.dataset.id);
            handleClassSelection(classId);
        });
    });

    section.querySelector('.back-button').addEventListener('click', () => {
        _selectedClass = null;
        renderSexSelection();
    });
}

function handleClassSelection(classId) {
    _selectedClass = _classes.find(c => c.id === classId);
    if (!_selectedClass) {
        displayMessage('Selected class not found. Please try again.');
        return;
    }
    fetchProfessionsAndRenderSelection();
}

async function fetchProfessionsAndRenderSelection() {
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/professions?select=id,name,description`);
        _professions = await response.json();

        if (_professions.length === 0) {
            displayMessage('No professions available. Please contact support.');
            renderClassSelection();
            return;
        }
        renderProfessionSelection();
    } catch (error) {
        displayMessage('Failed to load professions. Please try again.');
        renderClassSelection();
    }
}

function renderProfessionSelection() {
    // Filter out already used professions
    const availableProfessions = _professions.filter(prof => !_usedProfessions.includes(prof.id));
    
    if (availableProfessions.length === 0) {
        displayMessage('All professions have been selected. Please contact support.');
        renderClassSelection();
        return;
    }

    const section = _main.querySelector('.character-creation-section');
    section.innerHTML = `
        <div class="mobile-header">
            <h1>Champion ${_currentCharacterIndex + 1} of 3</h1>
            <h2>Choose Profession</h2>
            <p>${_selectedSex} ${_selectedRace.name} ${_selectedClass.name}</p>
            ${_usedProfessions.length > 0 ? `<p class="used-notice">Used: ${_usedProfessions.length} profession${_usedProfessions.length > 1 ? 's' : ''}</p>` : ''}
        </div>
        
        <div class="mobile-slider">
            <div class="slider-container">
                <div class="slider-track" style="transform: translateX(0%)">
                    ${availableProfessions.map((profession, index) => `
                        <div class="mobile-card profession-card" data-id="${profession.id}" data-type="profession">
                            <div class="card-image">
                                <img src="assets/art/professions/${profession.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                                    alt="${profession.name}" 
                                    class="profession-art">
                            </div>
                            <div class="card-content">
                                <h3>${profession.name}</h3>
                                <p class="description">${profession.description}</p>
                                <button class="select-button" data-id="${profession.id}" data-type="profession">
                                    Select ${profession.name}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="slider-nav">
                <button class="nav-btn prev-btn">‹</button>
                <div class="dots">
                    ${availableProfessions.map((_, index) => `
                        <button class="dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>
                    `).join('')}
                </div>
                <button class="nav-btn next-btn">›</button>
            </div>
        </div>
        
        <div class="navigation-buttons">
            <button class="back-button">← Back</button>
        </div>
    `;

    initializeMobileSlider();
    
    section.querySelectorAll('.select-button[data-type="profession"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const professionId = parseInt(e.target.dataset.id);
            handleProfessionSelection(professionId);
        });
    });

    section.querySelector('.back-button').addEventListener('click', () => {
        _selectedProfession = null;
        renderClassSelection();
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

    section.innerHTML = `
        <div class="mobile-header">
            <h1>Champion ${_currentCharacterIndex + 1} of 3</h1>
            <h2>Summary</h2>
            <p>Review your champion</p>
        </div>
        
        <div class="summary-card">
            <div class="summary-image">
                <img src="assets/art/characters/${_selectedRace.name.toLowerCase().replace(/\s+/g, '_')}_${_selectedClass.name.toLowerCase().replace(/\s+/g, '_')}.png" 
                    alt="${_selectedRace.name} ${_selectedClass.name}" 
                    class="champion-art">
            </div>
            
            <div class="summary-content">
                <h3>${_selectedSex === 'male' ? 'Male' : 'Female'} ${_selectedRace.name} ${_selectedClass.name}</h3>
                
                <div class="summary-section">
                    <h4>Profession</h4>
                    <p><strong>${_selectedProfession.name}</strong></p>
                    <p class="small">${_selectedProfession.description}</p>
                </div>
                
                <div class="summary-section">
                    <h4>Final Stats</h4>
                    <div class="final-stats">
                        ${Object.entries(finalStats).map(([stat, value]) => `
                            <div class="stat-row">
                                <span>${stat}</span>
                                <span class="stat-value">${value}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="summary-section">
                    <h4>Starting Abilities</h4>
                    <div class="ability-tags">
                        ${_selectedClass.starting_abilities.map(ability => `
                            <span class="ability-tag">${ability}</span>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
        
        <div class="action-buttons">
            <button type="button" class="confirm-button">✓ Confirm Champion</button>
            <button type="button" class="back-button">← Back</button>
        </div>
    `;

    section.querySelector('.confirm-button').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        confirmCharacter();
    });

    section.querySelector('.back-button').addEventListener('click', (e) => {
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
    return finalStats;
}

async function confirmCharacter() {
    try {
        const characterCreationData = {
            chat_id: _profile.chat_id,
            race_id: _selectedRace.id,
            class_id: _selectedClass.id,
            sex: _selectedSex,
            profession_id: _selectedProfession.id
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
                throw new Error(errorData.error || `Failed with status ${response.status}`);
            } catch {
                throw new Error(`Failed with status ${response.status}: ${errorText}`);
            }
        }

        const result = await response.json();
        
        if (result.success) {
            // Add profession to used list
            _usedProfessions.push(_selectedProfession.id);
            
            displayMessage(`Champion ${_currentCharacterIndex + 1} created! (${result.characters_created}/${result.max_characters})`);
            _currentCharacterIndex++;
            
            setTimeout(() => {
                startCharacterCreationFlow();
            }, 1000);
        } else {
            throw new Error(result.error || 'Unknown error occurred');
        }

    } catch (error) {
        displayMessage(`Failed to save character: ${error.message}`);
    }
}

function createParticles() {
    const particlesContainer = _main.querySelector('.particles');
    if (!particlesContainer) return;

    particlesContainer.innerHTML = '';
    const particleCount = 15; // Reduced for mobile performance
    
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
    messageBox.className = 'message-overlay';
    messageBox.innerHTML = `
        <div class="message-popup">
            <p>${message}</p>
            <button class="message-button">OK</button>
        </div>
    `;
    document.body.appendChild(messageBox);

    messageBox.querySelector('.message-button').addEventListener('click', () => {
        messageBox.remove();
    });
}

function addCharacterCreationStyles() {
    if (document.getElementById('character-creation-styles')) return;

    const style = document.createElement('style');
    style.id = 'character-creation-styles';
    style.textContent = `
        .main-app-container {
            position: relative;
            min-height: 100vh;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            overflow-x: hidden;
        }

        .particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
        }

        .particle {
            position: absolute;
            width: 3px;
            height: 3px;
            background: rgba(255, 215, 0, 0.6);
            border-radius: 50%;
            animation: float 6s ease-in-out infinite;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0; }
            10%, 90% { opacity: 1; }
            50% { transform: translateY(-20px) rotate(180deg); }
        }

        .character-creation-section {
            position: relative;
            z-index: 2;
            padding: 20px 15px;
            min-height: 100vh;
        }

        .mobile-header {
            text-align: center;
            margin-bottom: 30px;
            color: #ffffff;
        }

        .mobile-header h1 {
            font-size: 24px;
            margin: 0 0 5px 0;
            color: #ffd700;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
        }

        .mobile-header h2 {
            font-size: 20px;
            margin: 0 0 10px 0;
            color: #ffffff;
        }

        .mobile-header p {
            font-size: 14px;
            margin: 5px 0;
            color: #cccccc;
        }

        .used-notice {
            color: #ff9500 !important;
            font-weight: bold;
        }

        .mobile-slider {
            width: 100%;
            overflow: hidden;
        }

        .slider-container {
            position: relative;
            width: 100%;
            overflow: hidden;
        }

        .slider-track {
            display: flex;
            transition: transform 0.3s ease-in-out;
            width: 100%;
        }

        .mobile-card {
            min-width: 100%;
            box-sizing: border-box;
            padding: 0 10px;
        }

        .mobile-card .card-image {
            width: 100%;
            height: 200px;
            border-radius: 15px;
            overflow: hidden;
            margin-bottom: 20px;
            background: linear-gradient(45deg, #2a2a4a, #3a3a5a);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .mobile-card img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 15px;
        }

        .card-content {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 15px;
            padding: 20px;
            color: #ffffff;
        }

        .card-content h3 {
            font-size: 22px;
            margin: 0 0 10px 0;
            color: #ffd700;
            text-align: center;
        }

        .description {
            font-size: 14px;
            line-height: 1.4;
            margin-bottom: 15px;
            color: #cccccc;
            text-align: center;
        }

        .stats {
            margin-bottom: 20px;
        }

        .stats h4 {
            font-size: 16px;
            margin: 0 0 10px 0;
            color: #ffd700;
            text-align: center;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }

        .stat-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(255, 255, 255, 0.1);
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 13px;
        }

        .stat-name {
            color: #cccccc;
        }

        .stat-value {
            color: #ffd700;
            font-weight: bold;
        }

        .abilities {
            margin-bottom: 20px;
        }

        .abilities h4 {
            font-size: 16px;
            margin: 0 0 10px 0;
            color: #ffd700;
            text-align: center;
        }

        .ability-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: center;
        }

        .ability-tag {
            background: rgba(255, 215, 0, 0.2);
            color: #ffd700;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            border: 1px solid rgba(255, 215, 0, 0.3);
        }

        .select-button {
            width: 100%;
            background: linear-gradient(45deg, #ffd700, #ffed4e);
            color: #000;
            border: none;
            padding: 15px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .select-button:active {
            transform: translateY(2px);
            box-shadow: 0 2px 8px rgba(255, 215, 0, 0.4);
        }

        .slider-nav {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 20px;
            gap: 15px;
        }

        .nav-btn {
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: #ffffff;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }

        .nav-btn:active {
            background: rgba(255, 215, 0, 0.3);
            transform: scale(0.95);
        }

        .dots {
            display: flex;
            gap: 8px;
        }

        .dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            border: none;
            background: rgba(255, 255, 255, 0.3);
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .dot.active {
            background: #ffd700;
            transform: scale(1.2);
        }

        .gender-selection {
            padding: 0 10px;
        }

        .gender-options {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .gender-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 15px;
            padding: 20px;
            text-align: center;
            color: #ffffff;
        }

        .gender-image {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            overflow: hidden;
            margin: 0 auto 15px auto;
            background: linear-gradient(45deg, #2a2a4a, #3a3a5a);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .gender-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .gender-card h3 {
            font-size: 20px;
            margin: 0 0 8px 0;
            color: #ffd700;
        }

        .gender-card p {
            font-size: 14px;
            color: #cccccc;
            margin-bottom: 15px;
        }

        .summary-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 15px;
            padding: 20px;
            margin: 0 10px 30px 10px;
            color: #ffffff;
        }

        .summary-image {
            width: 150px;
            height: 150px;
            border-radius: 15px;
            overflow: hidden;
            margin: 0 auto 20px auto;
            background: linear-gradient(45deg, #2a2a4a, #3a3a5a);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .summary-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .summary-content h3 {
            font-size: 20px;
            margin: 0 0 20px 0;
            color: #ffd700;
            text-align: center;
        }

        .summary-section {
            margin-bottom: 20px;
        }

        .summary-section h4 {
            font-size: 16px;
            margin: 0 0 10px 0;
            color: #ffd700;
            border-bottom: 1px solid rgba(255, 215, 0, 0.3);
            padding-bottom: 5px;
        }

        .summary-section p {
            margin: 5px 0;
            line-height: 1.4;
        }

        .summary-section .small {
            font-size: 13px;
            color: #cccccc;
            font-style: italic;
        }

        .final-stats {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .stat-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(255, 255, 255, 0.1);
            padding: 10px 15px;
            border-radius: 8px;
        }

        .ability-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .navigation-buttons {
            padding: 0 15px 20px 15px;
        }

        .back-button {
            width: 100%;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: #ffffff;
            padding: 15px;
            border-radius: 10px;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .back-button:active {
            background: rgba(255, 255, 255, 0.2);
            transform: translateY(1px);
        }

        .action-buttons {
            padding: 0 15px 30px 15px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .confirm-button {
            background: linear-gradient(45deg, #28a745, #20c997);
            color: #ffffff;
            border: none;
            padding: 18px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .confirm-button:active {
            transform: translateY(2px);
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
        }

        .message-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
            box-sizing: border-box;
        }

        .message-popup {
            background: linear-gradient(135deg, #2a2a4a, #3a3a5a);
            border: 1px solid rgba(255, 215, 0, 0.3);
            border-radius: 15px;
            padding: 30px;
            text-align: center;
            color: #ffffff;
            max-width: 350px;
            width: 100%;
        }

        .message-popup p {
            font-size: 16px;
            margin: 0 0 20px 0;
            line-height: 1.4;
        }

        .message-button {
            background: linear-gradient(45deg, #ffd700, #ffed4e);
            color: #000;
            border: none;
            padding: 12px 30px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .message-button:active {
            transform: translateY(1px);
        }

        .profession-card .card-content {
            min-height: auto;
        }

        .profession-card .description {
            margin-bottom: 20px;
            min-height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* Responsive adjustments */
        @media (max-width: 480px) {
            .character-creation-section {
                padding: 15px 10px;
            }
            
            .mobile-header h1 {
                font-size: 20px;
            }
            
            .mobile-header h2 {
                font-size: 18px;
            }
            
            .card-content {
                padding: 15px;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
        }

        /* Performance optimizations for mobile */
        * {
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            user-select: none;
        }

        .slider-track {
            will-change: transform;
        }

        .mobile-card img {
            will-change: auto;
        }
    `;
    document.head.appendChild(style);
}

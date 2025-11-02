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
        window.gameAuth.loadModule('god_selection');
        return;
    }

    await initializeCharacterData();
    _main.innerHTML = `<div class="main-app-container"><div class="particles"></div><div class="character-creation-section"></div></div>`;
    createParticles();
    await startCharacterCreationFlow();
    addGridSelectionStyles();
}

function addGridSelectionStyles() {
    if (document.getElementById('grid-selection-styles')) return;

    const style = document.createElement('style');
    style.id = 'grid-selection-styles';
    style.textContent = `
        .grid-selection-section { padding: 15px; }
        .selection-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 15px 0; }
        .grid-item { background: rgba(85, 54, 27, 0.9); border: 2px solid rgba(196, 151, 90, 0.6); border-radius: 10px; padding: 12px; cursor: pointer; transition: all 0.2s ease; text-align: center; min-height: 100px; display: flex; flex-direction: column; justify-content: center; align-items: center; -webkit-tap-highlight-color: transparent; }
        .grid-item:active { transform: scale(0.95); }
        .grid-item.selected { border-color: #4CAF50; background: rgba(40, 60, 40, 0.9); box-shadow: 0 0 15px rgba(76, 175, 80, 0.4); }
        .grid-item-image { margin-bottom: 8px; }
        .grid-portrait { width: 125px; height: 125px; border-radius: 8px; object-fit: cover; border: 2px solid rgba(196, 151, 90, 0.8); }
        .grid-profession { width: 45px; height: 45px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(196, 151, 90, 0.6); }
        .grid-item-label { color: #c4975a; font-weight: bold; font-size: 13px; margin-bottom: 4px; }
        .grid-item-info { text-align: center; }
        .grid-item-description { color: #ddd; font-size: 11px; line-height: 1.2; }
        .portrait-item { min-height: 120px; }
        .portrait-item .grid-item-label { font-size: 14px; }
        .portrait-display { display: flex; justify-content: center; align-items: center; padding: 30px; }
        .portrait-large { width: 300px; height: 300px; border-radius: 12px; object-fit: cover; border: 4px solid rgba(196, 151, 90, 0.8); box-shadow: 0 0 20px rgba(196, 151, 90, 0.4); }
        .profession-item { min-height: 80px; flex-direction: row; text-align: left; padding: 12px; align-items: center; }
        .profession-item .grid-item-image { margin-right: 12px; margin-bottom: 0; flex-shrink: 0; }
        .profession-item .grid-item-info { text-align: left; flex-grow: 1; }
        .profession-item .grid-item-label { margin-bottom: 2px; }
        .profession-item .grid-item-description { font-size: 10px; }
        .name-selection-inline { padding: 15px; margin-bottom: 15px; background: rgba(50, 35, 20, 0.8); border-radius: 10px; border: 1px solid rgba(196, 151, 90, 0.4); }
        .name-selection-inline label { display: block; color: #c4975a; font-weight: bold; margin-bottom: 8px; font-size: 16px; }
        .name-selection-inline input { width: 100%; max-width: 400px; padding: 12px; background: rgba(30, 20, 10, 0.8); border: 2px solid rgba(196, 151, 90, 0.6); border-radius: 8px; color: #c4975a; font-size: 16px; transition: all 0.3s ease; }
        .name-selection-inline input:focus { outline: none; border-color: #c4975a; box-shadow: 0 0 10px rgba(196, 151, 90, 0.4); background: rgba(40, 25, 15, 0.9); }
        .name-selection-inline input::placeholder { color: #8a6d3b; }
        .name-error-message { color: #ff6b6b; font-size: 12px; margin-top: 5px; display: none; }
        .summary-card { display: flex; gap: 20px; background: rgba(50, 35, 20, 0.95); border: 2px solid rgba(196, 151, 90, 0.8); border-radius: 12px; padding: 20px; margin: 20px auto; max-width: 900px; }
        .summary-art-block { flex: 0 0 auto; width: 200px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .summary-art { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; border: 3px solid rgba(196, 151, 90, 0.8); }
        .summary-character-name { color: #c4975a; font-size: 18px; font-weight: bold; text-align: center; margin-top: 5px; }
        .summary-info-block { flex: 1; display: flex; flex-direction: column; gap: 12px; }
        .summary-info-block h2 { color: #c4975a; margin: 0 0 10px 0; font-size: 24px; }
        .summary-info-block p { margin: 5px 0; color: #ddd; font-size: 14px; }
        .summary-info-block p strong { color: #c4975a; }
        .ability-item { cursor: pointer; transition: color 0.2s ease; }
        .ability-tooltip-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000; display: flex; align-items: center; justify-content: center; }
        .ability-tooltip-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); }
        .ability-tooltip-content { position: relative; background: rgba(50, 35, 20, 0.98); border: 3px solid #c4975a; border-radius: 12px; padding: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 0 30px rgba(196, 151, 90, 0.5); }
        .ability-tooltip-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid rgba(196, 151, 90, 0.5); }
        .ability-tooltip-header h3 { color: #c4975a; margin: 0; font-size: 20px; }
        .ability-tooltip-close { background: none; border: none; color: #c4975a; font-size: 28px; cursor: pointer; padding: 0; line-height: 1; width: 30px; height: 30px; }
        .ability-tooltip-body { color: #ddd; }
        .ability-tooltip-body p { margin: 10px 0; line-height: 1.6; }
        .ability-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; }
        .ability-stat-item { background: rgba(85, 54, 27, 0.6); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(196, 151, 90, 0.4); }
        .ability-stat-label { color: #c4975a; font-size: 11px; text-transform: uppercase; font-weight: bold; }
        .ability-stat-value { color: #fff; font-size: 16px; font-weight: bold; }
        .top-right-buttons { position: absolute; top: 20px; right: 20px; display: flex; gap: 10px; }
        .god-reselect-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000; display: flex; align-items: center; justify-content: center; }
        .god-reselect-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); }
        .god-reselect-content { position: relative; background: rgba(50, 35, 20, 0.98); border: 3px solid #c4975a; border-radius: 12px; padding: 20px; max-width: 500px; width: 90%; box-shadow: 0 0 30px rgba(196, 151, 90, 0.5); }
        .god-reselect-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid rgba(196, 151, 90, 0.5); }
        .god-reselect-header h3 { color: #c4975a; margin: 0; font-size: 20px; }
        .god-reselect-close { background: none; border: none; color: #c4975a; font-size: 28px; cursor: pointer; padding: 0; line-height: 1; width: 30px; height: 30px; }
        .god-reselect-body { color: #ddd; margin-bottom: 20px; }
        .god-reselect-warning { color: #ff6b6b; font-weight: bold; margin: 10px 0; }
        .god-reselect-buttons { display: flex; gap: 10px; justify-content: flex-end; }
        .selection-slide { min-height: 500px; border-radius: 12px; padding: 20px; position: relative; display: flex; align-items: center; justify-content: center; }
        .slider-container { overflow: hidden; border-radius: 12px; }
        .slider-track { display: flex; transition: transform 0.3s ease-out; }
        .selection-slide { flex: 0 0 100%; box-sizing: border-box; }
    `;
    document.head.appendChild(style);
}

function removeGridSelectionStyles() {
    const existingStyles = document.getElementById('grid-selection-styles');
    if (existingStyles) existingStyles.remove();
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
        removeGridSelectionStyles();
        window.gameAuth.loadModule('castle');
        return;
    }
    fetchRacesAndRenderSelection();
}

async function fetchRacesAndRenderSelection() {
    try {
        if (!_godId || _godId === null || _godId === 'null') {
            window.gameAuth.loadModule('god_selection');
            return;
        }

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
        _races.forEach(race => race.available_classes = []);
    }
}

function loadRaceSelectionBackgrounds() {
    const slides = _main.querySelectorAll('.selection-slide[data-type="race"]');
    slides.forEach(slide => {
        const raceId = parseInt(slide.dataset.id);
        const race = _races.find(r => r.id === raceId);
        if (!race) return;
        
        const raceName = race.name.toLowerCase().replace(/\s+/g, '_');
        const backgroundImagePath = `assets/art/races/backgrounds/${raceName}_bg.png`;
        
        const testImage = new Image();
        testImage.onload = function() {
            slide.style.backgroundImage = `linear-gradient(135deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.2)), url('${backgroundImagePath}')`;
            slide.style.backgroundSize = 'cover';
            slide.style.backgroundPosition = 'center';
            slide.style.backgroundRepeat = 'no-repeat';
            applyRaceBorderToSlide(slide, raceName);
        };
        testImage.onerror = function() {
            applyRaceBorderToSlide(slide, raceName);
        };
        testImage.src = backgroundImagePath;
    });
}

function applyRaceBorderToSlide(slide, raceName) {
    const borderColors = {
        'human': 'rgba(196, 151, 90, 0.8)',
        'elf': 'rgba(0, 255, 100, 0.8)',
        'dwarf': 'rgba(139, 69, 19, 0.8)',
        'orc': 'rgba(0, 128, 0, 0.8)',
        'undead': 'rgba(128, 128, 128, 0.8)'
    };
    
    const borderColor = borderColors[raceName] || 'rgba(196, 151, 90, 0.8)';
    slide.style.border = `3px solid ${borderColor}`;
    slide.style.borderRadius = '12px';
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
        <div class="top-right-buttons">
            <button class="fantasy-button god-return-btn">Change Deity</button>
        </div>
    `;

    initializeSelectionSlider();
    setTimeout(() => loadRaceSelectionBackgrounds(), 100);
    
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

    section.querySelector('.god-return-btn').addEventListener('click', handleGodReselection);
}

function showGodReselectConfirmation() {
    const modal = document.createElement('div');
    modal.className = 'god-reselect-modal';
    modal.innerHTML = `
        <div class="god-reselect-overlay"></div>
        <div class="god-reselect-content">
            <div class="god-reselect-header">
                <h3>Change Deity</h3>
                <button class="god-reselect-close">&times;</button>
            </div>
            <div class="god-reselect-body">
                <p>You have ${_existingCharacterCount} character(s) created with your current deity.</p>
                <div class="god-reselect-warning">Changing deity will delete all your existing characters!</div>
                <p>Are you sure you want to continue?</p>
            </div>
            <div class="god-reselect-buttons">
                <button class="fantasy-button cancel-god-reselect">Cancel</button>
                <button class="fantasy-button confirm-god-reselect" style="background: #d32f2f;">Continue</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => modal.remove();
    
    modal.querySelector('.god-reselect-close').addEventListener('click', closeModal);
    modal.querySelector('.god-reselect-overlay').addEventListener('click', closeModal);
    modal.querySelector('.cancel-god-reselect').addEventListener('click', closeModal);
    
    modal.querySelector('.confirm-god-reselect').addEventListener('click', async () => {
        try {
            const response = await _apiCall('/api/characters/delete-all', {
                method: 'POST',
                body: { player_id: _profile.id }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    displayMessage('Characters deleted. Redirecting to deity selection...');
                    closeModal();
                    _existingCharacterCount = 0;
                    _usedProfessionIds = [];
                    setTimeout(() => {
                        window.gameAuth.loadModule('god_selection');
                    }, 1500);
                } else {
                    throw new Error(result.error || 'Failed to delete characters');
                }
            } else {
                throw new Error('Failed to delete characters');
            }
        } catch (error) {
            console.error('Delete characters error:', error);
            displayMessage('Failed to delete characters. Please try again.');
            closeModal();
        }
    });
}

function handleGodReselection() {
    if (_existingCharacterCount > 0) {
        showGodReselectConfirmation();
    } else {
        window.gameAuth.loadModule('god_selection');
    }
}

function loadClassSelectionBackgrounds() {
    const slides = _main.querySelectorAll('.selection-slide[data-type="class"]');
    slides.forEach(slide => {
        const classId = parseInt(slide.dataset.id);
        const selectedClass = _classes.find(c => c.id === classId);
        if (!selectedClass) return;
        const className = selectedClass.name.toLowerCase().replace(/\s+/g, '_');
        const backgroundImagePath = `assets/art/classes/backgrounds/${className}_bg.png`;
        const testImage = new Image();
        testImage.onload = function() {
            slide.style.backgroundImage = `linear-gradient(135deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.2)), url('${backgroundImagePath}')`;
            slide.style.backgroundSize = 'cover';
            slide.style.backgroundPosition = 'center';
            slide.style.backgroundRepeat = 'no-repeat';
            applyClassBorderToSlide(slide, className);
        };
        testImage.onerror = function() {
            applyClassBorderToSlide(slide, className);
        };
        testImage.src = backgroundImagePath;
    });
}

function applyClassBorderToSlide(slide, className) {
    const borderColors = {
        'paladin': 'rgba(255, 255, 200, 0.8)',
        'warrior': 'rgba(200, 0, 0, 0.8)',
        'priest': 'rgba(255, 255, 255, 0.8)',
        'defiler': 'rgba(68, 1, 57, 0.8)',
        'grave warden': 'rgba(1, 53, 17, 0.8)'
    };
    const borderColor = borderColors[className] || 'rgba(196, 151, 90, 0.8)';
    slide.style.border = `3px solid ${borderColor}`;
    slide.style.borderRadius = '12px';
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
                        <ul>${classInfo.starting_abilities.map(ability => `<li class="ability-item" data-ability="${ability}">${ability}</li>`).join('')}</ul>
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
    modal.querySelectorAll('.ability-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            showAbilityTooltip(item.dataset.ability);
        });
    });
}

async function showAbilityTooltip(abilityName) {
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/abilities?name=eq.${encodeURIComponent(abilityName)}&select=*`);
        const abilities = await response.json();
        if (!abilities || abilities.length === 0) {
            displayMessage('Ability information not available.');
            return;
        }
        const ability = abilities[0];
        const abilityIconPath = `assets/art/abilities/${ability.name.replace(/\s+/g, '')}.png`;
        const modal = document.createElement('div');
        modal.className = 'ability-tooltip-modal';
        modal.innerHTML = `
            <div class="ability-tooltip-overlay"></div>
            <div class="ability-tooltip-content">
                <div class="ability-tooltip-header">
                    <div class="ability-header-content">
                        <img src="${abilityIconPath}" alt="${ability.name}" class="ability-icon">
                        <h3>${ability.name}</h3>
                    </div>
                    <button class="ability-tooltip-close">&times;</button>
                </div>
                <div class="ability-tooltip-body">
                    ${ability.description ? `<p class="ability-description">${ability.description}</p>` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        const abilityIcon = modal.querySelector('.ability-icon');
        abilityIcon.addEventListener('error', function() {
            this.style.display = 'none';
        });
        
        const closeModal = () => modal.remove();
        modal.querySelector('.ability-tooltip-close').addEventListener('click', closeModal);
        modal.querySelector('.ability-tooltip-overlay').addEventListener('click', closeModal);
    } catch (error) {
        displayMessage('Failed to load ability details.');
    }
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
        dots.forEach((dot, index) => dot.classList.toggle('active', index === currentSlide));
    }
    function nextSlide() { currentSlide = (currentSlide + 1) % totalSlides; updateSlider(); }
    function prevSlide() { currentSlide = (currentSlide - 1 + totalSlides) % totalSlides; updateSlider(); }
    dots.forEach((dot, index) => dot.addEventListener('click', () => { currentSlide = index; updateSlider(); }));
    let startX = 0, currentX = 0, isDragging = false, startTime = 0;
    sliderTrack.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX; currentX = startX; isDragging = true; startTime = Date.now(); sliderTrack.style.transition = 'none';
    }, { passive: true });
    sliderTrack.addEventListener('touchmove', (e) => {
        if (!isDragging) return; currentX = e.touches[0].clientX; const diffX = currentX - startX; const currentTranslate = -currentSlide * 100; const newTranslate = currentTranslate + (diffX / sliderTrack.offsetWidth) * 100; sliderTrack.style.transform = `translateX(${newTranslate}%)`; e.preventDefault();
    }, { passive: false });
    sliderTrack.addEventListener('touchend', (e) => {
        if (!isDragging) return; isDragging = false; const endX = e.changedTouches[0].clientX; const diffX = startX - endX; const diffTime = Date.now() - startTime; const velocity = Math.abs(diffX) / diffTime; sliderTrack.style.transition = 'transform 0.3s ease-out'; const threshold = 50; const velocityThreshold = 0.3;
        if (Math.abs(diffX) > threshold || velocity > velocityThreshold) { if (diffX > 0) nextSlide(); else prevSlide(); } else { updateSlider(); }
    });
    let isMouseDown = false;
    sliderTrack.addEventListener('mousedown', (e) => { startX = e.clientX; currentX = startX; isMouseDown = true; startTime = Date.now(); sliderTrack.style.transition = 'none'; e.preventDefault(); });
    sliderTrack.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return; currentX = e.clientX; const diffX = currentX - startX; const currentTranslate = -currentSlide * 100; const newTranslate = currentTranslate + (diffX / sliderTrack.offsetWidth) * 100; sliderTrack.style.transform = `translateX(${newTranslate}%)`; e.preventDefault();
    });
    sliderTrack.addEventListener('mouseup', (e) => {
        if (!isMouseDown) return; isMouseDown = false; const endX = e.clientX; const diffX = startX - endX; const diffTime = Date.now() - startTime; const velocity = Math.abs(diffX) / diffTime; sliderTrack.style.transition = 'transform 0.3s ease-out'; const threshold = 50; const velocityThreshold = 0.3;
        if (Math.abs(diffX) > threshold || velocity > velocityThreshold) { if (diffX > 0) nextSlide(); else prevSlide(); } else { updateSlider(); }
    });
    sliderTrack.addEventListener('mouseleave', () => { if (isMouseDown) { isMouseDown = false; sliderTrack.style.transition = 'transform 0.3s ease-out'; updateSlider(); } });
}

async function handleRaceSelection(raceId) {
    _selectedRace = _races.find(r => r.id === raceId);
    if (!_selectedRace) { displayMessage('Selected race not found. Please try again.'); return; }
    fetchClassesAndRenderSelection();
}

async function fetchClassesAndRenderSelection() {
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/classes?race_id=eq.${_selectedRace.id}&select=id,name,description,stat_bonuses,starting_abilities`);
        _classes = await response.json();
        if (_classes.length === 0) { displayMessage('No classes available for this race. Please select another race.'); _selectedRace = null; renderRaceSelection(); return; }
        renderClassSelection();
    } catch (error) { displayMessage('Failed to load classes. Please try again.'); _selectedRace = null; renderRaceSelection(); }
}

function renderClassSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Class</h1>
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
                                <div class="card-info-block">
                                    <h3 class="card-name">${cls.name}</h3>
                                    <p class="card-description">${cls.description}</p>
                                    <div class="stats-block">
                                        <h4>Stat Bonuses:</h4>
                                        ${Object.entries(cls.stat_bonuses).map(([stat, value]) => `<p>${stat}: <span>+${value}</span></p>`).join('')}
                                    </div>
                                    <div class="abilities-block">
                                        <h4>Starting Abilities:</h4>
                                        <ul>${cls.starting_abilities.map(ability => `<li class="ability-item" data-ability="${ability}">${ability}</li>`).join('')}</ul>
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
            <button class="fantasy-button god-return-btn">Change Deity</button>
        </div>
    `;
    initializeSelectionSlider();
    setTimeout(() => loadClassSelectionBackgrounds(), 100);
    section.querySelectorAll('.select-btn[data-type="class"]').forEach(button => {
        button.addEventListener('click', (e) => { const classId = parseInt(e.target.dataset.id); handleClassSelection(classId); });
    });
    section.querySelectorAll('.ability-item').forEach(item => {
        item.addEventListener('click', (e) => { e.stopPropagation(); showAbilityTooltip(item.dataset.ability); });
    });
    section.querySelector('.return-btn').addEventListener('click', () => { _selectedClass = null; renderRaceSelection(); });
    section.querySelector('.god-return-btn').addEventListener('click', handleGodReselection);
}

function handleClassSelection(classId) {
    _selectedClass = _classes.find(c => c.id === classId);
    if (!_selectedClass) { displayMessage('Selected class not found. Please try again.'); return; }
    renderPortraitSelection();
}

function renderPortraitSelection() {
    const section = _main.querySelector('.character-creation-section');
    const currentCharacterNumber = _existingCharacterCount + 1;
    
    const raceName = _selectedRace.name.toLowerCase().replace(/\s+/g, '_');
    const className = _selectedClass.name.toLowerCase().replace(/\s+/g, '_');
    const portraitName = `${raceName}_${className}_1`;

    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Name Your Champion</h1>
        </div>
        <div class="selected-race-summary">
            <h3>Selected Race: ${_selectedRace.name}</h3>
            <p><strong>Class:</strong> ${_selectedClass.name}</p>
        </div>
        <div class="portrait-display">
            <img src="assets/art/classes/portraits/${portraitName}.png" alt="Champion Portrait" class="portrait-large">
        </div>
        <div class="name-selection-inline">
            <label for="character-name-input">Champion Name:</label>
            <input type="text" id="character-name-input" maxlength="24" placeholder="Enter champion name" class="fantasy-input" value="${_characterName}">
            <div class="name-error-message"></div>
        </div>
        <div class="confirm-return-buttons">
            <button type="button" class="fantasy-button confirm-portrait-btn">Continue</button>
            <button type="button" class="fantasy-button return-btn">Return</button>
            <button type="button" class="fantasy-button god-return-btn">Change Deity</button>
        </div>
    `;

    const portraitImg = section.querySelector('.portrait-large');
    portraitImg.addEventListener('error', function() {
        this.style.display = 'none';
        this.parentElement.innerHTML = '<div style="color: #8a6d3b; padding: 40px; text-align: center; font-size: 18px;">Portrait<br>Not Available</div>';
    });

    const input = section.querySelector('#character-name-input');
    const errorMsg = section.querySelector('.name-error-message');
    
    section.querySelector('.confirm-portrait-btn').addEventListener('click', () => {
        const name = input.value.trim();
        if (!name) {
            errorMsg.textContent = 'Please enter a name first.';
            errorMsg.style.display = 'block';
            input.focus();
            return;
        }
        if (name.length < 2) {
            errorMsg.textContent = 'Name must be at least 2 characters.';
            errorMsg.style.display = 'block';
            input.focus();
            return;
        }
        
        errorMsg.style.display = 'none';
        _characterName = name;
        _selectedPortrait = portraitName;
        
        fetchProfessionsAndRenderSelection();
    });

    input.addEventListener('input', () => {
        errorMsg.style.display = 'none';
    });

    section.querySelector('.return-btn').addEventListener('click', () => {
        _selectedPortrait = null;
        renderClassSelection();
    });

    section.querySelector('.god-return-btn').addEventListener('click', handleGodReselection);
    
    input.focus();
}

async function fetchProfessionsAndRenderSelection() {
    try {
        const response = await _apiCall(`/api/supabase/rest/v1/professions?select=id,name,description`);
        _professions = await response.json();
        if (_professions.length === 0) { displayMessage('No professions available. Please contact support.'); renderPortraitSelection(); return; }
        renderProfessionSelection();
    } catch (error) { displayMessage('Failed to load professions. Please try again.'); renderPortraitSelection(); }
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
                <h3>${_characterName}</h3>
                <p><strong>Race:</strong> ${_selectedRace.name} | <strong>Class:</strong> ${_selectedClass.name}</p>
            </div>
            <div class="no-professions-message">
                <h3>No Available Professions</h3>
                <p>All professions have already been selected by your other characters. Each character must have a unique profession.</p>
            </div>
            <div class="top-right-buttons">
                <button class="fantasy-button return-btn">Return</button>
                <button class="fantasy-button god-return-btn">Change Deity</button>
            </div>
        `;
        section.querySelector('.return-btn').addEventListener('click', () => { _selectedProfession = null; renderPortraitSelection(); });
        section.querySelector('.god-return-btn').addEventListener('click', handleGodReselection);
        return;
    }
    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Choose Profession</h1>
            ${_usedProfessionIds.length > 0 ? `<div class="profession-note"><p><em>Note: ${_usedProfessionIds.length} profession(s) already selected by other characters</em></p></div>` : ''}
        </div>
        <div class="selected-race-summary">
            <h3>${_characterName}</h3>
            <p><strong>Race:</strong> ${_selectedRace.name} | <strong>Class:</strong> ${_selectedClass.name}</p>
        </div>
        <div class="grid-selection-section">
            <div class="selection-grid">
                ${availableProfessions.map(profession => `
                    <div class="grid-item profession-item" data-id="${profession.id}">
                        <div class="grid-item-image">
                            <img src="assets/art/professions/${profession.name.toLowerCase().replace(/\s+/g, '_')}.png" alt="${profession.name}" class="grid-profession">
                        </div>
                        <div class="grid-item-info">
                            <div class="grid-item-label">${profession.name}</div>
                            <div class="grid-item-description">${profession.description}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="top-right-buttons">
            <button class="fantasy-button return-btn">Return</button>
            <button class="fantasy-button god-return-btn">Change Deity</button>
        </div>
    `;
    
    section.querySelectorAll('.grid-profession').forEach(img => {
        img.addEventListener('error', function() {
            this.style.display = 'none';
            this.parentElement.innerHTML = '<div style="color: #8a6d3b; padding: 10px; text-align: center;">No image</div>';
        });
    });
    
    section.querySelectorAll('.profession-item').forEach(item => {
        item.addEventListener('click', (e) => {
            section.querySelectorAll('.profession-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            const professionId = parseInt(item.dataset.id); handleProfessionSelection(professionId);
        });
    });
    section.querySelector('.return-btn').addEventListener('click', () => { _selectedProfession = null; renderPortraitSelection(); });
    section.querySelector('.god-return-btn').addEventListener('click', handleGodReselection);
}

function handleProfessionSelection(professionId) {
    _selectedProfession = _professions.find(p => p.id === professionId);
    if (!_selectedProfession) { displayMessage('Selected profession not found. Please try again.'); return; }
    renderCharacterSummary();
}

function renderCharacterSummary() {
    const section = _main.querySelector('.character-creation-section');
    const finalStats = calculateFinalStats(_selectedRace.base_stats, _selectedClass.stat_bonuses);
    const currentCharacterNumber = _existingCharacterCount + 1;
    
    section.innerHTML = `
        <div class="art-header">
            <h1>Character ${currentCharacterNumber} of ${_maxCharacters}: Confirm</h1>
        </div>
        <div class="summary-card">
            <div class="summary-art-block">
                <img src="assets/art/classes/portraits/${_selectedPortrait}.png" alt="${_selectedRace.name} ${_selectedClass.name}" class="summary-art">
                <div class="summary-character-name">${_characterName}</div>
            </div>
            <div class="summary-info-block">
                <h2>${_selectedRace.name} ${_selectedClass.name}</h2>
                <p><strong>Profession:</strong> ${_selectedProfession.name}</p>
                <h4>Final Stats:</h4>
                <div class="stats-block">
                    ${Object.entries(finalStats).map(([stat, value]) => `<p>${stat}: <span>${value}</span></p>`).join('')}
                </div>
                <div class="abilities-block">
                    <h4>Starting Abilities:</h4>
                    <ul>${_selectedClass.starting_abilities.map(ability => `<li class="ability-item" data-ability="${ability}">${ability}</li>`).join('')}</ul>
                </div>
            </div>
        </div>
        <div class="confirm-return-buttons">
            <button type="button" class="fantasy-button confirm-btn">Confirm</button>
            <button type="button" class="fantasy-button return-btn">Return</button>
            <button type="button" class="fantasy-button god-return-btn">Change Deity</button>
        </div>
    `;
    
    const summaryArt = section.querySelector('.summary-art');
    summaryArt.addEventListener('error', function() {
        this.style.display = 'none';
        this.parentElement.innerHTML = '<div style="color: #8a6d3b; padding: 40px; text-align: center; font-size: 14px;">Portrait<br>Not Available</div>';
    });
    
    section.querySelectorAll('.ability-item').forEach(item => {
        item.addEventListener('click', (e) => { e.stopPropagation(); showAbilityTooltip(item.dataset.ability); });
    });
    section.querySelector('.confirm-btn').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); confirmCharacter(); });
    section.querySelector('.return-btn').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); renderProfessionSelection(); });
    section.querySelector('.god-return-btn').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handleGodReselection(); });
}

function calculateFinalStats(baseStats, statBonuses) {
    const finalStats = { ...baseStats };
    for (const stat in statBonuses) {
        if (finalStats.hasOwnProperty(stat)) finalStats[stat] += statBonuses[stat];
        else finalStats[stat] = statBonuses[stat];
    }
    finalStats.Armor = 0; finalStats.Resistance = 0; return finalStats;
}

async function confirmCharacter() {
    try {
        const characterCreationData = { player_id: _profile.id, race_id: _selectedRace.id, class_id: _selectedClass.id, portrait: _selectedPortrait, profession_id: _selectedProfession.id, name: _characterName };
        const response = await _apiCall(`${window.gameAuth.supabaseConfig?.SUPABASE_URL}/functions/v1/create-character`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${window.gameAuth.supabaseConfig?.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(characterCreationData)
        });
        if (!response.ok) { const errorText = await response.text(); try { const errorData = JSON.parse(errorText); throw new Error(errorData.error || `Edge function call failed with status ${response.status}`); } catch { throw new Error(`Edge function call failed with status ${response.status}: ${errorText}`); } }
        const result = await response.json();
        if (result.success) { _usedProfessionIds.push(_selectedProfession.id); _existingCharacterCount++; displayMessage(`Character ${_existingCharacterCount} (${result.character.race} ${result.character.class}) created! (${_existingCharacterCount}/${_maxCharacters})`);
            setTimeout(() => startCharacterCreationFlow(), 1000);
        } else throw new Error(result.error || 'Unknown error occurred during character creation');
    } catch (error) { displayMessage(`Failed to save character: ${error.message}`); }
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
    messageBox.innerHTML = `<div class="message-content"><p>${message}</p><button class="fantasy-button message-ok-btn">OK</button></div>`;
    document.body.appendChild(messageBox);
    messageBox.querySelector('.message-ok-btn').addEventListener('click', () => messageBox.remove());
}
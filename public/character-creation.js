// character-creation.js

class CharacterCreation {
    constructor() {
        this.currentStep = 'god-selection';
        this.profile = null;
        this.gods = [];
        this.races = [];
        this.classes = [];
        this.characters = [];
        this.currentCharacterIndex = 0;
        this.tempCharacter = {};
        this.mainContainer = document.querySelector('.main-app-container');
        
        this.init();
    }

    async init() {
        try {
            // Get current profile
            this.profile = window.gameAuth.getCurrentProfile();
            if (!this.profile) {
                window.location.href = '/';
                return;
            }

            // Load initial data
            await this.loadGameData();
            await this.checkCurrentState();
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize character creation');
        }
    }

    async loadGameData() {
        try {
            // Load gods
            const godsResponse = await window.gameAuth.authenticatedFetch('/api/supabase/rest/v1/gods');
            this.gods = await godsResponse.json();

            // Load races
            const racesResponse = await window.gameAuth.authenticatedFetch('/api/supabase/rest/v1/races');
            this.races = await racesResponse.json();

            // Load classes
            const classesResponse = await window.gameAuth.authenticatedFetch('/api/supabase/rest/v1/classes');
            this.classes = await classesResponse.json();

            // Load existing characters
            const charactersResponse = await window.gameAuth.authenticatedFetch(`/api/supabase/rest/v1/characters?player_id=eq.${this.profile.id}`);
            this.characters = await charactersResponse.json();

        } catch (error) {
            console.error('Error loading game data:', error);
            throw error;
        }
    }

    async checkCurrentState() {
        // Check if god is selected
        if (!this.profile.gid) {
            this.currentStep = 'god-selection';
            this.showGodSelection();
            return;
        }

        // Check character count
        if (this.characters.length < 3) {
            this.currentCharacterIndex = this.characters.length;
            this.currentStep = 'race-selection';
            this.showRaceSelection();
            return;
        }

        // All characters created, redirect to game
        this.redirectToGame();
    }

    showGodSelection() {
        const html = `
            <div class="particles"></div>
            <div class="art-header">
                <div class="crown-symbol"></div>
                <h1>Choose Your Divine Patron</h1>
                <p class="subtitle">Select the god that will guide your destiny</p>
            </div>
            
            <div class="character-creation-section">
                <div class="gods-grid">
                    ${this.gods.map(god => `
                        <div class="god-card" data-god-id="${god.id}">
                            <h3>${god.name}</h3>
                            <p>${god.description}</p>
                            <button class="fantasy-button select-god-btn" data-god-id="${god.id}">
                                Choose ${god.name}
                            </button>
                        </div>
                    `).join('')}
                </div>
                
                <div class="navigation-buttons">
                    <button class="fantasy-button secondary-btn" onclick="window.gameAuth.logout()">
                        Back to Login
                    </button>
                </div>
            </div>
        `;

        this.mainContainer.innerHTML = html;
        this.createParticles();
        this.bindGodSelectionEvents();
    }

    showRaceSelection() {
        const availableRaces = this.races.filter(race => race.faction_id === this.profile.gid);
        
        const html = `
            <div class="particles"></div>
            <div class="art-header">
                <div class="crown-symbol"></div>
                <h1>Choose Your Race</h1>
                <p class="subtitle">Character ${this.currentCharacterIndex + 1} of 3</p>
            </div>
            
            <div class="character-creation-section">
                <div class="races-grid">
                    ${availableRaces.map(race => `
                        <div class="race-card" data-race-id="${race.id}">
                            <h3>${race.name}</h3>
                            <p>${race.description}</p>
                            <div class="base-stats">
                                <h4>Base Stats:</h4>
                                ${Object.entries(race.base_stats).map(([stat, value]) => 
                                    `<div class="stat-item">${stat}: ${value}</div>`
                                ).join('')}
                            </div>
                            <button class="fantasy-button select-race-btn" data-race-id="${race.id}">
                                Choose ${race.name}
                            </button>
                        </div>
                    `).join('')}
                </div>
                
                <div class="navigation-buttons">
                    <button class="fantasy-button secondary-btn" onclick="characterCreation.goBack()">
                        Back
                    </button>
                </div>
            </div>
        `;

        this.mainContainer.innerHTML = html;
        this.createParticles();
        this.bindRaceSelectionEvents();
    }

    showClassSelection() {
        const selectedRace = this.races.find(r => r.id === this.tempCharacter.race_id);
        const availableClasses = this.classes.filter(cls => cls.faction_id === this.tempCharacter.race_id);
        
        const html = `
            <div class="particles"></div>
            <div class="art-header">
                <div class="crown-symbol"></div>
                <h1>Choose Your Class</h1>
                <p class="subtitle">Character ${this.currentCharacterIndex + 1} of 3 - ${selectedRace.name}</p>
            </div>
            
            <div class="character-creation-section">
                <div class="classes-grid">
                    ${availableClasses.map(cls => `
                        <div class="class-card" data-class-id="${cls.id}">
                            <h3>${cls.name}</h3>
                            <p>${cls.description}</p>
                            <div class="stat-bonuses">
                                <h4>Stat Bonuses:</h4>
                                ${Object.entries(cls.stat_bonuses).map(([stat, value]) => 
                                    `<div class="stat-item">${stat}: +${value}</div>`
                                ).join('')}
                            </div>
                            <div class="starting-abilities">
                                <h4>Starting Abilities:</h4>
                                ${cls.starting_abilities.map(ability => 
                                    `<div class="ability-item">${ability}</div>`
                                ).join('')}
                            </div>
                            <button class="fantasy-button select-class-btn" data-class-id="${cls.id}">
                                Choose ${cls.name}
                            </button>
                        </div>
                    `).join('')}
                </div>
                
                <div class="navigation-buttons">
                    <button class="fantasy-button secondary-btn" onclick="characterCreation.goBack()">
                        Back
                    </button>
                </div>
            </div>
        `;

        this.mainContainer.innerHTML = html;
        this.createParticles();
        this.bindClassSelectionEvents();
    }

    showCharacterSummary() {
        const selectedRace = this.races.find(r => r.id === this.tempCharacter.race_id);
        const selectedClass = this.classes.find(c => c.id === this.tempCharacter.class_id);
        
        // Calculate final stats
        const finalStats = {};
        Object.entries(selectedRace.base_stats).forEach(([stat, value]) => {
            finalStats[stat] = value + (selectedClass.stat_bonuses[stat] || 0);
        });

        const html = `
            <div class="particles"></div>
            <div class="art-header">
                <div class="crown-symbol"></div>
                <h1>Character Summary</h1>
                <p class="subtitle">Character ${this.currentCharacterIndex + 1} of 3</p>
            </div>
            
            <div class="character-creation-section">
                <div class="character-summary">
                    <div class="summary-card">
                        <h3>Character Overview</h3>
                        <div class="summary-item">
                            <strong>Race:</strong> ${selectedRace.name}
                        </div>
                        <div class="summary-item">
                            <strong>Class:</strong> ${selectedClass.name}
                        </div>
                        
                        <div class="final-stats">
                            <h4>Final Stats:</h4>
                            ${Object.entries(finalStats).map(([stat, value]) => 
                                `<div class="stat-item">${stat}: ${value}</div>`
                            ).join('')}
                        </div>
                        
                        <div class="starting-abilities">
                            <h4>Starting Abilities:</h4>
                            ${selectedClass.starting_abilities.map(ability => 
                                `<div class="ability-item">${ability}</div>`
                            ).join('')}
                        </div>
                    </div>
                </div>
                
                <div class="navigation-buttons">
                    <button class="fantasy-button secondary-btn" onclick="characterCreation.goBack()">
                        Back
                    </button>
                    <button class="fantasy-button confirm-btn" onclick="characterCreation.createCharacter()">
                        Create Character
                    </button>
                </div>
            </div>
        `;

        this.mainContainer.innerHTML = html;
        this.createParticles();
    }

    bindGodSelectionEvents() {
        document.querySelectorAll('.select-god-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const godId = parseInt(e.target.dataset.godId);
                await this.selectGod(godId);
            });
        });
    }

    bindRaceSelectionEvents() {
        document.querySelectorAll('.select-race-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const raceId = parseInt(e.target.dataset.raceId);
                this.selectRace(raceId);
            });
        });
    }

    bindClassSelectionEvents() {
        document.querySelectorAll('.select-class-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const classId = parseInt(e.target.dataset.classId);
                this.selectClass(classId);
            });
        });
    }

    async selectGod(godId) {
        try {
            const response = await window.gameAuth.authenticatedFetch(`/api/supabase/rest/v1/profiles?id=eq.${this.profile.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ gid: godId })
            });

            if (response.ok) {
                this.profile.gid = godId;
                localStorage.setItem('profile', JSON.stringify(this.profile));
                this.currentStep = 'race-selection';
                this.showRaceSelection();
            } else {
                throw new Error('Failed to update god selection');
            }
        } catch (error) {
            console.error('Error selecting god:', error);
            this.showError('Failed to select god');
        }
    }

    selectRace(raceId) {
        this.tempCharacter.race_id = raceId;
        this.currentStep = 'class-selection';
        this.showClassSelection();
    }

    selectClass(classId) {
        this.tempCharacter.class_id = classId;
        this.currentStep = 'character-summary';
        this.showCharacterSummary();
    }

    async createCharacter() {
        try {
            const response = await window.gameAuth.authenticatedFetch('/api/supabase/rest/v1/characters', {
                method: 'POST',
                body: JSON.stringify({
                    player_id: this.profile.id,
                    race_id: this.tempCharacter.race_id,
                    class_id: this.tempCharacter.class_id
                })
            });

            if (response.ok) {
                const newCharacter = await response.json();
                this.characters.push(newCharacter[0]);
                this.tempCharacter = {};
                this.currentCharacterIndex++;

                if (this.currentCharacterIndex < 3) {
                    this.currentStep = 'race-selection';
                    this.showRaceSelection();
                } else {
                    this.redirectToGame();
                }
            } else {
                throw new Error('Failed to create character');
            }
        } catch (error) {
            console.error('Error creating character:', error);
            this.showError('Failed to create character');
        }
    }

    goBack() {
        switch (this.currentStep) {
            case 'race-selection':
                if (this.currentCharacterIndex === 0) {
                    this.currentStep = 'god-selection';
                    this.showGodSelection();
                } else {
                    this.currentCharacterIndex--;
                    this.showRaceSelection();
                }
                break;
            case 'class-selection':
                this.currentStep = 'race-selection';
                this.showRaceSelection();
                break;
            case 'character-summary':
                this.currentStep = 'class-selection';
                this.showClassSelection();
                break;
        }
    }

    showError(message) {
        alert(message);
    }

    redirectToGame() {
        window.location.href = '/game';
    }

    createParticles() {
        const particles = document.querySelector('.particles');
        if (!particles) return;
        
        particles.innerHTML = '';
        const particleCount = 20;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.top = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 6 + 's';
            particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
            particles.appendChild(particle);
        }
    }
}

// Initialize character creation when the page loads
let characterCreation;

document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on the character creation page
    if (window.location.pathname === '/character-creation' || window.location.pathname === '/game') {
        characterCreation = new CharacterCreation();
    }
});

// Export for global access
window.characterCreation = characterCreation;
let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;

export async function loadModule(main, { apiCall, getCurrentProfile }) {
  console.log('[CHAR_MGR] --- Starting loadModule for Character Manager ---');
  _main = main;
  _apiCall = apiCall;
  _getCurrentProfile = getCurrentProfile;

  _profile = _getCurrentProfile();
  if (!_profile) {
    console.error('[CHAR_MGR] No profile found. Redirecting to login.');
    displayMessage('User profile not found. Please log in again.');
    window.gameAuth.loadModule('login');
    return;
  }

  _main.innerHTML = `
    <div class="main-app-container">
      <div class="particles"></div>
      <div class="character-creation-section"></div>
    </div>
  `;

  createParticles();
  await fetchAndRenderCharacters();
  console.log('[CHAR_MGR] --- loadModule for Character Manager finished ---');
}

async function fetchAndRenderCharacters() {
  console.log('[CHAR_MGR] Fetching player characters...');
  try {
    const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=*,races(name),classes(name),professions(name)`);
    const characters = await response.json();
    console.log('[CHAR_MGR] Characters fetched:', characters);

    renderCharacters(characters);
  } catch (error) {
    console.error('[CHAR_MGR] Error fetching characters:', error);
    displayMessage('Failed to load characters. Please try again.');
  }
}

function renderCharacters(characters) {
  const section = _main.querySelector('.character-creation-section');

  if (!characters || characters.length === 0) {
    section.innerHTML = `
      <div class="art-header">
        <h1>Your Champions</h1>
        <p class="subtitle">You have no champions yet. Create some to start your journey.</p>
      </div>
      <div class="confirm-return-buttons">
        <button class="fantasy-button return-btn">Return</button>
      </div>
    `;
    section.querySelector('.return-btn').addEventListener('click', () => {
      window.gameAuth.loadModule('castle');
    });
    return;
  }

  section.innerHTML = `
    <div class="art-header">
      <h1>Your Champions</h1>
      <p class="subtitle">View your heroes and their current equipment and abilities.</p>
    </div>
    <div class="selection-section">
      <div class="selection-container desktop-view">
        <div class="selection-grid">
          ${characters.map(characterCardHTML).join('')}
        </div>
      </div>
    </div>
    <div class="confirm-return-buttons">
      <button class="fantasy-button return-btn">Return</button>
    </div>
  `;

  section.querySelector('.return-btn').addEventListener('click', () => {
    window.gameAuth.loadModule('castle');
  });
}

function characterCardHTML(character) {
  const stats = character.stats || {};

  const normalizedStats = {};
  for (const [key, value] of Object.entries(stats)) {
    normalizedStats[key.toLowerCase()] = value;
  }

  // Handle possible typo
  if ('strenght' in normalizedStats && !('strength' in normalizedStats)) {
    normalizedStats.strength = normalizedStats.strenght;
  }

  const strength = normalizedStats.strength || 0;
  const vitality = normalizedStats.vitality || 0;
  const spirit = normalizedStats.spirit || 0;
  const dexterity = normalizedStats.dexterity || 0;
  const intellect = normalizedStats.intellect || 0;

  // Derived
  const hp = vitality * 10;
  const armor = Math.floor(strength * 0.25);
  const resistance = Math.floor(spirit * 0.25);

  const equippedItems = [
    { label: 'Weapon', value: character.equipped_weapon || 'None' },
    { label: 'Armor', value: character.equipped_armor || 'None' },
    { label: 'Helmet', value: character.equipped_helmet || 'None' },
    { label: 'Trinket', value: character.equipped_trinket || 'None' },
    { label: 'Boots', value: character.equipped_boots || 'None' },
    { label: 'Gloves', value: character.equipped_gloves || 'None' },
  ];

  const consumables = character.consumable && character.consumable.length > 0
    ? character.consumable.join(', ')
    : 'None';

  const startingAbilities = character.starting_abilities && character.starting_abilities.length > 0
    ? character.starting_abilities.join(', ')
    : 'None';

  const learnedAbilities = character.learned_abilities && character.learned_abilities.length > 0
    ? character.learned_abilities.join(', ')
    : 'None';

  const raceName = character.race?.name || 'Race';
  const className = character.classes?.name || 'Class';
  const professionName = character.professions?.name || 'Profession';

  return `
    <div class="selection-card">
      <div class="card-art-block">
        <img src="assets/art/characters/${raceName.toLowerCase().replace(/\s+/g, '_')}_${className.toLowerCase().replace(/\s+/g, '_')}.png" 
          alt="Character Art" 
          class="card-art"
          onerror="this.src='assets/art/placeholder.jpg'">
      </div>
      <div class="card-info-block">
        <h3 class="card-name">Lvl ${character.level || 1} ${character.sex || 'Unknown'} ${raceName} ${className}</h3>
        <p class="card-description"><strong>EXP:</strong> ${character.exp || 0}</p>
        <p class="card-description"><strong>Profession:</strong> ${professionName}</p>

        <div class="stats-block">
          <h4>Primary Stats</h4>
          <p>Strength: <span>${strength}</span></p>
          <p>Dexterity: <span>${dexterity}</span></p>
          <p>Vitality: <span>${vitality}</span></p>
          <p>Spirit: <span>${spirit}</span></p>
          <p>Intellect: <span>${intellect}</span></p>
        </div>

        <div class="stats-block">
          <h4>Derived Stats</h4>
          <p>HP: <span>${hp}</span></p>
          <p>Armor: <span>${armor}</span></p>
          <p>Resistance: <span>${resistance}</span></p>
        </div>

        <div class="stats-block">
          <h4>Equipped Items</h4>
          ${equippedItems.map(item => `<p>${item.label}: <span>${item.value}</span></p>`).join('')}
        </div>

        <div class="stats-block">
          <h4>Consumables</h4>
          <p>${consumables}</p>
        </div>

        <div class="abilities-block">
          <h4>Starting Abilities</h4>
          <p>${startingAbilities}</p>
        </div>

        <div class="abilities-block">
          <h4>Learned Abilities</h4>
          <p>${learnedAbilities}</p>
        </div>

        <!-- Future features: talents, detailed ability data -->
      </div>
    </div>
  `;
}

function createParticles() {
  console.log('[PARTICLES] Creating particles in Character Manager...');
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
  console.log(`[MESSAGE] Displaying: ${message}`);
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

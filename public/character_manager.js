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
      <div class="selection-slider mobile-view">
        <div class="slider-container">
          <div class="slider-track">
            ${characters.map(character => `
              <div class="selection-slide">
                ${characterCardHTML(character)}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="slider-controls">
          <button class="slider-btn prev-btn" aria-label="Previous character">&lt;</button>
          <div class="slider-dots">
            ${characters.map((_, idx) => `
              <button class="slider-dot${idx === 0 ? ' active' : ''}" data-slide="${idx}"></button>
            `).join('')}
          </div>
          <button class="slider-btn next-btn" aria-label="Next character">&gt;</button>
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

  // Add error handlers to all character art images
  const characterImages = section.querySelectorAll('.card-art');
  characterImages.forEach(img => {
    img.addEventListener('error', function() {
      this.src = 'assets/art/placeholder.png';
    });
  });

  // Initialize slider for mobile view
  initializeCharacterSlider(section);
}

function characterCardHTML(character) {
  const stats = character.stats || {};

  const normalizedStats = {};
  for (const [key, value] of Object.entries(stats)) {
    normalizedStats[key.toLowerCase()] = value;
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
    // Add consumables as a slot in equipped items
    { label: 'Consumables', value: (character.consumable && character.consumable.length > 0) ? character.consumable.join(', ') : 'None' }
  ];

  const startingAbilities = character.starting_abilities && character.starting_abilities.length > 0
    ? character.starting_abilities.join(', ')
    : 'None';

  const learnedAbilities = character.learned_abilities && character.learned_abilities.length > 0
    ? character.learned_abilities.join(', ')
    : 'None';

  const raceName = character.races?.name || 'Race';
  const className = character.classes?.name || 'Class';
  const professionName = character.professions?.name || 'Profession';

  // Condense EXP and Profession into one line
  const exp = character.exp || 0;

  return `
    <div class="selection-card">
      <div class="card-art-block">
        <img src="assets/art/characters/${raceName.toLowerCase().replace(/\s+/g, '_')}_${className.toLowerCase().replace(/\s+/g, '_')}.png" 
          alt="Character Art" 
          class="card-art">
      </div>
      <div class="card-info-block">
        <h3 class="card-name">Lvl ${character.level || 1} ${character.sex || 'Unknown'} ${raceName} ${className}</h3>
        <p class="card-description"><strong>EXP:</strong> ${exp} &nbsp; <strong>Profession:</strong> ${professionName}</p>
        <div class="stats-block">
          <h4>Stats</h4>
          <p>Strength: <span>${strength}</span></p>
          <p>Dexterity: <span>${dexterity}</span></p>
          <p>Vitality: <span>${vitality}</span></p>
          <p>Spirit: <span>${spirit}</span></p>
          <p>Intellect: <span>${intellect}</span></p>
          <p>HP: <span>${hp}</span></p>
          <p>Armor: <span>${armor}</span></p>
          <p>Resistance: <span>${resistance}</span></p>
        </div>
        <div class="stats-block">
          <h4>Equipped Items</h4>
          ${equippedItems.map(item => `<p>${item.label}: <span>${item.value}</span></p>`).join('')}
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

function initializeCharacterSlider(section) {
  const sliderTrack = section.querySelector('.slider-track');
  const prevBtn = section.querySelector('.prev-btn');
  const nextBtn = section.querySelector('.next-btn');
  const dots = section.querySelectorAll('.slider-dot');
  if (!sliderTrack || !prevBtn || !nextBtn || dots.length === 0) return;

  let currentSlide = 0;
  const totalSlides = dots.length;

  function updateSlider() {
    const translateX = -currentSlide * 100;
    sliderTrack.style.transform = `translateX(${translateX}%)`;
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentSlide);
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

  dots.forEach((dot, idx) => {
    dot.addEventListener('click', () => {
      currentSlide = idx;
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
      if (diff > 0) nextSlide();
      else prevSlide();
    }
  });
}
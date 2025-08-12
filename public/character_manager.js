let _main;
let _apiCall;
let _getCurrentProfile;
let _getCurrentSession;
let _profile;
let _session;

export async function loadModule(main, { apiCall, getCurrentProfile, getCurrentSession }) {
  console.log('[CHAR_MGR] --- Starting loadModule for Character Manager ---');
  _main = main;
  _apiCall = apiCall;
  _getCurrentProfile = getCurrentProfile;
  _getCurrentSession = getCurrentSession;

  _profile = _getCurrentProfile();
  _session = _getCurrentSession();
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
      <div class="selection-slider">
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

  // Add equipment click handlers
  setupEquipmentClickHandlers(section, characters);

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

  // Split stats into two columns of 4 each
  const statsCol1 = [
    { label: 'Strength', value: strength },
    { label: 'Dexterity', value: dexterity },
    { label: 'Vitality', value: vitality },
    { label: 'Spirit', value: spirit }
  ];
  const statsCol2 = [
    { label: 'Intellect', value: intellect },
    { label: 'HP', value: hp },
    { label: 'Armor', value: armor },
    { label: 'Resistance', value: resistance }
  ];

  // Parse equipped items from JSONB column
  const equippedItems = character.equipped_items || {};
  const equipmentData = [
    { label: 'Weapon 1', value: equippedItems.equipped_weapon1 || 'None', slot: 'equipped_weapon1', type: 'weapon' },
    { label: 'Weapon 2', value: equippedItems.equipped_weapon2 || 'None', slot: 'equipped_weapon2', type: 'weapon' },
    { label: 'Armor', value: equippedItems.equipped_armor || 'None', slot: 'equipped_armor', type: 'armor' },
    { label: 'Helmet', value: equippedItems.equipped_helmet || 'None', slot: 'equipped_helmet', type: 'helmet' },
    { label: 'Trinket', value: equippedItems.equipped_trinket || 'None', slot: 'equipped_trinket', type: 'trinket' },
    { label: 'Boots', value: equippedItems.equipped_boots || 'None', slot: 'equipped_boots', type: 'boots' },
    { label: 'Gloves', value: equippedItems.equipped_gloves || 'None', slot: 'equipped_gloves', type: 'gloves' },
    { label: 'Consumable', value: equippedItems.equipped_consumable || 'None', slot: 'equipped_consumable', type: 'consumable' }
  ];

  // Split equipment into two columns
  const equipmentCol1 = equipmentData.slice(0, 4);
  const equipmentCol2 = equipmentData.slice(4, 8);

  const startingAbilities = character.starting_abilities && character.starting_abilities.length > 0
    ? character.starting_abilities.join(', ')
    : 'None';
  const learnedAbilities = character.learned_abilities && character.learned_abilities.length > 0
    ? character.learned_abilities.join(', ')
    : 'None';
  const raceName = character.races?.name || 'Race';
  const className = character.classes?.name || 'Class';
  const professionName = character.professions?.name || 'Profession';
  const exp = character.exp || 0;

  return `
    <div class="selection-card" data-character-id="${character.id}">
      <div class="card-art-block">
        <img src="assets/art/characters/${raceName.toLowerCase().replace(/\s+/g, '_')}_${className.toLowerCase().replace(/\s+/g, '_')}.png" 
          alt="Character Art" 
          class="card-art">
      </div>
      <div class="card-info-block">
        <h3 class="card-name">Lvl ${character.level || 1} ${character.sex || 'Unknown'} ${raceName} ${className}</h3>
        <p class="card-description"><strong>EXP:</strong> ${exp} &nbsp; <strong>Profession:</strong> ${professionName}</p>
        <div class="stats-block condensed-stats">
          <h4>Stats</h4>
          <div class="stats-cols">
            <div>
              ${statsCol1.map(stat => `<p>${stat.label}: <span>${stat.value}</span></p>`).join('')}
            </div>
            <div>
              ${statsCol2.map(stat => `<p>${stat.label}: <span>${stat.value}</span></p>`).join('')}
            </div>
          </div>
        </div>
        <div class="stats-block condensed-items">
          <h4>Equipped Items</h4>
          <div class="items-cols">
            <div>
              ${equipmentCol1.map(item => `
                <p>${item.label}: 
                  <span class="equipment-item" 
                        data-character-id="${character.id}" 
                        data-slot="${item.slot}" 
                        data-type="${item.type}"
                        style="cursor: pointer; color: ${item.value === 'None' ? '#999' : '#4CAF50'}; text-decoration: underline;">
                    ${item.value}
                  </span>
                </p>
              `).join('')}
            </div>
            <div>
              ${equipmentCol2.map(item => `
                <p>${item.label}: 
                  <span class="equipment-item" 
                        data-character-id="${character.id}" 
                        data-slot="${item.slot}" 
                        data-type="${item.type}"
                        style="cursor: pointer; color: ${item.value === 'None' ? '#999' : '#4CAF50'}; text-decoration: underline;">
                    ${item.value}
                  </span>
                </p>
              `).join('')}
            </div>
          </div>
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

function setupEquipmentClickHandlers(section, characters) {
  section.querySelectorAll('.equipment-item').forEach(equipmentEl => {
    equipmentEl.addEventListener('click', async () => {
      const characterId = equipmentEl.dataset.characterId;
      const slot = equipmentEl.dataset.slot;
      const type = equipmentEl.dataset.type;
      
      const character = characters.find(c => c.id == characterId);
      if (!character) return;
      
      await showEquipmentModal(character, slot, type);
    });
  });
}

async function showEquipmentModal(character, slot, type) {
  try {
    // Fetch available items of this type from bank
    const response = await _apiCall(`/api/supabase/rest/v1/bank?player_id=eq.${_profile.id}&type=eq.${type}&select=item,amount,type`);
    const bankItems = await response.json();
    
    console.log('[CHAR_MGR] Available items for type', type, ':', bankItems);
    
    // Get current equipped item
    const currentItem = character.equipped_items?.[slot] || 'None';
    
    const modal = document.createElement('div');
    modal.className = 'custom-message-box';
    modal.innerHTML = `
      <div class="message-content" style="width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto;">
        <h2>Equip ${type.charAt(0).toUpperCase() + type.slice(1)}</h2>
        <p style="margin-bottom: 1rem; color: #ccc;">
          Character: <strong>${character.name || `Lvl ${character.level} ${character.races?.name} ${character.classes?.name}`}</strong><br>
          Current: <strong style="color: ${currentItem === 'None' ? '#999' : '#4CAF50'}">${currentItem}</strong>
        </p>
        
        <!-- None option -->
        <div class="equipment-option ${currentItem === 'None' ? 'selected' : ''}" 
             data-item="none" 
             style="display: flex; align-items: center; gap: 1rem; padding: 0.8rem; margin-bottom: 0.5rem; border: 2px solid ${currentItem === 'None' ? '#4CAF50' : '#444'}; border-radius: 8px; background: rgba(0,0,0,0.2); cursor: pointer;">
          <div style="width: 48px; height: 48px; border: 2px dashed #666; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #666; font-size: 0.8rem;">
            None
          </div>
          <div>
            <strong style="color: #999;">Unequip</strong><br>
            <span style="color: #666; font-size: 0.9rem;">Remove current equipment</span>
          </div>
        </div>
        
        <!-- Available items -->
        ${bankItems.length === 0 
          ? '<p style="color: #999; font-style: italic; text-align: center; padding: 2rem;">No items of this type available in bank</p>'
          : bankItems.map(item => `
            <div class="equipment-option ${item.item === currentItem ? 'selected' : ''}" 
                 data-item="${item.item}"
                 style="display: flex; align-items: center; gap: 1rem; padding: 0.8rem; margin-bottom: 0.5rem; border: 2px solid ${item.item === currentItem ? '#4CAF50' : '#444'}; border-radius: 8px; background: rgba(0,0,0,0.2); cursor: pointer;">
              <img src="assets/art/items/${item.item.toLowerCase().replace(/\s+/g, '_')}.png" 
                   alt="${item.item}" 
                   style="width: 48px; height: 48px; border-radius: 4px;"
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
              <div style="width: 48px; height: 48px; border: 2px solid #666; border-radius: 4px; background: rgba(255,255,255,0.1); display: none; align-items: center; justify-content: center; font-size: 0.7rem; color: #666;">
                ${type.toUpperCase()}
              </div>
              <div>
                <strong style="color: #4CAF50;">${item.item}</strong><br>
                <span style="color: #999; font-size: 0.9rem;">Available: ${item.amount}</span>
              </div>
            </div>
          `).join('')}
        
        <div style="display: flex; justify-content: center; gap: 0.5rem; margin-top: 1.5rem;">
          <button class="fantasy-button cancel-btn" style="flex: 1; max-width: 120px;">Cancel</button>
          <button class="fantasy-button equip-btn" disabled style="flex: 1; max-width: 120px;">Equip</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    let selectedItem = null;
    const equipBtn = modal.querySelector('.equip-btn');
    const cancelBtn = modal.querySelector('.cancel-btn');
    
    // Handle option selection
    modal.querySelectorAll('.equipment-option').forEach(option => {
      option.addEventListener('click', () => {
        // Remove previous selection
        modal.querySelectorAll('.equipment-option').forEach(opt => {
          opt.classList.remove('selected');
          opt.style.border = '2px solid #444';
        });
        
        // Select this option
        option.classList.add('selected');
        option.style.border = '2px solid #4CAF50';
        
        selectedItem = option.dataset.item;
        equipBtn.disabled = false;
        
        // Update button text
        if (selectedItem === 'none') {
          equipBtn.textContent = 'Unequip';
        } else {
          equipBtn.textContent = 'Equip';
        }
      });
    });
    
    // Handle equip button
    equipBtn.addEventListener('click', async () => {
      await equipItem(character, slot, selectedItem === 'none' ? 'none' : selectedItem);
      modal.remove();
      // Refresh the character display
      await fetchAndRenderCharacters();
    });
    
    // Handle cancel button
    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
  } catch (error) {
    console.error('[CHAR_MGR] Error fetching equipment options:', error);
    displayMessage('Failed to load equipment options. Please try again.');
  }
}

async function equipItem(character, slot, itemName) {
  try {
    // Get current equipped items
    const currentEquippedItems = character.equipped_items || {
      equipped_weapon1: "none",
      equipped_weapon2: "none", 
      equipped_armor: "none",
      equipped_helmet: "none",
      equipped_trinket: "none",
      equipped_boots: "none",
      equipped_gloves: "none",
      equipped_consumable: "none"
    };
    
    // Update the specific slot
    const updatedEquippedItems = {
      ...currentEquippedItems,
      [slot]: itemName === 'none' ? 'none' : itemName
    };
    
    console.log('[CHAR_MGR] Updating equipment for character', character.id, ':', updatedEquippedItems);
    
    // Update character's equipped_items in database
    const response = await _apiCall(`/api/supabase/rest/v1/characters?id=eq.${character.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        equipped_items: updatedEquippedItems
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update equipment: ${response.status}`);
    }
    
    console.log('[CHAR_MGR] Equipment updated successfully');
    displayMessage(`Equipment updated successfully!`);
    
  } catch (error) {
    console.error('[CHAR_MGR] Error updating equipment:', error);
    displayMessage('Failed to update equipment. Please try again.');
  }
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

let _main;
let _apiCall;
let _getCurrentProfile;
let _profile;

export async function loadModule(main, { apiCall, getCurrentProfile }) {
  _main = main;
  _apiCall = apiCall;
  _getCurrentProfile = getCurrentProfile;

  _profile = _getCurrentProfile();
  if (!_profile) {
    displayMessage('User profile not found. Please log in again.');
    window.gameAuth.loadModule('god_selection');
    return;
  }

  _main.innerHTML = `
    <div class="main-app-container">
      <div class="particles"></div>
      <div class="character-creation-section"></div>
    </div>
  `;

  createParticles();
  loadCharacterManagerStyles();
  await fetchAndRenderCharacters();
}

async function fetchAndRenderCharacters() {
  try {
    const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=*,races(name),classes(name),professions(name)`);
    const characters = await response.json();

    renderCharacters(characters);
  } catch (error) {
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
      <div class="top-right-buttons">
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
    </div>
    <div class="characters-slider-container">
      <div class="characters-slider" id="charactersSlider">
        ${characters.map(character => characterCardHTML(character)).join('')}
      </div>
    </div>
    <div class="top-right-buttons">
      <button class="fantasy-button return-btn">Return</button>
    </div>
  `;

  section.querySelector('.return-btn').addEventListener('click', () => {
    window.gameAuth.loadModule('castle');
  });

  const characterImages = section.querySelectorAll('.card-art');
  characterImages.forEach(img => {
    img.addEventListener('error', function() {
      this.src = 'assets/art/portraits/placeholder.png';
    });
  });

  setupEquipmentClickHandlers(section, characters);
  setupTalentsClickHandlers(section, characters);
  setupStatsClickHandlers(section, characters);
  setupDragSlider();
}

function characterCardHTML(character) {
  // Use total_stats if available, fallback to base stats
  const stats = character.total_stats || character.stats || {};
  const baseStats = character.stats || {};
  const normalizedStats = {};
  const normalizedBaseStats = {};
  
  for (const [key, value] of Object.entries(stats)) {
    normalizedStats[key.toLowerCase()] = value;
  }
  for (const [key, value] of Object.entries(baseStats)) {
    normalizedBaseStats[key.toLowerCase()] = value;
  }
  
  const strength = normalizedStats.strength || 0;
  const vitality = normalizedStats.vitality || 0;
  const spirit = normalizedStats.spirit || 0;
  const dexterity = normalizedStats.dexterity || 0;
  const intellect = normalizedStats.intellect || 0;
  const armor = normalizedStats.armor || 0;
  const resistance = normalizedStats.resistance || 0;
  const hp = vitality * 10;

  // Reorganized stats for two rows
  const statsData = [
    // First row
    { label: 'HP', shortLabel: 'HP', value: hp, baseValue: (normalizedBaseStats.vitality || 0) * 10 },
    { label: 'Strength', shortLabel: 'STR', value: strength, baseValue: normalizedBaseStats.strength || 0 },
    { label: 'Intellect', shortLabel: 'INT', value: intellect, baseValue: normalizedBaseStats.intellect || 0 },
    { label: 'Armor', shortLabel: 'ARM', value: armor, baseValue: normalizedBaseStats.armor || 0 },
    // Second row
    { label: 'Vitality', shortLabel: 'VIT', value: vitality, baseValue: normalizedBaseStats.vitality || 0 },
    { label: 'Dexterity', shortLabel: 'DEX', value: dexterity, baseValue: normalizedBaseStats.dexterity || 0 },
    { label: 'Spirit', shortLabel: 'SPI', value: spirit, baseValue: normalizedBaseStats.spirit || 0 },
    { label: 'Resistance', shortLabel: 'RES', value: resistance, baseValue: normalizedBaseStats.resistance || 0 }
  ];

  const equippedItems = character.equipped_items || {};
  // Equipment slots arranged in 3 rows of 4
  const equipmentData = [
    // Row 1
    { label: 'Weapon', slot: 'equipped_weapon', type: 'Weapon', value: equippedItems.equipped_weapon || null },
    { label: 'Offhand', slot: 'equipped_offhand', type: 'Offhand', value: equippedItems.equipped_offhand || null },
    { label: 'Armor', slot: 'equipped_armor', type: 'Armor', value: equippedItems.equipped_armor || null },
    { label: 'Helmet', slot: 'equipped_helmet', type: 'Helmet', value: equippedItems.equipped_helmet || null },
    // Row 2
    { label: 'Trinket', slot: 'equipped_trinket', type: 'Trinket', value: equippedItems.equipped_trinket || null },
    { label: 'Boots', slot: 'equipped_boots', type: 'Boots', value: equippedItems.equipped_boots || null },
    { label: 'Gloves', slot: 'equipped_gloves', type: 'Gloves', value: equippedItems.equipped_gloves || null },
    { label: 'Tool', slot: 'equipped_tool', type: 'Tool', value: equippedItems.equipped_tool || null },
    // Row 3
    { label: 'Consumable', slot: 'equipped_consumable', type: 'Consumable', value: equippedItems.equipped_consumable || null },
    { label: 'Amulet', slot: 'equipped_amulet', type: 'Amulet', value: equippedItems.equipped_amulet || null },
    { label: 'Ring1', slot: 'equipped_ring1', type: 'Ring', value: equippedItems.equipped_ring1 || null },
    { label: 'Ring2', slot: 'equipped_ring2', type: 'Ring', value: equippedItems.equipped_ring2 || null }
  ];

  const raceName = character.races?.name || 'Race';
  const className = character.classes?.name || 'Class';
  const professionName = character.professions?.name || 'Profession';
  const exp = character.exp || 0;

  return `
    <div class="character-card" data-character-id="${character.id}">
      <div class="card-top-row">
        <div class="card-portrait">
          <img src="assets/art/portraits/${character.portrait}.png" class="card-art">
        </div>
        <div class="card-info">
          <h3 class="card-name">Lvl ${character.level || 1}</h3>
          <p class="card-race-class">${raceName} ${className}</p>
          <p class="card-profession">${professionName}</p>
          <p class="card-exp">EXP: ${exp}</p>
        </div>
      </div>
      
      <div class="stats-items-container">
        <div class="equipment-section">
          <h4>Equipment and Stats</h4>
          <div class="equipment-grid">
            ${equipmentData.map(item => {
              const isEquipped = item.value !== null;
              const rarityClass = isEquipped ? getGearRarity(item.value) : '';
              const iconPath = isEquipped ? getItemIcon({ item: item.value }, item.value, item.type) : null;
              
              return `
                <div class="equipment-slot">
                  <div class="equipment-icon ${rarityClass}" 
                       data-character-id="${character.id}" 
                       data-slot="${item.slot}" 
                       data-type="${item.type}"
                       style="cursor: pointer;" 
                       title="${item.label}${isEquipped ? ': ' + item.value : ''}">
                    ${isEquipped ? `
                      <img src="${iconPath}" alt="${item.value}" 
                          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                      <div class="equipment-placeholder">${item.type.substring(0, 3)}</div>
                    ` : `
                      <div class="equipment-placeholder empty">${item.type.substring(0, 3)}</div>
                    `}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <div class="stats-section">
          <div class="stats-grid">
            ${statsData.map(stat => `
              <div class="stat-item">
                <span class="stat-label">${stat.shortLabel}:</span>
                <span class="stat-value" 
                      data-character-id="${character.id}" 
                      data-stat-name="${stat.label}" 
                      data-total-value="${stat.value}"
                      data-base-value="${stat.baseValue}"
                      style="cursor: pointer;">
                  ${stat.value}
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function setupDragSlider() {
  const slider = _main.querySelector('#charactersSlider');
  if (!slider) return;

  const cards = slider.querySelectorAll('.character-card');
  if (cards.length === 0) return;

  let currentIndex = 0;
  let isDragging = false;
  let startX = 0;
  let currentX = 0;
  let scrollLeft = 0;
  const dragThreshold = 50;
  let animationId = null;

  function getCardWidth() {
    const containerWidth = slider.offsetWidth;
    const gap = 16;
    return containerWidth - gap;
  }
  
  function snapToCard(index, immediate = false) {
    const cardWidth = getCardWidth();
    const targetScroll = index * cardWidth;
    
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    
    if (immediate) {
      slider.scrollLeft = targetScroll;
    } else {
      slider.style.scrollBehavior = 'smooth';
      slider.scrollLeft = targetScroll;
      
      setTimeout(() => {
        slider.style.scrollBehavior = 'auto';
      }, 300);
    }
    
    currentIndex = Math.max(0, Math.min(index, cards.length - 1));
  }

  function handleStart(clientX) {
    isDragging = true;
    startX = clientX;
    currentX = clientX;
    scrollLeft = slider.scrollLeft;
    slider.style.cursor = 'grabbing';
    slider.style.scrollBehavior = 'auto';
    
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function handleMove(clientX) {
    if (!isDragging) return;
    
    const deltaX = clientX - startX;
    const newScrollLeft = scrollLeft - deltaX;
    const maxScroll = slider.scrollWidth - slider.clientWidth;
    const constrainedScroll = Math.max(0, Math.min(newScrollLeft, maxScroll));
    
    slider.scrollLeft = constrainedScroll;
    currentX = clientX;
  }

  function handleEnd() {
    if (!isDragging) return;
    
    isDragging = false;
    slider.style.cursor = 'grab';
    
    const dragDistance = currentX - startX;
    const cardWidth = getCardWidth();
    const currentScroll = slider.scrollLeft;
    let targetIndex = Math.round(currentScroll / cardWidth);
    
    if (Math.abs(dragDistance) > dragThreshold) {
      if (dragDistance > 0 && currentIndex > 0) {
        targetIndex = currentIndex - 1;
      } else if (dragDistance < 0 && currentIndex < cards.length - 1) {
        targetIndex = currentIndex + 1;
      }
    }
    
    targetIndex = Math.max(0, Math.min(targetIndex, cards.length - 1));
    snapToCard(targetIndex);
  }

  // Mouse events
  slider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handleStart(e.clientX);
  });

  slider.addEventListener('mousemove', (e) => {
    handleMove(e.clientX);
  });

  slider.addEventListener('mouseup', handleEnd);
  slider.addEventListener('mouseleave', handleEnd);

  // Touch events
  slider.addEventListener('touchstart', (e) => {
    handleStart(e.touches[0].clientX);
  }, { passive: true });

  slider.addEventListener('touchmove', (e) => {
    handleMove(e.touches[0].clientX);
  }, { passive: true });

  slider.addEventListener('touchend', handleEnd, { passive: true });

  // Keyboard navigation
  slider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && currentIndex > 0) {
      e.preventDefault();
      snapToCard(currentIndex - 1);
    } else if (e.key === 'ArrowRight' && currentIndex < cards.length - 1) {
      e.preventDefault();
      snapToCard(currentIndex + 1);
    }
  });

  slider.tabIndex = 0;

  // Handle window resize
  window.addEventListener('resize', () => {
    snapToCard(currentIndex, true);
  });

  // Initialize slider
  slider.style.cursor = 'grab';
  requestAnimationFrame(() => {
    snapToCard(0, true);
  });
}

function setupEquipmentClickHandlers(section, characters) {
  section.querySelectorAll('.equipment-icon').forEach(equipmentEl => {
    equipmentEl.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const characterId = equipmentEl.dataset.characterId;
      const slot = equipmentEl.dataset.slot;
      const type = equipmentEl.dataset.type;
      
      const character = characters.find(c => c.id == characterId);
      if (!character) return;
      
      await showEquipmentModal(character, slot, type);
    });
  });
}

function setupTalentsClickHandlers(section, characters) {
  section.querySelectorAll('.talents-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      displayMessage('Talents system coming soon!');
    });
  });
}

function setupStatsClickHandlers(section, characters) {
  section.querySelectorAll('.stat-value').forEach(statEl => {
    statEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const characterId = statEl.dataset.characterId;
      const statName = statEl.dataset.statName;
      const totalValue = parseInt(statEl.dataset.totalValue);
      const baseValue = parseInt(statEl.dataset.baseValue);
      const itemBonus = totalValue - baseValue;
      
      const character = characters.find(c => c.id == characterId);
      if (!character) return;
      
      showStatsBreakdown(character, statName, baseValue, itemBonus, totalValue);
    });
  });
}

function getItemIcon(item, itemName, itemType) {
  const gearTypes = ['Armor', 'Boots', 'Gloves', 'Helmet', 'Weapon', 'Offhand'];
  
  if (gearTypes.includes(itemType)) {
    return getGearIconPath(itemName);
  }
  
  const spriteName = itemName.replace(/\s+/g, '');
  return `assets/art/recipes/${spriteName}.png`;
}

function getGearIconPath(itemName) {
  let baseName = itemName;
  baseName = baseName.replace(/^(Basic|Uncommon|Rare|Epic|Legendary)\s+/i, '');
  baseName = baseName.replace(/\s+of\s+(the\s+)?.*$/i, '');
  const spriteName = baseName.replace(/\s+/g, '');
  return `assets/art/items/${spriteName}.png`;
}

async function showEquipmentModal(character, slot, type) {
  try {
    let availableItems = [];
    
    if (type === 'Consumable' || type === 'Tool') {
      const response = await _apiCall(`/api/supabase/rest/v1/bank?player_id=eq.${_profile.id}&type=eq.${type}&select=item,amount,type`);
      const bankItems = await response.json();
      availableItems = bankItems.filter(item => item.amount > 0);
    } else {
      const response = await _apiCall(`/api/supabase/rest/v1/craft_sessions?player_id=eq.${_profile.id}&type=eq.${type}&equipped_by=is.null&select=id,result,type,result_stats`);
      const craftedItems = await response.json();
      availableItems = craftedItems.map(item => ({
        id: item.id,
        item: item.result,
        type: item.type,
        stats: item.result_stats,
        crafting_session_id: item.id
      }));
    }
    
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
        
        ${availableItems.length === 0 
          ? '<p style="color: #999; font-style: italic; text-align: center; padding: 2rem;">No items of this type available</p>'
          : availableItems.map(item => {
              const isConsumable = type === 'Consumable';
              const isTool = type === 'Tool';
              const isAvailable = (isConsumable || isTool) ? item.amount > 0 : true;
              const itemName = item.item || item.result;
              
              return `
                <div class="equipment-option ${itemName === currentItem ? 'selected' : ''}" 
                     data-item="${itemName}"
                     data-crafting-session-id="${item.crafting_session_id || ''}"
                     data-is-consumable="${isConsumable}"
                     data-is-tool="${isTool}"
                     ${!isAvailable ? 'data-disabled="true"' : ''}
                     style="display: flex; align-items: center; gap: 1rem; padding: 0.8rem; margin-bottom: 0.5rem; border: 2px solid ${itemName === currentItem ? '#4CAF50' : '#444'}; border-radius: 8px; background: rgba(0,0,0,0.2); cursor: ${!isAvailable ? 'not-allowed' : 'pointer'}; opacity: ${!isAvailable ? '0.5' : '1'};">
                  <img src="${getItemIcon(item, itemName, type)}"
                    style="width: 48px; height: 48px; border-radius: 4px;"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                  <div style="width: 48px; height: 48px; border: 2px solid #666; border-radius: 4px; background: rgba(255,255,255,0.1); display: none; align-items: center; justify-content: center; font-size: 0.7rem; color: #666;">
                    ${type.toUpperCase()}
                  </div>
                  <div style="flex: 1;">
                    <strong style="color: #4CAF50;">${itemName}</strong>
                    ${(isConsumable || isTool) ? `<br><span style="color: #999; font-size: 0.8rem;">Qty: ${item.amount}</span>` : ''}
                    ${item.stats ? `<br><span style="color: #b8b3a8; font-size: 0.8rem;">${Object.entries(item.stats).map(([key, value]) => `${key}: ${value}`).join(', ')}</span>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
        
        <div style="display: flex; justify-content: center; gap: 0.5rem; margin-top: 1.5rem;">
          <button class="fantasy-button cancel-btn" style="flex: 1; max-width: 120px;">Cancel</button>
          <button class="fantasy-button equip-btn" disabled style="flex: 1; max-width: 120px;">Equip</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    let selectedItem = null;
    let selectedCraftingSessionId = null;
    let isConsumable = false;
    const equipBtn = modal.querySelector('.equip-btn');
    const cancelBtn = modal.querySelector('.cancel-btn');
    
    modal.querySelectorAll('.equipment-option').forEach(option => {
      if (option.dataset.disabled === 'true') {
        return;
      }
      
      option.addEventListener('click', () => {
        modal.querySelectorAll('.equipment-option').forEach(opt => {
          opt.classList.remove('selected');
          opt.style.border = '2px solid #444';
        });
        
        option.classList.add('selected');
        option.style.border = '2px solid #4CAF50';
        
        selectedItem = option.dataset.item;
        selectedCraftingSessionId = option.dataset.craftingSessionId || null;
        isConsumable = option.dataset.isConsumable === 'true';
        const isTool = option.dataset.isTool === 'true';
        
        equipBtn.disabled = false;
        equipBtn.textContent = selectedItem === 'none' ? 'Unequip' : 'Equip';
      });
    });
    
    equipBtn.addEventListener('click', async () => {
      const originalText = equipBtn.textContent;
      equipBtn.disabled = true;
      equipBtn.textContent = 'Processing...';
      
      try {
        const selectedOption = modal.querySelector('.equipment-option.selected');
        const isToolSelected = selectedOption ? selectedOption.dataset.isTool === 'true' : false;
        
        await equipItem(character, slot, selectedItem === 'none' ? 'none' : selectedItem, selectedCraftingSessionId, isConsumable || isToolSelected);
        modal.remove();
        await fetchAndRenderCharacters();
      } catch (error) {
        equipBtn.disabled = false;
        equipBtn.textContent = originalText;
      }
    });
    
    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
  } catch (error) {
    displayMessage('Failed to load equipment options. Please try again.');
  }
}

function getGearRarity(itemName) {
  const match = itemName.match(/^(Basic|Uncommon|Rare|Epic|Legendary)\s+/i);
  if (!match) return '';
  return `rarity-${match[1].toLowerCase()}`;
}

async function equipItem(character, slot, itemName, craftingSessionId = null, isConsumable = false) {
  try {
    const response = await _apiCall('/api/supabase/functions/v1/equip_item', {
      method: 'POST',
      body: {
        character_id: character.id,
        slot: slot,
        item_name: itemName === 'none' ? null : itemName,
        player_id: _profile.id,
        crafting_session_id: craftingSessionId,
        is_consumable: isConsumable
      }
    });
    
    if (!response.ok) {
      const errorResult = await response.json();
      throw new Error(errorResult.error || 'Failed to equip item');
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to equip item');
    }
    
    displayMessage(result.message);
    
  } catch (error) {
    displayMessage(error.message || 'Failed to update equipment. Please try again.');
  }
}

function showStatsBreakdown(character, statName, baseValue, itemBonus, totalValue) {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 90%; max-width: 400px;">
      <h2>${statName} Breakdown</h2>
      <p style="margin-bottom: 1rem; color: #ccc;">
        Character: <strong>${character.name || `Lvl ${character.level} ${character.races?.name} ${character.classes?.name}`}</strong>
      </p>
      
      <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <span>Base ${statName}:</span>
          <span style="color: #4CAF50;">${baseValue}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <span>Item Bonus:</span>
          <span style="color: ${itemBonus > 0 ? '#4CAF50' : '#999'};">+${itemBonus}</span>
        </div>
        <hr style="border: 1px solid rgba(196,151,90,0.3); margin: 0.5rem 0;">
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>Total ${statName}:</span>
          <span style="color: #c4975a;">${totalValue}</span>
        </div>
      </div>
      
      <div style="display: flex; justify-content: center;">
        <button class="fantasy-button close-btn" style="max-width: 120px;">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const closeBtn = modal.querySelector('.close-btn');
  closeBtn.addEventListener('click', () => {
    modal.remove();
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
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

function loadCharacterManagerStyles() {
    if (document.getElementById('character-manager-styles')) {
        return;
    }

    const styleEl = document.createElement('style');
    styleEl.id = 'character-manager-styles';
    styleEl.textContent = `
.character-creation-section {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    padding: 0;
    position: relative;
    z-index: 2;
    background: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(10px);
    overflow: hidden;
}

.character-creation-section .subtitle {
    font-size: 0.9rem;
    color: #b8b3a8;
}

.characters-slider-container {
    flex: 1;
    width: 100%;
    overflow: hidden;
    position: relative;
    display: flex;
    align-items: center;
}

.characters-slider {
    width: 100%;
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: auto;
    scrollbar-width: none;
    scroll-snap-type: x mandatory;
    -ms-overflow-style: none;
    user-select: none;
    padding: 1rem;
    box-sizing: border-box;
}

.characters-slider::-webkit-scrollbar {
    display: none;
}

.character-card {
    background: linear-gradient(145deg, rgba(29,20,12,0.95), rgba(42,31,22,0.9));
    border: 2px solid #c4975a;
    border-radius: 12px;
    overflow: hidden;
    transition: all 0.3s;
    backdrop-filter: blur(3px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    padding: 1rem;
    min-width: calc(100vw - 2rem);
    max-width: calc(100vw - 2rem);
    scroll-snap-align: center;
    flex-shrink: 0;
    user-select: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: calc(100vh - 4rem);
    box-sizing: border-box;
}

.card-top-row {
    display: flex;
    gap: 1rem;
    flex-shrink: 0;
}

.card-portrait {
    width: 100px;
    height: 100px;
    overflow: hidden;
    border-radius: 8px;
    background: rgba(0,0,0,0.3);
    border: 2px solid rgba(196, 151, 90, 0.3);
    flex-shrink: 0;
}

.card-art {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
    pointer-events: none;
}

.card-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.3rem;
}

.card-name {
    font-family: 'Cinzel', serif;
    font-size: 1.1rem;
    font-weight: 600;
    color: #c4975a;
    margin: 0;
    text-shadow: 1px 1px 0px #3d2914;
    letter-spacing: 1px;
}

.card-race-class {
    font-size: 0.9rem;
    color: #b8b3a8;
    font-weight: 500;
    margin: 0;
}

.card-profession {
    font-size: 0.8rem;
    color: #9a8f7e;
    font-style: italic;
    margin: 0;
}

.card-exp {
    font-size: 0.75rem;
    color: #8a7f6e;
    margin: 0;
}

.stats-items-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    flex: 1;
    overflow-y: auto;
}

.stats-section {
    flex: 0 0 30%;
    min-height: 0;
    margin: auto;
}

.equipment-section h4, .stats-section h4 {
    font-family: 'Cinzel', serif;
    color: #c4975a;
    font-size: 0.9rem;
    text-align: center;
    font-weight: 600;
    padding-bottom: 0.3rem;
}

.equipment-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(3, 1fr);
    height: 100%;
    padding: 0.5rem;
}

.equipment-slot {
    display: flex;
    align-items: center;
    justify-content: center;
}

.equipment-icon {
    width: 60px;
    height: 60px;
    position: relative;
    border-radius: 4px;
    border: 2px solid rgba(196, 151, 90, 0.3);
    background: rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
}

.equipment-icon:hover {
    border-color: rgba(196, 151, 90, 0.6);
    background: rgba(196, 151, 90, 0.1);
}

.equipment-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 2px;
}

.equipment-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6rem;
    color: #666;
    background: transparent;
    text-transform: uppercase;
    font-weight: bold;
}

.equipment-placeholder.empty {
    color: #444;
}

.equipment-icon.rarity-uncommon { border-color: #1eff00; }
.equipment-icon.rarity-rare { border-color: #0070dd; }
.equipment-icon.rarity-epic { border-color: #a335ee; }
.equipment-icon.rarity-legendary { border-color: #ff8000; }

.stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 0.6rem;
    padding: 0.5rem;
    height: 100%;
}

.stat-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(196, 151, 90, 0.2);
    border-radius: 6px;
    padding: 0.4rem;
    text-align: center;
    gap: 11px;
}

.stat-label {
    font-size: 0.8rem;
    color: #c4975a;
    font-weight: 600;
    text-transform: uppercase;
}

.stat-value {
    font-size: 0.8rem;
    color: #4CAF50;
    font-weight: bold;
}
`;
    document.head.appendChild(styleEl);
    console.log('Character Manager styles loaded successfully');
}
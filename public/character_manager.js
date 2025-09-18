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
      <div id="spellbookOverlay" class="spellbook-overlay" style="display: none;">
        <div class="spellbook-stage">
          <div class="spellbook">
            <button class="spellbook-close-btn">✕</button>
            <div class="spellbook-inner">
              <div class="spellbook-spine"></div>
              <section class="spellbook-page">
                <header class="spellbook-header">
                  <div class="spellbook-title">Spell Grimoire</div>
                </header>
                <div class="spellbook-filters" id="spellFilters"></div>
                <div id="selectedSpellArea" style="margin-top:14px; color:#2b1c0c;">
                  <div style="font-weight:800;">Selected:</div>
                  <div id="selectedSpellText" style="margin-top:4px; opacity:.8">None</div>
                </div>
              </section>
              <section class="spellbook-page">
                <header class="spellbook-header">
                  <div class="spellbook-title">Available Spells</div>
                </header>
                <div class="spells-grid" id="spellsGrid"></div>
              </section>
            </div>
          </div>
        </div>
      </div>
      <div id="spellTooltip" class="spell-tooltip" style="display: none;"></div>
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
  setupSpellbookHandlers(section, characters);
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

  const statsData = [
    { label: 'Strength', value: strength },
    { label: 'Dexterity', value: dexterity },
    { label: 'Vitality', value: vitality },
    { label: 'Spirit', value: spirit },
    { label: 'Intellect', value: intellect },
    { label: 'HP', value: hp },
    { label: 'Armor', value: armor },
    { label: 'Resistance', value: resistance }
  ];

  const equippedItems = character.equipped_items || {};
  const equipmentData = [
  { label: 'Weapon', value: equippedItems.equipped_weapon || 'None', slot: 'equipped_weapon', type: 'Weapon' },
  { label: 'Offhand', value: equippedItems.equipped_offhand || 'None', slot: 'equipped_offhand', type: 'Offhand' },
  { label: 'Armor', value: equippedItems.equipped_armor || 'None', slot: 'equipped_armor', type: 'Armor' },
  { label: 'Helmet', value: equippedItems.equipped_helmet || 'None', slot: 'equipped_helmet', type: 'Helmet' },
  { label: 'Trinket', value: equippedItems.equipped_trinket || 'None', slot: 'equipped_trinket', type: 'Trinket' },
  { label: 'Boots', value: equippedItems.equipped_boots || 'None', slot: 'equipped_boots', type: 'Boots' },
  { label: 'Gloves', value: equippedItems.equipped_gloves || 'None', slot: 'equipped_gloves', type: 'Gloves' },
  { label: 'Tool', value: equippedItems.equipped_tool || 'None', slot: 'equipped_tool', type: 'Tool' },
  { label: 'Consumable', value: equippedItems.equipped_consumable || 'None', slot: 'equipped_consumable', type: 'Consumable' }
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
        <div class="equipment-block">
          <h4>Equipped Items</h4>
          <div class="items-list">
            ${equipmentData.map(item => {
            const isEquipped = item.value !== 'None';
            const rarityClass = isEquipped ? getGearRarity(item.value) : '';
            const iconPath = isEquipped ? getItemIcon({ item: item.value }, item.value, item.type) : null;
            
            return `
              <div class="equipment-row">
                <div class="equipment-icon ${rarityClass}">
                  ${isEquipped ? `
                    <img src="${iconPath}" alt="${item.value}" 
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="equipment-placeholder">${item.type.substring(0, 2)}</div>
                  ` : `
                    <div class="equipment-placeholder empty">${item.type.substring(0, 2)}</div>
                  `}
                </div>
                <span class="equipment-item" 
                      data-character-id="${character.id}" 
                      data-slot="${item.slot}" 
                      data-type="${item.type}"
                      style="cursor: pointer; color: ${item.value === 'None' ? '#999' : '#4CAF50'}; text-decoration: underline;">
                  ${item.value}
                </span>
              </div>
            `;
          }).join('')}
          </div>
        </div>
        
        <div class="stats-block">
          <h4>Stats</h4>
          <div class="stats-list">
            ${statsData.map(stat => `
              <p>
                ${stat.label}: 
                <span class="stat-value" 
                      data-character-id="${character.id}" 
                      data-stat-name="${stat.label}" 
                      data-total-value="${stat.value}"
                      data-base-value="${stat.label === 'HP' ? (normalizedBaseStats.vitality || 0) * 10 : 
                                        normalizedBaseStats[stat.label.toLowerCase()] || 0}"
                      style="cursor: pointer; text-decoration: underline;">
                  ${stat.value}
                </span>
              </p>
            `).join('')}
          </div>
        </div>
      </div>
      
      <div class="character-actions">
        <button class="fantasy-button spellbook-btn" data-character-id="${character.id}">
          Spellbook
        </button>
        <button class="fantasy-button talents-btn" data-character-id="${character.id}">
          Talents
        </button>
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
  let dragThreshold = 50;
  let animationId = null;

  function getCardWidth() {
    const containerWidth = slider.offsetWidth;
    const gap = 16; // Fixed gap for mobile
    return containerWidth - gap;
  }
  
  function snapToCard(index, immediate = false) {
    const cardWidth = getCardWidth();
    const targetScroll = index * cardWidth;
    
    // Cancel any existing animation
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    
    if (immediate) {
      slider.scrollLeft = targetScroll;
    } else {
      // Use smooth scrolling
      slider.style.scrollBehavior = 'smooth';
      slider.scrollLeft = targetScroll;
      
      // Reset scroll behavior after animation
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
    
    // Cancel any existing animation
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function handleMove(clientX) {
    if (!isDragging) return;
    
    const deltaX = clientX - startX;
    const newScrollLeft = scrollLeft - deltaX;
    
    // Constrain scrolling within bounds
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
    const nearestIndex = Math.round(currentScroll / cardWidth);
    
    // Determine target index based on drag distance and threshold
    let targetIndex = nearestIndex;
    
    if (Math.abs(dragDistance) > dragThreshold) {
      if (dragDistance > 0 && currentIndex > 0) {
        targetIndex = currentIndex - 1;
      } else if (dragDistance < 0 && currentIndex < cards.length - 1) {
        targetIndex = currentIndex + 1;
      }
    }
    
    // Ensure target index is within bounds
    targetIndex = Math.max(0, Math.min(targetIndex, cards.length - 1));
    
    // Snap to the determined index
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
  // Use requestAnimationFrame to ensure DOM is ready
  requestAnimationFrame(() => {
    snapToCard(0, true);
  });
}

function setupEquipmentClickHandlers(section, characters) {
  section.querySelectorAll('.equipment-item').forEach(equipmentEl => {
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

function setupSpellbookHandlers(section, characters) {
  section.querySelectorAll('.spellbook-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const characterId = btn.dataset.characterId;
      const character = characters.find(c => c.id == characterId);
      if (character) {
        await openSpellbook(character);
      }
    });
  });

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
  // Define all gear types that should use gear icon logic
  const gearTypes = ['Armor', 'Boots', 'Gloves', 'Helmet', 'Weapon', 'Offhand'];
  
  // If item is crafted gear, use gear icon logic
  if (gearTypes.includes(itemType)) {
    return getGearIconPath(itemName);
  }
  
  // For consumables and tools, use recipe-based path
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

async function openSpellbook(character) {
  try {
    let characterSpells = [];
    if (character.starting_abilities && character.starting_abilities.length > 0) {
      const spellNames = character.starting_abilities.map(name => `"${name}"`).join(',');
      const response = await _apiCall(`/api/supabase/rest/v1/spells?name=in.(${spellNames})`);
      characterSpells = await response.json();
    }
    
    const overlay = _main.querySelector('#spellbookOverlay');
    const spellsGrid = _main.querySelector('#spellsGrid');
    
    spellsGrid.innerHTML = '';
    if (characterSpells.length === 0) {
      spellsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 2rem;">No spells available</div>';
    } else {
      characterSpells.forEach(spell => {
        const spellCard = document.createElement('button');
        spellCard.className = 'spell-card';
        spellCard.innerHTML = `
          <div class="spell-icon">${spell.sprite || '✨'}</div>
          <div class="spell-badge">Spell</div>
        `;
        spellCard.addEventListener('click', () => selectSpell(spell, spellCard));
        spellCard.addEventListener('mouseenter', (e) => showSpellTooltip(e, spell));
        spellCard.addEventListener('mouseleave', hideSpellTooltip);
        spellCard.addEventListener('mousemove', positionSpellTooltip);
        spellsGrid.appendChild(spellCard);
      });
    }
    
    overlay.style.display = 'flex';
    
    const closeBtn = _main.querySelector('.spellbook-close-btn');
    closeBtn.onclick = () => {
      overlay.style.display = 'none';
    };
    
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
      }
    };
    
  } catch (error) {
    displayMessage('Failed to load spellbook. Please try again.');
  }
}

function selectSpell(spell, element) {
  const selectedText = _main.querySelector('#selectedSpellText');
  selectedText.textContent = `${spell.name} — ${spell.description ? spell.description.substring(0, 50) + '...' : 'No description'}`;
  
  element.style.transform = 'scale(1.05)';
  element.style.border = '2px solid #c4975a';
  
  setTimeout(() => {
    element.style.transform = '';
    element.style.border = '';
  }, 200);
}

function showSpellTooltip(e, spell) {
  const tooltip = _main.querySelector('#spellTooltip');
  tooltip.innerHTML = `
    <div class="tooltip-name">${spell.name}</div>
    <div class="tooltip-desc">${spell.description || 'No description available'}</div>
    ${spell.cooldown ? `<div class="tooltip-cooldown">Cooldown: ${spell.cooldown}s</div>` : ''}
  `;
  tooltip.style.display = 'block';
  positionSpellTooltip(e);
}

function hideSpellTooltip() {
  const tooltip = _main.querySelector('#spellTooltip');
  tooltip.style.display = 'none';
}

function positionSpellTooltip(e) {
  const tooltip = _main.querySelector('#spellTooltip');
  tooltip.style.left = e.clientX + 10 + 'px';
  tooltip.style.top = e.clientY - 10 + 'px';
}

async function showEquipmentModal(character, slot, type) {
  try {
    let availableItems = [];
    
    // Fetch items based on type
  if (type === 'Consumable' || type === 'Tool') {
    // Consumables and Tools come from bank
    const response = await _apiCall(`/api/supabase/rest/v1/bank?player_id=eq.${_profile.id}&type=eq.${type}&select=item,amount,type`);
    const bankItems = await response.json();
    availableItems = bankItems.filter(item => item.amount > 0);
  } else {
    // All other gear comes from craft_sessions
    const response = await _apiCall(`/api/supabase/rest/v1/craft_sessions?player_id=eq.${_profile.id}&type=eq.${type}&equipped_by=is.null&select=id,result,type,result_stats`);
    const craftedItems = await response.json();
    // Transform craft_sessions data to match expected format
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
                  <img src="assets/art/recipes/${itemName.replace(/\s+/g, '')}.png"
                    style="width: 48px; height: 48px; border-radius: 4px;"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
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
        const isTool = option.dataset.isTool === 'true'; // Declare isTool here
        
        equipBtn.disabled = false; // Enable the equip button
        
        if (selectedItem === 'none') {
          equipBtn.textContent = 'Unequip';
        } else {
          equipBtn.textContent = 'Equip';
        }
      });
    });
    
    equipBtn.addEventListener('click', async () => {
      const originalText = equipBtn.textContent;
      equipBtn.disabled = true;
      equipBtn.textContent = 'Processing...';
      
      try {
        // Get the isTool value from the selected option
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
    // Check if styles are already loaded to prevent duplicates
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
    height: calc(100vh - 6rem);
    box-sizing: border-box;
}

.card-top-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
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
    gap: 1rem;
    margin-bottom: 1rem;
    flex: 1;
    overflow-y: auto;
}

.stats-block {
    flex: 1;
    width: 25%;
}

.equipment-block,  {
    flex: 1;
    width: 75%;
}

.equipment-block h4, .stats-block h4 {
    font-family: 'Cinzel', serif;
    color: #c4975a;
    font-size: 0.9rem;
    margin-bottom: 0.8rem;
    text-align: center;
    font-weight: 600;
    border-bottom: 1px solid rgba(196, 151, 90, 0.2);
    padding-bottom: 0.3rem;
}

.stats-list {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.items-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.2rem;
}

.items-list p, .stats-list p {
    color: #c4975a;
    font-size: 0.75rem;
    display: flex;
    justify-content: space-between;
    margin: 0;
    padding: 0.2rem 0;
    min-height: 20px;
    align-items: center;
}

.stats-list p span {
    color: #c4975a;
    font-weight: bold;
}

.equipment-item {
    transition: color 0.2s ease;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
}

.character-actions {
    display: flex;
    gap: 0.8rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(196, 151, 90, 0.2);
    flex-shrink: 0;
}

.character-actions .fantasy-button {
    flex: 1;
    padding: 0.8rem 1rem;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 44px;
}

.spellbook-overlay {
    position: fixed;
    inset: 0;
    background: radial-gradient(1200px 800px at 50% -10%, rgba(110,195,255,.12), rgba(0,0,0,.76) 40%, rgba(0,0,0,.86));
    backdrop-filter: blur(2px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    box-sizing: border-box;
}

.spellbook-stage {
    position: relative;
    perspective: 1600px;
    width: 100%;
    max-width: 900px;
}

.spellbook {
    width: 100%;
    height: min(560px, 78vh);
    border-radius: 18px;
    transform-style: preserve-3d;
    box-shadow: 0 30px 100px rgba(0,0,0,.55);
    position: relative;
    background: linear-gradient(180deg, #7a5d2a, #5b4218);
    padding: 14px;
    box-sizing: border-box;
}

.spellbook::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 18px;
    background: repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 2px, rgba(0,0,0,.06) 2px 4px);
    mix-blend-mode: soft-light;
    pointer-events: none;
}

.spellbook-inner {
    position: absolute;
    inset: 14px;
    border-radius: 12px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    background: linear-gradient(90deg, #e9ddc6 0 50%, #d2c6a8 50% 100%);
    overflow: hidden;
}

.spellbook-spine {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(50% - 1px);
    width: 2px;
    background: rgba(0,0,0,.12);
    box-shadow: 0 0 0 1px rgba(0,0,0,.06);
    z-index: 2;
}

.spellbook-page {
    position: relative;
    padding: 18px;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.spellbook-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 1rem;
}

.spellbook-title {
    color: #2a1e0f;
    font-weight: 800;
    letter-spacing: .6px;
    text-transform: uppercase;
    font-size: 13px;
}

.spellbook-filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.spells-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: 10px;
    overflow-y: auto;
}

.spell-card {
    background: linear-gradient(180deg, #1e2430, #0f131a);
    border-radius: 12px;
    position: relative;
    aspect-ratio: 1/1;
    cursor: pointer;
    box-shadow: inset 0 0 0 2px rgba(255,255,255,.06), inset 0 10px 20px rgba(255,255,255,.04), 0 10px 24px rgba(0,0,0,.2);
    display: grid;
    place-items: center;
    overflow: hidden;
    border: none;
    transition: all 0.2s ease;
}

.spell-icon {
    font-size: 24px;
    user-select: none;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,.35));
    transform: translateY(2px);
}

.spell-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 9px;
    font-weight: 800;
    padding: 2px 4px;
    border-radius: 6px;
    color: #0c0f14;
    background: linear-gradient(180deg, #c8e9ff, #86c8ff);
    box-shadow: 0 2px 6px rgba(0,0,0,.2);
}

.spellbook-close-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 3;
    border: 0;
    cursor: pointer;
    border-radius: 10px;
    padding: 8px 10px;
    font-weight: 800;
    color: #1a1006;
    background: linear-gradient(180deg, #ffd7a1, #f0c47d);
    box-shadow: 0 6px 16px rgba(0,0,0,.25);
    transition: transform 0.2s ease;
}

.spell-tooltip {
    position: fixed;
    pointer-events: none;
    z-index: 110;
    min-width: 200px;
    max-width: 280px;
    padding: 8px 10px;
    border-radius: 8px;
    color: #121418;
    background: linear-gradient(180deg, #fffef9, #f2e9d5);
    border: 1px solid rgba(0,0,0,.15);
    box-shadow: 0 12px 40px rgba(0,0,0,.35);
    transform: translate(-50%, calc(-100% - 14px));
}

.tooltip-name {
    font-weight: 900;
    letter-spacing: .3px;
    color: #341f07;
    margin-bottom: 4px;
    font-size: 13px;
}

.tooltip-desc {
    font-size: 12px;
    color: #3e2c14;
    margin-bottom: 4px;
    line-height: 1.3;
}

.tooltip-cooldown {
    font-size: 11px;
    color: #6b512f;
    font-style: italic;
}

.equipment-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0;
}

.equipment-icon {
  width: 48px;
  height: 48px;
  position: relative;
  border-radius: 3px;
  border: 1px solid rgba(196, 151, 90, 0.3);
}

.equipment-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.equipment-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  color: #666;
  background: rgba(0, 0, 0, 0.2);
}

.equipment-icon.rarity-uncommon { border-color: #1eff00; }
.equipment-icon.rarity-rare { border-color: #0070dd; }
.equipment-icon.rarity-epic { border-color: #a335ee; }
.equipment-icon.rarity-legendary { border-color: #ff8000; }

@media (max-width: 480px) {
    
    .card-portrait {
        width: 80px;
        height: 80px;
    }
    
    .stats-items-container {
        gap: 0.6rem;
    }
    
    .items-list p, .stats-list p {
        font-size: 0.7rem;
    }
    
    .equipment-item {
        max-width: 50%;
    }
    
    .spells-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
    }
    
    .spell-icon {
        font-size: 20px;
    }
    
    .spell-badge {
        display: none;
    }
}

@media (orientation: landscape) and (max-height: 500px) {
    .character-card {
        height: calc(100vh - 4rem);
    }
    
    .stats-items-container {
        flex-direction: row;
        gap: 0.8rem;
    }
    
    .items-list p, .stats-list p {
        min-height: 18px;
        font-size: 0.7rem;
    }
}
`;
    document.head.appendChild(styleEl);
    console.log('Character Manager styles loaded successfully');
}

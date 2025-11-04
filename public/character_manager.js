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
    const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=*,races(name),classes(name,talent_abilities),professions(name)`);
    const characters = await response.json();

    renderCharacters(characters);
  } catch (error) {
    displayMessage('Failed to load characters. Please try again.');
  }
}

async function renderCharacters(characters) {
  const section = _main.querySelector('.character-creation-section');

  if (!characters || characters.length === 0) {
    section.innerHTML = `
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
    <div class="characters-slider-container">
      <button class="slider-arrow slider-arrow-left">‹</button>
      <div class="characters-slider" id="charactersSlider">
        ${characters.map(character => characterCardHTML(character)).join('')}
      </div>
      <button class="slider-arrow slider-arrow-right">›</button>
    </div>
    <div class="top-right-buttons">
      <button class="fantasy-button return-btn">Return</button>
    </div>
  `;

  section.querySelector('.return-btn').addEventListener('click', () => {
    window.gameAuth.loadModule('castle');
  });

  setupImageErrorHandling(section);
  setupEquipmentClickHandlers(section, characters);
  setupTalentsClickHandlers(section, characters);
  setupStatsClickHandlers(section, characters);
  setupDragSlider();
  
  const availableCounts = await checkAvailableItems(characters);
  updateAvailabilityLabels(section, availableCounts);
}

async function checkAvailableItems(characters) {
  try {
    const bankResponse = await _apiCall(`/api/supabase/rest/v1/bank?player_id=eq.${_profile.id}&select=type,amount`);
    const bankItems = await bankResponse.json();
    
    const availableCounts = {};
    bankItems.forEach(item => {
      if (item.amount > 0) {
        availableCounts[item.type] = (availableCounts[item.type] || 0) + 1;
      }
    });
    
    const gearResponse = await _apiCall(`/api/supabase/rest/v1/craft_sessions?player_id=eq.${_profile.id}&equipped_by=is.null&select=type`);
    const gearItems = await gearResponse.json();
    
    gearItems.forEach(item => {
      availableCounts[item.type] = (availableCounts[item.type] || 0) + 1;
    });
    
    return availableCounts;
  } catch (error) {
    console.error('Error checking available items:', error);
    return {};
  }
}

function updateAvailabilityLabels(section, availableCounts) {
  section.querySelectorAll('.equipment-icon').forEach(icon => {
    const type = icon.dataset.type;
    const count = availableCounts[type] || 0;
    
    icon.dataset.hasItems = count > 0 ? 'true' : 'false';
    
    let label = icon.querySelector('.availability-label');
    if (!label) {
      label = document.createElement('div');
      label.className = 'availability-label';
      icon.appendChild(label);
    }
    
    if (count > 0) {
      label.textContent = `${count} available`;
      label.style.display = 'block';
    } else {
      label.style.display = 'none';
    }
  });
}

function characterCardHTML(character) {
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
    { label: 'HP', shortLabel: 'HP', value: hp, baseValue: (normalizedBaseStats.vitality || 0) * 10 },
    { label: 'Strength', shortLabel: 'STR', value: strength, baseValue: normalizedBaseStats.strength || 0 },
    { label: 'Intellect', shortLabel: 'INT', value: intellect, baseValue: normalizedBaseStats.intellect || 0 },
    { label: 'Armor', shortLabel: 'ARM', value: armor, baseValue: normalizedBaseStats.armor || 0 },
    { label: 'Vitality', shortLabel: 'VIT', value: vitality, baseValue: normalizedBaseStats.vitality || 0 },
    { label: 'Dexterity', shortLabel: 'DEX', value: dexterity, baseValue: normalizedBaseStats.dexterity || 0 },
    { label: 'Spirit', shortLabel: 'SPI', value: spirit, baseValue: normalizedBaseStats.spirit || 0 },
    { label: 'Resistance', shortLabel: 'RES', value: resistance, baseValue: normalizedBaseStats.resistance || 0 }
  ];

  const equippedItems = character.equipped_items || {};
  const equipmentData = [
    { label: 'Weapon', slot: 'equipped_weapon', type: 'Weapon', value: equippedItems.equipped_weapon || null },
    { label: 'Offhand', slot: 'equipped_offhand', type: 'Offhand', value: equippedItems.equipped_offhand || null },
    { label: 'Armor', slot: 'equipped_armor', type: 'Armor', value: equippedItems.equipped_armor || null },
    { label: 'Helmet', slot: 'equipped_helmet', type: 'Helmet', value: equippedItems.equipped_helmet || null },
    { label: 'Trinket', slot: 'equipped_trinket', type: 'Trinket', value: equippedItems.equipped_trinket || null },
    { label: 'Boots', slot: 'equipped_boots', type: 'Boots', value: equippedItems.equipped_boots || null },
    { label: 'Gloves', slot: 'equipped_gloves', type: 'Gloves', value: equippedItems.equipped_gloves || null },
    { label: 'Tool', slot: 'equipped_tool', type: 'Tool', value: equippedItems.equipped_tool || null },
    { label: 'Consumable', slot: 'equipped_consumable', type: 'Consumable', value: equippedItems.equipped_consumable || null },
    { label: 'Amulet', slot: 'equipped_amulet', type: 'Amulet', value: equippedItems.equipped_amulet || null },
    { label: 'Ring1', slot: 'equipped_ring1', type: 'Ring', value: equippedItems.equipped_ring1 || null },
    { label: 'Ring2', slot: 'equipped_ring2', type: 'Ring', value: equippedItems.equipped_ring2 || null }
  ];

  const raceName = character.races?.name || 'Race';
  const className = character.classes?.name || 'Class';
  const professionName = character.professions?.name || 'Profession';
  const exp = character.exp || 0;
  const talentPoints = character.points?.talent || 0;

  return `
    <div class="character-card" data-character-id="${character.id}" data-class="${className.toLowerCase()}">
      <div class="card-top-row">
        <div class="card-portrait">
          <img src="assets/art/portraits/${character.portrait}.png" class="card-art">
        </div>
        <div class="card-info">
          <h3 class="card-name">Lvl ${character.level || 1}</h3>
          <p class="card-race-class">${raceName} ${className}</p>
          <p class="card-profession">${professionName}</p>
          <p class="card-exp">EXP: ${exp}</p>
          <p class="card-talent-points">Talent Points: ${talentPoints}</p>
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
                    data-has-items="false"
                    style="cursor: pointer;" 
                    title="${item.label}${isEquipped ? ': ' + item.value : ''}">
                    ${isEquipped ? `
                      <img src="${iconPath}" alt="${item.value}">
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
                    data-base-value="${stat.baseValue}">
                ${stat.value}
              </span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <div class="character-actions">
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
  const dragThreshold = 50;
  let animationId = null;

  const leftArrow = _main.querySelector('.slider-arrow-left');
  const rightArrow = _main.querySelector('.slider-arrow-right');

  function updateArrows() {
    leftArrow.style.display = currentIndex > 0 ? 'flex' : 'none';
    rightArrow.style.display = currentIndex < cards.length - 1 ? 'flex' : 'none';
  }

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
    updateArrows();
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

  leftArrow.addEventListener('click', () => {
    if (currentIndex > 0) {
      snapToCard(currentIndex - 1);
    }
  });

  rightArrow.addEventListener('click', () => {
    if (currentIndex < cards.length - 1) {
      snapToCard(currentIndex + 1);
    }
  });

  slider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handleStart(e.clientX);
  });

  slider.addEventListener('mousemove', (e) => {
    handleMove(e.clientX);
  });

  slider.addEventListener('mouseup', handleEnd);
  slider.addEventListener('mouseleave', handleEnd);

  slider.addEventListener('touchstart', (e) => {
    handleStart(e.touches[0].clientX);
  }, { passive: true });

  slider.addEventListener('touchmove', (e) => {
    handleMove(e.touches[0].clientX);
  }, { passive: true });

  slider.addEventListener('touchend', handleEnd, { passive: true });

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

  window.addEventListener('resize', () => {
    snapToCard(currentIndex, true);
  });

  slider.style.cursor = 'grab';
  requestAnimationFrame(() => {
    snapToCard(0, true);
    updateArrows();
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
      
      const characterId = btn.dataset.characterId;
      const character = characters.find(c => c.id == characterId);
      if (!character) return;
      
      showTalentModal(character);
    });
  });
}

function setupStatsClickHandlers(section, characters) {
  section.querySelectorAll('.stat-item').forEach(statItemEl => {
    statItemEl.style.cursor = 'pointer';
    statItemEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const statValueEl = statItemEl.querySelector('.stat-value');
      if (!statValueEl) return;
      
      const characterId = statValueEl.dataset.characterId;
      const statName = statValueEl.dataset.statName;
      const totalValue = parseInt(statValueEl.dataset.totalValue);
      const baseValue = parseInt(statValueEl.dataset.baseValue);
      const itemBonus = totalValue - baseValue;
      
      const character = characters.find(c => c.id == characterId);
      if (!character) return;
      
      showStatsBreakdown(character, statName, baseValue, itemBonus, totalValue);
    });
  });
}

async function showTalentModal(character) {
  const className = character.classes?.name?.toLowerCase() || 'paladin';
  const talentAbilities = character.classes?.talent_abilities || {};
  const learnedAbilities = character.learned_abilities || { basic: [], passive: [], ultimate: [] };
  const selectedAbilities = character.selected_abilities || { basic: [], passive: [], ultimate: [] };
  const talentPoints = character.points?.talent || 0;
  
  try {
    const abilityNames = [];
    Object.values(talentAbilities).forEach(columnAbilities => {
      columnAbilities.forEach(ability => {
        if (ability.name) abilityNames.push(ability.name);
      });
    });
    
    console.log('Fetching abilities:', abilityNames);

    const response = await _apiCall(`/api/supabase/rest/v1/abilities?name=in.(${abilityNames.map(name => `"${name}"`).join(',')})&select=*`);
    const completeAbilities = await response.json();
    
    console.log('Complete abilities from DB:', completeAbilities);

    const abilityLookup = {};
    completeAbilities.forEach(ability => {
      abilityLookup[ability.name] = ability;
    });
    
    console.log('Ability lookup:', abilityLookup);

    const enrichedTalentAbilities = {};
    Object.keys(talentAbilities).forEach(column => {
      enrichedTalentAbilities[column] = talentAbilities[column].map(basicAbility => {
        const completeAbility = abilityLookup[basicAbility.name];
        console.log(`Merging ${basicAbility.name}:`, { basic: basicAbility, complete: completeAbility });
        
        if (completeAbility) {
          return completeAbility;
        }
        return basicAbility;
      });
    });
    
    console.log('Enriched talents:', enrichedTalentAbilities);
    
    const modal = document.createElement('div');
    modal.className = 'custom-message-box';
    modal.innerHTML = `
      <div class="talent-modal-content">
        <div class="talent-container" data-class="${className}">
          <div class="talent-points">Talent Points: <span id="talentPointsCount">${talentPoints}</span></div>
          
          <div class="ability-counter">
            <span class="counter-item">Basic: ${selectedAbilities.basic?.length || 0}/4</span>
            <span class="counter-item">Passive: ${selectedAbilities.passive?.length || 0}/2</span>
            <span class="counter-item">Ultimate: ${selectedAbilities.ultimate?.length || 0}/1</span>
          </div>
          
          <div class="talent-grid">
            <div class="talent-column">
              ${generateTalentColumn(enrichedTalentAbilities['1'] || [], learnedAbilities, 1, selectedAbilities)}
            </div>
            
            <div class="talent-column">
              ${generateTalentColumn(enrichedTalentAbilities['2'] || [], learnedAbilities, 2, selectedAbilities)}
            </div>
            
            <div class="talent-column">
              ${generateTalentColumn(enrichedTalentAbilities['3'] || [], learnedAbilities, 3, selectedAbilities)}
            </div>
          </div>
          
          <div class="talent-action-panel">
            <div class="selected-ability-info">
              <div class="ability-name">Click an ability to see details</div>
              <div class="ability-description">Select an ability from the tree above</div>
            </div>
            <button class="fantasy-button action-button" disabled id="actionButton">
              <div class="button-progress"></div>
              <span class="button-text">Select an Ability</span>
            </button>
          </div>
          
          <div class="instructions">
            Click abilities to see details and manage selection
          </div>
          
          <div>
            <button class="help-tutorial-close-button">X</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    const talentContainer = modal.querySelector('.talent-container');
    loadTalentBackground(modal, character);
    applyClassBorder(talentContainer, className);
    initializeTalentTree(character, modal, enrichedTalentAbilities, selectedAbilities);
    
    modal.querySelector('.help-tutorial-close-button').addEventListener('click', () => {
      modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
  } catch (error) {
    console.error('Error loading talent abilities:', error);
    displayMessage('Failed to load talent data. Please try again.');
  }
}

function generateTalentColumn(abilities, learnedAbilities, column, selectedAbilities = { basic: [], passive: [], ultimate: [] }) {
  const maxSlots = 7;
  let html = '';

  selectedAbilities = {
    basic: Array.isArray(selectedAbilities?.basic) ? selectedAbilities.basic : [],
    passive: Array.isArray(selectedAbilities?.passive) ? selectedAbilities.passive : [],
    ultimate: Array.isArray(selectedAbilities?.ultimate) ? selectedAbilities.ultimate : []
  };

  for (let row = maxSlots - 1; row >= 0; row--) {
    const ability = abilities[row];
    const hasAbility = ability !== undefined;
    const isLearned = hasAbility && isAbilityLearned(ability, learnedAbilities);
    let typeKey = (ability?.type || '').toLowerCase();
    if (typeKey === 'active') typeKey = 'basic';
    
    const isSelected = hasAbility && Array.isArray(selectedAbilities[typeKey]) && selectedAbilities[typeKey].includes(ability.name);

    const typeBadge = hasAbility ? getTypeBadge(typeKey) : '';

    html += `
    <div class="talent-slot ${isLearned ? 'filled' : ''} ${isSelected ? 'selected-ability' : ''}"
        data-column="${column}" 
        data-row="${row}"
        ${hasAbility ? `data-ability='${JSON.stringify(ability).replace(/'/g, "&apos;")}'` : ''}>
      ${hasAbility ? `
        <img src="assets/art/abilities/${ability.sprite}.png" alt="${ability.name}"
            style="${isLearned ? 'opacity: 1;' : 'opacity: 0.3;'} width: 100%; height: 100%; object-fit: cover;">
        ${typeBadge}
        <div class="ability-preview" style="display: none;">${ability.name.substring(0, 3).toUpperCase()}</div>
      ` : ''}
    </div>
    `;
  }

  return html;
}

function getTypeBadge(type) {
  const badges = {
    'basic': 'B',
    'passive': 'P', 
    'ultimate': 'U'
  };
  
  const badgeText = badges[type] || '?';
  return `<div class="ability-type-badge ability-type-${type}">${badgeText}</div>`;
}

function isAbilityLearned(ability, learnedAbilities) {
  return Object.values(learnedAbilities)
    .flat()
    .filter(Boolean)
    .includes(ability.name);
}

function initializeTalentTree(character, modal, enrichedTalentAbilities, initialSelectedAbilities) {
  let talentPoints = character.points?.talent || 0;
  let holdTimer = null;
  let currentSlot = null;
  let startTime = 0;

  const className = character.classes?.name?.toLowerCase() || 'paladin';
  const talentAbilities = enrichedTalentAbilities || character.classes?.talent_abilities || {};
  const pointsDisplay = modal.querySelector('#talentPointsCount');
  const actionButton = modal.querySelector('#actionButton');
  const buttonProgress = actionButton.querySelector('.button-progress');
  const buttonText = actionButton.querySelector('.button-text');
  const abilityNameDisplay = modal.querySelector('.ability-name');
  const abilityDescriptionDisplay = modal.querySelector('.ability-description');
  const counterItems = modal.querySelectorAll('.counter-item');

  let selectedAbility = null;
  let selectedAbilityIsLearned = false;
  let selectedAbilityIsSelected = false;
  let currentSelectedAbilities = { ...initialSelectedAbilities };

  function updateCounter() {
    counterItems[0].textContent = `Basic: ${currentSelectedAbilities.basic?.length || 0}/4`;
    counterItems[1].textContent = `Passive: ${currentSelectedAbilities.passive?.length || 0}/2`;
    counterItems[2].textContent = `Ultimate: ${currentSelectedAbilities.ultimate?.length || 0}/1`;
  }

  function updatePoints() {
    pointsDisplay.textContent = talentPoints;
  }

  function findLowestUnlearnedAbility(column) {
    const abilities = talentAbilities[column] || [];
    const learnedAbilities = character.learned_abilities || { basic: [], passive: [], ultimate: [] };
    
    for (let row = 0; row < abilities.length; row++) {
      const ability = abilities[row];
      if (ability && !isAbilityLearned(ability, learnedAbilities)) {
        return { ability, row, column };
      }
    }
    return null;
  }

  function startHold() {
    if (talentPoints <= 0) return;
    if (!selectedAbility || selectedAbilityIsLearned) return;

    const column = parseInt(currentSlot.dataset.column);
    const parentColumn = currentSlot.closest('.talent-column');
    if (parentColumn) parentColumn.classList.add('column-active');

    startTime = Date.now();
    holdTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / 1500) * 100, 100);
      
      buttonProgress.style.width = progress + '%';

      if (elapsed >= 1500) {
        clearInterval(holdTimer);
        holdTimer = null;
        completeHold();
      }
    }, 16);
  }

  function cancelHold() {
    if (holdTimer) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
    
    buttonProgress.style.width = '0%';
    updateActionButton();
    
    const activeColumn = modal.querySelector('.talent-column.column-active');
    if (activeColumn) activeColumn.classList.remove('column-active');
  }

  async function completeHold() {
    if (!selectedAbility) return;

    try {
      const response = await _apiCall('/api/supabase/functions/v1/learn_talent', {
        method: 'POST',
        body: {
          character_id: character.id,
          ability_name: selectedAbility.name,
          ability_type: selectedAbility.type,
          player_id: _profile.id
        }
      });

      if (!response.ok) {
        const errorResult = await response.json();
        throw new Error(errorResult.error || 'Failed to learn talent');
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to learn talent');

      talentPoints = result.remaining_talent_points;
      updatePoints();

      currentSlot.classList.add('filled', 'level-up-flash');
      const abilityImage = currentSlot.querySelector('img');
      if (abilityImage) abilityImage.style.opacity = '1';

      const targetAbility = findLowestUnlearnedAbility(parseInt(currentSlot.dataset.column));
      if (targetAbility) {
        const targetSlot = modal.querySelector(`.talent-slot[data-column="${targetAbility.column}"][data-row="${targetAbility.row}"]`);
        if (targetSlot && targetSlot !== currentSlot) {
          targetSlot.classList.add('filled', 'level-up-flash');
          const targetAbilityImage = targetSlot.querySelector('img');
          if (targetAbilityImage) targetAbilityImage.style.opacity = '1';
        }
      }

      setTimeout(() => {
        currentSlot.classList.remove('level-up-flash');
        const targetSlot = modal.querySelector(`.talent-slot[data-column="${targetAbility.column}"][data-row="${targetAbility.row}"]`);
        if (targetSlot && targetSlot !== currentSlot) {
          targetSlot.classList.remove('level-up-flash');
        }
      }, 1000);

      selectedAbilityIsLearned = true;
      updateActionButton();

      displayMessage(result.message);
    } catch (error) {
      console.error('Error learning talent:', error);
      displayMessage(error.message || 'Failed to learn talent. Please try again.');
    }

    cancelHold();
  }

  async function toggleAbilitySelection() {
    if (!selectedAbility || !selectedAbilityIsLearned) return;

    try {
      const response = await _apiCall('/api/supabase/functions/v1/select_ability', {
        method: 'POST',
        body: {
          character_id: character.id,
          ability_name: selectedAbility.name,
          ability_type: selectedAbility.type,
          player_id: _profile.id
        }
      });

      if (!response.ok) {
        const errorResult = await response.json();
        throw new Error(errorResult.error || 'Failed to update ability selection');
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to update ability selection');

      currentSelectedAbilities = result.selected_abilities;
      selectedAbilityIsSelected = currentSelectedAbilities[selectedAbility.type.toLowerCase()]?.includes(selectedAbility.name) || false;
      
      modal.querySelectorAll('.talent-slot').forEach(slot => {
        const slotAbility = slot.dataset.ability ? JSON.parse(slot.dataset.ability) : null;
        if (slotAbility && slotAbility.name === selectedAbility.name) {
          if (selectedAbilityIsSelected) {
            slot.classList.add('selected-ability');
          } else {
            slot.classList.remove('selected-ability');
          }
        }
      });

      updateActionButton();
      updateCounter();
      displayMessage(result.message);

    } catch (error) {
      console.error('Error selecting ability:', error);
      displayMessage(error.message || 'Failed to update ability selection. Please try again.');
    }
  }

  function updateActionButton() {
    buttonProgress.style.width = '0%';
    
    if (!selectedAbility) {
      actionButton.disabled = true;
      buttonText.textContent = 'Select an Ability';
      actionButton.className = 'fantasy-button action-button';
      return;
    }

    if (!selectedAbilityIsLearned) {
      if (talentPoints <= 0) {
        actionButton.disabled = true;
        buttonText.textContent = 'No Talent Points';
        actionButton.className = 'fantasy-button action-button no-points';
      } else {
        actionButton.disabled = false;
        buttonText.textContent = 'Hold to Learn (1.5s)';
        actionButton.className = 'fantasy-button action-button can-learn';
      }
    } else {
      // Ability is learned - show select/deselect
      if (selectedAbilityIsSelected) {
        actionButton.disabled = false;
        buttonText.textContent = 'Deselect Ability';
        actionButton.className = 'fantasy-button action-button deselected';
      } else {
        const type = selectedAbility.type.toLowerCase() === 'active' ? 'basic' : selectedAbility.type.toLowerCase();
        const limits = {
          basic: 4,
          passive: 2,
          ultimate: 1
        };
        
        const currentCount = currentSelectedAbilities[type]?.length || 0;
        
        if (currentCount >= limits[type]) {
          actionButton.disabled = true;
          buttonText.textContent = 'Limit Reached';
          actionButton.className = 'fantasy-button action-button limit-reached';
        } else {
          actionButton.disabled = false;
          buttonText.textContent = 'Select Ability';
          actionButton.className = 'fantasy-button action-button can-select';
        }
      }
    }
  }

  function selectAbility(slot, ability) {
    modal.querySelectorAll('.talent-slot').forEach(s => {
      s.classList.remove('selected');
    });
    
    slot.classList.add('selected');
    
    selectedAbility = ability;
    currentSlot = slot;
    selectedAbilityIsLearned = slot.classList.contains('filled');
    
    const type = ability.type.toLowerCase() === 'active' ? 'basic' : ability.type.toLowerCase();
    selectedAbilityIsSelected = currentSelectedAbilities[type]?.includes(ability.name) || false;
    
    abilityNameDisplay.textContent = ability.name;
    abilityDescriptionDisplay.textContent = ability.description || 'No description available.';
    
    updateActionButton();
  }

  modal.querySelectorAll('.talent-slot').forEach(slot => {
    const column = parseInt(slot.dataset.column);
    const row = parseInt(slot.dataset.row);
    const ability = talentAbilities[column]?.[row];
    if (!ability) return;

    slot.addEventListener('click', (e) => {
      selectAbility(slot, ability);
      e.stopPropagation();
    });
  });

  actionButton.addEventListener('mousedown', (e) => {
    if (actionButton.disabled) return;
    if (selectedAbilityIsLearned) {
      // For selection/deselection, just click, no hold
      return;
    }
    e.preventDefault();
    startHold();
  });

  actionButton.addEventListener('mouseup', (e) => {
    if (selectedAbilityIsLearned) {
      // For selection/deselection, handle as click
      e.preventDefault();
      toggleAbilitySelection();
      return;
    }
    e.preventDefault();
    cancelHold();
  });

  actionButton.addEventListener('mouseleave', () => {
    if (!selectedAbilityIsLearned) {
      cancelHold();
    }
  });

  actionButton.addEventListener('click', (e) => {
    if (selectedAbilityIsLearned) {
      e.preventDefault();
      toggleAbilitySelection();
    }
  });

  actionButton.addEventListener('touchstart', (e) => {
    if (actionButton.disabled) return;
    if (selectedAbilityIsLearned) return;
    e.preventDefault();
    startHold();
  }, { passive: false });

  actionButton.addEventListener('touchend', (e) => {
    if (selectedAbilityIsLearned) {
      e.preventDefault();
      toggleAbilitySelection();
      return;
    }
    e.preventDefault();
    cancelHold();
  }, { passive: false });

  actionButton.addEventListener('touchcancel', () => {
    if (!selectedAbilityIsLearned) {
      cancelHold();
    }
  });

  document.addEventListener('mouseup', () => {
    if (!selectedAbilityIsLearned) {
      cancelHold();
    }
  });

  document.addEventListener('touchend', () => {
    if (!selectedAbilityIsLearned) {
      cancelHold();
    }
  });

  updateCounter();
  updateActionButton();
}

function loadTalentBackground(modal, character) {
  const talentContainer = modal.querySelector('.talent-container');
  const raceName = (character.races?.name || 'human').toLowerCase().replace(/\s+/g, '_');
  const className = (character.classes?.name || 'warrior').toLowerCase().replace(/\s+/g, '_');
  const backgroundImagePath = `assets/art/classes/backgrounds/${raceName}_${className}_bg.png`;

  const testImage = new Image();
  testImage.onload = function () {
    talentContainer.style.backgroundImage = `
      linear-gradient(135deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.2)),
      url('${backgroundImagePath}')
    `;
    talentContainer.style.backgroundSize = 'cover';
    talentContainer.style.backgroundPosition = 'center';
    talentContainer.style.backgroundRepeat = 'no-repeat';
    talentContainer.style.transition = 'background-image 0.5s ease-in-out';
  };

  testImage.onerror = function () {
    console.log(`Background image not found: ${backgroundImagePath}`);
    applyFallbackBackground(talentContainer, className);
  };

  testImage.src = backgroundImagePath;
}

function applyFallbackBackground(container, className) {
  container.style.backgroundImage = 'linear-gradient(135deg, #A0522D, #8B4513)';
}

function applyClassBorder(container, className) {
  const borderColors = {
    'paladin': 'rgba(255, 255, 200, 0.8)',
    'warrior': 'rgba(200, 0, 0, 0.8)',
    'priest': 'rgba(255, 255, 255, 0.8)',
    'grave warden': 'rgba(33, 91, 0, 0.8)',
    'defiler': 'rgba(97, 0, 74, 0.8)'
  };
  
  const borderColor = borderColors[className] || '#DAA520';
  container.style.border = `3px solid ${borderColor}`;
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

function formatItemStats(stats) {
  if (!stats) return '';
  
  if (Array.isArray(stats)) {
    return stats.map(stat => `${stat.name}: +${stat.value}`).join(', ');
  }
  
  return Object.entries(stats)
    .map(([key, value]) => {
      const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
      return `${capitalizedKey}: +${value}`;
    })
    .join(', ');
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
        crafting_session_id : item.id
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
                <div class="equipment-option ${itemName === currentItem ? 'selected' : ''} ${getGearRarity(itemName)}" 
                     data-item="${itemName}"
                     data-crafting-session-id="${item.crafting_session_id || ''}"
                     data-is-consumable="${isConsumable}"
                     data-is-tool="${isTool}"
                     ${!isAvailable ? 'data-disabled="true"' : ''}
                     style="display: flex; align-items: center; gap: 1rem; padding: 0.8rem; margin-bottom: 0.5rem; border-radius: 8px; background: rgba(0,0,0,0.2); cursor: ${!isAvailable ? 'not-allowed' : 'pointer'}; opacity: ${!isAvailable ? '0.5' : '1'};">
                  <img src="${getItemIcon(item, itemName, type)}"
                    style="width: 48px; height: 48px; border-radius: 4px;">
                  <div style="width: 48px; height: 48px; border: 2px solid #666; border-radius: 4px; background: rgba(255,255,255,0.1); display: none; align-items: center; justify-content: center; font-size: 0.7rem; color: #666;">
                    ${type.toUpperCase()}
                  </div>
                  <div style="flex: 1;">
                    <strong style="color: #4CAF50;">${itemName}</strong>
                    ${(isConsumable || isTool) ? `<br><span style="color: #999; font-size: 0.8rem;">Qty: ${item.amount}</span>` : ''}
                    ${item.stats ? `<br><span style="color: #b8b3a8; font-size: 0.8rem;">${formatItemStats(item.stats)}</span>` : ''}
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

function setupImageErrorHandling(container) {
  container.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', function() {
      if (this.classList.contains('card-art')) {
        this.src = 'assets/art/portraits/placeholder.png';
      } else {
        this.style.display = 'none';
        if (this.nextElementSibling) {
          this.nextElementSibling.style.display = 'flex';
        }
      }
    });
  });
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
/* Slider Arrows */
.characters-slider-container {
    position: relative;
    flex: 1;
    width: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
}

.slider-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 40px;
    background: rgba(196, 151, 90, 0.8);
    border: 2px solid #c4975a;
    border-radius: 50%;
    color: white;
    font-size: 24px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    transition: all 0.3s ease;
}

.slider-arrow:hover {
    background: rgba(196, 151, 90, 1);
    transform: translateY(-50%) scale(1.1);
}

.slider-arrow-left {
    left: 10px;
}

.slider-arrow-right {
    right: 10px;
}

/* Ability Counter */
.ability-counter {
    display: flex;
    justify-content: space-around;
    margin: 10px 0;
    padding: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    border: 1px solid #c4975a;
}

.counter-item {
    color: #FFD700;
    font-size: 0.8rem;
    font-weight: bold;
}

/* Talent Action Panel */
.talent-action-panel {
    background: rgba(0, 0, 0, 0.3);
    border: 2px solid #c4975a;
    border-radius: 8px;
    padding: 15px;
    margin: 15px 0;
    text-align: center;
}

.selected-ability-info {
    margin-bottom: 15px;
}

.ability-name {
    font-size: 1.2rem;
    color: #c4975a;
    font-weight: bold;
    margin-bottom: 5px;
}

.ability-description {
    font-size: 0.9rem;
    color: #b8b3a8;
    line-height: 1.4;
}

/* Action Button with Progress */
.action-button {
    position: relative;
    width: 100%;
    padding: 15px;
    font-size: 1.1rem;
    font-weight: bold;
    transition: all 0.3s ease;
    overflow: hidden;
}

.button-progress {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.6), rgba(255, 165, 0, 0.8));
    border-radius: 4px;
    transition: width 0.1s linear;
    width: 0%;
    z-index: 1;
}

.button-text {
    position: relative;
    z-index: 2;
}

.action-button.no-points {
    background: rgba(244, 67, 54, 0.6);
    border-color: #f44336;
    cursor: not-allowed;
}

.action-button.can-learn {
    background: rgba(255, 193, 7, 0.8);
    border-color: #FFC107;
    color: #000;
    cursor: pointer;
}

.action-button.can-learn:hover {
    background: rgba(255, 193, 7, 1);
    transform: scale(1.02);
}

.action-button.can-select {
    background: rgba(76, 175, 80, 0.8);
    border-color: #4CAF50;
    color: white;
}

.action-button.can-select:hover {
    background: rgba(76, 175, 80, 1);
    transform: scale(1.02);
}

.action-button.deselected {
    background: rgba(244, 67, 54, 0.8);
    border-color: #f44336;
    color: white;
}

.action-button.deselected:hover {
    background: rgba(244, 67, 54, 1);
    transform: scale(1.02);
}

.action-button.limit-reached {
    background: rgba(158, 158, 158, 0.6);
    border-color: #9E9E9E;
    color: #ccc;
    cursor: not-allowed;
}

/* Ability Type Badges */
.ability-type-badge {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    font-size: 0.6rem;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
}

.ability-type-basic {
    background: #4CAF50;
}

.ability-type-passive {
    background: #2196F3;
}

.ability-type-ultimate {
    background: #FF9800;
}

/* Column Glow Effects */
.talent-column.column-active {
    filter: drop-shadow(0 0 20px currentColor) drop-shadow(0 0 40px currentColor) !important;
    transform: scale(1.02);
}

.talent-container[data-class="paladin"] .talent-column.column-active {
    color: rgba(255, 255, 200, 0.9) !important;
}

.talent-container[data-class="warrior"] .talent-column.column-active {
    color: rgba(200, 0, 0, 0.9) !important;
}

.talent-container[data-class="priest"] .talent-column.column-active {
    color: rgba(255, 255, 255, 0.9) !important;
}

.talent-container[data-class="grave warden"] .talent-column.column-active {
    color: rgba(33, 91, 0, 0.9) !important;
}

.talent-container[data-class="defiler"] .talent-column.column-active {
    color: rgba(97, 0, 74, 0.9) !important;
}

.talent-slot.selected {
    outline: 3px solid #4caf50;
    box-shadow: 0 0 12px rgba(76,175,80,0.7);
}

.talent-slot.selected-ability {
    outline: 3px solid #FFD700;
    box-shadow: 0 0 15px rgba(255,215,0,0.8);
    transform: scale(1.05);
}

.talent-slot.filled:not(.selected-ability):hover {
    outline: 2px solid #4CAF50;
    box-shadow: 0 0 10px rgba(76,175,80,0.6);
}

.equipment-option {
    border: 2px solid #444;
}

.equipment-option.selected {
    border-color: #4CAF50 !important;
}

.equipment-option.rarity-uncommon { border-color: #1eff00; }
.equipment-option.rarity-rare { border-color: #0070dd; }
.equipment-option.rarity-epic { border-color: #a335ee; }
.equipment-option.rarity-legendary { border-color: #ff8000; }

.availability-label {
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.55rem;
    color: #4CAF50;
    background: rgba(0, 0, 0, 0.8);
    padding: 1px 4px;
    border-radius: 3px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 1;
}

.equipment-icon[data-has-items="false"] .availability-label {
    display: none;
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
    height: calc(100vh - 3rem);
    box-sizing: border-box;
    border: 2px solid #c4975a;
}

.character-card[data-class="paladin"] {
    border: 2px solid rgba(255, 255, 200, 0.8);
}

.character-card[data-class="warrior"] {
    border: 2px solid rgba(200, 0, 0, 0.8);
}

.character-card[data-class="priest"] {
    border: 2px solid rgba(255, 255, 255, 0.8);
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

.card-talent-points {
    font-size: 0.75rem;
    color: #c4975a;
    font-weight: bold;
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

.character-actions {
    display: flex;
    gap: 0.8rem;
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

.talent-modal-content {
    width: 95%;
    max-width: 450px;
    max-height: 95vh;
    overflow-y: auto;
}

.talent-container {
    height: 100%;
    background: linear-gradient(135deg, rgba(160, 82, 45, 0.8), rgba(139, 69, 19, 0.8));
    border-radius: 15px;
    padding: 2px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    border: 3px solid #DAA520;
    position: relative;
    transition: background-image 0.5s ease-in-out;
}

.talent-points {
    text-align: center;
    color: #FFD700;
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 5px;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.talent-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 15px;
}

.talent-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    align-items: center;
}

.talent-slot {
    max-width: 60px;
    max-height: 60px;
    width: 100%;
    aspect-ratio: 1;
    background: linear-gradient(135deg, #654321, #8B4513);
    border: 2px solid #CD853F;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

.talent-slot:hover {
    border-color: #DAA520;
    box-shadow: 0 0 10px rgba(218, 165, 32, 0.5);
}

.talent-slot.filled {
    background: linear-gradient(135deg, #DAA520, #B8860B);
    border-color: #FFD700;
    box-shadow: 0 0 15px rgba(255, 215, 0, 0.6);
}

.ability-preview {
    font-size: 0.6rem;
    color: #FFD700;
    font-weight: bold;
    text-align: center;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

@keyframes levelUpFlash {
    0% {
        box-shadow: 0 0 0px rgba(255, 215, 0, 0);
        transform: scale(1);
    }
    25% {
        box-shadow: 0 0 30px rgba(255, 215, 0, 1), inset 0 0 20px rgba(255, 255, 255, 0.5);
        transform: scale(1.1);
    }
    50% {
        box-shadow: 0 0 50px rgba(255, 215, 0, 0.8), inset 0 0 30px rgba(255, 255, 255, 0.3);
        transform: scale(1.05);
    }
    100% {
        box-shadow: 0 0 15px rgba(255, 215, 0, 0.6);
        transform: scale(1);
    }
}

.talent-slot.level-up-flash {
    animation: levelUpFlash 1s ease-out;
}

.instructions {
    text-align: center;
    color: #FFD700;
    font-size: 14px;
    margin-top: 15px;
    opacity: 0.8;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}
`;
    document.head.appendChild(styleEl);
    console.log('Character Manager styles loaded successfully');
}
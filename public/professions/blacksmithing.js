let context = null;
let forgingState = null;

const ITEM_TYPES = [
  { name: 'Armor', type: 'Armor', sprite: 'armor' },
  { name: 'Boots', type: 'Boots', sprite: 'boots' },
  { name: 'Gloves', type: 'Gloves', sprite: 'gloves' },
  { name: 'Helmet', type: 'Helmet', sprite: 'helmet' },
  { name: 'Sword', type: 'Weapon', sprite: 'sword' },
  { name: 'Axe', type: 'Weapon', sprite: 'axe' },
  { name: 'Mace', type: 'Weapon', sprite: 'mace' },
  { name: 'Shield', type: 'Offhand', sprite: 'mace' }
];

const RARITY_LEVELS = {
  'Clay Powder': { name: 'Basic', bonuses: 0, color: '#8B7355' },
  'Sand Powder': { name: 'Uncommon', bonuses: 1, color: '#4CAF50' },
  'Coarse Powder': { name: 'Rare', bonuses: 2, color: '#2196F3' },
  'Limestone Powder': { name: 'Epic', bonuses: 3, color: '#9C27B0' },
  'Mystic Powder': { name: 'Legendary', bonuses: 4, color: '#FF9800' }
};

export async function startCraftingSession(ctx) {
  context = ctx;
  const { loadingModal, loadingStartTime, updateLoadingProgress, finishLoading } = context;
  
  try {
    updateLoadingProgress(loadingModal, "Accessing your forge materials...", "Loading bars and powders...");
    
    const bankResponse = await context.apiCall(`/api/supabase/rest/v1/bank?player_id=eq.${context.profile.id}&profession_id=eq.${context.professionId}&select=item,amount`);
    
    const bankItems = await bankResponse.json();
    updateLoadingProgress(loadingModal, "Analyzing metal properties...", "Processing materials...");
    
    const enriched = await enrichIngredients(bankItems);
    updateLoadingProgress(loadingModal, "Heating the forge...", "Preparing interface...");
    
    forgingState = {
      professionId: context.professionId,
      professionName: context.professionName,
      availableBars: enriched.filter(item => item.name.includes('Bar')),
      availablePowders: enriched.filter(item => item.name.includes('Powder')),
      selectedBar: null,
      selectedPowder: null,
      selectedItemType: null,
      barProperties: [],
      bonusAssignments: [0, 0, 0], // Count of bonuses assigned to each property
      maxBonuses: 0,
      totalAssigned: 0,
      isCraftingStarted: false,
      sessionId: null
    };
    
    await finishLoading(loadingModal, loadingStartTime, 2000);
    
    renderBlacksmithingModal();
    injectBlacksmithingCSS();
    
  } catch (error) {
    if (finishLoading && loadingModal) {
      await finishLoading(loadingModal, loadingStartTime, 500);
    }
    throw error;
  }
}

async function enrichIngredients(bankItems) {
  console.log('=== DEBUGGING INGREDIENT ENRICHMENT ===');
  console.log('Bank items received:', bankItems);
  
  if (!bankItems.length) {
    console.log('No bank items found');
    return [];
  }
  
  const itemNames = bankItems.map(item => item.item);
  console.log('All item names:', itemNames);
  
  const uniqueNames = [...new Set(itemNames)];
  console.log('Unique item names:', uniqueNames);
  
  const namesQuery = uniqueNames.map(name => encodeURIComponent(name)).join(',');
  console.log('Query string:', namesQuery);
  
  try {
    const apiUrl = `/api/supabase/rest/v1/ingridients?name=in.(${namesQuery})&select=name,properties,sprite`;
    console.log('API URL:', apiUrl);
    
    const response = await context.apiCall(apiUrl);
    console.log('Raw response status:', response.status);
    console.log('Raw response headers:', response.headers);
    
    const ingredients = await response.json();
    console.log('API response:', ingredients);
    console.log('API response type:', typeof ingredients);
    console.log('API response length:', ingredients?.length);
    
    // Let's also try to fetch all ingredients to see what's actually in the table
    const allIngredientsResponse = await context.apiCall('/api/supabase/rest/v1/ingridients?select=name,properties,sprite');
    const allIngredients = await allIngredientsResponse.json();
    console.log('ALL INGREDIENTS in table:', allIngredients);
    
    // Create a map for quick lookups
    const ingredientMap = new Map();
    ingredients.forEach(ingredient => {
      ingredientMap.set(ingredient.name, ingredient);
    });
    console.log('Ingredient map:', ingredientMap);
    
    // Enrich all bank items
    const enriched = [];
    for (const item of bankItems) {
      const ingredient = ingredientMap.get(item.item);
      console.log(`Processing ${item.item}:`, ingredient ? 'FOUND' : 'NOT FOUND');
      if (ingredient) {
        const enrichedItem = {
          name: item.item,
          amount: item.amount,
          properties: ingredient.properties,
          sprite: ingredient.sprite,
        };
        console.log('Enriched item:', enrichedItem);
        enriched.push(enrichedItem);
      } else {
        // Let's see if there's a case-sensitive issue
        const matchingNames = allIngredients.filter(ing => 
          ing.name.toLowerCase() === item.item.toLowerCase()
        );
        console.log(`Case-insensitive matches for ${item.item}:`, matchingNames);
      }
    }
    
    console.log('Final enriched array:', enriched);
    console.log('Bars found:', enriched.filter(item => item.name.includes('Bar')));
    console.log('Powders found:', enriched.filter(item => item.name.includes('Powder')));
    
    return enriched;
    
  } catch (error) {
    console.error('Error enriching ingredients:', error);
    return [];
  }
}

function renderBlacksmithingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 1000px; max-height: 95vh; height: 95vh; overflow-y: auto; text-align: center; scrollbar-width:none;">
      <h2>Blacksmithing</h2>
                
      <div id="craft-result" style="margin-top: 4px; font-weight: bold;">Select materials and item type to begin forging</div>
      
      <div id="bonus-counter" style="margin-top: 0.5rem; font-size: 0.9rem; color: #FFD700; display: none;">
        Bonuses: <span id="bonus-assigned">0</span>/<span id="bonus-total">0</span> assigned
      </div>
      
      <div id="forging-area" style="margin: 2 rem 0;">
        <div class="forge-workspace">
          <div id="property-rows" style="margin: 1rem 0; display: flex; gap: 1rem; justify-content: center;">
            ${[0,1,2].map(i => createPropertyRowHTML(i)).join('')}
          </div>
        </div>
      </div>
      
      <div class="materials-section" style="margin-bottom: 1rem;">
        <div>
          <h3>Item Types</h3>
          <div id="item-types" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 8px; border: 1px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.5); scrollbar-width: none; max-height: 100px; min-height: 100px;">
            ${renderItemTypesHTML()}
          </div>
        </div>
        
        <div>
          <h3>Metal Bars</h3>
          <div id="available-bars" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 8px; border: 1px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.5); scrollbar-width: none; max-height: 100px; min-height: 100px;">
            ${renderBarsHTML()}
          </div>
        </div>
        
        <div>
          <h3>Enhancement Powders</h3>
          <div id="available-powders" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 8px; border: 1px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.5); scrollbar-width: none; max-height: 100px; min-height: 100px;">
            ${renderPowdersHTML()}
          </div>
        </div>
      </div>
      
      <div style="display: flex; justify-content: center; gap: 0.5rem;">
        <button class="fantasy-button message-ok-btn" style="flex: 1; max-width: 100px;">Close</button>
        <button id="craft-btn" class="fantasy-button" disabled style="flex: 1; max-width: 100px;">Forge</button>
        <button id="finish-btn" class="fantasy-button" disabled style="flex: 1; max-width: 100px; display: none;">Finish</button>
        <button id="claim-btn" class="fantasy-button" style="flex: 1; max-width: 100px; display: none;">Claim</button>
      </div>
    </div>

    <button id="helpBtn" class="help-tutorial-fantasy-button">?</button>

    <div id="helpModal" class="help-tutorial-modal">
        <div class="help-tutorial-modal-content">
            <span class="help-tutorial-close-btn">&times;</span>
            <h3 class="help-tutorial-modal-title">Tutorial</h3>
            <div class="help-tutorial-modal-body">
                <p class="mb-4">
                    Text
                </p>
                <p class="mb-4">
                    Text
                </p>
                <p>
                    Text
                </p>
            </div>
        </div>
    </div>
  `;
  document.body.appendChild(modal);
  setupBlacksmithingEventListeners(modal);
  setBackground(modal); 
}

function renderItemTypesHTML() {
  return ITEM_TYPES.map((itemType, idx) => `
    <div class="item-type-card" data-index="${idx}" style="flex: 0 0 auto; cursor: pointer; position: relative; border-radius: 8px; padding: 8px; background: rgba(139,69,19,0.2); border: 2px solid transparent; min-width: 70px; text-align: center; transition: all 0.2s ease;">
      <img src="assets/art/items/${itemType.sprite}.png" title="${itemType.name}" style="width: 48px; height: 48px;">
      <div style="font-size: 0.8rem; color: #c4975a; font-weight: bold; margin-top: 4px;">${itemType.name}</div>
    </div>
  `).join('');
}

function renderBarsHTML() {
  if (!forgingState.availableBars.length) {
    return '<div style="color: #666; font-style: italic; padding: 1rem;">No bars available</div>';
  }
  
  return forgingState.availableBars.map((bar, idx) => `
    <div class="material-item bar" data-index="${idx}" style="cursor: pointer; border-radius: 8px; padding: 8px; background: rgba(139, 69, 19, 0.2); border: 1px solid #8B4513; min-width: 80px; text-align: center; position: relative; flex: 0 0 auto;">
      <img src="assets/art/ingridients/${bar.sprite}.png" title="${bar.name} (${bar.amount})" style="width: 48px; height: 48px;">
      <div style="font-size: 0.8rem; margin-top: 4px; color: #FFD700; font-weight: bold;">x${bar.amount}</div>
      <div class="info-icon" data-bar="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #8B4513; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

function renderPowdersHTML() {
  if (!forgingState.availablePowders.length) {
    return '<div style="color: #666; font-style: italic; padding: 1rem;">No powders available</div>';
  }
  
  return forgingState.availablePowders.map((powder, idx) => `
    <div class="material-item powder" data-index="${idx}" style="cursor: pointer; border-radius: 8px; padding: 8px; background: rgba(139, 69, 19, 0.2); border: 1px solid #8B4513; min-width: 80px; text-align: center; position: relative; flex: 0 0 auto;">
      <img src="assets/art/ingridients/${powder.sprite}.png" title="${powder.name} (${powder.amount})" style="width: 48px; height: 48px;">
      <div style="font-size: 0.8rem; margin-top: 4px; color: #FFD700; font-weight: bold;">x${powder.amount}</div>
      <div class="rarity-indicator" style="position: absolute; top: -2px; left: -2px; width: 12px; height: 12px; background: ${RARITY_LEVELS[powder.name]?.color || '#666'}; border-radius: 50%; border: 1px solid #fff;"></div>
      <div class="info-icon" data-powder="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #8B4513; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

function createPropertyRowHTML(rowIndex) {
  return `
    <div class="property-display" style="width: 80px; height: 50px; background: linear-gradient(135deg, #654321 0%, #8B4513 50%, #A0522D 100%); border: 3px solid #FFD700; border-radius: 12px; display: flex; align-items: center; justify-content: center; position: relative; box-shadow: inset 0 2px 6px rgba(0,0,0,0.3); cursor: pointer; transition: all 0.2s ease;" data-row="${rowIndex}">
      <div class="property-text" style="font-size: 0.8rem; color: #FFD700; font-weight: bold; text-align: center;">-</div>
      <div class="bonus-counter" style="position: absolute; top: -8px; right: -8px; width: 20px; height: 20px; background: #FF4500; border-radius: 50%; color: white; font-size: 0.7rem; display: none; align-items: center; justify-content: center; font-weight: bold; border: 2px solid #fff;">0</div>
    </div>
  `;
}

function setBackground(modal) {
  const messageContent = modal.querySelector('.message-content');
  if (messageContent) {
    messageContent.style.backgroundSize = 'cover';
    messageContent.style.backgroundPosition = 'center';
    messageContent.style.backgroundRepeat = 'no-repeat';
    messageContent.style.backgroundImage = 'url(assets/art/professions/prof_background_blacksmith.png)';
  }
}

function removeBackground(modal) {
  const messageContent = modal.querySelector('.message-content');
  if (messageContent) {
    messageContent.style.backgroundSize = '';
    messageContent.style.backgroundPosition = '';
    messageContent.style.backgroundRepeat = '';
    messageContent.style.backgroundImage = '';
  }
}

function setupBlacksmithingEventListeners(modal) {
  const craftBtn = modal.querySelector('#craft-btn');
  const finishBtn = modal.querySelector('#finish-btn');
  const resultDiv = modal.querySelector('#craft-result');
  const bonusCounter = modal.querySelector('#bonus-counter');
  
  // Help modal elements
  const helpModal = modal.querySelector('#helpModal');
  const helpBtn = modal.querySelector('#helpBtn');
  const closeBtn = modal.querySelector('.help-tutorial-close-btn');

  // Help modal functions
  function openHelpModal() {
    helpModal.style.display = 'flex';
    setTimeout(() => {
      helpModal.classList.add('open');
    }, 10);
  }

  function closeHelpModal() {
    helpModal.classList.remove('open');
    setTimeout(() => {
      helpModal.style.display = 'none';
    }, 300);
  }

  // Help modal event listeners
  if (helpBtn) {
    helpBtn.addEventListener('click', openHelpModal);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeHelpModal);
  }

  // Close help modal when clicking outside or pressing Escape
  window.addEventListener('click', (event) => {
    if (event.target === helpModal) {
      closeHelpModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && helpModal && helpModal.style.display === 'flex') {
      closeHelpModal();
    }
  });

  // Existing event listeners
  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    removeBackground(modal);
    modal.remove();
    forgingState = null;
  });

  // Item type selection
  const itemTypesContainer = modal.querySelector('#item-types');
  itemTypesContainer.addEventListener('click', (e) => {
    const itemCard = e.target.closest('.item-type-card');
    if (itemCard && !forgingState.isCraftingStarted) {
      const idx = parseInt(itemCard.dataset.index);
      selectItemType(idx, modal);
    }
  });

  // Material selection
  const barsContainer = modal.querySelector('#available-bars');
  barsContainer.addEventListener('click', (e) => {
    const materialItem = e.target.closest('.material-item');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon?.dataset.bar) {
      e.stopPropagation();
      showMaterialProperties(forgingState.availableBars[parseInt(infoIcon.dataset.bar)]);
      return;
    }
    
    if (materialItem && !forgingState.isCraftingStarted) {
      const idx = parseInt(materialItem.dataset.index);
      selectBar(idx, modal);
    }
  });

  const powdersContainer = modal.querySelector('#available-powders');
  powdersContainer.addEventListener('click', (e) => {
    const materialItem = e.target.closest('.material-item');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon?.dataset.powder) {
      e.stopPropagation();
      showMaterialProperties(forgingState.availablePowders[parseInt(infoIcon.dataset.powder)]);
      return;
    }
    
    if (materialItem && !forgingState.isCraftingStarted) {
      const idx = parseInt(materialItem.dataset.index);
      selectPowder(idx, modal);
    }
  });

  // Property slot clicking for bonus assignment
  const forgingArea = modal.querySelector('#forging-area');
  forgingArea.addEventListener('click', (e) => {
    const propertyDisplay = e.target.closest('.property-display');
    if (propertyDisplay && forgingState.isCraftingStarted) {
      const rowIdx = parseInt(propertyDisplay.dataset.row);
      assignBonus(rowIdx, modal);
    }
  });

  craftBtn.addEventListener('click', async () => {
    await startForging(modal);
  });

  finishBtn.addEventListener('click', async () => {
    finishBtn.disabled = true;
    await finishForging(resultDiv);
  });
}

function selectItemType(typeIndex, modal) {
  // Clear previous selection
  modal.querySelectorAll('.item-type-card').forEach(card => {
    card.style.border = '2px solid transparent';
    card.style.background = 'rgba(139,69,19,0.2)';
  });

  // Highlight selected
  const selectedCard = modal.querySelector(`.item-type-card[data-index="${typeIndex}"]`);
  selectedCard.style.border = '2px solid #FFD700';
  selectedCard.style.background = 'rgba(255,215,0,0.2)';

  forgingState.selectedItemType = ITEM_TYPES[typeIndex];
  updateCraftButtonState(modal);
}

function selectBar(barIndex, modal) {
  // Clear previous selection
  modal.querySelectorAll('.bar').forEach(item => {
    item.style.border = '1px solid #8B4513';
  });

  // Highlight selected
  const selectedBar = modal.querySelector(`.bar[data-index="${barIndex}"]`);
  selectedBar.style.border = '2px solid #FFD700';

  forgingState.selectedBar = forgingState.availableBars[barIndex];
  updateCraftButtonState(modal);
}

function selectPowder(powderIndex, modal) {
  // Clear previous selection
  modal.querySelectorAll('.powder').forEach(item => {
    item.style.border = '1px solid #8B4513';
  });

  // Highlight selected
  const selectedPowder = modal.querySelector(`.powder[data-index="${powderIndex}"]`);
  selectedPowder.style.border = '2px solid #FFD700';

  forgingState.selectedPowder = forgingState.availablePowders[powderIndex];
  
  const rarity = RARITY_LEVELS[forgingState.selectedPowder.name];
  if (rarity) {
    forgingState.maxBonuses = rarity.bonuses;
  }
  
  updateCraftButtonState(modal);
}

function updateCraftButtonState(modal) {
  const craftBtn = modal.querySelector('#craft-btn');
  const resultDiv = modal.querySelector('#craft-result');
  
  if (forgingState.selectedItemType && forgingState.selectedBar && forgingState.selectedPowder) {
    craftBtn.disabled = false;
    const rarity = RARITY_LEVELS[forgingState.selectedPowder.name];
    resultDiv.textContent = `Ready to forge ${rarity.name} ${forgingState.selectedBar.name.replace(' Bar', '')} ${forgingState.selectedItemType.name}!`;
  } else {
    craftBtn.disabled = true;
    const missing = [];
    if (!forgingState.selectedItemType) missing.push('item type');
    if (!forgingState.selectedBar) missing.push('metal bar');
    if (!forgingState.selectedPowder) missing.push('powder');
    resultDiv.textContent = `Select ${missing.join(', ')} to begin forging`;
  }
}

async function startForging(modal) {
  try {
    forgingState.isCraftingStarted = true;
    
    const craftBtn = modal.querySelector('#craft-btn');
    const finishBtn = modal.querySelector('#finish-btn');
    const resultDiv = modal.querySelector('#craft-result');
    const bonusCounter = modal.querySelector('#bonus-counter');
    
    craftBtn.style.display = 'none';
    resultDiv.textContent = 'Heating materials in the forge...';

    // Reserve ingredients
    const reserveRes = await context.apiCall('/functions/v1/reserve_blacksmith_ingredients', {
      method: 'POST',
      body: {
        player_id: context.profile.id,
        profession_id: forgingState.professionId,
        selected_bar: forgingState.selectedBar.name,
        selected_powder: forgingState.selectedPowder.name,
        item_name: forgingState.selectedItemType.name,
        item_type: forgingState.selectedItemType.type 
      }
    });

    const reserveJson = await reserveRes.json();
    
    if (!reserveRes.ok || !reserveJson.success) {
      resultDiv.textContent = `Material verification failed: ${reserveJson?.error || 'Unknown error'}`;
      return;
    }

    forgingState.sessionId = reserveJson.session_id;
    forgingState.barProperties = reserveJson.bar_properties;

    // Animate forge heatup
    await animateForgeHeatup(modal);

    // Show bonus counter
    bonusCounter.style.display = 'block';
    modal.querySelector('#bonus-total').textContent = forgingState.maxBonuses;

    finishBtn.style.display = 'block';
    finishBtn.disabled = false;
    
    resultDiv.textContent = forgingState.maxBonuses > 0 ? 
      'Click properties to assign bonus stats!' : 
      'Basic item ready - click Finish to complete!';

    // Disable material selection
    modal.querySelector('#available-bars').style.opacity = '0.5';
    modal.querySelector('#available-bars').style.pointerEvents = 'none';
    modal.querySelector('#available-powders').style.opacity = '0.5';
    modal.querySelector('#available-powders').style.pointerEvents = 'none';
    modal.querySelector('#item-types').style.opacity = '0.5';
    modal.querySelector('#item-types').style.pointerEvents = 'none';

  } catch (error) {
    const resultDiv = modal.querySelector('#craft-result');
    resultDiv.textContent = 'Forge malfunction! Please try again.';
  }
}

async function animateForgeHeatup(modal) {
  console.log('=== ANIMATE FORGE HEATUP DEBUG ===');
  const propertyDisplays = modal.querySelectorAll('.property-display');
  console.log('Property displays found:', propertyDisplays.length);
  
  for (let i = 0; i < propertyDisplays.length; i++) {
    const propertyDisplay = propertyDisplays[i];
    const propertyText = propertyDisplay.querySelector('.property-text');
    const properties = forgingState.barProperties[i];
    
    console.log(`Property ${i} properties:`, properties);
    
    // Animate heating effect
    createSparkEffect(propertyDisplay);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Populate property with the center property (index 1)
    if (typeof gsap !== 'undefined') {
      gsap.to(propertyText, {
        opacity: 1,
        scale: 1,
        duration: 0.6,
        ease: "back.out(1.2)",
        onStart: () => {
          propertyText.textContent = properties[1]; // Only show center property
        }
      });
    } else {
      // Fallback without GSAP
      propertyText.textContent = properties[1];
    }
    
    // Enable property display if bonuses available
    if (forgingState.maxBonuses > 0) {
      console.log(`Property ${i} enabling bonus counter`);
      
      // Make sure bonus counter exists and is visible
      let bonusCounter = propertyDisplay.querySelector('.bonus-counter');
      console.log(`Property ${i} existing bonus counter:`, bonusCounter);
      
      if (!bonusCounter) {
        console.log(`Creating bonus counter for property ${i}`);
        bonusCounter = document.createElement('div');
        bonusCounter.className = 'bonus-counter';
        bonusCounter.style.cssText = `
          position: absolute; 
          top: -8px; 
          right: -8px; 
          width: 20px; 
          height: 20px; 
          background: #FF4500; 
          border-radius: 50%; 
          color: white; 
          font-size: 0.7rem; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-weight: bold; 
          border: 2px solid #fff;
        `;
        bonusCounter.textContent = '0';
        propertyDisplay.appendChild(bonusCounter);
      } else {
        bonusCounter.style.display = 'flex';
      }
      
      console.log(`Property ${i} final bonus counter:`, bonusCounter);
    }
  }
  console.log('=== END ANIMATE FORGE HEATUP DEBUG ===');
}

function assignBonus(rowIdx, modal) {
  console.log('=== ASSIGN BONUS DEBUG ===');
  console.log('rowIdx:', rowIdx);
  console.log('forgingState.totalAssigned:', forgingState.totalAssigned);
  console.log('forgingState.maxBonuses:', forgingState.maxBonuses);
  
  if (forgingState.totalAssigned >= forgingState.maxBonuses) {
    console.log('Max bonuses reached, returning');
    return;
  }

  forgingState.bonusAssignments[rowIdx]++;
  forgingState.totalAssigned++;

  const propertyDisplay = modal.querySelector(`[data-row="${rowIdx}"]`);
  console.log('Property display found:', propertyDisplay);
  
  const bonusCounterEl = propertyDisplay?.querySelector('.bonus-counter');
  console.log('Bonus counter element found:', bonusCounterEl);
  
  // Update bonus counter display - ADD NULL CHECK
  if (bonusCounterEl) {
    bonusCounterEl.textContent = forgingState.bonusAssignments[rowIdx];
  } else {
    console.error('Bonus counter element not found! Creating it...');
    // Create the bonus counter if it doesn't exist
    if (propertyDisplay) {
      const newBonusCounter = document.createElement('div');
      newBonusCounter.className = 'bonus-counter';
      newBonusCounter.style.cssText = `
        position: absolute; 
        top: -8px; 
        right: -8px; 
        width: 20px; 
        height: 20px; 
        background: #FF4500; 
        border-radius: 50%; 
        color: white; 
        font-size: 0.7rem; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        font-weight: bold; 
        border: 2px solid #fff;
      `;
      newBonusCounter.textContent = forgingState.bonusAssignments[rowIdx];
      propertyDisplay.appendChild(newBonusCounter);
    }
  }
  
  // Update total counter with null checks
  const bonusAssignedEl = modal.querySelector('#bonus-assigned');
  const bonusTotalEl = modal.querySelector('#bonus-total');
  
  console.log('Bonus assigned element:', bonusAssignedEl);
  console.log('Bonus total element:', bonusTotalEl);
  
  if (bonusAssignedEl) {
    bonusAssignedEl.textContent = forgingState.totalAssigned;
  }
  
  if (bonusTotalEl) {
    bonusTotalEl.textContent = forgingState.maxBonuses;
  }
  
  // Visual feedback
  if (propertyDisplay) {
    createHammerStrike(propertyDisplay);
    
    // Animation with fallback
    if (typeof gsap !== 'undefined') {
      gsap.to(propertyDisplay, {
        backgroundColor: 'rgba(255,69,0,0.6)',
        duration: 0.2,
        ease: "power2.out",
        yoyo: true,
        repeat: 1
      });
    } else {
      propertyDisplay.style.backgroundColor = 'rgba(255,69,0,0.6)';
      setTimeout(() => {
        propertyDisplay.style.backgroundColor = '';
      }, 400);
    }
  }
  
  // Update result text
  const resultDiv = modal.querySelector('#craft-result');
  if (resultDiv) {
    const remaining = forgingState.maxBonuses - forgingState.totalAssigned;
    if (remaining > 0) {
      resultDiv.textContent = `${remaining} bonus${remaining !== 1 ? 'es' : ''} remaining - keep clicking properties!`;
    } else {
      resultDiv.textContent = 'All bonuses assigned! Click Finish to complete your masterwork!';
    }
  }
  
  console.log('=== END ASSIGN BONUS DEBUG ===');
}

function createSparkEffect(element) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  for (let i = 0; i < 8; i++) {
    const spark = document.createElement('div');
    spark.style.cssText = `
      position: fixed;
      width: 3px;
      height: 10px;
      background: linear-gradient(to bottom, #FFD700, #FFA500);
      left: ${centerX}px;
      top: ${centerY}px;
      pointer-events: none;
      z-index: 1000;
      border-radius: 2px;
    `;
    
    document.body.appendChild(spark);
    
    const angle = (i / 8) * Math.PI * 2;
    const distance = Math.random() * 30 + 20;
    const finalX = centerX + Math.cos(angle) * distance;
    const finalY = centerY + Math.sin(angle) * distance;
    
    if (typeof gsap !== 'undefined') {
      gsap.to(spark, {
        x: finalX - centerX,
        y: finalY - centerY,
        rotation: Math.random() * 180,
        opacity: 0,
        duration: Math.random() * 0.8 + 0.5,
        ease: "power2.out",
        onComplete: () => spark.remove()
      });
    } else {
      setTimeout(() => spark.remove(), 800);
    }
  }
}

function createHammerStrike(element) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  // Create impact effect
  for (let i = 0; i < 5; i++) {
    const impact = document.createElement('div');
    impact.style.cssText = `
      position: fixed;
      width: 4px;
      height: 4px;
      background: #FF4500;
      border-radius: 50%;
      left: ${centerX}px;
      top: ${centerY}px;
      pointer-events: none;
      z-index: 1001;
    `;
    
    document.body.appendChild(impact);
    
    if (typeof gsap !== 'undefined') {
      gsap.to(impact, {
        x: (Math.random() - 0.5) * 30,
        y: (Math.random() - 0.5) * 30,
        opacity: 0,
        duration: 0.5,
        ease: "power2.out",
        onComplete: () => impact.remove()
      });
    } else {
      setTimeout(() => impact.remove(), 500);
    }
  }
  
  // Shake effect
  if (typeof gsap !== 'undefined') {
    gsap.to(element, {
      y: '+=2',
      duration: 0.1,
      ease: "power2.inOut",
      yoyo: true,
      repeat: 3
    });
  }
}

async function finishForging(resultDiv) {
  try {
    const payload = {
      player_id: context.profile.id,
      profession_id: forgingState.professionId,
      session_id: forgingState.sessionId,
      bonus_assignments: forgingState.bonusAssignments
    };
    
    const res = await context.apiCall('/functions/v1/craft_blacksmith', {
      method: 'POST',
      body: payload
    });

    const json = await res.json();
    
    if (!res.ok) {
      resultDiv.innerHTML = `
        <span style="color:red;">🔥 Forging Error (${res.status})</span>
        <br><small style="color:#999;">${json.error || json.message || 'Unknown server error'}</small>
      `;
      
      const finishBtn = document.querySelector('#finish-btn');
      if (finishBtn) finishBtn.disabled = false;
      return; 
    }

    const claimBtn = document.querySelector('#claim-btn');
    const finishBtn = document.querySelector('#finish-btn');
    const craftBtn = document.querySelector('#craft-btn');

    if (json.success) {
      forgingState.result = json.crafted.name;
      resultDiv.innerHTML = `<span style="color:lime;">🔨 Successfully forged: <strong>${json.crafted.name}</strong>!</span>`;

      animateSuccessfulForging();

      if (finishBtn) finishBtn.style.display = 'none';
      if (claimBtn) {
        claimBtn.style.display = 'block';
        claimBtn.disabled = false;
        
        const newClaimBtn = claimBtn.cloneNode(true);
        claimBtn.parentNode.replaceChild(newClaimBtn, claimBtn);
        
        newClaimBtn.addEventListener('click', () => {
          context.displayMessage(`${json.crafted.name} added to your bank!`);
          document.querySelector('.custom-message-box')?.remove();
          forgingState = null;
        });
      }
    } else {
      forgingState.result = 'Failed';
      resultDiv.innerHTML = `
        <span style="color:red;">💥 Forging failed — materials ruined.</span>
        <br><small style="color:#999;">${json.message || 'Something went wrong in the forge'}</small>
      `;

      animateFailedForging();

      if (finishBtn) finishBtn.style.display = 'none';
      if (claimBtn) claimBtn.style.display = 'none';
      
      if (craftBtn) {
        craftBtn.style.display = 'block';
        craftBtn.textContent = 'Forge Again';
        craftBtn.disabled = false;
        
        const newCraftBtn = craftBtn.cloneNode(true);
        craftBtn.parentNode.replaceChild(newCraftBtn, craftBtn);
        
        newCraftBtn.addEventListener('click', () => {
          document.querySelector('.custom-message-box')?.remove();
          startCraftingSession(context);
        });
      }
    }
  } catch (err) {
    resultDiv.innerHTML = '<span style="color:red;">⚠️ Forge malfunction. Try again later.</span>';
    
    const finishBtn = document.querySelector('#finish-btn');
    const claimBtn = document.querySelector('#claim-btn');
    const craftBtn = document.querySelector('#craft-btn');
    
    if (finishBtn) finishBtn.style.display = 'none';
    if (claimBtn) claimBtn.style.display = 'none';
    
    if (craftBtn) {
      craftBtn.style.display = 'block';
      craftBtn.textContent = 'Try Again';
      craftBtn.disabled = false;
      
      const newCraftBtn = craftBtn.cloneNode(true);
      craftBtn.parentNode.replaceChild(newCraftBtn, craftBtn);
      
      newCraftBtn.addEventListener('click', () => {
        document.querySelector('.custom-message-box')?.remove();
        startCraftingSession(context);
      });
    }
  }
}

function animateSuccessfulForging() {
  document.querySelectorAll('.property-display').forEach((display, index) => {
    setTimeout(() => {
      createSuccessGlow(display);
      createGoldenSparks(display);
    }, index * 200);
  });
  
  const forgeWorkspace = document.querySelector('.forge-workspace');
  if (forgeWorkspace && typeof gsap !== 'undefined') {
    gsap.to(forgeWorkspace, {
      boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.3), 0 8px 24px rgba(255,215,0,0.4)',
      duration: 1,
      ease: "power2.out"
    });
  }
}

function animateFailedForging() {
  document.querySelectorAll('.property-display').forEach((display, index) => {
    setTimeout(() => {
      if (typeof gsap !== 'undefined') {
        gsap.to(display, {
          x: '+=5',
          duration: 0.1,
          ease: "power2.inOut",
          yoyo: true,
          repeat: 5
        });
      }
      createSmokeEffect(display);
    }, index * 100);
  });
}

function createSuccessGlow(element) {
  if (typeof gsap !== 'undefined') {
    gsap.to(element, {
      boxShadow: '0 0 30px rgba(255,215,0,0.8), inset 0 0 15px rgba(255,215,0,0.3)',
      duration: 1,
      ease: "power2.out",
      yoyo: true,
      repeat: 2
    });
  }
}

function createGoldenSparks(element) {
  for (let i = 0; i < 12; i++) {
    const spark = document.createElement('div');
    spark.style.cssText = `
      position: absolute;
      width: 6px;
      height: 6px;
      background: linear-gradient(45deg, #FFD700, #FFA500);
      border-radius: 50%;
      top: 50%;
      left: 50%;
      pointer-events: none;
      z-index: 30;
    `;
    
    element.appendChild(spark);
    
    const angle = (i / 12) * Math.PI * 2;
    const distance = 50;
    
    if (typeof gsap !== 'undefined') {
      gsap.to(spark, {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        opacity: 0,
        scale: 0,
        duration: 1.2,
        ease: "power2.out",
        onComplete: () => spark.remove()
      });
    } else {
      setTimeout(() => spark.remove(), 1200);
    }
  }
}

function createSmokeEffect(element) {
  for (let i = 0; i < 6; i++) {
    const smoke = document.createElement('div');
    smoke.style.cssText = `
      position: absolute;
      width: ${Math.random() * 8 + 4}px;
      height: ${Math.random() * 8 + 4}px;
      background: rgba(64,64,64,0.7);
      border-radius: 50%;
      top: 50%;
      left: ${Math.random() * 100}%;
      pointer-events: none;
      z-index: 25;
    `;
    
    element.appendChild(smoke);
    
    if (typeof gsap !== 'undefined') {
      gsap.to(smoke, {
        y: -40,
        x: `+=${Math.random() * 40 - 20}`,
        opacity: 0,
        scale: Math.random() * 1.5 + 0.5,
        duration: Math.random() * 2 + 1.5,
        ease: "power1.out",
        onComplete: () => smoke.remove()
      });
    } else {
      setTimeout(() => smoke.remove(), 2000);
    }
  }
}

function showMaterialProperties(material) {
  const propsModal = document.createElement('div');
  propsModal.className = 'custom-message-box';
  propsModal.style.zIndex = '10001';
  
  let propertiesDisplay = '';
  if (typeof material.properties === 'object' && material.properties !== null) {
    if (Array.isArray(material.properties)) {
      propertiesDisplay = material.properties.map((prop, idx) => 
        `<div class="property-item" style="background: rgba(139,69,19,0.2); padding: 0.5rem; border-radius: 4px; margin-bottom: 0.3rem;">
          <strong>Property ${idx + 1}:</strong> ${prop}
        </div>`
      ).join('');
    } else {
      propertiesDisplay = Object.entries(material.properties).map(([key, value]) => 
        `<div class="property-item" style="background: rgba(139,69,19,0.2); padding: 0.5rem; border-radius: 4px; margin-bottom: 0.3rem;">
          <strong>${key.toUpperCase()}:</strong> ${value}
        </div>`
      ).join('');
    }
  } else {
    propertiesDisplay = '<div style="color: #999; font-style: italic;">No properties available</div>';
  }
  
  // Add rarity info for powders
  let rarityInfo = '';
  if (material.name.includes('Powder')) {
    const rarity = RARITY_LEVELS[material.name];
    if (rarity) {
      rarityInfo = `
        <div style="background: ${rarity.color}20; border: 1px solid ${rarity.color}; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: center;">
          <div style="color: ${rarity.color}; font-weight: bold; font-size: 1.1rem;">${rarity.name} Quality</div>
          <div style="color: #fff; font-size: 0.9rem; margin-top: 0.5rem;">
            Grants ${rarity.bonuses} bonus stat${rarity.bonuses !== 1 ? 's' : ''}
          </div>
        </div>
      `;
    }
  }
  
  propsModal.innerHTML = `
    <div class="message-content" style="max-width: 350px; text-align: center; scrollbar-width:none;">
      <h3 style="margin-bottom: 1rem;">${material.name}</h3>
      <img src="assets/art/ingridients/${material.sprite}.png" alt="${material.name}" style="width: 80px; height: 80px; border-radius: 8px; margin-bottom: 1rem;">
      
      ${rarityInfo}
      
      <div style="background: rgba(139,69,19,0.3); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
        <h4 style="color: #FFD700; margin-bottom: 0.8rem; text-align: center;">Properties:</h4>
        ${propertiesDisplay}
      </div>
      
      <div style="background: rgba(255,255,255,0.1); border-radius: 6px; padding: 0.6rem; margin-bottom: 1rem; font-size: 0.9rem;">
        <strong>Available:</strong> ${material.amount} units
      </div>
      
      <button class="fantasy-button close-props-btn" style="width: 100%;">Close</button>
    </div>
  `;
  
  document.body.appendChild(propsModal);
  
  propsModal.querySelector('.close-props-btn').addEventListener('click', () => propsModal.remove());
  propsModal.addEventListener('click', (e) => {
    if (e.target === propsModal) propsModal.remove();
  });
}

function injectBlacksmithingCSS() {
  if (document.getElementById('blacksmithing-css')) return;
  
  const css = `
    .property-display:active {
      transform: scale(0.95);
    }

    .bonus-counter {
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }

    .property-display {
      transition: all 0.3s ease;
      will-change: transform, background-color;
    }

    .rarity-indicator {
      animation: rarity-glow 2s infinite ease-in-out;
    }

    @keyframes rarity-glow {
      0%, 100% { opacity: 0.8; }
      50% { opacity: 1; }
    }
  `;

  const style = document.createElement('style');
  style.id = 'blacksmithing-css';
  style.textContent = css;
  document.head.appendChild(style);
}
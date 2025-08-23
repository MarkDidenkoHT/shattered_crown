let context = null;
let forgingState = null;
let ingredientCache = new Map();

const ITEM_TYPES = [
  { name: 'Armor', type: 'Armor', sprite: 'armor' },
  { name: 'Boots', type: 'Armor', sprite: 'boots' },
  { name: 'Gloves', type: 'Armor', sprite: 'gloves' },
  { name: 'Helmet', type: 'Armor', sprite: 'helmet' },
  { name: 'Sword', type: 'Weapon', sprite: 'sword' },
  { name: 'Axe', type: 'Weapon', sprite: 'axe' },
  { name: 'Mace', type: 'Weapon', sprite: 'mace' }
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
    
    const enriched = await batchEnrichIngredients(bankItems);
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

async function batchEnrichIngredients(bankItems) {
  if (!bankItems.length) return [];
  
  const itemNames = bankItems.map(item => item.item);
  const uniqueNames = [...new Set(itemNames)];
  const uncachedNames = uniqueNames.filter(name => !ingredientCache.has(name));
  
  if (uncachedNames.length > 0) {
    const namesQuery = uncachedNames.map(name => encodeURIComponent(name)).join(',');
    
    try {
      const response = await context.apiCall(`/api/supabase/rest/v1/ingridients?name=in.(${namesQuery})&select=name,properties,sprite`);
      const ingredients = await response.json();
      ingredients.forEach(ingredient => ingredientCache.set(ingredient.name, ingredient));
    } catch (error) {
      return await fallbackEnrichIngredients(bankItems);
    }
  }
  
  const enriched = [];
  for (const item of bankItems) {
    const cachedIngredient = ingredientCache.get(item.item);
    if (cachedIngredient) {
      enriched.push({
        name: item.item,
        amount: item.amount,
        properties: cachedIngredient.properties,
        sprite: cachedIngredient.sprite,
      });
    }
  }
  
  return enriched;
}

async function fallbackEnrichIngredients(bankItems) {
  const enriched = [];
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < bankItems.length; i += BATCH_SIZE) {
    const batch = bankItems.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (item) => {
      try {
        const res = await context.apiCall(`/api/supabase/rest/v1/ingridients?name=eq.${encodeURIComponent(item.item)}&select=properties,sprite`);
        const [ingredient] = await res.json();
        
        if (ingredient) {
          return {
            name: item.item,
            amount: item.amount,
            properties: ingredient.properties,
            sprite: ingredient.sprite,
          };
        }
      } catch (error) {
        // Silently continue on error
      }
      return null;
    });
    
    const batchResults = await Promise.all(batchPromises);
    enriched.push(...batchResults.filter(Boolean));
    
    if (i + BATCH_SIZE < bankItems.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  return enriched;
}

function renderBlacksmithingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 1000px; max-height: 99vh; overflow-y: auto; text-align: center; scrollbar-width:none;">
      <h2>Blacksmithing: Forge of Creation</h2>
                
      <div id="craft-result" style="margin-top: 4px; font-weight: bold;">Select materials and item type to begin forging</div>
      
      <div id="bonus-counter" style="margin-top: 0.5rem; font-size: 0.9rem; color: #FFD700; display: none;">
        Bonuses: <span id="bonus-assigned">0</span>/<span id="bonus-total">0</span> assigned
      </div>
      
      <div id="item-type-selection" style="margin: 1.5rem 0;">
        <h3>Select Item Type</h3>
        <div id="item-types" style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-bottom: 1rem;">
          ${renderItemTypesHTML()}
        </div>
      </div>
      
      <div id="forging-area" style="margin: 1.5rem 0; display: none;">
        <div class="forge-workspace" style="background: linear-gradient(135deg, #8B4513 0%, #A0522D 50%, #CD853F 100%); border: 3px solid #654321; border-radius: 20px; padding: 1.5rem; position: relative; box-shadow: inset 0 4px 12px rgba(0,0,0,0.3), 0 8px 16px rgba(0,0,0,0.2);">
          <div class="forge-fire" style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); width: 60px; height: 20px; background: linear-gradient(45deg, #FF4500, #FFA500, #FFD700); border-radius: 50%; box-shadow: 0 0 20px rgba(255,69,0,0.6); animation: flicker 2s infinite ease-in-out;"></div>
          
          <div id="property-rows" style="margin: 1rem 0;">
            ${[0,1,2].map(i => createPropertyRowHTML(i)).join('')}
          </div>
        </div>
      </div>
      
      <div class="materials-section" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
        <div>
          <h3>Metal Bars</h3>
          <div id="available-bars" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; border: 1px solid #444; border-radius: 8px; background: rgba(139,69,19,0.1); scrollbar-width: none; max-height: 85px;">
            ${renderBarsHTML()}
          </div>
        </div>
        
        <div>
          <h3>Enhancement Powders</h3>
          <div id="available-powders" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; border: 1px solid #444; border-radius: 8px; background: rgba(139,69,19,0.1); scrollbar-width: none; max-height: 85px;">
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
  `;
  document.body.appendChild(modal);
  setupBlacksmithingEventListeners(modal);
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
    <div class="material-item bar" data-index="${idx}" style="flex: 0 0 auto; cursor: pointer; position: relative; border-radius: 4px; padding: 4px; background: rgba(139,69,19,0.05); border: 2px solid transparent;">
      <img src="assets/art/ingridients/${bar.sprite}.png" title="${bar.name} (${bar.amount})" style="width: 48px; height: 48px;">
      <div style="font-size: 0.8rem;">x${bar.amount}</div>
      <div class="info-icon" data-bar="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #8B4513; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

function renderPowdersHTML() {
  if (!forgingState.availablePowders.length) {
    return '<div style="color: #666; font-style: italic; padding: 1rem;">No powders available</div>';
  }
  
  return forgingState.availablePowders.map((powder, idx) => `
    <div class="material-item powder" data-index="${idx}" style="flex: 0 0 auto; cursor: pointer; position: relative; border-radius: 4px; padding: 4px; background: rgba(139,69,19,0.05); border: 2px solid transparent;">
      <img src="assets/art/ingridients/${powder.sprite}.png" title="${powder.name} (${powder.amount})" style="width: 48px; height: 48px;">
      <div style="font-size: 0.8rem;">x${powder.amount}</div>
      <div class="rarity-indicator" style="position: absolute; top: -2px; left: -2px; width: 12px; height: 12px; background: ${RARITY_LEVELS[powder.name]?.color || '#666'}; border-radius: 50%; border: 1px solid #fff;"></div>
      <div class="info-icon" data-powder="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #8B4513; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

function createPropertyRowHTML(rowIndex) {
  return `
    <div class="property-row" data-row="${rowIndex}" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; justify-content: center;">
      <div class="property-display" style="width: 320px; height: 60px; background: linear-gradient(135deg, #654321 0%, #8B4513 50%, #A0522D 100%); border: 2px solid #543528; border-radius: 12px; display: flex; align-items: center; position: relative; box-shadow: inset 0 2px 6px rgba(0,0,0,0.3);">
        <div class="property-slot prop-left" style="position: absolute; left: 20px; top: 50%; transform: translateY(-50%); width: 80px; height: 40px; border: 2px solid #8B4513; border-radius: 6px; background: rgba(139,69,19,0.6); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #FFD700; font-weight: bold;">-</div>

        <div class="property-slot prop-center clickable" data-row="${rowIndex}" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 80px; height: 40px; border: 3px solid #FFD700; border-radius: 6px; background: linear-gradient(135deg, rgba(255,215,0,0.8) 0%, rgba(255,215,0,0.6) 100%); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #8B4513; font-weight: bold; cursor: pointer; transition: all 0.2s ease; position: relative;">
          -
          <div class="bonus-counter" style="position: absolute; top: -8px; right: -8px; width: 20px; height: 20px; background: #FF4500; border-radius: 50%; color: white; font-size: 0.7rem; display: none; align-items: center; justify-content: center; font-weight: bold; border: 2px solid #fff;">0</div>
        </div>

        <div class="property-slot prop-right" style="position: absolute; right: 20px; top: 50%; transform: translateY(-50%); width: 80px; height: 40px; border: 2px solid #8B4513; border-radius: 6px; background: rgba(139,69,19,0.6); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #FFD700; font-weight: bold;">-</div>
      </div>
    </div>
  `;
}

function setupBlacksmithingEventListeners(modal) {
  const craftBtn = modal.querySelector('#craft-btn');
  const finishBtn = modal.querySelector('#finish-btn');
  const resultDiv = modal.querySelector('#craft-result');
  const bonusCounter = modal.querySelector('#bonus-counter');

  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
    forgingState = null;
    ingredientCache.clear();
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
    const centerSlot = e.target.closest('.prop-center.clickable');
    if (centerSlot && forgingState.isCraftingStarted) {
      const rowIdx = parseInt(centerSlot.dataset.row);
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
  const selectedCard = modal.querySelector(`[data-index="${typeIndex}"]`);
  selectedCard.style.border = '2px solid #FFD700';
  selectedCard.style.background = 'rgba(255,215,0,0.2)';

  forgingState.selectedItemType = ITEM_TYPES[typeIndex];
  updateCraftButtonState(modal);
}

function selectBar(barIndex, modal) {
  // Clear previous selection
  modal.querySelectorAll('.bar').forEach(item => {
    item.style.border = '2px solid transparent';
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
    item.style.border = '2px solid transparent';
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
    const forgingArea = modal.querySelector('#forging-area');
    
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
        item_type: forgingState.selectedItemType.name
      }
    });

    const reserveJson = await reserveRes.json();
    
    if (!reserveRes.ok || !reserveJson.success) {
      resultDiv.textContent = `Material verification failed: ${reserveJson?.error || 'Unknown error'}`;
      return;
    }

    forgingState.sessionId = reserveJson.session_id;
    forgingState.barProperties = reserveJson.bar_properties;

    // Show forging area and populate properties
    forgingArea.style.display = 'block';
    await animateForgeHeatup(modal);

    // Show bonus counter
    bonusCounter.style.display = 'block';
    modal.querySelector('#bonus-total').textContent = forgingState.maxBonuses;

    finishBtn.style.display = 'block';
    finishBtn.disabled = false;
    
    resultDiv.textContent = forgingState.maxBonuses > 0 ? 
      'Click center properties to assign bonus stats!' : 
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
  const rows = modal.querySelectorAll('.property-row');
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const slots = row.querySelectorAll('.property-slot');
    const properties = forgingState.barProperties[i];
    
    // Animate heating effect
    createSparkEffect(row);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Populate properties with animation
    gsap.to(slots, {
      opacity: 1,
      scale: 1,
      duration: 0.6,
      stagger: 0.1,
      ease: "back.out(1.2)",
      onStart: () => {
        slots[0].textContent = properties[0];
        slots[1].textContent = properties[1];
        slots[2].textContent = properties[2];
      }
    });
    
    // Enable center slot if bonuses available
    if (forgingState.maxBonuses > 0) {
      const centerSlot = row.querySelector('.prop-center');
      centerSlot.classList.add('clickable');
      const bonusCounter = centerSlot.querySelector('.bonus-counter');
      bonusCounter.style.display = 'flex';
    }
  }
}

function assignBonus(rowIdx, modal) {
  if (forgingState.totalAssigned >= forgingState.maxBonuses) {
    return;
  }

  forgingState.bonusAssignments[rowIdx]++;
  forgingState.totalAssigned++;

  const row = modal.querySelector(`[data-row="${rowIdx}"]`);
  const centerSlot = row.querySelector('.prop-center');
  const bonusCounterEl = centerSlot.querySelector('.bonus-counter');
  
  // Update bonus counter display
  bonusCounterEl.textContent = forgingState.bonusAssignments[rowIdx];
  
  // Update total counter
  modal.querySelector('#bonus-assigned').textContent = forgingState.totalAssigned;
  
  // Visual feedback
  createHammerStrike(centerSlot);
  
  gsap.to(centerSlot, {
    backgroundColor: 'rgba(255,69,0,0.6)',
    duration: 0.2,
    ease: "power2.out",
    yoyo: true,
    repeat: 1
  });
}

function createSparkEffect(row) {
  const rect = row.getBoundingClientRect();
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
    
    gsap.to(spark, {
      x: finalX - centerX,
      y: finalY - centerY,
      rotation: Math.random() * 180,
      opacity: 0,
      duration: Math.random() * 0.8 + 0.5,
      ease: "power2.out",
      onComplete: () => spark.remove()
    });
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
    
    gsap.to(impact, {
      x: (Math.random() - 0.5) * 30,
      y: (Math.random() - 0.5) * 30,
      opacity: 0,
      duration: 0.5,
      ease: "power2.out",
      onComplete: () => impact.remove()
    });
  }
  
  // Shake effect
  gsap.to(element, {
    y: '+=2',
    duration: 0.1,
    ease: "power2.inOut",
    yoyo: true,
    repeat: 3
  });
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
  document.querySelectorAll('.prop-center').forEach((slot, index) => {
    setTimeout(() => {
      createSuccessGlow(slot);
      createGoldenSparks(slot);
    }, index * 200);
  });
  
  const forgeWorkspace = document.querySelector('.forge-workspace');
  if (forgeWorkspace) {
    gsap.to(forgeWorkspace, {
      boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.3), 0 8px 24px rgba(255,215,0,0.4)',
      duration: 1,
      ease: "power2.out"
    });
  }
}

function animateFailedForging() {
  document.querySelectorAll('.property-row').forEach((row, index) => {
    setTimeout(() => {
      gsap.to(row, {
        x: '+=5',
        duration: 0.1,
        ease: "power2.inOut",
        yoyo: true,
        repeat: 5
      });
      createSmokeEffect(row);
    }, index * 100);
  });
}

function createSuccessGlow(element) {
  gsap.to(element, {
    boxShadow: '0 0 30px rgba(255,215,0,0.8), inset 0 0 15px rgba(255,215,0,0.3)',
    duration: 1,
    ease: "power2.out",
    yoyo: true,
    repeat: 2
  });
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
    
    gsap.to(spark, {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      opacity: 0,
      scale: 0,
      duration: 1.2,
      ease: "power2.out",
      onComplete: () => spark.remove()
    });
  }
}

function createSmokeEffect(row) {
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
    
    row.appendChild(smoke);
    
    gsap.to(smoke, {
      y: -40,
      x: `+=${Math.random() * 40 - 20}`,
      opacity: 0,
      scale: Math.random() * 1.5 + 0.5,
      duration: Math.random() * 2 + 1.5,
      ease: "power1.out",
      onComplete: () => smoke.remove()
    });
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
      <h3 style="color: #8B4513; margin-bottom: 1rem;">${material.name}</h3>
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
    @keyframes flicker {
      0%, 100% { opacity: 0.8; transform: translateX(-50%) scale(1); }
      50% { opacity: 1; transform: translateX(-50%) scale(1.1); }
    }

    @keyframes forge-glow {
      0%, 100% { box-shadow: inset 0 4px 12px rgba(0,0,0,0.3), 0 8px 16px rgba(0,0,0,0.2); }
      50% { box-shadow: inset 0 4px 12px rgba(0,0,0,0.3), 0 8px 20px rgba(255,69,0,0.3); }
    }

    .forge-workspace {
      animation: forge-glow 4s infinite ease-in-out;
    }

    .item-type-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(139,69,19,0.3);
    }

    .material-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(139,69,19,0.3);
    }

    .prop-center.clickable:hover {
      background: linear-gradient(135deg, rgba(255,215,0,0.9) 0%, rgba(255,215,0,0.7) 100%);
      transform: translate(-50%, -50%) scale(1.05);
      cursor: pointer;
    }

    .prop-center.clickable:active {
      transform: translate(-50%, -50%) scale(0.95);
    }

    .bonus-counter {
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }

    .property-slot {
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

    @media (max-width: 768px) {
      .materials-section {
        grid-template-columns: 1fr !important;
      }
      
      .property-display {
        width: 280px !important;
        height: 50px !important;
      }
      
      .property-slot {
        width: 70px !important;
        height: 35px !important;
        font-size: 0.7rem !important;
      }
      
      .item-type-card {
        min-width: 60px !important;
      }
      
      .item-type-card img {
        width: 40px !important;
        height: 40px !important;
      }
    }

    @media (max-width: 480px) {
      .property-display {
        width: 240px !important;
        height: 45px !important;
      }
      
      .property-slot {
        width: 60px !important;
        height: 30px !important;
        font-size: 0.6rem !important;
      }
      
      .bonus-counter {
        width: 16px !important;
        height: 16px !important;
        font-size: 0.6rem !important;
      }
    }

    #available-bars::-webkit-scrollbar,
    #available-powders::-webkit-scrollbar { 
      height: 6px; 
    }

    #available-bars::-webkit-scrollbar-track,
    #available-powders::-webkit-scrollbar-track {
      background: rgba(139,69,19,0.1);
      border-radius: 3px;
    }

    #available-bars::-webkit-scrollbar-thumb,
    #available-powders::-webkit-scrollbar-thumb {
      background: rgba(139,69,19,0.5);
      border-radius: 3px;
    }

    #available-bars::-webkit-scrollbar-thumb:hover,
    #available-powders::-webkit-scrollbar-thumb:hover {
      background: rgba(139,69,19,0.7);
    }
  `;

  const style = document.createElement('style');
  style.id = 'blacksmithing-css';
  style.textContent = css;
  document.head.appendChild(style);
}

export function clearIngredientCache() {
  ingredientCache.clear();
}

export function preloadIngredients(ingredientNames) {
  return batchEnrichIngredients(ingredientNames.map(name => ({ item: name, amount: 1 })));
}
let context = null;
let forgingState = null;

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
      bonusAssignments: [0, 0, 0],
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
  if (!bankItems.length) return [];
  
  const itemNames = bankItems.map(item => item.item);
  const uniqueNames = [...new Set(itemNames)];
  const namesQuery = uniqueNames.map(name => encodeURIComponent(name)).join(',');
  
  try {
    const apiUrl = `/api/supabase/rest/v1/ingridients?name=in.(${namesQuery})&select=name,properties,sprite`;
    const response = await context.apiCall(apiUrl);
    const ingredients = await response.json();
    
    const ingredientMap = new Map();
    ingredients.forEach(ingredient => {
      ingredientMap.set(ingredient.name, ingredient);
    });
    
    const enriched = [];
    for (const item of bankItems) {
      const ingredient = ingredientMap.get(item.item);
      if (ingredient) {
        enriched.push({
          name: item.item,
          amount: item.amount,
          properties: ingredient.properties,
          sprite: ingredient.sprite,
        });
      }
    }
    
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
    <div class="message-content blacksmith-modal">
      <div id="craft-result" class="craft-status">Select materials and item type to begin forging</div>
      
      <div id="bonus-counter" class="bonus-display" style="display: none;">
        Bonuses: <span id="bonus-assigned">0</span>/<span id="bonus-total">0</span> assigned
      </div>
      
      <div class="materials-section">
        <div class="material-group">
          <h3>Item Types</h3>
          <div id="item-types" class="material-scroller">
            ${renderItemTypesHTML()}
          </div>
        </div>
        
        <div class="material-group">
          <h3>Metal Bars</h3>
          <div id="available-bars" class="material-scroller">
            ${renderBarsHTML()}
          </div>
        </div>
        
        <div class="material-group">
          <h3>Enhancement Powders</h3>
          <div id="available-powders" class="material-scroller">
            ${renderPowdersHTML()}
          </div>
        </div>
      </div>
      
      <div id="forging-area" class="forge-section" style="display: block;">
        <div class="forge-workspace">
          <div class="forge-fire"></div>
          <div id="property-rows">
            ${[0,1,2].map(i => createPropertyRowHTML(i)).join('')}
          </div>
        </div>
      </div>
      
      <div class="button-group">
        <button class="fantasy-button message-ok-btn">Close</button>
        <button id="craft-btn" class="fantasy-button" disabled>Forge</button>
        <button id="finish-btn" class="fantasy-button" disabled style="display: none;">Finish</button>
        <button id="claim-btn" class="fantasy-button" style="display: none;">Claim</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setupBlacksmithingEventListeners(modal);
}

function renderItemTypesHTML() {
  return ITEM_TYPES.map((itemType, idx) => `
    <div class="material-item item-type-card" data-index="${idx}">
      <img src="assets/art/items/${itemType.sprite}.png" alt="${itemType.name}">
      <div class="item-label">${itemType.name}</div>
    </div>
  `).join('');
}

function renderBarsHTML() {
  if (!forgingState.availableBars.length) {
    return '<div class="empty-message">No bars available</div>';
  }
  
  return forgingState.availableBars.map((bar, idx) => `
    <div class="material-item bar" data-index="${idx}">
      <img src="assets/art/ingridients/${bar.sprite}.png" alt="${bar.name}">
      <div class="item-count">x${bar.amount}</div>
      <div class="info-icon" data-bar="${idx}">i</div>
    </div>
  `).join('');
}

function renderPowdersHTML() {
  if (!forgingState.availablePowders.length) {
    return '<div class="empty-message">No powders available</div>';
  }
  
  return forgingState.availablePowders.map((powder, idx) => `
    <div class="material-item powder" data-index="${idx}">
      <img src="assets/art/ingridients/${powder.sprite}.png" alt="${powder.name}">
      <div class="item-count">x${powder.amount}</div>
      <div class="rarity-indicator" style="background: ${RARITY_LEVELS[powder.name]?.color || '#666'};"></div>
      <div class="info-icon" data-powder="${idx}">i</div>
    </div>
  `).join('');
}

function createPropertyRowHTML(rowIndex) {
  return `
    <div class="property-row" data-row="${rowIndex}">
      <div class="property-display">
        <div class="property-slot prop-left">-</div>
        <div class="property-slot prop-center clickable" data-row="${rowIndex}">
          -
          <div class="bonus-counter">0</div>
        </div>
        <div class="property-slot prop-right">-</div>
      </div>
    </div>
  `;
}

function setupBlacksmithingEventListeners(modal) {
  const craftBtn = modal.querySelector('#craft-btn');
  const finishBtn = modal.querySelector('#finish-btn');

  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
    forgingState = null;
  });

  // Item type selection
  modal.querySelector('#item-types').addEventListener('click', (e) => {
    const itemCard = e.target.closest('.item-type-card');
    if (itemCard && !forgingState.isCraftingStarted) {
      const idx = parseInt(itemCard.dataset.index);
      selectItemType(idx, modal);
    }
  });

  // Material selection
  modal.querySelector('#available-bars').addEventListener('click', (e) => {
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

  modal.querySelector('#available-powders').addEventListener('click', (e) => {
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

  // Property slot clicking
  modal.querySelector('#forging-area').addEventListener('click', (e) => {
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
    await finishForging(modal.querySelector('#craft-result'));
  });
}

function selectItemType(typeIndex, modal) {
  modal.querySelectorAll('.item-type-card').forEach(card => card.classList.remove('selected'));
  modal.querySelector(`#item-types [data-index="${typeIndex}"]`).classList.add('selected');

  forgingState.selectedItemType = ITEM_TYPES[typeIndex];
  updateCraftButtonState(modal);
}

function selectBar(barIndex, modal) {
  modal.querySelectorAll('.bar').forEach(item => item.classList.remove('selected'));
  modal.querySelector(`#available-bars [data-index="${barIndex}"]`).classList.add('selected');

  forgingState.selectedBar = forgingState.availableBars[barIndex];
  updateCraftButtonState(modal);
}

function selectPowder(powderIndex, modal) {
  modal.querySelectorAll('.powder').forEach(item => item.classList.remove('selected'));
  modal.querySelector(`#available-powders [data-index="${powderIndex}"]`).classList.add('selected');

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

    forgingArea.style.display = 'block';
    await animateForgeHeatup(modal);

    bonusCounter.style.display = 'block';
    modal.querySelector('#bonus-total').textContent = forgingState.maxBonuses;

    finishBtn.style.display = 'block';
    finishBtn.disabled = false;
    
    resultDiv.textContent = forgingState.maxBonuses > 0 ? 
      'Click center properties to assign bonus stats!' : 
      'Basic item ready - click Finish to complete!';

    // Disable material selection
    const materialScrollers = modal.querySelectorAll('.material-scroller');
    materialScrollers.forEach(scroller => {
      scroller.style.opacity = '0.5';
      scroller.style.pointerEvents = 'none';
    });

  } catch (error) {
    modal.querySelector('#craft-result').textContent = 'Forge malfunction! Please try again.';
  }
}

async function animateForgeHeatup(modal) {
  const rows = modal.querySelectorAll('.property-row');
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const slots = row.querySelectorAll('.property-slot');
    const properties = forgingState.barProperties[i];
    
    createSparkEffect(row);
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (typeof gsap !== 'undefined') {
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
    } else {
      slots[0].textContent = properties[0];
      slots[1].textContent = properties[1];
      slots[2].textContent = properties[2];
    }
    
    if (forgingState.maxBonuses > 0) {
      const centerSlot = row.querySelector('.prop-center');
      const bonusCounter = centerSlot?.querySelector('.bonus-counter');
      if (bonusCounter) {
        bonusCounter.style.display = 'flex';
      }
    }
  }
}

function assignBonus(rowIdx, modal) {
  if (forgingState.totalAssigned >= forgingState.maxBonuses) return;

  forgingState.bonusAssignments[rowIdx]++;
  forgingState.totalAssigned++;

  const row = modal.querySelector(`[data-row="${rowIdx}"]`);
  const centerSlot = row?.querySelector('.prop-center');
  const bonusCounterEl = centerSlot?.querySelector('.bonus-counter');
  
  if (bonusCounterEl) {
    bonusCounterEl.textContent = forgingState.bonusAssignments[rowIdx];
  }
  
  const bonusAssignedEl = modal.querySelector('#bonus-assigned');
  if (bonusAssignedEl) {
    bonusAssignedEl.textContent = forgingState.totalAssigned;
  }
  
  if (centerSlot) {
    createHammerStrike(centerSlot);
    
    if (typeof gsap !== 'undefined') {
      gsap.to(centerSlot, {
        backgroundColor: 'rgba(255,69,0,0.6)',
        duration: 0.2,
        ease: "power2.out",
        yoyo: true,
        repeat: 1
      });
    }
  }
  
  const resultDiv = modal.querySelector('#craft-result');
  if (resultDiv) {
    const remaining = forgingState.maxBonuses - forgingState.totalAssigned;
    if (remaining > 0) {
      resultDiv.textContent = `${remaining} bonus${remaining !== 1 ? 'es' : ''} remaining - keep clicking center properties!`;
    } else {
      resultDiv.textContent = 'All bonuses assigned! Click Finish to complete your masterwork!';
    }
  }
}

function createSparkEffect(row) {
  const rect = row.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  for (let i = 0; i < 8; i++) {
    const spark = document.createElement('div');
    spark.className = 'spark-effect';
    spark.style.left = `${centerX}px`;
    spark.style.top = `${centerY}px`;
    
    document.body.appendChild(spark);
    
    const angle = (i / 8) * Math.PI * 2;
    const distance = Math.random() * 30 + 20;
    
    if (typeof gsap !== 'undefined') {
      gsap.to(spark, {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        rotation: Math.random() * 180,
        opacity: 0,
        duration: Math.random() * 0.8 + 0.5,
        ease: "power2.out",
        onComplete: () => spark.remove()
      });
    } else {
      setTimeout(() => spark.remove(), 1000);
    }
  }
}

function createHammerStrike(element) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  for (let i = 0; i < 5; i++) {
    const impact = document.createElement('div');
    impact.className = 'impact-effect';
    impact.style.left = `${centerX}px`;
    impact.style.top = `${centerY}px`;
    
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
      resultDiv.innerHTML = `<span style="color:red;">💥 Forging failed — materials ruined.</span>`;
    }
  } catch (err) {
    resultDiv.innerHTML = '<span style="color:red;">⚠️ Forge malfunction. Try again later.</span>';
  }
}

function animateSuccessfulForging() {
  document.querySelectorAll('.prop-center').forEach((slot, index) => {
    setTimeout(() => {
      createSuccessGlow(slot);
    }, index * 200);
  });
}

function createSuccessGlow(element) {
  if (typeof gsap !== 'undefined') {
    gsap.to(element, {
      boxShadow: '0 0 30px rgba(255,215,0,0.8)',
      duration: 1,
      ease: "power2.out",
      yoyo: true,
      repeat: 2
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
        `<div class="property-item">
          <strong>Property ${idx + 1}:</strong> ${prop}
        </div>`
      ).join('');
    } else {
      propertiesDisplay = Object.entries(material.properties).map(([key, value]) => 
        `<div class="property-item">
          <strong>${key.toUpperCase()}:</strong> ${value}
        </div>`
      ).join('');
    }
  } else {
    propertiesDisplay = '<div class="no-props">No properties available</div>';
  }
  
  let rarityInfo = '';
  if (material.name.includes('Powder')) {
    const rarity = RARITY_LEVELS[material.name];
    if (rarity) {
      rarityInfo = `
        <div class="rarity-info" style="background: ${rarity.color}20; border-color: ${rarity.color}; color: ${rarity.color};">
          <div class="rarity-name">${rarity.name} Quality</div>
          <div class="rarity-bonus">Grants ${rarity.bonuses} bonus stat${rarity.bonuses !== 1 ? 's' : ''}</div>
        </div>
      `;
    }
  }
  
  propsModal.innerHTML = `
    <div class="message-content material-props-modal">
      <h3>${material.name}</h3>
      <img src="assets/art/ingridients/${material.sprite}.png" alt="${material.name}">
      
      ${rarityInfo}
      
      <div class="properties-container">
        <h4>Properties:</h4>
        ${propertiesDisplay}
      </div>
      
      <div class="material-amount">
        <strong>Available:</strong> ${material.amount} units
      </div>
      
      <button class="fantasy-button close-props-btn">Close</button>
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
    .blacksmith-modal {
      width: 95vw;
      max-width: 800px;
      max-height: 95vh;
      overflow-y: auto;
      text-align: center;
      scrollbar-width: none;
    }

    .blacksmith-modal::-webkit-scrollbar {
      display: none;
    }

    .craft-status {
      font-weight: bold;
      min-height: 1.5rem;
    }

    .bonus-display {
      margin-top: 0.5rem;
      font-size: 0.9rem;
      color: #FFD700;
    }

    .materials-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin: 1.5rem 0;
    }

    .material-group h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1rem;
    }

    .material-scroller {
      display: flex;
      overflow-x: auto;
      gap: 0.5rem;
      padding: 3px;
      border: 1px solid #444;
      border-radius: 8px;
      background: rgba(139,69,19,0.1);
      min-height: 80px;
      scrollbar-width: none;
    }

    .material-scroller::-webkit-scrollbar {
      height: 4px;
    }

    .material-scroller::-webkit-scrollbar-track {
      background: rgba(139,69,19,0.1);
      border-radius: 2px;
    }

    .material-scroller::-webkit-scrollbar-thumb {
      background: rgba(139,69,19,0.5);
      border-radius: 2px;
    }

    .material-item {
      flex: 0 0 auto;
      position: relative;
      cursor: pointer;
      border-radius: 6px;
      padding: 6px;
      background: rgba(139,69,19,0.05);
      border: 2px solid transparent;
      min-width: 64px;
      text-align: center;
      transition: all 0.2s ease;
    }

    .material-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(139,69,19,0.3);
    }

    .material-item.selected {
      border-color: #FFD700;
      background: rgba(255,215,0,0.2);
    }

    .material-item img {
      width: 48px;
      height: 48px;
      display: block;
      margin: 0 auto;
    }

    .item-label, .item-count {
      font-size: 0.8rem;
      margin-top: 4px;
      color: #c4975a;
      font-weight: bold;
    }

    .info-icon {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 16px;
      height: 16px;
      background: #8B4513;
      border-radius: 50%;
      color: white;
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .rarity-indicator {
      position: absolute;
      top: -2px;
      left: -2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1px solid #fff;
      animation: rarity-glow 2s infinite ease-in-out;
    }

    .empty-message {
      color: #666;
      font-style: italic;
      padding: 1rem;
      text-align: center;
    }

    .forge-section {
      margin: 0.5rem 0;
    }

    .forge-workspace {
      background: linear-gradient(135deg, #8B4513 0%, #A0522D 50%, #CD853F 100%);
      border: 3px solid #654321;
      border-radius: 20px;
      padding: 1.5rem;
      position: relative;
      box-shadow: inset 0 4px 12px rgba(0,0,0,0.3), 0 8px 16px rgba(0,0,0,0.2);
      animation: forge-glow 4s infinite ease-in-out;
    }

    .forge-fire {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
      width: 60px;
      height: 20px;
      background: linear-gradient(45deg, #FF4500, #FFA500, #FFD700);
      border-radius: 50%;
      box-shadow: 0 0 20px rgba(255,69,0,0.6);
      animation: flicker 2s infinite ease-in-out;
    }

    .property-row {
      display: flex;
      justify-content: center;
      margin-bottom: 1rem;
    }

    .property-display {
      width: 280px;
      height: 50px;
      background: linear-gradient(135deg, #654321 0%, #8B4513 50%, #A0522D 100%);
      border: 2px solid #543528;
      border-radius: 12px;
      display: flex;
      align-items: center;
      position: relative;
      box-shadow: inset 0 2px 6px rgba(0,0,0,0.3);
    }

    .property-slot {
      position: absolute;
      width: 70px;
      height: 35px;
      border: 2px solid #8B4513;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      color: #FFD700;
      font-weight: bold;
      top: 50%;
      transform: translateY(-50%);
      transition: all 0.3s ease;
    }

    .prop-left {
      left: 15px;
      background: rgba(139,69,19,0.6);
    }

    .prop-center {
      left: 50%;
      transform: translate(-50%, -50%);
      border-color: #FFD700;
      background: linear-gradient(135deg, rgba(255,215,0,0.8) 0%, rgba(255,215,0,0.6) 100%);
      color: #8B4513;
      position: relative;
    }

    .prop-center.clickable {
      cursor: pointer;
    }

    .prop-center.clickable:hover {
      background: linear-gradient(135deg, rgba(255,215,0,0.9) 0%, rgba(255,215,0,0.7) 100%);
      transform: translate(-50%, -50%) scale(1.05);
    }

    .prop-center.clickable:active {
      transform: translate(-50%, -50%) scale(0.95);
    }

    .prop-right {
      right: 15px;
      background: rgba(139,69,19,0.6);
    }

    .bonus-counter {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 18px;
      height: 18px;
      background: #FF4500;
      border-radius: 50%;
      color: white;
      font-size: 0.7rem;
      display: none;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      border: 2px solid #fff;
      animation: pulse 2s infinite ease-in-out;
    }

    .button-group {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .button-group .fantasy-button {
      flex: 1;
      min-width: 80px;
      max-width: 120px;
    }

    .spark-effect {
      position: fixed;
      width: 3px;
      height: 10px;
      background: linear-gradient(to bottom, #FFD700, #FFA500);
      pointer-events: none;
      z-index: 1000;
      border-radius: 2px;
    }

    .impact-effect {
      position: fixed;
      width: 4px;
      height: 4px;
      background: #FF4500;
      border-radius: 50%;
      pointer-events: none;
      z-index: 1001;
    }

    .material-props-modal {
      max-width: 350px;
      text-align: center;
    }

    .material-props-modal h3 {
      color: #8B4513;
      margin-bottom: 1rem;
    }

    .material-props-modal img {
      width: 80px;
      height: 80px;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .rarity-info {
      border: 1px solid;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      text-align: center;
    }

    .rarity-name {
      font-weight: bold;
      font-size: 1.1rem;
    }

    .rarity-bonus {
      font-size: 0.9rem;
      margin-top: 0.5rem;
      opacity: 0.9;
    }

    .properties-container {
      background: rgba(139,69,19,0.3);
      border: 1px solid #8B4513;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      text-align: left;
    }

    .properties-container h4 {
      color: #FFD700;
      margin-bottom: 0.8rem;
      text-align: center;
    }

    .property-item {
      background: rgba(139,69,19,0.2);
      padding: 0.5rem;
      border-radius: 4px;
      margin-bottom: 0.3rem;
    }

    .no-props {
      color: #999;
      font-style: italic;
    }

    .material-amount {
      background: rgba(255,255,255,0.1);
      border-radius: 6px;
      padding: 0.6rem;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }

    @keyframes flicker {
      0%, 100% { 
        opacity: 0.8; 
        transform: translateX(-50%) scale(1); 
      }
      50% { 
        opacity: 1; 
        transform: translateX(-50%) scale(1.1); 
      }
    }

    @keyframes forge-glow {
      0%, 100% { 
        box-shadow: inset 0 4px 12px rgba(0,0,0,0.3), 0 8px 16px rgba(0,0,0,0.2); 
      }
      50% { 
        box-shadow: inset 0 4px 12px rgba(0,0,0,0.3), 0 8px 20px rgba(255,69,0,0.3); 
      }
    }

    @keyframes rarity-glow {
      0%, 100% { opacity: 0.8; }
      50% { opacity: 1; }
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }

    @media (max-width: 480px) {

      .property-display {
        width: 240px;
        height: 45px;
      }

      .property-slot {
        width: 60px;
        height: 30px;
        font-size: 0.7rem;
      }

      .bonus-counter {
        width: 16px;
        height: 16px;
        font-size: 0.6rem;
      }

      .material-item img {
        width: 40px;
        height: 40px;
      }

      .material-item {
        min-width: 56px;
      }

      .button-group .fantasy-button {
        min-width: 70px;
        font-size: 0.9rem;
      }
    }
  `;

  const style = document.createElement('style');
  style.id = 'blacksmithing-css';
  style.textContent = css;
  document.head.appendChild(style);
}

let context = null;
let miningState = null;
let oreCache = new Map();

export async function startCraftingSession(ctx) {
  context = ctx;
  const { loadingModal, loadingStartTime, updateLoadingProgress, finishLoading } = context;
  
  try {
    updateLoadingProgress(loadingModal, "Accessing your ore vault...", "Loading bank items and recipes...");
    
    const [bankResponse, recipesPromise] = await Promise.all([
      context.apiCall(`/api/supabase/rest/v1/bank?player_id=eq.${context.profile.id}&profession_id=eq.${context.professionId}&select=item,amount`),
      context.fetchRecipes(context.professionId)
    ]);
    
    const bankItems = await bankResponse.json();
    updateLoadingProgress(loadingModal, "Analyzing mineral properties...", "Processing ore data...");
    
    const enriched = await batchEnrichOres(bankItems);
    const recipes = await recipesPromise;
    updateLoadingProgress(loadingModal, "Setting up mining equipment...", "Preparing interface...");
    
    miningState = {
      professionId: context.professionId,
      professionName: context.professionName,
      availableOres: enriched,
      selectedOres: [null, null, null],
      randomizedProperties: [[], [], []],
      originalProperties: [[], [], []],
      currentAdjustedRow: null,
      isCraftingStarted: false,
      result: null,
      adjustmentCount: 0,
      maxAdjustments: 2,
      enrichedOres: null,
      recipes: recipes,
      sessionId: null
    };
    
    await finishLoading(loadingModal, loadingStartTime, 2000);
    
    renderCraftingModal();
    injectMiningAnimationsCSS();
    
  } catch (error) {
    if (finishLoading && loadingModal) {
      await finishLoading(loadingModal, loadingStartTime, 500);
    }
    throw error;
  }
}

async function batchEnrichOres(bankItems) {
  if (!bankItems.length) return [];
  
  const oreNames = bankItems.map(item => item.item);
  const uniqueNames = [...new Set(oreNames)];
  const uncachedNames = uniqueNames.filter(name => !oreCache.has(name));
  
  if (uncachedNames.length > 0) {
    const namesQuery = uncachedNames.map(name => encodeURIComponent(name)).join(',');
    
    try {
      const response = await context.apiCall(`/api/supabase/rest/v1/ingridients?name=in.(${namesQuery})&select=name,properties,sprite`);
      const ores = await response.json();
      ores.forEach(ore => oreCache.set(ore.name, ore));
    } catch (error) {
      return await fallbackEnrichOres(bankItems);
    }
  }
  
  const enriched = [];
  for (const item of bankItems) {
    const cachedOre = oreCache.get(item.item);
    if (cachedOre) {
      enriched.push({
        name: item.item,
        amount: item.amount,
        properties: cachedOre.properties,
        sprite: cachedOre.sprite,
      });
    }
  }
  
  return enriched;
}

async function fallbackEnrichOres(bankItems) {
  const enriched = [];
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < bankItems.length; i += BATCH_SIZE) {
    const batch = bankItems.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (item) => {
      try {
        const res = await context.apiCall(`/api/supabase/rest/v1/ingridients?name=eq.${encodeURIComponent(item.item)}&select=properties,sprite`);
        const [ore] = await res.json();
        
        if (ore) {
          return {
            name: item.item,
            amount: item.amount,
            properties: ore.properties,
            sprite: ore.sprite,
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

function createMiningRowHTML(rowIndex) {
  return `
    <div class="mining-row" data-row="${rowIndex}" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem; justify-content: center; position: relative;">
      <div class="arrow-left">
        <button class="fantasy-button adjust-left" data-row="${rowIndex}" style="padding: 0.3rem 0.6rem; font-size: 1.2rem; opacity: 0.3;" disabled>←</button>
      </div>
      
      <div class="rock-formation" style="width: 380px; height: 80px; background: linear-gradient(135deg, #8B7355 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%); border: 3px solid #654321; border-radius: 15px; display: flex; align-items: center; position: relative; box-shadow: inset 0 4px 8px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2);">
        <div class="rock-texture" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px); border-radius: 12px; pointer-events: none;"></div>
        
        <div class="ore-input-slot" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 70px; height: 70px; border: 2px dashed #FFD700; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(255,215,0,0.15); z-index: 15; transition: all 0.5s ease;">
          <span style="color: #FFD700; font-size: 0.8rem; text-align: center; line-height: 1.2;">Drop<br>Ore</span>
        </div>
        
        <div class="property-slot prop-left" data-row="${rowIndex}" data-position="0" style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); width: 60px; height: 50px; border: 2px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.8); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #FFD700; font-weight: bold; z-index: 5; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); opacity: 0; transform: translateY(-50%) scale(0.8);">-</div>

        <div class="property-slot prop-center" data-row="${rowIndex}" data-position="1" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 60px; height: 50px; border: 3px solid #FFD700; border-radius: 8px; background: linear-gradient(135deg, rgba(255,215,0,0.9) 0%, rgba(255,215,0,0.7) 100%); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #8B4513; font-weight: bold; z-index: 10; box-shadow: 0 0 15px rgba(255,215,0,0.5), inset 0 2px 4px rgba(0,0,0,0.2); opacity: 0; transform: translate(-50%, -50%) scale(0.8);">-</div>

        <div class="property-slot prop-right" data-row="${rowIndex}" data-position="2" style="position: absolute; right: 15px; top: 50%; transform: translateY(-50%); width: 60px; height: 50px; border: 2px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.8); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #FFD700; font-weight: bold; z-index: 5; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); opacity: 0; transform: translateY(-50%) scale(0.8);">-</div>
      </div>
      
      <div class="arrow-right">
        <button class="fantasy-button adjust-right" data-row="${rowIndex}" style="padding: 0.3rem 0.6rem; font-size: 1.2rem; opacity: 0.3;" disabled>→</button>
      </div>
    </div>
  `;
}

function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 1000px; max-height: 95vh; height: 95vh; overflow-y: auto; text-align: center; scrollbar-width:none;">
      <h2>Crafting: ${miningState.professionName}</h2>
                
      <div id="craft-result" style="margin-top: 4px; font-weight: bold;">Select 3 ores to start mining</div>
      
      <div id="adjustment-counter" style="margin-top: 0.5rem; font-size: 0.9rem; color: #666; display: none;">
        Adjustments: ${miningState.adjustmentCount}/${miningState.maxAdjustments}
      </div>
      
      <div id="alignment-status" style="margin-top: 0.5rem; font-size: 0.9rem; color: #FFD700; display: none;">
        <span id="alignment-text">Align center column for successful extraction!</span>
      </div>
      
      <div id="mining-rows" style="margin: 1.5rem 0;">
        ${[0,1,2].map(i => createMiningRowHTML(i)).join('')}
      </div>
      
      <h3>Available Ores</h3>
      <div id="available-ores" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; margin-bottom: 5px; border: 1px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.5); scrollbar-width: none; max-height: 100px; min-height: 100px;">
        ${renderOresHTML()}
      </div>
      
      <h3>Recipes</h3>
      <div id="available-recipes" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; margin-bottom: 1rem; border: 1px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.5); scrollbar-width: none; max-height: 100px; min-height: 100px;">
        ${renderRecipesHTML()}
      </div>
      
      <div style="display: flex; justify-content: center; gap: 0.5rem;">
        <button class="fantasy-button message-ok-btn" style="flex: 1; max-width: 100px;">Close</button>
        <button id="craft-btn" class="fantasy-button" disabled style="flex: 1; max-width: 100px;">Mine</button>
        <button id="finish-btn" class="fantasy-button" disabled style="flex: 1; max-width: 100px; display: none;">Extract</button>
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
  setupModalEventListeners(modal);
  setBackground(modal);
}

function renderOresHTML() {
  return miningState.availableOres.map((ore, idx) => `
    <div class="ore" data-index="${idx}" style="flex: 0 0 auto; cursor: pointer; position: relative; border-radius: 4px; padding: 4px; background: rgba(139,69,19,0.05);">
      <img src="assets/art/ingridients/${ore.sprite}.png" title="${ore.name} (${ore.amount})" style="width: 48px; height: 48px;">
      <div style="font-size: 0.8rem;">x${ore.amount}</div>
      <div class="info-icon" data-ore="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #8B4513; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

function renderRecipesHTML() {
  if (!miningState.recipes || miningState.recipes.length === 0) {
    return '<div style="color: #666; font-style: italic; padding: 1rem;">No recipes available</div>';
  }
  
  return miningState.recipes.map((recipe, idx) => `
    <div class="recipe-card" data-recipe="${idx}" style="flex: 0 0 auto; cursor: pointer; border-radius: 8px; padding: 8px; background: rgba(139,69,19,0.2); border: 1px solid #8B4513; min-width: 80px; text-align: center; position: relative;">
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 48px; height: 48px; border-radius: 4px;">
      <div style="font-size: 0.8rem; color: #FFD700; font-weight: bold;">${recipe.name}</div>
      <div class="info-icon" data-recipe="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #8B4513; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

function findOresWithProperty(targetProperty) {
  if (!miningState?.availableOres) return [];

  const matchingOres = [];
  
  miningState.availableOres.forEach(ore => {
    if (!ore.properties) return;
    
    let oreProperties = [];
    
    if (Array.isArray(ore.properties)) {
      oreProperties = ore.properties;
    } else if (typeof ore.properties === 'object') {
      oreProperties = Object.values(ore.properties);
    } else if (typeof ore.properties === 'string') {
      try {
        const parsed = JSON.parse(ore.properties);
        if (Array.isArray(parsed)) {
          oreProperties = parsed;
        }
      } catch (e) {
        oreProperties = ore.properties.split(',').map(p => p.trim());
      }
    }
    
    const hasProperty = oreProperties.some(prop => {
      return prop && prop.toString().toLowerCase().trim() === targetProperty.toLowerCase().trim();
    });
    
    if (hasProperty && ore.amount > 0) {
      matchingOres.push({
        name: ore.name,
        sprite: ore.sprite,
        amount: ore.amount,
        properties: oreProperties
      });
    }
  });

  matchingOres.sort((a, b) => b.amount - a.amount);
  return matchingOres;
}

function generateIngredientMatching(recipe) {
  if (!miningState?.availableOres || !recipe.ingridients) {
    return '<div style="background: rgba(255,193,7,0.1); border: 1px solid #FFC107; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: center; color: #FFC107; font-size: 0.9rem;">Ingredient matching unavailable</div>';
  }

  let requiredProperties = [];
  if (Array.isArray(recipe.ingridients)) {
    requiredProperties = recipe.ingridients;
  } else if (typeof recipe.ingridients === 'object') {
    requiredProperties = Object.values(recipe.ingridients);
  } else if (typeof recipe.ingridients === 'string') {
    requiredProperties = recipe.ingridients.split(',').map(prop => prop.trim());
  }

  if (requiredProperties.length === 0) {
    return '<div style="background: rgba(255,193,7,0.1); border: 1px solid #FFC107; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: center; color: #FFC107; font-size: 0.9rem;">No properties specified for this recipe</div>';
  }

  const matchingResults = requiredProperties.map((requiredProp, index) => {
    const matchingOres = findOresWithProperty(requiredProp);
    return {
      property: requiredProp,
      position: index + 1,
      matchingOres: matchingOres
    };
  });

  let matchingHTML = `
    <div style="background: rgba(139,69,19,0.5); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
      <h4 style="color: #FFD700; margin-bottom: 0.8rem; text-align: center;">Ore Matching Guide</h4>
      <div style="font-size: 0.85rem; color: #ccc; text-align: center; margin-bottom: 1rem; font-style: italic;">
        Find ores with these properties (all three must align vertically in the center):
      </div>
  `;

  matchingResults.forEach((result) => {
    const hasMatches = result.matchingOres.length > 0;
    const borderColor = hasMatches ? '#8B4513' : '#ff6b6b';
    const bgColor = hasMatches ? 'rgba(139,69,19,0.5)' : 'rgba(255,107,107,0.1)';
    
    matchingHTML += `
      <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 6px; padding: 0.8rem; margin-bottom: 0.8rem;">
        <div style="color: #FFD700; font-weight: bold; margin-bottom: 0.5rem;">
          Property ${result.position}: "${result.property}"
        </div>
    `;

    if (hasMatches) {
      matchingHTML += `
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
          <span style="font-size: 0.8rem; margin-right: 0.5rem;">Available ores:</span>
      `;
      
      result.matchingOres.forEach((ore) => {
        matchingHTML += `
          <div style="display: flex; align-items: center; background: rgba(139,69,19,0.2); border-radius: 4px; padding: 0.3rem 0.5rem; gap: 0.3rem;">
            <img src="assets/art/ingridients/${ore.sprite}.png" style="width: 20px; height: 20px;" title="${ore.name}">
            <span style="font-size: 0.75rem; color: #fff;">${ore.name}</span>
            <span style="font-size: 0.7rem; color: #999;">(${ore.amount})</span>
          </div>
        `;
      });
      
      matchingHTML += '</div>';
    } else {
      matchingHTML += `
        <div style="color: #ff6b6b; font-size: 0.8rem; font-style: italic;">
          ❌ No available ores have this property
        </div>
      `;
    }

    matchingHTML += '</div>';
  });

  matchingHTML += `
    <div style="background: rgba(255,215,0,0.1); border: 1px solid #FFD700; border-radius: 6px; padding: 0.6rem; margin-top: 1rem;">
      <div style="color: #FFD700; font-size: 0.8rem; text-align: center;">
        ⛏️ <strong>Mining Tip:</strong> Use adjustments to align all three <strong>center properties</strong> vertically for successful extraction!
      </div>
    </div>
  `;

  matchingHTML += '</div>';
  return matchingHTML;
}

function showRecipeDetails(recipe) {
  const detailsModal = document.createElement('div');
  detailsModal.className = 'custom-message-box';
  detailsModal.style.zIndex = '10001';
  
  let ingredientsList = '';
  if (Array.isArray(recipe.ingridients)) {
    ingredientsList = recipe.ingridients.join(', ');
  } else if (typeof recipe.ingridients === 'object') {
    ingredientsList = Object.values(recipe.ingridients).join(', ');
  } else {
    ingredientsList = recipe.ingridients || 'Unknown ingredients';
  }
  
  const ingredientMatchingHTML = generateIngredientMatching(recipe);
  
  detailsModal.innerHTML = `
    <div class="message-content" style="max-width: 500px; text-align: center; max-height: 80vh; overflow-y: auto; scrollbar-width:none;">
      <h3 style="color: #FFD700; margin-bottom: 1rem;">${recipe.name}</h3>
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 96px; height: 96px; border-radius: 8px; margin-bottom: 1rem;">
      
      <div style="background:rgba(139,69,19,0.5); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
        <h4 style="color: #FFD700; margin-bottom: 0.5rem;">Required Properties:</h4>
        <div style="color: #fff; font-size: 0.9rem; line-height: 1.4;">${ingredientsList}</div>
      </div>
      
      ${ingredientMatchingHTML}
      
      ${recipe.description ? `
        <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 0.8rem; margin-bottom: 1rem; font-style: italic; color: #ccc; font-size: 0.85rem;">
          ${recipe.description}
        </div>
      ` : ''}
      
      <button class="fantasy-button close-details-btn" style="width: 100%;">Close</button>
    </div>
  `;
  
  document.body.appendChild(detailsModal);
  
  detailsModal.querySelector('.close-details-btn').addEventListener('click', () => detailsModal.remove());
  detailsModal.addEventListener('click', (e) => {
    if (e.target === detailsModal) detailsModal.remove();
  });
}

function showOreProperties(oreIndex) {
  const ore = miningState.availableOres[oreIndex];
  const propsModal = document.createElement('div');
  propsModal.className = 'custom-message-box';
  propsModal.style.zIndex = '10001';
  
  let propertiesDisplay = '';
  if (typeof ore.properties === 'object' && ore.properties !== null) {
    if (Array.isArray(ore.properties)) {
      propertiesDisplay = ore.properties.map((prop, idx) => 
        `<div class="property-item" style="background: rgba(139,69,19,0.2); padding: 0.5rem; border-radius: 4px; margin-bottom: 0.3rem;">
          <strong>Property ${idx + 1}:</strong> ${prop}
        </div>`
      ).join('');
    } else {
      propertiesDisplay = Object.entries(ore.properties).map(([key, value]) => 
        `<div class="property-item" style="background: rgba(139,69,19,0.2); padding: 0.5rem; border-radius: 4px; margin-bottom: 0.3rem;">
          <strong>${key.toUpperCase()}:</strong> ${value}
        </div>`
      ).join('');
    }
  } else {
    propertiesDisplay = '<div style="color: #999; font-style: italic;">No properties available</div>';
  }
  
  propsModal.innerHTML = `
    <div class="message-content" style="max-width: 350px; text-align: center; scrollbar-width:none;">
      <h3 style="margin-bottom: 1rem;">${ore.name}</h3>
      <img src="assets/art/ingridients/${ore.sprite}.png" alt="${ore.name}" style="width: 80px; height: 80px; border-radius: 8px; margin-bottom: 1rem;">
      
      <div style="background: rgba(139,69,19,0.3); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
        <h4 style="color: #FFD700; margin-bottom: 0.8rem; text-align: center;">Properties:</h4>
        ${propertiesDisplay}
      </div>
      
      <div style="background: rgba(255,255,255,0.1); border-radius: 6px; padding: 0.6rem; margin-bottom: 1rem; font-size: 0.9rem;">
        <strong>Available:</strong> ${ore.amount} units
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

function setBackground(modal) {
  const messageContent = modal.querySelector('.message-content');
  if (messageContent) {
    messageContent.style.backgroundSize = 'cover';
    messageContent.style.backgroundPosition = 'center';
    messageContent.style.backgroundRepeat = 'no-repeat';
    messageContent.style.backgroundImage = 'url(assets/art/professions/prof_background_mining.png)';
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

function setupModalEventListeners(modal) {
  const craftBtn = modal.querySelector('#craft-btn');
  const finishBtn = modal.querySelector('#finish-btn');
  const resultDiv = modal.querySelector('#craft-result');
  const adjustmentCounter = modal.querySelector('#adjustment-counter');

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

  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    removeBackground(modal);
    modal.remove();
    miningState = null;
    oreCache.clear();
  });

  const oresContainer = modal.querySelector('#available-ores');
  oresContainer.addEventListener('click', (e) => {
    const oreEl = e.target.closest('.ore');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon?.dataset.ore) {
      e.stopPropagation();
      showOreProperties(parseInt(infoIcon.dataset.ore));
      return;
    }
    
    if (oreEl && !miningState.isCraftingStarted) {
      const idx = parseInt(oreEl.dataset.index);
      const ore = miningState.availableOres[idx];
      handleOreSelection(ore, modal);
    }
  });

  const recipesContainer = modal.querySelector('#available-recipes');
  recipesContainer.addEventListener('click', (e) => {
    const recipeCard = e.target.closest('.recipe-card');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon?.dataset.recipe) {
      e.stopPropagation();
      const recipeIdx = parseInt(infoIcon.dataset.recipe);
      showRecipeDetails(miningState.recipes[recipeIdx]);
      return;
    }
    
    if (recipeCard) {
      const recipeIdx = parseInt(recipeCard.dataset.recipe);
      showRecipeDetails(miningState.recipes[recipeIdx]);
    }
  });

  craftBtn.addEventListener('click', () => {
    miningState.isCraftingStarted = true;
    resultDiv.textContent = 'Starting mining operation...';
    craftBtn.style.display = 'none';
    finishBtn.style.display = 'block';
    finishBtn.disabled = false;
    adjustmentCounter.style.display = 'block';

    oresContainer.style.opacity = '0.5';
    oresContainer.style.pointerEvents = 'none';

    startMiningAnimation(resultDiv, modal);
  });

  finishBtn.addEventListener('click', async () => {
    finishBtn.disabled = true;
    await patchAndSendCraftRequest(resultDiv, context.apiCall);
  });

  const rowsContainer = modal.querySelector('#mining-rows');
  rowsContainer.addEventListener('click', (e) => {
    const adjustBtn = e.target.closest('.adjust-left, .adjust-right');
    if (adjustBtn && !adjustBtn.disabled) {
      const rowIdx = parseInt(adjustBtn.dataset.row);
      const direction = adjustBtn.classList.contains('adjust-left') ? 'left' : 'right';
      handleAdjustment(rowIdx, direction, resultDiv);
    }
    
    const oreInputSlot = e.target.closest('.ore-input-slot');
    if (oreInputSlot && !miningState.isCraftingStarted) {
      const row = oreInputSlot.closest('.mining-row');
      const rowIdx = parseInt(row.dataset.row);
      
      const oreImg = oreInputSlot.querySelector('img');
      if (oreImg) {
        removeOreFromSlot(rowIdx, modal);
      }
    }
  });
}

function handleOreSelection(ore, modal) {
  const slotIdx = miningState.selectedOres.findIndex(s => s === null);
  if (slotIdx === -1) return;

  miningState.selectedOres[slotIdx] = ore;
  
  const row = modal.querySelector(`[data-row="${slotIdx}"]`);
  const oreInputSlot = row.querySelector('.ore-input-slot');
  
  oreInputSlot.innerHTML = `<img src="assets/art/ingridients/${ore.sprite}.png" style="width:60px;height:60px;cursor:pointer;" title="Click to remove ${ore.name}">`;
  oreInputSlot.style.border = '2px solid #8B4513';
  oreInputSlot.style.background = 'rgba(139,69,19,0.4)';
  
  animateOreIntegration(row, ore);
  updateCraftButtonState(modal);
}

function removeOreFromSlot(slotIdx, modal) {
  miningState.selectedOres[slotIdx] = null;
  
  const row = modal.querySelector(`[data-row="${slotIdx}"]`);
  const oreInputSlot = row.querySelector('.ore-input-slot');
  
  oreInputSlot.innerHTML = '<span style="color: #FFD700; font-size: 0.8rem; text-align: center; line-height: 1.2;">Drop<br>Ore</span>';
  oreInputSlot.style.border = '2px dashed #FFD700';
  oreInputSlot.style.background = 'rgba(255,215,0,0.15)';
  
  animateRockClear(row);
  updateCraftButtonState(modal);
}

function updateCraftButtonState(modal) {
  const craftBtn = modal.querySelector('#craft-btn');
  const resultDiv = modal.querySelector('#craft-result');
  
  if (miningState.selectedOres.every(o => o !== null)) {
    craftBtn.disabled = false;
    resultDiv.textContent = 'Ready to mine!';
  } else {
    craftBtn.disabled = true;
    resultDiv.textContent = 'Select 3 ores to start mining';
  }
}

function animateOreIntegration(row, ore) {
  const rockFormation = row.querySelector('.rock-formation');
  const oreInputSlot = row.querySelector('.ore-input-slot');
  const oreColor = getOreColor(ore.name);
  
  gsap.to(rockFormation, {
    background: `linear-gradient(135deg, ${oreColor} 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%)`,
    duration: 1.0,
    ease: "power2.out"
  });
  
  gsap.to(oreInputSlot, {
    boxShadow: '0 0 20px rgba(255,215,0,0.8), inset 0 0 10px rgba(255,215,0,0.3)',
    duration: 0.8,
    ease: "power2.out"
  });
  
  const rockTexture = row.querySelector('.rock-texture');
  gsap.fromTo(rockTexture, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: "power2.out" });
}

function animateRockClear(row) {
  const rockFormation = row.querySelector('.rock-formation');
  const oreInputSlot = row.querySelector('.ore-input-slot');
  const rockTexture = row.querySelector('.rock-texture');
  
  gsap.to(rockFormation, {
    background: 'linear-gradient(135deg, #8B7355 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%)',
    duration: 0.8,
    ease: "power2.out"
  });
  
  gsap.to(oreInputSlot, { boxShadow: 'none', duration: 0.6, ease: "power2.out" });
  gsap.to(rockTexture, { opacity: 0.3, duration: 0.6, ease: "power2.out" });
}

async function startMiningAnimation(resultDiv, modal) {
  const rowsArea = modal.querySelector('#mining-rows');
  resultDiv.textContent = 'Analyzing ore composition...';

  const selectedOreNames = miningState.selectedOres.map(o => o.name);

  try {
    const reserveRes = await context.apiCall('/functions/v1/reserve_ingredients', {
      method: 'POST',
      body: {
        player_id: context.profile.id,
        profession_id: miningState.professionId,
        selected_ingredients: selectedOreNames,
      }
    });

    const reserveJson = await reserveRes.json();
    
    if (!reserveRes.ok || !reserveJson.success || !Array.isArray(reserveJson.herbs)) {
      resultDiv.textContent = `Ore verification failed: ${reserveJson?.error || 'Unknown error'}`;
      return;
    }

    miningState.sessionId = reserveJson.session_id;
    miningState.enrichedOres = reserveJson.herbs;

    for (let idx = 0; idx < miningState.enrichedOres.length; idx++) {
      const ore = miningState.enrichedOres[idx];
      const row = rowsArea.children[idx];
      const props = ore.properties;
      
      await animateOreBreaking(row, props, idx);
    }

    setTimeout(() => {
      resultDiv.textContent = 'You may now apply adjustments.';
    }, 1000);

    miningState.randomizedProperties = miningState.enrichedOres.map(o => Object.values(o.properties));
    miningState.originalProperties = miningState.randomizedProperties.map(p => [...p]);
    miningState.currentAdjustedRow = null;

    miningState.adjustments = {};
    for (let i = 0; i < 3; i++) {
      miningState.adjustments[i] = { left: 0, right: 0 };
    }

  } catch (err) {
    resultDiv.textContent = 'Server error while verifying ores.';
  }
}

async function animateOreBreaking(row, properties, rowIndex) {
  const oreInputSlot = row.querySelector('.ore-input-slot');
  const propertySlots = row.querySelectorAll('.property-slot');
  const leftBtn = row.querySelector('.adjust-left');
  const rightBtn = row.querySelector('.adjust-right');
  const rockFormation = row.querySelector('.rock-formation');
  
  createOreBreakingEffect(oreInputSlot);
  await new Promise(resolve => setTimeout(resolve, 800));
  
  gsap.to(oreInputSlot, {
    scale: 0.8,
    opacity: 0,
    duration: 0.5,
    ease: "power2.in",
    onComplete: () => oreInputSlot.style.display = 'none'
  });
  
  gsap.to(propertySlots, {
    opacity: 1,
    scale: 1,
    duration: 0.8,
    stagger: 0.15,
    ease: "back.out(1.4)",
    delay: 0.3,
    onStart: () => {
      propertySlots[0].textContent = properties[0];
      propertySlots[1].textContent = properties[1];
      propertySlots[2].textContent = properties[2];
    }
  });
  
  gsap.to([leftBtn, rightBtn], {
    opacity: 1,
    duration: 0.6,
    delay: 0.8,
    onStart: () => {
      leftBtn.disabled = false;
      rightBtn.disabled = false;
    }
  });
  
  gsap.to(rockFormation, {
    boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.4), 0 4px 12px rgba(255,215,0,0.3)',
    duration: 0.8,
    ease: "power2.out",
    delay: 0.5
  });

  createRockDustEffect(row);
}

function createOreBreakingEffect(oreInputSlot) {
  const rect = oreInputSlot.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  for (let i = 0; i < 12; i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: fixed;
      width: ${Math.random() * 6 + 3}px;
      height: ${Math.random() * 6 + 3}px;
      background: rgba(139,115,85,0.9);
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      left: ${centerX}px;
      top: ${centerY}px;
      pointer-events: none;
      z-index: 1000;
      transform-origin: center;
    `;
    
    document.body.appendChild(particle);
    
    const angle = (i / 12) * Math.PI * 2;
    const distance = Math.random() * 60 + 30;
    const finalX = centerX + Math.cos(angle) * distance;
    const finalY = centerY + Math.sin(angle) * distance;
    
    gsap.to(particle, {
      x: finalX - centerX,
      y: finalY - centerY,
      rotation: Math.random() * 360,
      opacity: 0,
      scale: Math.random() * 0.5 + 0.5,
      duration: Math.random() * 1.2 + 0.8,
      ease: "power2.out",
      onComplete: () => particle.remove()
    });
  }
  
  gsap.to(oreInputSlot, {
    backgroundColor: 'rgba(255,255,255,0.8)',
    duration: 0.1,
    ease: "power2.out",
    yoyo: true,
    repeat: 3
  });
}

function createRockDustEffect(row) {
  const rockFormation = row.querySelector('.rock-formation');
  
  function createDustParticle() {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: absolute;
      width: ${Math.random() * 3 + 1}px;
      height: ${Math.random() * 3 + 1}px;
      background: rgba(139,115,85,0.7);
      border-radius: 50%;
      top: ${Math.random() * 80}px;
      left: ${Math.random() * 380}px;
      pointer-events: none;
      z-index: 20;
    `;
    
    rockFormation.appendChild(particle);
    
    gsap.to(particle, {
      y: -20,
      x: `+=${Math.random() * 20 - 10}`,
      opacity: 0,
      duration: Math.random() * 2 + 1,
      ease: "power1.out",
      onComplete: () => particle.remove()
    });
  }
  
  const dustInterval = setInterval(() => {
    if (document.contains(row)) {
      createDustParticle();
    } else {
      clearInterval(dustInterval);
    }
  }, Math.random() * 600 + 300);
  
  return dustInterval;
}

async function patchAndSendCraftRequest(resultDiv, apiCall) {
  try {
    const adjustments = [];
    
    for (const [rowIdx, adj] of Object.entries(miningState.adjustments || {})) {
      if (adj.left > 0) {
        adjustments.push({ bottle: Number(rowIdx), direction: 'up', count: adj.left });
      }
      if (adj.right > 0) {
        adjustments.push({ bottle: Number(rowIdx), direction: 'down', count: adj.right });
      }
    }

    const payload = {
      player_id: context.profile.id,
      profession_id: miningState.professionId,
      session_id: miningState.sessionId,
      adjustments
    };
    
    const res = await apiCall('/functions/v1/craft_alchemy', {
      method: 'POST',
      body: payload
    });

    const json = await res.json();
    
    if (!res.ok) {
      resultDiv.innerHTML = `
        <span style="color:red;">💥 Server Error (${res.status})</span>
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
      miningState.result = json.crafted.name;
      resultDiv.innerHTML = `<span style="color:lime;">⛏️ Successfully extracted: <strong>${json.crafted.name}</strong>!</span>`;

      animateMiningSuccess();

      if (finishBtn) finishBtn.style.display = 'none';
      if (claimBtn) {
        claimBtn.style.display = 'block';
        claimBtn.disabled = false;
        
        const newClaimBtn = claimBtn.cloneNode(true);
        claimBtn.parentNode.replaceChild(newClaimBtn, claimBtn);
        
        newClaimBtn.addEventListener('click', () => {
          context.displayMessage(`${json.crafted.name} added to your bank!`);
          document.querySelector('.custom-message-box')?.remove();
          miningState = null;
        });
      }
    } else {
      miningState.result = 'Failed';
      resultDiv.innerHTML = `
        <span style="color:red;">💥 Mining failed — ores crumbled to dust.</span>
        <br><small style="color:#999;">${json.message || 'Properties not properly aligned'}</small>
      `;

      animateMiningFailure();

      if (finishBtn) finishBtn.style.display = 'none';
      if (claimBtn) claimBtn.style.display = 'none';
      
      if (craftBtn) {
        craftBtn.style.display = 'block';
        craftBtn.textContent = 'Mine Again';
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
    resultDiv.innerHTML = '<span style="color:red;">⚠️ Mining operation failed. Try again later.</span>';
    
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

function handleAdjustment(rowIdx, direction, resultDiv) {
  if (miningState.adjustmentCount >= miningState.maxAdjustments) {
    resultDiv.textContent = `No more adjustments available (${miningState.maxAdjustments}/${miningState.maxAdjustments}).`;
    return;
  }

  const props = miningState.randomizedProperties[rowIdx];

  if (!miningState.adjustments[rowIdx]) {
    miningState.adjustments[rowIdx] = { left: 0, right: 0 };
  }

  if (direction === 'left') {
    props.push(props.shift());
    miningState.adjustments[rowIdx].left++;
  } else if (direction === 'right') {
    props.unshift(props.pop());
    miningState.adjustments[rowIdx].right++;
  }

  updateMiningRow(rowIdx);
  miningState.adjustmentCount++;
  updateAdjustmentCounter();

  if (miningState.adjustmentCount >= miningState.maxAdjustments) {
    disableAdjustmentButtons();
  }
}

function updateMiningRow(rowIdx) {
  const props = miningState.randomizedProperties[rowIdx];
  const rowsArea = document.querySelector('#mining-rows');
  const row = rowsArea.children[rowIdx];
  const propertySlots = row.querySelectorAll('.property-slot');
  const rockFormation = row.querySelector('.rock-formation');
  
  gsap.to(propertySlots, {
    x: '+=20',
    duration: 0.15,
    ease: "power2.out",
    yoyo: true,
    repeat: 1,
    onComplete: () => {
      propertySlots[0].textContent = props[0];
      propertySlots[1].textContent = props[1];
      propertySlots[2].textContent = props[2];
    }
  });
  
  gsap.to(rockFormation, {
    y: '+=2',
    duration: 0.1,
    ease: "power2.inOut",
    yoyo: true,
    repeat: 3
  });
  
  createImpactParticles(row);
  
  gsap.to(propertySlots[1], {
    backgroundColor: 'rgba(255,215,0,0.5)',
    duration: 0.2,
    ease: "power2.out",
    yoyo: true,
    repeat: 1
  });
}

function createImpactParticles(row) {
  const rockFormation = row.querySelector('.rock-formation');
  
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const particle = document.createElement('div');
      particle.style.cssText = `
        position: absolute;
        width: ${Math.random() * 4 + 2}px;
        height: ${Math.random() * 4 + 2}px;
        background: rgba(255,215,0,0.8);
        border-radius: 50%;
        top: 40px;
        left: ${Math.random() * 120 + 130}px;
        pointer-events: none;
        z-index: 25;
      `;
      
      rockFormation.appendChild(particle);
      
      gsap.to(particle, {
        y: Math.random() * 30 - 15,
        x: Math.random() * 40 - 20,
        opacity: 0,
        duration: Math.random() * 0.8 + 0.5,
        ease: "power2.out",
        onComplete: () => particle.remove()
      });
    }, i * 50);
  }
}

function animateMiningSuccess() {
  document.querySelectorAll('.prop-center').forEach((slot, index) => {
    setTimeout(() => createSuccessSparkles(slot), index * 200);
  });
}

function animateMiningFailure() {
  document.querySelectorAll('.rock-formation').forEach((rock, index) => {
    setTimeout(() => {
      gsap.to(rock, {
        x: '+=5',
        duration: 0.1,
        ease: "power2.inOut",
        yoyo: true,
        repeat: 5
      });
      createDebrisParticles(rock);
    }, index * 100);
  });
}

function createSuccessSparkles(element) {
  for (let i = 0; i < 8; i++) {
    const sparkle = document.createElement('div');
    sparkle.style.cssText = `
      position: absolute;
      width: 6px;
      height: 6px;
      background: #FFD700;
      border-radius: 50%;
      top: 50%;
      left: 50%;
      pointer-events: none;
      z-index: 30;
    `;
    
    element.appendChild(sparkle);
    
    const angle = (i / 8) * Math.PI * 2;
    const distance = 40;
    
    gsap.to(sparkle, {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      opacity: 0,
      scale: 0,
      duration: 1,
      ease: "power2.out",
      onComplete: () => sparkle.remove()
    });
  }
}

function createDebrisParticles(rockFormation) {
  for (let i = 0; i < 10; i++) {
    const debris = document.createElement('div');
    debris.style.cssText = `
      position: absolute;
      width: ${Math.random() * 6 + 3}px;
      height: ${Math.random() * 6 + 3}px;
      background: #8B7355;
      border-radius: ${Math.random() * 2}px;
      top: ${Math.random() * 80}px;
      left: ${Math.random() * 380}px;
      pointer-events: none;
      z-index: 25;
    `;
    
    rockFormation.appendChild(debris);
    
    gsap.to(debris, {
      y: Math.random() * 50 + 20,
      x: Math.random() * 60 - 30,
      rotation: Math.random() * 360,
      opacity: 0,
      duration: Math.random() * 1.5 + 1,
      ease: "power2.out",
      onComplete: () => debris.remove()
    });
  }
}

function updateAdjustmentCounter() {
  const counter = document.querySelector('#adjustment-counter');
  if (counter) {
    counter.textContent = `Adjustments: ${miningState.adjustmentCount}/${miningState.maxAdjustments}`;
    if (miningState.adjustmentCount >= miningState.maxAdjustments) {
      counter.style.color = '#ff6b6b';
    }
  }
}

function disableAdjustmentButtons() {
  const buttons = document.querySelectorAll('.adjust-left, .adjust-right');
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });
}

function getOreColor(oreName) {
  const colors = {
    'Iron Ore': 'rgba(139, 69, 19, 1)',
    'Copper Ore': 'rgba(184, 115, 51, 1)',
    'Silver Ore': 'rgba(192, 192, 192, 1)',
    'Gold Ore': 'rgba(255, 215, 0, 1)',
    'Coal': 'rgba(64, 64, 64, 1)',
    'Gemstone': 'rgba(138, 43, 226, 1)',
    'default': 'rgba(139, 115, 85, 1)'
  };

  const oreKey = Object.keys(colors).find(key => oreName.toLowerCase().includes(key.toLowerCase()));
  return oreKey ? colors[oreKey] : colors.default;
}

function injectMiningAnimationsCSS() {
  if (document.getElementById('mining-animations-css')) return;
  
  const additionalCSS = `
    @keyframes rock-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }

    @keyframes mining-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
    }

    @keyframes border-glow {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .rock-formation {
      transition: all 0.3s ease;
      will-change: transform, box-shadow;
    }

    .rock-formation:hover {
      animation: rock-pulse 2s infinite ease-in-out;
    }

    .ore-input-slot {
      will-change: transform, opacity, scale;
      transition: all 0.5s ease;
    }

    .property-slot {
      will-change: transform, box-shadow, opacity;
      transition: all 0.3s ease;
      transform-origin: center;
    }

    .prop-center {
      position: relative;
      overflow: visible;
    }

    .prop-center::after {
      content: '';
      position: absolute;
      top: -2px;
      left: -2px;
      right: -2px;
      bottom: -2px;
      border: 2px solid transparent;
      border-radius: 10px;
      background: linear-gradient(45deg, #FFD700, #FFA500, #FFD700);
      background-size: 200% 200%;
      animation: border-glow 2s linear infinite;
      z-index: -1;
    }

    .prop-left { transform-origin: left center; }
    .prop-right { transform-origin: right center; }

    .ore {
      transition: all 0.2s ease;
    }

    .ore:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(139,69,19,0.3);
    }

    .fantasy-button:disabled {
      opacity: 0.5 !important;
      cursor: not-allowed !important;
      pointer-events: none;
    }

    .adjust-left:not(:disabled):hover,
    .adjust-right:not(:disabled):hover {
      background: rgba(255,215,0,0.2);
      border-color: #FFD700;
    }

    .adjust-left, .adjust-right {
      will-change: transform, background-color;
      transition: all 0.2s ease;
    }

    .adjust-left:active, .adjust-right:active {
      transform: scale(0.95);
    }

    .ore-input-slot img {
      transition: all 0.3s ease;
    }

    .ore-input-slot:hover img {
      transform: scale(1.05);
      filter: brightness(1.1);
    }

    .rock-texture {
      mix-blend-mode: multiply;
      opacity: 0.3;
    }

    .aligned-center {
      box-shadow: 0 0 20px rgba(76,175,80,0.8), inset 0 0 10px rgba(76,175,80,0.3) !important;
      border-color: #4CAF50 !important;
    }

    @media (max-width: 768px) {
      .rock-formation { width: 320px; height: 70px; }
      .ore-input-slot { width: 60px; height: 60px; }
      .property-slot { width: 50px; height: 45px; font-size: 0.7rem; }
      .mining-row { gap: 0.3rem; }
    }

    #available-ores::-webkit-scrollbar,
    #available-recipes::-webkit-scrollbar { height: 6px; }

    #available-ores::-webkit-scrollbar-track,
    #available-recipes::-webkit-scrollbar-track {
      background: rgba(139,69,19,0.5);
      border-radius: 3px;
    }

    #available-ores::-webkit-scrollbar-thumb,
    #available-recipes::-webkit-scrollbar-thumb {
      background: rgba(139,69,19,0.5);
      border-radius: 3px;
    }

    #available-ores::-webkit-scrollbar-thumb:hover,
    #available-recipes::-webkit-scrollbar-thumb:hover {
      background: rgba(139,69,19,0.7);
    }
  `;

  const style = document.createElement('style');
  style.id = 'mining-animations-css';
  style.textContent = additionalCSS;
  document.head.appendChild(style);
}

export function clearOreCache() {
  oreCache.clear();
}

export function preloadOres(oreNames) {
  return batchEnrichOres(oreNames.map(name => ({ item: name, amount: 1 })));
}

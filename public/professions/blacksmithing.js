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

function createSingleMiningRowHTML() {
  return `
    <div class="single-mining-row" style="display: flex; align-items: center; gap: 1rem; margin: 1.5rem 0; justify-content: center; position: relative; padding: 1rem; background: rgba(139,69,19,0.1); border: 2px solid #8B4513; border-radius: 15px;">
      
      <!-- Left adjustment button -->
      <div class="adjustment-controls">
        <button class="fantasy-button adjust-left" style="padding: 0.4rem 0.8rem; font-size: 1.4rem; opacity: 0.3; background: rgba(139,69,19,0.6); border: 2px solid #654321;" disabled>←</button>
      </div>
      
      <!-- Mining stations (3 ore slots in horizontal layout) -->
      <div class="mining-stations" style="display: flex; gap: 1rem; align-items: center;">
        
        <!-- Station 1 -->
        <div class="mining-station" data-station="0" style="text-align: center;">
          <div class="ore-input-slot" data-row="0" style="width: 80px; height: 80px; border: 2px dashed #FFD700; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(255,215,0,0.15); transition: all 0.5s ease; margin-bottom: 0.5rem; cursor: pointer;">
            <span style="color: #FFD700; font-size: 0.8rem; text-align: center; line-height: 1.2;">Drop<br>Ore 1</span>
          </div>
          <div class="center-property" data-row="0" style="width: 80px; height: 45px; border: 3px solid #FFD700; border-radius: 8px; background: linear-gradient(135deg, rgba(255,215,0,0.9) 0%, rgba(255,215,0,0.7) 100%); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #8B4513; font-weight: bold; box-shadow: 0 0 15px rgba(255,215,0,0.5), inset 0 2px 4px rgba(0,0,0,0.2); opacity: 0; transform: scale(0.8);">-</div>
        </div>
        
        <!-- Station 2 -->
        <div class="mining-station" data-station="1" style="text-align: center;">
          <div class="ore-input-slot" data-row="1" style="width: 80px; height: 80px; border: 2px dashed #FFD700; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(255,215,0,0.15); transition: all 0.5s ease; margin-bottom: 0.5rem; cursor: pointer;">
            <span style="color: #FFD700; font-size: 0.8rem; text-align: center; line-height: 1.2;">Drop<br>Ore 2</span>
          </div>
          <div class="center-property" data-row="1" style="width: 80px; height: 45px; border: 3px solid #FFD700; border-radius: 8px; background: linear-gradient(135deg, rgba(255,215,0,0.9) 0%, rgba(255,215,0,0.7) 100%); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #8B4513; font-weight: bold; box-shadow: 0 0 15px rgba(255,215,0,0.5), inset 0 2px 4px rgba(0,0,0,0.2); opacity: 0; transform: scale(0.8);">-</div>
        </div>
        
        <!-- Station 3 -->
        <div class="mining-station" data-station="2" style="text-align: center;">
          <div class="ore-input-slot" data-row="2" style="width: 80px; height: 80px; border: 2px dashed #FFD700; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(255,215,0,0.15); transition: all 0.5s ease; margin-bottom: 0.5rem; cursor: pointer;">
            <span style="color: #FFD700; font-size: 0.8rem; text-align: center; line-height: 1.2;">Drop<br>Ore 3</span>
          </div>
          <div class="center-property" data-row="2" style="width: 80px; height: 45px; border: 3px solid #FFD700; border-radius: 8px; background: linear-gradient(135deg, rgba(255,215,0,0.9) 0%, rgba(255,215,0,0.7) 100%); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #8B4513; font-weight: bold; box-shadow: 0 0 15px rgba(255,215,0,0.5), inset 0 2px 4px rgba(0,0,0,0.2); opacity: 0; transform: scale(0.8);">-</div>
        </div>
        
      </div>
      
      <!-- Right adjustment button -->
      <div class="adjustment-controls">
        <button class="fantasy-button adjust-right" style="padding: 0.4rem 0.8rem; font-size: 1.4rem; opacity: 0.3; background: rgba(139,69,19,0.6); border: 2px solid #654321;" disabled>→</button>
      </div>
      
    </div>
  `;
}

function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 900px; max-height: 99vh; overflow-y: auto; text-align: center; scrollbar-width:none;">
      <h2>Crafting: ${miningState.professionName}</h2>
                
      <div id="craft-result" style="margin-top: 4px; font-weight: bold;">Select 3 ores to start mining</div>
      
      <div id="adjustment-counter" style="margin-top: 0.5rem; font-size: 0.9rem; color: #666; display: none;">
        Adjustments: ${miningState.adjustmentCount}/${miningState.maxAdjustments}
      </div>
      
      <div id="alignment-status" style="margin-top: 0.5rem; font-size: 0.9rem; color: #FFD700; display: none;">
        <span id="alignment-text">Align all properties for successful extraction!</span>
      </div>
      
      <div id="mining-area" style="margin: 1rem 0;">
        ${createSingleMiningRowHTML()}
      </div>
      
      <h3>Available Ores</h3>
      <div id="available-ores" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; margin-bottom: 5px; border: 1px solid #444; border-radius: 8px; background: rgba(139,69,19,0.1); scrollbar-width: none; max-height: 85px;">
        ${renderOresHTML()}
      </div>
      
      <h3>Recipes</h3>
      <div id="available-recipes" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; margin-bottom: 1rem; border: 1px solid #444; border-radius: 8px; background: rgba(139,69,19,0.1); scrollbar-width: none; max-height: 95px;">
        ${renderRecipesHTML()}
      </div>
      
      <div style="display: flex; justify-content: center; gap: 0.5rem;">
        <button class="fantasy-button message-ok-btn" style="flex: 1; max-width: 100px;">Close</button>
        <button id="craft-btn" class="fantasy-button" disabled style="flex: 1; max-width: 100px;">Mine</button>
        <button id="finish-btn" class="fantasy-button" disabled style="flex: 1; max-width: 100px; display: none;">Extract</button>
        <button id="claim-btn" class="fantasy-button" style="flex: 1; max-width: 100px; display: none;">Claim</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setupModalEventListeners(modal);
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
      <div style="font-size: 0.8rem; color: #c4975a; font-weight: bold;">${recipe.name}</div>
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
    <div style="background: rgba(139,69,19,0.1); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
      <h4 style="color: #FFD700; margin-bottom: 0.8rem; text-align: center;">Ore Matching Guide</h4>
      <div style="font-size: 0.85rem; color: #ccc; text-align: center; margin-bottom: 1rem; font-style: italic;">
        Find ores with these properties (all three must align horizontally):
      </div>
  `;

  matchingResults.forEach((result) => {
    const hasMatches = result.matchingOres.length > 0;
    const borderColor = hasMatches ? '#8B4513' : '#ff6b6b';
    const bgColor = hasMatches ? 'rgba(139,69,19,0.1)' : 'rgba(255,107,107,0.1)';
    
    matchingHTML += `
      <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 6px; padding: 0.8rem; margin-bottom: 0.8rem;">
        <div style="color: #FFD700; font-weight: bold; margin-bottom: 0.5rem;">
          Property ${result.position}: "${result.property}"
        </div>
    `;

    if (hasMatches) {
      matchingHTML += `
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
          <span style="color: #8B4513; font-size: 0.8rem; margin-right: 0.5rem;">Available ores:</span>
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
        ⛏️ <strong>Mining Tip:</strong> Use adjustments to align all three <strong>properties</strong> horizontally for successful extraction!
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
      
      <div style="background: rgba(139,69,19,0.1); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
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
      <h3 style="color: #8B4513; margin-bottom: 1rem;">${ore.name}</h3>
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

function setupModalEventListeners(modal) {
  const craftBtn = modal.querySelector('#craft-btn');
  const finishBtn = modal.querySelector('#finish-btn');
  const resultDiv = modal.querySelector('#craft-result');
  const adjustmentCounter = modal.querySelector('#adjustment-counter');

  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
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

  // Handle ore slot clicks and adjustment buttons
  const miningArea = modal.querySelector('#mining-area');
  miningArea.addEventListener('click', (e) => {
    const adjustBtn = e.target.closest('.adjust-left, .adjust-right');
    if (adjustBtn && !adjustBtn.disabled) {
      const direction = adjustBtn.classList.contains('adjust-left') ? 'left' : 'right';
      handleGlobalAdjustment(direction, resultDiv);
    }
    
    const oreInputSlot = e.target.closest('.ore-input-slot');
    if (oreInputSlot && !miningState.isCraftingStarted) {
      const rowIdx = parseInt(oreInputSlot.dataset.row);
      
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
  
  const station = modal.querySelector(`[data-station="${slotIdx}"]`);
  const oreInputSlot = station.querySelector('.ore-input-slot');
  
  oreInputSlot.innerHTML = `<img src="assets/art/ingridients/${ore.sprite}.png" style="width:70px;height:70px;cursor:pointer;" title="Click to remove ${ore.name}">`;
  oreInputSlot.style.border = '2px solid #8B4513';
  oreInputSlot.style.background = 'rgba(139,69,19,0.4)';
  
  animateOreIntegration(station, ore);
  updateCraftButtonState(modal);
}

function removeOreFromSlot(slotIdx, modal) {
  miningState.selectedOres[slotIdx] = null;
  
  const station = modal.querySelector(`[data-station="${slotIdx}"]`);
  const oreInputSlot = station.querySelector('.ore-input-slot');
  
  oreInputSlot.innerHTML = `<span style="color: #FFD700; font-size: 0.8rem; text-align: center; line-height: 1.2;">Drop<br>Ore ${slotIdx + 1}</span>`;
  oreInputSlot.style.border = '2px dashed #FFD700';
  oreInputSlot.style.background = 'rgba(255,215,0,0.15)';
  
  animateStationClear(station);
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

function animateOreIntegration(station, ore) {
  const oreInputSlot = station.querySelector('.ore-input-slot');
  const oreColor = getOreColor(ore.name);
  
  gsap.to(station, {
    backgroundColor: `rgba(139,69,19,0.2)`,
    borderColor: oreColor,
    duration: 1.0,
    ease: "power2.out"
  });
  
  gsap.to(oreInputSlot, {
    boxShadow: '0 0 20px rgba(255,215,0,0.8), inset 0 0 10px rgba(255,215,0,0.3)',
    duration: 0.8,
    ease: "power2.out"
  });
}

function animateStationClear(station) {
  gsap.to(station, {
    backgroundColor: 'transparent',
    borderColor: '#8B4513',
    duration: 0.8,
    ease: "power2.out"
  });
  
  const oreInputSlot = station.querySelector('.ore-input-slot');
  gsap.to(oreInputSlot, { boxShadow: 'none', duration: 0.6, ease: "power2.out" });
}

async function startMiningAnimation(resultDiv, modal) {
  const miningArea = modal.querySelector('#mining-area');
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

    // Animate each ore station breaking and revealing properties
    for (let idx = 0; idx < miningState.enrichedOres.length; idx++) {
      const ore = miningState.enrichedOres[idx];
      const station = miningArea.querySelector(`[data-station="${idx}"]`);
      const props = ore.properties;
      
      await animateOreBreaking(station, props, idx);
    }

    setTimeout(() => {
      resultDiv.textContent = 'You may now apply adjustments to all properties.';
    }, 1000);

    // Store all three properties for each ore (we'll use the center one [1] for crafting)
    miningState.randomizedProperties = miningState.enrichedOres.map(o => Object.values(o.properties));
    miningState.originalProperties = miningState.randomizedProperties.map(p => [...p]);

    // Initialize global adjustment tracking
    miningState.globalAdjustments = { left: 0, right: 0 };
    
    // Also maintain individual adjustments for API compatibility
    miningState.adjustments = {};
    for (let i = 0; i < 3; i++) {
      miningState.adjustments[i] = { left: 0, right: 0 };
    }

  } catch (err) {
    resultDiv.textContent = 'Server error while verifying ores.';
  }
}

async function animateOreBreaking(station, properties, stationIndex) {
  const oreInputSlot = station.querySelector('.ore-input-slot');
  const centerProperty = station.querySelector('.center-property');
  const adjustButtons = document.querySelectorAll('.adjust-left, .adjust-right');
  
  createOreBreakingEffect(oreInputSlot);
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Hide ore and show property
  gsap.to(oreInputSlot, {
    scale: 0.8,
    opacity: 0,
    duration: 0.5,
    ease: "power2.in"
  });
  
  gsap.to(centerProperty, {
    opacity: 1,
    scale: 1,
    duration: 0.8,
    ease: "back.out(1.4)",
    delay: 0.3,
    onStart: () => {
      // Show the center property (index 1)
      centerProperty.textContent = properties[1];
    }
  });
  
  // Enable adjustment buttons after all stations are processed
  if (stationIndex === 2) { // Last station
    gsap.to(adjustButtons, {
      opacity: 1,
      duration: 0.6,
      delay: 0.8,
      onStart: () => {
        adjustButtons.forEach(btn => btn.disabled = false);
      }
    });
  }

  createStationDustEffect(station);
}

function createOreBreakingEffect(oreInputSlot) {
  const rect = oreInputSlot.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  for (let i = 0; i < 8; i++) {
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
    
    const angle = (i / 8) * Math.PI * 2;
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

function createStationDustEffect(station) {
  function createDustParticle() {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: absolute;
      width: ${Math.random() * 3 + 1}px;
      height: ${Math.random() * 3 + 1}px;
      background: rgba(139,115,85,0.7);
      border-radius: 50%;
      top: ${Math.random() * 80}px;
      left: ${Math.random() * 80}px;
      pointer-events: none;
      z-index: 20;
    `;
    
    station.appendChild(particle);
    
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
    if (document.contains(station)) {
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
    
    // Convert global adjustments to individual row adjustments for API compatibility
    for (let i = 0; i < 3; i++) {
      if (miningState.adjustments[i].left > 0) {
        adjustments.push({ bottle: i, direction: 'up', count: miningState.adjustments[i].left });
      }
      if (miningState.adjustments[i].right > 0) {
        adjustments.push({ bottle: i, direction: 'down', count: miningState.adjustments[i].right });
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

function handleGlobalAdjustment(direction, resultDiv) {
  if (miningState.adjustmentCount >= miningState.maxAdjustments) {
    resultDiv.textContent = `No more adjustments available (${miningState.maxAdjustments}/${miningState.maxAdjustments}).`;
    return;
  }

  // Apply adjustment to all three ore properties simultaneously
  for (let rowIdx = 0; rowIdx < 3; rowIdx++) {
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
  }

  // Update global adjustment counter
  if (direction === 'left') {
    miningState.globalAdjustments.left++;
  } else {
    miningState.globalAdjustments.right++;
  }

  updateAllMiningStations();
  miningState.adjustmentCount++;
  updateAdjustmentCounter();

  if (miningState.adjustmentCount >= miningState.maxAdjustments) {
    disableAdjustmentButtons();
  }
}

function updateAllMiningStations() {
  const stations = document.querySelectorAll('.mining-station');
  
  stations.forEach((station, idx) => {
    const props = miningState.randomizedProperties[idx];
    const centerProperty = station.querySelector('.center-property');
    
    gsap.to(centerProperty, {
      x: '+=15',
      duration: 0.15,
      ease: "power2.out",
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        // Update to show center property (index 1)
        centerProperty.textContent = props[1];
      }
    });
    
    gsap.to(station, {
      y: '+=2',
      duration: 0.1,
      ease: "power2.inOut",
      yoyo: true,
      repeat: 3
    });
    
    createImpactParticles(station);
    
    gsap.to(centerProperty, {
      backgroundColor: 'rgba(255,215,0,0.5)',
      duration: 0.2,
      ease: "power2.out",
      yoyo: true,
      repeat: 1
    });
  });
}

function createImpactParticles(station) {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const particle = document.createElement('div');
      particle.style.cssText = `
        position: absolute;
        width: ${Math.random() * 4 + 2}px;
        height: ${Math.random() * 4 + 2}px;
        background: rgba(255,215,0,0.8);
        border-radius: 50%;
        top: 40px;
        left: ${Math.random() * 40 + 20}px;
        pointer-events: none;
        z-index: 25;
      `;
      
      station.appendChild(particle);
      
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
  document.querySelectorAll('.center-property').forEach((slot, index) => {
    setTimeout(() => createSuccessSparkles(slot), index * 200);
  });
}

function animateMiningFailure() {
  document.querySelectorAll('.mining-station').forEach((station, index) => {
    setTimeout(() => {
      gsap.to(station, {
        x: '+=5',
        duration: 0.1,
        ease: "power2.inOut",
        yoyo: true,
        repeat: 5
      });
      createDebrisParticles(station);
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

function createDebrisParticles(station) {
  for (let i = 0; i < 6; i++) {
    const debris = document.createElement('div');
    debris.style.cssText = `
      position: absolute;
      width: ${Math.random() * 6 + 3}px;
      height: ${Math.random() * 6 + 3}px;
      background: #8B7355;
      border-radius: ${Math.random() * 2}px;
      top: ${Math.random() * 80}px;
      left: ${Math.random() * 80}px;
      pointer-events: none;
      z-index: 25;
    `;
    
    station.appendChild(debris);
    
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
    @keyframes station-pulse {
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

    .single-mining-row {
      transition: all 0.3s ease;
      will-change: transform, box-shadow;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 2px 8px rgba(139,69,19,0.2);
    }

    .mining-station {
      transition: all 0.3s ease;
      will-change: transform, border-color;
      border: 2px solid transparent;
      border-radius: 12px;
      padding: 0.5rem;
    }

    .mining-station:hover {
      animation: station-pulse 2s infinite ease-in-out;
    }

    .ore-input-slot {
      will-change: transform, opacity, scale;
      transition: all 0.5s ease;
    }

    .center-property {
      will-change: transform, box-shadow, opacity;
      transition: all 0.3s ease;
      transform-origin: center;
      position: relative;
      overflow: visible;
    }

    .center-property::after {
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
      background: rgba(255,215,0,0.3) !important;
      border-color: #FFD700 !important;
      transform: scale(1.05);
    }

    .adjust-left, .adjust-right {
      will-change: transform, background-color;
      transition: all 0.2s ease;
      min-width: 50px;
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

    .aligned-center {
      box-shadow: 0 0 20px rgba(76,175,80,0.8), inset 0 0 10px rgba(76,175,80,0.3) !important;
      border-color: #4CAF50 !important;
    }

    .adjustment-controls {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    @media (max-width: 768px) {
      .single-mining-row { 
        flex-direction: column; 
        gap: 1rem; 
        padding: 1rem 0.5rem;
      }
      .mining-stations { 
        flex-direction: row; 
        gap: 0.5rem;
        flex-wrap: wrap;
        justify-content: center;
      }
      .mining-station {
        flex: 0 0 auto;
      }
      .ore-input-slot { 
        width: 70px; 
        height: 70px; 
      }
      .center-property { 
        width: 70px; 
        height: 40px; 
        font-size: 0.7rem; 
      }
      .adjust-left, .adjust-right { 
        padding: 0.3rem 0.6rem !important; 
        font-size: 1.2rem !important; 
        min-width: 45px;
      }
      .adjustment-controls {
        flex-direction: row;
        gap: 1rem;
      }
    }

    @media (max-width: 480px) {
      .mining-stations {
        flex-direction: column;
        gap: 0.8rem;
      }
      .ore-input-slot { 
        width: 60px; 
        height: 60px; 
      }
      .center-property { 
        width: 60px; 
        height: 35px; 
        font-size: 0.6rem; 
      }
    }

    #available-ores::-webkit-scrollbar,
    #available-recipes::-webkit-scrollbar { height: 6px; }

    #available-ores::-webkit-scrollbar-track,
    #available-recipes::-webkit-scrollbar-track {
      background: rgba(139,69,19,0.1);
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

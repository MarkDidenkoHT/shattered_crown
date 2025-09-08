// Optimized Alchemy profession module
let context = null;
let alchemyState = null;
let ingredientCache = new Map(); // Cache ingredient data

export async function startCraftingSession(ctx) {
  console.log('[ALCHEMY] Starting alchemy crafting session...');
  context = ctx;
  
  const { loadingModal, loadingStartTime, updateLoadingProgress, finishLoading } = context;
  
  try {
    // Step 1: Parallel data fetching - start both requests simultaneously
    updateLoadingProgress(loadingModal, "Accessing your ingredient vault...", "Loading bank items and recipes...");
    
    const [bankResponse, recipesPromise] = await Promise.all([
      fetch(`/api/crafting/materials/${context.profile.id}/${context.professionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }),
      context.fetchRecipes(context.professionId) // Start recipe loading in parallel
    ]);
    
    if (!bankResponse.ok) {
      throw new Error(`HTTP error! status: ${bankResponse.status}`);
    }
    
    const bankItems = await bankResponse.json();
    
    // Step 2: Batch ingredient enrichment
    updateLoadingProgress(loadingModal, "Analyzing ingredient properties...", "Processing ingredient data...");
    
    const enriched = await batchEnrichIngredients(bankItems);
    
    // Step 3: Wait for recipes to complete (likely already done)
    const recipes = await recipesPromise;
    
    // Step 4: Initialize state
    updateLoadingProgress(loadingModal, "Preparing alchemy laboratory...", "Setting up interface...");
    
    alchemyState = {
      professionId: context.professionId,
      professionName: context.professionName,
      availableHerbs: enriched,
      selectedHerbs: [null, null, null],
      randomizedProperties: [[], [], []],
      originalProperties: [[], [], []],
      currentAdjustedCol: null,
      isCraftingStarted: false,
      result: null,
      adjustmentCount: 0,
      maxAdjustments: 2,
      enrichedHerbs: null,
      recipes: recipes, // Store recipes immediately
      //sessionId: null
    };
    
    // Step 5: Minimum loading time and render
    await finishLoading(loadingModal, loadingStartTime, 2000); // Reduced from 3000ms
    
    renderCraftingModal();
    injectBottleAnimationsCSS();
    
    console.log('[ALCHEMY] Alchemy crafting session loaded successfully!');
    
  } catch (error) {
    console.error('[ALCHEMY] Error starting alchemy session:', error);
    if (finishLoading && loadingModal) {
      await finishLoading(loadingModal, loadingStartTime, 500);
    }
    throw error;
  }
}

// Optimized batch ingredient enrichment
async function batchEnrichIngredients(bankItems) {
  if (!bankItems.length) return [];
  
  const ingredientNames = bankItems.map(item => item.item);
  const uniqueNames = [...new Set(ingredientNames)];
  const uncachedNames = uniqueNames.filter(name => !ingredientCache.has(name));
  
  if (uncachedNames.length > 0) {
    try {
      const response = await fetch('/api/crafting/enrich-ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemNames: uncachedNames })
      });
      
      if (!response.ok) {
        console.error('[ALCHEMY] Enrich API failed:', response.status);
        // return await fallbackEnrichIngredients(bankItems);
      }

      const { ingredientMap } = await response.json();
      
      // Cache the results
      Object.values(ingredientMap).forEach(ingredient => {
        ingredientCache.set(ingredient.name, ingredient);
      });
      
    } catch (error) {
      console.warn('[ALCHEMY] Batch ingredient fetch failed, falling back to individual requests:', error);
      // return await fallbackEnrichIngredients(bankItems);
    }
  }
  
  // Build enriched array from cache
  return bankItems.map(item => {
    const cachedIngredient = ingredientCache.get(item.item);
    if (cachedIngredient) {
      return {
        name: item.item,
        amount: item.amount,
        properties: cachedIngredient.properties,
        sprite: cachedIngredient.sprite,
      };
    } else {
      return {
        name: item.item,
        amount: item.amount,
        properties: null,
        sprite: 'default'
      };
    }
  });
}

function createCraftingSlotHTML(slotIndex) {
  return `
    <div class="crafting-column" data-slot="${slotIndex}" style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem;">
      <!-- Herb Slot -->
      <div class="herb-slot" style="width: 60px; height: 60px; border: 2px dashed #aaa; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2);">
        <span style="color: #FFD700; font-size: 0.7rem;">Drop Herb</span>
      </div>
      
      <!-- Up Arrow -->
      <div class="arrow-up">
        <button class="fantasy-button adjust-up" data-col="${slotIndex}" style="padding: 0.1rem 0.4rem; font-size: 1rem; opacity: 0.3;" disabled>↑</button>
      </div>
      
      <!-- Enhanced Properties Bottle - MADE SMALLER -->
      <div class="properties-bottle" style="width: 50px; height: 90px; border: 2px solid #8B4513; border-radius: 8px 8px 16px 16px; background: linear-gradient(to bottom, rgba(139,69,19,0.5) 0%, rgba(139,69,19,0.3) 100%); display: flex; flex-direction: column; justify-content: space-around; align-items: center; position: relative; overflow: hidden;">
        
        <!-- Enhanced Bottle Cork/Top - SMALLER -->
        <div class="bottle-cork" style="position: absolute; top: -10px; width: 20px; height: 16px; background: linear-gradient(135deg, #D2691E 0%, #8B4513 50%, #654321 100%); border-radius: 5px 5px 2px 2px; border: 1px solid #654321; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 10;">
          <!-- Cork texture lines -->
          <div style="position: absolute; top: 2px; left: 50%; transform: translateX(-50%); width: 12px; height: 1px; background: rgba(0,0,0,0.2);"></div>
          <div style="position: absolute; top: 5px; left: 50%; transform: translateX(-50%); width: 8px; height: 1px; background: rgba(0,0,0,0.2);"></div>
          <div style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); width: 10px; height: 1px; background: rgba(0,0,0,0.2);"></div>
        </div>
        
        <!-- Liquid Container -->
        <div class="bottle-liquid" style="position: absolute; bottom: 0; left: 2px; right: 2px; height: 0; background: linear-gradient(to bottom, rgba(76,175,80,0.6) 0%, rgba(76,175,80,0.8) 100%); border-radius: 0 0 12px 12px; transition: none; opacity: 0;">
          <!-- Liquid surface shimmer -->
          <div class="liquid-surface" style="position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%); opacity: 0;"></div>
        </div>
        
        <!-- Bubble Container - SMALLER -->
        <div class="bubble-container" style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); width: 30px; height: 60px; pointer-events: none; overflow: hidden;">
          <!-- Bubbles will be dynamically created here -->
        </div>
        
        <!-- Property Slots - SMALLER -->
        <div class="property-slot prop-top" data-slot="${slotIndex}" data-position="0" style="width: 36px; height: 20px; border: 1px solid #666; border-radius: 3px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color:rgb(0, 0, 0); z-index: 5; position: relative;">
          -
        </div>
        <div class="property-slot prop-middle" data-slot="${slotIndex}" data-position="1" style="width: 36px; height: 20px; border: 1px solid #666; border-radius: 3px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color:rgb(0, 0, 0); z-index: 5; position: relative;">
          -
        </div>
        <div class="property-slot prop-bottom" data-slot="${slotIndex}" data-position="2" style="width: 36px; height: 20px; border: 1px solid #666; border-radius: 3px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color:rgb(0, 0, 0); z-index: 5; position: relative;">
          -
        </div>
      </div>
      
      <!-- Down Arrow -->
      <div class="arrow-down">
        <button class="fantasy-button adjust-down" data-col="${slotIndex}" style="padding: 0.1rem 0.4rem; font-size: 1rem; opacity: 0.3;" disabled>↓</button>
      </div>
    </div>
  `;
}

// Optimized modal rendering with pre-rendered content - MADE MORE COMPACT
function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 1000px; max-height: 99vh; height: 99vh; overflow-y: auto; text-align: center; scrollbar-width:none;">
            
      <div id="craft-result" style="font-weight: bold; min-height: 20px;">Select 3 herbs to start crafting</div>
      
      <div id="adjustment-counter" style="margin: 0.3rem 0; font-size: 0.85rem; color: #666; min-height: 16px; visibility: hidden;">
        Adjustments: ${alchemyState.adjustmentCount}/${alchemyState.maxAdjustments}
      </div>
      
      <div id="crafting-slots" style="display: flex; justify-content: center; gap: 0.8rem;">
        ${[0,1,2].map(i => createCraftingSlotHTML(i)).join('')}
      </div>
      
      <h3">Available Herbs</h3>
      <div id="available-herbs" style="display: flex; overflow-x: auto; gap: 0.4rem; padding: 4px; border: 1px solid #8B4513; border-radius: 6px; background: rgba(139,69,19,0.5); scrollbar-width: none; max-height: 100px; min-height: 100px;">
        ${renderHerbsHTML()}
      </div>
      
      <h3 style="margin: 0.3rem 0; font-size: 1rem;">Recipes</h3>
      <div id="available-recipes" style="display: flex; overflow-x: auto; gap: 0.4rem; padding: 4px; margin-bottom: 0.8rem; border: 1px solid #8B4513; border-radius: 6px; background: rgba(139,69,19,0.5); scrollbar-width: none; max-height: 100px; min-height: 100px;">
        ${renderRecipesHTML()}
      </div>
      
      <div style="display: flex; justify-content: center; gap: 0.4rem;">
        <button class="help-tutorial-close-button message-ok-btn">X</button>
        <button id="craft-btn" class="fantasy-button" disabled style="flex: 1; max-width: 80px; padding: 0.4rem;">Craft</button>
        <button id="finish-btn" class="fantasy-button" disabled style="flex: 1; max-width: 80px; padding: 0.4rem; display: none;">Finish</button>
        <button id="claim-btn" class="fantasy-button" style="flex: 1; max-width: 80px; padding: 0.4rem; display: none;">Claim</button>
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

// PATCH: Update renderHerbsHTML to include herb names in the slider
function renderHerbsHTML() {
  return alchemyState.availableHerbs.map((herb, idx) => `
    <div class="herb" data-index="${idx}" style="flex: 0 0 auto; cursor: pointer; border-radius: 6px; padding: 6px; background: rgba(139,69,19,0.2); border: 1px solid #8B4513; min-width: 70px; text-align: center; position: relative;">
      <img src="assets/art/ingridients/${herb.sprite}.png" title="${herb.name} (${herb.amount})" style="width:48px;height:48px;">
      <div style="font-size:0.65rem; color: #FFD700; font-weight: bold; margin-top: 2px;" title="${herb.name}">${herb.name}</div>
      <div style="font-size:0.7rem;">x${herb.amount}</div>
      <div class="info-icon" data-herb="${idx}" style="position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; background: #4CAF50; border-radius: 50%; color: white; font-size: 9px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

// Pre-render recipes HTML - MADE SMALLER
function renderRecipesHTML() {
  if (!alchemyState.recipes || alchemyState.recipes.length === 0) {
    return '<div style="color: #666; font-style: italic; padding: 0.8rem; font-size: 0.85rem;">No recipes available</div>';
  }
  
  return alchemyState.recipes.map((recipe, idx) => `
    <div class="recipe-card" data-recipe="${idx}" style="flex: 0 0 auto; cursor: pointer; border-radius: 6px; padding: 6px; background: rgba(139,69,19,0.2); border: 1px solid #8B4513; min-width: 70px; text-align: center; position: relative;">
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 48px; height: 48px; border-radius: 3px;">
      <div style="font-size: 0.8rem; margin-top: 3px; color: #FFD700; font-weight: bold;">${recipe.name}</div>
      <div class="info-icon" data-recipe="${idx}" style="position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; background: #4CAF50; border-radius: 50%; color: white; font-size: 9px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

// Helper function to find herbs that have a specific property
function findHerbsWithProperty(targetProperty) {
  if (!alchemyState || !alchemyState.availableHerbs) {
    return [];
  }

  const matchingHerbs = [];
  
  alchemyState.availableHerbs.forEach(herb => {
    if (!herb.properties) return;
    
    let herbProperties = [];
    
    // Handle different property formats
    if (Array.isArray(herb.properties)) {
      herbProperties = herb.properties;
    } else if (typeof herb.properties === 'object') {
      herbProperties = Object.values(herb.properties);
    } else if (typeof herb.properties === 'string') {
      // Try to parse if it's a stringified array or comma-separated
      try {
        const parsed = JSON.parse(herb.properties);
        if (Array.isArray(parsed)) {
          herbProperties = parsed;
        }
      } catch (e) {
        herbProperties = herb.properties.split(',').map(p => p.trim());
      }
    }
    
    const hasProperty = herbProperties.some(prop => {
      return prop && prop.toString().toLowerCase().trim() === targetProperty.toLowerCase().trim();
    });
    
    if (hasProperty && herb.amount > 0) {
      matchingHerbs.push({
        name: herb.name,
        sprite: herb.sprite,
        amount: herb.amount,
        properties: herbProperties
      });
    }
  });

  // Sort by availability (highest amount first)
  matchingHerbs.sort((a, b) => b.amount - a.amount);
  
  return matchingHerbs;
}

function generateIngredientMatching(recipe) {
  if (!alchemyState || !alchemyState.availableHerbs || !recipe.ingridients) {
    return '<div style="background: rgba(255,193,7,0.1); border: 1px solid #FFC107; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: center; color: #FFC107; font-size: 0.9rem;">Ingredient matching unavailable</div>';
  }

  let requiredProperties = [];
  if (Array.isArray(recipe.ingridients)) {
    requiredProperties = recipe.ingridients;
  } else if (typeof recipe.ingridients === 'object') {
    requiredProperties = Object.values(recipe.ingridients);
  } else if (typeof recipe.ingridients === 'string') {
    // Try to parse comma-separated values
    requiredProperties = recipe.ingridients.split(',').map(prop => prop.trim());
  }

  if (requiredProperties.length === 0) {
    return '<div style="background: rgba(255,193,7,0.1); border: 1px solid #FFC107; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: center; color: #FFC107; font-size: 0.9rem;">No properties specified for this recipe</div>';
  }

  // Find matching herbs for each required property
  const matchingResults = requiredProperties.map((requiredProp, index) => {
    const matchingHerbs = findHerbsWithProperty(requiredProp);
    return {
      property: requiredProp,
      position: index + 1,
      matchingHerbs: matchingHerbs
    };
  });

  // Generate HTML for matching results
  let matchingHTML = `
    <div style="background: rgba(76,175,80,0.1); border: 1px solid #4CAF50; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
      <h4 style="color: #4CAF50; margin-bottom: 0.8rem; text-align: center;">Ingredient Matching Guide</h4>
      <div style="font-size: 0.85rem; color: #ccc; text-align: center; margin-bottom: 1rem; font-style: italic;">
        Find herbs with these properties (bottom slot matters for recipe matching):
      </div>
  `;

  matchingResults.forEach((result, index) => {
    const hasMatches = result.matchingHerbs.length > 0;
    const borderColor = hasMatches ? '#4CAF50' : '#ff6b6b';
    const bgColor = hasMatches ? 'rgba(76,175,80,0.1)' : 'rgba(255,107,107,0.1)';
    
    matchingHTML += `
      <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 6px; padding: 0.8rem; margin-bottom: 0.8rem;">
        <div style="color: #c4975a; font-weight: bold; margin-bottom: 0.5rem;">
          Property ${result.position}: "${result.property}"
        </div>
    `;

    if (hasMatches) {
      matchingHTML += `
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; flex-direction: column;">
          <span style="color: #4CAF50; font-size: 0.8rem; margin-right: 0.5rem;">Available herbs:</span>
      `;
      
      result.matchingHerbs.forEach((herb, herbIndex) => {
        matchingHTML += `
          <div style="display: flex; align-items: center; background: rgba(255,255,255,0.1); border-radius: 4px; padding: 0.3rem 0.5rem; gap: 0.3rem;">
            <img src="assets/art/ingridients/${herb.sprite}.png" style="width: 20px; height: 20px;" title="${herb.name}">
            <span style="font-size: 0.75rem; color: #fff;">${herb.name}</span>
            <span style="font-size: 0.7rem; color: #999;">(${herb.amount})</span>
          </div>
        `;
      });
      
      matchingHTML += '</div>';
    } else {
      matchingHTML += `
        <div style="color: #ff6b6b; font-size: 0.8rem; font-style: italic;">
          ❌ No available herbs have this property
        </div>
      `;
    }

    matchingHTML += '</div>';
  });

  // Add crafting tip
  matchingHTML += `
    <div style="background: rgba(255,193,7,0.1); border: 1px solid #FFC107; border-radius: 6px; padding: 0.6rem; margin-top: 1rem;">
      <div style="color: #FFC107; font-size: 0.8rem; text-align: center;">
        💡 <strong>Tip:</strong> Remember that only the <strong>bottom property</strong> of each herb (after adjustments) is used for recipe matching!
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
  
  // Generate ingredient matching section
  const ingredientMatchingHTML = generateIngredientMatching(recipe);
  
  detailsModal.innerHTML = `
    <div class="message-content" style="max-width: 500px; text-align: center; max-height: 80vh; overflow-y: auto; scrollbar-width:none;">
      <h3 style="color: #c4975a; margin-bottom: 1rem;">${recipe.name}</h3>
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 96px; height: 96px; border-radius: 8px; margin-bottom: 1rem;">
      
      <div style="background: rgba(139,69,19,0.5); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
        <h4 style="color: #c4975a; margin-bottom: 0.5rem;">Required Properties:</h4>
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
  
  detailsModal.querySelector('.close-details-btn').addEventListener('click', () => {
    detailsModal.remove();
  });
  
  detailsModal.addEventListener('click', (e) => {
    if (e.target === detailsModal) {
      detailsModal.remove();
    }
  });
}

function showHerbProperties(herbIndex) {
  const herb = alchemyState.availableHerbs[herbIndex];
  const propsModal = document.createElement('div');
  propsModal.className = 'custom-message-box';
  propsModal.style.zIndex = '10001';
  
  let propertiesDisplay = '';
  if (typeof herb.properties === 'object' && herb.properties !== null) {
    if (Array.isArray(herb.properties)) {
      propertiesDisplay = herb.properties.map((prop, idx) => 
        `<div class="property-item" style="background: rgba(76,175,80,0.2); padding: 0.5rem; border-radius: 4px; margin-bottom: 0.3rem;">
          <strong>Property ${idx + 1}:</strong> ${prop}
        </div>`
      ).join('');
    } else {
      propertiesDisplay = Object.entries(herb.properties).map(([key, value]) => 
        `<div class="property-item" style="background: rgba(76,175,80,0.2); padding: 0.5rem; border-radius: 4px; margin-bottom: 0.3rem;">
          <strong>${key.toUpperCase()}:</strong> ${value}
        </div>`
      ).join('');
    }
  } else {
    propertiesDisplay = '<div style="color: #999; font-style: italic;">No properties available</div>';
  }
  
  propsModal.innerHTML = `
    <div class="message-content" style="max-width: 350px; text-align: center; scrollbar-width:none;">
      <h3 style="color: #4CAF50; margin-bottom: 1rem;">${herb.name}</h3>
      <img src="assets/art/ingridients/${herb.sprite}.png" alt="${herb.name}" style="width: 80px; height: 80px; border-radius: 8px; margin-bottom: 1rem;">
      
      <div style="background: rgba(0,0,0,0.3); border: 1px solid #4CAF50; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
        <h4 style="color: #4CAF50; margin-bottom: 0.8rem; text-align: center;">Properties:</h4>
        ${propertiesDisplay}
      </div>
      
      <div style="background: rgba(255,255,255,0.1); border-radius: 6px; padding: 0.6rem; margin-bottom: 1rem; font-size: 0.9rem;">
        <strong>Available:</strong> ${herb.amount} units
      </div>
      
      <button class="fantasy-button close-props-btn" style="width: 100%;">Close</button>
    </div>
  `;
  
  document.body.appendChild(propsModal);
  
  propsModal.querySelector('.close-props-btn').addEventListener('click', () => {
    propsModal.remove();
  });
  
  propsModal.addEventListener('click', (e) => {
    if (e.target === propsModal) {
      propsModal.remove();
    }
  });
}

function setBackground(modal) {
  const messageContent = modal.querySelector('.message-content');
  if (messageContent) {
    messageContent.style.backgroundSize = 'cover';
    messageContent.style.backgroundPosition = 'center';
    messageContent.style.backgroundRepeat = 'no-repeat';
    messageContent.style.backgroundImage = 'url(assets/art/professions/prof_background_alchemy.png)';
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
  const helpModal = modal.querySelector('#helpModal');
  const helpBtn = modal.querySelector('#helpBtn');
  const closeBtn = modal.querySelector('.help-tutorial-close-btn');

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

  // Close button
  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    removeBackground(modal);
    modal.remove();
    alchemyState = null;
    ingredientCache.clear(); // Clear cache when closing
  });

  // Use event delegation for herbs and info icons
  const herbsContainer = modal.querySelector('#available-herbs');
  herbsContainer.addEventListener('click', (e) => {
    const herbEl = e.target.closest('.herb');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon && infoIcon.dataset.herb) {
      e.stopPropagation();
      const herbIndex = parseInt(infoIcon.dataset.herb);
      showHerbProperties(herbIndex);
      return;
    }
    
    if (herbEl && !alchemyState.isCraftingStarted) {
      const idx = parseInt(herbEl.dataset.index);
      const herb = alchemyState.availableHerbs[idx];
      handleHerbSelection(herb, modal);
    }
  });

  // Use event delegation for recipes
  const recipesContainer = modal.querySelector('#available-recipes');
  recipesContainer.addEventListener('click', (e) => {
    const recipeCard = e.target.closest('.recipe-card');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon && infoIcon.dataset.recipe) {
      e.stopPropagation();
      const recipeIdx = parseInt(infoIcon.dataset.recipe);
      showRecipeDetails(alchemyState.recipes[recipeIdx]);
      return;
    }
    
    if (recipeCard) {
      const recipeIdx = parseInt(recipeCard.dataset.recipe);
      showRecipeDetails(alchemyState.recipes[recipeIdx]);
    }
  });

  craftBtn.addEventListener('click', () => {
    alchemyState.isCraftingStarted = true;
    resultDiv.textContent = 'Crafting...';
    craftBtn.style.display = 'none';
    finishBtn.style.display = 'block';
    finishBtn.disabled = false;
    adjustmentCounter.style.visibility = 'visible'; // Use visibility instead of display

    // Disable herb interactions
    herbsContainer.style.opacity = '0.5';
    herbsContainer.style.pointerEvents = 'none';

    startSlotAnimation(resultDiv, modal);
  });

  finishBtn.addEventListener('click', () => {
    finishBtn.disabled = true;
    patchAndSendCraftRequest(resultDiv);
  });

  // Use event delegation for adjustment buttons - THIS IS THE ONLY PLACE THEY SHOULD BE HANDLED
  const slotsContainer = modal.querySelector('#crafting-slots');
  slotsContainer.addEventListener('click', (e) => {
    const adjustBtn = e.target.closest('.adjust-up, .adjust-down');
    if (adjustBtn && !adjustBtn.disabled) {
      const colIdx = parseInt(adjustBtn.dataset.col);
      const direction = adjustBtn.classList.contains('adjust-up') ? 'up' : 'down';
      handleAdjustment(colIdx, direction, resultDiv);
    }
    
    // Handle herb slot clicks for removal
    const herbSlot = e.target.closest('.herb-slot img');
    if (herbSlot && !alchemyState.isCraftingStarted) {
      const column = herbSlot.closest('.crafting-column');
      const slotIdx = parseInt(column.dataset.slot);
      removeHerbFromSlot(slotIdx, modal);
    }
  });
}

function handleHerbSelection(herb, modal) {
  const slotIdx = alchemyState.selectedHerbs.findIndex(s => s === null);
  if (slotIdx === -1) return;

  alchemyState.selectedHerbs[slotIdx] = herb;
  
  const column = modal.querySelector(`[data-slot="${slotIdx}"]`);
  const herbSlot = column.querySelector('.herb-slot');
  
  herbSlot.innerHTML = `
    <img src="assets/art/ingridients/${herb.sprite}.png" style="width:48px;height:48px;cursor:pointer;" title="Click to remove ${herb.name}">
  `;
  herbSlot.style.border = '2px solid #4CAF50';
  herbSlot.style.background = 'rgba(76, 175, 80, 0.1)';
  
  animateBottleFill(column, herb);
  updateCraftButtonState(modal);
}

// Helper function to remove herb from slot
function removeHerbFromSlot(slotIdx, modal) {
  alchemyState.selectedHerbs[slotIdx] = null;
  
  const column = modal.querySelector(`[data-slot="${slotIdx}"]`);
  const herbSlot = column.querySelector('.herb-slot');
  
  herbSlot.innerHTML = '<span style="color: #666; font-size: 0.7rem;">Drop Herb</span>';
  herbSlot.style.border = '2px dashed #aaa';
  herbSlot.style.background = 'rgba(0,0,0,0.2)';
  
  animateBottleDrain(column);
  updateCraftButtonState(modal);
}

// Optimized craft button state update
function updateCraftButtonState(modal) {
  const craftBtn = modal.querySelector('#craft-btn');
  const resultDiv = modal.querySelector('#craft-result');
  
  if (alchemyState.selectedHerbs.every(h => h !== null)) {
    craftBtn.disabled = false;
    resultDiv.textContent = 'Ready to craft!';
  } else {
    craftBtn.disabled = true;
    resultDiv.textContent = 'Select 3 herbs to start crafting';
  }
}

// Animate bottle filling with liquid - ADJUSTED FOR SMALLER BOTTLES
function animateBottleFill(column, herb) {
  const liquid = column.querySelector('.bottle-liquid');
  const surface = column.querySelector('.liquid-surface');
  const bottle = column.querySelector('.properties-bottle');
  const liquidColor = getHerbColor(herb.name);
  console.log('[DEBUG] liquidColor from getHerbColor:', liquidColor);
  const rgbColor = liquidColor.replace('rgba(', 'rgb(').replace(/, 1\)$/, ')');
  console.log('[DEBUG] converted rgbColor:', rgbColor);
  const gradient = `linear-gradient(to bottom, ${rgbColor.replace('rgb(', 'rgba(').replace(')', ', 0.6)')} 0%, ${rgbColor.replace('rgb(', 'rgba(').replace(')', ', 0.8)')} 100%)`;
  console.log('[DEBUG] final gradient:', gradient);
  
  // Set liquid color
  liquid.style.background = gradient;
  liquid.style.opacity = '1';
  
  // Animate liquid rising
  gsap.set(liquid, { height: 0 });
  gsap.to(liquid, {
    height: '85%',
    duration: 1.2,
    ease: "power2.out",
    onComplete: () => {
      // Show surface shimmer
      gsap.set(surface, { opacity: 1 });
      gsap.to(surface, {
        x: '100%',
        duration: 2,
        repeat: -1,
        ease: "sine.inOut"
      });
    }
  });
  
  // Bottle gentle glow effect - also needs proper color
  const glowColor = rgbColor.replace('rgb(', 'rgba(').replace(')', ', 0.4)');
  console.log('[DEBUG] glow color:', glowColor);
  
  gsap.to(bottle, {
    boxShadow: `0 0 12px ${glowColor}`, // Reduced glow for smaller bottles
    duration: 0.8,
    ease: "power2.out"
  });
  
  // Cork slight bounce when liquid fills
  const cork = column.querySelector('.bottle-cork');
  gsap.to(cork, {
    y: -2,
    duration: 0.3,
    ease: "bounce.out",
    delay: 0.8,
    yoyo: true,
    repeat: 1
  });
}

function animateBottleDrain(column) {
  const liquid = column.querySelector('.bottle-liquid');
  const surface = column.querySelector('.liquid-surface');
  const bottle = column.querySelector('.properties-bottle');
  
  // Stop surface animation
  gsap.killTweensOf(surface);
  gsap.set(surface, { opacity: 0 });
  
  // Animate liquid draining
  gsap.to(liquid, {
    height: 0,
    duration: 0.8,
    ease: "power2.in",
    onComplete: () => {
      liquid.style.opacity = '0';
    }
  });
  
  // Remove bottle glow
  gsap.to(bottle, {
    boxShadow: 'none',
    duration: 0.6,
    ease: "power2.out"
  });
}

function createBubblingEffect(column) {
  const bubbleContainer = column.querySelector('.bubble-container');
  
  function createBubble() {
    const bubble = document.createElement('div');
    bubble.style.cssText = `
      position: absolute;
      width: ${Math.random() * 3 + 1.5}px;
      height: ${Math.random() * 3 + 1.5}px;
      background: rgba(255,255,255,0.6);
      border-radius: 50%;
      bottom: 0;
      left: ${Math.random() * 20 + 5}px;
      pointer-events: none;
    `;
    
    bubbleContainer.appendChild(bubble);
    
    // Animate bubble rising
    gsap.to(bubble, {
      y: -60, // Reduced for smaller bottles
      opacity: 0,
      duration: Math.random() * 2 + 1.5,
      ease: "power1.out",
      onComplete: () => {
        if (bubble.parentNode) {
          bubble.remove();
        }
      }
    });
    
    // Add slight horizontal movement
    gsap.to(bubble, {
      x: `+=${Math.random() * 8 - 4}`, // Reduced movement
      duration: Math.random() * 1 + 0.5,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1
    });
  }
  
  // Create bubbles at intervals
  const bubbleInterval = setInterval(() => {
    if (document.contains(column)) {
      createBubble();
    } else {
      clearInterval(bubbleInterval);
    }
  }, Math.random() * 800 + 400);
  
  return bubbleInterval;
}

// Enhanced startSlotAnimation with liquid reduction
async function startSlotAnimation(resultDiv, modal) {
  const slotArea = modal.querySelector('#crafting-slots');
  resultDiv.textContent = 'Verifying ingredients...';

  const selectedHerbNames = alchemyState.selectedHerbs.map(h => h.name);

  try {
    const reserveRes = await fetch('/api/crafting/reserve-alchemy-ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_id: context.profile.id,
        profession_id: alchemyState.professionId,
        selected_ingredients: selectedHerbNames
      })
    });

    const reserveJson = await reserveRes.json();
    if (!reserveRes.ok || !reserveJson.success || !Array.isArray(reserveJson.herbs)) {
      console.error('[ALCHEMY] Reservation failed:', reserveJson);
      resultDiv.textContent = `Herb verification failed: ${reserveJson?.error || 'Unknown error'}`;
      return;
    }

    alchemyState.sessionId = reserveJson.session_id;
    alchemyState.enrichedHerbs = reserveJson.herbs;

    alchemyState.enrichedHerbs.forEach((herb, idx) => {
      const column = slotArea.children[idx];
      const props = herb.properties;
      
      const upBtn = column.querySelector('.adjust-up');
      const downBtn = column.querySelector('.adjust-down');
      upBtn.disabled = false;
      upBtn.style.opacity = '1';
      downBtn.disabled = false;
      downBtn.style.opacity = '1';
      
      const propertySlots = column.querySelectorAll('.property-slot');
      propertySlots[0].textContent = props[0];
      propertySlots[1].textContent = props[1];
      propertySlots[2].textContent = props[2];
      
      const bottle = column.querySelector('.properties-bottle');
      
      gsap.to(bottle, {
        background: 'linear-gradient(to bottom, rgba(139,69,19,0.2) 0%, rgba(139,69,19,0.4) 100%)',
        duration: 0.8,
        ease: "power2.out"
      });
      
      createBubblingEffect(column);
      
      gsap.fromTo(propertySlots, 
        { scale: 0, opacity: 0 },
        { 
          scale: 1, 
          opacity: 1, 
          duration: 0.6, 
          stagger: 0.1, 
          ease: "back.out(1.7)",
          delay: 0.3
        }
      );
    });

    setTimeout(() => {
      reduceLiquidToBottomThird(slotArea);
      resultDiv.textContent = 'You may now apply adjustments.';
    }, 1500);

    alchemyState.randomizedProperties = alchemyState.enrichedHerbs.map(h => Object.values(h.properties));
    alchemyState.originalProperties = alchemyState.randomizedProperties.map(p => [...p]);
    alchemyState.currentAdjustedCol = null;

    alchemyState.adjustments = {};
    for (let i = 0; i < 3; i++) {
      alchemyState.adjustments[i] = { up: 0, down: 0 };
    }

  } catch (err) {
    console.error('[ALCHEMY] Error during reservation:', err);
    resultDiv.textContent = 'Server error while verifying ingredients.';
  }
}

// New function to reduce liquid to bottom third
function reduceLiquidToBottomThird(slotArea) {
  const columns = slotArea.querySelectorAll('.crafting-column');
  
  columns.forEach((column, idx) => {
    const liquid = column.querySelector('.bottle-liquid');
    const surface = column.querySelector('.liquid-surface');
    const bottle = column.querySelector('.properties-bottle');
    const bottomSlot = column.querySelector('.prop-bottom');
    
    if (!liquid) return;
    
    console.log(`[DEBUG] Reducing liquid for column ${idx}`);
    
    // Animate liquid reducing to bottom third (about 30% height)
    gsap.to(liquid, {
      height: '30%',
      duration: 1.0,
      ease: "power2.inOut",
      onStart: () => {
        // Add visual emphasis to bottom property slot
        gsap.to(bottomSlot, {
          backgroundColor: 'rgba(255, 215, 0, 0.3)', // Gold highlight
          borderColor: '#FFD700',
          borderWidth: '2px',
          duration: 0.5,
          ease: "power2.out"
        });
        
        // Subtle glow on the bottle to indicate the important area
        gsap.to(bottle, {
          boxShadow: '0 6px 12px rgba(255, 215, 0, 0.4), inset 0 -15px 8px rgba(255, 215, 0, 0.1)', // Reduced for smaller bottle
          duration: 1.0,
          ease: "power2.out"
        });
      },
      onComplete: () => {
        // Adjust surface position for the new liquid level
        gsap.set(surface, { 
          top: '70%', // Move surface to match new liquid level
          opacity: 1 
        });
        
        console.log(`[DEBUG] Liquid reduction complete for column ${idx}`);
      }
    });
    
    // Optional: Add a brief "draining" particle effect
    createDrainingEffect(column);
  });
}

// Optional: Visual effect for liquid draining - ADJUSTED FOR SMALLER BOTTLES
function createDrainingEffect(column) {
  const bottle = column.querySelector('.properties-bottle');
  
  // Create small "draining" particles
  for (let i = 0; i < 4; i++) { // Reduced from 5 to 4
    setTimeout(() => {
      const droplet = document.createElement('div');
      droplet.style.cssText = `
        position: absolute;
        width: 2px;
        height: 4px;
        background: rgba(255,255,255,0.6);
        border-radius: 50%;
        top: 40%;
        left: ${Math.random() * 20 + 15}px;
        pointer-events: none;
        z-index: 15;
      `;
      
      bottle.appendChild(droplet);
      
      // Animate droplet falling and fading
      gsap.to(droplet, {
        y: 30, // Reduced for smaller bottle
        opacity: 0,
        duration: 0.8,
        ease: "power2.in",
        onComplete: () => {
          if (droplet.parentNode) {
            droplet.remove();
          }
        }
      });
    }, i * 100);
  }
}

async function patchAndSendCraftRequest(resultDiv) {
  try {
    const adjustments = [];
    for (const [colIdx, adj] of Object.entries(alchemyState.adjustments || {})) {
      if (adj.up > 0) {
        adjustments.push({ bottle: Number(colIdx), direction: 'up', count: adj.up });
      }
      if (adj.down > 0) {
        adjustments.push({ bottle: Number(colIdx), direction: 'down', count: adj.down });
      }
    }

    const payload = {
      player_id: context.profile.id,
      profession_id: alchemyState.professionId,
      session_id: alchemyState.sessionId,
      adjustments
    };

    console.log('[ALCHEMY] Sending craft request payload:', payload);

    const res = await fetch('/api/crafting/alchemy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();

    const claimBtn = document.querySelector('#claim-btn');
    const finishBtn = document.querySelector('#finish-btn');
    const craftBtn = document.querySelector('#craft-btn');

    if (json.success) {
      alchemyState.result = json.crafted.name;
      resultDiv.innerHTML = `
        <span style="color:lime;">✅ You crafted: <strong>${json.crafted.name}</strong>!</span>
      `;

      if (finishBtn) finishBtn.style.display = 'none';
      if (claimBtn) {
        claimBtn.style.display = 'block';
        claimBtn.disabled = false;

        const newClaimBtn = claimBtn.cloneNode(true);
        claimBtn.parentNode.replaceChild(newClaimBtn, claimBtn);

        newClaimBtn.addEventListener('click', () => {
          context.displayMessage(`${json.crafted.name} added to your bank!`);
          document.querySelector('.custom-message-box')?.remove();
          alchemyState = null;
        });
      }
    } else {
      alchemyState.result = 'Failed';
      resultDiv.innerHTML = `
        <span style="color:red;">❌ Failed Mixture — ingredients wasted.</span>
        <br><small style="color:#999;">${json.message || 'No matching recipe found'}</small>
      `;

      if (finishBtn) finishBtn.style.display = 'none';
      if (claimBtn) claimBtn.style.display = 'none';

      if (craftBtn) {
        craftBtn.style.display = 'block';
        craftBtn.textContent = 'Craft Again';
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
    console.error('[ALCHEMY] Server error:', err);

    resultDiv.innerHTML = '<span style="color:red;">❌ Crafting failed. Try again later.</span>';

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

function handleAdjustment(colIdx, direction, resultDiv) {
  console.log('[DEBUG] handleAdjustment called:', { 
    colIdx, 
    direction, 
    currentCount: alchemyState.adjustmentCount,
    maxAdjustments: alchemyState.maxAdjustments 
  });

  if (alchemyState.adjustmentCount >= alchemyState.maxAdjustments) {
    resultDiv.textContent = `No more adjustments available (${alchemyState.maxAdjustments}/${alchemyState.maxAdjustments}).`;
    return;
  }

  const props = alchemyState.randomizedProperties[colIdx];

  if (!alchemyState.adjustments[colIdx]) {
    alchemyState.adjustments[colIdx] = { up: 0, down: 0 };
  }

  if (direction === 'up') {
    props.push(props.shift());
    alchemyState.adjustments[colIdx].up++;
  } else {
    props.unshift(props.pop());
    alchemyState.adjustments[colIdx].down++;
  }

  updateSlotColumn(colIdx);

  alchemyState.adjustmentCount++;
  console.log('[DEBUG] Adjustment count incremented to:', alchemyState.adjustmentCount);
  
  updateAdjustmentCounter();

  if (alchemyState.adjustmentCount >= alchemyState.maxAdjustments) {
    disableAdjustmentButtons();
  }
}

// Enhanced adjustment animation
function updateSlotColumn(colIdx) {
  const props = alchemyState.randomizedProperties[colIdx];
  const slotArea = document.querySelector('#crafting-slots');
  const column = slotArea.children[colIdx];
  const propertySlots = column.querySelectorAll('.property-slot');
  
  // Animate property changes
  gsap.to(propertySlots, {
    scale: 1.1,
    duration: 0.2,
    ease: "power2.out",
    yoyo: true,
    repeat: 1,
    onComplete: () => {
      propertySlots[0].textContent = props[0];
      propertySlots[1].textContent = props[1];
      propertySlots[2].textContent = props[2];
    }
  });
  
  // Bottle shake effect
  const bottle = column.querySelector('.properties-bottle');
  gsap.to(bottle, {
    x: '+=2',
    duration: 0.1,
    ease: "power2.inOut",
    yoyo: true,
    repeat: 5
  });
  
  // Cork bounce during adjustment
  const cork = column.querySelector('.bottle-cork');
  gsap.to(cork, {
    y: -3,
    duration: 0.2,
    ease: "bounce.out",
    yoyo: true,
    repeat: 1
  });
  
  // Intensify bubbling temporarily
  const bubbleContainer = column.querySelector('.bubble-container');
  for (let i = 0; i < 3; i++) {
    setTimeout(() => createSingleBubble(bubbleContainer), i * 100);
  }
}

// Helper function to create a single bubble
function createSingleBubble(container) {
  const bubble = document.createElement('div');
  bubble.style.cssText = `
    position: absolute;
    width: ${Math.random() * 5 + 3}px;
    height: ${Math.random() * 5 + 3}px;
    background: rgba(255,255,255,0.8);
    border-radius: 50%;
    bottom: 0;
    left: ${Math.random() * 30 + 5}px;
    pointer-events: none;
  `;
  
  container.appendChild(bubble);
  
  gsap.to(bubble, {
    y: -90,
    opacity: 0,
    duration: Math.random() * 1.5 + 1,
    ease: "power1.out",
    onComplete: () => {
      if (bubble.parentNode) {
        bubble.remove();
      }
    }
  });
}

function updateAdjustmentCounter() {
  const counter = document.querySelector('#adjustment-counter');
  if (counter) {
    counter.textContent = `Adjustments: ${alchemyState.adjustmentCount}/${alchemyState.maxAdjustments}`;
    if (alchemyState.adjustmentCount >= alchemyState.maxAdjustments) {
      counter.style.color = '#ff6b6b';
    }
  }
}

function disableAdjustmentButtons() {
  const buttons = document.querySelectorAll('.adjust-up, .adjust-down');
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });
}

// Get herb-specific colors
function getHerbColor(herbName) {
  console.log('[DEBUG] getHerbColor called with herbName:', herbName);
  console.log('[DEBUG] herbName type:', typeof herbName);
  console.log('[DEBUG] herbName.toLowerCase():', herbName.toLowerCase());
  
  const colors = {
    'Bloodthistle': 'rgba(146, 24, 22, 1)',      // Dark Red
    'Fangflower': 'rgba(210, 180, 140, 1)',     // Tan
    'Moonrose': 'rgba(173, 216, 230, 1)',       // Light Blue
    'Sunbloom': 'rgba(255, 255, 102, 1)',       // Light Yellow
    'Redcap': 'rgba(255, 99, 71, 1)',           // Tomato
    'Earthroot': 'rgba(255, 140, 0, 1)',        // Dark Orange
    'default': 'rgba(169, 169, 169, 1)'         // Dark Gray
  };

  console.log('[DEBUG] Available color keys:', Object.keys(colors));
  
  const herbKey = Object.keys(colors).find(key => {
    const keyLower = key.toLowerCase();
    const herbLower = herbName.toLowerCase();
    const matches = herbLower.includes(keyLower);
    
    console.log(`[DEBUG] Checking key: "${key}" (${keyLower}) against herb: "${herbName}" (${herbLower}) - matches: ${matches}`);
    
    return matches;
  });

  console.log('[DEBUG] Found herbKey:', herbKey);
  console.log('[DEBUG] Returning color:', herbKey ? colors[herbKey] : colors.default);

  return herbKey ? colors[herbKey] : colors.default;
}

// Inject CSS for bottle animations
function injectBottleAnimationsCSS() {
  if (document.getElementById('bottle-animations-css')) return;
  
  const additionalCSS = `
    @keyframes bottle-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-1px); }
      75% { transform: translateX(1px); }
    }

    .properties-bottle {
      transition: box-shadow 0.3s ease;
    }

    .bottle-liquid {
      will-change: height;
    }

    .liquid-surface {
      will-change: transform;
    }
  `;

  const style = document.createElement('style');
  style.id = 'bottle-animations-css';
  style.textContent = additionalCSS;
  document.head.appendChild(style);
}

// Cache management functions
export function clearIngredientCache() {
  ingredientCache.clear();
}

export function preloadIngredients(ingredientNames) {
  // Optional: Preload specific ingredients if needed
  return batchEnrichIngredients(ingredientNames.map(name => ({ item: name, amount: 1 })));
}

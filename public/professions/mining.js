// Optimized Mining profession module
let context = null;
let miningState = null;
let oreCache = new Map(); // Cache ore data

export async function startCraftingSession(ctx) {
  console.log('[MINING] Starting mining crafting session...');
  context = ctx;
  
  const { loadingModal, loadingStartTime, updateLoadingProgress, finishLoading } = context;
  
  try {
    // Step 1: Parallel data fetching - start both requests simultaneously
    updateLoadingProgress(loadingModal, "Accessing your ore vault...", "Loading bank items and recipes...");
    
    const [bankResponse, recipesPromise] = await Promise.all([
      context.apiCall(
        `/api/supabase/rest/v1/bank?player_id=eq.${context.profile.id}&profession_id=eq.${context.professionId}&select=item,amount`
      ),
      context.fetchRecipes(context.professionId) // Start recipe loading in parallel
    ]);
    
    const bankItems = await bankResponse.json();
    
    // Step 2: Batch ore enrichment
    updateLoadingProgress(loadingModal, "Analyzing mineral properties...", "Processing ore data...");
    
    const enriched = await batchEnrichOres(bankItems);
    
    // Step 3: Wait for recipes to complete (likely already done)
    const recipes = await recipesPromise;
    
    // Step 4: Initialize state
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
      maxAdjustments: 4, // More adjustments for horizontal alignment
      enrichedOres: null,
      recipes: recipes,
      sessionId: null
    };
    
    // Step 5: Minimum loading time and render
    await finishLoading(loadingModal, loadingStartTime, 2000);
    
    renderCraftingModal();
    injectMiningAnimationsCSS();
    
    console.log('[MINING] Mining crafting session loaded successfully!');
    
  } catch (error) {
    console.error('[MINING] Error starting mining session:', error);
    if (finishLoading && loadingModal) {
      await finishLoading(loadingModal, loadingStartTime, 500);
    }
    throw error;
  }
}

// Optimized batch ore enrichment
async function batchEnrichOres(bankItems) {
  if (!bankItems.length) return [];
  
  // Create a single API call for all ores
  const oreNames = bankItems.map(item => item.item);
  const uniqueNames = [...new Set(oreNames)]; // Remove duplicates
  
  // Check cache first
  const uncachedNames = uniqueNames.filter(name => !oreCache.has(name));
  
  if (uncachedNames.length > 0) {
    // Build query for multiple ores using 'in' operator
    const namesQuery = uncachedNames.map(name => encodeURIComponent(name)).join(',');
    
    try {
      const response = await context.apiCall(
        `/api/supabase/rest/v1/ingridients?name=in.(${namesQuery})&select=name,properties,sprite`
      );
      const ores = await response.json();
      
      // Cache the results
      ores.forEach(ore => {
        oreCache.set(ore.name, ore);
      });
      
    } catch (error) {
      console.warn('[MINING] Batch ore fetch failed, falling back to individual requests:', error);
      return await fallbackEnrichOres(bankItems);
    }
  }
  
  // Build enriched array from cache
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

// Fallback method for individual ore requests (with concurrency control)
async function fallbackEnrichOres(bankItems) {
  const enriched = [];
  const BATCH_SIZE = 5; // Process 5 ores at a time
  
  for (let i = 0; i < bankItems.length; i += BATCH_SIZE) {
    const batch = bankItems.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (item) => {
      try {
        const res = await context.apiCall(
          `/api/supabase/rest/v1/ingridients?name=eq.${encodeURIComponent(item.item)}&select=properties,sprite`
        );
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
        console.warn(`[MINING] Failed to fetch ore ${item.item}:`, error);
      }
      return null;
    });
    
    const batchResults = await Promise.all(batchPromises);
    enriched.push(...batchResults.filter(Boolean));
    
    // Small delay between batches to avoid overwhelming the API
    if (i + BATCH_SIZE < bankItems.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  return enriched;
}

// Enhanced mining row HTML with rock formation and pick target
function createMiningRowHTML(rowIndex) {
  return `
    <div class="mining-row" data-row="${rowIndex}" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem; justify-content: center;">
      
      <!-- Left Arrow -->
      <div class="arrow-left">
        <button class="fantasy-button adjust-left" data-row="${rowIndex}" style="padding: 0.3rem 0.6rem; font-size: 1.2rem; opacity: 0.3;" disabled>←</button>
      </div>
      
      <!-- Ore Slot -->
      <div class="ore-slot" style="width: 80px; height: 80px; border: 2px dashed #aaa; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(139,69,19,0.2);">
        <span style="color: #666; font-size: 0.8rem;">Drop Ore</span>
      </div>
      
      <!-- Rock Formation with Properties -->
      <div class="rock-formation" style="width: 320px; height: 80px; background: linear-gradient(135deg, #8B7355 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%); border: 3px solid #654321; border-radius: 15px; display: flex; align-items: center; position: relative; box-shadow: inset 0 4px 8px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2);">
        
        <!-- Rock texture overlay -->
        <div class="rock-texture" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px); border-radius: 12px; pointer-events: none;"></div>
        
        <!-- Mining target in center -->
        <div class="mining-target" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 60px; height: 60px; border: 3px dashed #FFD700; border-radius: 8px; background: rgba(255,215,0,0.1); display: flex; align-items: center; justify-content: center; z-index: 10;">
          <div class="target-crosshair" style="width: 20px; height: 20px; border: 2px solid #FFD700; position: relative;">
            <div style="position: absolute; top: 50%; left: -10px; right: -10px; height: 2px; background: #FFD700; transform: translateY(-50%);"></div>
            <div style="position: absolute; left: 50%; top: -10px; bottom: -10px; width: 2px; background: #FFD700; transform: translateX(-50%);"></div>
          </div>
        </div>
        
        <!-- Property slots arranged horizontally -->
        <div class="property-slot prop-left" data-row="${rowIndex}" data-position="0" style="width: 60px; height: 50px; border: 2px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.8); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #FFD700; font-weight: bold; margin-left: 20px; z-index: 5; position: relative; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
          -
        </div>
        
        <div class="property-slot prop-center" data-row="${rowIndex}" data-position="1" style="width: 60px; height: 50px; border: 3px solid #FFD700; border-radius: 8px; background: linear-gradient(135deg, rgba(255,215,0,0.9) 0%, rgba(255,215,0,0.7) 100%); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #8B4513; font-weight: bold; margin: 0 40px; z-index: 15; position: relative; box-shadow: 0 0 15px rgba(255,215,0,0.5), inset 0 2px 4px rgba(0,0,0,0.2);">
          -
        </div>
        
        <div class="property-slot prop-right" data-row="${rowIndex}" data-position="2" style="width: 60px; height: 50px; border: 2px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.8); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #FFD700; font-weight: bold; margin-right: 20px; z-index: 5; position: relative; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
          -
        </div>
      </div>
      
      <!-- Right Arrow -->
      <div class="arrow-right">
        <button class="fantasy-button adjust-right" data-row="${rowIndex}" style="padding: 0.3rem 0.6rem; font-size: 1.2rem; opacity: 0.3;" disabled>→</button>
      </div>
    </div>
  `;
}

// Optimized modal rendering with pre-rendered content
function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 1200px; max-height: 99vh; overflow-y: auto; text-align: center;">
      <h2>Crafting: ${miningState.professionName}</h2>
      
      <!-- Mining pick visualization -->
      <div class="mining-pick-display" style="margin: 1rem 0; display: flex; justify-content: center; align-items: center; gap: 1rem;">
        <div class="pick-shaft" style="width: 120px; height: 8px; background: linear-gradient(90deg, #8B4513 0%, #A0522D 50%, #654321 100%); border-radius: 4px; position: relative;">
          <div class="pick-grip" style="position: absolute; right: -10px; top: -6px; width: 20px; height: 20px; background: #654321; border-radius: 50%; border: 2px solid #8B4513;"></div>
        </div>
        <div class="pick-head" style="width: 0; height: 0; border-left: 25px solid #C0C0C0; border-top: 15px solid transparent; border-bottom: 15px solid transparent; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));"></div>
      </div>
            
      <!-- Result display (initially shows selection prompt) -->
      <div id="craft-result" style="margin-top: 4px; font-weight: bold;">Select 3 ores to start mining</div>
      
      <!-- Adjustment counter -->
      <div id="adjustment-counter" style="margin-top: 0.5rem; font-size: 0.9rem; color: #666; display: none;">
        Adjustments: ${miningState.adjustmentCount}/${miningState.maxAdjustments}
      </div>
      
      <!-- Alignment status -->
      <div id="alignment-status" style="margin-top: 0.5rem; font-size: 0.9rem; color: #FFD700; display: none;">
        <span id="alignment-text">Align center column for successful extraction!</span>
      </div>
      
      <!-- Main mining area -->
      <div id="mining-rows" style="margin: 1.5rem 0;">
        ${[0,1,2].map(i => createMiningRowHTML(i)).join('')}
      </div>
      
      <!-- Bank row (horizontal scrollable) -->
      <h3>Available Ores</h3>
      <div id="available-ores" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; margin-bottom: 5px; border: 1px solid #444; border-radius: 8px; background: rgba(139,69,19,0.1); scrollbar-width: none;">
        ${renderOresHTML()}
      </div>
      
      <!-- Recipes row (horizontal scrollable) -->
      <h3>Recipes</h3>
      <div id="available-recipes" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; margin-bottom: 1rem; border: 1px solid #444; border-radius: 8px; background: rgba(139,69,19,0.1); scrollbar-width: none;">
        ${renderRecipesHTML()}
      </div>
      
      <!-- Button row -->
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

// Pre-render ores HTML to avoid DOM manipulation during render
function renderOresHTML() {
  return miningState.availableOres.map((ore, idx) => `
    <div class="ore" data-index="${idx}" style="flex: 0 0 auto; cursor: pointer; position: relative; border-radius: 4px; padding: 4px; background: rgba(139,69,19,0.05);">
      <img src="assets/art/ingridients/${ore.sprite}.png" title="${ore.name} (${ore.amount})" style="width: 48px; height: 48px;">
      <div style="font-size: 0.8rem;">x${ore.amount}</div>
      <div class="info-icon" data-ore="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #8B4513; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

// Pre-render recipes HTML
function renderRecipesHTML() {
  if (!miningState.recipes || miningState.recipes.length === 0) {
    return '<div style="color: #666; font-style: italic; padding: 1rem;">No recipes available</div>';
  }
  
  return miningState.recipes.map((recipe, idx) => `
    <div class="recipe-card" data-recipe="${idx}" style="flex: 0 0 auto; cursor: pointer; border-radius: 8px; padding: 8px; background: rgba(139,69,19,0.2); border: 1px solid #8B4513; min-width: 80px; text-align: center; position: relative;">
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 48px; height: 48px; border-radius: 4px;">
      <div style="font-size: 0.8rem; margin-top: 4px; color: #c4975a; font-weight: bold;">${recipe.name}</div>
      <div class="info-icon" data-recipe="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #8B4513; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

// Helper function to find ores that have a specific property
function findOresWithProperty(targetProperty) {
  if (!miningState || !miningState.availableOres) {
    return [];
  }

  const matchingOres = [];
  
  miningState.availableOres.forEach(ore => {
    if (!ore.properties) return;
    
    let oreProperties = [];
    
    // Handle different property formats
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
    
    // Check if any of the ore's properties match the target property
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

  // Sort by availability (highest amount first)
  matchingOres.sort((a, b) => b.amount - a.amount);
  
  return matchingOres;
}

// Generate ingredient matching display for mining
function generateIngredientMatching(recipe) {
  if (!miningState || !miningState.availableOres || !recipe.ingridients) {
    return '<div style="background: rgba(255,193,7,0.1); border: 1px solid #FFC107; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: center; color: #FFC107; font-size: 0.9rem;">Ingredient matching unavailable</div>';
  }

  // Parse required properties from recipe
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

  // Find matching ores for each required property
  const matchingResults = requiredProperties.map((requiredProp, index) => {
    const matchingOres = findOresWithProperty(requiredProp);
    return {
      property: requiredProp,
      position: index + 1,
      matchingOres: matchingOres
    };
  });

  // Generate HTML for matching results
  let matchingHTML = `
    <div style="background: rgba(139,69,19,0.1); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
      <h4 style="color: #FFD700; margin-bottom: 0.8rem; text-align: center;">Ore Matching Guide</h4>
      <div style="font-size: 0.85rem; color: #ccc; text-align: center; margin-bottom: 1rem; font-style: italic;">
        Find ores with these properties (all three must align vertically in the center):
      </div>
  `;

  matchingResults.forEach((result, index) => {
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
      
      result.matchingOres.forEach((ore, oreIndex) => {
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

  // Add mining tip
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
  
  // Generate ingredient matching section
  const ingredientMatchingHTML = generateIngredientMatching(recipe);
  
  detailsModal.innerHTML = `
    <div class="message-content" style="max-width: 500px; text-align: center; max-height: 80vh; overflow-y: auto;">
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
  
  detailsModal.querySelector('.close-details-btn').addEventListener('click', () => {
    detailsModal.remove();
  });
  
  detailsModal.addEventListener('click', (e) => {
    if (e.target === detailsModal) {
      detailsModal.remove();
    }
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
    <div class="message-content" style="max-width: 350px; text-align: center;">
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
  
  propsModal.querySelector('.close-props-btn').addEventListener('click', () => {
    propsModal.remove();
  });
  
  propsModal.addEventListener('click', (e) => {
    if (e.target === propsModal) {
      propsModal.remove();
    }
  });
}

// Optimized event listeners setup with event delegation
function setupModalEventListeners(modal) {
  const craftBtn = modal.querySelector('#craft-btn');
  const finishBtn = modal.querySelector('#finish-btn');
  const resultDiv = modal.querySelector('#craft-result');
  const adjustmentCounter = modal.querySelector('#adjustment-counter');
  const alignmentStatus = modal.querySelector('#alignment-status');

  // Close button
  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
    miningState = null;
    oreCache.clear(); // Clear cache when closing
  });

  // Use event delegation for ores and info icons
  const oresContainer = modal.querySelector('#available-ores');
  oresContainer.addEventListener('click', (e) => {
    const oreEl = e.target.closest('.ore');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon && infoIcon.dataset.ore) {
      e.stopPropagation();
      const oreIndex = parseInt(infoIcon.dataset.ore);
      showOreProperties(oreIndex);
      return;
    }
    
    if (oreEl && !miningState.isCraftingStarted) {
      const idx = parseInt(oreEl.dataset.index);
      const ore = miningState.availableOres[idx];
      handleOreSelection(ore, modal);
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
      showRecipeDetails(miningState.recipes[recipeIdx]);
      return;
    }
    
    if (recipeCard) {
      const recipeIdx = parseInt(recipeCard.dataset.recipe);
      showRecipeDetails(miningState.recipes[recipeIdx]);
    }
  });

  // Mine button
  craftBtn.addEventListener('click', () => {
    miningState.isCraftingStarted = true;
    resultDiv.textContent = 'Starting mining operation...';
    craftBtn.style.display = 'none';
    finishBtn.style.display = 'block';
    finishBtn.disabled = false;
    adjustmentCounter.style.display = 'block';
    alignmentStatus.style.display = 'block';

    // Disable ore interactions
    oresContainer.style.opacity = '0.5';
    oresContainer.style.pointerEvents = 'none';

    startMiningAnimation(resultDiv, modal);
  });

  // Extract button
  finishBtn.addEventListener('click', () => {
    finishBtn.disabled = true;
    patchAndSendCraftRequest(resultDiv);
  });

  // Use event delegation for adjustment buttons
  const rowsContainer = modal.querySelector('#mining-rows');
  rowsContainer.addEventListener('click', (e) => {
    const adjustBtn = e.target.closest('.adjust-left, .adjust-right');
    if (adjustBtn && !adjustBtn.disabled) {
      const rowIdx = parseInt(adjustBtn.dataset.row);
      const direction = adjustBtn.classList.contains('adjust-left') ? 'left' : 'right';
      handleAdjustment(rowIdx, direction, resultDiv, alignmentStatus);
    }
    
    // Handle ore slot clicks for removal
    const oreSlot = e.target.closest('.ore-slot img');
    if (oreSlot && !miningState.isCraftingStarted) {
      const row = oreSlot.closest('.mining-row');
      const rowIdx = parseInt(row.dataset.row);
      removeOreFromSlot(rowIdx, modal);
    }
  });
}

// Optimized ore selection handler
function handleOreSelection(ore, modal) {
  const slotIdx = miningState.selectedOres.findIndex(s => s === null);
  if (slotIdx === -1) return;

  miningState.selectedOres[slotIdx] = ore;
  
  const row = modal.querySelector(`[data-row="${slotIdx}"]`);
  const oreSlot = row.querySelector('.ore-slot');
  
  oreSlot.innerHTML = `
    <img src="assets/art/ingridients/${ore.sprite}.png" style="width:64px;height:64px;cursor:pointer;" title="Click to remove ${ore.name}">
  `;
  oreSlot.style.border = '2px solid #8B4513';
  oreSlot.style.background = 'rgba(139,69,19,0.3)';
  
  animateRockFormation(row, ore);
  updateCraftButtonState(modal);
}

// Helper function to remove ore from slot
function removeOreFromSlot(slotIdx, modal) {
  miningState.selectedOres[slotIdx] = null;
  
  const row = modal.querySelector(`[data-row="${slotIdx}"]`);
  const oreSlot = row.querySelector('.ore-slot');
  
  oreSlot.innerHTML = '<span style="color: #666; font-size: 0.8rem;">Drop Ore</span>';
  oreSlot.style.border = '2px dashed #aaa';
  oreSlot.style.background = 'rgba(139,69,19,0.2)';
  
  animateRockClear(row);
  updateCraftButtonState(modal);
}

// Optimized craft button state update
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

// Animate rock formation with ore-specific effects
function animateRockFormation(row, ore) {
  const rockFormation = row.querySelector('.rock-formation');
  const miningTarget = row.querySelector('.mining-target');
  
  // Get ore color based on name or use default
  const oreColor = getOreColor(ore.name);
  
  // Add ore-specific coloring to rock formation
  gsap.to(rockFormation, {
    background: `linear-gradient(135deg, ${oreColor} 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%)`,
    duration: 1.0,
    ease: "power2.out"
  });
  
  // Mining target glow effect
  gsap.to(miningTarget, {
    boxShadow: '0 0 20px rgba(255,215,0,0.8), inset 0 0 10px rgba(255,215,0,0.3)',
    duration: 0.8,
    ease: "power2.out"
  });
  
  // Rock texture animation
  const rockTexture = row.querySelector('.rock-texture');
  gsap.fromTo(rockTexture, 
    { opacity: 0 },
    { opacity: 1, duration: 1.2, ease: "power2.out" }
  );
}

// Animate rock clearing
function animateRockClear(row) {
  const rockFormation = row.querySelector('.rock-formation');
  const miningTarget = row.querySelector('.mining-target');
  const rockTexture = row.querySelector('.rock-texture');
  
  // Reset rock formation to default appearance
  gsap.to(rockFormation, {
    background: 'linear-gradient(135deg, #8B7355 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%)',
    duration: 0.8,
    ease: "power2.out"
  });
  
  // Remove mining target glow
  gsap.to(miningTarget, {
    boxShadow: 'none',
    duration: 0.6,
    ease: "power2.out"
  });
  
  // Fade rock texture
  gsap.to(rockTexture, {
    opacity: 0.3,
    duration: 0.6,
    ease: "power2.out"
  });
}

// Enhanced startMiningAnimation
async function startMiningAnimation(resultDiv, modal) {
  const rowsArea = modal.querySelector('#mining-rows');
  resultDiv.textContent = 'Analyzing ore composition...';

  const selectedOreNames = miningState.selectedOres.map(o => o.name);

  try {
    const reserveRes = await fetch('/functions/v1/reserve_ingredients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${context.session.access_token}`,
      },
      body: JSON.stringify({
        player_id: context.profile.id,
        profession_id: miningState.professionId,
        selected_ingredients: selectedOreNames,
      }),
    });

    const reserveJson = await reserveRes.json();
    if (!reserveRes.ok || !reserveJson.success || !Array.isArray(reserveJson.herbs)) {
      console.error('[MINING] Reservation failed:', reserveJson);
      resultDiv.textContent = `Ore verification failed: ${reserveJson?.error || 'Unknown error'}`;
      return;
    }

    // Store the session ID and enriched ores
    miningState.sessionId = reserveJson.session_id;
    miningState.enrichedOres = reserveJson.herbs; // Server still calls them herbs

    miningState.enrichedOres.forEach((ore, idx) => {
      const row = rowsArea.children[idx];
      const props = ore.properties;
      
      const leftBtn = row.querySelector('.adjust-left');
      const rightBtn = row.querySelector('.adjust-right');
      leftBtn.disabled = false;
      leftBtn.style.opacity = '1';
      rightBtn.disabled = false;
      rightBtn.style.opacity = '1';
      
      const propertySlots = row.querySelectorAll('.property-slot');
      propertySlots[0].textContent = props[0];
      propertySlots[1].textContent = props[1];
      propertySlots[2].textContent = props[2];
      
      const rockFormation = row.querySelector('.rock-formation');
      
      // Enhanced rock activation effect
      gsap.to(rockFormation, {
        boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.4), 0 4px 12px rgba(255,215,0,0.3)',
        duration: 0.8,
        ease: "power2.out"
      });
      
      // Start rock dust effect
      createRockDustEffect(row);
      
      // Animate property slots appearing with stagger
      gsap.fromTo(propertySlots, 
        { scale: 0, opacity: 0, rotationY: 90 },
        { 
          scale: 1, 
          opacity: 1, 
          rotationY: 0,
          duration: 0.8, 
          stagger: 0.15, 
          ease: "back.out(1.4)",
          delay: 0.3
        }
      );
    });

    setTimeout(() => {
      resultDiv.textContent = 'Use adjustments to align center properties for extraction.';
      checkAlignment(modal.querySelector('#alignment-status'));
    }, 1500);

    miningState.randomizedProperties = miningState.enrichedOres.map(o => Object.values(o.properties));
    miningState.originalProperties = miningState.randomizedProperties.map(p => [...p]);
    miningState.currentAdjustedRow = null;

    miningState.adjustments = {};
    for (let i = 0; i < 3; i++) {
      miningState.adjustments[i] = { left: 0, right: 0 };
    }

  } catch (err) {
    console.error('[MINING] Error during reservation:', err);
    resultDiv.textContent = 'Server error while verifying ores.';
  }
}

// Create rock dust particle effect
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
      left: ${Math.random() * 320}px;
      pointer-events: none;
      z-index: 20;
    `;
    
    rockFormation.appendChild(particle);
    
    // Animate particle floating up and fading
    gsap.to(particle, {
      y: -20,
      x: `+=${Math.random() * 20 - 10}`,
      opacity: 0,
      duration: Math.random() * 2 + 1,
      ease: "power1.out",
      onComplete: () => {
        if (particle.parentNode) {
          particle.remove();
        }
      }
    });
  }
  
  // Create particles at intervals
  const dustInterval = setInterval(() => {
    if (document.contains(row)) {
      createDustParticle();
    } else {
      clearInterval(dustInterval);
    }
  }, Math.random() * 600 + 300);
  
  return dustInterval;
}

// Check if center column is aligned
function checkAlignment(alignmentStatus) {
  if (!miningState.randomizedProperties || miningState.randomizedProperties.length < 3) {
    return false;
  }
  
  const centerProps = [
    miningState.randomizedProperties[0][1], // Row 0, center property
    miningState.randomizedProperties[1][1], // Row 1, center property  
    miningState.randomizedProperties[2][1]  // Row 2, center property
  ];
  
  const isAligned = centerProps[0] === centerProps[1] && centerProps[1] === centerProps[2];
  
  if (alignmentStatus) {
    const alignmentText = alignmentStatus.querySelector('#alignment-text');
    if (isAligned) {
      alignmentText.textContent = `✅ Perfect alignment! "${centerProps[0]}" - Ready to extract!`;
      alignmentStatus.style.color = '#4CAF50';
      
      // Add success glow to center slots
      document.querySelectorAll('.prop-center').forEach(slot => {
        gsap.to(slot, {
          boxShadow: '0 0 20px rgba(76,175,80,0.8), inset 0 0 10px rgba(76,175,80,0.3)',
          duration: 0.5,
          ease: "power2.out"
        });
      });
    } else {
      alignmentText.textContent = `⚠️ Center misaligned: [${centerProps.join(', ')}] - Keep adjusting!`;
      alignmentStatus.style.color = '#FFC107';
      
      // Remove success glow from center slots
      document.querySelectorAll('.prop-center').forEach(slot => {
        gsap.to(slot, {
          boxShadow: '0 0 15px rgba(255,215,0,0.5), inset 0 2px 4px rgba(0,0,0,0.2)',
          duration: 0.5,
          ease: "power2.out"
        });
      });
    }
  }
  
  return isAligned;
}

async function patchAndSendCraftRequest(resultDiv) {
  try {
    // Convert adjustment counts to the expected format
    const adjustments = [];
    for (const [rowIdx, adj] of Object.entries(miningState.adjustments || {})) {
      if (adj.left > 0) {
        adjustments.push({ bottle: Number(rowIdx), direction: 'left', count: adj.left });
      }
      if (adj.right > 0) {
        adjustments.push({ bottle: Number(rowIdx), direction: 'right', count: adj.right });
      }
    }

    const payload = {
      player_id: context.profile.id,
      profession_id: miningState.professionId,
      session_id: miningState.sessionId,
      adjustments
    };

    console.log('[MINING] Sending craft request payload:', payload);

    const res = await fetch('/functions/v1/craft_alchemy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${context.session.access_token}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();

    // Get button references
    const claimBtn = document.querySelector('#claim-btn');
    const finishBtn = document.querySelector('#finish-btn');
    const craftBtn = document.querySelector('#craft-btn');

    if (json.success) {
      miningState.result = json.crafted.name;
      resultDiv.innerHTML = `
        <span style="color:lime;">⛏️ Successfully extracted: <strong>${json.crafted.name}</strong>!</span>
      `;

      // Add mining success animation
      animateMiningSuccess();

      // Hide finish button, show claim button
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

      // Add mining failure animation
      animateMiningFailure();

      // Hide finish and claim buttons, show mine again option
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
    console.error('[MINING] Server error:', err);
    
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

function handleAdjustment(rowIdx, direction, resultDiv, alignmentStatus) {
  console.log('[DEBUG] handleAdjustment called:', { 
    rowIdx, 
    direction, 
    currentCount: miningState.adjustmentCount,
    maxAdjustments: miningState.maxAdjustments 
  });

  if (miningState.adjustmentCount >= miningState.maxAdjustments) {
    resultDiv.textContent = `No more adjustments available (${miningState.maxAdjustments}/${miningState.maxAdjustments}).`;
    return;
  }

  const props = miningState.randomizedProperties[rowIdx];

  if (!miningState.adjustments[rowIdx]) {
    miningState.adjustments[rowIdx] = { left: 0, right: 0 };
  }

  if (direction === 'left') {
    props.unshift(props.pop()); // Move last element to front
    miningState.adjustments[rowIdx].left++;
  } else {
    props.push(props.shift()); // Move first element to end
    miningState.adjustments[rowIdx].right++;
  }

  updateMiningRow(rowIdx);

  miningState.adjustmentCount++;
  console.log('[DEBUG] Adjustment count incremented to:', miningState.adjustmentCount);
  
  updateAdjustmentCounter();
  checkAlignment(alignmentStatus);

  if (miningState.adjustmentCount >= miningState.maxAdjustments) {
    disableAdjustmentButtons();
  }
}

// Enhanced adjustment animation for mining
function updateMiningRow(rowIdx) {
  const props = miningState.randomizedProperties[rowIdx];
  const rowsArea = document.querySelector('#mining-rows');
  const row = rowsArea.children[rowIdx];
  const propertySlots = row.querySelectorAll('.property-slot');
  const rockFormation = row.querySelector('.rock-formation');
  
  // Animate property sliding effect
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
  
  // Rock formation shake effect
  gsap.to(rockFormation, {
    y: '+=2',
    duration: 0.1,
    ease: "power2.inOut",
    yoyo: true,
    repeat: 3
  });
  
  // Create impact particles
  createImpactParticles(row);
  
  // Mining target flash
  const miningTarget = row.querySelector('.mining-target');
  gsap.to(miningTarget, {
    backgroundColor: 'rgba(255,215,0,0.5)',
    duration: 0.2,
    ease: "power2.out",
    yoyo: true,
    repeat: 1
  });
}

// Create impact particles for mining adjustments
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
        left: ${Math.random() * 100 + 110}px;
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
        onComplete: () => {
          if (particle.parentNode) {
            particle.remove();
          }
        }
      });
    }, i * 50);
  }
}

function animateMiningSuccess() {
  // Success sparkle effect on all center slots
  document.querySelectorAll('.prop-center').forEach((slot, index) => {
    setTimeout(() => {
      createSuccessSparkles(slot);
    }, index * 200);
  });
  
  // Mining pick celebration
  const pickDisplay = document.querySelector('.mining-pick-display');
  if (pickDisplay) {
    gsap.to(pickDisplay, {
      scale: 1.1,
      duration: 0.3,
      ease: "back.out(1.7)",
      yoyo: true,
      repeat: 3
    });
  }
}

function animateMiningFailure() {
  // Shake all rock formations
  document.querySelectorAll('.rock-formation').forEach((rock, index) => {
    setTimeout(() => {
      gsap.to(rock, {
        x: '+=5',
        duration: 0.1,
        ease: "power2.inOut",
        yoyo: true,
        repeat: 5
      });
      
      // Create debris particles
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
      onComplete: () => {
        if (sparkle.parentNode) {
          sparkle.remove();
        }
      }
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
      left: ${Math.random() * 320}px;
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
      onComplete: () => {
        if (debris.parentNode) {
          debris.remove();
        }
      }
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

// Get ore-specific colors
function getOreColor(oreName) {
  const colors = {
    'Iron Ore': 'rgba(139, 69, 19, 1)',        // Brown
    'Copper Ore': 'rgba(184, 115, 51, 1)',    // Copper color
    'Silver Ore': 'rgba(192, 192, 192, 1)',   // Silver
    'Gold Ore': 'rgba(255, 215, 0, 1)',       // Gold
    'Coal': 'rgba(64, 64, 64, 1)',            // Dark gray
    'Gemstone': 'rgba(138, 43, 226, 1)',      // Purple
    'default': 'rgba(139, 115, 85, 1)'        // Default brown-gray
  };

  const oreKey = Object.keys(colors).find(key => {
    return oreName.toLowerCase().includes(key.toLowerCase());
  });

  return oreKey ? colors[oreKey] : colors.default;
}

// Inject CSS for mining animations
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

    @keyframes sparkle {
      0% { opacity: 1; transform: scale(0) rotate(0deg); }
      50% { opacity: 1; transform: scale(1) rotate(180deg); }
      100% { opacity: 0; transform: scale(0) rotate(360deg); }
    }

    .rock-formation {
      transition: all 0.3s ease;
      will-change: transform, box-shadow;
    }

    .rock-formation:hover {
      animation: rock-pulse 2s infinite ease-in-out;
    }

    .mining-target {
      transition: all 0.2s ease;
    }

    .property-slot {
      will-change: transform, box-shadow;
      transition: all 0.3s ease;
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

    @keyframes border-glow {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .mining-pick-display {
      will-change: transform;
      transition: transform 0.3s ease;
    }

    .pick-head {
      filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3)) drop-shadow(0 0 10px rgba(192,192,192,0.5));
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
      background: rgba(255,215,0,0.2);
      border-color: #FFD700;
    }

    /* Scrollbar styling for ore and recipe containers */
    #available-ores::-webkit-scrollbar,
    #available-recipes::-webkit-scrollbar {
      height: 6px;
    }

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

    /* Alignment status styling */
    #alignment-status {
      font-weight: bold;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      padding: 0.5rem;
      border-radius: 6px;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.1);
    }

    /* Rock texture enhancement */
    .rock-texture {
      mix-blend-mode: multiply;
      opacity: 0.3;
    }

    /* Mining target crosshair animation */
    .target-crosshair {
      animation: crosshair-pulse 1.5s ease-in-out infinite alternate;
    }

    @keyframes crosshair-pulse {
      0% { opacity: 0.6; transform: scale(1); }
      100% { opacity: 1; transform: scale(1.1); }
    }
  `;

  const style = document.createElement('style');
  style.id = 'mining-animations-css';
  style.textContent = additionalCSS;
  document.head.appendChild(style);
}

// Cache management functions
export function clearOreCache() {
  oreCache.clear();
}

export function preloadOres(oreNames) {
  // Optional: Preload specific ores if needed
  return batchEnrichOres(oreNames.map(name => ({ item: name, amount: 1 })));
}
// Fixed Herbalism profession module
let context = null;
let herbalismState = null;
let ingredientCache = new Map(); // Cache ingredient data

export async function startCraftingSession(ctx) {
  console.log('[HERBALISM] Starting herbalism crafting session...');
  context = ctx;
  
  const { loadingModal, loadingStartTime, updateLoadingProgress, finishLoading } = context;
  
  try {
    // Step 1: Parallel data fetching - start both requests simultaneously
    updateLoadingProgress(loadingModal, "Accessing your seed vault...", "Loading bank items and recipes...");
    
    const [bankResponse, recipesPromise] = await Promise.all([
      context.apiCall(
        `/api/supabase/rest/v1/bank?player_id=eq.${context.profile.id}&profession_id=eq.${context.professionId}&select=item,amount`
      ),
      context.fetchRecipes(context.professionId) // Start recipe loading in parallel
    ]);
    
    const bankItems = await bankResponse.json();
    console.log('[HERBALISM] Bank items loaded:', bankItems);
    
    // Step 2: Separate seeds and fertilizers
    updateLoadingProgress(loadingModal, "Sorting seeds and fertilizers...", "Organizing your materials...");
    
    const seeds = [];
    const fertilizers = [];
    
    for (const item of bankItems) {
      if (item.item.toLowerCase().includes('seed')) {
        seeds.push(item);
      } else {
        fertilizers.push(item);
      }
    }
    
    console.log('[HERBALISM] Seeds found:', seeds);
    console.log('[HERBALISM] Fertilizers found:', fertilizers);
    
    // Step 3: Batch enrich both categories
    updateLoadingProgress(loadingModal, "Enriching ingredient data...", "Fetching properties...");
    
    const [enrichedSeeds, enrichedFertilizers] = await Promise.all([
      batchEnrichIngredients(seeds),
      batchEnrichIngredients(fertilizers)
    ]);
    
    console.log('[HERBALISM] Enriched seeds:', enrichedSeeds);
    console.log('[HERBALISM] Enriched fertilizers:', enrichedFertilizers);
    
    // Step 4: Wait for recipes to complete
    const recipes = await recipesPromise;
    
    // Step 5: Initialize state
    updateLoadingProgress(loadingModal, "Preparing herb garden...", "Setting up interface...");
    
    herbalismState = {
      professionId: context.professionId,
      professionName: context.professionName,
      availableSeeds: enrichedSeeds,
      availableFertilizers: enrichedFertilizers,
      selectedSeeds: [null, null, null, null], // 2x2 grid: [top-left, top-right, bottom-left, bottom-right]
      selectedFertilizers: [null, null], // [row1-fertilizer, row2-fertilizer]
      sunShadeSettings: ['sun', 'sun'], // [column1, column2] - sun or shade
      isCraftingStarted: false,
      results: [null, null, null, null], // Results for each seed
      recipes: recipes,
      growthAnimations: []
    };
    
    // Step 6: Minimum loading time and render
    await finishLoading(loadingModal, loadingStartTime, 2000);
    
    renderCraftingModal();
    injectHerbalismAnimationsCSS();
    
    console.log('[HERBALISM] Herbalism crafting session loaded successfully!');
    
  } catch (error) {
    console.error('[HERBALISM] Error starting herbalism session:', error);
    if (finishLoading && loadingModal) {
      await finishLoading(loadingModal, loadingStartTime, 500);
    }
    throw error;
  }
}

// Fixed batch ingredient enrichment
async function batchEnrichIngredients(bankItems) {
  console.log('[HERBALISM] Batch enriching ingredients:', bankItems);
  
  if (!bankItems.length) {
    console.log('[HERBALISM] No items to enrich');
    return [];
  }
  
  const ingredientNames = bankItems.map(item => item.item);
  const uniqueNames = [...new Set(ingredientNames)];
  
  console.log('[HERBALISM] Unique ingredient names:', uniqueNames);
  
  // Check cache first
  const uncachedNames = uniqueNames.filter(name => !ingredientCache.has(name));
  console.log('[HERBALISM] Uncached names:', uncachedNames);
  
  if (uncachedNames.length > 0) {
    const namesQuery = uncachedNames.map(name => encodeURIComponent(name)).join(',');
    console.log('[HERBALISM] Fetching ingredients with query:', namesQuery);
    
    try {
      const response = await context.apiCall(
        `/api/supabase/rest/v1/ingridients?name=in.(${namesQuery})&select=name,properties,sprite`
      );
      
      if (!response.ok) {
        console.error('[HERBALISM] API response not OK:', response.status);
        return await fallbackEnrichIngredients(bankItems);
      }
      
      const ingredients = await response.json();
      console.log('[HERBALISM] Fetched ingredients:', ingredients);
      
      // Cache the results
      ingredients.forEach(ingredient => {
        ingredientCache.set(ingredient.name, ingredient);
        console.log('[HERBALISM] Cached ingredient:', ingredient.name);
      });
      
    } catch (error) {
      console.warn('[HERBALISM] Batch ingredient fetch failed, falling back to individual requests:', error);
      return await fallbackEnrichIngredients(bankItems);
    }
  }
  
  // Build enriched array from cache
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
      console.log('[HERBALISM] Enriched item:', item.item);
    } else {
      console.warn('[HERBALISM] No cached ingredient found for:', item.item);
      // Try to enrich this single item
      try {
        const singleRes = await context.apiCall(
          `/api/supabase/rest/v1/ingridients?name=eq.${encodeURIComponent(item.item)}&select=properties,sprite`
        );
        if (singleRes.ok) {
          const [singleIngredient] = await singleRes.json();
          if (singleIngredient) {
            enriched.push({
              name: item.item,
              amount: item.amount,
              properties: singleIngredient.properties,
              sprite: singleIngredient.sprite,
            });
            // Cache it for future use
            ingredientCache.set(item.item, singleIngredient);
            console.log('[HERBALISM] Single-fetched and enriched:', item.item);
          }
        }
      } catch (singleError) {
        console.warn('[HERBALISM] Failed to single-fetch ingredient:', item.item, singleError);
        // Add item without enrichment as fallback
        enriched.push({
          name: item.item,
          amount: item.amount,
          properties: null,
          sprite: 'default', // Use default sprite if fetch fails
        });
      }
    }
  }
  
  console.log('[HERBALISM] Final enriched result:', enriched);
  return enriched;
}

// Fallback method for individual ingredient requests
async function fallbackEnrichIngredients(bankItems) {
  console.log('[HERBALISM] Using fallback enrichment method');
  const enriched = [];
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < bankItems.length; i += BATCH_SIZE) {
    const batch = bankItems.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (item) => {
      try {
        const res = await context.apiCall(
          `/api/supabase/rest/v1/ingridients?name=eq.${encodeURIComponent(item.item)}&select=properties,sprite`
        );
        
        if (!res.ok) {
          console.warn('[HERBALISM] Fallback fetch failed for:', item.item, res.status);
          return null;
        }
        
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
        console.warn(`[HERBALISM] Failed to fetch ingredient ${item.item}:`, error);
      }
      return null;
    });
    
    const batchResults = await Promise.all(batchPromises);
    enriched.push(...batchResults.filter(Boolean));
    
    if (i + BATCH_SIZE < bankItems.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  console.log('[HERBALISM] Fallback enrichment result:', enriched);
  return enriched;
}

// Create the 3x3 garden grid (with bottom-right empty) - Made smaller
function createGardenGridHTML() {
  return `
    <div id="garden-grid" style="display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; gap: 0.6rem; max-width: 300px; margin: 0 auto;">
      
      <!-- Top Row: Seed1, Seed2, Fertilizer1 -->
      <div class="seed-plot" data-position="0" style="width: 60px; height: 60px; border: 2px dashed #8B4513; border-radius: 6px; background: linear-gradient(to bottom, #654321 0%, #8B4513 100%); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;">
        <div class="seed-content" style="display: flex; flex-direction: column; align-items: center;">
          <span style="color: #D2B48C; font-size: 0.55rem;">Drop Seed</span>
        </div>
        <div class="growth-animation" style="position: absolute; inset: 0; border-radius: 4px; overflow: hidden; opacity: 0;"></div>
        <div class="remove-btn" style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: #dc3545; border: 1px solid #fff; border-radius: 50%; color: white; font-size: 8px; display: none; align-items: center; justify-content: center; cursor: pointer; z-index: 10;">×</div>
      </div>
      
      <div class="seed-plot" data-position="1" style="width: 60px; height: 60px; border: 2px dashed #8B4513; border-radius: 6px; background: linear-gradient(to bottom, #654321 0%, #8B4513 100%); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;">
        <div class="seed-content" style="display: flex; flex-direction: column; align-items: center;">
          <span style="color: #D2B48C; font-size: 0.55rem;">Drop Seed</span>
        </div>
        <div class="growth-animation" style="position: absolute; inset: 0; border-radius: 4px; overflow: hidden; opacity: 0;"></div>
        <div class="remove-btn" style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: #dc3545; border: 1px solid #fff; border-radius: 50%; color: white; font-size: 8px; display: none; align-items: center; justify-content: center; cursor: pointer; z-index: 10;">×</div>
      </div>
      
      <div class="fertilizer-slot" data-row="0" style="width: 60px; height: 60px; border: 2px dashed #228B22; border-radius: 6px; background: linear-gradient(to bottom, rgba(34,139,34,0.2) 0%, rgba(34,139,34,0.4) 100%); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;">
        
        <div class="fertilizer-content" style="display: flex; flex-direction: column; align-items: center;">
          <span style="color: #90EE90; font-size: 0.5rem;">Drop Fertilizer</span>
        </div>
        <div class="remove-btn" style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: #dc3545; border: 1px solid #fff; border-radius: 50%; color: white; font-size: 8px; display: none; align-items: center; justify-content: center; cursor: pointer; z-index: 10;">×</div>
      </div>

      <!-- Middle Row: Seed3, Seed4, Fertilizer2 -->
      <div class="seed-plot" data-position="2" style="width: 60px; height: 60px; border: 2px dashed #8B4513; border-radius: 6px; background: linear-gradient(to bottom, #654321 0%, #8B4513 100%); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;">
        <div class="seed-content" style="display: flex; flex-direction: column; align-items: center;">
          <span style="color: #D2B48C; font-size: 0.55rem;">Drop Seed</span>
        </div>
        <div class="growth-animation" style="position: absolute; inset: 0; border-radius: 4px; overflow: hidden; opacity: 0;"></div>
        <div class="remove-btn" style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: #dc3545; border: 1px solid #fff; border-radius: 50%; color: white; font-size: 8px; display: none; align-items: center; justify-content: center; cursor: pointer; z-index: 10;">×</div>
      </div>
      
      <div class="seed-plot" data-position="3" style="width: 60px; height: 60px; border: 2px dashed #8B4513; border-radius: 6px; background: linear-gradient(to bottom, #654321 0%, #8B4513 100%); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;">
        <div class="seed-content" style="display: flex; flex-direction: column; align-items: center;">
          <span style="color: #D2B48C; font-size: 0.55rem;">Drop Seed</span>
        </div>
        <div class="growth-animation" style="position: absolute; inset: 0; border-radius: 4px; overflow: hidden; opacity: 0;"></div>
        <div class="remove-btn" style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: #dc3545; border: 1px solid #fff; border-radius: 50%; color: white; font-size: 8px; display: none; align-items: center; justify-content: center; cursor: pointer; z-index: 10;">×</div>
      </div>
      
      <div class="fertilizer-slot" data-row="1" style="width: 60px; height: 60px; border: 2px dashed #228B22; border-radius: 6px; background: linear-gradient(to bottom, rgba(34,139,34,0.2) 0%, rgba(34,139,34,0.4) 100%); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;">
      
        <div class="fertilizer-content" style="display: flex; flex-direction: column; align-items: center;">
          <span style="color: #90EE90; font-size: 0.5rem;">Drop Fertilizer</span>
        </div>
        <div class="remove-btn" style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: #dc3545; border: 1px solid #fff; border-radius: 50%; color: white; font-size: 8px; display: none; align-items: center; justify-content: center; cursor: pointer; z-index: 10;">×</div>
      </div>

      <!-- Bottom Row: Sun/Shade toggles and Empty -->
      <div class="sun-shade-toggle" data-column="0" style="width: 60px; height: 60px; border: 2px solid #FFA500; border-radius: 6px; background: linear-gradient(to bottom, rgba(255,165,0,0.2) 0%, rgba(255,165,0,0.4) 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s ease;">
        <div class="toggle-icon" style="font-size: 1.2rem; margin-bottom: 1px;">☀️</div>
        <div class="toggle-text" style="font-size: 0.55rem; color: #FFA500; font-weight: bold;">Sun</div>
        <div class="column-label" style="display: none; font-size: 0.5rem; color: #999; position: absolute; bottom: 1px;">Col 1</div>
      </div>
      
      <div class="sun-shade-toggle" data-column="1" style="width: 60px; height: 60px; border: 2px solid #FFA500; border-radius: 6px; background: linear-gradient(to bottom, rgba(255,165,0,0.2) 0%, rgba(255,165,0,0.4) 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s ease;">
        <div class="toggle-icon" style="font-size: 1.2rem; margin-bottom: 1px;">☀️</div>
        <div class="toggle-text" style="font-size: 0.55rem; color: #FFA500; font-weight: bold;">Sun</div>
        <div class="column-label" style="display: none;  font-size: 0.5rem; color: #999; position: absolute; bottom: 1px;">Col 2</div>
      </div>
      
      <!-- Empty bottom-right corner -->
      <div style="width: 60px; height: 60px;"></div>
      
    </div>
  `;
}

// Render main modal - Made smaller
function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 90%; max-width: 900px; max-height: 90vh; overflow-y: auto; text-align: center;">
      <h2 style="margin: 0.4rem 0; color: #228B22; font-size: 1.3rem;">🌱 Crafting: ${herbalismState.professionName}</h2>
            
      <!-- Result display -->
      <div id="craft-result" style="margin: 0.4rem 0; font-weight: bold; min-height: 16px; font-size: 0.9rem;">Set up your garden to start growing</div>
      
      <!-- Main garden grid -->
      <div>
        ${createGardenGridHTML()}
      </div>
      
      <!-- Seeds row -->
      <h3 style="margin: 0.4rem 0 0.3rem 0; font-size: 0.9rem; color: #8B4513;">Available Seeds</h3>
      <div id="available-seeds" style="display: flex; overflow-x: auto; gap: 0.3rem; padding: 3px; margin-bottom: 0.4rem; border: 1px solid #8B4513; border-radius: 4px; background: rgba(139,69,19,0.1); scrollbar-width: none; max-height: 60px;">
        ${renderSeedsHTML()}
      </div>
      
      <!-- Fertilizers row -->
      <h3 style="margin: 0.3rem 0; font-size: 0.9rem; color: #228B22;">Available Fertilizers</h3>
      <div id="available-fertilizers" style="display: flex; overflow-x: auto; gap: 0.3rem; padding: 3px; margin-bottom: 0.4rem; border: 1px solid #228B22; border-radius: 4px; background: rgba(34,139,34,0.1); scrollbar-width: none; max-height: 60px;">
        ${renderFertilizersHTML()}
      </div>
      
      <!-- Recipes row -->
      <h3 style="margin: 0.3rem 0; font-size: 0.9rem; color: #4CAF50;">Recipes</h3>
      <div id="available-recipes" style="display: flex; overflow-x: auto; gap: 0.3rem; padding: 3px; margin-bottom: 0.6rem; border: 1px solid #444; border-radius: 4px; background: rgba(139,69,19,0.1); scrollbar-width: none; max-height: 70px;">
        ${renderRecipesHTML()}
      </div>
      
      <!-- Button row -->
      <div style="display: flex; justify-content: center; gap: 0.3rem;">
        <button class="fantasy-button message-ok-btn" style="flex: 1; max-width: 80px; padding: 0.3rem; font-size: 0.8rem;">Close</button>
        <button id="grow-btn" class="fantasy-button" disabled style="flex: 1; max-width: 80px; padding: 0.3rem; font-size: 0.8rem;">Grow</button>
        <button id="claim-all-btn" class="fantasy-button" style="flex: 1; max-width: 80px; padding: 0.3rem; font-size: 0.8rem; display: none;">Claim All</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  setupModalEventListeners(modal);
}

// Render seeds HTML - Made smaller
function renderSeedsHTML() {
  console.log('[HERBALISM] Rendering seeds HTML with:', herbalismState.availableSeeds);
  
  if (!herbalismState.availableSeeds || herbalismState.availableSeeds.length === 0) {
    return '<div style="color: #666; font-style: italic; padding: 0.6rem; font-size: 0.75rem;">No seeds available</div>';
  }
  
  return herbalismState.availableSeeds.map((seed, idx) => {
    console.log('[HERBALISM] Rendering seed:', seed.name, 'sprite:', seed.sprite);
    return `
      <div class="seed-item" data-index="${idx}" style="flex: 0 0 auto; cursor:pointer; position: relative; border-radius: 3px; padding: 2px; background: rgba(139,69,19,0.1);">
        <img src="assets/art/ingridients/${seed.sprite}.png" title="${seed.name} (${seed.amount})" style="width:30px;height:30px;" onerror="this.src='assets/art/ingridients/default.png'">
        <div style="font-size:0.6rem; color: #8B4513;">x${seed.amount}</div>
        <div class="info-icon" data-seed="${idx}" style="position: absolute; top: -1px; right: -1px; width: 10px; height: 10px; background: #8B4513; border-radius: 50%; color: white; font-size: 7px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
      </div>
    `;
  }).join('');
}

// Render fertilizers HTML - Made smaller
function renderFertilizersHTML() {
  console.log('[HERBALISM] Rendering fertilizers HTML with:', herbalismState.availableFertilizers);
  
  if (!herbalismState.availableFertilizers || herbalismState.availableFertilizers.length === 0) {
    return '<div style="color: #666; font-style: italic; padding: 0.6rem; font-size: 0.75rem;">No fertilizers available</div>';
  }
  
  return herbalismState.availableFertilizers.map((fertilizer, idx) => {
    console.log('[HERBALISM] Rendering fertilizer:', fertilizer.name, 'sprite:', fertilizer.sprite);
    return `
      <div class="fertilizer-item" data-index="${idx}" style="flex: 0 0 auto; cursor:pointer; position: relative; border-radius: 3px; padding: 2px; background: rgba(34,139,34,0.1);">
        <img src="assets/art/ingridients/${fertilizer.sprite}.png" title="${fertilizer.name} (${fertilizer.amount})" style="width:30px;height:30px;" onerror="this.src='assets/art/ingridients/default.png'">
        <div style="font-size:0.6rem; color: #228B22;">x${fertilizer.amount}</div>
        <div class="info-icon" data-fertilizer="${idx}" style="position: absolute; top: -1px; right: -1px; width: 10px; height: 10px; background: #228B22; border-radius: 50%; color: white; font-size: 7px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
      </div>
    `;
  }).join('');
}

// Render recipes HTML - Made smaller
function renderRecipesHTML() {
  if (!herbalismState.recipes || herbalismState.recipes.length === 0) {
    return '<div style="color: #666; font-style: italic; padding: 0.6rem; font-size: 0.75rem;">No recipes available</div>';
  }
  
  return herbalismState.recipes.map((recipe, idx) => `
    <div class="recipe-card" data-recipe="${idx}" style="flex: 0 0 auto; cursor: pointer; border-radius: 4px; padding: 4px; background: rgba(139,69,19,0.2); border: 1px solid #8B4513; min-width: 55px; text-align: center; position: relative;">
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 30px; height: 30px; border-radius: 2px;" onerror="this.src='assets/art/recipes/default.png'">
      <div style="font-size: 0.6rem; margin-top: 2px; color: #c4975a; font-weight: bold;">${recipe.name}</div>
      <div class="info-icon" data-recipe="${idx}" style="position: absolute; top: -1px; right: -1px; width: 10px; height: 10px; background: #4CAF50; border-radius: 50%; color: white; font-size: 7px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

// Setup modal event listeners
function setupModalEventListeners(modal) {
  const growBtn = modal.querySelector('#grow-btn');
  const claimAllBtn = modal.querySelector('#claim-all-btn');
  const resultDiv = modal.querySelector('#craft-result');

  // Close button
  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
    herbalismState = null;
    ingredientCache.clear();
  });

  // Seeds container event delegation
  const seedsContainer = modal.querySelector('#available-seeds');
  seedsContainer.addEventListener('click', (e) => {
    const seedEl = e.target.closest('.seed-item');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon && infoIcon.dataset.seed) {
      e.stopPropagation();
      const seedIndex = parseInt(infoIcon.dataset.seed);
      showIngredientProperties(herbalismState.availableSeeds[seedIndex], 'seed');
      return;
    }
    
    if (seedEl && !herbalismState.isCraftingStarted) {
      const idx = parseInt(seedEl.dataset.index);
      const seed = herbalismState.availableSeeds[idx];
      handleSeedSelection(seed);
    }
  });

  // Fertilizers container event delegation
  const fertilizersContainer = modal.querySelector('#available-fertilizers');
  fertilizersContainer.addEventListener('click', (e) => {
    const fertilizerEl = e.target.closest('.fertilizer-item');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon && infoIcon.dataset.fertilizer) {
      e.stopPropagation();
      const fertilizerIndex = parseInt(infoIcon.dataset.fertilizer);
      showIngredientProperties(herbalismState.availableFertilizers[fertilizerIndex], 'fertilizer');
      return;
    }
    
    if (fertilizerEl && !herbalismState.isCraftingStarted) {
      const idx = parseInt(fertilizerEl.dataset.index);
      const fertilizer = herbalismState.availableFertilizers[idx];
      handleFertilizerSelection(fertilizer);
    }
  });

  // Recipes container event delegation
  const recipesContainer = modal.querySelector('#available-recipes');
  recipesContainer.addEventListener('click', (e) => {
    const recipeCard = e.target.closest('.recipe-card');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon && infoIcon.dataset.recipe) {
      e.stopPropagation();
      const recipeIdx = parseInt(infoIcon.dataset.recipe);
      showRecipeDetails(herbalismState.recipes[recipeIdx]);
      return;
    }
    
    if (recipeCard) {
      const recipeIdx = parseInt(recipeCard.dataset.recipe);
      showRecipeDetails(herbalismState.recipes[recipeIdx]);
    }
  });

  // Garden grid event delegation - Updated for remove buttons
  const gardenGrid = modal.querySelector('#garden-grid');
  gardenGrid.addEventListener('click', (e) => {
    // Handle remove button clicks
    const removeBtn = e.target.closest('.remove-btn');
    if (removeBtn && !herbalismState.isCraftingStarted) {
      e.stopPropagation();
      
      const seedPlot = removeBtn.closest('.seed-plot');
      const fertilizerSlot = removeBtn.closest('.fertilizer-slot');
      
      if (seedPlot) {
        const position = parseInt(seedPlot.dataset.position);
        removeSeedFromPlot(position);
      } else if (fertilizerSlot) {
        const row = parseInt(fertilizerSlot.dataset.row);
        removeFertilizerFromSlot(row);
      }
      return;
    }

    // Handle sun/shade toggle clicks
    const sunShadeToggle = e.target.closest('.sun-shade-toggle');
    if (sunShadeToggle && !herbalismState.isCraftingStarted) {
      const column = parseInt(sunShadeToggle.dataset.column);
      toggleSunShade(column);
      return;
    }
  });

  // Grow button
  growBtn.addEventListener('click', () => {
    startGrowthProcess(resultDiv);
  });

  // Claim all button
  claimAllBtn.addEventListener('click', () => {
    const successfulCrafts = herbalismState.results.filter(r => r && r.success);
    if (successfulCrafts.length > 0) {
      const itemNames = successfulCrafts.map(r => r.crafted.name).join(', ');
      context.displayMessage(`Claimed: ${itemNames}`);
    }
    modal.remove();
    herbalismState = null;
  });
}

// Handle seed selection
function handleSeedSelection(seed) {
  const emptySlotIndex = herbalismState.selectedSeeds.findIndex(s => s === null);
  if (emptySlotIndex === -1) return;

  herbalismState.selectedSeeds[emptySlotIndex] = seed;
  
  const plot = document.querySelector(`.seed-plot[data-position="${emptySlotIndex}"]`);
  const content = plot.querySelector('.seed-content');
  const removeBtn = plot.querySelector('.remove-btn');
  
  content.innerHTML = `
    <img src="assets/art/ingridients/${seed.sprite}.png" style="width:30px;height:30px;" title="${seed.name}" onerror="this.src='assets/art/ingridients/default.png'">
  `;
  
  plot.style.border = '2px solid #228B22';
  plot.style.background = 'linear-gradient(to bottom, #654321 0%, rgba(34,139,34,0.3) 100%)';
  
  // Show remove button
  removeBtn.style.display = 'flex';
  
  updateGrowButtonState();
}

// Handle fertilizer selection
function handleFertilizerSelection(fertilizer) {
  const emptySlotIndex = herbalismState.selectedFertilizers.findIndex(f => f === null);
  if (emptySlotIndex === -1) return;

  herbalismState.selectedFertilizers[emptySlotIndex] = fertilizer;
  
  const slot = document.querySelector(`.fertilizer-slot[data-row="${emptySlotIndex}"]`);
  const content = slot.querySelector('.fertilizer-content');
  const removeBtn = slot.querySelector('.remove-btn');
  
  content.innerHTML = `
    <img src="assets/art/ingridients/${fertilizer.sprite}.png" style="width:28px;height:28px;" title="${fertilizer.name}" onerror="this.src='assets/art/ingridients/default.png'">
  `;
  
  slot.style.border = '2px solid #32CD32';
  slot.style.background = 'linear-gradient(to bottom, rgba(34,139,34,0.3) 0%, rgba(34,139,34,0.5) 100%)';
  
  // Show remove button
  removeBtn.style.display = 'flex';
  
  updateGrowButtonState();
}

// Remove seed from plot
function removeSeedFromPlot(position) {
  herbalismState.selectedSeeds[position] = null;
  
  const plot = document.querySelector(`.seed-plot[data-position="${position}"]`);
  const content = plot.querySelector('.seed-content');
  const removeBtn = plot.querySelector('.remove-btn');
  
  content.innerHTML = '<span style="color: #D2B48C; font-size: 0.55rem;">Drop Seed</span>';
  plot.style.border = '2px dashed #8B4513';
  plot.style.background = 'linear-gradient(to bottom, #654321 0%, #8B4513 100%)';
  
  // Hide remove button
  removeBtn.style.display = 'none';
  
  updateGrowButtonState();
}

// Remove fertilizer from slot
function removeFertilizerFromSlot(row) {
  herbalismState.selectedFertilizers[row] = null;
  
  const slot = document.querySelector(`.fertilizer-slot[data-row="${row}"]`);
  const content = slot.querySelector('.fertilizer-content');
  const removeBtn = slot.querySelector('.remove-btn');
  
  content.innerHTML = '<span style="color: #90EE90; font-size: 0.5rem;">Drop Fertilizer</span>';
  slot.style.border = '2px dashed #228B22';
  slot.style.background = 'linear-gradient(to bottom, rgba(34,139,34,0.2) 0%, rgba(34,139,34,0.4) 100%)';
  
  // Hide remove button
  removeBtn.style.display = 'none';
  
  updateGrowButtonState();
}

// Toggle sun/shade for a column
function toggleSunShade(column) {
  const currentSetting = herbalismState.sunShadeSettings[column];
  const newSetting = currentSetting === 'sun' ? 'shade' : 'sun';
  herbalismState.sunShadeSettings[column] = newSetting;
  
  const toggle = document.querySelector(`.sun-shade-toggle[data-column="${column}"]`);
  const icon = toggle.querySelector('.toggle-icon');
  const text = toggle.querySelector('.toggle-text');
  
  if (newSetting === 'shade') {
    icon.textContent = '🌳';
    text.textContent = 'Shade';
    text.style.color = '#228B22';
    toggle.style.border = '2px solid #228B22';
    toggle.style.background = 'linear-gradient(to bottom, rgba(34,139,34,0.2) 0%, rgba(34,139,34,0.4) 100%)';
  } else {
    icon.textContent = '☀️';
    text.textContent = 'Sun';
    text.style.color = '#FFA500';
    toggle.style.border = '2px solid #FFA500';
    toggle.style.background = 'linear-gradient(to bottom, rgba(255,165,0,0.2) 0%, rgba(255,165,0,0.4) 100%)';
  }
  
  // Add toggle animation if gsap is available
  if (typeof gsap !== 'undefined') {
    gsap.to(toggle, {
      scale: 1.1,
      duration: 0.2,
      ease: "power2.out",
      yoyo: true,
      repeat: 1
    });
  }
}

// Update grow button state
function updateGrowButtonState() {
  const growBtn = document.querySelector('#grow-btn');
  const resultDiv = document.querySelector('#craft-result');
  
  const hasAnySeeds = herbalismState.selectedSeeds.some(s => s !== null);
  
  if (hasAnySeeds) {
    growBtn.disabled = false;
    const seedCount = herbalismState.selectedSeeds.filter(s => s !== null).length;
    resultDiv.textContent = `Garden ready! ${seedCount} seed${seedCount !== 1 ? 's' : ''} planted.`;
  } else {
    growBtn.disabled = true;
    resultDiv.textContent = 'Plant at least one seed to start growing';
  }
}

// Start the growth process
async function startGrowthProcess(resultDiv) {
  herbalismState.isCraftingStarted = true;
  
  const growBtn = document.querySelector('#grow-btn');
  const claimAllBtn = document.querySelector('#claim-all-btn');
  
  growBtn.style.display = 'none';
  resultDiv.textContent = 'Seeds are growing...';
  
  // Disable interactions and hide remove buttons
  const seedsContainer = document.querySelector('#available-seeds');
  const fertilizersContainer = document.querySelector('#available-fertilizers');
  const gardenGrid = document.querySelector('#garden-grid');
  
  seedsContainer.style.opacity = '0.5';
  seedsContainer.style.pointerEvents = 'none';
  fertilizersContainer.style.opacity = '0.5';
  fertilizersContainer.style.pointerEvents = 'none';
  gardenGrid.style.pointerEvents = 'none';
  
  // Hide all remove buttons during crafting
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.style.display = 'none';
  });
  
  // Start growth animations for planted seeds
  const growthPromises = [];
  herbalismState.selectedSeeds.forEach((seed, index) => {
    if (seed) {
      growthPromises.push(startSeedGrowthAnimation(index, seed));
    }
  });
  
  // Wait for all growth animations to complete
  await Promise.all(growthPromises);
  
  // Now process each seed individually
  resultDiv.textContent = 'Processing harvest...';
  await processSeedCrafting();
  
  // Show results and claim button
  displayFinalResults(resultDiv);
  claimAllBtn.style.display = 'block';
}

// Start growth animation for a specific seed
async function startSeedGrowthAnimation(position, seed) {
  const plot = document.querySelector(`.seed-plot[data-position="${position}"]`);
  const growthAnimation = plot.querySelector('.growth-animation');
  
  // Get seed color for growth effect
  const seedColor = getSeedColor(seed.name);
  
  // Create growth stages
  const stages = [
    { height: '20%', color: 'rgba(34,139,34,0.3)', duration: 0.8 },
    { height: '50%', color: 'rgba(34,139,34,0.5)', duration: 0.8 },
    { height: '80%', color: 'rgba(34,139,34,0.7)', duration: 0.8 },
    { height: '100%', color: seedColor, duration: 0.6 }
  ];
  
  growthAnimation.style.opacity = '1';
  growthAnimation.style.background = 'linear-gradient(to top, rgba(139,69,19,0.8) 0%, transparent 100%)';
  
  // Animate through growth stages
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    
    await new Promise(resolve => {
      if (typeof gsap !== 'undefined') {
        gsap.to(growthAnimation, {
          height: stage.height,
          background: `linear-gradient(to top, ${stage.color} 0%, rgba(139,69,19,0.3) 100%)`,
          duration: stage.duration,
          ease: "power2.out",
          onComplete: resolve
        });
      } else {
        // Fallback animation without GSAP
        growthAnimation.style.height = stage.height;
        growthAnimation.style.background = `linear-gradient(to top, ${stage.color} 0%, rgba(139,69,19,0.3) 100%)`;
        setTimeout(resolve, stage.duration * 1000);
      }
    });
    
    // Add sparkle effects during growth
    if (i < stages.length - 1) {
      createSparkleEffect(plot);
    }
    
    // Small delay between stages
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Final flourish - plant is fully grown
  createBloomEffect(plot, seedColor);
}

// Create sparkle effect during growth - Made smaller
function createSparkleEffect(plot) {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const sparkle = document.createElement('div');
      sparkle.style.cssText = `
        position: absolute;
        width: 2px;
        height: 2px;
        background: #FFD700;
        border-radius: 50%;
        top: ${Math.random() * 45 + 8}px;
        left: ${Math.random() * 45 + 8}px;
        pointer-events: none;
        z-index: 20;
      `;
      
      plot.appendChild(sparkle);
      
      if (typeof gsap !== 'undefined') {
        gsap.to(sparkle, {
          scale: 2,
          opacity: 0,
          y: -15,
          duration: 1,
          ease: "power2.out",
          onComplete: () => {
            if (sparkle.parentNode) {
              sparkle.remove();
            }
          }
        });
      } else {
        // Fallback animation
        setTimeout(() => {
          if (sparkle.parentNode) {
            sparkle.remove();
          }
        }, 1000);
      }
    }, i * 150);
  }
}

// Create bloom effect when plant is fully grown - Made smaller
function createBloomEffect(plot, seedColor) {
  const bloom = document.createElement('div');
  bloom.style.cssText = `
    position: absolute;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    width: 8px;
    height: 8px;
    background: ${seedColor};
    border-radius: 50%;
    border: 1px solid #FFD700;
    z-index: 25;
    box-shadow: 0 0 6px ${seedColor};
  `;
  
  plot.appendChild(bloom);
  
  // Animate bloom appearing
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(bloom, 
      { scale: 0, opacity: 0 },
      { 
        scale: 1, 
        opacity: 1, 
        duration: 0.6, 
        ease: "back.out(1.7)",
        onComplete: () => {
          // Gentle pulsing effect
          gsap.to(bloom, {
            scale: 1.2,
            duration: 1.5,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1
          });
        }
      }
    );
  } else {
    // Fallback without animation
    bloom.style.transform = 'translateX(-50%) scale(1)';
    bloom.style.opacity = '1';
  }
}

async function processSeedCrafting() {
  const craftingPromises = [];
  
  for (let i = 0; i < 4; i++) {
    if (herbalismState.selectedSeeds[i]) {
      craftingPromises.push(craftIndividualSeed(i));
    } else {
      herbalismState.results[i] = null;
    }
  }
  
  await Promise.all(craftingPromises);
}

// Craft individual seed with its modifiers
async function craftIndividualSeed(position) {
  const seed = herbalismState.selectedSeeds[position];
  if (!seed) return;
  
  // Determine modifiers for this seed
  const column = position % 2; // 0 or 1
  const row = Math.floor(position / 2); // 0 or 1
  
  const environment = herbalismState.sunShadeSettings[column]; // 'sun' or 'shade'
  const fertilizerModifier = herbalismState.selectedFertilizers[row];
  
  // Build the craft request
  const craftRequest = {
    player_id: context.profile.id,
    profession_id: herbalismState.professionId,
    seed_name: seed.name,
    environment: environment
  };
  
  // Add fertilizer if available
  if (fertilizerModifier) {
    craftRequest.fertilizer_name = fertilizerModifier.name;
  }
  
  console.log(`[HERBALISM] Crafting seed at position ${position}:`, craftRequest);
  
  try {
    // Call the herbalism-specific craft function
    const craftRes = await context.apiCall('/functions/v1/craft_herbalism', 'POST', craftRequest);

    const craftJson = await craftRes.json();
    herbalismState.results[position] = craftJson;
    
  } catch (error) {
    console.error(`[HERBALISM] Error crafting seed at position ${position}:`, error);
    herbalismState.results[position] = { success: false, error: 'Crafting failed' };
  }
}

// Display final results
function displayFinalResults(resultDiv) {
  const results = herbalismState.results.filter(r => r !== null);
  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);
  
  let message = '';
  
  if (successes.length > 0) {
    const successItems = successes.map(r => r.crafted.name).join(', ');
    message += `✅ Successfully harvested: ${successItems}`;
  }
  
  if (failures.length > 0) {
    if (message) message += '\n';
    message += `❌ ${failures.length} seed${failures.length !== 1 ? 's' : ''} failed to grow properly`;
  }
  
  if (!message) {
    message = 'No seeds were planted';
  }
  
  resultDiv.innerHTML = message.replace('\n', '<br>');
  
  // Update plot visuals to show success/failure
  herbalismState.results.forEach((result, position) => {
    if (result === null) return;
    
    const plot = document.querySelector(`.seed-plot[data-position="${position}"]`);
    const growthAnimation = plot.querySelector('.growth-animation');
    
    if (result.success) {
      // Add success glow
      if (typeof gsap !== 'undefined') {
        gsap.to(plot, {
          boxShadow: '0 0 10px rgba(76, 175, 80, 0.6)',
          duration: 1,
          ease: "power2.out"
        });
      } else {
        plot.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.6)';
      }
    } else {
      // Add failure effect
      if (typeof gsap !== 'undefined') {
        gsap.to(growthAnimation, {
          background: 'linear-gradient(to top, rgba(139,69,19,0.8) 0%, rgba(139,69,19,0.4) 100%)',
          duration: 1,
          ease: "power2.out"
        });
      } else {
        growthAnimation.style.background = 'linear-gradient(to top, rgba(139,69,19,0.8) 0%, rgba(139,69,19,0.4) 100%)';
      }
    }
  });
}

// Show ingredient properties - Made smaller text
function showIngredientProperties(ingredient, type) {
  const propsModal = document.createElement('div');
  propsModal.className = 'custom-message-box';
  propsModal.style.zIndex = '10001';
  
  let propertiesDisplay = '';
  if (typeof ingredient.properties === 'object' && ingredient.properties !== null) {
    if (Array.isArray(ingredient.properties)) {
      propertiesDisplay = ingredient.properties.map((prop, idx) => 
        `<div class="property-item" style="background: rgba(76,175,80,0.2); padding: 0.4rem; border-radius: 3px; margin-bottom: 0.2rem; font-size: 0.8rem;">
          <strong>Property ${idx + 1}:</strong> ${prop}
        </div>`
      ).join('');
    } else {
      propertiesDisplay = Object.entries(ingredient.properties).map(([key, value]) => 
        `<div class="property-item" style="background: rgba(76,175,80,0.2); padding: 0.4rem; border-radius: 3px; margin-bottom: 0.2rem; font-size: 0.8rem;">
          <strong>${key.toUpperCase()}:</strong> ${value}
        </div>`
      ).join('');
    }
  } else {
    propertiesDisplay = '<div style="color: #999; font-style: italic; font-size: 0.8rem;">No properties available</div>';
  }
  
  const typeColor = type === 'seed' ? '#8B4513' : '#228B22';
  const typeIcon = type === 'seed' ? '🌰' : '🧪';
  
  propsModal.innerHTML = `
    <div class="message-content" style="max-width: 300px; text-align: center;">
      <h3 style="color: ${typeColor}; margin-bottom: 0.8rem; font-size: 1.1rem;">${typeIcon} ${ingredient.name}</h3>
      <img src="assets/art/ingridients/${ingredient.sprite}.png" alt="${ingredient.name}" style="width: 60px; height: 60px; border-radius: 6px; margin-bottom: 0.8rem;" onerror="this.src='assets/art/ingridients/default.png'">
      
      <div style="background: rgba(0,0,0,0.3); border: 1px solid ${typeColor}; border-radius: 6px; padding: 0.8rem; margin-bottom: 0.8rem; text-align: left;">
        <h4 style="color: ${typeColor}; margin-bottom: 0.6rem; text-align: center; font-size: 0.9rem;">Properties:</h4>
        ${propertiesDisplay}
      </div>
      
      <div style="background: rgba(255,255,255,0.1); border-radius: 4px; padding: 0.5rem; margin-bottom: 0.8rem; font-size: 0.8rem;">
        <strong>Available:</strong> ${ingredient.amount} units
      </div>
      
      <button class="fantasy-button close-props-btn" style="width: 100%; font-size: 0.8rem;">Close</button>
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

// Show recipe details - Made smaller text
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
  
  detailsModal.innerHTML = `
    <div class="message-content" style="max-width: 400px; text-align: center; max-height: 75vh; overflow-y: auto;">
      <h3 style="color: #c4975a; margin-bottom: 0.8rem; font-size: 1.1rem;">📜 ${recipe.name}</h3>
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 70px; height: 70px; border-radius: 6px; margin-bottom: 0.8rem;" onerror="this.src='assets/art/recipes/default.png'">
      
      <div style="background: rgba(139,69,19,0.1); border: 1px solid #8B4513; border-radius: 6px; padding: 0.8rem; margin-bottom: 0.8rem; text-align: left;">
        <h4 style="color: #c4975a; margin-bottom: 0.4rem; font-size: 0.9rem;">Required Combination:</h4>
        <div style="color: #fff; font-size: 0.8rem; line-height: 1.3;">${ingredientsList}</div>
      </div>
      
      <div style="background: rgba(76,175,80,0.1); border: 1px solid #4CAF50; border-radius: 6px; padding: 0.8rem; margin-bottom: 0.8rem; text-align: left;">
        <h4 style="color: #4CAF50; margin-bottom: 0.6rem; font-size: 0.9rem;">Herbalism Recipe Format:</h4>
        <div style="font-size: 0.75rem; color: #ccc;">
          <div style="margin-bottom: 0.4rem;">🌰 <strong>Seed:</strong> Any seed type</div>
          <div style="margin-bottom: 0.4rem;">☀️🌳 <strong>Environment:</strong> Sun or Shade</div>
          <div style="margin-bottom: 0.4rem;">🧪 <strong>Fertilizer:</strong> Optional modifier</div>
        </div>
      </div>
      
      ${recipe.description ? `
        <div style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 0.6rem; margin-bottom: 0.8rem; font-style: italic; color: #ccc; font-size: 0.75rem;">
          ${recipe.description}
        </div>
      ` : ''}
      
      <button class="fantasy-button close-details-btn" style="width: 100%; font-size: 0.8rem;">Close</button>
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

// Get seed-specific colors for growth effects
function getSeedColor(seedName) {
  const colors = {
    'Wheat Seed': 'rgba(218, 165, 32, 0.8)',        // Golden Rod
    'Carrot Seed': 'rgba(255, 140, 0, 0.8)',        // Dark Orange
    'Tomato Seed': 'rgba(255, 99, 71, 0.8)',        // Tomato Red
    'Lettuce Seed': 'rgba(144, 238, 144, 0.8)',     // Light Green
    'Potato Seed': 'rgba(160, 82, 45, 0.8)',        // Saddle Brown
    'Corn Seed': 'rgba(255, 215, 0, 0.8)',          // Gold
    'Blue Seed': 'rgba(30, 144, 255, 0.8)',         // Dodger Blue
    'Red Seed': 'rgba(220, 20, 60, 0.8)',           // Crimson
    'default': 'rgba(76, 175, 80, 0.8)'             // Green
  };

  const seedKey = Object.keys(colors).find(key => {
    const keyLower = key.toLowerCase();
    const seedLower = seedName.toLowerCase();
    return seedLower.includes(keyLower.replace(' seed', '')) || keyLower === seedLower;
  });

  return seedKey ? colors[seedKey] : colors.default;
}

// Inject CSS for herbalism animations - Updated for smaller sizes
function injectHerbalismAnimationsCSS() {
  if (document.getElementById('herbalism-animations-css')) return;
  
  const css = `
    .seed-plot, .fertilizer-slot, .sun-shade-toggle {
      transition: all 0.3s ease;
    }

    .growth-animation {
      will-change: height, background;
    }

    .sun-shade-toggle:hover {
      transform: scale(1.05);
    }

    .seed-plot:hover, .fertilizer-slot:hover {
      transform: translateY(-1px);
      box-shadow: 0 3px 6px rgba(0,0,0,0.2);
    }

    .remove-btn:hover {
      background: #dc2626 !important;
      transform: scale(1.1);
    }

    @keyframes seed-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .seed-planted {
      animation: seed-pulse 2s ease-in-out infinite;
    }
  `;

  const style = document.createElement('style');
  style.id = 'herbalism-animations-css';
  style.textContent = css;
  document.head.appendChild(style);
}

// Export cache management functions
export function clearIngredientCache() {
  ingredientCache.clear();
}

export function preloadIngredients(ingredientNames) {
  return batchEnrichIngredients(ingredientNames.map(name => ({ item: name, amount: 1 })));
}
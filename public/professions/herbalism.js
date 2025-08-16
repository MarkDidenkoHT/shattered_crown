// Improved Herbalism profession module
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
    injectHerbalismCSS();
    
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

// Create the 3x3 garden grid (with bottom-right empty)
function createGardenGridHTML() {
  return `
    <div id="garden-grid" class="garden-grid">
      
      <!-- Top Row: Seed1, Seed2, Fertilizer1 -->
      <div class="seed-plot" data-position="0">
        <span class="plot-label">Seed 1</span>
        <div class="seed-content">
          <span class="empty-text">Drop Seed</span>
        </div>
        <button class="remove-btn" style="display: none;">×</button>
        <div class="growth-animation"></div>
      </div>
      
      <div class="seed-plot" data-position="1">
        <span class="plot-label">Seed 2</span>
        <div class="seed-content">
          <span class="empty-text">Drop Seed</span>
        </div>
        <button class="remove-btn" style="display: none;">×</button>
        <div class="growth-animation"></div>
      </div>
      
      <div class="fertilizer-slot" data-row="0">
        <span class="fertilizer-label">Row 1 Fert.</span>
        <div class="fertilizer-content">
          <span class="empty-text">Drop Fertilizer</span>
        </div>
        <button class="remove-btn" style="display: none;">×</button>
      </div>

      <!-- Middle Row: Seed3, Seed4, Fertilizer2 -->
      <div class="seed-plot" data-position="2">
        <span class="plot-label">Seed 3</span>
        <div class="seed-content">
          <span class="empty-text">Drop Seed</span>
        </div>
        <button class="remove-btn" style="display: none;">×</button>
        <div class="growth-animation"></div>
      </div>
      
      <div class="seed-plot" data-position="3">
        <span class="plot-label">Seed 4</span>
        <div class="seed-content">
          <span class="empty-text">Drop Seed</span>
        </div>
        <button class="remove-btn" style="display: none;">×</button>
        <div class="growth-animation"></div>
      </div>
      
      <div class="fertilizer-slot" data-row="1">
        <span class="fertilizer-label">Row 2 Fert.</span>
        <div class="fertilizer-content">
          <span class="empty-text">Drop Fertilizer</span>
        </div>
        <button class="remove-btn" style="display: none;">×</button>
      </div>

      <!-- Bottom Row: Sun/Shade toggles and Empty -->
      <div class="sun-shade-toggle sun" data-column="0">
        <div class="toggle-icon">☀️</div>
        <div class="toggle-text">Sun</div>
        <div class="column-label">Col 1</div>
      </div>
      
      <div class="sun-shade-toggle sun" data-column="1">
        <div class="toggle-icon">☀️</div>
        <div class="toggle-text">Sun</div>
        <div class="column-label">Col 2</div>
      </div>
      
      <!-- Empty bottom-right corner -->
      <div class="empty-grid-cell"></div>
      
    </div>
  `;
}

// Render main modal
function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box herbalism-modal';
  modal.innerHTML = `
    <div class="message-content herbalism-content">
      <h2 class="herbalism-title">🌱 Crafting: ${herbalismState.professionName}</h2>
            
      <!-- Result display -->
      <div id="craft-result" class="craft-result">Set up your garden to start growing</div>
      
      <!-- Main garden grid -->
      <div class="garden-container">
        ${createGardenGridHTML()}
      </div>
      
      <!-- Seeds section -->
      <div class="section-container">
        <h3 class="section-title seeds">Available Seeds</h3>
        <div id="available-seeds" class="items-container seeds-container">
          ${renderSeedsHTML()}
        </div>
      </div>
      
      <!-- Fertilizers section -->
      <div class="section-container">
        <h3 class="section-title fertilizers">Available Fertilizers</h3>
        <div id="available-fertilizers" class="items-container fertilizers-container">
          ${renderFertilizersHTML()}
        </div>
      </div>
      
      <!-- Recipes section -->
      <div class="section-container">
        <h3 class="section-title recipes">Recipes</h3>
        <div id="available-recipes" class="items-container recipes-container">
          ${renderRecipesHTML()}
        </div>
      </div>
      
      <!-- Button row -->
      <div class="button-container">
        <button class="fantasy-button message-ok-btn">Close</button>
        <button id="grow-btn" class="fantasy-button grow-btn" disabled>🌱 Grow</button>
        <button id="claim-all-btn" class="fantasy-button claim-btn" style="display: none;">Claim All</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  setupModalEventListeners(modal);
}

// Render seeds HTML
function renderSeedsHTML() {
  console.log('[HERBALISM] Rendering seeds HTML with:', herbalismState.availableSeeds);
  
  if (!herbalismState.availableSeeds || herbalismState.availableSeeds.length === 0) {
    return '<div class="no-items-message">No seeds available</div>';
  }
  
  return herbalismState.availableSeeds.map((seed, idx) => {
    console.log('[HERBALISM] Rendering seed:', seed.name, 'sprite:', seed.sprite);
    return `
      <div class="seed-item ingredient-item" data-index="${idx}">
        <img class="ingredient-image" src="assets/art/ingridients/${seed.sprite}.png" title="${seed.name} (${seed.amount})" onerror="this.src='assets/art/ingridients/default.png'">
        <div class="ingredient-amount seeds">x${seed.amount}</div>
        <div class="info-icon" data-seed="${idx}">i</div>
      </div>
    `;
  }).join('');
}

// Render fertilizers HTML
function renderFertilizersHTML() {
  console.log('[HERBALISM] Rendering fertilizers HTML with:', herbalismState.availableFertilizers);
  
  if (!herbalismState.availableFertilizers || herbalismState.availableFertilizers.length === 0) {
    return '<div class="no-items-message">No fertilizers available</div>';
  }
  
  return herbalismState.availableFertilizers.map((fertilizer, idx) => {
    console.log('[HERBALISM] Rendering fertilizer:', fertilizer.name, 'sprite:', fertilizer.sprite);
    return `
      <div class="fertilizer-item ingredient-item" data-index="${idx}">
        <img class="ingredient-image" src="assets/art/ingridients/${fertilizer.sprite}.png" title="${fertilizer.name} (${fertilizer.amount})" onerror="this.src='assets/art/ingridients/default.png'">
        <div class="ingredient-amount fertilizers">x${fertilizer.amount}</div>
        <div class="info-icon" data-fertilizer="${idx}">i</div>
      </div>
    `;
  }).join('');
}

// Render recipes HTML
function renderRecipesHTML() {
  if (!herbalismState.recipes || herbalismState.recipes.length === 0) {
    return '<div class="no-items-message">No recipes available</div>';
  }
  
  return herbalismState.recipes.map((recipe, idx) => `
    <div class="recipe-card" data-recipe="${idx}">
      <img class="recipe-image" src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" onerror="this.src='assets/art/recipes/default.png'">
      <div class="recipe-name">${recipe.name}</div>
      <div class="info-icon" data-recipe="${idx}">i</div>
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

  // Garden grid event delegation
  const gardenGrid = modal.querySelector('#garden-grid');
  gardenGrid.addEventListener('click', (e) => {
    // Handle remove button clicks
    const removeBtn = e.target.closest('.remove-btn');
    if (removeBtn && !herbalismState.isCraftingStarted) {
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
    <img class="planted-seed-image" src="assets/art/ingridients/${seed.sprite}.png" title="${seed.name}" onerror="this.src='assets/art/ingridients/default.png'">
  `;
  
  plot.classList.add('planted');
  removeBtn.style.display = 'block';
  
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
    <img class="planted-fertilizer-image" src="assets/art/ingridients/${fertilizer.sprite}.png" title="${fertilizer.name}" onerror="this.src='assets/art/ingridients/default.png'">
  `;
  
  slot.classList.add('planted');
  removeBtn.style.display = 'block';
  
  updateGrowButtonState();
}

// Remove seed from plot
function removeSeedFromPlot(position) {
  herbalismState.selectedSeeds[position] = null;
  
  const plot = document.querySelector(`.seed-plot[data-position="${position}"]`);
  const content = plot.querySelector('.seed-content');
  const removeBtn = plot.querySelector('.remove-btn');
  
  content.innerHTML = '<span class="empty-text">Drop Seed</span>';
  plot.classList.remove('planted');
  removeBtn.style.display = 'none';
  
  updateGrowButtonState();
}

// Remove fertilizer from slot
function removeFertilizerFromSlot(row) {
  herbalismState.selectedFertilizers[row] = null;
  
  const slot = document.querySelector(`.fertilizer-slot[data-row="${row}"]`);
  const content = slot.querySelector('.fertilizer-content');
  const removeBtn = slot.querySelector('.remove-btn');
  
  content.innerHTML = '<span class="empty-text">Drop Fertilizer</span>';
  slot.classList.remove('planted');
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
  
  // Remove previous class and add new one
  toggle.classList.remove('sun', 'shade');
  toggle.classList.add(newSetting);
  
  if (newSetting === 'shade') {
    icon.textContent = '🌳';
    text.textContent = 'Shade';
  } else {
    icon.textContent = '☀️';
    text.textContent = 'Sun';
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
  
  // Disable interactions
  const seedsContainer = document.querySelector('#available-seeds');
  const fertilizersContainer = document.querySelector('#available-fertilizers');
  const gardenGrid = document.querySelector('#garden-grid');
  
  seedsContainer.classList.add('disabled');
  fertilizersContainer.classList.add('disabled');
  gardenGrid.classList.add('crafting');
  
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

// Create sparkle effect during growth
function createSparkleEffect(plot) {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle-effect';
      sparkle.style.top = `${Math.random() * 60 + 10}px`;
      sparkle.style.left = `${Math.random() * 60 + 10}px`;
      
      plot.appendChild(sparkle);
      
      if (typeof gsap !== 'undefined') {
        gsap.to(sparkle, {
          scale: 2,
          opacity: 0,
          y: -20,
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

// Create bloom effect when plant is fully grown
function createBloomEffect(plot, seedColor) {
  const bloom = document.createElement('div');
  bloom.className = 'bloom-effect';
  bloom.style.setProperty('--seed-color', seedColor);
  
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
    
    if (result.success) {
      plot.classList.add('success');
    } else {
      plot.classList.add('failure');
    }
  });
}

// Show ingredient properties (reused from alchemy with modifications)
function showIngredientProperties(ingredient, type) {
  const propsModal = document.createElement('div');
  propsModal.className = 'custom-message-box properties-modal';
  
  let propertiesDisplay = '';
  if (typeof ingredient.properties === 'object' && ingredient.properties !== null) {
    if (Array.isArray(ingredient.properties)) {
      propertiesDisplay = ingredient.properties.map((prop, idx) => 
        `<div class="property-item">
          <strong>Property ${idx + 1}:</strong> ${prop}
        </div>`
      ).join('');
    } else {
      propertiesDisplay = Object.entries(ingredient.properties).map(([key, value]) => 
        `<div class="property-item">
          <strong>${key.toUpperCase()}:</strong> ${value}
        </div>`
      ).join('');
    }
  } else {
    propertiesDisplay = '<div class="no-properties">No properties available</div>';
  }
  
  const typeClass = type === 'seed' ? 'seeds' : 'fertilizers';
  const typeIcon = type === 'seed' ? '🌰' : '🧪';
  
  propsModal.innerHTML = `
    <div class="message-content properties-content">
      <h3 class="properties-title ${typeClass}">${typeIcon} ${ingredient.name}</h3>
      <img class="properties-image" src="assets/art/ingridients/${ingredient.sprite}.png" alt="${ingredient.name}" onerror="this.src='assets/art/ingridients/default.png'">
      
      <div class="properties-container ${typeClass}">
        <h4 class="properties-subtitle">Properties:</h4>
        ${propertiesDisplay}
      </div>
      
      <div class="availability-info">
        <strong>Available:</strong> ${ingredient.amount} units
      </div>
      
      <button class="fantasy-button close-props-btn">Close</button>
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

// Show recipe details
function showRecipeDetails(recipe) {
  const detailsModal = document.createElement('div');
  detailsModal.className = 'custom-message-box recipe-details-modal';
  
  let ingredientsList = '';
  if (Array.isArray(recipe.ingridients)) {
    ingredientsList = recipe.ingridients.join(', ');
  } else if (typeof recipe.ingridients === 'object') {
    ingredientsList = Object.values(recipe.ingridients).join(', ');
  } else {
    ingredientsList = recipe.ingridients || 'Unknown ingredients';
  }
  
  detailsModal.innerHTML = `
    <div class="message-content recipe-details-content">
      <h3 class="recipe-details-title">📜 ${recipe.name}</h3>
      <img class="recipe-details-image" src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" onerror="this.src='assets/art/recipes/default.png'">
      
      <div class="recipe-ingredients">
        <h4>Required Combination:</h4>
        <div class="ingredients-text">${ingredientsList}</div>
      </div>
      
      <div class="recipe-format">
        <h4>Herbalism Recipe Format:</h4>
        <div class="format-list">
          <div>🌰 <strong>Seed:</strong> Any seed type</div>
          <div>☀️🌳 <strong>Environment:</strong> Sun or Shade</div>
          <div>🧪 <strong>Fertilizer:</strong> Optional modifier</div>
        </div>
      </div>
      
      ${recipe.description ? `
        <div class="recipe-description">
          ${recipe.description}
        </div>
      ` : ''}
      
      <button class="fantasy-button close-details-btn">Close</button>
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

// Inject comprehensive CSS for herbalism interface
function injectHerbalismCSS() {
  if (document.getElementById('herbalism-css')) return;
  
  const css = `
    /* ===== HERBALISM MODAL BASE ===== */
    .herbalism-modal {
      z-index: 10000;
    }
    
    .herbalism-content {
      width: 95vw;
      max-width: 1000px;
      max-height: 95vh;
      overflow-y: auto;
      text-align: center;
      padding: 1rem;
      box-sizing: border-box;
    }
    
    .herbalism-title {
      margin: 0 0 0.5rem 0;
      color: #228B22;
      font-size: 1.5rem;
    }
    
    /* ===== RESULT DISPLAY ===== */
    .craft-result {
      margin: 0.5rem 0;
      font-weight: bold;
      min-height: 20px;
      font-size: 0.9rem;
      padding: 0.5rem;
      background: rgba(0,0,0,0.2);
      border-radius: 6px;
    }
    
    /* ===== GARDEN GRID ===== */
    .garden-container {
      margin: 1rem 0;
    }
    
    .garden-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: 0.5rem;
      max-width: 300px;
      margin: 0 auto;
    }
    
    .garden-grid.crafting {
      pointer-events: none;
    }
    
    /* ===== SEED PLOTS ===== */
    .seed-plot {
      width: 80px;
      height: 80px;
      border: 2px dashed #8B4513;
      border-radius: 8px;
      background: linear-gradient(to bottom, #654321 0%, #8B4513 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      transition: all 0.3s ease;
    }
    
    .seed-plot:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }
    
    .seed-plot.planted {
      border: 2px solid #228B22;
      background: linear-gradient(to bottom, #654321 0%, rgba(34,139,34,0.3) 100%);
    }
    
    .seed-plot.success {
      box-shadow: 0 0 15px rgba(76, 175, 80, 0.6);
    }
    
    .seed-plot.failure .growth-animation {
      background: linear-gradient(to top, rgba(139,69,19,0.8) 0%, rgba(139,69,19,0.4) 100%) !important;
    }
    
    /* ===== FERTILIZER SLOTS ===== */
    .fertilizer-slot {
      width: 80px;
      height: 80px;
      border: 2px dashed #228B22;
      border-radius: 8px;
      background: linear-gradient(to bottom, rgba(34,139,34,0.2) 0%, rgba(34,139,34,0.4) 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      transition: all 0.3s ease;
    }
    
    .fertilizer-slot:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }
    
    .fertilizer-slot.planted {
      border: 2px solid #32CD32;
      background: linear-gradient(to bottom, rgba(34,139,34,0.3) 0%, rgba(34,139,34,0.5) 100%);
    }
    
    /* ===== SUN/SHADE TOGGLES ===== */
    .sun-shade-toggle {
      width: 80px;
      height: 80px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
    }
    
    .sun-shade-toggle:hover {
      transform: scale(1.05);
    }
    
    .sun-shade-toggle.sun {
      border: 2px solid #FFA500;
      background: linear-gradient(to bottom, rgba(255,165,0,0.2) 0%, rgba(255,165,0,0.4) 100%);
    }
    
    .sun-shade-toggle.shade {
      border: 2px solid #228B22;
      background: linear-gradient(to bottom, rgba(34,139,34,0.2) 0%, rgba(34,139,34,0.4) 100%);
    }
    
    .toggle-icon {
      font-size: 1.5rem;
      margin-bottom: 2px;
    }
    
    .toggle-text {
      font-size: 0.65rem;
      font-weight: bold;
    }
    
    .sun .toggle-text {
      color: #FFA500;
    }
    
    .shade .toggle-text {
      color: #228B22;
    }
    
    .column-label {
      display: none;
      font-size: 0.6rem;
      color: #999;
      position: absolute;
      bottom: 2px;
    }
    
    /* ===== LABELS ===== */
    .plot-label, .fertilizer-label {
      color: #D2B48C;
      font-size: 0.7rem;
      position: absolute;
      top: 2px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.5);
      padding: 1px 3px;
      border-radius: 3px;
      z-index: 10;
    }
    
    .fertilizer-label {
      color: #90EE90;
    }
    
    /* ===== CONTENT AREAS ===== */
    .seed-content, .fertilizer-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 5;
    }
    
    .empty-text {
      color: #D2B48C;
      font-size: 0.65rem;
    }
    
    .fertilizer-content .empty-text {
      color: #90EE90;
      font-size: 0.6rem;
    }
    
    .planted-seed-image, .planted-fertilizer-image {
      width: 40px;
      height: 40px;
      border-radius: 4px;
    }
    
    .planted-fertilizer-image {
      width: 36px;
      height: 36px;
    }
    
    /* ===== REMOVE BUTTONS ===== */
    .remove-btn {
      position: absolute;
      top: -5px;
      right: -5px;
      width: 20px;
      height: 20px;
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 50%;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      z-index: 15;
      transition: all 0.2s ease;
    }
    
    .remove-btn:hover {
      background: #ff0000;
      transform: scale(1.1);
    }
    
    /* ===== GROWTH ANIMATIONS ===== */
    .growth-animation {
      position: absolute;
      inset: 0;
      border-radius: 6px;
      overflow: hidden;
      opacity: 0;
      height: 0;
      will-change: height, background;
      z-index: 8;
    }
    
    .sparkle-effect {
      position: absolute;
      width: 3px;
      height: 3px;
      background: #FFD700;
      border-radius: 50%;
      pointer-events: none;
      z-index: 20;
    }
    
    .bloom-effect {
      position: absolute;
      top: 20%;
      left: 50%;
      transform: translateX(-50%);
      width: 12px;
      height: 12px;
      background: var(--seed-color, rgba(76, 175, 80, 0.8));
      border-radius: 50%;
      border: 2px solid #FFD700;
      z-index: 25;
      box-shadow: 0 0 8px var(--seed-color, rgba(76, 175, 80, 0.8));
    }
    
    /* ===== EMPTY GRID CELL ===== */
    .empty-grid-cell {
      width: 80px;
      height: 80px;
    }
    
    /* ===== SECTION CONTAINERS ===== */
    .section-container {
      margin: 0.8rem 0;
    }
    
    .section-title {
      margin: 0.3rem 0;
      font-size: 0.9rem;
      font-weight: bold;
    }
    
    .section-title.seeds {
      color: #8B4513;
    }
    
    .section-title.fertilizers {
      color: #228B22;
    }
    
    .section-title.recipes {
      color: #4CAF50;
    }
    
    /* ===== ITEMS CONTAINERS ===== */
    .items-container {
      display: flex;
      overflow-x: auto;
      gap: 0.4rem;
      padding: 4px;
      border-radius: 6px;
      scrollbar-width: thin;
      max-height: 60px;
      border: 1px solid;
    }
    
    .items-container::-webkit-scrollbar {
      height: 4px;
    }
    
    .items-container::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.1);
    }
    
    .items-container::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.3);
      border-radius: 2px;
    }
    
    .seeds-container {
      border-color: #8B4513;
      background: rgba(139,69,19,0.1);
    }
    
    .fertilizers-container {
      border-color: #228B22;
      background: rgba(34,139,34,0.1);
    }
    
    .recipes-container {
      border-color: #444;
      background: rgba(139,69,19,0.1);
      max-height: 70px;
    }
    
    .items-container.disabled {
      opacity: 0.5;
      pointer-events: none;
    }
    
    /* ===== NO ITEMS MESSAGE ===== */
    .no-items-message {
      color: #666;
      font-style: italic;
      padding: 0.8rem;
      font-size: 0.85rem;
      text-align: center;
      flex: 1;
    }
    
    /* ===== INGREDIENT ITEMS ===== */
    .ingredient-item {
      flex: 0 0 auto;
      cursor: pointer;
      position: relative;
      border-radius: 3px;
      padding: 3px;
      transition: transform 0.2s ease;
    }
    
    .ingredient-item:hover {
      transform: scale(1.05);
    }
    
    .seed-item {
      background: rgba(139,69,19,0.1);
    }
    
    .fertilizer-item {
      background: rgba(34,139,34,0.1);
    }
    
    .ingredient-image {
      width: 40px;
      height: 40px;
      display: block;
    }
    
    .ingredient-amount {
      font-size: 0.7rem;
      font-weight: bold;
      text-align: center;
      margin-top: 2px;
    }
    
    .ingredient-amount.seeds {
      color: #8B4513;
    }
    
    .ingredient-amount.fertilizers {
      color: #228B22;
    }
    
    /* ===== RECIPE CARDS ===== */
    .recipe-card {
      flex: 0 0 auto;
      cursor: pointer;
      border-radius: 6px;
      padding: 6px;
      background: rgba(139,69,19,0.2);
      border: 1px solid #8B4513;
      min-width: 60px;
      text-align: center;
      position: relative;
      transition: transform 0.2s ease;
    }
    
    .recipe-card:hover {
      transform: scale(1.05);
    }
    
    .recipe-image {
      width: 40px;
      height: 40px;
      border-radius: 3px;
      display: block;
      margin: 0 auto;
    }
    
    .recipe-name {
      font-size: 0.65rem;
      margin-top: 3px;
      color: #c4975a;
      font-weight: bold;
      line-height: 1.1;
    }
    
    /* ===== INFO ICONS ===== */
    .info-icon {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      color: white;
      font-size: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10;
      transition: transform 0.2s ease;
    }
    
    .info-icon:hover {
      transform: scale(1.2);
    }
    
    .seed-item .info-icon {
      background: #8B4513;
    }
    
    .fertilizer-item .info-icon {
      background: #228B22;
    }
    
    .recipe-card .info-icon {
      background: #4CAF50;
    }
    
    /* ===== BUTTON CONTAINER ===== */
    .button-container {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 1rem;
      flex-wrap: wrap;
    }
    
    .button-container button {
      flex: 0 1 auto;
      min-width: 80px;
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
    }
    
    .grow-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .claim-btn {
      background: linear-gradient(145deg, #4CAF50, #45a049);
    }
    
    /* ===== PROPERTIES MODAL ===== */
    .properties-modal {
      z-index: 10001;
    }
    
    .properties-content {
      max-width: 350px;
      text-align: center;
    }
    
    .properties-title {
      margin-bottom: 1rem;
    }
    
    .properties-title.seeds {
      color: #8B4513;
    }
    
    .properties-title.fertilizers {
      color: #228B22;
    }
    
    .properties-image {
      width: 80px;
      height: 80px;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    
    .properties-container {
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      text-align: left;
      background: rgba(0,0,0,0.3);
      border: 1px solid;
    }
    
    .properties-container.seeds {
      border-color: #8B4513;
    }
    
    .properties-container.fertilizers {
      border-color: #228B22;
    }
    
    .properties-subtitle {
      margin-bottom: 0.8rem;
      text-align: center;
    }
    
    .properties-container.seeds .properties-subtitle {
      color: #8B4513;
    }
    
    .properties-container.fertilizers .properties-subtitle {
      color: #228B22;
    }
    
    .property-item {
      background: rgba(76,175,80,0.2);
      padding: 0.5rem;
      border-radius: 4px;
      margin-bottom: 0.3rem;
    }
    
    .no-properties {
      color: #999;
      font-style: italic;
    }
    
    .availability-info {
      background: rgba(255,255,255,0.1);
      border-radius: 6px;
      padding: 0.6rem;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }
    
    .close-props-btn {
      width: 100%;
    }
    
    /* ===== RECIPE DETAILS MODAL ===== */
    .recipe-details-modal {
      z-index: 10001;
    }
    
    .recipe-details-content {
      max-width: 500px;
      text-align: center;
      max-height: 80vh;
      overflow-y: auto;
    }
    
    .recipe-details-title {
      color: #c4975a;
      margin-bottom: 1rem;
    }
    
    .recipe-details-image {
      width: 96px;
      height: 96px;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    
    .recipe-ingredients {
      background: rgba(139,69,19,0.1);
      border: 1px solid #8B4513;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      text-align: left;
    }
    
    .recipe-ingredients h4 {
      color: #c4975a;
      margin-bottom: 0.5rem;
    }
    
    .ingredients-text {
      color: #fff;
      font-size: 0.9rem;
      line-height: 1.4;
    }
    
    .recipe-format {
      background: rgba(76,175,80,0.1);
      border: 1px solid #4CAF50;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      text-align: left;
    }
    
    .recipe-format h4 {
      color: #4CAF50;
      margin-bottom: 0.8rem;
      text-align: center;
    }
    
    .format-list {
      font-size: 0.85rem;
      color: #ccc;
    }
    
    .format-list div {
      margin-bottom: 0.5rem;
    }
    
    .recipe-description {
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      padding: 0.8rem;
      margin-bottom: 1rem;
      font-style: italic;
      color: #ccc;
      font-size: 0.85rem;
    }
    
    .close-details-btn {
      width: 100%;
    }
    
    /* ===== RESPONSIVE DESIGN ===== */
    @media (max-width: 768px) {
      .herbalism-content {
        padding: 0.5rem;
        width: 98vw;
      }
      
      .herbalism-title {
        font-size: 1.2rem;
      }
      
      .garden-grid {
        max-width: 270px;
        gap: 0.3rem;
      }
      
      .seed-plot, .fertilizer-slot, .sun-shade-toggle, .empty-grid-cell {
        width: 70px;
        height: 70px;
      }
      
      .planted-seed-image, .planted-fertilizer-image {
        width: 35px;
        height: 35px;
      }
      
      .planted-fertilizer-image {
        width: 32px;
        height: 32px;
      }
      
      .ingredient-image, .recipe-image {
        width: 35px;
        height: 35px;
      }
      
      .items-container {
        max-height: 55px;
      }
      
      .recipes-container {
        max-height: 65px;
      }
      
      .button-container {
        gap: 0.3rem;
      }
      
      .button-container button {
        min-width: 70px;
        padding: 0.4rem 0.8rem;
        font-size: 0.8rem;
      }
    }
    
    @media (max-width: 480px) {
      .garden-grid {
        max-width: 240px;
      }
      
      .seed-plot, .fertilizer-slot, .sun-shade-toggle, .empty-grid-cell {
        width: 65px;
        height: 65px;
      }
      
      .section-title {
        font-size: 0.8rem;
      }
      
      .items-container {
        max-height: 50px;
      }
      
      .craft-result {
        font-size: 0.8rem;
      }
    }
    
    /* ===== ANIMATIONS ===== */
    @keyframes seed-pulse {
      0%, 100% { 
        transform: scale(1); 
      }
      50% { 
        transform: scale(1.1); 
      }
    }
    
    .seed-planted {
      animation: seed-pulse 2s ease-in-out infinite;
    }
    
    @keyframes sparkle {
      0% {
        opacity: 0;
        transform: scale(0);
      }
      50% {
        opacity: 1;
        transform: scale(1.5);
      }
      100% {
        opacity: 0;
        transform: scale(0) translateY(-20px);
      }
    }
    
    .sparkle-effect {
      animation: sparkle 1s ease-out forwards;
    }
    
    @keyframes bloom-pulse {
      0%, 100% {
        transform: translateX(-50%) scale(1);
      }
      50% {
        transform: translateX(-50%) scale(1.2);
      }
    }
    
    .bloom-effect {
      animation: bloom-pulse 1.5s ease-in-out infinite;
    }
    
    /* ===== FOCUS STATES FOR ACCESSIBILITY ===== */
    .seed-plot:focus,
    .fertilizer-slot:focus,
    .sun-shade-toggle:focus,
    .ingredient-item:focus,
    .recipe-card:focus {
      outline: 2px solid #4CAF50;
      outline-offset: 2px;
    }
    
    .remove-btn:focus {
      outline: 2px solid #ffffff;
      outline-offset: 1px;
    }
    
    /* ===== HIGH CONTRAST MODE SUPPORT ===== */
    @media (prefers-contrast: high) {
      .seed-plot,
      .fertilizer-slot,
      .sun-shade-toggle {
        border-width: 3px;
      }
      
      .ingredient-item,
      .recipe-card {
        border: 2px solid currentColor;
      }
      
      .info-icon {
        border: 1px solid white;
      }
    }
    
    /* ===== REDUCED MOTION SUPPORT ===== */
    @media (prefers-reduced-motion: reduce) {
      .seed-plot,
      .fertilizer-slot,
      .sun-shade-toggle,
      .ingredient-item,
      .recipe-card,
      .remove-btn,
      .info-icon {
        transition: none;
      }
      
      .seed-planted,
      .sparkle-effect,
      .bloom-effect {
        animation: none;
      }
    }
  `;

  const style = document.createElement('style');
  style.id = 'herbalism-css';
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
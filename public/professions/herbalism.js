// Improved Herbalism profession module
let context = null;
let herbalismState = null;
let ingredientCache = new Map();

export async function startCraftingSession(ctx) {
  console.log('[HERBALISM] Starting herbalism crafting session...');
  context = ctx;
  
  const { loadingModal, loadingStartTime, updateLoadingProgress, finishLoading } = context;
  
  try {
    updateLoadingProgress(loadingModal, "Accessing your seed vault...", "Loading bank items and recipes...");
    
    const [bankResponse, recipesPromise] = await Promise.all([
      context.apiCall(`/api/supabase/rest/v1/bank?player_id=eq.${context.profile.id}&profession_id=eq.${context.professionId}&select=item,amount`),
      context.fetchRecipes(context.professionId)
    ]);
    
    const bankItems = await bankResponse.json();
    console.log('[HERBALISM] Bank items loaded:', bankItems);
    
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
    
    updateLoadingProgress(loadingModal, "Enriching ingredient data...", "Fetching properties...");
    
    const [enrichedSeeds, enrichedFertilizers] = await Promise.all([
      batchEnrichIngredients(seeds),
      batchEnrichIngredients(fertilizers)
    ]);
    
    const recipes = await recipesPromise;
    
    updateLoadingProgress(loadingModal, "Preparing herb garden...", "Setting up interface...");
    
    herbalismState = {
      professionId: context.professionId,
      professionName: context.professionName,
      availableSeeds: enrichedSeeds,
      availableFertilizers: enrichedFertilizers,
      selectedSeeds: [null, null, null, null],
      selectedFertilizers: [null, null],
      sunShadeSettings: ['sun', 'sun'],
      isCraftingStarted: false,
      results: [null, null, null, null],
      recipes: recipes,
      growthAnimations: []
    };
    
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

async function batchEnrichIngredients(bankItems) {
  console.log('[HERBALISM] Batch enriching ingredients:', bankItems);
  
  if (!bankItems.length) return [];
  
  const ingredientNames = bankItems.map(item => item.item);
  const uniqueNames = [...new Set(ingredientNames)];
  
  const uncachedNames = uniqueNames.filter(name => !ingredientCache.has(name));
  
  if (uncachedNames.length > 0) {
    const namesQuery = uncachedNames.map(name => encodeURIComponent(name)).join(',');
    
    try {
      const response = await context.apiCall(`/api/supabase/rest/v1/ingridients?name=in.(${namesQuery})&select=name,properties,sprite`);
      
      if (!response.ok) {
        return await fallbackEnrichIngredients(bankItems);
      }
      
      const ingredients = await response.json();
      
      ingredients.forEach(ingredient => {
        ingredientCache.set(ingredient.name, ingredient);
      });
      
    } catch (error) {
      console.warn('[HERBALISM] Batch ingredient fetch failed, falling back to individual requests:', error);
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
    } else {
      try {
        const singleRes = await context.apiCall(`/api/supabase/rest/v1/ingridients?name=eq.${encodeURIComponent(item.item)}&select=properties,sprite`);
        if (singleRes.ok) {
          const [singleIngredient] = await singleRes.json();
          if (singleIngredient) {
            enriched.push({
              name: item.item,
              amount: item.amount,
              properties: singleIngredient.properties,
              sprite: singleIngredient.sprite,
            });
            ingredientCache.set(item.item, singleIngredient);
          }
        }
      } catch (singleError) {
        console.warn('[HERBALISM] Failed to single-fetch ingredient:', item.item, singleError);
        enriched.push({
          name: item.item,
          amount: item.amount,
          properties: null,
          sprite: 'default',
        });
      }
    }
  }
  
  return enriched;
}

async function fallbackEnrichIngredients(bankItems) {
  console.log('[HERBALISM] Using fallback enrichment method');
  const enriched = [];
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < bankItems.length; i += BATCH_SIZE) {
    const batch = bankItems.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (item) => {
      try {
        const res = await context.apiCall(`/api/supabase/rest/v1/ingridients?name=eq.${encodeURIComponent(item.item)}&select=properties,sprite`);
        
        if (!res.ok) return null;
        
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
  
  return enriched;
}

function createGardenGridHTML() {
  return `
    <div class="garden-grid">
      <!-- Seed Plots -->
      <div class="seed-plot" data-position="0">
        <span class="plot-label">Seed 1</span>
        <div class="seed-content">
          <span class="drop-text">Drop Seed</span>
        </div>
        <div class="remove-btn" style="display: none;">×</div>
        <div class="growth-animation"></div>
      </div>
      
      <div class="seed-plot" data-position="1">
        <span class="plot-label">Seed 2</span>
        <div class="seed-content">
          <span class="drop-text">Drop Seed</span>
        </div>
        <div class="remove-btn" style="display: none;">×</div>
        <div class="growth-animation"></div>
      </div>
      
      <div class="fertilizer-slot" data-row="0">
        <span class="fertilizer-label">Row 1 Fert.</span>
        <div class="fertilizer-content">
          <span class="drop-text">Drop Fertilizer</span>
        </div>
        <div class="remove-btn" style="display: none;">×</div>
      </div>

      <div class="seed-plot" data-position="2">
        <span class="plot-label">Seed 3</span>
        <div class="seed-content">
          <span class="drop-text">Drop Seed</span>
        </div>
        <div class="remove-btn" style="display: none;">×</div>
        <div class="growth-animation"></div>
      </div>
      
      <div class="seed-plot" data-position="3">
        <span class="plot-label">Seed 4</span>
        <div class="seed-content">
          <span class="drop-text">Drop Seed</span>
        </div>
        <div class="remove-btn" style="display: none;">×</div>
        <div class="growth-animation"></div>
      </div>
      
      <div class="fertilizer-slot" data-row="1">
        <span class="fertilizer-label">Row 2 Fert.</span>
        <div class="fertilizer-content">
          <span class="drop-text">Drop Fertilizer</span>
        </div>
        <div class="remove-btn" style="display: none;">×</div>
      </div>

      <div class="sun-shade-toggle" data-column="0">
        <div class="toggle-icon">☀️</div>
        <div class="toggle-text">Sun</div>
      </div>
      
      <div class="sun-shade-toggle" data-column="1">
        <div class="toggle-icon">☀️</div>
        <div class="toggle-text">Sun</div>
      </div>
      
      <div class="empty-slot"></div>
    </div>
  `;
}

function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="herbalism-modal">
      <h2 class="modal-title">🌱 Crafting: ${herbalismState.professionName}</h2>
            
      <div id="craft-result" class="craft-result">Set up your garden to start growing</div>
      
      <div>${createGardenGridHTML()}</div>
      
      <h3 class="section-title seeds-title">Available Seeds</h3>
      <div id="available-seeds" class="items-container seeds-container">
        ${renderSeedsHTML()}
      </div>
      
      <h3 class="section-title fertilizers-title">Available Fertilizers</h3>
      <div id="available-fertilizers" class="items-container fertilizers-container">
        ${renderFertilizersHTML()}
      </div>
      
      <h3 class="section-title recipes-title">Recipes</h3>
      <div id="available-recipes" class="items-container recipes-container">
        ${renderRecipesHTML()}
      </div>
      
      <div class="button-row">
        <button class="fantasy-button message-ok-btn close-btn">Close</button>
        <button id="grow-btn" class="fantasy-button grow-btn" disabled>🌱 Grow</button>
        <button id="claim-all-btn" class="fantasy-button claim-btn" style="display: none;">Claim All</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  setupModalEventListeners(modal);
}

function renderSeedsHTML() {
  if (!herbalismState.availableSeeds || herbalismState.availableSeeds.length === 0) {
    return '<div class="no-items">No seeds available</div>';
  }
  
  return herbalismState.availableSeeds.map((seed, idx) => `
    <div class="item seed-item" data-index="${idx}">
      <img src="assets/art/ingridients/${seed.sprite}.png" alt="${seed.name}" onerror="this.src='assets/art/ingridients/default.png'">
      <div class="item-amount">x${seed.amount}</div>
      <div class="info-icon" data-seed="${idx}">i</div>
    </div>
  `).join('');
}

function renderFertilizersHTML() {
  if (!herbalismState.availableFertilizers || herbalismState.availableFertilizers.length === 0) {
    return '<div class="no-items">No fertilizers available</div>';
  }
  
  return herbalismState.availableFertilizers.map((fertilizer, idx) => `
    <div class="item fertilizer-item" data-index="${idx}">
      <img src="assets/art/ingridients/${fertilizer.sprite}.png" alt="${fertilizer.name}" onerror="this.src='assets/art/ingridients/default.png'">
      <div class="item-amount">x${fertilizer.amount}</div>
      <div class="info-icon" data-fertilizer="${idx}">i</div>
    </div>
  `).join('');
}

function renderRecipesHTML() {
  if (!herbalismState.recipes || herbalismState.recipes.length === 0) {
    return '<div class="no-items">No recipes available</div>';
  }
  
  return herbalismState.recipes.map((recipe, idx) => `
    <div class="recipe-card" data-recipe="${idx}">
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" onerror="this.src='assets/art/recipes/default.png'">
      <div class="recipe-name">${recipe.name}</div>
      <div class="info-icon" data-recipe="${idx}">i</div>
    </div>
  `).join('');
}

function setupModalEventListeners(modal) {
  const growBtn = modal.querySelector('#grow-btn');
  const claimAllBtn = modal.querySelector('#claim-all-btn');
  const resultDiv = modal.querySelector('#craft-result');

  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
    herbalismState = null;
    ingredientCache.clear();
  });

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

  const gardenGrid = modal.querySelector('.garden-grid');
  gardenGrid.addEventListener('click', (e) => {
    // Handle remove button clicks
    const removeBtn = e.target.closest('.remove-btn');
    if (removeBtn && !herbalismState.isCraftingStarted) {
      const plot = removeBtn.closest('.seed-plot');
      const slot = removeBtn.closest('.fertilizer-slot');
      
      if (plot) {
        const position = parseInt(plot.dataset.position);
        removeSeedFromPlot(position);
      } else if (slot) {
        const row = parseInt(slot.dataset.row);
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

  growBtn.addEventListener('click', () => {
    startGrowthProcess(resultDiv);
  });

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

function handleSeedSelection(seed) {
  const emptySlotIndex = herbalismState.selectedSeeds.findIndex(s => s === null);
  if (emptySlotIndex === -1) return;

  herbalismState.selectedSeeds[emptySlotIndex] = seed;
  
  const plot = document.querySelector(`.seed-plot[data-position="${emptySlotIndex}"]`);
  const content = plot.querySelector('.seed-content');
  const removeBtn = plot.querySelector('.remove-btn');
  
  content.innerHTML = `<img src="assets/art/ingridients/${seed.sprite}.png" alt="${seed.name}" onerror="this.src='assets/art/ingridients/default.png'">`;
  
  plot.classList.add('planted');
  removeBtn.style.display = 'block';
  
  updateGrowButtonState();
}

function handleFertilizerSelection(fertilizer) {
  const emptySlotIndex = herbalismState.selectedFertilizers.findIndex(f => f === null);
  if (emptySlotIndex === -1) return;

  herbalismState.selectedFertilizers[emptySlotIndex] = fertilizer;
  
  const slot = document.querySelector(`.fertilizer-slot[data-row="${emptySlotIndex}"]`);
  const content = slot.querySelector('.fertilizer-content');
  const removeBtn = slot.querySelector('.remove-btn');
  
  content.innerHTML = `<img src="assets/art/ingridients/${fertilizer.sprite}.png" alt="${fertilizer.name}" onerror="this.src='assets/art/ingridients/default.png'">`;
  
  slot.classList.add('filled');
  removeBtn.style.display = 'block';
  
  updateGrowButtonState();
}

function removeSeedFromPlot(position) {
  herbalismState.selectedSeeds[position] = null;
  
  const plot = document.querySelector(`.seed-plot[data-position="${position}"]`);
  const content = plot.querySelector('.seed-content');
  const removeBtn = plot.querySelector('.remove-btn');
  
  content.innerHTML = '<span class="drop-text">Drop Seed</span>';
  plot.classList.remove('planted');
  removeBtn.style.display = 'none';
  
  updateGrowButtonState();
}

function removeFertilizerFromSlot(row) {
  herbalismState.selectedFertilizers[row] = null;
  
  const slot = document.querySelector(`.fertilizer-slot[data-row="${row}"]`);
  const content = slot.querySelector('.fertilizer-content');
  const removeBtn = slot.querySelector('.remove-btn');
  
  content.innerHTML = '<span class="drop-text">Drop Fertilizer</span>';
  slot.classList.remove('filled');
  removeBtn.style.display = 'none';
  
  updateGrowButtonState();
}

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
    toggle.classList.add('shade');
    toggle.classList.remove('sun');
  } else {
    icon.textContent = '☀️';
    text.textContent = 'Sun';
    toggle.classList.add('sun');
    toggle.classList.remove('shade');
  }
  
  if (typeof gsap !== 'undefined') {
    gsap.to(toggle, { scale: 1.1, duration: 0.2, ease: "power2.out", yoyo: true, repeat: 1 });
  }
}

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

async function startGrowthProcess(resultDiv) {
  herbalismState.isCraftingStarted = true;
  
  const growBtn = document.querySelector('#grow-btn');
  const claimAllBtn = document.querySelector('#claim-all-btn');
  
  growBtn.style.display = 'none';
  resultDiv.textContent = 'Seeds are growing...';
  
  const seedsContainer = document.querySelector('#available-seeds');
  const fertilizersContainer = document.querySelector('#available-fertilizers');
  const gardenGrid = document.querySelector('.garden-grid');
  
  seedsContainer.classList.add('disabled');
  fertilizersContainer.classList.add('disabled');
  gardenGrid.classList.add('disabled');
  
  const growthPromises = [];
  herbalismState.selectedSeeds.forEach((seed, index) => {
    if (seed) {
      growthPromises.push(startSeedGrowthAnimation(index, seed));
    }
  });
  
  await Promise.all(growthPromises);
  
  resultDiv.textContent = 'Processing harvest...';
  await processSeedCrafting();
  
  displayFinalResults(resultDiv);
  claimAllBtn.style.display = 'block';
}

async function startSeedGrowthAnimation(position, seed) {
  const plot = document.querySelector(`.seed-plot[data-position="${position}"]`);
  const growthAnimation = plot.querySelector('.growth-animation');
  
  const seedColor = getSeedColor(seed.name);
  
  const stages = [
    { height: '20%', color: 'rgba(34,139,34,0.3)', duration: 0.8 },
    { height: '50%', color: 'rgba(34,139,34,0.5)', duration: 0.8 },
    { height: '80%', color: 'rgba(34,139,34,0.7)', duration: 0.8 },
    { height: '100%', color: seedColor, duration: 0.6 }
  ];
  
  growthAnimation.style.opacity = '1';
  growthAnimation.style.background = 'linear-gradient(to top, rgba(139,69,19,0.8) 0%, transparent 100%)';
  
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
        growthAnimation.style.height = stage.height;
        growthAnimation.style.background = `linear-gradient(to top, ${stage.color} 0%, rgba(139,69,19,0.3) 100%)`;
        setTimeout(resolve, stage.duration * 1000);
      }
    });
    
    if (i < stages.length - 1) {
      createSparkleEffect(plot);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  createBloomEffect(plot, seedColor);
}

function createSparkleEffect(plot) {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle';
      sparkle.style.top = `${Math.random() * 50 + 10}px`;
      sparkle.style.left = `${Math.random() * 50 + 10}px`;
      
      plot.appendChild(sparkle);
      
      if (typeof gsap !== 'undefined') {
        gsap.to(sparkle, {
          scale: 2,
          opacity: 0,
          y: -20,
          duration: 1,
          ease: "power2.out",
          onComplete: () => sparkle.remove()
        });
      } else {
        setTimeout(() => sparkle.remove(), 1000);
      }
    }, i * 150);
  }
}

function createBloomEffect(plot, seedColor) {
  const bloom = document.createElement('div');
  bloom.className = 'bloom';
  bloom.style.background = seedColor;
  bloom.style.boxShadow = `0 0 8px ${seedColor}`;
  
  plot.appendChild(bloom);
  
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(bloom, 
      { scale: 0, opacity: 0 },
      { 
        scale: 1, 
        opacity: 1, 
        duration: 0.6, 
        ease: "back.out(1.7)",
        onComplete: () => {
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

async function craftIndividualSeed(position) {
  const seed = herbalismState.selectedSeeds[position];
  if (!seed) return;
  
  const column = position % 2;
  const row = Math.floor(position / 2);
  
  const environment = herbalismState.sunShadeSettings[column];
  const fertilizerModifier = herbalismState.selectedFertilizers[row];
  
  const craftRequest = {
    player_id: context.profile.id,
    profession_id: herbalismState.professionId,
    seed_name: seed.name,
    environment: environment
  };
  
  if (fertilizerModifier) {
    craftRequest.fertilizer_name = fertilizerModifier.name;
  }
  
  try {
    const craftRes = await context.apiCall('/functions/v1/craft_herbalism', 'POST', craftRequest);
    const craftJson = await craftRes.json();
    herbalismState.results[position] = craftJson;
  } catch (error) {
    console.error(`[HERBALISM] Error crafting seed at position ${position}:`, error);
    herbalismState.results[position] = { success: false, error: 'Crafting failed' };
  }
}

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

function showIngredientProperties(ingredient, type) {
  const propsModal = document.createElement('div');
  propsModal.className = 'custom-message-box';
  propsModal.style.zIndex = '10001';
  
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
  
  const typeColor = type === 'seed' ? '#8B4513' : '#228B22';
  const typeIcon = type === 'seed' ? '🌰' : '🧪';
  
  propsModal.innerHTML = `
    <div class="properties-modal">
      <h3 class="properties-title" style="color: ${typeColor};">${typeIcon} ${ingredient.name}</h3>
      <img src="assets/art/ingridients/${ingredient.sprite}.png" alt="${ingredient.name}" class="ingredient-image" onerror="this.src='assets/art/ingridients/default.png'">
      
      <div class="properties-content" style="border-color: ${typeColor};">
        <h4 style="color: ${typeColor};">Properties:</h4>
        ${propertiesDisplay}
      </div>
      
      <div class="ingredient-amount">
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
    <div class="recipe-modal">
      <h3 class="recipe-title">📜 ${recipe.name}</h3>
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" class="recipe-image" onerror="this.src='assets/art/recipes/default.png'">
      
      <div class="recipe-ingredients">
        <h4>Required Combination:</h4>
        <div class="ingredients-list">${ingredientsList}</div>
      </div>
      
      <div class="recipe-format">
        <h4>Herbalism Recipe Format:</h4>
        <div class="format-items">
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

function getSeedColor(seedName) {
  const colors = {
    'Wheat Seed': 'rgba(218, 165, 32, 0.8)',
    'Carrot Seed': 'rgba(255, 140, 0, 0.8)',
    'Tomato Seed': 'rgba(255, 99, 71, 0.8)',
    'Lettuce Seed': 'rgba(144, 238, 144, 0.8)',
    'Potato Seed': 'rgba(160, 82, 45, 0.8)',
    'Corn Seed': 'rgba(255, 215, 0, 0.8)',
    'Blue Seed': 'rgba(30, 144, 255, 0.8)',
    'Red Seed': 'rgba(220, 20, 60, 0.8)',
    'default': 'rgba(76, 175, 80, 0.8)'
  };

  const seedKey = Object.keys(colors).find(key => {
    const keyLower = key.toLowerCase();
    const seedLower = seedName.toLowerCase();
    return seedLower.includes(keyLower.replace(' seed', '')) || keyLower === seedLower;
  });

  return seedKey ? colors[seedKey] : colors.default;
}

function injectHerbalismCSS() {
  if (document.getElementById('herbalism-css')) return;
  
  const css = `
    .herbalism-modal {
      width: 95%;
      max-width: 900px;
      max-height: 95vh;
      overflow-y: auto;
      text-align: center;
    }

    .modal-title {
      margin: 0.4rem 0;
      color: #228B22;
      font-size: 1.2rem;
    }

    .craft-result {
      margin: 0.4rem 0;
      font-weight: bold;
      min-height: 18px;
      font-size: 0.9rem;
    }

    .garden-grid {
      display: grid;
      grid-template-columns: repeat(3, 60px);
      grid-template-rows: repeat(3, 60px);
      gap: 0.6rem;
      max-width: 240px;
      margin: 0.6rem auto;
      justify-content: center;
    }

    .seed-plot, .fertilizer-slot {
      width: 60px;
      height: 60px;
      border: 2px dashed #8B4513;
      border-radius: 6px;
      background: linear-gradient(to bottom, #654321 0%, #8B4513 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      transition: all 0.3s ease;
    }

    .fertilizer-slot {
      border-color: #228B22;
      background: linear-gradient(to bottom, rgba(34,139,34,0.2) 0%, rgba(34,139,34,0.4) 100%);
    }

    .seed-plot.planted {
      border: 2px solid #228B22;
      background: linear-gradient(to bottom, #654321 0%, rgba(34,139,34,0.3) 100%);
    }

    .fertilizer-slot.filled {
      border: 2px solid #32CD32;
      background: linear-gradient(to bottom, rgba(34,139,34,0.3) 0%, rgba(34,139,34,0.5) 100%);
    }

    .seed-plot.success {
      box-shadow: 0 0 12px rgba(76, 175, 80, 0.6);
    }

    .seed-plot.failure .growth-animation {
      background: linear-gradient(to top, rgba(139,69,19,0.8) 0%, rgba(139,69,19,0.4) 100%) !important;
    }

    .plot-label, .fertilizer-label {
      color: #D2B48C;
      font-size: 0.6rem;
      position: absolute;
      top: 1px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.6);
      padding: 1px 3px;
      border-radius: 3px;
      white-space: nowrap;
    }

    .fertilizer-label {
      color: #90EE90;
    }

    .seed-content, .fertilizer-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }

    .drop-text {
      color: #D2B48C;
      font-size: 0.6rem;
      text-align: center;
    }

    .fertilizer-content .drop-text {
      color: #90EE90;
    }

    .seed-content img, .fertilizer-content img {
      width: 36px;
      height: 36px;
      border-radius: 3px;
    }

    .remove-btn {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 16px;
      height: 16px;
      background: #dc3545;
      color: white;
      border: none;
      border-radius: 50%;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      transition: all 0.2s ease;
    }

    .remove-btn:hover {
      background: #c82333;
      transform: scale(1.1);
    }

    .growth-animation {
      position: absolute;
      inset: 0;
      border-radius: 4px;
      overflow: hidden;
      opacity: 0;
      will-change: height, background;
    }

    .sun-shade-toggle {
      width: 60px;
      height: 60px;
      border: 2px solid #FFA500;
      border-radius: 6px;
      background: linear-gradient(to bottom, rgba(255,165,0,0.2) 0%, rgba(255,165,0,0.4) 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .sun-shade-toggle.shade {
      border-color: #228B22;
      background: linear-gradient(to bottom, rgba(34,139,34,0.2) 0%, rgba(34,139,34,0.4) 100%);
    }

    .toggle-icon {
      font-size: 1.2rem;
      margin-bottom: 2px;
    }

    .toggle-text {
      font-size: 0.6rem;
      color: #FFA500;
      font-weight: bold;
    }

    .sun-shade-toggle.shade .toggle-text {
      color: #228B22;
    }

    .empty-slot {
      width: 60px;
      height: 60px;
    }

    .section-title {
      margin: 0.4rem 0 0.3rem 0;
      font-size: 0.9rem;
    }

    .seeds-title {
      color: #8B4513;
    }

    .fertilizers-title {
      color: #228B22;
    }

    .recipes-title {
      color: #4CAF50;
    }

    .items-container {
      display: flex;
      overflow-x: auto;
      gap: 0.3rem;
      padding: 3px;
      margin-bottom: 0.4rem;
      border: 1px solid;
      border-radius: 4px;
      scrollbar-width: none;
      max-height: 60px;
    }

    .items-container::-webkit-scrollbar {
      display: none;
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

    .item, .recipe-card {
      flex: 0 0 auto;
      cursor: pointer;
      position: relative;
      border-radius: 3px;
      padding: 2px;
      min-width: 44px;
      text-align: center;
    }

    .seed-item {
      background: rgba(139,69,19,0.1);
    }

    .fertilizer-item {
      background: rgba(34,139,34,0.1);
    }

    .recipe-card {
      background: rgba(139,69,19,0.2);
      border: 1px solid #8B4513;
      padding: 4px;
      min-width: 60px;
    }

    .item img, .recipe-card img {
      width: 36px;
      height: 36px;
      border-radius: 2px;
    }

    .item-amount {
      font-size: 0.65rem;
      margin-top: 1px;
    }

    .seed-item .item-amount {
      color: #8B4513;
    }

    .fertilizer-item .item-amount {
      color: #228B22;
    }

    .recipe-name {
      font-size: 0.65rem;
      margin-top: 2px;
      color: #c4975a;
      font-weight: bold;
      line-height: 1.1;
    }

    .info-icon {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 12px;
      height: 12px;
      background: #8B4513;
      border-radius: 50%;
      color: white;
      font-size: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-weight: bold;
    }

    .fertilizer-item .info-icon {
      background: #228B22;
    }

    .recipe-card .info-icon {
      background: #4CAF50;
    }

    .no-items {
      color: #666;
      font-style: italic;
      padding: 0.6rem;
      font-size: 0.8rem;
      text-align: center;
    }

    .button-row {
      display: flex;
      justify-content: center;
      gap: 0.3rem;
      margin-top: 0.6rem;
    }

    .close-btn, .grow-btn, .claim-btn {
      flex: 1;
      max-width: 90px;
      padding: 0.4rem;
      font-size: 0.85rem;
    }

    .sparkle {
      position: absolute;
      width: 3px;
      height: 3px;
      background: #FFD700;
      border-radius: 50%;
      pointer-events: none;
      z-index: 20;
    }

    .bloom {
      position: absolute;
      top: 20%;
      left: 50%;
      transform: translateX(-50%);
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid #FFD700;
      z-index: 25;
    }

    .properties-modal, .recipe-modal {
      max-width: 350px;
      text-align: center;
      max-height: 80vh;
      overflow-y: auto;
    }

    .properties-title {
      margin-bottom: 0.8rem;
      font-size: 1.1rem;
    }

    .recipe-title {
      color: #c4975a;
      margin-bottom: 0.8rem;
      font-size: 1.1rem;
    }

    .ingredient-image, .recipe-image {
      width: 64px;
      height: 64px;
      border-radius: 6px;
      margin-bottom: 0.8rem;
    }

    .properties-content, .recipe-ingredients, .recipe-format {
      background: rgba(0,0,0,0.3);
      border: 1px solid;
      border-radius: 6px;
      padding: 0.8rem;
      margin-bottom: 0.8rem;
      text-align: left;
    }

    .properties-content h4, .recipe-ingredients h4, .recipe-format h4 {
      text-align: center;
      margin-bottom: 0.6rem;
      font-size: 0.95rem;
    }

    .recipe-ingredients h4 {
      color: #c4975a;
    }

    .recipe-format h4 {
      color: #4CAF50;
    }

    .property-item {
      background: rgba(76,175,80,0.2);
      padding: 0.4rem;
      border-radius: 3px;
      margin-bottom: 0.3rem;
      font-size: 0.85rem;
    }

    .no-properties {
      color: #999;
      font-style: italic;
      text-align: center;
      padding: 0.4rem;
    }

    .ingredients-list {
      color: #fff;
      font-size: 0.85rem;
      line-height: 1.4;
    }

    .format-items div {
      font-size: 0.8rem;
      color: #ccc;
      margin-bottom: 0.4rem;
    }

    .ingredient-amount {
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      padding: 0.5rem;
      margin-bottom: 0.8rem;
      font-size: 0.85rem;
    }

    .recipe-description {
      background: rgba(0,0,0,0.2);
      border-radius: 6px;
      padding: 0.6rem;
      margin-bottom: 0.8rem;
      font-style: italic;
      color: #ccc;
      font-size: 0.8rem;
    }

    .close-props-btn, .close-details-btn {
      width: 100%;
    }

    .seed-plot:hover, .fertilizer-slot:hover, .sun-shade-toggle:hover {
      transform: translateY(-1px);
    }

    .garden-grid.disabled {
      pointer-events: none;
    }
  `;

  const style = document.createElement('style');
  style.id = 'herbalism-css';
  style.textContent = css;
  document.head.appendChild(style);
}

export function clearIngredientCache() {
  ingredientCache.clear();
}

export function preloadIngredients(ingredientNames) {
  return batchEnrichIngredients(ingredientNames.map(name => ({ item: name, amount: 1 })));
}
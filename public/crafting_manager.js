let _main;
let _apiCall;
let _getCurrentProfile;
let _getCurrentSession;
let _profile;
let _session;

let craftingState = null;

export async function loadModule(main, { apiCall, getCurrentProfile, getCurrentSession }) {
  console.log('[CRAFTING] --- Starting loadModule for Crafting Manager ---');
  _main = main;
  _apiCall = apiCall;
  _getCurrentProfile = getCurrentProfile;
  _getCurrentSession = getCurrentSession;

   _profile = _getCurrentProfile();
   _session = currentSession || getCurrentSession();
  console.log('[DEBUG] Profile:', _profile);
  console.log('[DEBUG] Session:', _session);

  if (!_profile || !_session) {
    console.error('[CRAFTING] No profile or session found. Redirecting to login.');
    displayMessage('User session not found. Please log in again.');
    window.gameAuth.loadModule('login');
    return;
  }

  _main.innerHTML = `
    <div class="main-app-container">
      <div class="particles"></div>
      <div class="character-creation-section"></div>
    </div>
  `;

  createParticles();
  await fetchAndRenderProfessions();
  console.log('[CRAFTING] --- loadModule for Crafting Manager finished ---');
}

async function fetchAndRenderProfessions() {
  console.log('[CRAFTING] Fetching player characters with professions...');
  try {
    const response = await _apiCall(
      `/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=*,races(name),classes(name),professions(id,name)`
    );
    const characters = await response.json();
    console.log('[CRAFTING] Characters fetched:', characters);

    renderProfessions(characters);
  } catch (error) {
    console.error('[CRAFTING] Error fetching professions:', error);
    displayMessage('Failed to load professions. Please try again.');
  }
}

function renderProfessions(characters) {
  const section = _main.querySelector('.character-creation-section');

  section.innerHTML = `
    <div class="art-header">
      <h1>Your Crafting Professions</h1>
      <p class="subtitle">Select a profession to view recipes or start crafting.</p>
    </div>
    <div class="selection-section">
      <div class="profession-selection-grid">
        ${characters
          .filter(c => c.professions?.name)
          .map(professionCardHTML)
          .join('')}
      </div>
    </div>
    <div class="confirm-return-buttons">
      <button class="fantasy-button return-btn">Return</button>
    </div>
  `;

  section.querySelector('.return-btn').addEventListener('click', () => {
    window.gameAuth.loadModule('castle');
  });

  section.querySelectorAll('.recipes-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const profName = btn.dataset.profession;
      const profId = btn.dataset.professionId;

      try {
        const recipes = await fetchRecipes(profId);
        showRecipesModal(recipes, profName);
      } catch (err) {
        console.error('[CRAFTING] Failed to load recipes:', err);
        displayMessage(`Failed to load recipes for ${profName}`);
      }
    });
  });

  section.querySelectorAll('.craft-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const profName = btn.dataset.profession;
      const profId = btn.dataset.professionId;

      try {
        await startCraftingSession(profId, profName);
      } catch (err) {
        console.error('[CRAFTING] Failed to start crafting session:', err);
        displayMessage(`Failed to start crafting for ${profName}`);
      }
    });
  });
}

function professionCardHTML(character) {
  const profName = character.professions?.name || 'Unknown';
  const profId = character.professions?.id || 0;
  return `
    <div class="selection-card">
      <div class="card-info-block">
        <img src="assets/art/professions/${profName.toLowerCase().replace(/\s+/g, '_')}.png" alt="${profName}" style="width:64px;height:64px;">
        <h3 class="card-name">${profName}</h3>
        <p class="card-description">Character: ${character.name}</p>
        <div class="confirm-return-buttons">
          <button class="fantasy-button recipes-btn" data-profession="${profName}" data-profession-id="${profId}">
            Recipes
          </button>
          <button class="fantasy-button craft-btn" data-profession="${profName}" data-profession-id="${profId}">
            Craft
          </button>
        </div>
      </div>
    </div>
  `;
}

async function fetchRecipes(professionId) {
  const response = await _apiCall(
    `/api/supabase/rest/v1/recipes?profession_id=eq.${professionId}&select=name,ingridients,sprite`
  );
  return await response.json();
}

function showRecipesModal(recipes, professionName) {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content scrollable-modal">
      <h2>${professionName} Recipes</h2>
      ${recipes.length === 0
        ? '<p>No recipes found.</p>'
        : recipes.map(recipeHTML).join('')}
      <button class="fantasy-button message-ok-btn">Close</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
  });
}

function recipeHTML(recipe) {
  const ingridients = Array.isArray(recipe.ingridients)
    ? recipe.ingridients.join(', ')
    : JSON.stringify(recipe.ingridients);
  return `
    <div style="margin-bottom: 1.5rem; text-align: left;">
      <strong>${recipe.name}</strong><br/>
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 64px; height: 64px;"><br/>
      <span><strong>ingridients:</strong> ${ingridients}</span>
    </div>
  `;
}

async function startCraftingSession(professionId, professionName) {
  const response = await _apiCall(
    `/api/supabase/rest/v1/bank?player_id=eq.${_profile.id}&profession_id=eq.${professionId}&select=item,amount`
  );
  const bankItems = await response.json();

  const enriched = [];
  for (const item of bankItems) {
    const res = await _apiCall(
      `/api/supabase/rest/v1/ingridients?name=eq.${encodeURIComponent(item.item)}&select=properties,sprite`
    );
    const [ingridient] = await res.json();
    if (ingridient) {
      enriched.push({
        name: item.item,
        amount: item.amount,
        properties: ingridient.properties,
        sprite: ingridient.sprite,
      });
    }
  }

  craftingState = {
    professionId,
    professionName,
    availableHerbs: enriched,
    selectedHerbs: [null, null, null],
    randomizedProperties: [[], [], []],
    originalProperties: [[], [], []],
    currentAdjustedCol: null,
    isCraftingStarted: false,
    result: null,
    adjustmentCount: 0,
    maxAdjustments: 3,
    enrichedHerbs: null,
    recipes: null
  };

  renderCraftingModal();
}

function createCraftingSlotHTML(slotIndex) {
  return `
    <div class="crafting-column" data-slot="${slotIndex}" style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
      <!-- Herb Slot -->
      <div class="herb-slot" style="width: 80px; height: 80px; border: 2px dashed #aaa; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2);">
        <span style="color: #666; font-size: 0.8rem;">Drop Herb</span>
      </div>
      
      <!-- Up Arrow -->
      <div class="arrow-up">
        <button class="fantasy-button adjust-up" data-col="${slotIndex}" style="padding: 0.2rem 0.5rem; font-size: 1.2rem; opacity: 0.3;" disabled>↑</button>
      </div>
      
      <!-- Properties Bottle -->
      <div class="properties-bottle" style="width: 60px; height: 120px; border: 2px solid #8B4513; border-radius: 10px 10px 20px 20px; background: linear-gradient(to bottom, rgba(139,69,19,0.1) 0%, rgba(139,69,19,0.3) 100%); display: flex; flex-direction: column; justify-content: space-around; align-items: center; position: relative;">
        <!-- Bottle Cork/Top -->
        <div style="position: absolute; top: -8px; width: 20px; height: 16px; background: #8B4513; border-radius: 4px 4px 0 0;"></div>
        
        <!-- Property Slots -->
        <div class="property-slot prop-top" data-slot="${slotIndex}" data-position="0" style="width: 40px; height: 25px; border: 1px solid #666; border-radius: 4px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: #c4975a;">
          -
        </div>
        <div class="property-slot prop-middle" data-slot="${slotIndex}" data-position="1" style="width: 40px; height: 25px; border: 1px solid #666; border-radius: 4px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: #c4975a;">
          -
        </div>
        <div class="property-slot prop-bottom" data-slot="${slotIndex}" data-position="2" style="width: 40px; height: 25px; border: 1px solid #666; border-radius: 4px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: #c4975a;">
          -
        </div>
      </div>
      
      <!-- Down Arrow -->
      <div class="arrow-down">
        <button class="fantasy-button adjust-down" data-col="${slotIndex}" style="padding: 0.2rem 0.5rem; font-size: 1.2rem; opacity: 0.3;" disabled>↓</button>
      </div>
    </div>
  `;
}

function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 1400px; max-height: 99vh; overflow-y: auto; text-align: center;">
      <h2>Crafting: ${craftingState.professionName}</h2>
            
      <!-- Result display (initially shows selection prompt) -->
      <div id="craft-result" style="margin-top: 4px;font-weight:bold;">Select 3 herbs to start crafting</div>
      
      <!-- Adjustment counter at the top -->
      <div id="adjustment-counter" style="margin-top: 0.5rem; font-size: 0.9rem; color: #666; display: none;">
        Adjustments: ${craftingState.adjustmentCount}/${craftingState.maxAdjustments}
      </div>
      
      <!-- Main crafting area -->
      <div id="crafting-slots" style="display: flex; justify-content: center; gap: 1rem; margin-bottom: 5px;">
        ${[0,1,2].map(i => createCraftingSlotHTML(i)).join('')}
      </div>
      
      <!-- Bank row (horizontal scrollable) -->
      <h3>Available Herbs</h3>
      <div id="available-herbs" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; margin-bottom: 5pxrem; border: 1px solid #444; border-radius: 8px; background: rgba(0,0,0,0.1); scrollbar-width: none;">
        ${craftingState.availableHerbs.map((herb, idx) => `
          <div class="herb" data-index="${idx}" style="flex: 0 0 auto; cursor:pointer; position: relative; border-radius: 4px; padding: 4px; background: rgba(255,255,255,0.05);">
            <img src="assets/art/ingridients/${herb.sprite}.png" title="${herb.name} (${herb.amount})" style="width:48px;height:48px;">
            <div style="font-size:0.8rem;">x${herb.amount}</div>
            <div class="info-icon" data-herb="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #4CAF50; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
          </div>
        `).join('')}
      </div>
      
      <!-- Recipes row (horizontal scrollable) -->
      <h3>Recipes</h3>
      <div id="available-recipes" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; margin-bottom: 1rem; border: 1px solid #444; border-radius: 8px; background: rgba(139,69,19,0.1); scrollbar-width: none;">
        <!-- Will be populated by loadRecipesIntoModal() -->
      </div>
      
      <!-- Button row -->
      <div style="display: flex; justify-content: center; gap: 0.5rem;">
        <button class="fantasy-button message-ok-btn" style="flex: 1; max-width: 100px;">Close</button>
        <button id="craft-btn" class="fantasy-button" disabled style="flex: 1; max-width: 100px;">Craft</button>
        <button id="finish-btn" class="fantasy-button" disabled style="flex: 1; max-width: 100px; display: none;">Finish</button>
        <button id="claim-btn" class="fantasy-button" style="flex: 1; max-width: 100px; display: none;">Claim</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  setupModalEventListeners(modal);
  loadRecipesIntoModal(modal);
}

async function loadRecipesIntoModal(modal) {
  try {
    const recipes = await fetchRecipes(craftingState.professionId);
    const recipesContainer = modal.querySelector('#available-recipes');
    
    if (recipes.length === 0) {
      recipesContainer.innerHTML = '<div style="color: #666; font-style: italic; padding: 1rem;">No recipes available</div>';
      return;
    }
    
    recipesContainer.innerHTML = recipes.map((recipe, idx) => `
      <div class="recipe-card" data-recipe="${idx}" style="flex: 0 0 auto; cursor: pointer; border-radius: 8px; padding: 8px; background: rgba(139,69,19,0.2); border: 1px solid #8B4513; min-width: 80px; text-align: center; position: relative;">
        <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 48px; height: 48px; border-radius: 4px;">
        <div style="font-size: 0.8rem; margin-top: 4px; color: #c4975a; font-weight: bold;">${recipe.name}</div>
        <div class="info-icon" data-recipe="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #4CAF50; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
      </div>
    `).join('');
    
    // Store recipes in craftingState for reference
    craftingState.recipes = recipes;
    
    // Add click handlers for recipes
    recipesContainer.querySelectorAll('.info-icon').forEach(icon => {
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        const recipeIdx = parseInt(icon.dataset.recipe);
        showRecipeDetails(recipes[recipeIdx]);
      });
    });
    
    // Also allow clicking anywhere on the card
    recipesContainer.querySelectorAll('.recipe-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('info-icon')) {
          const recipeIdx = parseInt(card.dataset.recipe);
          showRecipeDetails(recipes[recipeIdx]);
        }
      });
    });
    
  } catch (error) {
    console.error('[CRAFTING] Failed to load recipes:', error);
    const recipesContainer = modal.querySelector('#available-recipes');
    recipesContainer.innerHTML = '<div style="color: #ff6b6b; padding: 1rem;">Failed to load recipes</div>';
  }
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
    <div class="message-content" style="max-width: 400px; text-align: center;">
      <h3 style="color: #c4975a; margin-bottom: 1rem;">${recipe.name}</h3>
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 96px; height: 96px; border-radius: 8px; margin-bottom: 1rem;">
      
      <div style="background: rgba(139,69,19,0.1); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
        <h4 style="color: #c4975a; margin-bottom: 0.5rem;">Required Ingredients:</h4>
        <div style="color: #fff; font-size: 0.9rem; line-height: 1.4;">${ingredientsList}</div>
      </div>
      
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
  const herb = craftingState.availableHerbs[herbIndex];
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
    <div class="message-content" style="max-width: 350px; text-align: center;">
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

function setupModalEventListeners(modal) {
  const columns = modal.querySelectorAll('.crafting-column');
  const herbs = modal.querySelectorAll('.herb');
  const craftBtn = modal.querySelector('#craft-btn');
  const finishBtn = modal.querySelector('#finish-btn');
  const resultDiv = modal.querySelector('#craft-result');
  const adjustmentCounter = modal.querySelector('#adjustment-counter');

  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
    craftingState = null;
  });

  herbs.forEach(herbEl => {
    herbEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('info-icon')) return;
      if (craftingState.isCraftingStarted) return;
      
      const idx = +herbEl.dataset.index;
      const herb = craftingState.availableHerbs[idx];

      const slotIdx = craftingState.selectedHerbs.findIndex(s => s === null);
      if (slotIdx === -1) return;

      craftingState.selectedHerbs[slotIdx] = herb;
      
      const column = columns[slotIdx];
      const herbSlot = column.querySelector('.herb-slot');
      herbSlot.innerHTML = `
        <img src="assets/art/ingridients/${herb.sprite}.png" style="width:64px;height:64px;cursor:pointer;" title="Click to remove ${herb.name}">
      `;
      herbSlot.style.border = '2px solid #4CAF50';
      herbSlot.style.background = 'rgba(76, 175, 80, 0.1)';
      
      herbSlot.addEventListener('click', () => {
        if (craftingState.isCraftingStarted) return;
        craftingState.selectedHerbs[slotIdx] = null;
        herbSlot.innerHTML = '<span style="color: #666; font-size: 0.8rem;">Drop Herb</span>';
        herbSlot.style.border = '2px dashed #aaa';
        herbSlot.style.background = 'rgba(0,0,0,0.2)';
        updateCraftButtonState();
      });
      
      updateCraftButtonState();
    });
  });

  modal.querySelectorAll('.info-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      if (icon.dataset.herb) {
        const herbIndex = parseInt(icon.dataset.herb);
        showHerbProperties(herbIndex);
      }
    });
  });

  craftBtn.addEventListener('click', () => {
    craftingState.isCraftingStarted = true;
    resultDiv.textContent = 'Crafting...';
    craftBtn.style.display = 'none';
    finishBtn.style.display = 'block';
    finishBtn.disabled = false;
    adjustmentCounter.style.display = 'block';

    herbs.forEach(herb => {
      herb.style.opacity = '0.5';
      herb.style.pointerEvents = 'none';
    });

    startSlotAnimation(resultDiv, modal);
  });

  finishBtn.addEventListener('click', () => {
    finishBtn.disabled = true;
    patchAndSendCraftRequest(resultDiv);
  });

  function updateCraftButtonState() {
    if (craftingState.selectedHerbs.every(h => h !== null)) {
      craftBtn.disabled = false;
      resultDiv.textContent = 'Ready to craft!';
    } else {
      craftBtn.disabled = true;
      resultDiv.textContent = 'Select 3 herbs to start crafting';
    }
  }
}

async function startSlotAnimation(resultDiv, modal) {
  const slotArea = modal.querySelector('#crafting-slots');
  resultDiv.textContent = 'Verifying ingridients...';

  const selectedHerbNames = craftingState.selectedHerbs.map(h => h.name);

  try {
    const reserveRes = await fetch('/functions/v1/reserve_ingredients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_session.access_token}`,
      },
      body: JSON.stringify({
        player_id: _profile.id,
        profession_id: craftingState.professionId,
        selected_ingredients: selectedHerbNames,
      }),
    });

    const reserveJson = await reserveRes.json();
    if (!reserveRes.ok || !reserveJson.success || !Array.isArray(reserveJson.herbs)) {
      console.error('[CRAFTING] Reservation failed:', reserveJson);
      resultDiv.textContent = `Herb verification failed: ${reserveJson?.error || 'Unknown error'}`;
      return;
    }

    craftingState.enrichedHerbs = reserveJson.herbs;

    craftingState.enrichedHerbs.forEach((herb, idx) => {
      const column = slotArea.children[idx];
      const props = Object.values(herb.properties);
      
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
      bottle.style.background = 'linear-gradient(to bottom, rgba(139,69,19,0.2) 0%, rgba(139,69,19,0.4) 100%)';
      bottle.style.boxShadow = '0 0 10px rgba(139,69,19,0.5)';
    });

    craftingState.randomizedProperties = craftingState.enrichedHerbs.map(h => Object.values(h.properties));
    craftingState.originalProperties = craftingState.randomizedProperties.map(p => [...p]);
    craftingState.currentAdjustedCol = null;

    craftingState.adjustments = {};
    for (let i = 0; i < 3; i++) {
      craftingState.adjustments[i] = { up: 0, down: 0 };
    }

    enableAdjustment(slotArea, resultDiv);
    resultDiv.textContent = 'You may now apply adjustments.';
  } catch (err) {
    console.error('[CRAFTING] Error during reservation:', err);
    resultDiv.textContent = 'Server error while verifying ingridients.';
  }
}

async function patchAndSendCraftRequest(resultDiv) {
  try {
    const adjustments = [];
    for (const [colIdx, adj] of Object.entries(craftingState.adjustments || {})) {
      if (adj.up > 0) {
        adjustments.push({ bottle: Number(colIdx), direction: 'up', count: adj.up });
      }
      if (adj.down > 0) {
        adjustments.push({ bottle: Number(colIdx), direction: 'down', count: adj.down });
      }
    }

    function normalizeProps(input) {
      if (Array.isArray(input)) {
        const keys = ['a', 'b', 'c'];
        const result = {};
        for (let i = 0; i < keys.length; i++) {
          result[keys[i]] = input[i] ?? 0;
        }
        return result;
      }
      return {
        a: input.a ?? 0,
        b: input.b ?? 0,
        c: input.c ?? 0
      };
    }

    const normalizedHerbs = (craftingState.enrichedHerbs || []).map(h => ({
      ...h,
      properties: normalizeProps(h.properties)
    }));

    const payload = {
      player_id: _profile.id,
      profession_id: craftingState.professionId,
      selected_ingredients: craftingState.selectedHerbs.map(h => h.name),
      adjustments,
      enriched_herbs: normalizedHerbs
    };

    console.log('[CRAFTING] Sending craft request payload:', payload);

    const res = await fetch('/functions/v1/craft_alchemy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_session.access_token}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();

    const claimBtn = document.querySelector('#claim-btn');

    if (json.success) {
      craftingState.result = json.crafted.name;
      resultDiv.innerHTML = `
        <span style="color:lime;">✅ You crafted: <strong>${json.crafted.name}</strong>!</span>
      `;

      if (claimBtn) {
        claimBtn.style.display = 'block';
        claimBtn.disabled = false;
        claimBtn.addEventListener('click', () => {
          displayMessage(`${json.crafted.name} added to your bank (server-side)`);
          document.querySelector('.custom-message-box')?.remove();
          craftingState = null;
        });
      }
    } else {
      craftingState.result = 'Failed';
      resultDiv.innerHTML = `
        <span style="color:red; display:block; margin-bottom: 0.5rem;">❌ Failed Mixture — ingredients wasted.</span>
        <div style="display: flex; justify-content: center; gap: 0.5rem;">
          <button class="fantasy-button" id="craft-again" style="flex: 1; max-width: 120px;">Craft Again</button>
          <button class="fantasy-button message-ok-btn" style="flex: 1; max-width: 120px;">Close</button>
        </div>
      `;

      if (claimBtn) {
        claimBtn.style.display = 'none';
      }

      document.querySelector('#craft-again').addEventListener('click', () => {
        document.querySelector('.custom-message-box')?.remove();
        startCraftingSession(craftingState.professionId, craftingState.professionName);
      });

      document.querySelector('.message-ok-btn').addEventListener('click', () => {
        document.querySelector('.custom-message-box')?.remove();
        craftingState = null;
      });
    }
  } catch (err) {
    console.error('[CRAFTING] Server error:', err);
    resultDiv.textContent = 'Crafting failed. Try again later.';
  }
}

function enableAdjustment(slotArea, resultDiv) {
  slotArea.querySelectorAll('.adjust-up').forEach(btn =>
    btn.addEventListener('click', () => handleAdjustment(+btn.dataset.col, 'up', resultDiv))
  );
  slotArea.querySelectorAll('.adjust-down').forEach(btn =>
    btn.addEventListener('click', () => handleAdjustment(+btn.dataset.col, 'down', resultDiv))
  );
}

function handleAdjustment(colIdx, direction, resultDiv) {
  if (craftingState.adjustmentCount >= craftingState.maxAdjustments) {
    resultDiv.textContent = `No more adjustments available (${craftingState.maxAdjustments}/${craftingState.maxAdjustments}).`;
    return;
  }

  const props = craftingState.randomizedProperties[colIdx];

  if (!craftingState.adjustments[colIdx]) {
    craftingState.adjustments[colIdx] = { up: 0, down: 0 };
  }

  if (direction === 'up') {
    props.push(props.shift());
    craftingState.adjustments[colIdx].up++;
  } else {
    props.unshift(props.pop());
    craftingState.adjustments[colIdx].down++;
  }

  updateSlotColumn(colIdx);

  craftingState.adjustmentCount++;
  updateAdjustmentCounter();

  if (craftingState.adjustmentCount >= craftingState.maxAdjustments) {
    disableAdjustmentButtons();
  }
}

function updateSlotColumn(colIdx) {
  const props = craftingState.randomizedProperties[colIdx];
  const slotArea = document.querySelector('#crafting-slots');
  const column = slotArea.children[colIdx];
  const propertySlots = column.querySelectorAll('.property-slot');
  
  propertySlots[0].textContent = props[0];
  propertySlots[1].textContent = props[1];
  propertySlots[2].textContent = props[2];
  
  const bottle = column.querySelector('.properties-bottle');
  bottle.style.animation = 'none';
  bottle.offsetHeight;
  bottle.style.animation = 'bottle-shake 0.3s ease-in-out';
}

function updateAdjustmentCounter() {
  const counter = document.querySelector('#adjustment-counter');
  if (counter) {
    counter.textContent = `Adjustments: ${craftingState.adjustmentCount}/${craftingState.maxAdjustments}`;
    if (craftingState.adjustmentCount >= craftingState.maxAdjustments) {
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

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createParticles() {
  const particlesContainer = _main.querySelector('.particles');
  if (!particlesContainer) return;

  particlesContainer.innerHTML = '';
  const particleCount = 20;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 6 + 's';
    particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
    particlesContainer.appendChild(particle);
  }
}

function displayMessage(message) {
  const messageBox = document.createElement('div');
  messageBox.className = 'custom-message-box';
  messageBox.innerHTML = `
    <div class="message-content">
      <p>${message}</p>
      <button class="fantasy-button message-ok-btn">OK</button>
    </div>
  `;
  document.body.appendChild(messageBox);

  messageBox.querySelector('.message-ok-btn').addEventListener('click', () => {
    messageBox.remove();
  });
}

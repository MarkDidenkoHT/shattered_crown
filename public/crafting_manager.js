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
      <div class="selection-grid">
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
    enrichedHerbs: null
  };

  renderCraftingModal();
}

function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 1400px; max-height: 90vh; overflow-y: auto; text-align: center;">
      <h2>Crafting: ${craftingState.professionName}</h2>
      <div style="display: flex; gap: 1rem; justify-content: space-between;">
        <div style="flex: 1;">
          <h3>Selected Ingridients</h3>
          <div id="crafting-slots" style="display: flex; justify-content: center; gap: 1rem; margin-bottom: 1rem;">
            ${[0,1,2].map(i => `
              <div class="craft-slot" data-slot="${i}" style="width:64px;height:64px;border:2px dashed #aaa;"></div>
            `).join('')}
          </div>
          <button id="craft-btn" class="fantasy-button" disabled>Craft</button>
          <div id="adjustment-counter" style="margin-top: 0.5rem; font-size: 0.9rem; color: #666;">
            Adjustments: ${craftingState.adjustmentCount}/${craftingState.maxAdjustments}
          </div>
        </div>

        <div style="flex: 1; text-align: left;">
          <h3>Available Herbs</h3>
          <div id="available-herbs" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            ${craftingState.availableHerbs.map((herb, idx) => `
              <div class="herb" data-index="${idx}" style="cursor:pointer;">
                <img src="assets/art/ingridients/${herb.sprite}.png" title="${herb.name} (${herb.amount})" style="width:48px;height:48px;">
                <div style="font-size:0.8rem;">x${herb.amount}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div id="craft-result" style="margin-top:1rem;font-weight:bold;">Select 3 herbs to start crafting</div>
      <button class="fantasy-button message-ok-btn">Close</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
    craftingState = null;
  });

  const slots = modal.querySelectorAll('.craft-slot');
  const herbs = modal.querySelectorAll('.herb');
  const craftBtn = modal.querySelector('#craft-btn');
  const resultDiv = modal.querySelector('#craft-result');

  herbs.forEach(herbEl => {
    herbEl.addEventListener('click', () => {
      const idx = +herbEl.dataset.index;
      const herb = craftingState.availableHerbs[idx];

      const slotIdx = craftingState.selectedHerbs.findIndex(s => s === null);
      if (slotIdx === -1) return;

      craftingState.selectedHerbs[slotIdx] = herb;
      slots[slotIdx].innerHTML = `
        <img src="assets/art/ingridients/${herb.sprite}.png" style="width:64px;height:64px;cursor:pointer;" title="Click to remove">
      `;
      slots[slotIdx].addEventListener('click', () => {
        craftingState.selectedHerbs[slotIdx] = null;
        slots[slotIdx].innerHTML = '';
        updateCraftButtonState();
      });
      updateCraftButtonState();
    });
  });

  craftBtn.addEventListener('click', () => {
    craftingState.isCraftingStarted = true;
    resultDiv.textContent = 'Crafting...';
    craftBtn.disabled = true;

    modal.querySelector('#available-herbs').parentElement.style.display = 'none';

    startSlotAnimation(resultDiv);
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

async function startSlotAnimation(resultDiv) {
  const slotArea = document.querySelector('#crafting-slots');
  slotArea.innerHTML = '';
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

    slotArea.innerHTML = '';
    craftingState.enrichedHerbs.forEach((herb, idx) => {
      const props = Object.values(herb.properties);
      const col = document.createElement('div');
      col.style.display = 'inline-block';
      col.style.margin = '0 1rem';
      col.innerHTML = `
        <div>${props[0]}</div>
        <div>${props[1]}</div>
        <div>${props[2]}</div>
        <div>
          <button class="fantasy-button adjust-up" data-col="${idx}">↑</button>
          <button class="fantasy-button adjust-down" data-col="${idx}">↓</button>
        </div>
      `;
      slotArea.appendChild(col);
    });

    craftingState.randomizedProperties = craftingState.enrichedHerbs.map(h => Object.values(h.properties));
    craftingState.originalProperties = craftingState.randomizedProperties.map(p => [...p]);
    craftingState.currentAdjustedCol = null;

    // --- Initialize adjustments as { [colIdx]: { up: 0, down: 0 } } ---
    craftingState.adjustments = {};
    for (let i = 0; i < 3; i++) {
      craftingState.adjustments[i] = { up: 0, down: 0 };
    }

    enableAdjustment(slotArea, resultDiv);
    resultDiv.textContent = 'You may now apply an adjustment.';

    // --- Add "Finish Crafting" button ---
    let finishBtn = document.createElement('button');
    finishBtn.className = 'fantasy-button';
    finishBtn.textContent = 'Finish Crafting';
    finishBtn.style.marginTop = '1rem';
    finishBtn.disabled = false;
    resultDiv.parentElement.appendChild(finishBtn);

    finishBtn.addEventListener('click', () => {
      finishBtn.disabled = true;
      patchAndSendCraftRequest(resultDiv);
    });

    // Remove the old call to patchAndSendCraftRequest here
    // patchAndSendCraftRequest(resultDiv);
  } catch (err) {
    console.error('[CRAFTING] Error during reservation:', err);
    resultDiv.textContent = 'Server error while verifying ingridients.';
  }
}

// --- PATCH: Build adjustments as array of { bottle, direction, count } ---
async function patchAndSendCraftRequest(resultDiv) {
  try {
    // Build the list of adjustments based on up/down counts
    const adjustments = [];
    for (const [colIdx, adj] of Object.entries(craftingState.adjustments || {})) {
      if (adj.up > 0) {
        adjustments.push({ bottle: Number(colIdx), direction: 'up', count: adj.up });
      }
      if (adj.down > 0) {
        adjustments.push({ bottle: Number(colIdx), direction: 'down', count: adj.down });
      }
    }

    const payload = {
      player_id: _profile.id,
      profession_id: craftingState.professionId,
      selected_ingredients: craftingState.selectedHerbs.map(h => h.name),
      adjustments,
      enriched_herbs: craftingState.enrichedHerbs
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

    if (json.success) {
      craftingState.result = json.crafted.name;
      resultDiv.innerHTML = `
        <span style="color:lime;">✅ You crafted: <strong>${json.crafted.name}</strong>!</span><br/>
        <button id="claim-btn" class="fantasy-button">Claim</button>
      `;

      document.querySelector('#claim-btn').addEventListener('click', () => {
        displayMessage(`${json.crafted.name} added to your bank (server-side)`);
        document.querySelector('.custom-message-box').remove();
        craftingState = null;
      });
    } else {
      craftingState.result = 'Failed';
      resultDiv.innerHTML = `
        <span style="color:red;">❌ Failed Mixture — ingredients wasted.</span><br/>
        <button class="fantasy-button" id="craft-again">Craft Again</button>
      `;

      document.querySelector('#craft-again').addEventListener('click', () => {
        document.querySelector('.custom-message-box').remove();
        startCraftingSession(craftingState.professionId, craftingState.professionName);
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

  // --- Ensure adjustments object exists for this colIdx ---
  if (!craftingState.adjustments[colIdx]) {
    craftingState.adjustments[colIdx] = { up: 0, down: 0 };
  }

  if (direction === 'up') {
    props.push(props.shift()); // rotate up
    craftingState.adjustments[colIdx].up++;
  } else {
    props.unshift(props.pop()); // rotate down
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
  const col = slotArea.children[colIdx];
  col.children[0].textContent = props[0];
  col.children[1].textContent = props[1];
  col.children[2].textContent = props[2];
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

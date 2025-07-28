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
   _session = _getCurrentSession();
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
        await loadProfessionModule(profName, profId);
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

async function loadProfessionModule(professionName, professionId) {
  console.log(`[CRAFTING] Loading ${professionName} module...`);
  
  try {
    // Convert profession name to filename format (e.g., "Alchemy" -> "alchemy")
    const moduleFileName = professionName.toLowerCase().replace(/\s+/g, '_');
    
    // Dynamically import the profession module
    const professionModule = await import(`./professions/${moduleFileName}.js`);
    
    // Pass the necessary context to the profession module
    const context = {
      main: _main,
      apiCall: _apiCall,
      profile: _profile,
      session: _session,
      professionId,
      professionName,
      craftingState: craftingState,
      // Utility functions that profession modules might need
      displayMessage,
      fetchRecipes,
      createParticles
    };
    
    // Start the profession-specific crafting session
    await professionModule.startCraftingSession(context);
    
  } catch (error) {
    console.error(`[CRAFTING] Failed to load ${professionName} module:`, error);
    displayMessage(`Failed to load ${professionName} crafting interface. Module not found.`);
  }
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

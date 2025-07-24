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

// Enhanced createCraftingSlotHTML with GSAP-ready elements
function createCraftingSlotHTML(slotIndex) {
  return `
    <div class="crafting-column" data-slot="${slotIndex}" style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
      <!-- Herb Slot with glow container -->
      <div class="herb-slot-container" style="position: relative;">
        <div class="herb-slot" style="width: 80px; height: 80px; border: 2px dashed #aaa; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); position: relative; overflow: hidden;">
          <span style="color: #666; font-size: 0.8rem;">Drop Herb</span>
          <!-- Magical sparkles container -->
          <div class="herb-sparkles" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"></div>
        </div>
        <!-- Herb glow effect -->
        <div class="herb-glow" style="position: absolute; top: -5px; left: -5px; right: -5px; bottom: -5px; border-radius: 12px; background: radial-gradient(circle, rgba(76,175,80,0.4) 0%, transparent 70%); opacity: 0; pointer-events: none;"></div>
      </div>
      
      <!-- Up Arrow with hover effects -->
      <div class="arrow-up">
        <button class="fantasy-button adjust-up arrow-btn" data-col="${slotIndex}" style="padding: 0.2rem 0.5rem; font-size: 1.2rem; opacity: 0.3; position: relative; overflow: hidden;" disabled>
          ↑
          <div class="button-glow" style="position: absolute; top: 50%; left: 50%; width: 0; height: 0; background: radial-gradient(circle, rgba(255,215,0,0.6) 0%, transparent 70%); border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none;"></div>
        </button>
      </div>
      
      <!-- Enhanced Properties Bottle -->
      <div class="properties-bottle" style="width: 60px; height: 120px; border: 2px solid #8B4513; border-radius: 10px 10px 20px 20px; background: linear-gradient(to bottom, rgba(139,69,19,0.1) 0%, rgba(139,69,19,0.3) 100%); display: flex; flex-direction: column; justify-content: space-around; align-items: center; position: relative; overflow: hidden;">
        <!-- Bottle Cork/Top -->
        <div class="bottle-cork" style="position: absolute; top: -8px; width: 20px; height: 16px; background: #8B4513; border-radius: 4px 4px 0 0;"></div>
        
        <!-- Liquid background animation -->
        <div class="liquid-bg" style="position: absolute; bottom: 0; left: 2px; right: 2px; height: 0%; background: linear-gradient(to top, rgba(100,200,255,0.3) 0%, rgba(150,255,150,0.2) 50%, rgba(255,200,100,0.1) 100%); border-radius: 0 0 16px 16px; transition: height 0.5s ease;"></div>
        
        <!-- Bubble effects container -->
        <div class="bottle-bubbles" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden;"></div>
        
        <!-- Property Slots with enhanced styling -->
        <div class="property-slot prop-top" data-slot="${slotIndex}" data-position="0" style="width: 40px; height: 25px; border: 1px solid #666; border-radius: 4px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: #333; position: relative; z-index: 2; backdrop-filter: blur(2px);">
          -
          <div class="property-glow" style="position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px; border-radius: 6px; background: linear-gradient(45deg, transparent, rgba(255,215,0,0.3), transparent); opacity: 0;"></div>
        </div>
        <div class="property-slot prop-middle" data-slot="${slotIndex}" data-position="1" style="width: 40px; height: 25px; border: 1px solid #666; border-radius: 4px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: #333; position: relative; z-index: 2; backdrop-filter: blur(2px);">
          -
          <div class="property-glow" style="position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px; border-radius: 6px; background: linear-gradient(45deg, transparent, rgba(255,215,0,0.3), transparent); opacity: 0;"></div>
        </div>
        <div class="property-slot prop-bottom" data-slot="${slotIndex}" data-position="2" style="width: 40px; height: 25px; border: 1px solid #666; border-radius: 4px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: #333; position: relative; z-index: 2; backdrop-filter: blur(2px);">
          -
          <div class="property-glow" style="position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px; border-radius: 6px; background: linear-gradient(45deg, transparent, rgba(255,215,0,0.3), transparent); opacity: 0;"></div>
        </div>
        
        <!-- Bottle magical aura -->
        <div class="bottle-aura" style="position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px; border-radius: 20px; background: radial-gradient(ellipse, rgba(139,69,19,0.2) 0%, transparent 70%); opacity: 0; pointer-events: none;"></div>
      </div>
      
      <!-- Down Arrow -->
      <div class="arrow-down">
        <button class="fantasy-button adjust-down arrow-btn" data-col="${slotIndex}" style="padding: 0.2rem 0.5rem; font-size: 1.2rem; opacity: 0.3; position: relative; overflow: hidden;" disabled>
          ↓
          <div class="button-glow" style="position: absolute; top: 50%; left: 50%; width: 0; height: 0; background: radial-gradient(circle, rgba(255,215,0,0.6) 0%, transparent 70%); border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none;"></div>
        </button>
      </div>
    </div>
  `;
}

// GSAP Animation Functions
const AlchemyAnimations = {
  
  // Initialize GSAP timeline for the entire crafting interface
  initCraftingTimeline() {
    // Check if GSAP is available
    if (typeof gsap === 'undefined') {
      console.warn('[CRAFTING] GSAP not loaded, animations disabled');
      return { play: () => {} }; // Return dummy timeline
    }

    const tl = gsap.timeline({ paused: true });
    
    // Animate bottles appearing
    tl.from('.crafting-column', {
      duration: 0.8,
      y: 50,
      opacity: 0,
      stagger: 0.2,
      ease: "back.out(1.7)"
    })
    
    // Add subtle breathing animation to bottles
    .to('.properties-bottle', {
      duration: 2,
      scale: 1.02,
      yoyo: true,
      repeat: -1,
      ease: "power2.inOut",
      stagger: 0.3
    }, "-=0.5");
    
    return tl;
  },

  // Animate herb placement
  placeHerb(slotIndex, herbData) {
    if (typeof gsap === 'undefined') return;

    const column = document.querySelector(`[data-slot="${slotIndex}"]`);
    const herbSlot = column.querySelector('.herb-slot');
    const herbGlow = column.querySelector('.herb-glow');
    const sparkles = column.querySelector('.herb-sparkles');
    
    // Create sparkle particles
    this.createSparkles(sparkles);
    
    // Animate herb placement
    gsap.timeline()
      .to(herbGlow, { opacity: 1, duration: 0.3 })
      .to(herbSlot, { 
        scale: 1.1, 
        duration: 0.2,
        ease: "back.out(2)"
      })
      .to(herbSlot, { 
        scale: 1, 
        duration: 0.3,
        ease: "elastic.out(1, 0.5)"
      })
      .to(herbGlow, { 
        opacity: 0.7, 
        duration: 0.5 
      }, "-=0.3");
  },

  // Animate bottle activation when crafting starts
  activateBottles() {
    if (typeof gsap === 'undefined') return;

    const bottles = document.querySelectorAll('.properties-bottle');
    const arrows = document.querySelectorAll('.arrow-btn');
    
    gsap.timeline()
      // Fill bottles with liquid
      .to('.liquid-bg', {
        height: '80%',
        duration: 1.5,
        ease: "power2.out",
        stagger: 0.3
      })
      
      // Activate bottle auras
      .to('.bottle-aura', {
        opacity: 0.6,
        duration: 1,
        stagger: 0.2
      }, "-=1")
      
      // Enable and animate arrows
      .to(arrows, {
        opacity: 1,
        scale: 1.05,
        duration: 0.5,
        ease: "back.out(1.7)",
        stagger: 0.1
      }, "-=0.5")
      
      // Start bubble animations
      .call(() => {
        bottles.forEach((bottle, index) => {
          this.startBubbleAnimation(bottle.querySelector('.bottle-bubbles'));
        });
      });
  },

  // Animate property rotation with smooth transitions
  rotateProperties(columnIndex, direction) {
    if (typeof gsap === 'undefined') return;

    const column = document.querySelector(`[data-slot="${columnIndex}"]`);
    const propertySlots = column.querySelectorAll('.property-slot');
    const bottle = column.querySelector('.properties-bottle');
    
    // Get current and new property values
    const props = craftingState.randomizedProperties[columnIndex];
    const newProps = [...props];
    
    if (direction === 'up') {
      newProps.push(newProps.shift());
    } else {
      newProps.unshift(newProps.pop());
    }
    
    // Create rotation timeline
    const tl = gsap.timeline();
    
    // Add bottle shake and glow
    tl.to(bottle, {
      rotation: direction === 'up' ? 5 : -5,
      duration: 0.1,
      ease: "power2.out"
    })
    .to(bottle, {
      rotation: 0,
      duration: 0.4,
      ease: "elastic.out(1, 0.5)"
    })
    
    // Animate properties sliding
    .to(propertySlots, {
      y: direction === 'up' ? -30 : 30,
      opacity: 0,
      duration: 0.3,
      stagger: 0.05,
      ease: "power2.in"
    }, 0)
    
    // Update property values and animate back
    .call(() => {
      propertySlots.forEach((slot, index) => {
        slot.textContent = newProps[index];
      });
    })
    .to(propertySlots, {
      y: 0,
      opacity: 1,
      duration: 0.4,
      stagger: 0.05,
      ease: "back.out(1.7)"
    })
    
    // Add property glow effect
    .to('.property-glow', {
      opacity: 1,
      duration: 0.2
    }, "-=0.2")
    .to('.property-glow', {
      opacity: 0,
      duration: 0.5
    });
    
    // Create magical particles
    this.createMagicalBurst(bottle);
    
    return tl;
  },

  // Create sparkle particles for herb placement
  createSparkles(container) {
    if (typeof gsap === 'undefined') return;

    const sparkleCount = 8;
    
    for (let i = 0; i < sparkleCount; i++) {
      const sparkle = document.createElement('div');
      sparkle.style.cssText = `
        position: absolute;
        width: 4px;
        height: 4px;
        background: #FFD700;
        border-radius: 50%;
        top: 50%;
        left: 50%;
      `;
      container.appendChild(sparkle);
      
      // Animate sparkle
      gsap.to(sparkle, {
        x: (Math.random() - 0.5) * 60,
        y: (Math.random() - 0.5) * 60,
        opacity: 0,
        scale: 0,
        duration: 1,
        ease: "power2.out",
        delay: Math.random() * 0.3,
        onComplete: () => sparkle.remove()
      });
    }
  },

  // Create bubble animation inside bottles
  startBubbleAnimation(container) {
    if (typeof gsap === 'undefined') return;

    const createBubble = () => {
      if (!container.parentElement) return; // Stop if bottle is removed
      
      const bubble = document.createElement('div');
      bubble.style.cssText = `
        position: absolute;
        width: ${2 + Math.random() * 6}px;
        height: ${2 + Math.random() * 6}px;
        background: rgba(255,255,255,0.6);
        border-radius: 50%;
        bottom: 0;
        left: ${10 + Math.random() * 40}px;
      `;
      container.appendChild(bubble);
      
      gsap.to(bubble, {
        y: -120,
        x: (Math.random() - 0.5) * 20,
        opacity: 0,
        duration: 2 + Math.random() * 2,
        ease: "power1.out",
        onComplete: () => bubble.remove()
      });
    };
    
    // Create bubbles periodically
    const bubbleInterval = setInterval(createBubble, 500 + Math.random() * 1000);
    
    // Store interval to clear later if needed
    container.bubbleInterval = bubbleInterval;
  },

  // Create magical burst effect for property changes
  createMagicalBurst(bottle) {
    if (typeof gsap === 'undefined') return;

    const burst = document.createElement('div');
    burst.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 20px;
      height: 20px;
      background: radial-gradient(circle, rgba(255,215,0,0.8) 0%, rgba(255,100,100,0.4) 50%, transparent 100%);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    `;
    bottle.appendChild(burst);
    
    gsap.to(burst, {
      scale: 4,
      opacity: 0,
      rotation: 360,
      duration: 0.6,
      ease: "power2.out",
      onComplete: () => burst.remove()
    });
  },

  // Animate button hover effects
  initButtonHovers() {
    if (typeof gsap === 'undefined') return;

    document.querySelectorAll('.arrow-btn').forEach(btn => {
      const glow = btn.querySelector('.button-glow');
      
      btn.addEventListener('mouseenter', () => {
        if (!btn.disabled) {
          gsap.to(glow, {
            width: 40,
            height: 40,
            duration: 0.3,
            ease: "power2.out"
          });
          gsap.to(btn, {
            scale: 1.1,
            duration: 0.2,
            ease: "back.out(2)"
          });
        }
      });
      
      btn.addEventListener('mouseleave', () => {
        gsap.to(glow, {
          width: 0,
          height: 0,
          duration: 0.3,
          ease: "power2.in"
        });
        gsap.to(btn, {
          scale: 1,
          duration: 0.2,
          ease: "power2.out"
        });
      });
    });
  },

  // Final crafting success animation
  craftingSuccess(resultName) {
    if (typeof gsap === 'undefined') return;

    const bottles = document.querySelectorAll('.properties-bottle');
    
    gsap.timeline()
      .to(bottles, {
        scale: 1.2,
        rotation: 360,
        duration: 1,
        ease: "back.out(1.7)",
        stagger: 0.2
      })
      .to('.liquid-bg', {
        background: 'linear-gradient(to top, rgba(0,255,0,0.6) 0%, rgba(255,215,0,0.4) 50%, rgba(255,255,255,0.2) 100%)',
        duration: 0.5
      }, "-=0.5")
      .to('.bottle-aura', {
        opacity: 1,
        scale: 1.5,
        duration: 0.8
      }, "-=0.8");
  },

  // Crafting failure animation
  craftingFailure() {
    if (typeof gsap === 'undefined') return;

    const bottles = document.querySelectorAll('.properties-bottle');
    
    gsap.timeline()
      .to(bottles, {
        x: -10,
        duration: 0.1,
        ease: "power2.inOut",
        stagger: 0.05
      })
      .to(bottles, {
        x: 10,
        duration: 0.1,
        ease: "power2.inOut",
        stagger: 0.05
      })
      .to(bottles, {
        x: 0,
        duration: 0.1,
        ease: "power2.inOut",
        stagger: 0.05
      })
      .to('.liquid-bg', {
        background: 'linear-gradient(to top, rgba(255,0,0,0.6) 0%, rgba(100,100,100,0.4) 50%, transparent 100%)',
        duration: 0.5
      }, 0);
  }
};

function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 1400px; max-height: 90vh; overflow-y: auto; text-align: center;">
      <h2>Crafting: ${craftingState.professionName}</h2>
      <div style="display: flex; gap: 1rem; justify-content: space-between;">
        <div style="flex: 1;">
          <h3>Selected Ingredients</h3>
          <div id="crafting-slots" style="display: flex; justify-content: center; gap: 2rem; margin-bottom: 1rem;">
            ${[0,1,2].map(i => createCraftingSlotHTML(i)).join('')}
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

  setupModalEventListeners(modal);
}

function setupModalEventListeners(modal) {
  const columns = modal.querySelectorAll('.crafting-column');
  const herbs = modal.querySelectorAll('.herb');
  const craftBtn = modal.querySelector('#craft-btn');
  const resultDiv = modal.querySelector('#craft-result');

  // Initialize GSAP animations
  const craftingTimeline = AlchemyAnimations.initCraftingTimeline();
  craftingTimeline.play();
  
  AlchemyAnimations.initButtonHovers();

  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
    craftingState = null;
  });

  herbs.forEach(herbEl => {
    herbEl.addEventListener('click', () => {
      const idx = +herbEl.dataset.index;
      const herb = craftingState.availableHerbs[idx];

      const slotIdx = craftingState.selectedHerbs.findIndex(s => s === null);
      if (slotIdx === -1) return;

      craftingState.selectedHerbs[slotIdx] = herb;
      
      // Update the herb slot visual
      const column = columns[slotIdx];
      const herbSlot = column.querySelector('.herb-slot');
      herbSlot.innerHTML = `
        <img src="assets/art/ingridients/${herb.sprite}.png" style="width:64px;height:64px;cursor:pointer;" title="Click to remove ${herb.name}">
        <div class="herb-sparkles" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"></div>
      `;
      herbSlot.style.border = '2px solid #4CAF50';
      herbSlot.style.background = 'rgba(76, 175, 80, 0.1)';
      
      // Animate herb placement
      AlchemyAnimations.placeHerb(slotIdx, herb);
      
      // Add click to remove functionality
      herbSlot.addEventListener('click', () => {
        craftingState.selectedHerbs[slotIdx] = null;
        herbSlot.innerHTML = '<span style="color: #666; font-size: 0.8rem;">Drop Herb</span>';
        herbSlot.style.border = '2px dashed #aaa';
        herbSlot.style.background = 'rgba(0,0,0,0.2)';
        
        // Reset glow
        const herbGlow = column.querySelector('.herb-glow');
        if (typeof gsap !== 'undefined') {
          gsap.to(herbGlow, { opacity: 0, duration: 0.3 });
        }
        
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

    startSlotAnimation(resultDiv, modal);
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

    // Populate bottles with properties
    craftingState.enrichedHerbs.forEach((herb, idx) => {
      const column = slotArea.children[idx];
      const props = Object.values(herb.properties);
      
      // Enable adjustment arrows
      const upBtn = column.querySelector('.adjust-up');
      const downBtn = column.querySelector('.adjust-down');
      upBtn.disabled = false;
      downBtn.disabled = false;
      
      // Populate property slots
      const propertySlots = column.querySelectorAll('.property-slot');
      propertySlots[0].textContent = props[0];
      propertySlots[1].textContent = props[1];
      propertySlots[2].textContent = props[2];
    });

    // Use GSAP to activate bottles
    AlchemyAnimations.activateBottles();

    craftingState.randomizedProperties = craftingState.enrichedHerbs.map(h => Object.values(h.properties));
    craftingState.originalProperties = craftingState.randomizedProperties.map(p => [...p]);
    craftingState.currentAdjustedCol = null;

    // Initialize adjustments tracking
    craftingState.adjustments = {};
    for (let i = 0; i < 3; i++) {
      craftingState.adjustments[i] = { up: 0, down: 0 };
    }

    enableAdjustment(slotArea, resultDiv);
    resultDiv.textContent = 'You may now apply adjustments to the bottles.';

    // Add "Finish Crafting" button
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

  } catch (err) {
    console.error('[CRAFTING] Error during reservation:', err);
    resultDiv.textContent = 'Server error while verifying ingridients.';
  }
}

// Build adjustments as array of { bottle, direction, count }
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

    // Normalize enriched_herbs properties to {a,b,c} object only
    function normalizeProps(input) {
      if (Array.isArray(input)) {
        const keys = ['a', 'b', 'c'];
        const result = {};
        for (let i = 0; i < keys.length; i++) {
          result[keys[i]] = input[i] ?? 0;
        }
        return result;
      }
      // If already object, ensure only a, b, c keys exist
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

    if (json.success) {
      craftingState.result = json.crafted.name;
      
      // Add success animation
      AlchemyAnimations.craftingSuccess(json.crafted.name);
      
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
      
      // Add failure animation
      AlchemyAnimations.craftingFailure();
      
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

  // Ensure adjustments object exists for this colIdx
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

  // Use GSAP animation instead of simple update
  AlchemyAnimations.rotateProperties(colIdx, direction);

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
  
  // Add a brief animation to show the change
  const bottle = column.querySelector('.properties-bottle');
  bottle.style.animation = 'none';
  bottle.offsetHeight; // Trigger reflow
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

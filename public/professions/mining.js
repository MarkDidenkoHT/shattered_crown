let context = null;
let miningState = null;
let oreCache = new Map();
let dragState = {
    dragging: null,
    draggedFrom: null
};

let tutorialState = {
    active: false,
    currentStep: 0,
    steps: [
        { element: '.mining-row', title: 'Mining Rows', description: 'This is where you place ores to create recipes. Drag 3 different ores here to start mining.', position: 'bottom-right' },
        { element: '#available-ores', title: 'Available Ores', description: 'These are the ores from your inventory. Drag and drop them into the mining rows above.', position: 'bottom-left' },
        { element: '#available-recipes', title: 'Recipes', description: 'Here you can see available recipes. Click the "i" icon to see which ores are needed for each recipe.', position: 'top-left' }
    ]
};

export async function startCraftingSession(ctx) {
    context = ctx;
    const { loadingModal, loadingStartTime, updateLoadingProgress, finishLoading } = context;
    
    try {
        updateLoadingProgress(loadingModal, "Accessing your ore vault...", "Loading bank items and recipes...");
        
        const [bankResponse, recipesPromise] = await Promise.all([
            fetch(`/api/crafting/materials/${context.profile.id}/${context.professionId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }),
            context.fetchRecipes(context.professionId)
        ]);
        
        if (!bankResponse.ok) {
            throw new Error(`HTTP error! status: ${bankResponse.status}`);
        }
        
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
        injectMiningTutorialCSS();
        setupGlobalDragDrop();
        
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
        try {
            const response = await fetch('/api/crafting/enrich-ingredients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemNames: uncachedNames })
            });

            if (!response.ok) {
                console.error('[ORES] Enrich API failed:', response.status);
            }

            const { ingredientMap } = await response.json();
            Object.values(ingredientMap).forEach(ore => oreCache.set(ore.name, ore));

        } catch (err) {
            console.warn('[ORES] Batch enrichment failed:', err);
        }
    }

    return bankItems.map(item => {
        const cachedOre = oreCache.get(item.item);
        if (cachedOre) {
            return {
                name: item.item,
                amount: item.amount,
                properties: cachedOre.properties,
                sprite: cachedOre.sprite,
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

function setupGlobalDragDrop() {
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);
}

function handleDragStart(e) {
    if (!e.target.closest('.ore') || miningState.isCraftingStarted) {
        e.preventDefault();
        return;
    }
    
    const oreEl = e.target.closest('.ore');
    if (!oreEl) return;
    
    const oreIndex = parseInt(oreEl.dataset.index);
    const ore = miningState.availableOres[oreIndex];
    
    if (!ore || ore.amount <= 0) {
        e.preventDefault();
        return;
    }
    
    dragState.dragging = {
        ore: ore,
        index: oreIndex,
        element: oreEl
    };
    
    e.dataTransfer.setData('text/plain', `ore:${oreIndex}`);
    e.dataTransfer.effectAllowed = 'copy';
    
    oreEl.style.opacity = '0.5';
    oreEl.style.cursor = 'grabbing';
}

function handleDragOver(e) {
    if (!dragState.dragging) return;
    
    const slot = e.target.closest('.ore-input-slot');
    if (slot && !slot.querySelector('img') && !miningState.isCraftingStarted) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        slot.style.border = '2px solid #00FF00';
        slot.style.background = 'rgba(0,255,0,0.2)';
    }
}

function handleDrop(e) {
    e.preventDefault();
    
    if (!dragState.dragging) return;
    
    const slot = e.target.closest('.ore-input-slot');
    if (!slot || slot.querySelector('img') || miningState.isCraftingStarted) {
        resetDragState();
        return;
    }
    
    const row = slot.closest('.mining-row');
    const rowIdx = parseInt(row.dataset.row);
    
    if (miningState.selectedOres[rowIdx] !== null) {
        resetDragState();
        return;
    }
    
    miningState.selectedOres[rowIdx] = dragState.dragging.ore;
    
    slot.innerHTML = `
        <img src="assets/art/ingridients/${dragState.dragging.ore.sprite}.png" 
             style="width:60px;height:60px;cursor:pointer;" 
             title="Click to remove ${dragState.dragging.ore.name}">
    `;
    slot.style.border = '2px solid #8B4513';
    slot.style.background = 'rgba(139,69,19,0.4)';
    
    animateOreIntegration(row, dragState.dragging.ore);
    updateCraftButtonState(document.querySelector('.custom-message-box'));
    
    resetDragState();
}

function handleDragEnd() {
    resetDragState();
    
    document.querySelectorAll('.ore-input-slot').forEach(slot => {
        if (!slot.querySelector('img')) {
            slot.style.border = '2px dashed #FFD700';
            slot.style.background = 'rgba(255,215,0,0.15)';
        }
    });
}

function resetDragState() {
    if (dragState.dragging?.element) {
        dragState.dragging.element.style.opacity = '1';
        dragState.dragging.element.style.cursor = 'grab';
    }
    dragState.dragging = null;
    dragState.draggedFrom = null;
}

function createMiningRowHTML(rowIndex) {
    return `
    <div class="mining-row" data-row="${rowIndex}" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem; justify-content: center; position: relative;">
      <div class="arrow-left">
        <button class="fantasy-button adjust-left" data-row="${rowIndex}" style="padding: 0.3rem 0.6rem; font-size: 1.2rem; opacity: 0.3;" disabled>←</button>
      </div>
      
      <div class="rock-formation" style="width: 380px; height: 75px; background: linear-gradient(135deg, #8B7355 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%); border: 3px solid #654321; border-radius: 15px; display: flex; align-items: center; position: relative; box-shadow: inset 0 4px 8px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2);">
        <div class="rock-texture" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px); border-radius: 12px; pointer-events: none;"></div>
        
        <div class="ore-input-slot" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 65px; height: 65px; border: 2px dashed #FFD700; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(255,215,0,0.15); z-index: 15; transition: all 0.5s ease;">
          <span style="color: #FFD700; font-size: 0.8rem; text-align: center; line-height: 1.2;">Drag<br>Ore</span>
        </div>
        
        <div class="property-slot prop-left" data-row="${rowIndex}" data-position="0" style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); width: 60px; height: 50px; border: 2px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.8); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 5; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); opacity: 0; transform: translateY(-50%) scale(0.8);"></div>

        <div class="property-slot prop-center" data-row="${rowIndex}" data-position="1" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 60px; height: 50px; border: 3px solid #FFD700; border-radius: 8px; background: linear-gradient(135deg, rgba(255,215,0,0.9) 0%, rgba(255,215,0,0.7) 100%); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 0 15px rgba(255,215,0,0.5), inset 0 2px 4px rgba(0,0,0,0.2); opacity: 0; transform: translate(-50%, -50%) scale(0.8);"></div>

        <div class="property-slot prop-right" data-row="${rowIndex}" data-position="2" style="position: absolute; right: 15px; top: 50%; transform: translateY(-50%); width: 60px; height: 50px; border: 2px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.8); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 5; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); opacity: 0; transform: translateY(-50%) scale(0.8);"></div>
      </div>
      
      <div class="arrow-right">
        <button class="fantasy-button adjust-right" data-row="${rowIndex}" style="padding: 0.3rem 0.6rem; font-size: 1.2rem; opacity: 0.3;" disabled>→</button>
      </div>
    </div>
  `;
}

function getRecipeType(recipeName) {
    if (recipeName.toLowerCase().includes('bar')) return 'bars';
    if (recipeName.toLowerCase().includes('powder')) return 'powders';
    return 'gems';
}

function filterRecipes(filterType) {
    if (filterType === 'all') {
        return miningState.recipes;
    }
    return miningState.recipes.filter(recipe => getRecipeType(recipe.name) === filterType);
}

function updateRecipeDisplay(filterType = 'all') {
    const recipesContainer = document.querySelector('#available-recipes');
    if (!recipesContainer) return;
    
    const filteredRecipes = filterRecipes(filterType);
    
    if (filteredRecipes.length === 0) {
        recipesContainer.innerHTML = '<div style="color: #666; font-style: italic; padding: 1rem;">No recipes in this category</div>';
        return;
    }
    
    recipesContainer.innerHTML = filteredRecipes.map((recipe, idx) => {
        const originalIndex = miningState.recipes.findIndex(r => r.name === recipe.name);
        return `
      <div class="recipe-card" data-recipe="${originalIndex}" style="flex: 0 0 auto; cursor: pointer; border-radius: 8px; padding: 8px; background: rgba(139,69,19,0.2); border: 1px solid #8B4513; min-width: 80px; text-align: center; position: relative;">
        <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 48px; height: 48px; border-radius: 4px;">
        <div style="font-size: 0.8rem; color: #FFD700; font-weight: bold;">${recipe.name}</div>
        <div class="info-icon" data-recipe="${originalIndex}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #8B4513; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
      </div>
    `;
    }).join('');
}

function renderCraftingModal() {
    const modal = document.createElement('div');
    modal.className = 'custom-message-box';
    modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 1000px; max-height: 90vh; height: 90vh; overflow-y: auto; text-align: center; scrollbar-width:none;">
                
      <div id="craft-result" style="margin-top: 4px; font-weight: bold;">Select 3 ores to start mining</div>
      
      <div id="adjustment-counter" style="margin-top: 0.5rem; font-size: 0.9rem; color: #666; display: none;">
        Adjustments: ${miningState.adjustmentCount}/${miningState.maxAdjustments}
      </div>
      
      <div id="alignment-status" style="margin-top: 0.5rem; font-size: 0.9rem; color: #FFD700; display: none;">
        <span id="alignment-text">Align center column for successful extraction!</span>
      </div>
      
      <h3>Mining Rows</h3>
      <div id="mining-rows">
        ${[0,1,2].map(i => createMiningRowHTML(i)).join('')}
      </div>
      
      <h3>Available Ores</h3>
      <div id="available-ores" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; margin-bottom: 5px; border: 1px solid #8B4513; border-radius: 8px; scrollbar-width: none; min-height: 100px;">
        ${renderOresHTML()}
      </div>
      
     <h3>Recipes</h3>
      <div style="display: flex; gap: 0.3rem; margin-bottom: 0.5rem; justify-content: center;">
        <button id="filter-all" class="fantasy-button filter-btn active" data-filter="all" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">All</button>
        <button id="filter-bars" class="fantasy-button filter-btn" data-filter="bars" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Bars</button>
        <button id="filter-powders" class="fantasy-button filter-btn" data-filter="powders" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Powders</button>
        <button id="filter-gems" class="fantasy-button filter-btn" data-filter="gems" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Gems</button>
      </div>
      <div id="available-recipes" style="display: flex; overflow-x: auto; gap: 0.5rem; padding: 5px; border: 1px solid #8B4513; border-radius: 8px; scrollbar-width: none; max-height: 100px; min-height: 100px;">
        ${renderRecipesHTML()}
      </div>
      
      <div style="display: flex; justify-content: center; gap: 0.5rem;">
        <button class="help-tutorial-close-button message-ok-btn">X</button>
        <button id="craft-btn" class="help-tutorial-craft-button" disabled>Mine</button>
        <button id="finish-btn" class="help-tutorial-craft-button" disabled style="display: none;">Finish</button>
      </div>
    </div>

    <button id="helpBtn" class="help-tutorial-fantasy-button">?</button>
  `;
    document.body.appendChild(modal);
    setupModalEventListeners(modal);
    setBackground(modal);
}

function renderOresHTML() {
    return miningState.availableOres.map((ore, idx) => `
    <div class="ore" data-index="${idx}" draggable="true" style="flex: 0 0 auto; cursor: grab; position: relative; border-radius: 4px; padding: 4px; background: #5f2b06; user-select: none; border: 1px solid #8B4513;">
      <img src="assets/art/ingridients/${ore.sprite}.png" draggable="false" title="${ore.name} (${ore.amount})" style="width: 48px; height: 48px; pointer-events: none;">
      <div style="font-size: 0.7rem; color: #FFD700; font-weight: bold; text-align: center; margin-top: 2px; pointer-events: none;">${ore.name}</div>
      <div style="font-size: 0.8rem; pointer-events: none;">x${ore.amount}</div>
      <div class="info-icon" data-ore="${idx}" style="position: absolute; top: -2px; right: -2px; width: 16px; height: 16px; background: #8B4513; border-radius: 50%; color: white; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; pointer-events: auto;">i</div>
    </div>
  `).join('');
}

function renderRecipesHTML() {
    if (!miningState.recipes || miningState.recipes.length === 0) {
        return '<div style="color: #666; font-style: italic; padding: 1rem;">No recipes available</div>';
    }
    
    return miningState.recipes.map((recipe, idx) => `
    <div class="recipe-card" data-recipe="${idx}" style="flex: 0 0 auto; cursor: pointer; border-radius: 8px; padding: 8px; background: #5f2b06; border: 1px solid #8B4513; min-width: 80px; text-align: center; position: relative;">
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 48px; height: 48px; border-radius: 4px;">
      <div style="font-size: 0.8rem; color: #FFD700; font-weight: bold;">${recipe.name}</div>
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
    <div style="background: rgba(139,69,19,0.5); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
      <h4 style="color: #FFD700; margin-bottom: 0.8rem; text-align: center;">Ore Matching Guide</h4>
      <div style="font-size: 0.85rem; color: #ccc; text-align: center; margin-bottom: 1rem; font-style: italic;">
        Find ores with these components (all three must align vertically in the center):
      </div>
  `;

    matchingResults.forEach((result) => {
        const hasMatches = result.matchingOres.length > 0;
        const borderColor = hasMatches ? '#8B4513' : '#ff6b6b';
        const bgColor = hasMatches ? 'rgba(139,69,19,0.5)' : 'rgba(255,107,107,0.1)';
        
        matchingHTML += `
      <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 6px; padding: 0.8rem; margin-bottom: 0.8rem;">
        <div style="color: #FFD700; font-weight: bold; margin-bottom: 0.5rem;">
          Component ${result.position}: "${result.property}"
        </div>
    `;

        if (hasMatches) {
            matchingHTML += `
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
          <span style="font-size: 0.8rem; margin-right: 0.5rem;">Available ores:</span>
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
          ❌ No available ores have this component
        </div>
      `;
        }

        matchingHTML += '</div>';
    });

    matchingHTML += `
    <div style="background: rgba(255,215,0,0.1); border: 1px solid #FFD700; border-radius: 6px; padding: 0.6rem; margin-top: 1rem;">
      <div style="color: #FFD700; font-size: 0.8rem; text-align: center;">
        <strong>Mining Tip:</strong> Use adjustments to align all three <strong>center components</strong> vertically for successful extraction!
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
      
      <div style="background:rgba(139,69,19,0.5); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
        <h4 style="color: #FFD700; margin-bottom: 0.5rem;">Required Components:</h4>
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
          <strong>Component ${idx + 1}:</strong> ${prop}
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
        propertiesDisplay = '<div style="color: #999; font-style: italic;">No components available</div>';
    }
    
    propsModal.innerHTML = `
    <div class="message-content" style="max-width: 350px; text-align: center; scrollbar-width:none;">
      <h3 style="margin-bottom: 1rem;">${ore.name}</h3>
      <img src="assets/art/ingridients/${ore.sprite}.png" alt="${ore.name}" style="width: 80px; height: 80px; border-radius: 8px; margin-bottom: 1rem;">
      
      <div style="background: rgba(139,69,19,0.3); border: 1px solid #8B4513; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; text-align: left;">
        <h4 style="color: #FFD700; margin-bottom: 0.8rem; text-align: center;">Components:</h4>
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

function setBackground(modal) {
    const messageContent = modal.querySelector('.message-content');
    if (messageContent) {
        messageContent.style.backgroundSize = 'cover';
        messageContent.style.backgroundPosition = 'center';
        messageContent.style.backgroundRepeat = 'no-repeat';
        messageContent.style.backgroundImage = 'url(assets/art/professions/prof_background_mining.png)';
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

    const helpBtn = modal.querySelector('#helpBtn');

    helpBtn.addEventListener('click', startMiningTutorial);

    modal.querySelector('.message-ok-btn').addEventListener('click', () => {
        if (tutorialState.active) {
            cleanupTutorial();
        }
        removeBackground(modal);
        modal.remove();
        miningState = null;
        oreCache.clear();
    });

    const oresContainer = modal.querySelector('#available-ores');
    oresContainer.addEventListener('click', (e) => {
        const infoIcon = e.target.closest('.info-icon');
        
        if (infoIcon?.dataset.ore) {
            e.stopPropagation();
            showOreProperties(parseInt(infoIcon.dataset.ore));
            return;
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

    const filterButtons = modal.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            updateRecipeDisplay(e.target.dataset.filter);
        });
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

        document.querySelectorAll('.ore').forEach(ore => {
            ore.draggable = false;
            ore.style.cursor = 'default';
        });

        startMiningAnimation(resultDiv, modal);
    });

    finishBtn.addEventListener('click', async () => {
        finishBtn.disabled = true;
        await finishMiningOperation(resultDiv);
    });

    const rowsContainer = modal.querySelector('#mining-rows');
    rowsContainer.addEventListener('click', (e) => {
        const adjustBtn = e.target.closest('.adjust-left, .adjust-right');
        if (adjustBtn && !adjustBtn.disabled) {
            const rowIdx = parseInt(adjustBtn.dataset.row);
            const direction = adjustBtn.classList.contains('adjust-left') ? 'left' : 'right';
            handleAdjustment(rowIdx, direction, resultDiv);
        }
        
        const oreInputSlot = e.target.closest('.ore-input-slot');
        if (oreInputSlot && !miningState.isCraftingStarted) {
            const row = oreInputSlot.closest('.mining-row');
            const rowIdx = parseInt(row.dataset.row);
            
            const oreImg = oreInputSlot.querySelector('img');
            if (oreImg) {
                removeOreFromSlot(rowIdx, modal);
            }
        }
    });
}

function startMiningTutorial() {
    tutorialState.active = true;
    tutorialState.currentStep = 0;
    
    const overlay = document.createElement('div');
    overlay.className = 'mining-tutorial-overlay';
    overlay.id = 'miningTutorialOverlay';
    document.body.appendChild(overlay);
    
    showTutorialStep();
}

function showTutorialStep() {
    const step = tutorialState.steps[tutorialState.currentStep];
    const element = document.querySelector(step.element);
    
    if (!element) {
        nextTutorialStep();
        return;
    }
    
    const rect = element.getBoundingClientRect();
    
    const highlight = document.createElement('div');
    highlight.className = 'mining-tutorial-highlight';
    highlight.style.cssText = `
        position: fixed;
        left: ${rect.left - 10}px;
        top: ${rect.top - 10}px;
        width: ${rect.width + 20}px;
        height: ${rect.height + 20}px;
    `;
    
    document.getElementById('miningTutorialOverlay').appendChild(highlight);
    
    const content = document.createElement('div');
    content.className = `mining-tutorial-content mining-tutorial-${step.position}`;
    content.innerHTML = `
        <div class="mining-tutorial-header">
            <div class="mining-tutorial-title">${step.title}</div>
        </div>
        <div class="mining-tutorial-description">${step.description}</div>
        <div class="mining-tutorial-controls">
            <div class="mining-tutorial-progress">${tutorialState.currentStep + 1}/${tutorialState.steps.length}</div>
            <div style="display: flex; gap: 10px;">
                ${tutorialState.currentStep > 0 ? '<button class="mining-tutorial-button mining-tutorial-prev">Previous</button>' : ''}
                <button class="mining-tutorial-button mining-tutorial-next">${tutorialState.currentStep === tutorialState.steps.length - 1 ? 'Finish' : 'Next'}</button>
                <button class="mining-tutorial-button mining-tutorial-skip">Skip Tutorial</button>
            </div>
        </div>
    `;
    
    document.getElementById('miningTutorialOverlay').appendChild(content);
    
    content.querySelector('.mining-tutorial-next').addEventListener('click', nextTutorialStep);
    content.querySelector('.mining-tutorial-prev')?.addEventListener('click', prevTutorialStep);
    content.querySelector('.mining-tutorial-skip').addEventListener('click', cleanupTutorial);
}

function nextTutorialStep() {
    const overlay = document.getElementById('miningTutorialOverlay');
    if (!overlay) return;
    
    overlay.innerHTML = '';
    
    tutorialState.currentStep++;
    
    if (tutorialState.currentStep >= tutorialState.steps.length) {
        cleanupTutorial();
        return;
    }
    
    showTutorialStep();
}

function prevTutorialStep() {
    const overlay = document.getElementById('miningTutorialOverlay');
    if (!overlay) return;
    
    overlay.innerHTML = '';
    
    tutorialState.currentStep--;
    
    if (tutorialState.currentStep < 0) {
        tutorialState.currentStep = 0;
    }
    
    showTutorialStep();
}

function cleanupTutorial() {
    tutorialState.active = false;
    const overlay = document.getElementById('miningTutorialOverlay');
    if (overlay) {
        overlay.remove();
    }
}

function injectMiningTutorialCSS() {
    const style = document.createElement('style');
    style.textContent = `
        .mining-tutorial-overlay { 
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100%; 
            height: 100%; 
            z-index: 10000; 
            pointer-events: none; 
        }
        
        .mining-tutorial-content { 
            position: absolute; 
            background: linear-gradient(145deg, rgba(139,69,19,0.95), rgba(101,67,33,0.95)); 
            border: 3px solid #c4975a; 
            border-radius: 12px; 
            padding: 1.5rem; 
            max-width: 400px; 
            color: #e8e8e8; 
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8); 
            pointer-events: auto; 
            z-index: 10001; 
        }
        
        .mining-tutorial-bottom-right { 
            bottom: 120px; 
            right: 20px; 
            left: auto; 
            transform: none; 
        }
        
        .mining-tutorial-top-left { 
            top: 20px; 
            left: 20px; 
            right: auto; 
            transform: none; 
        }
        
        .mining-tutorial-bottom-left { 
            bottom: 120px; 
            left: 20px; 
            right: auto; 
            transform: none; 
        }
        
        .mining-tutorial-header { 
            text-align: center; 
            margin-bottom: 1rem; 
        }
        
        .mining-tutorial-title { 
            color: #c4975a; 
            font-size: 1.3rem; 
            margin-bottom: 0.5rem; 
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5); 
        }
        
        .mining-tutorial-description { 
            font-size: 0.9rem; 
            line-height: 1.4; 
            margin-bottom: 1.5rem; 
            text-align: center; 
        }
        
        .mining-tutorial-highlight { 
            position: absolute; 
            border: 3px solid #ffd700; 
            border-radius: 8px; 
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.5); 
            z-index: 10002; 
            pointer-events: none; 
            animation: tutorialPulse 2s infinite; 
        }
        
        .mining-tutorial-controls { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-top: 1rem;
            gap: 10px;
        }
        
        .mining-tutorial-progress { 
            color: #b8b3a8; 
            font-size: 0.8rem; 
        }
        
        .mining-tutorial-button { 
            background: linear-gradient(145deg, #c4975a, #a67c52); 
            border: 2px solid #d4af37; 
            border-radius: 6px; 
            color: #1a120b; 
            padding: 0.5rem 1rem; 
            font-family: 'Cinzel', serif; 
            font-weight: bold; 
            cursor: pointer; 
            transition: all 0.3s ease; 
            font-size: 0.8rem; 
        }
        
        .mining-tutorial-button:hover { 
            background: linear-gradient(145deg, #d4af37, #c4975a); 
            transform: translateY(-2px); 
        }
        
        .mining-tutorial-skip { 
            background: transparent; 
            border: 1px solid #666; 
            color: #b8b3a8; 
        }
        
        .mining-tutorial-skip:hover { 
            background: rgba(102, 102, 102, 0.3); 
            color: #e8e8e8; 
        }
        
        @keyframes tutorialPulse { 
            0%, 100% { opacity: 1; } 
            50% { opacity: 0.7; } 
        }
    `;
    document.head.appendChild(style);
}

function handleOreSelection(ore, modal) {
    const slotIdx = miningState.selectedOres.findIndex(s => s === null);
    if (slotIdx === -1) return;

    miningState.selectedOres[slotIdx] = ore;
    
    const row = modal.querySelector(`[data-row="${slotIdx}"]`);
    const oreInputSlot = row.querySelector('.ore-input-slot');
    
    oreInputSlot.innerHTML = `<img src="assets/art/ingridients/${ore.sprite}.png" style="width:60px;height:60px;cursor:pointer;" title="Click to remove ${ore.name}">`;
    oreInputSlot.style.border = '2px solid #8B4513';
    oreInputSlot.style.background = 'rgba(139,69,19,0.4)';
    
    animateOreIntegration(row, ore);
    updateCraftButtonState(modal);
}

function removeOreFromSlot(slotIdx, modal) {
    miningState.selectedOres[slotIdx] = null;
    
    const row = modal.querySelector(`[data-row="${slotIdx}"]`);
    const oreInputSlot = row.querySelector('.ore-input-slot');
    
    oreInputSlot.innerHTML = '<span style="color: #FFD700; font-size: 0.8rem; text-align: center; line-height: 1.2;">Drag<br>Ore</span>';
    oreInputSlot.style.border = '2px dashed #FFD700';
    oreInputSlot.style.background = 'rgba(255,215,0,0.15)';
    
    animateRockClear(row);
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

function animateOreIntegration(row, ore) {
    const rockFormation = row.querySelector('.rock-formation');
    const oreInputSlot = row.querySelector('.ore-input-slot');
    const oreColor = getOreColor(ore.name);
    
    gsap.to(rockFormation, {
        background: `linear-gradient(135deg, ${oreColor} 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%)`,
        duration: 1.0,
        ease: "power2.out"
    });
    
    gsap.to(oreInputSlot, {
        boxShadow: '0 0 20px rgba(255,215,0,0.8), inset 0 0 10px rgba(255,215,0,0.3)',
        duration: 0.8,
        ease: "power2.out"
    });
    
    const rockTexture = row.querySelector('.rock-texture');
    gsap.fromTo(rockTexture, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: "power2.out" });
}

function animateRockClear(row) {
    const rockFormation = row.querySelector('.rock-formation');
    const oreInputSlot = row.querySelector('.ore-input-slot');
    const rockTexture = row.querySelector('.rock-texture');
    
    gsap.to(rockFormation, {
        background: 'linear-gradient(135deg, #8B7355 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%)',
        duration: 0.8,
        ease: "power2.out"
    });
    
    gsap.to(oreInputSlot, { boxShadow: 'none', duration: 0.6, ease: "power2.out" });
    gsap.to(rockTexture, { opacity: 0.3, duration: 0.6, ease: "power2.out" });
}

async function startMiningAnimation(resultDiv, modal) {
    const rowsArea = modal.querySelector('#mining-rows');
    resultDiv.textContent = 'Analyzing ore composition...';

    const selectedOreNames = miningState.selectedOres.map(o => o.name);

    if (selectedOreNames.length !== 3) {
        resultDiv.textContent = 'Please ensure all 3 ore slots are filled before mining.';
        
        const craftBtn = modal.querySelector('#craft-btn');
        const finishBtn = modal.querySelector('#finish-btn');
        craftBtn.style.display = 'block';
        craftBtn.disabled = false;
        finishBtn.style.display = 'none';
        miningState.isCraftingStarted = false;
        return;
    }

    try {
        const reserveRes = await fetch('/api/crafting/reserve-alchemy-ingredients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                player_id: context.profile.id,
                profession_id: miningState.professionId,
                selected_ingredients: selectedOreNames
            })
        });

        const reserveJson = await reserveRes.json();

        if (!reserveRes.ok || !reserveJson.success || !Array.isArray(reserveJson.herbs)) {
            resultDiv.textContent = `Ore verification failed: ${reserveJson?.error || 'Unknown error'}`;
            return;
        }

        miningState.sessionId = reserveJson.session_id;
        miningState.enrichedOres = reserveJson.herbs;

        for (let idx = 0; idx < miningState.enrichedOres.length; idx++) {
            const ore = miningState.enrichedOres[idx];
            const row = rowsArea.children[idx];
            const props = ore.properties;

            await animateOreBreaking(row, props, idx);
        }

        setTimeout(() => {
            resultDiv.textContent = 'You may now apply adjustments.';
        }, 1000);

        miningState.randomizedProperties = miningState.enrichedOres.map(o => Object.values(o.properties));
        miningState.originalProperties = miningState.randomizedProperties.map(p => [...p]);
        miningState.currentAdjustedRow = null;

        miningState.adjustments = {};
        for (let i = 0; i < 3; i++) {
            miningState.adjustments[i] = { left: 0, right: 0 };
        }

    } catch (err) {
        console.error('[MINING] Reserve request failed:', err);
        resultDiv.textContent = 'Server error while verifying ores.';
    }
}

async function animateOreBreaking(row, properties, rowIndex) {
    const oreInputSlot = row.querySelector('.ore-input-slot');
    const propertySlots = row.querySelectorAll('.property-slot');
    const leftBtn = row.querySelector('.adjust-left');
    const rightBtn = row.querySelector('.adjust-right');
    const rockFormation = row.querySelector('.rock-formation');
    
    createOreBreakingEffect(oreInputSlot);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const imagePromises = properties.map(prop => getComponentImage(prop));
    const imageHTMLs = await Promise.all(imagePromises);
    
    gsap.to(oreInputSlot, {
        scale: 0.8,
        opacity: 0,
        duration: 0.5,
        ease: "power2.in",
        onComplete: () => oreInputSlot.style.display = 'none'
    });
    
    gsap.to(propertySlots, {
        opacity: 1,
        scale: 1,
        duration: 0.8,
        stagger: 0.15,
        ease: "back.out(1.4)",
        delay: 0.3,
        onStart: () => {
            propertySlots[0].innerHTML = imageHTMLs[0];
            propertySlots[1].innerHTML = imageHTMLs[1];
            propertySlots[2].innerHTML = imageHTMLs[2];
        }
    });
    
    gsap.to([leftBtn, rightBtn], {
        opacity: 1,
        duration: 0.6,
        delay: 0.8,
        onStart: () => {
            leftBtn.disabled = false;
            rightBtn.disabled = false;
        }
    });
    
    gsap.to(rockFormation, {
        boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.4), 0 4px 12px rgba(255,215,0,0.3)',
        duration: 0.8,
        ease: "power2.out",
        delay: 0.5
    });

    createRockDustEffect(row);
}

async function getComponentImage(componentName) {
    const cleanName = componentName.replace(/\s+/g, '');
    
    const imageNames = [cleanName, cleanName + 'Bar'];
    
    for (const imageName of imageNames) {
        try {
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = `assets/art/ingridients/${imageName}.png`;
            });
            return `<img src="assets/art/ingridients/${imageName}.png" style="width: 40px; height: 40px; border-radius: 4px;" title="${componentName}">`;
        } catch {
            continue;
        }
    }
    
    return `<div style="font-size: 0.7rem; color: #FFD700; font-weight: bold; text-align: center;">${componentName}</div>`;
}

function createOreBreakingEffect(oreInputSlot) {
    const rect = oreInputSlot.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    for (let i = 0; i < 12; i++) {
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
        
        const angle = (i / 12) * Math.PI * 2;
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
      left: ${Math.random() * 380}px;
      pointer-events: none;
      z-index: 20;
    `;
        
        rockFormation.appendChild(particle);
        
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
        if (document.contains(row)) {
            createDustParticle();
        } else {
            clearInterval(dustInterval);
        }
    }, Math.random() * 600 + 300);
    
    return dustInterval;
}

async function finishMiningOperation(resultDiv) {
    try {
        const adjustments = [];

        for (const [rowIdx, adj] of Object.entries(miningState.adjustments || {})) {
            if (adj.left > 0) {
                adjustments.push({ bottle: Number(rowIdx), direction: 'up', count: adj.left });
            }
            if (adj.right > 0) {
                adjustments.push({ bottle: Number(rowIdx), direction: 'down', count: adj.right });
            }
        }

        const payload = {
            player_id: context.profile.id,
            profession_id: miningState.professionId,
            session_id: miningState.sessionId,
            adjustments
        };

        const res = await fetch('/api/crafting/alchemy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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

        const finishBtn = document.querySelector('#finish-btn');
        const craftBtn = document.querySelector('#craft-btn');

        if (json.success) {
            miningState.result = json.crafted.name;
            resultDiv.innerHTML = `<span style="color:lime;">Extracted: <strong>${json.crafted.name}</strong>!</span>`;

            animateMiningSuccess();

            if (finishBtn) finishBtn.style.display = 'none';
            
            setTimeout(() => {
                context.displayMessage(`${json.crafted.name} added to your bank!`);
                document.querySelector('.custom-message-box')?.remove();
                miningState = null;
            }, 1500);
        } else {
            miningState.result = 'Failed';
            resultDiv.innerHTML = `
        <span style="color:red;">💥 Mining failed — ores crumbled to dust.</span>
        <br><small style="color:#999;">${json.message || 'Components not properly aligned'}</small>
      `;

            animateMiningFailure();

            if (finishBtn) finishBtn.style.display = 'none';

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
        const craftBtn = document.querySelector('#craft-btn');

        if (finishBtn) finishBtn.style.display = 'none';

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

function handleAdjustment(rowIdx, direction, resultDiv) {
    if (miningState.adjustmentCount >= miningState.maxAdjustments) {
        resultDiv.textContent = `No more adjustments available (${miningState.maxAdjustments}/${miningState.maxAdjustments}).`;
        return;
    }

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

    updateMiningRow(rowIdx);
    miningState.adjustmentCount++;
    updateAdjustmentCounter();

    if (miningState.adjustmentCount >= miningState.maxAdjustments) {
        disableAdjustmentButtons();
    }
}

async function updateMiningRow(rowIdx) {
    const props = miningState.randomizedProperties[rowIdx];
    const rowsArea = document.querySelector('#mining-rows');
    const row = rowsArea.children[rowIdx];
    const propertySlots = row.querySelectorAll('.property-slot');
    const rockFormation = row.querySelector('.rock-formation');
    
    const imagePromises = props.map(prop => getComponentImage(prop));
    const imageHTMLs = await Promise.all(imagePromises);
    
    gsap.to(propertySlots, {
        x: '+=20',
        duration: 0.15,
        ease: "power2.out",
        yoyo: true,
        repeat: 1,
        onComplete: () => {
            propertySlots[0].innerHTML = imageHTMLs[0];
            propertySlots[1].innerHTML = imageHTMLs[1];
            propertySlots[2].innerHTML = imageHTMLs[2];
        }
    });
    
    gsap.to(rockFormation, {
        y: '+=2',
        duration: 0.1,
        ease: "power2.inOut",
        yoyo: true,
        repeat: 3
    });
    
    createImpactParticles(row);
    
    gsap.to(propertySlots[1], {
        backgroundColor: 'rgba(255,215,0,0.5)',
        duration: 0.2,
        ease: "power2.out",
        yoyo: true,
        repeat: 1
    });
}

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
        left: ${Math.random() * 120 + 130}px;
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
                onComplete: () => particle.remove()
            });
        }, i * 50);
    }
}

function animateMiningSuccess() {
    document.querySelectorAll('.prop-center').forEach((slot, index) => {
        setTimeout(() => createSuccessSparkles(slot), index * 200);
    });
}

function animateMiningFailure() {
    document.querySelectorAll('.rock-formation').forEach((rock, index) => {
        setTimeout(() => {
            gsap.to(rock, {
                x: '+=5',
                duration: 0.1,
                ease: "power2.inOut",
                yoyo: true,
                repeat: 5
            });
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
            onComplete: () => sparkle.remove()
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
      left: ${Math.random() * 380}px;
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
    @keyframes rock-pulse {
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

    .rock-formation {
      transition: all 0.3s ease;
      will-change: transform, box-shadow;
    }

    .ore-input-slot {
      will-change: transform, opacity, scale;
      transition: all 0.5s ease;
    }

    .property-slot {
      will-change: transform, box-shadow, opacity;
      transition: all 0.3s ease;
      transform-origin: center;
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

    .prop-left { transform-origin: left center; }
    .prop-right { transform-origin: right center; }

    .ore {
      transition: all 0.2s ease;
    }

    .fantasy-button:disabled {
      opacity: 0.5 !important;
      cursor: not-allowed !important;
      pointer-events: none;
    }

    .adjust-left, .adjust-right {
      will-change: transform, background-color;
      transition: all 0.2s ease;
    }

    .adjust-left:active, .adjust-right:active {
      transform: scale(0.95);
    }

    .ore-input-slot img {
      transition: all 0.3s ease;
    }

    .rock-texture {
      mix-blend-mode: multiply;
      opacity: 0.3;
    }

    .aligned-center {
      box-shadow: 0 0 20px rgba(76,175,80,0.8), inset 0 0 10px rgba(76,175,80,0.3) !important;
      border-color: #4CAF50 !important;
    }

    .filter-btn {
      background: rgba(139,69,19,0.3) !important;
      border: 1px solid #8B4513 !important;
      color: #FFD700 !important;
      transition: all 0.2s ease;
    }

    .filter-btn.active {
      background: rgba(255,215,0,0.2) !important;
      border-color: #FFD700 !important;
      color: #8B4513 !important;
      font-weight: bold;
    }

    .ore[draggable="true"] {
      cursor: grab;
    }

    .ore[draggable="true"]:active {
      cursor: grabbing;
    }

    .ore-input-slot.drag-over {
      border: 2px solid #00FF00 !important;
      background: rgba(0,255,0,0.2) !important;
    }

    .ore.dragging {
      opacity: 0.5 !important;
      cursor: grabbing !important;
    }

    @media (max-width: 768px) {
      .rock-formation { width: 320px; height: 70px; }
      .ore-input-slot { width: 60px; height: 60px; }
      .property-slot { width: 50px; height: 45px; font-size: 0.7rem; }
      .mining-row { gap: 0.3rem; }
    }

    #available-ores::-webkit-scrollbar,
    #available-recipes::-webkit-scrollbar { height: 6px; }

    #available-ores::-webkit-scrollbar-track,
    #available-recipes::-webkit-scrollbar-track {
      background: rgba(139,69,19,0.5);
      border-radius: 3px;
    }

    #available-ores::-webkit-scrollbar-thumb,
    #available-recipes::-webkit-scrollbar-thumb {
      background: rgba(139,69,19,0.5);
      border-radius: 3px;
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
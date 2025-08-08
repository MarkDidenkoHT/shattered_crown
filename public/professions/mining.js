// Compact Mining profession module with centered ore input
let context = null;
let miningState = null;
let oreCache = new Map();

export async function startCraftingSession(ctx) {
  console.log('[MINING] Starting mining crafting session...');
  context = ctx;
  
  const { loadingModal, loadingStartTime, updateLoadingProgress, finishLoading } = context;
  
  try {
    updateLoadingProgress(loadingModal, "Accessing ore vault...", "Loading resources...");
    
    const [bankResponse, recipesPromise] = await Promise.all([
      context.apiCall(`/api/supabase/rest/v1/bank?player_id=eq.${context.profile.id}&profession_id=eq.${context.professionId}&select=item,amount`),
      context.fetchRecipes(context.professionId)
    ]);
    
    const bankItems = await bankResponse.json();
    updateLoadingProgress(loadingModal, "Analyzing minerals...", "Processing ore data...");
    
    const enriched = await batchEnrichOres(bankItems);
    const recipes = await recipesPromise;
    
    updateLoadingProgress(loadingModal, "Setting up equipment...", "Preparing interface...");
    
    miningState = {
      professionId: context.professionId,
      professionName: context.professionName,
      availableOres: enriched,
      selectedOres: [null, null, null],
      randomizedProperties: [[], [], []],
      isCraftingStarted: false,
      result: null,
      adjustmentCount: 0,
      maxAdjustments: 2,
      recipes: recipes,
      sessionId: null,
      adjustments: {}
    };
    
    await finishLoading(loadingModal, loadingStartTime, 2000);
    renderCraftingModal();
    injectMiningCSS();
    
    console.log('[MINING] Mining session loaded successfully!');
    
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
  
  const oreNames = bankItems.map(item => item.item);
  const uniqueNames = [...new Set(oreNames)];
  const uncachedNames = uniqueNames.filter(name => !oreCache.has(name));
  
  if (uncachedNames.length > 0) {
    const namesQuery = uncachedNames.map(name => encodeURIComponent(name)).join(',');
    
    try {
      const response = await context.apiCall(
        `/api/supabase/rest/v1/ingridients?name=in.(${namesQuery})&select=name,properties,sprite`
      );
      const ores = await response.json();
      
      ores.forEach(ore => oreCache.set(ore.name, ore));
    } catch (error) {
      console.warn('[MINING] Batch fetch failed, using fallback');
      return await fallbackEnrichOres(bankItems);
    }
  }
  
  return bankItems.map(item => {
    const cachedOre = oreCache.get(item.item);
    return cachedOre ? {
      name: item.item,
      amount: item.amount,
      properties: cachedOre.properties,
      sprite: cachedOre.sprite,
    } : null;
  }).filter(Boolean);
}

async function fallbackEnrichOres(bankItems) {
  const enriched = [];
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < bankItems.length; i += BATCH_SIZE) {
    const batch = bankItems.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (item) => {
      try {
        const res = await context.apiCall(
          `/api/supabase/rest/v1/ingridients?name=eq.${encodeURIComponent(item.item)}&select=properties,sprite`
        );
        const [ore] = await res.json();
        return ore ? {
          name: item.item,
          amount: item.amount,
          properties: ore.properties,
          sprite: ore.sprite,
        } : null;
      } catch (error) {
        console.warn(`Failed to fetch ore ${item.item}`);
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    enriched.push(...batchResults.filter(Boolean));
    
    if (i + BATCH_SIZE < bankItems.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  return enriched;
}

// Compact mining row with centered ore input and property blocks
function createMiningRowHTML(rowIndex) {
  return `
    <div class="mining-row" data-row="${rowIndex}" style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1rem; justify-content: center;">
      
      <!-- Left adjustment -->
      <button class="fantasy-button adjust-left" data-row="${rowIndex}" style="padding: 0.4rem 0.6rem; font-size: 1.1rem; opacity: 0.3; min-width: 40px;" disabled>←</button>
      
      <!-- Ore input slot (center) -->
      <div class="ore-input-slot" style="width: 70px; height: 70px; border: 2px dashed #8B4513; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(139,69,19,0.1); position: relative;">
        <span style="color: #999; font-size: 0.75rem; text-align: center;">Drop<br>Ore</span>
        <div class="break-effect" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: none; pointer-events: none;"></div>
      </div>
      
      <!-- Property blocks container -->
      <div class="property-blocks" style="display: flex; gap: 0.6rem;">
        <div class="property-block left-block" data-row="${rowIndex}" data-position="0" style="width: 55px; height: 55px; border: 2px solid #654321; border-radius: 8px; background: rgba(139,69,19,0.7); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #FFD700; font-weight: bold; opacity: 0.3;">-</div>
        
        <div class="property-block center-block" data-row="${rowIndex}" data-position="1" style="width: 55px; height: 55px; border: 3px solid #FFD700; border-radius: 8px; background: rgba(255,215,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #8B4513; font-weight: bold; box-shadow: 0 0 10px rgba(255,215,0,0.4);">-</div>
        
        <div class="property-block right-block" data-row="${rowIndex}" data-position="2" style="width: 55px; height: 55px; border: 2px solid #654321; border-radius: 8px; background: rgba(139,69,19,0.7); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #FFD700; font-weight: bold; opacity: 0.3;">-</div>
      </div>
      
      <!-- Right adjustment -->
      <button class="fantasy-button adjust-right" data-row="${rowIndex}" style="padding: 0.4rem 0.6rem; font-size: 1.1rem; opacity: 0.3; min-width: 40px;" disabled>→</button>
    </div>
  `;
}

function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 90%; max-width: 800px; max-height: 95vh; overflow-y: auto; text-align: center;">
      <h2 style="margin-bottom: 0.5rem;">Mining: ${miningState.professionName}</h2>
      
      <!-- Status displays -->
      <div id="craft-result" style="margin: 0.8rem 0; font-weight: bold; color: #FFD700;">Select 3 ores to start mining</div>
      
      <div id="adjustment-counter" style="font-size: 0.85rem; color: #999; display: none;">
        Adjustments: ${miningState.adjustmentCount}/${miningState.maxAdjustments}
      </div>
      
      <div id="alignment-status" style="font-size: 0.85rem; color: #FFD700; margin-bottom: 1rem; display: none;">
        <span id="alignment-text">Align center column for extraction!</span>
      </div>
      
      <!-- Mining area -->
      <div id="mining-rows" style="margin: 1rem 0;">
        ${[0,1,2].map(i => createMiningRowHTML(i)).join('')}
      </div>
      
      <!-- Available ores (compact horizontal) -->
      <div style="margin-bottom: 1rem;">
        <h4 style="margin: 0.5rem 0; color: #8B4513;">Available Ores</h4>
        <div id="available-ores" style="display: flex; overflow-x: auto; gap: 0.4rem; padding: 8px; border: 1px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.05); max-height: 80px;">
          ${renderOresHTML()}
        </div>
      </div>
      
      <!-- Recipes (compact) -->
      <div style="margin-bottom: 1rem;">
        <h4 style="margin: 0.5rem 0; color: #8B4513;">Recipes</h4>
        <div id="available-recipes" style="display: flex; overflow-x: auto; gap: 0.4rem; padding: 8px; border: 1px solid #8B4513; border-radius: 8px; background: rgba(139,69,19,0.05); max-height: 80px;">
          ${renderRecipesHTML()}
        </div>
      </div>
      
      <!-- Action buttons -->
      <div style="display: flex; justify-content: center; gap: 0.8rem; margin-top: 1rem;">
        <button class="fantasy-button message-ok-btn" style="flex: 1; max-width: 80px; padding: 0.6rem;">Close</button>
        <button id="mine-btn" class="fantasy-button" disabled style="flex: 1; max-width: 80px; padding: 0.6rem;">Mine</button>
        <button id="extract-btn" class="fantasy-button" disabled style="flex: 1; max-width: 80px; padding: 0.6rem; display: none;">Extract</button>
        <button id="claim-btn" class="fantasy-button" style="flex: 1; max-width: 80px; padding: 0.6rem; display: none;">Claim</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setupModalEventListeners(modal);
}

function renderOresHTML() {
  return miningState.availableOres.map((ore, idx) => `
    <div class="ore-item" data-index="${idx}" style="flex: 0 0 auto; cursor: pointer; padding: 4px; border-radius: 6px; background: rgba(139,69,19,0.1); position: relative; text-align: center;">
      <img src="assets/art/ingridients/${ore.sprite}.png" title="${ore.name}" style="width: 40px; height: 40px;">
      <div style="font-size: 0.7rem; color: #999;">x${ore.amount}</div>
      <div class="info-icon" data-ore="${idx}" style="position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; background: #8B4513; border-radius: 50%; color: white; font-size: 9px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

function renderRecipesHTML() {
  if (!miningState.recipes?.length) {
    return '<div style="color: #666; font-style: italic; padding: 1rem;">No recipes available</div>';
  }
  
  return miningState.recipes.map((recipe, idx) => `
    <div class="recipe-item" data-recipe="${idx}" style="flex: 0 0 auto; cursor: pointer; padding: 4px; border-radius: 6px; background: rgba(139,69,19,0.1); border: 1px solid #8B4513; text-align: center; position: relative;">
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 40px; height: 40px;">
      <div style="font-size: 0.7rem; color: #c4975a; font-weight: bold; margin-top: 2px;">${recipe.name}</div>
      <div class="info-icon" data-recipe="${idx}" style="position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; background: #8B4513; border-radius: 50%; color: white; font-size: 9px; display: flex; align-items: center; justify-content: center;">i</div>
    </div>
  `).join('');
}

function setupModalEventListeners(modal) {
  const mineBtn = modal.querySelector('#mine-btn');
  const extractBtn = modal.querySelector('#extract-btn');
  const resultDiv = modal.querySelector('#craft-result');

  // Close button
  modal.querySelector('.message-ok-btn').addEventListener('click', () => {
    modal.remove();
    miningState = null;
    oreCache.clear();
  });

  // Ore selection
  modal.querySelector('#available-ores').addEventListener('click', (e) => {
    const oreItem = e.target.closest('.ore-item');
    const infoIcon = e.target.closest('.info-icon');
    
    if (infoIcon?.dataset.ore) {
      e.stopPropagation();
      showOreProperties(parseInt(infoIcon.dataset.ore));
    } else if (oreItem && !miningState.isCraftingStarted) {
      const idx = parseInt(oreItem.dataset.index);
      handleOreSelection(miningState.availableOres[idx], modal);
    }
  });

  // Recipe info
  modal.querySelector('#available-recipes').addEventListener('click', (e) => {
    const infoIcon = e.target.closest('.info-icon');
    const recipeItem = e.target.closest('.recipe-item');
    
    if (infoIcon?.dataset.recipe) {
      e.stopPropagation();
      showRecipeDetails(miningState.recipes[parseInt(infoIcon.dataset.recipe)]);
    } else if (recipeItem) {
      showRecipeDetails(miningState.recipes[parseInt(recipeItem.dataset.recipe)]);
    }
  });

  // Mine button
  mineBtn.addEventListener('click', () => {
    miningState.isCraftingStarted = true;
    mineBtn.style.display = 'none';
    extractBtn.style.display = 'block';
    extractBtn.disabled = false;
    
    modal.querySelector('#adjustment-counter').style.display = 'block';
    modal.querySelector('#alignment-status').style.display = 'block';
    modal.querySelector('#available-ores').style.opacity = '0.5';
    
    startMiningProcess(resultDiv);
  });

  // Extract button
  extractBtn.addEventListener('click', () => {
    extractBtn.disabled = true;
    performExtraction(resultDiv);
  });

  // Adjustment buttons
  modal.querySelector('#mining-rows').addEventListener('click', (e) => {
    const adjustBtn = e.target.closest('.adjust-left, .adjust-right');
    if (adjustBtn && !adjustBtn.disabled) {
      const rowIdx = parseInt(adjustBtn.dataset.row);
      const direction = adjustBtn.classList.contains('adjust-left') ? 'left' : 'right';
      handleAdjustment(rowIdx, direction);
    }
    
    // Ore removal
    const oreSlot = e.target.closest('.ore-input-slot img');
    if (oreSlot && !miningState.isCraftingStarted) {
      const row = oreSlot.closest('.mining-row');
      const rowIdx = parseInt(row.dataset.row);
      removeOreFromSlot(rowIdx, modal);
    }
  });
}

function handleOreSelection(ore, modal) {
  const slotIdx = miningState.selectedOres.findIndex(s => s === null);
  if (slotIdx === -1) return;

  miningState.selectedOres[slotIdx] = ore;
  
  const row = modal.querySelector(`[data-row="${slotIdx}"]`);
  const oreSlot = row.querySelector('.ore-input-slot');
  
  oreSlot.innerHTML = `<img src="assets/art/ingridients/${ore.sprite}.png" style="width:50px;height:50px;cursor:pointer;" title="Click to remove">`;
  oreSlot.style.border = '2px solid #8B4513';
  oreSlot.style.background = `linear-gradient(135deg, ${getOreColor(ore.name)}, rgba(139,69,19,0.3))`;
  
  updateMineButtonState(modal);
}

function removeOreFromSlot(slotIdx, modal) {
  miningState.selectedOres[slotIdx] = null;
  
  const row = modal.querySelector(`[data-row="${slotIdx}"]`);
  const oreSlot = row.querySelector('.ore-input-slot');
  
  oreSlot.innerHTML = '<span style="color: #999; font-size: 0.75rem; text-align: center;">Drop<br>Ore</span>';
  oreSlot.style.border = '2px dashed #8B4513';
  oreSlot.style.background = 'rgba(139,69,19,0.1)';
  
  updateMineButtonState(modal);
}

function updateMineButtonState(modal) {
  const mineBtn = modal.querySelector('#mine-btn');
  const resultDiv = modal.querySelector('#craft-result');
  
  if (miningState.selectedOres.every(o => o !== null)) {
    mineBtn.disabled = false;
    resultDiv.textContent = 'Ready to mine!';
    resultDiv.style.color = '#4CAF50';
  } else {
    mineBtn.disabled = true;
    resultDiv.textContent = 'Select 3 ores to start mining';
    resultDiv.style.color = '#FFD700';
  }
}

async function startMiningProcess(resultDiv) {
  resultDiv.textContent = 'Breaking ore into components...';
  
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
    if (!reserveRes.ok || !reserveJson.success) {
      resultDiv.textContent = `Ore verification failed: ${reserveJson?.error || 'Unknown error'}`;
      return;
    }

    miningState.sessionId = reserveJson.session_id;
    miningState.enrichedOres = reserveJson.herbs;
    miningState.randomizedProperties = miningState.enrichedOres.map(o => Object.values(o.properties));
    
    // Initialize adjustments tracking
    miningState.adjustments = {};
    for (let i = 0; i < 3; i++) {
      miningState.adjustments[i] = { left: 0, right: 0 };
    }

    // Animate ore breaking and property population
    await animateOreBreaking();
    
    resultDiv.textContent = 'Align center properties for successful extraction.';
    checkAlignment();

  } catch (err) {
    console.error('[MINING] Reservation error:', err);
    resultDiv.textContent = 'Server error during ore verification.';
  }
}

async function animateOreBreaking() {
  const rows = document.querySelectorAll('.mining-row');
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const oreSlot = row.querySelector('.ore-input-slot');
    const propertyBlocks = row.querySelectorAll('.property-block');
    const adjustButtons = row.querySelectorAll('.adjust-left, .adjust-right');
    
    // Create breaking effect
    const breakEffect = oreSlot.querySelector('.break-effect');
    breakEffect.style.display = 'block';
    breakEffect.style.background = 'radial-gradient(circle, rgba(255,215,0,0.8) 0%, transparent 70%)';
    
    await new Promise(resolve => {
      gsap.to(breakEffect, {
        scale: 2,
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
        onComplete: resolve
      });
    });
    
    // Populate property blocks with staggered animation
    const props = miningState.randomizedProperties[i];
    propertyBlocks.forEach((block, idx) => {
      block.textContent = props[idx];
      block.style.opacity = '1';
      
      gsap.fromTo(block, 
        { scale: 0, rotationY: 90 },
        { 
          scale: 1, 
          rotationY: 0,
          duration: 0.6, 
          delay: idx * 0.1,
          ease: "back.out(1.4)"
        }
      );
    });
    
    // Enable adjustment buttons
    adjustButtons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
    
    // Small delay between rows
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

function handleAdjustment(rowIdx, direction) {
  if (miningState.adjustmentCount >= miningState.maxAdjustments) return;

  const props = miningState.randomizedProperties[rowIdx];
  
  if (!miningState.adjustments[rowIdx]) {
    miningState.adjustments[rowIdx] = { left: 0, right: 0 };
  }

  if (direction === 'left') {
    props.push(props.shift());
    miningState.adjustments[rowIdx].left++;
  } else {
    props.unshift(props.pop());
    miningState.adjustments[rowIdx].right++;
  }
  
  updatePropertyDisplay(rowIdx);
  miningState.adjustmentCount++;
  
  updateAdjustmentCounter();
  checkAlignment();

  if (miningState.adjustmentCount >= miningState.maxAdjustments) {
    disableAdjustmentButtons();
  }
}

function updatePropertyDisplay(rowIdx) {
  const row = document.querySelector(`[data-row="${rowIdx}"]`);
  const props = miningState.randomizedProperties[rowIdx];
  const propertyBlocks = row.querySelectorAll('.property-block');
  
  propertyBlocks.forEach((block, idx) => {
    gsap.to(block, {
      scale: 1.1,
      duration: 0.1,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        block.textContent = props[idx];
      }
    });
  });
}

function checkAlignment() {
  if (!miningState.randomizedProperties || miningState.randomizedProperties.length < 3) return false;
  
  const centerProps = miningState.randomizedProperties.map(props => props[1]);
  const isAligned = centerProps[0] === centerProps[1] && centerProps[1] === centerProps[2];
  
  const alignmentStatus = document.querySelector('#alignment-status');
  const alignmentText = document.querySelector('#alignment-text');
  
  if (isAligned) {
    alignmentText.textContent = `✅ Aligned! "${centerProps[0]}" - Ready to extract!`;
    alignmentStatus.style.color = '#4CAF50';
    
    // Highlight center blocks
    document.querySelectorAll('.center-block').forEach(block => {
      block.style.boxShadow = '0 0 15px rgba(76,175,80,0.8)';
      block.style.background = 'rgba(76,175,80,0.2)';
    });
  } else {
    alignmentText.textContent = `⚠️ Misaligned: [${centerProps.join(', ')}] - Keep adjusting!`;
    alignmentStatus.style.color = '#FFC107';
    
    document.querySelectorAll('.center-block').forEach(block => {
      block.style.boxShadow = '0 0 10px rgba(255,215,0,0.4)';
      block.style.background = 'rgba(255,215,0,0.2)';
    });
  }
  
  return isAligned;
}

async function performExtraction(resultDiv) {
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

    const res = await fetch('/functions/v1/craft_alchemy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${context.session.access_token}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    
    if (!res.ok) {
      resultDiv.innerHTML = `<span style="color:red;">💥 Server Error (${res.status})</span>`;
      document.querySelector('#extract-btn').disabled = false;
      return;
    }

    const claimBtn = document.querySelector('#claim-btn');
    const extractBtn = document.querySelector('#extract-btn');

    if (json.success) {
      miningState.result = json.crafted.name;
      resultDiv.innerHTML = `<span style="color:lime;">⛏️ Extracted: <strong>${json.crafted.name}</strong>!</span>`;
      
      animateExtractionSuccess();
      
      extractBtn.style.display = 'none';
      claimBtn.style.display = 'block';
      claimBtn.disabled = false;
      
      claimBtn.onclick = () => {
        context.displayMessage(`${json.crafted.name} added to your bank!`);
        document.querySelector('.custom-message-box')?.remove();
        miningState = null;
      };
    } else {
      resultDiv.innerHTML = `<span style="color:red;">💥 Extraction failed — ore crumbled to dust.</span>`;
      
      extractBtn.style.display = 'none';
      const mineBtn = document.querySelector('#mine-btn');
      mineBtn.style.display = 'block';
      mineBtn.textContent = 'Try Again';
      mineBtn.disabled = false;
      
      mineBtn.onclick = () => {
        document.querySelector('.custom-message-box')?.remove();
        startCraftingSession(context);
      };
    }
  } catch (err) {
    console.error('[MINING] Extraction error:', err);
    resultDiv.innerHTML = '<span style="color:red;">⚠️ Extraction failed. Try again.</span>';
  }
}

function animateExtractionSuccess() {
  document.querySelectorAll('.center-block').forEach((block, index) => {
    setTimeout(() => {
      for (let i = 0; i < 6; i++) {
        const sparkle = document.createElement('div');
        sparkle.style.cssText = `
          position: absolute;
          width: 4px;
          height: 4px;
          background: #FFD700;
          border-radius: 50%;
          top: 50%;
          left: 50%;
          pointer-events: none;
          z-index: 100;
        `;
        
        block.appendChild(sparkle);
        
        const angle = (i / 6) * Math.PI * 2;
        const distance = 30;
        
        gsap.to(sparkle, {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          opacity: 0,
          duration: 0.8,
          ease: "power2.out",
          onComplete: () => sparkle.remove()
        });
      }
    }, index * 100);
  });
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
  document.querySelectorAll('.adjust-left, .adjust-right').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.3';
    btn.style.cursor = 'not-allowed';
  });
}

function showOreProperties(oreIndex) {
  const ore = miningState.availableOres[oreIndex];
  const propsModal = document.createElement('div');
  propsModal.className = 'custom-message-box';
  propsModal.style.zIndex = '10001';
  
  let propertiesDisplay = '';
  if (Array.isArray(ore.properties)) {
    propertiesDisplay = ore.properties.map((prop, idx) => 
      `<div style="background: rgba(139,69,19,0.2); padding: 0.4rem; border-radius: 4px; margin-bottom: 0.3rem;">
        <strong>Property ${idx + 1}:</strong> ${prop}
      </div>`
    ).join('');
  } else {
    propertiesDisplay = '<div style="color: #999; font-style: italic;">No properties available</div>';
  }
  
  propsModal.innerHTML = `
    <div class="message-content" style="max-width: 320px; text-align: center;">
      <h3 style="color: #8B4513; margin-bottom: 1rem;">${ore.name}</h3>
      <img src="assets/art/ingridients/${ore.sprite}.png" alt="${ore.name}" style="width: 64px; height: 64px; margin-bottom: 1rem;">
      
      <div style="background: rgba(139,69,19,0.1); border: 1px solid #8B4513; border-radius: 6px; padding: 0.8rem; margin-bottom: 1rem; text-align: left;">
        <h4 style="color: #FFD700; margin-bottom: 0.6rem; text-align: center;">Properties:</h4>
        ${propertiesDisplay}
      </div>
      
      <div style="background: rgba(255,255,255,0.1); border-radius: 4px; padding: 0.5rem; margin-bottom: 1rem; font-size: 0.9rem;">
        <strong>Available:</strong> ${ore.amount} units
      </div>
      
      <button class="fantasy-button" onclick="this.parentElement.parentElement.remove()" style="width: 100%;">Close</button>
    </div>
  `;
  
  document.body.appendChild(propsModal);
  
  propsModal.addEventListener('click', (e) => {
    if (e.target === propsModal) propsModal.remove();
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
  
  // Generate ingredient matching
  const ingredientMatchingHTML = generateIngredientMatching(recipe);
  
  detailsModal.innerHTML = `
    <div class="message-content" style="max-width: 450px; text-align: center; max-height: 80vh; overflow-y: auto;">
      <h3 style="color: #FFD700; margin-bottom: 1rem;">${recipe.name}</h3>
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 80px; height: 80px; margin-bottom: 1rem;">
      
      <div style="background: rgba(139,69,19,0.1); border: 1px solid #8B4513; border-radius: 6px; padding: 0.8rem; margin-bottom: 1rem; text-align: left;">
        <h4 style="color: #FFD700; margin-bottom: 0.4rem; text-align: center;">Required Properties:</h4>
        <div style="color: #fff; font-size: 0.85rem;">${ingredientsList}</div>
      </div>
      
      ${ingredientMatchingHTML}
      
      <button class="fantasy-button" onclick="this.parentElement.parentElement.remove()" style="width: 100%;">Close</button>
    </div>
  `;
  
  document.body.appendChild(detailsModal);
  
  detailsModal.addEventListener('click', (e) => {
    if (e.target === detailsModal) detailsModal.remove();
  });
}

function generateIngredientMatching(recipe) {
  if (!miningState?.availableOres || !recipe.ingridients) {
    return '<div style="background: rgba(255,193,7,0.1); border: 1px solid #FFC107; border-radius: 6px; padding: 0.8rem; text-align: center; color: #FFC107; font-size: 0.85rem;">Ingredient matching unavailable</div>';
  }

  let requiredProperties = [];
  if (Array.isArray(recipe.ingridients)) {
    requiredProperties = recipe.ingridients;
  } else if (typeof recipe.ingridients === 'string') {
    requiredProperties = recipe.ingridients.split(',').map(prop => prop.trim());
  }

  if (requiredProperties.length === 0) {
    return '<div style="background: rgba(255,193,7,0.1); border: 1px solid #FFC107; border-radius: 6px; padding: 0.8rem; text-align: center; color: #FFC107; font-size: 0.85rem;">No properties specified</div>';
  }

  let matchingHTML = `
    <div style="background: rgba(139,69,19,0.1); border: 1px solid #8B4513; border-radius: 6px; padding: 0.8rem; margin-bottom: 1rem; text-align: left;">
      <h4 style="color: #FFD700; margin-bottom: 0.6rem; text-align: center;">Ore Matching Guide</h4>
      <div style="font-size: 0.8rem; color: #ccc; text-align: center; margin-bottom: 0.8rem; font-style: italic;">
        Find ores with these properties:
      </div>
  `;

  requiredProperties.forEach((requiredProp, index) => {
    const matchingOres = findOresWithProperty(requiredProp);
    const hasMatches = matchingOres.length > 0;
    
    matchingHTML += `
      <div style="background: ${hasMatches ? 'rgba(139,69,19,0.1)' : 'rgba(255,107,107,0.1)'}; border: 1px solid ${hasMatches ? '#8B4513' : '#ff6b6b'}; border-radius: 4px; padding: 0.6rem; margin-bottom: 0.6rem;">
        <div style="color: #FFD700; font-weight: bold; margin-bottom: 0.4rem; font-size: 0.85rem;">
          "${requiredProp}"
        </div>
    `;

    if (hasMatches) {
      matchingHTML += `<div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">`;
      matchingOres.slice(0, 3).forEach(ore => {
        matchingHTML += `
          <div style="display: flex; align-items: center; background: rgba(139,69,19,0.2); border-radius: 3px; padding: 0.2rem 0.4rem; gap: 0.2rem;">
            <img src="assets/art/ingridients/${ore.sprite}.png" style="width: 16px; height: 16px;">
            <span style="font-size: 0.7rem; color: #fff;">${ore.name}</span>
            <span style="font-size: 0.65rem; color: #999;">(${ore.amount})</span>
          </div>
        `;
      });
      if (matchingOres.length > 3) {
        matchingHTML += `<span style="font-size: 0.7rem; color: #999;">+${matchingOres.length - 3} more</span>`;
      }
      matchingHTML += '</div>';
    } else {
      matchingHTML += '<div style="color: #ff6b6b; font-size: 0.75rem;">❌ No available ores</div>';
    }

    matchingHTML += '</div>';
  });

  matchingHTML += `
    <div style="background: rgba(255,215,0,0.1); border: 1px solid #FFD700; border-radius: 4px; padding: 0.5rem; margin-top: 0.8rem; text-align: center;">
      <div style="color: #FFD700; font-size: 0.75rem;">
        ⛏️ <strong>Tip:</strong> Align all center properties for successful extraction!
      </div>
    </div>
  </div>`;

  return matchingHTML;
}

function findOresWithProperty(targetProperty) {
  if (!miningState?.availableOres) return [];

  const matchingOres = [];
  
  miningState.availableOres.forEach(ore => {
    if (!ore.properties) return;
    
    let oreProperties = [];
    if (Array.isArray(ore.properties)) {
      oreProperties = ore.properties;
    } else if (typeof ore.properties === 'string') {
      try {
        const parsed = JSON.parse(ore.properties);
        oreProperties = Array.isArray(parsed) ? parsed : [ore.properties];
      } catch (e) {
        oreProperties = ore.properties.split(',').map(p => p.trim());
      }
    }
    
    const hasProperty = oreProperties.some(prop => 
      prop && prop.toString().toLowerCase().trim() === targetProperty.toLowerCase().trim()
    );
    
    if (hasProperty && ore.amount > 0) {
      matchingOres.push({
        name: ore.name,
        sprite: ore.sprite,
        amount: ore.amount,
        properties: oreProperties
      });
    }
  });

  return matchingOres.sort((a, b) => b.amount - a.amount);
}

function getOreColor(oreName) {
  const colors = {
    'iron': 'rgba(139, 69, 19, 0.8)',
    'copper': 'rgba(184, 115, 51, 0.8)',
    'silver': 'rgba(192, 192, 192, 0.8)',
    'gold': 'rgba(255, 215, 0, 0.8)',
    'coal': 'rgba(64, 64, 64, 0.8)',
    'gem': 'rgba(138, 43, 226, 0.8)',
    'default': 'rgba(139, 115, 85, 0.8)'
  };

  const oreKey = Object.keys(colors).find(key => 
    oreName.toLowerCase().includes(key)
  );

  return oreKey ? colors[oreKey] : colors.default;
}

function injectMiningCSS() {
  if (document.getElementById('compact-mining-css')) return;
  
  const css = `
    .mining-row {
      transition: all 0.3s ease;
    }

    .ore-input-slot {
      transition: all 0.3s ease;
      position: relative;
    }

    .ore-input-slot:hover {
      border-color: #FFD700;
      background: rgba(255,215,0,0.1);
    }

    .property-block {
      transition: all 0.3s ease;
      position: relative;
    }

    .center-block {
      position: relative;
    }

    .center-block::after {
      content: '';
      position: absolute;
      top: -2px;
      left: -2px;
      right: -2px;
      bottom: -2px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: linear-gradient(45deg, #FFD700, #FFA500);
      background-size: 200% 200%;
      animation: border-glow 3s linear infinite;
      z-index: -1;
      opacity: 0.6;
    }

    @keyframes border-glow {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .ore-item, .recipe-item {
      transition: all 0.2s ease;
    }

    .ore-item:hover, .recipe-item:hover {
      transform: translateY(-1px);
      background: rgba(139,69,19,0.2);
    }

    .fantasy-button:disabled {
      opacity: 0.4 !important;
      cursor: not-allowed !important;
    }

    .fantasy-button:not(:disabled):hover {
      background: rgba(255,215,0,0.1);
      border-color: #FFD700;
    }

    #available-ores::-webkit-scrollbar,
    #available-recipes::-webkit-scrollbar {
      height: 4px;
    }

    #available-ores::-webkit-scrollbar-track,
    #available-recipes::-webkit-scrollbar-track {
      background: rgba(139,69,19,0.1);
      border-radius: 2px;
    }

    #available-ores::-webkit-scrollbar-thumb,
    #available-recipes::-webkit-scrollbar-thumb {
      background: rgba(139,69,19,0.5);
      border-radius: 2px;
    }

    #alignment-status {
      font-weight: bold;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      padding: 0.4rem 0.8rem;
      border-radius: 4px;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.1);
    }

    .break-effect {
      border-radius: 12px;
    }

    @keyframes sparkle-fade {
      0% { opacity: 1; transform: scale(0); }
      50% { opacity: 1; transform: scale(1); }
      100% { opacity: 0; transform: scale(0); }
    }
  `;

  const style = document.createElement('style');
  style.id = 'compact-mining-css';
  style.textContent = css;
  document.head.appendChild(style);
}

// Cache management
export function clearOreCache() {
  oreCache.clear();
}

export function preloadOres(oreNames) {
  return batchEnrichOres(oreNames.map(name => ({ item: name, amount: 1 })));
}

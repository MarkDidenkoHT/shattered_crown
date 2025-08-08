// Enhanced mining row HTML with centered ore input and compact layout
function createMiningRowHTML(rowIndex) {
  return `
    <div class="mining-row" data-row="${rowIndex}" style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.6rem; justify-content: center; flex-wrap: wrap;">
      
      <!-- Left Property Fragment -->
      <div class="property-fragment left-fragment" style="width: 70px; height: 60px; border: 2px solid #8B4513; border-radius: 8px; background: linear-gradient(135deg, rgba(139,69,19,0.8), rgba(160,82,45,0.6)); display: flex; align-items: center; justify-content: center; position: relative; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);">
        <div class="property-slot prop-left" data-row="${rowIndex}" data-position="0" style="font-size: 0.75rem; color: #FFD700; font-weight: bold; text-align: center; line-height: 1.1;">-</div>
        <div class="fragment-glow" style="position: absolute; inset: -2px; border-radius: 10px; background: linear-gradient(45deg, transparent, rgba(255,215,0,0.3), transparent); opacity: 0; pointer-events: none;"></div>
      </div>
      
      <!-- Adjustment Controls -->
      <div class="adjustment-controls" style="display: flex; flex-direction: column; gap: 0.2rem;">
        <button class="fantasy-button adjust-left" data-row="${rowIndex}" style="padding: 0.2rem 0.4rem; font-size: 0.9rem; opacity: 0.3; width: 30px; height: 25px;" disabled>↰</button>
        <button class="fantasy-button adjust-right" data-row="${rowIndex}" style="padding: 0.2rem 0.4rem; font-size: 0.9rem; opacity: 0.3; width: 30px; height: 25px;" disabled>↱</button>
      </div>
      
      <!-- Central Ore Processing Station -->
      <div class="ore-processing-station" style="width: 140px; height: 100px; border: 3px solid #654321; border-radius: 12px; background: linear-gradient(135deg, #8B7355 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%); display: flex; flex-direction: column; align-items: center; position: relative; box-shadow: inset 0 4px 8px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.2);">
        
        <!-- Ore Input Slot (top half) -->
        <div class="ore-input-slot" style="width: 60px; height: 40px; border: 2px dashed #aaa; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: rgba(139,69,19,0.2); margin-top: 8px; cursor: pointer;">
          <span class="ore-placeholder" style="color: #666; font-size: 0.7rem; text-align: center; line-height: 1.1;">Drop<br>Ore</span>
        </div>
        
        <!-- Processing Indicator -->
        <div class="processing-indicator" style="width: 20px; height: 8px; margin: 4px 0; display: none;">
          <div class="processing-dots" style="display: flex; gap: 2px; justify-content: center;">
            <div class="dot" style="width: 4px; height: 4px; border-radius: 50%; background: #FFD700; animation: processingPulse 1s infinite 0s;"></div>
            <div class="dot" style="width: 4px; height: 4px; border-radius: 50%; background: #FFD700; animation: processingPulse 1s infinite 0.2s;"></div>
            <div class="dot" style="width: 4px; height: 4px; border-radius: 50%; background: #FFD700; animation: processingPulse 1s infinite 0.4s;"></div>
          </div>
        </div>
        
        <!-- Center Target Property (highlighted) -->
        <div class="center-property-target" style="width: 80px; height: 25px; border: 3px solid #FFD700; border-radius: 6px; background: linear-gradient(135deg, rgba(255,215,0,0.9), rgba(255,215,0,0.7)); display: flex; align-items: center; justify-content: center; margin-top: 4px; position: relative; box-shadow: 0 0 12px rgba(255,215,0,0.6);">
          <div class="property-slot prop-center" data-row="${rowIndex}" data-position="1" style="font-size: 0.75rem; color: #8B4513; font-weight: bold; text-align: center;">-</div>
          <div class="target-indicator" style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%); color: #FFD700; font-size: 0.6rem; font-weight: bold;">TARGET</div>
        </div>
        
        <!-- Rock texture overlay -->
        <div class="rock-texture" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px); border-radius: 9px; pointer-events: none; opacity: 0.3;"></div>
      </div>
      
      <!-- Adjustment Controls -->
      <div class="adjustment-controls" style="display: flex; flex-direction: column; gap: 0.2rem;">
        <button class="fantasy-button adjust-left" data-row="${rowIndex}" style="padding: 0.2rem 0.4rem; font-size: 0.9rem; opacity: 0.3; width: 30px; height: 25px;" disabled>↰</button>
        <button class="fantasy-button adjust-right" data-row="${rowIndex}" style="padding: 0.2rem 0.4rem; font-size: 0.9rem; opacity: 0.3; width: 30px; height: 25px;" disabled>↱</button>
      </div>
      
      <!-- Right Property Fragment -->
      <div class="property-fragment right-fragment" style="width: 70px; height: 60px; border: 2px solid #8B4513; border-radius: 8px; background: linear-gradient(135deg, rgba(139,69,19,0.8), rgba(160,82,45,0.6)); display: flex; align-items: center; justify-content: center; position: relative; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);">
        <div class="property-slot prop-right" data-row="${rowIndex}" data-position="2" style="font-size: 0.75rem; color: #FFD700; font-weight: bold; text-align: center; line-height: 1.1;">-</div>
        <div class="fragment-glow" style="position: absolute; inset: -2px; border-radius: 10px; background: linear-gradient(45deg, transparent, rgba(255,215,0,0.3), transparent); opacity: 0; pointer-events: none;"></div>
      </div>
      
    </div>
  `;
}

// Optimized modal rendering with compact layout
function renderCraftingModal() {
  const modal = document.createElement('div');
  modal.className = 'custom-message-box';
  modal.innerHTML = `
    <div class="message-content" style="width: 95%; max-width: 800px; max-height: 95vh; overflow-y: auto; text-align: center; padding: 1rem;">
      
      <!-- Header with mining equipment -->
      <div class="mining-header" style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 1rem;">
        <div class="mining-pick-display" style="display: flex; align-items: center; gap: 0.5rem;">
          <div class="pick-shaft" style="width: 80px; height: 6px; background: linear-gradient(90deg, #8B4513 0%, #A0522D 50%, #654321 100%); border-radius: 3px; position: relative;">
            <div class="pick-grip" style="position: absolute; right: -8px; top: -4px; width: 14px; height: 14px; background: #654321; border-radius: 50%; border: 2px solid #8B4513;"></div>
          </div>
          <div class="pick-head" style="width: 0; height: 0; border-left: 20px solid #C0C0C0; border-top: 12px solid transparent; border-bottom: 12px solid transparent; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));"></div>
        </div>
        <h2 style="margin: 0; font-size: 1.4rem;">${miningState.professionName}</h2>
      </div>
      
      <!-- Status Display -->
      <div class="status-panel" style="background: rgba(139,69,19,0.1); border: 1px solid #8B4513; border-radius: 8px; padding: 0.8rem; margin-bottom: 1rem;">
        <div id="craft-result" style="font-weight: bold; font-size: 0.95rem; margin-bottom: 0.5rem;">Select 3 ores to start mining</div>
        
        <div class="status-indicators" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
          <div id="adjustment-counter" style="color: #666; display: none;">
            Adjustments: ${miningState.adjustmentCount}/${miningState.maxAdjustments}
          </div>
          <div id="alignment-status" style="color: #FFD700; display: none; flex: 1; text-align: center;">
            <span id="alignment-text">Align center properties for extraction!</span>
          </div>
        </div>
      </div>
      
      <!-- Main mining area -->
      <div id="mining-rows" style="margin: 1rem 0; background: rgba(0,0,0,0.1); border-radius: 10px; padding: 0.8rem;">
        <div style="font-size: 0.8rem; color: #999; margin-bottom: 0.8rem; font-style: italic;">
          ⛏️ Processing Stations - Drop ores to break them into properties
        </div>
        ${[0,1,2].map(i => createMiningRowHTML(i)).join('')}
      </div>
      
      <!-- Compact bank section -->
      <div class="inventory-section" style="background: rgba(139,69,19,0.05); border-radius: 8px; padding: 0.6rem; margin-bottom: 0.8rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="margin: 0; font-size: 1rem;">Available Ores</h3>
          <span style="font-size: 0.7rem; color: #999;">Drag & drop to processing stations</span>
        </div>
        <div id="available-ores" style="display: flex; overflow-x: auto; gap: 0.4rem; padding: 0.4rem; border: 1px solid #444; border-radius: 6px; background: rgba(139,69,19,0.1); scrollbar-width: thin; max-height: 80px;">
          ${renderCompactOresHTML()}
        </div>
      </div>
      
      <!-- Compact recipes section -->
      <div class="recipes-section" style="background: rgba(139,69,19,0.05); border-radius: 8px; padding: 0.6rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="margin: 0; font-size: 1rem;">Recipes</h3>
          <span style="font-size: 0.7rem; color: #999;">Click for ingredient matching</span>
        </div>
        <div id="available-recipes" style="display: flex; overflow-x: auto; gap: 0.4rem; padding: 0.4rem; border: 1px solid #444; border-radius: 6px; background: rgba(139,69,19,0.1); scrollbar-width: thin; max-height: 80px;">
          ${renderCompactRecipesHTML()}
        </div>
      </div>
      
      <!-- Compact button row -->
      <div style="display: flex; justify-content: center; gap: 0.4rem; flex-wrap: wrap;">
        <button class="fantasy-button message-ok-btn" style="flex: 1; min-width: 80px; max-width: 120px; padding: 0.6rem;">Close</button>
        <button id="craft-btn" class="fantasy-button" disabled style="flex: 1; min-width: 80px; max-width: 120px; padding: 0.6rem;">Mine</button>
        <button id="finish-btn" class="fantasy-button" disabled style="flex: 1; min-width: 80px; max-width: 120px; padding: 0.6rem; display: none;">Extract</button>
        <button id="claim-btn" class="fantasy-button" style="flex: 1; min-width: 80px; max-width: 120px; padding: 0.6rem; display: none;">Claim</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  setupModalEventListeners(modal);
}

// Compact ore rendering
function renderCompactOresHTML() {
  return miningState.availableOres.map((ore, idx) => `
    <div class="ore-compact" data-index="${idx}" draggable="true" style="flex: 0 0 auto; cursor: grab; position: relative; border-radius: 4px; padding: 0.3rem; background: rgba(139,69,19,0.1); border: 1px solid transparent; transition: all 0.2s ease;">
      <img src="assets/art/ingridients/${ore.sprite}.png" title="${ore.name} (${ore.amount})" style="width: 36px; height: 36px; display: block;">
      <div style="font-size: 0.7rem; text-align: center; margin-top: 2px; line-height: 1;">x${ore.amount}</div>
      <div class="info-icon-compact" data-ore="${idx}" style="position: absolute; top: -3px; right: -3px; width: 12px; height: 12px; background: #8B4513; border-radius: 50%; color: white; font-size: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

// Compact recipe rendering
function renderCompactRecipesHTML() {
  if (!miningState.recipes || miningState.recipes.length === 0) {
    return '<div style="color: #666; font-style: italic; padding: 0.8rem; font-size: 0.8rem;">No recipes available</div>';
  }
  
  return miningState.recipes.map((recipe, idx) => `
    <div class="recipe-compact" data-recipe="${idx}" style="flex: 0 0 auto; cursor: pointer; border-radius: 6px; padding: 0.4rem; background: rgba(139,69,19,0.2); border: 1px solid #8B4513; text-align: center; position: relative; transition: all 0.2s ease;">
      <img src="assets/art/recipes/${recipe.sprite}.png" alt="${recipe.name}" style="width: 36px; height: 36px; border-radius: 4px;">
      <div style="font-size: 0.7rem; margin-top: 3px; color: #c4975a; font-weight: bold; line-height: 1.1; max-width: 60px; word-wrap: break-word;">${recipe.name}</div>
      <div class="info-icon-compact" data-recipe="${idx}" style="position: absolute; top: -3px; right: -3px; width: 12px; height: 12px; background: #8B4513; border-radius: 50%; color: white; font-size: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">i</div>
    </div>
  `).join('');
}

// Enhanced ore selection with visual feedback
function handleOreSelection(ore, modal) {
  const slotIdx = miningState.selectedOres.findIndex(s => s === null);
  if (slotIdx === -1) return;

  miningState.selectedOres[slotIdx] = ore;
  
  const row = modal.querySelector(`[data-row="${slotIdx}"]`);
  const oreInputSlot = row.querySelector('.ore-input-slot');
  const processingStation = row.querySelector('.ore-processing-station');
  
  // Update ore slot with image
  oreInputSlot.innerHTML = `
    <img src="assets/art/ingridients/${ore.sprite}.png" 
         style="width: 32px; height: 32px; cursor: pointer; border-radius: 3px;" 
         title="Click to remove ${ore.name}">
  `;
  oreInputSlot.style.border = '2px solid #8B4513';
  oreInputSlot.style.background = 'rgba(139,69,19,0.4)';
  
  // Animate processing station activation
  animateProcessingStationActivation(processingStation, ore);
  updateCraftButtonState(modal);
}

// Enhanced processing station activation animation
function animateProcessingStationActivation(processingStation, ore) {
  const oreColor = getOreColor(ore.name);
  
  // Station color change
  gsap.to(processingStation, {
    background: `linear-gradient(135deg, ${oreColor} 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%)`,
    borderColor: '#FFD700',
    duration: 1.0,
    ease: "power2.out"
  });
  
  // Show processing indicator
  const processingIndicator = processingStation.querySelector('.processing-indicator');
  processingIndicator.style.display = 'block';
  
  // Animate processing dots
  gsap.to(processingIndicator, {
    opacity: 1,
    duration: 0.5,
    delay: 0.2
  });
  
  // Enhanced rock texture
  const rockTexture = processingStation.querySelector('.rock-texture');
  gsap.to(rockTexture, {
    opacity: 0.6,
    duration: 0.8
  });
  
  // Glow effect on center target
  const centerTarget = processingStation.querySelector('.center-property-target');
  gsap.to(centerTarget, {
    boxShadow: '0 0 20px rgba(255,215,0,0.8), inset 0 0 10px rgba(255,215,0,0.3)',
    duration: 1.0,
    ease: "power2.out"
  });
}

// Enhanced startMiningAnimation with ore breaking effect
async function startMiningAnimation(resultDiv, modal) {
  const rowsArea = modal.querySelector('#mining-rows');
  resultDiv.textContent = 'Breaking ores into property fragments...';

  // Animate ore breaking for each row
  for (let i = 0; i < 3; i++) {
    const row = rowsArea.children[i + 1]; // Skip the instruction text
    animateOreBreaking(row, i * 300); // Stagger the animations
  }

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

    miningState.sessionId = reserveJson.session_id;
    miningState.enrichedOres = reserveJson.herbs;

    // Populate properties with enhanced animations
    setTimeout(() => {
      miningState.enrichedOres.forEach((ore, idx) => {
        const row = rowsArea.children[idx + 1];
        populateRowProperties(row, ore, idx);
      });

      miningState.randomizedProperties = miningState.enrichedOres.map(o => Object.values(o.properties));
      miningState.originalProperties = miningState.randomizedProperties.map(p => [...p]);
      
      miningState.adjustments = {};
      for (let i = 0; i < 3; i++) {
        miningState.adjustments[i] = { left: 0, right: 0 };
      }

      setTimeout(() => {
        resultDiv.textContent = 'Use adjustments to align center properties for extraction.';
        checkAlignment(modal.querySelector('#alignment-status'));
      }, 1000);
    }, 1500);

  } catch (err) {
    console.error('[MINING] Error during reservation:', err);
    resultDiv.textContent = 'Server error while verifying ores.';
  }
}

// Ore breaking animation
function animateOreBreaking(row, delay) {
  const processingStation = row.querySelector('.ore-processing-station');
  const oreInputSlot = row.querySelector('.ore-input-slot');
  const processingIndicator = row.querySelector('.processing-indicator');
  const leftFragment = row.querySelector('.left-fragment');
  const rightFragment = row.querySelector('.right-fragment');
  const centerTarget = row.querySelector('.center-property-target');
  
  setTimeout(() => {
    // Hide processing indicator
    gsap.to(processingIndicator, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => {
        processingIndicator.style.display = 'none';
      }
    });
    
    // Simulate ore breaking with screen shake effect
    gsap.to(processingStation, {
      x: '+=3',
      duration: 0.1,
      ease: "power2.inOut",
      yoyo: true,
      repeat: 5
    });
    
    // Create breaking particles
    createBreakingParticles(processingStation);
    
    // Animate fragments appearing
    gsap.fromTo([leftFragment, rightFragment, centerTarget], 
      { scale: 0, opacity: 0, rotationY: 90 },
      { 
        scale: 1, 
        opacity: 1, 
        rotationY: 0,
        duration: 0.8, 
        stagger: 0.1, 
        ease: "back.out(1.7)",
        delay: 0.5
      }
    );
    
    // Fragment glow effects
    setTimeout(() => {
      [leftFragment, rightFragment].forEach(fragment => {
        const glow = fragment.querySelector('.fragment-glow');
        gsap.to(glow, {
          opacity: 0.6,
          duration: 0.5,
          yoyo: true,
          repeat: -1
        });
      });
    }, 1300);
    
  }, delay);
}

// Create breaking particles effect
function createBreakingParticles(processingStation) {
  for (let i = 0; i < 12; i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: absolute;
      width: ${Math.random() * 4 + 2}px;
      height: ${Math.random() * 4 + 2}px;
      background: ${Math.random() > 0.5 ? '#FFD700' : '#8B7355'};
      border-radius: 50%;
      top: 50%;
      left: 50%;
      pointer-events: none;
      z-index: 30;
    `;
    
    processingStation.appendChild(particle);
    
    const angle = (i / 12) * Math.PI * 2;
    const distance = Math.random() * 40 + 20;
    
    gsap.to(particle, {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      opacity: 0,
      scale: 0,
      duration: Math.random() * 1 + 0.8,
      ease: "power2.out",
      onComplete: () => {
        if (particle.parentNode) {
          particle.remove();
        }
      }
    });
  }
}

// Populate row properties with enhanced visual feedback
function populateRowProperties(row, ore, rowIndex) {
  const props = Object.values(ore.properties);
  const propertySlots = row.querySelectorAll('.property-slot');
  const adjustmentControls = row.querySelectorAll('.adjustment-controls button');
  
  // Populate property values
  propertySlots.forEach((slot, idx) => {
    setTimeout(() => {
      slot.textContent = props[idx];
      
      // Add property-specific styling
      if (idx === 1) { // Center property
        gsap.to(slot.parentElement, {
          boxShadow: '0 0 15px rgba(255,215,0,0.6)',
          duration: 0.5
        });
      }
    }, idx * 200);
  });
  
  // Enable adjustment controls
  setTimeout(() => {
    adjustmentControls.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
      
      gsap.fromTo(btn, 
        { scale: 0.8, opacity: 0.3 },
        { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.4)" }
      );
    });
  }, 800);
}

// Enhanced CSS with compact layout and processing animations
function injectMiningAnimationsCSS() {
  if (document.getElementById('mining-animations-css')) return;
  
  const compactCSS = `
    @keyframes processingPulse {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.2); }
    }

    @keyframes fragmentGlow {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.8; }
    }

    @keyframes targetPulse {
      0%, 100% { box-shadow: 0 0 12px rgba(255,215,0,0.6); }
      50% { box-shadow: 0 0 20px rgba(255,215,0,0.9); }
    }

    .ore-compact:hover {
      transform: translateY(-2px) scale(1.05);
      border-color: #8B4513;
      box-shadow: 0 4px 8px rgba(139,69,19,0.3);
    }

    .ore-compact:active {
      cursor: grabbing;
      transform: scale(0.95);
    }

    .recipe-compact:hover {
      transform: translateY(-1px);
      border-color: #FFD700;
      box-shadow: 0 3px 6px rgba(255,215,0,0.2);
    }

    .ore-processing-station {
      transition: all 0.3s ease;
      will-change: transform, background, border-color;
    }

    .property-fragment {
      transition: all 0.3s ease;
      will-change: transform, box-shadow;
    }

    .property-fragment:hover .fragment-glow {
      opacity: 0.4 !important;
    }

    .center-property-target {
      animation: targetPulse 2s ease-in-out infinite;
    }

    .adjustment-controls button {
      transition: all 0.2s ease;
      font-weight: bold;
    }

    .adjustment-controls button:not(:disabled):hover {
      background: rgba(255,215,0,0.2);
      border-color: #FFD700;
      transform: scale(1.1);
    }

    .status-panel {
      backdrop-filter: blur(2px);
    }

    .inventory-section, .recipes-section {
      backdrop-filter: blur(1px);
    }

    /* Scrollbar improvements */
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
      background: rgba(139,69,19,0.4);
      border-radius: 2px;
    }

    /* Mobile responsiveness */
    @media (max-width: 768px) {
      .mining-row {
        flex-direction: column !important;
        align-items: center;
        gap: 0.6rem !important;
      }
      
      .property-fragment {
        width: 60px !important;
        height: 50px !important;
      }
      
      .ore-processing-station {
        width: 120px !important;
        height: 90px !important;
      }
      
      .adjustment-controls {
        flex-direction: row !important;
        gap: 0.4rem !important;
      }
      
      .status-indicators {
        flex-direction: column !important;
        gap: 0.3rem !important;
        text-align: center !important;
      }
    }

    /* Drag and drop styling */
    .ore-compact[draggable="true"] {
      cursor: grab;
    }

    .ore-input-slot.drag-over {
      border-color: #FFD700 !important;
      background: rgba(255,215,0,0.2) !important;
      box-shadow: 0 0 10px rgba(255,215,0,0.5);
    }

    .ore-input-slot.drag-hover {
      transform: scale(1.05);
      transition: transform 0.2s ease;
    }

    /* Enhanced processing station states */
    .ore-processing-station.active {
      border-color: #FFD700;
      box-shadow: inset 0 4px 8px rgba(0,0,0,0.4), 0 4px 12px rgba(255,215,0,0.3);
    }

    .ore-processing-station.processing {
      animation: processingShake 0.5s ease-in-out infinite alternate;
    }

    @keyframes processingShake {
      0% { transform: translateY(0); }
      100% { transform: translateY(1px); }
    }

    /* Fragment emergence animation */
    .property-fragment.emerging {
      animation: fragmentEmerge 0.8s ease-out forwards;
    }

    @keyframes fragmentEmerge {
      0% { 
        transform: scale(0) rotateY(180deg); 
        opacity: 0; 
      }
      60% { 
        transform: scale(1.1) rotateY(0deg); 
        opacity: 0.8; 
      }
      100% { 
        transform: scale(1) rotateY(0deg); 
        opacity: 1; 
      }
    }

    /* Alignment status enhancements */
    #alignment-status {
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.1);
      transition: all 0.3s ease;
    }

    #alignment-status.success {
      background: rgba(76,175,80,0.2);
      border-color: rgba(76,175,80,0.5);
      color: #4CAF50 !important;
    }

    #alignment-status.warning {
      background: rgba(255,193,7,0.2);
      border-color: rgba(255,193,7,0.5);
      color: #FFC107 !important;
    }

    /* Mining pick enhancements */
    .mining-pick-display {
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
      transition: transform 0.3s ease;
    }

    .mining-pick-display.active {
      transform: rotate(-15deg) scale(1.05);
    }

    .pick-head {
      filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3)) drop-shadow(0 0 8px rgba(192,192,192,0.4));
    }

    /* Button hover improvements */
    .fantasy-button:not(:disabled):hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }

    .fantasy-button:not(:disabled):active {
      transform: translateY(0);
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }

    /* Info icon improvements */
    .info-icon-compact {
      transition: all 0.2s ease;
    }

    .info-icon-compact:hover {
      transform: scale(1.2);
      background: #FFD700 !important;
      color: #8B4513 !important;
    }
  `;

  const style = document.createElement('style');
  style.id = 'mining-animations-css';
  style.textContent = compactCSS;
  document.head.appendChild(style);
}

// Enhanced drag and drop functionality
function setupDragAndDrop(modal) {
  const oresContainer = modal.querySelector('#available-ores');
  const oreInputSlots = modal.querySelectorAll('.ore-input-slot');

  // Add drag event listeners to ores
  oresContainer.addEventListener('dragstart', (e) => {
    if (e.target.closest('.ore-compact') && !miningState.isCraftingStarted) {
      const oreIndex = parseInt(e.target.closest('.ore-compact').dataset.index);
      e.dataTransfer.setData('text/plain', oreIndex.toString());
      e.target.closest('.ore-compact').style.opacity = '0.5';
    }
  });

  oresContainer.addEventListener('dragend', (e) => {
    if (e.target.closest('.ore-compact')) {
      e.target.closest('.ore-compact').style.opacity = '1';
    }
  });

  // Add drop zone event listeners
  oreInputSlots.forEach((slot, index) => {
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!miningState.isCraftingStarted && miningState.selectedOres[index] === null) {
        slot.classList.add('drag-over');
      }
    });

    slot.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (!miningState.isCraftingStarted && miningState.selectedOres[index] === null) {
        slot.classList.add('drag-hover');
      }
    });

    slot.addEventListener('dragleave', (e) => {
      slot.classList.remove('drag-over', 'drag-hover');
    });

    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over', 'drag-hover');
      
      if (!miningState.isCraftingStarted && miningState.selectedOres[index] === null) {
        const oreIndex = parseInt(e.dataTransfer.getData('text/plain'));
        if (!isNaN(oreIndex) && miningState.availableOres[oreIndex]) {
          const ore = miningState.availableOres[oreIndex];
          
          // Override the slot index to use the drop zone's index
          const originalFindIndex = miningState.selectedOres.findIndex;
          miningState.selectedOres.findIndex = () => index;
          
          handleOreSelection(ore, modal);
          
          // Restore original findIndex
          miningState.selectedOres.findIndex = originalFindIndex;
        }
      }
    });
  });
}

// Enhanced ore removal with visual feedback
function removeOreFromSlot(slotIdx, modal) {
  miningState.selectedOres[slotIdx] = null;
  
  const row = modal.querySelector(`[data-row="${slotIdx}"]`);
  const oreInputSlot = row.querySelector('.ore-input-slot');
  const processingStation = row.querySelector('.ore-processing-station');
  const leftFragment = row.querySelector('.left-fragment');
  const rightFragment = row.querySelector('.right-fragment');
  const centerTarget = row.querySelector('.center-property-target');
  
  // Reset ore input slot
  oreInputSlot.innerHTML = '<span class="ore-placeholder" style="color: #666; font-size: 0.7rem; text-align: center; line-height: 1.1;">Drop<br>Ore</span>';
  oreInputSlot.style.border = '2px dashed #aaa';
  oreInputSlot.style.background = 'rgba(139,69,19,0.2)';
  
  // Animate processing station deactivation
  animateProcessingStationDeactivation(processingStation);
  
  // Hide and reset property fragments
  gsap.to([leftFragment, rightFragment, centerTarget], {
    scale: 0,
    opacity: 0,
    duration: 0.4,
    ease: "back.in(1.7)",
    onComplete: () => {
      // Reset property values
      row.querySelectorAll('.property-slot').forEach(slot => {
        slot.textContent = '-';
      });
      
      // Disable adjustment controls
      row.querySelectorAll('.adjustment-controls button').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.3';
      });
    }
  });
  
  updateCraftButtonState(modal);
}

// Processing station deactivation animation
function animateProcessingStationDeactivation(processingStation) {
  // Reset station appearance
  gsap.to(processingStation, {
    background: 'linear-gradient(135deg, #8B7355 0%, #A0522D 30%, #D2691E 60%, #8B4513 100%)',
    borderColor: '#654321',
    boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.2)',
    duration: 0.8,
    ease: "power2.out"
  });
  
  // Hide processing indicator if visible
  const processingIndicator = processingStation.querySelector('.processing-indicator');
  if (processingIndicator.style.display !== 'none') {
    gsap.to(processingIndicator, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => {
        processingIndicator.style.display = 'none';
      }
    });
  }
  
  // Reset rock texture
  const rockTexture = processingStation.querySelector('.rock-texture');
  gsap.to(rockTexture, {
    opacity: 0.3,
    duration: 0.6
  });
  
  // Reset center target glow
  const centerTarget = processingStation.querySelector('.center-property-target');
  gsap.to(centerTarget, {
    boxShadow: '0 0 12px rgba(255,215,0,0.6)',
    duration: 0.6
  });
}

// Enhanced adjustment handling with better visual feedback
function handleAdjustment(rowIdx, direction, resultDiv, alignmentStatus) {
  if (miningState.adjustmentCount >= miningState.maxAdjustments) {
    resultDiv.textContent = `No more adjustments available (${miningState.maxAdjustments}/${miningState.maxAdjustments}).`;
    // Add shake effect to indicate limit reached
    const row = document.querySelector(`[data-row="${rowIdx}"]`);
    gsap.to(row, {
      x: '+=5',
      duration: 0.1,
      ease: "power2.inOut",
      yoyo: true,
      repeat: 3
    });
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

  // Enhanced visual update
  updateMiningRowWithEnhancedEffects(rowIdx);

  miningState.adjustmentCount++;
  updateAdjustmentCounter();
  checkAlignmentWithEnhancedFeedback(alignmentStatus);

  if (miningState.adjustmentCount >= miningState.maxAdjustments) {
    disableAdjustmentButtonsWithAnimation();
  }
}

// Enhanced mining row update with better animations
function updateMiningRowWithEnhancedEffects(rowIdx) {
  const props = miningState.randomizedProperties[rowIdx];
  const row = document.querySelector(`[data-row="${rowIdx}"]`);
  const propertySlots = row.querySelectorAll('.property-slot');
  const processingStation = row.querySelector('.ore-processing-station');
  const fragments = row.querySelectorAll('.property-fragment');
  
  // Add processing state
  processingStation.classList.add('processing');
  
  // Create property shifting animation
  gsap.timeline()
    .to(fragments, {
      x: direction === 'left' ? '-=30' : '+=30',
      opacity: 0.3,
      duration: 0.2,
      ease: "power2.inOut"
    })
    .call(() => {
      // Update property text during transition
      propertySlots[0].textContent = props[0];
      propertySlots[1].textContent = props[1];
      propertySlots[2].textContent = props[2];
    })
    .to(fragments, {
      x: 0,
      opacity: 1,
      duration: 0.3,
      ease: "back.out(1.4)"
    })
    .call(() => {
      processingStation.classList.remove('processing');
    });
  
  // Create adjustment impact particles
  createAdjustmentParticles(processingStation);
  
  // Flash center property if it matches others
  const centerProp = props[1];
  const allCenterProps = miningState.randomizedProperties.map(p => p[1]);
  const isMatching = allCenterProps.filter(p => p === centerProp).length > 1;
  
  if (isMatching) {
    const centerSlot = row.querySelector('.prop-center');
    gsap.fromTo(centerSlot.parentElement, 
      { borderColor: '#4CAF50' },
      { borderColor: '#FFD700', duration: 0.5, yoyo: true, repeat: 1 }
    );
  }
}

// Enhanced alignment checking with visual feedback
function checkAlignmentWithEnhancedFeedback(alignmentStatus) {
  if (!miningState.randomizedProperties || miningState.randomizedProperties.length < 3) {
    return false;
  }
  
  const centerProps = [
    miningState.randomizedProperties[0][1],
    miningState.randomizedProperties[1][1], 
    miningState.randomizedProperties[2][1]
  ];
  
  const isAligned = centerProps[0] === centerProps[1] && centerProps[1] === centerProps[2];
  
  if (alignmentStatus) {
    const alignmentText = alignmentStatus.querySelector('#alignment-text');
    
    // Remove previous classes
    alignmentStatus.classList.remove('success', 'warning');
    
    if (isAligned) {
      alignmentText.textContent = `✅ Perfect alignment! "${centerProps[0]}" - Ready to extract!`;
      alignmentStatus.classList.add('success');
      
      // Add success effects to all center slots
      document.querySelectorAll('.center-property-target').forEach((target, index) => {
        setTimeout(() => {
          gsap.to(target, {
            boxShadow: '0 0 25px rgba(76,175,80,0.8), inset 0 0 15px rgba(76,175,80,0.4)',
            borderColor: '#4CAF50',
            duration: 0.5,
            ease: "power2.out"
          });
          
          // Success sparkles
          createSuccessSparkles(target);
        }, index * 150);
      });
      
      // Activate mining pick
      const pickDisplay = document.querySelector('.mining-pick-display');
      if (pickDisplay) {
        pickDisplay.classList.add('active');
        gsap.to(pickDisplay, {
          scale: 1.05,
          duration: 0.3,
          ease: "back.out(1.7)",
          yoyo: true,
          repeat: 1
        });
      }
      
    } else {
      // Check for partial matches
      const uniqueProps = [...new Set(centerProps)];
      if (uniqueProps.length === 2) {
        alignmentText.textContent = `⚡ Close! Two match: [${centerProps.join(', ')}] - One more adjustment!`;
      } else {
        alignmentText.textContent = `⚠️ Center misaligned: [${centerProps.join(', ')}] - Keep adjusting!`;
      }
      
      alignmentStatus.classList.add('warning');
      
      // Reset center targets to default state
      document.querySelectorAll('.center-property-target').forEach(target => {
        const pickDisplay = document.querySelector('.mining-pick-display');
        if (pickDisplay) {
          pickDisplay.classList.remove('active');
        }
        
        gsap.to(target, {
          boxShadow: '0 0 12px rgba(255,215,0,0.6)',
          borderColor: '#FFD700',
          duration: 0.5,
          ease: "power2.out"
        });
      });
    }
  }
  
  return isAligned;
}

// Create adjustment impact particles
function createAdjustmentParticles(processingStation) {
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      const particle = document.createElement('div');
      particle.style.cssText = `
        position: absolute;
        width: ${Math.random() * 3 + 2}px;
        height: ${Math.random() * 3 + 2}px;
        background: rgba(255,215,0,0.9);
        border-radius: 50%;
        top: 50%;
        left: 50%;
        pointer-events: none;
        z-index: 25;
      `;
      
      processingStation.appendChild(particle);
      
      gsap.to(particle, {
        x: (Math.random() - 0.5) * 60,
        y: (Math.random() - 0.5) * 40,
        opacity: 0,
        scale: 0,
        duration: Math.random() * 0.6 + 0.4,
        ease: "power2.out",
        onComplete: () => {
          if (particle.parentNode) {
            particle.remove();
          }
        }
      });
    }, i * 100);
  }
}

// Enhanced button disabling with animation
function disableAdjustmentButtonsWithAnimation() {
  const buttons = document.querySelectorAll('.adjust-left, .adjust-right');
  
  buttons.forEach((btn, index) => {
    setTimeout(() => {
      gsap.to(btn, {
        opacity: 0.3,
        scale: 0.9,
        duration: 0.3,
        ease: "power2.out",
        onComplete: () => {
          btn.disabled = true;
          btn.style.cursor = 'not-allowed';
        }
      });
    }, index * 50);
  });
}

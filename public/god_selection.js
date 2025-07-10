export async function loadModule(main, { currentSession, supabaseConfig, getCurrentProfile, getCurrentSession, authenticatedFetch }) {
  // Load gods from database
  let gods = [];
  try {
    const response = await authenticatedFetch('/api/supabase/rest/v1/gods?select=id,name,description');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    gods = await response.json();
  } catch (error) {
    console.error('Error loading gods:', error);
    alert('Failed to load gods. Please try again.');
    return;
  }

  main.innerHTML = `
    <div class="main-app-container">
      <div class="particles"></div>
      
      <div class="art-header">
        <div class="crown-ornament">
          <div class="crown-gems">
            <div class="crown-gem"></div>
            <div class="crown-gem"></div>
            <div class="crown-gem"></div>
          </div>
        </div>
        <h1>Choose Your Deity</h1>
        <p class="subtitle">Select the divine power that will guide your destiny</p>
      </div>
      
      <div class="god-selection-section">
        <div class="gods-container">
          ${gods.map(god => `
            <div class="god-card" data-god-id="${god.id}">
              <div class="god-header">
                <h3 class="god-name">${god.name}</h3>
                <div class="god-divider"></div>
              </div>
              <div class="god-description">
                <p>${god.description}</p>
              </div>
              <div class="god-select-overlay">
                <button class="fantasy-button select-god-btn" data-god-id="${god.id}">
                  Choose ${god.name}
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Add god selection styles
  const style = document.createElement('style');
  style.textContent = `
    .god-selection-section {
      height: 40%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: center;
      padding: 2rem;
      position: relative;
      z-index: 2;
      background: rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(10px);
      overflow-y: auto;
    }

    .gods-container {
      width: 100%;
      max-width: 900px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .god-card {
      background: linear-gradient(145deg, rgba(29, 20, 12, 0.9), rgba(42, 31, 22, 0.8));
      border: 2px solid #3d2914;
      border-radius: 8px;
      padding: 1.5rem;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(5px);
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.1),
        0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .god-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(196, 151, 90, 0.05), transparent);
      transition: left 0.6s ease;
    }

    .god-card:hover::before {
      left: 100%;
    }

    .god-card:hover {
      border-color: #c4975a;
      transform: translateY(-2px);
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.2),
        0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .god-header {
      margin-bottom: 1rem;
    }

    .god-name {
      font-family: 'Cinzel', serif;
      font-size: 1.4rem;
      font-weight: 600;
      color: #c4975a;
      text-align: center;
      margin-bottom: 0.5rem;
      text-shadow: 1px 1px 0px #3d2914;
      letter-spacing: 1px;
    }

    .god-divider {
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, transparent, #c4975a, transparent);
      margin: 0 auto;
      opacity: 0.6;
    }

    .god-description {
      margin-bottom: 1.5rem;
      min-height: 4rem;
    }

    .god-description p {
      color: #b8b3a8;
      font-size: 0.95rem;
      line-height: 1.4;
      text-align: center;
      font-style: italic;
    }

    .god-select-overlay {
      opacity: 0;
      transition: opacity 0.3s ease;
      text-align: center;
    }

    .god-card:hover .god-select-overlay {
      opacity: 1;
    }

    .select-god-btn {
      padding: 0.75rem 1.5rem;
      font-size: 0.95rem;
      font-family: 'Cinzel', serif;
      font-weight: 600;
      border: 2px solid #c4975a;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
      text-transform: uppercase;
      letter-spacing: 1px;
      background: linear-gradient(145deg, #2a1f16, #1d140c);
      color: #c4975a;
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.2),
        0 2px 4px rgba(0, 0, 0, 0.3);
    }

    .select-god-btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(196, 151, 90, 0.1), transparent);
      transition: left 0.6s ease;
    }

    .select-god-btn:hover::before {
      left: 100%;
    }

    .select-god-btn:hover {
      background: linear-gradient(145deg, #3d2914, #2a1f16);
      box-shadow: 
        inset 0 1px 0 rgba(196, 151, 90, 0.3),
        0 4px 8px rgba(0, 0, 0, 0.4);
      transform: translateY(-1px);
    }

    .select-god-btn:active {
      transform: translateY(0);
      box-shadow: 
        inset 0 2px 4px rgba(0, 0, 0, 0.3),
        0 1px 2px rgba(0, 0, 0, 0.2);
    }

    .select-god-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    /* Mobile responsiveness */
    @media (max-width: 768px) {
      .gods-container {
        grid-template-columns: 1fr;
        max-width: 400px;
      }
      
      .god-selection-section {
        padding: 1.5rem;
      }
    }

    @media (max-width: 480px) {
      .god-card {
        padding: 1.25rem;
      }
      
      .god-name {
        font-size: 1.2rem;
      }
    }
  `;
  document.head.appendChild(style);

  // Create floating particles
  createParticles();

  // Add event listeners to god selection buttons
  const selectButtons = main.querySelectorAll('.select-god-btn');
  selectButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      const godId = e.target.dataset.godId;
      const godName = gods.find(g => g.id == godId)?.name;
      
      if (confirm(`Are you sure you want to choose ${godName} as your deity? This choice cannot be changed later.`)) {
        await selectGod(godId, godName, authenticatedFetch);
      }
    });
  });

  // Add button click effects
  selectButtons.forEach(button => {
    button.addEventListener('click', function() {
      this.style.transform = 'scale(0.95)';
      setTimeout(() => {
        this.style.transform = '';
      }, 150);
    });
  });
}

async function selectGod(godId, godName, authenticatedFetch) {
  try {
    // Get current profile
    const profile = JSON.parse(localStorage.getItem('profile'));
    
    // Update profile with selected god
    const response = await authenticatedFetch(`/api/supabase/rest/v1/profiles?id=eq.${profile.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        god: godId
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const updatedProfile = await response.json();
    
    // Update local storage with new profile data
    const newProfile = { ...profile, god: godId };
    localStorage.setItem('profile', JSON.stringify(newProfile));

    alert(`${godName} has chosen you as their champion! Proceeding to character creation...`);
    
    // Load character creation module
    window.gameAuth.loadModule('character_creation');
    
  } catch (error) {
    console.error('Error selecting god:', error);
    alert('Failed to select god. Please try again.');
  }
}

function createParticles() {
  const particles = document.querySelector('.particles');
  if (!particles) return;
  
  // Clear existing particles
  particles.innerHTML = '';
  
  const particleCount = 20;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 6 + 's';
    particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
    particles.appendChild(particle);
  }
}

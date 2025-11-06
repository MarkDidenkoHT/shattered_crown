let _main, _apiCall, _getCurrentProfile, _profile;
let _gods = [];

export async function loadModule(main, { apiCall, getCurrentProfile }) {
    _main = main;
    _apiCall = apiCall;
    _getCurrentProfile = getCurrentProfile;
    _profile = _getCurrentProfile();
    
    if (!_profile) {
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login');
        return;
    }

    _main.innerHTML = `
        <div class="main-app-container">
            <div class="particles"></div>
            <div class="god-selection-section"></div>
        </div>
    `;
    
    createParticles();
    loadGodSelectionStyles();
    await fetchGodsAndRenderSelection();
}

function loadGodSelectionStyles() {
    if (document.getElementById('god-selection-styles')) return;

    const style = document.createElement('style');
    style.id = 'god-selection-styles';
    style.textContent = `
        .god-selection-section {
            padding: 20px;
            max-width: 1200px;
            margin: 0 auto;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        .art-header {
            text-align: center;
            margin-bottom: 2rem;
        }

        .art-header h1 {
            color: #c4975a;
            font-family: 'Cinzel', serif;
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        }

        .art-header p {
            color: #b8b3a8;
            font-size: 1.2rem;
            margin: 0;
        }

        /* Slider Container */
        .characters-slider-container {
            position: relative;
            flex: 1;
            width: 100%;
            overflow: hidden;
            display: flex;
            align-items: center;
            margin: 2rem 0;
        }

        /* Slider Arrows */
        .slider-arrow {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 40px;
            height: 40px;
            background: rgba(196, 151, 90, 0.8);
            border: 2px solid #c4975a;
            border-radius: 50%;
            color: white;
            font-size: 24px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 10;
            transition: all 0.3s ease;
        }

        .slider-arrow:hover {
            background: rgba(196, 151, 90, 1);
            transform: translateY(-50%) scale(1.1);
        }

        .slider-arrow-left {
            left: 10px;
        }

        .slider-arrow-right {
            right: 10px;
        }

        /* Slider Track */
        .characters-slider {
            width: 100%;
            display: flex;
            gap: 1rem;
            overflow-x: auto;
            overflow-y: hidden;
            scroll-behavior: auto;
            scrollbar-width: none;
            scroll-snap-type: x mandatory;
            -ms-overflow-style: none;
            user-select: none;
            padding: 1rem;
            box-sizing: border-box;
        }

        .characters-slider::-webkit-scrollbar {
            display: none;
        }

        /* God Cards */
        .god-card {
            background: linear-gradient(145deg, rgba(29,20,12,0.95), rgba(42,31,22,0.9));
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.3s;
            backdrop-filter: blur(3px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            padding: 1.5rem;
            min-width: calc(100vw - 2rem);
            max-width: calc(100vw - 2rem);
            scroll-snap-align: center;
            flex-shrink: 0;
            user-select: none;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            height: 500px;
            box-sizing: border-box;
            border: 2px solid #c4975a;
        }

        .god-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 24px rgba(196, 151, 90, 0.3);
        }

        .card-info-block {
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .card-name {
            font-family: 'Cinzel', serif;
            font-size: 1.8rem;
            font-weight: 600;
            color: #c4975a;
            margin: 0 0 1rem 0;
            text-shadow: 1px 1px 0px #3d2914;
            letter-spacing: 1px;
            text-align: center;
        }

        .card-description {
            color: #b8b3a8;
            font-size: 1rem;
            line-height: 1.6;
            margin: 0 0 1.5rem 0;
            flex: 1;
        }

        .stats-block {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1.5rem;
            border: 1px solid rgba(196, 151, 90, 0.3);
        }

        .stats-block h4 {
            color: #c4975a;
            font-family: 'Cinzel', serif;
            margin: 0 0 0.5rem 0;
            font-size: 1.1rem;
        }

        .stats-block p {
            color: #ddd;
            margin: 0.3rem 0;
            font-size: 0.9rem;
        }

        .stats-block span {
            color: #4CAF50;
            font-weight: bold;
        }

        /* Slider Dots */
        .slider-dots {
            display: flex;
            justify-content: center;
            gap: 0.5rem;
            margin-top: 1rem;
        }

        .slider-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: rgba(196, 151, 90, 0.3);
            border: none;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .slider-dot.active {
            background: #c4975a;
            transform: scale(1.2);
        }

        .slider-dot:hover {
            background: rgba(196, 151, 90, 0.6);
        }

        /* Buttons */
        .fantasy-button {
            background: linear-gradient(145deg, #8B4513, #A0522D);
            border: 2px solid #c4975a;
            border-radius: 8px;
            color: #fff;
            padding: 12px 24px;
            font-family: 'Cinzel', serif;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }

        .fantasy-button:hover {
            background: linear-gradient(145deg, #A0522D, #8B4513);
            border-color: #d4b48c;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(196, 151, 90, 0.4);
        }

        .fantasy-button:active {
            transform: translateY(0);
        }

        .select-btn {
            width: 100%;
            margin-top: auto;
        }

        /* Particles */
        .particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
        }

        .particle {
            position: absolute;
            width: 2px;
            height: 2px;
            background: rgba(196, 151, 90, 0.6);
            border-radius: 50%;
            animation: float 6s infinite ease-in-out;
        }

        @keyframes float {
            0%, 100% {
                transform: translateY(0) translateX(0);
                opacity: 0;
            }
            50% {
                opacity: 1;
            }
            100% {
                transform: translateY(-100px) translateX(20px);
            }
        }

        /* Responsive Design */
        @media (min-width: 768px) {
            .god-card {
                min-width: calc(50vw - 3rem);
                max-width: calc(50vw - 3rem);
                height: 550px;
            }
        }

        @media (min-width: 1024px) {
            .god-card {
                min-width: calc(33.333vw - 4rem);
                max-width: calc(33.333vw - 4rem);
                height: 600px;
            }
        }

        /* Message Box */
        .custom-message-box {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }

        .message-content {
            background: linear-gradient(145deg, rgba(29,20,12,0.98), rgba(42,31,22,0.95));
            border: 3px solid #c4975a;
            border-radius: 12px;
            padding: 2rem;
            max-width: 400px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        }

        .message-content p {
            color: #b8b3a8;
            font-size: 1.1rem;
            margin-bottom: 1.5rem;
            line-height: 1.6;
        }
    `;
    document.head.appendChild(style);
}

async function fetchGodsAndRenderSelection() {
    try {
        const response = await _apiCall('/api/supabase/rest/v1/gods?select=*');
        if (!response.ok) throw new Error('Failed to fetch gods');
        
        _gods = await response.json();
        if (_gods.length === 0) {
            displayMessage('No gods available. Please contact support.');
            return;
        }
        
        renderGodSelection();
    } catch (error) {
        console.error('Error fetching gods:', error);
        displayMessage('Failed to load gods. Please try again.');
    }
}

function renderGodSelection() {
    const section = _main.querySelector('.god-selection-section');
    
    section.innerHTML = `
        <div class="art-header">
            <h1>Choose Your Deity</h1>
            <p>Select a god to guide your journey</p>
        </div>
        <div class="characters-slider-container">
            <button class="slider-arrow slider-arrow-left">‹</button>
            <div class="characters-slider" id="godsSlider">
                ${_gods.map(god => `
                    <div class="god-card" data-god-id="${god.id}">
                        <div class="card-info-block">
                            <h3 class="card-name">${god.name}</h3>
                            <p class="card-description">${god.description || 'A powerful deity awaiting your devotion.'}</p>
                            <div class="stats-block">
                                <h4>Divine Blessings:</h4>
                                ${god.blessings ? Object.entries(god.blessings).map(([blessing, effect]) => 
                                    `<p>${blessing}: <span>${effect}</span></p>`
                                ).join('') : '<p>Divine powers await your dedication</p>'}
                            </div>
                            <button class="fantasy-button select-btn" data-god-id="${god.id}">
                                Follow ${god.name}
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="slider-arrow slider-arrow-right">›</button>
        </div>
        <div class="slider-dots">
            ${_gods.map((_, index) => 
                `<button class="slider-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>`
            ).join('')}
        </div>
    `;

    section.querySelectorAll('.select-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const godId = e.target.dataset.godId;
            handleGodSelection(godId);
        });
    });

    setupGodSlider();
}

function setupGodSlider() {
    const slider = _main.querySelector('#godsSlider');
    if (!slider) return;

    const cards = slider.querySelectorAll('.god-card');
    if (cards.length === 0) return;

    let currentIndex = 0;
    let isDragging = false;
    let startX = 0;
    let currentX = 0;
    let scrollLeft = 0;
    const dragThreshold = 50;
    let animationId = null;

    const leftArrow = _main.querySelector('.slider-arrow-left');
    const rightArrow = _main.querySelector('.slider-arrow-right');
    const dots = _main.querySelectorAll('.slider-dot');

    function updateArrowsAndDots() {
        leftArrow.style.display = currentIndex > 0 ? 'flex' : 'none';
        rightArrow.style.display = currentIndex < cards.length - 1 ? 'flex' : 'none';
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentIndex);
        });
    }

    function getCardWidth() {
        const containerWidth = slider.offsetWidth;
        const gap = 16;
        return containerWidth - gap;
    }
    
    function snapToCard(index, immediate = false) {
        const cardWidth = getCardWidth();
        const targetScroll = index * cardWidth;
        
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        
        if (immediate) {
            slider.scrollLeft = targetScroll;
        } else {
            slider.style.scrollBehavior = 'smooth';
            slider.scrollLeft = targetScroll;
            
            setTimeout(() => {
                slider.style.scrollBehavior = 'auto';
            }, 300);
        }
        
        currentIndex = Math.max(0, Math.min(index, cards.length - 1));
        updateArrowsAndDots();
    }

    function handleStart(clientX) {
        isDragging = true;
        startX = clientX;
        currentX = clientX;
        scrollLeft = slider.scrollLeft;
        slider.style.cursor = 'grabbing';
        slider.style.scrollBehavior = 'auto';
        
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function handleMove(clientX) {
        if (!isDragging) return;
        
        const deltaX = clientX - startX;
        const newScrollLeft = scrollLeft - deltaX;
        const maxScroll = slider.scrollWidth - slider.clientWidth;
        const constrainedScroll = Math.max(0, Math.min(newScrollLeft, maxScroll));
        
        slider.scrollLeft = constrainedScroll;
        currentX = clientX;
    }

    function handleEnd() {
        if (!isDragging) return;
        
        isDragging = false;
        slider.style.cursor = 'grab';
        
        const dragDistance = currentX - startX;
        const cardWidth = getCardWidth();
        const currentScroll = slider.scrollLeft;
        let targetIndex = Math.round(currentScroll / cardWidth);
        
        if (Math.abs(dragDistance) > dragThreshold) {
            if (dragDistance > 0 && currentIndex > 0) {
                targetIndex = currentIndex - 1;
            } else if (dragDistance < 0 && currentIndex < cards.length - 1) {
                targetIndex = currentIndex + 1;
            }
        }
        
        targetIndex = Math.max(0, Math.min(targetIndex, cards.length - 1));
        snapToCard(targetIndex);
    }

    leftArrow.addEventListener('click', () => {
        if (currentIndex > 0) {
            snapToCard(currentIndex - 1);
        }
    });

    rightArrow.addEventListener('click', () => {
        if (currentIndex < cards.length - 1) {
            snapToCard(currentIndex + 1);
        }
    });
  
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            snapToCard(index);
        });
    });

    slider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handleStart(e.clientX);
    });

    slider.addEventListener('mousemove', (e) => {
        handleMove(e.clientX);
    });

    slider.addEventListener('mouseup', handleEnd);
    slider.addEventListener('mouseleave', handleEnd);
    slider.addEventListener('touchstart', (e) => {
        handleStart(e.touches[0].clientX);
    }, { passive: true });

    slider.addEventListener('touchmove', (e) => {
        handleMove(e.touches[0].clientX);
    }, { passive: true });

    slider.addEventListener('touchend', handleEnd, { passive: true });
    slider.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' && currentIndex > 0) {
            e.preventDefault();
            snapToCard(currentIndex - 1);
        } else if (e.key === 'ArrowRight' && currentIndex < cards.length - 1) {
            e.preventDefault();
            snapToCard(currentIndex + 1);
        }
    });

    slider.tabIndex = 0;

    window.addEventListener('resize', () => {
        snapToCard(currentIndex, true);
    });

    slider.style.cursor = 'grab';
    
    requestAnimationFrame(() => {
        snapToCard(0, true);
        updateArrowsAndDots();
    });
}

async function handleGodSelection(godId) {
    try {
        const selectedGod = _gods.find(god => god.id == godId);
        if (!selectedGod) {
            displayMessage('Selected god not found. Please try again.');
            return;
        }

        const response = await _apiCall('/api/supabase/functions/v1/select-god', {
            method: 'POST',
            body: {
                player_id: _profile.id,
                god_id: godId
            }
        });

        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(errorResult.error || 'Failed to select god');
        }

        const result = await response.json();
        
        if (result.success) {
            displayMessage(`You have chosen to follow ${selectedGod.name}! May their blessings guide your journey.`);

            setTimeout(() => {
                window.gameAuth.loadModule('character_creation');
            }, 2000);
        } else {
            throw new Error(result.error || 'Failed to select god');
        }

    } catch (error) {
        console.error('Error selecting god:', error);
        displayMessage(error.message || 'Failed to select god. Please try again.');
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

let _main;
let _getCurrentProfile;
let _profile;

export async function loadModule(main, { getCurrentProfile }) {
    _main = main;
    _getCurrentProfile = getCurrentProfile;

    _profile = _getCurrentProfile();
    if (!_profile) {
        displayMessage('User profile not found. Please log in again.');
        window.gameAuth.loadModule('login');
        return;
    }

    _main.innerHTML = `
        <div class="settings-container">
            <div class="settings-header">
                <button class="fantasy-button back-btn" data-action="back">← Back</button>
                <h1>Settings</h1>
            </div>
            
            <div class="settings-content">
                <div class="setting-section">
                    <h2>Language / Язык</h2>
                    <div class="language-options">
                        <button class="language-btn ${getCurrentLanguage() === 'en' ? 'active' : ''}" data-lang="en">
                            <span class="flag">🇺🇸</span>
                            <span class="lang-name">English</span>
                        </button>
                        <button class="language-btn ${getCurrentLanguage() === 'ru' ? 'active' : ''}" data-lang="ru">
                            <span class="flag">🇷🇺</span>
                            <span class="lang-name">Русский</span>
                        </button>
                    </div>
                </div>
                
                <div class="setting-section">
                    <h2>Music</h2>
                    <div class="toggle-options">
                        <button class="toggle-btn ${getCurrentMusicSetting() === 'on' ? 'active' : ''}" data-setting="music" data-value="on">
                            <span class="toggle-icon">🎵</span>
                            <span class="toggle-label">On</span>
                        </button>
                        <button class="toggle-btn ${getCurrentMusicSetting() === 'off' ? 'active' : ''}" data-setting="music" data-value="off">
                            <span class="toggle-icon">🔇</span>
                            <span class="toggle-label">Off</span>
                        </button>
                    </div>
                </div>
                
                <div class="setting-section">
                    <h2 data-i18n="settings.other">Other Settings</h2>
                    <p data-i18n="settings.coming_soon">More settings coming soon...</p>
                </div>
            </div>
        </div>
    `;

    addSettingsStyles();
    setupSettingsInteractions();
}

function getCurrentLanguage() {
    return window.gameAuth.getCurrentLanguage();
}

function getCurrentMusicSetting() {
    return _profile?.settings?.music || 'on';
}

function setupSettingsInteractions() {
    _main.querySelector('.back-btn').addEventListener('click', () => {
        window.gameAuth.loadModule('castle');
    });

    _main.querySelectorAll('.language-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const selectedLang = e.currentTarget.dataset.lang;
            
            _main.querySelectorAll('.language-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            window.gameAuth.switchLanguage(selectedLang);
            
            const message = selectedLang === 'ru' ? 
                'Язык изменён на русский' : 
                'Language changed to English';
            displayMessage(message);
        });
    });

    _main.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const setting = e.currentTarget.dataset.setting;
            const value = e.currentTarget.dataset.value;
            
            if (setting === 'music') {
                _main.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                await updateProfileMusicSetting(value);
                window.gameAuth.setMusicEnabled(value === 'on');
                
                const message = value === 'on' ? 
                    'Music enabled' : 
                    'Music disabled';
                displayMessage(message);
            }
        });
    });
}

async function updateProfileMusicSetting(musicSetting) {
    try {
        const response = await fetch(`/api/profile/music/${_profile.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ music: musicSetting })
        });

        if (response.ok) {
            _profile.settings = {
                ...(_profile.settings || {}),
                music: musicSetting
            };
            localStorage.setItem('profile', JSON.stringify(_profile));
        }
    } catch (error) {}
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

function addSettingsStyles() {
    const styleId = 'settings-styles';
    if (document.getElementById(styleId)) {
        return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .settings-container {
            width: 100%;
            max-width: 600px;
            margin: 0 auto;
            padding: 2rem;
            color: #e0d8c9;
            font-family: 'Cinzel', serif;
        }

        .settings-header {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid #c4975a;
        }

        .settings-header h1 {
            color: #c4975a;
            font-size: 2rem;
            margin: 0;
            text-shadow: 2px 2px 0px #3d2914;
        }

        .back-btn {
            padding: 0.5rem 1rem;
            font-size: 1rem;
        }

        .settings-content {
            display: flex;
            flex-direction: column;
            gap: 2rem;
        }

        .setting-section {
            background: rgba(29, 20, 12, 0.6);
            border: 2px solid #3d2914;
            border-radius: 8px;
            padding: 1.5rem;
        }

        .setting-section h2 {
            color: #c4975a;
            font-size: 1.4rem;
            margin-bottom: 1rem;
            text-shadow: 1px 1px 0px #3d2914;
        }

        .language-options, .toggle-options {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .language-btn, .toggle-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 1rem 1.5rem;
            background: rgba(29, 20, 12, 0.8);
            border: 2px solid #3d2914;
            border-radius: 6px;
            color: #e0d8c9;
            font-family: 'Cinzel', serif;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            min-width: 120px;
        }

        .language-btn.active, .toggle-btn.active {
            background: linear-gradient(135deg, #c4975a, #8b6914);
            border-color: #c4975a;
            color: #ffffff;
            box-shadow: 0 2px 8px rgba(196, 151, 90, 0.3);
        }

        .language-btn .flag {
            font-size: 1.2rem;
        }

        .language-btn .lang-name {
            font-weight: bold;
        }

        .toggle-btn .toggle-icon {
            font-size: 1.2rem;
        }

        .toggle-btn .toggle-label {
            font-weight: bold;
        }

        .custom-message-box {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }

        .custom-message-box .message-content {
            background: linear-gradient(145deg, #1d140c, #2a1f16);
            border: 2px solid #c4975a;
            border-radius: 10px;
            padding: 2rem;
            text-align: center;
            color: #e0d8c9;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
            max-width: 80%;
            font-family: 'Cinzel', serif;
        }

        .custom-message-box .message-content p {
            margin-bottom: 1.5rem;
            font-size: 1.1rem;
        }

        .custom-message-box .message-ok-btn {
            padding: 0.75rem 2rem;
            font-size: 1rem;
            cursor: pointer;
        }

        @media (max-width: 768px) {
            .settings-container {
                padding: 1rem;
            }

            .language-options, .toggle-options {
                flex-direction: column;
            }

            .language-btn, .toggle-btn {
                justify-content: center;
                min-width: auto;
            }
        }
    `;
    document.head.appendChild(style);
}
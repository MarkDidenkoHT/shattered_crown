// character_data.js

let _apiCall;
let _profile;

export function initCharacterData(apiCall, profile) {
  _apiCall = apiCall;
  _profile = profile;
}

export async function loadPlayerCharacters() {
  console.log(`[CHARACTER_DATA] Loading characters for player ${_profile.id}`);
  try {
    const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=*`);
    const data = await response.json();

    if (!data || data.length === 0) {
      console.warn('[CHARACTER_DATA] No characters found.');
      return [];
    }

    console.log('[CHARACTER_DATA] Player characters loaded:', data);
    return data.map((char, index) => formatCharacter(char, 'player', index));
  } catch (error) {
    console.error('[CHARACTER_DATA] Error loading player characters:', error);
    return [];
  }
}

export async function loadEnemiesByNames(enemyNames) {
  console.log('[CHARACTER_DATA] Loading enemies:', enemyNames);
  try {
    const nameFilters = enemyNames.map(name => `name=eq.${encodeURIComponent(name)}`).join('&or=');
    const response = await _apiCall(`/api/supabase/rest/v1/enemies?or=(${nameFilters})&select=*`);
    const data = await response.json();

    if (!data || data.length === 0) {
      console.warn('[CHARACTER_DATA] No enemies found.');
      return [];
    }

    console.log('[CHARACTER_DATA] Enemies loaded:', data);
    return data.map((enemy, index) => formatCharacter(enemy, 'enemy', index));
  } catch (error) {
    console.error('[CHARACTER_DATA] Error loading enemies:', error);
    return [];
  }
}

function formatCharacter(raw, type, index) {
  const stats = raw.stats || {};

  const computedStats = {
    hp: (stats.vitality || 0) * 10,
    armor: Math.floor((stats.strength || 0) * 0.25),
    resistance: Math.floor((stats.spirit || 0) * 0.25),
  };

  return {
    id: raw.id || `${type}_${index}`,
    name: raw.name || `${type}_${index}`,
    type,
    spriteName: raw.sprite_name || 'placeholder',
    stats,
    ...computedStats,
    abilities: raw.starting_abilities || raw.abilities || [],
    position: null, // will be assigned based on spawn tiles
  };
}

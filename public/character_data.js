// character_data.js

let _apiCall;
let _profile;

export function initCharacterData(apiCall, profile) {
  _apiCall = apiCall;
  _profile = profile;
}

export async function loadPlayerCharacters(spawnPositions = []) {
  console.log(`[CHARACTER_DATA] Loading characters for player ${_profile.id}`);
  try {
    const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${_profile.id}&select=*`);
    const data = await response.json();

    if (!data || data.length === 0) {
      console.warn('[CHARACTER_DATA] No characters found.');
      return [];
    }

    console.log('[CHARACTER_DATA] Player characters loaded:', data);

    return data.map((char, index) => {
      const formatted = formatCharacter(char, 'player', index);
      // Assign spawn position if available
      if (spawnPositions[index]) {
        formatted.position = spawnPositions[index];
      } else {
        console.warn(`[CHARACTER_DATA] No spawn position for player character ${formatted.name}`);
      }
      return formatted;
    });
  } catch (error) {
    console.error('[CHARACTER_DATA] Error loading player characters:', error);
    return [];
  }
}

export async function loadEnemiesByNames(enemyNames = [], spawnPositions = []) {
  console.log('[CHARACTER_DATA] Loading enemies:', enemyNames);

  try {
    const uniqueNames = [...new Set(enemyNames)];
    const conditions = uniqueNames.map(name => `name.eq.${encodeURIComponent(name)}`).join(',');
    const query = `/api/supabase/rest/v1/enemies?select=*&or=(${conditions})`;

    const response = await _apiCall(query);
    const data = await response.json();

    if (!data || data.length === 0) {
      console.warn('[CHARACTER_DATA] No enemies found.');
      return [];
    }

    console.log('[CHARACTER_DATA] Enemies loaded:', data);

    return data.map((enemy, index) => {
      const formatted = formatCharacter(enemy, 'enemy', index);
      if (spawnPositions[index]) {
        formatted.position = spawnPositions[index];
      } else {
        console.warn(`[CHARACTER_DATA] No spawn position for enemy ${formatted.name}`);
      }
      return formatted;
    });
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

// character_data.js

let _apiCall;

export function initCharacterData(apiCall) {
  _apiCall = apiCall;
}

export async function loadPlayerCharacters(playerId) {
  console.log(`[CHARACTER_DATA] Loading characters for player ${playerId}`);
  const { data, error } = await _apiCall('characters', {
    select: '*',
    match: { player_id: playerId },
    limit: 3
  });

  if (error || !data || data.length === 0) {
    console.error('[CHARACTER_DATA] Error loading player characters:', error);
    return [];
  }

  return data.map((char, index) => formatCharacter(char, 'player', index));
}

export async function loadEnemiesByNames(enemyNames) {
  console.log('[CHARACTER_DATA] Loading enemies:', enemyNames);
  const { data, error } = await _apiCall('enemies', {
    select: '*',
    in: { name: enemyNames }
  });

  if (error || !data || data.length === 0) {
    console.error('[CHARACTER_DATA] Error loading enemies:', error);
    return [];
  }

  return data.map((enemy, index) => formatCharacter(enemy, 'enemy', index));
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
    stats,
    ...computedStats,
    abilities: raw.starting_abilities || raw.abilities || [],
    position: null // Will be assigned by layout
  };
}

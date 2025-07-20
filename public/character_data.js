let _apiCall = null;
let _profile = null;

export function initCharacterData(apiCall, profile) {
  _apiCall = apiCall;
  _profile = profile;
}

export async function loadPlayerCharacters(playerId, spawnPositions = []) {
  console.log('[CHARACTER_DATA] Loading characters for player', playerId);

  const response = await _apiCall(`/api/supabase/rest/v1/characters?player_id=eq.${playerId}&select=*`);
  const rows = await response.json();

  const formatted = rows.map((raw, index) => {
    const char = formatCharacter(raw);
    char.position = spawnPositions[index] || null;
    return char;
  });

  console.log('[CHARACTER_DATA] Player characters loaded:', formatted);
  return formatted;
}

export async function loadEnemiesByNames(names = [], spawnPositions = []) {
  // Deduplicate names (optional)
  const uniqueNames = [...new Set(names)];

  console.log('[CHARACTER_DATA] Loading enemies:', uniqueNames);

  if (uniqueNames.length === 0) return [];

  const filter = uniqueNames.map(n => `name.eq.${n}`).join(',');
  const response = await _apiCall(`/api/supabase/rest/v1/enemies?select=*&or=(${filter})`);

  if (!response.ok) {
    console.error('[CHARACTER_DATA] Error loading enemies:', response.statusText);
    throw new Error(`Failed to fetch enemies. Status: ${response.status}`);
  }

  const rows = await response.json();

  // Map enemy types to count how many of each to spawn
  const enemyCount = {};
  names.forEach(n => { enemyCount[n] = (enemyCount[n] || 0) + 1; });

  const result = [];

  uniqueNames.forEach(name => {
    const enemyData = rows.find(e => e.name === name);
    if (!enemyData) return;

    for (let i = 0; i < enemyCount[name]; i++) {
      const instance = formatCharacter(enemyData);
      const spawnIndex = result.length;
      instance.position = spawnPositions[spawnIndex] || null;
      result.push(instance);
    }
  });

  console.log('[CHARACTER_DATA] Enemies loaded:', result);
  return result;
}

export function formatCharacter(raw) {
  const stats = typeof raw.stats === 'string' ? JSON.parse(raw.stats || '{}') : (raw.stats || {});

  const maxHp = stats.hp || 100;
  const char = {
    id: raw.id,
    name: raw.name || 'Unnamed',
    type: raw.player_id ? 'player' : 'enemy',
    spriteName: raw.sprite_name || 'placeholder',
    position: null,
    stats: {
      hp: maxHp,
      maxHp,
      armor: stats.armor || 0,
      resistance: stats.resistance || 0,
      strength: stats.strength || 0,
      agility: stats.agility || 0,
      intelligence: stats.intelligence || 0,
      speed: stats.speed || 0
    },
    abilities: raw.abilities || [],
  };

  return char;
}

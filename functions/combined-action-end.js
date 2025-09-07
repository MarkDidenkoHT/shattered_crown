import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function handleRequest(request) {
  const { battleId, characterId, currentPosition, targetPosition, action } = await request.json();

  // Perform necessary updates to the battle state
  // ...

  // After all updates, fetch the latest battle state
  const { data: updatedBattleState, error: fetchUpdatedError } = await supabase
    .from('battle_state')
    .select('*')
    .eq('id', battleId)
    .single();

  if (fetchUpdatedError || !updatedBattleState) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to fetch updated battle state.'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Turn processed successfully.',
    characterId,
    nextTurn: newCurrentTurn,
    round: newRoundNumber,
    turnSwitched,
    roundCompleted,
    battleState: updatedBattleState // <-- Return the updated battle state
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
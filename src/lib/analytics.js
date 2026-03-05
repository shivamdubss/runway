import { supabase } from './supabase';

/**
 * Fire-and-forget event tracking. Never throws — a telemetry failure
 * must never break the user-facing action.
 *
 * @param {string} eventType
 * @param {object} [eventData]
 */
export async function track(eventType, eventData = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('events').insert({
      user_id: user.id,
      event_type: eventType,
      event_data: eventData,
    });
  } catch {
    // Intentionally silent — telemetry must never break the app
  }
}

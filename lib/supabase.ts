import { createClient } from "@supabase/supabase-js";

// Portal KKQ is the production data source. These are public browser settings,
// not service-role credentials; access to rows remains protected by Supabase RLS.
const supabaseUrl = "https://ozdkphtsipnspiqkppnp.supabase.co";
const supabasePublishableKey = "sb_publishable_q8Oj_7dkOzHEU1ofgZkWQQ_lF2sfo6k";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

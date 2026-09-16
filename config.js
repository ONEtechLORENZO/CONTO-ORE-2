// ============================================================
//  One Tech - Tracker Ore - configuration
//  Fill these two values from Supabase -> Project Settings -> API
//  (the anon key is PUBLIC by design; data is protected by RLS)
// ============================================================
window.ONETECH_CONFIG = {
  SUPABASE_URL: "https://lkctpypszrsvisigakcf.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_N64_Ihv_oa-qvSfxvmQwRg_IPNm_XQH",

  // Logins are by username (e.g. MARAT). Supabase needs an e-mail,
  // so usernames are mapped to <username>@<this domain>. No e-mail is ever sent.
  AUTH_EMAIL_DOMAIN: "onetech.local",

  // Default password pattern for new employees: PREFIX + First initial + last initial
  // e.g. Mario Rossi -> 301301Mr
  DEFAULT_PASSWORD_PREFIX: "301301",

  // Company name shown in the header
  COMPANY: "One Tech",
};

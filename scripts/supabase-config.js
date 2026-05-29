export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_ANON_KEY = 'TU_SUPABASE_ANON_KEY';
export const SUPABASE_TABLE_PUBLICACIONES = 'publicaciones';

export function supabaseConfigurado() {
  return (
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('TU-PROYECTO') &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_ANON_KEY.includes('TU_SUPABASE_ANON_KEY')
  );
}

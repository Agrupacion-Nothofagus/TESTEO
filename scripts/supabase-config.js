export const SUPABASE_URL = 'https://wzfnjychxjcpayaajjih.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Zm5qeWNoeGpjcGF5YWFqamloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzAwMjQsImV4cCI6MjA5NTc0NjAyNH0.PrEArFRHwervfv-taNKNQvNbLCVXcmKHWh5lB1wcvEI';
export const SUPABASE_TABLE_PUBLICACIONES = 'publicaciones';

export function supabaseConfigurado() {
  return (
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('TU-PROYECTO') &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_ANON_KEY.includes('TU_SUPABASE_ANON_KEY')
  );
}

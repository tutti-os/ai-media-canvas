export function getSupabaseBrowserClient(): never {
  throw new Error(
    "Supabase browser client has been removed in the standalone build.",
  );
}

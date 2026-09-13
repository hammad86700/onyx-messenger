import { createClient } from './supabase/client';

export const supabase = createClient();
export { createClient };
export default supabase;

import { getSessionUser } from '@/lib/supabase/server';
import { HeaderNav } from '@/components/HeaderNav';

export async function Header() {
  let userEmail: string | null = null;

  try {
    const user = await getSessionUser();
    userEmail = user?.email ?? null;
  } catch {
    userEmail = null;
  }

  return <HeaderNav userEmail={userEmail} />;
}

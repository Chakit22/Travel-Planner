'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const STORAGE_KEY = 'atlas_user_id';

export function HeaderRail() {
  const router = useRouter();
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSignedIn(!!localStorage.getItem(STORAGE_KEY));
  }, [pathname]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    setSignedIn(false);
    router.push('/login');
  };

  return (
    <div className="flex items-center gap-5">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
        Memory · Companion
      </span>
      {signedIn && (
        <button
          type="button"
          onClick={handleLogout}
          className="
            h-7 px-3 rounded-full border border-[var(--color-ink-line)]
            font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em]
            text-[var(--color-text-tertiary)]
            hover:border-[var(--color-danger)]/50 hover:text-[var(--color-danger)]
            transition-colors duration-200
          "
          title="Sign out"
        >
          Sign out
        </button>
      )}
    </div>
  );
}

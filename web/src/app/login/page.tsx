'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser } from '@/lib/api';
import { motion } from 'framer-motion';

const STORAGE_KEY = 'atlas_user_id';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const user = await loginUser(email.trim(), password);
      localStorage.setItem(STORAGE_KEY, user.id);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--color-brass-dim)] mb-4">
          Atlas · Return
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-[300] tracking-[-0.025em] text-[var(--color-text-primary)] mb-3 leading-[1.05]">
          Welcome back<span className="text-[var(--color-violet-bright)]">.</span>
        </h1>
        <p className="text-[var(--color-text-secondary)] text-[15px] mb-10 leading-relaxed">
          Sign in. Atlas remembers where you&apos;ve been.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)] mb-2"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="
                w-full bg-[var(--color-ink-paper)] border border-[var(--color-ink-line)]
                rounded-sm px-4 py-3 text-[15px] text-[var(--color-text-primary)]
                placeholder:text-[var(--color-text-tertiary)]
                focus:outline-none focus:border-[var(--color-violet-bright)] focus:ring-1 focus:ring-[var(--color-violet-bright)]/40
                transition-colors
              "
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)] mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="
                w-full bg-[var(--color-ink-paper)] border border-[var(--color-ink-line)]
                rounded-sm px-4 py-3 text-[15px] text-[var(--color-text-primary)]
                placeholder:text-[var(--color-text-tertiary)]
                focus:outline-none focus:border-[var(--color-violet-bright)] focus:ring-1 focus:ring-[var(--color-violet-bright)]/40
                transition-colors
              "
            />
          </div>

          {error && (
            <p className="text-[var(--color-danger)] text-[13px] font-[family-name:var(--font-mono)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="
              w-full h-11 rounded-full
              border border-[var(--color-brass)] bg-transparent
              text-[var(--color-brass)] text-[11px] uppercase tracking-[0.32em] font-[family-name:var(--font-mono)]
              hover:bg-[var(--color-brass)]/10
              transition-all duration-200
              disabled:opacity-30 disabled:cursor-not-allowed
            "
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <p className="text-[13px] text-[var(--color-text-secondary)] text-center mt-8">
          No account?{' '}
          <a href="/signup" className="text-[var(--color-violet-glow)] hover:text-[var(--color-violet-bright)] underline underline-offset-4">
            Create one
          </a>
        </p>
      </motion.div>
    </div>
  );
}

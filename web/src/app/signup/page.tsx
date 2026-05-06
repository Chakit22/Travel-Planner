'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUser } from '@/lib/api';
import { motion } from 'framer-motion';

const STORAGE_KEY = 'atlas_user_id';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const user = await createUser(name.trim(), email.trim(), password);
      localStorage.setItem(STORAGE_KEY, user.id);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full bg-[var(--color-ink-paper)] border border-[var(--color-ink-line)] rounded-sm px-4 py-3 text-[15px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-violet-bright)] focus:ring-1 focus:ring-[var(--color-violet-bright)]/40 transition-colors';
  const labelCls =
    'block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)] mb-2';

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--color-brass-dim)] mb-4">
          Atlas · Begin
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-[300] tracking-[-0.025em] text-[var(--color-text-primary)] mb-3 leading-[1.05]">
          Create an account<span className="text-[var(--color-violet-bright)]">.</span>
        </h1>
        <p className="text-[var(--color-text-secondary)] text-[15px] mb-10 leading-relaxed">
          Atlas will start remembering you from trip one.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className={labelCls}>Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="email" className={labelCls}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputCls}
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
            {loading ? 'Creating…' : 'Create account →'}
          </button>
        </form>

        <p className="text-[13px] text-[var(--color-text-secondary)] text-center mt-8">
          Already have an account?{' '}
          <a
            href="/login"
            className="text-[var(--color-violet-glow)] hover:text-[var(--color-violet-bright)] underline underline-offset-4"
          >
            Sign in
          </a>
        </p>
      </motion.div>
    </div>
  );
}

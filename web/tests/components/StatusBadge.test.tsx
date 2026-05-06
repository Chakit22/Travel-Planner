import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders draft status with amber styling', () => {
    render(<StatusBadge status="draft" />);
    const badge = screen.getByText('draft');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('border');
    expect(badge.className).toContain('amber');
  });

  it('renders approved status with green styling', () => {
    render(<StatusBadge status="approved" />);
    const badge = screen.getByText('approved');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('green');
  });

  it('renders unknown status without crashing', () => {
    render(<StatusBadge status="banana" />);
    expect(screen.getByText('banana')).toBeInTheDocument();
  });
});

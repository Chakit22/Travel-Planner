import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionBanner } from '@/components/SuggestionBanner';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock api
vi.mock('@/lib/api', () => ({
  updateTrip: vi.fn(() => Promise.resolve({})),
}));

const mockSuggestions = [
  {
    type: 'weather',
    reason: 'Rain forecast added for May 2',
    newItinerary: 'Updated DAY 1: Indoor museum visit...',
    createdAt: '2026-03-25T00:00:00Z',
  },
];

describe('SuggestionBanner', () => {
  it('renders nothing when no suggestions', () => {
    const { container } = render(
      <SuggestionBanner tripId="123" suggestions={[]} onUpdate={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders weather change message', () => {
    render(
      <SuggestionBanner tripId="123" suggestions={mockSuggestions} onUpdate={() => {}} />,
    );
    expect(screen.getByText('Weather changed for your trip')).toBeInTheDocument();
    expect(screen.getByText('Rain forecast added for May 2')).toBeInTheDocument();
  });

  it('renders Accept and Dismiss buttons', () => {
    render(
      <SuggestionBanner tripId="123" suggestions={mockSuggestions} onUpdate={() => {}} />,
    );
    expect(screen.getByText('Accept')).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });

  it('renders preview toggle', () => {
    render(
      <SuggestionBanner tripId="123" suggestions={mockSuggestions} onUpdate={() => {}} />,
    );
    expect(screen.getByText('Preview changes')).toBeInTheDocument();
  });

  it('shows preview content on toggle click', () => {
    render(
      <SuggestionBanner tripId="123" suggestions={mockSuggestions} onUpdate={() => {}} />,
    );
    fireEvent.click(screen.getByText('Preview changes'));
    expect(screen.getByText(/Updated DAY 1/)).toBeInTheDocument();
    expect(screen.getByText('Hide preview')).toBeInTheDocument();
  });

  it('calls updateTrip with acceptSuggestion on Accept click', async () => {
    const { updateTrip } = await import('@/lib/api');
    const onUpdate = vi.fn();
    render(
      <SuggestionBanner tripId="123" suggestions={mockSuggestions} onUpdate={onUpdate} />,
    );
    fireEvent.click(screen.getByText('Accept'));
    expect(updateTrip).toHaveBeenCalledWith('123', { acceptSuggestion: 0 });
  });

  it('calls updateTrip with dismissSuggestion on Dismiss click', async () => {
    const { updateTrip } = await import('@/lib/api');
    const onUpdate = vi.fn();
    render(
      <SuggestionBanner tripId="123" suggestions={mockSuggestions} onUpdate={onUpdate} />,
    );
    fireEvent.click(screen.getByText('Dismiss'));
    expect(updateTrip).toHaveBeenCalledWith('123', { dismissSuggestion: 0 });
  });

  it('renders multiple suggestions', () => {
    const multi = [
      ...mockSuggestions,
      { type: 'weather', reason: 'Temperature dropped 15C', newItinerary: 'Cold plan...', createdAt: '2026-03-25T06:00:00Z' },
    ];
    render(
      <SuggestionBanner tripId="123" suggestions={multi} onUpdate={() => {}} />,
    );
    const headings = screen.getAllByText('Weather changed for your trip');
    expect(headings).toHaveLength(2);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TripCard } from '@/components/TripCard';
import type { Trip } from '@/lib/api';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

const baseTripData: Trip = {
  id: '123',
  userId: 'u1',
  destination: 'Tokyo',
  origin: 'Melbourne',
  departureDate: '2026-05-01',
  returnDate: '2026-05-05',
  travelers: 2,
  status: 'draft',
  itinerary: null,
  itineraryVersion: 1,
  suggestions: [],
  createdAt: '2026-03-25',
  updatedAt: '2026-03-25',
};

describe('TripCard', () => {
  it('renders destination as heading', () => {
    render(<TripCard trip={baseTripData} index={0} />);
    expect(screen.getByText('Tokyo')).toBeInTheDocument();
  });

  it('renders origin', () => {
    render(<TripCard trip={baseTripData} index={0} />);
    expect(screen.getByText('From Melbourne')).toBeInTheDocument();
  });

  it('renders traveler count', () => {
    render(<TripCard trip={baseTripData} index={0} />);
    expect(screen.getByText('2 travelers')).toBeInTheDocument();
  });

  it('renders singular traveler', () => {
    const trip = { ...baseTripData, travelers: 1 };
    render(<TripCard trip={trip} index={0} />);
    expect(screen.getByText('1 traveler')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<TripCard trip={baseTripData} index={0} />);
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('renders "New Trip" when no destination', () => {
    const trip = { ...baseTripData, destination: null };
    render(<TripCard trip={trip} index={0} />);
    expect(screen.getByText('New Trip')).toBeInTheDocument();
  });

  it('shows itinerary version when itinerary exists', () => {
    const trip = { ...baseTripData, itinerary: 'Day 1...', itineraryVersion: 3 };
    render(<TripCard trip={trip} index={0} />);
    expect(screen.getByText('Itinerary v3')).toBeInTheDocument();
  });

  it('shows suggestion count badge when suggestions exist', () => {
    const trip = {
      ...baseTripData,
      suggestions: [{ type: 'weather', reason: 'Rain', newItinerary: '...', createdAt: '2026-03-25' }],
    };
    render(<TripCard trip={trip} index={0} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('links to trip detail page', () => {
    render(<TripCard trip={baseTripData} index={0} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/trip/123');
  });

  it('handles missing dates gracefully', () => {
    const trip = { ...baseTripData, departureDate: null, returnDate: null };
    render(<TripCard trip={trip} index={0} />);
    // Should not crash and should not render date text
    expect(screen.getByText('Tokyo')).toBeInTheDocument();
  });

  it('handles missing origin gracefully', () => {
    const trip = { ...baseTripData, origin: null };
    render(<TripCard trip={trip} index={0} />);
    expect(screen.queryByText(/From/)).not.toBeInTheDocument();
  });

  it('handles missing travelers gracefully', () => {
    const trip = { ...baseTripData, travelers: null };
    render(<TripCard trip={trip} index={0} />);
    expect(screen.queryByText(/traveler/)).not.toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ItineraryView } from '@/components/ItineraryView';

describe('ItineraryView', () => {
  it('renders heading with version', () => {
    render(<ItineraryView markdown="Hello" version={2} />);
    expect(screen.getByText('Your Itinerary')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('renders markdown content', () => {
    const md = `# Day 1

Visit the temple.`;
    render(<ItineraryView markdown={md} version={1} />);
    expect(screen.getByText('Day 1')).toBeInTheDocument();
    expect(screen.getByText('Visit the temple.')).toBeInTheDocument();
  });

  it('renders bold text with navy color', () => {
    render(<ItineraryView markdown="**Important note**" version={1} />);
    const strong = screen.getByText('Important note');
    expect(strong.tagName).toBe('STRONG');
  });

  it('renders lists', () => {
    const md = `- Item 1
- Item 2
- Item 3`;
    render(<ItineraryView markdown={md} version={1} />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
  });

  it('handles empty markdown', () => {
    render(<ItineraryView markdown="" version={1} />);
    expect(screen.getByText('Your Itinerary')).toBeInTheDocument();
  });
});

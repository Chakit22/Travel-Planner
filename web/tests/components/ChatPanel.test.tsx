import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from '@/components/ChatPanel';

// Mock the api module
vi.mock('@/lib/api', () => ({
  streamChat: vi.fn(() => ({ abort: vi.fn() })),
}));

describe('ChatPanel', () => {
  it('renders empty state message', () => {
    render(<ChatPanel tripId="123" />);
    expect(screen.getByText(/Start planning your trip/)).toBeInTheDocument();
    expect(screen.getByText(/Tell Atlas where you want to go/)).toBeInTheDocument();
  });

  it('renders input field with placeholder', () => {
    render(<ChatPanel tripId="123" />);
    const input = screen.getByPlaceholderText('Tell Atlas about your trip...');
    expect(input).toBeInTheDocument();
  });

  it('renders send button', () => {
    render(<ChatPanel tripId="123" />);
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('send button is disabled when input is empty', () => {
    render(<ChatPanel tripId="123" />);
    const btn = screen.getByText('Send');
    expect(btn).toBeDisabled();
  });

  it('send button is enabled when input has text', () => {
    render(<ChatPanel tripId="123" />);
    const input = screen.getByPlaceholderText('Tell Atlas about your trip...');
    fireEvent.change(input, { target: { value: 'Hello' } });
    const btn = screen.getByText('Send');
    expect(btn).not.toBeDisabled();
  });

  it('adds user message to chat on send', async () => {
    const { streamChat } = await import('@/lib/api');
    render(<ChatPanel tripId="123" />);

    const input = screen.getByPlaceholderText('Tell Atlas about your trip...');
    fireEvent.change(input, { target: { value: 'Plan a trip to Tokyo' } });
    fireEvent.click(screen.getByText('Send'));

    expect(screen.getByText('Plan a trip to Tokyo')).toBeInTheDocument();
    expect(streamChat).toHaveBeenCalledWith('123', 'Plan a trip to Tokyo', expect.any(Function));
  });

  it('clears input after send', () => {
    render(<ChatPanel tripId="123" />);
    const input = screen.getByPlaceholderText('Tell Atlas about your trip...') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByText('Send'));
    expect(input.value).toBe('');
  });

  it('does not send on empty input', async () => {
    const { streamChat } = await import('@/lib/api');
    (streamChat as any).mockClear();

    render(<ChatPanel tripId="123" />);
    fireEvent.click(screen.getByText('Send'));
    expect(streamChat).not.toHaveBeenCalled();
  });
});

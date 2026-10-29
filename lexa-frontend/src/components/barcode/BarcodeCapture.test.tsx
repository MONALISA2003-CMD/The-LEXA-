import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BarcodeCapture } from './BarcodeCapture';

describe('BarcodeCapture', () => {
  it('submits an entered code without requiring camera support', async () => {
    const onCode = vi.fn();
    render(<BarcodeCapture onCode={onCode} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Barcode, SKU or product code' }), { target: { value: 'SKU-12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use code' }));
    await waitFor(() => expect(onCode).toHaveBeenCalledWith('SKU-12345'));
  });
  it('keeps the video element mounted so camera streams can attach before activation', () => {
    render(<BarcodeCapture onCode={vi.fn()} />);
    expect(document.querySelector('.barcode-camera-frame video')).toBeInTheDocument();
  });

  it('does not submit an empty code', () => {
    const onCode = vi.fn();
    render(<BarcodeCapture onCode={onCode} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use code' }));
    expect(onCode).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Enter or scan a barcode first.');
  });
});

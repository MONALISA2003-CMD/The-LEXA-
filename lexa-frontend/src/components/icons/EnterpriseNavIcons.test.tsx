import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { navigationIcons } from './EnterpriseNavIcons';

describe('LEXA sidebar security icon', () => {
  it('renders the custom shield with the same sizing and accessibility rules as other navigation icons', () => {
    const ShieldCheck = navigationIcons.ShieldCheck;
    const { container } = render(<ShieldCheck size={20} strokeWidth={2} />);
    const shield = container.querySelector('svg');
    expect(shield).not.toBeNull();
    expect(shield).toHaveAttribute('aria-hidden', 'true');
    expect(shield).toHaveAttribute('width', '20');
    expect(shield).toHaveAttribute('stroke-width', '2');
    expect(shield?.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
  });
});

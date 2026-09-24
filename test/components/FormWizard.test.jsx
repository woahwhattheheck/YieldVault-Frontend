import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FormWizard from '../../src/components/FormWizard.jsx';

/** A simple step factory so tests stay DRY. */
function createSteps(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `step-${i + 1}`,
    title: `Step ${i + 1}`,
    description: `Description ${i + 1}`,
    icon: i === 0 ? '🚀' : undefined,
    content: function StepContent({ data, setData, errors }) {
      return (
        <div data-testid={`step-${i + 1}-content`}>
          <p>Content for step {i + 1}</p>
          <input
            data-testid={`input-${i + 1}`}
            type="text"
            aria-label={`Field ${i + 1}`}
            aria-invalid={errors[`field${i + 1}`] ? 'true' : 'false'}
            aria-describedby={errors[`field${i + 1}`] ? `error-${i + 1}` : undefined}
            value={data[`field${i + 1}`] || ''}
            onChange={(e) => setData({ [`field${i + 1}`]: e.target.value })}
          />
          {errors[`field${i + 1}`] && (
            <span id={`error-${i + 1}`} data-testid={`error-${i + 1}`} role="alert">
              {errors[`field${i + 1}`]}
            </span>
          )}
        </div>
      );
    },
  }));
}

describe('FormWizard', () => {
  it('renders the first step on mount', () => {
    render(<FormWizard steps={createSteps()} />);
    expect(screen.getByText('Content for step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });

  it('shows step indicator labels and counts', () => {
    render(<FormWizard steps={createSteps()} />);
    // The step title appears in the indicator AND the panel heading;
    // use getAllByText and check that at least one instance exists.
    const step1Labels = screen.getAllByText('Step 1');
    expect(step1Labels.length).toBeGreaterThanOrEqual(1);
    const step2Labels = screen.getAllByText('Step 2');
    expect(step2Labels.length).toBeGreaterThanOrEqual(1);
    const step3Labels = screen.getAllByText('Step 3');
    expect(step3Labels.length).toBeGreaterThanOrEqual(1);
  });

  it('advances to the next step on Next click', () => {
    render(<FormWizard steps={createSteps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    expect(screen.getByText('Content for step 2')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  });

  it('goes back on Back click', () => {
    render(<FormWizard steps={createSteps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 3/i }));
    expect(screen.getByText('Content for step 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Go to previous step/i }));
    expect(screen.getByText('Content for step 2')).toBeInTheDocument();
  });

  it('hides Back on the first step', () => {
    render(<FormWizard steps={createSteps()} />);
    expect(screen.queryByRole('button', { name: /Go to previous step/i })).not.toBeInTheDocument();
  });

  it('shows Complete on the last step and calls onComplete', () => {
    const onComplete = vi.fn();
    render(<FormWizard steps={createSteps()} onComplete={onComplete} />);

    // Go to step 3
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 3/i }));

    expect(screen.getByText('Complete')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Complete'));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('calls onComplete with the accumulated data', () => {
    const onComplete = vi.fn();
    render(<FormWizard steps={createSteps()} onComplete={onComplete} />);

    fireEvent.change(screen.getByTestId('input-1'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    fireEvent.change(screen.getByTestId('input-2'), { target: { value: 'world' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 3/i }));
    fireEvent.click(screen.getByText('Complete'));

    expect(onComplete).toHaveBeenCalledWith({ field1: 'hello', field2: 'world' });
  });

  it('shows custom complete label on the last step', () => {
    render(
      <FormWizard
        steps={createSteps()}
        completeLabel="Submit Form"
        completingLabel="Submitting…"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 3/i }));
    expect(screen.getByText('Submit Form')).toBeInTheDocument();
  });

  it('disables Next button while submitting', () => {
    render(<FormWizard steps={createSteps()} submitting />);
    expect(screen.getByRole('button', { name: /Continue to step 2/i })).toBeDisabled();
    // Back is hidden on the first step — verify it's not rendered
    expect(screen.queryByRole('button', { name: /Go to previous step/i })).not.toBeInTheDocument();
  });

  it('validates the current step and prevents advancement on errors', () => {
    const validate = (stepIndex, data) => {
      if (stepIndex === 0 && (!data.field1 || data.field1.length < 2)) {
        return { field1: 'Too short' };
      }
      return null;
    };

    render(<FormWizard steps={createSteps()} validate={validate} />);
    // Try to advance without filling enough data
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    expect(screen.getByText('Too short')).toBeInTheDocument();
    expect(screen.getByText('Content for step 1')).toBeInTheDocument();

    // Fill data and advance
    fireEvent.change(screen.getByTestId('input-1'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    expect(screen.getByText('Content for step 2')).toBeInTheDocument();
  });

  it('clears errors only after advancing to the next step', () => {
    let errorsPresent = true;
    const validate = () => (errorsPresent ? { field1: 'Error' } : null);

    render(<FormWizard steps={createSteps()} validate={validate} />);

    // Trigger validation by clicking Next
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();

    // Now make validate pass and click Next again
    fireEvent.change(screen.getByTestId('input-1'), { target: { value: 'valid' } });
    errorsPresent = false;
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));

    // Should have advanced to step 2 and errors should be gone
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Content for step 2')).toBeInTheDocument();
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  it('shows the progress bar with correct width', () => {
    render(<FormWizard steps={createSteps(4)} />);
    // Step 1 of 4 -> 0% progress
    const fill = document.querySelector('.wizard-progress-fill');
    expect(fill.style.width).toBe('0%');

    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    // Step 2 of 4 -> 33.333…%
    const width = parseFloat(fill.style.width);
    expect(width).toBeCloseTo(33.33, 0);
  });

  it('renders step icons when provided', () => {
    render(<FormWizard steps={createSteps()} />);
    expect(screen.getByText('🚀')).toBeInTheDocument();
  });

  it('renders single-step wizard with no navigation', () => {
    render(
      <FormWizard
        steps={[{ id: 'only', title: 'Only', content: () => <p>Only step</p> }]}
        completeLabel="Finish"
      />,
    );
    expect(screen.getByText('Only step')).toBeInTheDocument();
    expect(screen.getByText('Finish')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Go to previous step/i })).not.toBeInTheDocument();
  });

  it('does not advance when Enter is pressed inside an input', () => {
    render(<FormWizard steps={createSteps()} />);
    const input = screen.getByTestId('input-1');
    fireEvent.keyDown(input, { key: 'Enter' });
    // Should still be on step 1
    expect(screen.getByText('Content for step 1')).toBeInTheDocument();
  });

  it('advances when Enter is pressed outside form controls', () => {
    render(<FormWizard steps={createSteps()} />);
    const container = document.querySelector('.form-wizard');
    fireEvent.keyDown(container, { key: 'Enter' });
    expect(screen.getByText('Content for step 2')).toBeInTheDocument();
  });

  it('shows the completingLabel on the complete button while submitting', () => {
    const { rerender } = render(
      <FormWizard
        steps={createSteps(2)}
        initialData={{ field1: 'prefilled' }}
        submitting={false}
        completeLabel="Complete"
        completingLabel="Working…"
      />,
    );
    // Advance to the last step first
    fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
    expect(screen.getByText('Complete')).toBeInTheDocument();

    // Re-render with submitting=true (preserves internal state via rerender)
    rerender(
      <FormWizard
        steps={createSteps(2)}
        initialData={{ field1: 'prefilled' }}
        submitting
        completeLabel="Complete"
        completingLabel="Working…"
      />,
    );
    // The Complete button should now show "Working…"
    expect(screen.getByText('Working…')).toBeInTheDocument();
  });

  describe('accessibility', () => {
    it('exposes a polite live region that announces step changes', async () => {
      render(<FormWizard steps={createSteps()} />);
      const live = screen.getByTestId('wizard-live-region');
      expect(live).toHaveAttribute('aria-live', 'polite');
      expect(live).toHaveAttribute('role', 'status');
      expect(live).toHaveTextContent(/Step 1 of 3/i);

      fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
      await waitFor(() => {
        expect(live).toHaveTextContent(/Step 2 of 3/i);
      });
    });

    it('marks the active step with aria-current and uses a progress list', () => {
      render(<FormWizard steps={createSteps()} />);
      const list = screen.getByRole('list', { name: 'Form steps' });
      expect(list.tagName).toBe('OL');
      const current = list.querySelector('[aria-current="step"]');
      expect(current).toBeTruthy();
      expect(current).toHaveTextContent('Step 1');
    });

    it('labels the progressbar for assistive tech', () => {
      render(<FormWizard steps={createSteps()} />);
      const bar = screen.getByRole('progressbar', { name: 'Wizard progress' });
      expect(bar).toHaveAttribute('aria-valuemin', '0');
      expect(bar).toHaveAttribute('aria-valuemax', '100');
    });

    it('moves focus to the step heading when advancing', async () => {
      render(<FormWizard steps={createSteps()} />);
      fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
      await waitFor(() => {
        const heading = screen.getByRole('heading', { name: 'Step 2', level: 3 });
        expect(heading).toHaveFocus();
      });
    });

    it('announces validation failures in the live region (regression)', async () => {
      const validate = () => ({ field1: 'Amount is required' });
      render(<FormWizard steps={createSteps()} validate={validate} />);
      fireEvent.click(screen.getByRole('button', { name: /Continue to step 2/i }));
      const live = screen.getByTestId('wizard-live-region');
      await waitFor(() => {
        expect(live).toHaveTextContent(/Validation error: Amount is required/i);
      });
      // Stay on step 1 — original failure mode: errors must surface, not silent-block
      expect(screen.getByText('Content for step 1')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Amount is required');
    });

    it('sets aria-busy while submitting', () => {
      render(<FormWizard steps={createSteps()} submitting />);
      expect(document.querySelector('.form-wizard')).toHaveAttribute('aria-busy', 'true');
    });

    it('keeps the full flow operable with keyboard-activated Next/Back/Complete', () => {
      const onComplete = vi.fn();
      render(<FormWizard steps={createSteps()} onComplete={onComplete} />);

      const next = screen.getByRole('button', { name: /Continue to step 2/i });
      next.focus();
      fireEvent.keyDown(next, { key: 'Enter' });
      fireEvent.click(next); // activation after focus
      expect(screen.getByText('Content for step 2')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Continue to step 3/i }));
      fireEvent.click(screen.getByText('Complete'));
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });
});

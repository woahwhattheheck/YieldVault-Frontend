import { useState, useCallback, useRef, useEffect, useId } from 'react';

/**
 * A reusable multi-step form wizard with animated step transitions,
 * progress tracking, validation support, keyboard navigation, and
 * screen-reader announcements for step and validation changes.
 *
 * @param {object} props
 * @param {Array<{
 *   id: string,
 *   title: string,
 *   description?: string,
 *   icon?: string,
 *   content: React.ComponentType<{
 *     data: object,
 *     setData: (partial: object) => void,
 *     errors: object,
 *     stepIndex: number,
 *     goNext: () => void,
 *     goBack: () => void,
 *     isSubmitting: boolean,
 *   }>,
 * }>} props.steps - Ordered step definitions. Each step's `content` is rendered
 *   with step-specific props (data, setData, errors, goNext, goBack, isSubmitting).
 * @param {object} [props.initialData={}] - Initial form data object.
 * @param {(data: object) => void} [props.onComplete] - Called with combined data
 *   when the wizard reaches the last step and the user clicks Complete.
 * @param {(stepIndex: number, data: object) => object|null} [props.validate] -
 *   Optional per-step validator. Receives the current step index and data.
 *   Return an object of field -> error message, or null/empty if valid.
 * @param {boolean} [props.submitting=false] - If true, navigation buttons are
 *   disabled to prevent double-submission.
 * @param {string} [props.completeLabel='Complete'] - Label for the final action button.
 * @param {string} [props.completingLabel='Processing…'] - Label while submitting.
 */
export default function FormWizard({
  steps,
  initialData = {},
  onComplete,
  validate,
  submitting = false,
  completeLabel = 'Complete',
  completingLabel = 'Processing…',
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [direction, setDirection] = useState('forward');
  const [announcement, setAnnouncement] = useState('');
  const dataRef = useRef(data);
  const headingRef = useRef(null);
  const wizardId = useId();
  dataRef.current = data;

  const totalSteps = steps.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const progress = totalSteps > 1 ? (currentStep / (totalSteps - 1)) * 100 : 100;
  const activeStep = steps[currentStep];

  /** Collect field errors for the current step; empty object means valid. */
  const collectErrors = useCallback(
    (stepIndex) => {
      if (!validate) return {};
      const stepErrors = validate(stepIndex, dataRef.current);
      if (stepErrors && typeof stepErrors === 'object' && Object.keys(stepErrors).length > 0) {
        return stepErrors;
      }
      return {};
    },
    [validate],
  );

  const focusFirstInvalidField = useCallback(() => {
    requestAnimationFrame(() => {
      const panel = headingRef.current?.closest('.wizard-panel');
      panel?.querySelector('[aria-invalid="true"]')?.focus();
    });
  }, []);

  const goNext = useCallback(() => {
    if (submitting || currentStep >= totalSteps - 1) return;

    const stepErrors = collectErrors(currentStep);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      const messages = Object.values(stepErrors).filter(Boolean);
      setAnnouncement(
        messages.length
          ? `Validation error: ${messages.join('. ')}`
          : 'Please fix the highlighted fields before continuing.',
      );
      focusFirstInvalidField();
      return;
    }
    setErrors({});
    setDirection('forward');
    setCurrentStep((s) => s + 1);
  }, [currentStep, totalSteps, collectErrors, focusFirstInvalidField, submitting]);

  const goBack = useCallback(() => {
    if (submitting || currentStep <= 0) return;
    setDirection('backward');
    setCurrentStep((s) => s - 1);
    setErrors({});
  }, [currentStep, submitting]);

  /** Merge partial data into the wizard-wide state. */
  const updateData = useCallback((partial) => {
    setData((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleSubmit = () => {
    if (submitting || currentStep !== totalSteps - 1) return;

    const stepErrors = collectErrors(currentStep);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      const messages = Object.values(stepErrors).filter(Boolean);
      setAnnouncement(
        messages.length
          ? `Validation error: ${messages.join('. ')}`
          : 'Please fix the highlighted fields before submitting.',
      );
      focusFirstInvalidField();
      return;
    }
    setErrors({});
    onComplete?.(dataRef.current);
  };

  /** Advance or submit when Enter is pressed AND no form control is focused. */
  const handleKeyDown = (e) => {
    if (
      submitting || e.defaultPrevented || e.repeat || e.nativeEvent.isComposing ||
      e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey
    ) return;
    // Let native controls, links, and editable descendants handle their keys.
    if (e.target.closest?.('input, textarea, select, button, a[href], summary, [contenteditable]')) return;
    e.preventDefault();
    if (isLastStep) {
      handleSubmit();
    } else {
      goNext();
    }
  };

  // Announce step changes and move focus to the panel heading so keyboard /
  // screen-reader users land in the new step content (not a focus trap).
  useEffect(() => {
    const title = activeStep?.title ?? `Step ${currentStep + 1}`;
    setAnnouncement(`Step ${currentStep + 1} of ${totalSteps}: ${title}`);
    const frame = requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [currentStep, activeStep?.title, totalSteps]);

  const StepContent = activeStep.content;
  const panelId = `${wizardId}-panel-${activeStep.id}`;
  const headingId = `${wizardId}-heading-${activeStep.id}`;

  return (
    <div
      className="form-wizard"
      onKeyDown={handleKeyDown}
      aria-busy={submitting ? 'true' : undefined}
    >
      {/* Visually hidden live region: step changes + validation summaries */}
      <div
        className="wizard-live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="wizard-live-region"
      >
        {announcement}
      </div>

      {/* Step indicator — progress list, not interactive tabs (nav is Back/Next) */}
      <ol className="wizard-steps" aria-label="Form steps">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;

          return (
            <li
              key={step.id}
              className={[
                'wizard-step',
                isCompleted && 'wizard-step-completed',
                isActive && 'wizard-step-active',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={isActive ? 'step' : undefined}
            >
              <div className="wizard-step-indicator" aria-hidden="true">
                {isCompleted ? (
                  <svg className="wizard-step-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span className="wizard-step-number">{index + 1}</span>
                )}
              </div>
              <div className="wizard-step-label">
                <span className="wizard-step-title">{step.title}</span>
                {step.description && (
                  <span className="wizard-step-desc">{step.description}</span>
                )}
              </div>
              {index < totalSteps - 1 && (
                <div
                  className={[
                    'wizard-step-connector',
                    isCompleted && 'wizard-step-connector-filled',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Progress bar */}
      <div
        className="wizard-progress-bar"
        role="progressbar"
        aria-label="Wizard progress"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Step content */}
      <div className="wizard-content">
        {steps.map((step, index) => {
          const isEntering = index === currentStep;
          const dirClass = isEntering
            ? direction === 'forward'
              ? 'wizard-panel-enter-forward'
              : 'wizard-panel-enter-backward'
            : '';

          return (
            <div
              key={step.id}
              id={isEntering ? panelId : undefined}
              className={['wizard-panel', dirClass, isEntering && 'wizard-panel-active']
                .filter(Boolean)
                .join(' ')}
              hidden={!isEntering}
              role="group"
              aria-labelledby={isEntering ? headingId : undefined}
            >
              {isEntering && (
                <>
                  {step.icon && (
                    <div className="wizard-panel-icon-wrapper" aria-hidden="true">
                      <span className="wizard-panel-icon">{step.icon}</span>
                    </div>
                  )}
                  <h3
                    id={headingId}
                    ref={headingRef}
                    className="wizard-panel-title"
                    tabIndex={-1}
                  >
                    {step.title}
                  </h3>
                  {step.description && (
                    <p className="wizard-panel-desc">{step.description}</p>
                  )}
                  <div className="wizard-panel-body">
                    <StepContent
                      data={data}
                      setData={updateData}
                      errors={errors}
                      stepIndex={currentStep}
                      goNext={goNext}
                      goBack={goBack}
                      isSubmitting={submitting}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="wizard-nav">
        {!isFirstStep && (
          <button
            type="button"
            className="btn btn-ghost wizard-nav-back"
            onClick={goBack}
            disabled={submitting}
            aria-label="Back — go to previous step"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
        )}
        <div className="wizard-nav-right">
          <span className="wizard-step-counter" aria-hidden="true">
            Step {currentStep + 1} of {totalSteps}
          </span>
          {isLastStep ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
              aria-disabled={submitting ? 'true' : undefined}
            >
              {submitting ? completingLabel : completeLabel}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary wizard-nav-next"
              onClick={goNext}
              disabled={submitting}
              aria-disabled={submitting ? 'true' : undefined}
              aria-label={`Next — continue to step ${currentStep + 2} of ${totalSteps}`}
            >
              Next
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';

/**
 * Slippage tolerance setting component. Allows users to set the maximum
 * acceptable price slippage for transactions. Common presets are provided
 * (0.1%, 0.5%, 1.0%) with a custom option for manual input.
 * The setting is persisted to localStorage via AppContext.
 */
export default function SlippageTolerance() {
  const { slippageTolerance, setSlippageTolerance } = useAppContext() as {
    slippageTolerance: number;
    setSlippageTolerance: (value: number) => void;
  };
  const [isCustom, setIsCustom] = useState(![0.1, 0.5, 1.0].includes(slippageTolerance));
  const [customValue, setCustomValue] = useState(String(slippageTolerance));

  const presets = [0.1, 0.5, 1.0];

  const handlePresetClick = (value: number) => {
    setIsCustom(false);
    setSlippageTolerance(value);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomValue(value);
    const num = Number(value);
    if (!isNaN(num) && num >= 0 && num <= 50) {
      setSlippageTolerance(num);
    }
  };

  const handleCustomBlur = () => {
    const num = Number(customValue);
    if (customValue.trim() === '' || isNaN(num) || num < 0) {
      setCustomValue('0.5');
      setSlippageTolerance(0.5);
    } else if (num > 50) {
      setCustomValue('50');
      setSlippageTolerance(50);
    }
  };

  return (
    <div className="slippage-tolerance">
      <span className="slippage-label">Slippage</span>
      <div className="slippage-presets">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`slippage-preset ${!isCustom && slippageTolerance === preset ? 'slippage-preset-active' : ''}`}
            onClick={() => handlePresetClick(preset)}
          >
            {preset.toFixed(1)}%
          </button>
        ))}
        <div className={`slippage-custom ${isCustom ? 'slippage-custom-active' : ''}`}>
          <input
            type="number"
            min="0"
            max="50"
            step="0.1"
            value={customValue}
            onChange={handleCustomChange}
            onBlur={handleCustomBlur}
            onFocus={() => setIsCustom(true)}
            className="slippage-input"
            aria-label="Custom slippage tolerance"
          />
          <span className="slippage-percent">%</span>
        </div>
      </div>
    </div>
  );
}

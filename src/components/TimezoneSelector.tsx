import React from 'react';
import { useAppContext } from '../context/AppContext';

const TIMEZONES = [
  { value: 'local', label: 'Local Time' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Kolkata', label: 'Kolkata (IST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

/**
 * Dropdown selector for choosing the user's preferred timezone.
 * Synchronizes with AppContext and persists selection to localStorage.
 */
export default function TimezoneSelector() {
  const { timezone, setTimezone } = useAppContext() as {
    timezone: string;
    setTimezone: (timezone: string) => void;
  };
  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // If the user's timezone choice matches their local system timezone,
  // select the "local" option in the dropdown.
  const displayTimezone = timezone === systemTimezone ? 'local' : timezone;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'local') {
      setTimezone(systemTimezone);
    } else {
      setTimezone(val);
    }
  };

  return (
    <div className="timezone-selector" title="Select timezone">
      <span className="timezone-icon" aria-hidden="true">🌐</span>
      <select
        className="timezone-select"
        value={displayTimezone}
        onChange={handleChange}
        aria-label="Select timezone"
      >
        {TIMEZONES.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.value === 'local' ? `${tz.label} (${systemTimezone})` : tz.label}
          </option>
        ))}
      </select>
    </div>
  );
}

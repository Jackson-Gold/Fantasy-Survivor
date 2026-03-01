import { useState } from 'react';
import { getContestantImagePath } from '../lib/contestantImage';

type Props = {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-base',
};

export function ContestantAvatar({ name, size = 'md', className = '' }: Props) {
  const [errored, setErrored] = useState(false);
  const path = getContestantImagePath(name);
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (!path || errored) {
    return (
      <div
        className={`rounded-full bg-ocean-600 text-white flex items-center justify-center font-semibold shrink-0 ${sizeClasses[size]} ${className}`}
        title={name}
      >
        {initials || '?'}
      </div>
    );
  }

  return (
    <img
      src={path}
      alt={name}
      className={`rounded-full object-cover shrink-0 ${sizeClasses[size]} ${className}`}
      onError={() => setErrored(true)}
    />
  );
}

import { useState } from 'react';
import { getApiBaseUrl } from '../lib/api';

type Props = {
  username: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

export function UserAvatar({ username, avatarUrl, size = 'md', className = '' }: Props) {
  const [errored, setErrored] = useState(false);
  const initials = username
    .trim()
    .slice(0, 2)
    .toUpperCase();
  const src = avatarUrl && !errored
    ? `${getApiBaseUrl().replace(/\/$/, '')}/api/v1/uploads/${avatarUrl}`
    : null;

  if (!src) {
    return (
      <div
        className={`rounded-full bg-ocean-600 text-white flex items-center justify-center font-semibold shrink-0 ${sizeClasses[size]} ${className}`}
        title={username}
      >
        {initials || '?'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={username}
      className={`rounded-full object-cover shrink-0 ${sizeClasses[size]} ${className}`}
      onError={() => setErrored(true)}
    />
  );
}

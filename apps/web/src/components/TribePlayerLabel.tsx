import { UserAvatar } from './UserAvatar';

type Props = {
  username: string;
  tribeName?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showAvatar?: boolean;
  className?: string;
};

/** Renders tribe name (primary) and username (secondary when tribe name present). Use on leaderboards and elsewhere; Profile keeps username primary. */
export function TribePlayerLabel({
  username,
  tribeName,
  avatarUrl,
  size = 'sm',
  showAvatar = true,
  className = '',
}: Props) {
  const hasTribe = tribeName != null && tribeName.trim() !== '';
  const primary = hasTribe ? tribeName!.trim() : username;
  const secondary = hasTribe ? username : null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showAvatar && (
        <UserAvatar username={username} avatarUrl={avatarUrl} size={size} />
      )}
      <div className="min-w-0">
        <span className="font-medium text-ocean-800 block truncate" title={primary}>
          {primary}
        </span>
        {secondary != null && (
          <span className="text-sm text-sand-500 block truncate" title={secondary}>
            {secondary}
          </span>
        )}
      </div>
    </div>
  );
}

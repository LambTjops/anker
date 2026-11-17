import { GearIcon, InboxIcon } from './icons.tsx';

/**
 * Settings (and the inbox, when `inbox`) as quiet icons in the top-right corner, hidden until
 * hover, a key or a tap (`shown`), whatever Calm Focus says.
 */
export function CornerLinks({ shown, inbox }: { shown: boolean; inbox: boolean }) {
  return (
    <div class={`row corner reveal${shown ? ' shown' : ''}`}>
      {inbox && (
        <a class="button icon quiet" href="#inbox" aria-label="Inbox" title="Inbox">
          <InboxIcon />
        </a>
      )}
      <a class="button icon quiet" href="#settings" aria-label="Settings" title="Settings">
        <GearIcon />
      </a>
    </div>
  );
}

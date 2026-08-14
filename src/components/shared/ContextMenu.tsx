import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp position to viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;
    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  }, [x, y]);

  return createPortal(
    <div className="context-menu" ref={menuRef} style={{ left: x, top: y }}>
      {items.map((item, i) => (
        <div key={i}>
          {item.divider && <div className="context-menu-divider" />}
          <div
            className={`context-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
            onClick={() => {
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

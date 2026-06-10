import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export type DropdownOption = {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
};

export type DropdownActionItem = {
  value: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
};

type SelectDropdownProps = {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  actionItems?: never;
};

type ActionDropdownProps = {
  actionItems: DropdownActionItem[];
  ariaLabel: string;
  disabled?: boolean;
  value?: never;
  options?: never;
  onChange?: never;
  placeholder?: never;
};

type DropdownProps = SelectDropdownProps | ActionDropdownProps;

type PanelPosition = {
  top: number;
  left: number;
  minWidth: number;
  transform?: string;
};

export function Dropdown(props: DropdownProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PanelPosition>({ top: 0, left: 0, minWidth: 180 });
  const isActionMenu = 'actionItems' in props;
  const items = useMemo(() => (isActionMenu ? props.actionItems : props.options), [isActionMenu, props]);
  const selected = !isActionMenu ? props.options.find((option) => option.value === props.value) : null;
  const triggerLabel = isActionMenu ? '...' : (selected?.label ?? props.placeholder ?? 'Select');
  const panelId = `${props.ariaLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-dropdown`;

  function firstEnabledIndex(start = 0, direction: 1 | -1 = 1) {
    if (items.length === 0) return -1;
    let next = start;
    for (let step = 0; step < items.length; step += 1) {
      if (!items[next]?.disabled) return next;
      next = (next + direction + items.length) % items.length;
    }
    return -1;
  }

  function openPanel() {
    if (props.disabled) return;
    const selectedIndex = !isActionMenu
      ? items.findIndex((item) => item.value === props.value && !item.disabled)
      : -1;
    setActiveIndex(firstEnabledIndex(selectedIndex >= 0 ? selectedIndex : 0));
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
  }

  function selectIndex(index: number) {
    const item = items[index];
    if (!item || item.disabled) return;
    if (isActionMenu) {
      item.onSelect();
    } else {
      props.onChange(item.value);
    }
    closePanel();
  }

  function moveActive(direction: 1 | -1) {
    if (!open) {
      openPanel();
      return;
    }
    setActiveIndex((current) =>
      firstEnabledIndex((current + direction + items.length) % items.length, direction),
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(firstEnabledIndex(0));
      setOpen(true);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(firstEnabledIndex(items.length - 1, -1));
      setOpen(true);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) selectIndex(activeIndex);
      else openPanel();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
    }
  }

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = Math.max(rect.width, 220);
      const panelHeight = panelRef.current?.offsetHeight ?? Math.min(items.length * 52 + 12, 280);
      const rightCollision = rect.left + panelWidth > window.innerWidth - 12;
      const bottomCollision = rect.bottom + panelHeight > window.innerHeight - 12;
      setPosition({
        left: rightCollision ? Math.max(12, rect.right - panelWidth) : rect.left,
        top: bottomCollision ? Math.max(12, rect.top - 8) : rect.bottom + 6,
        minWidth: rect.width,
        transform: bottomCollision ? 'translateY(-100%)' : undefined,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || panelRef.current?.contains(target))) return;
      setOpen(false);
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open, items.length]);

  const panelStyle: CSSProperties = {
    position: 'fixed',
    top: position.top,
    left: position.left,
    minWidth: position.minWidth,
    transform: position.transform,
  };

  return (
    <div className="dropdown">
      <button
        ref={triggerRef}
        type="button"
        className="dropdown__trigger"
        aria-label={props.ariaLabel}
        aria-haspopup={isActionMenu ? 'menu' : 'listbox'}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={props.disabled}
        onClick={() => (open ? closePanel() : openPanel())}
        onKeyDown={handleKeyDown}
      >
        <span>{triggerLabel}</span>
        <span className="dropdown__chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            className="dropdown__panel"
            role={isActionMenu ? 'menu' : 'listbox'}
            style={panelStyle}
          >
            {items.map((item, index) => (
              <button
                key={item.value}
                type="button"
                className={`dropdown__option ${index === activeIndex ? 'is-active' : ''}`}
                role={isActionMenu ? 'menuitem' : 'option'}
                aria-label={'hint' in item && item.hint ? `${item.label} ${item.hint}` : item.label}
                aria-selected={!isActionMenu ? item.value === props.value : undefined}
                aria-disabled={item.disabled || undefined}
                disabled={item.disabled}
                onMouseEnter={() => !item.disabled && setActiveIndex(index)}
                onClick={() => selectIndex(index)}
              >
                <span>{item.label}</span>
                {'hint' in item && item.hint && <small>{item.hint}</small>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

import type { ReactNode } from 'react';

type ModalShellProps = {
  titleId: string;
  kicker: ReactNode;
  title: ReactNode;
  fineprint?: ReactNode;
  icon?: ReactNode;
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

export function ModalShell({
  titleId,
  kicker,
  title,
  fineprint,
  icon,
  className,
  onClose,
  children,
}: ModalShellProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`launch-modal ${className ?? ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`launch-header ${icon ? '' : 'no-icon'}`.trim()}>
          {icon && (
            <div className="launch-icon" aria-hidden="true">
              {icon}
            </div>
          )}
          <div>
            <p className="section-kicker">{kicker}</p>
            <h2 id={titleId}>{title}</h2>
            {fineprint !== undefined && <p className="fineprint">{fineprint}</p>}
          </div>
          <button className="modal-close" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

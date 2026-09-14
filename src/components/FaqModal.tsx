import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Icon } from './Icon';

const faqItems = [
  ['faq.question.upload', 'faq.answer.upload'],
  ['faq.question.why', 'faq.answer.why'],
  ['faq.question.quality', 'faq.answer.quality'],
  ['faq.question.jpeg', 'faq.answer.jpeg'],
] as const;

export function FaqModal() {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = (id: string) => intl.formatMessage({ id });

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        className="icon-button faq-trigger"
        type="button"
        aria-label={t('faq.open')}
        title={t('faq.open')}
        onClick={() => setOpen(true)}
      >
        <Icon name="help" size={18} />
      </button>
      {open && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="faq-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="faq-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="faq-modal-header">
              <h2 id="faq-title">{t('faq.title')}</h2>
              <button
                ref={closeButtonRef}
                className="icon-button"
                type="button"
                aria-label={t('common.close')}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            <div className="faq-list">
              {faqItems.map(([question, answer]) => (
                <article className="faq-item" key={question}>
                  <h3>{t(question)}</h3>
                  <p>{t(answer)}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

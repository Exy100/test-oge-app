import type { ReactNode, RefObject } from 'react';
import { Modal } from '../ui/Modal';
import { sitePath } from '../../lib/site';

export default function AiConsent({
  open,
  button,
  close,
  confirm,
  children,
}: {
  open: boolean;
  button: RefObject<HTMLButtonElement | null>;
  close: () => void;
  confirm: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      title="Разрешить отправку данных ИИ?"
      returnFocusRef={button}
      onClose={close}
    >
      <p>
        Наш сервер передаст указанные ниже данные через OpenRouter провайдеру
        модели. Не пиши личные данные. Согласие относится к этому виду разбора;
        отозвать его можно в <a href={sitePath('/settings/')}>настройках</a>.
      </p>
      {children}
      <p>
        Ответ временно хранится в этой вкладке. ИИ может ошибаться. Сверяйся с
        эталонным решением.
      </p>
      <div className="task-actions">
        <button type="button" onClick={confirm}>
          Разрешить и отправить
        </button>
        <button type="button" onClick={close}>
          Не отправлять
        </button>
      </div>
    </Modal>
  );
}

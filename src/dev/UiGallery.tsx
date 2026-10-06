import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import { Modal } from '../components/ui/Modal';
import { Tooltip } from '../components/ui/Tooltip';
import { Toast } from '../components/ui/Toast';
import { Disclosure } from '../components/ui/Disclosure';
import { Badge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Kbd } from '../components/ui/Kbd';
import { Skeleton } from '../components/ui/Skeleton';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Slider } from '../components/ui/Slider';
import { NumberInput } from '../components/ui/NumberInput';
import './ui-gallery.css';

const modes = [
  { value: 'theory', label: 'Теория' },
  { value: 'mixed', label: 'Смешанный', disabled: true },
  { value: 'practice', label: 'Практика' },
];

export default function UiGallery() {
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [bytes, setBytes] = useState('2');
  const [modalOpen, setModalOpen] = useState(false);
  const [repeats, setRepeats] = useState('3');
  const [applied, setApplied] = useState('3');
  const [modalError, setModalError] = useState('');
  const modalInput = useRef<HTMLInputElement>(null);
  const modalTrigger = useRef<HTMLButtonElement>(null);
  const noticeTrigger = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'info' | 'success' | 'error'>(
    'info',
  );
  const noticeCount = useRef(0);
  const [mode, setMode] = useState('theory');
  const [share, setShare] = useState(50);
  const [amount, setAmount] = useState('4');
  const [decimal, setDecimal] = useState('2.5');
  const [amountError, setAmountError] = useState('');
  const [amountResult, setAmountResult] = useState('');
  const numberInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <fieldset
      className="ui-gallery"
      disabled={!ready}
      aria-busy={!ready}
      data-testid="ui-gallery"
    >
      <legend>Компоненты интерфейса</legend>
      <p>
        Примеры состояний UI-кита. Значения ниже служат для проверки
        компонентов.
      </p>
      <section className="ui-gallery-section" aria-labelledby="buttons-title">
        <h3 id="buttons-title">Button — кнопки</h3>
        {(['primary', 'secondary', 'text'] as const).map((variant, index) => (
          <div className="ui-gallery-row" key={variant}>
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <Button
                key={size}
                variant={variant}
                size={size}
                onClick={() => {
                  setCount((value) => value + 1);
                }}
              >
                {['Основная', 'Вторичная', 'Текстовая'][index]} {size}
              </Button>
            ))}
            <Button variant={variant} disabled>
              Недоступна {index + 1}
            </Button>
            <Button variant={variant} loading>
              Загрузка {index + 1}
            </Button>
          </div>
        ))}
        <div className="ui-gallery-row">
          <Button
            loading={loading}
            onClick={() => {
              setCount((value) => value + 1);
            }}
          >
            Увеличить счётчик
          </Button>
          <Button
            variant="secondary"
            aria-pressed={loading}
            onClick={() => {
              setLoading((value) => !value);
            }}
          >
            Режим загрузки
          </Button>
        </div>
        <p>
          Нажатий: <output data-testid="button-count">{count}</output>
        </p>
      </section>

      <section className="ui-gallery-section" aria-labelledby="cards-title">
        <h3 id="cards-title">Card — карточки</h3>
        <div className="ui-gallery-grid">
          <Card>
            <h4>Основная карточка</h4>
            <p>В одном байте восемь бит.</p>
          </Card>
          <Card tone="soft">
            <h4>Мягкий фон</h4>
            <p>При переводе байтов в биты умножай на восемь.</p>
          </Card>
        </div>
      </section>

      <section className="ui-gallery-section" aria-labelledby="tabs-title">
        <h3 id="tabs-title">Tabs — вкладки</h3>
        <Tabs
          label="Разбор перевода единиц"
          items={[
            {
              value: 'rule',
              label: 'Правило',
              content: (
                <p>Чтобы перевести байты в биты, умножь число байтов на 8.</p>
              ),
            },
            {
              value: 'disabled',
              label: 'Недоступная вкладка',
              disabled: true,
              content: <p>Пример отключённой вкладки.</p>,
            },
            {
              value: 'example',
              label: 'Пример',
              content: <p>2 байта = {2 * 8} бит.</p>,
            },
            {
              value: 'check',
              label: 'Вычисление',
              content: (
                <>
                  <NumberInput
                    label="Байты"
                    min={0}
                    max={100}
                    step={1}
                    value={bytes}
                    onChange={(event) => {
                      setBytes(event.target.value);
                    }}
                  />
                  <p>
                    {bytes !== '' && Number.isFinite(Number(bytes))
                      ? `${bytes} байт = ${String(Number(bytes) * 8)} бит`
                      : 'Введи число байтов.'}
                  </p>
                </>
              ),
            },
          ]}
        />
      </section>

      <section className="ui-gallery-section" aria-labelledby="modal-title">
        <h3 id="modal-title">Modal — диалог</h3>
        <Button
          ref={modalTrigger}
          onClick={() => {
            setRepeats(applied);
            setModalError('');
            setModalOpen(true);
          }}
        >
          Настроить повторения
        </Button>
        <p>
          Выбрано повторений:{' '}
          <output data-testid="applied-repeats">{applied}</output>
        </p>
        <Modal
          open={modalOpen}
          returnFocusRef={modalTrigger}
          onClose={() => {
            setModalOpen(false);
          }}
          title="Настроить тренировку"
          description="Выбери от 1 до 10 повторений."
        >
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!modalInput.current?.validity.valid) {
                setModalError('Введи целое число от 1 до 10.');
                modalInput.current?.focus();
                return;
              }
              setApplied(repeats);
              setModalOpen(false);
            }}
          >
            <NumberInput
              ref={modalInput}
              label="Количество повторений"
              min={1}
              max={10}
              step={1}
              required
              value={repeats}
              error={modalError}
              onChange={(event) => {
                setRepeats(event.target.value);
                setModalError('');
              }}
            />
            <div className="ui-gallery-row">
              <Button type="submit">Применить</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setModalOpen(false);
                }}
              >
                Отмена
              </Button>
            </div>
          </form>
        </Modal>
      </section>

      <section className="ui-gallery-section" aria-labelledby="tooltip-title">
        <h3 id="tooltip-title">Tooltip — пояснение</h3>
        <Tooltip
          label="О подсказках"
          text="Подсказку можно открыть до проверки ответа. Она помогает выбрать первый шаг."
        />
        <p>
          Появляется при наведении, фокусе или касании; закрывается клавишей{' '}
          <Kbd>Esc</Kbd>.
        </p>
      </section>

      <section className="ui-gallery-section" aria-labelledby="toast-title">
        <h3 id="toast-title">Toast — уведомление</h3>
        <div className="ui-gallery-row">
          {(['info', 'success', 'error'] as const).map((tone, index) => (
            <Button
              key={tone}
              variant="secondary"
              onClick={(event) => {
                noticeTrigger.current = event.currentTarget;
                noticeCount.current += 1;
                setNoticeTone(tone);
                setNotice(
                  `${{ info: 'Обычное уведомление', success: 'Успешное уведомление', error: 'Сообщение об ошибке' }[tone]}. Показ №${String(noticeCount.current)}.`,
                );
              }}
            >
              {['Информация', 'Успех', 'Ошибка'][index]}
            </Button>
          ))}
        </div>
        <Toast
          message={notice}
          returnFocusRef={noticeTrigger}
          tone={noticeTone}
          onDismiss={() => {
            setNotice(null);
          }}
        />
        <p>Сообщение остаётся на экране, пока ты его не закроешь.</p>
      </section>

      <section
        className="ui-gallery-section"
        aria-labelledby="disclosure-title"
      >
        <h3 id="disclosure-title">Disclosure — раскрывающийся блок</h3>
        <div className="ui-gallery-stack">
          <Disclosure summary="Как перевести биты в байты?">
            Раздели количество бит на 8. Например, {4 * 8} бита — это 4 байта.
          </Disclosure>
          <Disclosure summary="Открытый пример" defaultOpen>
            При обратном переводе умножай число байтов на 8.
          </Disclosure>
        </div>
      </section>

      <section className="ui-gallery-section" aria-labelledby="badges-title">
        <h3 id="badges-title">Badge — метки</h3>
        <div className="ui-gallery-row">
          <Badge tone="neutral">Обычная</Badge>
          <Badge>Акцент</Badge>
          <Badge tone="success">Верно</Badge>
          <Badge tone="error">Ошибка ответа</Badge>
        </div>
      </section>

      <section className="ui-gallery-section" aria-labelledby="progress-title">
        <h3 id="progress-title">ProgressBar — прогресс</h3>
        <div className="ui-gallery-stack">
          <ProgressBar label="Пустая шкала" value={0} max={10} />
          <ProgressBar label="Заполненная наполовину" value={5} max={10} />
          <ProgressBar label="Полная шкала" value={10} max={10} />
          <ProgressBar label="Неизвестный объём" />
        </div>
      </section>

      <section className="ui-gallery-section" aria-labelledby="kbd-title">
        <h3 id="kbd-title">Kbd — клавиши</h3>
        <p>
          <Kbd>Tab</Kbd> — вперёд, <Kbd>Shift</Kbd> + <Kbd>Tab</Kbd> — назад,{' '}
          <Kbd>Enter</Kbd> — действие, <Kbd>Esc</Kbd> — закрыть окно.
        </p>
      </section>

      <section className="ui-gallery-section" aria-labelledby="skeleton-title">
        <h3 id="skeleton-title">Skeleton — состояние загрузки</h3>
        <div className="ui-gallery-grid">
          <Skeleton label="Загрузка одной строки" lines={1} />
          <Skeleton label="Загрузка двух строк" lines={2} />
          <Skeleton />
        </div>
      </section>

      <section className="ui-gallery-section" aria-labelledby="segments-title">
        <h3 id="segments-title">SegmentedControl — выбор режима</h3>
        <div className="ui-gallery-stack">
          <SegmentedControl
            label="Режим занятия"
            options={modes}
            value={mode}
            onValueChange={setMode}
          />
          <p>
            Выбран режим:{' '}
            <output data-testid="selected-mode">
              {modes.find((option) => option.value === mode)?.label}
            </output>
          </p>
          <SegmentedControl
            label="Недоступный режим"
            options={modes}
            value={mode}
            onValueChange={setMode}
            disabled
          />
        </div>
      </section>

      <section className="ui-gallery-section" aria-labelledby="slider-title">
        <h3 id="slider-title">Slider — ползунок</h3>
        <div className="ui-gallery-stack">
          <Slider
            label="Доля практики"
            value={share}
            onValueChange={setShare}
            step={5}
            unit="%"
          />
          <ProgressBar label="Выбранная доля" value={share} />
          <Slider
            label="Недоступный ползунок"
            value={25}
            onValueChange={setShare}
            step={5}
            unit="%"
            disabled
          />
        </div>
      </section>

      <section className="ui-gallery-section" aria-labelledby="number-title">
        <h3 id="number-title">NumberInput — число</h3>
        <div className="ui-gallery-grid">
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!numberInput.current?.validity.valid) {
                setAmountError('Введи целое число от 1 до 10.');
                setAmountResult('');
                numberInput.current?.focus();
                return;
              }
              setAmountError('');
              setAmountResult(`Принято: ${amount}.`);
            }}
          >
            <NumberInput
              ref={numberInput}
              label="Число задач"
              hint="От 1 до 10, шаг 1."
              error={amountError}
              required
              min={1}
              max={10}
              step={1}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setAmountError('');
                setAmountResult('');
              }}
            />
            <Button type="submit" className="ui-gallery-submit">
              Проверить число
            </Button>
            <p role="status">{amountResult}</p>
          </form>
          <NumberInput
            label="Дробное значение"
            hint="От 0 до 10, шаг 0,5."
            min={0}
            max={10}
            step={0.5}
            value={decimal}
            onChange={(event) => {
              setDecimal(event.target.value);
            }}
          />
          <NumberInput label="Пустое поле" placeholder="Например, 3" />
          <NumberInput
            label="Поле с ошибкой"
            defaultValue={17}
            min={1}
            max={10}
            error="Значение должно быть от 1 до 10."
          />
          <NumberInput label="Только чтение" value={16} readOnly />
          <NumberInput label="Недоступное поле" value={8} disabled />
        </div>
      </section>
    </fieldset>
  );
}
